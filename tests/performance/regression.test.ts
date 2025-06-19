/**
 * Performance Regression Tests
 * Compares current performance against baseline metrics
 * Prevents performance degradation between releases
 */

import { CacheManager } from '../../src/services/cacheManager';
import { ContextManager } from '../../src/services/contextManager';
import { ConversationManager } from '../../src/services/conversationManager';
import { SystemContextBuilder } from '../../src/services/systemContextBuilder';
import { performance } from 'perf_hooks';
import * as fs from 'fs-extra';
import * as path from 'path';

interface BaselineMetric {
  name: string;
  averageTime: number;
  p95Time: number;
  p99Time: number;
  memoryUsage: number;
  timestamp: string;
  gitCommit?: string;
}

interface RegressionTestResult {
  name: string;
  passed: boolean;
  baseline: BaselineMetric;
  current: {
    averageTime: number;
    p95Time: number;
    p99Time: number;
    memoryUsage: number;
  };
  regression: {
    averageTime: number; // percentage
    p95Time: number;
    p99Time: number;
    memoryUsage: number;
  };
  details?: any;
}

interface RegressionReport {
  timestamp: string;
  baselineDate: string;
  results: RegressionTestResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    overallStatus: 'pass' | 'fail';
  };
  configuration: {
    responseTimeRegressionThreshold: number;
    memoryRegressionThreshold: number;
  };
}

// Configuration
const CONFIG = {
  baselinePath: path.join(__dirname, 'baseline.json'),
  reportPath: path.join(__dirname, '../../reports/performance'),
  maxResponseTimeRegression: 0.10, // 10% max regression
  maxMemoryRegression: 0.05, // 5% max regression
  iterations: 100,
  warmupIterations: 10
};

describe('Performance Regression Tests', () => {
  let baseline: BaselineMetric[] = [];
  let cacheManager: CacheManager;
  let contextManager: ContextManager;
  let conversationManager: ConversationManager;
  let systemContextBuilder: SystemContextBuilder;
  let testResults: RegressionTestResult[] = [];

  beforeAll(async () => {
    // Load baseline metrics
    if (await fs.pathExists(CONFIG.baselinePath)) {
      baseline = await fs.readJson(CONFIG.baselinePath);
      console.log(`📊 Loaded baseline from ${new Date(baseline[0]?.timestamp || Date.now()).toLocaleDateString()}`);
    } else {
      console.warn('⚠️  No baseline found. Run with UPDATE_BASELINE=true to create one.');
    }

    // Initialize services
    cacheManager = new CacheManager({ maxSize: 1000, ttl: 60000 });
    contextManager = new ContextManager(cacheManager);
    conversationManager = new ConversationManager(cacheManager);
    systemContextBuilder = new SystemContextBuilder();
  });

  afterAll(async () => {
    // Generate regression report
    await generateRegressionReport();

    // Update baseline if requested
    if (process.env.UPDATE_BASELINE === 'true') {
      await updateBaseline();
    }
  });

  describe('Response Time Regression', () => {
    it('should not regress on simple message processing', async () => {
      const testName = 'Simple Message Processing';
      const baselineMetric = baseline.find(m => m.name === testName);
      
      // Warmup
      for (let i = 0; i < CONFIG.warmupIterations; i++) {
        await processSimpleMessage();
      }

      // Measure current performance
      const times: number[] = [];
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < CONFIG.iterations; i++) {
        const start = performance.now();
        await processSimpleMessage();
        const end = performance.now();
        times.push(end - start);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      const current = {
        averageTime: calculateAverage(times),
        p95Time: calculatePercentile(times, 95),
        p99Time: calculatePercentile(times, 99),
        memoryUsage: memoryIncrease / CONFIG.iterations
      };

      const result = evaluateRegression(testName, baselineMetric, current);
      testResults.push(result);

      expect(result.passed).toBe(true);
    });

    it('should not regress on complex context building', async () => {
      const testName = 'Complex Context Building';
      const baselineMetric = baseline.find(m => m.name === testName);
      
      // Warmup
      for (let i = 0; i < CONFIG.warmupIterations; i++) {
        await buildComplexContext();
      }

      // Measure current performance
      const times: number[] = [];
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < CONFIG.iterations; i++) {
        const start = performance.now();
        await buildComplexContext();
        const end = performance.now();
        times.push(end - start);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      const current = {
        averageTime: calculateAverage(times),
        p95Time: calculatePercentile(times, 95),
        p99Time: calculatePercentile(times, 99),
        memoryUsage: memoryIncrease / CONFIG.iterations
      };

      const result = evaluateRegression(testName, baselineMetric, current);
      testResults.push(result);

      expect(result.passed).toBe(true);
    });

    it('should not regress on cache operations', async () => {
      const testName = 'Cache Operations';
      const baselineMetric = baseline.find(m => m.name === testName);
      
      // Warmup
      for (let i = 0; i < CONFIG.warmupIterations; i++) {
        await performCacheOperations();
      }

      // Measure current performance
      const times: number[] = [];
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < CONFIG.iterations; i++) {
        const start = performance.now();
        await performCacheOperations();
        const end = performance.now();
        times.push(end - start);
        cacheManager.clear(); // Clean between iterations
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      const current = {
        averageTime: calculateAverage(times),
        p95Time: calculatePercentile(times, 95),
        p99Time: calculatePercentile(times, 99),
        memoryUsage: memoryIncrease / CONFIG.iterations
      };

      const result = evaluateRegression(testName, baselineMetric, current);
      testResults.push(result);

      expect(result.passed).toBe(true);
    });

    it('should not regress on conversation history retrieval', async () => {
      const testName = 'Conversation History Retrieval';
      const baselineMetric = baseline.find(m => m.name === testName);
      
      // Setup test data
      await setupConversationHistory();

      // Warmup
      for (let i = 0; i < CONFIG.warmupIterations; i++) {
        await retrieveConversationHistory();
      }

      // Measure current performance
      const times: number[] = [];
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < CONFIG.iterations; i++) {
        const start = performance.now();
        await retrieveConversationHistory();
        const end = performance.now();
        times.push(end - start);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      const current = {
        averageTime: calculateAverage(times),
        p95Time: calculatePercentile(times, 95),
        p99Time: calculatePercentile(times, 99),
        memoryUsage: memoryIncrease / CONFIG.iterations
      };

      const result = evaluateRegression(testName, baselineMetric, current);
      testResults.push(result);

      expect(result.passed).toBe(true);
    });
  });

  describe('Memory Regression', () => {
    it('should not regress on memory usage for large contexts', async () => {
      const testName = 'Large Context Memory Usage';
      const baselineMetric = baseline.find(m => m.name === testName);
      
      const memorySnapshots: number[] = [];

      for (let i = 0; i < 10; i++) {
        if (global.gc) global.gc(); // Force GC if available
        const before = process.memoryUsage().heapUsed;
        
        // Create large context
        const contexts = [];
        for (let j = 0; j < 100; j++) {
          contexts.push(await createLargeContext());
        }
        
        const after = process.memoryUsage().heapUsed;
        memorySnapshots.push((after - before) / 1024 / 1024);
        
        // Clean up
        contexts.length = 0;
        cacheManager.clear();
      }

      const current = {
        averageTime: 0, // Not time-based
        p95Time: 0,
        p99Time: 0,
        memoryUsage: calculateAverage(memorySnapshots)
      };

      const result = evaluateRegression(testName, baselineMetric, current, true);
      testResults.push(result);

      expect(result.passed).toBe(true);
    });
  });

  // Test helper functions

  async function processSimpleMessage(): Promise<void> {
    const context = await contextManager.buildContext({
      userId: 'test-user',
      channelId: 'test-channel',
      serverId: 'test-server',
      messageContent: 'Hello bot!',
      messageHistory: []
    });
    await systemContextBuilder.buildSystemContext(context);
  }

  async function buildComplexContext(): Promise<void> {
    const context = await contextManager.buildContext({
      userId: 'test-user',
      channelId: 'test-channel',
      serverId: 'test-server',
      messageContent: 'Analyze the conversation and provide insights',
      messageHistory: Array(50).fill(null).map((_, i) => ({
        id: `msg-${i}`,
        content: `Message ${i} with various content about different topics`,
        author: { id: `user-${i % 5}`, username: `User${i % 5}` },
        timestamp: Date.now() - i * 60000
      }))
    });
    await systemContextBuilder.buildSystemContext(context);
  }

  async function performCacheOperations(): Promise<void> {
    // Write operations
    for (let i = 0; i < 100; i++) {
      await cacheManager.set(`key-${i}`, { data: `value-${i}`, timestamp: Date.now() });
    }

    // Read operations
    for (let i = 0; i < 100; i++) {
      await cacheManager.get(`key-${Math.floor(Math.random() * 100)}`);
    }

    // Mixed operations
    for (let i = 0; i < 50; i++) {
      if (Math.random() > 0.5) {
        await cacheManager.set(`dynamic-${i}`, { dynamic: true });
      } else {
        await cacheManager.get(`key-${i}`);
      }
    }
  }

  async function setupConversationHistory(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      const messages = Array(20).fill(null).map((_, j) => ({
        role: j % 2 === 0 ? 'user' : 'assistant' as const,
        content: `Message ${j} in conversation ${i}`
      }));
      await conversationManager.addMessages(`user-${i}`, `channel-${i}`, messages);
    }
  }

  async function retrieveConversationHistory(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await conversationManager.getConversation(`user-${i}`, `channel-${i}`);
    }
  }

  async function createLargeContext(): Promise<any> {
    return {
      messages: Array(100).fill(null).map((_, i) => ({
        id: `msg-${i}`,
        content: `This is a large message with lots of content to test memory usage. ${Array(100).fill('x').join('')}`,
        metadata: {
          timestamp: Date.now(),
          reactions: Array(10).fill(null).map((_, j) => ({ emoji: `emoji-${j}`, count: j })),
          attachments: Array(5).fill(null).map((_, j) => ({ id: `attachment-${j}`, size: 1024 * j }))
        }
      })),
      users: Array(50).fill(null).map((_, i) => ({
        id: `user-${i}`,
        username: `User${i}`,
        roles: Array(5).fill(null).map((_, j) => `role-${j}`),
        permissions: Array(10).fill(null).map((_, j) => `permission-${j}`)
      }))
    };
  }

  // Helper functions

  function calculateAverage(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  function evaluateRegression(
    testName: string,
    baselineMetric: BaselineMetric | undefined,
    current: any,
    memoryOnly: boolean = false
  ): RegressionTestResult {
    if (!baselineMetric) {
      // No baseline, create one
      return {
        name: testName,
        passed: true,
        baseline: {
          name: testName,
          averageTime: current.averageTime,
          p95Time: current.p95Time,
          p99Time: current.p99Time,
          memoryUsage: current.memoryUsage,
          timestamp: new Date().toISOString()
        },
        current,
        regression: {
          averageTime: 0,
          p95Time: 0,
          p99Time: 0,
          memoryUsage: 0
        },
        details: { message: 'No baseline found, creating new baseline' }
      };
    }

    const regression = {
      averageTime: memoryOnly ? 0 : (current.averageTime - baselineMetric.averageTime) / baselineMetric.averageTime,
      p95Time: memoryOnly ? 0 : (current.p95Time - baselineMetric.p95Time) / baselineMetric.p95Time,
      p99Time: memoryOnly ? 0 : (current.p99Time - baselineMetric.p99Time) / baselineMetric.p99Time,
      memoryUsage: (current.memoryUsage - baselineMetric.memoryUsage) / baselineMetric.memoryUsage
    };

    const timeRegression = Math.max(regression.averageTime, regression.p95Time, regression.p99Time);
    const passed = (memoryOnly || timeRegression <= CONFIG.maxResponseTimeRegression) &&
                   regression.memoryUsage <= CONFIG.maxMemoryRegression;

    return {
      name: testName,
      passed,
      baseline: baselineMetric,
      current,
      regression: {
        averageTime: regression.averageTime * 100,
        p95Time: regression.p95Time * 100,
        p99Time: regression.p99Time * 100,
        memoryUsage: regression.memoryUsage * 100
      }
    };
  }

  async function generateRegressionReport(): Promise<void> {
    const report: RegressionReport = {
      timestamp: new Date().toISOString(),
      baselineDate: baseline[0]?.timestamp || 'No baseline',
      results: testResults,
      summary: {
        totalTests: testResults.length,
        passed: testResults.filter(r => r.passed).length,
        failed: testResults.filter(r => !r.passed).length,
        overallStatus: testResults.every(r => r.passed) ? 'pass' : 'fail'
      },
      configuration: {
        responseTimeRegressionThreshold: CONFIG.maxResponseTimeRegression * 100,
        memoryRegressionThreshold: CONFIG.maxMemoryRegression * 100
      }
    };

    await fs.ensureDir(CONFIG.reportPath);

    // Save JSON report
    const jsonPath = path.join(CONFIG.reportPath, `regression-${Date.now()}.json`);
    await fs.writeJson(jsonPath, report, { spaces: 2 });

    // Generate markdown report
    const markdownReport = generateMarkdownReport(report);
    const mdPath = path.join(CONFIG.reportPath, `regression-${Date.now()}.md`);
    await fs.writeFile(mdPath, markdownReport);

    // Save latest
    await fs.writeJson(path.join(CONFIG.reportPath, 'latest-regression.json'), report, { spaces: 2 });
    await fs.writeFile(path.join(CONFIG.reportPath, 'latest-regression.md'), markdownReport);

    console.log('\n📊 Regression Test Report:');
    console.log(`   Status: ${report.summary.overallStatus === 'pass' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Passed: ${report.summary.passed}/${report.summary.totalTests}`);
    if (report.summary.failed > 0) {
      console.log('\n   Failed Tests:');
      testResults.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.name}`);
        if (r.regression.averageTime > CONFIG.maxResponseTimeRegression * 100) {
          console.log(`     Response time regression: ${r.regression.averageTime.toFixed(2)}%`);
        }
        if (r.regression.memoryUsage > CONFIG.maxMemoryRegression * 100) {
          console.log(`     Memory regression: ${r.regression.memoryUsage.toFixed(2)}%`);
        }
      });
    }
  }

  function generateMarkdownReport(report: RegressionReport): string {
    let md = '# Performance Regression Test Report\n\n';
    md += `**Date:** ${new Date(report.timestamp).toLocaleString()}\n`;
    md += `**Baseline Date:** ${report.baselineDate}\n`;
    md += `**Status:** ${report.summary.overallStatus === 'pass' ? '✅ PASS' : '❌ FAIL'}\n\n`;

    md += '## Configuration\n';
    md += `- **Max Response Time Regression:** ${report.configuration.responseTimeRegressionThreshold}%\n`;
    md += `- **Max Memory Regression:** ${report.configuration.memoryRegressionThreshold}%\n\n`;

    md += '## Summary\n';
    md += `- **Total Tests:** ${report.summary.totalTests}\n`;
    md += `- **Passed:** ${report.summary.passed}\n`;
    md += `- **Failed:** ${report.summary.failed}\n\n`;

    md += '## Detailed Results\n\n';

    for (const result of report.results) {
      const icon = result.passed ? '✅' : '❌';
      md += `### ${icon} ${result.name}\n\n`;

      md += '**Baseline vs Current:**\n';
      md += '| Metric | Baseline | Current | Regression |\n';
      md += '|--------|----------|---------|------------|\n';
      md += `| Average Time | ${result.baseline.averageTime.toFixed(2)}ms | ${result.current.averageTime.toFixed(2)}ms | ${result.regression.averageTime > 0 ? '+' : ''}${result.regression.averageTime.toFixed(2)}% |\n`;
      md += `| P95 Time | ${result.baseline.p95Time.toFixed(2)}ms | ${result.current.p95Time.toFixed(2)}ms | ${result.regression.p95Time > 0 ? '+' : ''}${result.regression.p95Time.toFixed(2)}% |\n`;
      md += `| P99 Time | ${result.baseline.p99Time.toFixed(2)}ms | ${result.current.p99Time.toFixed(2)}ms | ${result.regression.p99Time > 0 ? '+' : ''}${result.regression.p99Time.toFixed(2)}% |\n`;
      md += `| Memory Usage | ${result.baseline.memoryUsage.toFixed(2)}MB | ${result.current.memoryUsage.toFixed(2)}MB | ${result.regression.memoryUsage > 0 ? '+' : ''}${result.regression.memoryUsage.toFixed(2)}% |\n\n`;

      if (result.details) {
        md += `**Details:** ${JSON.stringify(result.details)}\n\n`;
      }
    }

    return md;
  }

  async function updateBaseline(): Promise<void> {
    const newBaseline: BaselineMetric[] = testResults.map(r => ({
      name: r.name,
      averageTime: r.current.averageTime,
      p95Time: r.current.p95Time,
      p99Time: r.current.p99Time,
      memoryUsage: r.current.memoryUsage,
      timestamp: new Date().toISOString(),
      gitCommit: process.env.GIT_COMMIT || 'unknown'
    }));

    await fs.writeJson(CONFIG.baselinePath, newBaseline, { spaces: 2 });
    console.log(`\n✅ Baseline updated at ${CONFIG.baselinePath}`);
  }
});