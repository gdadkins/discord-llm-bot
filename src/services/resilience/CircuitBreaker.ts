/**
 * Circuit Breaker Pattern Implementation
 * 
 * Generic circuit breaker for preventing cascading failures by monitoring
 * service health and automatically failing fast when services are down.
 * 
 * States:
 * - CLOSED: Normal operation, monitoring for failures
 * - OPEN: Rejecting requests immediately, waiting for reset timeout
 * - HALF_OPEN: Testing recovery with limited retries
 */

import { Mutex } from 'async-mutex';
import { logger } from '../../utils/logger';
import { DEGRADATION_CONSTANTS } from '../../config/constants';

export interface CircuitBreakerConfig {
  /** Maximum failures before opening circuit */
  maxFailures: number;
  /** Time to wait before attempting recovery (ms) */
  resetTimeoutMs: number;
  /** Maximum retries in half-open state */
  halfOpenMaxRetries: number;
  /** Service name for logging */
  serviceName: string;
}

export interface CircuitBreakerMetrics {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

export interface RecoveryMetrics {
  attempts: number;
  lastAttempt: number;
  successfulRecoveries: number;
  averageRecoveryTime: number;
}

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly stateMutex = new Mutex();
  private metrics: CircuitBreakerMetrics;
  private recoveryMetrics: RecoveryMetrics;
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.metrics = this.createInitialMetrics();
    this.recoveryMetrics = {
      attempts: 0,
      lastAttempt: 0,
      successfulRecoveries: 0,
      averageRecoveryTime: 0
    };
  }

  /**
   * Execute operation with circuit breaker protection
   * 
   * @template T - Return type of the operation
   * @param operation - The async operation to execute
   * @returns Promise resolving to operation result
   * @throws Error when circuit is OPEN or operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    await this.checkCircuitState();

    // Track request
    const release = await this.stateMutex.acquire();
    this.metrics.totalRequests++;
    release();

    try {
      const result = await operation();
      await this.recordSuccess();
      return result;
    } catch (error) {
      await this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Get current circuit breaker state and metrics
   */
  getState(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recovery metrics
   */
  getRecoveryMetrics(): RecoveryMetrics {
    return { ...this.recoveryMetrics };
  }

  /**
   * Manually trigger recovery attempt
   */
  async triggerRecovery(): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      if (this.metrics.state === 'open') {
        logger.info(`Manual recovery triggered for ${this.config.serviceName} circuit breaker`);
        this.transitionToHalfOpen();
      }
    } finally {
      release();
    }
  }

  /**
   * Reset circuit breaker to initial state
   */
  async reset(): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      this.metrics = this.createInitialMetrics();
      this.clearRecoveryTimer();
      logger.info(`Circuit breaker reset for ${this.config.serviceName}`);
    } finally {
      release();
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearRecoveryTimer();
  }

  // Private methods

  private createInitialMetrics(): CircuitBreakerMetrics {
    return {
      state: 'closed',
      failureCount: 0,
      lastFailureTime: 0,
      lastSuccessTime: Date.now(),
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0
    };
  }

  private async checkCircuitState(): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      if (this.metrics.state === 'open') {
        const timeSinceFailure = Date.now() - this.metrics.lastFailureTime;
        if (timeSinceFailure < this.config.resetTimeoutMs) {
          const retryInSeconds = Math.ceil((this.config.resetTimeoutMs - timeSinceFailure) / 1000);
          throw new Error(
            `Circuit breaker is OPEN for ${this.config.serviceName}. Next retry in ${retryInSeconds} seconds.`
          );
        } else {
          // Transition to half-open
          this.transitionToHalfOpen();
        }
      }

      if (this.metrics.state === 'half-open' && 
          this.metrics.consecutiveSuccesses >= this.config.halfOpenMaxRetries) {
        throw new Error(
          `Circuit breaker is HALF-OPEN for ${this.config.serviceName} with max retries exceeded`
        );
      }
    } finally {
      release();
    }
  }

  private async recordSuccess(): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      this.metrics.lastSuccessTime = Date.now();
      this.metrics.consecutiveSuccesses++;
      this.metrics.totalSuccesses++;

      // Handle state transitions
      if (this.metrics.state === 'half-open' && 
          this.metrics.consecutiveSuccesses >= this.config.halfOpenMaxRetries) {
        this.transitionToClosed();
        this.recordRecoverySuccess();
      }
    } finally {
      release();
    }
  }

  private async recordFailure(error: unknown): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      this.metrics.failureCount++;
      this.metrics.lastFailureTime = Date.now();
      this.metrics.consecutiveSuccesses = 0;
      this.metrics.totalFailures++;

      // Check if we should open the circuit
      if (this.metrics.failureCount >= this.config.maxFailures) {
        this.transitionToOpen();
      }

      logger.warn(`Circuit breaker failure recorded for ${this.config.serviceName}`, { 
        error,
        failureCount: this.metrics.failureCount,
        state: this.metrics.state
      });
    } finally {
      release();
    }
  }

  private transitionToOpen(): void {
    this.metrics.state = 'open';
    logger.warn(`Circuit breaker OPENED for ${this.config.serviceName} after ${this.metrics.failureCount} failures`);
    
    // Schedule automatic recovery attempt
    this.scheduleRecoveryAttempt();
  }

  private transitionToHalfOpen(): void {
    this.metrics.state = 'half-open';
    this.metrics.consecutiveSuccesses = 0;
    this.recoveryMetrics.attempts++;
    this.recoveryMetrics.lastAttempt = Date.now();
    logger.info(`Circuit breaker moved to HALF-OPEN for ${this.config.serviceName}`);
  }

  private transitionToClosed(): void {
    this.metrics.state = 'closed';
    this.metrics.failureCount = 0;
    this.metrics.consecutiveSuccesses = 0;
    logger.info(`Circuit breaker CLOSED for ${this.config.serviceName} after successful recovery`);
  }

  private recordRecoverySuccess(): void {
    this.recoveryMetrics.successfulRecoveries++;
    
    const recoveryTime = Date.now() - this.recoveryMetrics.lastAttempt;
    if (this.recoveryMetrics.averageRecoveryTime === 0) {
      this.recoveryMetrics.averageRecoveryTime = recoveryTime;
    } else {
      this.recoveryMetrics.averageRecoveryTime = 
        (this.recoveryMetrics.averageRecoveryTime + recoveryTime) / 2;
    }
  }

  private scheduleRecoveryAttempt(): void {
    this.clearRecoveryTimer();
    
    this.recoveryTimer = setTimeout(() => {
      this.stateMutex.acquire().then(release => {
        if (this.metrics.state === 'open') {
          this.transitionToHalfOpen();
        }
        release();
      }).catch(error => {
        logger.error(`Failed to acquire mutex for recovery attempt: ${error}`);
      });
    }, this.config.resetTimeoutMs);
  }

  private clearRecoveryTimer(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }
}

/**
 * Factory function to create circuit breakers with default configuration
 */
export function createCircuitBreaker(
  serviceName: string,
  customConfig?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  const config: CircuitBreakerConfig = {
    serviceName,
    maxFailures: customConfig?.maxFailures ?? DEGRADATION_CONSTANTS.DEFAULT_MAX_FAILURES,
    resetTimeoutMs: customConfig?.resetTimeoutMs ?? DEGRADATION_CONSTANTS.DEFAULT_RESET_TIMEOUT_MS,
    halfOpenMaxRetries: customConfig?.halfOpenMaxRetries ?? DEGRADATION_CONSTANTS.DEFAULT_HALF_OPEN_RETRIES
  };

  return new CircuitBreaker(config);
}