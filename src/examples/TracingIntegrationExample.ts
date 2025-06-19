/**
 * TracingIntegrationExample - Complete example of tracing integration
 * 
 * Demonstrates how to integrate distributed tracing into:
 * - Bot initialization
 * - Service creation and lifecycle
 * - Message handling
 * - Error tracking and performance monitoring
 * 
 * Agent 6: Distributed Tracing Implementation Specialist
 */

import { logger } from '../utils/logger';
import { Client, GatewayIntentBits } from 'discord.js';
import { TracingIntegration } from '../services/tracing/TracingIntegration';
import { instrumentGeminiService } from '../services/tracing/ServiceInstrumentation';
import { RequestContext, withNewContextAsync } from '../utils/tracing/RequestContext';
import { withTracing } from '../middleware/tracingMiddleware';
// import type { GeminiService } from '../services/gemini/GeminiService';
import type { IService } from '../services/interfaces';

/**
 * Example: Complete bot initialization with tracing
 */
export class TracedBotInitializer {
  private tracingIntegration: TracingIntegration;
  private client?: Client;
  private services: Record<string, IService> = {};
  
  constructor() {
    this.tracingIntegration = TracingIntegration.getInstance();
  }
  
  /**
   * Initialize bot with comprehensive tracing
   */
  async initialize(): Promise<void> {
    await withNewContextAsync(async (context) => {
      context.addTags({
        operation: 'bot_initialization',
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
      });
      
      try {
        // Step 1: Initialize tracing system
        const tracingSpan = context.startSpan('tracing_initialization');
        await this.tracingIntegration.initialize();
        context.endSpan(tracingSpan.spanId);
        
        // Step 2: Initialize Discord client with tracing
        const clientSpan = context.startSpan('discord_client_initialization');
        this.client = await this.initializeDiscordClient();
        context.endSpan(clientSpan.spanId);
        
        // Step 3: Initialize services with tracing
        const servicesSpan = context.startSpan('services_initialization');
        await this.initializeServices();
        context.endSpan(servicesSpan.spanId);
        
        // Step 4: Setup event handlers with tracing
        const handlersSpan = context.startSpan('event_handlers_setup');
        this.setupTracedEventHandlers();
        context.endSpan(handlersSpan.spanId);
        
        // Step 5: Connect to Discord
        const connectSpan = context.startSpan('discord_connection');
        await this.connectToDiscord();
        context.endSpan(connectSpan.spanId);
        
        logger.info('Bot initialization completed with tracing enabled');
        
      } catch (error) {
        context.addLog('Bot initialization failed', 'error', {
          error: (error as Error).message,
          stack: (error as Error).stack
        });
        throw error;
      }
    }, {
      source: 'bot_initialization',
      timestamp: Date.now()
    });
  }
  
  /**
   * Initialize Discord client with tracing wrapper
   */
  private async initializeDiscordClient(): Promise<Client> {
    return withTracing(
      async (): Promise<Client> => {
        const client = new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages
          ]
        });
        
        // Add tracing metadata to client
        (client as any).__tracingEnabled = true;
        (client as any).__tracingId = `discord_client_${Date.now()}`;
        
        logger.info('Discord client initialized with tracing');
        return client;
      },
      'Discord.ClientInitialization'
    )();
  }
  
  /**
   * Initialize services with automatic instrumentation
   */
  private async initializeServices(): Promise<void> {
    await withTracing(
      async () => {
        const context = RequestContext.current();
        
        // Example service initialization (simplified)
        // In real implementation, these would be created through your service factory
        
        // Mock service creation for demonstration
        const geminiService = await this.createMockGeminiService();
        const conversationManager = await this.createMockConversationManager();
        const contextManager = await this.createMockContextManager();
        
        // Instrument services for tracing
        this.services.gemini = instrumentGeminiService(geminiService as unknown as IService);
        this.services.conversation = conversationManager as unknown as IService; // Would use instrumentConversationManager
        this.services.context = contextManager as unknown as IService; // Would use instrumentContextManager
        
        context?.addTags({
          servicesInitialized: Object.keys(this.services).length,
          serviceTypes: Object.keys(this.services)
        });
        
        logger.info('Services initialized and instrumented for tracing', {
          services: Object.keys(this.services)
        });
      },
      'Services.Initialization'
    )();
  }
  
  /**
   * Setup event handlers with tracing integration
   */
  private setupTracedEventHandlers(): void {
    if (!this.client) {
      throw new Error('Discord client not initialized');
    }
    
    // Wrap message handler with tracing
    this.client.on('messageCreate', this.tracingIntegration.wrapMessageHandler(
      async (message) => {
        if (message.author.bot) return;
        
        const context = RequestContext.current();
        context?.addTags({
          messageContent: message.content.substring(0, 100), // First 100 chars for debugging
          hasAttachments: message.attachments.size > 0,
          attachmentCount: message.attachments.size
        });
        
        // Process message with instrumented services
        await this.processMessage({
          id: message.id,
          author: { id: message.author.id },
          content: message.content
        });
      }
    ));
    
    // Add other event handlers with tracing
    this.client.on('ready', () => {
      withNewContextAsync(async (context) => {
        context.addTags({
          event: 'ready',
          botUser: this.client?.user?.tag,
          guildCount: this.client?.guilds.cache.size
        });
        
        logger.info('Bot ready event traced', {
          traceId: context.traceId,
          botUser: this.client?.user?.tag
        });
      }, { source: 'discord_event', event: 'ready' });
    });
    
    this.client.on('error', (error) => {
      withNewContextAsync(async (context) => {
        context.addTags({
          event: 'error',
          errorType: error.name,
          errorMessage: error.message
        });
        
        context.addLog('Discord client error', 'error', {
          error: error.message,
          stack: error.stack
        });
        
        logger.error('Discord client error traced', {
          traceId: context.traceId,
          error: error.message
        });
      }, { source: 'discord_event', event: 'error' });
    });
  }
  
  /**
   * Process message with traced service calls
   */
  private async processMessage(message: { id: string; author: { id: string }; content?: string }): Promise<void> {
    const context = RequestContext.current();
    if (!context) {
      logger.warn('No trace context for message processing');
      return;
    }
    
    try {
      // Example of using instrumented services
      const processingSpan = context.startSpan('message_processing');
      
      // Get conversation context (traced automatically)
      const conversationSpan = context.startSpan('conversation_retrieval');
      // const conversation = await this.services.conversation.getOrCreateConversation(message.author.id);
      context.endSpan(conversationSpan.spanId);
      
      // Build system context (traced automatically)
      const contextSpan = context.startSpan('context_building');
      // const systemContext = await this.services.context.buildSystemContext({...});
      context.endSpan(contextSpan.spanId);
      
      // Generate AI response (traced automatically)
      const aiSpan = context.startSpan('ai_generation');
      // const response = await this.services.gemini.generateResponse({...});
      context.endSpan(aiSpan.spanId);
      
      // Send response
      const sendSpan = context.startSpan('discord_response_send');
      // await message.reply(response);
      context.endSpan(sendSpan.spanId);
      
      context.endSpan(processingSpan.spanId);
      
      context.addTags({
        processingComplete: true,
        responseGenerated: true
      });
      
    } catch (error) {
      context.addLog('Message processing failed', 'error', {
        error: (error as Error).message,
        messageId: message.id
      });
      
      throw error;
    }
  }
  
  /**
   * Connect to Discord with tracing
   */
  private async connectToDiscord(): Promise<void> {
    await withTracing(
      async () => {
        if (!this.client) {
          throw new Error('Discord client not initialized');
        }
        
        const token = process.env.DISCORD_TOKEN;
        if (!token) {
          throw new Error('DISCORD_TOKEN environment variable not set');
        }
        
        await this.client.login(token);
        logger.info('Successfully connected to Discord');
      },
      'Discord.Connection'
    )();
  }
  
  /**
   * Get tracing performance report
   */
  getPerformanceReport(): unknown {
    return this.tracingIntegration.getPerformanceOverview();
  }
  
  /**
   * Get tracing statistics
   */
  getTracingStats(): unknown {
    return this.tracingIntegration.getTracingStats();
  }
  
  /**
   * Export tracing data for analysis
   */
  exportTracingData(): unknown {
    return this.tracingIntegration.exportTracingData();
  }
  
  // Mock service creation methods (for demonstration)
  private async createMockGeminiService(): Promise<Record<string, unknown>> {
    return {
      generateResponse: async (_options: unknown) => {
        // Mock implementation
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'Mock response';
      },
      getStatus: () => ({ status: 'healthy' }),
      initialize: async () => {},
      cleanup: async () => {}
    };
  }
  
  private async createMockConversationManager(): Promise<Record<string, unknown>> {
    return {
      getOrCreateConversation: async (_userId: string) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { messages: [], lastActive: Date.now() };
      },
      addToConversation: async () => {},
      buildConversationContext: async () => 'Mock context'
    };
  }
  
  private async createMockContextManager(): Promise<Record<string, unknown>> {
    return {
      buildSystemContext: async (_options: unknown) => {
        await new Promise(resolve => setTimeout(resolve, 75));
        return 'Mock system context';
      },
      getUserContext: async () => ({}),
      getChannelContext: async () => ({})
    };
  }
}

/**
 * Example usage function
 */
export async function runTracedBotExample(): Promise<void> {
  const botInitializer = new TracedBotInitializer();
  
  try {
    await botInitializer.initialize();
    
    // Log performance report after initialization
    setTimeout(() => {
      const report = botInitializer.getPerformanceReport();
      const stats = botInitializer.getTracingStats();
      
      logger.info('Tracing performance report', {
        report,
        stats
      });
    }, 10000); // After 10 seconds
    
  } catch (error) {
    logger.error('Failed to initialize traced bot', { error });
    throw error;
  }
}

/**
 * Example: Manual tracing for custom operations
 */
export async function exampleManualTracing(): Promise<void> {
  await withNewContextAsync(async (context) => {
    context.addTags({
      operation: 'manual_example',
      customField: 'example_value'
    });
    
    // Simulate some work with manual span management
    const workSpan = context.startSpan('custom_work', {
      workType: 'data_processing',
      itemCount: 100
    });
    
    try {
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 200));
      
      context.addLog('Work completed successfully', 'info', {
        itemsProcessed: 100,
        duration: Date.now() - workSpan.startTime
      });
      
      context.endSpan(workSpan.spanId);
      
    } catch (error) {
      context.endSpan(workSpan.spanId, error as Error);
      throw error;
    }
    
    // The context will be automatically collected by TracingIntegration
    // when it goes out of scope or is explicitly finalized
    
  }, {
    source: 'manual_example',
    operation: 'demonstration'
  });
}