import { logger } from '../utils/logger';
import { BaseService } from './base/BaseService';
import type { IService } from './interfaces';

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
  buildConversationContext(userId: string): string;
  clearUserConversation(userId: string): boolean;
  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
  };
  getActiveConversationCount(): number;
}

export class ConversationManager extends BaseService implements IConversationManager {
  private conversations: Map<string, Conversation>;
  private readonly SESSION_TIMEOUT_MS: number;
  private readonly MAX_MESSAGES_PER_CONVERSATION: number;
  private readonly MAX_CONTEXT_LENGTH: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

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
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldConversations();
      },
      5 * 60 * 1000,
    );

    logger.info(
      `Timeout: ${this.SESSION_TIMEOUT_MS / 60000}min, Max messages: ${this.MAX_MESSAGES_PER_CONVERSATION}, Max context: ${this.MAX_CONTEXT_LENGTH} chars`,
    );
  }

  protected async performShutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.conversations.clear();
  }

  protected getHealthMetrics(): Record<string, unknown> {
    const activeConversations = this.conversations.size;
    const totalMessages = Array.from(this.conversations.values())
      .reduce((sum, conv) => sum + conv.bufferSize, 0);
    
    return {
      activeConversations,
      totalMessages,
      sessionTimeoutMs: this.SESSION_TIMEOUT_MS,
      maxMessagesPerConversation: this.MAX_MESSAGES_PER_CONVERSATION
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

  buildConversationContext(userId: string): string {
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
    for (let i = 0; i < conversation.bufferSize; i++) {
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
}