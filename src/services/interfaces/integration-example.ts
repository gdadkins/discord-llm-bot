/**
 * Integration Example
 * 
 * Demonstrates how to use the service interfaces and dependency injection
 * in the Discord bot application.
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { ServiceRegistry } from './serviceRegistry';
import { ServiceFactory } from './serviceFactory';
import { createServiceAdapters } from '../adapters';
import type {
  IService,
  IServiceRegistry,
  IAIService,
  IConfigurationService,
  IHealthMonitor,
  IAnalyticsService,
  BotConfiguration
} from './index';
import { logger } from '../../utils/logger';

/**
 * Example bot application using service interfaces
 */
export class DiscordBot {
  private client: Client;
  private serviceRegistry: IServiceRegistry;
  private config?: BotConfiguration;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
      ]
    });
    this.serviceRegistry = new ServiceRegistry();
  }

  /**
   * Initializes the bot and all services
   */
  async initialize(): Promise<void> {
    try {
      // Step 1: Create services using factory
      const factory = new ServiceFactory();
      const configService = factory.createConfigurationService();
      
      // Initialize config service first to load configuration
      await configService.initialize();
      this.config = configService.getConfiguration();
      
      // Step 2: Create all other services
      const services = factory.createServices(this.config);
      
      // Step 3: Wrap services with adapters for interface compliance
      const adaptedServices = createServiceAdapters(services);
      
      // Step 4: Register services with dependencies
      this.registerServices(adaptedServices);
      
      // Step 5: Initialize all services in dependency order
      await this.serviceRegistry.initializeAll();
      
      // Step 6: Set up Discord client
      await this.setupDiscordClient();
      
      // Step 7: Start health monitoring
      this.startHealthMonitoring();
      
      logger.info('Bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize bot:', error);
      throw error;
    }
  }

  /**
   * Registers all services with their dependencies
   */
  private registerServices(services: Map<string, IService>): void {
    // Register services with their dependencies
    // Order matters for dependency resolution
    
    // No dependencies
    this.serviceRegistry.register('configuration', services.get('configuration')!);
    this.serviceRegistry.register('analytics', services.get('analytics')!);
    this.serviceRegistry.register('rateLimiter', services.get('rateLimiter')!);
    this.serviceRegistry.register('contextManager', services.get('contextManager')!);
    this.serviceRegistry.register('cacheManager', services.get('cacheManager')!);
    this.serviceRegistry.register('personalityManager', services.get('personalityManager')!);
    this.serviceRegistry.register('roastingEngine', services.get('roastingEngine')!);
    this.serviceRegistry.register('userPreferences', services.get('userPreferences')!);
    this.serviceRegistry.register('helpSystem', services.get('helpSystem')!);
    this.serviceRegistry.register('behaviorAnalyzer', services.get('behaviorAnalyzer')!);
    
    // Depends on other services - using the 3-argument overload
    this.serviceRegistry.register('healthMonitor', services.get('healthMonitor')!);
    
    this.serviceRegistry.register('gracefulDegradation', services.get('gracefulDegradation')!);
    
    this.serviceRegistry.register('aiService', services.get('aiService')!);
  }

  /**
   * Sets up Discord client with service integration
   */
  private async setupDiscordClient(): Promise<void> {
    const aiService = this.serviceRegistry.getRequired<IAIService>('aiService');
    const analyticsService = this.serviceRegistry.get<IAnalyticsService>('analytics');
    const healthMonitor = this.serviceRegistry.get<IHealthMonitor>('healthMonitor');
    
    // Set Discord client in AI service
    aiService.setDiscordClient(this.client);
    
    // Set up event handlers
    this.client.on('ready', () => {
      logger.info(`Bot logged in as ${this.client.user?.tag}`);
      healthMonitor?.setDiscordConnected(true);
    });
    
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      // Track analytics
      if (analyticsService?.isEnabled()) {
        await analyticsService.trackUserEngagement(
          message.author.id,
          message.guild?.id || null,
          'mention'
        );
      }
      
      // Process with AI service
      if (message.mentions.has(this.client.user!)) {
        try {
          const response = await aiService.generateResponse(
            message.content,
            message.author.id,
            message.guild?.id,
            async (text) => {
              await message.reply(text);
            }
          );
          
          if (response) {
            await message.reply(response);
          }
        } catch (error) {
          logger.error('Error processing message:', error);
          await message.reply('Sorry, I encountered an error processing your message.');
        }
      }
    });
    
    // Log in to Discord
    await this.client.login(process.env.DISCORD_TOKEN);
  }

  /**
   * Starts health monitoring and alerting
   */
  private startHealthMonitoring(): void {
    const healthMonitor = this.serviceRegistry.get<IHealthMonitor>('healthMonitor');
    if (!healthMonitor) return;
    
    // Check health every minute
    setInterval(async () => {
      const isHealthy = await this.serviceRegistry.isHealthy();
      if (!isHealthy) {
        const statuses = await this.serviceRegistry.getHealthStatus();
        for (const [name, status] of statuses) {
          if (!status.healthy) {
            logger.warn(`Service unhealthy: ${name}`, status.errors);
          }
        }
      }
    }, 60000);
  }

  /**
   * Gracefully shuts down the bot
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down bot...');
    
    // Disconnect from Discord
    this.client.destroy();
    
    // Shutdown all services
    await this.serviceRegistry.shutdownAll();
    
    logger.info('Bot shutdown complete');
  }
}

/**
 * Example usage
 */
export async function runBot(): Promise<void> {
  const bot = new DiscordBot();
  
  // Handle shutdown signals
  process.on('SIGINT', async () => {
    await bot.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await bot.shutdown();
    process.exit(0);
  });
  
  // Initialize and run
  try {
    await bot.initialize();
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

/**
 * Example: Using services in commands
 */
export class CommandHandler {
  constructor(private serviceRegistry: IServiceRegistry) {}
  
  /**
   * Example command that uses multiple services
   */
  async handleStatusCommand(_userId: string, _serverId?: string): Promise<string> {
    const aiService = this.serviceRegistry.getRequired<IAIService>('aiService');
    const healthMonitor = this.serviceRegistry.getRequired<IHealthMonitor>('healthMonitor');
    const configService = this.serviceRegistry.getRequired<IConfigurationService>('configuration');
    
    // Get current metrics
    const metrics = await healthMonitor.getCurrentMetrics();
    const conversationStats = aiService.getConversationStats();
    const config = configService.getConfiguration();
    
    // Build status message
    return `
**Bot Status**
• Health: ${metrics.apiHealth.discord && metrics.apiHealth.gemini ? '✅ Healthy' : '⚠️ Issues Detected'}
• Memory: ${(metrics.memoryUsage.rss / 1024 / 1024).toFixed(1)}MB
• Active Conversations: ${conversationStats.activeUsers}
• Response Time: ${metrics.responseTime.p50}ms (median)
• Version: ${config.version}
    `.trim();
  }
  
  /**
   * Example: Analytics tracking
   */
  async trackCommand(
    commandName: string,
    userId: string,
    serverId: string | null,
    success: boolean,
    duration: number
  ): Promise<void> {
    const analytics = this.serviceRegistry.get<IAnalyticsService>('analytics');
    if (!analytics?.isEnabled()) return;
    
    await analytics.trackCommandUsage({
      commandName,
      userHash: userId,
      serverHash: serverId,
      success,
      durationMs: duration
    });
  }
}

/**
 * Example: Custom service that uses interfaces
 */
export class CustomFeatureService {
  constructor(
    private aiService: IAIService,
    private configService: IConfigurationService,
    private analyticsService: IAnalyticsService
  ) {}
  
  async processCustomRequest(userId: string, request: string): Promise<string> {
    // Check configuration
    const config = this.configService.getFeatureConfig();
    if (!config.codeExecution) {
      return 'Code execution is disabled in configuration';
    }
    
    // Track analytics
    const startTime = Date.now();
    
    try {
      // Use AI service
      const response = await this.aiService.generateResponse(
        `Execute this request: ${request}`,
        userId
      );
      
      // Track success
      await this.analyticsService.trackCommandUsage({
        commandName: 'custom_feature',
        userHash: userId,
        serverHash: null,
        success: true,
        durationMs: Date.now() - startTime
      });
      
      return response;
    } catch (error) {
      // Track failure
      await this.analyticsService.trackError(
        'custom_feature_error',
        error instanceof Error ? error.message : 'Unknown error',
        { commandName: 'custom_feature', userId }
      );
      
      throw error;
    }
  }
}