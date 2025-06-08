/**
 * Service Adapters
 * 
 * Provides adapters to ensure existing service implementations
 * comply with the defined interfaces.
 */

import type {
  IService,
  ServiceHealthStatus,
  IAnalyticsService,
  IAIService,
  IConfigurationService,
  IHealthMonitor,
  IRateLimiter,
  IContextManager,
  IPersonalityManager,
  IRoastingEngine,
  UsageStatistics,
  AnalyticsReport,
  UserPrivacySettings,
  ExportData,
  SystemStats,
  ConfigurationVersion,
  ConfigurationChange,
  RateLimitCheckResult
} from '../interfaces';

/**
 * Base adapter that provides common IService implementation
 */
export abstract class ServiceAdapter implements IService {
  protected serviceName: string;
  protected initialized = false;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;

  async getHealthStatus(): Promise<ServiceHealthStatus> {
    return {
      healthy: this.initialized,
      name: this.serviceName,
      errors: this.initialized ? [] : ['Service not initialized'],
      metrics: await this.getHealthMetrics()
    };
  }

  protected async getHealthMetrics(): Promise<Record<string, unknown>> {
    // Override in subclasses to provide service-specific metrics
    return {};
  }
}

/**
 * Analytics Service Adapter
 */
export class AnalyticsServiceAdapter extends ServiceAdapter implements IAnalyticsService {
  constructor(private analyticsManager: IAnalyticsService) {
    super('AnalyticsService');
  }

  async initialize(): Promise<void> {
    await this.analyticsManager.initialize();
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    await this.analyticsManager.shutdown();
    this.initialized = false;
  }

  async trackCommandUsage(event: Parameters<IAnalyticsService['trackCommandUsage']>[0]): Promise<void> {
    await this.analyticsManager.trackCommandUsage(event);
  }

  async trackUserEngagement(
    userId: string,
    serverId: string | null,
    eventType: 'command' | 'mention' | 'reaction'
  ): Promise<void> {
    await this.analyticsManager.trackUserEngagement(userId, serverId, eventType);
  }

  async trackError(
    errorType: string,
    errorMessage: string,
    context?: { commandName?: string; userId?: string; serverId?: string }
  ): Promise<void> {
    await this.analyticsManager.trackError(errorType, errorMessage, context);
  }

  async trackPerformance(
    metric: 'response_time' | 'memory_usage' | 'api_latency' | 'cache_hit_rate',
    value: number,
    context?: string
  ): Promise<void> {
    await this.analyticsManager.trackPerformance(metric, value, context);
  }

  async getUsageStatistics(
    startDate: Date,
    endDate: Date,
    serverId?: string
  ): Promise<UsageStatistics | null> {
    return this.analyticsManager.getUsageStatistics(startDate, endDate, serverId);
  }

  async generateReport(
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<AnalyticsReport> {
    return this.analyticsManager.generateReport(period);
  }

  async setUserPrivacySettings(
    userId: string,
    settings: Parameters<IAnalyticsService['setUserPrivacySettings']>[1]
  ): Promise<void> {
    return this.analyticsManager.setUserPrivacySettings(userId, settings);
  }

  async getUserPrivacySettings(
    userId: string
  ): Promise<UserPrivacySettings> {
    return this.analyticsManager.getUserPrivacySettings(userId);
  }

  async deleteUserData(userId: string): Promise<void> {
    return this.analyticsManager.deleteUserData(userId);
  }

  async exportUserData(
    userId: string
  ): Promise<ExportData | null> {
    return this.analyticsManager.exportUserData(userId);
  }

  isEnabled(): boolean {
    return this.analyticsManager.isEnabled();
  }

  getConfiguration(): ReturnType<IAnalyticsService['getConfiguration']> {
    return this.analyticsManager.getConfiguration();
  }

  async updateConfiguration(
    config: Parameters<IAnalyticsService['updateConfiguration']>[0]
  ): Promise<void> {
    return this.analyticsManager.updateConfiguration(config);
  }

  async getSystemStats(): Promise<SystemStats | null> {
    return this.analyticsManager.getSystemStats();
  }

  protected async getHealthMetrics(): Promise<Record<string, unknown>> {
    const stats = await this.analyticsManager.getSystemStats();
    return stats ? {
      totalCommands: stats.totalCommands,
      totalUsers: stats.totalUsers,
      activeSessions: stats.activeSessions
    } : {};
  }
}

/**
 * AI Service Adapter (Gemini)
 */
export class AIServiceAdapter extends ServiceAdapter implements IAIService {
  constructor(private geminiService: IAIService) {
    super('AIService');
  }

  async initialize(): Promise<void> {
    await this.geminiService.initialize();
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    await this.geminiService.shutdown();
    this.initialized = false;
  }

  async generateResponse(
    prompt: string,
    userId: string,
    serverId?: string,
    respond?: (response: string) => Promise<void>,
    messageContext?: Parameters<IAIService['generateResponse']>[4],
    member?: Parameters<IAIService['generateResponse']>[5],
    guild?: Parameters<IAIService['generateResponse']>[6]
  ): Promise<string> {
    return this.geminiService.generateResponse(
      prompt,
      userId,
      serverId,
      respond,
      messageContext,
      member,
      guild
    );
  }

  getRemainingQuota(): ReturnType<IAIService['getRemainingQuota']> {
    return this.geminiService.getRemainingQuota();
  }

  clearUserConversation(userId: string): boolean {
    return this.geminiService.clearUserConversation(userId);
  }

  getConversationStats(): ReturnType<IAIService['getConversationStats']> {
    return this.geminiService.getConversationStats();
  }

  addEmbarrassingMoment(serverId: string, userId: string, moment: string): void {
    return this.geminiService.addEmbarrassingMoment(serverId, userId, moment);
  }

  addRunningGag(serverId: string, gag: string): void {
    return this.geminiService.addRunningGag(serverId, gag);
  }

  setHealthMonitor(healthMonitor: IHealthMonitor): void {
    return this.geminiService.setHealthMonitor(healthMonitor);
  }

  setDiscordClient(client: Parameters<IAIService['setDiscordClient']>[0]): void {
    return this.geminiService.setDiscordClient(client);
  }

  getPersonalityManager(): IPersonalityManager {
    return this.geminiService.getPersonalityManager();
  }

  getRateLimiter(): IRateLimiter {
    return this.geminiService.getRateLimiter();
  }

  getContextManager(): IContextManager {
    return this.geminiService.getContextManager();
  }

  getRoastingEngine(): IRoastingEngine {
    return this.geminiService.getRoastingEngine();
  }

  getCacheStats(): ReturnType<IAIService['getCacheStats']> {
    return this.geminiService.getCacheStats();
  }

  getCachePerformance(): ReturnType<IAIService['getCachePerformance']> {
    return this.geminiService.getCachePerformance();
  }

  clearCache(): void {
    return this.geminiService.clearCache();
  }

  getDegradationStatus(): ReturnType<IAIService['getDegradationStatus']> {
    return this.geminiService.getDegradationStatus();
  }

  async triggerRecovery(serviceName?: 'gemini' | 'discord'): Promise<void> {
    await this.geminiService.triggerRecovery(serviceName);
  }

  async updateConfiguration(
    config: Parameters<IAIService['updateConfiguration']>[0]
  ): Promise<void> {
    return this.geminiService.updateConfiguration(config);
  }

  async validateConfiguration(
    config: Parameters<IAIService['validateConfiguration']>[0]
  ): Promise<{ valid: boolean; errors: string[] }> {
    return this.geminiService.validateConfiguration(config);
  }

  protected async getHealthMetrics(): Promise<Record<string, unknown>> {
    const stats = this.geminiService.getConversationStats();
    const quota = this.geminiService.getRemainingQuota();
    return {
      activeConversations: stats.activeUsers,
      totalMessages: stats.totalMessages,
      quotaRemaining: quota
    };
  }
}

/**
 * Configuration Service Adapter
 */
export class ConfigurationServiceAdapter extends ServiceAdapter implements IConfigurationService {
  constructor(private configManager: IConfigurationService) {
    super('ConfigurationService');
  }

  async initialize(): Promise<void> {
    await this.configManager.initialize();
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    await this.configManager.shutdown();
    this.initialized = false;
  }

  validateConfiguration(
    config: Parameters<IConfigurationService['validateConfiguration']>[0]
  ): ReturnType<IConfigurationService['validateConfiguration']> {
    return this.configManager.validateConfiguration(config);
  }

  async reloadConfiguration(
    source?: Parameters<IConfigurationService['reloadConfiguration']>[0],
    reason?: string
  ): Promise<void> {
    await this.configManager.reloadConfiguration(source, reason);
  }

  async saveConfiguration(modifiedBy: string, reason?: string): Promise<void> {
    await this.configManager.saveConfiguration(modifiedBy, reason);
  }

  async getVersionHistory(): Promise<ConfigurationVersion[]> {
    return this.configManager.getVersionHistory();
  }

  async rollbackToVersion(
    version: string,
    modifiedBy: string,
    reason?: string
  ): Promise<void> {
    return this.configManager.rollbackToVersion(version, modifiedBy, reason);
  }

  async getAuditLog(limit?: number): Promise<ConfigurationChange[]> {
    return this.configManager.getAuditLog(limit);
  }

  getDiscordConfig(): ReturnType<IConfigurationService['getDiscordConfig']> {
    return this.configManager.getDiscordConfig();
  }

  getGeminiConfig(): ReturnType<IConfigurationService['getGeminiConfig']> {
    return this.configManager.getGeminiConfig();
  }

  getRateLimitingConfig(): ReturnType<IConfigurationService['getRateLimitingConfig']> {
    return this.configManager.getRateLimitingConfig();
  }

  getFeatureConfig(): ReturnType<IConfigurationService['getFeatureConfig']> {
    return this.configManager.getFeatureConfig();
  }

  getRoastingConfig(): ReturnType<IConfigurationService['getRoastingConfig']> {
    return this.configManager.getRoastingConfig();
  }

  getMonitoringConfig(): ReturnType<IConfigurationService['getMonitoringConfig']> {
    return this.configManager.getMonitoringConfig();
  }

  getConfiguration(): ReturnType<IConfigurationService['getConfiguration']> {
    return this.configManager.getConfiguration();
  }

  async updateConfiguration(
    updates: Parameters<IConfigurationService['updateConfiguration']>[0],
    modifiedBy: string,
    reason?: string
  ): Promise<void> {
    await this.configManager.updateConfiguration(updates, modifiedBy, reason);
  }

  async updateConfigurationSection(
    section: Parameters<IConfigurationService['updateConfigurationSection']>[0],
    updates: Parameters<IConfigurationService['updateConfigurationSection']>[1],
    modifiedBy: string,
    reason?: string
  ): Promise<void> {
    return this.configManager.updateConfigurationSection(section, updates, modifiedBy, reason);
  }

  async exportConfiguration(
    format?: Parameters<IConfigurationService['exportConfiguration']>[0]
  ): Promise<string> {
    return this.configManager.exportConfiguration(format);
  }

  async importConfiguration(
    configData: string,
    format?: Parameters<IConfigurationService['importConfiguration']>[1],
    modifiedBy?: string,
    reason?: string
  ): Promise<void> {
    return this.configManager.importConfiguration(configData, format, modifiedBy, reason);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    this.configManager.on(event, listener);
    return this;
  }

  async getHealthStatus(): Promise<ServiceHealthStatus> {
    const baseStatus = await super.getHealthStatus();
    const healthCheckResult = this.configManager.getHealthStatus();
    const healthCheck = await Promise.resolve(healthCheckResult);
    
    return {
      ...baseStatus,
      healthy: healthCheck.healthy,
      errors: healthCheck.errors
    };
  }
}

/**
 * Rate Limiter Service Adapter
 */
export class RateLimiterAdapter extends ServiceAdapter implements IRateLimiter {
  constructor(private rateLimiter: IRateLimiter) {
    super('RateLimiter');
  }

  async initialize(): Promise<void> {
    await this.rateLimiter.initialize();
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    // RateLimiter doesn't have a shutdown method
    this.initialized = false;
  }

  async checkAndIncrement(
    userId?: string
  ): Promise<RateLimitCheckResult> {
    return this.rateLimiter.checkAndIncrement(userId);
  }

  getRemainingQuota(): ReturnType<IRateLimiter['getRemainingQuota']> {
    return this.rateLimiter.getRemainingQuota();
  }

  getRemainingRequests(userId?: string): number {
    return this.rateLimiter.getRemainingRequests(userId);
  }

  getDailyLimit(): number {
    return this.rateLimiter.getDailyLimit();
  }

  getStatus(userId?: string): ReturnType<IRateLimiter['getStatus']> {
    return this.rateLimiter.getStatus(userId);
  }

  updateLimits(rpm: number, daily: number): void {
    return this.rateLimiter.updateLimits(rpm, daily);
  }

  protected async getHealthMetrics(): Promise<Record<string, unknown>> {
    const quota = this.rateLimiter.getRemainingQuota();
    return {
      remainingMinute: quota.minute,
      remainingDaily: quota.daily
    };
  }
}

/**
 * Export adapter factory function
 */
export function createServiceAdapters(
  services: Map<string, unknown>
): Map<string, IService> {
  const adaptedServices = new Map<string, IService>();

  // Wrap each service with its adapter
  for (const [name, service] of services) {
    let adapter: IService;

    switch (name) {
    case 'analytics':
      adapter = new AnalyticsServiceAdapter(service as IAnalyticsService);
      break;
    case 'aiService':
      adapter = new AIServiceAdapter(service as IAIService);
      break;
    case 'configuration':
      adapter = new ConfigurationServiceAdapter(service as IConfigurationService);
      break;
    case 'rateLimiter':
      adapter = new RateLimiterAdapter(service as IRateLimiter);
      break;
    // Add more adapters as needed
    default:
      // For services that already implement IService, use them directly
      adapter = service as IService;
    }

    adaptedServices.set(name, adapter);
  }

  return adaptedServices;
}