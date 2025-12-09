import { logger } from '../../utils/logger';
import { ResourceManager } from '../../utils/ResourceManager';
import { enrichError, SystemError } from '../../utils/ErrorHandlingUtils';
import type { IService, ServiceHealthStatus } from '../interfaces';
import { ServiceTimerManager } from './components/ServiceTimerManager';
import { ServiceLifecycleManager, ServiceState, ServiceLifecycleEvents } from './components/ServiceLifecycleManager';
import { ServiceHealthMonitor } from './components/ServiceHealthMonitor';

// Re-export types for compatibility
export { ServiceState, ServiceLifecycleEvents };

/**
 * Abstract base class for all services implementing IService interface
 * 
 * Refactored to use composition with specialized managers:
 * - ServiceLifecycleManager: Manages state, transitions, and events
 * - ServiceTimerManager: Manages intervals, timeouts, and coalescing
 * - ServiceHealthMonitor: Manages health status reporting
 * 
 * Maintains the same protected API for subclasses.
 */
export abstract class BaseService implements IService {
  // Components
  protected readonly resources = new ResourceManager();
  protected readonly timerManager: ServiceTimerManager;
  protected readonly lifecycleManager: ServiceLifecycleManager;
  protected readonly serviceHealthMonitor: ServiceHealthMonitor;

  constructor() {
    // Note: getServiceName() is abstract, but we trust subclasses to provide a stable string
    // or simple getter that works during construction.
    const name = this.getServiceName();
    this.timerManager = new ServiceTimerManager(name);
    this.lifecycleManager = new ServiceLifecycleManager(name);
    this.serviceHealthMonitor = new ServiceHealthMonitor(name, this.lifecycleManager, this.timerManager, this.resources);

    // Re-emit lifecycle events from manager
    this.setupEventForwarding();
  }

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
   * Setup event forwarding from lifecycle manager to this instance
   * This ensures subclasses listening on 'this' still get events
   */
  private setupEventForwarding(): void {
    // We can't easily iterate all event types, so we wrap the 'on' method or forward well-known ones if needed.
    // However, the original BaseService handled its own events. 
    // The new LifecycleManager handles them.
    // But implementation of `on` below delegates to LifecycleManager.
    // So 'this.emit' in BaseService needs to delegate too.
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Initialize service
   */
  async initialize(): Promise<void> {
    await this.lifecycleManager.handleInitialization(async () => {
      await this.performInitialization();

      // Register service-level cleanup
      this.resources.register({
        type: 'service-lifecycle',
        id: 'main',
        cleanup: () => this.performShutdown(),
        priority: 'critical'
      });
    });
  }

  /**
   * Shutdown service
   */
  async shutdown(): Promise<void> {
    await this.lifecycleManager.handleShutdown(async () => {
      // Step 1: Stop accepting new work
      this.stopAcceptingWork();

      // Step 2: Wait for ongoing operations
      await this.waitForOngoingOperations();

      // Step 3: Clear all timers
      this.timerManager.clearAllTimers();

      // Step 4: Service-specific shutdown
      await this.performShutdown();

      // Step 5: Clean up all resources
      await this.resources.cleanup();
    });

    // Attempt emergency cleanup if something leaked? 
    // The lifecycle manager doesn't do resource cleanup automatically in its shutdown fn wrapper
    // except what we put in the callback.
  }

  /**
   * Stop accepting new work
   */
  protected stopAcceptingWork(): void {
    this.lifecycleManager.stopAcceptingWork();
  }

  /**
   * Wait for ongoing operations
   */
  protected async waitForOngoingOperations(): Promise<void> {
    await this.lifecycleManager.waitForOngoingOperations();
  }

  /**
   * Register an ongoing operation
   */
  protected registerOperation<T>(operation: Promise<T>): Promise<T> {
    return this.lifecycleManager.registerOperation(operation);
  }

  // ============================================================================
  // Health Methods
  // ============================================================================

  getHealthStatus(): ServiceHealthStatus {
    return this.buildHealthStatus();
  }

  protected buildHealthStatus(): ServiceHealthStatus {
    return this.serviceHealthMonitor.buildHealthStatus(
      this.isHealthy(),
      this.getHealthErrors(),
      this.getHealthMetrics()
    );
  }

  protected isHealthy(): boolean {
    const state = this.lifecycleManager.state;
    // Default logic: healthy if initialized (READY) and not shutting down
    // The health monitor uses similar logic but we can override it here if subclasses override this
    return (state === ServiceState.READY) && !this.lifecycleManager.shuttingDown;
  }

  protected getHealthErrors(): string[] {
    // Default implementation returns empty array, letting HealthMonitor add its standard errors
    return [];
  }

  protected getHealthMetrics(): Record<string, unknown> | undefined {
    return this.collectServiceMetrics();
  }

  // ============================================================================
  // Timer Management Methods (Delegated)
  // ============================================================================

  protected createInterval(name: string, callback: () => void, interval: number, options?: { coalesce?: boolean }): string {
    return this.timerManager.createInterval(name, callback, interval, options);
  }

  protected createTimeout(name: string, callback: () => void, delay: number): string {
    return this.timerManager.createTimeout(name, callback, delay);
  }

  protected clearTimer(timerId: string): boolean {
    return this.timerManager.clearTimer(timerId);
  }

  protected clearAllTimers(): void {
    this.timerManager.clearAllTimers();
  }

  protected hasTimer(timerId: string): boolean {
    return this.timerManager.hasTimer(timerId);
  }

  protected getTimerCount(): number {
    return this.timerManager.getTimerCount();
  }

  protected getTimerInfo(timerId: string) {
    return this.timerManager.getTimerInfo(timerId);
  }

  protected createCoalescedInterval(name: string, callback: () => void, requestedInterval: number): string {
    // Expose this if needed, or rely on createInterval with options
    return this.timerManager.createInterval(name, callback, requestedInterval, { coalesce: true });
  }

  // ============================================================================
  // Extended Utility Methods
  // ============================================================================

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

  private async executeTimerCallback(
    callback: () => void | Promise<void>,
    name: string
  ): Promise<void> {
    if (this.lifecycleManager.state !== ServiceState.READY) {
      logger.debug(`Skipping timer callback '${name}' - service not ready`, {
        service: this.getServiceName(),
        state: this.lifecycleManager.state
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

  // ============================================================================
  // Event Emitter Delegation
  // ============================================================================

  /**
   * Register lifecycle event handler
   */
  on<K extends keyof ServiceLifecycleEvents>(
    event: K,
    handler: ServiceLifecycleEvents[K]
  ): void {
    this.lifecycleManager.on(event, handler);
  }

  /**
   * Emit event (internal use or for subclasses)
   */
  protected emit<K extends keyof ServiceLifecycleEvents>(
    event: K,
    ...args: Parameters<ServiceLifecycleEvents[K]>
  ): void {
    this.lifecycleManager.emit(event, ...args);
  }

  // ============================================================================
  // Backward Compatibility Properties
  // ============================================================================

  protected get isInitialized(): boolean {
    return this.lifecycleManager.state === ServiceState.READY;
  }

  protected get isShuttingDown(): boolean {
    return this.lifecycleManager.shuttingDown;
  }

  /**
   * Get current service state
   */
  public getServiceState(): ServiceState {
    return this.lifecycleManager.state;
  }

  /**
   * Check if service is accepting work
   */
  isAcceptingWork(): boolean {
    return this.lifecycleManager.isAcceptingWork();
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
    const lifecycleStatus = this.lifecycleManager.getLifecycleStatus();

    return {
      name: this.getServiceName(),
      state: lifecycleStatus.state,
      healthy: this.isHealthy(), // Use BaseService's overridable isHealthy
      acceptingWork: lifecycleStatus.acceptingWork,
      uptime: lifecycleStatus.uptime,
      resources: this.resources.getResourceStats(),
      timers: this.timerManager.getTimerCount(),
      ongoingOperations: lifecycleStatus.ongoingOperations,
      errors: this.getHealthErrors() // Use BaseService's overridable getHealthErrors
    };
  }
}