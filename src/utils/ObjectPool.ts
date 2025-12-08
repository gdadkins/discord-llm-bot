/**
 * Generic Object Pool Implementation
 * 
 * Provides efficient object reuse to reduce memory allocation overhead.
 * Features:
 * - Generic type support
 * - Configurable pool size limits
 * - Automatic pool growth and shrinking
 * - Usage statistics tracking
 * - Thread-safe operations with mutex
 * 
 * @module ObjectPool
 */

import { Mutex } from 'async-mutex';
import { logger } from './logger';

/**
 * Pool statistics for monitoring
 */
export interface PoolStatistics {
  totalCreated: number;
  totalAcquired: number;
  totalReleased: number;
  totalDestroyed: number;
  currentSize: number;
  availableCount: number;
  inUseCount: number;
  hitRate: number;
  missRate: number;
  peakSize: number;
  lastShrinkTime: number;
}

/**
 * Configuration options for object pool
 */
export interface PoolOptions<T> {
  /**
   * Maximum number of objects to keep in pool
   */
  maxSize: number;
  
  /**
   * Minimum number of objects to maintain
   */
  minSize?: number;
  
  /**
   * Function to create new objects
   */
  factory: () => T;
  
  /**
   * Function to reset object state before reuse
   */
  reset?: (obj: T) => void;
  
  /**
   * Function to validate if object is still usable
   */
  validate?: (obj: T) => boolean;
  
  /**
   * Function to destroy object when removing from pool
   */
  destroy?: (obj: T) => void;
  
  /**
   * Time in ms before shrinking pool (default: 5 minutes)
   */
  shrinkInterval?: number;
  
  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Generic object pool for efficient resource management
 */
export class ObjectPool<T> {
  private readonly options: Required<PoolOptions<T>>;
  private readonly pool: T[] = [];
  private readonly inUse = new Set<T>();
  private readonly mutex = new Mutex();
  
  // Statistics
  private stats = {
    totalCreated: 0,
    totalAcquired: 0,
    totalReleased: 0,
    totalDestroyed: 0,
    peakSize: 0,
    lastShrinkTime: Date.now()
  };
  
  // Shrink timer
  private shrinkTimer?: NodeJS.Timeout;
  
  constructor(options: PoolOptions<T>) {
    this.options = {
      minSize: 0,
      reset: () => {},
      validate: () => true,
      destroy: () => {},
      shrinkInterval: 5 * 60 * 1000, // 5 minutes
      debug: false,
      ...options
    };
    
    // Validate options
    if (this.options.maxSize <= 0) {
      throw new Error('maxSize must be greater than 0');
    }
    
    if (this.options.minSize < 0) {
      throw new Error('minSize must be non-negative');
    }
    
    if (this.options.minSize > this.options.maxSize) {
      throw new Error('minSize cannot be greater than maxSize');
    }
    
    // Pre-populate pool to minSize
    this.prePopulate();
    
    // Start shrink timer if configured
    if (this.options.shrinkInterval > 0) {
      this.startShrinkTimer();
    }
  }
  
  /**
   * Pre-populate pool to minimum size
   */
  private prePopulate(): void {
    for (let i = 0; i < this.options.minSize; i++) {
      const obj = this.options.factory();
      this.pool.push(obj);
      this.stats.totalCreated++;
    }
    
    if (this.options.debug && this.options.minSize > 0) {
      logger.debug(`ObjectPool pre-populated with ${this.options.minSize} objects`);
    }
  }
  
  /**
   * Start periodic pool shrinking
   */
  private startShrinkTimer(): void {
    this.shrinkTimer = setInterval(() => {
      this.shrink().catch(error => {
        logger.error('Error during pool shrink:', error);
      });
    }, this.options.shrinkInterval);
  }
  
  /**
   * Acquire an object from the pool
   */
  async acquire(): Promise<T> {
    return this.mutex.runExclusive(() => {
      this.stats.totalAcquired++;
      
      // Try to get from pool
      while (this.pool.length > 0) {
        const obj = this.pool.pop()!;
        
        // Validate object is still usable
        if (this.options.validate(obj)) {
          this.inUse.add(obj);
          
          if (this.options.debug) {
            logger.debug(`Object acquired from pool. Pool size: ${this.pool.length}`);
          }
          
          return obj;
        } else {
          // Object failed validation, destroy it
          this.options.destroy(obj);
          this.stats.totalDestroyed++;
        }
      }
      
      // Pool is empty or all objects failed validation
      if (this.getCurrentSize() < this.options.maxSize) {
        // Create new object
        const obj = this.options.factory();
        this.inUse.add(obj);
        this.stats.totalCreated++;
        
        // Update peak size
        const currentSize = this.getCurrentSize();
        if (currentSize > this.stats.peakSize) {
          this.stats.peakSize = currentSize;
        }
        
        if (this.options.debug) {
          logger.debug(`Created new object. Total size: ${currentSize}`);
        }
        
        return obj;
      } else {
        // Pool is at max capacity
        throw new Error(`ObjectPool at maximum capacity (${this.options.maxSize})`);
      }
    });
  }
  
  /**
   * Release an object back to the pool
   */
  async release(obj: T): Promise<void> {
    return this.mutex.runExclusive(() => {
      if (!this.inUse.has(obj)) {
        logger.warn('Attempted to release object not acquired from this pool');
        return;
      }
      
      this.inUse.delete(obj);
      this.stats.totalReleased++;
      
      // Validate object before returning to pool
      if (this.options.validate(obj)) {
        // Reset object state
        this.options.reset(obj);
        
        // Return to pool if not at max
        if (this.pool.length < this.options.maxSize) {
          this.pool.push(obj);
          
          if (this.options.debug) {
            logger.debug(`Object released to pool. Pool size: ${this.pool.length}`);
          }
        } else {
          // Pool is full, destroy object
          this.options.destroy(obj);
          this.stats.totalDestroyed++;
        }
      } else {
        // Object failed validation, destroy it
        this.options.destroy(obj);
        this.stats.totalDestroyed++;
      }
    });
  }
  
  /**
   * Shrink pool by removing excess objects
   */
  async shrink(): Promise<void> {
    return this.mutex.runExclusive(() => {
      const excessCount = this.pool.length - this.options.minSize;
      
      if (excessCount <= 0) {
        return;
      }
      
      // Remove up to half of excess objects
      const removeCount = Math.ceil(excessCount / 2);
      let removed = 0;
      
      for (let i = 0; i < removeCount && this.pool.length > this.options.minSize; i++) {
        const obj = this.pool.pop()!;
        this.options.destroy(obj);
        this.stats.totalDestroyed++;
        removed++;
      }
      
      this.stats.lastShrinkTime = Date.now();
      
      if (removed > 0 && this.options.debug) {
        logger.debug(`Pool shrunk by ${removed} objects. New size: ${this.pool.length}`);
      }
    });
  }
  
  /**
   * Clear all objects from the pool
   */
  async clear(): Promise<void> {
    return this.mutex.runExclusive(() => {
      // Destroy pooled objects
      while (this.pool.length > 0) {
        const obj = this.pool.pop()!;
        this.options.destroy(obj);
        this.stats.totalDestroyed++;
      }
      
      // Note: We don't destroy in-use objects as they might still be needed
      
      logger.info(`ObjectPool cleared. ${this.inUse.size} objects still in use`);
    });
  }
  
  /**
   * Destroy the pool and clean up resources
   */
  async destroy(): Promise<void> {
    // Stop shrink timer
    if (this.shrinkTimer) {
      clearInterval(this.shrinkTimer);
      this.shrinkTimer = undefined;
    }
    
    // Clear pool
    await this.clear();
    
    // Wait for all in-use objects to be released
    if (this.inUse.size > 0) {
      logger.warn(`ObjectPool destroyed with ${this.inUse.size} objects still in use`);
    }
  }
  
  /**
   * Get current pool size (available + in use)
   */
  getCurrentSize(): number {
    return this.pool.length + this.inUse.size;
  }
  
  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics {
    const totalRequests = this.stats.totalAcquired;
    const hits = this.stats.totalAcquired - this.stats.totalCreated;
    const hitRate = totalRequests > 0 ? (hits / totalRequests) * 100 : 0;
    const missRate = totalRequests > 0 ? ((this.stats.totalCreated / totalRequests) * 100) : 0;
    
    return {
      totalCreated: this.stats.totalCreated,
      totalAcquired: this.stats.totalAcquired,
      totalReleased: this.stats.totalReleased,
      totalDestroyed: this.stats.totalDestroyed,
      currentSize: this.getCurrentSize(),
      availableCount: this.pool.length,
      inUseCount: this.inUse.size,
      hitRate: Math.round(hitRate * 10) / 10,
      missRate: Math.round(missRate * 10) / 10,
      peakSize: this.stats.peakSize,
      lastShrinkTime: this.stats.lastShrinkTime
    };
  }
}

/**
 * Context object pool for conversation contexts
 */
export interface ContextObject {
  userId: string;
  serverId?: string;
  channelId?: string;
  messages: Array<{ role: string; content: string }>;
  metadata: Record<string, unknown>;
  createdAt: number;
  lastUsed: number;
}

/**
 * Create a context object pool with specific configuration
 */
export function createContextObjectPool(maxSize: number = 50): ObjectPool<ContextObject> {
  return new ObjectPool<ContextObject>({
    maxSize,
    minSize: 5,
    factory: () => ({
      userId: '',
      serverId: undefined,
      channelId: undefined,
      messages: [],
      metadata: {},
      createdAt: Date.now(),
      lastUsed: Date.now()
    }),
    reset: (obj) => {
      obj.userId = '';
      obj.serverId = undefined;
      obj.channelId = undefined;
      obj.messages = [];
      obj.metadata = {};
      obj.lastUsed = Date.now();
    },
    validate: (obj) => {
      // Validate object is still in good state
      return obj.messages !== null && 
             typeof obj.userId === 'string' &&
             Array.isArray(obj.messages);
    },
    destroy: (obj) => {
      // Clear references for GC
      obj.messages = null as any;
      obj.metadata = null as any;
    },
    debug: process.env.NODE_ENV === 'development'
  });
}