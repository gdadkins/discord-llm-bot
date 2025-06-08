/**
 * Service Factory Implementation
 * 
 * Creates and configures all service instances with proper dependencies.
 */

import { logger } from '../../utils/logger';
import type {
  IService,
  IServiceFactory,
  IAnalyticsService,
  IAIService,
  IConfigurationService,
  IHealthMonitor,
  IRateLimiter,
  IContextManager,
  ICacheManager,
  IPersonalityManager,
  IRoastingEngine,
  IGracefulDegradationService,
  IUserPreferenceService,
  IHelpSystemService,
  IBehaviorAnalyzer,
  IConversationManager,
  IRetryHandler,
  ISystemContextBuilder,
  BotConfiguration,
  AnalyticsConfig,
  GeminiConfig,
  MonitoringConfig,
  RateLimitingConfig,
  FeatureConfig,
  RoastingConfig,
  DiscordConfig,
  ConfigurationPaths
} from './index';

// Import concrete implementations
import { AnalyticsManager } from '../analyticsManager';
import { GeminiService } from '../gemini';
import { ConfigurationManager } from '../configurationManager';
import { HealthMonitor } from '../healthMonitor';
import { RateLimiter } from '../rateLimiter';
import { ContextManager } from '../contextManager';
import { CacheManager } from '../cacheManager';
import { PersonalityManager } from '../personalityManager';
import { RoastingEngine } from '../roastingEngine';
import { GracefulDegradation } from '../gracefulDegradation';
import { UserPreferenceManager } from '../userPreferenceManager';
import { HelpSystem } from '../helpSystem';
import { BehaviorAnalyzer } from '../behaviorAnalyzer';
import { SystemContextBuilder } from '../systemContextBuilder';
import { ConversationManager } from '../conversationManager';
import { RetryHandler } from '../retryHandler';




export class ServiceFactory implements IServiceFactory {
  /**
   * Creates all services with proper configuration
   */
  createServices(config: BotConfiguration): Map<string, IService> {
    const services = new Map<string, IService>();

    // Create configuration service first as others may depend on it
    const configService = this.createConfigurationService();
    services.set('configuration', configService);

    // Create analytics service
    const analyticsService = this.createAnalyticsService({
      enabled: process.env.ANALYTICS_ENABLED === 'true',
      retentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '90'),
      aggregationIntervalMinutes: parseInt(process.env.ANALYTICS_AGGREGATION_INTERVAL || '60'),
      privacyMode: (process.env.ANALYTICS_PRIVACY_MODE as 'strict' | 'balanced' | 'full') || 'balanced',
      reportingEnabled: process.env.ANALYTICS_REPORTING_ENABLED === 'true',
      reportSchedule: (process.env.ANALYTICS_REPORT_SCHEDULE as 'daily' | 'weekly' | 'monthly') || 'weekly',
      allowCrossServerAnalysis: process.env.ANALYTICS_ALLOW_CROSS_SERVER === 'true'
    });
    services.set('analytics', analyticsService);

    // Create rate limiter
    const rateLimiter = this.createRateLimiter(config.rateLimiting);
    services.set('rateLimiter', rateLimiter);

    // Create health monitor
    const healthMonitor = this.createHealthMonitor(config.features.monitoring);
    services.set('healthMonitor', healthMonitor);

    // Create context manager
    const contextManager = this.createContextManager(config.features);
    services.set('contextManager', contextManager);

    // Create cache manager
    const cacheManager = this.createCacheManager(config.features);
    services.set('cacheManager', cacheManager);

    // Create personality manager
    const personalityManager = this.createPersonalityManager();
    services.set('personalityManager', personalityManager);

    // Create roasting engine
    const roastingEngine = this.createRoastingEngine(config.features.roasting);
    services.set('roastingEngine', roastingEngine);

    // Create graceful degradation service
    const gracefulDegradation = this.createGracefulDegradationService(config.features.monitoring);
    services.set('gracefulDegradation', gracefulDegradation);

    // Create new services for reduced coupling
    const conversationManager = this.createConversationManager(config.features);
    services.set('conversationManager', conversationManager as unknown as IService);

    const retryHandler = this.createRetryHandler();
    services.set('retryHandler', retryHandler as unknown as IService);

    const systemContextBuilder = this.createSystemContextBuilder();
    services.set('systemContextBuilder', systemContextBuilder as unknown as IService);

    // Create AI service (depends on many other services)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Either GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required');
    }
    const aiService = this.createAIServiceWithDependencies(apiKey, config.gemini, {
      rateLimiter,
      contextManager,
      personalityManager,
      cacheManager,
      gracefulDegradation,
      roastingEngine,
      conversationManager,
      retryHandler,
      systemContextBuilder
    });
    services.set('aiService', aiService);

    // Create user preference service
    const userPreferenceService = this.createUserPreferenceService();
    services.set('userPreferences', userPreferenceService);

    // Create help system
    const helpSystem = this.createHelpSystemService(config.discord);
    services.set('helpSystem', helpSystem);

    // Create behavior analyzer
    const behaviorAnalyzer = this.createBehaviorAnalyzer();
    services.set('behaviorAnalyzer', behaviorAnalyzer);

    logger.info(`Created ${services.size} services`);
    return services;
  }

  /**
   * Creates analytics service
   */
  createAnalyticsService(_config: AnalyticsConfig): IAnalyticsService {
    return new AnalyticsManager('./data/analytics.db') as unknown as IAnalyticsService;
  }

  /**
   * Creates AI service (Gemini)
   */
  createAIService(_apiKey: string, _config: GeminiConfig): IAIService {
    // Legacy method - now requires dependency injection
    throw new Error('createAIService requires dependencies. Use the service creation flow instead.');
  }

  /**
   * Creates AI service with proper dependency injection
   */
  private createAIServiceWithDependencies(
    apiKey: string,
    config: GeminiConfig,
    dependencies: {
      rateLimiter: IRateLimiter;
      contextManager: IContextManager;
      personalityManager: IPersonalityManager;
      cacheManager: ICacheManager;
      gracefulDegradation: IGracefulDegradationService;
      roastingEngine: IRoastingEngine;
      conversationManager: IConversationManager;
      retryHandler: IRetryHandler;
      systemContextBuilder: ISystemContextBuilder;
    }
  ): IAIService {
    return new GeminiService(apiKey, dependencies);
  }

  /**
   * Creates configuration service
   */
  createConfigurationService(paths?: ConfigurationPaths): IConfigurationService {
    return new ConfigurationManager(
      paths?.configPath,
      paths?.versionsPath,
      paths?.auditLogPath
    ) as unknown as IConfigurationService;
  }

  /**
   * Creates health monitor
   */
  createHealthMonitor(_config: MonitoringConfig): IHealthMonitor {
    return new HealthMonitor('./data/health-metrics.json') as unknown as IHealthMonitor;
  }

  /**
   * Creates rate limiter
   */
  createRateLimiter(config: RateLimitingConfig): IRateLimiter {
    return new RateLimiter(
      config.rpm,
      config.daily
    ) as unknown as IRateLimiter;
  }

  /**
   * Creates context manager
   */
  createContextManager(_config: FeatureConfig): IContextManager {
    return new ContextManager() as unknown as IContextManager;
  }

  /**
   * Creates cache manager
   */
  createCacheManager(_config: FeatureConfig): ICacheManager {
    return new CacheManager() as unknown as ICacheManager;
  }

  /**
   * Creates personality manager
   */
  createPersonalityManager(): IPersonalityManager {
    return new PersonalityManager() as unknown as IPersonalityManager;
  }

  /**
   * Creates roasting engine
   */
  createRoastingEngine(_config: RoastingConfig): IRoastingEngine {
    return new RoastingEngine() as IRoastingEngine;
  }

  /**
   * Creates graceful degradation service
   */
  createGracefulDegradationService(_config: MonitoringConfig): IGracefulDegradationService {
    return new GracefulDegradation() as unknown as IGracefulDegradationService;
  }

  /**
   * Creates user preference service
   */
  createUserPreferenceService(): IUserPreferenceService {
    return new UserPreferenceManager() as unknown as IUserPreferenceService;
  }

  /**
   * Creates help system service
   */
  createHelpSystemService(_config: DiscordConfig): IHelpSystemService {
    return new HelpSystem() as unknown as IHelpSystemService;
  }

  /**
   * Creates behavior analyzer
   */
  createBehaviorAnalyzer(): IBehaviorAnalyzer {
    return new BehaviorAnalyzer() as unknown as IBehaviorAnalyzer;
  }

  /**
   * Wires up service dependencies
   */
  private wireDependencies(
    services: Map<string, IService>,
    _config: BotConfiguration
  ): void {
    // Get services
    const aiService = services.get('aiService') as IAIService;
    const healthMonitor = services.get('healthMonitor') as IHealthMonitor;
    const rateLimiter = services.get('rateLimiter') as IRateLimiter;
    const contextManager = services.get('contextManager') as IContextManager;
    const gracefulDegradation = services.get('gracefulDegradation') as IGracefulDegradationService;

    // Wire health monitor dependencies
    if (healthMonitor) {
      healthMonitor.setRateLimiter(rateLimiter);
      healthMonitor.setContextManager(contextManager);
      healthMonitor.setGeminiService(aiService);
    }

    // Wire AI service dependencies
    if (aiService) {
      aiService.setHealthMonitor(healthMonitor);
    }

    // Wire graceful degradation dependencies
    if (gracefulDegradation) {
      gracefulDegradation.setHealthMonitor(healthMonitor);
    }

    logger.info('Service dependencies wired successfully');
  }

  /**
   * Creates conversation manager
   */
  createConversationManager(config: FeatureConfig): IConversationManager {
    const sessionTimeout = config.contextMemory?.timeoutMinutes || 30;
    const maxMessages = config.contextMemory?.maxMessages || 100;
    const maxContext = config.contextMemory?.maxContextChars || 50000;
    
    return new ConversationManager(sessionTimeout, maxMessages, maxContext);
  }

  /**
   * Creates retry handler
   */
  createRetryHandler(): IRetryHandler {
    const maxRetries = parseInt(process.env.GEMINI_MAX_RETRIES || '3');
    const retryDelay = parseInt(process.env.GEMINI_RETRY_DELAY_MS || '1000');
    const retryMultiplier = parseFloat(process.env.GEMINI_RETRY_MULTIPLIER || '2.0');
    
    return new RetryHandler(maxRetries, retryDelay, retryMultiplier);
  }

  /**
   * Creates system context builder
   */
  createSystemContextBuilder(): ISystemContextBuilder {
    return new SystemContextBuilder();
  }
}