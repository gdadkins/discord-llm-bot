/**
 * Health Status Evaluator
 * 
 * Responsible for evaluating health metrics against configured thresholds,
 * triggering alerts, and attempting self-healing operations. Implements
 * alert cooldowns and consecutive alert tracking.
 * 
 * @module HealthStatusEvaluator
 */

import { logger } from '../../utils/logger';
import type { IAIService } from '../interfaces/AIServiceInterfaces';
import type {
  HealthMetrics,
  AlertConfig,
  AlertState,
  AlertType,
  IHealthStatusEvaluator,
  DetailedDataStoreMetrics,
  DataStoreHealthResult
} from './types';
import { HEALTH_CONSTANTS } from './types';

/**
 * Implementation of health status evaluation and alerting
 */
export class HealthStatusEvaluator implements IHealthStatusEvaluator {
  // Alert state
  private alertState: AlertState = {
    lastMemoryAlert: 0,
    lastErrorRateAlert: 0,
    lastResponseTimeAlert: 0,
    lastDiskSpaceAlert: 0,
    consecutiveAlerts: new Map(),
  };
  
  // Service references for self-healing
  private geminiService: IAIService | null = null;
  
  // DataStore analysis helpers
  private dataStoreMetricsProvider: {
    getDetailedMetrics: () => DetailedDataStoreMetrics | null;
    getHealthResult: () => DataStoreHealthResult | null;
  } | null = null;
  
  /**
   * Set Gemini service for self-healing operations
   */
  setGeminiService(geminiService: IAIService): void {
    this.geminiService = geminiService;
  }
  
  /**
   * Set DataStore metrics provider
   */
  setDataStoreMetricsProvider(provider: {
    getDetailedMetrics: () => DetailedDataStoreMetrics | null;
    getHealthResult: () => DataStoreHealthResult | null;
  }): void {
    this.dataStoreMetricsProvider = provider;
  }
  
  /**
   * Get current alert state
   */
  getAlertState(): AlertState {
    return this.alertState;
  }
  
  /**
   * Set alert state (for restoration from storage)
   */
  setAlertState(state: AlertState): void {
    this.alertState = {
      ...state,
      consecutiveAlerts: new Map(
        state.consecutiveAlerts instanceof Map 
          ? state.consecutiveAlerts 
          : Object.entries(state.consecutiveAlerts || {})
      ),
    };
  }
  
  // ============================================================================
  // Alert Checking
  // ============================================================================
  
  /**
   * Check health metrics and trigger alerts
   */
  async checkAlerts(metrics: HealthMetrics, alertConfig: AlertConfig): Promise<void> {
    if (!alertConfig.enabled) return;
    
    const now = Date.now();
    
    // Check memory usage
    await this.checkMemoryAlert(metrics, alertConfig, now);
    
    // Check error rate
    await this.checkErrorRateAlert(metrics, alertConfig, now);
    
    // Check response time
    await this.checkResponseTimeAlert(metrics, alertConfig, now);
    
    // Check API health
    await this.checkApiHealthAlert(metrics, now);
    
    // Check DataStore health
    await this.checkDataStoreAlerts(metrics, now);
  }
  
  /**
   * Check memory usage and trigger alert if needed
   */
  private async checkMemoryAlert(
    metrics: HealthMetrics, 
    alertConfig: AlertConfig, 
    now: number
  ): Promise<void> {
    const memoryUsageMB = metrics.memoryUsage.rss / (1024 * 1024);
    
    if (memoryUsageMB > alertConfig.memoryThreshold && 
        now - this.alertState.lastMemoryAlert > HEALTH_CONSTANTS.ALERT_COOLDOWN_MS) {
      
      await this.triggerAlert(
        'memory', 
        `High memory usage: ${memoryUsageMB.toFixed(1)}MB (threshold: ${alertConfig.memoryThreshold}MB)`, 
        metrics
      );
      this.alertState.lastMemoryAlert = now;
    }
  }
  
  /**
   * Check error rate and trigger alert if needed
   */
  private async checkErrorRateAlert(
    metrics: HealthMetrics, 
    alertConfig: AlertConfig, 
    now: number
  ): Promise<void> {
    if (metrics.errorRate > alertConfig.errorRateThreshold && 
        now - this.alertState.lastErrorRateAlert > HEALTH_CONSTANTS.ALERT_COOLDOWN_MS) {
      
      await this.triggerAlert(
        'error_rate', 
        `High error rate: ${metrics.errorRate.toFixed(1)}% (threshold: ${alertConfig.errorRateThreshold}%)`, 
        metrics
      );
      this.alertState.lastErrorRateAlert = now;
    }
  }
  
  /**
   * Check response time and trigger alert if needed
   */
  private async checkResponseTimeAlert(
    metrics: HealthMetrics, 
    alertConfig: AlertConfig, 
    now: number
  ): Promise<void> {
    if (metrics.responseTime.p95 > alertConfig.responseTimeThreshold && 
        now - this.alertState.lastResponseTimeAlert > HEALTH_CONSTANTS.ALERT_COOLDOWN_MS) {
      
      await this.triggerAlert(
        'response_time', 
        `High response time: ${metrics.responseTime.p95}ms (threshold: ${alertConfig.responseTimeThreshold}ms)`, 
        metrics
      );
      this.alertState.lastResponseTimeAlert = now;
    }
  }
  
  /**
   * Check API health and trigger alert if needed
   */
  private async checkApiHealthAlert(metrics: HealthMetrics, _now: number): Promise<void> {
    if (!metrics.apiHealth.gemini || !metrics.apiHealth.discord) {
      const unhealthyServices = [];
      if (!metrics.apiHealth.gemini) unhealthyServices.push('Gemini');
      if (!metrics.apiHealth.discord) unhealthyServices.push('Discord');
      
      await this.triggerAlert(
        'api_health', 
        `Unhealthy services: ${unhealthyServices.join(', ')}`, 
        metrics
      );
    }
  }
  
  /**
   * Check DataStore health and performance
   */
  private async checkDataStoreAlerts(metrics: HealthMetrics, _now: number): Promise<void> {
    // Check unhealthy stores
    if (metrics.dataStoreMetrics.unhealthyStores > 0) {
      const unhealthyDetails = this.getUnhealthyDataStoreDetails();
      await this.triggerAlert(
        'datastore_health', 
        `Unhealthy DataStores: ${metrics.dataStoreMetrics.unhealthyStores} of ${metrics.dataStoreMetrics.totalStores}${unhealthyDetails}`, 
        metrics
      );
    }
    
    // Check DataStore error rate
    const totalOperations = metrics.dataStoreMetrics.totalSaveOperations + 
                          metrics.dataStoreMetrics.totalLoadOperations;
    const dataStoreErrorRate = totalOperations > 0 
      ? (metrics.dataStoreMetrics.totalErrors / totalOperations) * 100 
      : 0;
    
    if (dataStoreErrorRate > 5.0 && metrics.dataStoreMetrics.totalErrors > 10) {
      await this.triggerAlert(
        'datastore_errors', 
        `High DataStore error rate: ${dataStoreErrorRate.toFixed(1)}% (${metrics.dataStoreMetrics.totalErrors} errors in ${totalOperations} operations)`, 
        metrics
      );
    }
    
    // Check DataStore latency
    if (metrics.dataStoreMetrics.avgSaveLatency > 1000 || 
        metrics.dataStoreMetrics.avgLoadLatency > 500) {
      const slowStores = this.getSlowDataStores();
      await this.triggerAlert(
        'datastore_latency', 
        `High DataStore latency - Save: ${metrics.dataStoreMetrics.avgSaveLatency.toFixed(0)}ms, Load: ${metrics.dataStoreMetrics.avgLoadLatency.toFixed(0)}ms${slowStores}`, 
        metrics
      );
    }
    
    // Check DataStore capacity
    const totalDataSize = metrics.dataStoreMetrics.totalBytesWritten + 
                         metrics.dataStoreMetrics.totalBytesRead;
    if (totalDataSize > 100 * 1024 * 1024) { // 100MB threshold
      await this.triggerAlert(
        'datastore_capacity', 
        `DataStore capacity warning: ${(totalDataSize / (1024 * 1024)).toFixed(1)}MB total data processed`, 
        metrics
      );
    }
    
    // Check for stale DataStores
    const staleStores = this.getStaleDataStores();
    if (staleStores.length > 0) {
      await this.triggerAlert(
        'datastore_stale', 
        `Stale DataStores detected: ${staleStores.length} stores not accessed in 24h`, 
        metrics
      );
    }
  }
  
  // ============================================================================
  // Alert Management
  // ============================================================================
  
  /**
   * Trigger an alert and attempt self-healing
   */
  private async triggerAlert(
    type: AlertType, 
    message: string, 
    metrics: HealthMetrics
  ): Promise<void> {
    logger.warn(`HEALTH ALERT [${type}]: ${message}`, {
      type,
      message,
      metrics: {
        memoryUsageMB: (metrics.memoryUsage.rss / (1024 * 1024)).toFixed(1),
        errorRate: metrics.errorRate.toFixed(1),
        responseTimeP95: metrics.responseTime.p95,
        apiHealth: metrics.apiHealth,
      },
    });
    
    // Increment consecutive alerts
    const consecutiveCount = (this.alertState.consecutiveAlerts.get(type) || 0) + 1;
    this.alertState.consecutiveAlerts.set(type, consecutiveCount);
    
    // Attempt self-healing for certain alert types
    await this.attemptSelfHealing(type, consecutiveCount, metrics);
  }
  
  /**
   * Clear old consecutive alert counts
   */
  clearOldAlertCounts(): void {
    for (const [alertType, count] of this.alertState.consecutiveAlerts.entries()) {
      if (count === 0) {
        this.alertState.consecutiveAlerts.delete(alertType);
      }
    }
  }
  
  // ============================================================================
  // Self-Healing
  // ============================================================================
  
  /**
   * Attempt self-healing for specific alert type
   */
  async attemptSelfHealing(
    type: string, 
    consecutiveCount: number, 
    metrics: HealthMetrics
  ): Promise<void> {
    logger.info(`Attempting self-healing for alert type: ${type} (consecutive: ${consecutiveCount})`);
    
    try {
      switch (type) {
      case 'memory':
        await this.healMemoryIssues();
        break;
      case 'error_rate':
        await this.healErrorRateIssues();
        break;
      case 'response_time':
        await this.healResponseTimeIssues();
        break;
      case 'api_health':
        await this.healApiHealthIssues(metrics);
        break;
      default:
        logger.debug(`No self-healing available for alert type: ${type}`);
      }
    } catch (error) {
      logger.error(`Self-healing failed for ${type}:`, error);
    }
  }
  
  /**
   * Attempt to heal memory issues
   */
  private async healMemoryIssues(): Promise<void> {
    logger.info('Attempting memory usage self-healing');
    
    // Clear caches if available
    if (this.geminiService) {
      this.geminiService.clearCache();
      logger.info('Cleared Gemini response cache');
    }
    
    // Trigger garbage collection if available
    if (global.gc) {
      global.gc();
      logger.info('Triggered manual garbage collection');
    }
  }
  
  /**
   * Attempt to heal error rate issues
   */
  private async healErrorRateIssues(): Promise<void> {
    logger.info('Attempting error rate self-healing');
    // In a real implementation, this might reset error tracking or
    // implement circuit breaker patterns
  }
  
  /**
   * Attempt to heal response time issues
   */
  private async healResponseTimeIssues(): Promise<void> {
    logger.info('Attempting response time self-healing');
    
    // Clear caches to potentially improve response times
    if (this.geminiService) {
      this.geminiService.clearCache();
      logger.info('Cleared response cache to improve performance');
    }
  }
  
  /**
   * Attempt to heal API health issues
   */
  private async healApiHealthIssues(metrics: HealthMetrics): Promise<void> {
    logger.info('Attempting API health self-healing', { apiHealth: metrics.apiHealth });
    
    if (!metrics.apiHealth.discord) {
      logger.warn('Discord API unhealthy - consider reconnection');
    }
    
    if (!metrics.apiHealth.gemini) {
      logger.warn('Gemini API unhealthy - check API key and quotas');
    }
  }
  
  // ============================================================================
  // DataStore Analysis Helpers
  // ============================================================================
  
  /**
   * Get details about unhealthy DataStores
   */
  private getUnhealthyDataStoreDetails(): string {
    if (!this.dataStoreMetricsProvider) return '';
    
    const healthResult = this.dataStoreMetricsProvider.getHealthResult();
    if (!healthResult || healthResult.errors.length === 0) return '';
    
    const errorSummary = healthResult.errors
      .slice(0, 3) // Limit to 3 for brevity
      .map(error => `${error.filePath}: ${error.error.substring(0, 50)}`)
      .join(', ');
    
    const remaining = healthResult.errors.length - 3;
    const suffix = remaining > 0 ? ` (+${remaining} more)` : '';
    
    return ` [${errorSummary}${suffix}]`;
  }
  
  /**
   * Get details about slow DataStores
   */
  private getSlowDataStores(): string {
    if (!this.dataStoreMetricsProvider) return '';
    
    const detailedMetrics = this.dataStoreMetricsProvider.getDetailedMetrics();
    if (!detailedMetrics) return '';
    
    const slowStores = detailedMetrics.stores
      .filter(store => {
        const metrics = store.metrics;
        return metrics.avgSaveLatency > 1000 || metrics.avgLoadLatency > 500;
      })
      .slice(0, 3) // Limit to 3 for brevity
      .map(store => {
        const metrics = store.metrics;
        return `${store.type}(${store.filePath}): save=${metrics.avgSaveLatency.toFixed(0)}ms, load=${metrics.avgLoadLatency.toFixed(0)}ms`;
      });
    
    return slowStores.length > 0 ? ` [${slowStores.join(', ')}]` : '';
  }
  
  /**
   * Get DataStores that haven't been accessed recently
   */
  private getStaleDataStores(): Array<{ id: string; type: string; filePath: string; lastAccessed: Date }> {
    if (!this.dataStoreMetricsProvider) return [];
    
    const detailedMetrics = this.dataStoreMetricsProvider.getDetailedMetrics();
    if (!detailedMetrics) return [];
    
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    return detailedMetrics.stores
      .filter(store => store.lastAccessed.getTime() < twentyFourHoursAgo)
      .map(store => ({
        id: store.id,
        type: store.type,
        filePath: store.filePath,
        lastAccessed: store.lastAccessed,
      }));
  }
}