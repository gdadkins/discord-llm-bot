/**
 * @file ConversationContextBuilder - Builds conversation-specific context
 * @module services/context/ConversationContextBuilder
 * 
 * Handles the construction of conversation context including message history,
 * formatting, and relevance scoring for optimal AI context generation.
 */

import { logger } from '../../utils/logger';
import { RichContext, ContextItem } from './types';
import { ConversationMemoryService } from './ConversationMemoryService';
import { MemoryOptimizationService } from './MemoryOptimizationService';

export interface ConversationContextOptions {
  maxMessages?: number;
  includeCodeContext?: boolean;
  relevanceThreshold?: number;
  timeWindow?: number; // hours
}

/**
 * Specialized builder for conversation-specific context
 * 
 * This builder is responsible for:
 * - Extracting relevant conversation history
 * - Formatting messages for AI consumption
 * - Applying relevance scoring to prioritize content
 * - Managing conversation flow and continuity
 */
export class ConversationContextBuilder {
  private readonly DEFAULT_MAX_MESSAGES = 10;
  private readonly DEFAULT_RELEVANCE_THRESHOLD = 0.5;
  private readonly DEFAULT_TIME_WINDOW = 24; // hours
  
  private conversationMemoryService: ConversationMemoryService;
  private memoryOptimizationService: MemoryOptimizationService;

  constructor(
    conversationMemoryService: ConversationMemoryService,
    memoryOptimizationService: MemoryOptimizationService
  ) {
    this.conversationMemoryService = conversationMemoryService;
    this.memoryOptimizationService = memoryOptimizationService;
  }

  /**
   * Build conversation context for a specific user
   */
  public buildConversationContext(
    context: RichContext,
    userId: string,
    options: ConversationContextOptions = {}
  ): string {
    const parts: string[] = [];
    const now = Date.now();
    
    // Apply default options
    const maxMessages = options.maxMessages || this.DEFAULT_MAX_MESSAGES;
    const relevanceThreshold = options.relevanceThreshold || this.DEFAULT_RELEVANCE_THRESHOLD;
    const timeWindow = options.timeWindow || this.DEFAULT_TIME_WINDOW;
    const timeWindowMs = timeWindow * 60 * 60 * 1000;

    // Add conversation history
    const conversations = context.conversations.get(userId);
    if (conversations && conversations.length > 0) {
      parts.push('RECENT CONVERSATIONS:\n');
      
      // Filter and sort conversations by recency
      const recentConversations = conversations
        .filter(msg => this.isWithinTimeWindow(msg, now, timeWindowMs))
        .slice(-maxMessages);
      
      recentConversations.forEach(msg => {
        parts.push(`- ${msg}\n`);
      });
      
      parts.push('\n');
    }

    // Add relevant code snippets if requested
    if (options.includeCodeContext) {
      const codeContext = this.buildCodeContext(context, userId, relevanceThreshold);
      if (codeContext) {
        parts.push(codeContext);
      }
    }

    // Add summarized conversation facts
    const conversationFacts = this.buildConversationFacts(context, userId, relevanceThreshold);
    if (conversationFacts) {
      parts.push(conversationFacts);
    }

    return parts.join('');
  }

  /**
   * Build formatted message history
   */
  public buildMessageHistory(
    messages: string[],
    maxLength: number = 1000
  ): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    const parts: string[] = ['MESSAGE HISTORY:\n'];
    let totalLength = parts[0].length;
    
    // Process messages in reverse order (most recent first)
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const formattedMessage = this.formatMessage(message);
      
      if (totalLength + formattedMessage.length > maxLength) {
        break;
      }
      
      parts.push(formattedMessage);
      totalLength += formattedMessage.length;
    }
    
    parts.push('\n');
    return parts.join('');
  }

  /**
   * Calculate relevance score for conversation items
   */
  public calculateRelevanceScore(
    item: ContextItem,
    currentContext: string,
    userId: string
  ): number {
    let score = 0;
    
    // Time-based relevance (exponential decay)
    const ageInHours = (Date.now() - item.timestamp) / (1000 * 60 * 60);
    const timeScore = Math.exp(-ageInHours / 168); // Decay over a week
    score += timeScore * 0.3;
    
    // Access frequency relevance
    const accessScore = Math.min(item.accessCount / 10, 1);
    score += accessScore * 0.2;
    
    // User-specific relevance
    if (item.content.includes(userId)) {
      score += 0.3;
    }
    
    // Context similarity relevance
    const contextScore = this.calculateContextSimilarity(item.content, currentContext);
    score += contextScore * 0.2;
    
    return Math.min(score, 1);
  }

  /**
   * Format conversation messages for optimal AI understanding
   */
  public formatConversationContext(
    userId: string,
    messages: string[],
    includeMetadata: boolean = false
  ): string {
    const parts: string[] = [];
    
    parts.push(`=== Conversation Context for User ${userId} ===\n\n`);
    
    if (messages.length === 0) {
      parts.push('No recent conversation history available.\n');
      return parts.join('');
    }
    
    // Group messages by conversation flow
    const conversationFlows = this.groupMessagesByFlow(messages);
    
    conversationFlows.forEach((flow, index) => {
      parts.push(`Conversation Flow ${index + 1}:\n`);
      
      flow.forEach(message => {
        const formatted = this.formatMessage(message, includeMetadata);
        parts.push(formatted);
      });
      
      parts.push('\n');
    });
    
    return parts.join('');
  }

  /**
   * Extract key topics from conversation history
   */
  public extractConversationTopics(
    messages: string[],
    maxTopics: number = 5
  ): string[] {
    const topicCounts = new Map<string, number>();
    
    // Simple keyword extraction (could be enhanced with NLP)
    messages.forEach(message => {
      const words = message.toLowerCase().split(/\s+/);
      const keywords = words.filter(word => 
        word.length > 4 && 
        !this.isCommonWord(word)
      );
      
      keywords.forEach(keyword => {
        topicCounts.set(keyword, (topicCounts.get(keyword) || 0) + 1);
      });
    });
    
    // Sort by frequency and return top topics
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTopics)
      .map(([topic]) => topic);
  }

  // ========== PRIVATE HELPER METHODS ==========

  private isWithinTimeWindow(
    message: string,
    now: number,
    timeWindowMs: number
  ): boolean {
    // Extract timestamp from message if available
    const timestampMatch = message.match(/\[(\d+)\]/);
    if (timestampMatch) {
      const messageTime = parseInt(timestampMatch[1]);
      return (now - messageTime) <= timeWindowMs;
    }
    
    // Assume recent if no timestamp
    return true;
  }

  private buildCodeContext(
    context: RichContext,
    userId: string,
    relevanceThreshold: number
  ): string {
    const userCode = context.codeSnippets.get(userId);
    if (!userCode || userCode.length === 0) {
      return '';
    }
    
    const parts: string[] = ['RELEVANT CODE CONTEXT:\n'];
    
    const relevantCode = userCode
      .filter(snippet => (snippet.relevanceScore || 0) >= relevanceThreshold)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3);
    
    relevantCode.forEach(snippet => {
      parts.push(`Code from ${new Date(snippet.timestamp).toLocaleDateString()}:\n`);
      parts.push(`${snippet.content}\n---\n`);
    });
    
    parts.push('\n');
    return parts.join('');
  }

  private buildConversationFacts(
    context: RichContext,
    userId: string,
    relevanceThreshold: number
  ): string {
    const relevantFacts = context.summarizedFacts
      .filter(fact => 
        fact.content.includes(userId) && 
        (fact.relevanceScore || 0) >= relevanceThreshold
      )
      .slice(0, 5);
    
    if (relevantFacts.length === 0) {
      return '';
    }
    
    const parts: string[] = ['CONVERSATION INSIGHTS:\n'];
    
    relevantFacts.forEach(fact => {
      parts.push(`- ${fact.content}\n`);
    });
    
    parts.push('\n');
    return parts.join('');
  }

  private formatMessage(message: string, includeMetadata: boolean = false): string {
    if (includeMetadata) {
      // Extract and format metadata if present
      const timestampMatch = message.match(/\[(\d+)\]/);
      if (timestampMatch) {
        const timestamp = new Date(parseInt(timestampMatch[1]));
        const cleanMessage = message.replace(/\[\d+\]/, '').trim();
        return `[${timestamp.toLocaleString()}] ${cleanMessage}\n`;
      }
    }
    
    // Remove metadata for clean formatting
    const cleanMessage = message.replace(/\[\d+\]/, '').trim();
    return `- ${cleanMessage}\n`;
  }

  private calculateContextSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private groupMessagesByFlow(messages: string[]): string[][] {
    const flows: string[][] = [];
    let currentFlow: string[] = [];
    
    messages.forEach((message, index) => {
      currentFlow.push(message);
      
      // Simple flow detection - could be enhanced
      if (index === messages.length - 1 || this.isFlowBreak(message, messages[index + 1])) {
        flows.push([...currentFlow]);
        currentFlow = [];
      }
    });
    
    return flows;
  }

  private isFlowBreak(message1: string, message2: string): boolean {
    // Simple heuristic - could be enhanced with better NLP
    const time1 = this.extractTimestamp(message1);
    const time2 = this.extractTimestamp(message2);
    
    if (time1 && time2) {
      const timeDiff = Math.abs(time2 - time1);
      return timeDiff > 3600000; // 1 hour gap
    }
    
    return false;
  }

  private extractTimestamp(message: string): number | null {
    const match = message.match(/\[(\d+)\]/);
    return match ? parseInt(match[1]) : null;
  }

  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have',
      'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you',
      'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they',
      'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one',
      'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out',
      'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when'
    ]);
    
    return commonWords.has(word);
  }
}