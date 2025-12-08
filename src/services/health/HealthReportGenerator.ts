/**
 * Health Report Generator
 * 
 * Responsible for generating reports from health metrics, including
 * aggregation, formatting, export capabilities, and compression statistics.
 * Supports both JSON and CSV export formats.
 * 
 * @module HealthReportGenerator
 */

import { logger } from '../../utils/logger';
import { DataStore } from '../../utils/DataStore';
import type {
  HealthMetrics,
  HealthSnapshot,
  HealthMetricsData,
  IHealthReportGenerator
} from './types';

/**
 * Implementation of health report generation
 */
export class HealthReportGenerator implements IHealthReportGenerator {
  private metricsDataStore: DataStore<HealthMetricsData>;
  
  constructor(dataStore: DataStore<HealthMetricsData>) {
    this.metricsDataStore = dataStore;
  }
  
  // ============================================================================
  // Metrics Aggregation
  // ============================================================================
  
  /**
   * Aggregate metrics to reduce storage size
   * Groups metrics by hour and calculates averages
   */
  async aggregateMetrics(snapshots: HealthSnapshot[]): Promise<HealthSnapshot[]> {
    const hourlyGroups = new Map<number, HealthSnapshot[]>();
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    // Group snapshots by hour
    for (const snapshot of snapshots) {
      if (snapshot.timestamp >= thirtyDaysAgo) {
        const hourKey = Math.floor(snapshot.timestamp / (60 * 60 * 1000));
        if (!hourlyGroups.has(hourKey)) {
          hourlyGroups.set(hourKey, []);
        }
        hourlyGroups.get(hourKey)!.push(snapshot);
      }
    }
    
    // Aggregate each hourly group
    const aggregatedSnapshots: HealthSnapshot[] = [];
    for (const [hourKey, hourSnapshots] of hourlyGroups.entries()) {
      if (hourSnapshots.length === 0) continue;
      
      // For recent data (last 24 hours), keep all snapshots
      const hourTimestamp = hourKey * 60 * 60 * 1000;
      if (now - hourTimestamp < 24 * 60 * 60 * 1000) {
        aggregatedSnapshots.push(...hourSnapshots);
      } else {
        // For older data, aggregate to hourly averages
        const aggregated = this.calculateAverageMetrics(hourSnapshots);
        aggregated.timestamp = hourTimestamp;
        aggregatedSnapshots.push(aggregated);
      }
    }
    
    return aggregatedSnapshots.sort((a, b) => a.timestamp - b.timestamp);
  }
  
  /**
   * Calculate average metrics from multiple snapshots
   */
  private calculateAverageMetrics(snapshots: HealthSnapshot[]): HealthSnapshot {
    if (snapshots.length === 0) {
      throw new Error('Cannot calculate average of empty snapshots array');
    }
    
    const first = snapshots[0];
    const avgMetrics: HealthMetrics = {
      memoryUsage: {
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
        arrayBuffers: 0,
      },
      activeConversations: 0,
      rateLimitStatus: {
        minuteRemaining: 0,
        dailyRemaining: 0,
        requestsThisMinute: 0,
        requestsToday: 0,
      },
      uptime: 0,
      errorRate: 0,
      responseTime: { p50: 0, p95: 0, p99: 0 },
      apiHealth: { gemini: true, discord: true },
      cacheMetrics: {
        hitRate: 0,
        memoryUsage: 0,
        size: 0,
      },
      contextMetrics: first.metrics.contextMetrics, // Keep context metrics as-is
      dataStoreMetrics: first.metrics.dataStoreMetrics, // Keep dataStore metrics as-is
    };
    
    // Calculate averages
    let geminiHealthCount = 0;
    let discordHealthCount = 0;
    
    for (const snapshot of snapshots) {
      const m = snapshot.metrics;
      
      // Sum memory usage
      avgMetrics.memoryUsage.rss += m.memoryUsage.rss;
      avgMetrics.memoryUsage.heapTotal += m.memoryUsage.heapTotal;
      avgMetrics.memoryUsage.heapUsed += m.memoryUsage.heapUsed;
      avgMetrics.memoryUsage.external += m.memoryUsage.external;
      avgMetrics.memoryUsage.arrayBuffers += m.memoryUsage.arrayBuffers;
      
      // Sum other metrics
      avgMetrics.activeConversations += m.activeConversations;
      avgMetrics.uptime = Math.max(avgMetrics.uptime, m.uptime);
      avgMetrics.errorRate += m.errorRate;
      avgMetrics.responseTime.p50 += m.responseTime.p50;
      avgMetrics.responseTime.p95 += m.responseTime.p95;
      avgMetrics.responseTime.p99 += m.responseTime.p99;
      avgMetrics.cacheMetrics.hitRate += m.cacheMetrics.hitRate;
      avgMetrics.cacheMetrics.memoryUsage += m.cacheMetrics.memoryUsage;
      avgMetrics.cacheMetrics.size += m.cacheMetrics.size;
      
      // Count health status
      if (m.apiHealth.gemini) geminiHealthCount++;
      if (m.apiHealth.discord) discordHealthCount++;
    }
    
    const count = snapshots.length;
    
    // Calculate averages
    avgMetrics.memoryUsage.rss /= count;
    avgMetrics.memoryUsage.heapTotal /= count;
    avgMetrics.memoryUsage.heapUsed /= count;
    avgMetrics.memoryUsage.external /= count;
    avgMetrics.memoryUsage.arrayBuffers /= count;
    avgMetrics.activeConversations = Math.round(avgMetrics.activeConversations / count);
    avgMetrics.errorRate /= count;
    avgMetrics.responseTime.p50 /= count;
    avgMetrics.responseTime.p95 /= count;
    avgMetrics.responseTime.p99 /= count;
    avgMetrics.cacheMetrics.hitRate /= count;
    avgMetrics.cacheMetrics.memoryUsage /= count;
    avgMetrics.cacheMetrics.size = Math.round(avgMetrics.cacheMetrics.size / count);
    
    // Use majority vote for API health
    avgMetrics.apiHealth.gemini = geminiHealthCount > count / 2;
    avgMetrics.apiHealth.discord = discordHealthCount > count / 2;
    
    // Use the latest rate limit status
    avgMetrics.rateLimitStatus = snapshots[snapshots.length - 1].metrics.rateLimitStatus;
    
    return {
      timestamp: snapshots[0].timestamp,
      metrics: avgMetrics,
    };
  }
  
  // ============================================================================
  // Export Functionality
  // ============================================================================
  
  /**
   * Export metrics in specified format
   */
  async exportMetrics(
    snapshots: HealthSnapshot[], 
    format: 'json' | 'csv'
  ): Promise<string> {
    if (format === 'json') {
      return this.exportAsJson(snapshots);
    } else {
      return this.exportAsCsv(snapshots);
    }
  }
  
  /**
   * Export metrics as JSON
   */
  private exportAsJson(snapshots: HealthSnapshot[]): string {
    return JSON.stringify(snapshots, null, 2);
  }
  
  /**
   * Export metrics as CSV
   */
  private exportAsCsv(snapshots: HealthSnapshot[]): string {
    const headers = [
      'timestamp',
      'date',
      'memory_rss_mb',
      'memory_heap_used_mb',
      'active_conversations',
      'error_rate',
      'response_time_p50',
      'response_time_p95',
      'response_time_p99',
      'cache_hit_rate',
      'cache_memory_usage_mb',
      'cache_size',
      'context_total_servers',
      'context_total_memory_mb',
      'context_compression_ratio',
      'rate_limit_minute_remaining',
      'rate_limit_daily_remaining',
      'gemini_healthy',
      'discord_healthy',
      'datastore_total',
      'datastore_healthy',
      'datastore_unhealthy',
      'datastore_save_latency_ms',
      'datastore_load_latency_ms',
      'datastore_error_count',
      'datastore_bytes_written',
      'datastore_bytes_read'
    ];
    
    const rows = [headers.join(',')];
    
    for (const snapshot of snapshots) {
      const m = snapshot.metrics;
      const row = [
        snapshot.timestamp,
        new Date(snapshot.timestamp).toISOString(),
        (m.memoryUsage.rss / 1024 / 1024).toFixed(2),
        (m.memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
        m.activeConversations,
        m.errorRate.toFixed(2),
        m.responseTime.p50.toFixed(2),
        m.responseTime.p95.toFixed(2),
        m.responseTime.p99.toFixed(2),
        m.cacheMetrics.hitRate.toFixed(2),
        (m.cacheMetrics.memoryUsage / 1024 / 1024).toFixed(2),
        m.cacheMetrics.size,
        m.contextMetrics.totalServers,
        (m.contextMetrics.totalMemoryUsage / 1024 / 1024).toFixed(2),
        m.contextMetrics.compressionStats.averageCompressionRatio.toFixed(2),
        m.rateLimitStatus.minuteRemaining,
        m.rateLimitStatus.dailyRemaining,
        m.apiHealth.gemini ? 'true' : 'false',
        m.apiHealth.discord ? 'true' : 'false',
        m.dataStoreMetrics.totalStores,
        m.dataStoreMetrics.healthyStores,
        m.dataStoreMetrics.unhealthyStores,
        m.dataStoreMetrics.avgSaveLatency.toFixed(2),
        m.dataStoreMetrics.avgLoadLatency.toFixed(2),
        m.dataStoreMetrics.totalErrors,
        m.dataStoreMetrics.totalBytesWritten,
        m.dataStoreMetrics.totalBytesRead
      ];
      rows.push(row.join(','));
    }
    
    return rows.join('\n');
  }
  
  // ============================================================================
  // Compression Statistics
  // ============================================================================
  
  /**
   * Get compression statistics for stored metrics
   */
  async getCompressionStats(): Promise<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    savedBytes: number;
    savedPercentage: number;
  }> {
    try {
      const stats = await this.metricsDataStore.getStats();
      if (!stats) {
        return this.getEmptyCompressionStats();
      }
      
      // Estimate original size
      const data = await this.metricsDataStore.load();
      if (!data) {
        return {
          originalSize: 0,
          compressedSize: stats.size,
          compressionRatio: 0,
          savedBytes: 0,
          savedPercentage: 0,
        };
      }
      
      const originalSize = JSON.stringify(data).length;
      const compressedSize = stats.size;
      const savedBytes = originalSize - compressedSize;
      const savedPercentage = originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;
      
      return {
        originalSize,
        compressedSize,
        compressionRatio: compressedSize > 0 ? originalSize / compressedSize : 0,
        savedBytes: Math.max(0, savedBytes),
        savedPercentage: Math.max(0, savedPercentage),
      };
    } catch (error) {
      logger.error('Failed to get compression stats:', error);
      return this.getEmptyCompressionStats();
    }
  }
  
  /**
   * Get empty compression stats
   */
  private getEmptyCompressionStats() {
    return {
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      savedBytes: 0,
      savedPercentage: 0,
    };
  }
  
  // ============================================================================
  // Report Generation
  // ============================================================================
  
  /**
   * Generate a summary report from snapshots
   */
  generateSummaryReport(snapshots: HealthSnapshot[]): {
    period: { start: Date; end: Date };
    metrics: {
      memory: { avg: number; max: number; min: number };
      errorRate: { avg: number; max: number; min: number };
      responseTime: { avgP95: number; maxP95: number; minP95: number };
      uptime: { percentage: number; totalMs: number };
      apiHealth: { geminiUptime: number; discordUptime: number };
      dataStore: {
        totalOperations: number;
        avgErrorRate: number;
        avgSaveLatency: number;
        avgLoadLatency: number;
      };
    };
  } {
    if (snapshots.length === 0) {
      throw new Error('Cannot generate report from empty snapshots');
    }
    
    const start = new Date(Math.min(...snapshots.map(s => s.timestamp)));
    const end = new Date(Math.max(...snapshots.map(s => s.timestamp)));
    
    // Calculate aggregated metrics
    let memorySum = 0, memoryMax = 0, memoryMin = Infinity;
    let errorSum = 0, errorMax = 0, errorMin = Infinity;
    let p95Sum = 0, p95Max = 0, p95Min = Infinity;
    let geminiHealthCount = 0, discordHealthCount = 0;
    let totalOperations = 0, totalErrors = 0;
    let saveLatencySum = 0, loadLatencySum = 0;
    let maxUptime = 0;
    
    for (const snapshot of snapshots) {
      const m = snapshot.metrics;
      const memoryMB = m.memoryUsage.rss / (1024 * 1024);
      
      // Memory
      memorySum += memoryMB;
      memoryMax = Math.max(memoryMax, memoryMB);
      memoryMin = Math.min(memoryMin, memoryMB);
      
      // Error rate
      errorSum += m.errorRate;
      errorMax = Math.max(errorMax, m.errorRate);
      errorMin = Math.min(errorMin, m.errorRate);
      
      // Response time
      p95Sum += m.responseTime.p95;
      p95Max = Math.max(p95Max, m.responseTime.p95);
      p95Min = Math.min(p95Min, m.responseTime.p95);
      
      // API health
      if (m.apiHealth.gemini) geminiHealthCount++;
      if (m.apiHealth.discord) discordHealthCount++;
      
      // DataStore
      const ops = m.dataStoreMetrics.totalSaveOperations + m.dataStoreMetrics.totalLoadOperations;
      totalOperations += ops;
      totalErrors += m.dataStoreMetrics.totalErrors;
      saveLatencySum += m.dataStoreMetrics.avgSaveLatency;
      loadLatencySum += m.dataStoreMetrics.avgLoadLatency;
      
      // Uptime
      maxUptime = Math.max(maxUptime, m.uptime);
    }
    
    const count = snapshots.length;
    const periodMs = end.getTime() - start.getTime();
    
    return {
      period: { start, end },
      metrics: {
        memory: {
          avg: memorySum / count,
          max: memoryMax,
          min: memoryMin === Infinity ? 0 : memoryMin,
        },
        errorRate: {
          avg: errorSum / count,
          max: errorMax,
          min: errorMin === Infinity ? 0 : errorMin,
        },
        responseTime: {
          avgP95: p95Sum / count,
          maxP95: p95Max,
          minP95: p95Min === Infinity ? 0 : p95Min,
        },
        uptime: {
          percentage: periodMs > 0 ? (maxUptime / periodMs) * 100 : 0,
          totalMs: maxUptime,
        },
        apiHealth: {
          geminiUptime: (geminiHealthCount / count) * 100,
          discordUptime: (discordHealthCount / count) * 100,
        },
        dataStore: {
          totalOperations,
          avgErrorRate: totalOperations > 0 ? (totalErrors / totalOperations) * 100 : 0,
          avgSaveLatency: saveLatencySum / count,
          avgLoadLatency: loadLatencySum / count,
        },
      },
    };
  }
}