/**
 * Unit tests for Context Services Cache Persistence
 */

import { ChannelContextService } from '../../../../src/services/context/ChannelContextService';
import { UserContextService } from '../../../../src/services/context/UserContextService';
import { DataStore } from '../../../../src/utils/DataStore';
import { logger } from '../../../../src/utils/logger';
import { Guild, GuildMember } from 'discord.js';

// Mock dependencies
jest.mock('../../../../src/utils/logger');
jest.mock('discord.js');

describe('Context Services Cache Persistence', () => {
  describe('ChannelContextService Cache Persistence', () => {
    let channelService: ChannelContextService;
    let mockGuild: Guild;

    beforeEach(() => {
      jest.clearAllMocks();
      channelService = new ChannelContextService();
      
      // Create mock guild
      mockGuild = {
        id: 'guild123',
        emojis: {
          cache: new Map([
            ['emoji1', { toString: () => ':emoji1:', animated: false }],
            ['emoji2', { toString: () => ':emoji2:', animated: false }],
          ])
        },
        channels: {
          cache: new Map([
            ['channel1', { 
              isVoiceBased: () => true, 
              members: { size: 5 }, 
              name: 'Voice Channel 1' 
            }],
            ['channel2', { 
              isTextBased: () => true, 
              isThread: () => false, 
              name: 'text-channel' 
            }],
          ])
        },
        premiumSubscriptionCount: 10,
        premiumTier: 2,
        memberCount: 150,
        preferredLocale: 'en-US',
      } as any;
    });

    it('should initialize with DataStore', () => {
      const dataStore = (channelService as any).cacheDataStore;
      expect(dataStore).toBeInstanceOf(DataStore);
    });

    it('should track cache hits and misses', () => {
      // First call - cache miss
      channelService.buildServerCultureContext(mockGuild);
      expect((channelService as any).cacheStats.misses).toBe(1);
      expect((channelService as any).cacheStats.hits).toBe(0);
      
      // Second call - cache hit
      channelService.buildServerCultureContext(mockGuild);
      expect((channelService as any).cacheStats.hits).toBe(1);
      expect((channelService as any).cacheStats.misses).toBe(1);
    });

    it('should schedule cache persistence on updates', () => {
      jest.useFakeTimers();
      const saveSpy = jest.spyOn(channelService as any, 'saveCacheToDisk');
      
      channelService.buildServerCultureContext(mockGuild);
      
      // Should not save immediately
      expect(saveSpy).not.toHaveBeenCalled();
      
      // Fast forward 5 seconds
      jest.advanceTimersByTime(5000);
      
      expect(saveSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should implement LRU eviction when cache exceeds max entries', () => {
      const maxEntries = (channelService as any).MAX_SERVER_CULTURE_CACHE_ENTRIES;
      
      // Fill cache beyond limit
      for (let i = 0; i < maxEntries + 10; i++) {
        const guild = { ...mockGuild, id: `guild${i}` };
        channelService.buildServerCultureContext(guild as any);
      }
      
      const cacheSize = (channelService as any).serverCultureCache.size;
      expect(cacheSize).toBeLessThanOrEqual(maxEntries);
      expect((channelService as any).cacheStats.evictions).toBeGreaterThan(0);
    });

    it('should load cache from disk on initialization', async () => {
      const mockCacheData = {
        cultures: [
          {
            guildId: 'guild1',
            culture: {
              guildId: 'guild1',
              popularEmojis: [],
              activeVoiceChannels: [],
              recentEvents: [],
              boostLevel: 1,
              topChannels: [],
              preferredLocale: 'en-US',
              cachedAt: Date.now() - 1000,
              ttl: 365 * 24 * 60 * 60 * 1000,
            },
            addedAt: Date.now() - 1000,
          }
        ],
        lastUpdated: Date.now(),
        version: 1,
      };

      jest.spyOn(channelService['cacheDataStore'], 'load').mockResolvedValue(mockCacheData);
      
      await (channelService as any).loadCacheFromDisk();
      
      expect((channelService as any).serverCultureCache.size).toBe(1);
      expect((channelService as any).cacheStats.persistenceLoads).toBe(1);
    });

    it('should provide cache statistics', () => {
      // Generate some cache activity
      channelService.buildServerCultureContext(mockGuild);
      channelService.buildServerCultureContext(mockGuild); // Hit
      channelService.buildServerCultureContext({ ...mockGuild, id: 'guild456' } as any); // Miss
      
      const stats = channelService.getCacheStatistics();
      
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(33.33, 1);
      expect(stats.cacheSize).toBe(2);
    });

    it('should handle TTL expiration correctly', async () => {
      const expiredCulture = {
        guildId: 'expired',
        culture: {
          guildId: 'expired',
          popularEmojis: [],
          activeVoiceChannels: [],
          recentEvents: [],
          boostLevel: 0,
          topChannels: [],
          preferredLocale: 'en-US',
          cachedAt: Date.now() - (366 * 24 * 60 * 60 * 1000), // Over 1 year old
          ttl: 365 * 24 * 60 * 60 * 1000,
        },
        addedAt: Date.now() - (366 * 24 * 60 * 60 * 1000),
      };

      const mockData = {
        cultures: [expiredCulture],
        lastUpdated: Date.now(),
        version: 1,
      };

      jest.spyOn(channelService['cacheDataStore'], 'load').mockResolvedValue(mockData);
      
      await (channelService as any).loadCacheFromDisk();
      
      // Expired entry should not be loaded
      expect((channelService as any).serverCultureCache.size).toBe(0);
    });
  });

  describe('UserContextService Cache Persistence', () => {
    let userService: UserContextService;
    let mockMember: GuildMember;

    beforeEach(() => {
      jest.clearAllMocks();
      userService = new UserContextService();
      
      // Create mock guild member
      mockMember = {
        id: 'user123',
        guild: { id: 'guild123' },
        user: {
          id: 'user123',
          username: 'testuser',
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
        displayName: 'TestUser',
        joinedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        premiumSince: null,
        presence: {
          status: 'online',
          activities: [],
        },
        roles: {
          cache: new Map([
            ['role1', { name: 'Member' }],
            ['role2', { name: 'Verified' }],
          ])
        },
        permissions: {
          has: (perm: string) => perm === 'SendMessages',
        },
      } as any;
    });

    it('should initialize with DataStore', () => {
      const dataStore = (userService as any).cacheDataStore;
      expect(dataStore).toBeInstanceOf(DataStore);
    });

    it('should cache user contexts with guild-user key', () => {
      userService.buildDiscordUserContext(mockMember);
      
      const cacheKey = `${mockMember.guild.id}-${mockMember.id}`;
      const cached = (userService as any).discordUserContextCache.get(cacheKey);
      
      expect(cached).toBeDefined();
      expect(cached.username).toBe('testuser');
    });

    it('should export and import cache data', async () => {
      // Add some test data
      userService.buildDiscordUserContext(mockMember);
      userService.buildDiscordUserContext({ ...mockMember, id: 'user456' } as any);
      
      // Export
      const exported = await userService.exportCache();
      expect(exported.contexts).toHaveLength(2);
      expect(exported.version).toBe(1);
      
      // Clear cache
      (userService as any).discordUserContextCache.clear();
      
      // Import
      await userService.importCache(exported);
      expect((userService as any).discordUserContextCache.size).toBe(2);
    });

    it('should reject invalid import data', async () => {
      await expect(userService.importCache(null as any)).rejects.toThrow('Invalid cache data format');
      await expect(userService.importCache({ contexts: 'not-array' } as any)).rejects.toThrow('Invalid cache data format');
    });

    it('should respect max cache entries limit', () => {
      const maxEntries = (userService as any).MAX_DISCORD_CACHE_ENTRIES;
      
      // Create more entries than limit
      for (let i = 0; i < maxEntries + 10; i++) {
        const member = { 
          ...mockMember, 
          id: `user${i}`,
          user: { ...mockMember.user, id: `user${i}` }
        };
        userService.buildDiscordUserContext(member as any);
      }
      
      const cacheSize = (userService as any).discordUserContextCache.size;
      expect(cacheSize).toBeLessThanOrEqual(maxEntries);
    });

    it('should calculate cache hit rate correctly', () => {
      const stats1 = userService.getCacheStatistics();
      expect(stats1.hitRate).toBe(0); // No requests yet
      
      // Generate activity
      userService.buildDiscordUserContext(mockMember); // Miss
      userService.buildDiscordUserContext(mockMember); // Hit
      userService.buildDiscordUserContext(mockMember); // Hit
      
      const stats2 = userService.getCacheStatistics();
      expect(stats2.hits).toBe(2);
      expect(stats2.misses).toBe(1);
      expect(stats2.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should persist cache with debouncing', () => {
      jest.useFakeTimers();
      const saveSpy = jest.spyOn(userService as any, 'saveCacheToDisk');
      
      // Multiple rapid updates
      userService.buildDiscordUserContext(mockMember);
      userService.buildDiscordUserContext({ ...mockMember, id: 'user2' } as any);
      userService.buildDiscordUserContext({ ...mockMember, id: 'user3' } as any);
      
      // Should not save immediately
      expect(saveSpy).not.toHaveBeenCalled();
      
      // Fast forward 5 seconds
      jest.advanceTimersByTime(5000);
      
      // Should save only once despite multiple updates
      expect(saveSpy).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });

    it('should handle cache save errors gracefully', async () => {
      const saveError = new Error('Save failed');
      jest.spyOn(userService['cacheDataStore'], 'save').mockRejectedValue(saveError);
      jest.spyOn(logger, 'error');
      
      await (userService as any).saveCacheToDisk();
      
      expect(logger.error).toHaveBeenCalledWith('Failed to save user cache to disk:', saveError);
    });

    it('should clean up expired entries on import', async () => {
      const now = Date.now();
      const ttl = (userService as any).DISCORD_CONTEXT_TTL;
      
      const importData = {
        contexts: [
          {
            key: 'guild1-user1',
            context: {
              username: 'olduser',
              displayName: 'OldUser',
              joinedAt: new Date(),
              accountAge: new Date(),
              roles: [],
              nitroStatus: false,
              permissions: { isAdmin: false, isModerator: false, canManageMessages: false },
              cachedAt: now - ttl - 1000, // Expired
              ttl,
            },
            addedAt: now - ttl - 1000,
          },
          {
            key: 'guild1-user2',
            context: {
              username: 'currentuser',
              displayName: 'CurrentUser',
              joinedAt: new Date(),
              accountAge: new Date(),
              roles: [],
              nitroStatus: false,
              permissions: { isAdmin: false, isModerator: false, canManageMessages: false },
              cachedAt: now - 1000, // Recent
              ttl,
            },
            addedAt: now - 1000,
          },
        ],
        lastUpdated: now,
        version: 1,
      };
      
      await userService.importCache(importData);
      
      // Only non-expired entry should be imported
      expect((userService as any).discordUserContextCache.size).toBe(1);
      expect((userService as any).discordUserContextCache.has('guild1-user2')).toBe(true);
      expect((userService as any).discordUserContextCache.has('guild1-user1')).toBe(false);
    });
  });
});