/**
 * BaseService Interface Definitions for Contract Testing
 * 
 * This file contains TypeScript interface definitions that capture the public API
 * of BaseService for use in contract tests during refactoring. These interfaces
 * ensure no regressions occur in the public API surface.
 * 
 * Generated from: src/services/base/BaseService.ts
 * Purpose: Phase 1, Week 2 Refactoring Contract Validation
 */

// ============================================================================
// Core Enums and Types
// ============================================================================

/**
 * Service lifecycle states exported by BaseService
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
 * Timer management interface used internally by BaseService
 */
export interface ManagedTimer {
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
 * Timer information returned by getTimerInfo (excludes sensitive data)
 */
export interface BaseServiceTimerInfo {
  id: string;
  type: 'interval' | 'timeout';
  intervalMs?: number;
  delayMs?: number;
  createdAt: number;
  lastExecuted?: number;
  errorCount: number;
}

/**
 * Service lifecycle events emitted by BaseService
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
 * Timer creation options for BaseService timer methods
 */
export interface TimerCreationOptions {
  coalesce?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Comprehensive service status returned by getServiceStatus
 */
export interface BaseServiceStatus {
  name: string;
  state: ServiceState;
  healthy: boolean;
  acceptingWork: boolean;
  uptime: number;
  resources: {
    total: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
    averageAge: number;
    failedCleanups: number;
    leakDetected: boolean;
    pendingCleanup: number;
  };
  timers: number;
  ongoingOperations: number;
  errors: string[];
}

// ============================================================================
// BaseService Public API Interface
// ============================================================================

/**
 * Public API contract for BaseService
 * 
 * This interface captures all public methods that external code can call
 * on BaseService instances. Used for contract testing during refactoring.
 */
export interface IBaseServicePublicAPI {
  // ============================================================================
  // Core IService Implementation
  // ============================================================================

  /**
   * Initialize the service with comprehensive lifecycle management
   * Contract: Idempotent, handles concurrent calls, emits events
   */
  initialize(): Promise<void>;

  /**
   * Gracefully shutdown service with resource cleanup
   * Contract: Safe to call multiple times, comprehensive cleanup
   */
  shutdown(): Promise<void>;

  /**
   * Get standardized health status using template method pattern
   * Contract: Lightweight, combines timer + service metrics
   */
  getHealthStatus(): ServiceHealthStatus;

  // ============================================================================
  // Service State Management
  // ============================================================================

  /**
   * Get current service lifecycle state
   * Contract: Always returns current state, safe to call anytime
   */
  getServiceState(): ServiceState;

  /**
   * Check if service is accepting new work
   * Contract: Returns true only when ready and accepting work
   */
  isAcceptingWork(): boolean;

  /**
   * Get comprehensive service status including metrics
   * Contract: Includes state, resources, timers, operations, errors
   */
  getServiceStatus(): BaseServiceStatus;

  // ============================================================================
  // Timer Management API
  // ============================================================================

  /**
   * Create managed interval timer with optional coalescing
   * Contract: Returns unique ID, supports coalescing, error handling
   */
  createInterval(
    name: string, 
    callback: () => void, 
    interval: number, 
    options?: { coalesce?: boolean }
  ): string;

  /**
   * Create managed timeout timer
   * Contract: Returns unique ID, auto-cleanup after execution
   */
  createTimeout(
    name: string, 
    callback: () => void, 
    delay: number
  ): string;

  /**
   * Create coalesced interval timer for efficiency
   * Contract: Groups timers into 10s intervals, manages coalescing groups
   */
  createCoalescedInterval(
    name: string, 
    callback: () => void, 
    requestedInterval: number
  ): string;

  /**
   * Create managed interval with resource tracking
   * Contract: Integrates with ResourceManager, supports async callbacks
   */
  createManagedInterval(
    name: string,
    callback: () => void | Promise<void>,
    interval: number,
    options?: TimerCreationOptions
  ): string;

  /**
   * Create managed timeout with resource tracking
   * Contract: Integrates with ResourceManager, supports async callbacks
   */
  createManagedTimeout(
    name: string,
    callback: () => void | Promise<void>,
    delay: number,
    options?: { priority?: 'low' | 'medium' | 'high' | 'critical' }
  ): string;

  /**
   * Clear specific timer by ID
   * Contract: Returns success status, handles coalesced timers
   */
  clearTimer(timerId: string): boolean;

  /**
   * Clear all managed timers
   * Contract: Comprehensive cleanup, continues on individual failures
   */
  clearAllTimers(): void;

  /**
   * Check if timer exists and is active
   * Contract: Current existence status, safe to call frequently
   */
  hasTimer(timerId: string): boolean;

  /**
   * Get count of active timers
   * Contract: Real-time accurate count
   */
  getTimerCount(): number;

  /**
   * Get timer information (excludes sensitive data)
   * Contract: Returns metadata without timer object or callback
   */
  getTimerInfo(timerId: string): BaseServiceTimerInfo | undefined;

  // ============================================================================
  // Resource Management Integration
  // ============================================================================

  /**
   * Register ongoing operation for shutdown coordination
   * Contract: Throws if not accepting work, auto-removes on completion
   */
  registerOperation<T>(operation: Promise<T>): Promise<T>;

  // ============================================================================
  // Lifecycle Event System
  // ============================================================================

  /**
   * Register lifecycle event handler
   * Contract: Type-safe event handling, supports all lifecycle events
   */
  on<K extends keyof ServiceLifecycleEvents>(
    event: K,
    handler: ServiceLifecycleEvents[K]
  ): void;
}

// ============================================================================
// Abstract Method Contracts
// ============================================================================

/**
 * Abstract methods that subclasses MUST implement
 * 
 * These define the contract that concrete service implementations
 * must fulfill when extending BaseService.
 */
export interface IBaseServiceAbstractMethods {
  /**
   * Get service name for logging and identification
   * Contract: Unique, consistent, follows naming conventions
   */
  getServiceName(): string;

  /**
   * Perform service-specific initialization
   * Contract: Setup resources, validate config, establish connections
   */
  performInitialization(): Promise<void>;

  /**
   * Perform service-specific shutdown/cleanup
   * Contract: Release resources, save state, graceful cleanup
   */
  performShutdown(): Promise<void>;

  /**
   * Collect service-specific metrics for health reporting
   * Contract: Lightweight, returns undefined if no metrics, performance data
   */
  collectServiceMetrics(): Record<string, unknown> | undefined;
}

// ============================================================================
// Optional Override Method Contracts
// ============================================================================

/**
 * Optional methods that subclasses MAY override for custom behavior
 * 
 * These methods have default implementations but can be customized
 * by concrete service implementations.
 */
export interface IBaseServiceOptionalOverrides {
  /**
   * Custom health check logic
   * Default: Returns true if initialized and not shutting down
   */
  isHealthy(): boolean;

  /**
   * Get service-specific health errors
   * Default: Returns initialization and shutdown status errors
   */
  getHealthErrors(): string[];

  /**
   * Build complete health status (template method)
   * Default: Combines health state, errors, and metrics
   */
  buildHealthStatus(): ServiceHealthStatus;

  /**
   * Stop accepting new work during shutdown
   * Default: Sets internal flag to reject operations
   */
  stopAcceptingWork(): void;

  /**
   * Wait for ongoing operations to complete
   * Default: Uses Promise.allSettled on tracked operations
   */
  waitForOngoingOperations(): Promise<void>;
}

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * Timer coalescing configuration used by BaseService
 */
export interface BaseServiceTimerConfig {
  /** Coalescing interval for grouping timers (10 seconds) */
  readonly COALESCING_INTERVAL: 10000;
  
  /** Minimum interval for coalescing eligibility (5 seconds) */
  readonly MIN_COALESCING_INTERVAL: 5000;
}

// ============================================================================
// Contract Test Utilities
// ============================================================================

/**
 * Type guards for contract testing
 */
export namespace BaseServiceTypeGuards {
  export function isServiceState(value: any): value is ServiceState {
    return Object.values(ServiceState).includes(value);
  }

  export function isTimerInfo(value: any): value is BaseServiceTimerInfo {
    return (
      typeof value === 'object' &&
      typeof value.id === 'string' &&
      ['interval', 'timeout'].includes(value.type) &&
      typeof value.createdAt === 'number' &&
      typeof value.errorCount === 'number'
    );
  }

  export function isServiceStatus(value: any): value is BaseServiceStatus {
    return (
      typeof value === 'object' &&
      typeof value.name === 'string' &&
      isServiceState(value.state) &&
      typeof value.healthy === 'boolean' &&
      typeof value.acceptingWork === 'boolean' &&
      typeof value.uptime === 'number' &&
      typeof value.timers === 'number' &&
      typeof value.ongoingOperations === 'number' &&
      Array.isArray(value.errors)
    );
  }
}

// ============================================================================
// Test Verification Patterns
// ============================================================================

/**
 * Test patterns for verifying BaseService contract compliance
 */
export interface BaseServiceTestPatterns {
  /** Verify lifecycle state transitions follow expected sequence */
  verifyLifecycleTransitions(service: IBaseServicePublicAPI): Promise<boolean>;
  
  /** Verify timer management operations work correctly */
  verifyTimerManagement(service: IBaseServicePublicAPI): Promise<boolean>;
  
  /** Verify resource cleanup is comprehensive */
  verifyResourceCleanup(service: IBaseServicePublicAPI): Promise<boolean>;
  
  /** Verify health status reporting is accurate */
  verifyHealthReporting(service: IBaseServicePublicAPI): Promise<boolean>;
  
  /** Verify error handling preserves API contracts */
  verifyErrorHandling(service: IBaseServicePublicAPI): Promise<boolean>;
  
  /** Verify event system works correctly */
  verifyEventSystem(service: IBaseServicePublicAPI): Promise<boolean>;
}

// ============================================================================
// Import Dependencies from Core Interfaces
// ============================================================================

/**
 * Re-export core interfaces needed for BaseService contract testing
 * These should match the imports in the actual BaseService file
 */
export interface ServiceHealthStatus {
  healthy: boolean;
  name: string;
  errors: string[];
  metrics?: Record<string, unknown>;
}

export interface IService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getHealthStatus(): ServiceHealthStatus | Promise<ServiceHealthStatus>;
}

// ============================================================================
// Contract Validation Schema
// ============================================================================

/**
 * JSON schema-like structure for validating BaseService API compliance
 * Can be used with validation libraries for automated contract testing
 */
export const BaseServiceContractSchema = {
  type: 'object',
  required: [
    'initialize',
    'shutdown', 
    'getHealthStatus',
    'getServiceState',
    'isAcceptingWork',
    'getServiceStatus',
    'createInterval',
    'createTimeout',
    'clearTimer',
    'clearAllTimers',
    'hasTimer',
    'getTimerCount'
  ],
  properties: {
    // Core IService methods
    initialize: { type: 'function' },
    shutdown: { type: 'function' },
    getHealthStatus: { type: 'function' },
    
    // State management
    getServiceState: { type: 'function' },
    isAcceptingWork: { type: 'function' },
    getServiceStatus: { type: 'function' },
    
    // Timer management
    createInterval: { type: 'function' },
    createTimeout: { type: 'function' },
    createCoalescedInterval: { type: 'function' },
    createManagedInterval: { type: 'function' },
    createManagedTimeout: { type: 'function' },
    clearTimer: { type: 'function' },
    clearAllTimers: { type: 'function' },
    hasTimer: { type: 'function' },
    getTimerCount: { type: 'function' },
    getTimerInfo: { type: 'function' },
    
    // Resource management
    registerOperation: { type: 'function' },
    
    // Event system
    on: { type: 'function' }
  }
} as const;