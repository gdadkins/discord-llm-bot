/**
 * Metrics Collection Service
 * 
 * Handles database operations, aggregation, and data cleanup for analytics.
 * Part of the refactored analytics system (REF005).
 * 
 * @module MetricsCollectionService
 */

import { Mutex } from 'async-mutex';
import * as path from 'path';
import * as fs from 'fs/promises';
import Database from 'better-sqlite3';
import { BaseService } from '../base/BaseService';
import { logger } from '../../utils/logger';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import type { 
  UsageStatistics,
  SystemStats,
  AnalyticsConfig
} from '../interfaces/AnalyticsInterfaces';

interface CommandUsageRow {
  command_name: string;
  command_count: number;
  success_rate: number;
  avg_response_time: number;
  unique_users: number;
  total_commands: number;
}

interface ErrorStatsRow {
  error_type: string;
  error_category: string;
  total_count: number;
}

interface PerformanceRow {
  metric: string;
  avg_value: number;
  min_value: number;
  max_value: number;
}

interface SystemStatsRow {
  count: number;
}

interface DailyStatsRow {
  total_commands: number;
  unique_users: number;
  success_rate: number;
  avg_response_time: number;
}

interface ErrorSumRow {
  total_errors: number;
}

interface EngagementAvgRow {
  avg_depth: number;
}

export interface DailyAggregate {
  date: string;
  totalCommands: number;
  uniqueUsers: number;
  successRate: number;
  avgResponseTime: number;
  topCommands: string; // JSON array
  errorCount: number;
  engagementScore: number;
}

export interface IMetricsCollectionService {
  /**
   * Initialize database and tables
   */
  initialize(): Promise<void>;
  
  /**
   * Shutdown service and close database
   */
  shutdown(): Promise<void>;
  
  /**
   * Get database instance
   */
  getDatabase(): Database.Database | null;
  
  /**
   * Perform daily aggregation
   */
  performDailyAggregation(): Promise<void>;
  
  /**
   * Perform data cleanup based on retention policy
   */
  performDataCleanup(): Promise<void>;
  
  /**
   * Get usage statistics
   */
  getUsageStatistics(
    startDate: Date,
    endDate: Date,
    serverId?: string
  ): Promise<UsageStatistics | null>;
  
  /**
   * Get system statistics
   */
  getSystemStats(): Promise<SystemStats | null>;
  
  /**
   * Get error statistics
   */
  getErrorStatistics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    errorRate: number;
    topErrors: Array<{ errorType: string; count: number; trend: string }>;
  }>;
  
  /**
   * Get performance statistics
   */
  getPerformanceStatistics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    trends: Array<{ metric: string; current: number; change: number }>;
  }>;
  
  /**
   * Get health status
   */
  getHealthStatus(): ServiceHealthStatus;
}

/**
 * Metrics Collection Service Implementation
 * 
 * Manages the analytics database and performs data aggregation.
 */
export class MetricsCollectionService extends BaseService implements IMetricsCollectionService {
  private database: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly mutex = new Mutex();
  
  // Timers
  private aggregationTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // Configuration
  private config: AnalyticsConfig;
  private hashIdentifier: (id: string) => string;
  private privacySettingsCount: number = 0;

  constructor(
    dbPath: string,
    config: AnalyticsConfig,
    hashIdentifier: (id: string) => string
  ) {
    super();
    this.dbPath = dbPath;
    this.config = config;
    this.hashIdentifier = hashIdentifier;
  }
  
  /**
   * Get service name
   */
  protected getServiceName(): string {
    return 'MetricsCollectionService';
  }

  /**
   * Perform service-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Analytics disabled in configuration');
      return;
    }

    await this.ensureDataDirectory();
    await this.initializeDatabase();
    this.startTimers();
    
    logger.info('MetricsCollectionService initialized', {
      dbPath: this.dbPath,
      retentionDays: this.config.retentionDays,
      aggregationIntervalMinutes: this.config.aggregationIntervalMinutes
    });
  }

  /**
   * Perform service-specific shutdown
   */
  protected async performShutdown(): Promise<void> {
    // Clear all timers
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Save final aggregations
    await this.performDailyAggregation();
    
    // Close database
    if (this.database) {
      this.database.close();
      this.database = null;
    }
  }

  /**
   * Get database instance
   */
  getDatabase(): Database.Database | null {
    return this.database;
  }

  /**
   * Set privacy settings count for health status
   */
  setPrivacySettingsCount(count: number): void {
    this.privacySettingsCount = count;
  }

  /**
   * Ensure data directory exists
   */
  private async ensureDataDirectory(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create analytics data directory:', error);
    }
  }

  /**
   * Initialize database and create tables
   */
  private async initializeDatabase(): Promise<void> {
    this.database = new Database(this.dbPath);
    
    // Enable foreign keys and WAL mode
    this.database.exec('PRAGMA foreign_keys = ON');
    this.database.exec('PRAGMA journal_mode = WAL');
    
    // Create tables
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS command_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        command_name TEXT NOT NULL,
        user_hash TEXT NOT NULL,
        server_hash TEXT NOT NULL,
        success INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        error_type TEXT,
        error_category TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_command_usage_timestamp ON command_usage(timestamp);
      CREATE INDEX IF NOT EXISTS idx_command_usage_command ON command_usage(command_name);
      CREATE INDEX IF NOT EXISTS idx_command_usage_user ON command_usage(user_hash);
    `);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS user_engagement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        user_hash TEXT NOT NULL,
        server_hash TEXT NOT NULL,
        event_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        interaction_depth INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_engagement_timestamp ON user_engagement(timestamp);
      CREATE INDEX IF NOT EXISTS idx_engagement_user ON user_engagement(user_hash);
      CREATE INDEX IF NOT EXISTS idx_engagement_session ON user_engagement(session_id);
    `);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS error_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        error_type TEXT NOT NULL,
        error_category TEXT NOT NULL,
        command_context TEXT,
        user_hash TEXT,
        server_hash TEXT,
        error_hash TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        UNIQUE(error_hash, DATE(timestamp / 1000, 'unixepoch'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_error_timestamp ON error_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_error_type ON error_events(error_type);
      CREATE INDEX IF NOT EXISTS idx_error_hash ON error_events(error_hash);
    `);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS performance_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        context TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_performance_timestamp ON performance_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_performance_metric ON performance_events(metric);
    `);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS daily_aggregates (
        date TEXT PRIMARY KEY,
        total_commands INTEGER NOT NULL,
        unique_users INTEGER NOT NULL,
        success_rate REAL NOT NULL,
        avg_response_time REAL NOT NULL,
        top_commands TEXT NOT NULL,
        error_count INTEGER NOT NULL,
        engagement_score REAL NOT NULL
      );
    `);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS user_privacy (
        user_hash TEXT PRIMARY KEY,
        opted_out INTEGER NOT NULL DEFAULT 0,
        data_retention_days INTEGER NOT NULL DEFAULT 90,
        allow_insights INTEGER NOT NULL DEFAULT 1,
        last_updated INTEGER NOT NULL
      );
    `);

    logger.info('Analytics database initialized successfully');
  }

  /**
   * Start background timers
   */
  private startTimers(): void {
    // Daily aggregation
    this.aggregationTimer = setInterval(async () => {
      try {
        await this.performDailyAggregation();
      } catch (error) {
        logger.error('Error during daily aggregation:', error);
      }
    }, this.config.aggregationIntervalMinutes * 60 * 1000);

    // Data cleanup (daily)
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.performDataCleanup();
      } catch (error) {
        logger.error('Error during data cleanup:', error);
      }
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Perform daily aggregation
   */
  async performDailyAggregation(): Promise<void> {
    if (!this.database) return;

    const release = await this.mutex.acquire();
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];

      // Check if aggregation already exists
      const existing = this.database.prepare('SELECT date FROM daily_aggregates WHERE date = ?').get(dateStr);
      if (existing) return;

      const startOfDay = new Date(yesterday);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(yesterday);
      endOfDay.setHours(23, 59, 59, 999);

      // Aggregate command usage
      const stats = this.database.prepare(`
        SELECT 
          COUNT(*) as total_commands,
          COUNT(DISTINCT user_hash) as unique_users,
          AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
          AVG(duration_ms) as avg_response_time
        FROM command_usage 
        WHERE timestamp BETWEEN ? AND ?
      `).get(startOfDay.getTime(), endOfDay.getTime()) as DailyStatsRow | undefined;

      // Get top commands
      const topCommands = this.database.prepare(`
        SELECT command_name, COUNT(*) as count
        FROM command_usage 
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY command_name
        ORDER BY count DESC
        LIMIT 10
      `).all(startOfDay.getTime(), endOfDay.getTime());

      // Get error count
      const errorResult = this.database.prepare(`
        SELECT SUM(count) as total_errors
        FROM error_events 
        WHERE timestamp BETWEEN ? AND ?
      `).get(startOfDay.getTime(), endOfDay.getTime()) as ErrorSumRow | undefined;
      const errorCount = errorResult?.total_errors || 0;

      // Calculate engagement score (simplified)
      const engagementResult = this.database.prepare(`
        SELECT AVG(interaction_depth) as avg_depth
        FROM user_engagement 
        WHERE timestamp BETWEEN ? AND ?
      `).get(startOfDay.getTime(), endOfDay.getTime()) as EngagementAvgRow | undefined;
      const engagementScore = engagementResult?.avg_depth || 0;

      // Insert aggregation
      this.database.prepare(`
        INSERT INTO daily_aggregates 
        (date, total_commands, unique_users, success_rate, avg_response_time, top_commands, error_count, engagement_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        dateStr,
        stats?.total_commands || 0,
        stats?.unique_users || 0,
        stats?.success_rate || 0,
        stats?.avg_response_time || 0,
        JSON.stringify(topCommands),
        errorCount,
        engagementScore
      );

      logger.info(`Daily aggregation completed for ${dateStr}`);
    } finally {
      release();
    }
  }

  /**
   * Perform data cleanup based on retention policy
   */
  async performDataCleanup(): Promise<void> {
    if (!this.database) return;

    const release = await this.mutex.acquire();
    try {
      const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);

      // Clean up old data based on retention policy
      const tables = ['command_usage', 'user_engagement', 'error_events', 'performance_events'];
      let totalCleaned = 0;

      for (const table of tables) {
        const result = this.database.prepare(`DELETE FROM ${table} WHERE timestamp < ?`).run(cutoffTime);
        totalCleaned += result.changes;
      }

      // Clean up daily aggregates older than 1 year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const yearCutoff = oneYearAgo.toISOString().split('T')[0];
      
      const aggregateResult = this.database.prepare('DELETE FROM daily_aggregates WHERE date < ?').run(yearCutoff);
      totalCleaned += aggregateResult.changes;

      if (totalCleaned > 0) {
        logger.info(`Analytics cleanup: removed ${totalCleaned} old records`);
      }

      // Vacuum database periodically
      this.database.exec('VACUUM');
    } finally {
      release();
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStatistics(
    startDate: Date,
    endDate: Date,
    serverId?: string
  ): Promise<UsageStatistics | null> {
    if (!this.config.enabled || !this.database) return null;

    const serverHash = serverId ? this.hashIdentifier(serverId) : null;
    const release = await this.mutex.acquire();
    
    try {
      let baseQuery = `
        SELECT 
          COUNT(*) as total_commands,
          COUNT(DISTINCT user_hash) as unique_users,
          AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
          AVG(duration_ms) as avg_response_time,
          command_name,
          COUNT(*) as command_count
        FROM command_usage 
        WHERE timestamp BETWEEN ? AND ?
      `;
      
      const params: (number | string)[] = [startDate.getTime(), endDate.getTime()];
      
      if (serverHash) {
        baseQuery += ' AND server_hash = ?';
        params.push(serverHash);
      }
      
      baseQuery += ' GROUP BY command_name ORDER BY command_count DESC';
      
      const results = this.database.prepare(baseQuery).all(...params) as CommandUsageRow[];
      
      return {
        period: { start: startDate.toISOString(), end: endDate.toISOString() },
        summary: {
          totalCommands: results.reduce((sum, r) => sum + r.command_count, 0),
          uniqueUsers: new Set(results.map(r => r.unique_users)).size,
          avgSuccessRate: results.reduce((sum, r) => sum + r.success_rate, 0) / results.length,
          avgResponseTime: results.reduce((sum, r) => sum + r.avg_response_time, 0) / results.length,
        },
        commandBreakdown: results,
      };
    } finally {
      release();
    }
  }

  /**
   * Get error statistics
   */
  async getErrorStatistics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    errorRate: number;
    topErrors: Array<{ errorType: string; count: number; trend: string }>;
  }> {
    const release = await this.mutex.acquire();
    try {
      const errors = this.database!.prepare(`
        SELECT error_type, error_category, SUM(count) as total_count
        FROM error_events 
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY error_type, error_category
        ORDER BY total_count DESC
        LIMIT 10
      `).all(startDate.getTime(), endDate.getTime()) as ErrorStatsRow[];

      const totalErrors = errors.reduce((sum, e) => sum + e.total_count, 0);
      const totalCommandsResult = this.database!.prepare(`
        SELECT COUNT(*) as count FROM command_usage 
        WHERE timestamp BETWEEN ? AND ?
      `).get(startDate.getTime(), endDate.getTime()) as SystemStatsRow | undefined;
      
      const totalCommands = totalCommandsResult?.count || 1;

      return {
        errorRate: (totalErrors / totalCommands) * 100,
        topErrors: errors.map(e => ({
          errorType: e.error_type,
          count: e.total_count,
          trend: 'stable', // TODO: Calculate trend
        })),
      };
    } finally {
      release();
    }
  }

  /**
   * Get performance statistics
   */
  async getPerformanceStatistics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    trends: Array<{ metric: string; current: number; change: number }>;
  }> {
    const release = await this.mutex.acquire();
    try {
      const metrics = this.database!.prepare(`
        SELECT metric, AVG(value) as avg_value, MIN(value) as min_value, MAX(value) as max_value
        FROM performance_events 
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY metric
      `).all(startDate.getTime(), endDate.getTime()) as PerformanceRow[];

      return {
        trends: metrics.map(m => ({
          metric: m.metric,
          current: m.avg_value,
          change: 0, // TODO: Calculate change vs previous period
        })),
      };
    } finally {
      release();
    }
  }

  /**
   * Get system statistics
   */
  async getSystemStats(): Promise<SystemStats | null> {
    if (!this.database) return null;

    const release = await this.mutex.acquire();
    try {
      const totalCommandsResult = this.database.prepare('SELECT COUNT(*) as count FROM command_usage').get() as SystemStatsRow | undefined;
      const totalUsersResult = this.database.prepare('SELECT COUNT(DISTINCT user_hash) as count FROM command_usage').get() as SystemStatsRow | undefined;
      const totalErrorsResult = this.database.prepare('SELECT SUM(count) as count FROM error_events').get() as SystemStatsRow | undefined;
      const pageCountResult = this.database.prepare('PRAGMA page_count').get() as { page_count: number } | undefined;
      const pageSizeResult = this.database.prepare('PRAGMA page_size').get() as { page_size: number } | undefined;
      const optedOutResult = this.database.prepare('SELECT COUNT(*) as count FROM user_privacy WHERE opted_out = 1').get() as SystemStatsRow | undefined;

      const stats: SystemStats = {
        totalCommands: totalCommandsResult?.count || 0,
        totalUsers: totalUsersResult?.count || 0,
        totalErrors: totalErrorsResult?.count || 0,
        activeSessions: 0, // Will be updated by AnalyticsManager
        databaseSize: (pageCountResult?.page_count || 0) * (pageSizeResult?.page_size || 0),
        retentionDays: this.config.retentionDays,
        privacyMode: this.config.privacyMode,
        optedOutUsers: optedOutResult?.count || 0,
      };

      return stats;
    } finally {
      release();
    }
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get service health status
   */
  getHealthStatus(): ServiceHealthStatus {
    const errors: string[] = [];
    let healthy = true;

    // Check if analytics is enabled
    if (!this.config.enabled) {
      errors.push('Analytics is disabled in configuration');
      healthy = false;
    }

    // Check database connection
    if (!this.database) {
      errors.push('Database connection not established');
      healthy = false;
    }

    // Check if database is accessible (try a simple query)
    if (this.database) {
      try {
        this.database.prepare('SELECT 1').get();
      } catch (error) {
        errors.push(`Database query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        healthy = false;
      }
    }

    // Collect metrics for health status
    const metrics: Record<string, unknown> = {
      enabled: this.config.enabled,
      databasePath: this.dbPath,
      retentionDays: this.config.retentionDays,
      aggregationIntervalMinutes: this.config.aggregationIntervalMinutes,
      privacySettingsCount: this.privacySettingsCount,
      timersActive: {
        aggregation: !!this.aggregationTimer,
        cleanup: !!this.cleanupTimer
      }
    };

    // Add database size if available
    if (this.database) {
      try {
        const pageCountResult = this.database.prepare('PRAGMA page_count').get() as { page_count: number } | undefined;
        const pageSizeResult = this.database.prepare('PRAGMA page_size').get() as { page_size: number } | undefined;
        const databaseSize = (pageCountResult?.page_count || 0) * (pageSizeResult?.page_size || 0);
        metrics.databaseSizeBytes = databaseSize;
        metrics.databaseSizeFormatted = this.formatBytes(databaseSize);
      } catch (error) {
        // Don't fail health check on database size query issues
        metrics.databaseSizeError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return {
      healthy,
      name: this.getServiceName(),
      errors,
      metrics
    };
  }
  
  /**
   * Check if service is healthy
   */
  protected isHealthy(): boolean {
    if (!this.config.enabled) {
      return false;
    }
    
    if (!this.database) {
      return false;
    }
    
    // Check if database is accessible
    try {
      this.database.prepare('SELECT 1').get();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get health errors
   */
  protected getHealthErrors(): string[] {
    const errors: string[] = [];
    
    if (!this.config.enabled) {
      errors.push('Analytics is disabled in configuration');
    }
    
    if (!this.database) {
      errors.push('Database connection not established');
    } else {
      // Check if database is accessible
      try {
        this.database.prepare('SELECT 1').get();
      } catch (error) {
        errors.push(`Database query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return errors;
  }
  
  /**
   * Collect service metrics
   */
  protected collectServiceMetrics(): Record<string, unknown> {
    const metrics: Record<string, unknown> = {
      enabled: this.config.enabled,
      databasePath: this.dbPath,
      retentionDays: this.config.retentionDays,
      aggregationIntervalMinutes: this.config.aggregationIntervalMinutes,
      privacySettingsCount: this.privacySettingsCount,
      timersActive: {
        aggregation: !!this.aggregationTimer,
        cleanup: !!this.cleanupTimer
      }
    };

    // Add database size if available
    if (this.database) {
      try {
        const pageCountResult = this.database.prepare('PRAGMA page_count').get() as { page_count: number } | undefined;
        const pageSizeResult = this.database.prepare('PRAGMA page_size').get() as { page_size: number } | undefined;
        const databaseSize = (pageCountResult?.page_count || 0) * (pageSizeResult?.page_size || 0);
        metrics.databaseSizeBytes = databaseSize;
        metrics.databaseSizeFormatted = this.formatBytes(databaseSize);
      } catch (error) {
        // Don't fail metrics collection on database size query issues
        metrics.databaseSizeError = error instanceof Error ? error.message : 'Unknown error';
      }
    }
    
    return metrics;
  }
}