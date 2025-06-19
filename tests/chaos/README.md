# Chaos Engineering Test Framework

A comprehensive chaos engineering and resilience testing framework for validating system behavior under failure conditions.

## Overview

This framework provides tools for testing system resilience through controlled failure injection, load testing with errors, and comprehensive validation of error handling implementations.

## Framework Components

### Core Framework
- **ChaosTestFramework.ts**: Main orchestrator for executing chaos scenarios
- **ServiceFailures.ts**: Predefined failure scenarios for common services
- **ValidationTests.ts**: Tests to validate implementations from all agents
- **LoadTestWithErrors.ts**: Load testing with error injection capabilities

### Test Scenarios

#### Service Failure Scenarios
1. **gemini_api_timeout**: Tests Gemini API timeout handling and circuit breaker behavior
2. **discord_api_degradation**: Simulates Discord API intermittent failures
3. **memory_pressure**: Tests system behavior under high memory usage
4. **cascading_failures**: Validates protection against cascading service failures

#### Load Test Scenarios
- **Light Load**: 5 concurrent users, 2 RPS, 5% error rate
- **Moderate Load**: 20 concurrent users, 10 RPS, 10% error rate
- **Heavy Load**: 50 concurrent users, 25 RPS, 15% error rate
- **Stress Test**: 100 concurrent users, 50 RPS, 20% error rate

## Quick Start

### Running Basic Chaos Tests
```bash
# Run service failure scenarios only
npm run test:chaos:basic

# Run comprehensive chaos tests (includes load testing)
npm run test:chaos:full

# Run quick validation of critical scenarios
npm run test:chaos:validation
```

### Using the Framework Programmatically

```typescript
import { ChaosTestFramework, serviceFailureScenarios } from './tests/chaos';

// Create framework instance
const framework = new ChaosTestFramework({
  maxConcurrentScenarios: 2,
  failureThreshold: 0.1,
  recoveryTimeoutMs: 60000
});

// Add scenarios
serviceFailureScenarios.forEach(scenario => {
  framework.addScenario(scenario);
});

// Run a specific scenario
const result = await framework.runScenario('gemini_api_timeout');
console.log('Test result:', result);

// Run all scenarios
const allResults = await framework.runAllScenarios();
const report = framework.generateReport();
console.log('Overall success rate:', report.successRate);
```

### Load Testing with Error Injection

```typescript
import { runLoadTestWithErrors, loadTestScenarios } from './tests/load/LoadTestWithErrors';

// Run moderate load test
const results = await runLoadTestWithErrors(loadTestScenarios.moderate);

console.log('Throughput:', results.throughput);
console.log('Success rate:', results.successfulRequests / results.totalRequests);
console.log('Resilience score:', results.resilienceScore);
console.log('Performance grade:', results.analysis.performanceGrade);
```

## Configuration

### Environment Variables

```bash
# Enable verbose logging for chaos tests
CHAOS_VERBOSE=true

# Enable metrics collection
CHAOS_METRICS=true

# Timeout multiplier for slower environments
CHAOS_TIMEOUT_MULTIPLIER=1.5

# Maximum memory usage threshold (MB)
CHAOS_MAX_MEMORY_MB=2048
```

### Framework Configuration

```typescript
const config = {
  maxConcurrentScenarios: 3,        // Max parallel scenarios
  failureThreshold: 0.1,            // 10% failure threshold
  recoveryTimeoutMs: 60000,         // Recovery timeout
  systemStatePollingInterval: 2000, // State polling interval
  enableMetricsCollection: true,    // Enable metrics
  enableSystemStateTracking: true   // Track system state
};
```

## Scenario Structure

### Creating Custom Scenarios

```typescript
import { ChaosScenario } from './ChaosTestFramework';

const customScenario: ChaosScenario = {
  name: 'custom_failure',
  description: 'Tests custom failure condition',
  timeout: 60000,
  dependencies: ['prerequisite_scenario'],
  
  setup: async () => {
    // Initialize test conditions
    // Mock services, inject failures, etc.
  },
  
  execute: async () => {
    // Execute the chaos condition
    // Trigger failures, send requests, etc.
  },
  
  verify: async () => {
    // Verify system behavior
    // Check circuit breakers, recovery, etc.
    if (/* verification fails */) {
      throw new Error('Verification failed');
    }
  },
  
  cleanup: async () => {
    // Clean up test artifacts
    // Restore mocks, clear state, etc.
  }
};
```

### Scenario Dependencies

Scenarios can depend on other scenarios:

```typescript
const dependentScenario: ChaosScenario = {
  name: 'dependent_test',
  dependencies: ['gemini_api_timeout', 'memory_pressure'],
  // ... rest of scenario
};
```

## Metrics and Reporting

### Test Results

Each scenario execution produces detailed results:

```typescript
interface TestResult {
  scenario: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: Error;
  steps: StepResult[];
  systemState?: SystemState;
  recoveryTime?: number;
}
```

### System State Tracking

The framework tracks system state during execution:

```typescript
interface SystemState {
  memoryUsage: number;
  cpuUsage: number;
  diskUsage: number;
  networkConnections: number;
  openFileDescriptors: number;
  errorRate: number;
  responseTime: number;
  queueSizes: Record<string, number>;
  circuitBreakerStates: Record<string, string>;
  healthStatus: string;
}
```

### Generated Reports

The framework generates comprehensive reports:

- **JSON Report**: Machine-readable detailed results
- **Markdown Summary**: Human-readable executive summary
- **Individual Reports**: Separate reports for each test phase

Example report structure:
```
test-results/chaos/
├── chaos-test-report.json       # Main report
├── chaos-test-summary.md        # Executive summary
├── service-failure-report.json  # Service failure results
├── load-test-results.json       # Load test results
└── validation-results.json      # Validation results
```

## Validation Framework

### Agent Implementation Validation

The framework validates implementations from all error handling agents:

1. **Agent 1**: Enhanced Error Classification
2. **Agent 2**: Intelligent Retry Mechanisms
3. **Agent 3**: Advanced Circuit Breaker
4. **Agent 4**: Graceful Degradation Enhancement
5. **Agent 5**: Error Context and Logging
6. **Agent 6**: User Communication Enhancement

### Validation Tests

```typescript
// Validate error classification
test('validates comprehensive error categorization', async () => {
  // Test error classification logic
});

// Validate retry mechanisms
test('validates exponential backoff retry logic', async () => {
  // Test retry behavior
});

// Validate circuit breakers
test('validates circuit breaker state transitions', async () => {
  // Test circuit breaker functionality
});
```

## Best Practices

### Writing Chaos Scenarios

1. **Isolation**: Each scenario should be independent
2. **Cleanup**: Always implement proper cleanup
3. **Timeouts**: Set appropriate timeouts for scenarios
4. **Verification**: Thoroughly verify expected behavior
5. **Documentation**: Document expected outcomes

### Running Tests

1. **Environment**: Run in isolated test environment
2. **Resources**: Ensure adequate system resources
3. **Monitoring**: Monitor system state during tests
4. **Analysis**: Review reports and metrics
5. **Iteration**: Refine scenarios based on results

### Error Handling

```typescript
// Always handle errors in scenarios
setup: async () => {
  try {
    // Setup logic
  } catch (error) {
    logger.error('Setup failed', { error });
    throw error;
  }
},

cleanup: async () => {
  try {
    // Cleanup logic
  } catch (error) {
    logger.error('Cleanup failed', { error });
    // Don't re-throw cleanup errors
  }
}
```

## Performance Considerations

### Memory Management

- Monitor memory usage during tests
- Implement proper cleanup
- Use memory pressure scenarios to test limits
- Force garbage collection when needed

### Concurrency

- Limit concurrent scenarios based on system capacity
- Consider resource contention
- Use appropriate delays between operations
- Monitor system load

### Timeouts

- Set realistic timeouts based on expected behavior
- Use timeout multipliers for slower environments
- Implement progressive timeouts for retries
- Monitor timeout frequency

## Troubleshooting

### Common Issues

1. **Test Timeouts**: Increase timeout multiplier or scenario timeouts
2. **Memory Issues**: Reduce concurrent scenarios or implement cleanup
3. **Mock Failures**: Ensure proper mock setup and cleanup
4. **Flaky Tests**: Review timing assumptions and add stabilization waits

### Debug Mode

Enable verbose logging for debugging:

```bash
CHAOS_VERBOSE=true npm run test:chaos
```

### Memory Debugging

Monitor memory usage:

```typescript
const memoryBefore = global.chaosTestUtils.getMemoryUsage();
// ... test logic ...
const memoryAfter = global.chaosTestUtils.getMemoryUsage();
console.log('Memory delta:', memoryAfter.heapUsed - memoryBefore.heapUsed);
```

## Contributing

### Adding New Scenarios

1. Create scenario in appropriate file
2. Add to scenario exports
3. Update tests if needed
4. Document expected behavior
5. Test thoroughly

### Extending Framework

1. Follow existing patterns
2. Maintain backward compatibility
3. Add comprehensive tests
4. Update documentation
5. Consider performance impact

## Integration

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Chaos Tests
  run: |
    npm run test:chaos:validation
    npm run test:chaos:basic
  env:
    CHAOS_TIMEOUT_MULTIPLIER: 2.0
    CHAOS_VERBOSE: false
```

### Custom Integrations

The framework can be integrated with existing monitoring and alerting systems:

```typescript
import { ChaosTestSuite } from './tests/chaos';

const suite = new ChaosTestSuite({
  outputDirectory: process.env.CHAOS_OUTPUT_DIR
});

const results = await suite.runFullSuite();

// Send results to monitoring system
await sendToMonitoring(results);

// Alert on failures
if (results.overallScore < 80) {
  await sendAlert(results);
}
```