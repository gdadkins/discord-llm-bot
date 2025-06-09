/**
 * Analytics Service Interface Definitions
 * 
 * Focused interfaces for analytics, privacy, and reporting functionality.
 * Separated from main interfaces file for better maintainability.
 */

import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Core Analytics Service Interface
// ============================================================================

/**
 * Analytics data tracking interface
 * 
 * ## Contract Guarantees
 * - All tracking operations are asynchronous and non-blocking
 * - Privacy-compliant data collection with user consent handling
 * - Automatic data hashing for sensitive information
 * - Graceful degradation when analytics are disabled
 * 
 * ## Usage Patterns
 * - Track command usage for optimization insights
 * - Monitor user engagement for feature development
 * - Capture error patterns for system reliability
 * - Record performance metrics for capacity planning
 * 
 * @example
 * ```typescript
 * await tracker.trackCommandUsage({
 *   commandName: 'help',
 *   userHash: 'user123',
 *   serverHash: 'server456',
 *   success: true,
 *   durationMs: 250
 * });
 * ```
 */
export interface IAnalyticsTracker extends IService {
  /**
   * Tracks command usage for optimization and insights
   * 
   * ## Contract
   * - MUST hash user/server identifiers for privacy
   * - MUST record accurate timing and success metrics
   * - SHOULD batch events for performance
   * - MUST respect user privacy settings
   * 
   * ## Side Effects
   * - Stores usage data in analytics database
   * - May trigger aggregation processes
   * - Updates usage statistics
   * 
   * @param event Command usage event data (timestamp added automatically)
   * @throws {AnalyticsError} On storage or privacy validation failures
   * 
   * @example
   * ```typescript
   * await tracker.trackCommandUsage({
   *   commandName: 'roast',
   *   userHash: hashUserId(userId),
   *   serverHash: hashServerId(serverId),
   *   success: true,
   *   durationMs: 1250,
   *   errorType: undefined
   * });
   * ```
   */
  trackCommandUsage(event: Omit<CommandUsageEvent, 'timestamp'>): Promise<void>;
  
  /**
   * Tracks user engagement patterns for feature development
   * 
   * ## Contract
   * - MUST hash user identifiers before storage
   * - MUST handle null serverIds for direct messages
   * - SHOULD aggregate engagement metrics
   * - MUST respect user opt-out preferences
   * 
   * ## Privacy Compliance
   * - User IDs are hashed using consistent algorithm
   * - No personally identifiable information stored
   * - Respects user privacy settings and opt-out requests
   * 
   * @param userId User identifier (will be hashed)
   * @param serverId Server identifier (null for DMs, will be hashed)
   * @param eventType Type of engagement event
   * @throws {AnalyticsError} On privacy validation or storage failures
   * 
   * @example
   * ```typescript
   * await tracker.trackUserEngagement(
   *   '123456789',
   *   '987654321',
   *   'mention'
   * );
   * ```
   */
  trackUserEngagement(
    userId: string,
    serverId: string | null,
    eventType: 'command' | 'mention' | 'reaction'
  ): Promise<void>;
  
  /**
   * Tracks errors for system reliability monitoring
   * 
   * ## Contract
   * - MUST sanitize error messages for sensitive data
   * - MUST categorize errors for pattern analysis
   * - SHOULD aggregate similar errors to reduce noise
   * - MUST hash any user/server identifiers in context
   * 
   * ## Error Categories
   * - 'api': External API failures
   * - 'validation': Input validation errors
   * - 'network': Connectivity issues
   * - 'system': Internal system errors
   * - 'user': User-induced errors
   * 
   * @param errorType Type of error for categorization
   * @param errorMessage Error message (will be sanitized)
   * @param context Optional context information (user/server IDs will be hashed)
   * @throws {AnalyticsError} On storage failures
   * 
   * @example
   * ```typescript
   * await tracker.trackError(
   *   'api',
   *   'Gemini API rate limit exceeded',
   *   {
   *     commandName: 'chat',
   *     userId: '123456789',
   *     serverId: '987654321'
   *   }
   * );
   * ```
   */
  trackError(
    errorType: string,
    errorMessage: string,
    context?: { commandName?: string; userId?: string; serverId?: string }
  ): Promise<void>;
  
  /**
   * Tracks performance metrics for capacity planning
   * 
   * ## Contract
   * - MUST validate metric values are within expected ranges
   * - SHOULD aggregate metrics for trend analysis
   * - MUST handle high-frequency metric collection efficiently
   * - SHOULD provide percentile calculations
   * 
   * ## Metric Types
   * - 'response_time': Command processing time in milliseconds
   * - 'memory_usage': Current memory usage in bytes
   * - 'api_latency': External API response time in milliseconds
   * - 'cache_hit_rate': Cache hit percentage (0-100)
   * 
   * @param metric Metric name from predefined set
   * @param value Metric value (must be positive number)
   * @param context Optional context string for filtering
   * @throws {AnalyticsError} On invalid metric values or storage failures
   * 
   * @example
   * ```typescript
   * await tracker.trackPerformance(
   *   'response_time',
   *   1250,
   *   'gemini-api'
   * );
   * ```
   */
  trackPerformance(
    metric: 'response_time' | 'memory_usage' | 'api_latency' | 'cache_hit_rate',
    value: number,
    context?: string
  ): Promise<void>;
}

/**
 * Analytics reporting interface
 */
export interface IAnalyticsReporter extends IService {
  /**
   * Gets usage statistics for a time period
   * @param startDate Start of period
   * @param endDate End of period
   * @param serverId Optional server filter
   */
  getUsageStatistics(
    startDate: Date,
    endDate: Date,
    serverId?: string
  ): Promise<UsageStatistics | null>;
  
  /**
   * Generates analytics report
   * @param period Report period
   */
  generateReport(period: 'daily' | 'weekly' | 'monthly'): Promise<AnalyticsReport>;
  
  /**
   * Gets system statistics
   */
  getSystemStats(): Promise<SystemStats | null>;
}

/**
 * User privacy management interface
 */
export interface IAnalyticsPrivacyManager extends IService {
  /**
   * User privacy management
   */
  setUserPrivacySettings(userId: string, settings: Partial<UserPrivacySettings>): Promise<void>;
  getUserPrivacySettings(userId: string): Promise<UserPrivacySettings>;
  deleteUserData(userId: string): Promise<void>;
  exportUserData(userId: string): Promise<ExportData | null>;
}

/**
 * Analytics configuration management interface
 */
export interface IAnalyticsConfigurationManager extends IService {
  /**
   * Configuration management
   */
  isEnabled(): boolean;
  getConfiguration(): AnalyticsConfig;
  updateConfiguration(config: Partial<AnalyticsConfig>): Promise<void>;
}

/**
 * Composite Analytics Service Interface combining all analytics capabilities
 */
export interface IAnalyticsService extends 
  IAnalyticsTracker,
  IAnalyticsReporter,
  IAnalyticsPrivacyManager,
  IAnalyticsConfigurationManager {
}

// ============================================================================
// Analytics Data Types
// ============================================================================

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
  errorHash: string;
  count: number;
}

export interface PerformanceEvent {
  id?: number;
  timestamp: number;
  metric: 'response_time' | 'memory_usage' | 'api_latency' | 'cache_hit_rate';
  value: number;
  context?: string;
}

export interface UsageStatistics {
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
  commandBreakdown: Array<{
    command_name: string;
    command_count: number;
    success_rate: number;
    avg_response_time: number;
    unique_users: number;
    total_commands: number;
  }>;
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

export interface SystemStats {
  totalCommands: number;
  totalUsers: number;
  totalErrors: number;
  activeSessions: number;
  databaseSize: number;
  retentionDays: number;
  privacyMode: string;
  optedOutUsers: number;
}

export interface ExportData {
  exportDate: string;
  userHash: string;
  privacySettings?: UserPrivacySettings;
  commandUsage: Array<Record<string, unknown>>;
  engagement: Array<Record<string, unknown>>;
  note: string;
}