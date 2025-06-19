/**
 * TimeoutUtils - Comprehensive timeout protection utilities
 * 
 * Provides universal timeout protection with adaptive algorithms:
 * - Basic timeout promises and wrappers
 * - Adaptive timeout based on historical performance
 * - Cancellable timeout operations with AbortController
 * - Timeout-protected function decorators
 * - Database and network operation specific timeouts
 */

import { enrichError, ErrorCategory } from './ErrorHandlingUtils';
import { logger } from './logger';
import { AsyncFunction } from '../types';

export interface TimeoutOptions {
  message?: string;
  category?: ErrorCategory;
  context?: Record<string, unknown>;
}

/**
 * Creates a promise that rejects after specified timeout
 */
export function createTimeoutPromise(
  ms: number,
  options: TimeoutOptions = {}
): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(options.message || `Operation timed out after ${ms}ms`);
      reject(enrichError(error, {
        category: options.category || ErrorCategory.TIMEOUT,
        timeout: ms,
        ...options.context
      }));
    }, ms);
  });
}

/**
 * Wraps a promise with timeout protection
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  options: TimeoutOptions = {}
): Promise<T> {
  return Promise.race([
    promise,
    createTimeoutPromise(ms, options)
  ]);
}

/**
 * Creates a timeout-protected function
 */
export function timeoutProtected<T extends AsyncFunction>(
  fn: T,
  defaultTimeout: number,
  name: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    // Allow timeout override via last parameter
    let timeout = defaultTimeout;
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'object' && lastArg !== null && 'timeout' in lastArg) {
      timeout = (lastArg as any).timeout as number;
      args = args.slice(0, -1) as Parameters<T>;
    }
    
    return withTimeout(
      fn(...args),
      timeout,
      {
        message: `${name} timed out`,
        context: { function: name, timeout }
      }
    ) as ReturnType<T>;
  }) as T;
}

/**
 * Adaptive timeout based on historical performance
 */
export class AdaptiveTimeout {
  private history: number[] = [];
  private readonly maxHistory = 100;
  
  constructor(
    private baseTimeout: number,
    private readonly options: {
      minTimeout?: number;
      maxTimeout?: number;
      percentile?: number;
    } = {}
  ) {}
  
  recordDuration(duration: number): void {
    this.history.push(duration);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
  
  getTimeout(): number {
    if (this.history.length < 10) {
      return this.baseTimeout;
    }
    
    // Calculate percentile-based timeout
    const sorted = [...this.history].sort((a, b) => a - b);
    const percentile = this.options.percentile || 0.95;
    const index = Math.floor(sorted.length * percentile);
    const calculated = sorted[index] * 1.5; // 50% buffer
    
    // Apply bounds
    const min = this.options.minTimeout || this.baseTimeout / 2;
    const max = this.options.maxTimeout || this.baseTimeout * 3;
    
    return Math.max(min, Math.min(max, calculated));
  }
  
  getStats(): {
    average: number;
    percentile95: number;
    currentTimeout: number;
    samplesCount: number;
    } {
    if (this.history.length === 0) {
      return {
        average: 0,
        percentile95: 0,
        currentTimeout: this.baseTimeout,
        samplesCount: 0
      };
    }
    
    const sorted = [...this.history].sort((a, b) => a - b);
    const average = this.history.reduce((sum, val) => sum + val, 0) / this.history.length;
    const p95Index = Math.floor(sorted.length * 0.95);
    const percentile95 = sorted[p95Index];
    
    return {
      average,
      percentile95,
      currentTimeout: this.getTimeout(),
      samplesCount: this.history.length
    };
  }
}

/**
 * Database operation timeout wrapper
 */
export function wrapDatabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  timeout: number = 5000
): Promise<T> {
  return withTimeout(
    operation(),
    timeout,
    {
      message: `Database operation '${operationName}' timed out`,
      category: ErrorCategory.DATA_STORE,
      context: { operation: operationName }
    }
  );
}

/**
 * Network operation timeout wrapper
 */
export function wrapNetworkOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  timeout: number = 10000,
  options: {
    retries?: number;
    context?: Record<string, unknown>;
  } = {}
): Promise<T> {
  const { retries = 0, context = {} } = options;
  
  const executeWithRetry = async (attempt: number = 0): Promise<T> => {
    try {
      return await withTimeout(
        operation(),
        timeout,
        {
          message: `Network operation '${operationName}' timed out`,
          category: ErrorCategory.NETWORK,
          context: { 
            operation: operationName, 
            attempt: attempt + 1,
            maxRetries: retries + 1,
            ...context 
          }
        }
      );
    } catch (error) {
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        logger.warn(`Network operation '${operationName}' failed, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          maxRetries: retries + 1,
          error: error instanceof Error ? error.message : String(error)
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return executeWithRetry(attempt + 1);
      }
      throw error;
    }
  };
  
  return executeWithRetry();
}

/**
 * Discord API operation timeout wrapper
 */
export function wrapDiscordOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  timeout: number = 5000
): Promise<T> {
  return wrapNetworkOperation(
    operation,
    `Discord-${operationName}`,
    timeout,
    {
      retries: 2,
      context: { service: 'discord' }
    }
  );
}

/**
 * External API operation timeout wrapper
 */
export function wrapExternalAPIOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  serviceName: string,
  timeout: number = 30000
): Promise<T> {
  return wrapNetworkOperation(
    operation,
    `${serviceName}-${operationName}`,
    timeout,
    {
      retries: 3,
      context: { service: serviceName }
    }
  );
}

/**
 * Creates a timeout manager for batch operations
 */
export class BatchTimeoutManager {
  private operations: Map<string, {
    promise: Promise<any>;
    timeout: NodeJS.Timeout;
    startTime: number;
  }> = new Map();
  
  async add<T>(
    id: string,
    operation: Promise<T>,
    timeout: number,
    options: TimeoutOptions = {}
  ): Promise<T> {
    // Clean up any existing operation with same ID
    this.cancel(id);
    
    const startTime = Date.now();
    const timeoutPromise = createTimeoutPromise(timeout, options);
    
    const timeoutId = setTimeout(() => {
      this.operations.delete(id);
    }, timeout);
    
    this.operations.set(id, {
      promise: operation,
      timeout: timeoutId,
      startTime
    });
    
    try {
      const result = await Promise.race([operation, timeoutPromise]);
      this.cleanup(id);
      return result;
    } catch (error) {
      this.cleanup(id);
      throw error;
    }
  }
  
  cancel(id: string): boolean {
    const operation = this.operations.get(id);
    if (operation) {
      clearTimeout(operation.timeout);
      this.operations.delete(id);
      return true;
    }
    return false;
  }
  
  cancelAll(): void {
    Array.from(this.operations.keys()).forEach(id => {
      this.cancel(id);
    });
  }
  
  getActiveOperations(): Array<{
    id: string;
    elapsedTime: number;
  }> {
    const now = Date.now();
    return Array.from(this.operations.entries()).map(([id, op]) => ({
      id,
      elapsedTime: now - op.startTime
    }));
  }
  
  private cleanup(id: string): void {
    const operation = this.operations.get(id);
    if (operation) {
      clearTimeout(operation.timeout);
      this.operations.delete(id);
    }
  }
}

// Export a default instance for general use
export const defaultBatchTimeoutManager = new BatchTimeoutManager();