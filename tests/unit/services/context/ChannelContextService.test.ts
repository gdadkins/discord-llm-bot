/**
 * @file ChannelContextService.test.ts - Unit tests for ChannelContextService
 * @module tests/unit/services/context
 */

import { ChannelContextService } from '../../../../src/services/context/ChannelContextService';
import { ServerCulture } from '../../../../src/services/context/types';
import { Guild, GuildEmoji, GuildChannel, VoiceChannel } from 'discord.js';
import { logger } from '../../../../src/utils/logger';

// Create Collection class mock since discord.js Collection extends Map
class Collection<K, V> extends Map<K, V> {
  filter(fn: (value: V, key: K, collection: this) => boolean): Collection<K, V> {
    const filtered = new Collection<K, V>();
    for (const [key, val] of this) {
      if (fn(val, key, this)) filtered.set(key, val);
    }
    return filtered;
  }
  
  map<T>(fn: (value: V, key: K, collection: this) => T): T[] {
    const mapped: T[] = [];
    for (const [key, val] of this) {
      mapped.push(fn(val, key, this));
    }
    return mapped;
  }
}

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('ChannelContextService', () => {
  let service: ChannelContextService;
  let mockGuild: jest.Mocked<Guild>;

  beforeEach(() => {
    service = new ChannelContextService();
    jest.clearAllMocks();
    
    // Create mock Discord Guild
    mockGuild = createMockGuild();
  });

  describe('buildServerCultureContext', () => {
    it('should build context for a new server', () => {
      const result = service.buildServerCultureContext(mockGuild);

      expect(result).toContain('SERVER CULTURE CONTEXT:');
      expect(result).toContain('Popular Emojis:');
      expect(result).toContain('Active Voice: 2 channels (Voice 1, Voice 2)');
      expect(result).toContain('Recent Events:');
      expect(result).toContain('Boost Level: 2');
      expect(result).toContain('Top Channels: #general, #random');
      expect(result).toContain('Language: en-US');
    });

    it('should cache server culture', () => {
      // First call - should build and cache
      const result1 = service.buildServerCultureContext(mockGuild);
      
      // Second call - should return from cache
      const result2 = service.buildServerCultureContext(mockGuild);
      
      expect(result1).toBe(result2);
    });

    it('should handle servers with no custom emojis', () => {
      // Create a new guild with empty emoji collection
      const guildWithNoEmojis = {
        ...mockGuild,
        emojis: {
          cache: new Collection(),
        },
      } as unknown as Guild;
      
      const result = service.buildServerCultureContext(guildWithNoEmojis);
      
      expect(result).not.toContain('Popular Emojis:');
    });

    it('should handle servers with no active voice channels', () => {
      // Make all voice channels empty
      const emptyVoiceChannels = new Collection<string, GuildChannel>();
      emptyVoiceChannels.set('voice1', {
        id: 'voice1',
        name: 'Empty Voice',
        isVoiceBased: () => true,
        isTextBased: () => false,
        members: new Collection(),
      } as any);
      
      const guildWithEmptyVoice = {
        ...mockGuild,
        channels: {
          cache: emptyVoiceChannels,
        },
      } as unknown as Guild;
      
      const result = service.buildServerCultureContext(guildWithEmptyVoice);
      
      expect(result).toContain('Active Voice: No active voice channels');
    });

    it('should include boost information as recent event', () => {
      mockGuild.premiumSubscriptionCount = 14;
      mockGuild.premiumTier = 3;
      
      const result = service.buildServerCultureContext(mockGuild);
      
      expect(result).toContain('Server boosted to level 3');
    });

    it('should include member milestones', () => {
      mockGuild.memberCount = 5000;
      
      const result = service.buildServerCultureContext(mockGuild);
      
      expect(result).toContain('Reached 5000 members');
    });

    it('should handle different member milestone levels', () => {
      const testCases = [
        { count: 50, expected: null },
        { count: 150, expected: 'Reached 100 members' },
        { count: 750, expected: 'Reached 500 members' },
        { count: 1500, expected: 'Reached 1000 members' },
        { count: 7500, expected: 'Reached 5000 members' },
        { count: 15000, expected: 'Reached 10000 members' },
      ];

      testCases.forEach(({ count, expected }) => {
        mockGuild.memberCount = count;
        const result = service.buildServerCultureContext(mockGuild);
        
        if (expected) {
          expect(result).toContain(expected);
        } else {
          expect(result).not.toContain('Reached');
        }
      });
    });

    it('should limit emojis to 10', () => {
      const manyEmojis = new Collection<string, GuildEmoji>();
      for (let i = 0; i < 20; i++) {
        manyEmojis.set(`emoji${i}`, {
          id: `emoji${i}`,
          name: `emoji${i}`,
          animated: false,
          toString: () => `:emoji${i}:`,
        } as any);
      }
      
      const guildWithManyEmojis = {
        ...mockGuild,
        emojis: {
          cache: manyEmojis,
        },
      } as unknown as Guild;
      
      const result = service.buildServerCultureContext(guildWithManyEmojis);
      const emojiMatches = result.match(/:emoji\d+:/g) || [];
      
      expect(emojiMatches.length).toBeLessThanOrEqual(5); // Display limited to 5
    });

    it('should trigger cleanup when cache exceeds limit', () => {
      // Add 101 different servers to trigger cleanup
      for (let i = 0; i < 101; i++) {
        const guild = {
          ...mockGuild,
          id: `guild${i}`,
        } as unknown as Guild;
        
        service.buildServerCultureContext(guild);
      }
      
      // Cleanup should have been triggered
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Cleaned up'));
    });
  });

  describe('getServerCulture', () => {
    it('should return cached culture if valid', () => {
      service.buildServerCultureContext(mockGuild);
      
      const culture = service.getServerCulture('guild123');
      
      expect(culture).toBeDefined();
      expect(culture?.guildId).toBe('guild123');
      expect(culture?.boostLevel).toBe(2);
    });

    it('should return null if not cached', () => {
      const culture = service.getServerCulture('guild999');
      
      expect(culture).toBeNull();
    });

    it('should return null if cache expired', () => {
      service.buildServerCultureContext(mockGuild);
      
      // Manually expire the cache entry
      const cachedEntry = (service as any).serverCultureCache.get('guild123');
      if (cachedEntry) {
        cachedEntry.cachedAt = Date.now() - (366 * 24 * 60 * 60 * 1000); // Over 1 year old
      }
      
      const culture = service.getServerCulture('guild123');
      
      expect(culture).toBeNull();
    });
  });

  describe('saveServerCulture', () => {
    it('should save culture data with updated timestamp', () => {
      const culture: ServerCulture = {
        guildId: 'guild456',
        popularEmojis: [],
        activeVoiceChannels: [],
        recentEvents: [],
        boostLevel: 1,
        topChannels: [],
        preferredLocale: 'fr-FR',
        cachedAt: 0,
        ttl: 0,
      };

      const beforeSave = Date.now();
      service.saveServerCulture('guild456', culture);
      const afterSave = Date.now();
      
      const saved = service.getServerCulture('guild456');
      
      expect(saved).toBeDefined();
      expect(saved?.cachedAt).toBeGreaterThanOrEqual(beforeSave);
      expect(saved?.cachedAt).toBeLessThanOrEqual(afterSave);
      expect(saved?.ttl).toBe(365 * 24 * 60 * 60 * 1000);
    });

    it('should trigger cleanup when exceeding cache limit', () => {
      // Fill cache to limit
      for (let i = 0; i < 100; i++) {
        const culture: ServerCulture = {
          guildId: `guild${i}`,
          popularEmojis: [],
          activeVoiceChannels: [],
          recentEvents: [],
          boostLevel: 0,
          topChannels: [],
          preferredLocale: 'en-US',
          cachedAt: Date.now(),
          ttl: 365 * 24 * 60 * 60 * 1000,
        };
        service.saveServerCulture(`guild${i}`, culture);
      }
      
      // This should trigger cleanup
      const newCulture: ServerCulture = {
        guildId: 'guild101',
        popularEmojis: [],
        activeVoiceChannels: [],
        recentEvents: [],
        boostLevel: 0,
        topChannels: [],
        preferredLocale: 'en-US',
        cachedAt: Date.now(),
        ttl: 365 * 24 * 60 * 60 * 1000,
      };
      service.saveServerCulture('guild101', newCulture);
      
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Cleaned up'));
    });
  });

  describe('getStorageStats', () => {
    it('should return empty stats for empty cache', () => {
      const stats = service.getStorageStats();
      
      expect(stats).toEqual({
        cacheEntries: 0,
        estimatedSizeBytes: 0,
        estimatedSizeMB: 0,
      });
    });

    it('should calculate storage stats correctly', () => {
      service.buildServerCultureContext(mockGuild);
      
      const guild2 = {
        ...mockGuild,
        id: 'guild456',
      } as unknown as Guild;
      service.buildServerCultureContext(guild2);
      
      const stats = service.getStorageStats();
      
      expect(stats.cacheEntries).toBe(2);
      expect(stats.estimatedSizeBytes).toBeGreaterThan(0);
      expect(stats.estimatedSizeMB).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should clear all caches', () => {
      service.buildServerCultureContext(mockGuild);
      
      expect((service as any).serverCultureCache.size).toBe(1);
      
      service.cleanup();
      
      expect((service as any).serverCultureCache.size).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('ChannelContextService cleanup completed');
    });
  });

  describe('edge cases', () => {
    it('should handle servers with no boost', () => {
      mockGuild.premiumSubscriptionCount = 0;
      mockGuild.premiumTier = 0;
      
      const result = service.buildServerCultureContext(mockGuild);
      
      expect(result).toContain('Boost Level: 0');
      expect(result).not.toContain('Server boosted to level');
    });

    it('should filter animated emojis', () => {
      const mixedEmojis = new Collection<string, GuildEmoji>();
      mixedEmojis.set('static1', {
        id: 'static1',
        name: 'static1',
        animated: false,
        toString: () => ':static1:',
      } as any);
      mixedEmojis.set('animated1', {
        id: 'animated1',
        name: 'animated1',
        animated: true,
        toString: () => '<a:animated1:>',
      } as any);
      
      const guildWithMixedEmojis = {
        ...mockGuild,
        emojis: {
          cache: mixedEmojis,
        },
      } as unknown as Guild;
      
      const result = service.buildServerCultureContext(guildWithMixedEmojis);
      
      expect(result).toContain(':static1:');
      expect(result).not.toContain('animated1');
    });

    it('should handle non-text channels correctly', () => {
      const mixedChannels = new Collection<string, GuildChannel>();
      mixedChannels.set('text1', {
        id: 'text1',
        name: 'text-channel',
        isTextBased: () => true,
        isVoiceBased: () => false,
        isThread: () => false,
      } as any);
      mixedChannels.set('thread1', {
        id: 'thread1',
        name: 'thread-channel',
        isTextBased: () => true,
        isVoiceBased: () => false,
        isThread: () => true,
      } as any);
      mixedChannels.set('category1', {
        id: 'category1',
        name: 'category',
        isTextBased: () => false,
        isVoiceBased: () => false,
        isThread: () => false,
      } as any);
      
      const guildWithMixedChannels = {
        ...mockGuild,
        channels: {
          cache: mixedChannels,
        },
      } as unknown as Guild;
      
      const result = service.buildServerCultureContext(guildWithMixedChannels);
      
      expect(result).toContain('#text-channel');
      expect(result).not.toContain('thread-channel');
      expect(result).not.toContain('category');
    });

    it('should handle missing preferredLocale', () => {
      mockGuild.preferredLocale = null as any;
      
      const result = service.buildServerCultureContext(mockGuild);
      
      expect(result).toContain('Language: en-US');
    });
  });
});

// Helper function to create mock guild
function createMockGuild(): jest.Mocked<Guild> {
  const mockEmojis = new Collection<string, GuildEmoji>();
  mockEmojis.set('emoji1', {
    id: 'emoji1',
    name: 'custom1',
    animated: false,
    toString: () => ':custom1:',
  } as any);
  mockEmojis.set('emoji2', {
    id: 'emoji2',
    name: 'custom2',
    animated: false,
    toString: () => ':custom2:',
  } as any);

  const mockChannels = new Collection<string, GuildChannel>();
  mockChannels.set('general', {
    id: 'general',
    name: 'general',
    isTextBased: () => true,
    isVoiceBased: () => false,
    isThread: () => false,
  } as any);
  mockChannels.set('random', {
    id: 'random',
    name: 'random',
    isTextBased: () => true,
    isVoiceBased: () => false,
    isThread: () => false,
  } as any);
  mockChannels.set('voice1', {
    id: 'voice1',
    name: 'Voice 1',
    isVoiceBased: () => true,
    isTextBased: () => false,
    members: new Collection([['user1', {} as any], ['user2', {} as any]]),
  } as any);
  mockChannels.set('voice2', {
    id: 'voice2',
    name: 'Voice 2',
    isVoiceBased: () => true,
    isTextBased: () => false,
    members: new Collection([['user3', {} as any]]),
  } as any);

  return {
    id: 'guild123',
    memberCount: 250,
    premiumSubscriptionCount: 7,
    premiumTier: 2,
    preferredLocale: 'en-US',
    emojis: {
      cache: mockEmojis,
    },
    channels: {
      cache: mockChannels,
    },
  } as unknown as jest.Mocked<Guild>;
}