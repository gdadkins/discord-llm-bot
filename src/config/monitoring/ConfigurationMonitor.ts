/**
 * Configuration Monitor - Health and Validation Monitoring
 * 
 * Provides real-time health monitoring for configuration system with:
 * - Built-in health checks for critical configuration values
 * - Periodic monitoring with configurable intervals
 * - Health status determination (healthy/degraded/unhealthy)
 * - Recommendation generation for configuration issues
 * - Event emission for health changes
 * 
 * @module ConfigurationMonitor
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { configurationManager, type BotConfiguration } from '../ConfigurationManager';
import type { ServiceHealthStatus } from '../../services/interfaces/CoreServiceInterfaces';

/**
 * Health check result interface
 */
export interface HealthCheckResult {
  checkName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  recommendation?: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: number;
}

/**
 * Configuration health status
 */
export interface ConfigurationHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checksPassed: number;
  checksFailed: number;
  checks: HealthCheckResult[];
  recommendations: string[];
  lastChecked: number;
}

/**
 * Health check function type
 */
type HealthCheckFunction = (config: BotConfiguration) => HealthCheckResult;

/**
 * Configuration Monitor Events
 */
export interface ConfigurationMonitorEvents {
  'health:changed': (status: ConfigurationHealthStatus) => void;
  'health:degraded': (results: HealthCheckResult[]) => void;
  'health:unhealthy': (results: HealthCheckResult[]) => void;
  'health:recovered': (status: ConfigurationHealthStatus) => void;
  'check:failed': (result: HealthCheckResult) => void;
}

/**
 * Configuration Monitor for health checking and monitoring
 */
export class ConfigurationMonitor extends EventEmitter {
  private healthChecks: Map<string, HealthCheckFunction> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastHealthStatus: ConfigurationHealthStatus | null = null;
  private isMonitoring: boolean = false;
  
  // Default monitoring interval (5 minutes)
  private static readonly DEFAULT_MONITORING_INTERVAL_MS = 5 * 60 * 1000;
  
  constructor() {
    super();
    this.registerBuiltInChecks();
  }

  /**
   * Register built-in health checks
   */
  private registerBuiltInChecks(): void {
    // API Key validation
    this.registerHealthCheck('api_keys', (config) => {
      // Check environment variables directly since they're not in the config interface
      const hasDiscordToken = !!process.env.DISCORD_BOT_TOKEN;
      const hasGeminiKey = !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
      
      if (!hasDiscordToken || !hasGeminiKey) {
        return {
          checkName: 'api_keys',
          status: 'unhealthy',
          message: `Missing required API keys: ${!hasDiscordToken ? 'Discord token' : ''} ${!hasGeminiKey ? 'Gemini API key' : ''}`.trim(),
          recommendation: 'Set the missing API keys in environment variables',
          severity: 'critical',
          timestamp: Date.now()
        };
      }
      
      // Check token format (basic validation)
      const discordToken = process.env.DISCORD_BOT_TOKEN || '';
      const discordTokenPattern = /^[A-Za-z0-9._-]+$/;
      if (discordToken && !discordTokenPattern.test(discordToken)) {
        return {
          checkName: 'api_keys',
          status: 'degraded',
          message: 'Discord token format appears invalid',
          recommendation: 'Verify Discord token format and ensure it\'s correctly set',
          severity: 'warning',
          timestamp: Date.now()
        };
      }
      
      return {
        checkName: 'api_keys',
        status: 'healthy',
        message: 'All API keys present and valid format',
        severity: 'info',
        timestamp: Date.now()
      };
    });

    // Rate limiting configuration
    this.registerHealthCheck('rate_limits', (config) => {
      const { rpm, daily } = config.rateLimiting;
      
      if (rpm < 1 || daily < 1) {
        return {
          checkName: 'rate_limits',
          status: 'unhealthy',
          message: 'Rate limits must be positive numbers',
          recommendation: 'Set rate limits to positive values',
          severity: 'critical',
          timestamp: Date.now()
        };
      }
      
      if (rpm < 10) {
        return {
          checkName: 'rate_limits',
          status: 'degraded',
          message: `RPM limit (${rpm}) is very low and may impact user experience`,
          recommendation: 'Consider increasing RPM limit to at least 10',
          severity: 'warning',
          timestamp: Date.now()
        };
      }
      
      if (daily < 100) {
        return {
          checkName: 'rate_limits',
          status: 'degraded',
          message: `Daily limit (${daily}) is very low and may limit bot functionality`,
          recommendation: 'Consider increasing daily limit to at least 100',
          severity: 'warning',
          timestamp: Date.now()
        };
      }
      
      return {
        checkName: 'rate_limits',
        status: 'healthy',
        message: `Rate limits configured: ${rpm} RPM, ${daily} daily`,
        severity: 'info',
        timestamp: Date.now()
      };
    });

    // Memory limits configuration
    this.registerHealthCheck('memory_limits', (config) => {
      const memoryLimitMB = config.features.monitoring?.alerts?.memoryThreshold 
        ? config.features.monitoring.alerts.memoryThreshold * 1024 
        : 500;
      const totalMemoryMB = require('os').totalmem() / (1024 * 1024);
      
      if (memoryLimitMB > totalMemoryMB * 0.8) {
        return {
          checkName: 'memory_limits',
          status: 'degraded',
          message: `Memory threshold (${memoryLimitMB}MB) is too close to total system memory (${Math.round(totalMemoryMB)}MB)`,
          recommendation: `Reduce memory threshold to no more than ${Math.round(totalMemoryMB * 0.6)}MB`,
          severity: 'warning',
          timestamp: Date.now()
        };
      }
      
      return {
        checkName: 'memory_limits',
        status: 'healthy',
        message: `Memory threshold set to ${memoryLimitMB}MB`,
        severity: 'info',
        timestamp: Date.now()
      };
    });

    // Feature compatibility check
    this.registerHealthCheck('feature_compatibility', (config) => {
      const issues: string[] = [];
      
      // Check if monitoring health metrics are enabled but alerts disabled
      if (config.features.monitoring?.healthMetrics?.enabled && !config.features.monitoring?.alerts?.enabled) {
        issues.push('Health metrics enabled but alerts disabled');
      }
      
      // Check if roasting is enabled but base chance is zero
      if (config.features.roasting.baseChance > 0 && config.features.roasting.maxChance === 0) {
        issues.push('Roasting base chance set but max chance is zero');
      }
      
      // Check Gemini features consistency
      if (config.features.codeExecution && !config.features.structuredOutput) {
        issues.push('Code execution enabled but structured output disabled - may limit functionality');
      }
      
      if (issues.length > 0) {
        return {
          checkName: 'feature_compatibility',
          status: 'degraded',
          message: `Feature compatibility issues: ${issues.join('; ')}`,
          recommendation: 'Review feature configuration for consistency',
          severity: 'warning',
          timestamp: Date.now()
        };
      }
      
      return {
        checkName: 'feature_compatibility',
        status: 'healthy',
        message: 'All features configured consistently',
        severity: 'info',
        timestamp: Date.now()
      };
    });

    // Discord intents validation
    this.registerHealthCheck('discord_intents', (config) => {
      const requiredIntents = ['Guilds', 'GuildMessages', 'MessageContent'];
      const missingIntents = requiredIntents.filter(intent => !config.discord.intents.includes(intent));
      
      if (missingIntents.length > 0) {
        return {
          checkName: 'discord_intents',
          status: 'unhealthy',
          message: `Missing required Discord intents: ${missingIntents.join(', ')}`,
          recommendation: 'Add missing intents to Discord configuration',
          severity: 'critical',
          timestamp: Date.now()
        };
      }
      
      return {
        checkName: 'discord_intents',
        status: 'healthy',
        message: 'All required Discord intents configured',
        severity: 'info',
        timestamp: Date.now()
      };
    });

    // Gemini model configuration
    this.registerHealthCheck('gemini_model', (config) => {
      const validModels = ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      
      if (!validModels.includes(config.gemini.model)) {
        return {
          checkName: 'gemini_model',
          status: 'degraded',
          message: `Unknown Gemini model: ${config.gemini.model}`,
          recommendation: `Use one of the supported models: ${validModels.join(', ')}`,
          severity: 'warning',
          timestamp: Date.now()
        };
      }
      
      if (config.gemini.temperature < 0 || config.gemini.temperature > 2) {
        return {
          checkName: 'gemini_model',
          status: 'degraded',
          message: `Gemini temperature (${config.gemini.temperature}) outside valid range (0-2)`,
          recommendation: 'Set temperature between 0 and 2',
          severity: 'warning',
          timestamp: Date.now()
        };
      }
      
      return {
        checkName: 'gemini_model',
        status: 'healthy',
        message: `Gemini model ${config.gemini.model} configured with temperature ${config.gemini.temperature}`,
        severity: 'info',
        timestamp: Date.now()
      };
    });

    // Timeout configuration
    this.registerHealthCheck('timeouts', (config) => {
      const issues: string[] = [];
      
      // Check timeout from environment variable
      const geminiTimeout = parseInt(process.env.GEMINI_TIMEOUT_MS || '30000');
      if (geminiTimeout < 5000) {
        issues.push(`Gemini timeout (${geminiTimeout}ms) may be too short`);
      }
      
      if (geminiTimeout > 60000) {
        issues.push(`Gemini timeout (${geminiTimeout}ms) may be too long`);
      }
      
      if (issues.length > 0) {
        return {
          checkName: 'timeouts',
          status: 'degraded',
          message: issues.join('; '),
          recommendation: 'Consider setting timeouts between 5-30 seconds',
          severity: 'warning',
          timestamp: Date.now()
        };
      }
      
      return {
        checkName: 'timeouts',
        status: 'healthy',
        message: 'Timeout configurations within recommended ranges',
        severity: 'info',
        timestamp: Date.now()
      };
    });
  }

  /**
   * Register a custom health check
   */
  public registerHealthCheck(name: string, check: HealthCheckFunction): void {
    this.healthChecks.set(name, check);
    logger.debug(`Registered health check: ${name}`);
  }

  /**
   * Remove a health check
   */
  public unregisterHealthCheck(name: string): void {
    this.healthChecks.delete(name);
    logger.debug(`Unregistered health check: ${name}`);
  }

  /**
   * Run all health checks
   */
  public async runHealthChecks(): Promise<ConfigurationHealthStatus> {
    const config = configurationManager.getConfiguration();
    const results: HealthCheckResult[] = [];
    const recommendations: string[] = [];
    
    // Run all health checks
    for (const [name, checkFn] of this.healthChecks) {
      try {
        const result = checkFn(config);
        results.push(result);
        
        if (result.recommendation) {
          recommendations.push(result.recommendation);
        }
        
        if (result.status !== 'healthy') {
          this.emit('check:failed', result);
        }
      } catch (error) {
        logger.error(`Health check ${name} failed:`, error);
        results.push({
          checkName: name,
          status: 'unhealthy',
          message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'critical',
          timestamp: Date.now()
        });
      }
    }
    
    // Determine overall status
    const unhealthyCount = results.filter(r => r.status === 'unhealthy').length;
    const degradedCount = results.filter(r => r.status === 'degraded').length;
    const healthyCount = results.filter(r => r.status === 'healthy').length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      overall = 'unhealthy';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }
    
    const status: ConfigurationHealthStatus = {
      overall,
      checksPassed: healthyCount,
      checksFailed: unhealthyCount + degradedCount,
      checks: results,
      recommendations,
      lastChecked: Date.now()
    };
    
    // Emit events based on status changes
    if (this.lastHealthStatus) {
      if (status.overall !== this.lastHealthStatus.overall) {
        this.emit('health:changed', status);
        
        if (status.overall === 'degraded' && this.lastHealthStatus.overall === 'healthy') {
          this.emit('health:degraded', results.filter(r => r.status !== 'healthy'));
        } else if (status.overall === 'unhealthy') {
          this.emit('health:unhealthy', results.filter(r => r.status === 'unhealthy'));
        } else if (status.overall === 'healthy' && this.lastHealthStatus.overall !== 'healthy') {
          this.emit('health:recovered', status);
        }
      }
    }
    
    this.lastHealthStatus = status;
    return status;
  }

  /**
   * Start periodic monitoring
   */
  public startMonitoring(intervalMs: number = ConfigurationMonitor.DEFAULT_MONITORING_INTERVAL_MS): void {
    if (this.isMonitoring) {
      logger.warn('Configuration monitoring already started');
      return;
    }
    
    this.isMonitoring = true;
    
    // Run initial check
    this.runHealthChecks().catch(error => {
      logger.error('Initial health check failed:', error);
    });
    
    // Setup periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.runHealthChecks().catch(error => {
        logger.error('Periodic health check failed:', error);
      });
    }, intervalMs);
    
    logger.info(`Configuration monitoring started with interval: ${intervalMs}ms`);
  }

  /**
   * Stop periodic monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isMonitoring = false;
    logger.info('Configuration monitoring stopped');
  }

  /**
   * Get current health status
   */
  public getCurrentHealthStatus(): ConfigurationHealthStatus | null {
    return this.lastHealthStatus;
  }

  /**
   * Get health status as ServiceHealthStatus
   */
  public getServiceHealthStatus(): ServiceHealthStatus {
    const status = this.lastHealthStatus;
    
    if (!status) {
      return {
        healthy: false,
        name: 'ConfigurationMonitor',
        errors: ['No health checks performed yet'],
        metrics: {}
      };
    }
    
    return {
      healthy: status.overall === 'healthy',
      name: 'ConfigurationMonitor',
      errors: status.checks
        .filter(c => c.status !== 'healthy')
        .map(c => `${c.checkName}: ${c.message}`),
      metrics: {
        overall: status.overall,
        checksPassed: status.checksPassed,
        checksFailed: status.checksFailed,
        lastChecked: status.lastChecked,
        recommendations: status.recommendations.length
      }
    };
  }

  /**
   * Generate health report
   */
  public generateHealthReport(): string {
    const status = this.lastHealthStatus;
    
    if (!status) {
      return 'No health checks performed yet';
    }
    
    const lines: string[] = [
      `Configuration Health Report`,
      `==========================`,
      `Overall Status: ${status.overall.toUpperCase()}`,
      `Last Checked: ${new Date(status.lastChecked).toISOString()}`,
      `Checks Passed: ${status.checksPassed}/${status.checks.length}`,
      ``,
      `Health Check Results:`,
      `--------------------`
    ];
    
    // Group by status
    const grouped = {
      unhealthy: status.checks.filter(c => c.status === 'unhealthy'),
      degraded: status.checks.filter(c => c.status === 'degraded'),
      healthy: status.checks.filter(c => c.status === 'healthy')
    };
    
    // Show unhealthy first
    if (grouped.unhealthy.length > 0) {
      lines.push(`\nUNHEALTHY:`);
      for (const check of grouped.unhealthy) {
        lines.push(`  - ${check.checkName}: ${check.message}`);
        if (check.recommendation) {
          lines.push(`    Recommendation: ${check.recommendation}`);
        }
      }
    }
    
    // Show degraded
    if (grouped.degraded.length > 0) {
      lines.push(`\nDEGRADED:`);
      for (const check of grouped.degraded) {
        lines.push(`  - ${check.checkName}: ${check.message}`);
        if (check.recommendation) {
          lines.push(`    Recommendation: ${check.recommendation}`);
        }
      }
    }
    
    // Show healthy (summary only)
    if (grouped.healthy.length > 0) {
      lines.push(`\nHEALTHY:`);
      lines.push(`  ${grouped.healthy.map(c => c.checkName).join(', ')}`);
    }
    
    // Show recommendations
    if (status.recommendations.length > 0) {
      lines.push(`\nRecommendations:`);
      lines.push(`----------------`);
      status.recommendations.forEach((rec, idx) => {
        lines.push(`${idx + 1}. ${rec}`);
      });
    }
    
    return lines.join('\n');
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopMonitoring();
    this.removeAllListeners();
    this.healthChecks.clear();
    this.lastHealthStatus = null;
  }
}

// Export singleton instance
export const configurationMonitor = new ConfigurationMonitor();