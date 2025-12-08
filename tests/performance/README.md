# Performance Testing and Monitoring Guide

This directory contains comprehensive performance testing and monitoring tools for the Discord bot.

## Components

### 1. Performance Benchmarks (`benchmarks.test.ts`)
Comprehensive performance tests that validate optimization targets:
- **Cache O(1) Operations**: Ensures constant-time cache access
- **Compression Ratios**: Validates >70% compression for typical data
- **Async Parallelization**: Confirms >2x speedup with parallel processing
- **Memory Management**: Tests efficient memory usage with large datasets
- **End-to-End Performance**: Validates real-world request processing times

### 2. Load Testing (`scripts/loadTest.ts`)
Simulates concurrent users to test bot scalability:
- Worker thread-based for true concurrency
- Configurable scenarios (messages, commands, images)
- Response time percentile tracking (p50, p95, p99)
- Comprehensive reporting with error analysis

### 3. Performance Dashboard (`src/monitoring/performanceDashboard.ts`)
Real-time performance monitoring with alerting:
- Response time tracking
- Cache hit/miss rates
- Memory usage monitoring
- Error rate tracking
- Health scoring and automated alerts

### 4. Regression Tests (`regression.test.ts`)
Prevents performance degradation between releases:
- Compares against baseline metrics
- Maximum 10% response time regression allowed
- Maximum 5% memory usage increase allowed
- Automated baseline updates

## Usage

### Running Performance Tests

```bash
# Run all performance benchmarks
npm run test:performance

# Run regression tests
npm run test:regression

# Update regression baseline
npm run test:performance:update-baseline
```

### Load Testing

```bash
# Standard load test (100 users, 60s)
npm run load-test

# Quick test (10 users, 10s)
npm run load-test:quick

# Stress test (500 users, 300s)
npm run load-test:stress
```

### Performance Monitoring

```bash
# Start performance dashboard
npm run performance:dashboard
```

## Integration Example

```typescript
import { performanceDashboard } from './src/monitoring/performanceDashboard';
import { processMessageWithMonitoring } from './src/monitoring/performanceIntegration';

// Initialize monitoring
performanceDashboard.start();

// Wrap message processing
client.on('messageCreate', async (message) => {
  await processMessageWithMonitoring(message, async (msg) => {
    // Your message handling logic
  });
});

// Track custom metrics
performanceDashboard.recordResponseTime(responseTime, { operation: 'custom_operation' });
```

## Performance Targets

| Metric | Target | Threshold |
|--------|--------|-----------|
| Response Time (p99) | <100ms | 1000ms alert |
| Cache Hit Rate | >80% | 80% warning |
| Memory Usage | <500MB | 500MB alert |
| Error Rate | <1% | 5% alert |
| Async Speedup | >2x | N/A |
| Compression Ratio | >70% | N/A |

## Report Locations

- **Benchmark Reports**: `reports/performance/benchmark-*.json|md`
- **Load Test Reports**: `reports/load-test/load-test-*.json|md`
- **Dashboard Reports**: `reports/performance-monitoring/dashboard-*.json|md`
- **Regression Reports**: `reports/performance/regression-*.json|md`

## CI/CD Integration

```yaml
# Example GitHub Actions workflow
- name: Run Performance Tests
  run: npm run test:performance

- name: Run Regression Tests
  run: npm run test:regression

- name: Load Test
  run: npm run load-test:quick

- name: Upload Performance Reports
  uses: actions/upload-artifact@v2
  with:
    name: performance-reports
    path: reports/
```

## Troubleshooting

### Tests Failing Due to Performance
1. Check if optimizations are properly implemented
2. Review recent code changes for performance impact
3. Run with `--detectOpenHandles` to check for resource leaks
4. Use `--expose-gc` to enable manual garbage collection in tests

### Baseline Issues
1. Ensure baseline.json exists in tests/performance/
2. Run `UPDATE_BASELINE=true npm run test:regression` to create/update
3. Check baseline isn't outdated (>30 days old)

### Load Test Worker Errors
1. Ensure sufficient system resources
2. Check Node.js worker thread limits
3. Reduce concurrent users if system constrained
4. Monitor system memory during tests

## Best Practices

1. **Regular Testing**: Run performance tests before each release
2. **Baseline Management**: Update baseline after major optimizations
3. **Monitoring Integration**: Use dashboard in production
4. **Alert Response**: Set up automated responses to critical alerts
5. **Trend Analysis**: Review performance trends weekly

## Future Enhancements

- [ ] Integration with external monitoring (Datadog, New Relic)
- [ ] Automated performance regression detection in CI
- [ ] Machine learning-based anomaly detection
- [ ] Distributed load testing support
- [ ] Performance budgets per feature/component