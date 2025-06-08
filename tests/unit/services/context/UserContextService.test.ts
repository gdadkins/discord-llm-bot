/**
 * @file UserContextService.test.ts - Unit tests for UserContextService
 * @module tests/unit/services/context
 */

import { UserContextService } from '../../../../src/services/context/UserContextService';
import { DiscordUserContext } from '../../../../src/services/context/types';
import { GuildMember, Guild, User, Presence, PermissionsBitField, Collection } from 'discord.js';
import { logger } from '../../../../src/utils/logger';

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('UserContextService', () => {
  let service: UserContextService;
  let mockMember: jest.Mocked<GuildMember>;
  let mockGuild: jest.Mocked<Guild>;
  let mockUser: jest.Mocked<User>;

  beforeEach(() => {
    service = new UserContextService();
    jest.clearAllMocks();
    
    // Create mock Discord objects
    mockUser = {
      id: 'user123',
      username: 'TestUser',
      createdAt: new Date('2020-01-01'),
    } as jest.Mocked<User>;

    mockGuild = {
      id: 'guild123',
    } as jest.Mocked<Guild>;

    // Create a proper Collection mock
    const rolesCollection = new Collection();
    rolesCollection.set('role1', { name: 'Admin', id: 'role1' });
    rolesCollection.set('role2', { name: 'Member', id: 'role2' });
    rolesCollection.set('@everyone', { name: '@everyone', id: '@everyone' });

    mockMember = {
      id: 'user123',
      user: mockUser,
      guild: mockGuild,
      displayName: 'TestDisplay',
      joinedAt: new Date('2021-01-01'),
      premiumSince: null,
      roles: {
        cache: rolesCollection,
      },
      permissions: new PermissionsBitField(['Administrator', 'ManageMessages']),
      presence: {
        status: 'online',
        activities: [
          { type: 0, name: 'Playing a game' },
          { type: 2, name: 'Listening to music' },
        ],
      },
    } as unknown as jest.Mocked<GuildMember>;
  });

  describe('buildDiscordUserContext', () => {
    it('should build context for a new user', () => {
      const result = service.buildDiscordUserContext(mockMember);

      expect(result).toContain('DISCORD USER CONTEXT:');
      expect(result).toContain('Username: TestUser (Display: TestDisplay)');
      expect(result).toContain('Account Age:');
      expect(result).toContain('Server Member:');
      expect(result).toContain('Roles: Admin, Member');
      expect(result).toContain('Permissions: Admin');
      expect(result).toContain('Status: online');
      expect(result).toContain('Activities:');
    });

    it('should cache user context', () => {
      // First call - should cache
      const result1 = service.buildDiscordUserContext(mockMember);
      
      // Second call - should return from cache
      const result2 = service.buildDiscordUserContext(mockMember);
      
      expect(result1).toBe(result2);
    });

    it('should handle Nitro subscribers', () => {
      const nitroMember = {
        ...mockMember,
        premiumSince: new Date('2022-01-01'),
      } as unknown as GuildMember;
      
      const result = service.buildDiscordUserContext(nitroMember);
      
      expect(result).toContain('Nitro Subscriber: Yes');
    });

    it('should handle moderator permissions correctly', () => {
      const moderatorMember = {
        ...mockMember,
        permissions: new PermissionsBitField(['ManageMessages', 'KickMembers']),
      } as unknown as GuildMember;
      
      const result = service.buildDiscordUserContext(moderatorMember);
      
      expect(result).toContain('Permissions:');
      expect(result).toContain('Moderator');
    });

    it('should handle users without presence', () => {
      const memberWithoutPresence = {
        ...mockMember,
        presence: null,
      } as unknown as GuildMember;
      
      const result = service.buildDiscordUserContext(memberWithoutPresence);
      
      expect(result).not.toContain('Status:');
      expect(result).not.toContain('Activities:');
    });

    it('should limit roles to 10', () => {
      const manyRoles = new Collection();
      for (let i = 0; i < 15; i++) {
        manyRoles.set(`role${i}`, { name: `Role${i}`, id: `role${i}` });
      }
      
      const memberWithManyRoles = {
        ...mockMember,
        roles: {
          cache: manyRoles,
        },
      } as unknown as GuildMember;
      
      const result = service.buildDiscordUserContext(memberWithManyRoles);
      const roleMatches = result.match(/Role\d+/g) || [];
      
      expect(roleMatches.length).toBeLessThanOrEqual(10);
    });

    it('should trigger cleanup when cache exceeds 100 entries', () => {
      // Add 101 different users to trigger cleanup
      for (let i = 0; i < 101; i++) {
        const member = {
          ...mockMember,
          id: `user${i}`,
          guild: { id: `guild${i % 10}` },
          user: { ...mockUser, id: `user${i}` },
        } as unknown as GuildMember;
        
        service.buildDiscordUserContext(member);
      }
      
      // Cleanup should have been triggered
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Cleaned up'));
    });
  });

  describe('getCachedDiscordContext', () => {
    it('should return cached context if valid', () => {
      service.buildDiscordUserContext(mockMember);
      
      const cached = service.getCachedDiscordContext('guild123', 'user123');
      
      expect(cached).toBeDefined();
      expect(cached?.username).toBe('TestUser');
      expect(cached?.displayName).toBe('TestDisplay');
    });

    it('should return null if not cached', () => {
      const cached = service.getCachedDiscordContext('guild999', 'user999');
      
      expect(cached).toBeNull();
    });

    it('should return null if cache expired', () => {
      service.buildDiscordUserContext(mockMember);
      
      // Manually expire the cache entry
      const cacheKey = 'guild123-user123';
      const cachedEntry = (service as any).discordUserContextCache.get(cacheKey);
      if (cachedEntry) {
        cachedEntry.cachedAt = Date.now() - (366 * 24 * 60 * 60 * 1000); // Over 1 year old
      }
      
      const cached = service.getCachedDiscordContext('guild123', 'user123');
      
      expect(cached).toBeNull();
    });
  });

  describe('getDiscordDataStorageStats', () => {
    it('should return empty stats for empty cache', () => {
      const stats = service.getDiscordDataStorageStats();
      
      expect(stats).toEqual({
        cacheEntries: 0,
        estimatedSizeBytes: 0,
        estimatedSizeMB: 0,
        oldestEntry: null,
        newestEntry: null,
        serverBreakdown: new Map(),
      });
    });

    it('should calculate storage stats correctly', () => {
      // Add some users
      service.buildDiscordUserContext(mockMember);
      
      const member2 = {
        ...mockMember,
        id: 'user456',
        user: { ...mockUser, id: 'user456' },
      } as unknown as GuildMember;
      service.buildDiscordUserContext(member2);
      
      const stats = service.getDiscordDataStorageStats();
      
      expect(stats.cacheEntries).toBe(2);
      expect(stats.estimatedSizeBytes).toBeGreaterThan(0);
      expect(stats.estimatedSizeMB).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeInstanceOf(Date);
      expect(stats.newestEntry).toBeInstanceOf(Date);
      expect(stats.serverBreakdown.has('guild123')).toBe(true);
    });

    it('should track timestamps correctly', () => {
      jest.useFakeTimers();
      
      // Add users with delay
      const now = Date.now();
      service.buildDiscordUserContext(mockMember);
      
      // Wait a bit and add another
      jest.advanceTimersByTime(1000);
      
      const member2 = {
        ...mockMember,
        id: 'user456',
        user: { ...mockUser, id: 'user456' },
      } as unknown as GuildMember;
      service.buildDiscordUserContext(member2);
      
      const stats = service.getDiscordDataStorageStats();
      
      expect(stats.oldestEntry?.getTime()).toBeLessThanOrEqual(now);
      expect(stats.newestEntry?.getTime()).toBeGreaterThanOrEqual(now);
      
      jest.useRealTimers();
    });
  });

  describe('cleanupDiscordCache', () => {
    it('should remove expired entries', () => {
      // Add some users
      service.buildDiscordUserContext(mockMember);
      
      const member2 = {
        ...mockMember,
        id: 'user456',
        user: { ...mockUser, id: 'user456' },
      } as unknown as GuildMember;
      service.buildDiscordUserContext(member2);
      
      // Manually expire one entry
      const cacheKey = 'guild123-user123';
      const cachedEntry = (service as any).discordUserContextCache.get(cacheKey);
      if (cachedEntry) {
        cachedEntry.cachedAt = Date.now() - (366 * 24 * 60 * 60 * 1000); // Over 1 year old
      }
      
      const removed = service.cleanupDiscordCache();
      
      expect(removed).toBe(1);
      expect((service as any).discordUserContextCache.size).toBe(1);
    });

    it('should respect custom maxAge parameter', () => {
      service.buildDiscordUserContext(mockMember);
      
      // Set cache to 1 hour old
      const cacheKey = 'guild123-user123';
      const cachedEntry = (service as any).discordUserContextCache.get(cacheKey);
      if (cachedEntry) {
        cachedEntry.cachedAt = Date.now() - (2 * 60 * 60 * 1000); // 2 hours old
      }
      
      // Clean with 1 hour max age
      const removed = service.cleanupDiscordCache(60 * 60 * 1000);
      
      expect(removed).toBe(1);
    });

    it('should return 0 when no entries to remove', () => {
      service.buildDiscordUserContext(mockMember);
      
      const removed = service.cleanupDiscordCache();
      
      expect(removed).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clear all caches', () => {
      service.buildDiscordUserContext(mockMember);
      
      expect((service as any).discordUserContextCache.size).toBe(1);
      
      service.cleanup();
      
      expect((service as any).discordUserContextCache.size).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('UserContextService cleanup completed');
    });
  });

  describe('edge cases', () => {
    it('should handle member without joinedAt date', () => {
      const memberWithoutJoinedAt = {
        ...mockMember,
        joinedAt: null,
      } as unknown as GuildMember;
      
      const result = service.buildDiscordUserContext(memberWithoutJoinedAt);
      
      expect(result).toContain('Server Member: 0 days');
    });

    it('should handle empty roles', () => {
      const emptyRoles = new Collection();
      emptyRoles.set('@everyone', { name: '@everyone', id: '@everyone' });
      
      const memberWithEmptyRoles = {
        ...mockMember,
        roles: {
          cache: emptyRoles,
        },
      } as unknown as GuildMember;
      
      const result = service.buildDiscordUserContext(memberWithEmptyRoles);
      
      expect(result).not.toContain('Roles:');
    });

    it('should handle member with no permissions', () => {
      const memberWithNoPermissions = {
        ...mockMember,
        permissions: new PermissionsBitField(),
      } as unknown as GuildMember;
      
      const result = service.buildDiscordUserContext(memberWithNoPermissions);
      
      expect(result).not.toContain('Permissions:');
    });

    it('should handle presence with many activities', () => {
      const manyActivities = [];
      for (let i = 0; i < 10; i++) {
        manyActivities.push({ type: 0, name: `Activity ${i}` });
      }
      
      const memberWithManyActivities = {
        ...mockMember,
        presence: {
          status: 'online',
          activities: manyActivities,
        },
      } as unknown as GuildMember;
      
      const result = service.buildDiscordUserContext(memberWithManyActivities);
      const activityMatches = result.match(/Activity \d+/g) || [];
      
      expect(activityMatches.length).toBe(5); // Limited to 5
    });
  });
});