import { logger } from '../../utils/logger';
import { ResourceManager } from '../../utils/ResourceManager';
import { enrichError, SystemError } from '../../utils/ErrorHandlingUtils';
import type { IService, ServiceHealthStatus } from '../interfaces';
import { wrapServiceMethod, ServiceMethodProtection } from '../../utils/serviceProtection';

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
  // Timer coalescing properties
  originalInterval?: number;
  coalescedInterval?: number;
  coalescingGroup?: string;
}

/**
 * Service lifecycle states
 */
export enum ServiceState {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  READY = 'ready',
  SHUTTING_DOWN = 'shutting_down',
  SHUTDOWN = 'shutdown',
  FAILED = 'failed'
}

/**
 * Service lifecycle events
 */
export interface ServiceLifecycleEvents {
  'state-changed': (oldState: ServiceState, newState: ServiceState) => void;
  'initialization-started': () => void;
  'initialization-completed': (duration: number) => void;
  'initialization-failed': (error: Error) => void;
  'shutdown-started': () => void;
  'shutdown-completed': (duration: number) => void;
  'shutdown-failed': (error: Error) => void;
  'resource-registered': (type: string, id: string) => void;
  'resource-cleanup-failed': (type: string, id: string, error: Error) => void;
}

/**
 * Timer coalescing group for efficient timer management
 */
interface TimerCoalescingGroup {
  interval: number;
  timer: NodeJS.Timeout;
  callbacks: Map<string, () => void>;
  lastExecuted: number;
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
  
  // Enhanced lifecycle management
  protected serviceState: ServiceState = ServiceState.CREATED;
  protected readonly resources = new ResourceManager();
  protected initPromise?: Promise<void>;
  protected shutdownPromise?: Promise<void>;
  protected ongoingOperations = new Set<Promise<any>>();
  protected acceptingWork = true;
  
  // Service lifecycle tracking
  protected initStartTime?: number;
  protected shutdownStartTime?: number;
  private lifecycleEvents: ServiceLifecycleEvents = {
    'state-changed': () => {},
    'initialization-started': () => {},
    'initialization-completed': () => {},
    'initialization-failed': () => {},
    'shutdown-started': () => {},
    'shutdown-completed': () => {},
    'shutdown-failed': () => {},
    'resource-registered': () => {},
    'resource-cleanup-failed': () => {}
  };
  
  // Timer management
  private readonly timers = new Map<string, ManagedTimer>();
  private timerIdCounter = 0;
  
  // Timer coalescing for efficiency
  private readonly coalescingGroups = new Map<number, TimerCoalescingGroup>();
  private readonly COALESCING_INTERVAL = 10000; // 10 seconds
  private readonly MIN_COALESCING_INTERVAL = 5000; // Don't coalesce timers under 5s

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
   * Stop accepting new work - called during shutdown
   * Subclasses can override to implement custom logic
   */
  protected stopAcceptingWork(): void {
    this.acceptingWork = false;
  }
  
  /**
   * Wait for ongoing operations to complete
   * Subclasses can override to implement custom logic
   */
  protected async waitForOngoingOperations(): Promise<void> {
    if (this.ongoingOperations.size === 0) {
      return;
    }
    
    logger.info(`Waiting for ${this.ongoingOperations.size} ongoing operations to complete`, {
      service: this.getServiceName()
    });
    
    try {
      await Promise.allSettled(Array.from(this.ongoingOperations));
    } catch (error) {
      logger.warn('Some ongoing operations failed during shutdown', {
        service: this.getServiceName(),
        error
      });
    }
    
    this.ongoingOperations.clear();
  }

  /**
   * Template method for service initialization with enhanced lifecycle management
   */
  async initialize(): Promise<void> {
    if (this.serviceState !== ServiceState.CREATED) {
      if (this.serviceState === ServiceState.READY) {
        logger.warn(`${this.getServiceName()} is already initialized`);
        return;
      }
      
      if (this.serviceState === ServiceState.INITIALIZING) {
        // Return existing initialization promise
        return this.initPromise;
      }
      
      throw new SystemError(
        `Cannot initialize service in state ${this.serviceState}`,
        'INVALID_STATE',
        { service: this.getServiceName(), currentState: this.serviceState }
      );
    }

    this.setState(ServiceState.INITIALIZING);
    this.initStartTime = Date.now();
    this.emit('initialization-started');

    try {
      logger.info(`Initializing ${this.getServiceName()}...`);
      
      // Store initialization promise for potential concurrent calls
      this.initPromise = this.performInitialization();
      await this.initPromise;
      
      // Register service-level cleanup
      this.resources.register({
        type: 'service-lifecycle',
        id: 'main',
        cleanup: () => this.performShutdown(),
        priority: 'critical'
      });
      
      this.setState(ServiceState.READY);
      this.isInitialized = true;
      
      const duration = Date.now() - this.initStartTime!;
      logger.info(`${this.getServiceName()} initialized successfully`, { duration });
      this.emit('initialization-completed', duration);
      
    } catch (error) {
      this.setState(ServiceState.FAILED);
      
      // Cleanup any partial initialization
      await this.emergencyCleanup();
      
      const enrichedError = enrichError(error as Error, {
        service: this.getServiceName(),
        phase: 'initialization',
        duration: this.initStartTime ? Date.now() - this.initStartTime : 0
      });
      
      logger.error(`Failed to initialize ${this.getServiceName()}`, enrichedError);
      this.emit('initialization-failed', enrichedError);
      
      throw enrichedError;
    }
  }

  /**
   * Template method for service shutdown with comprehensive lifecycle management
   */
  async shutdown(): Promise<void> {
    if (this.serviceState === ServiceState.SHUTDOWN) {
      return this.shutdownPromise!;
    }
    
    if (this.serviceState === ServiceState.SHUTTING_DOWN) {
      return this.shutdownPromise!;
    }

    if (this.serviceState !== ServiceState.READY && this.serviceState !== ServiceState.FAILED) {
      logger.warn(`Shutting down service in unexpected state: ${this.serviceState}`, {
        service: this.getServiceName(),
        currentState: this.serviceState
      });
    }

    this.setState(ServiceState.SHUTTING_DOWN);
    this.shutdownStartTime = Date.now();
    this.emit('shutdown-started');
    
    this.shutdownPromise = this.performFullShutdown();
    
    try {
      await this.shutdownPromise;
      this.setState(ServiceState.SHUTDOWN);
      
      const duration = Date.now() - this.shutdownStartTime!;
      logger.info(`${this.getServiceName()} shutdown complete`, { duration });
      this.emit('shutdown-completed', duration);
      
    } catch (error) {
      const enrichedError = enrichError(error as Error, {
        service: this.getServiceName(),
        phase: 'shutdown',
        duration: this.shutdownStartTime ? Date.now() - this.shutdownStartTime : 0
      });
      
      logger.error(`Error during ${this.getServiceName()} shutdown`, enrichedError);
      this.emit('shutdown-failed', enrichedError);
      
      throw enrichedError;
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
   * Creates a managed interval timer with optional coalescing
   * 
   * @param name Human-readable name for the timer (used in logging and metrics)
   * @param callback Function to execute on each interval
   * @param interval Interval in milliseconds
   * @param options Optional timer options including coalescing
   * @returns Unique timer ID for management operations
   * 
   * @example
   * ```typescript
   * const timerId = this.createInterval('cleanup', () => {
   *   this.performCleanup();
   * }, 60000); // Run every minute
   * 
   * // With coalescing
   * const timerId = this.createCoalescedInterval('stats', () => {
   *   this.updateStats();
   * }, 15000); // Will be coalesced to 20s group
   * ```
   */
  protected createInterval(name: string, callback: () => void, interval: number, options?: { coalesce?: boolean }): string {
    // Check if we should coalesce this timer
    const shouldCoalesce = options?.coalesce !== false && 
                          interval >= this.MIN_COALESCING_INTERVAL;
    
    if (shouldCoalesce) {
      return this.createCoalescedInterval(name, callback, interval);
    }
    
    // Create regular timer
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
      // Handle coalesced timers
      if (managedTimer.coalescedInterval) {
        const group = this.coalescingGroups.get(managedTimer.coalescedInterval);
        if (group) {
          group.callbacks.delete(timerId);
          
          // If this was the last callback in the group, clear the group timer
          if (group.callbacks.size === 0) {
            clearInterval(group.timer);
            this.coalescingGroups.delete(managedTimer.coalescedInterval);
            
            logger.info(`Removed empty coalescing group: ${managedTimer.coalescedInterval}ms`, {
              service: this.getServiceName()
            });
          }
        }
      } else {
        // Regular timer
        if (managedTimer.type === 'interval') {
          clearInterval(managedTimer.timer);
        } else {
          clearTimeout(managedTimer.timer);
        }
      }
      
      this.timers.delete(timerId);
      
      logger.debug(`Cleared timer: ${timerId}`, {
        service: this.getServiceName(),
        timerId,
        type: managedTimer.type,
        wasCoalesced: !!managedTimer.coalescedInterval
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
    if (this.timers.size === 0 && this.coalescingGroups.size === 0) {
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
    
    // Clear any remaining coalescing groups
    for (const [interval, group] of this.coalescingGroups) {
      try {
        clearInterval(group.timer);
        this.coalescingGroups.delete(interval);
      } catch (error) {
        errorCount++;
        logger.error(`Error clearing coalescing group: ${interval}ms`, {
          service: this.getServiceName(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info(`Timer cleanup completed`, {
      service: this.getServiceName(),
      clearedCount,
      errorCount,
      totalTimers: timerIds.length,
      coalescingGroupsCleared: this.coalescingGroups.size
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

  /**
   * Creates a coalesced interval timer that runs with other timers in the same time window
   * 
   * @param name Timer name
   * @param callback Callback function
   * @param requestedInterval Requested interval in milliseconds
   * @returns Timer ID
   */
  protected createCoalescedInterval(name: string, callback: () => void, requestedInterval: number): string {
    // Round up to nearest coalescing interval
    const coalescedInterval = Math.ceil(requestedInterval / this.COALESCING_INTERVAL) * this.COALESCING_INTERVAL;
    
    const timerId = this.generateTimerId(name);
    const wrappedCallback = this.wrapTimerCallback(timerId, callback);
    
    // Get or create coalescing group
    let group = this.coalescingGroups.get(coalescedInterval);
    if (!group) {
      // Create new coalescing group
      const groupTimer = setInterval(() => {
        this.executeCoalescedCallbacks(coalescedInterval);
      }, coalescedInterval);
      
      group = {
        interval: coalescedInterval,
        timer: groupTimer,
        callbacks: new Map(),
        lastExecuted: Date.now()
      };
      
      this.coalescingGroups.set(coalescedInterval, group);
      
      logger.info(`Created timer coalescing group for ${coalescedInterval}ms interval`, {
        service: this.getServiceName(),
        coalescedInterval,
        originalInterval: requestedInterval
      });
    }
    
    // Add callback to group
    group.callbacks.set(timerId, wrappedCallback);
    
    // Create managed timer entry (without actual timer)
    const managedTimer: ManagedTimer = {
      id: timerId,
      type: 'interval',
      timer: group.timer, // Reference to group timer
      callback,
      intervalMs: requestedInterval,
      originalInterval: requestedInterval,
      coalescedInterval,
      coalescingGroup: `${coalescedInterval}ms`,
      createdAt: Date.now(),
      errorCount: 0
    };
    
    this.timers.set(timerId, managedTimer);
    
    logger.debug(`Created coalesced interval timer: ${timerId} (${name})`, {
      service: this.getServiceName(),
      timerId,
      name,
      requestedInterval,
      coalescedInterval,
      groupSize: group.callbacks.size
    });
    
    return timerId;
  }
  
  /**
   * Execute all callbacks in a coalescing group
   */
  private executeCoalescedCallbacks(interval: number): void {
    const group = this.coalescingGroups.get(interval);
    if (!group) return;
    
    const startTime = Date.now();
    group.lastExecuted = startTime;
    
    let executedCount = 0;
    let errorCount = 0;
    
    // Execute all callbacks in the group
    for (const [timerId, callback] of group.callbacks) {
      try {
        callback();
        executedCount++;
      } catch (error) {
        errorCount++;
        logger.error(`Error in coalesced timer callback: ${timerId}`, {
          service: this.getServiceName(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    if (executionTime > interval * 0.1) { // Warn if execution takes more than 10% of interval
      logger.warn(`Coalesced timer group execution took ${executionTime}ms`, {
        service: this.getServiceName(),
        interval,
        callbackCount: group.callbacks.size,
        executedCount,
        errorCount
      });
    }
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
      timersWithErrors: 0,
      coalescedTimers: 0,
      coalescingGroups: this.coalescingGroups.size,
      totalCallbacksInGroups: 0
    };

    for (const timer of this.timers.values()) {
      timerStats.byType[timer.type]++;
      timerStats.totalErrors += timer.errorCount;
      
      if (timer.errorCount > 0) {
        timerStats.timersWithErrors++;
      }
      
      if (timer.coalescedInterval) {
        timerStats.coalescedTimers++;
      }
      
      if (timer.createdAt < timerStats.oldestTimer) {
        timerStats.oldestTimer = timer.createdAt;
      }
      
      if (timer.createdAt > timerStats.newestTimer) {
        timerStats.newestTimer = timer.createdAt;
      }
    }
    
    // Count total callbacks in coalescing groups
    for (const group of this.coalescingGroups.values()) {
      timerStats.totalCallbacksInGroups += group.callbacks.size;
    }
    
    // Calculate timer efficiency
    const timerEfficiency = timerStats.count > 0 ? 
      ((timerStats.coalescedTimers / timerStats.count) * 100).toFixed(1) : '0';

    return {
      timers: {
        ...timerStats,
        oldestTimerAgeMs: now - timerStats.oldestTimer,
        newestTimerAgeMs: now - timerStats.newestTimer,
        timerEfficiency: `${timerEfficiency}%`,
        overheadReduction: timerStats.coalescedTimers > 0 ? 
          `${((1 - (this.coalescingGroups.size / timerStats.count)) * 100).toFixed(1)}%` : '0%'
      }
    };
  }

  // ============================================================================
  // Enhanced Lifecycle Management Methods
  // ============================================================================

  /**
   * Set service state and emit events
   */
  private setState(newState: ServiceState): void {
    const oldState = this.serviceState;
    this.serviceState = newState;
    
    if (oldState !== newState) {
      logger.debug('Service state changed', {
        service: this.getServiceName(),
        from: oldState,
        to: newState
      });
      
      this.emit('state-changed', oldState, newState);
    }
  }

  /**
   * Get current service state
   */
  getServiceState(): ServiceState {
    return this.serviceState;
  }

  /**
   * Check if service is accepting work
   */
  isAcceptingWork(): boolean {
    return this.acceptingWork && this.serviceState === ServiceState.READY;
  }

  /**
   * Register an ongoing operation
   */
  protected registerOperation<T>(operation: Promise<T>): Promise<T> {
    if (!this.isAcceptingWork()) {
      throw new SystemError(
        'Service is not accepting new operations',
        'SERVICE_NOT_ACCEPTING_WORK',
        { service: this.getServiceName(), state: this.serviceState }
      );
    }

    this.ongoingOperations.add(operation);
    
    // Auto-remove when completed
    operation.finally(() => {
      this.ongoingOperations.delete(operation);
    });

    return operation;
  }

  /**
   * Get resource metrics for health reporting
   */
  private getResourceMetrics(): Record<string, unknown> | undefined {
    const stats = this.resources.getResourceStats();
    
    if (stats.total === 0) {
      return undefined;
    }

    return {
      resources: {
        total: stats.total,
        byType: stats.byType,
        byPriority: stats.byPriority,
        averageAge: stats.averageAge,
        failedCleanups: stats.failedCleanups,
        leakDetected: stats.leakDetected,
        pendingCleanup: stats.pendingCleanup
      }
    };
  }

  /**
   * Get lifecycle metrics for health reporting
   */
  private getLifecycleMetrics(): Record<string, unknown> | undefined {
    const now = Date.now();
    const metrics: Record<string, unknown> = {
      lifecycle: {
        state: this.serviceState,
        acceptingWork: this.acceptingWork,
        ongoingOperations: this.ongoingOperations.size,
        uptime: this.initStartTime ? now - this.initStartTime : 0
      }
    };

    if (this.initStartTime) {
      metrics.lifecycle = {
        ...metrics.lifecycle as Record<string, unknown>,
        initDuration: this.serviceState === ServiceState.READY 
          ? (this.shutdownStartTime || now) - this.initStartTime
          : now - this.initStartTime
      };
    }

    if (this.shutdownStartTime) {
      metrics.lifecycle = {
        ...metrics.lifecycle as Record<string, unknown>,
        shutdownDuration: now - this.shutdownStartTime
      };
    }

    return metrics;
  }

  /**
   * Perform comprehensive shutdown with resource cleanup
   */
  private async performFullShutdown(): Promise<void> {
    logger.info(`Starting comprehensive shutdown for ${this.getServiceName()}`);
    
    try {
      // Step 1: Stop accepting new work
      this.stopAcceptingWork();
      
      // Step 2: Wait for ongoing operations
      await this.waitForOngoingOperations();
      
      // Step 3: Clear all timers
      this.clearAllTimers();
      
      // Step 4: Service-specific shutdown
      await this.performShutdown();
      
      // Step 5: Clean up all resources
      await this.resources.cleanup();
      
      logger.info(`Comprehensive shutdown completed for ${this.getServiceName()}`);
    } catch (error) {
      logger.error(`Error during comprehensive shutdown for ${this.getServiceName()}`, error);
      
      // Attempt emergency cleanup
      await this.emergencyCleanup();
      throw error;
    }
  }

  /**
   * Emergency cleanup for failed initialization or shutdown
   */
  private async emergencyCleanup(): Promise<void> {
    logger.warn(`Performing emergency cleanup for ${this.getServiceName()}`);
    
    try {
      // Force cleanup all resources
      await this.resources.cleanup(undefined, { force: true, timeout: 5000 });
      
      // Clear timers
      this.clearAllTimers();
      
      // Clear ongoing operations
      this.ongoingOperations.clear();
      
    } catch (error) {
      logger.error(`Emergency cleanup failed for ${this.getServiceName()}`, error);
    }
  }

  /**
   * Create a managed interval with resource tracking
   */
  protected createManagedInterval(
    name: string, 
    callback: () => void | Promise<void>, 
    interval: number,
    options?: { priority?: 'low' | 'medium' | 'high' | 'critical'; coalesce?: boolean }
  ): string {
    const timerId = this.createInterval(name, () => {
      this.executeTimerCallback(callback, name);
    }, interval, options);

    // Register with resource manager for advanced tracking
    this.resources.register({
      type: 'managed-interval',
      id: timerId,
      cleanup: () => {
        this.clearTimer(timerId);
      },
      priority: options?.priority || 'medium',
      metadata: {
        service: this.getServiceName(),
        name,
        interval
      }
    });

    this.emit('resource-registered', 'interval', timerId);
    return timerId;
  }

  /**
   * Create a managed timeout with resource tracking
   */
  protected createManagedTimeout(
    name: string,
    callback: () => void | Promise<void>,
    delay: number,
    options?: { priority?: 'low' | 'medium' | 'high' | 'critical' }
  ): string {
    const timerId = this.createTimeout(name, () => {
      this.executeTimerCallback(callback, name);
    }, delay);

    // Register with resource manager for advanced tracking
    this.resources.register({
      type: 'managed-timeout',
      id: timerId,
      cleanup: () => {
        this.clearTimer(timerId);
      },
      priority: options?.priority || 'medium',
      metadata: {
        service: this.getServiceName(),
        name,
        delay
      }
    });

    this.emit('resource-registered', 'timeout', timerId);
    return timerId;
  }

  /**
   * Execute timer callback with proper error handling
   */
  private async executeTimerCallback(
    callback: () => void | Promise<void>,
    name: string
  ): Promise<void> {
    if (this.serviceState !== ServiceState.READY) {
      logger.debug(`Skipping timer callback '${name}' - service not ready`, {
        service: this.getServiceName(),
        state: this.serviceState
      });
      return;
    }

    try {
      await Promise.resolve(callback());
    } catch (error) {
      const enrichedError = enrichError(error as Error, {
        service: this.getServiceName(),
        timerName: name,
        phase: 'timer-callback'
      });
      
      logger.error(`Timer callback '${name}' failed`, enrichedError);
      this.emit('resource-cleanup-failed', 'timer-callback', name, enrichedError);
    }
  }

  /**
   * Event emitter for lifecycle events
   */
  private emit<K extends keyof ServiceLifecycleEvents>(
    event: K,
    ...args: Parameters<ServiceLifecycleEvents[K]>
  ): void {
    try {
      const handler = this.lifecycleEvents[event];
      if (handler) {
        (handler as Function)(...args);
      }
    } catch (error) {
      logger.error(`Error in lifecycle event handler: ${event}`, {
        service: this.getServiceName(),
        error
      });
    }
  }

  /**
   * Register lifecycle event handler
   */
  on<K extends keyof ServiceLifecycleEvents>(
    event: K,
    handler: ServiceLifecycleEvents[K]
  ): void {
    this.lifecycleEvents[event] = handler;
  }

  /**
   * Get comprehensive service status including lifecycle and resources
   */
  getServiceStatus(): {
    name: string;
    state: ServiceState;
    healthy: boolean;
    acceptingWork: boolean;
    uptime: number;
    resources: ReturnType<ResourceManager['getResourceStats']>;
    timers: number;
    ongoingOperations: number;
    errors: string[];
  } {
    const now = Date.now();
    
    return {
      name: this.getServiceName(),
      state: this.serviceState,
      healthy: this.isHealthy(),
      acceptingWork: this.acceptingWork,
      uptime: this.initStartTime ? now - this.initStartTime : 0,
      resources: this.resources.getResourceStats(),
      timers: this.getTimerCount(),
      ongoingOperations: this.ongoingOperations.size,
      errors: this.getHealthErrors()
    };
  }
}