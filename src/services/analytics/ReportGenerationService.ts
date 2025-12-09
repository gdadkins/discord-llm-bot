/**
 * Report Generation Service
 * 
 * Handles generation of analytics reports and insights.
 * Part of the refactored analytics system (REF005).
 * 
 * @module ReportGenerationService
 */

import { Mutex } from 'async-mutex';
import { BaseService } from '../base/BaseService';
import { logger } from '../../utils/logger';
import { dataStoreFactory, DataStoreRegistryEntry } from '../../utils/DataStoreFactory';
import { DataStoreMetrics } from '../../utils/DataStore';
import type {
  IAnalyticsReporter,
  AnalyticsReport,
  UsageStatistics,
  SystemStats,
  AnalyticsConfig
} from '../interfaces/AnalyticsInterfaces';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import type { IMetricsCollectionService } from './MetricsCollectionService';
import Database from 'better-sqlite3';

// DataStore factory metrics interfaces
interface DataStoreFactoryMetrics {
  totalStores: number;
  storesByType: Record<string, number>;
  totalOperations: number;
  totalErrors: number;
  avgSaveLatency: number;
  avgLoadLatency: number;
  totalBytesProcessed: number;
  storeDetails: DataStoreDetail[];
}

interface DataStoreDetail {
  id: string;
  type: string;
  filePath: string;
  metrics: {
    operations: number;
    errors: number;
    avgLatency: number;
    dataSize: number;
    lastOperation: number;
  };
  health: {
    lastAccessed: Date;
    ageMs: number;
  };
}

interface DataStoreInsights {
  performance: DataStoreInsight[];
  reliability: DataStoreInsight[];
  capacity: DataStoreInsight[];
  recommendations: string[];
}

interface DataStoreInsight {
  type: string;
  message: string;
  details: Array<{
    type: string;
    file: string;
    latency?: string;
    errors?: number;
    size?: string;
  }>;
}

interface DataStoreAlert {
  level: 'warning' | 'critical';
  type: string;
  count: number;
  message: string;
}

export interface DataStoreDashboard {
  summary: {
    totalStores: number;
    storesByType: Record<string, number>;
    totalOperations: number;
    totalErrors: number;
    errorRate: number;
    avgLatency: {
      save: number;
      load: number;
    };
    dataVolume: {
      totalBytes: number;
      formattedSize: string;
    };
  };
  performance: {
    byType: Record<string, {
      save: { avg_latency: number; operation_count: number };
      load: { avg_latency: number; operation_count: number };
    }>;
    historical: Array<{
      hour: string;
      metric: string;
      avg_value: number;
      min_value: number;
      max_value: number;
      count: number;
    }>;
  };
  capacity: {
    trends: Array<{
      hour: string;
      total_bytes: number;
      active_stores: number;
    }>;
    utilization: {
      status: string;
      totalBytes: number;
      formattedSize: string;
      utilizationPercent: number;
      avgBytesPerOperation: number;
      thresholds: {
        warning: number;
        critical: number;
      };
    };
  };
  health: {
    storeDetails: DataStoreDetail[];
    alerts: DataStoreAlert[];
  };
  insights: DataStoreInsights;
  trends: Array<{
    hour: string;
    metric: string;
    avg_value: number;
    min_value: number;
    max_value: number;
    count: number;
  }>;
  currentMetrics: DataStoreFactoryMetrics;
}

// Extended interface for performance queries with computed fields
interface ExtendedPerformanceRow {
  metric: string;
  avg_latency: number;
  min_latency: number;
  max_latency: number;
  operation_count: number;
  context: string;
}

export interface IReportGenerationService extends IAnalyticsReporter {
  /**
   * Generate DataStore dashboard
   */
  getDataStoreDashboard(
    startDate: Date,
    endDate: Date
  ): Promise<DataStoreDashboard | null>;

  /**
   * Generate recommendations based on analytics
   */
  generateRecommendations(
    usage: UsageStatistics | null,
    errors: { errorRate: number; topErrors: Array<{ errorType: string; count: number; trend: string }> },
    performance: { trends: Array<{ metric: string; current: number; change: number }> }
  ): string[];
}

/**
 * Report Generation Service Implementation
 * 
 * Generates comprehensive analytics reports and insights.
 */
export class ReportGenerationService extends BaseService implements IReportGenerationService {
  private database: Database.Database | null = null;
  private readonly mutex = new Mutex();

  // Configuration
  private config: AnalyticsConfig;

  // Dependencies
  private metricsService: IMetricsCollectionService;

  constructor(
    database: Database.Database | null,
    config: AnalyticsConfig,
    metricsService: IMetricsCollectionService
  ) {
    super();
    this.database = database;
    this.config = config;
    this.metricsService = metricsService;
  }

  /**
   * Get service name
   */
  protected getServiceName(): string {
    return 'ReportGenerationService';
  }

  /**
   * Perform service-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    this.startReportTimer();

    logger.info('ReportGenerationService initialized', {
      reportingEnabled: this.config.reportingEnabled,
      reportSchedule: this.config.reportSchedule
    });
  }

  /**
   * Perform service-specific shutdown
   */
  protected async performShutdown(): Promise<void> {
    // BaseService clears all timers automatically
  }

  /**
   * Get usage statistics
   */
  async getUsageStatistics(
    startDate: Date,
    endDate: Date,
    serverId?: string
  ): Promise<UsageStatistics | null> {
    return this.metricsService.getUsageStatistics(startDate, endDate, serverId);
  }

  /**
   * Get system statistics
   */
  async getSystemStats(): Promise<SystemStats | null> {
    return this.metricsService.getSystemStats();
  }

  /**
   * Generate analytics report
   */
  async generateReport(period: 'daily' | 'weekly' | 'monthly'): Promise<AnalyticsReport> {
    if (!this.config.enabled || !this.database) {
      throw new Error('Analytics not enabled');
    }

    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case 'daily':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'weekly':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    const usage = await this.getUsageStatistics(startDate, now);
    const errors = await this.metricsService.getErrorStatistics(startDate, now);
    const performance = await this.metricsService.getPerformanceStatistics(startDate, now);

    return {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      summary: {
        totalCommands: usage?.summary.totalCommands || 0,
        uniqueUsers: usage?.summary.uniqueUsers || 0,
        successRate: usage?.summary.avgSuccessRate || 0,
        avgResponseTime: usage?.summary.avgResponseTime || 0,
        errorRate: errors?.errorRate || 0,
        engagementTrend: 'stable', // TODO: Calculate trend
      },
      insights: {
        mostPopularCommands: usage?.commandBreakdown.slice(0, 5).map(cmd => ({
          command: cmd.command_name,
          count: cmd.command_count,
          successRate: cmd.success_rate,
        })) || [],
        peakUsageHours: [], // TODO: Implement
        commonErrors: errors?.topErrors || [],
        performanceTrends: performance?.trends || [],
      },
      recommendations: this.generateRecommendations(usage, errors, performance),
    };
  }

  /**
   * Generate recommendations based on analytics
   */
  generateRecommendations(
    usage: UsageStatistics | null,
    errors: { errorRate: number; topErrors: Array<{ errorType: string; count: number; trend: string }> },
    _performance: { trends: Array<{ metric: string; current: number; change: number }> }
  ): string[] {
    const recommendations: string[] = [];

    if (usage?.summary) {
      if (usage.summary.avgSuccessRate < 0.95) {
        recommendations.push('Success rate is below 95%. Consider improving error handling.');
      }

      if (usage.summary.avgResponseTime > 3000) {
        recommendations.push('Average response time is over 3 seconds. Consider performance optimization.');
      }
    }

    if (errors.errorRate > 5) {
      recommendations.push('Error rate is above 5%. Review error patterns and implement fixes.');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is performing well. Continue monitoring for improvements.');
    }

    return recommendations;
  }

  /**
   * Get DataStore dashboard
   */
  async getDataStoreDashboard(
    startDate: Date,
    endDate: Date
  ): Promise<DataStoreDashboard | null> {
    if (!this.config.enabled || !this.database) return null;

    const release = await this.mutex.acquire();
    try {
      // Get DataStore performance metrics from database
      const perfQuery = `
        SELECT 
          metric,
          AVG(value) as avg_latency,
          MIN(value) as min_latency,
          MAX(value) as max_latency,
          COUNT(*) as operation_count,
          context
        FROM performance_events
        WHERE timestamp BETWEEN ? AND ?
          AND (metric LIKE 'datastore_%' OR metric IN ('datastore_save_time', 'datastore_load_time'))
        GROUP BY metric, context
      `;

      const perfResults = this.database.prepare(perfQuery).all(
        startDate.getTime(),
        endDate.getTime()
      ) as ExtendedPerformanceRow[];

      // Get error metrics by store type
      const errorQuery = `
        SELECT 
          COUNT(*) as error_count,
          context
        FROM performance_events
        WHERE timestamp BETWEEN ? AND ?
          AND metric = 'datastore_error_rate'
        GROUP BY context
      `;

      const errorResults = this.database.prepare(errorQuery).all(
        startDate.getTime(),
        endDate.getTime()
      ) as Array<{ error_count: number; context: string }>;

      // Get current DataStore metrics from factory registry
      const registeredStores = dataStoreFactory.getRegisteredStores();
      const currentTime = Date.now();

      const factoryMetrics = {
        totalStores: registeredStores.length,
        storesByType: registeredStores.reduce((acc: Record<string, number>, store: DataStoreRegistryEntry) => {
          acc[store.type] = (acc[store.type] || 0) + 1;
          return acc;
        }, {}),
        totalOperations: registeredStores.reduce((sum: number, store: DataStoreRegistryEntry) => {
          const metrics = store.instance.getMetrics();
          return sum + metrics.saveCount + metrics.loadCount;
        }, 0),
        totalErrors: registeredStores.reduce((sum: number, store: DataStoreRegistryEntry) => {
          const metrics = store.instance.getMetrics();
          return sum + metrics.errorCount;
        }, 0),
        avgSaveLatency: this.calculateWeightedAverage(registeredStores, 'avgSaveLatency', 'saveCount'),
        avgLoadLatency: this.calculateWeightedAverage(registeredStores, 'avgLoadLatency', 'loadCount'),
        totalBytesProcessed: registeredStores.reduce((sum: number, store: DataStoreRegistryEntry) => {
          const metrics = store.instance.getMetrics();
          return sum + metrics.totalBytesWritten + metrics.totalBytesRead;
        }, 0),
        storeDetails: registeredStores.map(store => {
          const metrics = store.instance.getMetrics();
          return {
            id: store.id,
            type: store.type,
            filePath: store.filePath.split('/').pop() || store.filePath, // Just filename for brevity
            metrics: {
              operations: metrics.saveCount + metrics.loadCount,
              errors: metrics.errorCount,
              avgLatency: (metrics.avgSaveLatency + metrics.avgLoadLatency) / 2,
              dataSize: metrics.totalBytesWritten + metrics.totalBytesRead,
              lastOperation: metrics.lastOperationTime
            },
            health: {
              lastAccessed: store.lastAccessed,
              ageMs: currentTime - store.created.getTime()
            }
          };
        })
      };

      // Calculate capacity utilization trends
      const capacityQuery = `
        SELECT 
          strftime('%Y-%m-%d %H:00:00', timestamp/1000, 'unixepoch') as hour,
          SUM(CASE WHEN context LIKE '%bytes%' THEN value ELSE 0 END) as total_bytes,
          COUNT(DISTINCT context) as active_stores
        FROM performance_events
        WHERE timestamp BETWEEN ? AND ?
          AND metric LIKE 'datastore_%'
        GROUP BY hour
        ORDER BY hour
      `;

      const capacityTrends = this.database.prepare(capacityQuery).all(
        startDate.getTime(),
        endDate.getTime()
      ) as Array<{
        hour: string;
        total_bytes: number;
        active_stores: number;
      }>;

      // Calculate hourly trends by operation type
      const hourlyQuery = `
        SELECT 
          strftime('%Y-%m-%d %H:00:00', timestamp/1000, 'unixepoch') as hour,
          metric,
          AVG(value) as avg_value,
          MIN(value) as min_value,
          MAX(value) as max_value,
          COUNT(*) as count
        FROM performance_events
        WHERE timestamp BETWEEN ? AND ?
          AND metric LIKE 'datastore_%'
        GROUP BY hour, metric
        ORDER BY hour
      `;

      const hourlyTrends = this.database.prepare(hourlyQuery).all(
        startDate.getTime(),
        endDate.getTime()
      ) as Array<{
        hour: string;
        metric: string;
        avg_value: number;
        min_value: number;
        max_value: number;
        count: number;
      }>;

      // Calculate performance insights
      const insights = this.calculateDataStoreInsights(perfResults, errorResults, factoryMetrics);

      return {
        summary: {
          totalStores: factoryMetrics.totalStores,
          storesByType: factoryMetrics.storesByType,
          totalOperations: factoryMetrics.totalOperations,
          totalErrors: factoryMetrics.totalErrors,
          errorRate: factoryMetrics.totalOperations > 0 ?
            (factoryMetrics.totalErrors / factoryMetrics.totalOperations) * 100 : 0,
          avgLatency: {
            save: factoryMetrics.avgSaveLatency,
            load: factoryMetrics.avgLoadLatency
          },
          dataVolume: {
            totalBytes: factoryMetrics.totalBytesProcessed,
            formattedSize: this.formatBytes(factoryMetrics.totalBytesProcessed)
          }
        },
        performance: {
          byType: this.groupPerformanceByType(perfResults),
          historical: hourlyTrends
        },
        capacity: {
          trends: capacityTrends,
          utilization: this.calculateCapacityUtilization(factoryMetrics)
        },
        health: {
          storeDetails: factoryMetrics.storeDetails,
          alerts: this.generateDataStoreAlerts(factoryMetrics)
        },
        insights,
        trends: hourlyTrends,
        currentMetrics: factoryMetrics
      };
    } finally {
      release();
    }
  }

  /**
   * Start report timer
   */
  private startReportTimer(): void {
    // Reporting timer (if enabled)
    if (this.config.reportingEnabled) {
      const reportInterval = this.config.reportSchedule === 'daily' ? 24 * 60 * 60 * 1000 :
        this.config.reportSchedule === 'weekly' ? 7 * 24 * 60 * 60 * 1000 :
          30 * 24 * 60 * 60 * 1000;

      this.createInterval('report-generation', async () => {
        try {
          const report = await this.generateReport(this.config.reportSchedule);
          logger.info('Generated analytics report', { period: this.config.reportSchedule, summary: report.summary });
        } catch (error) {
          logger.error('Error generating analytics report:', error);
        }
      }, reportInterval);
    }
  }

  /**
   * Calculate weighted average for DataStore metrics
   */
  private calculateWeightedAverage(stores: DataStoreRegistryEntry[], metricKey: keyof DataStoreMetrics, weightKey: keyof DataStoreMetrics): number {
    let totalWeightedValue = 0;
    let totalWeight = 0;

    for (const store of stores) {
      const metrics = store.instance.getMetrics();
      const value = metrics[metricKey] || 0;
      const weight = metrics[weightKey] || 0;

      if (weight > 0) {
        totalWeightedValue += value * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? totalWeightedValue / totalWeight : 0;
  }

  /**
   * Group performance results by store type
   */
  private groupPerformanceByType(perfResults: ExtendedPerformanceRow[]): Record<string, {
    save: { avg_latency: number; operation_count: number };
    load: { avg_latency: number; operation_count: number };
  }> {
    const grouped: Record<string, {
      save: { avg_latency: number; operation_count: number };
      load: { avg_latency: number; operation_count: number };
    }> = {};

    for (const result of perfResults) {
      const storeType = result.context || 'unknown';
      if (!grouped[storeType]) {
        grouped[storeType] = {
          save: { avg_latency: 0, operation_count: 0 },
          load: { avg_latency: 0, operation_count: 0 }
        };
      }

      if (result.metric.includes('save')) {
        grouped[storeType].save = {
          avg_latency: result.avg_latency,
          operation_count: result.operation_count
        };
      } else if (result.metric.includes('load')) {
        grouped[storeType].load = {
          avg_latency: result.avg_latency,
          operation_count: result.operation_count
        };
      }
    }

    return grouped;
  }

  /**
   * Calculate capacity utilization metrics
   */
  private calculateCapacityUtilization(factoryMetrics: DataStoreFactoryMetrics): {
    status: string;
    totalBytes: number;
    formattedSize: string;
    utilizationPercent: number;
    avgBytesPerOperation: number;
    thresholds: {
      warning: number;
      critical: number;
    };
  } {
    const totalBytes = factoryMetrics.totalBytesProcessed;
    const totalOperations = factoryMetrics.totalOperations;

    // Define capacity thresholds
    const warningThreshold = 75 * 1024 * 1024; // 75MB
    const criticalThreshold = 100 * 1024 * 1024; // 100MB

    let status = 'healthy';
    if (totalBytes > criticalThreshold) {
      status = 'critical';
    } else if (totalBytes > warningThreshold) {
      status = 'warning';
    }

    return {
      status,
      totalBytes,
      formattedSize: this.formatBytes(totalBytes),
      utilizationPercent: totalBytes > 0 ? Math.min((totalBytes / criticalThreshold) * 100, 100) : 0,
      avgBytesPerOperation: totalOperations > 0 ? totalBytes / totalOperations : 0,
      thresholds: {
        warning: warningThreshold,
        critical: criticalThreshold
      }
    };
  }

  /**
   * Generate DataStore performance insights
   */
  private calculateDataStoreInsights(
    perfResults: ExtendedPerformanceRow[],
    errorResults: Array<{ error_count: number; context: string }>,
    factoryMetrics: DataStoreFactoryMetrics
  ): DataStoreInsights {
    const insights: DataStoreInsights = {
      performance: [],
      reliability: [],
      capacity: [],
      recommendations: []
    };

    // Performance insights
    const slowStores = factoryMetrics.storeDetails
      .filter((store: DataStoreDetail) => store.metrics.avgLatency > 500)
      .sort((a: DataStoreDetail, b: DataStoreDetail) => b.metrics.avgLatency - a.metrics.avgLatency);

    if (slowStores.length > 0) {
      insights.performance.push({
        type: 'latency_warning',
        message: `${slowStores.length} DataStore(s) have high average latency`,
        details: slowStores.slice(0, 3).map((store: DataStoreDetail) => ({
          type: store.type,
          file: store.filePath,
          latency: `${store.metrics.avgLatency.toFixed(0)}ms`
        }))
      });
    }

    // Reliability insights
    const errorStores = factoryMetrics.storeDetails
      .filter((store: DataStoreDetail) => store.metrics.errors > 0)
      .sort((a: DataStoreDetail, b: DataStoreDetail) => b.metrics.errors - a.metrics.errors);

    if (errorStores.length > 0) {
      insights.reliability.push({
        type: 'error_warning',
        message: `${errorStores.length} DataStore(s) have recorded errors`,
        details: errorStores.slice(0, 3).map((store: DataStoreDetail) => ({
          type: store.type,
          file: store.filePath,
          errors: store.metrics.errors
        }))
      });
    }

    // Capacity insights
    const largeStores = factoryMetrics.storeDetails
      .filter((store: DataStoreDetail) => store.metrics.dataSize > 1024 * 1024) // 1MB+
      .sort((a: DataStoreDetail, b: DataStoreDetail) => b.metrics.dataSize - a.metrics.dataSize);

    if (largeStores.length > 0) {
      insights.capacity.push({
        type: 'size_info',
        message: `${largeStores.length} DataStore(s) have processed significant data`,
        details: largeStores.slice(0, 3).map((store: DataStoreDetail) => ({
          type: store.type,
          file: store.filePath,
          size: this.formatBytes(store.metrics.dataSize)
        }))
      });
    }

    // Generate recommendations
    insights.recommendations = this.generateDataStoreRecommendations(factoryMetrics);

    return insights;
  }

  /**
   * Generate DataStore alerts for health monitoring
   */
  private generateDataStoreAlerts(factoryMetrics: DataStoreFactoryMetrics): DataStoreAlert[] {
    const alerts: DataStoreAlert[] = [];

    // High latency alerts
    const highLatencyStores = factoryMetrics.storeDetails
      .filter((store: DataStoreDetail) => store.metrics.avgLatency > 1000);

    if (highLatencyStores.length > 0) {
      alerts.push({
        level: 'warning',
        type: 'high_latency',
        count: highLatencyStores.length,
        message: `${highLatencyStores.length} store(s) with latency > 1000ms`
      });
    }

    // Error rate alerts
    const errorStores = factoryMetrics.storeDetails
      .filter((store: DataStoreDetail) => {
        const totalOperations = store.metrics.operations;
        const errorRate = totalOperations > 0 ?
          (store.metrics.errors / totalOperations) * 100 : 0;
        return errorRate > 5; // 5% error rate threshold
      });

    if (errorStores.length > 0) {
      alerts.push({
        level: 'critical',
        type: 'high_error_rate',
        count: errorStores.length,
        message: `${errorStores.length} store(s) with error rate > 5%`
      });
    }

    // Stale store alerts
    const staleThreshold = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    const staleStores = factoryMetrics.storeDetails
      .filter((store: DataStoreDetail) => store.health.lastAccessed.getTime() < staleThreshold);

    if (staleStores.length > 0) {
      alerts.push({
        level: 'warning',
        type: 'stale_stores',
        count: staleStores.length,
        message: `${staleStores.length} store(s) not accessed in 24h`
      });
    }

    return alerts;
  }

  /**
   * Generate DataStore recommendations
   */
  private generateDataStoreRecommendations(factoryMetrics: DataStoreFactoryMetrics): string[] {
    const recommendations: string[] = [];

    // Analyze overall performance
    const totalOperations = factoryMetrics.totalOperations;
    const totalErrors = factoryMetrics.totalErrors;
    const errorRate = totalOperations > 0 ? (totalErrors / totalOperations) * 100 : 0;

    if (errorRate > 5) {
      recommendations.push('Consider investigating DataStore error patterns and implementing retry mechanisms');
    }

    if (factoryMetrics.avgSaveLatency > 500) {
      recommendations.push('DataStore save operations are slow - consider enabling compression or optimizing data structures');
    }

    if (factoryMetrics.avgLoadLatency > 200) {
      recommendations.push('DataStore load operations are slow - consider caching frequently accessed data');
    }

    // Analyze by type
    const typeStats: Record<string, {
      count: number;
      totalLatency: number;
      totalErrors: number;
      totalOps: number;
    }> = {};
    for (const store of factoryMetrics.storeDetails) {
      if (!typeStats[store.type]) {
        typeStats[store.type] = { count: 0, totalLatency: 0, totalErrors: 0, totalOps: 0 };
      }
      typeStats[store.type].count++;
      typeStats[store.type].totalLatency += store.metrics.avgLatency;
      typeStats[store.type].totalErrors += store.metrics.errors;
      typeStats[store.type].totalOps += store.metrics.operations;
    }

    for (const [type, stats] of Object.entries(typeStats)) {
      const avgLatency = stats.totalLatency / stats.count;
      const typeErrorRate = stats.totalOps > 0 ? (stats.totalErrors / stats.totalOps) * 100 : 0;

      if (avgLatency > 1000) {
        recommendations.push(`${type} stores are performing slowly (${avgLatency.toFixed(0)}ms avg) - consider type-specific optimizations`);
      }

      if (typeErrorRate > 10) {
        recommendations.push(`${type} stores have high error rates (${typeErrorRate.toFixed(1)}%) - review configuration and usage patterns`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('DataStore performance is within acceptable parameters');
    }

    return recommendations;
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Check if service is healthy
   */
  protected isHealthy(): boolean {
    return this.config.enabled && !!this.database;
  }

  /**
   * Get health errors
   */
  protected getHealthErrors(): string[] {
    const errors: string[] = [];
    if (!this.config.enabled) {
      errors.push('Analytics is disabled in configuration');
    }
    if (!this.database) {
      errors.push('Database connection not available');
    }
    return errors;
  }

  /**
   * Collect service metrics
   */
  protected collectServiceMetrics(): Record<string, unknown> {
    return {
      reportingEnabled: this.config.reportingEnabled,
      reportSchedule: this.config.reportSchedule,
      reportTimerActive: this.hasTimer('report-generation'),
      databaseAvailable: !!this.database
    };
  }
}