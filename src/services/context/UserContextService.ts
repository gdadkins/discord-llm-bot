/**
 * @file UserContextService - Manages Discord user profiles and contexts
 * @module services/context/UserContextService
 */

import { GuildMember } from 'discord.js';
import { logger } from '../../utils/logger';
import { DataStore, DataValidator } from '../../utils/DataStore';
import { DiscordUserContext } from './types';

interface UserCacheData {
  contexts: Array<{
    key: string;
    context: DiscordUserContext;
    addedAt: number;
  }>;
  lastUpdated: number;
  version: number;
}

export class UserContextService {
  private discordUserContextCache: Map<string, DiscordUserContext> = new Map();
  private readonly DISCORD_CONTEXT_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year
  private readonly MAX_DISCORD_CACHE_ENTRIES = 100; // Reduced to match task spec
  private cacheDataStore: DataStore<UserCacheData>;
  private cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    persistenceLoads: 0,
    persistenceSaves: 0,
  };

  constructor() {
    // Initialize DataStore for cache persistence
    const validator: DataValidator<UserCacheData> = (data: unknown): data is UserCacheData => {
      if (!data || typeof data !== 'object') return false;
      const d = data as any;
      return Array.isArray(d.contexts) &&
             typeof d.lastUpdated === 'number' &&
             typeof d.version === 'number';
    };
    
    this.cacheDataStore = new DataStore<UserCacheData>('./data/user-cache.json', {
      validator,
      compressionEnabled: false, // User data is typically small
      ttl: this.DISCORD_CONTEXT_TTL,
      autoCleanup: true,
      maxBackups: 3,
      enableDebugLogging: false
    });
    
    // Load cache on initialization
    this.loadCacheFromDisk();
  }

  /**
   * Build Discord user context from a GuildMember
   */
  public buildDiscordUserContext(member: GuildMember, includeServerData: boolean = false): string {
    const userId = member.id;
    const cacheKey = `${member.guild.id}-${userId}`;
    
    // Check cache first
    const cached = this.discordUserContextCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < this.DISCORD_CONTEXT_TTL) {
      this.cacheStats.hits++;
      return this.formatDiscordContextAsString(cached, includeServerData);
    }
    
    this.cacheStats.misses++;
    
    // Build new context
    const context: DiscordUserContext = {
      username: member.user.username,
      displayName: member.displayName || member.user.username,
      joinedAt: member.joinedAt || new Date(),
      accountAge: member.user.createdAt,
      roles: member.roles.cache
        .filter(role => role.name !== '@everyone')
        .map(role => role.name)
        .slice(0, 10), // Limit to 10 most important roles
      nitroStatus: member.premiumSince !== null,
      presence: member.presence ? {
        status: member.presence.status,
        activities: member.presence.activities
          .map(activity => `${activity.type}: ${activity.name}`)
          .slice(0, 5) // Limit activities
      } : undefined,
      permissions: {
        isAdmin: member.permissions.has('Administrator'),
        isModerator: member.permissions.has('ManageMessages') || 
                     member.permissions.has('KickMembers') ||
                     member.permissions.has('BanMembers'),
        canManageMessages: member.permissions.has('ManageMessages')
      },
      cachedAt: Date.now(),
      ttl: this.DISCORD_CONTEXT_TTL
    };
    
    // Cache the context
    this.discordUserContextCache.set(cacheKey, context);
    
    // Clean up old cache entries periodically
    if (this.discordUserContextCache.size > this.MAX_DISCORD_CACHE_ENTRIES) {
      this.cleanupDiscordContextCache();
    }
    
    // Save cache to disk periodically
    this.scheduleCachePersistence();
    
    return this.formatDiscordContextAsString(context, includeServerData);
  }

  /**
   * Format Discord user context as a human-readable string
   */
  private formatDiscordContextAsString(context: DiscordUserContext, includeServerData: boolean = false): string {
    const parts: string[] = ['DISCORD USER CONTEXT:\n'];
    
    // Basic info
    parts.push(`Username: ${context.username} (Display: ${context.displayName})`);
    
    // Account age
    const accountAgeDays = Math.floor((Date.now() - context.accountAge.getTime()) / (1000 * 60 * 60 * 24));
    if (includeServerData) {
      const joinedDays = Math.floor((Date.now() - context.joinedAt.getTime()) / (1000 * 60 * 60 * 24));
      parts.push(`Account Age: ${accountAgeDays} days | Server Member: ${joinedDays} days`);
    } else {
      parts.push(`Account Age: ${accountAgeDays} days`);
    }
    
    // Nitro status
    if (context.nitroStatus) {
      parts.push('Nitro Subscriber: Yes');
    }
    
    // Roles (important for context)
    if (context.roles.length > 0) {
      parts.push(`Roles: ${context.roles.join(', ')}`);
    }
    
    // Permissions summary
    const perms: string[] = [];
    if (context.permissions.isAdmin) perms.push('Admin');
    if (context.permissions.isModerator) perms.push('Moderator');
    if (perms.length > 0) {
      parts.push(`Permissions: ${perms.join(', ')}`);
    }
    
    // Presence (if available)
    if (context.presence) {
      parts.push(`Status: ${context.presence.status}`);
      if (context.presence.activities.length > 0) {
        parts.push(`Activities: ${context.presence.activities.join(', ')}`);
      }
    }
    
    return parts.join('\n') + '\n';
  }

  /**
   * Clean up old Discord context cache entries with LRU eviction
   */
  private cleanupDiscordContextCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    
    // First, remove expired entries
    for (const [key, context] of this.discordUserContextCache.entries()) {
      if (now - context.cachedAt > this.DISCORD_CONTEXT_TTL) {
        entriesToDelete.push(key);
      }
    }
    
    // If still over limit, use LRU eviction
    if (this.discordUserContextCache.size - entriesToDelete.length > this.MAX_DISCORD_CACHE_ENTRIES) {
      const sortedEntries = Array.from(this.discordUserContextCache.entries())
        .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
      
      const toRemove = sortedEntries.length - this.MAX_DISCORD_CACHE_ENTRIES + entriesToDelete.length;
      for (let i = 0; i < toRemove; i++) {
        entriesToDelete.push(sortedEntries[i][0]);
      }
    }
    
    entriesToDelete.forEach(key => {
      this.discordUserContextCache.delete(key);
      this.cacheStats.evictions++;
    });
    
    if (entriesToDelete.length > 0) {
      logger.info(`Cleaned up ${entriesToDelete.length} Discord context cache entries (LRU eviction)`);
    }
  }

  /**
   * Get Discord data storage statistics
   */
  public getDiscordDataStorageStats(): {
    cacheEntries: number;
    estimatedSizeBytes: number;
    estimatedSizeMB: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    serverBreakdown: Map<string, number>;
    } {
    let totalSize = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;
    const serverBreakdown = new Map<string, number>();
    
    // Calculate Discord context cache size
    this.discordUserContextCache.forEach((context, key) => {
      // Estimate size of each context object
      const contextSize = JSON.stringify(context).length;
      totalSize += contextSize;
      
      // Track timestamps
      if (context.cachedAt < oldestTimestamp) {
        oldestTimestamp = context.cachedAt;
      }
      if (context.cachedAt > newestTimestamp) {
        newestTimestamp = context.cachedAt;
      }
      
      // Server breakdown
      const serverId = key.split('-')[0];
      serverBreakdown.set(serverId, (serverBreakdown.get(serverId) || 0) + contextSize);
    });
    
    return {
      cacheEntries: this.discordUserContextCache.size,
      estimatedSizeBytes: totalSize,
      estimatedSizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
      oldestEntry: this.discordUserContextCache.size > 0 ? new Date(oldestTimestamp) : null,
      newestEntry: this.discordUserContextCache.size > 0 ? new Date(newestTimestamp) : null,
      serverBreakdown,
    };
  }

  /**
   * Clean up old Discord cache entries
   */
  public cleanupDiscordCache(maxAge: number = this.DISCORD_CONTEXT_TTL): number {
    const now = Date.now();
    let removed = 0;
    
    this.discordUserContextCache.forEach((context, key) => {
      if (now - context.cachedAt > maxAge) {
        this.discordUserContextCache.delete(key);
        removed++;
      }
    });
    
    return removed;
  }

  /**
   * Get cached Discord context for a user
   */
  public getCachedDiscordContext(guildId: string, userId: string): DiscordUserContext | null {
    const cacheKey = `${guildId}-${userId}`;
    const cached = this.discordUserContextCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.cachedAt) < this.DISCORD_CONTEXT_TTL) {
      return cached;
    }
    
    return null;
  }

  /**
   * Clear all caches
   */
  public cleanup(): void {
    this.discordUserContextCache.clear();
    logger.info('UserContextService cleanup completed');
  }

  /**
   * Load cache from disk
   */
  private async loadCacheFromDisk(): Promise<void> {
    try {
      const data = await this.cacheDataStore.load();
      if (data && data.contexts) {
        const now = Date.now();
        let loadedCount = 0;
        let expiredCount = 0;
        
        for (const entry of data.contexts) {
          if (now - entry.context.cachedAt < this.DISCORD_CONTEXT_TTL) {
            this.discordUserContextCache.set(entry.key, entry.context);
            loadedCount++;
          } else {
            expiredCount++;
          }
        }
        
        this.cacheStats.persistenceLoads++;
        logger.info(`Loaded ${loadedCount} user context entries from cache (${expiredCount} expired)`);
      }
    } catch (error) {
      logger.error('Failed to load user cache from disk:', error);
    }
  }

  /**
   * Save cache to disk
   */
  private async saveCacheToDisk(): Promise<void> {
    try {
      const contexts = Array.from(this.discordUserContextCache.entries()).map(([key, context]) => ({
        key,
        context,
        addedAt: context.cachedAt,
      }));
      
      const data: UserCacheData = {
        contexts,
        lastUpdated: Date.now(),
        version: 1,
      };
      
      await this.cacheDataStore.save(data);
      this.cacheStats.persistenceSaves++;
      
      logger.debug(`Saved ${contexts.length} user context entries to cache`);
    } catch (error) {
      logger.error('Failed to save user cache to disk:', error);
    }
  }

  private saveCacheTimer: NodeJS.Timeout | null = null;
  
  /**
   * Schedule cache persistence with debouncing
   */
  private scheduleCachePersistence(): void {
    // Clear existing timer
    if (this.saveCacheTimer) {
      clearTimeout(this.saveCacheTimer);
    }
    
    // Schedule save after 5 seconds of inactivity
    this.saveCacheTimer = setTimeout(() => {
      this.saveCacheToDisk();
    }, 5000);
  }

  /**
   * Get cache statistics
   */
  public getCacheStatistics(): {
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    persistenceLoads: number;
    persistenceSaves: number;
    cacheSize: number;
    memorySizeMB: number;
  } {
    const totalRequests = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = totalRequests > 0 ? (this.cacheStats.hits / totalRequests) * 100 : 0;
    const storageStats = this.getDiscordDataStorageStats();
    
    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      hitRate,
      evictions: this.cacheStats.evictions,
      persistenceLoads: this.cacheStats.persistenceLoads,
      persistenceSaves: this.cacheStats.persistenceSaves,
      cacheSize: this.discordUserContextCache.size,
      memorySizeMB: storageStats.estimatedSizeMB,
    };
  }

  /**
   * Export cache for backup
   */
  public async exportCache(): Promise<UserCacheData> {
    const contexts = Array.from(this.discordUserContextCache.entries()).map(([key, context]) => ({
      key,
      context,
      addedAt: context.cachedAt,
    }));
    
    return {
      contexts,
      lastUpdated: Date.now(),
      version: 1,
    };
  }

  /**
   * Import cache from backup
   */
  public async importCache(data: UserCacheData): Promise<void> {
    if (!data || !Array.isArray(data.contexts)) {
      throw new Error('Invalid cache data format');
    }
    
    const now = Date.now();
    let importedCount = 0;
    let skippedCount = 0;
    
    for (const entry of data.contexts) {
      if (now - entry.context.cachedAt < this.DISCORD_CONTEXT_TTL) {
        this.discordUserContextCache.set(entry.key, entry.context);
        importedCount++;
      } else {
        skippedCount++;
      }
    }
    
    logger.info(`Imported ${importedCount} user context entries (${skippedCount} expired)`);
    
    // Save to disk after import
    this.scheduleCachePersistence();
  }
}