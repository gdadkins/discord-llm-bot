/**
 * RequestCoalescer - Deduplicates simultaneous requests for the same data
 * 
 * This class prevents duplicate API calls or expensive operations by coalescing
 * multiple simultaneous requests for the same resource into a single operation.
 * 
 * Features:
 * - Configurable TTL for coalescing window
 * - Key-based request identification
 * - Automatic cleanup of expired entries
 * - Error propagation to all waiters
 * - Performance metrics tracking
 */

import { logger } from './logger';

export interface CoalescerOptions {
  /**
   * Time-to-live for coalescing window in milliseconds
   * @default 100
   */
  ttl?: number;
  
  /**
   * Name for the coalescer (used in logging)
   * @default 'RequestCoalescer'
   */
  name?: string;
  
  /**
   * Maximum number of entries to keep in cache
   * @default 1000
   */
  maxEntries?: number;
  
  /**
   * Cleanup interval in milliseconds
   * @default 60000 (1 minute)
   */
  cleanupInterval?: number;
}

export interface CoalescerMetrics {
  totalRequests: number;
  coalescedRequests: number;
  uniqueRequests: number;
  cacheSize: number;
  hitRate: number;
}

interface PendingRequest<T> {
  promise: Promise<T>;
  resolvers: Array<(value: T) => void>;
  rejectors: Array<(error: unknown) => void>;
  createdAt: number;
  requestCount: number;
}

export class RequestCoalescer<TKey = string> {
  private readonly ttl: number;
  private readonly name: string;
  private readonly maxEntries: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly pending = new Map<TKey, PendingRequest<any>>();
  private cleanupTimer?: NodeJS.Timeout;
  
  // Metrics
  private totalRequests = 0;
  private coalescedRequests = 0;

  constructor(options: CoalescerOptions = {}) {
    this.ttl = options.ttl || 100;
    this.name = options.name || 'RequestCoalescer';
    this.maxEntries = options.maxEntries || 1000;
    
    // Start cleanup timer
    const cleanupInterval = options.cleanupInterval || 60000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
  }

  /**
   * Execute a request with coalescing
   * 
   * @param key - Unique identifier for the request
   * @param factory - Function that creates the promise for the request
   * @returns The result of the request
   */
  async execute<T>(key: TKey, factory: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    
    // Check if there's already a pending request for this key
    const existing = this.pending.get(key);
    if (existing && Date.now() - existing.createdAt < this.ttl) {
      this.coalescedRequests++;
      existing.requestCount++;
      
      logger.debug(`${this.name}: Coalescing request for key ${String(key)} (${existing.requestCount} waiters)`);
      
      // Add this caller to the waiting list
      return new Promise<T>((resolve, reject) => {
        existing.resolvers.push(resolve);
        existing.rejectors.push(reject);
      });
    }

    // No existing request or TTL expired, create new one
    logger.debug(`${this.name}: Creating new request for key ${String(key)}`);
    
    // Create arrays to track all waiters
    const resolvers: Array<(value: T) => void> = [];
    const rejectors: Array<(error: unknown) => void> = [];
    
    // Create the promise that will be shared
    const promise = new Promise<T>((resolve, reject) => {
      resolvers.push(resolve);
      rejectors.push(reject);
    });

    // Store the pending request
    const pendingRequest: PendingRequest<T> = {
      promise,
      resolvers,
      rejectors,
      createdAt: Date.now(),
      requestCount: 1
    };
    
    this.pending.set(key, pendingRequest);
    
    // Execute the actual request
    try {
      const result = await factory();
      
      // Resolve all waiters
      for (const resolve of pendingRequest.resolvers) {
        resolve(result);
      }
      
      // Keep in cache for TTL duration to catch any stragglers
      setTimeout(() => {
        if (this.pending.get(key) === pendingRequest) {
          this.pending.delete(key);
        }
      }, this.ttl);
      
      return result;
    } catch (error) {
      // Reject all waiters
      for (const reject of pendingRequest.rejectors) {
        reject(error);
      }
      
      // Remove from pending immediately on error
      this.pending.delete(key);
      
      throw error;
    }
  }

  /**
   * Execute with custom key generation
   */
  async executeWithKeyGen<T, TArgs extends unknown[]>(
    keyGenerator: (...args: TArgs) => TKey,
    factory: (...args: TArgs) => Promise<T>,
    ...args: TArgs
  ): Promise<T> {
    const key = keyGenerator(...args);
    return this.execute(key, () => factory(...args));
  }

  /**
   * Clear a specific key from the cache
   */
  clear(key: TKey): void {
    this.pending.delete(key);
  }

  /**
   * Clear all pending requests
   */
  clearAll(): void {
    this.pending.clear();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: TKey[] = [];
    
    for (const [key, request] of this.pending.entries()) {
      if (now - request.createdAt > this.ttl * 10) {
        // TTL * 10 for safety margin
        expired.push(key);
      }
    }
    
    for (const key of expired) {
      this.pending.delete(key);
    }
    
    if (expired.length > 0) {
      logger.debug(`${this.name}: Cleaned up ${expired.length} expired entries`);
    }
    
    // Enforce max entries limit
    if (this.pending.size > this.maxEntries) {
      const toRemove = this.pending.size - this.maxEntries;
      const entries = Array.from(this.pending.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt)
        .slice(0, toRemove);
      
      for (const [key] of entries) {
        this.pending.delete(key);
      }
      
      logger.warn(`${this.name}: Removed ${toRemove} entries due to size limit`);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): CoalescerMetrics {
    const uniqueRequests = this.totalRequests - this.coalescedRequests;
    const hitRate = this.totalRequests > 0 
      ? this.coalescedRequests / this.totalRequests 
      : 0;

    return {
      totalRequests: this.totalRequests,
      coalescedRequests: this.coalescedRequests,
      uniqueRequests,
      cacheSize: this.pending.size,
      hitRate
    };
  }

  /**
   * Shutdown the coalescer
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    // Reject all pending requests
    for (const [, request] of this.pending.entries()) {
      for (const reject of request.rejectors) {
        reject(new Error('Coalescer is shutting down'));
      }
    }
    
    this.pending.clear();
    logger.info(`${this.name}: Shutdown complete`);
  }

  /**
   * Create a coalesced version of an async function
   */
  static coalesced<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    keyGenerator: (...args: TArgs) => string,
    options: CoalescerOptions = {}
  ): (...args: TArgs) => Promise<TResult> {
    const coalescer = new RequestCoalescer<string>(options);
    
    return (...args: TArgs): Promise<TResult> => {
      const key = keyGenerator(...args);
      return coalescer.execute(key, () => fn(...args));
    };
  }
}

/**
 * Global coalescers for common operations
 */
export const globalCoalescers = {
  userContext: new RequestCoalescer<string>({ 
    ttl: 500, 
    name: 'UserContext',
    maxEntries: 500 
  }),
  serverContext: new RequestCoalescer<string>({ 
    ttl: 1000, 
    name: 'ServerContext',
    maxEntries: 200 
  }),
  geminiGeneration: new RequestCoalescer<string>({ 
    ttl: 2000, 
    name: 'GeminiGeneration',
    maxEntries: 100 
  })
};

/**
 * Shutdown all global coalescers
 */
export function shutdownAllCoalescers(): void {
  globalCoalescers.userContext.shutdown();
  globalCoalescers.serverContext.shutdown();
  globalCoalescers.geminiGeneration.shutdown();
}