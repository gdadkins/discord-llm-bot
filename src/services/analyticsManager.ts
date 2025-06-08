import { Mutex } from 'async-mutex';
import * as path from 'path';
import * as fs from 'fs/promises';
import Database from 'better-sqlite3';
import * as crypto from 'crypto-js';
import { logger } from '../utils/logger';
import { dataStoreFactory } from '../utils/DataStoreFactory';

// Database query result interfaces
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

// Analytics Data Types
export interface CommandUsageEvent {
  id?: number;
  timestamp: number;
  commandName: string;
  userHash: string;
  serverHash: string | null | undefined;
  success: boolean;
  durationMs: number;
  errorType?: string;
  errorCategory?: string;
}

export interface UserEngagementEvent {
  id?: number;
  timestamp: number;
  userHash: string;
  serverHash: string;
  eventType: 'command' | 'mention' | 'reaction';
  sessionId: string;
  interactionDepth: number;
}

export interface ErrorEvent {
  id?: number;
  timestamp: number;
  errorType: string;
  errorCategory: 'api' | 'validation' | 'network' | 'system' | 'user';
  commandContext?: string;
  userHash?: string;
  serverHash?: string;
  errorHash: string; // Anonymized error fingerprint
  count: number;
}

export interface PerformanceEvent {
  id?: number;
  timestamp: number;
  metric: 'response_time' | 'memory_usage' | 'api_latency' | 'cache_hit_rate';
  value: number;
  context?: string;
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

export interface AnalyticsReport {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  summary: {
    totalCommands: number;
    uniqueUsers: number;
    successRate: number;
    avgResponseTime: number;
    errorRate: number;
    engagementTrend: 'increasing' | 'stable' | 'decreasing';
  };
  insights: {
    mostPopularCommands: Array<{ command: string; count: number; successRate: number }>;
    peakUsageHours: Array<{ hour: number; commandCount: number }>;
    commonErrors: Array<{ errorType: string; count: number; trend: string }>;
    performanceTrends: Array<{ metric: string; current: number; change: number }>;
  };
  recommendations: string[];
}

export interface UserPrivacySettings {
  userHash: string;
  optedOut: boolean;
  dataRetentionDays: number;
  allowInsights: boolean;
  lastUpdated: number;
}

export interface AnalyticsConfig {
  enabled: boolean;
  retentionDays: number;
  aggregationIntervalMinutes: number;
  privacyMode: 'strict' | 'balanced' | 'full';
  reportingEnabled: boolean;
  reportSchedule: 'daily' | 'weekly' | 'monthly';
  allowCrossServerAnalysis: boolean;
}

interface SessionTracker {
  sessionId: string;
  userHash: string;
  serverHash: string;
  startTime: number;
  lastActivity: number;
  commandCount: number;
  interactions: number;
}

interface UsageStatistics {
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalCommands: number;
    uniqueUsers: number;
    avgSuccessRate: number;
    avgResponseTime: number;
  };
  commandBreakdown: CommandUsageRow[];
}

interface ErrorStatistics {
  errorRate: number;
  topErrors: Array<{ errorType: string; count: number; trend: string }>;
}

interface PerformanceStatistics {
  trends: Array<{ metric: string; current: number; change: number }>;
}

interface SystemStats {
  totalCommands: number;
  totalUsers: number;
  totalErrors: number;
  activeSessions: number;
  databaseSize: number;
  retentionDays: number;
  privacyMode: string;
  optedOutUsers: number;
}

interface UserPrivacyRow {
  user_hash: string;
  opted_out: number;
  data_retention_days: number;
  allow_insights: number;
  last_updated: number;
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

interface ExportData {
  exportDate: string;
  userHash: string;
  privacySettings?: UserPrivacySettings;
  commandUsage: Array<Record<string, unknown>>;
  engagement: Array<Record<string, unknown>>;
  note: string;
}

export class AnalyticsManager {
  private database: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly mutex = new Mutex();
  private readonly sessionMutex = new Mutex();
  
  // Session tracking
  private activeSessions = new Map<string, SessionTracker>();
  private sessionTimeoutMs = 30 * 60 * 1000; // 30 minutes
  
  // Timers
  private aggregationTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private reportTimer: NodeJS.Timeout | null = null;
  private sessionCleanupTimer: NodeJS.Timeout | null = null;
  
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
  
  // Privacy settings cache
  private privacySettings = new Map<string, UserPrivacySettings>();
  
  constructor(dbPath = './data/analytics.db') {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Analytics disabled in configuration');
      return;
    }

    try {
      await this.ensureDataDirectory();
      await this.initializeDatabase();
      await this.loadPrivacySettings();
      this.startTimers();
      
      logger.info('AnalyticsManager initialized', {
        dbPath: this.dbPath,
        retentionDays: this.config.retentionDays,
        privacyMode: this.config.privacyMode,
        reportingEnabled: this.config.reportingEnabled,
      });
    } catch (error) {
      logger.error('Failed to initialize AnalyticsManager:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Clear all timers
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
      this.sessionCleanupTimer = null;
    }
    
    // Save final aggregations
    await this.performDailyAggregation();
    
    // Close database
    if (this.database) {
      this.database.close();
      this.database = null;
    }
    
    logger.info('AnalyticsManager shutdown completed');
  }

  // Privacy and GDPR Compliance
  private hashIdentifier(id: string): string {
    // Use SHA-256 with salt for consistent anonymization
    const salt = process.env.ANALYTICS_SALT || 'discord-llm-bot-analytics';
    return crypto.SHA256(id + salt).toString();
  }

  async setUserPrivacySettings(userId: string, settings: Partial<UserPrivacySettings>): Promise<void> {
    if (!this.config.enabled) return;

    const userHash = this.hashIdentifier(userId);
    const release = await this.mutex.acquire();
    
    try {
      const existing = this.privacySettings.get(userHash) || {
        userHash,
        optedOut: false,
        dataRetentionDays: this.config.retentionDays,
        allowInsights: true,
        lastUpdated: Date.now(),
      };

      const updated = {
        ...existing,
        ...settings,
        userHash,
        lastUpdated: Date.now(),
      };

      this.privacySettings.set(userHash, updated);
      
      // Update database
      const stmt = this.database!.prepare(`
        INSERT OR REPLACE INTO user_privacy 
        (user_hash, opted_out, data_retention_days, allow_insights, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        updated.userHash,
        updated.optedOut ? 1 : 0,
        updated.dataRetentionDays,
        updated.allowInsights ? 1 : 0,
        updated.lastUpdated
      );

      // If user opted out, delete their data
      if (updated.optedOut) {
        await this.deleteUserData(userHash);
      }

      logger.info(`Updated privacy settings for user ${userHash.substring(0, 8)}...`);
    } finally {
      release();
    }
  }

  async getUserPrivacySettings(userId: string): Promise<UserPrivacySettings> {
    const userHash = this.hashIdentifier(userId);
    return this.privacySettings.get(userHash) || {
      userHash,
      optedOut: false,
      dataRetentionDays: this.config.retentionDays,
      allowInsights: true,
      lastUpdated: Date.now(),
    };
  }

  async deleteUserData(userId: string): Promise<void> {
    if (!this.config.enabled || !this.database) return;

    const userHash = this.hashIdentifier(userId);
    const release = await this.mutex.acquire();
    try {
      // Delete from all tables
      this.database.prepare('DELETE FROM command_usage WHERE user_hash = ?').run(userHash);
      this.database.prepare('DELETE FROM user_engagement WHERE user_hash = ?').run(userHash);
      this.database.prepare('DELETE FROM error_events WHERE user_hash = ?').run(userHash);
      
      logger.info(`Deleted all data for user ${userHash.substring(0, 8)}...`);
    } finally {
      release();
    }
  }

  async exportUserData(userId: string): Promise<ExportData | null> {
    const userHash = this.hashIdentifier(userId);
    if (!this.config.enabled || !this.database) return null;

    const release = await this.mutex.acquire();
    try {
      const commandUsage = this.database.prepare(`
        SELECT timestamp, command_name, server_hash, success, duration_ms, error_type
        FROM command_usage WHERE user_hash = ?
      `).all(userHash);

      const engagement = this.database.prepare(`
        SELECT timestamp, server_hash, event_type, session_id, interaction_depth
        FROM user_engagement WHERE user_hash = ?
      `).all(userHash);

      const privacy = this.privacySettings.get(userHash);

      return {
        exportDate: new Date().toISOString(),
        userHash: userHash.substring(0, 8) + '...', // Partial hash for verification
        privacySettings: privacy,
        commandUsage: commandUsage as Array<Record<string, unknown>>,
        engagement: engagement as Array<Record<string, unknown>>,
        note: 'All user identifiers have been anonymized. Raw user IDs are never stored.',
      };
    } finally {
      release();
    }
  }

  // Command Usage Tracking
  async trackCommandUsage(event: Omit<CommandUsageEvent, 'timestamp'>): Promise<void> {
    if (!this.config.enabled || !this.database) return;

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

      // Update session
      await this.updateUserSession(userHash, serverHash, 'command');
    } finally {
      release();
    }
  }

  // User Engagement Tracking
  async trackUserEngagement(userId: string, serverId: string | null, eventType: 'command' | 'mention' | 'reaction'): Promise<void> {
    if (!this.config.enabled || !this.database) return;

    const userHash = this.hashIdentifier(userId);
    const serverHash = serverId ? this.hashIdentifier(serverId) : 'dm';

    // Check if user opted out
    const privacy = await this.getUserPrivacySettings(userId);
    if (privacy.optedOut) return;

    await this.updateUserSession(userHash, serverHash, eventType);
  }

  private async updateUserSession(userHash: string, serverHash: string, eventType: string): Promise<void> {
    const sessionRelease = await this.sessionMutex.acquire();
    try {
      const sessionKey = `${userHash}-${serverHash}`;
      const now = Date.now();
      
      let session = this.activeSessions.get(sessionKey);
      
      if (!session || (now - session.lastActivity) > this.sessionTimeoutMs) {
        // Start new session
        const sessionId = `${now}-${Math.random().toString(36).substr(2, 9)}`;
        session = {
          sessionId,
          userHash,
          serverHash,
          startTime: now,
          lastActivity: now,
          commandCount: 0,
          interactions: 0,
        };
        this.activeSessions.set(sessionKey, session);
      }

      // Update session
      session.lastActivity = now;
      session.interactions++;
      if (eventType === 'command') {
        session.commandCount++;
      }

      // Store engagement event
      const stmt = this.database!.prepare(`
        INSERT INTO user_engagement 
        (timestamp, user_hash, server_hash, event_type, session_id, interaction_depth)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        now,
        userHash,
        serverHash,
        eventType,
        session.sessionId,
        session.interactions
      );
    } finally {
      sessionRelease();
    }
  }

  // Error Tracking
  async trackError(errorType: string, errorMessage: string, context?: { commandName?: string; userId?: string; serverId?: string }): Promise<void> {
    if (!this.config.enabled || !this.database) return;

    const release = await this.mutex.acquire();
    try {
      const errorHash = crypto.SHA256(errorMessage).toString().substring(0, 16);
      const errorCategory = this.categorizeError(errorType);
      
      const userHash = context?.userId ? this.hashIdentifier(context.userId) : null;
      const serverHash = context?.serverId ? this.hashIdentifier(context.serverId) : null;

      // Check if user opted out (if applicable)
      if (userHash) {
        const privacy = await this.getUserPrivacySettings(context!.userId!);
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

  // Performance Tracking
  async trackPerformance(metric: 'response_time' | 'memory_usage' | 'api_latency' | 'cache_hit_rate', value: number, context?: string): Promise<void> {
    if (!this.config.enabled || !this.database) return;

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

  // DataStore Analytics Tracking
  async trackDataStoreOperation(operation: 'save' | 'load' | 'error', storeType: string, latency: number, bytesProcessed?: number): Promise<void> {
    if (!this.config.enabled || !this.database) return;

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
          operation === 'save' ? 'datastore_save_time' as any : 'datastore_load_time' as any,
          latency,
          storeType
        );
      }
    } finally {
      release();
    }
  }

  // Analytics Queries
  async getUsageStatistics(startDate: Date, endDate: Date, serverId?: string): Promise<UsageStatistics | null> {
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

  async generateReport(period: 'daily' | 'weekly' | 'monthly'): Promise<AnalyticsReport> {
    if (!this.config.enabled || !this.database) {
      throw new Error('Analytics not enabled');
    }

    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
    case 'daily':
      startDate.setDate(now.getDate() - 1);
      break;
    case 'weekly':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'monthly':
      startDate.setMonth(now.getMonth() - 1);
      break;
    }

    const usage = await this.getUsageStatistics(startDate, now);
    const errors = await this.getErrorStatistics(startDate, now);
    const performance = await this.getPerformanceStatistics(startDate, now);
    
    return {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      summary: {
        totalCommands: usage?.summary.totalCommands || 0,
        uniqueUsers: usage?.summary.uniqueUsers || 0,
        successRate: usage?.summary.avgSuccessRate || 0,
        avgResponseTime: usage?.summary.avgResponseTime || 0,
        errorRate: errors?.errorRate || 0,
        engagementTrend: 'stable', // TODO: Calculate trend
      },
      insights: {
        mostPopularCommands: usage?.commandBreakdown.slice(0, 5).map(cmd => ({
          command: cmd.command_name,
          count: cmd.command_count,
          successRate: cmd.success_rate,
        })) || [],
        peakUsageHours: [], // TODO: Implement
        commonErrors: errors?.topErrors || [],
        performanceTrends: performance?.trends || [],
      },
      recommendations: this.generateRecommendations(usage, errors, performance),
    };
  }

  private async getErrorStatistics(startDate: Date, endDate: Date): Promise<ErrorStatistics> {
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

  private async getPerformanceStatistics(startDate: Date, endDate: Date): Promise<PerformanceStatistics> {
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

  private generateRecommendations(usage: UsageStatistics | null, errors: ErrorStatistics, _performance: PerformanceStatistics): string[] {
    const recommendations: string[] = [];

    if (usage?.summary) {
      if (usage.summary.avgSuccessRate < 0.95) {
        recommendations.push('Success rate is below 95%. Consider improving error handling.');
      }

      if (usage.summary.avgResponseTime > 3000) {
        recommendations.push('Average response time is over 3 seconds. Consider performance optimization.');
      }
    }

    if (errors.errorRate > 5) {
      recommendations.push('Error rate is above 5%. Review error patterns and implement fixes.');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is performing well. Continue monitoring for improvements.');
    }

    return recommendations;
  }

  // DataStore Analytics Dashboard
  async getDataStoreDashboard(startDate: Date, endDate: Date): Promise<any> {
    if (!this.config.enabled || !this.database) return null;

    const release = await this.mutex.acquire();
    try {
      // Get DataStore performance metrics
      const perfQuery = `
        SELECT 
          metric,
          AVG(value) as avg_latency,
          MIN(value) as min_latency,
          MAX(value) as max_latency,
          COUNT(*) as operation_count
        FROM performance_events
        WHERE timestamp BETWEEN ? AND ?
          AND metric IN ('datastore_save_latency', 'datastore_load_latency')
        GROUP BY metric
      `;
      
      const perfResults = this.database.prepare(perfQuery).all(
        startDate.getTime(), 
        endDate.getTime()
      ) as PerformanceRow[];
      
      // Get error metrics
      const errorQuery = `
        SELECT 
          COUNT(*) as error_count
        FROM performance_events
        WHERE timestamp BETWEEN ? AND ?
          AND metric = 'datastore_error_rate'
      `;
      
      const errorResult = this.database.prepare(errorQuery).get(
        startDate.getTime(), 
        endDate.getTime()
      ) as { error_count: number };
      
      // Get DataStore metrics from factory
      const factoryMetrics = dataStoreFactory.getAggregatedMetrics();
      
      // Calculate trends
      const hourlyQuery = `
        SELECT 
          strftime('%Y-%m-%d %H:00:00', timestamp/1000, 'unixepoch') as hour,
          metric,
          AVG(value) as avg_value,
          COUNT(*) as count
        FROM performance_events
        WHERE timestamp BETWEEN ? AND ?
          AND metric LIKE 'datastore_%'
        GROUP BY hour, metric
        ORDER BY hour
      `;
      
      const hourlyTrends = this.database.prepare(hourlyQuery).all(
        startDate.getTime(), 
        endDate.getTime()
      );
      
      return {
        summary: {
          totalStores: factoryMetrics.totalStores,
          storesByType: factoryMetrics.storesByType,
          totalOperations: factoryMetrics.totalSaveOperations + factoryMetrics.totalLoadOperations,
          errorRate: errorResult?.error_count || 0,
          performance: {
            save: perfResults.find(r => r.metric === 'datastore_save_latency') || {
              avg_latency: 0,
              min_latency: 0,
              max_latency: 0,
              operation_count: 0
            },
            load: perfResults.find(r => r.metric === 'datastore_load_latency') || {
              avg_latency: 0,
              min_latency: 0,
              max_latency: 0,
              operation_count: 0
            }
          }
        },
        trends: hourlyTrends,
        currentMetrics: factoryMetrics
      };
    } finally {
      release();
    }
  }

  // Utility Methods
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

  private async ensureDataDirectory(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create analytics data directory:', error);
    }
  }

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

  private async loadPrivacySettings(): Promise<void> {
    if (!this.database) return;

    const settings = this.database.prepare('SELECT * FROM user_privacy').all() as UserPrivacyRow[];
    for (const setting of settings) {
      this.privacySettings.set(setting.user_hash, {
        userHash: setting.user_hash,
        optedOut: setting.opted_out === 1,
        dataRetentionDays: setting.data_retention_days,
        allowInsights: setting.allow_insights === 1,
        lastUpdated: setting.last_updated,
      });
    }

    logger.info(`Loaded ${settings.length} user privacy settings`);
  }

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

    // Session cleanup (every 10 minutes)
    this.sessionCleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 10 * 60 * 1000);

    // Reporting timer (if enabled)
    if (this.config.reportingEnabled) {
      const reportInterval = this.config.reportSchedule === 'daily' ? 24 * 60 * 60 * 1000 :
        this.config.reportSchedule === 'weekly' ? 7 * 24 * 60 * 60 * 1000 :
          30 * 24 * 60 * 60 * 1000;

      this.reportTimer = setInterval(async () => {
        try {
          const report = await this.generateReport(this.config.reportSchedule);
          logger.info('Generated analytics report', { period: this.config.reportSchedule, summary: report.summary });
        } catch (error) {
          logger.error('Error generating analytics report:', error);
        }
      }, reportInterval);
    }
  }

  private async performDailyAggregation(): Promise<void> {
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

  private async performDataCleanup(): Promise<void> {
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

  private cleanupInactiveSessions(): void {
    const now = Date.now();
    let cleanedSessions = 0;

    for (const [key, session] of this.activeSessions.entries()) {
      if ((now - session.lastActivity) > this.sessionTimeoutMs) {
        this.activeSessions.delete(key);
        cleanedSessions++;
      }
    }

    if (cleanedSessions > 0) {
      logger.debug(`Cleaned up ${cleanedSessions} inactive sessions`);
    }
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
    } else if (this.config.enabled && !this.database) {
      await this.initialize();
    }
    
    logger.info('Analytics configuration updated', this.config);
  }

  async getSystemStats(): Promise<SystemStats | null> {
    if (!this.database) return null;

    const release = await this.mutex.acquire();
    try {
      const totalCommandsResult = this.database.prepare('SELECT COUNT(*) as count FROM command_usage').get() as SystemStatsRow | undefined;
      const totalUsersResult = this.database.prepare('SELECT COUNT(DISTINCT user_hash) as count FROM command_usage').get() as SystemStatsRow | undefined;
      const totalErrorsResult = this.database.prepare('SELECT SUM(count) as count FROM error_events').get() as SystemStatsRow | undefined;
      const pageCountResult = this.database.prepare('PRAGMA page_count').get() as { page_count: number } | undefined;
      const pageSizeResult = this.database.prepare('PRAGMA page_size').get() as { page_size: number } | undefined;

      const stats: SystemStats = {
        totalCommands: totalCommandsResult?.count || 0,
        totalUsers: totalUsersResult?.count || 0,
        totalErrors: totalErrorsResult?.count || 0,
        activeSessions: this.activeSessions.size,
        databaseSize: (pageCountResult?.page_count || 0) * (pageSizeResult?.page_size || 0),
        retentionDays: this.config.retentionDays,
        privacyMode: this.config.privacyMode,
        optedOutUsers: Array.from(this.privacySettings.values()).filter(p => p.optedOut).length,
      };

      return stats;
    } finally {
      release();
    }
  }
}