/**
 * @file ChannelContextService - Manages server culture and channel contexts
 * @module services/context/ChannelContextService
 */

import { Guild } from 'discord.js';
import { logger } from '../../utils/logger';
import { DataStore, DataValidator } from '../../utils/DataStore';
import { ServerCulture } from './types';

interface ChannelCacheData {
  cultures: Array<{
    guildId: string;
    culture: ServerCulture;
    addedAt: number;
  }>;
  lastUpdated: number;
  version: number;
}

export class ChannelContextService {
  private serverCultureCache: Map<string, ServerCulture> = new Map();
  private readonly SERVER_CULTURE_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year
  private readonly MAX_SERVER_CULTURE_CACHE_ENTRIES = 100;
  private cacheDataStore: DataStore<ChannelCacheData>;
  private cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    persistenceLoads: 0,
    persistenceSaves: 0,
  };

  constructor() {
    // Initialize DataStore for cache persistence
    const validator: DataValidator<ChannelCacheData> = (data: unknown): data is ChannelCacheData => {
      if (!data || typeof data !== 'object') return false;
      const d = data as any;
      return Array.isArray(d.cultures) &&
             typeof d.lastUpdated === 'number' &&
             typeof d.version === 'number';
    };
    
    this.cacheDataStore = new DataStore<ChannelCacheData>('./data/channel-cache.json', {
      validator,
      compressionEnabled: false, // Channel data is typically small
      ttl: this.SERVER_CULTURE_TTL,
      autoCleanup: true,
      maxBackups: 3,
      enableDebugLogging: false
    });
    
    // Load cache on initialization
    this.loadCacheFromDisk();
  }

  /**
   * Build server culture context from a Guild
   */
  public buildServerCultureContext(guild: Guild): string {
    const guildId = guild.id;
    
    // Check cache first
    const cached = this.serverCultureCache.get(guildId);
    if (cached && (Date.now() - cached.cachedAt) < this.SERVER_CULTURE_TTL) {
      this.cacheStats.hits++;
      return this.formatServerCultureAsString(cached);
    }
    
    this.cacheStats.misses++;
    
    // Build new server culture context
    const culture = this.buildServerCultureData(guild);
    
    // Cache the culture data
    this.serverCultureCache.set(guildId, culture);
    
    // Clean up old cache entries periodically
    if (this.serverCultureCache.size > this.MAX_SERVER_CULTURE_CACHE_ENTRIES) {
      this.cleanupServerCultureCache();
    }
    
    // Save cache to disk periodically
    this.scheduleCachePersistence();
    
    return this.formatServerCultureAsString(culture);
  }

  /**
   * Get server culture data from cache or build new
   */
  public getServerCulture(guildId: string): ServerCulture | null {
    const cached = this.serverCultureCache.get(guildId);
    if (cached && (Date.now() - cached.cachedAt) < this.SERVER_CULTURE_TTL) {
      return cached;
    }
    return null;
  }

  /**
   * Save server culture data to cache
   */
  public saveServerCulture(guildId: string, culture: ServerCulture): void {
    culture.cachedAt = Date.now();
    culture.ttl = this.SERVER_CULTURE_TTL;
    this.serverCultureCache.set(guildId, culture);
    
    // Clean up periodically
    if (this.serverCultureCache.size > this.MAX_SERVER_CULTURE_CACHE_ENTRIES) {
      this.cleanupServerCultureCache();
    }
  }

  /**
   * Build server culture data from a Discord Guild object
   */
  private buildServerCultureData(guild: Guild): ServerCulture {
    const now = Date.now();
    
    // Extract popular emojis (custom emojis from the guild)
    const popularEmojis = guild.emojis.cache
      .filter(emoji => !emoji.animated) // Focus on static emojis for consistency
      .map(emoji => ({ emoji: emoji.toString(), count: 1 })) // Default count since we don't track usage
      .slice(0, 10); // Limit to 10 most recent
    
    // Extract active voice channels
    const activeVoiceChannels = guild.channels.cache
      .filter(channel => channel.isVoiceBased() && channel.members && channel.members.size > 0)
      .map(channel => channel.name)
      .slice(0, 5); // Limit to 5 active channels
    
    // Extract recent events (server boosts, member milestones)
    const recentEvents: Array<{name: string, date: Date}> = [];
    
    // Add server boost information as an event
    if (guild.premiumSubscriptionCount && guild.premiumSubscriptionCount > 0) {
      recentEvents.push({
        name: `Server boosted to level ${guild.premiumTier || 0}`,
        date: new Date(now - 24 * 60 * 60 * 1000) // Approximate recent boost
      });
    }
    
    // Add member milestone events
    const memberCount = guild.memberCount;
    if (memberCount >= 100) {
      const milestones = [100, 500, 1000, 5000, 10000];
      const reachedMilestone = milestones.filter(m => memberCount >= m).pop();
      if (reachedMilestone) {
        recentEvents.push({
          name: `Reached ${reachedMilestone} members`,
          date: new Date(now - 7 * 24 * 60 * 60 * 1000) // Approximate milestone
        });
      }
    }
    
    // Extract top channels by type and activity
    const topChannels = guild.channels.cache
      .filter(channel => channel.isTextBased() && !channel.isThread())
      .map(channel => ({
        name: channel.name,
        messageCount: 1 // Default since we don't track message counts
      }))
      .slice(0, 5); // Limit to 5 top channels
    
    return {
      guildId: guild.id,
      popularEmojis,
      activeVoiceChannels,
      recentEvents,
      boostLevel: guild.premiumTier || 0,
      topChannels,
      preferredLocale: guild.preferredLocale || 'en-US',
      cachedAt: now,
      ttl: this.SERVER_CULTURE_TTL
    };
  }

  /**
   * Format server culture as a human-readable string
   */
  private formatServerCultureAsString(culture: ServerCulture): string {
    const parts: string[] = ['SERVER CULTURE CONTEXT:\n'];
    
    // Popular emojis
    if (culture.popularEmojis.length > 0) {
      const emojiList = culture.popularEmojis.slice(0, 5).map(e => e.emoji).join(' ');
      parts.push(`Popular Emojis: ${emojiList}`);
    }
    
    // Active voice channels
    if (culture.activeVoiceChannels.length > 0) {
      parts.push(`Active Voice: ${culture.activeVoiceChannels.length} channels (${culture.activeVoiceChannels.slice(0, 3).join(', ')})`);
    } else {
      parts.push('Active Voice: No active voice channels');
    }
    
    // Recent events
    if (culture.recentEvents.length > 0) {
      const eventNames = culture.recentEvents.slice(0, 3).map(e => e.name).join(', ');
      parts.push(`Recent Events: ${eventNames}`);
    }
    
    // Boost level
    parts.push(`Boost Level: ${culture.boostLevel}`);
    
    // Top channels
    if (culture.topChannels.length > 0) {
      const channelNames = culture.topChannels.slice(0, 3).map(c => `#${c.name}`).join(', ');
      parts.push(`Top Channels: ${channelNames}`);
    }
    
    // Language preference
    parts.push(`Language: ${culture.preferredLocale}`);
    
    return parts.join('\n') + '\n';
  }

  /**
   * Clean up old server culture cache entries with LRU eviction
   */
  private cleanupServerCultureCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    
    // First, remove expired entries
    for (const [guildId, culture] of this.serverCultureCache.entries()) {
      if (now - culture.cachedAt > this.SERVER_CULTURE_TTL) {
        entriesToDelete.push(guildId);
      }
    }
    
    // If still over limit, use LRU eviction
    if (this.serverCultureCache.size - entriesToDelete.length > this.MAX_SERVER_CULTURE_CACHE_ENTRIES) {
      const sortedEntries = Array.from(this.serverCultureCache.entries())
        .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
      
      const toRemove = sortedEntries.length - this.MAX_SERVER_CULTURE_CACHE_ENTRIES + entriesToDelete.length;
      for (let i = 0; i < toRemove; i++) {
        entriesToDelete.push(sortedEntries[i][0]);
      }
    }
    
    entriesToDelete.forEach(guildId => {
      this.serverCultureCache.delete(guildId);
      this.cacheStats.evictions++;
    });
    
    if (entriesToDelete.length > 0) {
      logger.info(`Cleaned up ${entriesToDelete.length} server culture cache entries (LRU eviction)`);
    }
  }

  /**
   * Get storage statistics
   */
  public getStorageStats(): {
    cacheEntries: number;
    estimatedSizeBytes: number;
    estimatedSizeMB: number;
    } {
    let totalSize = 0;
    
    this.serverCultureCache.forEach(culture => {
      totalSize += JSON.stringify(culture).length;
    });
    
    return {
      cacheEntries: this.serverCultureCache.size,
      estimatedSizeBytes: totalSize,
      estimatedSizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
    };
  }

  /**
   * Clear all caches
   */
  public cleanup(): void {
    this.serverCultureCache.clear();
    logger.info('ChannelContextService cleanup completed');
  }

  /**
   * Load cache from disk
   */
  private async loadCacheFromDisk(): Promise<void> {
    try {
      const data = await this.cacheDataStore.load();
      if (data && data.cultures) {
        const now = Date.now();
        let loadedCount = 0;
        let expiredCount = 0;
        
        for (const entry of data.cultures) {
          if (now - entry.culture.cachedAt < this.SERVER_CULTURE_TTL) {
            this.serverCultureCache.set(entry.guildId, entry.culture);
            loadedCount++;
          } else {
            expiredCount++;
          }
        }
        
        this.cacheStats.persistenceLoads++;
        logger.info(`Loaded ${loadedCount} server culture entries from cache (${expiredCount} expired)`);
      }
    } catch (error) {
      logger.error('Failed to load channel cache from disk:', error);
    }
  }

  /**
   * Save cache to disk
   */
  private async saveCacheToDisk(): Promise<void> {
    try {
      const cultures = Array.from(this.serverCultureCache.entries()).map(([guildId, culture]) => ({
        guildId,
        culture,
        addedAt: culture.cachedAt,
      }));
      
      const data: ChannelCacheData = {
        cultures,
        lastUpdated: Date.now(),
        version: 1,
      };
      
      await this.cacheDataStore.save(data);
      this.cacheStats.persistenceSaves++;
      
      logger.debug(`Saved ${cultures.length} server culture entries to cache`);
    } catch (error) {
      logger.error('Failed to save channel cache to disk:', error);
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
    const storageStats = this.getStorageStats();
    
    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      hitRate,
      evictions: this.cacheStats.evictions,
      persistenceLoads: this.cacheStats.persistenceLoads,
      persistenceSaves: this.cacheStats.persistenceSaves,
      cacheSize: this.serverCultureCache.size,
      memorySizeMB: storageStats.estimatedSizeMB,
    };
  }
}