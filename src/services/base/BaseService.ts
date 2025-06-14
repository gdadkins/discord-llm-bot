import { logger } from '../../utils/logger';
import type { IService, ServiceHealthStatus } from '../interfaces';

/**
 * Timer management interface for BaseService
 */
interface ManagedTimer {
  id: string;
  type: 'interval' | 'timeout';
  timer: NodeJS.Timeout;
  callback: () => void;
  intervalMs?: number;
  delayMs?: number;
  createdAt: number;
  lastExecuted?: number;
  errorCount: number;
}

/**
 * Abstract base class for all services implementing IService interface
 * 
 * Provides template method pattern for service lifecycle management:
 * - Initialize: Sets up service resources with error handling
 * - Shutdown: Gracefully cleans up resources including timers
 * - Health Status: Standardized health reporting with buildHealthStatus template
 * - Timer Management: Provides comprehensive timer lifecycle management
 * 
 * Subclasses must implement:
 * - getServiceName(): Returns the service name for logging
 * - performInitialization(): Service-specific initialization logic
 * - performShutdown(): Service-specific cleanup logic
 * - collectServiceMetrics(): Service-specific health metrics collection
 * 
 * Subclasses may optionally override:
 * - isHealthy(): Custom health check logic
 * - getHealthErrors(): Return current health errors
 * - buildHealthStatus(): Complete health status customization (advanced)
 * 
 * Template Method Features:
 * - buildHealthStatus(): Standardized health reporting pattern
 * - Combines timer metrics with service-specific metrics automatically
 * - Ensures consistent health status structure across all services
 * 
 * Timer Management Features:
 * - Automatic timer cleanup on shutdown
 * - Error handling and logging for timer callbacks
 * - Timer health metrics in status reports
 * - Support for both intervals and timeouts
 * - Unique timer ID generation with service prefixes
 */
export abstract class BaseService implements IService {
  protected isInitialized = false;
  protected isShuttingDown = false;
  
  // Timer management
  private readonly timers = new Map<string, ManagedTimer>();
  private timerIdCounter = 0;

  /**
   * Gets the service name for logging and identification
   */
  protected abstract getServiceName(): string;

  /**
   * Performs service-specific initialization
   * @throws Error if initialization fails
   */
  protected abstract performInitialization(): Promise<void>;

  /**
   * Performs service-specific shutdown/cleanup
   */
  protected abstract performShutdown(): Promise<void>;

  /**
   * Collects service-specific metrics for health status reporting
   * Subclasses must implement this method to provide their own metrics
   * @returns Service-specific metrics or undefined if no metrics available
   */
  protected abstract collectServiceMetrics(): Record<string, unknown> | undefined;

  /**
   * Template method for service initialization
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn(`${this.getServiceName()} is already initialized`);
      return;
    }

    try {
      logger.info(`Initializing ${this.getServiceName()}...`);
      await this.performInitialization();
      this.isInitialized = true;
      logger.info(`${this.getServiceName()} initialized successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize ${this.getServiceName()}: ${errorMessage}`, error);
      throw new Error(`${this.getServiceName()} initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Template method for service shutdown
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    try {
      logger.info(`Shutting down ${this.getServiceName()}...`);
      
      // Clear all timers before performing service-specific shutdown
      this.clearAllTimers();
      
      await this.performShutdown();
      logger.info(`${this.getServiceName()} shutdown complete`);
    } catch (error) {
      logger.error(`Error during ${this.getServiceName()} shutdown:`, error);
      // Continue shutdown even if errors occur
    } finally {
      this.isInitialized = false;
      this.isShuttingDown = false;
    }
  }

  /**
   * Public health status interface
   * Uses the buildHealthStatus template method for consistent reporting
   */
  getHealthStatus(): ServiceHealthStatus {
    return this.buildHealthStatus();
  }

  /**
   * Template method for building standardized health status
   * Orchestrates health data collection in a consistent pattern:
   * 1. Determine overall health state
   * 2. Collect service name for identification  
   * 3. Gather error information
   * 4. Compile comprehensive metrics (timers + service-specific)
   * 
   * This template method ensures all services follow the same health reporting pattern
   * while allowing customization through the abstract collectServiceMetrics method.
   * 
   * @returns Standardized health status structure
   */
  protected buildHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.isHealthy(),
      name: this.getServiceName(),
      errors: this.getHealthErrors(),
      metrics: this.getHealthMetrics()
    };
  }

  /**
   * Override to provide custom health check logic
   * Default: healthy if initialized and not shutting down
   */
  protected isHealthy(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }

  /**
   * Override to provide health error messages
   * Default: returns empty array
   */
  protected getHealthErrors(): string[] {
    const errors: string[] = [];
    if (!this.isInitialized) {
      errors.push('Service not initialized');
    }
    if (this.isShuttingDown) {
      errors.push('Service is shutting down');
    }
    return errors;
  }

  /**
   * Compiles comprehensive health metrics combining timer and service-specific data
   * Uses the template method pattern to integrate:
   * - Timer management metrics (intervals, timeouts, error counts)
   * - Service-specific metrics from collectServiceMetrics() implementation
   * 
   * @returns Combined metrics object or undefined if no metrics available
   */
  protected getHealthMetrics(): Record<string, unknown> | undefined {
    const timerMetrics = this.getTimerMetrics();
    const serviceMetrics = this.collectServiceMetrics();
    
    if (!timerMetrics && !serviceMetrics) {
      return undefined;
    }
    
    return {
      ...timerMetrics,
      ...serviceMetrics
    };
  }

  // ============================================================================
  // Timer Management Methods
  // ============================================================================

  /**
   * Creates a managed interval timer
   * 
   * @param name Human-readable name for the timer (used in logging and metrics)
   * @param callback Function to execute on each interval
   * @param interval Interval in milliseconds
   * @returns Unique timer ID for management operations
   * 
   * @example
   * ```typescript
   * const timerId = this.createInterval('cleanup', () => {
   *   this.performCleanup();
   * }, 60000); // Run every minute
   * ```
   */
  protected createInterval(name: string, callback: () => void, interval: number): string {
    const timerId = this.generateTimerId(name);
    const wrappedCallback = this.wrapTimerCallback(timerId, callback);
    
    try {
      const timer = setInterval(wrappedCallback, interval);
      
      const managedTimer: ManagedTimer = {
        id: timerId,
        type: 'interval',
        timer,
        callback,
        intervalMs: interval,
        createdAt: Date.now(),
        errorCount: 0
      };
      
      this.timers.set(timerId, managedTimer);
      
      logger.debug(`Created interval timer: ${timerId} (${name}) - ${interval}ms`, {
        service: this.getServiceName(),
        timerId,
        name,
        interval
      });
      
      return timerId;
    } catch (error) {
      logger.error(`Failed to create interval timer: ${timerId} (${name})`, {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to create interval timer '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates a managed timeout timer
   * 
   * @param name Human-readable name for the timer (used in logging and metrics)
   * @param callback Function to execute after delay
   * @param delay Delay in milliseconds
   * @returns Unique timer ID for management operations
   * 
   * @example
   * ```typescript
   * const timerId = this.createTimeout('delayed-start', () => {
   *   this.startDelayedOperation();
   * }, 5000); // Run after 5 seconds
   * ```
   */
  protected createTimeout(name: string, callback: () => void, delay: number): string {
    const timerId = this.generateTimerId(name);
    const wrappedCallback = this.wrapTimerCallback(timerId, callback);
    
    try {
      const timer = setTimeout(wrappedCallback, delay);
      
      const managedTimer: ManagedTimer = {
        id: timerId,
        type: 'timeout',
        timer,
        callback,
        delayMs: delay,
        createdAt: Date.now(),
        errorCount: 0
      };
      
      this.timers.set(timerId, managedTimer);
      
      logger.debug(`Created timeout timer: ${timerId} (${name}) - ${delay}ms`, {
        service: this.getServiceName(),
        timerId,
        name,
        delay
      });
      
      return timerId;
    } catch (error) {
      logger.error(`Failed to create timeout timer: ${timerId} (${name})`, {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to create timeout timer '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clears a specific managed timer
   * 
   * @param timerId Timer ID returned from createInterval or createTimeout
   * @returns True if timer was found and cleared, false if not found
   * 
   * @example
   * ```typescript
   * const success = this.clearTimer(timerId);
   * if (!success) {
   *   logger.warn('Timer not found or already cleared');
   * }
   * ```
   */
  protected clearTimer(timerId: string): boolean {
    const managedTimer = this.timers.get(timerId);
    if (!managedTimer) {
      logger.debug(`Timer not found for clearing: ${timerId}`, {
        service: this.getServiceName(),
        timerId
      });
      return false;
    }

    try {
      if (managedTimer.type === 'interval') {
        clearInterval(managedTimer.timer);
      } else {
        clearTimeout(managedTimer.timer);
      }
      
      this.timers.delete(timerId);
      
      logger.debug(`Cleared timer: ${timerId}`, {
        service: this.getServiceName(),
        timerId,
        type: managedTimer.type
      });
      
      return true;
    } catch (error) {
      logger.error(`Error clearing timer: ${timerId}`, {
        service: this.getServiceName(),
        timerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Clears all managed timers
   * Automatically called during service shutdown
   * 
   * @example
   * ```typescript
   * // Manual cleanup if needed
   * this.clearAllTimers();
   * ```
   */
  protected clearAllTimers(): void {
    if (this.timers.size === 0) {
      return;
    }

    const timerIds = Array.from(this.timers.keys());
    let clearedCount = 0;
    let errorCount = 0;

    for (const timerId of timerIds) {
      try {
        if (this.clearTimer(timerId)) {
          clearedCount++;
        }
      } catch (error) {
        errorCount++;
        logger.error(`Error clearing timer during shutdown: ${timerId}`, {
          service: this.getServiceName(),
          timerId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info(`Timer cleanup completed`, {
      service: this.getServiceName(),
      clearedCount,
      errorCount,
      totalTimers: timerIds.length
    });
  }

  /**
   * Checks if a timer exists and is active
   * 
   * @param timerId Timer ID to check
   * @returns True if timer exists and is active
   * 
   * @example
   * ```typescript
   * if (this.hasTimer(cleanupTimerId)) {
   *   logger.info('Cleanup timer is still running');
   * }
   * ```
   */
  protected hasTimer(timerId: string): boolean {
    return this.timers.has(timerId);
  }

  /**
   * Gets the count of active timers
   * 
   * @returns Number of active timers
   * 
   * @example
   * ```typescript
   * const count = this.getTimerCount();
   * logger.info(`Service has ${count} active timers`);
   * ```
   */
  protected getTimerCount(): number {
    return this.timers.size;
  }

  /**
   * Gets information about a specific timer
   * 
   * @param timerId Timer ID to query
   * @returns Timer information or undefined if not found
   * 
   * @example
   * ```typescript
   * const info = this.getTimerInfo(timerId);
   * if (info) {
   *   logger.info(`Timer created ${Date.now() - info.createdAt}ms ago`);
   * }
   * ```
   */
  protected getTimerInfo(timerId: string): Omit<ManagedTimer, 'timer' | 'callback'> | undefined {
    const managedTimer = this.timers.get(timerId);
    if (!managedTimer) {
      return undefined;
    }

    return {
      id: managedTimer.id,
      type: managedTimer.type,
      intervalMs: managedTimer.intervalMs,
      delayMs: managedTimer.delayMs,
      createdAt: managedTimer.createdAt,
      lastExecuted: managedTimer.lastExecuted,
      errorCount: managedTimer.errorCount
    };
  }

  // ============================================================================
  // Private Timer Management Helpers
  // ============================================================================

  /**
   * Generates unique timer ID with service prefix
   */
  private generateTimerId(name: string): string {
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const serviceName = this.getServiceName().replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${serviceName}_${sanitizedName}_${++this.timerIdCounter}_${Date.now()}`;
  }

  /**
   * Wraps timer callback with error handling and metrics tracking
   */
  private wrapTimerCallback(timerId: string, originalCallback: () => void): () => void {
    return () => {
      const managedTimer = this.timers.get(timerId);
      if (!managedTimer) {
        logger.warn(`Timer callback executed for unknown timer: ${timerId}`, {
          service: this.getServiceName(),
          timerId
        });
        return;
      }

      try {
        managedTimer.lastExecuted = Date.now();
        originalCallback();
      } catch (error) {
        managedTimer.errorCount++;
        logger.error(`Timer callback error: ${timerId}`, {
          service: this.getServiceName(),
          timerId,
          errorCount: managedTimer.errorCount,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
      } finally {
        // If this is a timeout, remove it since it won't run again
        if (managedTimer.type === 'timeout') {
          this.timers.delete(timerId);
        }
      }
    };
  }

  /**
   * Generates timer metrics for health status
   */
  private getTimerMetrics(): Record<string, unknown> | undefined {
    if (this.timers.size === 0) {
      return undefined;
    }

    const now = Date.now();
    const timerStats = {
      count: this.timers.size,
      byType: { interval: 0, timeout: 0 },
      totalErrors: 0,
      oldestTimer: now,
      newestTimer: 0,
      timersWithErrors: 0
    };

    for (const timer of this.timers.values()) {
      timerStats.byType[timer.type]++;
      timerStats.totalErrors += timer.errorCount;
      
      if (timer.errorCount > 0) {
        timerStats.timersWithErrors++;
      }
      
      if (timer.createdAt < timerStats.oldestTimer) {
        timerStats.oldestTimer = timer.createdAt;
      }
      
      if (timer.createdAt > timerStats.newestTimer) {
        timerStats.newestTimer = timer.createdAt;
      }
    }

    return {
      timers: {
        ...timerStats,
        oldestTimerAgeMs: now - timerStats.oldestTimer,
        newestTimerAgeMs: now - timerStats.newestTimer
      }
    };
  }
}