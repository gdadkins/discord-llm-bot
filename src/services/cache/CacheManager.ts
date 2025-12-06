import { Mutex } from 'async-mutex';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { logger } from '../../utils/logger';
import { CacheKeyGenerator } from '../../utils/CacheKeyGenerator';
import { BaseService } from '../base/BaseService';
import type { ICacheManager, CacheStats, CachePerformance } from '../interfaces/CacheManagementInterfaces';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

interface CacheEntry {
  response: string | Buffer;
  timestamp: number;
  hits: number;
  userId: string;
  serverId?: string;
  compressed: boolean;
  originalSize?: number;
  compressedSize?: number;
  lastAccessed: number;
}

// Read-Write Lock implementation for concurrent access
class ReadWriteLock {
  private readers = 0;
  private writers = 0;
  private waitingWriters = 0;
  private readMutex = new Mutex();
  private writeMutex = new Mutex();
  
  async acquireRead(timeout = 5000): Promise<() => void> {
    const startTime = Date.now();
    const release = await this.readMutex.acquire();

    while (this.writers > 0 || this.waitingWriters > 0) {
      if (Date.now() - startTime > timeout) {
        release();
        throw new Error(`Read lock acquisition timeout after ${timeout}ms`);
      }
      release();
      await new Promise(resolve => setTimeout(resolve, 1));
      await this.readMutex.acquire();
    }
    this.readers++;
    return () => {
      this.readers--;
      release();
    };
  }
  
  async acquireWrite(timeout = 5000): Promise<() => void> {
    const startTime = Date.now();
    this.waitingWriters++;
    const release = await this.writeMutex.acquire();
    this.waitingWriters--;

    while (this.readers > 0 || this.writers > 0) {
      if (Date.now() - startTime > timeout) {
        release();
        throw new Error(`Write lock acquisition timeout after ${timeout}ms`);
      }
      release();
      await new Promise(resolve => setTimeout(resolve, 1));
      await this.writeMutex.acquire();
    }
    this.writers++;
    return () => {
      this.writers--;
      release();
    };
  }
}

export class CacheManager extends BaseService implements ICacheManager {
  private cache: Map<string, CacheEntry>;
  private lruMap: Map<string, number>; // Timestamp-based LRU with O(1) operations
  private rwLock: ReadWriteLock;
  private readonly MAX_CACHE_SIZE = 100; // Maximum number of entries
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly COMPRESSION_THRESHOLD = 1024; // Compress entries > 1KB
  private readonly CACHE_BYPASS_COMMANDS = new Set([
    '/clear',
    '/execute',
    '/status', // Status should always be fresh
  ]);
  
  // Common prompts for cache warming
  private readonly COMMON_PROMPTS = [
    'hello',
    'hi',
    'help',
    'what can you do',
    'how are you',
    'tell me a joke',
    'what is the weather',
  ];
  
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    startTime: number;
    compressionSavings: number;
    avgLookupTime: number[];
    avgSaveTime: number[];
  };
  
  constructor() {
    super();
    this.cache = new Map();
    this.lruMap = new Map();
    this.rwLock = new ReadWriteLock();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      startTime: Date.now(),
      compressionSavings: 0,
      avgLookupTime: [],
      avgSaveTime: [],
    };
  }

  protected getServiceName(): string {
    return 'CacheManager';
  }

  protected async performInitialization(): Promise<void> {
    // Start periodic cleanup every minute with coalescing
    this.createInterval('cacheCleanup', async () => {
      await this.cleanupExpiredEntries();
    }, 60 * 1000, { coalesce: true });
    
    // Warm cache with common prompts
    await this.warmCache();
    
    logger.info('CacheManager initialized with 5-minute TTL, LRU eviction, and compression');
  }

  protected async performShutdown(): Promise<void> {
    // BaseService automatically clears all timers
    this.cache.clear();
    this.lruMap.clear();
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

  private async compressResponse(response: string): Promise<{ compressed: Buffer; originalSize: number; compressedSize: number } | null> {
    try {
      const originalSize = Buffer.byteLength(response, 'utf8');
      if (originalSize < this.COMPRESSION_THRESHOLD) {
        return null;
      }
      
      const compressed = await gzipAsync(response);
      const compressedSize = compressed.length;
      
      // Only use compression if it saves at least 20%
      if (compressedSize < originalSize * 0.8) {
        this.stats.compressionSavings += originalSize - compressedSize;
        return { compressed, originalSize, compressedSize };
      }
      
      return null;
    } catch (error) {
      logger.error('Compression error:', error);
      return null;
    }
  }

  private async decompressResponse(buffer: Buffer): Promise<string> {
    try {
      const decompressed = await gunzipAsync(buffer);
      return decompressed.toString('utf8');
    } catch (error) {
      logger.error('Decompression error:', error);
      throw error;
    }
  }

  async get(prompt: string, userId: string, serverId?: string): Promise<string | null> {
    const startTime = Date.now();
    const releaseRead = await this.rwLock.acquireRead();
    
    try {
      const key = this.generateCacheKey(prompt, userId, serverId);
      const entry = this.cache.get(key);
      
      if (!entry) {
        this.stats.misses++;
        return null;
      }
      
      // Check if entry is expired
      if (Date.now() - entry.timestamp > this.TTL_MS) {
        // Need write lock to delete
        releaseRead();
        const releaseWrite = await this.rwLock.acquireWrite();
        try {
          this.cache.delete(key);
          this.lruMap.delete(key);
          this.stats.misses++;
          return null;
        } finally {
          releaseWrite();
        }
      }
      
      // Update access order for LRU (O(1) operation)
      entry.lastAccessed = Date.now();
      this.lruMap.set(key, entry.lastAccessed);
      entry.hits++;
      this.stats.hits++;
      
      // Track lookup time
      const lookupTime = Date.now() - startTime;
      this.stats.avgLookupTime.push(lookupTime);
      if (this.stats.avgLookupTime.length > 100) {
        this.stats.avgLookupTime.shift();
      }
      
      logger.debug(`Cache hit for key ${key.substring(0, 8)}... (${entry.hits} hits, ${lookupTime}ms)`);
      
      // Decompress if needed
      if (entry.compressed && Buffer.isBuffer(entry.response)) {
        return await this.decompressResponse(entry.response);
      }
      
      return entry.response as string;
    } finally {
      releaseRead();
    }
  }

  async set(
    prompt: string,
    userId: string,
    response: string,
    serverId?: string
  ): Promise<void> {
    const startTime = Date.now();
    const releaseWrite = await this.rwLock.acquireWrite();
    
    try {
      const key = this.generateCacheKey(prompt, userId, serverId);
      
      // Evict if cache is full
      if (this.cache.size >= this.MAX_CACHE_SIZE && !this.cache.has(key)) {
        await this.evictLRU();
      }
      
      // Compress response if it's large enough
      const compressionResult = await this.compressResponse(response);
      const now = Date.now();
      
      const entry: CacheEntry = {
        response: compressionResult ? compressionResult.compressed : response,
        timestamp: now,
        lastAccessed: now,
        hits: 0,
        userId,
        serverId,
        compressed: !!compressionResult,
        originalSize: compressionResult?.originalSize,
        compressedSize: compressionResult?.compressedSize,
      };
      
      this.cache.set(key, entry);
      this.lruMap.set(key, now);
      
      // Track save time
      const saveTime = Date.now() - startTime;
      this.stats.avgSaveTime.push(saveTime);
      if (this.stats.avgSaveTime.length > 100) {
        this.stats.avgSaveTime.shift();
      }
      
      logger.debug(`Cached response for key ${key.substring(0, 8)}... ${
        compressionResult ? `(compressed: ${compressionResult.originalSize} -> ${compressionResult.compressedSize} bytes)` : ''
      } (${saveTime}ms)`);
    } finally {
      releaseWrite();
    }
  }

  private async evictLRU(): Promise<void> {
    if (this.lruMap.size === 0) return;
    
    // Find least recently used key - O(n) but only on eviction
    let lruKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, lastAccessed] of this.lruMap) {
      if (lastAccessed < oldestTime) {
        oldestTime = lastAccessed;
        lruKey = key;
      }
    }
    
    if (lruKey && this.cache.has(lruKey)) {
      const entry = this.cache.get(lruKey);
      this.cache.delete(lruKey);
      this.lruMap.delete(lruKey);
      this.stats.evictions++;
      
      const savedBytes = entry?.compressed && entry.originalSize ? 
        entry.originalSize - entry.compressedSize! : 0;
      
      logger.debug(`Evicted LRU entry: ${lruKey.substring(0, 8)}... (saved ${savedBytes} bytes)`);
    }
  }

  private async warmCache(): Promise<void> {
    try {
      logger.info('Warming cache with common prompts...');
      
      for (const prompt of this.COMMON_PROMPTS) {
        // Generate default responses for common prompts
        const response = this.generateDefaultResponse(prompt);
        await this.set(prompt, 'system', response);
      }
      
      logger.info(`Cache warmed with ${this.COMMON_PROMPTS.length} common prompts`);
    } catch (error) {
      logger.error('Cache warming error:', error);
    }
  }

  private generateDefaultResponse(prompt: string): string {
    const responses: Record<string, string> = {
      'hello': 'Hello! How can I help you today?',
      'hi': 'Hi there! What can I do for you?',
      'help': 'I can help you with various tasks. Try asking me a question or use /help for a list of commands.',
      'what can you do': 'I can answer questions, provide information, help with coding, and much more! Feel free to ask me anything.',
      'how are you': 'I\'m doing great, thank you for asking! How can I assist you today?',
      'tell me a joke': 'Why don\'t scientists trust atoms? Because they make up everything!',
      'what is the weather': 'I don\'t have access to real-time weather data, but you can check your local weather service for current conditions.',
    };
    
    return responses[prompt.toLowerCase()] || 'I\'m here to help! What would you like to know?';
  }

  private async cleanupExpiredEntries(): Promise<void> {
    const releaseWrite = await this.rwLock.acquireWrite();
    
    try {
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
        this.lruMap.delete(key);
        cleaned++;
      });
      
      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} expired cache entries`);
      }
    } finally {
      releaseWrite();
    }
  }

  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    // Calculate actual memory usage with compression consideration
    let memoryUsage = 0;
    
    this.cache.forEach(entry => {
      if (entry.compressed && entry.compressedSize) {
        memoryUsage += entry.compressedSize;
      } else {
        const size = typeof entry.response === 'string' ? 
          Buffer.byteLength(entry.response, 'utf8') : 
          entry.response.length;
        memoryUsage += size;
      }
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

  async clearCache(): Promise<void> {
    const releaseWrite = await this.rwLock.acquireWrite();
    
    try {
      this.cache.clear();
      this.lruMap.clear();
      logger.info('Cache cleared');
    } finally {
      releaseWrite();
    }
  }

  async clearUserCache(userId: string): Promise<void> {
    const releaseWrite = await this.rwLock.acquireWrite();
    
    try {
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
        this.lruMap.delete(key);
        cleared++;
      });
      
      logger.info(`Cleared ${cleared} cache entries for user ${userId}`);
    } finally {
      releaseWrite();
    }
  }

  async clearServerCache(serverId: string): Promise<void> {
    const releaseWrite = await this.rwLock.acquireWrite();
    
    try {
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
        this.lruMap.delete(key);
        cleared++;
      });
      
      logger.info(`Cleared ${cleared} cache entries for server ${serverId}`);
    } finally {
      releaseWrite();
    }
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
    
    // Calculate average times from tracked metrics
    const avgLookupTime = this.stats.avgLookupTime.length > 0 ?
      this.stats.avgLookupTime.reduce((a, b) => a + b, 0) / this.stats.avgLookupTime.length :
      0.1;
    
    const avgSaveTime = this.stats.avgSaveTime.length > 0 ?
      this.stats.avgSaveTime.reduce((a, b) => a + b, 0) / this.stats.avgSaveTime.length :
      0.2;
    
    // Calculate compression ratio
    let totalOriginal = 0;
    let totalCompressed = 0;
    
    this.cache.forEach(entry => {
      if (entry.compressed && entry.originalSize && entry.compressedSize) {
        totalOriginal += entry.originalSize;
        totalCompressed += entry.compressedSize;
      } else {
        const size = typeof entry.response === 'string' ? 
          Buffer.byteLength(entry.response, 'utf8') : 
          entry.response.length;
        totalOriginal += size;
        totalCompressed += size;
      }
    });
    
    const compressionRatio = totalOriginal > 0 ? 
      Math.round((totalCompressed / totalOriginal) * 100) / 100 : 1.0;
    
    return {
      reduction: Math.round(reduction * 10) / 10, // Percentage with 1 decimal
      avgLookupTime: Math.round(avgLookupTime * 100) / 100, // Round to 2 decimals
      averageSaveTime: Math.round(avgSaveTime * 100) / 100,
      averageLoadTime: Math.round(avgLookupTime * 100) / 100,
      compressionRatio,
    };
  }
}