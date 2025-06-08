/**
 * Bot Initialization Module
 * Handles Discord client setup and service initialization using dependency injection
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from '../utils/logger';
import { registerCommands } from '../commands';
import { ServiceFactory } from '../services/interfaces/serviceFactory';
import { ServiceRegistry } from '../services/interfaces/serviceRegistry';
import { ConfigurationFactory } from '../config/ConfigurationFactory';
import type { IAIService } from '../services/interfaces';

export interface BotServices {
  client: Client;
  geminiService: IAIService;
  serviceRegistry: ServiceRegistry;
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
 * Initializes all bot services using dependency injection
 */
export async function initializeBotServices(client: Client): Promise<{geminiService: IAIService, serviceRegistry: ServiceRegistry}> {
  try {
    logger.info('Initializing bot services with dependency injection...');
    
    // Create bot configuration using factory
    const config = ConfigurationFactory.createBotConfiguration();
    
    // Create service factory and registry
    const serviceFactory = new ServiceFactory();
    const serviceRegistry = new ServiceRegistry();
    
    // Create all services with proper dependencies
    const services = serviceFactory.createServices(config);
    
    // Register services with the registry and their dependencies
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
      'healthMonitor': ['rateLimiter', 'contextManager'],
      'gracefulDegradation': ['healthMonitor'],
      'aiService': ['rateLimiter', 'contextManager', 'personalityManager', 'cacheManager', 
        'gracefulDegradation', 'roastingEngine', 'conversationManager', 
        'retryHandler', 'systemContextBuilder']
    };

    for (const [name, service] of services) {
      const dependencies = dependencyMap[name as keyof typeof dependencyMap] || [];
      serviceRegistry.register(name, service, dependencies);
    }
    
    // Initialize services in dependency order
    await serviceRegistry.initializeAll();
    
    // Get the AI service (GeminiService)
    const geminiService = services.get('aiService') as IAIService;
    if (!geminiService) {
      throw new Error('Failed to create AI service');
    }
    
    // Set Discord client for system context awareness
    geminiService.setDiscordClient(client);
    
    // Register slash commands
    await registerCommands(client);
    
    logger.info('Bot services initialized successfully with dependency injection');
    return { geminiService, serviceRegistry };
  } catch (error) {
    logger.error('Failed to initialize bot services:', error);
    throw error;
  }
}

/**
 * Validates environment configuration
 */
export function validateEnvironment(): void {
  const requiredEnvVars = [
    'DISCORD_TOKEN', 
    'DISCORD_CLIENT_ID'
  ];
  
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate API key using ConfigurationFactory after checking Discord vars
  ConfigurationFactory.validateApiKey();
}

/**
 * Performs graceful shutdown of all services
 */
export async function shutdownServices(services: BotServices): Promise<void> {
  logger.info('Shutting down bot services...');
  
  if (services.serviceRegistry) {
    try {
      await services.serviceRegistry.shutdownAll();
    } catch (error) {
      logger.error('Error shutting down service registry:', error);
    }
  }
  
  if (services.geminiService) {
    try {
      await services.geminiService.shutdown();
    } catch (error) {
      logger.error('Error shutting down Gemini service:', error);
    }
  }
  
  if (services.client) {
    try {
      await services.client.destroy();
    } catch (error) {
      logger.error('Error destroying Discord client:', error);
    }
  }
  
  logger.info('Bot services shut down successfully');
}