import { createHash } from 'crypto';
import { Mutex } from 'async-mutex';
import { logger } from '../utils/logger';

interface CacheEntry {
  response: string;
  timestamp: number;
  hits: number;
}

interface CacheStats {
  totalHits: number;
  totalMisses: number;
  totalEvictions: number;
  hitRate: number;
  cacheSize: number;
  memoryUsage: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[]; // For LRU tracking
  private mutex: Mutex;
  private readonly MAX_CACHE_SIZE = 100; // Maximum number of entries
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly CACHE_BYPASS_COMMANDS = new Set([
    '/clear',
    '/execute',
    '/status', // Status should always be fresh
  ]);
  
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    startTime: number;
  };
  
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cache = new Map();
    this.accessOrder = [];
    this.mutex = new Mutex();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      startTime: Date.now(),
    };
  }

  async initialize(): Promise<void> {
    // Start periodic cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60 * 1000);
    
    logger.info('CacheManager initialized with 5-minute TTL and LRU eviction');
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    this.accessOrder = [];
    logger.info('CacheManager shutdown complete');
  }

  private generateCacheKey(prompt: string, userId: string, serverId?: string): string {
    // Create a unique hash based on prompt, user, and server
    const input = `${prompt}:${userId}:${serverId || 'dm'}`;
    return createHash('sha256').update(input).digest('hex');
  }

  shouldBypassCache(prompt: string): boolean {
    // Check if the prompt contains bypass commands
    const lowerPrompt = prompt.toLowerCase();
    for (const command of this.CACHE_BYPASS_COMMANDS) {
      if (lowerPrompt.includes(command)) {
        return true;
      }
    }
    return false;
  }

  async get(prompt: string, userId: string, serverId?: string): Promise<string | null> {
    return this.mutex.runExclusive(async () => {
      const key = this.generateCacheKey(prompt, userId, serverId);
      const entry = this.cache.get(key);
      
      if (!entry) {
        this.stats.misses++;
        return null;
      }
      
      // Check if entry is expired
      if (Date.now() - entry.timestamp > this.TTL_MS) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        this.stats.misses++;
        return null;
      }
      
      // Update access order for LRU
      this.updateAccessOrder(key);
      entry.hits++;
      this.stats.hits++;
      
      logger.debug(`Cache hit for key ${key.substring(0, 8)}... (${entry.hits} hits)`);
      return entry.response;
    });
  }

  async set(
    prompt: string,
    userId: string,
    response: string,
    serverId?: string
  ): Promise<void> {
    return this.mutex.runExclusive(async () => {
      const key = this.generateCacheKey(prompt, userId, serverId);
      
      // Evict if cache is full
      if (this.cache.size >= this.MAX_CACHE_SIZE && !this.cache.has(key)) {
        this.evictLRU();
      }
      
      this.cache.set(key, {
        response,
        timestamp: Date.now(),
        hits: 0,
      });
      
      this.updateAccessOrder(key);
      logger.debug(`Cached response for key ${key.substring(0, 8)}...`);
    });
  }

  private updateAccessOrder(key: string): void {
    // Remove from current position
    this.removeFromAccessOrder(key);
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    // Get least recently used key
    const lruKey = this.accessOrder.shift();
    if (lruKey && this.cache.has(lruKey)) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
      logger.debug(`Evicted LRU entry: ${lruKey.substring(0, 8)}...`);
    }
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL_MS) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    // Calculate approximate memory usage
    let memoryUsage = 0;
    for (const entry of this.cache.values()) {
      memoryUsage += entry.response.length * 2; // Rough estimate (2 bytes per char)
      memoryUsage += 100; // Overhead for metadata
    }
    
    return {
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      totalEvictions: this.stats.evictions,
      hitRate: Math.round(hitRate * 1000) / 10, // Percentage with 1 decimal
      cacheSize: this.cache.size,
      memoryUsage,
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.accessOrder = [];
    logger.info('Cache cleared');
  }

  // Method to get cache performance improvement estimate
  getCachePerformance(): { reduction: number; avgLookupTime: number } {
    const totalRequests = this.stats.hits + this.stats.misses;
    const reduction = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    // Cache lookups are sub-millisecond
    const avgLookupTime = 0.1; // milliseconds
    
    return {
      reduction: Math.round(reduction * 10) / 10, // Percentage with 1 decimal
      avgLookupTime,
    };
  }
}