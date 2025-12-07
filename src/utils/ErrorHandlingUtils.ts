/**
 * ErrorHandlingUtils - Standardized async error processing utilities
 * 
 * Provides consistent error handling patterns across all services:
 * - Async operation wrapping with retry logic
 * - Circuit breaker integration
 * - Standardized error classification and responses
 * - Fallback mechanisms for critical operations
 * - Error context enrichment and logging
 */

import { logger } from './logger';

// Forward declarations for standardized service response integration
import type { ServiceError, ServiceErrorCode } from '../services/interfaces/ServiceResponses';

// Error classification enums
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  DATA_STORE = 'data_store', 
  VALIDATION = 'validation',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  CIRCUIT_BREAKER = 'circuit_breaker',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  INTERNAL = 'internal',
  EXTERNAL_SERVICE = 'external_service',
  UNKNOWN = 'unknown'
}

// Error handling configuration
export interface ErrorHandlingConfig {
  maxRetries?: number;
  retryDelay?: number;
  retryMultiplier?: number;
  timeout?: number;
  enableCircuitBreaker?: boolean;
  enableFallback?: boolean;
  suppressLogging?: boolean;
}

// Enriched error with context and classification
export interface EnrichedError extends Error {
  category: ErrorCategory;
  severity: ErrorSeverity;
  context?: Record<string, unknown>;
  originalError?: Error;
  retryAttempt?: number;
  timestamp: number;
}

// Standardized error result
export interface ErrorResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: EnrichedError;
  fallbackUsed?: boolean;
  retryCount?: number;
}

// Fallback function type
export type FallbackFunction<T> = (error: EnrichedError, context?: Record<string, unknown>) => Promise<T> | T;

/**
 * System error class for internal application errors
 */
export class SystemError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: number;

  constructor(
    message: string,
    code: string = 'SYSTEM_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SystemError';
    this.code = code;
    this.context = context;
    this.timestamp = Date.now();
    
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SystemError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

// Default configuration values
const DEFAULT_CONFIG: Required<ErrorHandlingConfig> = {
  maxRetries: 3,
  retryDelay: 1000,
  retryMultiplier: 2.0,
  timeout: 30000,
  enableCircuitBreaker: false,
  enableFallback: false,
  suppressLogging: false
};

/**
 * Classifies errors into categories and severity levels
 */
export function classifyError(error: unknown): { category: ErrorCategory; severity: ErrorSeverity } {
  if (!error) return { category: ErrorCategory.UNKNOWN, severity: ErrorSeverity.LOW };
  
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const errorStack = error instanceof Error ? error.stack : '';
  
  // Network-related errors
  if (errorMessage.includes('network') || 
      errorMessage.includes('connect') || 
      errorMessage.includes('timeout') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('enotfound')) {
    return { 
      category: ErrorCategory.NETWORK, 
      severity: errorMessage.includes('timeout') ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH 
    };
  }
  
  // Data store errors
  if (errorMessage.includes('enoent') ||
      errorMessage.includes('file') ||
      errorMessage.includes('directory') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('eacces') ||
      errorStack?.includes('DataStore')) {
    return { 
      category: ErrorCategory.DATA_STORE, 
      severity: errorMessage.includes('permission') ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH 
    };
  }
  
  // Validation errors
  if (errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('required') ||
      errorMessage.includes('format')) {
    return { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.MEDIUM };
  }
  
  // Rate limiting errors
  if (errorMessage.includes('rate limit') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('throttle')) {
    return { category: ErrorCategory.RATE_LIMIT, severity: ErrorSeverity.MEDIUM };
  }
  
  // Timeout errors
  if (errorMessage.includes('timeout') ||
      errorMessage.includes('aborted')) {
    return { category: ErrorCategory.TIMEOUT, severity: ErrorSeverity.MEDIUM };
  }
  
  // Circuit breaker errors
  if (errorMessage.includes('circuit breaker') ||
      errorMessage.includes('circuit') ||
      errorMessage.includes('breaker')) {
    return { category: ErrorCategory.CIRCUIT_BREAKER, severity: ErrorSeverity.HIGH };
  }
  
  // Authorization errors
  if (errorMessage.includes('unauthorized') || 
      errorMessage.includes('forbidden') ||
      errorMessage.includes('auth') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('access denied')) {
    return { category: ErrorCategory.AUTHORIZATION, severity: ErrorSeverity.MEDIUM };
  }
  
  // Not found errors
  if (errorMessage.includes('not found') ||
      errorMessage.includes('404') ||
      errorMessage.includes('does not exist')) {
    return { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.LOW };
  }
  
  // Conflict errors
  if (errorMessage.includes('conflict') ||
      errorMessage.includes('409') ||
      errorMessage.includes('already exists')) {
    return { category: ErrorCategory.CONFLICT, severity: ErrorSeverity.MEDIUM };
  }
  
  // External service errors
  if (errorMessage.includes('service') ||
      errorMessage.includes('api') ||
      errorMessage.includes('external')) {
    return { category: ErrorCategory.EXTERNAL_SERVICE, severity: ErrorSeverity.MEDIUM };
  }
  
  // Internal errors
  if (errorMessage.includes('internal') ||
      errorMessage.includes('500') ||
      errorMessage.includes('server error')) {
    return { category: ErrorCategory.INTERNAL, severity: ErrorSeverity.HIGH };
  }
  
  // Default classification
  return { category: ErrorCategory.UNKNOWN, severity: ErrorSeverity.MEDIUM };
}

/**
 * Enriches an error with classification, context, and metadata
 */
export function enrichError(
  error: unknown, 
  context?: Record<string, unknown>,
  retryAttempt?: number
): EnrichedError {
  const classification = classifyError(error);
  const originalError = error instanceof Error ? error : new Error(String(error));
  
  const enriched: EnrichedError = {
    name: originalError.name,
    message: originalError.message,
    stack: originalError.stack,
    category: classification.category,
    severity: classification.severity,
    context,
    originalError,
    retryAttempt,
    timestamp: Date.now()
  };
  
  return enriched;
}

/**
 * Determines if an error is retryable based on its category and severity
 */
export function isRetryableError(error: EnrichedError): boolean {
  // Don't retry validation errors or critical errors
  if (error.category === ErrorCategory.VALIDATION || 
      error.severity === ErrorSeverity.CRITICAL) {
    return false;
  }
  
  // Retry network, timeout, and rate limit errors
  return [
    ErrorCategory.NETWORK,
    ErrorCategory.TIMEOUT, 
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.DATA_STORE
  ].includes(error.category);
}

/**
 * Calculates retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(
  baseDelay: number, 
  retryAttempt: number, 
  multiplier: number = 2.0
): number {
  const exponentialDelay = baseDelay * Math.pow(multiplier, retryAttempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Creates a timeout promise that rejects after specified milliseconds
 */
export function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(enrichError(new Error(`Operation timed out after ${timeoutMs}ms`), { timeoutMs }));
    }, timeoutMs);
  });
}

/**
 * Core async error handling wrapper with comprehensive retry and fallback logic
 */
export async function handleAsyncOperation<T>(
  operation: () => Promise<T>,
  config: ErrorHandlingConfig = {},
  fallback?: FallbackFunction<T>,
  context?: Record<string, unknown>
): Promise<ErrorResult<T>> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: EnrichedError | undefined;
  let retryCount = 0;
  
  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      // Create timeout promise if timeout is configured
      const promises: Promise<T>[] = [operation()];
      if (finalConfig.timeout > 0) {
        promises.push(createTimeoutPromise(finalConfig.timeout));
      }
      
      // Execute operation with optional timeout
      const result = await Promise.race(promises);
      
      return {
        success: true,
        data: result,
        retryCount: attempt
      };
      
    } catch (error) {
      const enrichedError = enrichError(error, { ...context, attempt }, attempt);
      lastError = enrichedError;
      retryCount = attempt;
      
      // Log error if not suppressed
      if (!finalConfig.suppressLogging) {
        const logLevel = enrichedError.severity === ErrorSeverity.CRITICAL ? 'error' : 'warn';
        logger[logLevel](`Async operation failed (attempt ${attempt + 1}/${finalConfig.maxRetries + 1})`, {
          category: enrichedError.category,
          severity: enrichedError.severity,
          message: enrichedError.message,
          context: enrichedError.context
        });
      }
      
      // Check if we should retry
      if (attempt < finalConfig.maxRetries && isRetryableError(enrichedError)) {
        const retryDelay = calculateRetryDelay(finalConfig.retryDelay, attempt, finalConfig.retryMultiplier);
        
        if (!finalConfig.suppressLogging) {
          logger.info(`Retrying operation in ${retryDelay}ms...`);
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      
      // No more retries, break out of loop
      break;
    }
  }
  
  // All retries exhausted, try fallback if available
  if (finalConfig.enableFallback && fallback && lastError) {
    try {
      if (!finalConfig.suppressLogging) {
        logger.info('Attempting fallback operation...');
      }
      
      const fallbackResult = await fallback(lastError, context);
      return {
        success: true,
        data: fallbackResult,
        fallbackUsed: true,
        retryCount,
        error: lastError
      };
      
    } catch (fallbackError) {
      const enrichedFallbackError = enrichError(fallbackError, { ...context, isFallback: true });
      
      if (!finalConfig.suppressLogging) {
        logger.error('Fallback operation also failed', {
          originalError: lastError.message,
          fallbackError: enrichedFallbackError.message
        });
      }
      
      return {
        success: false,
        error: enrichedFallbackError,
        retryCount
      };
    }
  }
  
  // Return final failure result
  return {
    success: false,
    error: lastError || enrichError(new Error('Unknown error occurred')),
    retryCount
  };
}

/**
 * Specialized wrapper for data store operations
 */
export async function handleDataStoreOperation<T>(
  operation: () => Promise<T>,
  fallback?: FallbackFunction<T>,
  context?: Record<string, unknown>
): Promise<ErrorResult<T>> {
  return handleAsyncOperation(
    operation,
    {
      maxRetries: 2,
      retryDelay: 500,
      retryMultiplier: 2.0,
      enableFallback: !!fallback,
      timeout: 10000
    },
    fallback,
    { ...context, operationType: 'data_store' }
  );
}

/**
 * Specialized wrapper for network operations
 */
export async function handleNetworkOperation<T>(
  operation: () => Promise<T>,
  fallback?: FallbackFunction<T>,
  context?: Record<string, unknown>
): Promise<ErrorResult<T>> {
  return handleAsyncOperation(
    operation,
    {
      maxRetries: 3,
      retryDelay: 1000,
      retryMultiplier: 2.0,
      enableFallback: !!fallback,
      timeout: 30000
    },
    fallback,
    { ...context, operationType: 'network' }
  );
}

/**
 * Specialized wrapper for validation operations (no retries)
 */
export async function handleValidationOperation<T>(
  operation: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<ErrorResult<T>> {
  return handleAsyncOperation(
    operation,
    {
      maxRetries: 0,
      enableFallback: false,
      suppressLogging: false
    },
    undefined,
    { ...context, operationType: 'validation' }
  );
}

/**
 * Fire-and-forget operation wrapper that handles errors silently
 */
export function handleFireAndForget(
  operation: () => Promise<void>,
  context?: Record<string, unknown>
): void {
  handleAsyncOperation(
    operation,
    {
      maxRetries: 1,
      retryDelay: 1000,
      suppressLogging: false
    },
    undefined,
    { ...context, fireAndForget: true }
  ).catch(result => {
    if (result.error) {
      logger.warn('Fire-and-forget operation failed', {
        category: result.error.category,
        message: result.error.message,
        context: result.error.context
      });
    }
  });
}


/**
 * Promise wrapper that automatically enriches rejected errors
 */
export function enrichPromise<T>(
  promise: Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  return promise.catch(error => {
    throw enrichError(error, context);
  });
}

/**
 * Async function decorator that applies error handling
 */
export function withErrorHandling<TArgs extends unknown[], TReturn>(
  config: ErrorHandlingConfig = {},
  fallback?: FallbackFunction<TReturn>
) {
  return function decorator(
    target: unknown,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: TArgs) => Promise<TReturn>>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return;
    
    descriptor.value = async function(this: unknown, ...args: TArgs): Promise<TReturn> {
      const result = await handleAsyncOperation(
        () => originalMethod.apply(this, args),
        config,
        fallback,
        { method: propertyKey, args: args.map(arg => typeof arg) }
      );
      
      if (result.success) {
        return result.data as TReturn;
      } else {
        throw result.error;
      }
    };
  };
}

// Export utility types for external use
export type AsyncResult<T> = ErrorResult<T>;
export type AsyncErrorHandler<T> = FallbackFunction<T>;

// ============================================================================
// Standardized Service Response Integration
// ============================================================================

/**
 * Converts an ErrorResult to a ServiceResult for compatibility
 * 
 * Provides a bridge between the legacy ErrorResult format and the new
 * standardized ServiceResult format.
 * 
 * @param errorResult - Legacy error result
 * @param service - Service name for error context
 * @param operation - Operation name for error context
 * @returns Standardized service result
 */
export function convertToServiceResult<T>(
  errorResult: ErrorResult<T>,
  service: string,
  operation: string
): import('../services/interfaces/ServiceResponses').ServiceResult<T> {
  if (errorResult.success) {
    return {
      success: true,
      data: errorResult.data,
      metadata: {
        duration: 0, // Not tracked in legacy format
        retryCount: errorResult.retryCount,
        fallbackUsed: errorResult.fallbackUsed
      }
    };
  } else {
    const enrichedError = errorResult.error;
    const serviceError: ServiceError = {
      code: mapCategoryToServiceCode(enrichedError?.category || ErrorCategory.UNKNOWN),
      message: enrichedError?.message || 'Unknown error',
      userMessage: enrichedError ? getUserFriendlyMessage(enrichedError) : 'An error occurred',
      service,
      operation,
      retryable: enrichedError ? isRetryableError(enrichedError) : false,
      severity: mapToServiceSeverity(enrichedError?.severity || ErrorSeverity.MEDIUM),
      timestamp: enrichedError?.timestamp || Date.now(),
      details: enrichedError?.context
    };
    
    return {
      success: false,
      error: serviceError,
      metadata: {
        duration: 0,
        retryCount: errorResult.retryCount
      }
    };
  }
}

/**
 * Maps ErrorCategory to ServiceErrorCode for compatibility
 */
function mapCategoryToServiceCode(category: ErrorCategory): ServiceErrorCode {
  const mapping: Record<ErrorCategory, ServiceErrorCode> = {
    [ErrorCategory.NETWORK]: 'DEPENDENCY_ERROR' as ServiceErrorCode,
    [ErrorCategory.DATA_STORE]: 'INTERNAL_ERROR' as ServiceErrorCode,
    [ErrorCategory.VALIDATION]: 'VALIDATION_FAILED' as ServiceErrorCode,
    [ErrorCategory.RATE_LIMIT]: 'RATE_LIMITED' as ServiceErrorCode,
    [ErrorCategory.TIMEOUT]: 'TIMEOUT' as ServiceErrorCode,
    [ErrorCategory.CIRCUIT_BREAKER]: 'SERVICE_UNAVAILABLE' as ServiceErrorCode,
    [ErrorCategory.AUTHORIZATION]: 'FORBIDDEN' as ServiceErrorCode,
    [ErrorCategory.NOT_FOUND]: 'NOT_FOUND' as ServiceErrorCode,
    [ErrorCategory.CONFLICT]: 'CONFLICT' as ServiceErrorCode,
    [ErrorCategory.INTERNAL]: 'INTERNAL_ERROR' as ServiceErrorCode,
    [ErrorCategory.EXTERNAL_SERVICE]: 'DEPENDENCY_ERROR' as ServiceErrorCode,
    [ErrorCategory.UNKNOWN]: 'INTERNAL_ERROR' as ServiceErrorCode
  };
  
  return mapping[category] || ('INTERNAL_ERROR' as ServiceErrorCode);
}

/**
 * Maps ErrorSeverity to ServiceError severity for compatibility
 */
function mapToServiceSeverity(severity: ErrorSeverity): ServiceError['severity'] {
  switch (severity) {
  case ErrorSeverity.LOW: return 'low';
  case ErrorSeverity.MEDIUM: return 'medium';
  case ErrorSeverity.HIGH: return 'high';
  case ErrorSeverity.CRITICAL: return 'critical';
  default: return 'medium';
  }
}

/**
 * Enhanced getUserFriendlyMessage that works with both legacy and new error formats
 * 
 * Overloaded function that maintains backward compatibility while supporting
 * the new ServiceError format.
 */
export function getUserFriendlyMessage(error: EnrichedError): string;
export function getUserFriendlyMessage(error: { message: string; category: ErrorCategory }): string;
export function getUserFriendlyMessage(error: EnrichedError | { message: string; category: ErrorCategory }): string {
  const errorMessage = error.message.toLowerCase();
  
  switch (error.category) {
  case ErrorCategory.NETWORK:
    if (errorMessage.includes('timeout')) {
      return 'The connection timed out. This might be due to a complex request - please try again or simplify your message.';
    } else if (errorMessage.includes('enotfound') || errorMessage.includes('dns')) {
      return 'Cannot reach the service. Please check your internet connection and try again.';
    } else {
      return 'Network connection issue. Please check your internet connection and try again in a moment.';
    }
  case ErrorCategory.DATA_STORE:
    if (errorMessage.includes('permission') || errorMessage.includes('access')) {
      return 'Data access permissions issue. Please contact the bot administrator.';
    } else if (errorMessage.includes('space') || errorMessage.includes('disk')) {
      return 'Storage space issue. Your request may not have been saved - please contact the administrator.';
    } else {
      return 'Data storage issue. Your request may not have been saved properly.';
    }
  case ErrorCategory.VALIDATION:
    if (errorMessage.includes('required')) {
      return 'Missing required information. Please provide all necessary details and try again.';
    } else if (errorMessage.includes('format')) {
      return 'Invalid format provided. Please check your input format and try again.';
    } else {
      return 'Invalid input provided. Please check your request and try again.';
    }
  case ErrorCategory.RATE_LIMIT:
    if (errorMessage.includes('daily')) {
      return 'Daily usage limit reached. Please try again tomorrow or contact the administrator for more quota.';
    } else if (errorMessage.includes('minute')) {
      return 'You\'re sending requests too quickly. Please wait a moment before trying again.';
    } else {
      return 'Rate limit exceeded. Please wait a few moments before trying again.';
    }
  case ErrorCategory.TIMEOUT:
    // Check if it's an enriched error with context
    const context = 'context' in error ? error.context : undefined;
    if (context?.timeout && typeof context.timeout === 'number') {
      const timeoutSec = Math.round(context.timeout / 1000);
      return `Request timed out after ${timeoutSec} seconds. Try simplifying your request or try again.`;
    } else {
      return 'Request timed out. This might be due to a complex operation - please try again.';
    }
  case ErrorCategory.CIRCUIT_BREAKER:
    return 'The service is temporarily overloaded. Please try again in a few minutes.';
  case ErrorCategory.AUTHORIZATION:
    if (errorMessage.includes('unauthorized')) {
      return 'Authentication required. Please contact the bot administrator to verify your permissions.';
    } else if (errorMessage.includes('forbidden')) {
      return 'You do not have permission to perform this action. Please contact the administrator.';
    } else {
      return 'Access denied. Please check your permissions or contact the administrator.';
    }
  case ErrorCategory.NOT_FOUND:
    if (errorMessage.includes('user')) {
      return 'User not found. Please check the user ID and try again.';
    } else if (errorMessage.includes('server') || errorMessage.includes('guild')) {
      return 'Server not found. Please check the server ID and try again.';
    } else {
      return 'The requested resource was not found. Please check your request and try again.';
    }
  case ErrorCategory.CONFLICT:
    return 'A conflict occurred with existing data. Please check for duplicate entries and try again.';
  case ErrorCategory.INTERNAL:
    return 'An internal server error occurred. Please try again later or contact the administrator if the problem persists.';
  case ErrorCategory.EXTERNAL_SERVICE:
    return 'External service is currently unavailable. Please try again in a few moments.';
  default:
    if (errorMessage.includes('api') && errorMessage.includes('key')) {
      return 'Service authentication issue. Please contact the bot administrator.';
    } else if (errorMessage.includes('quota') || errorMessage.includes('billing')) {
      return 'Service quota exceeded. Please contact the bot administrator.';
    } else {
      return 'An unexpected error occurred. Please try again, and if the problem persists, contact the administrator.';
    }
  }
}