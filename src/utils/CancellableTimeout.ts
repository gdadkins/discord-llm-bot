/**
 * CancellableTimeout - Advanced timeout with cancellation support
 * 
 * Provides cancellable timeout operations using AbortController:
 * - Timeout operations that can be cancelled mid-execution
 * - Integration with operations that support AbortSignal
 * - Proper cleanup of resources on timeout or cancellation
 * - Multiple timeout patterns for different use cases
 */

import { enrichError, ErrorCategory } from './ErrorHandlingUtils';
import { logger } from './logger';
import { TimeoutOptions } from './timeoutUtils';

/**
 * Implements timeout with cancellation support
 */
export class CancellableTimeout {
  private timeoutId: NodeJS.Timeout | null = null;
  private abortController = new AbortController();
  private isActive = false;
  
  async run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeout: number,
    options: TimeoutOptions = {}
  ): Promise<T> {
    if (this.isActive) {
      throw new Error('CancellableTimeout is already running an operation');
    }
    
    this.isActive = true;
    this.abortController = new AbortController();
    
    return new Promise<T>((resolve, reject) => {
      // Set timeout
      this.timeoutId = setTimeout(() => {
        this.abortController.abort();
        const error = new Error(options.message || `Operation cancelled after ${timeout}ms`);
        reject(enrichError(error, {
          category: ErrorCategory.TIMEOUT,
          timeout,
          cancelled: true,
          ...options.context
        }));
      }, timeout);
      
      // Run operation
      operation(this.abortController.signal)
        .then(result => {
          this.cleanup();
          resolve(result);
        })
        .catch(error => {
          this.cleanup();
          // If the error is due to abortion, enhance it with timeout context
          if (this.abortController.signal.aborted && !error.category) {
            reject(enrichError(error, {
              category: ErrorCategory.TIMEOUT,
              timeout,
              cancelled: true,
              ...options.context
            }));
          } else {
            reject(error);
          }
        });
    });
  }
  
  /**
   * Manually cancel the operation
   */
  cancel(): void {
    if (this.isActive) {
      this.abortController.abort();
      this.cleanup();
    }
  }
  
  /**
   * Check if the operation is currently active
   */
  get active(): boolean {
    return this.isActive;
  }
  
  /**
   * Check if the operation was aborted
   */
  get aborted(): boolean {
    return this.abortController.signal.aborted;
  }
  
  private cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.isActive = false;
  }
}

/**
 * Reusable timeout manager for multiple operations
 */
export class TimeoutManager {
  private timeouts: Map<string, CancellableTimeout> = new Map();
  
  /**
   * Start a cancellable operation with a unique ID
   */
  async start<T>(
    id: string,
    operation: (signal: AbortSignal) => Promise<T>,
    timeout: number,
    options: TimeoutOptions = {}
  ): Promise<T> {
    // Cancel existing operation with same ID if it exists
    this.cancel(id);
    
    const cancellableTimeout = new CancellableTimeout();
    this.timeouts.set(id, cancellableTimeout);
    
    try {
      const result = await cancellableTimeout.run(operation, timeout, {
        ...options,
        context: { operationId: id, ...options.context }
      });
      
      this.timeouts.delete(id);
      return result;
    } catch (error) {
      this.timeouts.delete(id);
      throw error;
    }
  }
  
  /**
   * Cancel a specific operation by ID
   */
  cancel(id: string): boolean {
    const timeout = this.timeouts.get(id);
    if (timeout) {
      timeout.cancel();
      this.timeouts.delete(id);
      return true;
    }
    return false;
  }
  
  /**
   * Cancel all active operations
   */
  cancelAll(): number {
    const count = this.timeouts.size;
    Array.from(this.timeouts.values()).forEach(timeout => {
      timeout.cancel();
    });
    this.timeouts.clear();
    return count;
  }
  
  /**
   * Get status of all active operations
   */
  getActiveOperations(): Array<{ id: string; active: boolean; aborted: boolean }> {
    return Array.from(this.timeouts.entries()).map(([id, timeout]) => ({
      id,
      active: timeout.active,
      aborted: timeout.aborted
    }));
  }
  
  /**
   * Get count of active operations
   */
  get activeCount(): number {
    return Array.from(this.timeouts.values()).filter(timeout => timeout.active).length;
  }
}

/**
 * Utility function to create a fetch request with timeout and cancellation
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;
  
  const cancellableTimeout = new CancellableTimeout();
  
  return cancellableTimeout.run(
    async (signal) => {
      // Merge abort signals if one already exists
      let finalSignal = signal;
      if (fetchOptions.signal) {
        const controller = new AbortController();
        const originalSignal = fetchOptions.signal;
        
        // Listen to both signals
        signal.addEventListener('abort', () => controller.abort());
        originalSignal.addEventListener('abort', () => controller.abort());
        
        finalSignal = controller.signal;
      }
      
      return fetch(url, {
        ...fetchOptions,
        signal: finalSignal
      });
    },
    timeout,
    {
      message: `Fetch request to ${url} timed out`,
      category: ErrorCategory.NETWORK,
      context: { url, timeout }
    }
  );
}

/**
 * Utility function for database operations with timeout and cancellation
 */
export async function executeWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeout: number,
  operationName: string,
  context?: Record<string, unknown>
): Promise<T> {
  const cancellableTimeout = new CancellableTimeout();
  
  return cancellableTimeout.run(
    operation,
    timeout,
    {
      message: `${operationName} timed out`,
      category: ErrorCategory.TIMEOUT,
      context: { operation: operationName, ...context }
    }
  );
}

/**
 * Retry an operation with timeout and cancellation
 */
export async function retryWithTimeout<T>(
  operation: (signal: AbortSignal, attempt: number) => Promise<T>,
  maxRetries: number,
  timeout: number,
  operationName: string,
  options: {
    retryDelay?: number;
    context?: Record<string, unknown>;
  } = {}
): Promise<T> {
  const { retryDelay = 1000, context = {} } = options;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const cancellableTimeout = new CancellableTimeout();
    
    try {
      return await cancellableTimeout.run(
        (signal) => operation(signal, attempt),
        timeout,
        {
          message: `${operationName} attempt ${attempt + 1} timed out`,
          category: ErrorCategory.TIMEOUT,
          context: { 
            operation: operationName, 
            attempt: attempt + 1, 
            maxRetries: maxRetries + 1,
            ...context 
          }
        }
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        logger.info(`${operationName} attempt ${attempt + 1} failed, retrying in ${retryDelay}ms`, {
          error: lastError.message,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1
        });
        
        // Wait before retry, but make it cancellable too
        const delayCancellable = new CancellableTimeout();
        try {
          await delayCancellable.run(
            (signal) => new Promise<void>((resolve, reject) => {
              const delayTimeout = setTimeout(resolve, retryDelay);
              signal.addEventListener('abort', () => {
                clearTimeout(delayTimeout);
                reject(new Error('Retry delay cancelled'));
              });
            }),
            retryDelay + 1000, // Add buffer to delay timeout
            { message: 'Retry delay cancelled' }
          );
        } catch (delayError) {
          // If delay is cancelled, propagate the cancellation
          throw lastError;
        }
      }
    }
  }
  
  throw lastError || new Error(`${operationName} failed after ${maxRetries + 1} attempts`);
}

// Export a default timeout manager instance
export const defaultTimeoutManager = new TimeoutManager();