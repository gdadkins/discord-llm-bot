/**
 * Mutex Manager Utility
 * 
 * Provides standardized async mutex patterns with timeout support,
 * deadlock detection, and operation monitoring.
 */

import { Mutex } from 'async-mutex';
import { logger } from './logger';

export interface MutexOptions {
  timeout?: number;
  name?: string;
  enableDeadlockDetection?: boolean;
  enableStatistics?: boolean;
}

export interface MutexStatistics {
  totalAcquisitions: number;
  totalReleases: number;
  averageHoldTime: number;
  maxHoldTime: number;
  timeouts: number;
  currentlyHeld: number;
}

export interface MutexOperation {
  name: string;
  startTime: number;
  timeout?: number;
}

/**
 * Enhanced mutex manager with monitoring and safety features
 */
export class MutexManager {
  private mutex: Mutex;
  private name: string;
  private statistics: MutexStatistics;
  private currentOperations: Map<string, MutexOperation> = new Map();
  private enableDeadlockDetection: boolean;
  private enableStatistics: boolean;
  private deadlockCheckInterval?: NodeJS.Timeout;

  constructor(options: MutexOptions = {}) {
    this.mutex = new Mutex();
    this.name = options.name || 'MutexManager';
    this.enableDeadlockDetection = options.enableDeadlockDetection ?? true;
    this.enableStatistics = options.enableStatistics ?? true;
    
    this.statistics = {
      totalAcquisitions: 0,
      totalReleases: 0,
      averageHoldTime: 0,
      maxHoldTime: 0,
      timeouts: 0,
      currentlyHeld: 0
    };

    if (this.enableDeadlockDetection) {
      this.startDeadlockDetection();
    }
  }

  /**
   * Execute operation with automatic mutex handling
   */
  async withMutex<T>(
    operation: () => Promise<T> | T,
    options: { timeout?: number; operationName?: string } = {}
  ): Promise<T> {
    const operationName = options.operationName || `operation-${Date.now()}`;
    const timeout = options.timeout || 30000; // 30 second default timeout
    
    let timeoutId: NodeJS.Timeout | undefined;
    let isTimedOut = false;
    
    const startTime = Date.now();
    
    if (this.enableStatistics) {
      this.statistics.totalAcquisitions++;
      this.statistics.currentlyHeld++;
    }

    if (this.enableDeadlockDetection) {
      this.currentOperations.set(operationName, {
        name: operationName,
        startTime,
        timeout
      });
    }

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          isTimedOut = true;
          reject(new MutexTimeoutError(`Mutex operation '${operationName}' timed out after ${timeout}ms`, this.name));
        }, timeout);
      });

      // Acquire mutex with timeout race
      const acquirePromise = this.mutex.acquire();
      const release = await Promise.race([acquirePromise, timeoutPromise]);
      
      if (isTimedOut) {
        throw new MutexTimeoutError(`Mutex operation '${operationName}' timed out during acquisition`, this.name);
      }

      // Clear timeout since we acquired successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      try {
        // Execute the operation
        const result = await operation();
        return result;
      } finally {
        // Always release the mutex
        release();
        
        const holdTime = Date.now() - startTime;
        
        if (this.enableStatistics) {
          this.updateStatistics(holdTime);
        }
        
        if (this.enableDeadlockDetection) {
          this.currentOperations.delete(operationName);
        }
      }
    } catch (error) {
      if (error instanceof MutexTimeoutError) {
        if (this.enableStatistics) {
          this.statistics.timeouts++;
        }
        logger.warn(`Mutex timeout in ${this.name}: ${error.message}`);
      }
      
      // Clean up on error
      if (this.enableDeadlockDetection) {
        this.currentOperations.delete(operationName);
      }
      
      if (this.enableStatistics) {
        this.statistics.currentlyHeld = Math.max(0, this.statistics.currentlyHeld - 1);
      }
      
      throw error;
    }
  }

  /**
   * Execute operation with traditional acquire/release pattern
   */
  async acquire(options: { timeout?: number; operationName?: string } = {}): Promise<() => void> {
    const operationName = options.operationName || `acquire-${Date.now()}`;
    const timeout = options.timeout || 30000;
    
    let timeoutId: NodeJS.Timeout | undefined;
    let isTimedOut = false;
    
    const startTime = Date.now();
    
    if (this.enableStatistics) {
      this.statistics.totalAcquisitions++;
      this.statistics.currentlyHeld++;
    }

    if (this.enableDeadlockDetection) {
      this.currentOperations.set(operationName, {
        name: operationName,
        startTime,
        timeout
      });
    }

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          isTimedOut = true;
          reject(new MutexTimeoutError(`Mutex acquire '${operationName}' timed out after ${timeout}ms`, this.name));
        }, timeout);
      });

      // Acquire mutex with timeout race
      const acquirePromise = this.mutex.acquire();
      const release = await Promise.race([acquirePromise, timeoutPromise]);
      
      if (isTimedOut) {
        throw new MutexTimeoutError(`Mutex acquire '${operationName}' timed out`, this.name);
      }

      // Clear timeout since we acquired successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Return enhanced release function
      return () => {
        const holdTime = Date.now() - startTime;
        
        if (this.enableStatistics) {
          this.updateStatistics(holdTime);
        }
        
        if (this.enableDeadlockDetection) {
          this.currentOperations.delete(operationName);
        }
        
        release();
      };
    } catch (error) {
      if (error instanceof MutexTimeoutError) {
        if (this.enableStatistics) {
          this.statistics.timeouts++;
        }
        logger.warn(`Mutex timeout in ${this.name}: ${error.message}`);
      }
      
      // Clean up on error
      if (this.enableDeadlockDetection) {
        this.currentOperations.delete(operationName);
      }
      
      if (this.enableStatistics) {
        this.statistics.currentlyHeld = Math.max(0, this.statistics.currentlyHeld - 1);
      }
      
      throw error;
    }
  }

  /**
   * Get current mutex statistics
   */
  getStatistics(): MutexStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statistics = {
      totalAcquisitions: 0,
      totalReleases: 0,
      averageHoldTime: 0,
      maxHoldTime: 0,
      timeouts: 0,
      currentlyHeld: 0
    };
  }

  /**
   * Get currently running operations (for debugging)
   */
  getCurrentOperations(): MutexOperation[] {
    return Array.from(this.currentOperations.values());
  }

  /**
   * Check if mutex is currently locked
   */
  isLocked(): boolean {
    return this.mutex.isLocked();
  }

  /**
   * Get number of pending operations
   */
  getPendingCount(): number {
    // Note: async-mutex doesn't expose waitingCount, so we approximate with current operations
    return this.currentOperations.size;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.deadlockCheckInterval) {
      clearInterval(this.deadlockCheckInterval);
    }
    this.currentOperations.clear();
  }

  private updateStatistics(holdTime: number): void {
    this.statistics.totalReleases++;
    this.statistics.currentlyHeld = Math.max(0, this.statistics.currentlyHeld - 1);
    
    if (holdTime > this.statistics.maxHoldTime) {
      this.statistics.maxHoldTime = holdTime;
    }
    
    // Update average hold time
    const totalOperations = this.statistics.totalReleases;
    this.statistics.averageHoldTime = 
      (this.statistics.averageHoldTime * (totalOperations - 1) + holdTime) / totalOperations;
  }

  private startDeadlockDetection(): void {
    this.deadlockCheckInterval = setInterval(() => {
      const now = Date.now();
      const deadlockThreshold = 60000; // 1 minute
      
      for (const [operationName, operation] of this.currentOperations.entries()) {
        const holdTime = now - operation.startTime;
        
        if (holdTime > deadlockThreshold) {
          logger.warn(
            `Potential deadlock detected in ${this.name}: ` +
            `operation '${operationName}' has been running for ${holdTime}ms`
          );
        }
        
        // Check for timeout violations
        if (operation.timeout && holdTime > operation.timeout * 2) {
          logger.error(
            `Operation timeout violation in ${this.name}: ` +
            `operation '${operationName}' exceeded timeout by ${holdTime - operation.timeout}ms`
          );
        }
      }
    }, 30000); // Check every 30 seconds
  }
}

/**
 * Custom error for mutex timeouts
 */
export class MutexTimeoutError extends Error {
  constructor(message: string, public mutexName: string) {
    super(message);
    this.name = 'MutexTimeoutError';
  }
}

/**
 * Decorator for automatic mutex protection of methods
 */
export function withMutex<T extends Record<string, unknown>>(
  mutexPropertyName: keyof T,
  options: { timeout?: number; operationName?: string } = {}
) {
  return function (target: T, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (this: T, ...args: unknown[]) {
      const mutexManager = this[mutexPropertyName] as MutexManager;
      if (!mutexManager || !(mutexManager instanceof MutexManager)) {
        throw new Error(`Property ${String(mutexPropertyName)} must be a MutexManager instance`);
      }
      
      const operationName = options.operationName || `${propertyKey}`;
      return mutexManager.withMutex(
        () => originalMethod.apply(this, args),
        { ...options, operationName }
      );
    };
    
    return descriptor;
  };
}

/**
 * Factory function for creating named mutex managers
 */
export function createMutexManager(name: string, options: Omit<MutexOptions, 'name'> = {}): MutexManager {
  return new MutexManager({ ...options, name });
}