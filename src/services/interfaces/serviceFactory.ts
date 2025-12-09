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
  IResponseProcessingService,
  IUserAnalysisService,
  IMultimodalContentHandler,
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
import { AnalyticsManager } from '../analytics/AnalyticsManager';
import { GeminiService } from '../gemini/GeminiService';
import { GeminiAPIClient } from '../gemini/GeminiAPIClient';
import { GeminiContextProcessor } from '../gemini/GeminiContextProcessor';
import { GeminiResponseHandler } from '../gemini/GeminiResponseHandler';
import { GeminiConfigurationHandler } from '../gemini/GeminiConfiguration';
import { GeminiStructuredOutputHandler } from '../gemini/GeminiStructuredOutput';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { HealthMonitor } from '../health/HealthMonitor';
import { RateLimiter } from '../rate-limiting/RateLimiter';
import { ContextManager } from '../context/ContextManager';
import { CacheManager } from '../cache/CacheManager';
import { PersonalityManager } from '../personality/PersonalityManager';
import { RoastingEngine } from '../roasting/RoastingEngine';
import { GracefulDegradation } from '../resilience/GracefulDegradation';
import { UserPreferenceManager } from '../preferences';
import { HelpSystem } from '../help/HelpSystem';
import { BehaviorAnalyzer } from '../analytics/behavior/BehaviorAnalyzer';
import { SystemContextBuilder } from '../context/SystemContextBuilder';
import { ConversationManager } from '../conversation/ConversationManager';
import { RetryHandler } from '../resilience/RetryHandler';
import { ResponseProcessingService } from '../response/ResponseProcessingService';
import { UserAnalysisService } from '../analytics/user/UserAnalysisService';
import { MultimodalContentHandler } from '../multimodal/MultimodalContentHandler';
import { LocalUserAnalyzer } from '../analytics/components/LocalUserAnalyzer';
import type { ILocalUserAnalyzer } from './index';




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
    services.set('conversationManager', conversationManager);

    const retryHandler = this.createRetryHandler();
    services.set('retryHandler', retryHandler);

    const systemContextBuilder = this.createSystemContextBuilder();
    services.set('systemContextBuilder', systemContextBuilder);

    // Create response processing service
    const responseProcessingService = this.createResponseProcessingService();
    services.set('responseProcessingService', responseProcessingService);

    // Create multimodal content handler with response processor dependency
    const multimodalContentHandler = this.createMultimodalContentHandler();
    multimodalContentHandler.setResponseProcessor(responseProcessingService);
    services.set('multimodalContentHandler', multimodalContentHandler);

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
      systemContextBuilder,
      responseProcessingService,
      multimodalContentHandler
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

    // Create local user analyzer
    const localUserAnalyzer = this.createLocalUserAnalyzer();
    // Note: LocalUserAnalyzer is a component, not a full service, so we don't register it in the services map directly
    // unless we wrap it or it implements IService. For now, we just inject it.

    // Create user analysis service
    const userAnalysisService = this.createUserAnalysisService(localUserAnalyzer);
    services.set('userAnalysisService', userAnalysisService);

    logger.info(`Created ${services.size} services`);
    return services;
  }

  /**
   * Creates analytics service
   */
  createAnalyticsService(_config: AnalyticsConfig): IAnalyticsService {
    return new AnalyticsManager('./data/analytics.db');
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
      responseProcessingService: IResponseProcessingService;
      multimodalContentHandler: IMultimodalContentHandler;
    }
  ): IAIService {
    const components = {
      apiClient: new GeminiAPIClient(
        apiKey,
        config as any,
        dependencies.gracefulDegradation,
        dependencies.multimodalContentHandler
      ),
      configHandler: new GeminiConfigurationHandler(dependencies.cacheManager)
    } as any; // Partial construction to access apiClient for processor

    components.contextProcessor = new GeminiContextProcessor(
      dependencies.contextManager,
      dependencies.personalityManager,
      dependencies.conversationManager,
      dependencies.systemContextBuilder,
      dependencies.rateLimiter,
      dependencies.gracefulDegradation,
      {
        ...components.apiClient.getConfig(),
        systemInstruction: config.systemInstructions?.roasting || process.env.GEMINI_ROASTING_INSTRUCTION || 'You are a sarcastic AI that enjoys roasting users in a playful way.',
        helpfulInstruction: config.systemInstructions?.helpful || process.env.GEMINI_HELPFUL_INSTRUCTION || 'You are a helpful Discord bot. Answer any request directly and concisely.',
        forceThinkingPrompt: components.apiClient.getConfig().forceThinkingPrompt || false,
        thinkingTrigger: components.apiClient.getConfig().thinkingTrigger || ''
      }
    );

    components.responseHandler = new GeminiResponseHandler(
      dependencies.responseProcessingService,
      components.apiClient.getConfig()
    );

    components.structuredOutputHandler = new GeminiStructuredOutputHandler(
      components.apiClient,
      components.contextProcessor,
      components.responseHandler,
      dependencies.cacheManager,
      dependencies.retryHandler,
      dependencies.rateLimiter
    );

    return new GeminiService(apiKey, config, dependencies, components);
  }

  /**
   * Creates configuration service
   */
  createConfigurationService(paths?: ConfigurationPaths): IConfigurationService {
    return new ConfigurationManager(
      paths?.configPath,
      paths?.versionsPath,
      paths?.auditLogPath
    );
  }

  /**
   * Creates health monitor
   */
  createHealthMonitor(_config: MonitoringConfig): IHealthMonitor {
    return new HealthMonitor('./data/health-metrics.json');
  }

  /**
   * Creates rate limiter
   */
  createRateLimiter(config: RateLimitingConfig): IRateLimiter {
    return new RateLimiter(
      config.rpm,
      config.daily
    );
  }

  /**
   * Creates context manager
   */
  createContextManager(_config: FeatureConfig): IContextManager {
    // Instantiate components within the factory method
    // Note: These should ideally be managed by the container or passed as specific dependencies
    // but for now we construct them here to satisfy the ContextManager constructor
    const storage = new (require('../context/components/ContextStorageService').ContextStorageService)();
    const behavior = new (require('../context/components/BehaviorAnalysisService').BehaviorAnalysisService)();
    const summarizer = new (require('../context/components/ContextSummarizer').ContextSummarizer)();

    const conversationMemory = new (require('../context/ConversationMemoryService').ConversationMemoryService)();
    const memoryOptimization = new (require('../context/MemoryOptimizationService').MemoryOptimizationService)(conversationMemory);
    const channelContext = new (require('../context/ChannelContextService').ChannelContextService)();
    const socialDynamics = new (require('../context/SocialDynamicsService').SocialDynamicsService)();

    return new ContextManager(
      behavior,
      storage,
      summarizer,
      conversationMemory,
      channelContext,
      socialDynamics,
      memoryOptimization
    );
  }

  /**
   * Creates cache manager
   */
  createCacheManager(_config: FeatureConfig): ICacheManager {
    return new CacheManager();
  }

  /**
   * Creates personality manager
   */
  createPersonalityManager(): IPersonalityManager {
    return new PersonalityManager();
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
    return new GracefulDegradation();
  }

  /**
   * Creates user preference service
   */
  createUserPreferenceService(): IUserPreferenceService {
    return new UserPreferenceManager();
  }

  /**
   * Creates help system service
   */
  createHelpSystemService(_config: DiscordConfig): IHelpSystemService {
    return new HelpSystem();
  }

  /**
   * Creates behavior analyzer
   */
  createBehaviorAnalyzer(): IBehaviorAnalyzer {
    return new BehaviorAnalyzer();
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

  /**
   * Creates response processing service
   */
  createResponseProcessingService(): IResponseProcessingService {
    return new ResponseProcessingService();
  }

  /**
   * Creates multimodal content handler
   */
  createMultimodalContentHandler(): IMultimodalContentHandler {
    return new MultimodalContentHandler();
  }

  /**
   * Creates local user analyzer
   */
  createLocalUserAnalyzer(): ILocalUserAnalyzer {
    return new LocalUserAnalyzer();
  }

  /**
   * Creates user analysis service
   */
  createUserAnalysisService(localAnalyzer: ILocalUserAnalyzer): IUserAnalysisService {
    return new UserAnalysisService(localAnalyzer);
  }
}