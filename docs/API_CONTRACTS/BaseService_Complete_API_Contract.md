# BaseService Complete API Contract Specification

**Version**: 1.0.0  
**Purpose**: Contract specification for BaseService refactoring validation  
**Scope**: Complete API surface analysis for Phase 1, Week 2 refactoring  
**Target**: Ensure zero regression during service architecture updates  

## Table of Contents

1. [Overview](#overview)
2. [Core API Surface](#core-api-surface)
3. [Public Method Contracts](#public-method-contracts)
4. [Timer Management API](#timer-management-api)
5. [Resource Management Integration](#resource-management-integration)
6. [Service Lifecycle Management](#service-lifecycle-management)
7. [Health Monitoring API](#health-monitoring-api)
8. [Event System API](#event-system-api)
9. [Type Definitions](#type-definitions)
10. [Error Handling Contracts](#error-handling-contracts)
11. [Behavioral Contracts](#behavioral-contracts)
12. [Performance Characteristics](#performance-characteristics)
13. [Testing Contracts](#testing-contracts)

---

## Overview

The `BaseService` class provides a comprehensive foundation for all service implementations in the Discord LLM Bot architecture. It implements the `IService` interface and provides sophisticated timer management, resource tracking, lifecycle management, and health monitoring capabilities.

### Key Architectural Patterns

- **Template Method Pattern**: `buildHealthStatus()`, `initialize()`, `shutdown()`
- **Resource Manager Integration**: Automatic cleanup and tracking
- **Timer Coalescing**: Efficient timer management for performance optimization
- **State Machine**: Well-defined service lifecycle states
- **Event System**: Lifecycle event emission for monitoring and debugging

---

## Core API Surface

### Abstract Class Contract

```typescript
export abstract class BaseService implements IService {
  // Public Interface (IService Implementation)
  initialize(): Promise<void>
  shutdown(): Promise<void>
  getHealthStatus(): ServiceHealthStatus

  // Extended Public Interface
  getServiceState(): ServiceState
  isAcceptingWork(): boolean
  getServiceStatus(): CompleteServiceStatus
  on<K extends keyof ServiceLifecycleEvents>(event: K, handler: ServiceLifecycleEvents[K]): void

  // Protected Interface (Subclass API)
  protected createInterval(name: string, callback: () => void, interval: number, options?: TimerOptions): string
  protected createTimeout(name: string, callback: () => void, delay: number): string
  protected createCoalescedInterval(name: string, callback: () => void, requestedInterval: number): string
  protected createManagedInterval(name: string, callback: () => void | Promise<void>, interval: number, options?: ManagedTimerOptions): string
  protected createManagedTimeout(name: string, callback: () => void | Promise<void>, delay: number, options?: ManagedTimerOptions): string
  protected clearTimer(timerId: string): boolean
  protected clearAllTimers(): void
  protected hasTimer(timerId: string): boolean
  protected getTimerCount(): number
  protected getTimerInfo(timerId: string): TimerInfo | undefined
  protected registerOperation<T>(operation: Promise<T>): Promise<T>
  protected stopAcceptingWork(): void
  protected waitForOngoingOperations(): Promise<void>

  // Abstract Methods (Subclass Requirements)
  protected abstract getServiceName(): string
  protected abstract performInitialization(): Promise<void>
  protected abstract performShutdown(): Promise<void>
  protected abstract collectServiceMetrics(): Record<string, unknown> | undefined

  // Template Method Hooks (Optional Overrides)
  protected buildHealthStatus(): ServiceHealthStatus
  protected isHealthy(): boolean
  protected getHealthErrors(): string[]
  protected getHealthMetrics(): Record<string, unknown> | undefined
}
```

---

## Public Method Contracts

### 1. initialize(): Promise<void>

**Contract**: Template method implementing service initialization lifecycle

**Behavior**:
- **Idempotent**: Safe to call multiple times
- **State Validation**: Must be in `CREATED` state to begin initialization
- **State Transitions**: `CREATED` → `INITIALIZING` → `READY` or `FAILED`
- **Promise Caching**: Returns same promise for concurrent calls during initialization
- **Error Enrichment**: Wraps errors with service context and timing information
- **Resource Registration**: Automatically registers service-level cleanup
- **Event Emission**: Emits lifecycle events for monitoring

**Error Conditions**:
- Throws `SystemError` with code `INVALID_STATE` if called in invalid state
- Throws enriched error from `performInitialization()` on failure
- Automatically performs emergency cleanup on initialization failure

**Side Effects**:
- Sets `serviceState` to `INITIALIZING` then `READY`
- Sets `isInitialized` to `true`
- Registers service cleanup with ResourceManager
- Emits `initialization-started`, `initialization-completed`, or `initialization-failed` events
- Stores initialization timing metrics

**Performance**: Timing tracked and reported in logs and events

### 2. shutdown(): Promise<void>

**Contract**: Template method implementing comprehensive service shutdown

**Behavior**:
- **Idempotent**: Safe to call multiple times
- **State Management**: Handles shutdown from any valid state
- **Promise Caching**: Returns same promise for concurrent calls
- **Comprehensive Cleanup**: Coordinates all shutdown phases
- **Error Handling**: Continues cleanup even if individual steps fail

**Shutdown Phases**:
1. Stop accepting new work
2. Wait for ongoing operations completion
3. Clear all managed timers
4. Execute service-specific shutdown
5. Clean up all registered resources

**Error Conditions**:
- Logs errors but does not throw exceptions during shutdown
- Performs emergency cleanup if normal shutdown fails
- Always transitions to final state even on errors

**Side Effects**:
- Sets `serviceState` to `SHUTTING_DOWN` then `SHUTDOWN`
- Sets `isInitialized` to `false`
- Sets `isShuttingDown` to `false`
- Clears all timers and ongoing operations
- Emits shutdown lifecycle events

### 3. getHealthStatus(): ServiceHealthStatus

**Contract**: Public interface to standardized health reporting

**Behavior**:
- **Delegation**: Calls `buildHealthStatus()` template method
- **Consistency**: Ensures standardized health reporting structure
- **Performance**: Lightweight operation suitable for frequent calls

**Return Structure**:
```typescript
{
  healthy: boolean,
  name: string,
  errors: string[],
  metrics?: Record<string, unknown>
}
```

### 4. getServiceState(): ServiceState

**Contract**: Returns current service lifecycle state

**Return Values**: `CREATED` | `INITIALIZING` | `READY` | `SHUTTING_DOWN` | `SHUTDOWN` | `FAILED`

### 5. isAcceptingWork(): boolean

**Contract**: Indicates if service can accept new operations

**Behavior**: Returns `true` only if `acceptingWork` is `true` AND state is `READY`

### 6. getServiceStatus(): CompleteServiceStatus

**Contract**: Comprehensive service status including all subsystems

**Return Structure**:
```typescript
{
  name: string,
  state: ServiceState,
  healthy: boolean,
  acceptingWork: boolean,
  uptime: number,
  resources: ResourceStats,
  timers: number,
  ongoingOperations: number,
  errors: string[]
}
```

---

## Timer Management API

### Core Timer Operations

#### createInterval(name, callback, interval, options?): string

**Contract**: Creates managed interval timer with optional coalescing

**Parameters**:
- `name`: Human-readable timer identifier
- `callback`: Function to execute on each interval
- `interval`: Interval in milliseconds
- `options.coalesce`: Enable/disable timer coalescing (default: auto based on interval)

**Behavior**:
- **Automatic Coalescing**: Intervals ≥ 5000ms are coalesced by default
- **Error Handling**: Wraps callbacks with error catching and logging
- **Unique IDs**: Generates service-prefixed unique timer IDs
- **Metrics Tracking**: Records creation time, execution count, error count

**Coalescing Logic**:
- Intervals < 5000ms: No coalescing
- Intervals ≥ 5000ms: Rounded up to 10-second groups
- Coalesced timers share execution windows for efficiency

**Return Value**: Unique timer ID for management operations

#### createTimeout(name, callback, delay): string

**Contract**: Creates managed timeout timer

**Behavior**:
- **Single Execution**: Automatically removes timer after execution
- **Error Handling**: Same error wrapping as intervals
- **Cleanup**: Self-cleaning after execution

#### clearTimer(timerId): boolean

**Contract**: Removes specific managed timer

**Behavior**:
- **Coalescing Aware**: Handles both regular and coalesced timers
- **Group Management**: Removes empty coalescing groups automatically
- **Return Value**: `true` if timer found and cleared, `false` if not found

#### clearAllTimers(): void

**Contract**: Removes all managed timers and coalescing groups

**Behavior**:
- **Comprehensive**: Clears both individual timers and coalescing groups
- **Error Resilient**: Continues cleanup even if individual timers fail
- **Metrics**: Reports cleanup statistics in logs

### Advanced Timer Operations

#### createManagedInterval/createManagedTimeout

**Contract**: Creates timers with ResourceManager integration

**Additional Features**:
- **Resource Tracking**: Registered with ResourceManager for advanced lifecycle management
- **Priority Support**: Configurable cleanup priority
- **Async Callbacks**: Support for async callback functions
- **Metadata**: Rich metadata for debugging and monitoring

### Timer Query Operations

#### hasTimer(timerId): boolean
#### getTimerCount(): number  
#### getTimerInfo(timerId): TimerInfo | undefined

**Contract**: Query operations for timer management

**Performance**: All operations are O(1) or O(n) where n is number of timers

---

## Resource Management Integration

### Resource Registration

#### registerOperation<T>(operation: Promise<T>): Promise<T>

**Contract**: Registers operation for graceful shutdown coordination

**Behavior**:
- **Work Validation**: Throws if service not accepting work
- **Auto-cleanup**: Removes operation from tracking on completion
- **Shutdown Coordination**: Operations are awaited during shutdown

**Error Conditions**:
- Throws `SystemError` with code `SERVICE_NOT_ACCEPTING_WORK` if called when not accepting work

### Resource Manager Coordination

The BaseService integrates with ResourceManager for:
- **Automatic Cleanup**: All managed resources are cleaned up during shutdown
- **Leak Detection**: ResourceManager tracks resource lifecycles
- **Priority-based Cleanup**: Critical resources cleaned up first
- **Timeout Handling**: Forced cleanup after timeout periods

---

## Service Lifecycle Management

### State Machine

```
CREATED → INITIALIZING → READY → SHUTTING_DOWN → SHUTDOWN
    ↓                      ↓
   FAILED ←――――――――――――― FAILED
```

### State Transition Rules

1. **CREATED → INITIALIZING**: Only valid initial transition
2. **INITIALIZING → READY**: Successful initialization
3. **INITIALIZING → FAILED**: Initialization failure
4. **READY → SHUTTING_DOWN**: Normal shutdown initiation
5. **READY → FAILED**: Runtime failure
6. **SHUTTING_DOWN → SHUTDOWN**: Successful shutdown
7. **FAILED → SHUTTING_DOWN**: Emergency shutdown

### Work Acceptance

Service accepts work only when:
- `acceptingWork` is `true`
- `serviceState` is `READY`

---

## Health Monitoring API

### Template Method Pattern

#### buildHealthStatus(): ServiceHealthStatus

**Contract**: Template method orchestrating health data collection

**Algorithm**:
1. Determine overall health state via `isHealthy()`
2. Collect service name via `getServiceName()`
3. Gather error information via `getHealthErrors()`
4. Compile metrics via `getHealthMetrics()`

#### Template Method Hooks

**isHealthy(): boolean**
- Default: `isInitialized && !isShuttingDown`
- Override for custom health logic

**getHealthErrors(): string[]**
- Default: Basic initialization and shutdown state errors
- Override for service-specific error reporting

**getHealthMetrics(): Record<string, unknown> | undefined**
- Combines timer metrics with service-specific metrics
- Timer metrics automatically included
- Service metrics from `collectServiceMetrics()`

### Metrics Collection

#### Timer Metrics Structure
```typescript
{
  timers: {
    count: number,
    byType: { interval: number, timeout: number },
    totalErrors: number,
    timersWithErrors: number,
    coalescedTimers: number,
    coalescingGroups: number,
    timerEfficiency: string,
    overheadReduction: string,
    oldestTimerAgeMs: number,
    newestTimerAgeMs: number
  }
}
```

#### Resource Metrics Integration
When ResourceManager has resources, includes:
```typescript
{
  resources: {
    total: number,
    byType: Record<string, number>,
    byPriority: Record<string, number>,
    averageAge: number,
    failedCleanups: number,
    leakDetected: boolean,
    pendingCleanup: number
  }
}
```

---

## Event System API

### Event Registration

#### on<K extends keyof ServiceLifecycleEvents>(event, handler): void

**Contract**: Register lifecycle event handlers

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

### Event Emission Guarantees

- **State Changes**: Always emitted for state transitions
- **Lifecycle Events**: Emitted for all major lifecycle operations
- **Error Events**: Emitted for all significant failures
- **Resource Events**: Emitted for resource registration and cleanup failures

---

## Type Definitions

### Core Types

```typescript
enum ServiceState {
  CREATED = 'created',
  INITIALIZING = 'initializing', 
  READY = 'ready',
  SHUTTING_DOWN = 'shutting_down',
  SHUTDOWN = 'shutdown',
  FAILED = 'failed'
}

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
  originalInterval?: number;
  coalescedInterval?: number;
  coalescingGroup?: string;
}

interface TimerCoalescingGroup {
  interval: number;
  timer: NodeJS.Timeout;
  callbacks: Map<string, () => void>;
  lastExecuted: number;
}
```

### Option Types

```typescript
interface TimerOptions {
  coalesce?: boolean;
}

interface ManagedTimerOptions {
  priority?: 'low' | 'medium' | 'high' | 'critical';
  coalesce?: boolean;
}
```

---

## Error Handling Contracts

### Error Enrichment

All errors are enriched with:
- Service name context
- Operation phase information
- Timing data when available
- Additional service-specific context

### Error Types

1. **SystemError**: For state validation and operational errors
2. **Enriched Errors**: Wrapped exceptions with additional context
3. **ServiceInitializationError**: From IService interface (thrown by subclasses)

### Error Handling Patterns

- **Initialization**: Errors are enriched and re-thrown
- **Shutdown**: Errors are logged but not thrown
- **Timer Callbacks**: Errors are caught, logged, and tracked in metrics
- **Event Handlers**: Errors are caught and logged

---

## Behavioral Contracts

### Idempotency Guarantees

- **initialize()**: Safe to call multiple times
- **shutdown()**: Safe to call multiple times
- **clearTimer()**: Safe to call with non-existent timer IDs
- **clearAllTimers()**: Safe to call when no timers exist

### Concurrency Safety

- **Promise Caching**: Concurrent initialization/shutdown calls return same promise
- **State Transitions**: Atomic state changes with proper synchronization
- **Timer Management**: Thread-safe timer operations

### Resource Cleanup Guarantees

- **Timer Cleanup**: All timers cleaned up during shutdown
- **Resource Manager**: All registered resources cleaned up
- **Emergency Cleanup**: Forced cleanup attempted on failures
- **No Resource Leaks**: Comprehensive cleanup prevents resource leaks

---

## Performance Characteristics

### Timer Coalescing Efficiency

- **Overhead Reduction**: Up to 50% reduction in timer overhead for coalesced timers
- **Execution Windows**: 10-second coalescing windows for intervals ≥ 5000ms
- **Memory Efficiency**: Shared timer instances for coalesced groups

### Metrics Collection Performance

- **Lightweight**: Health status collection is O(n) where n is number of timers
- **Non-blocking**: No expensive operations in health checks
- **Cacheable**: Health data suitable for caching if needed

### Shutdown Performance

- **Graceful**: 30-second recommended timeout for shutdown operations
- **Parallel**: Resource cleanup can be parallelized where safe
- **Emergency**: Forced cleanup with 5-second timeout as fallback

---

## Testing Contracts

### Unit Test Requirements

1. **Lifecycle State Transitions**
   - Verify all valid state transitions
   - Verify invalid transitions throw appropriate errors
   - Verify idempotency of initialization and shutdown

2. **Timer Management**
   - Verify timer creation returns unique IDs
   - Verify timer callback execution and error handling
   - Verify timer cleanup and coalescing behavior
   - Verify timer metrics accuracy

3. **Resource Integration**
   - Verify ResourceManager registration
   - Verify cleanup coordination
   - Verify operation tracking

4. **Health Monitoring**
   - Verify template method pattern execution
   - Verify metrics collection and aggregation
   - Verify health status structure

5. **Error Handling**
   - Verify error enrichment
   - Verify graceful error handling during shutdown
   - Verify emergency cleanup behavior

### Integration Test Requirements

1. **Service Lifecycle**
   - Verify complete initialization → operation → shutdown cycle
   - Verify error recovery and cleanup
   - Verify resource leak prevention

2. **Timer Coalescing**
   - Verify coalescing efficiency gains
   - Verify correct callback execution timing
   - Verify group cleanup when empty

3. **Concurrent Operations**
   - Verify concurrent initialization/shutdown handling
   - Verify ongoing operation coordination during shutdown
   - Verify timer operation thread safety

### Mock Requirements

For testing subclasses, provide mocks for:
- `getServiceName()`: Return predictable service name
- `performInitialization()`: Control initialization behavior and timing
- `performShutdown()`: Control shutdown behavior and timing  
- `collectServiceMetrics()`: Return predictable metrics data

---

## Contract Validation Checklist

### API Compatibility
- [ ] All public method signatures preserved
- [ ] All return types unchanged
- [ ] All error types and conditions maintained
- [ ] All event emissions preserved

### Behavioral Compatibility
- [ ] State transition logic unchanged
- [ ] Timer coalescing algorithm preserved
- [ ] Resource cleanup order maintained
- [ ] Health status structure consistent

### Performance Compatibility
- [ ] Timer efficiency characteristics maintained
- [ ] Health check performance preserved
- [ ] Shutdown timing characteristics unchanged
- [ ] Memory usage patterns consistent

### Integration Compatibility
- [ ] ResourceManager integration preserved
- [ ] IService interface compliance maintained
- [ ] Event system behavior unchanged
- [ ] Error handling patterns consistent

---

This contract specification provides comprehensive coverage of the BaseService API surface and behavioral requirements. Any refactoring must maintain full compatibility with these contracts to ensure zero regression in the service architecture.