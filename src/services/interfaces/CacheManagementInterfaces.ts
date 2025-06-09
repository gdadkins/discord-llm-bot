/**
 * Cache Management Service Interface Definitions
 * 
 * Interfaces for caching operations, statistics, and performance monitoring.
 */

import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Cache Management Service Interfaces
// ============================================================================

export interface ICacheManager extends IService {
  /**
   * Cache operations
   */
  get(prompt: string, userId: string, serverId?: string): Promise<string | null>;
  set(prompt: string, userId: string, response: string, serverId?: string): Promise<void>;
  shouldBypassCache(prompt: string): boolean;
  clearCache(): void;
  clearUserCache(userId: string): void;
  clearServerCache(serverId: string): void;
  
  /**
   * Cache statistics
   */
  getStats(): CacheStats;
  getCachePerformance(): CachePerformance;
}

export interface CacheStats {
  cacheSize: number;
  hitRate: number;
  memoryUsage: number;
  totalHits: number;
  totalMisses: number;
  evictions: number;
}

export interface CachePerformance {
  averageSaveTime: number;
  averageLoadTime: number;
  compressionRatio: number;
  reduction: number;
  avgLookupTime: number;
}