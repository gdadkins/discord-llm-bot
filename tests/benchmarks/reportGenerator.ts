import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { BenchmarkResult } from './base';
import { ProfileSession } from './memoryProfiler';

export interface ReportData {
  timestamp: string;
  system: SystemInfo;
  benchmarks: BenchmarkResult[];
  memoryProfiles?: ProfileSession[];
  summary: BenchmarkSummary;
  analysis: PerformanceAnalysis;
  recommendations: Recommendation[];
}

export interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  v8Version: string;
  memory: {
    total: number;
    free: number;
  };
  cpus: number;
  loadavg: number[];
}

export interface BenchmarkSummary {
  totalBenchmarks: number;
  totalOperations: number;
  totalDuration: number;
  averageOpsPerSecond: number;
  averageLatency: {
    p50: number;
    p95: number;
    p99: number;
  };
  memoryUsage: {
    total: number;
    average: number;
    peak: number;
  };
  performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface PerformanceAnalysis {
  bottlenecks: Array<{
    operation: string;
    issue: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    impact: string;
  }>;
  strengths: Array<{
    operation: string;
    metric: string;
    value: string;
  }>;
  trends: {
    throughputTrend: 'improving' | 'stable' | 'degrading';
    latencyTrend: 'improving' | 'stable' | 'degrading';
    memoryTrend: 'improving' | 'stable' | 'degrading';
  };
  regressionRisk: 'low' | 'medium' | 'high';
}

export interface Recommendation {
  type: 'performance' | 'memory' | 'architecture' | 'monitoring';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  implementation: string;
  expectedImpact: string;
  affectedOperations: string[];
}

export class BenchmarkReportGenerator {
  private outputDir: string;
  
  constructor(outputDir: string = './benchmark-reports') {
    this.outputDir = outputDir;
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  generateReport(
    benchmarks: BenchmarkResult[],
    memoryProfiles?: ProfileSession[],
    previousReport?: string
  ): string {
    const timestamp = new Date().toISOString();
    
    const reportData: ReportData = {
      timestamp,
      system: this.getSystemInfo(),
      benchmarks,
      memoryProfiles,
      summary: this.generateSummary(benchmarks),
      analysis: this.performAnalysis(benchmarks, memoryProfiles),
      recommendations: this.generateRecommendations(benchmarks, memoryProfiles)
    };

    // Generate different report formats
    const reports = {
      json: this.generateJSONReport(reportData),
      html: this.generateHTMLReport(reportData),
      markdown: this.generateMarkdownReport(reportData),
      csv: this.generateCSVReport(reportData)
    };

    // Add comparison if previous report is provided
    if (previousReport && existsSync(previousReport)) {
      const comparison = this.generateComparison(reportData, previousReport);
      reports.html += this.generateComparisonHTML(comparison);
      reports.markdown += this.generateComparisonMarkdown(comparison);
    }

    // Save reports
    const timestamp_clean = timestamp.replace(/[:]/g, '-').split('.')[0];
    const paths = {
      json: join(this.outputDir, `benchmark-report-${timestamp_clean}.json`),
      html: join(this.outputDir, `benchmark-report-${timestamp_clean}.html`),
      markdown: join(this.outputDir, `benchmark-report-${timestamp_clean}.md`),
      csv: join(this.outputDir, `benchmark-data-${timestamp_clean}.csv`)
    };

    Object.entries(reports).forEach(([format, content]) => {
      writeFileSync(paths[format as keyof typeof paths], content);
    });

    console.log('\nBenchmark reports generated:');
    Object.entries(paths).forEach(([format, path]) => {
      console.log(`  ${format.toUpperCase()}: ${path}`);
    });

    return paths.html; // Return main HTML report path
  }

  private getSystemInfo(): SystemInfo {
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

  private generateSummary(benchmarks: BenchmarkResult[]): BenchmarkSummary {
    if (benchmarks.length === 0) {
      return {
        totalBenchmarks: 0,
        totalOperations: 0,
        totalDuration: 0,
        averageOpsPerSecond: 0,
        averageLatency: { p50: 0, p95: 0, p99: 0 },
        memoryUsage: { total: 0, average: 0, peak: 0 },
        performanceGrade: 'F'
      };
    }

    const totalOperations = benchmarks.reduce((sum, b) => sum + b.operations, 0);
    const totalDuration = benchmarks.reduce((sum, b) => sum + b.duration, 0);
    const averageOpsPerSecond = benchmarks.reduce((sum, b) => sum + b.opsPerSecond, 0) / benchmarks.length;
    
    const averageLatency = {
      p50: benchmarks.reduce((sum, b) => sum + b.p50, 0) / benchmarks.length,
      p95: benchmarks.reduce((sum, b) => sum + b.p95, 0) / benchmarks.length,
      p99: benchmarks.reduce((sum, b) => sum + b.p99, 0) / benchmarks.length
    };

    const heapValues = benchmarks.map(b => b.heapUsed);
    const memoryUsage = {
      total: heapValues.reduce((sum, h) => sum + h, 0),
      average: heapValues.reduce((sum, h) => sum + h, 0) / heapValues.length,
      peak: Math.max(...heapValues)
    };

    const performanceGrade = this.calculatePerformanceGrade(averageOpsPerSecond, averageLatency.p95);

    return {
      totalBenchmarks: benchmarks.length,
      totalOperations,
      totalDuration,
      averageOpsPerSecond,
      averageLatency,
      memoryUsage,
      performanceGrade
    };
  }

  private calculatePerformanceGrade(avgOpsPerSec: number, avgP95: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    const throughputScore = avgOpsPerSec > 10000 ? 5 : avgOpsPerSec > 5000 ? 4 : avgOpsPerSec > 1000 ? 3 : avgOpsPerSec > 500 ? 2 : 1;
    const latencyScore = avgP95 < 1 ? 5 : avgP95 < 5 ? 4 : avgP95 < 10 ? 3 : avgP95 < 50 ? 2 : 1;
    
    const totalScore = (throughputScore + latencyScore) / 2;
    
    if (totalScore >= 4.5) return 'A';
    if (totalScore >= 3.5) return 'B';
    if (totalScore >= 2.5) return 'C';
    if (totalScore >= 1.5) return 'D';
    return 'F';
  }

  private performAnalysis(benchmarks: BenchmarkResult[], memoryProfiles?: ProfileSession[]): PerformanceAnalysis {
    const bottlenecks = this.identifyBottlenecks(benchmarks);
    const strengths = this.identifyStrengths(benchmarks);
    const trends = this.analyzeTrends(benchmarks);
    const regressionRisk = this.assessRegressionRisk(benchmarks);

    return { bottlenecks, strengths, trends, regressionRisk };
  }

  private identifyBottlenecks(benchmarks: BenchmarkResult[]): PerformanceAnalysis['bottlenecks'] {
    const bottlenecks = [];

    // Identify slow operations
    const slowOps = benchmarks.filter(b => b.opsPerSecond < 1000);
    for (const op of slowOps) {
      bottlenecks.push({
        operation: op.name,
        issue: 'Low throughput',
        severity: op.opsPerSecond < 100 ? 'critical' : op.opsPerSecond < 500 ? 'high' : 'medium',
        impact: `Only ${op.opsPerSecond.toFixed(0)} operations per second`
      });
    }

    // Identify high latency operations
    const highLatencyOps = benchmarks.filter(b => b.p95 > 10);
    for (const op of highLatencyOps) {
      bottlenecks.push({
        operation: op.name,
        issue: 'High latency',
        severity: op.p95 > 100 ? 'critical' : op.p95 > 50 ? 'high' : 'medium',
        impact: `P95 latency of ${op.p95.toFixed(2)}ms`
      });
    }

    // Identify memory-intensive operations
    const memoryIntensiveOps = benchmarks.filter(b => b.heapUsed > 50 * 1024 * 1024);
    for (const op of memoryIntensiveOps) {
      bottlenecks.push({
        operation: op.name,
        issue: 'High memory usage',
        severity: op.heapUsed > 200 * 1024 * 1024 ? 'critical' : op.heapUsed > 100 * 1024 * 1024 ? 'high' : 'medium',
        impact: `Uses ${(op.heapUsed / 1024 / 1024).toFixed(1)}MB of heap memory`
      });
    }

    return bottlenecks;
  }

  private identifyStrengths(benchmarks: BenchmarkResult[]): PerformanceAnalysis['strengths'] {
    const strengths = [];

    // High throughput operations
    const fastOps = benchmarks.filter(b => b.opsPerSecond > 10000).slice(0, 5);
    for (const op of fastOps) {
      strengths.push({
        operation: op.name,
        metric: 'Throughput',
        value: `${op.opsPerSecond.toFixed(0)} ops/sec`
      });
    }

    // Low latency operations
    const lowLatencyOps = benchmarks.filter(b => b.p95 < 1).slice(0, 5);
    for (const op of lowLatencyOps) {
      strengths.push({
        operation: op.name,
        metric: 'Low Latency',
        value: `P95: ${op.p95.toFixed(3)}ms`
      });
    }

    // Memory efficient operations
    const memoryEfficientOps = benchmarks.filter(b => b.heapUsed < 1024 * 1024).slice(0, 5);
    for (const op of memoryEfficientOps) {
      strengths.push({
        operation: op.name,
        metric: 'Memory Efficiency',
        value: `${(op.heapUsed / 1024).toFixed(1)}KB heap`
      });
    }

    return strengths;
  }

  private analyzeTrends(benchmarks: BenchmarkResult[]): PerformanceAnalysis['trends'] {
    // This is a simplified trend analysis
    // In a real implementation, you'd compare with historical data
    return {
      throughputTrend: 'stable',
      latencyTrend: 'stable',
      memoryTrend: 'stable'
    };
  }

  private assessRegressionRisk(benchmarks: BenchmarkResult[]): 'low' | 'medium' | 'high' {
    const criticalIssues = benchmarks.filter(b => 
      b.opsPerSecond < 100 || b.p95 > 100 || b.heapUsed > 200 * 1024 * 1024
    );

    if (criticalIssues.length > benchmarks.length * 0.1) return 'high';
    if (criticalIssues.length > 0) return 'medium';
    return 'low';
  }

  private generateRecommendations(benchmarks: BenchmarkResult[], memoryProfiles?: ProfileSession[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Performance recommendations
    const slowOps = benchmarks.filter(b => b.opsPerSecond < 1000);
    if (slowOps.length > 0) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: 'Optimize Low-Throughput Operations',
        description: `${slowOps.length} operations have throughput below 1000 ops/sec`,
        implementation: 'Profile individual operations, implement caching, optimize algorithms, or consider async processing',
        expectedImpact: 'Could improve overall system throughput by 10-50%',
        affectedOperations: slowOps.map(op => op.name)
      });
    }

    // Memory recommendations
    const memoryIntensiveOps = benchmarks.filter(b => b.heapUsed > 50 * 1024 * 1024);
    if (memoryIntensiveOps.length > 0) {
      recommendations.push({
        type: 'memory',
        priority: 'medium',
        title: 'Reduce Memory Footprint',
        description: `${memoryIntensiveOps.length} operations use significant memory`,
        implementation: 'Implement object pooling, streaming processing, or garbage collection optimization',
        expectedImpact: 'Could reduce memory usage by 20-40% and improve GC performance',
        affectedOperations: memoryIntensiveOps.map(op => op.name)
      });
    }

    // Latency recommendations
    const highLatencyOps = benchmarks.filter(b => b.p95 > 10);
    if (highLatencyOps.length > 0) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Reduce Operation Latency',
        description: `${highLatencyOps.length} operations have P95 latency above 10ms`,
        implementation: 'Optimize I/O operations, implement connection pooling, or add caching layers',
        expectedImpact: 'Could improve user experience and system responsiveness',
        affectedOperations: highLatencyOps.map(op => op.name)
      });
    }

    // General monitoring recommendation
    recommendations.push({
      type: 'monitoring',
      priority: 'low',
      title: 'Implement Continuous Performance Monitoring',
      description: 'Set up automated performance regression detection',
      implementation: 'Integrate benchmark runs into CI/CD pipeline with performance thresholds',
      expectedImpact: 'Early detection of performance regressions before production deployment',
      affectedOperations: ['All operations']
    });

    return recommendations;
  }

  private generateJSONReport(data: ReportData): string {
    return JSON.stringify(data, null, 2);
  }

  private generateHTMLReport(data: ReportData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Benchmark Report - ${new Date(data.timestamp).toLocaleDateString()}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; line-height: 1.6; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: white; border: 1px solid #e1e5e9; border-radius: 8px; padding: 20px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #2563eb; }
        .metric-label { color: #6b7280; font-size: 0.9em; margin-top: 5px; }
        .grade-A { color: #10b981; }
        .grade-B { color: #3b82f6; }
        .grade-C { color: #f59e0b; }
        .grade-D { color: #ef4444; }
        .grade-F { color: #dc2626; }
        .section { margin-bottom: 40px; }
        .section h2 { border-bottom: 2px solid #e1e5e9; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e1e5e9; }
        th { background: #f8f9fa; font-weight: 600; }
        .bottleneck-critical { background: #fef2f2; }
        .bottleneck-high { background: #fef3c7; }
        .bottleneck-medium { background: #f0f9ff; }
        .recommendation { background: #f8f9fa; border-left: 4px solid #2563eb; padding: 15px; margin: 10px 0; }
        .recommendation-critical { border-left-color: #dc2626; }
        .recommendation-high { border-left-color: #ef4444; }
        .recommendation-medium { border-left-color: #f59e0b; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Discord LLM Bot Performance Benchmark Report</h1>
        <p><strong>Generated:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
        <p><strong>System:</strong> ${data.system.platform} ${data.system.arch}, Node.js ${data.system.nodeVersion}</p>
        <p><strong>Performance Grade:</strong> <span class="grade-${data.summary.performanceGrade}">${data.summary.performanceGrade}</span></p>
    </div>

    <div class="summary">
        <div class="metric-card">
            <div class="metric-value">${data.summary.totalBenchmarks}</div>
            <div class="metric-label">Total Benchmarks</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${data.summary.averageOpsPerSecond.toFixed(0)}</div>
            <div class="metric-label">Avg Ops/Sec</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${data.summary.averageLatency.p95.toFixed(2)}ms</div>
            <div class="metric-label">Avg P95 Latency</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${(data.summary.memoryUsage.average / 1024 / 1024).toFixed(1)}MB</div>
            <div class="metric-label">Avg Memory Usage</div>
        </div>
    </div>

    <div class="section">
        <h2>Benchmark Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Operation</th>
                    <th>Ops/Sec</th>
                    <th>P50 (ms)</th>
                    <th>P95 (ms)</th>
                    <th>P99 (ms)</th>
                    <th>Memory (MB)</th>
                </tr>
            </thead>
            <tbody>
                ${data.benchmarks.map(b => `
                <tr>
                    <td>${b.name}</td>
                    <td>${b.opsPerSecond.toFixed(2)}</td>
                    <td>${b.p50.toFixed(3)}</td>
                    <td>${b.p95.toFixed(3)}</td>
                    <td>${b.p99.toFixed(3)}</td>
                    <td>${(b.heapUsed / 1024 / 1024).toFixed(2)}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    ${data.analysis.bottlenecks.length > 0 ? `
    <div class="section">
        <h2>Performance Bottlenecks</h2>
        <table>
            <thead>
                <tr><th>Operation</th><th>Issue</th><th>Severity</th><th>Impact</th></tr>
            </thead>
            <tbody>
                ${data.analysis.bottlenecks.map(b => `
                <tr class="bottleneck-${b.severity}">
                    <td>${b.operation}</td>
                    <td>${b.issue}</td>
                    <td>${b.severity.toUpperCase()}</td>
                    <td>${b.impact}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    ` : ''}

    <div class="section">
        <h2>Recommendations</h2>
        ${data.recommendations.map(r => `
        <div class="recommendation recommendation-${r.priority}">
            <h3>${r.title}</h3>
            <p><strong>Priority:</strong> ${r.priority.toUpperCase()}</p>
            <p><strong>Description:</strong> ${r.description}</p>
            <p><strong>Implementation:</strong> ${r.implementation}</p>
            <p><strong>Expected Impact:</strong> ${r.expectedImpact}</p>
        </div>
        `).join('')}
    </div>

    <div class="section">
        <h2>System Information</h2>
        <table>
            <tbody>
                <tr><td>Platform</td><td>${data.system.platform} ${data.system.arch}</td></tr>
                <tr><td>Node.js Version</td><td>${data.system.nodeVersion}</td></tr>
                <tr><td>V8 Version</td><td>${data.system.v8Version}</td></tr>
                <tr><td>Total Memory</td><td>${(data.system.memory.total / 1024 / 1024 / 1024).toFixed(2)} GB</td></tr>
                <tr><td>Free Memory</td><td>${(data.system.memory.free / 1024 / 1024 / 1024).toFixed(2)} GB</td></tr>
                <tr><td>CPU Cores</td><td>${data.system.cpus}</td></tr>
                <tr><td>Load Average</td><td>${data.system.loadavg.map(l => l.toFixed(2)).join(', ')}</td></tr>
            </tbody>
        </table>
    </div>
</body>
</html>`;
  }

  private generateMarkdownReport(data: ReportData): string {
    return `# Discord LLM Bot Performance Benchmark Report

**Generated:** ${new Date(data.timestamp).toLocaleString()}  
**System:** ${data.system.platform} ${data.system.arch}, Node.js ${data.system.nodeVersion}  
**Performance Grade:** ${data.summary.performanceGrade}

## Summary

- **Total Benchmarks:** ${data.summary.totalBenchmarks}
- **Average Ops/Sec:** ${data.summary.averageOpsPerSecond.toFixed(0)}
- **Average P95 Latency:** ${data.summary.averageLatency.p95.toFixed(2)}ms
- **Average Memory Usage:** ${(data.summary.memoryUsage.average / 1024 / 1024).toFixed(1)}MB

## Benchmark Results

| Operation | Ops/Sec | P50 (ms) | P95 (ms) | P99 (ms) | Memory (MB) |
|-----------|---------|----------|----------|----------|-------------|
${data.benchmarks.map(b => 
`| ${b.name} | ${b.opsPerSecond.toFixed(2)} | ${b.p50.toFixed(3)} | ${b.p95.toFixed(3)} | ${b.p99.toFixed(3)} | ${(b.heapUsed / 1024 / 1024).toFixed(2)} |`
).join('\n')}

${data.analysis.bottlenecks.length > 0 ? `
## Performance Bottlenecks

${data.analysis.bottlenecks.map(b => `
### ${b.operation}
- **Issue:** ${b.issue}
- **Severity:** ${b.severity.toUpperCase()}
- **Impact:** ${b.impact}
`).join('')}
` : ''}

## Recommendations

${data.recommendations.map(r => `
### ${r.title}
**Priority:** ${r.priority.toUpperCase()}

${r.description}

**Implementation:** ${r.implementation}

**Expected Impact:** ${r.expectedImpact}
`).join('')}

## System Information

- **Platform:** ${data.system.platform} ${data.system.arch}
- **Node.js Version:** ${data.system.nodeVersion}
- **V8 Version:** ${data.system.v8Version}
- **Total Memory:** ${(data.system.memory.total / 1024 / 1024 / 1024).toFixed(2)} GB
- **Free Memory:** ${(data.system.memory.free / 1024 / 1024 / 1024).toFixed(2)} GB
- **CPU Cores:** ${data.system.cpus}
- **Load Average:** ${data.system.loadavg.map(l => l.toFixed(2)).join(', ')}
`;
  }

  private generateCSVReport(data: ReportData): string {
    const headers = 'Name,Operations,Duration,OpsPerSecond,AvgTimePerOp,MinTime,MaxTime,P50,P95,P99,MemoryUsed,HeapUsed,External,GCRuns';
    const rows = data.benchmarks.map(b => 
      `"${b.name}",${b.operations},${b.duration},${b.opsPerSecond},${b.avgTimePerOp},${b.minTime},${b.maxTime},${b.p50},${b.p95},${b.p99},${b.memoryUsed},${b.heapUsed},${b.external},${b.gcRuns}`
    );
    
    return [headers, ...rows].join('\n');
  }

  private generateComparison(current: ReportData, previousFile: string): any {
    try {
      const previous = JSON.parse(readFileSync(previousFile, 'utf8'));
      return { current, previous };
    } catch {
      return null;
    }
  }

  private generateComparisonHTML(comparison: any): string {
    if (!comparison) return '';
    // Implementation for comparison HTML would go here
    return '<div class="section"><h2>Comparison with Previous Results</h2><p>Comparison functionality not implemented in this version.</p></div>';
  }

  private generateComparisonMarkdown(comparison: any): string {
    if (!comparison) return '';
    // Implementation for comparison Markdown would go here
    return '\n## Comparison with Previous Results\n\nComparison functionality not implemented in this version.\n';
  }
}