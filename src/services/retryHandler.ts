import { logger } from '../utils/logger';
import type { IService, ServiceHealthStatus } from './interfaces';

interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  retryMultiplier: number;
}

export interface IRetryHandler extends IService {
  executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>,
    isRetryableError?: (error: unknown) => boolean
  ): Promise<T>;
  isRetryableError(error: unknown): boolean;
  getUserFriendlyErrorMessage(error: unknown): string;
}

export class RetryHandler implements IRetryHandler {
  private readonly defaultOptions: RetryOptions;
  private operationCount = 0;
  private successCount = 0;
  private failureCount = 0;

  constructor(
    maxRetries: number = 3,
    retryDelay: number = 1000,
    retryMultiplier: number = 2.0
  ) {
    this.defaultOptions = {
      maxRetries,
      retryDelay,
      retryMultiplier
    };
  }

  async initialize(): Promise<void> {
    logger.info('RetryHandler initialized', {
      maxRetries: this.defaultOptions.maxRetries,
      retryDelay: this.defaultOptions.retryDelay,
      retryMultiplier: this.defaultOptions.retryMultiplier
    });
  }

  async shutdown(): Promise<void> {
    logger.info('RetryHandler shutdown complete', {
      totalOperations: this.operationCount,
      successes: this.successCount,
      failures: this.failureCount,
      successRate: this.operationCount > 0 ? (this.successCount / this.operationCount * 100).toFixed(1) + '%' : 'N/A'
    });
  }

  getHealthStatus(): ServiceHealthStatus {
    const successRate = this.operationCount > 0 ? this.successCount / this.operationCount : 1;
    const isHealthy = successRate >= 0.8; // Consider healthy if 80%+ success rate

    return {
      healthy: isHealthy,
      name: 'RetryHandler',
      errors: isHealthy ? [] : [`Low success rate: ${(successRate * 100).toFixed(1)}%`],
      metrics: {
        totalOperations: this.operationCount,
        successCount: this.successCount,
        failureCount: this.failureCount,
        successRate: (successRate * 100).toFixed(1) + '%'
      }
    };
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>,
    isRetryableError?: (error: unknown) => boolean
  ): Promise<T> {
    const finalOptions = { ...this.defaultOptions, ...options };
    const retryCheck = isRetryableError || this.isRetryableError.bind(this);
    
    this.operationCount++;
    let lastError: unknown;

    for (let attempt = 0; attempt <= finalOptions.maxRetries; attempt++) {
      try {
        const result = await operation();
        this.successCount++;
        
        if (attempt > 0) {
          logger.info(`Operation succeeded on retry attempt ${attempt}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        logger.warn(`Operation attempt ${attempt + 1} failed:`, error);
        
        // If this is the last attempt, break out of loop
        if (attempt >= finalOptions.maxRetries) {
          break;
        }
        
        // Check if we should retry this error
        if (!retryCheck(error)) {
          logger.info('Error is not retryable, breaking retry loop');
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = finalOptions.retryDelay * Math.pow(finalOptions.retryMultiplier, attempt);
        logger.info(
          `Retrying in ${delay}ms (attempt ${attempt + 1}/${finalOptions.maxRetries})`
        );
        
        await this.sleep(delay);
      }
    }
    
    // All retries failed
    this.failureCount++;
    logger.error(
      `All ${finalOptions.maxRetries + 1} attempts failed. Last error:`,
      lastError
    );
    
    throw lastError;
  }

  isRetryableError(error: unknown): boolean {
    if (!error) return false;
    
    const err = error as Record<string, unknown>;
    const errorMessage = (typeof err.message === 'string' ? err.message : '').toLowerCase();
    const errorCode = typeof err.code === 'number' ? err.code : (typeof err.status === 'number' ? err.status : 0);

    // Network and temporary server errors
    if (errorCode >= 500 && errorCode < 600) return true;
    if (errorCode === 408 || errorCode === 429) return true; // Timeout or rate limit

    // Network connectivity issues
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('socket hang up')
    ) {
      return true;
    }

    // Temporary Gemini API issues
    if (
      errorMessage.includes('service unavailable') ||
      errorMessage.includes('temporarily unavailable') ||
      errorMessage.includes('try again')
    ) {
      return true;
    }

    return false;
  }

  getUserFriendlyErrorMessage(error: unknown): string {
    if (!error) return 'An unknown error occurred. Please try again.';
    
    const err = error as Record<string, unknown>;
    const errorMessage = (typeof err.message === 'string' ? err.message : '').toLowerCase();
    const errorCode = typeof err.code === 'number' ? err.code : (typeof err.status === 'number' ? err.status : 0);

    // Authentication errors
    if (
      errorCode === 401 ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('api key') ||
      errorMessage.includes('authentication')
    ) {
      return 'There\'s an authentication issue with the AI service. Please contact the bot administrator.';
    }

    // Rate limiting (different from our internal rate limiting)
    if (
      errorCode === 429 ||
      errorMessage.includes('quota') ||
      errorMessage.includes('rate limit')
    ) {
      if (errorMessage.includes('daily')) {
        return 'The AI service has reached its daily usage limit. Please try again tomorrow or contact the administrator.';
      } else if (errorMessage.includes('billing') || errorMessage.includes('payment')) {
        return 'There\'s a billing issue with the AI service. Please contact the bot administrator.';
      } else {
        return 'The AI service is currently overloaded. Please try again in a few minutes.';
      }
    }

    // Server errors
    if (errorCode >= 500 && errorCode < 600) {
      if (errorCode === 503) {
        return 'The AI service is temporarily down for maintenance. Please try again in a few minutes.';
      } else if (errorCode === 502 || errorCode === 504) {
        return 'There\'s a temporary gateway issue with the AI service. Please try again shortly.';
      } else {
        return 'The AI service is experiencing technical difficulties. Please try again in a moment.';
      }
    }

    // Network errors
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('enotfound')
    ) {
      return 'There\'s a network connectivity issue. Please check your connection and try again.';
    }

    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return 'The request timed out. This might be due to a complex question - try simplifying your message or try again.';
    }

    // Model specific errors
    if (errorMessage.includes('model') && errorMessage.includes('not found')) {
      return 'The requested AI model is temporarily unavailable. Please try again later.';
    }

    // Safety/content filtering errors
    if (
      errorMessage.includes('safety') ||
      errorMessage.includes('content policy') ||
      errorMessage.includes('blocked')
    ) {
      return 'Your message was blocked by content filters. Please rephrase your request using different language.';
    }

    // Content too large
    if (
      errorMessage.includes('too large') ||
      errorMessage.includes('exceeds') ||
      errorMessage.includes('limit') ||
      errorMessage.includes('context length')
    ) {
      if (errorMessage.includes('context')) {
        return 'Our conversation is too long. Use `/clear` to reset the conversation and try again.';
      } else {
        return 'Your message is too long. Please break it into smaller parts (under 100,000 characters).';
      }
    }

    // Image/multimodal errors
    if (
      errorMessage.includes('image') ||
      errorMessage.includes('attachment') ||
      errorMessage.includes('multimodal')
    ) {
      return 'There was an issue processing your image. Please ensure it\'s a valid image file (JPEG, PNG, WebP, or GIF) under 20MB.';
    }

    // Generic fallback
    return 'I encountered a technical issue. Please try again, and if the problem persists, contact the bot administrator.';
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}