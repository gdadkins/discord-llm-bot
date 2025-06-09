/**
 * Retry Handler Service Interface Definitions
 * 
 * Interfaces for retry logic and error handling.
 */

import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Retry Handler Service Interfaces
// ============================================================================

export interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  retryMultiplier: number;
}

export interface IRetryHandler extends IService {
  /**
   * Executes an operation with retry logic
   */
  executeWithRetry<T>(
    operation: () => Promise<T>, 
    options?: Partial<RetryOptions>,
    isRetryableError?: (error: unknown) => boolean
  ): Promise<T>;
  
  /**
   * Determines if an error is retryable
   */
  isRetryableError(error: unknown): boolean;
  
  /**
   * Gets user-friendly error message
   */
  getUserFriendlyErrorMessage(error: unknown): string;
}