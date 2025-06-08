/**
 * Service Interface Definitions and Contracts
 * 
 * This file defines clear interfaces for all services in the Discord LLM Bot,
 * establishing contracts for inputs, outputs, error handling, and dependencies.
 * 
 * Design Principles:
 * 1. Interface Segregation - Services depend on minimal interfaces
 * 2. Dependency Inversion - Services depend on abstractions, not concrete implementations
 * 3. Clear Contracts - All methods have defined inputs, outputs, and error conditions
 * 4. Loose Coupling - Services interact through well-defined interfaces
 */

import type { GuildMember, Guild, Client } from 'discord.js';
import type { MessageContext } from '../../commands';

// ============================================================================
// Core Service Interfaces
// ============================================================================

/**
 * Base service interface that all services must implement
 */
export interface IService {
  /**
   * Initializes the service and any required resources
   * @throws {ServiceInitializationError} If initialization fails
   */
  initialize(): Promise<void>;
  
  /**
   * Gracefully shuts down the service and cleans up resources
   */
  shutdown(): Promise<void>;
  
  /**
   * Returns the current health status of the service
   */
  getHealthStatus(): ServiceHealthStatus | Promise<ServiceHealthStatus>;
}

/**
 * Health status for a service
 */
export interface ServiceHealthStatus {
  healthy: boolean;
  name: string;
  errors: string[];
  metrics?: Record<string, unknown>;
}

/**
 * Service initialization error
 */
export class ServiceInitializationError extends Error {
  constructor(serviceName: string, reason: string) {
    super(`Failed to initialize ${serviceName}: ${reason}`);
    this.name = 'ServiceInitializationError';
  }
}

// ============================================================================
// Analytics Service Interfaces
// ============================================================================

export interface IAnalyticsService extends IService {
  /**
   * Tracks command usage
   * @param event Command usage event data
   */
  trackCommandUsage(event: Omit<CommandUsageEvent, 'timestamp'>): Promise<void>;
  
  /**
   * Tracks user engagement
   * @param userId User identifier
   * @param serverId Server identifier (null for DMs)
   * @param eventType Type of engagement event
   */
  trackUserEngagement(
    userId: string,
    serverId: string | null,
    eventType: 'command' | 'mention' | 'reaction'
  ): Promise<void>;
  
  /**
   * Tracks errors
   * @param errorType Type of error
   * @param errorMessage Error message
   * @param context Optional context information
   */
  trackError(
    errorType: string,
    errorMessage: string,
    context?: { commandName?: string; userId?: string; serverId?: string }
  ): Promise<void>;
  
  /**
   * Tracks performance metrics
   * @param metric Metric name
   * @param value Metric value
   * @param context Optional context
   */
  trackPerformance(
    metric: 'response_time' | 'memory_usage' | 'api_latency' | 'cache_hit_rate',
    value: number,
    context?: string
  ): Promise<void>;
  
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
   * User privacy management
   */
  setUserPrivacySettings(userId: string, settings: Partial<UserPrivacySettings>): Promise<void>;
  getUserPrivacySettings(userId: string): Promise<UserPrivacySettings>;
  deleteUserData(userId: string): Promise<void>;
  exportUserData(userId: string): Promise<ExportData | null>;
  
  /**
   * Configuration management
   */
  isEnabled(): boolean;
  getConfiguration(): AnalyticsConfig;
  updateConfiguration(config: Partial<AnalyticsConfig>): Promise<void>;
  getSystemStats(): Promise<SystemStats | null>;
}

// Analytics data types
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

// ============================================================================
// AI Service Interfaces (Gemini)
// ============================================================================

export interface IAIService extends IService {
  /**
   * Generates a response to a user prompt
   * @param prompt User's input message
   * @param userId User identifier for context
   * @param serverId Server identifier for context (optional)
   * @param respond Callback for streaming responses (optional)
   * @param messageContext Additional message context (optional)
   * @param member Discord member object (optional)
   * @param guild Discord guild object (optional)
   * @returns Generated response text
   * @throws {AIServiceError} On generation failure
   */
  generateResponse(
    prompt: string,
    userId: string,
    serverId?: string,
    respond?: (response: string) => Promise<void>,
    messageContext?: MessageContext,
    member?: GuildMember,
    guild?: Guild
  ): Promise<string>;
  
  /**
   * Gets remaining API quota
   */
  getRemainingQuota(): { minuteRemaining: number; dailyRemaining: number };
  
  /**
   * Clears conversation history for a user
   * @param userId User identifier
   * @returns Whether conversation existed
   */
  clearUserConversation(userId: string): boolean;
  
  /**
   * Gets conversation statistics
   */
  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
  };
  
  /**
   * Context management
   */
  addEmbarrassingMoment(serverId: string, userId: string, moment: string): void;
  addRunningGag(serverId: string, gag: string): void;
  
  /**
   * Service dependencies
   */
  setHealthMonitor(healthMonitor: IHealthMonitor): void;
  setDiscordClient(client: Client): void;
  
  /**
   * Sub-service access
   */
  getPersonalityManager(): IPersonalityManager;
  getRateLimiter(): IRateLimiter;
  getContextManager(): IContextManager;
  getRoastingEngine(): IRoastingEngine;
  
  /**
   * Cache management
   */
  getCacheStats(): CacheStats;
  getCachePerformance(): CachePerformance;
  clearCache(): void;
  
  /**
   * Degradation management
   */
  getDegradationStatus(): DegradationStatus;
  triggerRecovery(serviceName?: 'gemini' | 'discord'): Promise<void>;
  
  /**
   * Configuration management
   */
  updateConfiguration(config: AIServiceConfig): Promise<void>;
  validateConfiguration(config: BotConfiguration): Promise<{ valid: boolean; errors: string[] }>;
}

export interface AIServiceConfig {
  model?: string;
  temperature?: number;
  topK?: number;
  topP?: number;
  maxTokens?: number;
  safetySettings?: Record<string, string>;
  systemInstructions?: {
    roasting: string;
    helpful: string;
  };
  grounding?: {
    threshold: number;
    enabled: boolean;
  };
  thinking?: {
    budget: number;
    includeInResponse: boolean;
  };
  enableCodeExecution?: boolean;
  enableStructuredOutput?: boolean;
}

export class AIServiceError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AIServiceError';
  }
}

// ============================================================================
// Configuration Service Interfaces
// ============================================================================

export interface IConfigurationService extends IService {
  /**
   * Configuration validation
   */
  validateConfiguration(config: BotConfiguration): { valid: boolean; errors?: string[] };
  
  /**
   * Configuration management
   */
  reloadConfiguration(source?: 'file-watcher' | 'command' | 'api', reason?: string): Promise<void>;
  saveConfiguration(modifiedBy: string, reason?: string): Promise<void>;
  
  /**
   * Version management
   */
  getVersionHistory(): Promise<ConfigurationVersion[]>;
  rollbackToVersion(version: string, modifiedBy: string, reason?: string): Promise<void>;
  
  /**
   * Audit logging
   */
  getAuditLog(limit?: number): Promise<ConfigurationChange[]>;
  
  /**
   * Configuration getters
   */
  getDiscordConfig(): DiscordConfig;
  getGeminiConfig(): GeminiConfig;
  getRateLimitingConfig(): RateLimitingConfig;
  getFeatureConfig(): FeatureConfig;
  getRoastingConfig(): RoastingConfig;
  getMonitoringConfig(): MonitoringConfig;
  getConfiguration(): BotConfiguration;
  
  /**
   * Configuration updates
   */
  updateConfiguration(updates: Partial<BotConfiguration>, modifiedBy: string, reason?: string): Promise<void>;
  updateConfigurationSection(
    section: keyof BotConfiguration,
    updates: Record<string, unknown>,
    modifiedBy: string,
    reason?: string
  ): Promise<void>;
  
  /**
   * Import/Export
   */
  exportConfiguration(format?: 'json' | 'yaml'): Promise<string>;
  importConfiguration(configData: string, format?: 'json' | 'yaml', modifiedBy?: string, reason?: string): Promise<void>;
  
  /**
   * Event handling
   */
  on(event: 'config:changed', listener: (changes: ConfigurationChange[]) => void): this;
  on(event: 'config:validated', listener: (valid: boolean, errors?: string[]) => void): this;
  on(event: 'config:reloaded', listener: (version: string) => void): this;
  on(event: 'config:error', listener: (error: Error) => void): this;
  on(event: 'config:rollback', listener: (fromVersion: string, toVersion: string) => void): this;
  on(event: string | symbol, listener: (...args: unknown[]) => void): this;
}

// Configuration types
export interface BotConfiguration {
  version: string;
  lastModified: string;
  modifiedBy: string;
  discord: DiscordConfig;
  gemini: GeminiConfig;
  rateLimiting: RateLimitingConfig;
  features: FeatureConfig;
}

export interface DiscordConfig {
  intents: string[];
  permissions: {
    [guildId: string]: {
      adminRoles: string[];
      moderatorRoles: string[];
      allowedChannels?: string[];
    };
  };
  commands: {
    [commandName: string]: {
      enabled: boolean;
      permissions: 'all' | 'admin' | 'moderator';
      cooldown?: number;
      usage?: string;
    };
  };
}

export interface GeminiConfig {
  model: string;
  temperature: number;
  topK: number;
  topP: number;
  maxTokens: number;
  safetySettings: {
    harassment: 'block_none' | 'block_low_and_above' | 'block_medium_and_above' | 'block_high';
    hateSpeech: 'block_none' | 'block_low_and_above' | 'block_medium_and_above' | 'block_high';
    sexuallyExplicit: 'block_none' | 'block_low_and_above' | 'block_medium_and_above' | 'block_high';
    dangerousContent: 'block_none' | 'block_low_and_above' | 'block_medium_and_above' | 'block_high';
  };
  systemInstructions: {
    roasting: string;
    helpful: string;
  };
  grounding: {
    threshold: number;
    enabled: boolean;
  };
  thinking: {
    budget: number;
    includeInResponse: boolean;
  };
}

export interface RateLimitingConfig {
  rpm: number;
  daily: number;
  burstSize: number;
  safetyMargin: number;
  retryOptions: {
    maxRetries: number;
    retryDelay: number;
    retryMultiplier: number;
  };
}

export interface RoastingConfig {
  baseChance: number;
  consecutiveBonus: number;
  maxChance: number;
  cooldownEnabled: boolean;
  moodSystem: {
    enabled: boolean;
    moodDuration: number;
    chaosEvents: {
      enabled: boolean;
      triggerChance: number;
      durationRange: [number, number];
      multiplierRange: [number, number];
    };
  };
  psychologicalWarfare: {
    roastDebt: boolean;
    mercyKills: boolean;
    cooldownBreaking: boolean;
  };
}

export interface MonitoringConfig {
  healthMetrics: {
    enabled: boolean;
    collectionInterval: number;
    retentionDays: number;
  };
  alerts: {
    enabled: boolean;
    memoryThreshold: number;
    errorRateThreshold: number;
    responseTimeThreshold: number;
    webhookUrl?: string;
  };
  gracefulDegradation: {
    enabled: boolean;
    circuitBreaker: {
      failureThreshold: number;
      timeout: number;
      resetTimeout: number;
    };
    queueing: {
      maxSize: number;
      maxAge: number;
    };
  };
}

export interface FeatureConfig {
  roasting: RoastingConfig;
  codeExecution: boolean;
  structuredOutput: boolean;
  monitoring: MonitoringConfig;
  contextMemory: {
    enabled: boolean;
    maxMessages: number;
    timeoutMinutes: number;
    maxContextChars: number;
    compressionEnabled: boolean;
    crossServerEnabled: boolean;
  };
  caching: {
    enabled: boolean;
    maxSize: number;
    ttlMinutes: number;
    compressionEnabled: boolean;
  };
}

export interface ConfigurationChange {
  timestamp: string;
  version: string;
  modifiedBy: string;
  changeType: 'create' | 'update' | 'reload' | 'rollback';
  path: string[];
  oldValue: unknown;
  newValue: unknown;
  reason?: string;
  source: 'file' | 'command' | 'environment' | 'api';
}

export interface ConfigurationVersion {
  version: string;
  timestamp: string;
  configuration: BotConfiguration;
  hash: string;
}

// ============================================================================
// Health Monitoring Service Interfaces
// ============================================================================

export interface IHealthMonitor extends IService {
  /**
   * Service registration
   */
  setRateLimiter(rateLimiter: IRateLimiter): void;
  setContextManager(contextManager: IContextManager): void;
  setGeminiService(geminiService: IAIService): void;
  setDiscordConnected(connected: boolean): void;
  
  /**
   * Performance tracking
   */
  recordResponseTime(responseTimeMs: number): void;
  recordError(): void;
  recordRequest(): void;
  
  /**
   * Metrics retrieval
   */
  getCurrentMetrics(): Promise<HealthMetrics>;
  getHistoricalMetrics(fromTime?: number, toTime?: number): Promise<HealthSnapshot[]>;
  
  /**
   * Alert configuration
   */
  getAlertConfig(): AlertConfig;
  updateAlertConfig(config: Partial<AlertConfig>): void;
}

export interface HealthMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  activeConversations: number;
  rateLimitStatus: {
    minuteRemaining: number;
    dailyRemaining: number;
    requestsThisMinute: number;
    requestsToday: number;
  };
  uptime: number;
  errorRate: number;
  responseTime: { p50: number; p95: number; p99: number };
  apiHealth: { gemini: boolean; discord: boolean };
  cacheMetrics: {
    hitRate: number;
    memoryUsage: number;
    size: number;
  };
  contextMetrics: {
    totalServers: number;
    totalMemoryUsage: number;
    averageServerSize: number;
    largestServerSize: number;
    itemCounts: {
      embarrassingMoments: number;
      codeSnippets: number;
      runningGags: number;
      summarizedFacts: number;
    };
    compressionStats: {
      averageCompressionRatio: number;
      totalMemorySaved: number;
      duplicatesRemoved: number;
    };
  };
}

export interface HealthSnapshot {
  timestamp: number;
  metrics: HealthMetrics;
}

export interface AlertConfig {
  memoryThreshold: number;
  errorRateThreshold: number;
  responseTimeThreshold: number;
  diskSpaceThreshold: number;
  enabled: boolean;
}

// ============================================================================
// Rate Limiting Service Interfaces
// ============================================================================

export interface IRateLimiter extends IService {
  /**
   * Checks if a request can be made and increments counter
   * @returns Whether request is allowed and remaining quota
   */
  checkAndIncrement(userId?: string): Promise<RateLimitCheckResult>;
  
  /**
   * Gets remaining quota without incrementing
   */
  getRemainingQuota(): { minute: number; daily: number };
  
  /**
   * Gets remaining requests for a specific user
   */
  getRemainingRequests(userId?: string): number;
  
  /**
   * Gets daily limit
   */
  getDailyLimit(): number;
  
  /**
   * Gets current rate limit status
   */
  getStatus(userId?: string): RateLimitStatus;
  
  /**
   * Updates rate limiting configuration
   */
  updateLimits(rpm: number, daily: number): void;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason: string;
  remaining: {
    minute: number;
    daily: number;
  };
}

export interface RateLimitStatus {
  rpm: {
    current: number;
    limit: number;
    resetsAt: number;
  };
  daily: {
    current: number;
    limit: number;
    resetsAt: number;
  };
}

// ============================================================================
// Context Management Service Interfaces
// ============================================================================

export interface IContextManager extends IService {
  /**
   * Server context management
   */
  initializeServerContext(serverId: string): void;
  getServerContext(serverId: string): ServerContext | undefined;
  
  /**
   * Memory operations
   */
  addEmbarrassingMoment(serverId: string, userId: string, moment: string): void;
  addCodeSnippet(serverId: string, userId: string, userMessage: string, code: string): void;
  addRunningGag(serverId: string, gag: string): void;
  addSummarizedFact(serverId: string, fact: string, importance?: number): void;
  
  /**
   * Bulk operations
   */
  summarizeAndCompress(serverId: string): Promise<{ removed: number; kept: number }>;
  deduplicateServerContext(serverId: string): { removed: number; duplicates: string[] };
  
  /**
   * Context building
   */
  buildSuperContext(serverId: string, userId: string, maxLength?: number): string;
  buildServerCultureContext(guild: Guild): string;
  buildDiscordUserContext(member: GuildMember): string;
  buildSmartContext(serverId: string, userId: string, currentMessage: string): string;
  
  /**
   * Cross-server operations
   */
  isGlobalContextEnabled(): boolean;
  enableGlobalContext(): void;
  disableGlobalContext(): void;
  getCrossServerInsights(userId: string): CrossServerInsights;
  
  /**
   * Memory statistics
   */
  getMemoryStats(): MemoryStats;
  getServerContextSize(serverId: string): number;
  getImportanceThreshold(serverId: string): number;
  getServerCompressionStats(serverId: string): { compressionRatio: number; memorySaved: number } | null;
  
  /**
   * Advanced operations
   */
  summarizeServerContextNow(serverId: string): boolean;
  deduplicateServerContext(serverId: string): { removed: number; duplicates: string[] };
  enableCrossServerContext(userId: string, serverId: string, enabled: boolean): void;
}

export interface ServerContext {
  serverId: string;
  embarrassingMoments: Map<string, string[]>;
  codeSnippets: Map<string, CodeSnippet[]>;
  runningGags: string[];
  summarizedFacts: SummarizedFact[];
  lastSummarized: number;
  compressionStats: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
}

export interface CodeSnippet {
  timestamp: number;
  userMessage: string;
  code: string;
}

export interface SummarizedFact {
  fact: string;
  timestamp: number;
  importance: number;
  userIds: string[];
}

export interface CrossServerInsights {
  userId: string;
  globalPatterns: string[];
  serverCount: number;
  mostActiveServer?: string;
  totalInteractions: number;
}

export interface MemoryStats {
  totalServers: number;
  totalMemoryUsage: number;
  averageServerSize: number;
  largestServerSize: number;
  itemCounts: {
    embarrassingMoments: number;
    codeSnippets: number;
    runningGags: number;
    summarizedFacts: number;
  };
  compressionStats: {
    averageCompressionRatio: number;
    totalMemorySaved: number;
    duplicatesRemoved: number;
  };
}

// ============================================================================
// Cache Management Service Interfaces
// ============================================================================

export interface ICacheManager extends IService {
  /**
   * Cache operations
   */
  get(prompt: string, userId: string, serverId?: string): Promise<string | null>;
  set(prompt: string, userId: string, response: string, serverId?: string): Promise<void>;
  shouldBypassCache(prompt: string): boolean;
  clearCache(): void;
  clearUserCache(userId: string): void;
  clearServerCache(serverId: string): void;
  
  /**
   * Cache statistics
   */
  getStats(): CacheStats;
  getCachePerformance(): CachePerformance;
}

export interface CacheStats {
  cacheSize: number;
  hitRate: number;
  memoryUsage: number;
  totalHits: number;
  totalMisses: number;
  evictions: number;
}

export interface CachePerformance {
  averageSaveTime: number;
  averageLoadTime: number;
  compressionRatio: number;
  reduction: number;
  avgLookupTime: number;
}

// ============================================================================
// Personality Management Service Interfaces
// ============================================================================

export interface IPersonalityManager extends IService {
  /**
   * Personality operations
   */
  setPersonality(userId: string, trait: string, value: string): void;
  getPersonality(userId: string): UserPersonality | undefined;
  removePersonality(userId: string, trait: string): boolean;
  clearPersonality(userId: string, modifiedBy: string): { success: boolean; message: string };
  
  /**
   * Enhanced personality operations
   */
  addPersonalityDescription(userId: string, description: string, modifiedBy: string): Promise<{ success: boolean; message: string }>;
  removePersonalityDescription(userId: string, description: string, modifiedBy: string): Promise<{ success: boolean; message: string }>;
  
  /**
   * Context building
   */
  buildPersonalityContext(userId: string): string;
  getFormattedTraits(userId: string): string[];
}

export interface UserPersonality {
  userId: string;
  traits: Map<string, string>;
  descriptions: string[];
  lastUpdated: number;
}

// ============================================================================
// Roasting Engine Service Interfaces
// ============================================================================

export interface IRoastingEngine extends IService {
  /**
   * Roasting logic
   */
  shouldRoast(userId: string, message: string, serverId?: string): boolean;
  isUserOnCooldown(userId: string): boolean;
  getConsecutiveRoasts(userId: string): number;
  
  /**
   * Psychological warfare features
   */
  addToRoastDebt(userId: string): void;
  checkForMercyKill(userId: string): boolean;
  checkForCooldownBreaking(userId: string, message: string): boolean;
  
  /**
   * Mood system
   */
  isInMood(): boolean;
  triggerMood(reason: string): void;
  checkForChaosEvent(): void;
  getCurrentMoodInfo(): MoodInfo | null;
  
  /**
   * Statistics
   */
  getUserRoastStats(userId: string): UserRoastStats;
  getRoastingStats(): RoastingStats;
}

export interface MoodInfo {
  active: boolean;
  reason: string;
  multiplier: number;
  endTime: number;
}

export interface UserRoastStats {
  consecutiveRoasts: number;
  lastRoasted: number | null;
  totalRoasts: number;
  roastDebt: number;
  mercyKills: number;
}

export interface RoastingStats {
  totalRoasts: number;
  totalUsers: number;
  moodTriggered: number;
  chaosEvents: number;
  mercyKills: number;
  cooldownBreaks: number;
}

// ============================================================================
// Graceful Degradation Service Interfaces
// ============================================================================

export interface IGracefulDegradationService extends IService {
  /**
   * Circuit breaker operations
   */
  executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    serviceName: string
  ): Promise<T>;
  
  /**
   * Degradation checks
   */
  shouldDegrade(): Promise<DegradationDecision>;
  
  /**
   * Fallback operations
   */
  generateFallbackResponse(prompt: string, userId: string, serverId?: string): Promise<string>;
  
  /**
   * Queue management
   */
  queueMessage(
    userId: string,
    prompt: string,
    respond: (response: string) => Promise<void>,
    serverId?: string,
    priority?: 'low' | 'medium' | 'high'
  ): Promise<void>;
  
  getQueueSize(): number;
  
  /**
   * Recovery operations
   */
  triggerRecovery(serviceName?: 'gemini' | 'discord'): Promise<void>;
  
  /**
   * Status
   */
  getStatus(): DegradationStatus;
  
  /**
   * Dependencies
   */
  setHealthMonitor(healthMonitor: IHealthMonitor): void;
}

export interface DegradationDecision {
  shouldDegrade: boolean;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface DegradationStatus {
  circuitBreakers: Map<string, CircuitBreakerState>;
  queueSize: number;
  activeWorkers: number;
  fallbacksGenerated: number;
  lastDegradationTime: number | null;
  currentSeverity: 'none' | 'low' | 'medium' | 'high';
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure: number | null;
  successCount: number;
}

// ============================================================================
// User Preference Service Interfaces
// ============================================================================

export interface IUserPreferenceService extends IService {
  /**
   * Preference management
   */
  getUserPreferences(userId: string): UserPreferences;
  updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<void>;
  
  /**
   * Bulk operations
   */
  exportUserPreferences(userId: string): Promise<string>;
  importUserPreferences(userId: string, data: string): Promise<void>;
  deleteUserPreferences(userId: string): Promise<void>;
}

export interface UserPreferences {
  userId: string;
  language: string;
  timezone: string;
  notifications: {
    mentions: boolean;
    updates: boolean;
    reminders: boolean;
  };
  privacy: {
    shareData: boolean;
    publicProfile: boolean;
  };
  features: {
    roasting: boolean;
    contextMemory: boolean;
    personalityPersistence: boolean;
  };
  lastUpdated: number;
}

// ============================================================================
// Help System Service Interfaces
// ============================================================================

export interface IHelpSystemService extends IService {
  /**
   * Help generation
   */
  generateHelp(commandName?: string, userRole?: 'user' | 'moderator' | 'admin'): string;
  getCommandList(userRole?: 'user' | 'moderator' | 'admin'): CommandInfo[];
  getCommandHelp(commandName: string): CommandInfo | null;
  
  /**
   * Tutorial system
   */
  startTutorial(userId: string): Promise<TutorialSession>;
  progressTutorial(userId: string, step: number): Promise<boolean>;
  getTutorialStatus(userId: string): TutorialProgress | null;
}

export interface CommandInfo {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  permissions: 'all' | 'moderator' | 'admin';
  cooldown?: number;
  aliases?: string[];
}

export interface TutorialSession {
  userId: string;
  currentStep: number;
  totalSteps: number;
  startedAt: number;
  completedSteps: number[];
}

export interface TutorialProgress {
  completed: boolean;
  currentStep: number;
  completedSteps: number[];
  lastAccessed: number;
}

// ============================================================================
// Behavior Analysis Service Interfaces
// ============================================================================

export interface IBehaviorAnalyzer extends IService {
  /**
   * Pattern analysis
   */
  analyzeUserBehavior(userId: string, message: string, context: MessageContext): Promise<BehaviorAnalysis>;
  detectPatterns(userId: string): UserPatterns;
  
  /**
   * Anomaly detection
   */
  detectAnomalies(userId: string, behavior: BehaviorAnalysis): AnomalyDetection[];
  
  /**
   * Predictions
   */
  predictNextAction(userId: string): ActionPrediction[];
  predictUserIntent(message: string, context: MessageContext): IntentPrediction;
}

export interface BehaviorAnalysis {
  userId: string;
  timestamp: number;
  messageLength: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  engagement: number;
  patterns: string[];
}

export interface UserPatterns {
  userId: string;
  activityPatterns: {
    peakHours: number[];
    averageMessageLength: number;
    preferredChannels: string[];
  };
  communicationPatterns: {
    dominantSentiment: string;
    topicPreferences: string[];
    responseTime: number;
  };
  socialPatterns: {
    frequentInteractions: string[];
    groupDynamics: string[];
  };
}

export interface AnomalyDetection {
  type: 'activity' | 'sentiment' | 'pattern';
  severity: 'low' | 'medium' | 'high';
  description: string;
  confidence: number;
}

export interface ActionPrediction {
  action: string;
  probability: number;
  timeframe: string;
}

export interface IntentPrediction {
  intent: string;
  confidence: number;
  entities: Array<{ type: string; value: string }>;
}

// ============================================================================
// Conversation Management Service Interfaces
// ============================================================================

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Conversation {
  messages: Message[];
  lastActive: number;
  // Circular buffer optimization fields
  bufferStart: number;
  bufferSize: number;
  totalLength: number;
  maxBufferSize: number;
}

export interface IConversationManager extends IService {
  /**
   * Gets or creates a conversation for a user
   */
  getOrCreateConversation(userId: string): Conversation;
  
  /**
   * Adds a message exchange to the conversation
   */
  addToConversation(userId: string, userMessage: string, assistantResponse: string): void;
  
  /**
   * Builds conversation context for a user
   */
  buildConversationContext(userId: string): string;
  
  /**
   * Clears conversation for a user
   */
  clearUserConversation(userId: string): boolean;
  
  /**
   * Gets conversation statistics
   */
  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
  };
  
  /**
   * Gets active conversation count
   */
  getActiveConversationCount(): number;
}

// ============================================================================
// Retry Handler Service Interfaces
// ============================================================================

export interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  retryMultiplier: number;
}

export interface IRetryHandler extends IService {
  /**
   * Executes an operation with retry logic
   */
  executeWithRetry<T>(
    operation: () => Promise<T>, 
    options?: Partial<RetryOptions>,
    isRetryableError?: (error: unknown) => boolean
  ): Promise<T>;
  
  /**
   * Determines if an error is retryable
   */
  isRetryableError(error: unknown): boolean;
  
  /**
   * Gets user-friendly error message
   */
  getUserFriendlyErrorMessage(error: unknown): string;
}

// ============================================================================
// System Context Builder Service Interfaces
// ============================================================================

export interface SystemContextData {
  queuePosition: number;
  apiQuota: {
    remaining: number;
    limit: number;
  };
  botLatency: number;
  memoryUsage: {
    totalMemoryUsage: number;
  };
  activeConversations: number;
  rateLimitStatus: {
    rpm: {
      current: number;
      limit: number;
      resetsAt: number;
    };
    daily: {
      current: number;
      limit: number;
      resetsAt: number;
    };
  };
}

export interface ISystemContextBuilder extends IService {
  /**
   * Sets the Discord client for context awareness
   */
  setDiscordClient(client: Client): void;
  
  /**
   * Builds server culture context
   */
  buildServerCultureContext(guild: Guild): string;
  
  /**
   * Builds Discord user context
   */
  buildDiscordUserContext(member: GuildMember): string;
  
  /**
   * Builds message context
   */
  buildMessageContext(messageContext: MessageContext): string;
  
  /**
   * Builds system context
   */
  buildSystemContext(
    systemContext: SystemContextData,
    includeWhenUnderLoad?: boolean
  ): string;
  
  /**
   * Builds date context
   */
  buildDateContext(): string;
}

// ============================================================================
// Service Registry Interface
// ============================================================================

export interface IServiceRegistry {
  /**
   * Service registration
   */
  register<T extends IService>(name: string, service: T): void;
  
  /**
   * Service retrieval
   */
  get<T extends IService>(name: string): T | undefined;
  getRequired<T extends IService>(name: string): T;
  
  /**
   * Service lifecycle
   */
  initializeAll(): Promise<void>;
  shutdownAll(): Promise<void>;
  
  /**
   * Health monitoring
   */
  getHealthStatus(): Promise<Map<string, ServiceHealthStatus>>;
  isHealthy(): Promise<boolean>;
}

// ============================================================================
// Error Types
// ============================================================================

export class ServiceNotFoundError extends Error {
  constructor(serviceName: string) {
    super(`Service '${serviceName}' not found in registry`);
    this.name = 'ServiceNotFoundError';
  }
}

export class ServiceDependencyError extends Error {
  constructor(serviceName: string, dependency: string) {
    super(`Service '${serviceName}' missing required dependency '${dependency}'`);
    this.name = 'ServiceDependencyError';
  }
}

export class ServiceConfigurationError extends Error {
  constructor(serviceName: string, message: string) {
    super(`Service '${serviceName}' configuration error: ${message}`);
    this.name = 'ServiceConfigurationError';
  }
}

// ============================================================================
// Service Factory Interface
// ============================================================================

export interface IServiceFactory {
  /**
   * Creates and configures all services
   */
  createServices(config: BotConfiguration): Map<string, IService>;
  
  /**
   * Creates individual services
   */
  createAnalyticsService(config: AnalyticsConfig): IAnalyticsService;
  createAIService(apiKey: string, config: GeminiConfig): IAIService;
  createConfigurationService(paths?: ConfigurationPaths): IConfigurationService;
  createHealthMonitor(config: MonitoringConfig): IHealthMonitor;
  createRateLimiter(config: RateLimitingConfig): IRateLimiter;
  createContextManager(config: FeatureConfig): IContextManager;
  createCacheManager(config: FeatureConfig): ICacheManager;
  createPersonalityManager(): IPersonalityManager;
  createRoastingEngine(config: RoastingConfig): IRoastingEngine;
  createGracefulDegradationService(config: MonitoringConfig): IGracefulDegradationService;
  createUserPreferenceService(): IUserPreferenceService;
  createHelpSystemService(config: DiscordConfig): IHelpSystemService;
  createBehaviorAnalyzer(): IBehaviorAnalyzer;
  createConversationManager(config: FeatureConfig): IService;
  createRetryHandler(): IService;
  createSystemContextBuilder(): ISystemContextBuilder;
}

export interface ConfigurationPaths {
  configPath?: string;
  versionsPath?: string;
  auditLogPath?: string;
}

// ============================================================================
// Export all interfaces
// ============================================================================

export * from './serviceRegistry';
export * from './serviceFactory';