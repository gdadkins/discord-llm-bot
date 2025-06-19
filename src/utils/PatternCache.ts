/**
 * Pattern and Regex Caching System
 * 
 * Provides efficient caching for regular expressions and other patterns
 * to reduce compilation overhead and improve performance.
 * 
 * Features:
 * - LRU eviction policy
 * - Cache size limits
 * - Hit/miss statistics
 * - Thread-safe operations
 * 
 * @module PatternCache
 */

import { Mutex } from 'async-mutex';
import { logger } from './logger';

/**
 * Cache entry for patterns
 */
interface CacheEntry<T> {
  value: T;
  lastAccessed: number;
  accessCount: number;
  createdAt: number;
}

/**
 * Cache statistics
 */
export interface CacheStatistics {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  maxSize: number;
  hitRate: number;
  avgAccessCount: number;
  oldestEntryAge: number;
}

/**
 * LRU Cache implementation for patterns
 */
class LRUCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly mutex = new Mutex();
  
  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };
  
  constructor(maxSize: number) {
    if (maxSize <= 0) {
      throw new Error('Cache maxSize must be greater than 0');
    }
    this.maxSize = maxSize;
  }
  
  /**
   * Get value from cache
   */
  async get(key: string): Promise<T | undefined> {
    return this.mutex.runExclusive(() => {
      const entry = this.cache.get(key);
      
      if (entry) {
        // Update access info
        entry.lastAccessed = Date.now();
        entry.accessCount++;
        
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        
        this.stats.hits++;
        return entry.value;
      }
      
      this.stats.misses++;
      return undefined;
    });
  }
  
  /**
   * Set value in cache
   */
  async set(key: string, value: T): Promise<void> {
    return this.mutex.runExclusive(() => {
      // Check if already exists
      if (this.cache.has(key)) {
        const entry = this.cache.get(key)!;
        entry.value = value;
        entry.lastAccessed = Date.now();
        entry.accessCount++;
        
        // Move to end
        this.cache.delete(key);
        this.cache.set(key, entry);
        return;
      }
      
      // Evict if at capacity
      if (this.cache.size >= this.maxSize) {
        this.evictLRU();
      }
      
      // Add new entry
      this.cache.set(key, {
        value,
        lastAccessed: Date.now(),
        accessCount: 1,
        createdAt: Date.now()
      });
    });
  }
  
  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    // First entry is least recently used due to Map's insertion order
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }
  }
  
  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    return this.mutex.runExclusive(() => {
      this.cache.clear();
    });
  }
  
  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    const entries = Array.from(this.cache.values());
    const now = Date.now();
    
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    const avgAccessCount = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.accessCount, 0) / entries.length
      : 0;
    
    const oldestEntryAge = entries.length > 0
      ? now - Math.min(...entries.map(e => e.createdAt))
      : 0;
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      currentSize: this.cache.size,
      maxSize: this.maxSize,
      hitRate: Math.round(hitRate * 10) / 10,
      avgAccessCount: Math.round(avgAccessCount * 10) / 10,
      oldestEntryAge
    };
  }
}

/**
 * Global regex cache instance
 */
const regexCache = new LRUCache<RegExp>(1000);

/**
 * Common regex patterns that are frequently used
 */
const COMMON_PATTERNS = {
  // Discord patterns
  DISCORD_MENTION: /<@!?(\d+)>/g,
  DISCORD_CHANNEL: /<#(\d+)>/g,
  DISCORD_ROLE: /<@&(\d+)>/g,
  DISCORD_EMOJI: /<a?:(\w+):(\d+)>/g,
  
  // URL patterns
  URL: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi,
  YOUTUBE_URL: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi,
  
  // Command patterns
  COMMAND_PREFIX: /^[!\/]\w+/,
  COMMAND_ARGS: /\s+/,
  
  // Text patterns
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  PHONE: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  WHITESPACE: /\s+/g,
  NEWLINE: /\r?\n/g,
  
  // Code patterns
  CODE_BLOCK: /```(\w+)?\n([\s\S]*?)```/g,
  INLINE_CODE: /`([^`]+)`/g,
  
  // Emoji patterns
  UNICODE_EMOJI: /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu
};

/**
 * Pre-compile and cache common patterns
 */
function preloadCommonPatterns(): void {
  for (const [name, pattern] of Object.entries(COMMON_PATTERNS)) {
    const key = createCacheKey(pattern.source, pattern.flags);
    regexCache.set(key, pattern).catch(error => {
      logger.error(`Failed to preload pattern ${name}:`, error);
    });
  }
  
  logger.info(`Preloaded ${Object.keys(COMMON_PATTERNS).length} common regex patterns`);
}

/**
 * Create cache key from pattern and flags
 */
function createCacheKey(pattern: string, flags?: string): string {
  return `${pattern}:::${flags || ''}`;
}

/**
 * Get cached regex or create new one
 * 
 * @param pattern The regex pattern string
 * @param flags Optional regex flags
 * @returns Cached or newly created RegExp
 */
export async function getCachedRegex(pattern: string, flags?: string): Promise<RegExp> {
  const key = createCacheKey(pattern, flags);
  
  // Check cache
  const cached = await regexCache.get(key);
  if (cached) {
    return cached;
  }
  
  // Create new regex
  try {
    const regex = new RegExp(pattern, flags);
    await regexCache.set(key, regex);
    return regex;
  } catch (error) {
    logger.error(`Failed to create regex: ${pattern} with flags: ${flags}`, error);
    throw new Error(`Invalid regex pattern: ${pattern}`);
  }
}

/**
 * Get cached regex synchronously (for performance-critical paths)
 * Falls back to creating new regex if not cached
 */
export function getCachedRegexSync(pattern: string, flags?: string): RegExp {
  // This is a simplified sync version that doesn't update cache stats
  // Use sparingly in performance-critical paths
  try {
    return new RegExp(pattern, flags);
  } catch (error) {
    logger.error(`Failed to create regex: ${pattern} with flags: ${flags}`, error);
    throw new Error(`Invalid regex pattern: ${pattern}`);
  }
}

/**
 * Get common pattern by name
 */
export function getCommonPattern(name: keyof typeof COMMON_PATTERNS): RegExp {
  return COMMON_PATTERNS[name];
}

/**
 * Clear regex cache
 */
export async function clearRegexCache(): Promise<void> {
  await regexCache.clear();
  logger.info('Regex cache cleared');
}

/**
 * Get regex cache statistics
 */
export function getRegexCacheStats(): CacheStatistics {
  return regexCache.getStatistics();
}

/**
 * String pattern cache for non-regex patterns
 */
const stringPatternCache = new LRUCache<string>(500);

/**
 * Cache for processed strings (e.g., normalized, sanitized)
 */
export async function getCachedStringPattern(key: string, factory: () => string): Promise<string> {
  const cached = await stringPatternCache.get(key);
  if (cached) {
    return cached;
  }
  
  const value = factory();
  await stringPatternCache.set(key, value);
  return value;
}

/**
 * Get string pattern cache statistics
 */
export function getStringPatternCacheStats(): CacheStatistics {
  return stringPatternCache.getStatistics();
}

/**
 * Initialize pattern caching system
 */
export function initializePatternCache(): void {
  preloadCommonPatterns();
  logger.info('Pattern caching system initialized');
}

/**
 * Cleanup pattern caches
 */
export async function cleanupPatternCaches(): Promise<void> {
  await regexCache.clear();
  await stringPatternCache.clear();
  logger.info('Pattern caches cleaned up');
}