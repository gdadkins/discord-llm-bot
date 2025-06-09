# Monitoring Guide

This guide provides comprehensive monitoring strategies, metrics collection procedures, and troubleshooting protocols for the Discord LLM Bot.

## Table of Contents

1. [Overview](#overview)
2. [Monitoring Architecture](#monitoring-architecture)
3. [Key Metrics](#key-metrics)
4. [Health Monitoring System](#health-monitoring-system)
5. [Performance Monitoring](#performance-monitoring)
6. [Error Detection and Alerting](#error-detection-and-alerting)
7. [Troubleshooting Procedures](#troubleshooting-procedures)
8. [Dashboard Configuration](#dashboard-configuration)
9. [Log Management](#log-management)
10. [Capacity Planning](#capacity-planning)

## Overview

The Discord LLM Bot includes a comprehensive monitoring system designed to provide real-time visibility into system health, performance, and operational status.

### Monitoring Objectives

- **Proactive Issue Detection**: Identify problems before they impact users
- **Performance Optimization**: Track metrics to guide optimization efforts
- **Capacity Planning**: Monitor resource usage trends for scaling decisions
- **Troubleshooting Support**: Provide detailed diagnostic information
- **SLA Compliance**: Ensure service level commitments are met

## Monitoring Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │    │  Health Monitor │    │   Alerting      │
│   Services      │───▶│                 │───▶│   System        │
│                 │    │   • Metrics     │    │                 │
│ • Context Mgr   │    │   • Health      │    │ • Thresholds    │
│ • Cache Mgr     │    │   • Performance │    │ • Notifications │
│ • Rate Limiter  │    │   • Alerts      │    │ • Recovery      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └──────────────▶│   Data Storage  │◀─────────────┘
                        │                 │
                        │ • Metrics DB    │
                        │ • Log Storage   │
                        │ • Health History│
                        └─────────────────┘
```

## Key Metrics

### System Health Metrics

#### Memory Usage
```typescript
interface MemoryMetrics {
  rss: number;           // Resident Set Size
  heapTotal: number;     // V8 heap total
  heapUsed: number;      // V8 heap used
  external: number;      // C++ objects bound to JS
  arrayBuffers: number;  // ArrayBuffer and SharedArrayBuffer
}

// Thresholds (in MB)
const MEMORY_THRESHOLDS = {
  warning: 500,   // 500MB
  critical: 750,  // 750MB
  maximum: 1000   // 1GB
};
```

#### CPU Usage
```typescript
interface CPUMetrics {
  userTime: number;      // User CPU time (ms)
  systemTime: number;    // System CPU time (ms)
  utilization: number;   // CPU utilization percentage
  eventLoopLag: number;  // Event loop lag (ms)
}

// Thresholds
const CPU_THRESHOLDS = {
  warning: 70,    // 70% utilization
  critical: 85,   // 85% utilization
  eventLoopLag: 50 // 50ms lag
};
```

#### Response Time Metrics
```typescript
interface ResponseTimeMetrics {
  p50: number;    // 50th percentile (median)
  p95: number;    // 95th percentile
  p99: number;    // 99th percentile
  p999: number;   // 99.9th percentile
  min: number;    // Minimum response time
  max: number;    // Maximum response time
  avg: number;    // Average response time
}

// SLA Targets
const RESPONSE_TIME_TARGETS = {
  p50: 500,   // 500ms
  p95: 2000,  // 2 seconds
  p99: 5000   // 5 seconds
};
```

### Service-Specific Metrics

#### Rate Limiter Metrics
```typescript
interface RateLimiterMetrics {
  requestsThisMinute: number;
  requestsToday: number;
  minuteRemaining: number;
  dailyRemaining: number;
  avgLatency: number;
  errorCount: number;
  windowResets: number;
}
```

#### Cache Manager Metrics
```typescript
interface CacheMetrics {
  hitRate: number;         // Percentage
  missRate: number;        // Percentage
  evictionRate: number;    // Evictions per hour
  memoryUsage: number;     // Bytes
  cacheSize: number;       // Entry count
  avgLookupTime: number;   // Milliseconds
}
```

#### Context Manager Metrics
```typescript
interface ContextMetrics {
  totalServers: number;
  totalMemoryUsage: number;
  averageServerSize: number;
  largestServerSize: number;
  compressionRatio: number;
  duplicatesRemoved: number;
  summarizationEvents: number;
}
```

## Health Monitoring System

### Health Check Configuration

```typescript
// Health monitor configuration
const HEALTH_CONFIG = {
  collectionInterval: 30000,    // 30 seconds
  retentionDays: 7,            // 7 days of data
  cleanupInterval: 300000,     // 5 minutes
  maxSnapshots: 20160,         // ~7 days worth
  compressionEnabled: true,
  alertsEnabled: true
};
```

### Health Status Levels

| Status | Description | Criteria |
|--------|-------------|----------|
| **HEALTHY** | All systems operational | All metrics within normal ranges |
| **WARNING** | Minor issues detected | Some metrics approaching thresholds |
| **DEGRADED** | Service impacted | Performance degradation detected |
| **CRITICAL** | Major failure | Service unavailable or severe issues |

### Health Check Implementation

```typescript
class HealthChecker {
  async performHealthCheck(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkMemoryHealth(),
      this.checkCPUHealth(),
      this.checkServiceHealth(),
      this.checkAPIHealth(),
      this.checkDatabaseHealth()
    ]);
    
    return this.aggregateHealthStatus(checks);
  }
  
  private async checkMemoryHealth(): Promise<HealthCheck> {
    const memory = process.memoryUsage();
    const memoryMB = memory.rss / (1024 * 1024);
    
    return {
      name: 'memory',
      status: this.getMemoryStatus(memoryMB),
      value: memoryMB,
      threshold: MEMORY_THRESHOLDS.warning,
      message: `Memory usage: ${memoryMB.toFixed(1)}MB`
    };
  }
  
  private async checkServiceHealth(): Promise<HealthCheck> {
    const services = [
      'rateLimiter',
      'cacheManager', 
      'contextManager',
      'gracefulDegradation'
    ];
    
    const healthyServices = await Promise.all(
      services.map(service => this.pingService(service))
    );
    
    const healthyCount = healthyServices.filter(Boolean).length;
    const healthPercentage = (healthyCount / services.length) * 100;
    
    return {
      name: 'services',
      status: healthPercentage >= 100 ? 'healthy' : 
              healthPercentage >= 75 ? 'warning' : 'critical',
      value: healthPercentage,
      message: `${healthyCount}/${services.length} services healthy`
    };
  }
}
```

### Automated Health Recovery

```typescript
class HealthRecovery {
  async attemptRecovery(issue: HealthIssue): Promise<RecoveryResult> {
    switch (issue.type) {
      case 'high_memory':
        return await this.recoverFromHighMemory();
        
      case 'api_failure':
        return await this.recoverFromAPIFailure(issue.service);
        
      case 'slow_response':
        return await this.recoverFromSlowResponse();
        
      case 'high_error_rate':
        return await this.recoverFromHighErrorRate();
        
      default:
        return { success: false, message: 'No recovery strategy available' };
    }
  }
  
  private async recoverFromHighMemory(): Promise<RecoveryResult> {
    try {
      // Clear caches
      await this.clearNonEssentialCaches();
      
      // Trigger garbage collection
      if (global.gc) {
        global.gc();
      }
      
      // Compress old data
      await this.compressOldData();
      
      return { success: true, message: 'Memory cleaned up successfully' };
    } catch (error) {
      return { success: false, message: `Memory recovery failed: ${error}` };
    }
  }
  
  private async recoverFromAPIFailure(service: string): Promise<RecoveryResult> {
    try {
      // Reset circuit breaker
      await this.resetCircuitBreaker(service);
      
      // Test API connectivity
      const isHealthy = await this.testAPIConnectivity(service);
      
      if (isHealthy) {
        return { success: true, message: `${service} API recovered` };
      } else {
        return { success: false, message: `${service} API still unhealthy` };
      }
    } catch (error) {
      return { success: false, message: `API recovery failed: ${error}` };
    }
  }
}
```

## Performance Monitoring

### Metrics Collection Strategy

```typescript
class MetricsCollector {
  private buffer: CircularBuffer<Metric>;
  private aggregationInterval: number;
  
  constructor() {
    this.buffer = new CircularBuffer<Metric>(1000);
    this.aggregationInterval = 30000; // 30 seconds
    this.startCollection();
  }
  
  private startCollection(): void {
    setInterval(() => {
      this.collectSystemMetrics();
      this.collectServiceMetrics();
      this.collectCustomMetrics();
    }, this.aggregationInterval);
  }
  
  private async collectSystemMetrics(): Promise<void> {
    const systemMetrics = {
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      cpu: await this.getCPUUsage(),
      eventLoop: this.measureEventLoopLag(),
      gc: this.getGCStats()
    };
    
    this.buffer.add(systemMetrics);
  }
  
  private async collectServiceMetrics(): Promise<void> {
    const serviceMetrics = await Promise.all([
      this.rateLimiter.getMetrics(),
      this.cacheManager.getStats(),
      this.contextManager.getMemoryStats(),
      this.healthMonitor.getCurrentMetrics()
    ]);
    
    this.aggregateServiceMetrics(serviceMetrics);
  }
}
```

### Performance Baselines

```typescript
// Performance baseline configuration
const PERFORMANCE_BASELINES = {
  responseTime: {
    excellent: { p95: 500, p99: 1000 },
    good: { p95: 1000, p99: 2000 },
    acceptable: { p95: 2000, p99: 5000 },
    poor: { p95: 5000, p99: 10000 }
  },
  
  throughput: {
    excellent: 200,  // requests per minute
    good: 150,
    acceptable: 100,
    poor: 50
  },
  
  errorRate: {
    excellent: 0.1,  // percentage
    good: 0.5,
    acceptable: 1.0,
    poor: 5.0
  },
  
  cacheHitRate: {
    excellent: 95,   // percentage
    good: 85,
    acceptable: 75,
    poor: 60
  }
};
```

### Performance Trend Analysis

```typescript
class PerformanceTrendAnalyzer {
  analyzeResponseTimeTrend(metrics: ResponseTimeMetric[]): TrendAnalysis {
    const timeWindows = this.createTimeWindows(metrics, '1h');
    const trends = timeWindows.map(window => ({
      timestamp: window.start,
      p95: this.calculatePercentile(window.values, 0.95),
      trend: this.calculateTrend(window.values)
    }));
    
    return {
      overall: this.calculateOverallTrend(trends),
      degradation: this.detectDegradation(trends),
      improvement: this.detectImprovement(trends),
      anomalies: this.detectAnomalies(trends)
    };
  }
  
  private detectDegradation(trends: TrendPoint[]): Degradation[] {
    const degradations: Degradation[] = [];
    
    for (let i = 1; i < trends.length; i++) {
      const current = trends[i];
      const previous = trends[i - 1];
      
      const percentageIncrease = ((current.p95 - previous.p95) / previous.p95) * 100;
      
      if (percentageIncrease > 25) { // 25% increase threshold
        degradations.push({
          timestamp: current.timestamp,
          severity: percentageIncrease > 50 ? 'critical' : 'warning',
          change: percentageIncrease,
          metric: 'response_time_p95'
        });
      }
    }
    
    return degradations;
  }
}
```

## Error Detection and Alerting

### Error Classification

```typescript
enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface ErrorPattern {
  type: string;
  pattern: RegExp;
  severity: ErrorSeverity;
  threshold: number;
  timeWindow: number;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    type: 'rate_limit_exceeded',
    pattern: /rate.*limit.*exceeded/i,
    severity: ErrorSeverity.HIGH,
    threshold: 5,     // 5 occurrences
    timeWindow: 300   // in 5 minutes
  },
  {
    type: 'api_timeout',
    pattern: /timeout|timed out/i,
    severity: ErrorSeverity.MEDIUM,
    threshold: 3,
    timeWindow: 180
  },
  {
    type: 'memory_error',
    pattern: /out of memory|heap.*limit/i,
    severity: ErrorSeverity.CRITICAL,
    threshold: 1,
    timeWindow: 60
  }
];
```

### Alert Configuration

```typescript
interface AlertRule {
  name: string;
  condition: string;
  threshold: number;
  severity: AlertSeverity;
  cooldown: number;
  escalation: EscalationRule[];
}

const ALERT_RULES: AlertRule[] = [
  {
    name: 'high_memory_usage',
    condition: 'memory.rss > threshold',
    threshold: 500 * 1024 * 1024, // 500MB
    severity: AlertSeverity.WARNING,
    cooldown: 300000, // 5 minutes
    escalation: [
      { after: 600, severity: AlertSeverity.CRITICAL },
      { after: 1800, action: 'restart_service' }
    ]
  },
  {
    name: 'api_error_rate',
    condition: 'error_rate > threshold',
    threshold: 5.0, // 5%
    severity: AlertSeverity.HIGH,
    cooldown: 180000, // 3 minutes
    escalation: [
      { after: 300, action: 'enable_circuit_breaker' },
      { after: 900, action: 'activate_maintenance_mode' }
    ]
  },
  {
    name: 'slow_response_time',
    condition: 'response_time.p95 > threshold',
    threshold: 5000, // 5 seconds
    severity: AlertSeverity.MEDIUM,
    cooldown: 600000, // 10 minutes
    escalation: [
      { after: 1200, severity: AlertSeverity.HIGH },
      { after: 3600, action: 'scale_up_resources' }
    ]
  }
];
```

### Alert Notification System

```typescript
class AlertNotificationSystem {
  private channels: NotificationChannel[];
  
  async sendAlert(alert: Alert): Promise<void> {
    const formattedAlert = this.formatAlert(alert);
    
    // Send to appropriate channels based on severity
    const targetChannels = this.selectChannels(alert.severity);
    
    await Promise.all(
      targetChannels.map(channel => this.sendToChannel(channel, formattedAlert))
    );
    
    // Log alert for audit trail
    this.logAlert(alert);
  }
  
  private formatAlert(alert: Alert): FormattedAlert {
    return {
      title: `🚨 ${alert.severity.toUpperCase()}: ${alert.name}`,
      description: alert.message,
      fields: [
        { name: 'Service', value: alert.service },
        { name: 'Metric', value: alert.metric },
        { name: 'Current Value', value: alert.currentValue.toString() },
        { name: 'Threshold', value: alert.threshold.toString() },
        { name: 'Time', value: new Date(alert.timestamp).toISOString() }
      ],
      color: this.getSeverityColor(alert.severity),
      timestamp: alert.timestamp
    };
  }
  
  private selectChannels(severity: AlertSeverity): NotificationChannel[] {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return this.channels.filter(c => c.types.includes('critical'));
      case AlertSeverity.HIGH:
        return this.channels.filter(c => c.types.includes('high'));
      default:
        return this.channels.filter(c => c.types.includes('general'));
    }
  }
}
```

## Troubleshooting Procedures

### Diagnostic Runbooks

#### High Memory Usage

```typescript
class MemoryTroubleshooter {
  async diagnoseHighMemory(): Promise<DiagnosticReport> {
    const steps: DiagnosticStep[] = [];
    
    // Step 1: Check current memory usage
    const memoryUsage = process.memoryUsage();
    steps.push({
      name: 'check_memory_usage',
      status: 'completed',
      result: memoryUsage,
      action: 'baseline_established'
    });
    
    // Step 2: Identify largest consumers
    const memoryConsumers = await this.identifyMemoryConsumers();
    steps.push({
      name: 'identify_consumers',
      status: 'completed',
      result: memoryConsumers,
      action: memoryConsumers.largest.size > 100 * 1024 * 1024 ? 'investigate_consumer' : 'continue'
    });
    
    // Step 3: Check for memory leaks
    const leakDetection = await this.detectMemoryLeaks();
    steps.push({
      name: 'detect_leaks',
      status: 'completed',
      result: leakDetection,
      action: leakDetection.suspectedLeaks.length > 0 ? 'fix_leaks' : 'continue'
    });
    
    // Step 4: Apply immediate mitigation
    const mitigation = await this.applyMemoryMitigation();
    steps.push({
      name: 'apply_mitigation',
      status: mitigation.success ? 'completed' : 'failed',
      result: mitigation,
      action: mitigation.success ? 'monitor' : 'escalate'
    });
    
    return {
      issue: 'high_memory_usage',
      severity: this.calculateSeverity(memoryUsage),
      steps,
      recommendations: this.generateRecommendations(steps),
      nextSteps: this.determineNextSteps(steps)
    };
  }
  
  private async identifyMemoryConsumers(): Promise<MemoryConsumerReport> {
    const consumers = [
      { name: 'context_manager', size: await this.getContextManagerMemory() },
      { name: 'cache_manager', size: await this.getCacheManagerMemory() },
      { name: 'health_monitor', size: await this.getHealthMonitorMemory() },
      { name: 'rate_limiter', size: await this.getRateLimiterMemory() }
    ];
    
    const sorted = consumers.sort((a, b) => b.size - a.size);
    
    return {
      consumers: sorted,
      largest: sorted[0],
      total: sorted.reduce((sum, c) => sum + c.size, 0)
    };
  }
}
```

#### Slow Response Times

```typescript
class ResponseTimeTroubleshooter {
  async diagnoseSlowResponses(): Promise<DiagnosticReport> {
    const steps: DiagnosticStep[] = [];
    
    // Step 1: Measure current performance
    const perfBaseline = await this.measurePerformanceBaseline();
    steps.push({
      name: 'performance_baseline',
      status: 'completed',
      result: perfBaseline
    });
    
    // Step 2: Check bottlenecks
    const bottlenecks = await this.identifyBottlenecks();
    steps.push({
      name: 'identify_bottlenecks',
      status: 'completed',
      result: bottlenecks
    });
    
    // Step 3: Analyze cache performance
    const cacheAnalysis = await this.analyzeCachePerformance();
    steps.push({
      name: 'cache_analysis',
      status: 'completed',
      result: cacheAnalysis
    });
    
    // Step 4: Check external dependencies
    const externalCheck = await this.checkExternalDependencies();
    steps.push({
      name: 'external_dependencies',
      status: 'completed',
      result: externalCheck
    });
    
    return {
      issue: 'slow_response_times',
      severity: this.calculateResponseTimeSeverity(perfBaseline),
      steps,
      recommendations: this.generatePerformanceRecommendations(steps)
    };
  }
  
  private async identifyBottlenecks(): Promise<BottleneckReport> {
    const bottlenecks: Bottleneck[] = [];
    
    // Check each service for performance issues
    const services = ['contextManager', 'cacheManager', 'rateLimiter', 'geminiService'];
    
    for (const service of services) {
      const servicePerf = await this.measureServicePerformance(service);
      
      if (servicePerf.avgResponseTime > servicePerf.baseline * 2) {
        bottlenecks.push({
          service,
          issue: 'high_latency',
          impact: servicePerf.avgResponseTime - servicePerf.baseline,
          severity: servicePerf.avgResponseTime > servicePerf.baseline * 5 ? 'critical' : 'high'
        });
      }
    }
    
    return {
      bottlenecks,
      primaryBottleneck: bottlenecks.sort((a, b) => b.impact - a.impact)[0],
      totalImpact: bottlenecks.reduce((sum, b) => sum + b.impact, 0)
    };
  }
}
```

### Root Cause Analysis

```typescript
class RootCauseAnalyzer {
  async analyzeIssue(issue: SystemIssue): Promise<RootCauseAnalysis> {
    const timeline = await this.buildIssueTimeline(issue);
    const correlations = await this.findCorrelations(issue, timeline);
    const patterns = await this.identifyPatterns(issue);
    
    return {
      issue,
      timeline,
      correlations,
      patterns,
      rootCause: this.determineRootCause(correlations, patterns),
      confidence: this.calculateConfidence(correlations, patterns),
      recommendations: this.generateRecommendations(issue, correlations)
    };
  }
  
  private async findCorrelations(issue: SystemIssue, timeline: Timeline): Promise<Correlation[]> {
    const correlations: Correlation[] = [];
    
    // Check for metric correlations
    for (const metric of ['memory', 'cpu', 'responseTime', 'errorRate']) {
      const correlation = await this.calculateCorrelation(
        issue.metricData[metric],
        timeline.events
      );
      
      if (Math.abs(correlation.coefficient) > 0.7) {
        correlations.push({
          metric,
          coefficient: correlation.coefficient,
          significance: correlation.pValue < 0.05 ? 'significant' : 'not_significant',
          events: correlation.correlatedEvents
        });
      }
    }
    
    return correlations.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
  }
}
```

## Dashboard Configuration

### Key Performance Indicators (KPIs)

```typescript
const DASHBOARD_CONFIG = {
  kpis: [
    {
      name: 'System Health',
      type: 'status',
      metric: 'overall_health',
      thresholds: {
        healthy: 'green',
        warning: 'yellow', 
        critical: 'red'
      }
    },
    {
      name: 'Response Time (P95)',
      type: 'gauge',
      metric: 'response_time.p95',
      unit: 'ms',
      target: 2000,
      thresholds: {
        excellent: { max: 500, color: 'green' },
        good: { max: 1000, color: 'blue' },
        acceptable: { max: 2000, color: 'yellow' },
        poor: { min: 2000, color: 'red' }
      }
    },
    {
      name: 'Memory Usage',
      type: 'gauge', 
      metric: 'memory.rss',
      unit: 'MB',
      max: 1000,
      thresholds: {
        normal: { max: 500, color: 'green' },
        warning: { max: 750, color: 'yellow' },
        critical: { min: 750, color: 'red' }
      }
    },
    {
      name: 'Cache Hit Rate',
      type: 'percentage',
      metric: 'cache.hitRate',
      target: 80,
      thresholds: {
        excellent: { min: 90, color: 'green' },
        good: { min: 80, color: 'blue' },
        poor: { max: 70, color: 'red' }
      }
    }
  ],
  
  charts: [
    {
      name: 'Response Time Trend',
      type: 'line',
      metrics: ['response_time.p50', 'response_time.p95', 'response_time.p99'],
      timeRange: '24h',
      refreshInterval: 30
    },
    {
      name: 'Memory Usage Over Time',
      type: 'area',
      metrics: ['memory.heapUsed', 'memory.rss'],
      timeRange: '6h',
      refreshInterval: 30
    },
    {
      name: 'Request Volume',
      type: 'bar',
      metric: 'requests_per_minute',
      timeRange: '1h',
      refreshInterval: 60
    }
  ]
};
```

### Dashboard Implementation

```typescript
class DashboardService {
  async generateDashboard(): Promise<Dashboard> {
    const currentMetrics = await this.getCurrentMetrics();
    const historicalData = await this.getHistoricalData();
    
    return {
      title: 'Discord LLM Bot - System Overview',
      lastUpdated: Date.now(),
      sections: [
        await this.buildKPISection(currentMetrics),
        await this.buildChartsSection(historicalData),
        await this.buildAlertsSection(),
        await this.buildSystemStatusSection()
      ]
    };
  }
  
  private async buildKPISection(metrics: CurrentMetrics): Promise<DashboardSection> {
    const kpis = await Promise.all(
      DASHBOARD_CONFIG.kpis.map(async (kpiConfig) => {
        const value = this.extractMetricValue(metrics, kpiConfig.metric);
        const status = this.determineKPIStatus(value, kpiConfig.thresholds);
        
        return {
          name: kpiConfig.name,
          value,
          unit: kpiConfig.unit,
          status,
          trend: await this.calculateTrend(kpiConfig.metric, '1h')
        };
      })
    );
    
    return {
      title: 'Key Performance Indicators',
      type: 'kpi',
      items: kpis
    };
  }
}
```

## Log Management

### Structured Logging

```typescript
class StructuredLogger {
  log(level: LogLevel, message: string, metadata: LogMetadata = {}): void {
    const logEntry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      service: metadata.service || 'discord-bot',
      userId: metadata.userId,
      serverId: metadata.serverId,
      requestId: metadata.requestId || this.generateRequestId(),
      duration: metadata.duration,
      error: metadata.error ? this.serializeError(metadata.error) : undefined,
      metrics: metadata.metrics,
      tags: metadata.tags || []
    };
    
    this.writeLog(logEntry);
    this.checkForAlerts(logEntry);
  }
  
  private checkForAlerts(logEntry: LogEntry): void {
    // Check for error patterns that should trigger alerts
    if (logEntry.level === 'error') {
      this.alertManager.checkErrorPattern(logEntry);
    }
    
    // Check for performance patterns
    if (logEntry.duration && logEntry.duration > 5000) {
      this.alertManager.checkPerformancePattern(logEntry);
    }
  }
}
```

### Log Analysis

```typescript
class LogAnalyzer {
  async analyzeErrorPatterns(timeRange: TimeRange): Promise<ErrorAnalysis> {
    const logs = await this.queryLogs({
      level: 'error',
      timeRange
    });
    
    const patterns = this.groupByPattern(logs);
    const trends = this.analyzeTrends(patterns);
    
    return {
      totalErrors: logs.length,
      uniquePatterns: patterns.length,
      trends,
      topErrors: patterns
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      recommendations: this.generateErrorRecommendations(patterns)
    };
  }
  
  private groupByPattern(logs: LogEntry[]): ErrorPattern[] {
    const patterns = new Map<string, ErrorPattern>();
    
    for (const log of logs) {
      const pattern = this.extractErrorPattern(log);
      
      if (patterns.has(pattern.signature)) {
        const existing = patterns.get(pattern.signature)!;
        existing.count++;
        existing.lastSeen = Math.max(existing.lastSeen, log.timestamp);
      } else {
        patterns.set(pattern.signature, {
          signature: pattern.signature,
          message: pattern.message,
          count: 1,
          firstSeen: log.timestamp,
          lastSeen: log.timestamp,
          affectedServices: [log.service],
          severity: this.calculateErrorSeverity(log)
        });
      }
    }
    
    return Array.from(patterns.values());
  }
}
```

## Capacity Planning

### Resource Trend Analysis

```typescript
class CapacityPlanner {
  async generateCapacityReport(): Promise<CapacityReport> {
    const timeRanges = ['1d', '1w', '1m'] as const;
    const forecasts = await Promise.all(
      timeRanges.map(range => this.forecastResource(range))
    );
    
    return {
      currentUsage: await this.getCurrentResourceUsage(),
      trends: await this.calculateResourceTrends(),
      forecasts,
      recommendations: this.generateScalingRecommendations(forecasts),
      alerts: this.checkCapacityAlerts(forecasts)
    };
  }
  
  private async forecastResource(timeRange: string): Promise<ResourceForecast> {
    const historicalData = await this.getResourceData(timeRange);
    
    // Simple linear regression for demonstration
    const memoryTrend = this.calculateLinearTrend(
      historicalData.map(d => ({ x: d.timestamp, y: d.memory }))
    );
    
    const cpuTrend = this.calculateLinearTrend(
      historicalData.map(d => ({ x: d.timestamp, y: d.cpu }))
    );
    
    // Project 30 days forward
    const futureTimestamp = Date.now() + (30 * 24 * 60 * 60 * 1000);
    
    return {
      timeRange,
      projectedMemory: memoryTrend.slope * futureTimestamp + memoryTrend.intercept,
      projectedCPU: cpuTrend.slope * futureTimestamp + cpuTrend.intercept,
      confidence: this.calculateForecastConfidence(historicalData),
      scalingRequired: this.shouldScale(memoryTrend, cpuTrend)
    };
  }
  
  private generateScalingRecommendations(forecasts: ResourceForecast[]): ScalingRecommendation[] {
    const recommendations: ScalingRecommendation[] = [];
    
    // Check if any forecast indicates scaling is needed
    const scalingRequired = forecasts.some(f => f.scalingRequired);
    
    if (scalingRequired) {
      const criticalForecasts = forecasts.filter(f => f.scalingRequired);
      const timeToScale = this.calculateTimeToScale(criticalForecasts);
      
      recommendations.push({
        type: 'vertical_scale',
        urgency: timeToScale < 7 ? 'high' : timeToScale < 30 ? 'medium' : 'low',
        timeline: `${timeToScale} days`,
        reason: 'Resource usage trending toward capacity limits',
        suggestedAction: this.generateScalingAction(criticalForecasts)
      });
    }
    
    return recommendations;
  }
}
```

### Growth Projection

```typescript
class GrowthProjector {
  async projectUserGrowth(currentUsers: number): Promise<GrowthProjection> {
    const historicalGrowth = await this.getHistoricalGrowthData();
    const seasonalPatterns = this.identifySeasonalPatterns(historicalGrowth);
    
    // Project resource needs based on user growth
    const projections = this.calculateResourceProjections(currentUsers, seasonalPatterns);
    
    return {
      currentUsers,
      projectedUsers: projections.users,
      projectedResourceNeeds: {
        memory: projections.memory,
        cpu: projections.cpu,
        storage: projections.storage,
        bandwidth: projections.bandwidth
      },
      scalingMilestones: this.identifyScalingMilestones(projections),
      recommendations: this.generateGrowthRecommendations(projections)
    };
  }
  
  private calculateResourceProjections(currentUsers: number, patterns: SeasonalPattern[]): ResourceProjections {
    // Resource usage per user based on historical data
    const resourcePerUser = {
      memory: 0.5,    // MB per user
      cpu: 0.001,     // CPU percentage per user
      storage: 2,     // MB per user
      bandwidth: 10   // KB per user per day
    };
    
    // Apply growth rate with seasonal adjustments
    const baseGrowthRate = 0.15; // 15% monthly growth
    const projectedUsers = this.applySeasonalGrowth(currentUsers, baseGrowthRate, patterns);
    
    return {
      users: projectedUsers,
      memory: projectedUsers * resourcePerUser.memory,
      cpu: projectedUsers * resourcePerUser.cpu,
      storage: projectedUsers * resourcePerUser.storage,
      bandwidth: projectedUsers * resourcePerUser.bandwidth
    };
  }
}
```

---

This monitoring guide provides comprehensive strategies for maintaining visibility into system health, detecting issues early, and ensuring optimal performance of the Discord LLM Bot. Regular monitoring and proactive alerting enable quick resolution of issues and support scaling decisions based on real usage patterns.