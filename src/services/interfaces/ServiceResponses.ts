/**
 * Standardized Service Response Types and Error Handling
 * 
 * This file provides a unified error handling system across all services with:
 * - Consistent error codes and classifications
 * - Standardized response formats
 * - User-friendly error messages
 * - Comprehensive error metadata
 * - Integration with existing ErrorHandlingUtils
 * 
 * ## Design Principles
 * 1. **Backward Compatibility** - Works alongside existing ErrorHandlingUtils
 * 2. **Consistent Error Codes** - Standardized error classification system
 * 3. **User-Friendly Messages** - Clear, actionable error messages for users
 * 4. **Rich Metadata** - Comprehensive error context for debugging
 * 5. **Retryability** - Clear indication of which errors are retryable
 * 
 * ## Usage
 * ```typescript
 * // Return success
 * return ServiceResponse.success(data, { duration: 150 });
 * 
 * // Return error
 * return ServiceResponse.error({
 *   code: ServiceErrorCode.INVALID_INPUT,
 *   message: 'User ID is required',
 *   service: 'UserService',
 *   operation: 'getUser'
 * });
 * ```
 */

import { ErrorCategory, getUserFriendlyMessage } from '../../utils/ErrorHandlingUtils';

// ============================================================================
// Service Error Codes
// ============================================================================

/**
 * Standardized error codes for all services
 * 
 * These codes provide consistent error classification across the application:
 * - Client errors (4xx equivalent) - User/input related errors
 * - Server errors (5xx equivalent) - System/service related errors  
 * - Business logic errors - Application-specific error conditions
 */
export enum ServiceErrorCode {
  // Client errors (4xx equivalent)
  INVALID_INPUT = 'INVALID_INPUT',
  UNAUTHORIZED = 'UNAUTHORIZED', 
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Server errors (5xx equivalent)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  
  // Business logic errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  PRECONDITION_FAILED = 'PRECONDITION_FAILED',
  CONFLICT = 'CONFLICT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED'
}

// ============================================================================
// Service Error Interface
// ============================================================================

/**
 * Comprehensive error information for service operations
 * 
 * Provides all necessary information for error handling, logging, and user feedback:
 * - Standard error code for consistent classification
 * - Technical message for developers/logs
 * - User-friendly message for end users
 * - Rich context and metadata for debugging
 * - Retry guidance and timing information
 */
export interface ServiceError {
  /** Standardized error code for consistent classification */
  code: ServiceErrorCode;
  
  /** Technical error message for developers and logs */
  message: string;
  
  /** User-friendly error message suitable for display */
  userMessage: string;
  
  /** Additional error details and context */
  details?: Record<string, unknown>;
  
  /** Whether this error type is generally retryable */
  retryable: boolean;
  
  /** Recommended retry delay in milliseconds (if retryable) */
  retryAfter?: number;
  
  /** Error severity level for logging and alerting */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Timestamp when error occurred */
  timestamp: number;
  
  /** Optional request ID for tracing */
  requestId?: string;
  
  /** Service that generated the error */
  service: string;
  
  /** Operation/method that failed */
  operation: string;
}

// ============================================================================
// Service Result Interface
// ============================================================================

/**
 * Standardized result wrapper for all service operations
 * 
 * Provides consistent response format with either success data or error information,
 * plus optional metadata about the operation execution.
 */
export interface ServiceResult<T> {
  /** Whether the operation completed successfully */
  success: boolean;
  
  /** Result data (only present on success) */
  data?: T;
  
  /** Error information (only present on failure) */
  error?: ServiceError;
  
  /** Operation metadata and performance information */
  metadata?: {
    /** Operation duration in milliseconds */
    duration: number;
    
    /** Number of retry attempts made */
    retryCount?: number;
    
    /** Whether result was served from cache */
    fromCache?: boolean;
    
    /** Whether fallback mechanism was used */
    fallbackUsed?: boolean;
    
    /** Circuit breaker state during operation */
    circuitBreakerState?: string;
  };
}

// ============================================================================
// Service Response Utility Class
// ============================================================================

/**
 * Utility class for creating standardized service responses
 * 
 * Provides convenient methods for creating success and error responses
 * with proper error code mapping and user-friendly message generation.
 */
export class ServiceResponse {
  /**
   * Creates a successful service response
   * 
   * @param data - The result data
   * @param metadata - Optional operation metadata
   * @returns Standardized success response
   */
  static success<T>(
    data: T,
    metadata?: ServiceResult<T>['metadata']
  ): ServiceResult<T> {
    return {
      success: true,
      data,
      metadata: {
        duration: 0,
        ...metadata
      }
    };
  }
  
  /**
   * Creates an error service response
   * 
   * @param error - Error information (code, message, service, operation required)
   * @returns Standardized error response
   */
  static error<T>(
    error: Partial<ServiceError> & Pick<ServiceError, 'code' | 'message' | 'service' | 'operation'>
  ): ServiceResult<T> {
    return {
      success: false,
      error: {
        userMessage: getUserFriendlyMessage({
          message: error.message,
          category: this.mapCodeToCategory(error.code)
        } as { message: string; category: ErrorCategory }),
        retryable: this.isRetryableCode(error.code),
        severity: error.severity || 'medium',
        timestamp: Date.now(),
        ...error
      }
    };
  }
  
  /**
   * Maps service error codes to existing error categories
   * 
   * Provides compatibility with existing ErrorHandlingUtils by mapping
   * new service error codes to established error categories.
   */
  private static mapCodeToCategory(code: ServiceErrorCode): ErrorCategory {
    const mapping: Record<ServiceErrorCode, ErrorCategory> = {
      [ServiceErrorCode.INVALID_INPUT]: ErrorCategory.VALIDATION,
      [ServiceErrorCode.UNAUTHORIZED]: ErrorCategory.UNKNOWN, // No direct mapping
      [ServiceErrorCode.FORBIDDEN]: ErrorCategory.UNKNOWN, // No direct mapping
      [ServiceErrorCode.NOT_FOUND]: ErrorCategory.UNKNOWN, // No direct mapping
      [ServiceErrorCode.RATE_LIMITED]: ErrorCategory.RATE_LIMIT,
      [ServiceErrorCode.INTERNAL_ERROR]: ErrorCategory.UNKNOWN,
      [ServiceErrorCode.SERVICE_UNAVAILABLE]: ErrorCategory.NETWORK,
      [ServiceErrorCode.TIMEOUT]: ErrorCategory.TIMEOUT,
      [ServiceErrorCode.DEPENDENCY_ERROR]: ErrorCategory.NETWORK,
      [ServiceErrorCode.VALIDATION_FAILED]: ErrorCategory.VALIDATION,
      [ServiceErrorCode.PRECONDITION_FAILED]: ErrorCategory.VALIDATION,
      [ServiceErrorCode.CONFLICT]: ErrorCategory.UNKNOWN, // No direct mapping
      [ServiceErrorCode.QUOTA_EXCEEDED]: ErrorCategory.RATE_LIMIT
    };
    
    return mapping[code] || ErrorCategory.UNKNOWN;
  }
  
  /**
   * Determines if an error code represents a retryable condition
   * 
   * Based on error semantics, determines whether retrying the operation
   * is likely to succeed.
   */
  private static isRetryableCode(code: ServiceErrorCode): boolean {
    const retryableCodes = new Set([
      ServiceErrorCode.SERVICE_UNAVAILABLE,
      ServiceErrorCode.TIMEOUT,
      ServiceErrorCode.DEPENDENCY_ERROR,
      ServiceErrorCode.INTERNAL_ERROR
    ]);
    
    return retryableCodes.has(code);
  }
}

// ============================================================================
// Error Aggregation Types
// ============================================================================

/**
 * Aggregated error information for monitoring and reporting
 */
export interface AggregatedError {
  /** Service that generated the errors */
  service: string;
  
  /** Operation that failed */
  operation: string;
  
  /** Error code */
  code: ServiceErrorCode;
  
  /** Number of occurrences in the aggregation window */
  count: number;
  
  /** Timestamp of first occurrence */
  firstSeen: number;
  
  /** Timestamp of most recent occurrence */
  lastSeen: number;
  
  /** Sample error instances for debugging */
  samples: ServiceError[];
  
  /** Set of affected user IDs */
  userIds: Set<string>;
  
  /** Request IDs for tracing */
  requestIds: string[];
}

/**
 * Error report for monitoring and alerting
 */
export interface ErrorReport {
  /** Report generation timestamp */
  timestamp: number;
  
  /** Aggregated error information */
  errors: Array<AggregatedError & {
    /** Number of affected users */
    affectedUsers: number;
    
    /** Error rate (errors per second) */
    errorRate: number;
  }>;
  
  /** Summary statistics */
  summary: {
    /** Total error count */
    total: number;
    
    /** Errors by service */
    byService: Record<string, number>;
    
    /** Errors by severity */
    bySeverity: Record<string, number>;
    
    /** Top errors by frequency */
    topErrors: Array<{
      /** Error key (service:operation:code) */
      key: string;
      
      /** Error count */
      count: number;
      
      /** Error rate */
      errorRate: number;
    }>;
  };
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type guard to check if a result is successful
 */
export function isSuccessResult<T>(result: ServiceResult<T>): result is ServiceResult<T> & { success: true; data: T } {
  return result.success;
}

/**
 * Type guard to check if a result is an error
 */
export function isErrorResult<T>(result: ServiceResult<T>): result is ServiceResult<T> & { success: false; error: ServiceError } {
  return !result.success;
}

/**
 * Extracts data from a successful result or throws the error
 */
export function unwrapResult<T>(result: ServiceResult<T>): T {
  if (isSuccessResult(result)) {
    return result.data;
  } else {
    const error = new Error(result.error?.message || 'Unknown service error');
    error.name = result.error?.code || 'ServiceError';
    throw error;
  }
}