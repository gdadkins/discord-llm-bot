# Discord LLM Bot Performance Benchmarks

This directory contains a comprehensive performance benchmarking framework for the Discord LLM Bot. The framework provides detailed performance metrics, memory profiling, and automated reporting.

## Quick Start

```bash
# Run all benchmarks
npm run benchmark

# Run specific benchmark suites
npm run benchmark:context      # Context Manager benchmarks
npm run benchmark:splitter     # Message Splitter benchmarks
npm run benchmark:ratelimiter  # Rate Limiter I/O benchmarks
npm run benchmark:roast        # Roast Probability benchmarks

# List available suites
npm run benchmark:list
```

## Framework Architecture

### Core Components

- **Base Framework** (`base.ts`): Core benchmarking utilities and result types
- **Memory Profiler** (`memoryProfiler.ts`): Advanced memory usage analysis
- **Report Generator** (`reportGenerator.ts`): Multi-format report generation
- **CLI Runner** (`runner.ts`): Command-line interface for running benchmarks

### Benchmark Suites

1. **Context Manager** (`contextManager.bench.ts`)
   - JSON.stringify performance with various context sizes
   - Context trimming operations
   - Server context aggregation
   - Memory usage patterns under sustained load

2. **Message Splitter** (`messageSplitter.bench.ts`)
   - Short, medium, and long message handling
   - Code block splitting performance
   - Unicode content handling
   - Edge case performance (no natural breaks, exact boundaries)

3. **Rate Limiter** (`rateLimiter.bench.ts`)
   - File I/O operations performance
   - In-memory rate limit checks
   - Concurrent access simulation
   - Window management and cleanup operations

4. **Roast Probability** (`roastProbability.bench.ts`)
   - Basic probability calculations
   - Complexity modifier calculations
   - Time-based and mood modifiers
   - Chaos mode performance
   - Cache efficiency under load

## Key Metrics Tracked

### Performance Metrics
- **response_time_p50**: 50th percentile response time
- **response_time_p95**: 95th percentile response time  
- **response_time_p99**: 99th percentile response time
- **ops_per_second**: Operations per second (throughput)
- **avg_time_per_op**: Average time per operation

### Memory Metrics
- **memory_usage_mb**: Memory usage in megabytes
- **heap_used**: Heap memory used
- **external**: External memory used
- **gc_runs**: Number of garbage collection runs

### System Metrics
- **cpu_usage_percent**: CPU usage percentage
- **gc_pause_time_ms**: Garbage collection pause time

## Usage Examples

### Running Individual Benchmarks

```bash
# Context Manager benchmarks only
npm run benchmark:context

# Rate Limiter with custom output directory
npx ts-node tests/benchmarks/runner.ts run --suites ratelimiter --output ./custom-reports

# Filter specific benchmarks
npx ts-node tests/benchmarks/runner.ts run --filter "JSON.stringify"

# Compare with previous results
npx ts-node tests/benchmarks/runner.ts run --compare ./benchmark-reports/previous-report.json
```

### Advanced CLI Options

```bash
npx ts-node tests/benchmarks/runner.ts run [options]

Options:
  -s, --suites <suites>     Comma-separated list of suites (context,splitter,ratelimiter,roast)
  -o, --output <dir>        Output directory for reports (default: ./benchmark-reports)
  -c, --compare <file>      Compare with previous results file
  -f, --format <format>     Output format: json|table|summary (default: summary)
  --filter <pattern>        Filter benchmarks by name pattern
```

### Programmatic Usage

```typescript
import { BenchmarkSuite } from './base';
import { runContextManagerBenchmarks } from './contextManager.bench';

// Run specific benchmark suite
const results = await runContextManagerBenchmarks();

// Use individual benchmark components
const suite = new BenchmarkSuite();
suite.add('Custom Benchmark', () => {
  // Your benchmark code here
}, { iterations: 10000 });

const results = await suite.run();
```

### Memory Profiling

```typescript
import { AdvancedMemoryProfiler } from './memoryProfiler';

const profiler = new AdvancedMemoryProfiler({ autoSample: true });
const sessionId = profiler.startSession('my-operation');

// Your code to profile
await heavyOperation();

const session = profiler.endSession(sessionId);
console.log(session.analysis);
```

## Report Formats

The benchmark runner generates reports in multiple formats:

### HTML Report
- Interactive dashboard with charts and graphs
- Performance grade (A-F) based on metrics
- Bottleneck identification and recommendations
- System information and environment details

### JSON Report
- Machine-readable format for automation
- Complete raw data and analysis results
- Integration with CI/CD pipelines
- Historical data storage

### Markdown Report
- Human-readable documentation format
- Summary tables and key findings
- Suitable for documentation and sharing

### CSV Report
- Spreadsheet-compatible format
- Raw benchmark data for further analysis
- Easy import into analytics tools

## Performance Thresholds

The framework uses these thresholds for analysis:

### Throughput (Operations/Second)
- **Excellent**: > 10,000 ops/sec
- **Good**: > 5,000 ops/sec
- **Acceptable**: > 1,000 ops/sec
- **Poor**: > 500 ops/sec
- **Critical**: < 500 ops/sec

### Latency (P95)
- **Excellent**: < 1ms
- **Good**: < 5ms
- **Acceptable**: < 10ms
- **Poor**: < 50ms
- **Critical**: > 50ms

### Memory Usage
- **Low**: < 10MB
- **Medium**: 10-50MB
- **High**: 50-100MB
- **Critical**: > 100MB

## Sample Output

```
Running benchmark suite with 4 benchmarks

Benchmark: ContextManager - JSON.stringify small (10 items)
===========================================
Operations:     10,000
Total Duration: 125.34ms
Ops/Second:     79,783.21
Avg Time/Op:    0.0125ms

Latency Percentiles:
  Min:          0.0080ms
  P50:          0.0120ms
  P95:          0.0180ms
  P99:          0.0250ms
  Max:          0.0450ms

Memory Usage:
  Heap Used:    2.34MB
  External:     0.12MB
  GC Runs:      0

Performance Summary:
  Total Benchmarks: 25
  Average Ops/Sec: 45,234.56
  Average P95 Latency: 3.45ms
  Average Memory Usage: 12.3MB
  Performance Grade: A

Top 5 Performers (Ops/Sec):
  1. Basic rate limit check: 125,450.23 ops/sec
  2. Time-based modifier: 98,765.43 ops/sec
  3. Short message splitting: 87,654.32 ops/sec
  4. Consecutive bonus calculation: 76,543.21 ops/sec
  5. JSON stringify small: 65,432.10 ops/sec
```

## Integration with CI/CD

Add to your CI/CD pipeline:

```yaml
# .github/workflows/performance.yml
name: Performance Benchmarks

on:
  pull_request:
  push:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run benchmark -- --format json --output ./benchmark-results
      - uses: actions/upload-artifact@v3
        with:
          name: benchmark-reports
          path: ./benchmark-results/
```

## Troubleshooting

### Common Issues

1. **Out of Memory Errors**
   ```
   Solution: Reduce iteration count or run individual suites
   npm run benchmark:context -- --iterations 1000
   ```

2. **Permission Errors (File I/O benchmarks)**
   ```
   Solution: Ensure write permissions to test directories
   mkdir -p test-data && chmod 755 test-data
   ```

3. **Long Running Times**
   ```
   Solution: Use filters to run specific benchmarks
   npm run benchmark -- --filter "JSON.stringify small"
   ```

### Performance Tips

- Run benchmarks on a dedicated machine for consistent results
- Close other applications to reduce system noise
- Use `--gc-global` flag for Node.js to enable manual garbage collection
- Run multiple iterations and compare results

### Environment Considerations

- **Node.js Version**: >= 18.0.0 recommended
- **Memory**: At least 4GB RAM available
- **CPU**: Consistent clock speeds (disable CPU scaling if possible)
- **Network**: Stable connection for any external dependencies

## Contributing

When adding new benchmarks:

1. Follow the existing patterns in benchmark files
2. Include proper warmup iterations
3. Add meaningful labels and descriptions
4. Test with various input sizes
5. Document expected performance characteristics

## License

This benchmarking framework is part of the Discord LLM Bot project and follows the same license terms.