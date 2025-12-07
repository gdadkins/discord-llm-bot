/**
 * Service Method Wrapper - Standardized service method execution
 * 
 * This file provides a universal wrapper for service methods that ensures:
 * - Consistent error handling and response formats
 * - Automatic timeout protection
 * - Fallback mechanism support
 * - Error code mapping and enrichment
 * - Performance tracking and metrics
 * - Request ID generation for tracing
 * 
 * ## Design Principles
 * 1. **Transparent Wrapping** - Original method signature preserved
 * 2. **Standardized Responses** - All methods return ServiceResult<T>
 * 3. **Error Enrichment** - Automatic error classification and context
 * 4. **Performance Tracking** - Built-in duration and retry counting
 * 5. **Fallback Support** - Graceful degradation capabilities
 * 
 * ## Usage Examples
 * ```typescript
 * // Wrap a service method
 * const wrappedMethod = standardizedServiceMethod(
 *   this.originalMethod.bind(this),
 *   'UserService',
 *   'getUserData',
 *   {
 *     timeout: 5000,
 *     fallback: this.getDefaultUserData.bind(this),
 *     errorMapping: (error) => {
 *       if (error.message.includes('not found')) {
 *         return ServiceErrorCode.NOT_FOUND;
 *       }
 *       return ServiceErrorCode.INTERNAL_ERROR;
 *     }
 *   }
 * );
 * 
 * // Use the wrapped method
 * const result = await wrappedMethod(userId);
 * if (result.success) {
 *   console.log('Data:', result.data);
 * } else {
 *   console.error('Error:', result.error.userMessage);
 * }
 * ```
 */

import { withTimeout } from './timeoutUtils';
import { enrichError, isRetryableError } from './ErrorHandlingUtils';
import { logger } from './logger';
import { 
  ServiceResult, 
  ServiceResponse, 
  ServiceError, 
  ServiceErrorCode 
} from '../services/interfaces/ServiceResponses';
import { AsyncFunction } from '../types';

// ============================================================================
// Service Method Wrapper Options
// ============================================================================

/**
 * Configuration options for service method wrapping
 */
export interface ServiceMethodOptions {
  /** Operation timeout in milliseconds */
  timeout?: number;
  
  /** Fallback function to use if the main operation fails */
  fallback?: AsyncFunction;
  
  /** Custom error mapping function */
  errorMapping?: (error: Error) => ServiceErrorCode;
  
  /** Whether to enable retry logic (uses existing ErrorHandlingUtils) */
  enableRetry?: boolean;
  
  /** Whether to suppress detailed error logging */
  suppressLogging?: boolean;
}

// ============================================================================
// Main Wrapper Function
// ============================================================================

/**
 * Wraps a service method with standardized error handling and response format
 * 
 * This function transforms any service method to return a standardized ServiceResult,
 * providing consistent error handling, timeout protection, and fallback support.
 * 
 * @param method - The original service method to wrap
 * @param service - Service name for error context and logging
 * @param operation - Operation name for error context and logging
 * @param options - Configuration options for the wrapper
 * @returns Wrapped method that returns ServiceResult<T>
 */
export function standardizedServiceMethod<T extends AsyncFunction>(
  method: T,
  service: string,
  operation: string,
  options: ServiceMethodOptions = {}
): (...args: Parameters<T>) => Promise<ServiceResult<Awaited<ReturnType<T>>>> {
  return (async (...args: Parameters<T>) => {
    const startTime = Date.now();
    const requestId = generateRequestId(service, operation);
    const retryCount = 0;
    
    // Log operation start (if not suppressed)
    if (!options.suppressLogging) {
      logger.debug(`Starting ${service}.${operation}`, {
        requestId,
        service,
        operation,
        argsCount: args.length
      });
    }
    
    try {
      // Execute method with optional timeout
      let methodPromise = method(...args);
      
      if (options.timeout) {
        methodPromise = withTimeout(methodPromise, options.timeout, {
          message: `${service}.${operation} timed out after ${options.timeout}ms`,
          context: { service, operation, requestId }
        });
      }
      
      const data = await methodPromise as Awaited<ReturnType<T>>;
      const duration = Date.now() - startTime;
      
      // Log successful completion
      if (!options.suppressLogging) {
        logger.debug(`Completed ${service}.${operation}`, {
          requestId,
          service,
          operation,
          duration,
          success: true
        });
      }
      
      return ServiceResponse.success(data, {
        duration,
        retryCount
      });
      
    } catch (error) {
      const enrichedError = enrichError(error as Error, {
        service,
        operation,
        requestId,
        args: sanitizeArgsForLogging(args)
      });
      
      // Try fallback if available and error is retryable
      if (options.fallback && isRetryableError(enrichedError)) {
        try {
          if (!options.suppressLogging) {
            logger.info(`Attempting fallback for ${service}.${operation}`, {
              requestId,
              service,
              operation,
              originalError: enrichedError.message
            });
          }
          
          const fallbackResult = await options.fallback(...args);
          const duration = Date.now() - startTime;
          
          return ServiceResponse.success(fallbackResult, {
            duration,
            retryCount,
            fallbackUsed: true
          });
          
        } catch (fallbackError) {
          if (!options.suppressLogging) {
            logger.error(`Fallback also failed for ${service}.${operation}`, {
              requestId,
              service,
              operation,
              originalError: enrichedError.message,
              fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            });
          }
        }
      }
      
      // Map to standardized error code
      const errorCode = options.errorMapping
        ? options.errorMapping(enrichedError)
        : mapErrorToServiceCode(enrichedError);
      
      const duration = Date.now() - startTime;
      
      // Log error
      if (!options.suppressLogging) {
        const logLevel = errorCode === ServiceErrorCode.INTERNAL_ERROR ? 'error' : 'warn';
        logger[logLevel](`Failed ${service}.${operation}`, {
          requestId,
          service,
          operation,
          duration,
          errorCode,
          errorMessage: enrichedError.message,
          retryCount
        });
      }
      
      return ServiceResponse.error({
        code: errorCode,
        message: enrichedError.message,
        service,
        operation,
        details: {
          originalError: enrichedError.name,
          stack: process.env.NODE_ENV === 'development' ? enrichedError.stack : undefined,
          category: enrichedError.category,
          severity: enrichedError.severity,
          ...enrichedError.context
        },
        requestId,
        severity: mapSeverityLevel(enrichedError.severity)
      });
    }
  }) as (...args: Parameters<T>) => Promise<ServiceResult<Awaited<ReturnType<T>>>>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a unique request ID for operation tracing
 */
function generateRequestId(service: string, operation: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${service}_${operation}_${timestamp}_${random}`;
}

/**
 * Sanitizes method arguments for safe logging
 * 
 * Removes potentially sensitive data and large objects from arguments
 * to prevent log pollution and security issues.
 */
function sanitizeArgsForLogging(args: unknown[]): unknown[] {
  return args.map((arg, _index) => {
    if (arg === null || arg === undefined) {
      return arg;
    }
    
    if (typeof arg === 'string') {
      // Truncate long strings and mask potential tokens/keys
      if (arg.length > 100) {
        return `[String:${arg.length}chars]`;
      }
      if (arg.toLowerCase().includes('token') || arg.toLowerCase().includes('key')) {
        return '[REDACTED]';
      }
      return arg;
    }
    
    if (typeof arg === 'object') {
      // Don't log large or complex objects
      if (Array.isArray(arg)) {
        return `[Array:${arg.length}items]`;
      }
      return '[Object]';
    }
    
    return arg;
  });
}

/**
 * Maps enriched errors to standardized service error codes
 */
function mapErrorToServiceCode(error: Error): ServiceErrorCode {
  const message = error.message?.toLowerCase() || '';
  
  // Use enriched error properties if available (from ErrorHandlingUtils)
  const enrichedError = error as Error & { category?: string };
  
  // Timeout errors
  if (enrichedError.category === 'timeout' || message.includes('timeout')) {
    return ServiceErrorCode.TIMEOUT;
  }
  
  // Network/dependency errors  
  if (enrichedError.category === 'network' || 
      message.includes('network') || 
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('enotfound')) {
    return ServiceErrorCode.DEPENDENCY_ERROR;
  }
  
  // Validation errors
  if (enrichedError.category === 'validation' || 
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')) {
    return ServiceErrorCode.VALIDATION_FAILED;
  }
  
  // Rate limiting errors
  if (enrichedError.category === 'rate_limit' || 
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('throttle')) {
    return ServiceErrorCode.RATE_LIMITED;
  }
  
  // Authorization errors
  if (message.includes('unauthorized') || message.includes('auth')) {
    return ServiceErrorCode.UNAUTHORIZED;
  }
  
  if (message.includes('forbidden') || message.includes('permission')) {
    return ServiceErrorCode.FORBIDDEN;
  }
  
  // Not found errors
  if (message.includes('not found') || message.includes('404')) {
    return ServiceErrorCode.NOT_FOUND;
  }
  
  // Service unavailable
  if (message.includes('unavailable') || message.includes('503')) {
    return ServiceErrorCode.SERVICE_UNAVAILABLE;
  }
  
  // Default to internal error
  return ServiceErrorCode.INTERNAL_ERROR;
}

/**
 * Maps ErrorHandlingUtils severity to ServiceError severity
 */
function mapSeverityLevel(severity: string): ServiceError['severity'] {
  switch (severity) {
  case 'low': return 'low';
  case 'medium': return 'medium'; 
  case 'high': return 'high';
  case 'critical': return 'critical';
  default: return 'medium';
  }
}

// ============================================================================
// Convenience Decorators
// ============================================================================

/**
 * Class method decorator for standardized service methods
 * 
 * Usage:
 * ```typescript
 * class MyService {
 *   @standardizedMethod('MyService', 'getData', { timeout: 5000 })
 *   async getData(id: string): Promise<ServiceResult<Data>> {
 *     // Method implementation
 *   }
 * }
 * ```
 */
export function standardizedMethod(
  service: string,
  operation: string,
  options: ServiceMethodOptions = {}
) {
  return function decorator<T extends AsyncFunction>(
    target: unknown,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return;
    
    descriptor.value = standardizedServiceMethod(
      originalMethod.bind(target),
      service,
      operation || propertyKey,
      options
    ) as T;
  };
}

// ============================================================================
// Batch Operation Support
// ============================================================================

/**
 * Wraps multiple service methods at once for consistent error handling
 * 
 * @param methods - Object mapping method names to method functions
 * @param service - Service name for all methods
 * @param globalOptions - Options applied to all methods
 * @returns Object with wrapped methods
 */
export function wrapServiceMethods<T extends Record<string, AsyncFunction>>(
  methods: T,
  service: string,
  globalOptions: ServiceMethodOptions = {}
): {
  [K in keyof T]: (...args: Parameters<T[K]>) => Promise<ServiceResult<Awaited<ReturnType<T[K]>>>>
} {
  const wrapped = {} as {
    [K in keyof T]: (...args: Parameters<T[K]>) => Promise<ServiceResult<Awaited<ReturnType<T[K]>>>>
  };
  
  for (const [methodName, method] of Object.entries(methods)) {
    (wrapped as any)[methodName] = standardizedServiceMethod(
      method,
      service,
      methodName,
      globalOptions
    );
  }
  
  return wrapped;
}

// ============================================================================
// Usage Examples in Comments
// ============================================================================

/*
Example Service Implementation:

```typescript
class UserService extends BaseService {
  // Traditional approach - manual wrapping
  async getUserData(userId: string): Promise<ServiceResult<UserData>> {
    const wrappedMethod = standardizedServiceMethod(
      this._getUserDataInternal.bind(this),
      'UserService',
      'getUserData',
      {
        timeout: 5000,
        fallback: this.getDefaultUserData.bind(this),
        errorMapping: (error) => {
          if (error.message.includes('not found')) {
            return ServiceErrorCode.NOT_FOUND;
          }
          return ServiceErrorCode.INTERNAL_ERROR;
        }
      }
    );
    
    return wrappedMethod(userId);
  }
  
  // Decorator approach
  @standardizedMethod('UserService', 'getUserPreferences', { timeout: 3000 })
  async getUserPreferences(userId: string): Promise<ServiceResult<UserPreferences>> {
    // Implementation returns raw data, wrapper handles ServiceResult
    return this.database.getUserPreferences(userId);
  }
  
  // Batch wrapping approach
  private _rawMethods = {
    getUser: this._getUserInternal.bind(this),
    updateUser: this._updateUserInternal.bind(this),
    deleteUser: this._deleteUserInternal.bind(this)
  };
  
  // All methods wrapped at once
  public methods = wrapServiceMethods(this._rawMethods, 'UserService', {
    timeout: 5000,
    enableRetry: true
  });
}
```
*/