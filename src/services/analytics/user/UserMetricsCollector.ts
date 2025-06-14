/**
 * User Metrics Collector Module
 * 
 * Handles data collection, aggregation, and storage for user analysis.
 * Responsible for:
 * - Message fetching from Discord channels
 * - Message filtering and preprocessing
 * - Batch creation for API processing
 * - Metrics calculation and storage
 */

import type { Client, Message } from 'discord.js';
import type { UserAnalysisConfig } from '../../interfaces/UserAnalysisInterfaces';
import { MessageFetchError } from '../../interfaces/UserAnalysisInterfaces';
import { LocalUserAnalyzer, type LocalAnalysisResult } from '../../../utils/localUserAnalyzer';
import { logger } from '../../../utils/logger';

export interface MessageBatch {
  messages: string[];
  charCount: number;
  batchNumber: number;
}

export interface CollectionMetrics {
  totalMessages: number;
  filteredMessages: number;
  batchCount: number;
  totalChars: number;
  collectionTimeMs: number;
}

/**
 * Handles all data collection and aggregation for user analysis
 */
export class UserMetricsCollector {
  private localAnalyzer: LocalUserAnalyzer;
  private config: UserAnalysisConfig;

  constructor(config: UserAnalysisConfig) {
    this.localAnalyzer = new LocalUserAnalyzer();
    this.config = config;
  }

  /**
   * Fetches recent messages from a user in a channel
   */
  async fetchUserMessages(
    client: Client,
    channel: { id: string; messages: { fetch(options: { limit: number }): Promise<Map<string, Message>> } },
    targetUserId: string,
    limit?: number
  ): Promise<string[]> {
    const fetchLimit = limit || this.config.maxMessagesPerRequest;
    
    try {
      logger.debug(`Fetching messages for user ${targetUserId} from channel`, {
        channelId: channel.id,
        limit: fetchLimit
      });

      // Validate channel has messages property
      if (!channel || !('messages' in channel)) {
        throw new MessageFetchError('Channel does not support message fetching');
      }

      // Fetch recent messages from the channel
      const messages = await channel.messages.fetch({ limit: fetchLimit });
      
      // Filter messages from the target user and format them
      const userMessages = Array.from(messages.values())
        .filter((msg: Message) => msg.author.id === targetUserId)
        .sort((a: Message, b: Message) => a.createdTimestamp - b.createdTimestamp)
        .map((msg: Message) => {
          const timestamp = msg.createdAt.toLocaleTimeString();
          return `[${timestamp}] ${msg.content}`;
        })
        .filter((content: string) => content.trim().length > 0);

      logger.info(`Fetched ${userMessages.length} messages from ${messages.size} total messages`, {
        userId: targetUserId,
        channelId: channel.id
      });

      return userMessages;
    } catch (error) {
      logger.error('Error fetching user messages:', error);
      throw new MessageFetchError('Failed to fetch user messages', error as Error);
    }
  }

  /**
   * Performs local analysis on user messages
   */
  analyzeLocally(userMessages: string[]): LocalAnalysisResult {
    return this.localAnalyzer.analyzeUser(userMessages);
  }

  /**
   * Extracts interesting messages for API analysis
   */
  getInterestingMessages(userMessages: string[]): string[] {
    return this.localAnalyzer.getInterestingMessages(userMessages);
  }

  /**
   * Creates batches of messages for API processing
   */
  createMessageBatches(messages: string[]): MessageBatch[] {
    const batches: MessageBatch[] = [];
    let currentBatch: string[] = [];
    let currentBatchSize = 0;
    let batchNumber = 1;

    for (const msg of messages) {
      const msgLength = msg.length;
      
      if (currentBatchSize + msgLength > this.config.maxCharsPerBatch && currentBatch.length > 0) {
        batches.push({
          messages: currentBatch,
          charCount: currentBatchSize,
          batchNumber: batchNumber++
        });
        currentBatch = [];
        currentBatchSize = 0;
      }
      
      currentBatch.push(msg);
      currentBatchSize += msgLength;
    }

    if (currentBatch.length > 0) {
      batches.push({
        messages: currentBatch,
        charCount: currentBatchSize,
        batchNumber: batchNumber
      });
    }

    logger.debug('Created message batches', {
      totalBatches: batches.length,
      totalMessages: messages.length,
      avgMessagesPerBatch: messages.length / batches.length
    });

    return batches;
  }

  /**
   * Collects and calculates metrics for the collection process
   */
  calculateCollectionMetrics(
    totalMessages: string[],
    filteredMessages: string[],
    batches: MessageBatch[],
    startTime: number
  ): CollectionMetrics {
    const totalChars = totalMessages.reduce((sum, msg) => sum + msg.length, 0);
    
    return {
      totalMessages: totalMessages.length,
      filteredMessages: filteredMessages.length,
      batchCount: batches.length,
      totalChars,
      collectionTimeMs: Date.now() - startTime
    };
  }

  /**
   * Validates if there are enough messages for meaningful analysis
   */
  hasEnoughMessagesForAnalysis(messageCount: number): boolean {
    return messageCount >= this.config.minMessagesForApiAnalysis;
  }

  /**
   * Checks if a message contains summary keywords
   */
  isSummaryRequest(messageContent: string, mentionedUserIds: string[]): boolean {
    // Must have at least one mentioned user
    if (mentionedUserIds.length === 0) {
      return false;
    }

    // Check for summary keywords in the message content
    const lowerContent = messageContent.toLowerCase();
    return this.config.summaryKeywords.some(keyword => lowerContent.includes(keyword));
  }

  /**
   * Prepares messages for analysis by filtering and formatting
   */
  prepareMessagesForAnalysis(rawMessages: string[]): {
    allMessages: string[];
    interestingMessages: string[];
    metrics: {
      reductionPercent: number;
      interestingCount: number;
    };
  } {
    const allMessages = rawMessages.filter(msg => msg.trim().length > 0);
    const interestingMessages = this.getInterestingMessages(allMessages);
    
    const reductionPercent = allMessages.length > 0 
      ? Math.round((1 - interestingMessages.length / allMessages.length) * 100)
      : 0;
    
    return {
      allMessages,
      interestingMessages,
      metrics: {
        reductionPercent,
        interestingCount: interestingMessages.length
      }
    };
  }

  /**
   * Aggregates frequency data from multiple sources
   */
  aggregateFrequencyData<T extends string>(
    items: T[][],
    topN: number = 5
  ): Array<{ value: T; count: number }> {
    const frequencyMap = new Map<string, { original: T; count: number }>();
    
    items.forEach(itemList => {
      itemList.forEach(item => {
        const normalized = item.toLowerCase().trim();
        if (!frequencyMap.has(normalized)) {
          frequencyMap.set(normalized, { original: item, count: 1 });
        } else {
          const existing = frequencyMap.get(normalized)!;
          existing.count++;
        }
      });
    });
    
    return Array.from(frequencyMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, topN)
      .map(({ original, count }) => ({ value: original, count }));
  }
}