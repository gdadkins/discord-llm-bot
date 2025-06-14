import { logger } from '../utils/logger';
import { BaseService } from './base/BaseService';
import type { IService } from './interfaces';
import type { TextChannel, Message as DiscordMessage, Collection } from 'discord.js';
import { 
  handleNetworkOperation, 
  handleAsyncOperation
} from '../utils/ErrorHandlingUtils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  messages: Message[];
  lastActive: number;
  // Circular buffer optimization fields
  bufferStart: number;
  bufferSize: number;
  totalLength: number;
  maxBufferSize: number;
}

export interface IConversationManager extends IService {
  getOrCreateConversation(userId: string): Conversation;
  addToConversation(userId: string, userMessage: string, assistantResponse: string): void;
  buildConversationContext(userId: string, messageLimit?: number): string;
  clearUserConversation(userId: string): boolean;
  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
  };
  getActiveConversationCount(): number;
  fetchChannelHistory(
    channel: TextChannel, 
    limit?: number, 
    beforeMessageId?: string
  ): Promise<Message[]>;
  importChannelHistory(
    userId: string, 
    channel: TextChannel, 
    limit?: number
  ): Promise<number>;
}

export class ConversationManager extends BaseService implements IConversationManager {
  private conversations: Map<string, Conversation>;
  private readonly SESSION_TIMEOUT_MS: number;
  private readonly MAX_MESSAGES_PER_CONVERSATION: number;
  private readonly MAX_CONTEXT_LENGTH: number;

  constructor(
    sessionTimeoutMinutes: number = 30,
    maxMessages: number = 100,
    maxContextLength: number = 50000
  ) {
    super();
    this.conversations = new Map();
    this.SESSION_TIMEOUT_MS = sessionTimeoutMinutes * 60 * 1000;
    this.MAX_MESSAGES_PER_CONVERSATION = maxMessages;
    this.MAX_CONTEXT_LENGTH = maxContextLength;
  }

  protected getServiceName(): string {
    return 'ConversationManager';
  }

  protected async performInitialization(): Promise<void> {
    // Start cleanup interval - run every 5 minutes
    this.createInterval('conversationCleanup', () => {
      this.cleanupOldConversations();
    }, 5 * 60 * 1000);

    logger.info(
      `Timeout: ${this.SESSION_TIMEOUT_MS / 60000}min, Max messages: ${this.MAX_MESSAGES_PER_CONVERSATION}, Max context: ${this.MAX_CONTEXT_LENGTH} chars`,
    );
  }

  protected async performShutdown(): Promise<void> {
    // BaseService automatically clears all timers
    this.conversations.clear();
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    const activeConversations = this.conversations.size;
    const totalMessages = Array.from(this.conversations.values())
      .reduce((sum, conv) => sum + conv.bufferSize, 0);
    
    return {
      conversations: {
        activeConversations,
        totalMessages,
        sessionTimeoutMs: this.SESSION_TIMEOUT_MS,
        maxMessagesPerConversation: this.MAX_MESSAGES_PER_CONVERSATION
      }
    };
  }

  private cleanupOldConversations(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, conversation] of this.conversations.entries()) {
      if (now - conversation.lastActive > this.SESSION_TIMEOUT_MS) {
        this.conversations.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(
        `Cleaned up ${cleaned} old conversations. Active conversations: ${this.conversations.size}`,
      );
    }
  }

  getOrCreateConversation(userId: string): Conversation {
    const existing = this.conversations.get(userId);
    if (existing) {
      return existing;
    }

    // Initialize with circular buffer optimization
    const maxSize = this.MAX_MESSAGES_PER_CONVERSATION * 2;
    const newConversation: Conversation = {
      messages: new Array(maxSize), // Pre-allocate array
      lastActive: Date.now(),
      bufferStart: 0,
      bufferSize: 0,
      totalLength: 0,
      maxBufferSize: maxSize,
    };

    this.conversations.set(userId, newConversation);
    return newConversation;
  }

  addToConversation(
    userId: string,
    userMessage: string,
    assistantResponse: string,
  ): void {
    const conversation = this.getOrCreateConversation(userId);
    const now = Date.now();

    // Add user message using circular buffer
    this.addMessageToBuffer(conversation, {
      role: 'user',
      content: userMessage,
      timestamp: now,
    });

    // Add assistant response using circular buffer
    this.addMessageToBuffer(conversation, {
      role: 'assistant',
      content: assistantResponse,
      timestamp: now,
    });

    // Smart trimming by character length (only when needed)
    this.trimConversationByLength(conversation);

    conversation.lastActive = now;
  }

  private addMessageToBuffer(conversation: Conversation, message: Message): void {
    const writeIndex = (conversation.bufferStart + conversation.bufferSize) % conversation.maxBufferSize;
    
    // If buffer is full, remove oldest message
    if (conversation.bufferSize === conversation.maxBufferSize) {
      const oldMessage = conversation.messages[conversation.bufferStart];
      if (oldMessage) {
        conversation.totalLength -= oldMessage.content.length;
      }
      conversation.bufferStart = (conversation.bufferStart + 1) % conversation.maxBufferSize;
      conversation.bufferSize--;
    }
    
    // Add new message
    conversation.messages[writeIndex] = message;
    conversation.totalLength += message.content.length;
    conversation.bufferSize++;
  }

  private trimConversationByLength(conversation: Conversation): void {
    // Only trim if we exceed the length limit and have more than 2 messages
    while (
      conversation.totalLength > this.MAX_CONTEXT_LENGTH &&
      conversation.bufferSize > 2
    ) {
      const oldMessage = conversation.messages[conversation.bufferStart];
      if (oldMessage) {
        conversation.totalLength -= oldMessage.content.length;
      }
      conversation.bufferStart = (conversation.bufferStart + 1) % conversation.maxBufferSize;
      conversation.bufferSize--;
    }
  }

  buildConversationContext(userId: string, messageLimit?: number): string {
    const conversation = this.conversations.get(userId);
    if (!conversation || conversation.bufferSize === 0) {
      return '';
    }

    // Check if conversation is still active
    if (Date.now() - conversation.lastActive > this.SESSION_TIMEOUT_MS) {
      this.conversations.delete(userId);
      return '';
    }

    // Build context from circular buffer efficiently
    const contextParts: string[] = [];
    
    // Determine how many messages to include
    const messagesToInclude = messageLimit 
      ? Math.min(messageLimit, conversation.bufferSize)
      : conversation.bufferSize;
    
    // Start from the most recent messages if we have a limit
    const startIndex = messageLimit && messageLimit < conversation.bufferSize
      ? conversation.bufferSize - messagesToInclude
      : 0;
    
    for (let i = startIndex; i < conversation.bufferSize; i++) {
      const messageIndex = (conversation.bufferStart + i) % conversation.maxBufferSize;
      const msg = conversation.messages[messageIndex];
      if (msg) {
        contextParts.push(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`);
      }
    }

    return contextParts.join('\n');
  }

  clearUserConversation(userId: string): boolean {
    const had = this.conversations.has(userId);
    this.conversations.delete(userId);
    if (had) {
      logger.info(`Cleared conversation history for user ${userId}`);
    }
    return had;
  }

  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
    } {
    let totalMessages = 0;
    let totalContextSize = 0;
    for (const conversation of this.conversations.values()) {
      totalMessages += conversation.bufferSize;
      totalContextSize += conversation.totalLength; // O(1) instead of O(n)
    }
    return {
      activeUsers: this.conversations.size,
      totalMessages,
      totalContextSize,
    };
  }

  getActiveConversationCount(): number {
    return this.conversations.size;
  }

  /**
   * Fetches message history from a Discord channel
   * @param channel The Discord text channel to fetch from
   * @param limit Maximum number of messages to fetch (default: 100, max: 100 per API call)
   * @param beforeMessageId Fetch messages before this message ID for pagination
   * @returns Array of messages in chronological order (oldest first)
   */
  async fetchChannelHistory(
    channel: TextChannel,
    limit: number = 100,
    beforeMessageId?: string
  ): Promise<Message[]> {
    const result = await handleNetworkOperation(
      async () => {
        const messages: Message[] = [];
        let remaining = Math.min(limit, this.MAX_MESSAGES_PER_CONVERSATION);
        let lastMessageId = beforeMessageId;
        
        while (remaining > 0) {
          const fetchLimit = Math.min(remaining, 100); // Discord API limit per request
          
          // Fetch messages with rate limit handling
          const fetchedMessages = await this.fetchMessagesWithRetry(
            channel,
            fetchLimit,
            lastMessageId
          );
          
          if (fetchedMessages.size === 0) {
            break; // No more messages to fetch
          }
          
          // Convert Discord messages to our Message format
          // Discord returns newest first, so we reverse to get chronological order
          const sortedMessages = Array.from(fetchedMessages.values()).reverse();
          
          for (const msg of sortedMessages) {
            // Skip bot messages (we'll identify assistant messages differently)
            if (msg.author.bot && msg.author.id !== msg.client.user?.id) {
              continue;
            }
            
            const role: 'user' | 'assistant' = 
              msg.author.id === msg.client.user?.id ? 'assistant' : 'user';
              
            messages.push({
              role,
              content: msg.content,
              timestamp: msg.createdTimestamp
            });
          }
          
          // Update for next iteration
          remaining -= fetchedMessages.size;
          const messagesArray = Array.from(fetchedMessages.values());
          if (messagesArray.length > 0) {
            const oldestMessage = messagesArray[messagesArray.length - 1];
            lastMessageId = oldestMessage.id;
          } else {
            break;
          }
          
          // Small delay to respect rate limits
          if (remaining > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        return messages;
      },
      // Fallback to return empty array if network operation fails
      () => Promise.resolve([]),
      { 
        service: 'ConversationManager', 
        operation: 'fetchChannelHistory',
        channelId: channel.id,
        limit,
        beforeMessageId 
      }
    );

    if (result.success) {
      const messages = result.data!;
      logger.info(`Fetched ${messages.length} messages from channel ${channel.id}`);
      
      if (result.fallbackUsed) {
        logger.warn('Used fallback for channel history fetch - returned empty array');
      }
      
      return messages;
    } else {
      logger.error('Failed to fetch channel history', { 
        error: result.error,
        channelId: channel.id 
      });
      throw result.error;
    }
  }

  /**
   * Fetches messages with exponential backoff retry for rate limits
   */
  private async fetchMessagesWithRetry(
    channel: TextChannel,
    limit: number,
    before?: string,
    maxRetries: number = 3
  ): Promise<Collection<string, DiscordMessage>> {
    const result = await handleAsyncOperation(
      async () => {
        const options: { limit: number; before?: string } = { limit };
        if (before) {
          options.before = before;
        }
        
        return await channel.messages.fetch(options);
      },
      {
        maxRetries,
        retryDelay: 1000,
        retryMultiplier: 2.0,
        timeout: 10000
      },
      undefined,
      { 
        service: 'ConversationManager', 
        operation: 'fetchMessagesWithRetry',
        channelId: channel.id,
        limit,
        before 
      }
    );

    if (result.success) {
      return result.data!;
    } else {
      throw result.error || new Error('Failed to fetch messages after max retries');
    }
  }

  /**
   * Imports channel history into a user's conversation
   * @param userId The user ID to import history for
   * @param channel The Discord channel to import from
   * @param limit Maximum number of messages to import
   * @returns Number of messages imported
   */
  async importChannelHistory(
    userId: string,
    channel: TextChannel,
    limit: number = 50
  ): Promise<number> {
    const result = await handleAsyncOperation(
      async () => {
        // Fetch the channel history
        const messages = await this.fetchChannelHistory(channel, limit);
        
        if (messages.length === 0) {
          logger.info(`No messages to import for user ${userId}`);
          return 0;
        }
        
        // Get or create conversation
        const conversation = this.getOrCreateConversation(userId);
        
        // Clear existing messages if needed to make room
        conversation.bufferStart = 0;
        conversation.bufferSize = 0;
        conversation.totalLength = 0;
        
        // Import messages in chronological order
        let imported = 0;
        for (const message of messages) {
          // Only import if within context limits
          if (conversation.totalLength + message.content.length > this.MAX_CONTEXT_LENGTH) {
            logger.info(
              `Stopped importing at ${imported} messages due to context length limit`
            );
            break;
          }
          
          this.addMessageToBuffer(conversation, message);
          imported++;
        }
        
        conversation.lastActive = Date.now();
        return imported;
      },
      {
        maxRetries: 2,
        retryDelay: 1000,
        retryMultiplier: 2.0,
        timeout: 60000
      },
      // Fallback returns 0 imported messages
      () => Promise.resolve(0),
      { 
        service: 'ConversationManager', 
        operation: 'importChannelHistory',
        userId,
        channelId: channel.id,
        limit 
      }
    );

    if (result.success) {
      const imported = result.data!;
      logger.info(
        `Imported ${imported} messages from channel ${channel.id} for user ${userId}`
      );
      
      if (result.fallbackUsed) {
        logger.warn('Used fallback for channel history import - returned 0 imported');
      }
      
      return imported;
    } else {
      logger.error(`Failed to import channel history for user ${userId}`, { 
        error: result.error,
        channelId: channel.id 
      });
      throw result.error;
    }
  }
}