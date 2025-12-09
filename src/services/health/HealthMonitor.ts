/**
 * Health Monitor - Main Orchestrator
 * 
 * The main health monitoring service that orchestrates metrics collection,
 * status evaluation, and report generation. This service maintains the
 * public API and coordinates between the specialized components.
 * 
 * @module HealthMonitor
 */

import { Mutex } from 'async-mutex';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { BaseService } from '../base/BaseService';
import { DataStore, DataValidator } from '../../utils/DataStore';
import { globalResourceManager } from '../../utils/ResourceManager';
import type { IContextManager } from '../interfaces/ContextManagementInterfaces';
import type { IRateLimiter } from '../interfaces/RateLimitingInterfaces';
import type { IAIService } from '../interfaces/AIServiceInterfaces';
import { HEALTH_MONITOR_CONSTANTS, TIME_CONSTANTS } from '../../utils/constants';
import type { IHealthMonitor } from '../interfaces/HealthMonitoringInterfaces';

import { HealthMetricsCollector } from './HealthMetricsCollector';
import { HealthStatusEvaluator } from './HealthStatusEvaluator';
import { HealthReportGenerator } from './HealthReportGenerator';

import type {
  HealthMetrics,
  HealthSnapshot,
  HealthMetricsData,
  AlertConfig,
  AlertState
} from './types';

/**
 * Main health monitoring service that orchestrates all health monitoring components
 */
export class HealthMonitor extends BaseService implements IHealthMonitor {
  // Data storage
  private metricsData: Map<number, HealthSnapshot> = new Map();
  private readonly stateMutex = new Mutex();
  private readonly ioMutex = new Mutex();
  private readonly dataFile: string;
  private metricsDataStore: DataStore<HealthMetricsData>;

  // Configuration
  private readonly COLLECTION_INTERVAL_MS = HEALTH_MONITOR_CONSTANTS.COLLECTION_INTERVAL_MS;
  private readonly RETENTION_DAYS = HEALTH_MONITOR_CONSTANTS.RETENTION_DAYS;
  private readonly MAX_SNAPSHOTS = (this.RETENTION_DAYS * 24 * TIME_CONSTANTS.ONE_HOUR_MS) / this.COLLECTION_INTERVAL_MS;
  private readonly CLEANUP_INTERVAL_MS = HEALTH_MONITOR_CONSTANTS.CLEANUP_INTERVAL_MS;

  // Alert configuration
  private alertConfig: AlertConfig = {
    memoryThreshold: parseInt(process.env.HEALTH_MEMORY_THRESHOLD_MB || String(HEALTH_MONITOR_CONSTANTS.DEFAULT_MEMORY_THRESHOLD_MB)),
    errorRateThreshold: parseFloat(process.env.HEALTH_ERROR_RATE_THRESHOLD || String(HEALTH_MONITOR_CONSTANTS.DEFAULT_ERROR_RATE_THRESHOLD)),
    responseTimeThreshold: parseInt(process.env.HEALTH_RESPONSE_TIME_THRESHOLD_MS || String(HEALTH_MONITOR_CONSTANTS.DEFAULT_RESPONSE_TIME_THRESHOLD_MS)),
    diskSpaceThreshold: parseFloat(process.env.HEALTH_DISK_SPACE_THRESHOLD || String(HEALTH_MONITOR_CONSTANTS.DEFAULT_DISK_SPACE_THRESHOLD)),
    enabled: process.env.HEALTH_ALERTS_ENABLED === 'true',
  };

  // Component instances
  private metricsCollector: HealthMetricsCollector;
  private statusEvaluator: HealthStatusEvaluator;
  private reportGenerator: HealthReportGenerator;

  constructor(dataFile = './data/health-metrics.json') {
    super();
    this.dataFile = dataFile;

    // Initialize DataStore with compression and TTL
    const validator: DataValidator<HealthMetricsData> = (data: unknown): data is HealthMetricsData => {
      if (!data || typeof data !== 'object') return false;
      const d = data as Record<string, unknown>;
      return Array.isArray(d.snapshots) &&
        typeof d.lastSaved === 'number' &&
        !!d.alertState && typeof d.alertState === 'object';
    };

    this.metricsDataStore = new DataStore<HealthMetricsData>('./data/metrics.json', {
      validator,
      compressionEnabled: true,
      compressionThreshold: 10000,
      ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
      autoCleanup: true,
      maxBackups: 5,
      enableDebugLogging: false
    });

    // Initialize components
    this.metricsCollector = new HealthMetricsCollector();
    this.statusEvaluator = new HealthStatusEvaluator();
    this.reportGenerator = new HealthReportGenerator(this.metricsDataStore);

    // Set up component connections
    this.statusEvaluator.setDataStoreMetricsProvider({
      getDetailedMetrics: () => this.metricsCollector.getDetailedDataStoreMetrics(),
      getHealthResult: () => this.metricsCollector.getCachedDataStoreHealthResult(),
    });
  }

  protected getServiceName(): string {
    return 'HealthMonitor';
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  protected async performInitialization(): Promise<void> {
    try {
      await this.ensureDataDirectory();
      await this.loadMetricsData();

      // Register health monitor resources with global resource manager
      this.registerHealthMonitorResources();

      // Start metrics collection with enhanced resource tracking
      this.createManagedInterval('metricsCollection', async () => {
        await this.collectMetricsSnapshot();
      }, this.COLLECTION_INTERVAL_MS, { priority: 'high', coalesce: true });

      // Start cleanup process with enhanced resource tracking
      this.createManagedInterval('cleanup', async () => {
        await this.performCleanup();
      }, this.CLEANUP_INTERVAL_MS, { priority: 'medium', coalesce: true });

      // Start resource monitoring
      this.createManagedInterval('resourceMonitoring', async () => {
        await this.monitorResourceHealth();
      }, 30000, { priority: 'medium' }); // Every 30 seconds

      logger.info('HealthMonitor initialized with resource tracking', {
        retentionDays: this.RETENTION_DAYS,
        collectionIntervalMs: this.COLLECTION_INTERVAL_MS,
        maxSnapshots: this.MAX_SNAPSHOTS,
        alertsEnabled: this.alertConfig.enabled,
        resourceTrackingEnabled: true
      });
    } catch (error) {
      logger.error('Failed to initialize HealthMonitor:', error);
      throw error;
    }
  }

  protected async performShutdown(): Promise<void> {
    try {
      // Cleanup health monitor specific resources
      await this.cleanupHealthMonitorResources();

      logger.info('HealthMonitor shutdown completed with resource cleanup');
    } catch (error) {
      logger.error('Error during HealthMonitor shutdown', error);
      throw error;
    }
  }

  // ============================================================================
  // Service Registration
  // ============================================================================

  setRateLimiter(rateLimiter: IRateLimiter): void {
    this.metricsCollector.setRateLimiter(rateLimiter);
  }

  setContextManager(contextManager: IContextManager): void {
    this.metricsCollector.setContextManager(contextManager);
  }

  setGeminiService(geminiService: IAIService): void {
    this.metricsCollector.setGeminiService(geminiService);
    this.statusEvaluator.setGeminiService(geminiService);
  }

  setDiscordConnected(connected: boolean): void {
    this.metricsCollector.setDiscordConnected(connected);
  }

  // ============================================================================
  // Performance Tracking
  // ============================================================================

  recordResponseTime(responseTimeMs: number): void {
    this.metricsCollector.recordResponseTime(responseTimeMs);
  }

  recordError(): void {
    this.metricsCollector.recordError();
  }

  recordRequest(): void {
    this.metricsCollector.recordRequest();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  async getCurrentMetrics(): Promise<HealthMetrics> {
    return await this.metricsCollector.collectHealthMetrics();
  }

  async getHistoricalMetrics(fromTime?: number, toTime?: number): Promise<HealthSnapshot[]> {
    const release = await this.stateMutex.acquire();
    try {
      const now = Date.now();
      const from = fromTime || (now - (24 * 60 * 60 * 1000)); // Default: last 24 hours
      const to = toTime || now;

      const snapshots: HealthSnapshot[] = [];
      for (const [timestamp, snapshot] of this.metricsData.entries()) {
        if (timestamp >= from && timestamp <= to) {
          snapshots.push(snapshot);
        }
      }

      return snapshots.sort((a, b) => a.timestamp - b.timestamp);
    } finally {
      release();
    }
  }

  getAlertConfig(): AlertConfig {
    return { ...this.alertConfig };
  }

  updateAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
    logger.info('Health monitor alert configuration updated', this.alertConfig);
  }

  /**
   * Export metrics for analysis
   */
  async exportMetrics(
    from: number = Date.now() - (7 * 24 * 60 * 60 * 1000),
    to: number = Date.now(),
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const snapshots = await this.getHistoricalMetrics(from, to);
    return this.reportGenerator.exportMetrics(snapshots, format);
  }

  /**
   * Get compression statistics
   */
  async getCompressionStats(): Promise<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    savedBytes: number;
    savedPercentage: number;
  }> {
    return this.reportGenerator.getCompressionStats();
  }

  /**
   * Get DataStore performance baseline
   */
  getDataStorePerformanceBaseline() {
    return this.metricsCollector.getDataStorePerformanceBaseline();
  }

  // ============================================================================
  // Core Operations
  // ============================================================================

  private async collectMetricsSnapshot(): Promise<void> {
    try {
      const metrics = await this.metricsCollector.collectHealthMetrics();

      const release = await this.stateMutex.acquire();
      try {
        const snapshot: HealthSnapshot = {
          timestamp: Date.now(),
          metrics,
        };

        this.metricsData.set(snapshot.timestamp, snapshot);

        // Check for alerts
        await this.statusEvaluator.checkAlerts(metrics, this.alertConfig);

        // Trim data if needed (keep in memory for fast access)
        if (this.metricsData.size > this.MAX_SNAPSHOTS) {
          const sortedKeys = Array.from(this.metricsData.keys()).sort();
          const toRemove = sortedKeys.slice(0, sortedKeys.length - this.MAX_SNAPSHOTS);
          for (const key of toRemove) {
            this.metricsData.delete(key);
          }
        }
      } finally {
        release();
      }

      // Async save (don't block metrics collection)
      this.saveMetricsData().catch(error => {
        logger.error('Failed to save metrics data:', error);
      });

    } catch (error) {
      logger.error('Error during metrics collection:', error);
    }
  }

  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const cutoffTime = now - (this.RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const release = await this.stateMutex.acquire();
    try {
      let removedCount = 0;
      for (const [timestamp] of this.metricsData.entries()) {
        if (timestamp < cutoffTime) {
          this.metricsData.delete(timestamp);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        logger.info(`Health monitor cleanup: removed ${removedCount} old snapshots`);
      }
    } finally {
      release();
    }

    // Clear old alert consecutive counts
    this.statusEvaluator.clearOldAlertCounts();
  }

  // ============================================================================
  // Data Persistence
  // ============================================================================

  private async ensureDataDirectory(): Promise<void> {
    const dir = path.dirname(this.dataFile);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create health monitor data directory:', error);
    }
  }

  private async saveMetricsData(): Promise<void> {
    const release = await this.ioMutex.acquire();
    try {
      // Convert snapshots to array
      const snapshotsArray = Array.from(this.metricsData.values());

      // Aggregate metrics before saving to reduce storage size
      const aggregatedSnapshots = await this.reportGenerator.aggregateMetrics(snapshotsArray);

      // Convert Map to serializable format for alertState
      const alertState = this.statusEvaluator.getAlertState();
      const serializableAlertState = {
        ...alertState,
        consecutiveAlerts: Object.fromEntries(alertState.consecutiveAlerts)
      };

      const data: HealthMetricsData = {
        snapshots: aggregatedSnapshots,
        alertState: serializableAlertState as unknown as AlertState,
        lastSaved: Date.now(),
      };

      // Save using DataStore with compression
      await this.metricsDataStore.save(data);

      const stats = await this.metricsDataStore.getStats();
      if (stats) {
        logger.info(`Saved health metrics with compression. Size: ${stats.size} bytes`);
      }
    } catch (error) {
      logger.error('Failed to save health monitor data:', error);
    } finally {
      release();
    }
  }

  private async loadMetricsData(): Promise<void> {
    try {
      // Load data using DataStore with automatic decompression
      const data = await this.metricsDataStore.load();

      if (data && data.snapshots && Array.isArray(data.snapshots)) {
        // Apply TTL cleanup - remove snapshots older than 30 days
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        let loadedCount = 0;
        let expiredCount = 0;

        for (const snapshot of data.snapshots) {
          if (snapshot.timestamp && snapshot.metrics) {
            if (snapshot.timestamp >= thirtyDaysAgo) {
              this.metricsData.set(snapshot.timestamp, snapshot);
              loadedCount++;
            } else {
              expiredCount++;
            }
          }
        }

        logger.info(`Loaded ${loadedCount} health metric snapshots from disk (${expiredCount} expired)`);

        // Restore alert state
        if (data.alertState) {
          this.statusEvaluator.setAlertState({
            ...data.alertState,
            consecutiveAlerts: new Map(Object.entries(data.alertState.consecutiveAlerts || {})),
          } as AlertState);
        }
      } else {
        logger.info('No existing health monitor data found, starting fresh');
      }
    } catch (error) {
      logger.error('Failed to load health monitor data:', error);
      logger.info('Starting with fresh health monitor data');
    }
  }

  // ============================================================================
  // Health Check Implementation (BaseService)
  // ============================================================================

  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();

    try {
      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = memoryUsage.rss / (1024 * 1024);

      // Check if memory usage is excessive
      if (memoryUsageMB > this.alertConfig.memoryThreshold) {
        errors.push(`High memory usage: ${memoryUsageMB.toFixed(1)}MB (threshold: ${this.alertConfig.memoryThreshold}MB)`);
      }

      // Check metrics data size
      const metricsCount = this.metricsData.size;

      // Check if metrics collection is working
      if (metricsCount === 0) {
        errors.push('No metrics data collected yet');
      }

      // Check if we have recent metrics
      const lastMetricTime = Math.max(...Array.from(this.metricsData.keys()));
      if (lastMetricTime && Date.now() - lastMetricTime > (this.COLLECTION_INTERVAL_MS * 2)) {
        errors.push(`Stale metrics data: last collection ${Math.round((Date.now() - lastMetricTime) / 1000)}s ago`);
      }
    } catch (error) {
      errors.push(`Health check error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return errors;
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    try {
      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = memoryUsage.rss / (1024 * 1024);

      // Check metrics data size
      const metricsCount = this.metricsData.size;

      // Service status
      const serviceStatus = {
        dataStoreInitialized: !!this.metricsDataStore,
        memoryUsageMB: Math.round(memoryUsageMB * 100) / 100,
        metricsCount,
        maxSnapshots: this.MAX_SNAPSHOTS,
        alertsEnabled: this.alertConfig.enabled,
      };

      return {
        healthMonitor: serviceStatus
      };
    } catch (error) {
      return {
        healthMonitor: {
          errorDetails: error instanceof Error ? error.stack : String(error),
        }
      };
    }
  }

  // ============================================================================
  // Resource Tracking Integration
  // ============================================================================

  /**
   * Register health monitor specific resources with global resource manager
   */
  private registerHealthMonitorResources(): void {
    // Register data store as critical resource
    globalResourceManager.register({
      type: 'health-data-store',
      id: 'main',
      cleanup: async () => {
        try {
          await this.saveMetricsData();
          logger.info('Health monitor data store cleanup completed');
        } catch (error) {
          logger.error('Failed to cleanup health monitor data store', error);
        }
      },
      priority: 'critical',
      metadata: {
        service: 'HealthMonitor',
        dataFile: this.dataFile,
        maxSnapshots: this.MAX_SNAPSHOTS
      }
    });

    // Register metrics collection process
    globalResourceManager.register({
      type: 'health-metrics-collection',
      id: 'main',
      cleanup: async () => {
        try {
          // Perform final metrics collection
          await this.collectMetricsSnapshot();
          logger.info('Health monitor metrics collection cleanup completed');
        } catch (error) {
          logger.error('Failed to cleanup health monitor metrics collection', error);
        }
      },
      priority: 'high',
      metadata: {
        service: 'HealthMonitor',
        collectionInterval: this.COLLECTION_INTERVAL_MS,
        retentionDays: this.RETENTION_DAYS
      }
    });

    // Register alert system if enabled
    if (this.alertConfig.enabled) {
      globalResourceManager.register({
        type: 'health-alert-system',
        id: 'main',
        cleanup: async () => {
          try {
            // Final alert processing
            logger.info('Health monitor alert system cleanup completed');
          } catch (error) {
            logger.error('Failed to cleanup health monitor alert system', error);
          }
        },
        priority: 'medium',
        metadata: {
          service: 'HealthMonitor',
          alertConfig: this.alertConfig
        }
      });
    }

    logger.debug('Health monitor resources registered with global resource manager', {
      dataStore: true,
      metricsCollection: true,
      alertSystem: this.alertConfig.enabled
    });
  }

  /**
   * Monitor resource health and detect potential issues
   */
  private async monitorResourceHealth(): Promise<void> {
    try {
      const globalResourceStats = globalResourceManager.getResourceStats();
      const serviceResourceStats = this.resources.getResourceStats();

      // Check for resource leaks
      if (globalResourceStats.leakDetected || serviceResourceStats.leakDetected) {
        logger.warn('Resource leaks detected in health monitoring', {
          global: globalResourceStats.leakDetected,
          service: serviceResourceStats.leakDetected,
          globalResources: globalResourceStats.total,
          serviceResources: serviceResourceStats.total
        });
      }

      // Check for excessive resource usage
      const totalResources = globalResourceStats.total + serviceResourceStats.total;
      const RESOURCE_WARNING_THRESHOLD = 1000;

      if (totalResources > RESOURCE_WARNING_THRESHOLD) {
        logger.warn('High resource usage detected', {
          totalResources,
          threshold: RESOURCE_WARNING_THRESHOLD,
          globalByType: globalResourceStats.byType,
          serviceByType: serviceResourceStats.byType
        });
      }

      // Check for failed cleanups
      const totalFailedCleanups = globalResourceStats.failedCleanups + serviceResourceStats.failedCleanups;
      if (totalFailedCleanups > 0) {
        logger.warn('Resource cleanup failures detected', {
          globalFailures: globalResourceStats.failedCleanups,
          serviceFailures: serviceResourceStats.failedCleanups,
          total: totalFailedCleanups
        });
      }

      // Monitor data store health
      if (this.metricsDataStore) {
        try {
          const dataStoreMetrics = this.metricsCollector.getDetailedDataStoreMetrics();

          // Check for data store resource issues
          if (dataStoreMetrics && typeof dataStoreMetrics === 'object') {
            const metrics = dataStoreMetrics as Record<string, any>;

            if (metrics.compressionRatio && metrics.compressionRatio < 0.5) {
              logger.info('Data store compression efficiency is high', {
                compressionRatio: metrics.compressionRatio
              });
            }

            if (metrics.cleanupCount && metrics.cleanupCount > 10) {
              logger.warn('Frequent data store cleanups detected', {
                cleanupCount: metrics.cleanupCount
              });
            }
          }
        } catch (error) {
          logger.warn('Failed to monitor data store health', error);
        }
      }

    } catch (error) {
      logger.error('Resource health monitoring failed', error);
    }
  }

  /**
   * Cleanup health monitor specific resources
   */
  private async cleanupHealthMonitorResources(): Promise<void> {
    try {
      logger.info('Starting health monitor resource cleanup');

      // Cleanup global resources registered by this service
      const resourceTypes = ['health-data-store', 'health-metrics-collection', 'health-alert-system'];

      for (const type of resourceTypes) {
        try {
          await globalResourceManager.cleanup(type);
          logger.debug(`Cleaned up ${type} resources`);
        } catch (error) {
          logger.warn(`Failed to cleanup ${type} resources`, error);
        }
      }



      // Clear in-memory data
      this.metricsData.clear();

      logger.info('Health monitor resource cleanup completed');
    } catch (error) {
      logger.error('Health monitor resource cleanup failed', error);
      throw error;
    }
  }

  /**
   * Get comprehensive resource statistics for health reporting
   */
  getResourceStatistics() {
    const now = Date.now();

    return {
      global: globalResourceManager.getResourceStats(),
      service: this.resources.getResourceStats(),
      healthMonitor: {
        dataStoreSize: this.metricsData.size,
        metricsCount: this.metricsData.size,
        alertsEnabled: this.alertConfig.enabled,
        uptime: this.lifecycleManager.getLifecycleStatus().uptime,
        resourceTrackingEnabled: true
      }
    };
  }

  /**
   * Perform emergency resource cleanup if needed
   */
  async performEmergencyResourceCleanup(): Promise<void> {
    logger.warn('Performing emergency resource cleanup for HealthMonitor');

    try {
      // Emergency cleanup of global resources
      await globalResourceManager.emergencyCleanup();

      // Emergency cleanup of service resources
      await this.resources.cleanup(undefined, { force: true, timeout: 5000 });

      // Force save any pending data
      try {
        await this.saveMetricsData();
      } catch (error) {
        logger.error('Failed to save data during emergency cleanup', error);
      }

      logger.info('Emergency resource cleanup completed');
    } catch (error) {
      logger.error('Emergency resource cleanup failed', error);
      throw error;
    }
  }
}