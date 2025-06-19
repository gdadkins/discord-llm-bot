/**
 * Service Method Protection Templates
 * 
 * Provides standardized error handling, timeout protection, and fallback mechanisms
 * for service methods across the application.
 */

import { logger } from './logger';
import { 
  enrichError, 
  createTimeoutPromise,
  handleAsyncOperation,
  ErrorHandlingConfig
} from './ErrorHandlingUtils';
import { AsyncFunction } from '../types';

/**
 * Options for service method protection
 */
export interface ServiceMethodOptions {
  timeout?: number;
  retryable?: boolean;
  fallback?: AsyncFunction;
  enableMetrics?: boolean;
  enableCircuitBreaker?: boolean;
  suppressLogging?: boolean;
}

/**
 * Wraps service methods with comprehensive error handling, timeout protection, and fallback support
 */
export function wrapServiceMethod<T extends AsyncFunction>(
  method: T,
  serviceName: string,
  methodName: string,
  options: ServiceMethodOptions = {}
): T {
  const {
    timeout = 30000,
    retryable = false,
    fallback,
    enableMetrics = true,
    suppressLogging = false
  } = options;

  const wrappedMethod = (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const startTime = Date.now();
    const requestId = `${serviceName}_${methodName}_${Date.now()}`;
    const context = {
      service: serviceName,
      method: methodName,
      args: args.map(arg => typeof arg === 'object' ? '[Object]' : arg),
      requestId
    };

    const config: ErrorHandlingConfig = {
      maxRetries: retryable ? 2 : 0,
      retryDelay: 1000,
      retryMultiplier: 2.0,
      timeout,
      enableFallback: !!fallback,
      suppressLogging
    };

    const result = await handleAsyncOperation(
      async () => {
        // Apply timeout if specified
        if (timeout > 0) {
          return await Promise.race([
            method(...args),
            createTimeoutPromise(timeout).then(() => {
              throw enrichError(new Error(`${methodName} timeout`), {
                ...context,
                timeout
              });
            })
          ]);
        } else {
          return await method(...args);
        }
      },
      config,
      fallback ? (_error, _ctx) => fallback(...args) : undefined,
      context
    );

    if (result.success) {
      // Track success metrics
      const duration = Date.now() - startTime;
      if (enableMetrics && duration > 1000 && !suppressLogging) {
        logger.warn('Slow service method detected', { 
          ...context, 
          duration,
          threshold: 1000
        });
      }

      if (enableMetrics && !suppressLogging) {
        logger.debug('Service method executed successfully', {
          ...context,
          duration,
          fallbackUsed: result.fallbackUsed,
          retryCount: result.retryCount
        });
      }

      return result.data as ReturnType<T>;
    } else {
      const enrichedError = result.error!;
      
      // Enhanced error with service context
      enrichedError.context = {
        ...enrichedError.context,
        ...context,
        duration: Date.now() - startTime,
        retryCount: result.retryCount
      };

      throw enrichedError;
    }
  });

  return wrappedMethod as T;
}

/**
 * Decorator for service methods that automatically applies error handling
 */
export function ServiceMethodProtection(options: ServiceMethodOptions = {}) {
  return function decorator(
    target: unknown,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<AsyncFunction>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return;

    const serviceName = (target as any).constructor.name;
    descriptor.value = wrapServiceMethod(
      originalMethod.bind(target),
      serviceName,
      propertyKey,
      options
    );
  };
}

/**
 * Specialized wrapper for critical service operations that must not fail
 */
export function wrapCriticalServiceMethod<T extends AsyncFunction>(
  method: T,
  serviceName: string,
  methodName: string,
  fallback: (...args: Parameters<T>) => ReturnType<T>
): T {
  return wrapServiceMethod(method, serviceName, methodName, {
    timeout: 15000,
    retryable: true,
    fallback: fallback as unknown as AsyncFunction,
    enableMetrics: true,
    enableCircuitBreaker: true
  });
}

/**
 * Specialized wrapper for fast operations that should fail quickly
 */
export function wrapFastServiceMethod<T extends AsyncFunction>(
  method: T,
  serviceName: string,
  methodName: string
): T {
  return wrapServiceMethod(method, serviceName, methodName, {
    timeout: 5000,
    retryable: false,
    enableMetrics: true,
    suppressLogging: false
  });
}

/**
 * Specialized wrapper for background operations that can tolerate failures
 */
export function wrapBackgroundServiceMethod<T extends AsyncFunction>(
  method: T,
  serviceName: string,
  methodName: string
): T {
  return wrapServiceMethod(method, serviceName, methodName, {
    timeout: 60000,
    retryable: true,
    enableMetrics: false,
    suppressLogging: true
  });
}

/**
 * Creates a safe version of a service method that never throws
 */
export function makeSafeServiceMethod<T extends AsyncFunction>(
  method: T,
  serviceName: string,
  methodName: string,
  defaultValue: unknown = null
): (...args: Parameters<T>) => Promise<ReturnType<T> | typeof defaultValue> {
  return async (...args: Parameters<T>) => {
    try {
      return await wrapServiceMethod(method, serviceName, methodName, {
        timeout: 10000,
        retryable: false,
        suppressLogging: true
      })(...args);
    } catch (error) {
      logger.debug(`Safe service method ${serviceName}.${methodName} failed, returning default`, {
        error: enrichError(error as Error),
        defaultValue
      });
      return defaultValue;
    }
  };
}

/**
 * Background operation protection for scheduled tasks with error thresholds
 */
export function scheduleProtectedBackgroundTask(
  name: string,
  task: () => Promise<void>,
  interval: number,
  options: {
    maxExecutionTime?: number;
    errorThreshold?: number;
    onError?: (error: Error) => void;
    onDisabled?: (reason: string) => void;
  } = {}
): NodeJS.Timeout {
  const {
    maxExecutionTime = 30000,
    errorThreshold = 5,
    onError,
    onDisabled
  } = options;

  let consecutiveErrors = 0;
  let isDisabled = false;

  const wrappedTask = async () => {
    if (isDisabled) return;
    
    const startTime = Date.now();
    const requestId = `bg_${name}_${Date.now()}`;

    try {
      await Promise.race([
        task(),
        createTimeoutPromise(maxExecutionTime).then(() => {
          throw enrichError(new Error('Background task timeout'), {
            task: name,
            timeout: maxExecutionTime,
            requestId
          });
        })
      ]);

      // Reset error counter on success
      consecutiveErrors = 0;

      // Log if task took long
      const duration = Date.now() - startTime;
      if (duration > maxExecutionTime * 0.8) {
        logger.warn('Background task approaching timeout', {
          task: name,
          duration,
          threshold: maxExecutionTime,
          requestId
        });
      }

    } catch (error) {
      consecutiveErrors++;
      const enrichedError = enrichError(error as Error, {
        task: name,
        consecutiveErrors,
        duration: Date.now() - startTime,
        requestId
      });

      logger.error('Background task failed', {
        error: enrichedError,
        consecutiveErrors,
        errorThreshold
      });

      // Call error handler if provided
      if (onError) {
        try {
          onError(enrichedError);
        } catch (handlerError) {
          logger.error('Background task error handler failed', {
            error: handlerError,
            originalError: enrichedError,
            requestId
          });
        }
      }

      // Disable task if error threshold exceeded
      if (consecutiveErrors >= errorThreshold) {
        isDisabled = true;
        const reason = `Task disabled after ${consecutiveErrors} consecutive failures`;
        
        logger.error('Background task disabled due to repeated failures', {
          task: name,
          failures: consecutiveErrors,
          lastError: enrichedError,
          requestId
        });

        clearInterval(intervalId);

        if (onDisabled) {
          try {
            onDisabled(reason);
          } catch (disabledHandlerError) {
            logger.error('Background task disabled handler failed', {
              error: disabledHandlerError,
              task: name,
              requestId
            });
          }
        }
      }
    }
  };

  // Run immediately
  wrappedTask().catch(err => 
    logger.error('Initial background task execution failed', {
      error: enrichError(err as Error),
      task: name
    })
  );

  // Schedule recurring execution
  const intervalId = setInterval(wrappedTask, interval);

  return intervalId;
}

/**
 * Batch operation protection for processing multiple items safely
 */
export async function protectedBatchOperation<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize: number = 10,
  options: {
    maxConcurrency?: number;
    timeout?: number;
    continueOnError?: boolean;
    onItemError?: (error: Error, item: T, index: number) => void;
  } = {}
): Promise<{ results: (R | null)[], errors: Error[], successCount: number }> {
  const {
    timeout = 30000,
    continueOnError = true,
    onItemError
  } = options;

  const results: (R | null)[] = new Array(items.length).fill(null);
  const errors: Error[] = [];
  let successCount = 0;
  
  // Process items in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map(async (item, batchIndex) => {
      const globalIndex = i + batchIndex;
      try {
        const result = await Promise.race([
          processor(item, globalIndex),
          createTimeoutPromise(timeout).then(() => {
            throw enrichError(new Error('Batch item processing timeout'), {
              operation: 'batchProcessor',
              itemIndex: globalIndex,
              timeout
            });
          })
        ]);
        
        results[globalIndex] = result;
        successCount++;
        
      } catch (error) {
        const enrichedError = enrichError(error as Error, {
          operation: 'batchProcessor',
          itemIndex: globalIndex,
          item: typeof item === 'object' ? '[Object]' : item
        });
        
        errors.push(enrichedError);
        
        if (onItemError) {
          try {
            onItemError(enrichedError, item, globalIndex);
          } catch (handlerError) {
            logger.error('Batch item error handler failed', {
              error: handlerError,
              originalError: enrichedError,
              itemIndex: globalIndex
            });
          }
        }
        
        if (!continueOnError) {
          throw enrichedError;
        }
      }
    });

    // Wait for batch to complete with concurrency control
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Log batch completion
    const batchErrors = batchResults.filter(r => r.status === 'rejected').length;
    logger.debug('Batch operation completed', {
      batchStart: i,
      batchSize: batch.length,
      errors: batchErrors,
      successes: batch.length - batchErrors
    });
  }

  return { results, errors, successCount };
}