/**
 * BaseService API Contract Interface Definitions
 * 
 * This file defines TypeScript interfaces and type guards for validating
 * BaseService API contracts during refactoring. These definitions can be
 * used in contract tests to ensure no regressions.
 * 
 * Usage:
 * ```typescript
 * import { validateBaseServiceContract } from './BaseService_Contract_Interfaces';
 * 
 * describe('BaseService Contract Tests', () => {
 *   it('should maintain API contract', () => {
 *     const service = new ConcreteService();
 *     expect(validateBaseServiceContract(service)).toBe(true);
 *   });
 * });
 * ```
 */

// ============================================================================
// Type Definitions from BaseService Implementation
// ============================================================================

/**
 * Service lifecycle states - must match BaseService.ServiceState enum
 */
export enum ExpectedServiceState {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  READY = 'ready',
  SHUTTING_DOWN = 'shutting_down',
  SHUTDOWN = 'shutdown',
  FAILED = 'failed'
}

/**
 * Timer type enumeration
 */
export enum ExpectedTimerType {
  INTERVAL = 'interval',
  TIMEOUT = 'timeout'
}

/**
 * Expected timer information structure
 */
export interface ExpectedTimerInfo {
  id: string;
  type: ExpectedTimerType;
  intervalMs?: number;
  delayMs?: number;
  createdAt: number;
  lastExecuted?: number;
  errorCount: number;
}

/**
 * Expected timer options interface
 */
export interface ExpectedTimerOptions {
  coalesce?: boolean;
}

/**
 * Expected managed timer options interface
 */
export interface ExpectedManagedTimerOptions {
  priority?: 'low' | 'medium' | 'high' | 'critical';
  coalesce?: boolean;
}

/**
 * Expected service health status structure
 */
export interface ExpectedServiceHealthStatus {
  healthy: boolean;
  name: string;
  errors: string[];
  metrics?: Record<string, unknown>;
}

/**
 * Expected resource statistics structure
 */
export interface ExpectedResourceStats {
  total: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  averageAge: number;
  failedCleanups: number;
  leakDetected: boolean;
  pendingCleanup: number;
}

/**
 * Expected complete service status structure
 */
export interface ExpectedServiceStatus {
  name: string;
  state: ExpectedServiceState;
  healthy: boolean;
  acceptingWork: boolean;
  uptime: number;
  resources: ExpectedResourceStats;
  timers: number;
  ongoingOperations: number;
  errors: string[];
}

/**
 * Expected service lifecycle events interface
 */
export interface ExpectedServiceLifecycleEvents {
  'state-changed': (oldState: ExpectedServiceState, newState: ExpectedServiceState) => void;
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
 * Expected timer metrics structure in health status
 */
export interface ExpectedTimerMetrics {
  timers: {
    count: number;
    byType: { interval: number; timeout: number };
    totalErrors: number;
    timersWithErrors: number;
    coalescedTimers: number;
    coalescingGroups: number;
    timerEfficiency: string;
    overheadReduction: string;
    oldestTimerAgeMs: number;
    newestTimerAgeMs: number;
  };
}

// ============================================================================
// BaseService Contract Interface
// ============================================================================

/**
 * Complete BaseService API contract interface
 * This interface defines all public and protected methods that must be maintained
 */
export interface BaseServiceContract {
  // IService interface implementation
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getHealthStatus(): ExpectedServiceHealthStatus | Promise<ExpectedServiceHealthStatus>;

  // Extended public interface
  getServiceState(): ExpectedServiceState;
  isAcceptingWork(): boolean;
  getServiceStatus(): ExpectedServiceStatus;
  on<K extends keyof ExpectedServiceLifecycleEvents>(
    event: K,
    handler: ExpectedServiceLifecycleEvents[K]
  ): void;

  // Protected timer management interface (available to subclasses)
  createInterval(
    name: string,
    callback: () => void,
    interval: number,
    options?: ExpectedTimerOptions
  ): string;
  
  createTimeout(
    name: string,
    callback: () => void,
    delay: number
  ): string;
  
  createCoalescedInterval(
    name: string,
    callback: () => void,
    requestedInterval: number
  ): string;
  
  createManagedInterval(
    name: string,
    callback: () => void | Promise<void>,
    interval: number,
    options?: ExpectedManagedTimerOptions
  ): string;
  
  createManagedTimeout(
    name: string,
    callback: () => void | Promise<void>,
    delay: number,
    options?: ExpectedManagedTimerOptions
  ): string;
  
  clearTimer(timerId: string): boolean;
  clearAllTimers(): void;
  hasTimer(timerId: string): boolean;
  getTimerCount(): number;
  getTimerInfo(timerId: string): ExpectedTimerInfo | undefined;
  
  registerOperation<T>(operation: Promise<T>): Promise<T>;
  stopAcceptingWork(): void;
  waitForOngoingOperations(): Promise<void>;

  // Abstract methods that subclasses must implement
  getServiceName(): string;
  performInitialization(): Promise<void>;
  performShutdown(): Promise<void>;
  collectServiceMetrics(): Record<string, unknown> | undefined;

  // Template method hooks (optional overrides)
  buildHealthStatus(): ExpectedServiceHealthStatus;
  isHealthy(): boolean;
  getHealthErrors(): string[];
  getHealthMetrics(): Record<string, unknown> | undefined;
}

// ============================================================================
// Type Guards and Validation Functions
// ============================================================================

/**
 * Type guard for service state validation
 */
export function isValidServiceState(state: any): state is ExpectedServiceState {
  return Object.values(ExpectedServiceState).includes(state);
}

/**
 * Type guard for timer type validation
 */
export function isValidTimerType(type: any): type is ExpectedTimerType {
  return Object.values(ExpectedTimerType).includes(type);
}

/**
 * Type guard for service health status validation
 */
export function isValidServiceHealthStatus(status: any): status is ExpectedServiceHealthStatus {
  return (
    typeof status === 'object' &&
    status !== null &&
    typeof status.healthy === 'boolean' &&
    typeof status.name === 'string' &&
    Array.isArray(status.errors) &&
    status.errors.every((error: any) => typeof error === 'string') &&
    (status.metrics === undefined || (typeof status.metrics === 'object' && status.metrics !== null))
  );
}

/**
 * Type guard for timer info validation
 */
export function isValidTimerInfo(info: any): info is ExpectedTimerInfo {
  return (
    typeof info === 'object' &&
    info !== null &&
    typeof info.id === 'string' &&
    isValidTimerType(info.type) &&
    typeof info.createdAt === 'number' &&
    typeof info.errorCount === 'number' &&
    (info.intervalMs === undefined || typeof info.intervalMs === 'number') &&
    (info.delayMs === undefined || typeof info.delayMs === 'number') &&
    (info.lastExecuted === undefined || typeof info.lastExecuted === 'number')
  );
}

/**
 * Type guard for service status validation
 */
export function isValidServiceStatus(status: any): status is ExpectedServiceStatus {
  return (
    typeof status === 'object' &&
    status !== null &&
    typeof status.name === 'string' &&
    isValidServiceState(status.state) &&
    typeof status.healthy === 'boolean' &&
    typeof status.acceptingWork === 'boolean' &&
    typeof status.uptime === 'number' &&
    typeof status.timers === 'number' &&
    typeof status.ongoingOperations === 'number' &&
    Array.isArray(status.errors) &&
    status.errors.every((error: any) => typeof error === 'string') &&
    typeof status.resources === 'object' &&
    status.resources !== null
  );
}

/**
 * Validate timer metrics structure
 */
export function isValidTimerMetrics(metrics: any): metrics is ExpectedTimerMetrics {
  if (!metrics || typeof metrics !== 'object' || !metrics.timers) {
    return false;
  }

  const timers = metrics.timers;
  return (
    typeof timers.count === 'number' &&
    typeof timers.byType === 'object' &&
    typeof timers.byType.interval === 'number' &&
    typeof timers.byType.timeout === 'number' &&
    typeof timers.totalErrors === 'number' &&
    typeof timers.timersWithErrors === 'number' &&
    typeof timers.coalescedTimers === 'number' &&
    typeof timers.coalescingGroups === 'number' &&
    typeof timers.timerEfficiency === 'string' &&
    typeof timers.overheadReduction === 'string' &&
    typeof timers.oldestTimerAgeMs === 'number' &&
    typeof timers.newestTimerAgeMs === 'number'
  );
}

// ============================================================================
// Contract Validation Functions
// ============================================================================

/**
 * Validates that an object implements the BaseService contract
 */
export function validateBaseServiceContract(service: any): service is BaseServiceContract {
  if (!service || typeof service !== 'object') {
    return false;
  }

  // Check IService interface methods
  if (
    typeof service.initialize !== 'function' ||
    typeof service.shutdown !== 'function' ||
    typeof service.getHealthStatus !== 'function'
  ) {
    return false;
  }

  // Check extended public interface
  if (
    typeof service.getServiceState !== 'function' ||
    typeof service.isAcceptingWork !== 'function' ||
    typeof service.getServiceStatus !== 'function' ||
    typeof service.on !== 'function'
  ) {
    return false;
  }

  // Check timer management methods
  if (
    typeof service.createInterval !== 'function' ||
    typeof service.createTimeout !== 'function' ||
    typeof service.createCoalescedInterval !== 'function' ||
    typeof service.createManagedInterval !== 'function' ||
    typeof service.createManagedTimeout !== 'function' ||
    typeof service.clearTimer !== 'function' ||
    typeof service.clearAllTimers !== 'function' ||
    typeof service.hasTimer !== 'function' ||
    typeof service.getTimerCount !== 'function' ||
    typeof service.getTimerInfo !== 'function'
  ) {
    return false;
  }

  // Check resource management methods
  if (
    typeof service.registerOperation !== 'function' ||
    typeof service.stopAcceptingWork !== 'function' ||
    typeof service.waitForOngoingOperations !== 'function'
  ) {
    return false;
  }

  // Check abstract/template methods
  if (
    typeof service.getServiceName !== 'function' ||
    typeof service.performInitialization !== 'function' ||
    typeof service.performShutdown !== 'function' ||
    typeof service.collectServiceMetrics !== 'function' ||
    typeof service.buildHealthStatus !== 'function' ||
    typeof service.isHealthy !== 'function' ||
    typeof service.getHealthErrors !== 'function' ||
    typeof service.getHealthMetrics !== 'function'
  ) {
    return false;
  }

  return true;
}

/**
 * Validates service lifecycle behavior contracts
 */
export function validateLifecycleBehavior(service: BaseServiceContract): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check initial state
  const initialState = service.getServiceState();
  if (initialState !== ExpectedServiceState.CREATED) {
    errors.push(`Service should start in CREATED state, got ${initialState}`);
  }

  // Check work acceptance before initialization
  if (service.isAcceptingWork()) {
    errors.push('Service should not accept work before initialization');
  }

  // Check timer count initial state
  if (service.getTimerCount() !== 0) {
    errors.push('Service should start with zero timers');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates timer management behavior contracts
 */
export function validateTimerBehavior(service: BaseServiceContract): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Test timer creation returns string ID
  try {
    const timerId = service.createInterval('test', () => {}, 1000);
    if (typeof timerId !== 'string') {
      errors.push('createInterval should return string ID');
    }

    // Test timer exists
    if (!service.hasTimer(timerId)) {
      errors.push('Created timer should be detectable with hasTimer');
    }

    // Test timer count
    if (service.getTimerCount() !== 1) {
      errors.push('Timer count should reflect created timers');
    }

    // Test timer info
    const timerInfo = service.getTimerInfo(timerId);
    if (!timerInfo || !isValidTimerInfo(timerInfo)) {
      errors.push('Timer info should be valid for existing timers');
    }

    // Test timer clearing
    const cleared = service.clearTimer(timerId);
    if (!cleared) {
      errors.push('clearTimer should return true for existing timers');
    }

    // Test timer no longer exists
    if (service.hasTimer(timerId)) {
      errors.push('Cleared timer should not be detectable with hasTimer');
    }
  } catch (error) {
    errors.push(`Timer management failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates health status structure and content
 */
export function validateHealthStatusContract(service: BaseServiceContract): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  try {
    const healthStatus = service.getHealthStatus();
    
    if (!isValidServiceHealthStatus(healthStatus)) {
      errors.push('Health status structure is invalid');
    } else {
      // Check service name consistency
      const serviceName = service.getServiceName();
      if (healthStatus.name !== serviceName) {
        errors.push('Health status name should match getServiceName()');
      }

      // Check health status reflects service state
      const isHealthy = service.isHealthy();
      if (healthStatus.healthy !== isHealthy) {
        errors.push('Health status healthy flag should match isHealthy()');
      }

      // Check errors consistency
      const healthErrors = service.getHealthErrors();
      if (JSON.stringify(healthStatus.errors) !== JSON.stringify(healthErrors)) {
        errors.push('Health status errors should match getHealthErrors()');
      }
    }
  } catch (error) {
    errors.push(`Health status validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// Comprehensive Contract Test Suite
// ============================================================================

/**
 * Runs comprehensive contract validation tests
 */
export function runContractTests(service: BaseServiceContract): {
  passed: boolean;
  results: {
    contractStructure: { valid: boolean; errors: string[] };
    lifecycleBehavior: { valid: boolean; errors: string[] };
    timerBehavior: { valid: boolean; errors: string[] };
    healthStatusContract: { valid: boolean; errors: string[] };
  };
} {
  const results = {
    contractStructure: {
      valid: validateBaseServiceContract(service),
      errors: validateBaseServiceContract(service) ? [] : ['Contract structure validation failed']
    },
    lifecycleBehavior: validateLifecycleBehavior(service),
    timerBehavior: validateTimerBehavior(service),
    healthStatusContract: validateHealthStatusContract(service)
  };

  const passed = Object.values(results).every(result => result.valid);

  return { passed, results };
}

// ============================================================================
// Mock Interface for Testing
// ============================================================================

/**
 * Mock implementation of BaseService for testing
 * Provides predictable behavior for contract validation
 */
export class MockBaseService implements BaseServiceContract {
  private serviceState: ExpectedServiceState = ExpectedServiceState.CREATED;
  private acceptingWork = false;
  private timers = new Map<string, any>();
  private timerCounter = 0;
  private ongoingOps = new Set<Promise<any>>();
  private eventHandlers = new Map<string, Function>();

  // IService implementation
  async initialize(): Promise<void> {
    if (this.serviceState !== ExpectedServiceState.CREATED) {
      throw new Error('Invalid state for initialization');
    }
    this.serviceState = ExpectedServiceState.INITIALIZING;
    await this.performInitialization();
    this.serviceState = ExpectedServiceState.READY;
    this.acceptingWork = true;
  }

  async shutdown(): Promise<void> {
    if (this.serviceState === ExpectedServiceState.SHUTDOWN) {
      return;
    }
    this.serviceState = ExpectedServiceState.SHUTTING_DOWN;
    this.acceptingWork = false;
    await this.waitForOngoingOperations();
    this.clearAllTimers();
    await this.performShutdown();
    this.serviceState = ExpectedServiceState.SHUTDOWN;
  }

  getHealthStatus(): ExpectedServiceHealthStatus {
    return this.buildHealthStatus();
  }

  // Extended public interface
  getServiceState(): ExpectedServiceState {
    return this.serviceState;
  }

  isAcceptingWork(): boolean {
    return this.acceptingWork && this.serviceState === ExpectedServiceState.READY;
  }

  getServiceStatus(): ExpectedServiceStatus {
    return {
      name: this.getServiceName(),
      state: this.serviceState,
      healthy: this.isHealthy(),
      acceptingWork: this.acceptingWork,
      uptime: 0,
      resources: {
        total: 0,
        byType: {},
        byPriority: {},
        averageAge: 0,
        failedCleanups: 0,
        leakDetected: false,
        pendingCleanup: 0
      },
      timers: this.getTimerCount(),
      ongoingOperations: this.ongoingOps.size,
      errors: this.getHealthErrors()
    };
  }

  on<K extends keyof ExpectedServiceLifecycleEvents>(
    event: K,
    handler: ExpectedServiceLifecycleEvents[K]
  ): void {
    this.eventHandlers.set(event, handler);
  }

  // Timer management
  createInterval(name: string, callback: () => void, interval: number, options?: ExpectedTimerOptions): string {
    const id = `${this.getServiceName()}_${name}_${++this.timerCounter}`;
    this.timers.set(id, {
      id,
      type: ExpectedTimerType.INTERVAL,
      intervalMs: interval,
      createdAt: Date.now(),
      errorCount: 0
    });
    return id;
  }

  createTimeout(name: string, callback: () => void, delay: number): string {
    const id = `${this.getServiceName()}_${name}_${++this.timerCounter}`;
    this.timers.set(id, {
      id,
      type: ExpectedTimerType.TIMEOUT,
      delayMs: delay,
      createdAt: Date.now(),
      errorCount: 0
    });
    return id;
  }

  createCoalescedInterval(name: string, callback: () => void, requestedInterval: number): string {
    return this.createInterval(name, callback, requestedInterval, { coalesce: true });
  }

  createManagedInterval(
    name: string,
    callback: () => void | Promise<void>,
    interval: number,
    options?: ExpectedManagedTimerOptions
  ): string {
    return this.createInterval(name, () => callback(), interval, options);
  }

  createManagedTimeout(
    name: string,
    callback: () => void | Promise<void>,
    delay: number,
    options?: ExpectedManagedTimerOptions
  ): string {
    return this.createTimeout(name, () => callback(), delay);
  }

  clearTimer(timerId: string): boolean {
    return this.timers.delete(timerId);
  }

  clearAllTimers(): void {
    this.timers.clear();
  }

  hasTimer(timerId: string): boolean {
    return this.timers.has(timerId);
  }

  getTimerCount(): number {
    return this.timers.size;
  }

  getTimerInfo(timerId: string): ExpectedTimerInfo | undefined {
    return this.timers.get(timerId);
  }

  registerOperation<T>(operation: Promise<T>): Promise<T> {
    if (!this.isAcceptingWork()) {
      throw new Error('Service not accepting work');
    }
    this.ongoingOps.add(operation);
    operation.finally(() => this.ongoingOps.delete(operation));
    return operation;
  }

  stopAcceptingWork(): void {
    this.acceptingWork = false;
  }

  async waitForOngoingOperations(): Promise<void> {
    await Promise.allSettled(Array.from(this.ongoingOps));
    this.ongoingOps.clear();
  }

  // Abstract method implementations
  getServiceName(): string {
    return 'MockService';
  }

  async performInitialization(): Promise<void> {
    // Mock initialization
  }

  async performShutdown(): Promise<void> {
    // Mock shutdown
  }

  collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      mockMetric: 'value'
    };
  }

  // Template method implementations
  buildHealthStatus(): ExpectedServiceHealthStatus {
    return {
      healthy: this.isHealthy(),
      name: this.getServiceName(),
      errors: this.getHealthErrors(),
      metrics: this.getHealthMetrics()
    };
  }

  isHealthy(): boolean {
    return this.serviceState === ExpectedServiceState.READY;
  }

  getHealthErrors(): string[] {
    const errors: string[] = [];
    if (this.serviceState !== ExpectedServiceState.READY) {
      errors.push(`Service in state: ${this.serviceState}`);
    }
    return errors;
  }

  getHealthMetrics(): Record<string, unknown> | undefined {
    return {
      ...this.collectServiceMetrics(),
      timers: {
        count: this.getTimerCount(),
        byType: { interval: 0, timeout: 0 },
        totalErrors: 0,
        timersWithErrors: 0,
        coalescedTimers: 0,
        coalescingGroups: 0,
        timerEfficiency: '0%',
        overheadReduction: '0%',
        oldestTimerAgeMs: 0,
        newestTimerAgeMs: 0
      }
    };
  }
}

export default {
  ExpectedServiceState,
  ExpectedTimerType,
  validateBaseServiceContract,
  runContractTests,
  MockBaseService
};