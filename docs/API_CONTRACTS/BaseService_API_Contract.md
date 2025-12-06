# BaseService API Contract Documentation

**File**: `src/services/base/BaseService.ts`  
**Version**: Phase 1, Week 2 Refactoring Contract  
**Purpose**: Contract specification for BaseService refactoring to prevent regressions

---

## Overview

The `BaseService` abstract class provides a template method pattern for service lifecycle management with comprehensive timer management, resource tracking, and health monitoring capabilities. This document serves as a contract specification to ensure API compatibility during refactoring.

## Core Abstract Class Contract

### Class Declaration
```typescript
export abstract class BaseService implements IService
```

**Contract Requirements:**
- MUST implement the `IService` interface completely
- MUST provide template method pattern for service lifecycle
- MUST support timer management with coalescing capabilities
- MUST support resource tracking and cleanup
- MUST provide standardized health reporting

---

## Public Interface Methods

### Core IService Implementation

#### `initialize(): Promise<void>`
**Contract:**
- MUST be idempotent (safe to call multiple times)
- MUST handle concurrent initialization attempts gracefully
- MUST complete successfully before service operations
- MUST register service-level cleanup with ResourceManager
- MUST emit lifecycle events during initialization
- MUST throw enriched errors with service context on failure

**Error Handling:**
- Throws enriched `Error` with service name, phase, and duration context
- Performs emergency cleanup on initialization failure
- Sets service state to `FAILED` on error

**Side Effects:**
- Changes service state from `CREATED` → `INITIALIZING` → `READY`
- Registers service cleanup with ResourceManager
- Emits: `initialization-started`, `initialization-completed`, `initialization-failed`

#### `shutdown(): Promise<void>`
**Contract:**
- MUST be safe to call multiple times
- MUST complete within reasonable time (implementation dependent)
- MUST handle shutdown from any service state gracefully
- MUST clean up all resources (timers, connections, ongoing operations)
- MUST wait for ongoing operations to complete
- MUST emit lifecycle events during shutdown

**Shutdown Sequence:**
1. Stop accepting new work
2. Wait for ongoing operations to complete
3. Clear all timers (regular and coalesced)
4. Call service-specific `performShutdown()`
5. Clean up all registered resources

**Error Handling:**
- Throws enriched `Error` with service context on failure
- Performs emergency cleanup if shutdown fails
- Emits `shutdown-failed` on error

#### `getHealthStatus(): ServiceHealthStatus`
**Contract:**
- MUST return standardized health status structure
- MUST be lightweight and safe to call frequently
- MUST combine timer metrics with service-specific metrics
- MUST reflect current operational state accurately

**Return Structure:**
```typescript
interface ServiceHealthStatus {
  healthy: boolean;
  name: string;
  errors: string[];
  metrics?: Record<string, unknown>;
}
```

### Service State Management

#### `getServiceState(): ServiceState`
**Contract:**
- MUST return current service lifecycle state
- MUST be safe to call at any time

**State Values:**
```typescript
enum ServiceState {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  READY = 'ready',
  SHUTTING_DOWN = 'shutting_down',
  SHUTDOWN = 'shutdown',
  FAILED = 'failed'
}
```

#### `isAcceptingWork(): boolean`
**Contract:**
- MUST return `true` only when service is ready and accepting work
- MUST return `false` during shutdown or when not ready

#### `getServiceStatus(): object`
**Contract:**
- MUST return comprehensive service status including:
  - Service name, state, health status
  - Resource statistics, timer count, ongoing operations
  - Uptime calculation, error list

---

## Timer Management API

### Interval Timer Creation

#### `createInterval(name: string, callback: () => void, interval: number, options?: { coalesce?: boolean }): string`
**Contract:**
- MUST return unique timer ID for management operations
- MUST support optional timer coalescing for efficiency
- MUST wrap callback with error handling and metrics tracking
- MUST log timer creation with service context
- MUST throw descriptive error if timer creation fails

**Features:**
- Automatic coalescing for intervals ≥ 5 seconds when enabled
- Error counting and logging for callback failures
- Automatic cleanup on service shutdown

#### `createTimeout(name: string, callback: () => void, delay: number): string`
**Contract:**
- MUST return unique timer ID for management operations
- MUST wrap callback with error handling
- MUST automatically remove timer after execution
- MUST log timer creation with service context

#### `createCoalescedInterval(name: string, callback: () => void, requestedInterval: number): string`
**Contract:**
- MUST round up to nearest coalescing interval (10s increments)
- MUST create or reuse coalescing group
- MUST track original and coalesced intervals
- MUST execute callbacks in batch for efficiency

### Advanced Timer Management

#### `createManagedInterval(name: string, callback: () => void | Promise<void>, interval: number, options?: { priority?: string; coalesce?: boolean }): string`
**Contract:**
- MUST register timer with ResourceManager for advanced tracking
- MUST support async callbacks with proper error handling
- MUST support priority-based resource management
- MUST emit resource registration events

#### `createManagedTimeout(name: string, callback: () => void | Promise<void>, delay: number, options?: { priority?: string }): string`
**Contract:**
- MUST register timeout with ResourceManager
- MUST support async callbacks
- MUST support priority-based cleanup

### Timer Control Operations

#### `clearTimer(timerId: string): boolean`
**Contract:**
- MUST return `true` if timer found and cleared, `false` if not found
- MUST handle both regular and coalesced timers correctly
- MUST clean up empty coalescing groups
- MUST log timer removal with context

#### `clearAllTimers(): void`
**Contract:**
- MUST clear all managed timers and coalescing groups
- MUST continue cleanup even if individual timers fail
- MUST log comprehensive cleanup summary
- MUST be called automatically during shutdown

### Timer Query Methods

#### `hasTimer(timerId: string): boolean`
**Contract:**
- MUST return current existence status of timer
- MUST be safe to call frequently

#### `getTimerCount(): number`
**Contract:**
- MUST return count of active timers
- MUST be accurate and real-time

#### `getTimerInfo(timerId: string): TimerInfo | undefined`
**Contract:**
- MUST return timer metadata without sensitive information
- MUST exclude actual timer object and callback function
- MUST include creation time, execution history, error count

**Return Type:**
```typescript
interface TimerInfo {
  id: string;
  type: 'interval' | 'timeout';
  intervalMs?: number;
  delayMs?: number;
  createdAt: number;
  lastExecuted?: number;
  errorCount: number;
}
```

---

## Resource Management Integration

### Operation Tracking

#### `registerOperation<T>(operation: Promise<T>): Promise<T>`
**Contract:**
- MUST throw `SystemError` if service not accepting work
- MUST automatically track and remove operation on completion
- MUST integrate with graceful shutdown process

### Resource Registration
**Contract:**
- Service automatically registers with ResourceManager during initialization
- Timer management integrates with resource cleanup
- Emergency cleanup available for failed initialization/shutdown

---

## Lifecycle Event System

### Event Registration

#### `on<K extends keyof ServiceLifecycleEvents>(event: K, handler: ServiceLifecycleEvents[K]): void`
**Contract:**
- MUST register event handler for lifecycle events
- MUST support type-safe event handling

### Supported Events
```typescript
interface ServiceLifecycleEvents {
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
```

---

## Abstract Methods Contract

Subclasses MUST implement these abstract methods:

### `getServiceName(): string`
**Contract:**
- MUST return unique service name for logging and identification
- MUST be consistent across service lifecycle
- SHOULD follow naming conventions for service identification

### `performInitialization(): Promise<void>`
**Contract:**
- MUST implement service-specific initialization logic
- MUST complete successfully for service to be operational
- MAY validate configuration and dependencies
- MAY establish connections or allocate resources

### `performShutdown(): Promise<void>`
**Contract:**
- MUST implement service-specific cleanup logic
- MUST release service-specific resources
- MUST complete gracefully even if service partially initialized
- SHOULD save pending state if necessary

### `collectServiceMetrics(): Record<string, unknown> | undefined`
**Contract:**
- MUST return service-specific metrics for health status
- MUST return `undefined` if no metrics available
- SHOULD include performance and operational data
- MUST be lightweight (no expensive operations)

---

## Optional Override Methods

Subclasses MAY override these methods for custom behavior:

### `isHealthy(): boolean`
**Contract:**
- Default: Returns `true` if initialized and not shutting down
- MAY implement custom health check logic
- MUST reflect actual service operational state

### `getHealthErrors(): string[]`
**Contract:**
- Default: Returns initialization and shutdown errors
- MAY include service-specific error conditions
- MUST return actionable error messages

### `buildHealthStatus(): ServiceHealthStatus`
**Contract:**
- Template method combining health state, errors, and metrics
- MAY be overridden for complete customization
- MUST return standardized structure

### `stopAcceptingWork(): void`
**Contract:**
- Default: Sets internal flag to reject new operations
- MAY implement custom work rejection logic
- MUST prevent new operations during shutdown

### `waitForOngoingOperations(): Promise<void>`
**Contract:**
- Default: Waits for tracked operations using Promise.allSettled
- MAY implement custom operation completion logic
- MUST ensure graceful operation completion

---

## Timer Coalescing Configuration

### Constants
```typescript
private readonly COALESCING_INTERVAL = 10000; // 10 seconds
private readonly MIN_COALESCING_INTERVAL = 5000; // Don't coalesce under 5s
```

**Contract:**
- Coalescing groups timers into 10-second intervals
- Timers under 5 seconds are not coalesced
- Coalesced intervals rounded up to nearest 10s boundary

---

## Health Metrics Integration

### Timer Metrics
**Contract:**
- Automatically included in health status
- Includes timer counts, error statistics, efficiency metrics
- Provides coalescing group information and overhead reduction

### Resource Metrics
**Contract:**
- Integrated from ResourceManager
- Includes resource counts by type and priority
- Provides leak detection and cleanup statistics

### Lifecycle Metrics
**Contract:**
- Includes service state, uptime, operation counts
- Provides initialization and shutdown duration tracking

---

## Error Handling Patterns

### Error Enrichment
**Contract:**
- All errors enriched with service context (name, phase, duration)
- Consistent error structure across all operations
- Error tracking integrated with metrics

### Error Classification
**Contract:**
- Initialization errors: Configuration, dependency, resource allocation failures
- Runtime errors: Timer callback failures, operation errors
- Shutdown errors: Resource cleanup failures, timeout errors

---

## Backward Compatibility

### Interface Compliance
**Contract:**
- MUST maintain full `IService` interface compatibility
- MUST support existing service implementations without changes
- MUST preserve all public method signatures

### Behavioral Guarantees
**Contract:**
- Service lifecycle behavior must remain consistent
- Timer management must maintain existing functionality
- Health status format must remain compatible

---

## Performance Characteristics

### Timer Management
- O(1) timer creation and removal
- O(n) timer cleanup where n = number of active timers
- Coalescing reduces timer overhead by grouping callbacks

### Resource Tracking
- Minimal overhead for resource registration
- Efficient cleanup with priority-based ordering
- Memory leak detection and prevention

### Health Monitoring
- Lightweight health checks suitable for frequent polling
- Metrics collection optimized for minimal performance impact

---

## Testing Requirements

Contract tests MUST verify:

1. **Lifecycle Management**: Initialize, shutdown, state transitions
2. **Timer Management**: Creation, coalescing, cleanup, error handling
3. **Resource Integration**: Registration, cleanup, leak prevention
4. **Health Monitoring**: Status accuracy, metrics collection, error reporting
5. **Error Handling**: Error enrichment, graceful degradation, recovery
6. **Event System**: Event emission, handler registration, lifecycle events

---

## Migration Guide for Refactoring

When refactoring BaseService, ensure:

1. **API Compatibility**: All public method signatures preserved
2. **Behavioral Consistency**: Timer coalescing, resource cleanup, health reporting
3. **Error Handling**: Error enrichment and classification maintained
4. **Performance**: Timer management efficiency and health check performance
5. **Integration**: ResourceManager integration and lifecycle event system

This contract serves as the definitive specification for BaseService functionality and must be validated through comprehensive testing during the refactoring process.