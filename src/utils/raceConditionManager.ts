/**
 * Race Condition Manager
 * Handles concurrency control and typing indicator management
 */

import { Mutex } from 'async-mutex';
import { logger } from './logger';

interface TypingChannel {
  sendTyping(): Promise<void>;
}

interface ProcessedMessage {
  timestamp: number;
  messageId: string;
}

export class RaceConditionManager {
  private messageMutex: Mutex;
  private interactionMutex: Mutex;
  private typingIntervals: Map<string, NodeJS.Timeout>;
  private processedMessages: Set<string>;
  private processedMessageDetails: Map<string, ProcessedMessage>;
  private userProcessingLocks: Map<string, Mutex>;
  private messageObjectCache: WeakSet<object>;

  constructor() {
    this.messageMutex = new Mutex();
    this.interactionMutex = new Mutex();
    this.typingIntervals = new Map();
    this.processedMessages = new Set();
    this.processedMessageDetails = new Map();
    this.userProcessingLocks = new Map();
    this.messageObjectCache = new WeakSet();
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
   * Check if a message object has been processed (using WeakSet)
   */
  hasProcessedMessageObject(message: object): boolean {
    return this.messageObjectCache.has(message);
  }

  /**
   * Mark a message object as processed
   */
  markMessageObjectProcessed(message: object): void {
    this.messageObjectCache.add(message);
  }

  /**
   * Check if a message has been processed
   */
  hasProcessedMessage(messageKey: string): boolean {
    // Check if we've seen this exact key
    if (this.processedMessages.has(messageKey)) {
      return true;
    }
    
    // Check for timestamp-based duplicates (within 5 seconds)
    const parts = messageKey.split('-');
    const messageId = parts[0];
    const now = Date.now();
    
    for (const [, details] of this.processedMessageDetails) {
      if (details.messageId === messageId && (now - details.timestamp) < 5000) {
        logger.warn(`Duplicate message detected by timestamp check: ${messageId} within 5 seconds`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Mark a message as processed
   */
  markMessageProcessed(messageKey: string): void {
    const parts = messageKey.split('-');
    const messageId = parts[0];
    
    this.processedMessages.add(messageKey);
    this.processedMessageDetails.set(messageKey, {
      messageId,
      timestamp: Date.now()
    });
    
    // Clean up old processed messages (keep last 1000)
    if (this.processedMessages.size > 1000) {
      const entries = Array.from(this.processedMessages);
      for (let i = 0; i < 500; i++) {
        const oldKey = entries[i];
        this.processedMessages.delete(oldKey);
        this.processedMessageDetails.delete(oldKey);
      }
    }
    
    // Clean up old timestamp entries (older than 1 minute)
    const cutoff = Date.now() - 60000;
    for (const [key, details] of this.processedMessageDetails) {
      if (details.timestamp < cutoff) {
        this.processedMessageDetails.delete(key);
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
    this.processedMessageDetails.clear();
    
    // Clear user processing locks
    this.userProcessingLocks.clear();
    
    // Note: WeakSet (messageObjectCache) doesn't need explicit cleanup
    
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