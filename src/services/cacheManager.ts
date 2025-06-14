import { Mutex } from 'async-mutex';
import { logger } from '../utils/logger';
import { CacheKeyGenerator } from '../utils/CacheKeyGenerator';
import { BaseService } from './base/BaseService';
import type { ICacheManager, CacheStats, CachePerformance } from './interfaces/CacheManagementInterfaces';

interface CacheEntry {
  response: string;
  timestamp: number;
  hits: number;
  userId: string;
  serverId?: string;
}

export class CacheManager extends BaseService implements ICacheManager {
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
  
  constructor() {
    super();
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

  protected getServiceName(): string {
    return 'CacheManager';
  }

  protected async performInitialization(): Promise<void> {
    // Start periodic cleanup every minute
    this.createInterval('cacheCleanup', () => {
      this.cleanupExpiredEntries();
    }, 60 * 1000);
    
    logger.info('CacheManager initialized with 5-minute TTL and LRU eviction');
  }

  protected async performShutdown(): Promise<void> {
    // BaseService automatically clears all timers
    this.cache.clear();
    this.accessOrder = [];
    logger.info('CacheManager shutdown complete');
  }

  private generateCacheKey(prompt: string, userId: string, serverId?: string): string {
    // Use standardized cache key generator for consistent hashing
    return CacheKeyGenerator.generateCacheKey(prompt, userId, serverId);
  }

  shouldBypassCache(prompt: string): boolean {
    // Check if the prompt contains bypass commands
    const lowerPrompt = prompt.toLowerCase();
    const commands = Array.from(this.CACHE_BYPASS_COMMANDS);
    for (const command of commands) {
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
        userId,
        serverId,
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
    const keysToRemove: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.TTL_MS) {
        keysToRemove.push(key);
      }
    });
    
    keysToRemove.forEach(key => {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      cleaned++;
    });
    
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    // Calculate approximate memory usage
    let memoryUsage = 0;
    this.cache.forEach(entry => {
      memoryUsage += entry.response.length * 2; // Rough estimate (2 bytes per char)
      memoryUsage += 100; // Overhead for metadata
    });
    
    return {
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: Math.round(hitRate * 1000) / 10, // Percentage with 1 decimal
      cacheSize: this.cache.size,
      memoryUsage,
    };
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      cache: this.getStats()
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.accessOrder = [];
    logger.info('Cache cleared');
  }

  clearUserCache(userId: string): void {
    let cleared = 0;
    const keysToRemove: string[] = [];
    
    // Find all cache entries that belong to this user
    this.cache.forEach((entry, key) => {
      if (entry.userId === userId) {
        keysToRemove.push(key);
      }
    });
    
    // Remove found keys
    keysToRemove.forEach(key => {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      cleared++;
    });
    
    logger.info(`Cleared ${cleared} cache entries for user ${userId}`);
  }

  clearServerCache(serverId: string): void {
    let cleared = 0;
    const keysToRemove: string[] = [];
    
    // Find all cache entries that belong to this server
    this.cache.forEach((entry, key) => {
      if (entry.serverId === serverId) {
        keysToRemove.push(key);
      }
    });
    
    // Remove found keys
    keysToRemove.forEach(key => {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      cleared++;
    });
    
    logger.info(`Cleared ${cleared} cache entries for server ${serverId}`);
  }

  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();
    const stats = this.getStats();
    
    // Check for potential issues
    if (stats.memoryUsage > 50 * 1024 * 1024) { // 50MB threshold
      errors.push('High memory usage detected');
    }
    
    if (stats.cacheSize >= this.MAX_CACHE_SIZE * 0.9) {
      errors.push('Cache approaching maximum capacity');
    }
    
    return errors;
  }

  protected getServiceSpecificMetrics(): Record<string, unknown> {
    const stats = this.getStats();
    
    return {
      cacheSize: stats.cacheSize,
      hitRate: stats.hitRate,
      memoryUsage: stats.memoryUsage,
      totalHits: stats.totalHits,
      totalMisses: stats.totalMisses,
      maxCacheSize: this.MAX_CACHE_SIZE,
      ttlMs: this.TTL_MS,
      uptime: Date.now() - this.stats.startTime
    };
  }

  // Method to get cache performance improvement estimate
  getCachePerformance(): CachePerformance {
    const totalRequests = this.stats.hits + this.stats.misses;
    const reduction = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    // Cache lookups are sub-millisecond, saves are similar
    const avgLookupTime = 0.1; // milliseconds
    const avgSaveTime = 0.2; // milliseconds
    
    // Calculate compression ratio (we don't compress, so ratio is 1.0)
    const compressionRatio = 1.0;
    
    return {
      reduction: Math.round(reduction * 10) / 10, // Percentage with 1 decimal
      avgLookupTime,
      averageSaveTime: avgSaveTime,
      averageLoadTime: avgLookupTime,
      compressionRatio,
    };
  }
}