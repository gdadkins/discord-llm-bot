# Testing Strategy

Comprehensive testing approach for service extractions and modular architecture development. This guide establishes testing standards, patterns, and best practices for the Discord LLM Bot codebase.

## Overview

### Testing Philosophy
- **Test Pyramid**: 70% unit tests, 20% integration tests, 10% end-to-end tests
- **Service Isolation**: Test services independently before integration
- **Mock Strategy**: Comprehensive mocking for external dependencies
- **Coverage Standards**: 85% minimum for critical services, 90% for core systems
- **Performance Testing**: Quantified performance targets and regression prevention

### Testing Framework Stack
- **Jest**: Primary testing framework with TypeScript support
- **Test Utilities**: Custom mock classes and data generators
- **Coverage**: Istanbul/NYC with HTML reporting
- **CI/CD**: Automated testing with quality gates

## Testing Pyramid

### Unit Tests (70%)
Focus on individual service functionality, business logic, and error handling.

**Coverage Requirements:**
- Critical services: 90% minimum
- Standard services: 85% minimum
- Utility functions: 95% minimum
- Error handling paths: 95% minimum

**Test Targets:**
- Service initialization and shutdown
- Business logic validation
- Error handling and edge cases
- Timer management and cleanup
- Health status reporting
- Configuration validation

### Integration Tests (20%)
Test service interactions, dependency injection, and data flow between components.

**Coverage Requirements:**
- Service communication: 90% minimum
- Data consistency: 95% minimum
- Error propagation: 90% minimum

**Test Targets:**
- Cross-service communication
- Configuration propagation
- Health monitoring integration
- Error cascading and isolation
- Resource cleanup coordination

### End-to-End Tests (10%)
Validate complete workflows and failure scenarios.

**Coverage Requirements:**
- Critical workflows: 100%
- Failure scenarios: 90% minimum

**Test Targets:**
- Complete bot lifecycle
- Discord API integration
- Failure recovery workflows
- Performance under load

## Service Extraction Testing Patterns

### BaseService Testing Template

All services extending BaseService must implement these test patterns:

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let mockDependency: jest.Mocked<DependencyType>;

  beforeEach(() => {
    mockDependency = createMockDependency();
    service = new ServiceName(mockDependency);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('service lifecycle', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      expect(service.getHealthStatus().healthy).toBe(true);
    });

    it('should handle initialization failures', async () => {
      // Mock initialization failure
      await expect(service.initialize()).rejects.toThrow();
    });

    it('should shutdown gracefully', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.getHealthStatus().healthy).toBe(false);
    });
  });

  describe('business logic', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    // Service-specific tests
  });

  describe('error handling', () => {
    // Error scenario tests
  });

  describe('health monitoring', () => {
    // Health status tests
  });
});
```

### Dependency Injection Testing

Services with dependencies must test injection and isolation:

```typescript
describe('ServiceWithDependencies', () => {
  let service: ServiceWithDependencies;
  let mockHealthMonitor: jest.Mocked<HealthMonitor>;
  let mockConfigManager: jest.Mocked<ConfigurationManager>;

  beforeEach(() => {
    mockHealthMonitor = createMockHealthMonitor();
    mockConfigManager = createMockConfigurationManager();
    
    service = new ServiceWithDependencies(
      mockHealthMonitor,
      mockConfigManager
    );
  });

  it('should function without optional dependencies', async () => {
    const serviceWithoutOptional = new ServiceWithDependencies(
      mockHealthMonitor
      // Optional dependencies omitted
    );
    
    await serviceWithoutOptional.initialize();
    expect(serviceWithoutOptional.getHealthStatus().healthy).toBe(true);
  });

  it('should handle dependency failures gracefully', async () => {
    mockHealthMonitor.getCurrentMetrics.mockRejectedValue(
      new Error('Health monitor failed')
    );

    await service.initialize();
    // Service should continue operating
    expect(service.getHealthStatus().healthy).toBe(true);
  });
});
```

### Configuration Testing Patterns

Test configuration validation and hot reload functionality:

```typescript
describe('configuration management', () => {
  it('should validate configuration structure', () => {
    const invalidConfig = createMockConfiguration();
    delete invalidConfig.features.monitoring;

    const validation = service.validateConfiguration(invalidConfig);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Missing monitoring configuration');
  });

  it('should handle configuration updates', async () => {
    const configChangedHandler = jest.fn();
    service.on('config:changed', configChangedHandler);

    await service.updateConfiguration(newConfig, 'test', 'Update test');
    
    expect(configChangedHandler).toHaveBeenCalled();
    expect(service.getConfiguration()).toEqual(newConfig);
  });

  it('should rollback failed configuration updates', async () => {
    const originalConfig = service.getConfiguration();
    const invalidConfig = { invalid: 'config' };

    await expect(
      service.updateConfiguration(invalidConfig, 'test', 'Invalid update')
    ).rejects.toThrow();

    expect(service.getConfiguration()).toEqual(originalConfig);
  });
});
```

## Mock Strategies

### Service Mocking
Use Jest mocks for external service dependencies:

```typescript
// Mock external services
jest.mock('../../services/gemini', () => ({
  GeminiService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    getConversationStats: jest.fn().mockReturnValue(mockStats),
    clearCache: jest.fn(),
  })),
}));
```

### Data Mocking
Use test utilities for consistent mock data:

```typescript
import { 
  createMockMetrics,
  createMockConfiguration,
  createMockUserPreferences,
  createTestEnvironment 
} from '../test-utils';

describe('ServiceTest', () => {
  let testEnv: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    testEnv = createTestEnvironment();
  });

  afterEach(() => {
    testEnv.cleanup();
  });
});
```

### Discord.js Mocking
Mock Discord.js components for integration tests:

```typescript
class MockCollection<K, V> extends Map<K, V> {
  filter(fn: (value: V, key: K, collection: this) => boolean): MockCollection<K, V> {
    const filtered = new MockCollection<K, V>();
    for (const [key, val] of this) {
      if (fn(val, key, this)) filtered.set(key, val);
    }
    return filtered;
  }
}

const mockGuild: jest.Mocked<Guild> = {
  id: 'test-guild-123',
  name: 'Test Guild',
  memberCount: 100,
  channels: { cache: new MockCollection() },
  emojis: { cache: new MockCollection() },
  // ... other properties
} as any;
```

## Performance Testing

### Memory Usage Testing
Monitor memory consumption and leaks:

```typescript
describe('memory management', () => {
  it('should not leak memory under load', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Perform operations
    for (let i = 0; i < 1000; i++) {
      await service.processRequest(mockRequest);
    }
    
    // Force garbage collection
    global.gc?.();
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB limit
  });
});
```

### Response Time Testing
Validate performance targets:

```typescript
describe('performance targets', () => {
  it('should meet response time requirements', async () => {
    const startTime = Date.now();
    await service.processRequest(mockRequest);
    const responseTime = Date.now() - startTime;
    
    expect(responseTime).toBeLessThan(200); // 200ms target
  });

  it('should handle concurrent requests efficiently', async () => {
    const requests = Array(100).fill(null).map(() => 
      service.processRequest(mockRequest)
    );
    
    const startTime = Date.now();
    await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    
    expect(totalTime).toBeLessThan(2000); // 2s for 100 concurrent requests
  });
});
```

## Error Testing Patterns

### Error Propagation Testing
Test error handling and recovery:

```typescript
describe('error handling', () => {
  it('should handle API failures gracefully', async () => {
    mockExternalAPI.request.mockRejectedValue(new Error('API failure'));
    
    const result = await service.performOperation();
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(service.getHealthStatus().healthy).toBe(true); // Should remain healthy
  });

  it('should retry failed operations', async () => {
    mockExternalAPI.request
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce(mockResponse);
    
    const result = await service.performOperation();
    
    expect(result.success).toBe(true);
    expect(mockExternalAPI.request).toHaveBeenCalledTimes(2);
  });

  it('should circuit break after repeated failures', async () => {
    // Mock 5 consecutive failures
    for (let i = 0; i < 5; i++) {
      mockExternalAPI.request.mockRejectedValueOnce(new Error('Failure'));
    }
    
    // Circuit should be open after 5 failures
    const result = await service.performOperation();
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Circuit breaker');
  });
});
```

### Resource Cleanup Testing
Verify proper resource management:

```typescript
describe('resource cleanup', () => {
  it('should clear all timers on shutdown', async () => {
    await service.initialize();
    
    // Create some timers
    service['createInterval']('test1', () => {}, 1000);
    service['createTimeout']('test2', () => {}, 2000);
    
    expect(service['getTimerCount']()).toBe(2);
    
    await service.shutdown();
    
    expect(service['getTimerCount']()).toBe(0);
  });

  it('should clean up event listeners', async () => {
    const mockEventEmitter = new MockEventEmitter();
    service.setEventEmitter(mockEventEmitter);
    
    await service.initialize();
    expect(mockEventEmitter.getListeners('test').length).toBeGreaterThan(0);
    
    await service.shutdown();
    expect(mockEventEmitter.getListeners('test').length).toBe(0);
  });
});
```

## Integration Testing Patterns

### Service Communication Testing
Test cross-service communication:

```typescript
describe('service integration', () => {
  let healthMonitor: HealthMonitor;
  let gracefulDegradation: GracefulDegradation;

  beforeEach(async () => {
    healthMonitor = new HealthMonitor();
    gracefulDegradation = new GracefulDegradation();
    
    await healthMonitor.initialize();
    await gracefulDegradation.initialize();
    
    gracefulDegradation.setHealthMonitor(healthMonitor);
  });

  afterEach(async () => {
    await gracefulDegradation.shutdown();
    await healthMonitor.shutdown();
  });

  it('should coordinate health monitoring and degradation', async () => {
    // Trigger degradation condition
    const status = await gracefulDegradation.shouldDegrade();
    
    expect(status.shouldDegrade).toBeDefined();
    expect(typeof status.shouldDegrade).toBe('boolean');
  });
});
```

### Configuration Propagation Testing
Test configuration changes across services:

```typescript
describe('configuration propagation', () => {
  it('should propagate config changes to dependent services', async () => {
    const configChanges: any[] = [];
    
    serviceA.on('config:changed', (changes) => configChanges.push(changes));
    serviceB.on('config:changed', (changes) => configChanges.push(changes));
    
    await configManager.updateConfiguration(newConfig, 'test', 'Update');
    
    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(configChanges.length).toBe(2);
    expect(serviceA.getConfiguration()).toEqual(newConfig);
    expect(serviceB.getConfiguration()).toEqual(newConfig);
  });
});
```

## Test Data Management

### Test Environment Setup
Use isolated test environments:

```typescript
describe('TestService', () => {
  let testEnv: ReturnType<typeof createTestEnvironment>;
  let service: TestService;

  beforeEach(() => {
    testEnv = createTestEnvironment();
    service = new TestService({
      dataDir: testEnv.tempDir,
      mockFileSystem: testEnv.mockFs
    });
  });

  afterEach(() => {
    testEnv.cleanup();
  });
});
```

### Mock Data Consistency
Use factories for consistent test data:

```typescript
function createMockHealthMetrics(overrides?: Partial<HealthMetrics>): HealthMetrics {
  return {
    memoryUsage: { rss: 100 * 1024 * 1024, heapUsed: 60 * 1024 * 1024 },
    activeConversations: 5,
    rateLimitStatus: { minuteRemaining: 8, dailyRemaining: 450 },
    uptime: 3600000,
    errorRate: 2.5,
    responseTime: { p50: 150, p95: 800, p99: 1200 },
    ...overrides
  };
}
```

## Quality Gates

### Coverage Requirements
- **Unit Tests**: 85% line coverage minimum
- **Critical Services**: 90% line coverage minimum
- **Error Handling**: 95% coverage of error paths
- **Integration Points**: 90% coverage of service interactions

### Performance Standards
- **Response Times**: P95 < 800ms, P99 < 1200ms
- **Memory Usage**: Stable under load, < 50MB increase per 1000 operations
- **Throughput**: Support 100+ concurrent operations
- **Startup Time**: Service initialization < 5s

### Test Quality Standards
- **Test Isolation**: No shared state between tests
- **Deterministic**: Tests produce consistent results
- **Fast Execution**: Unit tests < 50ms each
- **Clear Assertions**: Specific, meaningful assertions
- **Error Messages**: Descriptive failure messages

## Continuous Integration

### Pre-commit Hooks
```bash
# Lint and format
npm run lint:fix

# Run unit tests only for speed
npm run test:unit

# Type checking
npm run build
```

### CI Pipeline
```bash
# Full test suite
npm run test

# Coverage validation
npm run test:coverage

# Performance regression detection
npm run benchmark:compare

# Integration tests
npm run test:integration

# Build verification
npm run build
```

### Quality Gate Enforcement
- All tests must pass
- Coverage thresholds must be met
- Performance benchmarks must not regress > 20%
- No TypeScript compilation errors
- ESLint violations auto-fixed or resolved

## Best Practices

### Test Organization
- Group related tests with `describe` blocks
- Use descriptive test names that explain behavior
- Follow AAA pattern: Arrange, Act, Assert
- One assertion per test when possible
- Use `beforeEach` and `afterEach` for setup/cleanup

### Mock Guidelines
- Mock external dependencies, not internal logic
- Use factory functions for consistent mock data
- Verify mock interactions when relevant
- Reset mocks between tests
- Use realistic mock data that matches production

### Error Testing
- Test both expected and unexpected errors
- Verify error messages and types
- Test error recovery mechanisms
- Validate that errors don't break service state
- Test timeout and retry scenarios

### Performance Testing
- Establish baseline measurements
- Test under realistic load conditions
- Monitor memory usage and cleanup
- Validate performance targets
- Test concurrent access patterns

### Documentation
- Document complex test scenarios
- Explain mock strategies
- Provide examples of testing patterns
- Keep test documentation updated
- Include performance baselines

## Service Extraction Checklist

When extracting a new service, ensure:

- [ ] Unit tests cover all public methods
- [ ] Integration tests verify dependencies
- [ ] Error handling tests for all failure modes
- [ ] Performance tests meet established targets
- [ ] Mock strategies for all external dependencies
- [ ] Health monitoring integration tests
- [ ] Configuration management tests
- [ ] Resource cleanup verification
- [ ] Memory leak prevention tests
- [ ] Timer management tests (if applicable)
- [ ] Event handling tests (if applicable)
- [ ] Concurrent access tests
- [ ] Graceful degradation tests
- [ ] Documentation includes testing examples

---

*For service-specific testing examples and templates, see the Test Writing Guide.*