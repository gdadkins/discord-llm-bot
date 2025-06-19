/**
 * Error Aggregator Service - Centralized error collection and reporting
 * 
 * This service provides comprehensive error aggregation capabilities:
 * - Time-windowed error collection with automatic cleanup
 * - Error deduplication and counting by service/operation/code
 * - Sample collection for debugging purposes
 * - User impact tracking (affected user count)
 * - Error rate calculation and trending
 * - Comprehensive reporting for monitoring and alerting
 * 
 * ## Design Principles
 * 1. **Memory Efficient** - Automatic cleanup of old error data
 * 2. **High Performance** - Optimized for high-frequency error recording
 * 3. **Rich Context** - Preserves error samples and user impact data
 * 4. **Monitoring Ready** - Reports designed for dashboard integration
 * 5. **Thread Safe** - Safe for concurrent error recording
 * 
 * ## Usage
 * ```typescript
 * // Record errors from standardized service responses
 * if (!result.success) {
 *   errorAggregator.recordError(result.error);
 * }
 * 
 * // Generate monitoring report
 * const report = errorAggregator.getReport();
 * console.log(`Total errors: ${report.summary.total}`);
 * ```
 */

import { 
  ServiceError, 
  AggregatedError, 
  ErrorReport,
  ServiceErrorCode 
} from './interfaces/ServiceResponses';
import { logger } from '../utils/logger';
import { IService, ServiceHealthStatus } from './interfaces/CoreServiceInterfaces';

// ============================================================================
// Error Aggregator Implementation
// ============================================================================

/**
 * Centralized error aggregation and reporting service
 * 
 * Collects errors from across the application and provides aggregated
 * reporting for monitoring, alerting, and debugging purposes.
 */
export class ErrorAggregator implements IService {
  private errors = new Map<string, AggregatedError>();
  private readonly AGGREGATION_WINDOW = 60000; // 1 minute
  private readonly MAX_SAMPLES_PER_ERROR = 5;
  private readonly MAX_REQUEST_IDS = 10;
  private cleanupInterval?: NodeJS.Timeout;
  private isInitialized = false;
  
  // ============================================================================
  // Service Lifecycle
  // ============================================================================
  
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    // Start periodic cleanup of old errors
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldErrors();
    }, this.AGGREGATION_WINDOW);
    
    this.isInitialized = true;
    logger.info('ErrorAggregator initialized with cleanup interval', {
      aggregationWindowMs: this.AGGREGATION_WINDOW,
      maxSamplesPerError: this.MAX_SAMPLES_PER_ERROR
    });
  }
  
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    // Final cleanup and stats logging
    const finalStats = this.getAggregationStats();
    logger.info('ErrorAggregator shutting down', {
      finalStats,
      aggregatedErrorCount: this.errors.size
    });
    
    this.errors.clear();
    this.isInitialized = false;
  }
  
  getHealthStatus(): ServiceHealthStatus {
    const stats = this.getAggregationStats();
    const criticalErrorCount = this.getCriticalErrorCount();
    
    return {
      healthy: criticalErrorCount < 10, // Unhealthy if too many critical errors
      name: 'ErrorAggregator',
      errors: criticalErrorCount >= 10 ? [`High critical error count: ${criticalErrorCount}`] : [],
      metrics: {
        ...stats,
        isInitialized: this.isInitialized,
        criticalErrorCount
      }
    };
  }
  
  // ============================================================================
  // Core Error Recording
  // ============================================================================
  
  /**
   * Records a service error for aggregation and reporting
   * 
   * Deduplicates errors by service, operation, and error code, maintaining
   * counts, samples, and user impact tracking within the aggregation window.
   * 
   * @param error - Service error to record
   */
  recordError(error: ServiceError): void {
    if (!this.isInitialized) {
      logger.warn('ErrorAggregator not initialized, skipping error recording', {
        service: error.service,
        operation: error.operation,
        code: error.code
      });
      return;
    }
    
    const key = this.createErrorKey(error);
    const now = Date.now();
    
    let aggregated = this.errors.get(key);
    
    // Create new aggregated error or reset if outside window
    if (!aggregated || now - aggregated.firstSeen > this.AGGREGATION_WINDOW) {
      aggregated = {
        service: error.service,
        operation: error.operation,
        code: error.code,
        count: 0,
        firstSeen: now,
        lastSeen: now,
        samples: [],
        userIds: new Set(),
        requestIds: []
      };
      this.errors.set(key, aggregated);
    }
    
    // Update aggregated data
    aggregated.count++;
    aggregated.lastSeen = now;
    
    // Add sample if we have room
    if (aggregated.samples.length < this.MAX_SAMPLES_PER_ERROR) {
      aggregated.samples.push(error);
    }
    
    // Track affected user if available
    if (error.details?.userId && typeof error.details.userId === 'string') {
      aggregated.userIds.add(error.details.userId);
    }
    
    // Track request ID if available (with limit)
    if (error.requestId && aggregated.requestIds.length < this.MAX_REQUEST_IDS) {
      aggregated.requestIds.push(error.requestId);
    }
    
    // Log high-severity errors immediately
    if (error.severity === 'critical' || error.severity === 'high') {
      logger.warn('High-severity error recorded', {
        key,
        severity: error.severity,
        message: error.message,
        count: aggregated.count,
        service: error.service,
        operation: error.operation
      });
    }
  }
  
  // ============================================================================
  // Reporting and Analytics
  // ============================================================================
  
  /**
   * Generates comprehensive error report for monitoring
   * 
   * Includes aggregated error data, summary statistics, and top errors
   * sorted by frequency and impact.
   * 
   * @returns Complete error report with statistics
   */
  getReport(): ErrorReport {
    const now = Date.now();
    const report: ErrorReport = {
      timestamp: now,
      errors: [],
      summary: {
        total: 0,
        byService: {},
        bySeverity: {},
        topErrors: []
      }
    };
    
    // Process all aggregated errors
    this.errors.forEach((aggregated, _key) => {
      // Skip expired errors
      if (now - aggregated.lastSeen > this.AGGREGATION_WINDOW) {
        return; // Use return instead of continue in forEach
      }
      
      const windowDurationMs = aggregated.lastSeen - aggregated.firstSeen;
      const windowDurationSec = Math.max(windowDurationMs / 1000, 1); // Avoid division by zero
      
      const errorData = {
        ...aggregated,
        affectedUsers: aggregated.userIds.size,
        errorRate: aggregated.count / windowDurationSec
      };
      
      report.errors.push(errorData);
      
      // Update summary statistics
      report.summary.total += aggregated.count;
      
      // Count by service
      report.summary.byService[aggregated.service] = 
        (report.summary.byService[aggregated.service] || 0) + aggregated.count;
      
      // Count by severity (estimate from samples)
      const severity = this.estimateSeverity(aggregated);
      report.summary.bySeverity[severity] = 
        (report.summary.bySeverity[severity] || 0) + aggregated.count;
    });
    
    // Generate top errors list
    report.summary.topErrors = report.errors
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(error => ({
        key: this.createErrorKey(error),
        count: error.count,
        errorRate: error.errorRate
      }));
    
    return report;
  }
  
  /**
   * Gets errors for a specific service
   * 
   * @param serviceName - Name of service to filter by
   * @returns Array of aggregated errors for the service
   */
  getErrorsForService(serviceName: string): Array<AggregatedError & { affectedUsers: number; errorRate: number }> {
    const now = Date.now();
    const serviceErrors: Array<AggregatedError & { affectedUsers: number; errorRate: number }> = [];
    
    this.errors.forEach((aggregated, _key) => {
      if (aggregated.service === serviceName && now - aggregated.lastSeen <= this.AGGREGATION_WINDOW) {
        const windowDurationSec = Math.max((aggregated.lastSeen - aggregated.firstSeen) / 1000, 1);
        serviceErrors.push({
          ...aggregated,
          affectedUsers: aggregated.userIds.size,
          errorRate: aggregated.count / windowDurationSec
        });
      }
    });
    
    return serviceErrors.sort((a, b) => b.count - a.count);
  }
  
  /**
   * Gets current error statistics
   * 
   * @returns Summary statistics about aggregated errors
   */
  getAggregationStats(): {
    totalUniqueErrors: number;
    totalErrorInstances: number;
    activeErrors: number;
    errorsByService: Record<string, number>;
    criticalErrors: number;
    } {
    const now = Date.now();
    const stats = {
      totalUniqueErrors: this.errors.size,
      totalErrorInstances: 0,
      activeErrors: 0,
      errorsByService: {} as Record<string, number>,
      criticalErrors: 0
    };
    
    this.errors.forEach((aggregated, _key) => {
      stats.totalErrorInstances += aggregated.count;
      
      if (now - aggregated.lastSeen <= this.AGGREGATION_WINDOW) {
        stats.activeErrors++;
        
        stats.errorsByService[aggregated.service] = 
          (stats.errorsByService[aggregated.service] || 0) + aggregated.count;
        
        // Count critical errors based on samples
        const hasCriticalSample = aggregated.samples.some(sample => sample.severity === 'critical');
        if (hasCriticalSample) {
          stats.criticalErrors++;
        }
      }
    });
    
    return stats;
  }
  
  // ============================================================================
  // Utility and Maintenance
  // ============================================================================
  
  /**
   * Manually triggers cleanup of old error data
   * 
   * Removes errors that are outside the aggregation window.
   * Called automatically by cleanup interval.
   */
  cleanupOldErrors(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    const keysToDelete: string[] = [];
    this.errors.forEach((aggregated, key) => {
      if (now - aggregated.lastSeen > this.AGGREGATION_WINDOW) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.errors.delete(key);
      cleanedCount++;
    });
    
    if (cleanedCount > 0) {
      logger.debug('Cleaned up old aggregated errors', {
        cleanedCount,
        remainingErrors: this.errors.size
      });
    }
  }
  
  /**
   * Clears all aggregated error data
   * 
   * Useful for testing or manual reset scenarios.
   */
  clearAllErrors(): void {
    const previousCount = this.errors.size;
    this.errors.clear();
    
    logger.info('Cleared all aggregated errors', {
      previousCount,
      timestamp: Date.now()
    });
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  /**
   * Creates a unique key for error aggregation
   */
  private createErrorKey(error: { service: string; operation: string; code: ServiceErrorCode }): string {
    return `${error.service}:${error.operation}:${error.code}`;
  }
  
  /**
   * Estimates overall severity from error samples
   */
  private estimateSeverity(aggregated: AggregatedError): string {
    if (aggregated.samples.length === 0) {
      return 'medium';
    }
    
    // Use the highest severity found in samples
    const severities = aggregated.samples.map(sample => sample.severity);
    
    if (severities.includes('critical')) return 'critical';
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    return 'low';
  }
  
  /**
   * Gets count of critical errors for health checks
   */
  private getCriticalErrorCount(): number {
    const now = Date.now();
    let criticalCount = 0;
    
    this.errors.forEach((aggregated, _key) => {
      if (now - aggregated.lastSeen <= this.AGGREGATION_WINDOW) {
        const hasCriticalSample = aggregated.samples.some(sample => sample.severity === 'critical');
        if (hasCriticalSample) {
          criticalCount += aggregated.count;
        }
      }
    });
    
    return criticalCount;
  }
}

// ============================================================================
// Export singleton instance for application-wide use
// ============================================================================

/**
 * Global error aggregator instance
 * 
 * Single instance used throughout the application for consistent
 * error collection and reporting.
 */
export const errorAggregator = new ErrorAggregator();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Records an error if the result indicates failure
 * 
 * Convenience function for automatic error recording from service results.
 * 
 * @param result - Service result to check and record
 */
export function recordServiceResult(result: { success: boolean; error?: ServiceError }): void {
  if (!result.success && result.error) {
    errorAggregator.recordError(result.error);
  }
}

/**
 * Creates a formatted error summary for logging
 * 
 * @param report - Error report to summarize
 * @returns Human-readable error summary
 */
export function formatErrorSummary(report: ErrorReport): string {
  const { summary } = report;
  
  if (summary.total === 0) {
    return 'No errors in current window';
  }
  
  const topService = Object.entries(summary.byService)
    .sort(([, a], [, b]) => b - a)[0];
  
  const topError = summary.topErrors[0];
  
  return [
    `${summary.total} total errors across ${Object.keys(summary.byService).length} services`,
    topService ? `Top service: ${topService[0]} (${topService[1]} errors)` : '',
    topError ? `Top error: ${topError.key} (${topError.count} occurrences, ${topError.errorRate.toFixed(2)} errors/sec)` : ''
  ].filter(Boolean).join(' | ');
}