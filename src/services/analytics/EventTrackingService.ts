/**
 * Event Tracking Service
 * 
 * Handles tracking of command usage, errors, and performance events.
 * Part of the refactored analytics system (REF005).
 * 
 * @module EventTrackingService
 */

import { Mutex } from 'async-mutex';
import * as crypto from 'crypto-js';
import { BaseService } from '../base/BaseService';
import { logger } from '../../utils/logger';
import type { 
  IAnalyticsTracker,
  CommandUsageEvent,
  ErrorEvent,
  PerformanceEvent,
  UserPrivacySettings
} from '../interfaces/AnalyticsInterfaces';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import Database from 'better-sqlite3';
import { dataStoreFactory } from '../../utils/DataStoreFactory';
import { EventBatchingService, type IEventBatchingService, type BatchableEvent, type DataStoreEvent, type BatchConfig } from './EventBatchingService';

export interface IEventTrackingService extends IAnalyticsTracker {
  /**
   * Track DataStore operations for analytics
   */
  trackDataStoreOperation(
    operation: 'save' | 'load' | 'error',
    storeType: string,
    latency: number,
    bytesProcessed?: number
  ): Promise<void>;
  
  /**
   * Get total event counts
   */
  getEventCounts(): Promise<{
    commands: number;
    errors: number;
    performance: number;
  } | null>;
  
  /**
   * Configure batching settings
   */
  configureBatching(enabled: boolean, config?: Partial<BatchConfig>): Promise<void>;
  
  /**
   * Force flush batched events
   */
  flushBatchedEvents(): Promise<void>;
}

/**
 * Event Tracking Service Implementation
 * 
 * Tracks various system events for analytics and performance monitoring.
 */
export class EventTrackingService extends BaseService implements IEventTrackingService {
  private database: Database.Database | null = null;
  private readonly mutex = new Mutex();
  private batchingService: IEventBatchingService | null = null;
  
  // Configuration
  private enabled: boolean;
  private useBatching: boolean = true; // Enable batching by default
  
  // Function to get privacy settings
  private getUserPrivacySettings: (userId: string) => Promise<UserPrivacySettings>;
  private hashIdentifier: (id: string) => string;

  constructor(
    database: Database.Database | null,
    config: { enabled: boolean },
    getUserPrivacySettings: (userId: string) => Promise<UserPrivacySettings>,
    hashIdentifier: (id: string) => string
  ) {
    super();
    this.database = database;
    this.enabled = config.enabled;
    this.getUserPrivacySettings = getUserPrivacySettings;
    this.hashIdentifier = hashIdentifier;
  }
  
  /**
   * Get service name
   */
  protected getServiceName(): string {
    return 'EventTrackingService';
  }

  /**
   * Perform service-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    // Initialize batching service if enabled
    if (this.useBatching && this.database) {
      this.batchingService = new EventBatchingService(this.database);
      await this.batchingService.initialize();
    }
    
    logger.info('EventTrackingService initialized', {
      enabled: this.enabled,
      databaseAvailable: !!this.database,
      batchingEnabled: this.useBatching && !!this.batchingService
    });
  }

  /**
   * Perform service-specific shutdown
   */
  protected async performShutdown(): Promise<void> {
    // Shutdown batching service
    if (this.batchingService) {
      await this.batchingService.shutdown();
      this.batchingService = null;
    }
  }

  /**
   * Track command usage
   */
  async trackCommandUsage(event: Omit<CommandUsageEvent, 'timestamp'>): Promise<void> {
    if (!this.enabled || !this.database) return;

    const userHash = this.hashIdentifier(event.userHash);
    const serverHash = event.serverHash ? this.hashIdentifier(event.serverHash) : 'dm';

    // Check if user opted out
    const privacy = await this.getUserPrivacySettings(event.userHash);
    if (privacy.optedOut) return;

    const commandEvent: CommandUsageEvent = {
      ...event,
      timestamp: Date.now(),
      userHash,
      serverHash,
      errorCategory: this.categorizeError(event.errorType)
    };

    // Use batching if available
    if (this.useBatching && this.batchingService) {
      const batchableEvent: BatchableEvent = {
        type: 'command',
        priority: event.success ? 'normal' : 'high', // Failed commands are high priority
        data: commandEvent,
        timestamp: commandEvent.timestamp
      };
      
      await this.batchingService.queueEvent(batchableEvent);
    } else {
      // Fallback to direct write
      const release = await this.mutex.acquire();
      try {
        const stmt = this.database.prepare(`
          INSERT INTO command_usage 
          (timestamp, command_name, user_hash, server_hash, success, duration_ms, error_type, error_category)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          commandEvent.timestamp,
          commandEvent.commandName,
          commandEvent.userHash,
          commandEvent.serverHash,
          commandEvent.success ? 1 : 0,
          commandEvent.durationMs,
          commandEvent.errorType || null,
          commandEvent.errorCategory
        );
      } finally {
        release();
      }
    }
  }

  /**
   * Track user engagement - delegates to UserBehaviorAnalytics
   * This is here to satisfy the IAnalyticsTracker interface
   */
  async trackUserEngagement(
    _userId: string,
    _serverId: string | null,
    _eventType: 'command' | 'mention' | 'reaction'
  ): Promise<void> {
    // This is handled by UserBehaviorAnalytics service
    // We include it here to satisfy the interface
    throw new Error('User engagement tracking should be handled by UserBehaviorAnalytics service');
  }

  /**
   * Track errors
   */
  async trackError(
    errorType: string,
    errorMessage: string,
    context?: { commandName?: string; userId?: string; serverId?: string }
  ): Promise<void> {
    if (!this.enabled || !this.database) return;

    const errorHash = crypto.SHA256(errorMessage).toString().substring(0, 16);
    const errorCategory = this.categorizeError(errorType);
    
    const userHash = context?.userId ? this.hashIdentifier(context.userId) : null;
    const serverHash = context?.serverId ? this.hashIdentifier(context.serverId) : null;

    // Check if user opted out (if applicable)
    if (userHash && context?.userId) {
      const privacy = await this.getUserPrivacySettings(context.userId);
      if (privacy.optedOut) return;
    }

    const errorEvent: ErrorEvent = {
      timestamp: Date.now(),
      errorType,
      errorCategory: errorCategory as any,
      commandContext: context?.commandName,
      userHash: userHash || undefined,
      serverHash: serverHash || undefined,
      errorHash,
      count: 1
    };

    // Use batching if available
    if (this.useBatching && this.batchingService) {
      const batchableEvent: BatchableEvent = {
        type: 'error',
        priority: 'high', // Errors are high priority
        data: errorEvent,
        timestamp: errorEvent.timestamp
      };
      
      await this.batchingService.queueEvent(batchableEvent);
    } else {
      // Fallback to direct write
      const release = await this.mutex.acquire();
      try {
        const stmt = this.database.prepare(`
          INSERT INTO error_events 
          (timestamp, error_type, error_category, command_context, user_hash, server_hash, error_hash, count)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(error_hash, DATE(timestamp / 1000, 'unixepoch')) 
          DO UPDATE SET count = count + 1, timestamp = excluded.timestamp
        `);

        stmt.run(
          errorEvent.timestamp,
          errorEvent.errorType,
          errorEvent.errorCategory,
          errorEvent.commandContext || null,
          errorEvent.userHash || null,
          errorEvent.serverHash || null,
          errorEvent.errorHash
        );
      } finally {
        release();
      }
    }
  }

  /**
   * Track performance metrics
   */
  async trackPerformance(
    metric: 'response_time' | 'memory_usage' | 'api_latency' | 'cache_hit_rate' | 'datastore_save_time' | 'datastore_load_time',
    value: number,
    context?: string
  ): Promise<void> {
    if (!this.enabled || !this.database) return;

    const performanceEvent: PerformanceEvent = {
      timestamp: Date.now(),
      metric,
      value,
      context
    };

    // Use batching if available
    if (this.useBatching && this.batchingService) {
      // Determine priority based on metric type
      let priority: 'high' | 'normal' | 'low' = 'normal';
      if (metric === 'api_latency' && value > 5000) {
        priority = 'high'; // High latency is concerning
      } else if (metric === 'cache_hit_rate' || metric === 'memory_usage') {
        priority = 'low'; // These are less critical
      }
      
      const batchableEvent: BatchableEvent = {
        type: 'performance',
        priority,
        data: performanceEvent,
        timestamp: performanceEvent.timestamp
      };
      
      await this.batchingService.queueEvent(batchableEvent);
    } else {
      // Fallback to direct write
      const release = await this.mutex.acquire();
      try {
        const stmt = this.database.prepare(`
          INSERT INTO performance_events (timestamp, metric, value, context)
          VALUES (?, ?, ?, ?)
        `);

        stmt.run(performanceEvent.timestamp, metric, value, context || null);
      } finally {
        release();
      }
    }
  }

  /**
   * Track DataStore operations
   */
  async trackDataStoreOperation(
    operation: 'save' | 'load' | 'error',
    storeType: string,
    latency: number,
    bytesProcessed?: number
  ): Promise<void> {
    if (!this.enabled || !this.database) return;

    const dataStoreEvent: DataStoreEvent = {
      timestamp: Date.now(),
      operation,
      storeType,
      latency,
      bytesProcessed
    };

    // Use batching if available
    if (this.useBatching && this.batchingService) {
      const priority = operation === 'error' ? 'high' : 'normal';
      
      const batchableEvent: BatchableEvent = {
        type: 'datastore',
        priority,
        data: dataStoreEvent,
        timestamp: dataStoreEvent.timestamp
      };
      
      await this.batchingService.queueEvent(batchableEvent);
      
      // Also track aggregate metrics through batching
      if (operation !== 'error') {
        const performanceEvent: PerformanceEvent = {
          timestamp: Date.now(),
          metric: operation === 'save' ? 'datastore_save_time' : 'datastore_load_time',
          value: latency,
          context: storeType
        };
        
        await this.batchingService.queueEvent({
          type: 'performance',
          priority: 'low',
          data: performanceEvent,
          timestamp: performanceEvent.timestamp
        });
      }
    } else {
      // Fallback to direct write
      const release = await this.mutex.acquire();
      try {
        // Track as performance metric
        const metric = operation === 'save' ? 'datastore_save_latency' : 
          operation === 'load' ? 'datastore_load_latency' : 
            'datastore_error_rate';
        
        const stmt = this.database.prepare(`
          INSERT INTO performance_events (timestamp, metric, value, context)
          VALUES (?, ?, ?, ?)
        `);

        const context = JSON.stringify({ 
          storeType, 
          operation,
          bytesProcessed: bytesProcessed || 0 
        });
        
        stmt.run(Date.now(), metric, latency, context);
        
        // Also track aggregate metrics
        if (operation !== 'error') {
          await this.trackPerformance(
            operation === 'save' ? 'datastore_save_time' : 'datastore_load_time',
            latency,
            storeType
          );
        }
      } finally {
        release();
      }
    }
  }

  /**
   * Configure batching settings
   */
  async configureBatching(enabled: boolean, config?: Partial<BatchConfig>): Promise<void> {
    this.useBatching = enabled;
    
    if (enabled && !this.batchingService && this.database) {
      // Initialize batching service if not already initialized
      this.batchingService = new EventBatchingService(this.database);
      await this.batchingService.initialize();
    } else if (!enabled && this.batchingService) {
      // Flush and shutdown batching service
      await this.batchingService.shutdown();
      this.batchingService = null;
    }
    
    // Update configuration if provided
    if (config && this.batchingService) {
      this.batchingService.updateConfig(config);
    }
    
    logger.info('Event batching configured', {
      enabled,
      config: config || 'default'
    });
  }

  /**
   * Force flush batched events
   */
  async flushBatchedEvents(): Promise<void> {
    if (this.batchingService) {
      await this.batchingService.flush();
    }
  }

  /**
   * Get total event counts
   */
  async getEventCounts(): Promise<{
    commands: number;
    errors: number;
    performance: number;
  } | null> {
    if (!this.database) return null;

    const release = await this.mutex.acquire();
    try {
      const commandCount = this.database.prepare(
        'SELECT COUNT(*) as count FROM command_usage'
      ).get() as { count: number } | undefined;

      const errorCount = this.database.prepare(
        'SELECT SUM(count) as count FROM error_events'
      ).get() as { count: number } | undefined;

      const performanceCount = this.database.prepare(
        'SELECT COUNT(*) as count FROM performance_events'
      ).get() as { count: number } | undefined;

      return {
        commands: commandCount?.count || 0,
        errors: errorCount?.count || 0,
        performance: performanceCount?.count || 0
      };
    } finally {
      release();
    }
  }

  /**
   * Categorize error type
   */
  private categorizeError(errorType?: string): string {
    if (!errorType) return 'system';
    
    const lowerError = errorType.toLowerCase();
    if (lowerError.includes('api') || lowerError.includes('quota') || lowerError.includes('rate')) {
      return 'api';
    }
    if (lowerError.includes('validation') || lowerError.includes('input')) {
      return 'validation';
    }
    if (lowerError.includes('network') || lowerError.includes('timeout') || lowerError.includes('connection')) {
      return 'network';
    }
    if (lowerError.includes('user') || lowerError.includes('permission')) {
      return 'user';
    }
    return 'system';
  }

  /**
   * Check if service is healthy
   */
  protected isHealthy(): boolean {
    const baseHealthy = this.enabled && !!this.database;
    if (!baseHealthy) return false;
    
    // Check batching service health if enabled
    if (this.useBatching && this.batchingService) {
      const batchingStatus = this.batchingService.getBatchingHealthStatus();
      return batchingStatus.healthy;
    }
    
    return baseHealthy;
  }
  
  /**
   * Get health errors
   */
  protected getHealthErrors(): string[] {
    const errors: string[] = [];
    if (!this.enabled) {
      errors.push('Event tracking is disabled');
    }
    if (!this.database) {
      errors.push('Database connection not available');
    }
    
    // Check batching service errors if enabled
    if (this.useBatching && this.batchingService) {
      const batchingStatus = this.batchingService.getBatchingHealthStatus();
      if (!batchingStatus.healthy) {
        errors.push(...batchingStatus.errors.map((e: string) => `Batching: ${e}`));
      }
    }
    
    return errors;
  }
  
  /**
   * Collect service metrics
   */
  protected collectServiceMetrics(): Record<string, unknown> {
    // Try to get event counts as a health check
    let eventCounts = null;
    if (this.database) {
      try {
        eventCounts = this.getEventCounts();
      } catch (error) {
        // Don't fail metrics collection on query error
      }
    }
    
    const metrics: Record<string, unknown> = {
      enabled: this.enabled,
      databaseAvailable: !!this.database,
      batchingEnabled: this.useBatching,
      eventCounts: eventCounts || { commands: 0, errors: 0, performance: 0 }
    };
    
    // Add batching metrics if available
    if (this.useBatching && this.batchingService) {
      metrics.batchingMetrics = this.batchingService.getMetrics();
      metrics.batchingConfig = this.batchingService.getConfig();
    }
    
    return metrics;
  }
}