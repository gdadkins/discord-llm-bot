/**
 * Performance Monitoring Dashboard
 * Real-time performance metrics collection and reporting
 * Tracks response times, cache hit rates, memory usage, and errors
 */

import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { PerformanceMetadata, PerformanceStats } from '../types';

interface PerformanceMetric {
  timestamp: number;
  type: 'response_time' | 'cache_hit' | 'cache_miss' | 'error' | 'memory';
  value: number;
  metadata?: PerformanceMetadata;
}

interface PerformanceAlert {
  timestamp: number;
  type: 'response_time' | 'memory' | 'error_rate';
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number;
  threshold: number;
}

interface DashboardConfig {
  metricsRetentionMinutes: number;
  sampleIntervalMs: number;
  reportIntervalMs: number;
  thresholds: {
    responseTimeMs: number;
    memoryMB: number;
    errorRatePercent: number;
    cacheHitRatePercent: number;
  };
  reportPath?: string;
}

interface PerformanceReport {
  timestamp: string;
  period: {
    start: string;
    end: string;
    durationMinutes: number;
  };
  metrics: {
    responseTimes: {
      count: number;
      average: number;
      median: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
    };
    cachePerformance: {
      hits: number;
      misses: number;
      hitRate: number;
      totalRequests: number;
    };
    memory: {
      average: number;
      peak: number;
      current: number;
      trend: 'stable' | 'increasing' | 'decreasing';
    };
    errors: {
      total: number;
      rate: number;
      byType: { [type: string]: number };
    };
  };
  alerts: PerformanceAlert[];
  health: {
    status: 'healthy' | 'degraded' | 'critical';
    score: number; // 0-100
    issues: string[];
  };
}

class PerformanceDashboard extends EventEmitter {
  private config: DashboardConfig;
  private metrics: PerformanceMetric[] = [];
  private alerts: PerformanceAlert[] = [];
  private isRunning: boolean = false;
  private sampleInterval: NodeJS.Timeout | null = null;
  private reportInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();
  private memoryBaseline: number = 0;

  constructor(config?: Partial<DashboardConfig>) {
    super();
    this.config = {
      metricsRetentionMinutes: config?.metricsRetentionMinutes || 60,
      sampleIntervalMs: config?.sampleIntervalMs || 5000,
      reportIntervalMs: config?.reportIntervalMs || 60000,
      thresholds: {
        responseTimeMs: config?.thresholds?.responseTimeMs || 1000,
        memoryMB: config?.thresholds?.memoryMB || 500,
        errorRatePercent: config?.thresholds?.errorRatePercent || 5,
        cacheHitRatePercent: config?.thresholds?.cacheHitRatePercent || 80,
        ...config?.thresholds
      },
      reportPath: config?.reportPath || './reports/performance-monitoring'
    };
  }

  /**
   * Start the performance monitoring dashboard
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Performance dashboard is already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.memoryBaseline = process.memoryUsage().heapUsed / 1024 / 1024;

    // Start memory sampling
    this.sampleInterval = setInterval(() => {
      this.sampleMemory();
    }, this.config.sampleIntervalMs);

    // Start periodic reporting
    this.reportInterval = setInterval(() => {
      this.generateReport();
    }, this.config.reportIntervalMs);

    // Cleanup old metrics periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 60000); // Every minute

    console.log('✅ Performance dashboard started');
    this.emit('started');
  }

  /**
   * Stop the performance monitoring dashboard
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
    }

    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Generate final report
    this.generateReport();

    console.log('⏹️  Performance dashboard stopped');
    this.emit('stopped');
  }

  /**
   * Record a response time metric
   */
  recordResponseTime(durationMs: number, metadata?: PerformanceMetadata): void {
    this.recordMetric({
      timestamp: Date.now(),
      type: 'response_time',
      value: durationMs,
      metadata
    });

    // Check threshold
    if (durationMs > this.config.thresholds.responseTimeMs) {
      this.createAlert({
        timestamp: Date.now(),
        type: 'response_time',
        severity: durationMs > this.config.thresholds.responseTimeMs * 2 ? 'critical' : 'warning',
        message: `Response time ${durationMs.toFixed(0)}ms exceeds threshold`,
        currentValue: durationMs,
        threshold: this.config.thresholds.responseTimeMs
      });
    }
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(key: string): void {
    this.recordMetric({
      timestamp: Date.now(),
      type: 'cache_hit',
      value: 1,
      metadata: { key }
    });
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(key: string): void {
    this.recordMetric({
      timestamp: Date.now(),
      type: 'cache_miss',
      value: 1,
      metadata: { key }
    });
  }

  /**
   * Record an error
   */
  recordError(error: Error | string, metadata?: PerformanceMetadata): void {
    this.recordMetric({
      timestamp: Date.now(),
      type: 'error',
      value: 1,
      metadata: {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        ...metadata
      }
    });
  }

  /**
   * Get current performance statistics
   */
  getStats(): PerformanceStats {
    const now = Date.now();
    const recentMetrics = this.metrics.filter(
      m => m.timestamp > now - 5 * 60 * 1000 // Last 5 minutes
    );

    const responseTimes = recentMetrics
      .filter(m => m.type === 'response_time')
      .map(m => m.value);

    const cacheHits = recentMetrics.filter(m => m.type === 'cache_hit').length;
    const cacheMisses = recentMetrics.filter(m => m.type === 'cache_miss').length;
    const totalCacheRequests = cacheHits + cacheMisses;

    const errors = recentMetrics.filter(m => m.type === 'error').length;
    const memoryMetrics = recentMetrics
      .filter(m => m.type === 'memory')
      .map(m => m.value);

    const avgResponseTime = this.calculateAverage(responseTimes);
    const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const p50ResponseTime = this.calculatePercentile(responseTimes, 50);
    const p95ResponseTime = this.calculatePercentile(responseTimes, 95);
    const p99ResponseTime = this.calculatePercentile(responseTimes, 99);
    const cacheHitRate = totalCacheRequests > 0 ? (cacheHits / totalCacheRequests) : 0;
    const errorRate = responseTimes.length > 0 ? (errors / responseTimes.length) : 0;
    const memoryUsage = {
      current: memoryMetrics.length > 0 ? memoryMetrics[memoryMetrics.length - 1] : 0,
      peak: memoryMetrics.length > 0 ? Math.max(...memoryMetrics) : 0,
      average: this.calculateAverage(memoryMetrics)
    };

    return {
      totalRequests: responseTimes.length,
      avgResponseTime,
      maxResponseTime,
      minResponseTime,
      p50ResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      cacheHitRate,
      errorRate,
      memoryUsage,
      timestamp: now,
      responseTimes: {
        count: responseTimes.length,
        average: avgResponseTime,
        max: maxResponseTime,
        min: minResponseTime,
        p95: p95ResponseTime,
        p99: p99ResponseTime
      },
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: cacheHitRate
      },
      memory: {
        current: memoryUsage.current,
        baseline: this.memoryBaseline,
        delta: memoryUsage.current - this.memoryBaseline,
        average: memoryUsage.average,
        peak: memoryUsage.peak
      },
      errors: {
        count: errors,
        rate: errorRate
      },
      uptime: (now - this.startTime) / 1000 // seconds
    };
  }

  /**
   * Measure and wrap an async function
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordResponseTime(duration, { operation: name });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordResponseTime(duration, { operation: name, error: true });
      this.recordError(error as Error, { operation: name });
      throw error;
    }
  }

  // Private methods

  private recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    this.emit('metric', metric);
  }

  private createAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert);
    this.emit('alert', alert);
    console.warn(`⚠️  Performance Alert: ${alert.message}`);
  }

  private sampleMemory(): void {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

    this.recordMetric({
      timestamp: Date.now(),
      type: 'memory',
      value: heapUsedMB,
      metadata: {
        heapTotal: memoryUsage.heapTotal / 1024 / 1024,
        external: memoryUsage.external / 1024 / 1024,
        rss: memoryUsage.rss / 1024 / 1024
      }
    });

    // Check threshold
    if (heapUsedMB > this.config.thresholds.memoryMB) {
      this.createAlert({
        timestamp: Date.now(),
        type: 'memory',
        severity: heapUsedMB > this.config.thresholds.memoryMB * 1.5 ? 'critical' : 'warning',
        message: `Memory usage ${heapUsedMB.toFixed(0)}MB exceeds threshold`,
        currentValue: heapUsedMB,
        threshold: this.config.thresholds.memoryMB
      });
    }
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - (this.config.metricsRetentionMinutes * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp > cutoffTime);
    this.alerts = this.alerts.filter(a => a.timestamp > cutoffTime);
  }

  private async generateReport(): Promise<void> {
    const report = this.createReport();
    
    if (this.config.reportPath) {
      await this.saveReport(report);
    }

    this.emit('report', report);
  }

  private createReport(): PerformanceReport {
    const now = Date.now();
    const periodStart = now - this.config.reportIntervalMs;
    const periodMetrics = this.metrics.filter(m => m.timestamp >= periodStart);
    const periodAlerts = this.alerts.filter(a => a.timestamp >= periodStart);

    // Response times
    const responseTimes = periodMetrics
      .filter(m => m.type === 'response_time')
      .map(m => m.value)
      .sort((a, b) => a - b);

    // Cache metrics
    const cacheHits = periodMetrics.filter(m => m.type === 'cache_hit').length;
    const cacheMisses = periodMetrics.filter(m => m.type === 'cache_miss').length;
    const totalCacheRequests = cacheHits + cacheMisses;

    // Memory metrics
    const memoryMetrics = periodMetrics
      .filter(m => m.type === 'memory')
      .map(m => m.value);

    // Error metrics
    const errors = periodMetrics.filter(m => m.type === 'error');
    const errorsByType: { [type: string]: number } = {};
    errors.forEach(e => {
      const errorType = String(e.metadata?.error || 'Unknown');
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    });

    // Calculate health score
    const { status, score, issues } = this.calculateHealthScore(
      responseTimes,
      totalCacheRequests > 0 ? (cacheHits / totalCacheRequests) * 100 : 100,
      errors.length,
      responseTimes.length,
      memoryMetrics
    );

    return {
      timestamp: new Date().toISOString(),
      period: {
        start: new Date(periodStart).toISOString(),
        end: new Date(now).toISOString(),
        durationMinutes: this.config.reportIntervalMs / 60000
      },
      metrics: {
        responseTimes: {
          count: responseTimes.length,
          average: this.calculateAverage(responseTimes),
          median: this.calculatePercentile(responseTimes, 50),
          p95: this.calculatePercentile(responseTimes, 95),
          p99: this.calculatePercentile(responseTimes, 99),
          min: responseTimes.length > 0 ? responseTimes[0] : 0,
          max: responseTimes.length > 0 ? responseTimes[responseTimes.length - 1] : 0
        },
        cachePerformance: {
          hits: cacheHits,
          misses: cacheMisses,
          hitRate: totalCacheRequests > 0 ? (cacheHits / totalCacheRequests) * 100 : 0,
          totalRequests: totalCacheRequests
        },
        memory: {
          average: this.calculateAverage(memoryMetrics),
          peak: memoryMetrics.length > 0 ? Math.max(...memoryMetrics) : 0,
          current: memoryMetrics.length > 0 ? memoryMetrics[memoryMetrics.length - 1] : 0,
          trend: this.calculateMemoryTrend(memoryMetrics)
        },
        errors: {
          total: errors.length,
          rate: responseTimes.length > 0 ? (errors.length / responseTimes.length) * 100 : 0,
          byType: errorsByType
        }
      },
      alerts: periodAlerts,
      health: { status, score, issues }
    };
  }

  private calculateHealthScore(
    responseTimes: number[],
    cacheHitRate: number,
    errorCount: number,
    totalRequests: number,
    memoryMetrics: number[]
  ): { status: 'healthy' | 'degraded' | 'critical'; score: number; issues: string[] } {
    let score = 100;
    const issues: string[] = [];

    // Response time scoring (30 points)
    const avgResponseTime = this.calculateAverage(responseTimes);
    if (avgResponseTime > this.config.thresholds.responseTimeMs * 2) {
      score -= 30;
      issues.push('Very high response times');
    } else if (avgResponseTime > this.config.thresholds.responseTimeMs) {
      score -= 15;
      issues.push('High response times');
    }

    // Cache performance scoring (20 points)
    if (cacheHitRate < this.config.thresholds.cacheHitRatePercent - 20) {
      score -= 20;
      issues.push('Very low cache hit rate');
    } else if (cacheHitRate < this.config.thresholds.cacheHitRatePercent) {
      score -= 10;
      issues.push('Low cache hit rate');
    }

    // Error rate scoring (30 points)
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
    if (errorRate > this.config.thresholds.errorRatePercent * 2) {
      score -= 30;
      issues.push('Very high error rate');
    } else if (errorRate > this.config.thresholds.errorRatePercent) {
      score -= 15;
      issues.push('High error rate');
    }

    // Memory scoring (20 points)
    const currentMemory = memoryMetrics.length > 0 ? memoryMetrics[memoryMetrics.length - 1] : 0;
    if (currentMemory > this.config.thresholds.memoryMB * 1.5) {
      score -= 20;
      issues.push('Very high memory usage');
    } else if (currentMemory > this.config.thresholds.memoryMB) {
      score -= 10;
      issues.push('High memory usage');
    }

    // Determine status
    let status: 'healthy' | 'degraded' | 'critical';
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 50) {
      status = 'degraded';
    } else {
      status = 'critical';
    }

    return { status, score: Math.max(0, score), issues };
  }

  private calculateMemoryTrend(memoryMetrics: number[]): 'stable' | 'increasing' | 'decreasing' {
    if (memoryMetrics.length < 3) return 'stable';

    const firstHalf = memoryMetrics.slice(0, Math.floor(memoryMetrics.length / 2));
    const secondHalf = memoryMetrics.slice(Math.floor(memoryMetrics.length / 2));

    const firstAvg = this.calculateAverage(firstHalf);
    const secondAvg = this.calculateAverage(secondHalf);

    const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (percentChange > 10) return 'increasing';
    if (percentChange < -10) return 'decreasing';
    return 'stable';
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private async saveReport(report: PerformanceReport): Promise<void> {
    if (!this.config.reportPath) return;

    await fs.ensureDir(this.config.reportPath);

    // Save JSON report
    const timestamp = Date.now();
    const jsonPath = path.join(this.config.reportPath, `dashboard-${timestamp}.json`);
    await fs.writeJson(jsonPath, report, { spaces: 2 });

    // Generate and save markdown report
    const markdownReport = this.generateMarkdownReport(report);
    const mdPath = path.join(this.config.reportPath, `dashboard-${timestamp}.md`);
    await fs.writeFile(mdPath, markdownReport);

    // Save latest for easy access
    await fs.writeJson(path.join(this.config.reportPath, 'latest-dashboard.json'), report, { spaces: 2 });
    await fs.writeFile(path.join(this.config.reportPath, 'latest-dashboard.md'), markdownReport);
  }

  private generateMarkdownReport(report: PerformanceReport): string {
    let md = '# Performance Dashboard Report\n\n';
    md += `**Generated:** ${new Date(report.timestamp).toLocaleString()}\n`;
    md += `**Period:** ${new Date(report.period.start).toLocaleTimeString()} - ${new Date(report.period.end).toLocaleTimeString()}\n`;
    md += `**Duration:** ${report.period.durationMinutes} minutes\n\n`;

    // Health Status
    const statusIcon = report.health.status === 'healthy' ? '✅' : 
      report.health.status === 'degraded' ? '⚠️' : '❌';
    md += `## Health Status: ${statusIcon} ${report.health.status.toUpperCase()}\n`;
    md += `**Score:** ${report.health.score}/100\n`;
    if (report.health.issues.length > 0) {
      md += '**Issues:**\n';
      report.health.issues.forEach(issue => {
        md += `- ${issue}\n`;
      });
    }
    md += '\n';

    // Response Times
    md += '## Response Times\n';
    md += `- **Total Requests:** ${report.metrics.responseTimes.count}\n`;
    md += `- **Average:** ${report.metrics.responseTimes.average.toFixed(2)}ms\n`;
    md += `- **Median:** ${report.metrics.responseTimes.median.toFixed(2)}ms\n`;
    md += `- **P95:** ${report.metrics.responseTimes.p95.toFixed(2)}ms\n`;
    md += `- **P99:** ${report.metrics.responseTimes.p99.toFixed(2)}ms\n`;
    md += `- **Min:** ${report.metrics.responseTimes.min.toFixed(2)}ms\n`;
    md += `- **Max:** ${report.metrics.responseTimes.max.toFixed(2)}ms\n\n`;

    // Cache Performance
    md += '## Cache Performance\n';
    md += `- **Total Requests:** ${report.metrics.cachePerformance.totalRequests}\n`;
    md += `- **Hits:** ${report.metrics.cachePerformance.hits}\n`;
    md += `- **Misses:** ${report.metrics.cachePerformance.misses}\n`;
    md += `- **Hit Rate:** ${report.metrics.cachePerformance.hitRate.toFixed(2)}%\n\n`;

    // Memory Usage
    md += '## Memory Usage\n';
    md += `- **Current:** ${report.metrics.memory.current.toFixed(2)}MB\n`;
    md += `- **Average:** ${report.metrics.memory.average.toFixed(2)}MB\n`;
    md += `- **Peak:** ${report.metrics.memory.peak.toFixed(2)}MB\n`;
    md += `- **Trend:** ${report.metrics.memory.trend}\n\n`;

    // Errors
    md += '## Errors\n';
    md += `- **Total:** ${report.metrics.errors.total}\n`;
    md += `- **Error Rate:** ${report.metrics.errors.rate.toFixed(2)}%\n`;
    if (Object.keys(report.metrics.errors.byType).length > 0) {
      md += '- **By Type:**\n';
      for (const [type, count] of Object.entries(report.metrics.errors.byType)) {
        md += `  - ${type}: ${count}\n`;
      }
    }
    md += '\n';

    // Alerts
    if (report.alerts.length > 0) {
      md += '## Alerts\n';
      report.alerts.forEach(alert => {
        const icon = alert.severity === 'critical' ? '🚨' : '⚠️';
        md += `- ${icon} **${alert.type}** (${alert.severity}): ${alert.message}\n`;
        md += `  - Time: ${new Date(alert.timestamp).toLocaleTimeString()}\n`;
        md += `  - Value: ${alert.currentValue.toFixed(2)} (threshold: ${alert.threshold})\n`;
      });
    }

    return md;
  }
}

// Export singleton instance
export const performanceDashboard = new PerformanceDashboard();

// Export class for custom instances
export { PerformanceDashboard, PerformanceMetric, PerformanceAlert, PerformanceReport, DashboardConfig };