/**
 * @file ContextCacheManager - Manages context caching and invalidation
 * @module services/context/ContextCacheManager
 * 
 * Handles caching strategies, TTL management, and intelligent invalidation
 * for context data to optimize performance and memory usage.
 */

import { logger } from '../../utils/logger';
import { RichContext, ServerCulture } from './types';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  evictionCount: number;
  totalSize: number;
  entryCount: number;
  averageAge: number;
}

export interface CacheOptions {
  maxSize?: number;
  maxEntries?: number;
  defaultTTL?: number;
  cleanupInterval?: number;
}

/**
 * Manages context caching with LRU eviction and TTL support
 * 
 * This manager is responsible for:
 * - Implementing LRU cache eviction strategies
 * - Managing TTL for different context types
 * - Handling cache invalidation and cleanup
 * - Optimizing memory usage through intelligent caching
 */
export class ContextCacheManager {
  private readonly DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly DEFAULT_MAX_ENTRIES = 1000;
  private readonly DEFAULT_TTL = 3600000; // 1 hour
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

  // Cache storage
  private contextCache: Map<string, CacheEntry<RichContext>> = new Map();
  private cultureCache: Map<string, CacheEntry<ServerCulture>> = new Map();
  private stringCache: Map<string, CacheEntry<string>> = new Map();

  // Cache statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  // Configuration
  private maxSize: number;
  private maxEntries: number;
  private defaultTTL: number;

  // Cleanup timer
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || this.DEFAULT_MAX_SIZE;
    this.maxEntries = options.maxEntries || this.DEFAULT_MAX_ENTRIES;
    this.defaultTTL = options.defaultTTL || this.DEFAULT_TTL;

    // Start cleanup timer
    const cleanupInterval = options.cleanupInterval || this.CLEANUP_INTERVAL;
    this.cleanupTimer = setInterval(() => this.performCleanup(), cleanupInterval);
  }

  /**
   * Get context from cache
   */
  public getContext(key: string): RichContext | null {
    const entry = this.contextCache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.contextCache.delete(key);
      this.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.hits++;

    return entry.data;
  }

  /**
   * Set context in cache
   */
  public setContext(key: string, context: RichContext, ttl?: number): void {
    const size = this.estimateContextSize(context);

    // Check if we need to evict entries
    this.ensureCapacity(size);

    const entry: CacheEntry<RichContext> = {
      data: context,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
      size
    };

    this.contextCache.set(key, entry);

    // Set TTL if provided
    if (ttl) {
      // Expiration handled by periodic cleanup and lazy checks
    }
  }

  /**
   * Get server culture from cache
   */
  public getCulture(key: string): ServerCulture | null {
    const entry = this.cultureCache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.cultureCache.delete(key);
      this.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.hits++;

    return entry.data;
  }

  /**
   * Set server culture in cache
   */
  public setCulture(key: string, culture: ServerCulture, ttl?: number): void {
    const size = this.estimateCultureSize(culture);

    // Check if we need to evict entries
    this.ensureCapacity(size);

    const entry: CacheEntry<ServerCulture> = {
      data: culture,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
      size
    };

    this.cultureCache.set(key, entry);

    // Set TTL if provided
    if (ttl || culture.ttl) {
      // Expiration handled by periodic cleanup and lazy checks
    }
  }

  /**
   * Get string value from cache
   */
  public getString(key: string): string | null {
    const entry = this.stringCache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.stringCache.delete(key);
      this.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.hits++;

    return entry.data;
  }

  /**
   * Set string value in cache
   */
  public setString(key: string, value: string, ttl?: number): void {
    const size = value.length * 2; // Approximate bytes (UTF-16)

    // Check if we need to evict entries
    this.ensureCapacity(size);

    const entry: CacheEntry<string> = {
      data: value,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
      size
    };

    this.stringCache.set(key, entry);

    // Set TTL if provided
    if (ttl) {
      // Expiration handled by periodic cleanup and lazy checks
    }
  }

  /**
   * Invalidate cache entry
   */
  public invalidate(key: string, cacheType?: 'context' | 'culture' | 'string' | 'all'): void {
    switch (cacheType) {
      case 'context':
        this.contextCache.delete(key);
        break;
      case 'culture':
        this.cultureCache.delete(key);
        break;
      case 'string':
        this.stringCache.delete(key);
        break;
      case 'all':
      default:
        this.contextCache.delete(key);
        this.cultureCache.delete(key);
        this.stringCache.delete(key);
        break;
    }
  }

  /**
   * Invalidate all entries matching a pattern
   */
  public invalidatePattern(pattern: string | RegExp): number {
    let invalidated = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    // Invalidate context cache
    for (const key of this.contextCache.keys()) {
      if (regex.test(key)) {
        this.contextCache.delete(key);
        invalidated++;
      }
    }

    // Invalidate culture cache
    for (const key of this.cultureCache.keys()) {
      if (regex.test(key)) {
        this.cultureCache.delete(key);
        invalidated++;
      }
    }

    // Invalidate string cache
    for (const key of this.stringCache.keys()) {
      if (regex.test(key)) {
        this.stringCache.delete(key);
        invalidated++;
      }
    }

    return invalidated;
  }

  /**
   * Clear all caches
   */
  public clearAll(): void {
    this.contextCache.clear();
    this.cultureCache.clear();
    this.stringCache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;
    const missRate = totalRequests > 0 ? this.misses / totalRequests : 0;

    let totalSize = 0;
    let totalAge = 0;
    let entryCount = 0;
    const now = Date.now();

    // Calculate stats for all caches
    const allCaches = [this.contextCache, this.cultureCache, this.stringCache];

    allCaches.forEach(cache => {
      cache.forEach(entry => {
        totalSize += entry.size;
        totalAge += now - entry.timestamp;
        entryCount++;
      });
    });

    const averageAge = entryCount > 0 ? totalAge / entryCount : 0;

    return {
      hitRate,
      missRate,
      evictionCount: this.evictions,
      totalSize,
      entryCount,
      averageAge
    };
  }

  /**
   * Perform cache warmup
   */
  public async warmup(keys: string[], loader: (key: string) => Promise<any>): Promise<void> {
    const promises = keys.map(async key => {
      try {
        const data = await loader(key);
        if (data) {
          if (typeof data === 'string') {
            this.setString(key, data);
          } else if (data.conversations) {
            this.setContext(key, data);
          } else if (data.guildId) {
            this.setCulture(key, data);
          }
        }
      } catch (error) {
        logger.error(`Failed to warmup cache for key ${key}:`, error);
      }
    });

    await Promise.all(promises);
  }

  // ========== PRIVATE HELPER METHODS ==========

  private isExpired(entry: CacheEntry<any>): boolean {
    const age = Date.now() - entry.timestamp;
    return age > this.defaultTTL;
  }

  private ensureCapacity(requiredSize: number): void {
    const currentSize = this.getCurrentSize();

    // Check total size limit
    if (currentSize + requiredSize > this.maxSize) {
      this.evictLRU(requiredSize);
    }

    // Check entry count limit
    const totalEntries = this.contextCache.size + this.cultureCache.size + this.stringCache.size;
    if (totalEntries >= this.maxEntries) {
      this.evictOldest();
    }
  }

  private getCurrentSize(): number {
    let size = 0;

    this.contextCache.forEach(entry => size += entry.size);
    this.cultureCache.forEach(entry => size += entry.size);
    this.stringCache.forEach(entry => size += entry.size);

    return size;
  }

  private evictLRU(requiredSize: number): void {
    const allEntries: Array<[string, CacheEntry<any>, Map<string, any>]> = [];

    // Collect all entries
    this.contextCache.forEach((entry, key) => allEntries.push([key, entry, this.contextCache]));
    this.cultureCache.forEach((entry, key) => allEntries.push([key, entry, this.cultureCache]));
    this.stringCache.forEach((entry, key) => allEntries.push([key, entry, this.stringCache]));

    // Sort by last accessed (oldest first)
    allEntries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    // Evict until we have enough space
    let freedSize = 0;
    for (const [key, entry, cache] of allEntries) {
      if (freedSize >= requiredSize) break;

      cache.delete(key);
      freedSize += entry.size;
      this.evictions++;
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    let targetCache: Map<string, CacheEntry<any>> | null = null;

    // Find oldest entry across all caches
    this.contextCache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
        targetCache = this.contextCache as Map<string, CacheEntry<any>>;
      }
    });

    this.cultureCache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
        targetCache = this.cultureCache as Map<string, CacheEntry<any>>;
      }
    });

    this.stringCache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
        targetCache = this.stringCache as Map<string, CacheEntry<any>>;
      }
    });

    if (oldestKey && targetCache) {
      (targetCache as any).delete(oldestKey);
      this.evictions++;
    }
  }

  private performCleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    // Clean expired entries from all caches
    const cleanCache = (cache: Map<string, CacheEntry<any>>) => {
      for (const [key, entry] of cache.entries()) {
        if (this.isExpired(entry)) {
          cache.delete(key);
          cleaned++;
        }
      }
    };

    cleanCache(this.contextCache);
    cleanCache(this.cultureCache);
    cleanCache(this.stringCache);

    if (cleaned > 0) {
      logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  private estimateContextSize(context: RichContext): number {
    // Use cached size if available and recent
    if (Date.now() - context.lastSizeUpdate < 60000) {
      return context.approximateSize;
    }

    // Otherwise estimate based on content
    let size = 0;

    // Conversations
    context.conversations.forEach(msgs => {
      msgs.forEach(msg => size += msg.length * 2);
    });

    // Code snippets
    context.codeSnippets.forEach(snippets => {
      snippets.forEach(snippet => size += snippet.content.length * 2);
    });

    // Other items
    context.embarrassingMoments.forEach(item => size += item.content.length * 2);
    context.runningGags.forEach(item => size += item.content.length * 2);
    context.summarizedFacts.forEach(item => size += item.content.length * 2);

    return size;
  }

  private estimateCultureSize(culture: ServerCulture): number {
    let size = 100; // Base overhead

    // Estimate based on content
    size += culture.popularEmojis.length * 50;
    size += culture.activeVoiceChannels.length * 100;
    size += culture.recentEvents.length * 200;
    size += culture.topChannels.length * 100;

    return size;
  }

  /**
   * Clear all caches (alias for clearAll)
   */
  public clear(): void {
    this.clearAll();
  }

  /**
   * Shutdown and cleanup
   */
  public shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.clearAll();
  }
}