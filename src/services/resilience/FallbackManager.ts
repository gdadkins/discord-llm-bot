/**
 * Fallback Manager - Strategy Pattern Implementation
 * 
 * Manages fallback responses and queue operations during system degradation.
 * Provides flexible strategies for handling failed requests with proper
 * user feedback and recovery mechanisms.
 */

import { Mutex } from 'async-mutex';
import { logger } from '../../utils/logger';
import { DEGRADATION_CONSTANTS } from '../../utils/constants';

export interface QueuedMessage {
  id: string;
  userId: string;
  serverId?: string;
  prompt: string;
  timestamp: number;
  retries: number;
  priority: 'low' | 'medium' | 'high';
  respond: (response: string) => Promise<void>;
}

export interface FallbackConfig {
  /** Enable cached response fallbacks */
  enableCachedResponses: boolean;
  /** Enable generic fallback messages */
  enableGenericFallbacks: boolean;
  /** Enable maintenance mode responses */
  enableMaintenanceMode: boolean;
  /** Maximum queue size */
  maxQueueSize: number;
  /** Maximum time a message can stay in queue (ms) */
  maxQueueTimeMs: number;
  /** Retry interval for queued messages (ms) */
  retryIntervalMs: number;
  /** Maximum retries per message */
  maxRetries: number;
}

export interface FallbackStrategy {
  name: string;
  canHandle(severity: 'low' | 'medium' | 'high'): boolean;
  generateResponse(context: FallbackContext): Promise<string>;
}

export interface FallbackContext {
  prompt: string;
  userId: string;
  serverId?: string;
  severity: 'low' | 'medium' | 'high';
  degradationReason?: string;
  queueSize?: number;
}

export interface QueueMetrics {
  currentSize: number;
  maxSize: number;
  messagesProcessed: number;
  messagesDropped: number;
  messagesExpired: number;
  averageWaitTime: number;
}

export class FallbackManager {
  private readonly config: FallbackConfig;
  private readonly queueMutex = new Mutex();
  private readonly strategies: FallbackStrategy[] = [];
  private messageQueue: QueuedMessage[] = [];
  private queueMetrics: QueueMetrics;
  private queueProcessor: NodeJS.Timeout | null = null;
  private isProcessing = false;

  // Pre-defined fallback response pools
  private readonly GENERIC_FALLBACKS = [
    'I\'m experiencing some technical difficulties right now. Please try again in a moment!',
    'Sorry, I\'m having trouble processing requests at the moment. Give me a few minutes to recover.',
    'I\'m currently running in limited mode due to system issues. Please be patient while I work through this.',
    'Technical problems detected! I\'ll be back to full functionality shortly. Please retry your request.',
    'I\'m experiencing some hiccups right now. Try your request again in a minute or two.',
    'System maintenance in progress. I\'ll return to normal operation soon!',
    'Having some technical troubles, but I\'m working on it! Please try again shortly.',
    'I\'m operating with reduced functionality right now. Normal service will resume soon.'
  ];

  private readonly MAINTENANCE_RESPONSES = [
    '🔧 I\'m currently undergoing maintenance. Please check back in a few minutes!',
    '⚙️ Systems are being updated right now. I\'ll be back online shortly!',
    '🛠️ Temporary maintenance in progress. Thank you for your patience!',
    '📋 Running diagnostics and repairs. I\'ll return to service soon!',
    '🔄 Performing system optimization. Please try again in a moment!'
  ];

  constructor(config: FallbackConfig) {
    this.config = config;
    this.queueMetrics = {
      currentSize: 0,
      maxSize: config.maxQueueSize,
      messagesProcessed: 0,
      messagesDropped: 0,
      messagesExpired: 0,
      averageWaitTime: 0
    };

    this.initializeStrategies();
    this.startQueueProcessor();
  }

  /**
   * Register a custom fallback strategy
   */
  registerStrategy(strategy: FallbackStrategy): void {
    this.strategies.push(strategy);
    logger.info(`Registered fallback strategy: ${strategy.name}`);
  }

  /**
   * Generate appropriate fallback response based on context
   */
  async generateFallbackResponse(context: FallbackContext): Promise<string> {
    // Try strategies in order
    for (const strategy of this.strategies) {
      if (strategy.canHandle(context.severity)) {
        try {
          return await strategy.generateResponse(context);
        } catch (error) {
          logger.warn(`Fallback strategy ${strategy.name} failed`, { error });
        }
      }
    }

    // Default fallback
    return this.getDefaultFallback(context.severity);
  }

  /**
   * Queue a message for later processing
   */
  async queueMessage(
    userId: string,
    prompt: string,
    respond: (response: string) => Promise<void>,
    serverId?: string,
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<void> {
    const release = await this.queueMutex.acquire();
    try {
      // Check queue capacity
      if (this.messageQueue.length >= this.config.maxQueueSize) {
        await this.handleQueueOverflow(respond, priority);
        return;
      }

      const queuedMessage: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        serverId,
        prompt,
        timestamp: Date.now(),
        retries: 0,
        priority,
        respond
      };

      // Insert based on priority
      const insertIndex = this.findInsertIndex(queuedMessage);
      this.messageQueue.splice(insertIndex, 0, queuedMessage);
      
      this.queueMetrics.currentSize = this.messageQueue.length;

      logger.info(`Message queued for user ${userId}`, {
        messageId: queuedMessage.id,
        priority,
        queuePosition: insertIndex + 1,
        queueSize: this.messageQueue.length
      });

      // Provide user feedback
      const waitTime = this.estimateWaitTime(insertIndex);
      await respond(
        '⏳ Your message has been queued due to system load. ' +
        `Estimated processing time: ${waitTime}. ` +
        'You\'ll receive a response as soon as possible!'
      );
    } finally {
      release();
    }
  }

  /**
   * Process queued messages with callback
   */
  async processQueue(
    processCallback: (message: QueuedMessage) => Promise<boolean>
  ): Promise<void> {
    if (this.messageQueue.length === 0 || this.isProcessing) return;

    const release = await this.queueMutex.acquire();
    try {
      this.isProcessing = true;
      const messagesToProcess = this.messageQueue.splice(
        0, 
        Math.min(DEGRADATION_CONSTANTS.MAX_BATCH_PROCESS_SIZE, this.messageQueue.length)
      );
      release(); // Release early to allow new messages

      for (const message of messagesToProcess) {
        try {
          // Check expiration
          if (this.isMessageExpired(message)) {
            await this.handleExpiredMessage(message);
            continue;
          }

          // Try to process
          const success = await processCallback(message);
          
          if (success) {
            await message.respond('✅ Your queued message has been processed! Sorry for the delay.');
            this.recordProcessedMessage(message);
          } else {
            await this.handleFailedMessage(message);
          }
        } catch (error) {
          logger.error(`Failed to process queued message ${message.id}`, { error });
          await this.handleFailedMessage(message);
        }
      }
    } catch (error) {
      logger.error('Queue processing error', { error });
    } finally {
      this.isProcessing = false;
      this.queueMetrics.currentSize = this.messageQueue.length;
    }
  }

  /**
   * Get current queue metrics
   */
  getQueueMetrics(): QueueMetrics {
    return { ...this.queueMetrics };
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Drain queue with fallback responses (for shutdown)
   */
  async drainQueue(): Promise<void> {
    const release = await this.queueMutex.acquire();
    try {
      for (const message of this.messageQueue) {
        await message.respond(
          '🔄 System is shutting down. Your message couldn\'t be processed. ' +
          'Please try again when the service restarts.'
        );
      }
      this.messageQueue = [];
      this.queueMetrics.currentSize = 0;
    } finally {
      release();
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
      this.queueProcessor = null;
    }
  }

  // Private methods

  private initializeStrategies(): void {
    // Cached response strategy
    if (this.config.enableCachedResponses) {
      this.registerStrategy({
        name: 'CachedResponseStrategy',
        canHandle: () => true,
        generateResponse: async (context) => {
          // Placeholder for cache integration
          const cachedResponse = await this.tryGetCachedResponse(
            context.prompt, 
            context.userId, 
            context.serverId
          );
          if (cachedResponse) {
            return `📁 [Cached Response] ${cachedResponse}`;
          }
          throw new Error('No cached response available');
        }
      });
    }

    // Maintenance mode strategy
    if (this.config.enableMaintenanceMode) {
      this.registerStrategy({
        name: 'MaintenanceModeStrategy',
        canHandle: (severity) => severity === 'high',
        generateResponse: async () => {
          return this.getRandomResponse(this.MAINTENANCE_RESPONSES);
        }
      });
    }

    // Generic fallback strategy
    if (this.config.enableGenericFallbacks) {
      this.registerStrategy({
        name: 'GenericFallbackStrategy',
        canHandle: () => true,
        generateResponse: async (context) => {
          let fallback = this.getRandomResponse(this.GENERIC_FALLBACKS);
          
          if (context.degradationReason) {
            fallback += `\n\n🔧 Current issue: ${context.degradationReason}`;
          }
          
          if (context.queueSize && context.queueSize > 0) {
            fallback += `\n📊 Messages in queue: ${context.queueSize}`;
          }
          
          return fallback;
        }
      });
    }
  }

  private startQueueProcessor(): void {
    // This is a placeholder - actual processing handled by main service
    this.queueProcessor = setInterval(() => {
      // Cleanup expired messages periodically
      this.cleanupExpiredMessages().catch(error => {
        logger.error('Failed to cleanup expired messages', { error });
      });
    }, this.config.retryIntervalMs);
  }

  private async cleanupExpiredMessages(): Promise<void> {
    const release = await this.queueMutex.acquire();
    try {
      const now = Date.now();
      const expiredMessages = this.messageQueue.filter(
        msg => now - msg.timestamp > this.config.maxQueueTimeMs
      );

      for (const message of expiredMessages) {
        await this.handleExpiredMessage(message);
      }

      this.messageQueue = this.messageQueue.filter(
        msg => now - msg.timestamp <= this.config.maxQueueTimeMs
      );
      
      this.queueMetrics.currentSize = this.messageQueue.length;
    } finally {
      release();
    }
  }

  private async handleQueueOverflow(
    respond: (response: string) => Promise<void>,
    priority: 'low' | 'medium' | 'high'
  ): Promise<void> {
    // Try to remove lowest priority message
    const oldestLowPriority = this.messageQueue.findIndex(msg => msg.priority === 'low');
    
    if (oldestLowPriority !== -1 && priority !== 'low') {
      const removed = this.messageQueue.splice(oldestLowPriority, 1)[0];
      await removed.respond(
        'Sorry, the system is overloaded and your message was dropped. Please try again later.'
      );
      this.queueMetrics.messagesDropped++;
    } else {
      await respond('System is currently overloaded. Please try again in a few minutes.');
      this.queueMetrics.messagesDropped++;
    }
  }

  private async handleExpiredMessage(message: QueuedMessage): Promise<void> {
    await message.respond('Sorry, your message expired while in the queue. Please try again.');
    this.queueMetrics.messagesExpired++;
    logger.info(`Message ${message.id} expired after ${Date.now() - message.timestamp}ms`);
  }

  private async handleFailedMessage(message: QueuedMessage): Promise<void> {
    message.retries++;
    
    if (message.retries >= this.config.maxRetries) {
      await message.respond(
        'Sorry, I couldn\'t process your message after multiple attempts. Please try again later.'
      );
      logger.warn(`Failed to process message ${message.id} after ${message.retries} retries`);
    } else {
      // Re-queue for retry
      const release = await this.queueMutex.acquire();
      try {
        this.messageQueue.push(message);
        this.queueMetrics.currentSize = this.messageQueue.length;
      } finally {
        release();
      }
      logger.info(`Re-queued message ${message.id} for retry ${message.retries}/${this.config.maxRetries}`);
    }
  }

  private recordProcessedMessage(message: QueuedMessage): void {
    const waitTime = Date.now() - message.timestamp;
    this.queueMetrics.messagesProcessed++;
    
    // Update average wait time
    if (this.queueMetrics.averageWaitTime === 0) {
      this.queueMetrics.averageWaitTime = waitTime;
    } else {
      this.queueMetrics.averageWaitTime = 
        (this.queueMetrics.averageWaitTime * (this.queueMetrics.messagesProcessed - 1) + waitTime) / 
        this.queueMetrics.messagesProcessed;
    }

    logger.info(`Successfully processed queued message ${message.id} after ${waitTime}ms`);
  }

  private isMessageExpired(message: QueuedMessage): boolean {
    return Date.now() - message.timestamp > this.config.maxQueueTimeMs;
  }

  private findInsertIndex(message: QueuedMessage): number {
    const priorities = { high: 0, medium: 1, low: 2 };
    const messagePriority = priorities[message.priority];
    
    for (let i = 0; i < this.messageQueue.length; i++) {
      const queuedPriority = priorities[this.messageQueue[i].priority];
      if (messagePriority < queuedPriority) {
        return i;
      }
    }
    
    return this.messageQueue.length;
  }

  private estimateWaitTime(position: number): string {
    const averageProcessingTime = DEGRADATION_CONSTANTS.AVERAGE_PROCESSING_TIME_SECONDS;
    const estimatedSeconds = position * averageProcessingTime;
    
    if (estimatedSeconds < DEGRADATION_CONSTANTS.SECONDS_PER_MINUTE) {
      return `${estimatedSeconds} seconds`;
    } else if (estimatedSeconds < DEGRADATION_CONSTANTS.SECONDS_PER_HOUR) {
      return `${Math.ceil(estimatedSeconds / DEGRADATION_CONSTANTS.SECONDS_PER_MINUTE)} minutes`;
    } else {
      return `${Math.ceil(estimatedSeconds / DEGRADATION_CONSTANTS.SECONDS_PER_HOUR)} hours`;
    }
  }

  private getDefaultFallback(severity: 'low' | 'medium' | 'high'): string {
    if (severity === 'high') {
      return this.getRandomResponse(this.MAINTENANCE_RESPONSES);
    }
    return this.getRandomResponse(this.GENERIC_FALLBACKS);
  }

  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private async tryGetCachedResponse(
    _prompt: string, 
    _userId: string, 
    _serverId?: string
  ): Promise<string | null> {
    // Placeholder for cache integration
    return null;
  }
}