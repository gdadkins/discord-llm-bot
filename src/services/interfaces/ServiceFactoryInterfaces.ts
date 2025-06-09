/**
 * Service Factory Interface Definitions
 * 
 * Interfaces for service creation and factory patterns.
 */

import type { IService } from './CoreServiceInterfaces';
import type { IAnalyticsService, AnalyticsConfig } from './AnalyticsInterfaces';
import type { IAIService } from './AIServiceInterfaces';
import type { IConfigurationService, BotConfiguration, ConfigurationPaths, DiscordConfig, GeminiConfig, RateLimitingConfig, FeatureConfig, MonitoringConfig, RoastingConfig } from './ConfigurationInterfaces';
import type { IHealthMonitor } from './HealthMonitoringInterfaces';
import type { IRateLimiter } from './RateLimitingInterfaces';
import type { IContextManager } from './ContextManagementInterfaces';
import type { ICacheManager } from './CacheManagementInterfaces';
import type { IPersonalityManager } from './PersonalityManagementInterfaces';
import type { IRoastingEngine } from './RoastingEngineInterfaces';
import type { IGracefulDegradationService } from './GracefulDegradationInterfaces';
import type { IUserPreferenceService } from './UserPreferenceInterfaces';
import type { IHelpSystemService } from './HelpSystemInterfaces';
import type { IBehaviorAnalyzer } from './BehaviorAnalysisInterfaces';
import type { ISystemContextBuilder } from './SystemContextBuilderInterfaces';

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