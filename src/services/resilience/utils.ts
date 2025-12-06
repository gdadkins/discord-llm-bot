/**
 * Resilience Utility Functions
 * 
 * Common helper functions for resilience components
 */

import { DEGRADATION_CONSTANTS, GENERAL_CONSTANTS } from '../../utils/constants';
import type { HealthMetrics } from '../interfaces/HealthMonitoringInterfaces';
import type { DegradationDecision } from '../interfaces/GracefulDegradationInterfaces';

/**
 * Assess health metrics to determine degradation requirements
 */
export function assessHealthBasedDegradation(
  metrics: HealthMetrics,
  config: {
    memoryThresholdMB: number;
    errorRateThreshold: number;
    responseTimeThresholdMs: number;
  }
): DegradationDecision {
  const memoryUsageMB = metrics.memoryUsage.rss / GENERAL_CONSTANTS.BYTES_TO_MB;
  
  // Critical memory usage
  if (memoryUsageMB > config.memoryThresholdMB) {
    return {
      shouldDegrade: true,
      reason: `High memory usage: ${memoryUsageMB.toFixed(1)}MB`,
      severity: 'high'
    };
  }
  
  // High error rate
  if (metrics.errorRate > config.errorRateThreshold) {
    return {
      shouldDegrade: true,
      reason: `High error rate: ${metrics.errorRate.toFixed(1)}%`,
      severity: 'medium'
    };
  }
  
  // Slow response times
  if (metrics.responseTime.p95 > config.responseTimeThresholdMs) {
    return {
      shouldDegrade: true,
      reason: `Slow response times: ${metrics.responseTime.p95}ms P95`,
      severity: 'medium'
    };
  }
  
  // API health issues
  if (!metrics.apiHealth.gemini || !metrics.apiHealth.discord) {
    const unhealthyServices = [];
    if (!metrics.apiHealth.gemini) unhealthyServices.push('Gemini');
    if (!metrics.apiHealth.discord) unhealthyServices.push('Discord');
    
    return {
      shouldDegrade: true,
      reason: `Unhealthy services: ${unhealthyServices.join(', ')}`,
      severity: 'high'
    };
  }
  
  return {
    shouldDegrade: false,
    reason: 'Health metrics within acceptable ranges',
    severity: 'low'
  };
}

/**
 * Load degradation configuration from environment variables
 */
export function loadDegradationConfig(): {
  maxFailures: number;
  resetTimeoutMs: number;
  halfOpenMaxRetries: number;
  memoryThresholdMB: number;
  errorRateThreshold: number;
  responseTimeThresholdMs: number;
  maxQueueSize: number;
  maxQueueTimeMs: number;
  retryIntervalMs: number;
  maxRetries: number;
  enableCachedResponses: boolean;
  enableGenericFallbacks: boolean;
  enableMaintenanceMode: boolean;
  } {
  return {
    // Circuit breaker settings
    maxFailures: parseInt(process.env.DEGRADATION_MAX_FAILURES || String(DEGRADATION_CONSTANTS.DEFAULT_MAX_FAILURES)),
    resetTimeoutMs: parseInt(process.env.DEGRADATION_RESET_TIMEOUT_MS || String(DEGRADATION_CONSTANTS.DEFAULT_RESET_TIMEOUT_MS)),
    halfOpenMaxRetries: parseInt(process.env.DEGRADATION_HALF_OPEN_RETRIES || String(DEGRADATION_CONSTANTS.DEFAULT_HALF_OPEN_RETRIES)),
    
    // Health degradation triggers
    memoryThresholdMB: parseInt(process.env.DEGRADATION_MEMORY_THRESHOLD_MB || String(DEGRADATION_CONSTANTS.DEFAULT_MEMORY_THRESHOLD_MB)),
    errorRateThreshold: parseFloat(process.env.DEGRADATION_ERROR_RATE_THRESHOLD || String(DEGRADATION_CONSTANTS.DEFAULT_ERROR_RATE_THRESHOLD)),
    responseTimeThresholdMs: parseInt(process.env.DEGRADATION_RESPONSE_TIME_THRESHOLD_MS || String(DEGRADATION_CONSTANTS.DEFAULT_RESPONSE_TIME_THRESHOLD_MS)),
    
    // Queue management
    maxQueueSize: parseInt(process.env.DEGRADATION_MAX_QUEUE_SIZE || String(DEGRADATION_CONSTANTS.DEFAULT_MAX_QUEUE_SIZE)),
    maxQueueTimeMs: parseInt(process.env.DEGRADATION_MAX_QUEUE_TIME_MS || String(DEGRADATION_CONSTANTS.DEFAULT_MAX_QUEUE_TIME_MS)),
    retryIntervalMs: parseInt(process.env.DEGRADATION_RETRY_INTERVAL_MS || String(DEGRADATION_CONSTANTS.DEFAULT_RETRY_INTERVAL_MS)),
    maxRetries: parseInt(process.env.DEGRADATION_MAX_RETRIES || String(DEGRADATION_CONSTANTS.DEFAULT_MAX_RETRIES)),
    
    // Fallback features
    enableCachedResponses: process.env.DEGRADATION_ENABLE_CACHED_RESPONSES !== 'false',
    enableGenericFallbacks: process.env.DEGRADATION_ENABLE_GENERIC_FALLBACKS !== 'false',
    enableMaintenanceMode: process.env.DEGRADATION_ENABLE_MAINTENANCE_MODE !== 'false',
  };
}

/**
 * Convert internal circuit state to interface format
 */
export function convertCircuitState(state: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
  switch (state) {
  case 'closed': return 'CLOSED';
  case 'open': return 'OPEN';
  case 'half-open': return 'HALF_OPEN';
  default: return 'CLOSED';
  }
}