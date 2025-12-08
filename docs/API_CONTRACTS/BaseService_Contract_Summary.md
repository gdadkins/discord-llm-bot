# BaseService API Contract Summary

**Purpose**: Quick reference for BaseService refactoring contract validation  
**Target**: Ensure zero regressions in BaseService public API

---

## Critical API Signatures

### Core Service Lifecycle
```typescript
// MUST maintain exact signatures
abstract class BaseService implements IService {
  initialize(): Promise<void>               // Idempotent, concurrent-safe
  shutdown(): Promise<void>                 // Comprehensive cleanup
  getHealthStatus(): ServiceHealthStatus    // Template method pattern
  getServiceState(): ServiceState          // Current lifecycle state
  isAcceptingWork(): boolean               // Work acceptance status
}
```

### Timer Management (Core Features)
```typescript
// Primary timer operations - MUST preserve signatures
createInterval(name: string, callback: () => void, interval: number, options?: { coalesce?: boolean }): string
createTimeout(name: string, callback: () => void, delay: number): string
clearTimer(timerId: string): boolean
clearAllTimers(): void
hasTimer(timerId: string): boolean
getTimerCount(): number
getTimerInfo(timerId: string): BaseServiceTimerInfo | undefined
```

### Advanced Timer Features
```typescript
// Advanced features - MUST maintain compatibility
createCoalescedInterval(name: string, callback: () => void, requestedInterval: number): string
createManagedInterval(name: string, callback: () => void | Promise<void>, interval: number, options?: TimerCreationOptions): string
createManagedTimeout(name: string, callback: () => void | Promise<void>, delay: number, options?: { priority?: string }): string
```

### Resource & Operation Management
```typescript
// Integration points - MUST preserve behavior
registerOperation<T>(operation: Promise<T>): Promise<T>
getServiceStatus(): BaseServiceStatus
on<K extends keyof ServiceLifecycleEvents>(event: K, handler: ServiceLifecycleEvents[K]): void
```

## Abstract Method Contracts

```typescript
// Subclass implementation requirements - MUST remain abstract
protected abstract getServiceName(): string
protected abstract performInitialization(): Promise<void>
protected abstract performShutdown(): Promise<void>
protected abstract collectServiceMetrics(): Record<string, unknown> | undefined
```

## Data Structure Contracts

### ServiceState Enum
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

### Health Status Structure
```typescript
interface ServiceHealthStatus {
  healthy: boolean;
  name: string;
  errors: string[];
  metrics?: Record<string, unknown>;
}
```

### Timer Information (Public View)
```typescript
interface BaseServiceTimerInfo {
  id: string;
  type: 'interval' | 'timeout';
  intervalMs?: number;
  delayMs?: number;
  createdAt: number;
  lastExecuted?: number;
  errorCount: number;
}
```

## Behavioral Contracts

### Initialization Behavior
- **Idempotent**: Safe to call multiple times
- **Concurrent-safe**: Handles parallel initialization attempts
- **State Transitions**: CREATED → INITIALIZING → READY (or FAILED)
- **Event Emission**: initialization-started, initialization-completed, initialization-failed
- **Error Handling**: Enriched errors with service context, emergency cleanup on failure

### Shutdown Behavior
- **Comprehensive**: Stops work → waits for operations → clears timers → service cleanup → resource cleanup
- **Multi-call Safe**: Safe to call multiple times
- **State Tracking**: Updates to SHUTTING_DOWN → SHUTDOWN
- **Resource Management**: Integrates with ResourceManager for complete cleanup

### Timer Management Behavior
- **Coalescing**: Automatic for intervals ≥ 5s, grouped into 10s windows
- **Error Handling**: Wrapped callbacks with error counting and logging
- **Cleanup Integration**: Automatic cleanup on service shutdown
- **Resource Tracking**: Integration with ResourceManager for advanced timers

### Health Monitoring Behavior
- **Template Method**: buildHealthStatus() combines timer + service metrics
- **Lightweight**: Safe for frequent polling
- **Comprehensive**: Includes lifecycle, timer, and resource metrics

## Critical Configuration Constants

```typescript
private readonly COALESCING_INTERVAL = 10000;        // 10 seconds
private readonly MIN_COALESCING_INTERVAL = 5000;     // 5 seconds
```

## Testing Priorities (Contract Validation)

### 1. Core Lifecycle (Critical)
- [ ] Initialize idempotency and concurrent call handling
- [ ] State transition sequence verification
- [ ] Shutdown resource cleanup completeness
- [ ] Error handling and enrichment patterns

### 2. Timer Management (High)
- [ ] Timer creation returns unique IDs
- [ ] Coalescing behavior for eligible intervals
- [ ] Timer cleanup during shutdown
- [ ] Error handling in timer callbacks
- [ ] Timer information query accuracy

### 3. Resource Integration (High)
- [ ] Operation tracking and shutdown coordination
- [ ] ResourceManager integration
- [ ] Event emission for lifecycle events
- [ ] Emergency cleanup procedures

### 4. Health Monitoring (Medium)
- [ ] Health status structure compliance
- [ ] Metrics aggregation (timer + service)
- [ ] Performance characteristics
- [ ] Error reporting accuracy

### 5. API Compatibility (Critical)
- [ ] All public method signatures preserved
- [ ] Return type compatibility
- [ ] Error type consistency
- [ ] Event interface compatibility

## Risk Areas for Refactoring

### High Risk
1. **Timer Coalescing Logic**: Complex grouping and cleanup logic
2. **Lifecycle State Management**: State transition sequencing
3. **Resource Cleanup Coordination**: Multi-system integration
4. **Error Handling Patterns**: Error enrichment and context

### Medium Risk
1. **Event System Implementation**: Type-safe event handling
2. **Health Metrics Aggregation**: Template method pattern
3. **Concurrent Operation Handling**: Promise tracking and coordination

### Low Risk
1. **Abstract Method Contracts**: Interface definitions
2. **Configuration Constants**: Timer intervals and thresholds
3. **Type Definitions**: Interface structures

## Contract Test Checklist

For each refactoring iteration, verify:

- [ ] All public method signatures unchanged
- [ ] ServiceState enum values preserved  
- [ ] Timer coalescing behavior consistent
- [ ] Health status structure compatible
- [ ] Event emission patterns maintained
- [ ] Error handling contracts preserved
- [ ] Resource cleanup comprehensiveness
- [ ] Performance characteristics maintained

## Files to Monitor During Refactoring

### Primary Target
- `src/services/base/BaseService.ts` - Main implementation

### Integration Points
- `src/services/interfaces/CoreServiceInterfaces.ts` - IService contract
- `src/utils/ResourceManager.ts` - Resource management integration
- `src/utils/ErrorHandlingUtils.ts` - Error enrichment patterns

### Contract Validation
- `docs/API_CONTRACTS/BaseService_API_Contract.md` - Detailed specification
- `docs/API_CONTRACTS/BaseService_Interface_Definitions.ts` - Type definitions
- `docs/API_CONTRACTS/BaseService_Contract_Summary.md` - This summary

---

**Refactoring Success Criteria**: All contract tests pass, performance characteristics maintained, zero API breaking changes, comprehensive test coverage of edge cases.