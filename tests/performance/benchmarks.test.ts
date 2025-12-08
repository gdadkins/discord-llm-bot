/**
 * Performance Benchmarks Test Suite
 * Tests cache O(1) operations, compression ratios, async parallelization
 * Generates comprehensive benchmark reports
 */

import { CacheManager } from '../../src/services/cacheManager';
import { ContextManager } from '../../src/services/contextManager';
import { ConversationManager } from '../../src/services/conversationManager';
import { SystemContextBuilder } from '../../src/services/systemContextBuilder';
import { performance } from 'perf_hooks';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

interface BenchmarkResult {
  name: string;
  iterations: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
  p99Time: number;
  passed: boolean;
  details?: any;
}

interface BenchmarkReport {
  timestamp: string;
  platform: string;
  nodeVersion: string;
  totalDuration: number;
  results: BenchmarkResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    overallScore: number;
  };
}

describe('Performance Benchmarks', () => {
  let cacheManager: CacheManager;
  let contextManager: ContextManager;
  let conversationManager: ConversationManager;
  let systemContextBuilder: SystemContextBuilder;
  let benchmarkResults: BenchmarkResult[] = [];
  const suiteStartTime = Date.now();

  beforeAll(() => {
    // Initialize services
    cacheManager = new CacheManager({ maxSize: 1000, ttl: 60000 });
    contextManager = new ContextManager(cacheManager);
    conversationManager = new ConversationManager(cacheManager);
    systemContextBuilder = new SystemContextBuilder();
  });

  afterAll(async () => {
    // Generate benchmark report
    await generateBenchmarkReport();
  });

  describe('Cache O(1) Operations', () => {
    it('should maintain O(1) time complexity for cache operations', async () => {
      const testSizes = [100, 1000, 10000];
      const results: number[] = [];
      
      for (const size of testSizes) {
        // Populate cache
        for (let i = 0; i < size; i++) {
          await cacheManager.set(`key-${i}`, { data: `value-${i}` });
        }

        // Measure access time
        const times: number[] = [];
        const iterations = 1000;
        
        for (let i = 0; i < iterations; i++) {
          const key = `key-${Math.floor(Math.random() * size)}`;
          const start = performance.now();
          await cacheManager.get(key);
          const end = performance.now();
          times.push(end - start);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        results.push(avgTime);
        
        // Clear cache for next test
        cacheManager.clear();
      }

      // Verify O(1) - time should not increase significantly with size
      const timeIncrease = results[2] / results[0];
      const passed = timeIncrease < 1.5; // Allow max 50% increase

      benchmarkResults.push({
        name: 'Cache O(1) Operations',
        iterations: testSizes.reduce((a, b) => a + b, 0),
        averageTime: results.reduce((a, b) => a + b, 0) / results.length,
        minTime: Math.min(...results),
        maxTime: Math.max(...results),
        p95Time: calculatePercentile(results, 95),
        p99Time: calculatePercentile(results, 99),
        passed,
        details: {
          testSizes,
          avgTimes: results,
          timeIncrease: `${((timeIncrease - 1) * 100).toFixed(2)}%`
        }
      });

      expect(passed).toBe(true);
    });
  });

  describe('Compression Ratios', () => {
    it('should achieve >70% compression ratio for typical data', async () => {
      const testData = [
        {
          name: 'Large Context',
          data: JSON.stringify({
            messages: Array(100).fill(null).map((_, i) => ({
              id: `msg-${i}`,
              content: `This is a sample message with some repeated content. User ${i} says hello!`,
              timestamp: Date.now() - i * 1000,
              metadata: { user: `user-${i % 10}`, channel: `channel-${i % 5}` }
            })),
            context: {
              server: 'Test Server',
              channel: 'general',
              users: Array(50).fill(null).map((_, i) => ({ id: `user-${i}`, name: `User ${i}` }))
            }
          })
        },
        {
          name: 'User Preferences',
          data: JSON.stringify({
            preferences: Array(100).fill(null).map((_, i) => ({
              userId: `user-${i}`,
              settings: {
                roastingLevel: i % 5,
                responseLength: ['brief', 'normal', 'detailed'][i % 3],
                personality: 'friendly',
                features: ['roasting', 'help', 'memory', 'search']
              }
            }))
          })
        },
        {
          name: 'Conversation History',
          data: JSON.stringify({
            conversations: Array(50).fill(null).map((_, i) => ({
              id: `conv-${i}`,
              messages: Array(20).fill(null).map((_, j) => ({
                role: j % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${j} in conversation ${i}. This contains typical chat content.`
              }))
            }))
          })
        }
      ];

      const results: any[] = [];
      
      for (const test of testData) {
        const originalSize = Buffer.byteLength(test.data, 'utf8');
        const compressed = await gzip(test.data);
        const compressedSize = compressed.length;
        const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;
        
        // Verify decompression works
        const decompressed = await gunzip(compressed);
        const isValid = decompressed.toString() === test.data;
        
        results.push({
          name: test.name,
          originalSize,
          compressedSize,
          compressionRatio: compressionRatio.toFixed(2) + '%',
          isValid
        });
      }

      const avgCompressionRatio = results.reduce((sum, r) => 
        sum + parseFloat(r.compressionRatio), 0) / results.length;
      const passed = avgCompressionRatio > 70;

      benchmarkResults.push({
        name: 'Compression Ratios',
        iterations: testData.length,
        averageTime: 0, // Not time-based
        minTime: 0,
        maxTime: 0,
        p95Time: 0,
        p99Time: 0,
        passed,
        details: {
          results,
          avgCompressionRatio: avgCompressionRatio.toFixed(2) + '%'
        }
      });

      expect(passed).toBe(true);
    });
  });

  describe('Async Parallelization', () => {
    it('should achieve >2x speedup with parallel processing', async () => {
      const tasks = Array(10).fill(null).map((_, i) => async () => {
        // Simulate CPU-intensive task
        let result = 0;
        for (let j = 0; j < 1000000; j++) {
          result += Math.sqrt(j * i);
        }
        // Simulate async I/O
        await new Promise(resolve => setTimeout(resolve, 10));
        return result;
      });

      // Sequential execution
      const sequentialStart = performance.now();
      const sequentialResults: number[] = [];
      for (const task of tasks) {
        sequentialResults.push(await task());
      }
      const sequentialTime = performance.now() - sequentialStart;

      // Parallel execution
      const parallelStart = performance.now();
      const parallelResults = await Promise.all(tasks.map(task => task()));
      const parallelTime = performance.now() - parallelStart;

      const speedup = sequentialTime / parallelTime;
      const passed = speedup > 2;

      benchmarkResults.push({
        name: 'Async Parallelization',
        iterations: tasks.length,
        averageTime: parallelTime,
        minTime: parallelTime,
        maxTime: sequentialTime,
        p95Time: 0,
        p99Time: 0,
        passed,
        details: {
          sequentialTime: sequentialTime.toFixed(2) + 'ms',
          parallelTime: parallelTime.toFixed(2) + 'ms',
          speedup: speedup.toFixed(2) + 'x',
          tasksCount: tasks.length
        }
      });

      expect(passed).toBe(true);
      expect(sequentialResults).toEqual(parallelResults); // Verify correctness
    });
  });

  describe('Memory Usage', () => {
    it('should efficiently manage memory with large datasets', async () => {
      const initialMemory = process.memoryUsage();
      const memorySnapshots: NodeJS.MemoryUsage[] = [];
      
      // Create large dataset
      const largeDataset = Array(1000).fill(null).map((_, i) => ({
        id: `item-${i}`,
        data: Buffer.alloc(10 * 1024).fill(i % 256), // 10KB per item
        metadata: {
          created: Date.now(),
          tags: Array(10).fill(null).map((_, j) => `tag-${j}`),
          nested: {
            level1: { level2: { level3: { value: i } } }
          }
        }
      }));

      // Process data in batches
      const batchSize = 100;
      for (let i = 0; i < largeDataset.length; i += batchSize) {
        const batch = largeDataset.slice(i, i + batchSize);
        
        // Simulate processing
        await Promise.all(batch.map(async item => {
          const compressed = await gzip(JSON.stringify(item));
          await cacheManager.set(item.id, compressed);
        }));
        
        memorySnapshots.push(process.memoryUsage());
        
        // Allow GC to run
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024; // MB
      const avgMemoryUsage = memorySnapshots.reduce((sum, snapshot) => 
        sum + snapshot.heapUsed, 0) / memorySnapshots.length / 1024 / 1024; // MB
      
      // Clean up
      cacheManager.clear();
      
      const passed = memoryIncrease < 100; // Less than 100MB increase

      benchmarkResults.push({
        name: 'Memory Management',
        iterations: largeDataset.length,
        averageTime: 0,
        minTime: 0,
        maxTime: 0,
        p95Time: 0,
        p99Time: 0,
        passed,
        details: {
          initialMemory: (initialMemory.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
          finalMemory: (finalMemory.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
          memoryIncrease: memoryIncrease.toFixed(2) + 'MB',
          avgMemoryUsage: avgMemoryUsage.toFixed(2) + 'MB',
          datasetSize: largeDataset.length
        }
      });

      expect(passed).toBe(true);
    });
  });

  describe('End-to-End Performance', () => {
    it('should process requests within acceptable time limits', async () => {
      const scenarios = [
        {
          name: 'Simple Message',
          execute: async () => {
            const start = performance.now();
            const context = await contextManager.buildContext({
              userId: 'user-123',
              channelId: 'channel-456',
              serverId: 'server-789',
              messageContent: 'Hello bot!',
              messageHistory: []
            });
            const systemPrompt = await systemContextBuilder.buildSystemContext(context);
            const end = performance.now();
            return end - start;
          }
        },
        {
          name: 'Complex Context',
          execute: async () => {
            const start = performance.now();
            const context = await contextManager.buildContext({
              userId: 'user-123',
              channelId: 'channel-456',
              serverId: 'server-789',
              messageContent: 'Analyze the last 50 messages and give me a summary',
              messageHistory: Array(50).fill(null).map((_, i) => ({
                id: `msg-${i}`,
                content: `Message ${i} with various content`,
                author: { id: `user-${i % 10}`, username: `User${i % 10}` },
                timestamp: Date.now() - i * 60000
              }))
            });
            const systemPrompt = await systemContextBuilder.buildSystemContext(context);
            const end = performance.now();
            return end - start;
          }
        },
        {
          name: 'Cached Request',
          execute: async () => {
            // First request to populate cache
            const context1 = await contextManager.buildContext({
              userId: 'cached-user',
              channelId: 'cached-channel',
              serverId: 'cached-server',
              messageContent: 'Cached request',
              messageHistory: []
            });
            
            // Second request should hit cache
            const start = performance.now();
            const context2 = await contextManager.buildContext({
              userId: 'cached-user',
              channelId: 'cached-channel',
              serverId: 'cached-server',
              messageContent: 'Cached request',
              messageHistory: []
            });
            const end = performance.now();
            return end - start;
          }
        }
      ];

      const results: any[] = [];
      
      for (const scenario of scenarios) {
        const times: number[] = [];
        const iterations = 100;
        
        for (let i = 0; i < iterations; i++) {
          const time = await scenario.execute();
          times.push(time);
        }
        
        times.sort((a, b) => a - b);
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const p95 = calculatePercentile(times, 95);
        const p99 = calculatePercentile(times, 99);
        
        results.push({
          name: scenario.name,
          avgTime: avgTime.toFixed(2) + 'ms',
          p95: p95.toFixed(2) + 'ms',
          p99: p99.toFixed(2) + 'ms',
          passed: p99 < 100 // Under 100ms at p99
        });
      }

      const allPassed = results.every(r => r.passed);

      benchmarkResults.push({
        name: 'End-to-End Performance',
        iterations: scenarios.length * 100,
        averageTime: results.reduce((sum, r) => sum + parseFloat(r.avgTime), 0) / results.length,
        minTime: Math.min(...results.map(r => parseFloat(r.avgTime))),
        maxTime: Math.max(...results.map(r => parseFloat(r.avgTime))),
        p95Time: Math.max(...results.map(r => parseFloat(r.p95))),
        p99Time: Math.max(...results.map(r => parseFloat(r.p99))),
        passed: allPassed,
        details: { scenarios: results }
      });

      expect(allPassed).toBe(true);
    });
  });

  // Helper functions
  function calculatePercentile(times: number[], percentile: number): number {
    const sorted = [...times].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  async function generateBenchmarkReport(): Promise<void> {
    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      totalDuration: Date.now() - suiteStartTime,
      results: benchmarkResults,
      summary: {
        totalTests: benchmarkResults.length,
        passed: benchmarkResults.filter(r => r.passed).length,
        failed: benchmarkResults.filter(r => !r.passed).length,
        overallScore: (benchmarkResults.filter(r => r.passed).length / benchmarkResults.length) * 100
      }
    };

    // Create reports directory if it doesn't exist
    const reportsDir = path.join(__dirname, '../../reports/performance');
    await fs.ensureDir(reportsDir);

    // Save JSON report
    const jsonPath = path.join(reportsDir, `benchmark-${Date.now()}.json`);
    await fs.writeJson(jsonPath, report, { spaces: 2 });

    // Generate markdown report
    const markdownReport = generateMarkdownReport(report);
    const mdPath = path.join(reportsDir, `benchmark-${Date.now()}.md`);
    await fs.writeFile(mdPath, markdownReport);

    // Save latest report for easy access
    await fs.writeJson(path.join(reportsDir, 'latest.json'), report, { spaces: 2 });
    await fs.writeFile(path.join(reportsDir, 'latest.md'), markdownReport);

    console.log('\n📊 Benchmark Report Generated:');
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   Markdown: ${mdPath}`);
    console.log(`   Overall Score: ${report.summary.overallScore.toFixed(2)}%`);
  }

  function generateMarkdownReport(report: BenchmarkReport): string {
    let md = '# Performance Benchmark Report\n\n';
    md += `**Date:** ${new Date(report.timestamp).toLocaleString()}\n`;
    md += `**Platform:** ${report.platform}\n`;
    md += `**Node Version:** ${report.nodeVersion}\n`;
    md += `**Total Duration:** ${(report.totalDuration / 1000).toFixed(2)}s\n\n`;
    
    md += '## Summary\n';
    md += `- **Total Tests:** ${report.summary.totalTests}\n`;
    md += `- **Passed:** ${report.summary.passed} ✅\n`;
    md += `- **Failed:** ${report.summary.failed} ❌\n`;
    md += `- **Overall Score:** ${report.summary.overallScore.toFixed(2)}%\n\n`;
    
    md += '## Detailed Results\n\n';
    
    for (const result of report.results) {
      md += `### ${result.name} ${result.passed ? '✅' : '❌'}\n`;
      if (result.averageTime > 0) {
        md += `- **Average Time:** ${result.averageTime.toFixed(2)}ms\n`;
        md += `- **Min Time:** ${result.minTime.toFixed(2)}ms\n`;
        md += `- **Max Time:** ${result.maxTime.toFixed(2)}ms\n`;
        md += `- **P95 Time:** ${result.p95Time.toFixed(2)}ms\n`;
        md += `- **P99 Time:** ${result.p99Time.toFixed(2)}ms\n`;
      }
      md += `- **Iterations:** ${result.iterations}\n`;
      
      if (result.details) {
        md += '\n**Details:**\n```json\n';
        md += JSON.stringify(result.details, null, 2);
        md += '\n```\n';
      }
      md += '\n';
    }
    
    return md;
  }
});