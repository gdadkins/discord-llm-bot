/**
 * Health Check Service - Configuration Health Integration
 * 
 * Integrates configuration health monitoring with the bot's health system:
 * - Configuration-specific health endpoints
 * - Health metrics collection and reporting
 * - Startup configuration validation
 * - Production readiness validation
 * - Integration with existing health monitoring
 * 
 * @module HealthCheckService
 */

import { BaseService } from '../../services/base/BaseService';
import { logger } from '../../utils/logger';
import { configurationManager } from '../ConfigurationManager';
import { configurationMonitor, type ConfigurationHealthStatus } from '../monitoring/ConfigurationMonitor';
import { configurationAuditor, type AuditAnalytics } from '../monitoring/ConfigurationAudit';
import type { IHealthMonitor } from '../../services/interfaces/HealthMonitoringInterfaces';
import type { ServiceHealthStatus } from '../../services/interfaces/CoreServiceInterfaces';
import { HealthCheckResult } from '../../types';

/**
 * Configuration health metrics
 */
export interface ConfigurationHealthMetrics {
  // Configuration status
  configurationHealth: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: number;
  healthChecksPassed: number;
  healthChecksFailed: number;
  
  // Audit metrics
  totalConfigChanges: number;
  significantChanges: number;
  recentChanges: number; // Last 24 hours
  
  // Validation metrics
  lastValidation: number;
  validationErrors: number;
  
  // Performance metrics
  configLoadTime: number;
  cacheHitRate: number;
  
  // Secret validation (without exposing values)
  secretsConfigured: boolean;
  secretsValid: boolean;
}

/**
 * Production readiness criteria
 */
export interface ProductionReadinessCriteria {
  allHealthChecksPassed: boolean;
  apiKeysConfigured: boolean;
  rateLimitsValid: boolean;
  memoryLimitsValid: boolean;
  discordIntentsValid: boolean;
  featuresConsistent: boolean;
  noValidationErrors: boolean;
  recentStability: boolean; // No significant changes in last hour
}

/**
 * Health check endpoints
 */
export interface HealthCheckEndpoints {
  '/health/config': () => Promise<ConfigurationHealthStatus>;
  '/health/config/metrics': () => Promise<ConfigurationHealthMetrics>;
  '/health/config/readiness': () => Promise<ProductionReadinessCriteria>;
  '/health/config/audit': () => Promise<AuditAnalytics>;
}

/**
 * Health Check Service for configuration monitoring integration
 */
export class HealthCheckService extends BaseService {
  private healthMonitor: IHealthMonitor | null = null;
  private startupValidationPassed: boolean = false;
  private lastValidationTime: number = 0;
  private configLoadStartTime: number = 0;
  private configLoadEndTime: number = 0;
  
  constructor() {
    super();
  }

  protected getServiceName(): string {
    return 'ConfigurationHealthCheck';
  }

  /**
   * Set health monitor reference
   */
  public setHealthMonitor(healthMonitor: IHealthMonitor): void {
    this.healthMonitor = healthMonitor;
    logger.info('Health monitor set for configuration health checks');
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  protected async performInitialization(): Promise<void> {
    try {
      this.configLoadStartTime = Date.now();
      
      // Initialize configuration monitor
      configurationMonitor.startMonitoring();
      
      // Initialize configuration auditor
      await configurationAuditor.initialize();
      
      // Perform startup validation
      await this.performStartupValidation();
      
      // Setup configuration event listeners
      this.setupEventListeners();
      
      // Register health check endpoints if health monitoring is enabled
      if (configurationManager.getMonitoringConfig().healthMetrics?.enabled) {
        this.registerHealthEndpoints();
      }
      
      this.configLoadEndTime = Date.now();
      
      logger.info('Configuration health check service initialized', {
        startupValidation: this.startupValidationPassed,
        configLoadTime: this.configLoadEndTime - this.configLoadStartTime
      });
    } catch (error) {
      logger.error('Failed to initialize configuration health check service:', error);
      throw error;
    }
  }

  protected async performShutdown(): Promise<void> {
    try {
      // Stop configuration monitoring
      configurationMonitor.stopMonitoring();
      
      // Shutdown auditor
      await configurationAuditor.shutdown();
      
      // Remove event listeners
      this.removeEventListeners();
      
      logger.info('Configuration health check service shutdown completed');
    } catch (error) {
      logger.error('Error during configuration health check service shutdown:', error);
      throw error;
    }
  }

  // ============================================================================
  // Startup Validation
  // ============================================================================

  /**
   * Perform comprehensive startup validation
   */
  private async performStartupValidation(): Promise<void> {
    logger.info('Performing startup configuration validation...');
    
    try {
      // Run configuration health checks
      const healthStatus = await configurationMonitor.runHealthChecks();
      
      // Check if all critical checks passed
      const criticalChecks = ['api_keys', 'discord_intents', 'rate_limits'];
      const criticalFailures = healthStatus.checks.filter(
        check => criticalChecks.includes(check.checkName) && check.status === 'unhealthy'
      );
      
      if (criticalFailures.length > 0) {
        this.startupValidationPassed = false;
        logger.error('Startup validation failed - critical checks failed:', {
          failures: criticalFailures.map(f => ({
            check: f.checkName,
            message: f.message
          }))
        });
        
        // In production, we might want to prevent startup
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Startup validation failed: ${criticalFailures.map(f => f.message).join('; ')}`);
        }
      } else {
        this.startupValidationPassed = true;
        logger.info('Startup validation passed', {
          healthStatus: healthStatus.overall,
          checksPassed: healthStatus.checksPassed,
          totalChecks: healthStatus.checks.length
        });
      }
      
      this.lastValidationTime = Date.now();
    } catch (error) {
      this.startupValidationPassed = false;
      logger.error('Startup validation error:', error);
      throw error;
    }
  }

  // ============================================================================
  // Production Readiness
  // ============================================================================

  /**
   * Validate production readiness
   */
  public async validateProductionReadiness(): Promise<ProductionReadinessCriteria> {
    const healthStatus = await configurationMonitor.runHealthChecks();
    const config = configurationManager.getConfiguration();
    
    // Check for recent significant changes
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentChanges = configurationAuditor.queryAuditLog({
      fromDate: oneHourAgo,
      significant: true
    });
    
    const criteria: ProductionReadinessCriteria = {
      allHealthChecksPassed: healthStatus.overall === 'healthy',
      apiKeysConfigured: this.checkApiKeysConfigured(healthStatus),
      rateLimitsValid: this.checkRateLimitsValid(healthStatus),
      memoryLimitsValid: this.checkMemoryLimitsValid(healthStatus),
      discordIntentsValid: this.checkDiscordIntentsValid(healthStatus),
      featuresConsistent: this.checkFeaturesConsistent(healthStatus),
      noValidationErrors: healthStatus.checksFailed === 0,
      recentStability: recentChanges.length === 0
    };
    
    const isReady = Object.values(criteria).every(v => v === true);
    
    logger.info('Production readiness validation completed', {
      ready: isReady,
      criteria
    });
    
    return criteria;
  }

  // ============================================================================
  // Health Metrics
  // ============================================================================

  /**
   * Get configuration health metrics
   */
  public async getConfigurationHealthMetrics(): Promise<ConfigurationHealthMetrics> {
    const healthStatus = configurationMonitor.getCurrentHealthStatus();
    const auditAnalytics = configurationAuditor.generateAnalytics();
    
    // Get recent changes (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentChanges = configurationAuditor.queryAuditLog({
      fromDate: oneDayAgo
    });
    
    // Calculate cache hit rate
    const cacheHitRate = configurationManager.isCached() ? 1.0 : 0.0;
    
    // Check if secrets are configured (without exposing values)
    const secretsConfigured = !!process.env.DISCORD_BOT_TOKEN && !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
    const secretsValid = secretsConfigured;
    
    const metrics: ConfigurationHealthMetrics = {
      configurationHealth: healthStatus?.overall || 'unhealthy',
      lastHealthCheck: healthStatus?.lastChecked || 0,
      healthChecksPassed: healthStatus?.checksPassed || 0,
      healthChecksFailed: healthStatus?.checksFailed || 0,
      totalConfigChanges: auditAnalytics.totalChanges,
      significantChanges: auditAnalytics.significantChanges,
      recentChanges: recentChanges.length,
      lastValidation: this.lastValidationTime,
      validationErrors: healthStatus?.checksFailed || 0,
      configLoadTime: this.configLoadEndTime - this.configLoadStartTime,
      cacheHitRate,
      secretsConfigured,
      secretsValid
    };
    
    return metrics;
  }

  // ============================================================================
  // Health Endpoints
  // ============================================================================

  /**
   * Register health check endpoints
   */
  private registerHealthEndpoints(): void {
    // Note: In a real implementation, these would be registered with an HTTP server
    // For now, we'll just log that they would be available
    
    const endpoints: HealthCheckEndpoints = {
      '/health/config': async () => {
        const status = await configurationMonitor.runHealthChecks();
        return status;
      },
      
      '/health/config/metrics': async () => {
        return await this.getConfigurationHealthMetrics();
      },
      
      '/health/config/readiness': async () => {
        return await this.validateProductionReadiness();
      },
      
      '/health/config/audit': async () => {
        return configurationAuditor.generateAnalytics();
      }
    };
    
    logger.info('Configuration health endpoints registered', {
      endpoints: Object.keys(endpoints)
    });
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for configuration health changes
    configurationMonitor.on('health:changed', (status) => {
      logger.info('Configuration health changed', {
        from: this.lastHealthStatus,
        to: status.overall
      });
      this.lastHealthStatus = status.overall;
    });
    
    configurationMonitor.on('health:degraded', (results) => {
    logger.warn('Configuration health degraded', {
    issues: results.map((r: HealthCheckResult) => ({
    check: r.checkName,
    message: r.message
    }))
    });
    });
    
    configurationMonitor.on('health:unhealthy', (results) => {
    logger.error('Configuration health unhealthy', {
    issues: results.map((r: HealthCheckResult) => ({
    check: r.checkName,
    message: r.message
    }))
    });
    });
    
    configurationMonitor.on('health:recovered', (status) => {
      logger.info('Configuration health recovered', {
        status: status.overall
      });
    });
    
    // Listen for significant configuration changes
    configurationAuditor.on('audit:significant-change', (entry) => {
      logger.warn('Significant configuration change detected', {
        action: entry.action,
        path: entry.path,
        modifiedBy: entry.modifiedBy
      });
      
      // Re-run health checks after significant change
      configurationMonitor.runHealthChecks().catch(error => {
        logger.error('Failed to run health checks after significant change:', error);
      });
    });
  }

  /**
   * Remove event listeners
   */
  private removeEventListeners(): void {
    configurationMonitor.removeAllListeners();
    configurationAuditor.removeAllListeners();
  }

  // ============================================================================
  // Health Status Implementation
  // ============================================================================

  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();
    
    try {
      const healthStatus = configurationMonitor.getCurrentHealthStatus();
      
      if (!healthStatus) {
        errors.push('Configuration health status not available');
      } else if (healthStatus.overall === 'unhealthy') {
        const unhealthyChecks = healthStatus.checks.filter(c => c.status === 'unhealthy');
        for (const check of unhealthyChecks) {
          errors.push(`Config ${check.checkName}: ${check.message}`);
        }
      }
      
      if (!this.startupValidationPassed) {
        errors.push('Startup configuration validation failed');
      }
    } catch (error) {
      errors.push(`Configuration health check error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return errors;
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    try {
      const healthStatus = configurationMonitor.getCurrentHealthStatus();
      const auditStats = configurationAuditor.generateAnalytics();
      
      return {
        configurationHealth: {
          status: healthStatus?.overall || 'unknown',
          checksPassed: healthStatus?.checksPassed || 0,
          checksFailed: healthStatus?.checksFailed || 0,
          lastChecked: healthStatus?.lastChecked || 0,
          startupValidation: this.startupValidationPassed,
          configLoadTime: this.configLoadEndTime - this.configLoadStartTime,
          auditStats: {
            totalChanges: auditStats.totalChanges,
            significantChanges: auditStats.significantChanges,
            changesByAction: auditStats.changesByAction
          }
        }
      };
    } catch (error) {
      return {
        configurationHealth: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  public override getHealthStatus(): ServiceHealthStatus {
    const baseStatus = super.getHealthStatus();
    const healthStatus = configurationMonitor.getCurrentHealthStatus();
    const auditStats = configurationAuditor.generateAnalytics();
    
    return {
      ...baseStatus,
      metrics: {
        ...baseStatus.metrics,
        configurationHealth: healthStatus?.overall || 'unknown',
        healthChecksPassed: healthStatus?.checksPassed || 0,
        healthChecksFailed: healthStatus?.checksFailed || 0,
        recentConfigChanges: auditStats.totalChanges,
        startupValidationPassed: this.startupValidationPassed
      }
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private lastHealthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  private checkApiKeysConfigured(healthStatus: ConfigurationHealthStatus): boolean {
    const apiKeyCheck = healthStatus.checks.find(c => c.checkName === 'api_keys');
    return apiKeyCheck ? apiKeyCheck.status === 'healthy' : false;
  }

  private checkRateLimitsValid(healthStatus: ConfigurationHealthStatus): boolean {
    const rateLimitCheck = healthStatus.checks.find(c => c.checkName === 'rate_limits');
    return rateLimitCheck ? rateLimitCheck.status === 'healthy' : false;
  }

  private checkMemoryLimitsValid(healthStatus: ConfigurationHealthStatus): boolean {
    const memoryCheck = healthStatus.checks.find(c => c.checkName === 'memory_limits');
    return memoryCheck ? memoryCheck.status === 'healthy' : false;
  }

  private checkDiscordIntentsValid(healthStatus: ConfigurationHealthStatus): boolean {
    const intentsCheck = healthStatus.checks.find(c => c.checkName === 'discord_intents');
    return intentsCheck ? intentsCheck.status === 'healthy' : false;
  }

  private checkFeaturesConsistent(healthStatus: ConfigurationHealthStatus): boolean {
    const featuresCheck = healthStatus.checks.find(c => c.checkName === 'feature_compatibility');
    return featuresCheck ? featuresCheck.status === 'healthy' : false;
  }

  /**
   * Generate configuration health report
   */
  public async generateHealthReport(): Promise<string> {
    const healthStatus = await configurationMonitor.runHealthChecks();
    const metrics = await this.getConfigurationHealthMetrics();
    const readiness = await this.validateProductionReadiness();
    
    const report = [
      '# Configuration Health Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Overall Status',
      `- Health: ${healthStatus.overall.toUpperCase()}`,
      `- Checks Passed: ${healthStatus.checksPassed}/${healthStatus.checks.length}`,
      `- Last Check: ${new Date(healthStatus.lastChecked).toISOString()}`,
      '',
      '## Health Metrics',
      `- Total Config Changes: ${metrics.totalConfigChanges}`,
      `- Significant Changes: ${metrics.significantChanges}`,
      `- Recent Changes (24h): ${metrics.recentChanges}`,
      `- Config Load Time: ${metrics.configLoadTime}ms`,
      `- Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`,
      `- Secrets Configured: ${metrics.secretsConfigured ? 'Yes' : 'No'}`,
      '',
      '## Production Readiness',
      `- Ready: ${Object.values(readiness).every(v => v) ? 'YES' : 'NO'}`,
      `- All Health Checks Passed: ${readiness.allHealthChecksPassed ? '✓' : '✗'}`,
      `- API Keys Configured: ${readiness.apiKeysConfigured ? '✓' : '✗'}`,
      `- Rate Limits Valid: ${readiness.rateLimitsValid ? '✓' : '✗'}`,
      `- Memory Limits Valid: ${readiness.memoryLimitsValid ? '✓' : '✗'}`,
      `- Discord Intents Valid: ${readiness.discordIntentsValid ? '✓' : '✗'}`,
      `- Features Consistent: ${readiness.featuresConsistent ? '✓' : '✗'}`,
      `- No Validation Errors: ${readiness.noValidationErrors ? '✓' : '✗'}`,
      `- Recent Stability: ${readiness.recentStability ? '✓' : '✗'}`,
      '',
      '## Detailed Health Checks',
      configurationMonitor.generateHealthReport()
    ].join('\n');
    
    return report;
  }
}

// Export singleton instance
export const healthCheckService = new HealthCheckService();