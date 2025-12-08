/**
 * Bot Initialization Module
 * Handles Discord client setup and service initialization using dependency injection
 * Includes distributed tracing integration for comprehensive monitoring
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from '../utils/logger';
import { validateEnvironment as validateEnvWithValidator } from '../utils/ConfigurationValidator';
import { ServiceFactory } from '../services/interfaces/serviceFactory';
import { ServiceRegistry } from '../services/interfaces/serviceRegistry';
import { ConfigurationManager } from '../services/config/ConfigurationManager';
import type { IAIService, IUserAnalysisService, IService } from '../services/interfaces';
import { enrichError, createTimeoutPromise, handleAsyncOperation } from '../utils/ErrorHandlingUtils';
import { TracingIntegration } from '../services/tracing/TracingIntegration';
import { batchInstrumentServices } from '../services/tracing/ServiceInstrumentation';
import { withNewContextAsync } from '../utils/tracing/RequestContext';
import { CommandRegistry } from '../commands/CommandRegistry';
import { Container } from '../di/Container';
import { TYPES } from '../di/tokens';
import { AnalyticsManager } from '../services/analytics/AnalyticsManager';
import { GeminiService } from '../services/gemini/GeminiService';
import { HealthMonitor } from '../services/health/HealthMonitor';
import { RateLimiter } from '../services/rate-limiting/RateLimiter';
import { ContextManager } from '../services/context/ContextManager';
import { CacheManager } from '../services/cache/CacheManager';
import { PersonalityManager } from '../services/personality/PersonalityManager';
import { RoastingEngine } from '../services/roasting/RoastingEngine';
import { GracefulDegradation } from '../services/resilience/GracefulDegradation';
import { UserPreferenceManager } from '../services/preferences';
import { HelpSystem } from '../services/help/HelpSystem';
import { BehaviorAnalyzer } from '../services/analytics/behavior/BehaviorAnalyzer';
import { SystemContextBuilder } from '../services/context/SystemContextBuilder';
import { ConversationManager } from '../services/conversation/ConversationManager';
import { RetryHandler } from '../services/resilience/RetryHandler';
import { ResponseProcessingService } from '../services/response/ResponseProcessingService';
import { UserAnalysisService } from '../services/analytics/user/UserAnalysisService';
import { MultimodalContentHandler } from '../services/multimodal/MultimodalContentHandler';
import { LocalUserAnalyzer } from '../services/analytics/components/LocalUserAnalyzer';
import type {
  ICacheManager,
  IRateLimiter,
  IHealthMonitor,
  IRetryHandler,
  IContextManager,
  IPersonalityManager,
  IRoastingEngine,
  ISystemContextBuilder,
  IConversationManager,
  IGracefulDegradationService,
  IResponseProcessingService,
  IMultimodalContentHandler,
  IAnalyticsService,
  IUserPreferenceService,
  IHelpSystemService,
  IBehaviorAnalyzer
} from '../services/interfaces';

export interface BotServices {
  client: Client;
  geminiService: IAIService;
  userAnalysisService: IUserAnalysisService;
  serviceRegistry: ServiceRegistry;
  tracingIntegration: TracingIntegration;
  commandRegistry: CommandRegistry;
  container: Container;
}

/**
 * Creates and configures the Discord client with required intents
 */
export function createDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
    ],
  });
}


/**
 * Initializes all bot services using dependency injection with timeout protection and distributed tracing
 */
export async function initializeBotServices(client: Client): Promise<{ geminiService: IAIService, userAnalysisService: IUserAnalysisService, serviceRegistry: ServiceRegistry, tracingIntegration: TracingIntegration, commandRegistry: CommandRegistry, container: Container }> {
  return await withNewContextAsync(async (context) => {
    const startTime = Date.now();
    const requestId = `init_${Date.now()}`;

    context.addTags({
      operation: 'bot_services_initialization',
      requestId,
      environment: process.env.NODE_ENV || 'development'
    });

    const result = await handleAsyncOperation(
      async () => {
        logger.info('Initializing bot services with dependency injection (Container) and distributed tracing...', { requestId });

        // Initialize tracing system first
        const tracingSpan = context.startSpan('tracing_initialization');
        const tracingIntegration = TracingIntegration.getInstance();
        await tracingIntegration.initialize();
        context.endSpan(tracingSpan.spanId);
        context.addLog('Tracing system initialized', 'info');

        // Create bot configuration using manager with timeout
        const configSpan = context.startSpan('configuration_creation');
        const configManager = new ConfigurationManager();
        await Promise.race([
          configManager.initialize(),
          createTimeoutPromise(10000).then(() => {
            throw enrichError(new Error('Configuration initialization timeout'), {
              operation: 'ConfigurationManager.initialize',
              timeout: 10000,
              requestId
            });
          })
        ]);
        const config = configManager.getConfiguration();
        context.endSpan(configSpan.spanId);
        context.addLog('Configuration created', 'info');

        // Initialize DI Container
        const containerSpan = context.startSpan('container_initialization');
        const container = new Container();

        // Bind Core Dependencies
        container.bind(TYPES.Config).toConstantValue(config);
        container.bind(TYPES.DiscordClient).toConstantValue(client);
        container.bind(TYPES.TracingIntegration).toConstantValue(tracingIntegration);

        // Bind Registries
        const serviceRegistry = new ServiceRegistry();
        container.bind(TYPES.ServiceRegistry).toConstantValue(serviceRegistry);
        container.bind(TYPES.CommandRegistry).to(CommandRegistry);

        // Bind Technical Services
        container.bind<ICacheManager>(TYPES.CacheManager).toDynamicValue(() => new CacheManager());

        container.bind<IRateLimiter>(TYPES.RateLimiter).toDynamicValue(() =>
          new RateLimiter(config.rateLimiting.rpm, config.rateLimiting.daily)
        );

        container.bind<IHealthMonitor>(TYPES.HealthMonitor).toDynamicValue(() =>
          new HealthMonitor('./data/health-metrics.json')
        );

        container.bind<IRetryHandler>(TYPES.RetryHandler).toDynamicValue(() => {
          const maxRetries = parseInt(process.env.GEMINI_MAX_RETRIES || '3');
          const retryDelay = parseInt(process.env.GEMINI_RETRY_DELAY_MS || '1000');
          const retryMultiplier = parseFloat(process.env.GEMINI_RETRY_MULTIPLIER || '2.0');
          return new RetryHandler(maxRetries, retryDelay, retryMultiplier);
        });

        container.bind<IAnalyticsService>('analytics' as any).toDynamicValue(() => new AnalyticsManager('./data/analytics.db')); // TODO: add strict TYPE token if needed but ServiceRegistry uses strings. Sticking to TYPES for valid ones.
        // Wait, I didn't add Analytics to TYPES. Let's skip it or add it if needed. 
        // ServiceFactory adds it to registry. I should too.

        // Bind Domain Services
        container.bind<IContextManager>(TYPES.ContextManager).toDynamicValue(() => new ContextManager());
        container.bind<IPersonalityManager>(TYPES.PersonalityManager).toDynamicValue(() => new PersonalityManager());
        container.bind<IRoastingEngine>(TYPES.RoastingEngine).toDynamicValue(() => new RoastingEngine() as any);
        container.bind<ISystemContextBuilder>(TYPES.SystemContextBuilder).toDynamicValue(() => new SystemContextBuilder());

        container.bind<IConversationManager>(TYPES.ConversationManager).toDynamicValue(() => {
          const sessionTimeout = config.features.contextMemory?.timeoutMinutes || 30;
          const maxMessages = config.features.contextMemory?.maxMessages || 100;
          const maxContext = config.features.contextMemory?.maxContextChars || 50000;
          return new ConversationManager(sessionTimeout, maxMessages, maxContext);
        });

        container.bind<IGracefulDegradationService>(TYPES.GracefulDegradation).toDynamicValue(() => new GracefulDegradation());
        container.bind<IResponseProcessingService>(TYPES.ResponseProcessingService).to(ResponseProcessingService);
        container.bind<IMultimodalContentHandler>(TYPES.MultimodalContentHandler).toDynamicValue(() => {
          const handler = new MultimodalContentHandler();
          // We can't inject property here easily without circularity or 2-phase. 
          // ServiceFactory did: handler.setResponseProcessor(responseProcessingService);
          // We can do it in the factory function:
          // But wait, to resolve responseProcessingService, we need the container.
          // Container factory receives 'c'.
          return handler;
        });
        // We need to handle the property injection for MultimodalContentHandler properly.
        // I will augment the binding below to use 'c'.

        container.bind<IUserAnalysisService>(TYPES.UserAnalysisService).toDynamicValue(c => {
          return new UserAnalysisService(new LocalUserAnalyzer());
        });

        container.bind<IUserPreferenceService>(Symbol.for('UserPreferenceService')).toDynamicValue(() => new UserPreferenceManager());
        container.bind<IHelpSystemService>(Symbol.for('HelpSystemService')).toDynamicValue(() => new HelpSystem());
        container.bind<IBehaviorAnalyzer>(Symbol.for('BehaviorAnalyzer')).toDynamicValue(() => new BehaviorAnalyzer());

        // Bind Main AI Service (GeminiService)
        container.bind<IAIService>(TYPES.GeminiService).toDynamicValue(c => {
          const deps = {
            rateLimiter: c.resolve<IRateLimiter>(TYPES.RateLimiter),
            contextManager: c.resolve<IContextManager>(TYPES.ContextManager),
            personalityManager: c.resolve<IPersonalityManager>(TYPES.PersonalityManager),
            cacheManager: c.resolve<ICacheManager>(TYPES.CacheManager),
            gracefulDegradation: c.resolve<IGracefulDegradationService>(TYPES.GracefulDegradation),
            roastingEngine: c.resolve<IRoastingEngine>(TYPES.RoastingEngine),
            conversationManager: c.resolve<IConversationManager>(TYPES.ConversationManager),
            retryHandler: c.resolve<IRetryHandler>(TYPES.RetryHandler),
            systemContextBuilder: c.resolve<ISystemContextBuilder>(TYPES.SystemContextBuilder),
            responseProcessingService: c.resolve<IResponseProcessingService>(TYPES.ResponseProcessingService),
            multimodalContentHandler: c.resolve<IMultimodalContentHandler>(TYPES.MultimodalContentHandler)
          };

          // Get Config
          const conf = c.resolve<any>(TYPES.Config);

          const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
          if (!apiKey) throw new Error('API Key missing');

          const service = new GeminiService(
            apiKey,
            conf.gemini,
            deps
          );

          const healthMonitor = c.resolve<IHealthMonitor>(TYPES.HealthMonitor);
          service.setHealthMonitor(healthMonitor);

          return service;
        });

        // Re-bind MultimodalContentHandler to ensure setResponseProcessor is called
        // actually I can just do it in the original bind if I use 'c'
        container.bind<IMultimodalContentHandler>(TYPES.MultimodalContentHandler).toDynamicValue(c => {
          const handler = new MultimodalContentHandler();
          handler.setResponseProcessor(c.resolve(TYPES.ResponseProcessingService));
          return handler;
        });

        context.endSpan(containerSpan.spanId);

        // Create all services via Container Resolution
        const servicesSpan = context.startSpan('services_resolution');

        // Resolve to instantiate
        const aiService = container.resolve<IAIService>(TYPES.GeminiService);
        const userAnalysisService = container.resolve<IUserAnalysisService>(TYPES.UserAnalysisService);
        const commandRegistry = container.resolve<CommandRegistry>(TYPES.CommandRegistry);
        const healthMonitor = container.resolve<IHealthMonitor>(TYPES.HealthMonitor);
        const rateLimiter = container.resolve<IRateLimiter>(TYPES.RateLimiter);
        const contextManager = container.resolve<IContextManager>(TYPES.ContextManager);
        const gracefulDegradation = container.resolve<IGracefulDegradationService>(TYPES.GracefulDegradation);

        // Manual Wiring of Setters (Dependency Cycles / Post-Init Wiring)
        if (healthMonitor) {
          healthMonitor.setRateLimiter(rateLimiter);
          healthMonitor.setContextManager(contextManager);
          healthMonitor.setGeminiService(aiService);
        }
        if (gracefulDegradation) {
          gracefulDegradation.setHealthMonitor(healthMonitor);
        }

        const servicesMap: Record<string, IService> = {
          'aiService': aiService,
          'userAnalysisService': userAnalysisService,
          'healthMonitor': healthMonitor,
          'rateLimiter': rateLimiter,
          'contextManager': contextManager,
          'personalityManager': container.resolve(TYPES.PersonalityManager),
          'cacheManager': container.resolve(TYPES.CacheManager),
          'gracefulDegradation': gracefulDegradation,
          'roastingEngine': container.resolve(TYPES.RoastingEngine),
          'conversationManager': container.resolve(TYPES.ConversationManager),
          'retryHandler': container.resolve(TYPES.RetryHandler),
          'systemContextBuilder': container.resolve(TYPES.SystemContextBuilder),
          'responseProcessingService': container.resolve(TYPES.ResponseProcessingService),
          'analytics': new AnalyticsManager('./data/analytics.db'), // keeping it simple, not in TYPES yet
          'userPreferences': new UserPreferenceManager(),
          'helpSystem': new HelpSystem(),
          'behaviorAnalyzer': new BehaviorAnalyzer()
        };

        context.endSpan(servicesSpan.spanId);
        context.addLog(`Resolved ${Object.keys(servicesMap).length} services`, 'info');

        // Instrument services for tracing
        const instrumentationSpan = context.startSpan('service_instrumentation');
        const instrumentedServices = batchInstrumentServices(servicesMap);
        context.endSpan(instrumentationSpan.spanId);

        // Register with ServiceRegistry
        const registrationSpan = context.startSpan('service_registration');
        const dependencyMap = {
          'configuration': [],
          'analytics': [],
          'rateLimiter': [],
          'contextManager': [],
          'cacheManager': [],
          'personalityManager': [],
          'roastingEngine': [],
          'userPreferences': [],
          'helpSystem': [],
          'behaviorAnalyzer': [],
          'conversationManager': [],
          'retryHandler': [],
          'systemContextBuilder': [],
          'responseProcessingService': [],
          'userAnalysisService': [],
          'healthMonitor': ['rateLimiter', 'contextManager'],
          'gracefulDegradation': ['healthMonitor'],
          'aiService': ['rateLimiter', 'contextManager', 'personalityManager', 'cacheManager',
            'gracefulDegradation', 'roastingEngine', 'conversationManager',
            'retryHandler', 'systemContextBuilder', 'responseProcessingService']
        };

        for (const [name, service] of Object.entries(instrumentedServices)) {
          const dependencies = dependencyMap[name as keyof typeof dependencyMap] || [];
          serviceRegistry.register(name, service, dependencies);
        }
        context.endSpan(registrationSpan.spanId);

        // Initialize services
        const initSpan = context.startSpan('service_initialization');
        await Promise.race([
          serviceRegistry.initializeAll(),
          createTimeoutPromise(30000).then(() => {
            throw enrichError(new Error('Service initialization timeout'), {
              operation: 'serviceRegistry.initializeAll',
              timeout: 30000,
              requestId
            });
          })
        ]);
        context.endSpan(initSpan.spanId);
        context.addLog('Services initialized in dependency order', 'info');

        // Re-fetch instrumented services
        const finalGeminiService = instrumentedServices['aiService'] as IAIService;
        const finalUserAnalysisService = instrumentedServices['userAnalysisService'] as IUserAnalysisService;

        // Set Discord Client
        const clientSetupSpan = context.startSpan('discord_client_setup');
        await Promise.race([
          Promise.resolve(finalGeminiService.setDiscordClient(client)),
          createTimeoutPromise(5000).then(() => {
            throw enrichError(new Error('Discord client setup timeout'), {
              operation: 'geminiService.setDiscordClient',
              timeout: 5000,
              requestId
            });
          })
        ]);
        context.endSpan(clientSetupSpan.spanId);

        context.addLog('CommandRegistry initialized', 'info');

        const duration = Date.now() - startTime;
        context.addTags({
          initializationDuration: duration,
          servicesCreated: Object.keys(instrumentedServices).length,
          tracingEnabled: true
        });

        logger.info('Bot services initialized successfully with dependency injection and distributed tracing', {
          duration,
          requestId,
          servicesCreated: Object.keys(instrumentedServices).length,
          tracingEnabled: true
        });

        return { geminiService: finalGeminiService, userAnalysisService: finalUserAnalysisService, serviceRegistry, tracingIntegration, commandRegistry, container }; // Added container to return type
      },
      {
        maxRetries: 0,
        timeout: 60000,
        enableFallback: false
      },
      undefined,
      { operation: 'initializeBotServices', requestId }
    );

    if (!result.success) {
      const error = result.error || enrichError(new Error('Unknown initialization error'));
      logger.error('Failed to initialize bot services', {
        error,
        duration: Date.now() - startTime,
        requestId
      });
      throw error;
    }

    const tracingIntegration = TracingIntegration.getInstance();
    const analysis = tracingIntegration.getTraceCollector().collectTrace(context);

    if (analysis.performance.slowestOperation && analysis.performance.slowestOperation.duration > 2000) {
      logger.warn('Slow initialization operation detected', {
        slowestOperation: analysis.performance.slowestOperation,
        totalDuration: analysis.summary.totalDuration,
        recommendations: analysis.recommendations
      });
    }

    return result.data!;
  }, {
    source: 'bot_initialization',
    operation: 'service_initialization',
    environment: process.env.NODE_ENV || 'development'
  });
}

/**
 * Validates environment configuration using ConfigurationValidator
 */
export function validateEnvironment(): void {
  // Use the centralized ConfigurationValidator which includes all validation logic
  validateEnvWithValidator();

  // Additional validation for Discord-specific requirements
  const discordToken = process.env.DISCORD_TOKEN;
  if (!discordToken) {
    const error = 'DISCORD_TOKEN environment variable is required';
    logger.error(error);
    throw new Error(error);
  }
}

/**
 * Performs graceful shutdown of all services with timeout protection
 */
export async function shutdownServices(services: BotServices): Promise<void> {
  const startTime = Date.now();
  const requestId = `shutdown_${Date.now()}`;

  logger.info('Shutting down bot services...', { requestId });

  const shutdownOperations = [];

  if (services.serviceRegistry) {
    shutdownOperations.push(
      Promise.race([
        services.serviceRegistry.shutdownAll(),
        createTimeoutPromise(15000).then(() => {
          throw enrichError(new Error('Service registry shutdown timeout'), {
            operation: 'serviceRegistry.shutdownAll',
            timeout: 15000,
            requestId
          });
        })
      ]).catch(error => {
        logger.error('Error shutting down service registry:', {
          error: enrichError(error as Error, { operation: 'serviceRegistryShutdown', requestId })
        });
      })
    );
  }

  if (services.userAnalysisService) {
    shutdownOperations.push(
      Promise.race([
        services.userAnalysisService.shutdown(),
        createTimeoutPromise(10000).then(() => {
          throw enrichError(new Error('User Analysis service shutdown timeout'), {
            operation: 'userAnalysisService.shutdown',
            timeout: 10000,
            requestId
          });
        })
      ]).catch(error => {
        logger.error('Error shutting down User Analysis service:', {
          error: enrichError(error as Error, { operation: 'userAnalysisServiceShutdown', requestId })
        });
      })
    );
  }

  if (services.geminiService) {
    shutdownOperations.push(
      Promise.race([
        services.geminiService.shutdown(),
        createTimeoutPromise(10000).then(() => {
          throw enrichError(new Error('Gemini service shutdown timeout'), {
            operation: 'geminiService.shutdown',
            timeout: 10000,
            requestId
          });
        })
      ]).catch(error => {
        logger.error('Error shutting down Gemini service:', {
          error: enrichError(error as Error, { operation: 'geminiServiceShutdown', requestId })
        });
      })
    );
  }

  if (services.client) {
    shutdownOperations.push(
      Promise.race([
        services.client.destroy(),
        createTimeoutPromise(5000).then(() => {
          throw enrichError(new Error('Discord client destruction timeout'), {
            operation: 'client.destroy',
            timeout: 5000,
            requestId
          });
        })
      ]).catch(error => {
        logger.error('Error destroying Discord client:', {
          error: enrichError(error as Error, { operation: 'clientDestroy', requestId })
        });
      })
    );
  }

  // Wait for all shutdown operations to complete (or timeout/fail)
  await Promise.all(shutdownOperations);

  const duration = Date.now() - startTime;
  logger.info('Bot services shutdown completed', {
    duration,
    requestId,
    operationsCount: shutdownOperations.length
  });
}