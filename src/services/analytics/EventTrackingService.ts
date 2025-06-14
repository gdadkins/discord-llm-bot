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
}

/**
 * Event Tracking Service Implementation
 * 
 * Tracks various system events for analytics and performance monitoring.
 */
export class EventTrackingService extends BaseService implements IEventTrackingService {
  private database: Database.Database | null = null;
  private readonly mutex = new Mutex();
  
  // Configuration
  private enabled: boolean;
  
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
    logger.info('EventTrackingService initialized', {
      enabled: this.enabled,
      databaseAvailable: !!this.database
    });
  }

  /**
   * Perform service-specific shutdown
   */
  protected async performShutdown(): Promise<void> {
    // No specific cleanup needed
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

    const release = await this.mutex.acquire();
    try {
      const stmt = this.database.prepare(`
        INSERT INTO command_usage 
        (timestamp, command_name, user_hash, server_hash, success, duration_ms, error_type, error_category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        Date.now(),
        event.commandName,
        userHash,
        serverHash,
        event.success ? 1 : 0,
        event.durationMs,
        event.errorType || null,
        this.categorizeError(event.errorType)
      );
    } finally {
      release();
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

    const release = await this.mutex.acquire();
    try {
      const errorHash = crypto.SHA256(errorMessage).toString().substring(0, 16);
      const errorCategory = this.categorizeError(errorType);
      
      const userHash = context?.userId ? this.hashIdentifier(context.userId) : null;
      const serverHash = context?.serverId ? this.hashIdentifier(context.serverId) : null;

      // Check if user opted out (if applicable)
      if (userHash && context?.userId) {
        const privacy = await this.getUserPrivacySettings(context.userId);
        if (privacy.optedOut) return;
      }

      const stmt = this.database.prepare(`
        INSERT INTO error_events 
        (timestamp, error_type, error_category, command_context, user_hash, server_hash, error_hash, count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(error_hash, DATE(timestamp / 1000, 'unixepoch')) 
        DO UPDATE SET count = count + 1, timestamp = excluded.timestamp
      `);

      stmt.run(
        Date.now(),
        errorType,
        errorCategory,
        context?.commandName || null,
        userHash,
        serverHash,
        errorHash
      );
    } finally {
      release();
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

    const release = await this.mutex.acquire();
    try {
      const stmt = this.database.prepare(`
        INSERT INTO performance_events (timestamp, metric, value, context)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(Date.now(), metric, value, context || null);
    } finally {
      release();
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
    return this.enabled && !!this.database;
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
    
    return {
      enabled: this.enabled,
      databaseAvailable: !!this.database,
      eventCounts: eventCounts || { commands: 0, errors: 0, performance: 0 }
    };
  }
}