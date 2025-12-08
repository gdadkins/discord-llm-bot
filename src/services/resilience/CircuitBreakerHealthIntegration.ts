/**
 * Circuit Breaker Health Integration
 * 
 * Provides integration between circuit breakers and the health monitoring system.
 * This module extends health monitoring to include circuit breaker states,
 * performance metrics, and alerting capabilities.
 */

import { logger } from '../../utils/logger';
import type { HealthMonitor } from '../health/HealthMonitor';
import type { ServiceCircuitBreakers, ServiceMetrics } from './ServiceCircuitBreakers';
import type { DiscordCircuitBreaker, CircuitBreakerStatus } from './DiscordCircuitBreaker';

export interface CircuitBreakerHealthMetrics {
  /** Overall health score (0-100) */
  overallHealthScore: number;
  /** Whether critical services are down */
  criticalServicesDown: boolean;
  /** Service circuit breaker statuses */
  serviceBreakers: Record<string, ServiceMetrics>;
  /** Discord operation circuit breaker statuses */
  discordBreakers: Record<string, CircuitBreakerStatus>;
  /** Summary counts */
  summary: {
    totalBreakers: number;
    openBreakers: number;
    halfOpenBreakers: number;
    closedBreakers: number;
    failedOperations: number;
    successfulOperations: number;
  };
  /** Performance metrics */
  performance: {
    averageAvailability: number;
    totalUptime: number;
    meanTimeToRecovery: number;
    failureRate: number;
  };
}

export interface CircuitBreakerAlert {
  type: 'circuit_opened' | 'circuit_closed' | 'critical_service_down' | 'health_degraded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  serviceName: string;
  message: string;
  timestamp: number;
  metadata: Record<string, any>;
}

/**
 * Integrates circuit breaker status with health monitoring
 */
export class CircuitBreakerHealthIntegration {
  private healthMonitor?: HealthMonitor;
  private serviceCircuitBreakers?: ServiceCircuitBreakers;
  private discordCircuitBreaker?: DiscordCircuitBreaker;
  private alertHistory: CircuitBreakerAlert[] = [];
  private readonly maxAlertHistory = 100;

  constructor() {
    logger.info('CircuitBreakerHealthIntegration initialized');
  }

  /**
   * Set the health monitor instance for integration
   */
  setHealthMonitor(healthMonitor: HealthMonitor): void {
    this.healthMonitor = healthMonitor;
    logger.info('Health monitor integrated with circuit breaker monitoring');
  }

  /**
   * Set the service circuit breakers for monitoring
   */
  setServiceCircuitBreakers(serviceCircuitBreakers: ServiceCircuitBreakers): void {
    this.serviceCircuitBreakers = serviceCircuitBreakers;
    logger.info('Service circuit breakers integrated with health monitoring');
  }

  /**
   * Set the Discord circuit breaker for monitoring
   */
  setDiscordCircuitBreaker(discordCircuitBreaker: DiscordCircuitBreaker): void {
    this.discordCircuitBreaker = discordCircuitBreaker;
    logger.info('Discord circuit breaker integrated with health monitoring');
  }

  /**
   * Collect comprehensive circuit breaker health metrics
   */
  collectHealthMetrics(): CircuitBreakerHealthMetrics {
    const serviceBreakers = this.serviceCircuitBreakers?.getAllStatus() || {};
    const discordBreakers = this.discordCircuitBreaker?.getStatus() || {};
    
    // Calculate summary statistics
    const allBreakers = { ...serviceBreakers, ...discordBreakers };
    const totalBreakers = Object.keys(allBreakers).length;
    
    let openBreakers = 0;
    let halfOpenBreakers = 0;
    let closedBreakers = 0;
    let failedOperations = 0;
    let successfulOperations = 0;
    let totalAvailability = 0;
    let totalUptime = 0;

    for (const [name, status] of Object.entries(allBreakers)) {
      const breakerStatus = status as ServiceMetrics | CircuitBreakerStatus;
      
      switch (breakerStatus.state) {
        case 'open':
          openBreakers++;
          break;
        case 'half-open':
        case 'half-open':
          halfOpenBreakers++;
          break;
        case 'closed':
          closedBreakers++;
          break;
      }

      failedOperations += breakerStatus.totalFailures || 0;
      successfulOperations += breakerStatus.totalSuccesses || 0;
      
      // Calculate availability and uptime
      if ('availability' in breakerStatus) {
        totalAvailability += breakerStatus.availability;
        totalUptime += breakerStatus.uptime || 0;
      } else {
        // For Discord circuit breakers, estimate availability
        const total = (breakerStatus.totalSuccesses || 0) + (breakerStatus.totalFailures || 0);
        const availability = total > 0 ? ((breakerStatus.totalSuccesses || 0) / total) * 100 : 100;
        totalAvailability += availability;
      }
    }

    const averageAvailability = totalBreakers > 0 ? totalAvailability / totalBreakers : 100;
    const overallHealthScore = this.serviceCircuitBreakers?.getOverallHealthScore() || 100;
    const criticalServicesDown = this.serviceCircuitBreakers?.hasCriticalServicesDown() || false;

    // Calculate performance metrics
    const failureRate = (failedOperations + successfulOperations) > 0 
      ? (failedOperations / (failedOperations + successfulOperations)) * 100 
      : 0;

    const meanTimeToRecovery = this.calculateMeanTimeToRecovery();

    return {
      overallHealthScore,
      criticalServicesDown,
      serviceBreakers,
      discordBreakers,
      summary: {
        totalBreakers,
        openBreakers,
        halfOpenBreakers,
        closedBreakers,
        failedOperations,
        successfulOperations
      },
      performance: {
        averageAvailability,
        totalUptime,
        meanTimeToRecovery,
        failureRate
      }
    };
  }

  /**
   * Update circuit breaker status in health monitoring
   */
  updateCircuitBreakerStatus(
    serviceName: string,
    status: { state: string; timestamp: number; metadata?: Record<string, any> }
  ): void {
    if (!this.healthMonitor) {
      logger.debug('Health monitor not available for circuit breaker status update');
      return;
    }

    // Create alert if circuit state changed significantly
    this.checkForAlerts(serviceName, status);

    logger.debug('Circuit breaker status updated in health monitor', {
      serviceName,
      state: status.state,
      timestamp: status.timestamp
    });
  }

  /**
   * Get circuit breaker alert history
   */
  getAlertHistory(): CircuitBreakerAlert[] {
    return [...this.alertHistory];
  }

  /**
   * Clear alert history
   */
  clearAlertHistory(): void {
    this.alertHistory = [];
    logger.info('Circuit breaker alert history cleared');
  }

  /**
   * Get health status summary for external consumption
   */
  getHealthSummary(): {
    status: 'healthy' | 'degraded' | 'critical';
    score: number;
    issues: string[];
    recommendations: string[];
  } {
    const metrics = this.collectHealthMetrics();
    
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Determine overall status
    if (metrics.criticalServicesDown) {
      status = 'critical';
      issues.push('Critical services are down');
      recommendations.push('Investigate and restart critical services immediately');
    } else if (metrics.overallHealthScore < 50) {
      status = 'critical';
      issues.push(`Health score critically low: ${metrics.overallHealthScore}%`);
      recommendations.push('Multiple services need attention - review circuit breaker logs');
    } else if (metrics.overallHealthScore < 80 || metrics.summary.openBreakers > 0) {
      status = 'degraded';
      if (metrics.summary.openBreakers > 0) {
        issues.push(`${metrics.summary.openBreakers} circuit breaker(s) open`);
        recommendations.push('Monitor failing services and consider manual recovery');
      }
    }

    // Additional issue detection
    if (metrics.performance.failureRate > 10) {
      issues.push(`High failure rate: ${metrics.performance.failureRate.toFixed(2)}%`);
      recommendations.push('Investigate root cause of service failures');
    }

    if (metrics.performance.averageAvailability < 95) {
      issues.push(`Low average availability: ${metrics.performance.averageAvailability.toFixed(2)}%`);
      recommendations.push('Review service reliability and error handling');
    }

    return {
      status,
      score: metrics.overallHealthScore,
      issues,
      recommendations
    };
  }

  // Private methods

  private checkForAlerts(
    serviceName: string,
    status: { state: string; timestamp: number; metadata?: Record<string, any> }
  ): void {
    const now = Date.now();
    
    // Check for circuit breaker state changes that warrant alerts
    if (status.state === 'open') {
      this.createAlert({
        type: 'circuit_opened',
        severity: this.getServiceSeverity(serviceName),
        serviceName,
        message: `Circuit breaker opened for ${serviceName}`,
        timestamp: now,
        metadata: status.metadata || {}
      });
    } else if (status.state === 'closed') {
      this.createAlert({
        type: 'circuit_closed',
        severity: 'low',
        serviceName,
        message: `Circuit breaker recovered for ${serviceName}`,
        timestamp: now,
        metadata: status.metadata || {}
      });
    }

    // Check for critical service alerts
    if (this.serviceCircuitBreakers?.hasCriticalServicesDown()) {
      this.createAlert({
        type: 'critical_service_down',
        severity: 'critical',
        serviceName: 'system',
        message: 'Critical services are down',
        timestamp: now,
        metadata: { criticalServices: ['gemini', 'database'] }
      });
    }

    // Check for overall health degradation
    const healthScore = this.serviceCircuitBreakers?.getOverallHealthScore() || 100;
    if (healthScore < 70) {
      this.createAlert({
        type: 'health_degraded',
        severity: healthScore < 50 ? 'critical' : 'high',
        serviceName: 'system',
        message: `Overall health score degraded to ${healthScore}%`,
        timestamp: now,
        metadata: { healthScore }
      });
    }
  }

  private createAlert(alert: CircuitBreakerAlert): void {
    this.alertHistory.unshift(alert);
    
    // Trim history to max size
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory = this.alertHistory.slice(0, this.maxAlertHistory);
    }

    logger.warn('Circuit breaker alert created', {
      type: alert.type,
      severity: alert.severity,
      serviceName: alert.serviceName,
      message: alert.message
    });
  }

  private getServiceSeverity(serviceName: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalServices = ['gemini', 'database'];
    const highPriorityServices = ['discord', 'cache'];
    
    if (criticalServices.includes(serviceName)) {
      return 'critical';
    } else if (highPriorityServices.includes(serviceName)) {
      return 'high';
    } else {
      return 'medium';
    }
  }

  private calculateMeanTimeToRecovery(): number {
    // This would require tracking recovery times over time
    // For now, return a placeholder value
    // In a real implementation, this would analyze alert history and recovery times
    return 0;
  }
}

/**
 * Factory function to create circuit breaker health integration
 */
export function createCircuitBreakerHealthIntegration(): CircuitBreakerHealthIntegration {
  return new CircuitBreakerHealthIntegration();
}

/**
 * Global instance for easy access
 */
export const circuitBreakerHealthIntegration = createCircuitBreakerHealthIntegration();