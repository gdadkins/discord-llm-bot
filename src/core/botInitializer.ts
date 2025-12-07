/**
 * Bot Initialization Module
 * Handles Discord client setup and service initialization using dependency injection
 * Includes distributed tracing integration for comprehensive monitoring
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from '../utils/logger';
import { validateEnvironment as validateEnvWithValidator } from '../utils/ConfigurationValidator';
import { registerCommands } from '../commands';
import { ServiceFactory } from '../services/interfaces/serviceFactory';
import { ServiceRegistry } from '../services/interfaces/serviceRegistry';
import { ConfigurationFactory } from '../config/ConfigurationFactory';
import type { IAIService, IUserAnalysisService, IService } from '../services/interfaces';
import { enrichError, createTimeoutPromise, handleAsyncOperation } from '../utils/ErrorHandlingUtils';
import { TracingIntegration } from '../services/tracing/TracingIntegration';
import { batchInstrumentServices } from '../services/tracing/ServiceInstrumentation';
import { withNewContextAsync } from '../utils/tracing/RequestContext';

export interface BotServices {
  client: Client;
  geminiService: IAIService;
  userAnalysisService: IUserAnalysisService;
  serviceRegistry: ServiceRegistry;
  tracingIntegration: TracingIntegration;
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
export async function initializeBotServices(client: Client): Promise<{geminiService: IAIService, userAnalysisService: IUserAnalysisService, serviceRegistry: ServiceRegistry, tracingIntegration: TracingIntegration}> {
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
        logger.info('Initializing bot services with dependency injection and distributed tracing...', { requestId });
        
        // Initialize tracing system first
        const tracingSpan = context.startSpan('tracing_initialization');
        const tracingIntegration = TracingIntegration.getInstance();
        await tracingIntegration.initialize();
        context.endSpan(tracingSpan.spanId);
        context.addLog('Tracing system initialized', 'info');
      
        // Create bot configuration using factory with timeout
        const configSpan = context.startSpan('configuration_creation');
        const config = await Promise.race([
          Promise.resolve(ConfigurationFactory.createBotConfiguration()),
          createTimeoutPromise(10000).then(() => {
            throw enrichError(new Error('Configuration creation timeout'), {
              operation: 'ConfigurationFactory.createBotConfiguration',
              timeout: 10000,
              requestId
            });
          })
        ]);
        context.endSpan(configSpan.spanId);
        context.addLog('Configuration created', 'info');
        
        // Create service factory and registry
        const factorySpan = context.startSpan('service_factory_creation');
        const serviceFactory = new ServiceFactory();
        const serviceRegistry = new ServiceRegistry();
        context.endSpan(factorySpan.spanId);
        
        // Create all services with proper dependencies
        const servicesSpan = context.startSpan('services_creation');
        const services = await Promise.race([
          Promise.resolve(serviceFactory.createServices(config)),
          createTimeoutPromise(15000).then(() => {
            throw enrichError(new Error('Service creation timeout'), {
              operation: 'serviceFactory.createServices',
              timeout: 15000,
              requestId
            });
          })
        ]);
        context.endSpan(servicesSpan.spanId);
        context.addLog(`Created ${services.size} services`, 'info');
      
        // Instrument services for tracing before registration
        const instrumentationSpan = context.startSpan('service_instrumentation');
        const servicesMap: Record<string, IService> = {};
        for (const [name, service] of services) {
          servicesMap[name] = service as IService;
        }
        const instrumentedServices = batchInstrumentServices(servicesMap);
        context.endSpan(instrumentationSpan.spanId);
        context.addLog(`Instrumented ${Object.keys(instrumentedServices).length} services for tracing`, 'info');
        
        // Register instrumented services with the registry and their dependencies
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
        
        // Initialize services in dependency order with timeout
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
      
        // Get the AI service (GeminiService) - use instrumented version
        const geminiService = instrumentedServices['aiService'] as IAIService;
        if (!geminiService) {
          throw enrichError(new Error('Failed to create AI service'), {
            operation: 'getAIService',
            availableServices: Object.keys(instrumentedServices),
            requestId
          });
        }
        
        // Get the User Analysis service - use instrumented version
        const userAnalysisService = instrumentedServices['userAnalysisService'] as IUserAnalysisService;
        if (!userAnalysisService) {
          throw enrichError(new Error('Failed to create User Analysis service'), {
            operation: 'getUserAnalysisService',
            availableServices: Object.keys(instrumentedServices),
            requestId
          });
        }
        
        // Set Discord client for system context awareness with timeout
        const clientSetupSpan = context.startSpan('discord_client_setup');
        await Promise.race([
          Promise.resolve(geminiService.setDiscordClient(client)),
          createTimeoutPromise(5000).then(() => {
            throw enrichError(new Error('Discord client setup timeout'), {
              operation: 'geminiService.setDiscordClient',
              timeout: 5000,
              requestId
            });
          })
        ]);
        context.endSpan(clientSetupSpan.spanId);
        context.addLog('Discord client configured for AI service', 'info');
        
        // Register slash commands with timeout
        const commandsSpan = context.startSpan('command_registration');
        await Promise.race([
          registerCommands(client),
          createTimeoutPromise(15000).then(() => {
            throw enrichError(new Error('Command registration timeout'), {
              operation: 'registerCommands',
              timeout: 15000,
              requestId
            });
          })
        ]);
        context.endSpan(commandsSpan.spanId);
        context.addLog('Slash commands registered', 'info');
        
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
        
        return { geminiService, userAnalysisService, serviceRegistry, tracingIntegration };
      },
      {
        maxRetries: 0, // Don't retry initialization - fail fast
        timeout: 60000, // Overall timeout of 1 minute
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
    
    // Collect the initialization trace
    const tracingIntegration = TracingIntegration.getInstance();
    const analysis = tracingIntegration.getTraceCollector().collectTrace(context);
    
    // Log performance insights if initialization was slow
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