/**
 * Conversation Management Service Interface Definitions
 * 
 * Interfaces for managing user conversations and message history.
 */

import type { IService } from './CoreServiceInterfaces';
import type { TextChannel } from 'discord.js';

// ============================================================================
// Conversation Management Service Interfaces
// ============================================================================

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Conversation {
  messages: Message[];
  lastActive: number;
  // Circular buffer optimization fields
  bufferStart: number;
  bufferSize: number;
  totalLength: number;
  maxBufferSize: number;
}

export interface IConversationManager extends IService {
  /**
   * Gets or creates a conversation for a user
   */
  getOrCreateConversation(userId: string): Conversation;
  
  /**
   * Adds a message exchange to the conversation
   */
  addToConversation(userId: string, userMessage: string, assistantResponse: string): void;
  
  /**
   * Builds conversation context for a user
   */
  buildConversationContext(userId: string, messageLimit?: number): string;
  
  /**
   * Clears conversation for a user
   */
  clearUserConversation(userId: string): boolean;
  
  /**
   * Gets conversation statistics
   */
  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
  };
  
  /**
   * Gets active conversation count
   */
  getActiveConversationCount(): number;
  
  /**
   * Fetches message history from a Discord channel
   */
  fetchChannelHistory(
    channel: TextChannel, 
    limit?: number, 
    beforeMessageId?: string
  ): Promise<Message[]>;
  
  /**
   * Imports channel history into a user's conversation
   */
  importChannelHistory(
    userId: string, 
    channel: TextChannel, 
    limit?: number
  ): Promise<number>;
}