import { BaseService } from '../base/BaseService';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto-js';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import type { 
  IAnalyticsService,
  CommandUsageEvent,
  UserPrivacySettings,
  ExportData,
  AnalyticsReport,
  UsageStatistics,
  SystemStats,
  AnalyticsConfig
} from '../interfaces/AnalyticsInterfaces';
import {
  UserBehaviorAnalytics,
  EventTrackingService,
  MetricsCollectionService,
  ReportGenerationService,
  type IUserBehaviorAnalytics,
  type IEventTrackingService,
  type IMetricsCollectionService,
  type IReportGenerationService,
  type DataStoreDashboard
} from '../analytics';

/**
 * Analytics Manager - Facade Service
 * 
 * Acts as a facade for the refactored analytics services (REF005).
 * Maintains backward compatibility while delegating to specialized services:
 * - UserBehaviorAnalytics: User engagement and privacy
 * - EventTrackingService: Command, error, and performance tracking
 * - MetricsCollectionService: Database and aggregation
 * - ReportGenerationService: Reports and insights
 */

export class AnalyticsManager extends BaseService implements IAnalyticsService {
  // Specialized services
  private userBehaviorAnalytics: IUserBehaviorAnalytics | null = null;
  private eventTrackingService: IEventTrackingService | null = null;
  private metricsCollectionService: IMetricsCollectionService | null = null;
  private reportGenerationService: IReportGenerationService | null = null;
  
  // Configuration
  private config: AnalyticsConfig = {
    enabled: process.env.ANALYTICS_ENABLED === 'true',
    retentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '90'),
    aggregationIntervalMinutes: parseInt(process.env.ANALYTICS_AGGREGATION_INTERVAL || '60'),
    privacyMode: (process.env.ANALYTICS_PRIVACY_MODE as 'strict' | 'balanced' | 'full') || 'balanced',
    reportingEnabled: process.env.ANALYTICS_REPORTING_ENABLED === 'true',
    reportSchedule: (process.env.ANALYTICS_REPORT_SCHEDULE as 'daily' | 'weekly' | 'monthly') || 'weekly',
    allowCrossServerAnalysis: process.env.ANALYTICS_ALLOW_CROSS_SERVER === 'true',
  };
  
  private readonly dbPath: string;
  
  constructor(dbPath = './data/analytics.db') {
    super();
    this.dbPath = dbPath;
  }
  
  /**
   * Get service name
   */
  protected getServiceName(): string {
    return 'AnalyticsManager';
  }

  /**
   * Perform service-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Analytics disabled in configuration');
      return;
    }

    // Initialize metrics collection service first (manages database)
    this.metricsCollectionService = new MetricsCollectionService(
      this.dbPath,
      this.config,
      this.hashIdentifier.bind(this)
    );
    await this.metricsCollectionService.initialize();
    
    const database = this.metricsCollectionService.getDatabase();
    
    // Initialize user behavior analytics
    this.userBehaviorAnalytics = new UserBehaviorAnalytics(
      database,
      {
        retentionDays: this.config.retentionDays,
        privacyMode: this.config.privacyMode
      }
    );
    await this.userBehaviorAnalytics.initialize();
    
    // Initialize event tracking service
    this.eventTrackingService = new EventTrackingService(
      database,
      { enabled: this.config.enabled },
      this.getUserPrivacySettings.bind(this),
      this.hashIdentifier.bind(this)
    );
    await this.eventTrackingService.initialize();
    
    // Configure event batching for optimal performance
    await this.eventTrackingService.configureBatching(true, {
      maxBatchSize: 100,
      batchIntervalMs: 1000,
      highPriorityFlushThreshold: 10,
      samplingRates: new Map([
        ['message_processed', 0.1], // Sample 10% of message processed events
        ['cache_hit', 0.05], // Sample 5% of cache hit events
        ['performance.response_time', 0.5], // Sample 50% of response time metrics
        ['performance.memory_usage', 0.1], // Sample 10% of memory usage metrics
        ['performance.cache_hit_rate', 0.05], // Sample 5% of cache hit rate metrics
      ]),
      aggregationWindowMs: 60000 // 1 minute aggregation window
    });
    
    // Initialize report generation service
    this.reportGenerationService = new ReportGenerationService(
      database,
      this.config,
      this.metricsCollectionService
    );
    await this.reportGenerationService.initialize();
    
    logger.info('AnalyticsManager initialized with specialized services', {
      dbPath: this.dbPath,
      retentionDays: this.config.retentionDays,
      privacyMode: this.config.privacyMode,
      reportingEnabled: this.config.reportingEnabled,
    });
  }

  /**
   * Perform service-specific shutdown
   */
  protected async performShutdown(): Promise<void> {
    // Shutdown all services in reverse order
    if (this.reportGenerationService) {
      await this.reportGenerationService.shutdown();
    }
    
    if (this.eventTrackingService) {
      // Flush any pending batched events before shutdown
      await this.eventTrackingService.flushBatchedEvents();
      await this.eventTrackingService.shutdown();
    }
    
    if (this.userBehaviorAnalytics) {
      await this.userBehaviorAnalytics.shutdown();
    }
    
    if (this.metricsCollectionService) {
      await this.metricsCollectionService.shutdown();
    }
  }

  // Privacy and GDPR Compliance
  hashIdentifier(id: string): string {
    // Delegate to user behavior analytics service if available
    if (this.userBehaviorAnalytics) {
      return this.userBehaviorAnalytics.hashIdentifier(id);
    }
    // Fallback implementation
    const salt = process.env.ANALYTICS_SALT || 'discord-llm-bot-analytics';
    return crypto.SHA256(id + salt).toString();
  }

  async setUserPrivacySettings(userId: string, settings: Partial<UserPrivacySettings>): Promise<void> {
    if (!this.userBehaviorAnalytics) return;
    return this.userBehaviorAnalytics.setUserPrivacySettings(userId, settings);
  }

  async getUserPrivacySettings(userId: string): Promise<UserPrivacySettings> {
    if (!this.userBehaviorAnalytics) {
      // Return default settings if service not initialized
      const userHash = this.hashIdentifier(userId);
      return {
        userHash,
        optedOut: false,
        dataRetentionDays: this.config.retentionDays,
        allowInsights: true,
        lastUpdated: Date.now(),
      };
    }
    return this.userBehaviorAnalytics.getUserPrivacySettings(userId);
  }

  async deleteUserData(userId: string): Promise<void> {
    if (!this.userBehaviorAnalytics) return;
    return this.userBehaviorAnalytics.deleteUserData(userId);
  }

  async exportUserData(userId: string): Promise<ExportData | null> {
    if (!this.userBehaviorAnalytics) return null;
    return this.userBehaviorAnalytics.exportUserData(userId);
  }

  // Command Usage Tracking
  async trackCommandUsage(event: Omit<CommandUsageEvent, 'timestamp'>): Promise<void> {
    if (!this.eventTrackingService) return;
    await this.eventTrackingService.trackCommandUsage(event);
    
    // Also update user session
    if (this.userBehaviorAnalytics) {
      await this.userBehaviorAnalytics.trackUserEngagement(
        event.userHash,
        event.serverHash || null,
        'command'
      );
    }
  }

  // User Engagement Tracking
  async trackUserEngagement(userId: string, serverId: string | null, eventType: 'command' | 'mention' | 'reaction'): Promise<void> {
    if (!this.userBehaviorAnalytics) return;
    return this.userBehaviorAnalytics.trackUserEngagement(userId, serverId, eventType);
  }


  // Error Tracking
  async trackError(errorType: string, errorMessage: string, context?: { commandName?: string; userId?: string; serverId?: string }): Promise<void> {
    if (!this.eventTrackingService) return;
    return this.eventTrackingService.trackError(errorType, errorMessage, context);
  }

  // Performance Tracking
  async trackPerformance(metric: 'response_time' | 'memory_usage' | 'api_latency' | 'cache_hit_rate' | 'datastore_save_time' | 'datastore_load_time', value: number, context?: string): Promise<void> {
    if (!this.eventTrackingService) return;
    return this.eventTrackingService.trackPerformance(metric, value, context);
  }

  // DataStore Analytics Tracking
  async trackDataStoreOperation(operation: 'save' | 'load' | 'error', storeType: string, latency: number, bytesProcessed?: number): Promise<void> {
    if (!this.eventTrackingService) return;
    return this.eventTrackingService.trackDataStoreOperation(operation, storeType, latency, bytesProcessed);
  }

  // Analytics Queries
  async getUsageStatistics(startDate: Date, endDate: Date, serverId?: string): Promise<UsageStatistics | null> {
    if (!this.reportGenerationService) return null;
    return this.reportGenerationService.getUsageStatistics(startDate, endDate, serverId);
  }

  async generateReport(period: 'daily' | 'weekly' | 'monthly'): Promise<AnalyticsReport> {
    if (!this.reportGenerationService) {
      throw new Error('Report generation service not initialized');
    }
    return this.reportGenerationService.generateReport(period);
  }


  // Enhanced DataStore Analytics Dashboard
  async getDataStoreDashboard(startDate: Date, endDate: Date): Promise<DataStoreDashboard | null> {
    if (!this.reportGenerationService) return null;
    return this.reportGenerationService.getDataStoreDashboard(startDate, endDate);
  }


  // Public API Methods
  isEnabled(): boolean {
    return this.config.enabled;
  }

  getConfiguration(): AnalyticsConfig {
    return { ...this.config };
  }

  async updateConfiguration(config: Partial<AnalyticsConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    
    if (!this.config.enabled) {
      await this.shutdown();
    } else if (this.config.enabled && !this.metricsCollectionService) {
      await this.initialize();
    }
    
    logger.info('Analytics configuration updated', this.config);
  }

  async getSystemStats(): Promise<SystemStats | null> {
    if (!this.metricsCollectionService) return null;
    const stats = await this.metricsCollectionService.getSystemStats();
    
    // Update active sessions count from user behavior analytics
    if (stats && this.userBehaviorAnalytics) {
      stats.activeSessions = this.userBehaviorAnalytics.getActiveSessionsCount();
    }
    
    return stats;
  }

  /**
   * Check if service is healthy
   */
  protected isHealthy(): boolean {
    if (!this.config.enabled) {
      return false;
    }
    
    // Check if all services are healthy
    const servicesHealthy = [
      this.userBehaviorAnalytics,
      this.eventTrackingService,
      this.metricsCollectionService,
      this.reportGenerationService
    ].every(service => {
      if (!service) return true; // Service not initialized is not unhealthy
      const status = service.getHealthStatus();
      // Handle synchronous status only since BaseService returns synchronous
      return (status as ServiceHealthStatus).healthy;
    });
    
    return servicesHealthy;
  }
  
  /**
   * Get health errors
   */
  protected getHealthErrors(): string[] {
    const errors: string[] = [];
    
    if (!this.config.enabled) {
      errors.push('Analytics is disabled in configuration');
    }
    
    // Collect errors from all services
    const services = [
      { name: 'userBehaviorAnalytics', service: this.userBehaviorAnalytics },
      { name: 'eventTrackingService', service: this.eventTrackingService },
      { name: 'metricsCollectionService', service: this.metricsCollectionService },
      { name: 'reportGenerationService', service: this.reportGenerationService }
    ];
    
    for (const { service } of services) {
      if (service) {
        const statusResult = service.getHealthStatus();
        // Handle synchronous status only since BaseService returns synchronous
        const status = statusResult as ServiceHealthStatus;
        if (!status.healthy) {
          errors.push(...status.errors);
        }
      }
    }
    
    return errors;
  }
  
  /**
   * Collect service metrics
   */
  protected collectServiceMetrics(): Record<string, unknown> {
    const serviceStatuses: Record<string, ServiceHealthStatus | null> = {};
    
    if (this.userBehaviorAnalytics) {
      const statusResult = this.userBehaviorAnalytics.getHealthStatus();
      serviceStatuses.userBehavior = statusResult as ServiceHealthStatus;
    }
    
    if (this.eventTrackingService) {
      const statusResult = this.eventTrackingService.getHealthStatus();
      serviceStatuses.eventTracking = statusResult as ServiceHealthStatus;
    }
    
    if (this.metricsCollectionService) {
      const statusResult = this.metricsCollectionService.getHealthStatus();
      serviceStatuses.metricsCollection = statusResult as ServiceHealthStatus;
    }
    
    if (this.reportGenerationService) {
      const statusResult = this.reportGenerationService.getHealthStatus();
      serviceStatuses.reportGeneration = statusResult as ServiceHealthStatus;
    }
    
    return {
      enabled: this.config.enabled,
      databasePath: this.dbPath,
      retentionDays: this.config.retentionDays,
      privacyMode: this.config.privacyMode,
      reportingEnabled: this.config.reportingEnabled,
      reportSchedule: this.config.reportSchedule,
      services: serviceStatuses
    };
  }
}