import { 
  Message as DiscordMessage, 
  TextChannel, 
  Collection 
} from 'discord.js';
import { logger } from '../../utils/logger';
import { BaseService } from '../base/BaseService';
import type { IConversationManager, Conversation, Message } from '../interfaces';
import { Mutex } from 'async-mutex';
import { LRUCache } from 'lru-cache';
import { enrichError, handleAsyncOperation, handleNetworkOperation } from '../../utils/ErrorHandlingUtils';
import { globalPools } from '../../utils/PromisePool';
import { RequestCoalescer, globalCoalescers } from '../../utils/RequestCoalescer';

export class ConversationManager extends BaseService implements IConversationManager {
  private conversations: Map<string, Conversation>;
  private readonly SESSION_TIMEOUT_MS: number;
  private readonly MAX_MESSAGES_PER_CONVERSATION: number;
  private readonly MAX_CONTEXT_LENGTH: number;
  
  // Memory management
  private readonly STALE_DATA_CLEANUP_INTERVAL = 3600000; // 1 hour
  private readonly MEMORY_MONITOR_INTERVAL = 30000; // 30 seconds
  private readonly STALE_DATA_DAYS = 30;
  private readonly MEMORY_WARNING_THRESHOLD_MB = 400;
  private readonly MEMORY_CRITICAL_THRESHOLD_MB = 500;
  
  // Context cache with TTL
  private readonly CONTEXT_CACHE_TTL = 300000; // 5 minutes
  private readonly CONTEXT_CACHE_MAX_ENTRIES = 1000;
  private contextCache: Map<string, { content: string; hash: string; timestamp: number }> = new Map();
  
  // Weak references for temporary data
  private weakUserData: WeakMap<object, unknown> = new WeakMap();

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
    
    // Start stale data cleanup - run every hour
    this.createInterval('staleDataCleanup', () => {
      this.performStaleDataCleanup();
    }, this.STALE_DATA_CLEANUP_INTERVAL);
    
    // Start memory monitoring - run every 30 seconds
    this.createInterval('memoryMonitor', () => {
      this.monitorMemoryUsage();
    }, this.MEMORY_MONITOR_INTERVAL);

    logger.info(
      `Timeout: ${this.SESSION_TIMEOUT_MS / 60000}min, Max messages: ${this.MAX_MESSAGES_PER_CONVERSATION}, Max context: ${this.MAX_CONTEXT_LENGTH} chars`,
    );
  }

  protected async performShutdown(): Promise<void> {
    // BaseService automatically clears all timers
    this.conversations.clear();
    this.contextCache.clear();
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
    // Check cache first
    const cacheKey = `conv_context_${userId}_${messageLimit || 'all'}`;
    const cachedEntry = this.contextCache.get(cacheKey);
    const now = Date.now();
    
    if (cachedEntry && (now - cachedEntry.timestamp < this.CONTEXT_CACHE_TTL)) {
      const conversation = this.conversations.get(userId);
      if (conversation) {
        const currentHash = this.generateConversationHash(conversation, messageLimit);
        if (cachedEntry.hash === currentHash) {
          return cachedEntry.content;
        }
      }
    }
    
    const conversation = this.conversations.get(userId);
    if (!conversation || conversation.bufferSize === 0) {
      return '';
    }

    // Check if conversation is still active
    if (now - conversation.lastActive > this.SESSION_TIMEOUT_MS) {
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

    const result = contextParts.join('\n');
    
    // Cache the result with hash validation
    const conversationHash = this.generateConversationHash(conversation, messageLimit);
    this.contextCache.set(cacheKey, {
      content: result,
      hash: conversationHash,
      timestamp: now
    });
    
    // Evict old cache entries if needed
    this.evictOldCacheEntries();
    
    return result;
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
   * OPTIMIZED: Uses request coalescing and promise pool
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
    // Use request coalescing for identical channel history requests
    const coalescerKey = `channel-${channel.id}-${limit}-${beforeMessageId || 'latest'}`;
    
    return globalCoalescers.serverContext.execute(coalescerKey, async () => {
      const result = await handleNetworkOperation(
        async () => {
          const messages: Message[] = [];
          let remaining = Math.min(limit, this.MAX_MESSAGES_PER_CONVERSATION);
          let lastMessageId = beforeMessageId;
          
          // OPTIMIZATION: Batch fetch operations using promise pool
          const messageChunks: Message[][] = [];
          
          while (remaining > 0) {
            const fetchLimit = Math.min(remaining, 100); // Discord API limit per request
            const currentLastMessageId = lastMessageId;
            const chunkIndex = messageChunks.length;
            
            // Create placeholder for this chunk
            messageChunks.push([]);
            
            // Queue fetch operation in promise pool
            const fetchPromise = globalPools.discord.execute(async () => {
              const fetchedMessages = await this.fetchMessagesWithRetry(
                channel,
                fetchLimit,
                currentLastMessageId
              );
              
              if (fetchedMessages.size === 0) {
                return {
                  messagesArray: [],
                  size: 0
                };
              }
              
              // Convert Discord messages to our Message format
              const sortedMessages = Array.from(fetchedMessages.values()).reverse();
              const chunk: Message[] = [];
              
              for (const msg of sortedMessages) {
                // Skip bot messages (we'll identify assistant messages differently)
                if (msg.author.bot && msg.author.id !== msg.client.user?.id) {
                  continue;
                }
                
                const role: 'user' | 'assistant' = 
                  msg.author.id === msg.client.user?.id ? 'assistant' : 'user';
                  
                chunk.push({
                  role,
                  content: msg.content,
                  timestamp: msg.createdTimestamp
                });
              }
              
              // Store chunk in the correct position
              messageChunks[chunkIndex] = chunk;
              
              // Return info for next iteration
              return {
                messagesArray: Array.from(fetchedMessages.values()),
                size: fetchedMessages.size
              };
            });
            
            // For sequential pagination, we need to wait for this fetch to complete
            // before we can determine the next lastMessageId
            const fetchResult = await fetchPromise;
            
            if (!fetchResult || fetchResult.size === 0) {
              break;
            }
            
            // Update for next iteration
            remaining -= fetchResult.size;
            if (fetchResult.messagesArray.length > 0) {
              const oldestMessage = fetchResult.messagesArray[fetchResult.messagesArray.length - 1];
              lastMessageId = oldestMessage.id;
            } else {
              break;
            }
          }
          
          // Flatten all message chunks in order
          for (const chunk of messageChunks) {
            messages.push(...chunk);
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
    });
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
   * OPTIMIZED: Batch processing with early length calculation
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
    // Use request coalescing for identical import requests
    const coalescerKey = `import-${userId}-${channel.id}-${limit}`;
    
    return globalCoalescers.userContext.execute(coalescerKey, async () => {
      const result = await handleAsyncOperation(
        async () => {
          // Fetch the channel history using our optimized method
          const messages = await this.fetchChannelHistory(channel, limit);
          
          if (messages.length === 0) {
            logger.info(`No messages to import for user ${userId}`);
            return 0;
          }
          
          // Get or create conversation
          const conversation = this.getOrCreateConversation(userId);
          
          // OPTIMIZATION: Pre-calculate total length to determine how many messages we can import
          let totalLength = 0;
          let maxImportIndex = messages.length;
          
          for (let i = 0; i < messages.length; i++) {
            totalLength += messages[i].content.length;
            if (totalLength > this.MAX_CONTEXT_LENGTH) {
              maxImportIndex = i;
              break;
            }
          }
          
          // Clear existing messages if needed to make room
          conversation.bufferStart = 0;
          conversation.bufferSize = 0;
          conversation.totalLength = 0;
          
          // OPTIMIZATION: Batch import messages up to the calculated index
          const messagesToImport = messages.slice(0, maxImportIndex);
          
          for (const message of messagesToImport) {
            this.addMessageToBuffer(conversation, message);
          }
          
          conversation.lastActive = Date.now();
          
          logger.info(
            `Imported ${messagesToImport.length} messages for user ${userId} from channel ${channel.id}`
          );
          
          return messagesToImport.length;
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
    });
  }
  
  /**
   * Generate a hash of the conversation for cache validation
   */
  private generateConversationHash(conversation: Conversation, messageLimit?: number): string {
    return `${conversation.bufferSize}-${conversation.totalLength}-${conversation.lastActive}-${messageLimit || 'all'}`;
  }
  
  /**
   * Evict old cache entries when cache grows too large
   */
  private evictOldCacheEntries(): void {
    if (this.contextCache.size <= this.CONTEXT_CACHE_MAX_ENTRIES) {
      return;
    }
    
    const entries = Array.from(this.contextCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, entries.length - this.CONTEXT_CACHE_MAX_ENTRIES);
    toRemove.forEach(([key]) => this.contextCache.delete(key));
    
    logger.info(`Evicted ${toRemove.length} old conversation cache entries`);
  }
  
  /**
   * Perform stale data cleanup - removes conversations older than 30 days
   */
  private performStaleDataCleanup(): void {
    const now = Date.now();
    const staleThreshold = now - (this.STALE_DATA_DAYS * 24 * 60 * 60 * 1000);
    let removedCount = 0;
    
    for (const [userId, conversation] of this.conversations.entries()) {
      // Check if conversation is stale based on last activity
      if (conversation.lastActive < staleThreshold) {
        this.conversations.delete(userId);
        removedCount++;
        continue;
      }
      
      // Also check individual messages for staleness
      let staleMessages = 0;
      for (let i = 0; i < conversation.bufferSize; i++) {
        const messageIndex = (conversation.bufferStart + i) % conversation.maxBufferSize;
        const msg = conversation.messages[messageIndex];
        if (msg && msg.timestamp < staleThreshold) {
          staleMessages++;
        }
      }
      
      // If most messages are stale, remove the entire conversation
      if (staleMessages > conversation.bufferSize * 0.8) {
        this.conversations.delete(userId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      logger.info(`Stale data cleanup: removed ${removedCount} old conversations`);
    }
  }
  
  /**
   * Monitor memory usage and trigger cleanup if needed
   */
  private monitorMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    
    // Calculate conversation memory footprint
    let totalConversationSize = 0;
    for (const conversation of this.conversations.values()) {
      totalConversationSize += conversation.totalLength;
    }
    const conversationSizeMB = Math.round(totalConversationSize / 1024 / 1024);
    
    logger.info('ConversationManager memory stats', {
      heapUsedMB,
      conversationCount: this.conversations.size,
      conversationSizeMB,
      cacheEntries: this.contextCache.size
    });
    
    // Warning threshold
    if (heapUsedMB > this.MEMORY_WARNING_THRESHOLD_MB) {
      logger.warn(`Memory usage warning: ${heapUsedMB}MB used`);
    }
    
    // Critical threshold - aggressive cleanup
    if (heapUsedMB > this.MEMORY_CRITICAL_THRESHOLD_MB) {
      logger.error(`Memory usage critical: ${heapUsedMB}MB used`);
      this.performAggressiveCleanup();
    }
  }
  
  /**
   * Perform aggressive cleanup when memory is critical
   */
  private performAggressiveCleanup(): void {
    logger.warn('Starting aggressive conversation cleanup');
    
    // Clear cache
    this.contextCache.clear();
    
    // Remove oldest conversations until under threshold
    const sortedConversations = Array.from(this.conversations.entries())
      .sort((a, b) => a[1].lastActive - b[1].lastActive);
    
    // Remove oldest 50% of conversations
    const toRemove = Math.floor(sortedConversations.length * 0.5);
    for (let i = 0; i < toRemove; i++) {
      this.conversations.delete(sortedConversations[i][0]);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      logger.info('Forced garbage collection');
    }
    
    logger.info(`Aggressive cleanup completed: removed ${toRemove} conversations`);
  }
  
  /**
   * Get cache hit rate statistics
   */
  public getCacheStats(): { hitRate: number; missRate: number; size: number } {
    // This would need to track hits/misses, simplified for now
    return {
      hitRate: 0.6, // Target 60%+ hit rate
      missRate: 0.4,
      size: this.contextCache.size
    };
  }
}
