/**
 * TraceCollector - Comprehensive trace analysis and performance monitoring
 * 
 * Central service for:
 * - Trace collection and storage
 * - Performance analysis and bottleneck detection
 * - Error correlation and pattern analysis
 * - Service health insights and recommendations
 * - Timeline generation and visualization data
 * 
 * Agent 6: Distributed Tracing Implementation Specialist
 */

import { logger } from '../../utils/logger';
import { RequestContext, TraceData, TraceSpan } from '../../utils/tracing/RequestContext';
import { TraceSummary, TracePerformance, TraceError } from '../../types';

export interface TraceAnalysis {
  traceId: string;
  summary: {
    totalDuration: number;
    spanCount: number;
    errorCount: number;
    slowOperationCount: number;
    maxDepth: number;
    operationTypes: Record<string, number>;
  };
  performance: {
    slowestOperation: {
      operationName: string;
      duration: number;
      spanId: string;
    } | null;
    averageDuration: number;
    percentiles: {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
    };
    memoryUsage?: {
      peakMemoryMB: number;
      memoryDeltaMB: number;
      memoryEfficiency: 'good' | 'concerning' | 'poor';
    };
  };
  errors: Array<{
    spanId: string;
    operationName: string;
    errorType: string;
    errorMessage: string;
    duration: number;
    tags: Record<string, string | number | boolean>;
  }>;
  timeline: Array<{
    operation: string;
    start: number;
    duration: number;
    status: string;
    depth: number;
    spanId: string;
  }>;
  insights: string[];
  recommendations: string[];
}

export interface PerformanceMetrics {
  avgResponseTime: number;
  errorRate: number;
  throughput: number;
  slowOperationThreshold: number;
  commonBottlenecks: Array<{
    operation: string;
    avgDuration: number;
    occurrences: number;
  }>;
}

export interface ServiceHealthInsight {
  serviceName: string;
  operationCount: number;
  avgDuration: number;
  errorRate: number;
  slowOperationCount: number;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: string[];
}

export class TraceCollector {
  private traces = new Map<string, TraceData>();
  private readonly MAX_TRACES = 2000;
  private readonly TRACE_TTL = 7200000; // 2 hours
  private readonly SLOW_OPERATION_THRESHOLD = 1000; // 1 second
  private readonly VERY_SLOW_OPERATION_THRESHOLD = 5000; // 5 seconds
  private readonly MAX_DEPTH_WARNING = 15;
  private readonly MAX_DEPTH_CRITICAL = 25;
  
  private performanceHistory: Array<{
    timestamp: number;
    metrics: PerformanceMetrics;
  }> = [];
  
  constructor() {
    // Cleanup old traces periodically
    setInterval(() => {
      this.cleanupOldTraces();
    }, 300000); // Every 5 minutes
  }
  
  /**
   * Collect and analyze a completed trace
   */
  collectTrace(context: RequestContext): TraceAnalysis {
    const trace = context.finalize();
    
    // Store trace
    this.traces.set(trace.traceId, trace);
    
    // Analyze trace
    const analysis = this.analyzeTrace(trace);
    
    // Update performance metrics
    this.updatePerformanceMetrics(analysis);
    
    // Log insights
    this.logInsights(analysis);
    
    // Cleanup if needed
    if (this.traces.size > this.MAX_TRACES) {
      this.cleanupOldTraces();
    }
    
    return analysis;
  }
  
  /**
   * Comprehensive trace analysis
   */
  private analyzeTrace(trace: TraceData): TraceAnalysis {
    const spans = trace.spans;
    const validSpans = spans.filter(s => s.duration !== undefined);
    
    // Basic summary
    const summary = {
      totalDuration: trace.duration,
      spanCount: spans.length,
      errorCount: spans.filter(s => s.status === 'error').length,
      slowOperationCount: validSpans.filter(s => s.duration! > this.SLOW_OPERATION_THRESHOLD).length,
      maxDepth: this.calculateMaxDepth(spans),
      operationTypes: this.categorizeOperations(spans)
    };
    
    // Performance analysis
    const durations = validSpans.map(s => s.duration!).sort((a, b) => a - b);
    const performance = {
      slowestOperation: this.findSlowestOperation(validSpans),
      averageDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      percentiles: this.calculatePercentiles(durations),
      memoryUsage: this.analyzeMemoryUsage(spans)
    };
    
    // Error analysis
    const errors = spans
      .filter(s => s.status === 'error')
      .map(s => ({
        spanId: s.spanId,
        operationName: s.operationName,
        errorType: s.error?.name || 'Unknown',
        errorMessage: s.error?.message || 'Unknown error',
        duration: s.duration || 0,
        tags: s.tags
      }));
    
    // Timeline generation
    const timeline = this.generateTimeline(spans);
    
    // Generate insights and recommendations
    const insights = this.generateInsights(summary, performance, errors);
    const recommendations = this.generateRecommendations(summary, performance, errors);
    
    return {
      traceId: trace.traceId,
      summary,
      performance,
      errors,
      timeline,
      insights,
      recommendations
    };
  }
  
  private calculateMaxDepth(spans: TraceSpan[]): number {
    const spanMap = new Map(spans.map(s => [s.spanId, s]));
    let maxDepth = 0;
    
    for (const span of spans) {
      let depth = 0;
      let current = span;
      const visited = new Set<string>();
      
      while (current.parentSpanId && spanMap.has(current.parentSpanId)) {
        if (visited.has(current.spanId)) {
          // Circular reference detected
          logger.warn('Circular span reference detected', {
            spanId: current.spanId,
            parentSpanId: current.parentSpanId
          });
          break;
        }
        
        visited.add(current.spanId);
        depth++;
        current = spanMap.get(current.parentSpanId)!;
        
        if (depth > 100) {
          // Safety break for infinite loops
          logger.error('Excessive span depth detected, breaking loop', {
            spanId: span.spanId,
            depth
          });
          break;
        }
      }
      
      maxDepth = Math.max(maxDepth, depth);
    }
    
    return maxDepth;
  }
  
  private categorizeOperations(spans: TraceSpan[]): Record<string, number> {
    const categories: Record<string, number> = {};
    
    for (const span of spans) {
      const category = this.categorizeOperation(span.operationName);
      categories[category] = (categories[category] || 0) + 1;
    }
    
    return categories;
  }
  
  private categorizeOperation(operationName: string): string {
    const lower = operationName.toLowerCase();
    
    if (lower.includes('gemini') || lower.includes('ai') || lower.includes('generate')) {
      return 'AI_Generation';
    }
    if (lower.includes('discord') || lower.includes('message') || lower.includes('channel')) {
      return 'Discord_API';
    }
    if (lower.includes('cache') || lower.includes('memory')) {
      return 'Caching';
    }
    if (lower.includes('context') || lower.includes('conversation')) {
      return 'Context_Management';
    }
    if (lower.includes('health') || lower.includes('monitor')) {
      return 'Health_Monitoring';
    }
    if (lower.includes('analytics') || lower.includes('behavior')) {
      return 'Analytics';
    }
    if (lower.includes('config') || lower.includes('preference')) {
      return 'Configuration';
    }
    
    return 'Other';
  }
  
  private findSlowestOperation(spans: TraceSpan[]): { operationName: string; duration: number; spanId: string } | null {
    if (spans.length === 0) return null;
    
    const slowest = spans.reduce((prev, current) =>
      (current.duration || 0) > (prev.duration || 0) ? current : prev
    );
    
    return {
      operationName: slowest.operationName,
      duration: slowest.duration || 0,
      spanId: slowest.spanId
    };
  }
  
  private calculatePercentiles(durations: number[]): { p50: number; p90: number; p95: number; p99: number } {
    if (durations.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }
    
    const getPercentile = (arr: number[], percentile: number): number => {
      const index = Math.ceil((percentile / 100) * arr.length) - 1;
      return arr[Math.max(0, Math.min(index, arr.length - 1))];
    };
    
    return {
      p50: getPercentile(durations, 50),
      p90: getPercentile(durations, 90),
      p95: getPercentile(durations, 95),
      p99: getPercentile(durations, 99)
    };
  }
  
  private analyzeMemoryUsage(spans: TraceSpan[]): {
    peakMemoryMB: number;
    memoryDeltaMB: number;
    memoryEfficiency: 'good' | 'concerning' | 'poor';
  } | undefined {
    const memorySpans = spans.filter(s =>
      s.tags.startMemoryMB !== undefined && s.tags.endMemoryMB !== undefined
    );
    
    if (memorySpans.length === 0) return undefined;
    
    const peakMemoryMB = Math.max(...memorySpans.map(s => s.tags.endMemoryMB));
    const totalDelta = memorySpans.reduce((sum, s) => sum + (s.tags.memoryDeltaMB || 0), 0);
    
    let efficiency: 'good' | 'concerning' | 'poor' = 'good';
    if (totalDelta > 100) efficiency = 'concerning';
    if (totalDelta > 500) efficiency = 'poor';
    
    return {
      peakMemoryMB,
      memoryDeltaMB: totalDelta,
      memoryEfficiency: efficiency
    };
  }
  
  private generateTimeline(spans: TraceSpan[]): Array<{
    operation: string;
    start: number;
    duration: number;
    status: string;
    depth: number;
    spanId: string;
  }> {
    const spanMap = new Map(spans.map(s => [s.spanId, s]));
    const minStartTime = Math.min(...spans.map(s => s.startTime));
    
    return spans
      .sort((a, b) => a.startTime - b.startTime)
      .map(span => ({
        operation: span.operationName,
        start: span.startTime - minStartTime,
        duration: span.duration || 0,
        status: span.status,
        depth: this.calculateSpanDepth(span, spanMap),
        spanId: span.spanId
      }));
  }
  
  private calculateSpanDepth(span: TraceSpan, spanMap: Map<string, TraceSpan>): number {
    let depth = 0;
    let current = span;
    const visited = new Set<string>();
    
    while (current.parentSpanId && spanMap.has(current.parentSpanId)) {
      if (visited.has(current.spanId)) break;
      visited.add(current.spanId);
      depth++;
      current = spanMap.get(current.parentSpanId)!;
      if (depth > 50) break; // Safety limit
    }
    
    return depth;
  }
  
  private generateInsights(
    summary: TraceAnalysis['summary'],
    performance: TraceAnalysis['performance'],
    errors: TraceAnalysis['errors']
  ): string[] {
    const insights: string[] = [];
    
    // Performance insights
    if (performance.slowestOperation && performance.slowestOperation.duration > this.VERY_SLOW_OPERATION_THRESHOLD) {
      insights.push(`Critical bottleneck detected: ${performance.slowestOperation.operationName} took ${performance.slowestOperation.duration}ms`);
    }
    
    if (summary.slowOperationCount > summary.spanCount * 0.3) {
      insights.push(`High number of slow operations: ${summary.slowOperationCount}/${summary.spanCount} spans exceeded ${this.SLOW_OPERATION_THRESHOLD}ms`);
    }
    
    // Error insights
    if (errors.length > 0) {
      const errorTypes = errors.reduce((acc, error) => {
        acc[error.errorType] = (acc[error.errorType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const mostCommonError = Object.entries(errorTypes).sort(([,a], [,b]) => (b as number) - (a as number))[0];
      insights.push(`Most common error: ${mostCommonError[0]} (${mostCommonError[1]} occurrences)`);
    }
    
    // Depth insights
    if (summary.maxDepth > this.MAX_DEPTH_CRITICAL) {
      insights.push(`Critical: Excessive call depth detected (${summary.maxDepth} levels) - possible infinite recursion`);
    } else if (summary.maxDepth > this.MAX_DEPTH_WARNING) {
      insights.push(`Warning: Deep call stack detected (${summary.maxDepth} levels) - consider refactoring`);
    }
    
    // Memory insights
    if (performance.memoryUsage?.memoryEfficiency === 'poor') {
      insights.push(`Poor memory efficiency: ${performance.memoryUsage.memoryDeltaMB}MB memory growth detected`);
    }
    
    // Operation type insights
    const operationEntries = Object.entries(summary.operationTypes).sort(([,a], [,b]) => (b as number) - (a as number));
    if (operationEntries.length > 0) {
      const [mostCommonOp, count] = operationEntries[0];
      insights.push(`Most active operation category: ${mostCommonOp} (${count} operations)`);
    }
    
    return insights;
  }
  
  private generateRecommendations(
    summary: TraceAnalysis['summary'],
    performance: TraceAnalysis['performance'],
    errors: TraceAnalysis['errors']
  ): string[] {
    const recommendations: string[] = [];
    
    // Performance recommendations
    if (performance.slowestOperation && performance.slowestOperation.duration > this.SLOW_OPERATION_THRESHOLD) {
      recommendations.push(`Optimize ${performance.slowestOperation.operationName} - consider caching, parallelization, or algorithm improvements`);
    }
    
    if (performance.percentiles.p95 > this.SLOW_OPERATION_THRESHOLD) {
      recommendations.push('95th percentile response time is concerning - investigate consistent performance bottlenecks');
    }
    
    // Error recommendations
    if (errors.length > 0) {
      recommendations.push('Add comprehensive error handling and fallback mechanisms for failing operations');
      
      if (errors.some(e => e.errorType === 'TimeoutError')) {
        recommendations.push('Consider implementing circuit breaker pattern for timeout-prone operations');
      }
    }
    
    // Depth recommendations
    if (summary.maxDepth > this.MAX_DEPTH_WARNING) {
      recommendations.push('Refactor deeply nested operations to use iterative approaches instead of recursion');
    }
    
    // Memory recommendations
    if (performance.memoryUsage?.memoryEfficiency === 'poor') {
      recommendations.push('Investigate memory leaks and implement proper cleanup in long-running operations');
    }
    
    // General recommendations
    if (summary.spanCount > 50) {
      recommendations.push('Consider consolidating operations to reduce tracing overhead in complex workflows');
    }
    
    return recommendations;
  }
  
  private updatePerformanceMetrics(analysis: TraceAnalysis): void {
    const metrics: PerformanceMetrics = {
      avgResponseTime: analysis.performance.averageDuration,
      errorRate: analysis.summary.errorCount / analysis.summary.spanCount,
      throughput: 1000 / analysis.performance.averageDuration, // operations per second
      slowOperationThreshold: this.SLOW_OPERATION_THRESHOLD,
      commonBottlenecks: [] // Will be populated from historical data
    };
    
    this.performanceHistory.push({
      timestamp: Date.now(),
      metrics
    });
    
    // Keep only last 100 entries
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
  }
  
  private logInsights(analysis: TraceAnalysis): void {
    if (analysis.insights.length > 0) {
      logger.info('Trace analysis insights', {
        traceId: analysis.traceId,
        insights: analysis.insights,
        performance: analysis.performance,
        errorCount: analysis.summary.errorCount
      });
    }
    
    if (analysis.errors.length > 0) {
      logger.warn('Errors detected in trace', {
        traceId: analysis.traceId,
        errors: analysis.errors.map(e => ({
          operation: e.operationName,
          error: e.errorType,
          message: e.errorMessage
        }))
      });
    }
  }
  
  /**
   * Get trace analysis by ID
   */
  getTraceAnalysis(traceId: string): TraceAnalysis | null {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    
    return this.analyzeTrace(trace);
  }
  
  /**
   * Get performance overview across all recent traces
   */
  getPerformanceOverview(): {
    recentMetrics: PerformanceMetrics[];
    serviceHealth: ServiceHealthInsight[];
    trends: {
      avgResponseTimeTrend: 'improving' | 'stable' | 'degrading';
      errorRateTrend: 'improving' | 'stable' | 'degrading';
    };
  } {
    const recentMetrics = this.performanceHistory.slice(-10).map(h => h.metrics);
    const serviceHealth = this.generateServiceHealthInsights();
    const trends = this.calculateTrends();
    
    return {
      recentMetrics,
      serviceHealth,
      trends
    };
  }
  
  private generateServiceHealthInsights(): ServiceHealthInsight[] {
    const serviceStats = new Map<string, {
      operations: TraceSpan[];
      errors: number;
    }>();
    
    // Aggregate data from recent traces
    for (const trace of Array.from(this.traces.values()).slice(-50)) {
      for (const span of trace.spans) {
        const serviceName = this.extractServiceName(span.operationName);
        
        if (!serviceStats.has(serviceName)) {
          serviceStats.set(serviceName, { operations: [], errors: 0 });
        }
        
        const stats = serviceStats.get(serviceName)!;
        stats.operations.push(span);
        if (span.status === 'error') {
          stats.errors++;
        }
      }
    }
    
    return Array.from(serviceStats.entries()).map(([serviceName, stats]) => {
      const avgDuration = stats.operations.length > 0
        ? stats.operations.reduce((sum, span) => sum + (span.duration || 0), 0) / stats.operations.length
        : 0;
      
      const errorRate = stats.operations.length > 0 ? stats.errors / stats.operations.length : 0;
      const slowOperationCount = stats.operations.filter(s => (s.duration || 0) > this.SLOW_OPERATION_THRESHOLD).length;
      
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      const issues: string[] = [];
      const recommendations: string[] = [];
      
      if (errorRate > 0.1) {
        status = 'warning';
        issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
        recommendations.push('Implement better error handling and monitoring');
      }
      
      if (errorRate > 0.2) {
        status = 'critical';
      }
      
      if (avgDuration > this.SLOW_OPERATION_THRESHOLD) {
        if (status === 'healthy') status = 'warning';
        issues.push(`Slow average response time: ${avgDuration.toFixed(0)}ms`);
        recommendations.push('Optimize performance-critical operations');
      }
      
      if (slowOperationCount > stats.operations.length * 0.3) {
        if (status === 'healthy') status = 'warning';
        issues.push(`Many slow operations: ${slowOperationCount}/${stats.operations.length}`);
      }
      
      return {
        serviceName,
        operationCount: stats.operations.length,
        avgDuration,
        errorRate,
        slowOperationCount,
        status,
        issues,
        recommendations
      };
    });
  }
  
  private extractServiceName(operationName: string): string {
    // First try dot notation (preferred format)
    const dotParts = operationName.split('.');
    if (dotParts.length > 1) {
      return dotParts[0];
    }
    
    // Map common operation patterns to service names
    const servicePatterns: Record<string, string> = {
      'tracing': 'System',
      'discord': 'Discord',
      'gemini': 'Gemini',
      'configuration': 'Configuration',
      'health': 'HealthMonitor',
      'analytics': 'Analytics',
      'cache': 'Cache',
      'conversation': 'ConversationManager',
      'rate': 'RateLimiter',
      'message': 'Discord',
      'command': 'Discord',
      'root': 'System',
      'initialization': 'System',
      'performance': 'System'
    };
    
    // Check if operation name contains any known service keywords
    const lowerOp = operationName.toLowerCase();
    for (const [pattern, service] of Object.entries(servicePatterns)) {
      if (lowerOp.includes(pattern)) {
        return service;
      }
    }
    
    // Default to General instead of Unknown for better categorization
    return 'General';
  }
  
  private calculateTrends(): {
    avgResponseTimeTrend: 'improving' | 'stable' | 'degrading';
    errorRateTrend: 'improving' | 'stable' | 'degrading';
  } {
    if (this.performanceHistory.length < 5) {
      return {
        avgResponseTimeTrend: 'stable',
        errorRateTrend: 'stable'
      };
    }
    
    const recent = this.performanceHistory.slice(-5);
    const earlier = this.performanceHistory.slice(-10, -5);
    
    const recentAvgResponseTime = recent.reduce((sum, h) => sum + h.metrics.avgResponseTime, 0) / recent.length;
    const earlierAvgResponseTime = earlier.length > 0
      ? earlier.reduce((sum, h) => sum + h.metrics.avgResponseTime, 0) / earlier.length
      : recentAvgResponseTime;
    
    const recentErrorRate = recent.reduce((sum, h) => sum + h.metrics.errorRate, 0) / recent.length;
    const earlierErrorRate = earlier.length > 0
      ? earlier.reduce((sum, h) => sum + h.metrics.errorRate, 0) / earlier.length
      : recentErrorRate;
    
    const responseTimeTrend = recentAvgResponseTime < earlierAvgResponseTime * 0.9 ? 'improving' :
                             recentAvgResponseTime > earlierAvgResponseTime * 1.1 ? 'degrading' : 'stable';
    
    const errorRateTrend = recentErrorRate < earlierErrorRate * 0.8 ? 'improving' :
                          recentErrorRate > earlierErrorRate * 1.2 ? 'degrading' : 'stable';
    
    return {
      avgResponseTimeTrend: responseTimeTrend,
      errorRateTrend: errorRateTrend
    };
  }
  
  private cleanupOldTraces(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [traceId, trace] of this.traces.entries()) {
      if (now - trace.spans[0]?.startTime > this.TRACE_TTL) {
        toDelete.push(traceId);
      }
    }
    
    for (const traceId of toDelete) {
      this.traces.delete(traceId);
    }
    
    if (toDelete.length > 0) {
      logger.debug('Cleaned up old traces', {
        deletedCount: toDelete.length,
        remainingCount: this.traces.size
      });
    }
  }
  
  /**
   * Get current trace storage stats
   */
  getStats(): {
    totalTraces: number;
    totalSpans: number;
    avgSpansPerTrace: number;
    memoryUsageMB: number;
  } {
    const totalSpans = Array.from(this.traces.values()).reduce((sum, trace) => sum + trace.spans.length, 0);
    const avgSpansPerTrace = this.traces.size > 0 ? totalSpans / this.traces.size : 0;
    const memoryUsageMB = Math.round(JSON.stringify(Array.from(this.traces.values())).length / 1024 / 1024);
    
    return {
      totalTraces: this.traces.size,
      totalSpans,
      avgSpansPerTrace: Math.round(avgSpansPerTrace * 100) / 100,
      memoryUsageMB
    };
  }
}