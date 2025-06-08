/**
 * Race Condition Manager
 * Handles concurrency control and typing indicator management
 */

import { Mutex } from 'async-mutex';
import { logger } from './logger';

interface TypingChannel {
  sendTyping(): Promise<void>;
}

export class RaceConditionManager {
  private messageMutex: Mutex;
  private interactionMutex: Mutex;
  private typingIntervals: Map<string, NodeJS.Timeout>;
  private processedMessages: Set<string>;
  private userProcessingLocks: Map<string, Mutex>;

  constructor() {
    this.messageMutex = new Mutex();
    this.interactionMutex = new Mutex();
    this.typingIntervals = new Map();
    this.processedMessages = new Set();
    this.userProcessingLocks = new Map();
  }

  /**
   * Get or create a mutex for a specific user
   */
  getUserMutex(userId: string): Mutex {
    if (!this.userProcessingLocks.has(userId)) {
      this.userProcessingLocks.set(userId, new Mutex());
    }
    return this.userProcessingLocks.get(userId)!;
  }

  /**
   * Check if a message has been processed
   */
  hasProcessedMessage(messageKey: string): boolean {
    return this.processedMessages.has(messageKey);
  }

  /**
   * Mark a message as processed
   */
  markMessageProcessed(messageKey: string): void {
    this.processedMessages.add(messageKey);
    
    // Clean up old processed messages (keep last 1000)
    if (this.processedMessages.size > 1000) {
      const entries = Array.from(this.processedMessages);
      for (let i = 0; i < 500; i++) {
        this.processedMessages.delete(entries[i]);
      }
    }
  }

  /**
   * Start typing indicator for a channel
   */
  startTyping(channelKey: string, channel: TypingChannel): void {
    // Clear any existing typing for this channel
    const existingInterval = this.typingIntervals.get(channelKey);
    if (existingInterval) {
      clearInterval(existingInterval);
    }
    
    // Start typing immediately
    channel.sendTyping().catch(err => 
      logger.debug('Failed to send initial typing indicator:', err)
    );
    
    // Set up recurring typing
    const interval = setInterval(() => {
      channel.sendTyping().catch(err => 
        logger.debug('Failed to send typing indicator:', err)
      );
    }, 5000);
    
    this.typingIntervals.set(channelKey, interval);
  }

  /**
   * Stop typing indicator for a channel
   */
  stopTyping(channelKey: string): void {
    const interval = this.typingIntervals.get(channelKey);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(channelKey);
    }
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    // Clear all typing intervals
    for (const [channelId, interval] of this.typingIntervals) {
      clearInterval(interval);
      logger.debug(`Cleared typing interval for channel: ${channelId}`);
    }
    this.typingIntervals.clear();
    
    // Clear processed messages cache
    this.processedMessages.clear();
    
    // Clear user processing locks
    this.userProcessingLocks.clear();
    
    logger.info('Race condition resources cleaned up');
  }

  /**
   * Get message mutex
   */
  getMessageMutex(): Mutex {
    return this.messageMutex;
  }

  /**
   * Get interaction mutex
   */
  getInteractionMutex(): Mutex {
    return this.interactionMutex;
  }
}