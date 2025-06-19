/**
 * Load Testing Script with Worker Threads
 * Simulates concurrent users for Discord bot load testing
 * Supports configurable scenarios and generates performance reports
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs-extra';
import { performance } from 'perf_hooks';

interface LoadTestConfig {
  concurrentUsers: number;
  testDuration: number; // seconds
  scenarios: ScenarioConfig[];
  reportPath?: string;
}

interface ScenarioConfig {
  name: string;
  weight: number; // Percentage of users executing this scenario
  actions: ActionConfig[];
}

interface ActionConfig {
  type: 'sendMessage' | 'useCommand' | 'sendImage' | 'wait';
  data?: any;
  delayMs?: number;
}

interface WorkerResult {
  workerId: number;
  responseTimes: number[];
  errors: string[];
  successCount: number;
  errorCount: number;
  scenario: string;
}

interface LoadTestReport {
  timestamp: string;
  config: LoadTestConfig;
  results: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    scenarios: {
      [name: string]: {
        requests: number;
        avgResponseTime: number;
        errorRate: number;
      };
    };
  };
  errors: string[];
}

// Default scenarios
const DEFAULT_SCENARIOS: ScenarioConfig[] = [
  {
    name: 'sendMessage',
    weight: 50,
    actions: [
      {
        type: 'sendMessage',
        data: { content: 'Hello bot! How are you today?' },
        delayMs: 1000
      }
    ]
  },
  {
    name: 'useCommand',
    weight: 30,
    actions: [
      {
        type: 'useCommand',
        data: { command: '!help' },
        delayMs: 1000
      }
    ]
  },
  {
    name: 'sendImage',
    weight: 20,
    actions: [
      {
        type: 'sendImage',
        data: { 
          content: 'Can you analyze this image?',
          imageUrl: 'https://example.com/test-image.jpg'
        },
        delayMs: 2000
      }
    ]
  }
];

// Worker thread code
if (!isMainThread) {
  const { workerId, config, scenarioIndex } = workerData;
  const scenario = config.scenarios[scenarioIndex];
  const results: WorkerResult = {
    workerId,
    responseTimes: [],
    errors: [],
    successCount: 0,
    errorCount: 0,
    scenario: scenario.name
  };

  const executeAction = async (action: ActionConfig): Promise<number> => {
    const start = performance.now();
    
    try {
      // Simulate API call based on action type
      switch (action.type) {
        case 'sendMessage':
          await simulateMessageSend(action.data);
          break;
        case 'useCommand':
          await simulateCommand(action.data);
          break;
        case 'sendImage':
          await simulateImageSend(action.data);
          break;
        case 'wait':
          await new Promise(resolve => setTimeout(resolve, action.delayMs || 1000));
          break;
      }
      
      const responseTime = performance.now() - start;
      results.responseTimes.push(responseTime);
      results.successCount++;
      
      return responseTime;
    } catch (error) {
      results.errorCount++;
      results.errors.push(error instanceof Error ? error.message : String(error));
      return -1;
    }
  };

  const simulateMessageSend = async (data: any): Promise<void> => {
    // Simulate Discord API call
    const processingTime = Math.random() * 100 + 50; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    // Simulate occasional failures
    if (Math.random() < 0.01) { // 1% error rate
      throw new Error('Message send failed: Rate limited');
    }
  };

  const simulateCommand = async (data: any): Promise<void> => {
    // Commands typically take longer
    const processingTime = Math.random() * 200 + 100; // 100-300ms
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    if (Math.random() < 0.02) { // 2% error rate
      throw new Error('Command execution failed: Invalid command');
    }
  };

  const simulateImageSend = async (data: any): Promise<void> => {
    // Image processing takes longer
    const processingTime = Math.random() * 500 + 200; // 200-700ms
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    if (Math.random() < 0.03) { // 3% error rate
      throw new Error('Image processing failed: Invalid format');
    }
  };

  const runWorker = async (): Promise<void> => {
    const endTime = Date.now() + (config.testDuration * 1000);
    
    while (Date.now() < endTime) {
      for (const action of scenario.actions) {
        if (Date.now() >= endTime) break;
        
        await executeAction(action);
        
        if (action.delayMs) {
          await new Promise(resolve => setTimeout(resolve, action.delayMs));
        }
      }
    }
    
    parentPort?.postMessage(results);
  };

  runWorker().catch(error => {
    console.error(`Worker ${workerId} error:`, error);
    parentPort?.postMessage(results);
  });
}

// Main thread code
class LoadTester {
  private config: LoadTestConfig;

  constructor(config: Partial<LoadTestConfig> = {}) {
    this.config = {
      concurrentUsers: config.concurrentUsers || 100,
      testDuration: config.testDuration || 60,
      scenarios: config.scenarios || DEFAULT_SCENARIOS,
      reportPath: config.reportPath || './reports/load-test'
    };
  }

  async run(): Promise<LoadTestReport> {
    console.log('🚀 Starting Load Test');
    console.log(`   Concurrent Users: ${this.config.concurrentUsers}`);
    console.log(`   Test Duration: ${this.config.testDuration}s`);
    console.log(`   Scenarios: ${this.config.scenarios.map(s => s.name).join(', ')}`);
    console.log('');

    const startTime = Date.now();
    const workers: Worker[] = [];
    const workerPromises: Promise<WorkerResult>[] = [];

    // Distribute workers across scenarios based on weights
    const scenarioDistribution = this.calculateScenarioDistribution();

    // Create and start workers
    for (let i = 0; i < this.config.concurrentUsers; i++) {
      const scenarioIndex = scenarioDistribution[i];
      const worker = new Worker(__filename, {
        workerData: {
          workerId: i,
          config: this.config,
          scenarioIndex
        }
      });

      workers.push(worker);

      const promise = new Promise<WorkerResult>((resolve, reject) => {
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker ${i} stopped with exit code ${code}`));
          }
        });
      });

      workerPromises.push(promise);
    }

    // Show progress
    const progressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = this.config.testDuration - elapsed;
      process.stdout.write(`\r⏱️  Progress: ${elapsed}s / ${this.config.testDuration}s (${remaining}s remaining)`);
    }, 1000);

    // Wait for all workers to complete
    const results = await Promise.all(workerPromises);
    clearInterval(progressInterval);
    console.log('\n✅ Load test completed\n');

    // Terminate workers
    for (const worker of workers) {
      await worker.terminate();
    }

    // Generate report
    const report = this.generateReport(results, Date.now() - startTime);
    await this.saveReport(report);

    return report;
  }

  private calculateScenarioDistribution(): number[] {
    const distribution: number[] = [];
    const totalWeight = this.config.scenarios.reduce((sum, s) => sum + s.weight, 0);
    
    for (let i = 0; i < this.config.concurrentUsers; i++) {
      let random = Math.random() * totalWeight;
      let scenarioIndex = 0;
      
      for (let j = 0; j < this.config.scenarios.length; j++) {
        random -= this.config.scenarios[j].weight;
        if (random <= 0) {
          scenarioIndex = j;
          break;
        }
      }
      
      distribution.push(scenarioIndex);
    }
    
    return distribution;
  }

  private generateReport(results: WorkerResult[], totalDuration: number): LoadTestReport {
    const allResponseTimes = results.flatMap(r => r.responseTimes);
    const allErrors = results.flatMap(r => r.errors);
    const totalRequests = results.reduce((sum, r) => sum + r.successCount + r.errorCount, 0);
    const successfulRequests = results.reduce((sum, r) => sum + r.successCount, 0);
    const failedRequests = results.reduce((sum, r) => sum + r.errorCount, 0);

    // Calculate percentiles
    const sortedTimes = allResponseTimes.filter(t => t > 0).sort((a, b) => a - b);
    const p50 = this.calculatePercentile(sortedTimes, 50);
    const p95 = this.calculatePercentile(sortedTimes, 95);
    const p99 = this.calculatePercentile(sortedTimes, 99);

    // Calculate scenario-specific metrics
    const scenarioMetrics: { [name: string]: any } = {};
    for (const scenario of this.config.scenarios) {
      const scenarioResults = results.filter(r => r.scenario === scenario.name);
      const scenarioTimes = scenarioResults.flatMap(r => r.responseTimes);
      const scenarioRequests = scenarioResults.reduce((sum, r) => sum + r.successCount + r.errorCount, 0);
      const scenarioErrors = scenarioResults.reduce((sum, r) => sum + r.errorCount, 0);

      scenarioMetrics[scenario.name] = {
        requests: scenarioRequests,
        avgResponseTime: scenarioTimes.length > 0 
          ? scenarioTimes.reduce((a, b) => a + b, 0) / scenarioTimes.length 
          : 0,
        errorRate: scenarioRequests > 0 ? (scenarioErrors / scenarioRequests) * 100 : 0
      };
    }

    return {
      timestamp: new Date().toISOString(),
      config: this.config,
      results: {
        totalRequests,
        successfulRequests,
        failedRequests,
        averageResponseTime: sortedTimes.length > 0 
          ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length 
          : 0,
        minResponseTime: sortedTimes.length > 0 ? sortedTimes[0] : 0,
        maxResponseTime: sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 0,
        p50ResponseTime: p50,
        p95ResponseTime: p95,
        p99ResponseTime: p99,
        requestsPerSecond: totalRequests / (totalDuration / 1000),
        errorRate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
        scenarios: scenarioMetrics
      },
      errors: allErrors
    };
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  private async saveReport(report: LoadTestReport): Promise<void> {
    if (!this.config.reportPath) return;

    await fs.ensureDir(this.config.reportPath);

    // Save JSON report
    const jsonPath = path.join(this.config.reportPath, `load-test-${Date.now()}.json`);
    await fs.writeJson(jsonPath, report, { spaces: 2 });

    // Generate and save markdown report
    const markdownReport = this.generateMarkdownReport(report);
    const mdPath = path.join(this.config.reportPath, `load-test-${Date.now()}.md`);
    await fs.writeFile(mdPath, markdownReport);

    // Save latest for easy access
    await fs.writeJson(path.join(this.config.reportPath, 'latest.json'), report, { spaces: 2 });
    await fs.writeFile(path.join(this.config.reportPath, 'latest.md'), markdownReport);

    console.log('📊 Load Test Report Generated:');
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   Markdown: ${mdPath}`);
    this.printSummary(report);
  }

  private generateMarkdownReport(report: LoadTestReport): string {
    let md = '# Load Test Report\n\n';
    md += `**Date:** ${new Date(report.timestamp).toLocaleString()}\n`;
    md += `**Duration:** ${report.config.testDuration}s\n`;
    md += `**Concurrent Users:** ${report.config.concurrentUsers}\n\n`;

    md += '## Summary\n';
    md += `- **Total Requests:** ${report.results.totalRequests}\n`;
    md += `- **Successful Requests:** ${report.results.successfulRequests} ✅\n`;
    md += `- **Failed Requests:** ${report.results.failedRequests} ❌\n`;
    md += `- **Error Rate:** ${report.results.errorRate.toFixed(2)}%\n`;
    md += `- **Requests/Second:** ${report.results.requestsPerSecond.toFixed(2)}\n\n`;

    md += '## Response Times\n';
    md += `- **Average:** ${report.results.averageResponseTime.toFixed(2)}ms\n`;
    md += `- **Min:** ${report.results.minResponseTime.toFixed(2)}ms\n`;
    md += `- **Max:** ${report.results.maxResponseTime.toFixed(2)}ms\n`;
    md += `- **P50 (Median):** ${report.results.p50ResponseTime.toFixed(2)}ms\n`;
    md += `- **P95:** ${report.results.p95ResponseTime.toFixed(2)}ms\n`;
    md += `- **P99:** ${report.results.p99ResponseTime.toFixed(2)}ms\n\n`;

    md += '## Scenario Breakdown\n';
    for (const [name, metrics] of Object.entries(report.results.scenarios)) {
      md += `\n### ${name}\n`;
      md += `- **Requests:** ${metrics.requests}\n`;
      md += `- **Avg Response Time:** ${metrics.avgResponseTime.toFixed(2)}ms\n`;
      md += `- **Error Rate:** ${metrics.errorRate.toFixed(2)}%\n`;
    }

    if (report.errors.length > 0) {
      md += '\n## Error Summary\n';
      const errorCounts = report.errors.reduce((acc, error) => {
        acc[error] = (acc[error] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number });

      for (const [error, count] of Object.entries(errorCounts)) {
        md += `- ${error}: ${count} occurrences\n`;
      }
    }

    return md;
  }

  private printSummary(report: LoadTestReport): void {
    console.log('\n📈 Test Results Summary:');
    console.log(`   Total Requests: ${report.results.totalRequests}`);
    console.log(`   Success Rate: ${((report.results.successfulRequests / report.results.totalRequests) * 100).toFixed(2)}%`);
    console.log(`   Requests/Second: ${report.results.requestsPerSecond.toFixed(2)}`);
    console.log(`   Response Times:`);
    console.log(`     - P50: ${report.results.p50ResponseTime.toFixed(2)}ms`);
    console.log(`     - P95: ${report.results.p95ResponseTime.toFixed(2)}ms`);
    console.log(`     - P99: ${report.results.p99ResponseTime.toFixed(2)}ms`);
  }
}

// CLI interface
if (isMainThread && require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  switch (command) {
    case 'run':
      const loadTester = new LoadTester({
        concurrentUsers: 100,
        testDuration: 60,
        scenarios: DEFAULT_SCENARIOS
      });
      loadTester.run().catch(console.error);
      break;

    case 'quick':
      const quickTester = new LoadTester({
        concurrentUsers: 10,
        testDuration: 10,
        scenarios: DEFAULT_SCENARIOS
      });
      quickTester.run().catch(console.error);
      break;

    case 'stress':
      const stressTester = new LoadTester({
        concurrentUsers: 500,
        testDuration: 300,
        scenarios: DEFAULT_SCENARIOS
      });
      stressTester.run().catch(console.error);
      break;

    default:
      console.log('Usage: npm run load-test [run|quick|stress]');
      console.log('  run    - Standard load test (100 users, 60s)');
      console.log('  quick  - Quick test (10 users, 10s)');
      console.log('  stress - Stress test (500 users, 300s)');
  }
}

export { LoadTester, LoadTestConfig, LoadTestReport };