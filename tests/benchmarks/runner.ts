import { Command } from 'commander';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { BenchmarkResult } from './base';
import { runContextManagerBenchmarks } from './contextManager.bench';
import { runMessageSplitterBenchmarks } from './messageSplitter.bench';
import { runRateLimiterBenchmarks } from './rateLimiter.bench';
import { runRoastProbabilityBenchmarks } from './roastProbability.bench';

interface BenchmarkModule {
  name: string;
  runner: () => Promise<BenchmarkResult[]>;
  description: string;
}

interface RunnerOptions {
  suites?: string[];
  output?: string;
  compare?: string;
  iterations?: number;
  warmup?: number;
  format?: 'json' | 'table' | 'summary';
  filter?: string;
}

export class BenchmarkRunner {
  private modules: BenchmarkModule[] = [
    {
      name: 'context',
      runner: runContextManagerBenchmarks,
      description: 'Context Manager performance benchmarks'
    },
    {
      name: 'splitter',
      runner: runMessageSplitterBenchmarks,
      description: 'Message Splitter performance benchmarks'
    },
    {
      name: 'ratelimiter',
      runner: runRateLimiterBenchmarks,
      description: 'Rate Limiter I/O performance benchmarks'
    },
    {
      name: 'roast',
      runner: runRoastProbabilityBenchmarks,
      description: 'Roast Probability calculation benchmarks'
    }
  ];

  async run(options: RunnerOptions = {}): Promise<void> {
    console.log('Discord LLM Bot Performance Benchmark Suite');
    console.log('===========================================\n');

    // Determine which suites to run
    const suitesToRun = options.suites?.length 
      ? this.modules.filter(m => options.suites!.includes(m.name))
      : this.modules;

    if (suitesToRun.length === 0) {
      console.error('No matching benchmark suites found');
      process.exit(1);
    }

    console.log('Running suites:', suitesToRun.map(s => s.name).join(', '));
    console.log('');

    // Ensure output directory exists
    const outputDir = options.output || './benchmark-reports';
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Run benchmarks
    const allResults: BenchmarkResult[] = [];
    const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];

    for (const suite of suitesToRun) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Running: ${suite.description}`);
      console.log(`${'='.repeat(60)}\n`);

      try {
        const results = await suite.runner();
        
        // Filter results if specified
        const filteredResults = options.filter 
          ? results.filter(r => r.name.toLowerCase().includes(options.filter!.toLowerCase()))
          : results;

        allResults.push(...filteredResults);

        // Save individual suite results
        const suiteReport = {
          suite: suite.name,
          timestamp: new Date().toISOString(),
          results: filteredResults,
          summary: this.calculateSummary(filteredResults)
        };

        const suiteReportPath = join(outputDir, `${suite.name}-${timestamp}.json`);
        require('fs').writeFileSync(suiteReportPath, JSON.stringify(suiteReport, null, 2));
        console.log(`Suite report saved: ${suiteReportPath}\n`);

      } catch (error) {
        console.error(`Error running ${suite.name} benchmarks:`, error);
      }
    }

    // Generate combined report
    const combinedReport = {
      timestamp: new Date().toISOString(),
      system: this.getSystemInfo(),
      options,
      suites: suitesToRun.map(s => s.name),
      results: allResults,
      summary: this.calculateSummary(allResults),
      performance: this.analyzePerformance(allResults)
    };

    const combinedReportPath = join(outputDir, `combined-${timestamp}.json`);
    require('fs').writeFileSync(combinedReportPath, JSON.stringify(combinedReport, null, 2));

    // Output results in requested format
    this.outputResults(allResults, options.format || 'summary');

    // Compare with previous results if requested
    if (options.compare && existsSync(options.compare)) {
      this.compareResults(allResults, options.compare);
    }

    console.log(`\nCombined report saved: ${combinedReportPath}`);
  }

  private calculateSummary(results: BenchmarkResult[]): any {
    if (results.length === 0) return {};

    const opsPerSecond = results.map(r => r.opsPerSecond);
    const latencyP95 = results.map(r => r.p95);
    const heapUsed = results.map(r => r.heapUsed);

    return {
      totalBenchmarks: results.length,
      performance: {
        avgOpsPerSecond: opsPerSecond.reduce((a, b) => a + b, 0) / opsPerSecond.length,
        maxOpsPerSecond: Math.max(...opsPerSecond),
        minOpsPerSecond: Math.min(...opsPerSecond)
      },
      latency: {
        avgP95: latencyP95.reduce((a, b) => a + b, 0) / latencyP95.length,
        maxP95: Math.max(...latencyP95),
        minP95: Math.min(...latencyP95)
      },
      memory: {
        totalHeapUsed: heapUsed.reduce((a, b) => a + b, 0),
        avgHeapUsed: heapUsed.reduce((a, b) => a + b, 0) / heapUsed.length,
        maxHeapUsed: Math.max(...heapUsed)
      }
    };
  }

  private analyzePerformance(results: BenchmarkResult[]): any {
    const analysis: any = {
      hotspots: [],
      recommendations: [],
      metrics: {}
    };

    // Identify performance hotspots (slowest operations)
    const sortedByLatency = results.slice().sort((a, b) => b.p95 - a.p95);
    analysis.hotspots = sortedByLatency.slice(0, 5).map(r => ({
      name: r.name,
      p95Latency: r.p95,
      opsPerSecond: r.opsPerSecond,
      issue: r.p95 > 10 ? 'High latency' : r.opsPerSecond < 1000 ? 'Low throughput' : 'Within normal range'
    }));

    // Generate recommendations
    const highLatencyOps = results.filter(r => r.p95 > 5);
    if (highLatencyOps.length > 0) {
      analysis.recommendations.push({
        type: 'performance',
        message: `${highLatencyOps.length} operations have P95 latency > 5ms`,
        operations: highLatencyOps.map(r => r.name)
      });
    }

    const lowThroughputOps = results.filter(r => r.opsPerSecond < 1000);
    if (lowThroughputOps.length > 0) {
      analysis.recommendations.push({
        type: 'throughput',
        message: `${lowThroughputOps.length} operations have throughput < 1000 ops/sec`,
        operations: lowThroughputOps.map(r => r.name)
      });
    }

    const highMemoryOps = results.filter(r => r.heapUsed > 10 * 1024 * 1024); // > 10MB
    if (highMemoryOps.length > 0) {
      analysis.recommendations.push({
        type: 'memory',
        message: `${highMemoryOps.length} operations use > 10MB heap`,
        operations: highMemoryOps.map(r => r.name)
      });
    }

    // Calculate key metrics
    analysis.metrics = {
      avgResponseTime: results.reduce((sum, r) => sum + r.p50, 0) / results.length,
      totalThroughput: results.reduce((sum, r) => sum + r.opsPerSecond, 0),
      memoryEfficiency: results.reduce((sum, r) => sum + (r.opsPerSecond / (r.heapUsed || 1)), 0) / results.length
    };

    return analysis;
  }

  private getSystemInfo(): any {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      memory: {
        total: require('os').totalmem(),
        free: require('os').freemem()
      },
      cpus: require('os').cpus().length,
      loadavg: require('os').loadavg()
    };
  }

  private outputResults(results: BenchmarkResult[], format: string): void {
    console.log('\n' + '='.repeat(80));
    console.log('BENCHMARK RESULTS');
    console.log('='.repeat(80));

    switch (format) {
      case 'json':
        console.log(JSON.stringify(results, null, 2));
        break;
      
      case 'table':
        this.outputTable(results);
        break;
      
      case 'summary':
      default:
        this.outputSummary(results);
        break;
    }
  }

  private outputTable(results: BenchmarkResult[]): void {
    const headers = ['Benchmark', 'Ops/Sec', 'P50 (ms)', 'P95 (ms)', 'P99 (ms)', 'Heap (MB)'];
    const columnWidths = [40, 12, 10, 10, 10, 12];

    // Header
    const headerRow = headers.map((h, i) => h.padEnd(columnWidths[i])).join(' | ');
    console.log(headerRow);
    console.log('-'.repeat(headerRow.length));

    // Data rows
    for (const result of results) {
      const row = [
        result.name.substring(0, 38).padEnd(columnWidths[0]),
        result.opsPerSecond.toFixed(2).padStart(columnWidths[1]),
        result.p50.toFixed(3).padStart(columnWidths[2]),
        result.p95.toFixed(3).padStart(columnWidths[3]),
        result.p99.toFixed(3).padStart(columnWidths[4]),
        (result.heapUsed / 1024 / 1024).toFixed(2).padStart(columnWidths[5])
      ];
      console.log(row.join(' | '));
    }
  }

  private outputSummary(results: BenchmarkResult[]): void {
    const summary = this.calculateSummary(results);
    
    console.log(`Total Benchmarks: ${summary.totalBenchmarks}`);
    console.log('\nPerformance Summary:');
    console.log(`  Average Ops/Sec: ${summary.performance.avgOpsPerSecond.toFixed(2)}`);
    console.log(`  Max Ops/Sec: ${summary.performance.maxOpsPerSecond.toFixed(2)}`);
    console.log(`  Min Ops/Sec: ${summary.performance.minOpsPerSecond.toFixed(2)}`);
    
    console.log('\nLatency Summary:');
    console.log(`  Average P95: ${summary.latency.avgP95.toFixed(3)}ms`);
    console.log(`  Max P95: ${summary.latency.maxP95.toFixed(3)}ms`);
    console.log(`  Min P95: ${summary.latency.minP95.toFixed(3)}ms`);
    
    console.log('\nMemory Summary:');
    console.log(`  Total Heap Used: ${(summary.memory.totalHeapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Average Heap Used: ${(summary.memory.avgHeapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Max Heap Used: ${(summary.memory.maxHeapUsed / 1024 / 1024).toFixed(2)}MB`);

    // Show top 5 performers and worst 5 performers
    const sortedByOps = results.slice().sort((a, b) => b.opsPerSecond - a.opsPerSecond);
    
    console.log('\nTop 5 Performers (Ops/Sec):');
    sortedByOps.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name}: ${r.opsPerSecond.toFixed(2)} ops/sec`);
    });
    
    console.log('\nSlowest 5 Operations:');
    sortedByOps.slice(-5).reverse().forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name}: ${r.opsPerSecond.toFixed(2)} ops/sec (P95: ${r.p95.toFixed(3)}ms)`);
    });
  }

  private compareResults(currentResults: BenchmarkResult[], previousFile: string): void {
    try {
      const previousData = JSON.parse(readFileSync(previousFile, 'utf8'));
      const previousResults: BenchmarkResult[] = previousData.results || previousData;

      console.log('\n' + '='.repeat(80));
      console.log('PERFORMANCE COMPARISON');
      console.log('='.repeat(80));

      for (const current of currentResults) {
        const previous = previousResults.find(p => p.name === current.name);
        if (!previous) continue;

        const opsChange = ((current.opsPerSecond - previous.opsPerSecond) / previous.opsPerSecond) * 100;
        const latencyChange = ((current.p95 - previous.p95) / previous.p95) * 100;
        const memoryChange = ((current.heapUsed - previous.heapUsed) / previous.heapUsed) * 100;

        console.log(`\n${current.name}:`);
        console.log(`  Ops/Sec: ${previous.opsPerSecond.toFixed(2)} → ${current.opsPerSecond.toFixed(2)} (${opsChange >= 0 ? '+' : ''}${opsChange.toFixed(2)}%)`);
        console.log(`  P95 Latency: ${previous.p95.toFixed(3)}ms → ${current.p95.toFixed(3)}ms (${latencyChange >= 0 ? '+' : ''}${latencyChange.toFixed(2)}%)`);
        console.log(`  Heap Used: ${(previous.heapUsed / 1024 / 1024).toFixed(2)}MB → ${(current.heapUsed / 1024 / 1024).toFixed(2)}MB (${memoryChange >= 0 ? '+' : ''}${memoryChange.toFixed(2)}%)`);
        
        // Performance indicators
        if (opsChange > 10) {
          console.log(`  🚀 Significant performance improvement!`);
        } else if (opsChange < -10) {
          console.log(`  ⚠️  Performance regression detected`);
        }
      }
    } catch (error) {
      console.error('Error comparing results:', error);
    }
  }

  listSuites(): void {
    console.log('Available benchmark suites:');
    console.log('');
    this.modules.forEach(module => {
      console.log(`  ${module.name.padEnd(12)} - ${module.description}`);
    });
  }
}

// CLI implementation
if (require.main === module) {
  const program = new Command();
  
  program
    .name('benchmark-runner')
    .description('Discord LLM Bot Performance Benchmark Runner')
    .version('1.0.0');

  program
    .command('run')
    .description('Run benchmark suites')
    .option('-s, --suites <suites>', 'Comma-separated list of suites to run (context,splitter,ratelimiter,roast)')
    .option('-o, --output <dir>', 'Output directory for reports', './benchmark-reports')
    .option('-c, --compare <file>', 'Compare with previous results file')
    .option('-f, --format <format>', 'Output format (json|table|summary)', 'summary')
    .option('--filter <pattern>', 'Filter benchmarks by name pattern')
    .action(async (options: any) => {
      const runner = new BenchmarkRunner();
      const runOptions: RunnerOptions = {
        ...options,
        suites: options.suites ? options.suites.split(',') : undefined
      };
      
      await runner.run(runOptions);
    });

  program
    .command('list')
    .description('List available benchmark suites')
    .action(() => {
      const runner = new BenchmarkRunner();
      runner.listSuites();
    });

  program.parse();
}