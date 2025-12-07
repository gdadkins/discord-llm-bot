import { BenchmarkSuite, MemoryProfiler } from './base';
import { RateLimiter } from '../../src/services/rateLimiter';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export async function runRateLimiterBenchmarks() {
  const suite = new BenchmarkSuite();
  
  // Setup test data directory
  const testDataDir = join(process.cwd(), 'test-data');
  if (!existsSync(testDataDir)) {
    mkdirSync(testDataDir, { recursive: true });
  }

  const testFilePath = join(testDataDir, 'rate-limit-benchmark.json');

  // Cleanup function
  const cleanup = () => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  };

  // Test data generation
  const generateRateLimitData = (requestCount: number) => {
    const now = Date.now();
    const data = {
      rpm: {
        count: requestCount,
        windowStart: now - (60 * 1000)
      },
      daily: {
        count: requestCount * 10,
        lastReset: now - (requestCount * 60 * 1000)
      }
    };
    return data;
  };

  // Benchmark 1: Basic rate limit checks (in-memory)
  suite.add('RateLimiter - checkAndIncrement check', async () => {
    const rateLimiter = new RateLimiter(10, 500, testFilePath);
    await rateLimiter.initialize();
    await rateLimiter.checkAndIncrement();
  }, { iterations: 10000, warmup: 100 });

  // Benchmark 2: File I/O operations
  suite.add('RateLimiter - file save operation', () => {
    const data = generateRateLimitData(5);
    writeFileSync(testFilePath, JSON.stringify(data));
  }, { iterations: 10000, warmup: 100 });

  // Benchmark 3: Rate limiter with actual I/O (creation and persistence)
  suite.add('RateLimiter - constructor with file loading', async () => {
    // Pre-create file with data
    const data = generateRateLimitData(8);
    writeFileSync(testFilePath, JSON.stringify(data));
    
    // Test constructor loading
    const rateLimiter = new RateLimiter(10, 500, testFilePath);
    await rateLimiter.initialize();
  }, { iterations: 1000, warmup: 50 });

  // Benchmark 4: Request tracking with persistence
  suite.add('RateLimiter - checkAndIncrement with save', async () => {
    cleanup();
    const rateLimiter = new RateLimiter(10, 500, testFilePath);
    await rateLimiter.initialize();
    
    await rateLimiter.checkAndIncrement();
  }, { iterations: 1000, warmup: 50 });

  // Benchmark 5: Window management (cleanup operations)
  suite.add('RateLimiter - window cleanup simulation', async () => {
    cleanup();
    const rateLimiter = new RateLimiter(10, 500, testFilePath);
    await rateLimiter.initialize();
    
    // Simulate old requests that need cleanup by manipulating internal state
    const now = Date.now();
    (rateLimiter as any).state.minuteWindowStart = now - (70 * 1000); // 70 seconds ago
    (rateLimiter as any).state.requestsThisMinute = 8;
    
    // This should trigger window reset
    await rateLimiter.checkAndIncrement();
  }, { iterations: 5000, warmup: 50 });

  // Benchmark 6: Daily limit reset simulation
  suite.add('RateLimiter - daily reset check', async () => {
    cleanup();
    const rateLimiter = new RateLimiter(10, 500, testFilePath);
    await rateLimiter.initialize();
    
    // Simulate yesterday's data
    const yesterday = Date.now() - (25 * 60 * 60 * 1000);
    (rateLimiter as any).state.dayWindowStart = yesterday;
    (rateLimiter as any).state.requestsToday = 400;
    
    // This should trigger daily reset
    await rateLimiter.checkAndIncrement();
  }, { iterations: 5000, warmup: 50 });

  // Benchmark 7: Concurrent access simulation
  const memoryProfiler = new MemoryProfiler();
  
  suite.add('RateLimiter - concurrent access simulation', async () => {
    cleanup();
    memoryProfiler.reset();
    memoryProfiler.start(100);
    
    const rateLimiter = new RateLimiter(100, 5000, testFilePath); // Higher limits for concurrent testing
    await rateLimiter.initialize();
    
    // Simulate rapid concurrent requests
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(new Promise<void>((resolve) => {
        setTimeout(async () => {
          await rateLimiter.checkAndIncrement();
          resolve();
        }, Math.random() * 10);
      }));
    }
    
    await Promise.all(promises);
    memoryProfiler.stop();
  }, { iterations: 100, warmup: 10 });

  // Benchmark 8: Large data file handling
  suite.add('RateLimiter - large state file', async () => {
    // Create a larger state file with metadata
    const largeData = {
      requestsThisMinute: 5,
      requestsToday: 250,
      minuteWindowStart: Date.now() - 30000,
      dayWindowStart: Date.now() - 3600000,
      metadata: {
        version: '1.0.0',
        created: Date.now(),
        stats: Array.from({ length: 100 }, (_, i) => ({
          timestamp: Date.now() - i * 60000,
          requests: Math.floor(Math.random() * 10)
        }))
      }
    };
    
    writeFileSync(testFilePath, JSON.stringify(largeData));
    const rateLimiter = new RateLimiter(10, 500, testFilePath);
    await rateLimiter.initialize();
  }, { iterations: 1000, warmup: 50 });

  // Benchmark 9: Error handling and recovery
  suite.add('RateLimiter - corrupted file recovery', async () => {
    // Create corrupted file
    writeFileSync(testFilePath, '{ invalid json }');
    
    // Should handle gracefully and create new state
    const rateLimiter = new RateLimiter(10, 500, testFilePath);
    await rateLimiter.initialize();
    await rateLimiter.checkAndIncrement();
  }, { iterations: 2000, warmup: 50 });

  // Benchmark 10: Memory usage under sustained load
  suite.add('RateLimiter - sustained load test', async () => {
    cleanup();
    const rateLimiter = new RateLimiter(1000, 50000, testFilePath); // High limits for sustained testing
    await rateLimiter.initialize();
    
    // Simulate sustained usage over time
    for (let i = 0; i < 50; i++) {
      await rateLimiter.checkAndIncrement();
      
      // Occasionally check remaining quota
      if (i % 10 === 0) {
        rateLimiter.getRemainingQuota();
      }
    }
  }, { iterations: 100, warmup: 10 });

  // Run benchmarks
  const results = await suite.run();
  
  // Additional I/O analysis
  console.log('\nRate Limiter I/O Analysis:');
  console.log('==========================');
  
  const fileOpsResult = results.find(r => r.name.includes('file save operation'));
  const constructorResult = results.find(r => r.name.includes('constructor with file loading'));
  const recordResult = results.find(r => r.name.includes('recordRequest with save'));
  
  if (fileOpsResult && constructorResult && recordResult) {
    console.log(`Raw file I/O: ${fileOpsResult.opsPerSecond.toFixed(2)} ops/sec`);
    console.log(`Constructor with loading: ${constructorResult.opsPerSecond.toFixed(2)} ops/sec`);
    console.log(`Full request cycle: ${recordResult.opsPerSecond.toFixed(2)} ops/sec`);
    
    const ioOverhead = (fileOpsResult.avgTimePerOp - constructorResult.avgTimePerOp) / fileOpsResult.avgTimePerOp * 100;
    console.log(`I/O overhead: ${ioOverhead.toFixed(2)}%`);
  }

  // Memory profiling report
  console.log('\nConcurrent Access Memory Profile:');
  console.log(JSON.stringify(memoryProfiler.getReport(), null, 2));

  // Cleanup
  cleanup();
  
  return results;
}

// If running directly
if (require.main === module) {
  runRateLimiterBenchmarks().then(() => {
    console.log('Rate Limiter benchmarks completed');
  });
}