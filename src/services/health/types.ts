/**
 * Health Monitoring Types and Interfaces
 * 
 * This module contains all type definitions for the health monitoring system,
 * including metrics, alerts, configurations, and internal data structures.
 * 
 * @module HealthMonitoringTypes
 */

import type { DataStoreMetrics } from '../../utils/DataStore';

// ============================================================================
// Public API Types - Exported from HealthMonitoringInterfaces
// ============================================================================

/**
 * Health metrics snapshot containing comprehensive system state
 */
export interface HealthMetrics {
  /** Node.js process memory usage statistics */
  memoryUsage: NodeJS.MemoryUsage;
  /** Number of active AI conversations */
  activeConversations: number;
  /** Rate limiter quota status */
  rateLimitStatus: {
    minuteRemaining: number;
    dailyRemaining: number;
    requestsThisMinute: number;
    requestsToday: number;
  };
  /** Bot uptime in milliseconds */
  uptime: number;
  /** Error rate percentage (0-100) */
  errorRate: number;
  /** Response time percentiles in milliseconds */
  responseTime: { p50: number; p95: number; p99: number };
  /** API service health status */
  apiHealth: { gemini: boolean; discord: boolean };
  /** Cache performance metrics */
  cacheMetrics: {
    hitRate: number;
    memoryUsage: number;
    size: number;
  };
  /** Context manager memory statistics */
  contextMetrics: {
    totalServers: number;
    totalMemoryUsage: number;
    averageServerSize: number;
    largestServerSize: number;
    itemCounts: {
      embarrassingMoments: number;
      codeSnippets: number;
      runningGags: number;
      summarizedFacts: number;
    };
    compressionStats: {
      averageCompressionRatio: number;
      totalMemorySaved: number;
      duplicatesRemoved: number;
    };
  };
  /** DataStore system metrics */
  dataStoreMetrics: {
    totalStores: number;
    storesByType: Record<string, number>;
    totalSaveOperations: number;
    totalLoadOperations: number;
    totalErrors: number;
    avgSaveLatency: number;
    avgLoadLatency: number;
    healthyStores: number;
    unhealthyStores: number;
    totalBytesWritten: number;
    totalBytesRead: number;
  };
}

/**
 * Point-in-time health metrics snapshot
 */
export interface HealthSnapshot {
  /** Unix timestamp of snapshot */
  timestamp: number;
  /** Health metrics at this point in time */
  metrics: HealthMetrics;
}

/**
 * Alert configuration thresholds and settings
 */
export interface AlertConfig {
  /** Memory usage threshold in MB */
  memoryThreshold: number;
  /** Error rate threshold percentage (0-100) */
  errorRateThreshold: number;
  /** Response time threshold in milliseconds */
  responseTimeThreshold: number;
  /** Disk space usage threshold percentage (0-100) */
  diskSpaceThreshold: number;
  /** Whether alerts are enabled */
  enabled: boolean;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Persistent health metrics data structure
 */
export interface HealthMetricsData {
  /** Historical snapshots */
  snapshots: HealthSnapshot[];
  /** Current alert state */
  alertState: AlertState;
  /** Last save timestamp */
  lastSaved: number;
}

/**
 * Alert state tracking for rate limiting and cooldowns
 */
export interface AlertState {
  /** Last memory alert timestamp */
  lastMemoryAlert: number;
  /** Last error rate alert timestamp */
  lastErrorRateAlert: number;
  /** Last response time alert timestamp */
  lastResponseTimeAlert: number;
  /** Last disk space alert timestamp */
  lastDiskSpaceAlert: number;
  /** Consecutive alert counts by type */
  consecutiveAlerts: Map<string, number>;
}

/**
 * Ring buffer for performance metrics
 */
export interface PerformanceBuffer {
  /** Response times circular buffer */
  responseTimes: number[];
  /** Error counts circular buffer */
  errors: number[];
  /** Request counts circular buffer */
  requests: number[];
  /** Current buffer fill size */
  bufferSize: number;
  /** Current write index */
  bufferIndex: number;
}

/**
 * DataStore health check result
 */
export interface DataStoreHealthResult {
  /** Number of healthy stores */
  healthyStores: number;
  /** Number of unhealthy stores */
  unhealthyStores: number;
  /** Error details for unhealthy stores */
  errors: Array<{ filePath: string; error: string }>;
}

/**
 * Detailed DataStore metrics for analysis
 */
export interface DetailedDataStoreMetrics {
  /** Collection timestamp */
  timestamp: number;
  /** Individual store metrics */
  stores: Array<{
    id: string;
    type: string;
    filePath: string;
    metrics: DataStoreMetrics;
    lastAccessed: Date;
  }>;
}

/**
 * DataStore performance baseline for comparison
 */
export interface DataStorePerformanceBaseline {
  /** Average save latency across all stores */
  avgSaveLatency: number;
  /** Average load latency across all stores */
  avgLoadLatency: number;
  /** Error rate percentage */
  errorRate: number;
  /** Baseline calculation timestamp */
  timestamp: number;
}

// ============================================================================
// Component Interfaces
// ============================================================================

/**
 * Health metrics collector interface
 */
export interface IHealthMetricsCollector {
  /**
   * Record a response time measurement
   * @param responseTimeMs Response time in milliseconds
   */
  recordResponseTime(responseTimeMs: number): void;
  
  /**
   * Record an error occurrence
   */
  recordError(): void;
  
  /**
   * Record a request
   */
  recordRequest(): void;
  
  /**
   * Collect current health metrics
   * @returns Promise resolving to current health metrics
   */
  collectHealthMetrics(): Promise<HealthMetrics>;
  
  /**
   * Get DataStore performance baseline
   * @returns Performance baseline or null if not available
   */
  getDataStorePerformanceBaseline(): DataStorePerformanceBaseline | null;
}

/**
 * Health status evaluator interface
 */
export interface IHealthStatusEvaluator {
  /**
   * Check health metrics and trigger alerts
   * @param metrics Current health metrics
   * @param alertConfig Alert configuration
   * @returns Promise resolving when check is complete
   */
  checkAlerts(metrics: HealthMetrics, alertConfig: AlertConfig): Promise<void>;
  
  /**
   * Attempt self-healing for specific alert type
   * @param type Alert type
   * @param consecutiveCount Number of consecutive alerts
   * @param metrics Current health metrics
   * @returns Promise resolving when healing attempt is complete
   */
  attemptSelfHealing(type: string, consecutiveCount: number, metrics: HealthMetrics): Promise<void>;
  
  /**
   * Get current alert state
   * @returns Current alert state
   */
  getAlertState(): AlertState;
  
  /**
   * Update alert state
   * @param state New alert state
   */
  setAlertState(state: AlertState): void;
}

/**
 * Health report generator interface
 */
export interface IHealthReportGenerator {
  /**
   * Generate aggregated metrics for storage
   * @param snapshots Raw snapshots to aggregate
   * @returns Aggregated snapshots
   */
  aggregateMetrics(snapshots: HealthSnapshot[]): Promise<HealthSnapshot[]>;
  
  /**
   * Export metrics in specified format
   * @param snapshots Snapshots to export
   * @param format Export format
   * @returns Formatted export string
   */
  exportMetrics(snapshots: HealthSnapshot[], format: 'json' | 'csv'): Promise<string>;
  
  /**
   * Get compression statistics for stored metrics
   * @returns Compression statistics
   */
  getCompressionStats(): Promise<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    savedBytes: number;
    savedPercentage: number;
  }>;
}

// ============================================================================
// Alert Types
// ============================================================================

/**
 * Known alert types
 */
export type AlertType = 
  | 'memory' 
  | 'error_rate' 
  | 'response_time' 
  | 'api_health' 
  | 'datastore_health'
  | 'datastore_errors'
  | 'datastore_latency'
  | 'datastore_capacity'
  | 'datastore_stale';

/**
 * Alert handler callback
 */
export type AlertHandler = (type: AlertType, message: string, metrics: HealthMetrics) => Promise<void>;

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * Health monitor configuration constants
 */
export const HEALTH_CONSTANTS = {
  /** Default metrics collection interval (30 seconds) */
  COLLECTION_INTERVAL_MS: 30000,
  /** Default retention period in days */
  RETENTION_DAYS: 7,
  /** Default cleanup interval (5 minutes) */
  CLEANUP_INTERVAL_MS: 300000,
  /** Maximum performance buffer size */
  MAX_PERFORMANCE_BUFFER: 1000,
  /** Alert cooldown period (5 minutes) */
  ALERT_COOLDOWN_MS: 300000,
  /** DataStore health check cache validity (1 minute) */
  DATASTORE_HEALTH_CACHE_MS: 60000,
  /** Gemini health check cache validity (5 minutes) */
  GEMINI_HEALTH_CACHE_MS: 300000,
} as const;