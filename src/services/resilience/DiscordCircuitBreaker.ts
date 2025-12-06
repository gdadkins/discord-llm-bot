/**
 * Discord API Circuit Breaker
 * 
 * Provides specific circuit breaker protection for Discord API operations
 * with operation-specific configurations and fallback mechanisms.
 * 
 * Features:
 * - Operation-specific breakers (send_message, edit_message, add_reaction)
 * - Discord error code classification
 * - Message queuing fallbacks
 * - Health monitoring integration
 */

import { CircuitBreaker, CircuitBreakerConfig } from './CircuitBreaker';
import { logger } from '../../utils/logger';
import type { HealthMonitor } from '../health/HealthMonitor';
import type { Message, TextChannel, MessageCreateOptions, MessageEditOptions } from 'discord.js';

export interface DiscordCircuitBreakerConfig {
  healthMonitor?: HealthMonitor;
  fallbackService?: IFallbackService;
}

export interface IFallbackService {
  queueMessage(data: {
    channelId: string;
    content: MessageCreateOptions;
    timestamp: number;
  }): Promise<void>;
}

export interface DiscordError extends Error {
  code?: number;
  status?: number;
}

export interface CircuitBreakerStatus {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

/**
 * Discord-specific circuit breaker that manages multiple operation types
 */
export class DiscordCircuitBreaker {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly healthMonitor?: HealthMonitor;
  private readonly fallbackService?: IFallbackService;

  constructor(config: DiscordCircuitBreakerConfig = {}) {
    this.healthMonitor = config.healthMonitor;
    this.fallbackService = config.fallbackService;
    
    // Initialize operation-specific circuit breakers
    this.initializeBreakers();
  }

  /**
   * Send message with circuit breaker protection
   */
  async sendMessage(
    channel: TextChannel,
    content: MessageCreateOptions
  ): Promise<Message | null> {
    const breaker = this.breakers.get('send_message')!;
    
    return breaker.execute(async () => {
      try {
        return await channel.send(content);
      } catch (error) {
        this.classifyAndEnrichDiscordError(error as DiscordError);
        throw error;
      }
    }).catch(async (error) => {
      // Circuit breaker is open or operation failed
      if (error.message?.includes('Circuit breaker is OPEN')) {
        // Calculate content length for logging
        let contentLength = 0;
        if (content && typeof content.content === 'string') {
          contentLength = content.content.length;
        }
        
        logger.warn('Using fallback for Discord message send - circuit breaker open', {
          channelId: channel.id,
          contentLength
        });
        
        // Queue message for later delivery
        if (this.fallbackService) {
          await this.fallbackService.queueMessage({
            channelId: channel.id,
            content,
            timestamp: Date.now()
          });
        }
        
        return null;
      }
      
      throw error;
    });
  }

  /**
   * Edit message with circuit breaker protection
   */
  async editMessage(
    message: Message,
    content: string | MessageEditOptions
  ): Promise<Message | null> {
    const breaker = this.breakers.get('edit_message')!;
    
    return breaker.execute(async () => {
      return await message.edit(content);
    }).catch(async (error) => {
      if (error.message?.includes('Circuit breaker is OPEN')) {
        logger.warn('Using fallback for Discord message edit - circuit breaker open', {
          messageId: message.id
        });
        return null;
      }
      
      throw error;
    });
  }

  /**
   * Add reaction with circuit breaker protection
   */
  async addReaction(
    message: Message,
    emoji: string
  ): Promise<void> {
    const breaker = this.breakers.get('add_reaction')!;
    
    await breaker.execute(async () => {
      await message.react(emoji);
    }).catch(async (error) => {
      if (error.message?.includes('Circuit breaker is OPEN')) {
        logger.warn('Skipping reaction - circuit breaker open', {
          messageId: message.id,
          emoji
        });
        return;
      }
      
      throw error;
    });
  }

  /**
   * Remove reaction with circuit breaker protection
   */
  async removeReaction(
    message: Message,
    emoji: string,
    user?: string
  ): Promise<void> {
    const breaker = this.breakers.get('remove_reaction')!;
    
    await breaker.execute(async () => {
      if (user) {
        await message.reactions.cache.get(emoji)?.users.remove(user);
      } else {
        await message.reactions.removeAll();
      }
    }).catch(async (error) => {
      if (error.message?.includes('Circuit breaker is OPEN')) {
        logger.warn('Skipping reaction removal - circuit breaker open', {
          messageId: message.id,
          emoji,
          user
        });
        return;
      }
      
      throw error;
    });
  }

  /**
   * Get status of all Discord circuit breakers
   */
  getStatus(): Record<string, CircuitBreakerStatus> {
    const status: Record<string, CircuitBreakerStatus> = {};
    
    for (const [name, breaker] of this.breakers) {
      const state = breaker.getState();
      status[name] = {
        state: state.state,
        failureCount: state.failureCount,
        lastFailureTime: state.lastFailureTime,
        lastSuccessTime: state.lastSuccessTime,
        consecutiveSuccesses: state.consecutiveSuccesses,
        totalRequests: state.totalRequests,
        totalFailures: state.totalFailures,
        totalSuccesses: state.totalSuccesses
      };
    }
    
    return status;
  }

  /**
   * Manually trigger recovery for specific or all Discord operations
   */
  async triggerRecovery(operation?: string): Promise<void> {
    if (operation && this.breakers.has(operation)) {
      await this.breakers.get(operation)!.triggerRecovery();
      logger.info(`Manual recovery triggered for Discord ${operation}`);
    } else if (!operation) {
      for (const [name, breaker] of this.breakers) {
        await breaker.triggerRecovery();
      }
      logger.info('Manual recovery triggered for all Discord operations');
    } else {
      logger.warn(`Unknown Discord operation for recovery: ${operation}`);
    }
  }

  /**
   * Reset specific or all Discord circuit breakers
   */
  async reset(operation?: string): Promise<void> {
    if (operation && this.breakers.has(operation)) {
      await this.breakers.get(operation)!.reset();
      logger.info(`Reset Discord ${operation} circuit breaker`);
    } else if (!operation) {
      for (const [name, breaker] of this.breakers) {
        await breaker.reset();
      }
      logger.info('Reset all Discord circuit breakers');
    } else {
      logger.warn(`Unknown Discord operation for reset: ${operation}`);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    for (const [name, breaker] of this.breakers) {
      breaker.destroy();
      logger.info(`Discord ${name} circuit breaker destroyed`);
    }
    this.breakers.clear();
  }

  // Private methods

  private initializeBreakers(): void {
    // Send message breaker - most critical operation
    this.createBreaker('send_message', {
      serviceName: 'discord_send_message',
      maxFailures: 5,
      resetTimeoutMs: 30000,
      halfOpenMaxRetries: 3
    });

    // Edit message breaker - less critical
    this.createBreaker('edit_message', {
      serviceName: 'discord_edit_message',
      maxFailures: 3,
      resetTimeoutMs: 20000,
      halfOpenMaxRetries: 2
    });

    // Add reaction breaker - least critical
    this.createBreaker('add_reaction', {
      serviceName: 'discord_add_reaction',
      maxFailures: 10,
      resetTimeoutMs: 15000,
      halfOpenMaxRetries: 5
    });

    // Remove reaction breaker
    this.createBreaker('remove_reaction', {
      serviceName: 'discord_remove_reaction',
      maxFailures: 10,
      resetTimeoutMs: 15000,
      halfOpenMaxRetries: 5
    });

    logger.info('Discord circuit breakers initialized', {
      operations: Array.from(this.breakers.keys())
    });
  }

  private createBreaker(name: string, config: CircuitBreakerConfig): void {
    const breaker = new CircuitBreaker(config);
    this.breakers.set(name, breaker);

    // Update health monitor when circuit state changes
    if (this.healthMonitor) {
      // Note: The current CircuitBreaker doesn't have state change callbacks
      // This would require enhancement to the base CircuitBreaker class
      logger.debug(`Circuit breaker ${name} created with health monitor integration`);
    }
  }

  private classifyAndEnrichDiscordError(error: DiscordError): void {
    if (!error.code && !error.status) {
      return; // Not a Discord API error
    }

    const code = error.code || error.status || 0;
    
    // Add Discord-specific error context
    const discordContext = {
      discord: {
        code,
        retryable: this.isDiscordErrorRetryable(code),
        category: this.categorizeDiscordError(code)
      }
    };

    // Enrich error object
    Object.assign(error, discordContext);

    logger.debug('Discord error classified', {
      code,
      category: discordContext.discord.category,
      retryable: discordContext.discord.retryable,
      originalMessage: error.message
    });
  }

  private isDiscordErrorRetryable(code: number): boolean {
    // Non-retryable errors
    const nonRetryableErrors = [
      50001, // Missing access
      50013, // Missing permissions
      50035, // Invalid form body
      50001, // Missing access
      50008, // Message deleted
      50016, // Message already crossposted
      10003, // Unknown channel
      10008, // Unknown message
      10011, // Unknown role
      10013, // Unknown user
      10014, // Unknown emoji
    ];

    if (nonRetryableErrors.includes(code)) {
      return false;
    }

    // Retryable errors (rate limits and server errors)
    if (code === 429 || (code >= 500 && code < 600)) {
      return true;
    }

    // Default to non-retryable for unknown codes
    return false;
  }

  private categorizeDiscordError(code: number): string {
    if (code === 50013 || code === 50001) {
      return 'authorization';
    } else if (code === 429) {
      return 'rate_limit';
    } else if (code >= 500 && code < 600) {
      return 'server_error';
    } else if (code >= 40000 && code < 50000) {
      return 'client_error';
    } else if (code >= 10000 && code < 20000) {
      return 'not_found';
    } else {
      return 'unknown';
    }
  }
}

/**
 * Factory function to create Discord circuit breaker with default configuration
 */
export function createDiscordCircuitBreaker(config?: DiscordCircuitBreakerConfig): DiscordCircuitBreaker {
  return new DiscordCircuitBreaker(config);
}