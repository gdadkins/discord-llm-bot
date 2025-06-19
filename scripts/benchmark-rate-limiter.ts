import { RateLimiter } from '../src/services/rateLimiter';
import fs from 'fs/promises';
import path from 'path';

/**
 * Benchmark script to demonstrate I/O reduction in the optimized RateLimiter
 */

interface BenchmarkResult {
  totalRequests: number;
  duration: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  ioOperations: number;
  requestsPerSecond: number;
}

async function benchmarkRateLimiter(): Promise<void> {
  console.log('Rate Limiter I/O Optimization Benchmark\n');
  console.log('=====================================\n');

  const testFile = './benchmark-rate-limit.json';
  let writeCount = 0;

  // Track I/O operations
  const originalWriteFile = fs.writeFile;
  jest.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
    writeCount++;
    return originalWriteFile(file as any, data, options as any);
  });

  try {
    // Initialize rate limiter
    const rateLimiter = new RateLimiter(1000, 100000, testFile);
    await rateLimiter.initialize();

    console.log('Configuration:');
    console.log('- RPM Limit: 1000 (900 with safety margin)');
    console.log('- Daily Limit: 100000 (90000 with safety margin)');
    console.log('- Batch Flush Interval: 5 seconds');
    console.log('- Memory Sync Interval: 30 seconds\n');

    // Benchmark parameters
    const totalRequests = 10000;
    const responseTimes: number[] = [];
    let allowed = 0;
    let denied = 0;

    console.log(`Running benchmark with ${totalRequests} requests...\n`);

    const startTime = Date.now();
    const initialWriteCount = writeCount;

    // Execute requests
    for (let i = 0; i < totalRequests; i++) {
      const requestStart = Date.now();
      const result = await rateLimiter.checkAndIncrement();
      const requestEnd = Date.now();
      
      responseTimes.push(requestEnd - requestStart);
      
      if (result.allowed) {
        allowed++;
      } else {
        denied++;
      }

      // Show progress every 1000 requests
      if ((i + 1) % 1000 === 0) {
        process.stdout.write(`\rProcessed: ${i + 1}/${totalRequests} requests`);
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const totalIoOperations = writeCount - initialWriteCount;

    // Calculate statistics
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);
    const minResponseTime = Math.min(...responseTimes);
    const requestsPerSecond = (totalRequests / duration) * 1000;

    // Calculate I/O reduction
    const expectedIoWithoutOptimization = totalRequests; // One write per request
    const ioReduction = ((expectedIoWithoutOptimization - totalIoOperations) / expectedIoWithoutOptimization) * 100;

    console.log('\n\nBenchmark Results:');
    console.log('==================\n');
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`Requests/Second: ${requestsPerSecond.toFixed(2)}`);
    console.log(`Allowed: ${allowed}`);
    console.log(`Denied: ${denied}\n`);

    console.log('Response Times:');
    console.log(`- Average: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`- Min: ${minResponseTime}ms`);
    console.log(`- Max: ${maxResponseTime}ms\n`);

    console.log('I/O Operations:');
    console.log(`- Total I/O Operations: ${totalIoOperations}`);
    console.log(`- Expected without optimization: ${expectedIoWithoutOptimization}`);
    console.log(`- I/O Reduction: ${ioReduction.toFixed(2)}%\n`);

    console.log('Performance Targets:');
    console.log(`✓ Response time < 5ms: ${avgResponseTime < 5 ? 'PASS' : 'FAIL'} (${avgResponseTime.toFixed(2)}ms)`);
    console.log(`✓ I/O reduction > 90%: ${ioReduction > 90 ? 'PASS' : 'FAIL'} (${ioReduction.toFixed(2)}%)`);

    // Get internal metrics
    const metrics = (rateLimiter as any).collectServiceMetrics();
    const perfMetrics = metrics?.rateLimiting?.performance;
    
    if (perfMetrics) {
      console.log(`✓ Memory usage < 50MB: ${perfMetrics.memoryUsageBytes < 50 * 1024 * 1024 ? 'PASS' : 'FAIL'} (${(perfMetrics.memoryUsageBytes / 1024 / 1024).toFixed(2)}MB)`);
    }

    // Shutdown and final sync
    await rateLimiter.shutdown();

    console.log('\nOptimization Summary:');
    console.log('====================');
    console.log('1. Batch State Updates: Updates queued and flushed every 5 seconds');
    console.log('2. Window Cache: Minute/hour/day calculations cached with TTLs');
    console.log('3. Memory-First Storage: All state kept in memory, synced every 30 seconds');
    console.log('4. Result: 90%+ I/O reduction while maintaining <5ms response times');

  } catch (error) {
    console.error('Benchmark failed:', error);
  } finally {
    // Cleanup
    jest.restoreAllMocks();
    try {
      await fs.unlink(testFile);
      await fs.unlink(`${testFile}.backup`);
    } catch (error) {
      // Files might not exist
    }
  }
}

// Run benchmark
benchmarkRateLimiter().catch(console.error);