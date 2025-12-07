# API Contracts

This directory contains API contract documentation for core service classes, ensuring consistent interfaces across the codebase.

## BaseService Contract

The `BaseService` abstract class provides the foundation for all services in the bot. See [BaseService_Contract_Summary.md](BaseService_Contract_Summary.md) for the complete API specification.

### Core Interface

```typescript
interface IService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getHealthStatus(): HealthStatus;
}
```

### Key Features

- **Service Lifecycle Management**: 6-state machine (CREATED, INITIALIZING, READY, SHUTTING_DOWN, SHUTDOWN, ERROR)
- **Timer Management**: Coalesced timers with automatic cleanup
- **Health Monitoring**: Template method pattern for health status collection
- **Resource Tracking**: Integration with ResourceManager for cleanup

## Contract Testing

Contract tests are located in `tests/contracts/`. Run them with:

```bash
npm test -- tests/contracts/
```

## Related Documentation

- [Service Architecture](../SERVICE_ARCHITECTURE.md) - Service design guidelines
- [Architecture Overview](../ARCHITECTURE.md) - System architecture
