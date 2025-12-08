/**
 * Context Analyzer Utility
 * 
 * Demonstrates usage of the large context handler for analyzing conversation data.
 * This utility can extract patterns, summarize key topics, and identify important events
 * from large conversation histories.
 */

import { LargeContextHandler } from './largeContextHandler';
import { logger } from './logger';

export interface ConversationAnalysis {
  totalMessages: number;
  activeUsers: string[];
  keyTopics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  importantEvents: string[];
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface ConversationPattern {
  pattern: string;
  frequency: number;
  examples: string[];
}

export class ContextAnalyzer {
  private handler: LargeContextHandler;

  constructor() {
    this.handler = new LargeContextHandler({
      maxChunkSize: 20000, // Larger chunks for analysis
      tempDir: 'temp/analysis',
      cleanupDelay: 10000, // Longer cleanup delay for analysis
    });
  }

  /**
   * Initializes the context analyzer
   */
  async initialize(): Promise<void> {
    await this.handler.initialize();
    logger.info('ContextAnalyzer initialized');
  }

  /**
   * Analyzes large conversation data to extract key insights
   * @param conversationData Raw conversation data (string or object)
   * @returns Analysis results with key metrics and insights
   */
  async analyzeConversation(conversationData: string | object): Promise<ConversationAnalysis> {
    logger.info('Starting conversation analysis');
    
    const analysis: ConversationAnalysis = {
      totalMessages: 0,
      activeUsers: [],
      keyTopics: [],
      sentiment: 'neutral',
      importantEvents: [],
      timeRange: {
        start: new Date(),
        end: new Date()
      }
    };

    try {
      // Extract detailed information from each chunk
      const chunkAnalyses = await this.handler.extractFromLargeContext(
        conversationData,
        async (chunk: string) => {
          return this.analyzeChunk(chunk);
        }
      );

      // Combine results from all chunks
      analysis.totalMessages = chunkAnalyses.reduce((sum, chunk) => sum + chunk.messageCount, 0);
      
      // Merge unique users
      const allUsers = new Set<string>();
      chunkAnalyses.forEach(chunk => {
        chunk.users.forEach(user => allUsers.add(user));
      });
      analysis.activeUsers = Array.from(allUsers);

      // Combine topics (and deduplicate)
      const allTopics = new Set<string>();
      chunkAnalyses.forEach(chunk => {
        chunk.topics.forEach(topic => allTopics.add(topic));
      });
      analysis.keyTopics = Array.from(allTopics).slice(0, 10); // Top 10 topics

      // Aggregate sentiment
      const sentiments = chunkAnalyses.map(chunk => chunk.sentiment);
      analysis.sentiment = this.aggregateSentiment(sentiments);

      // Collect important events
      analysis.importantEvents = chunkAnalyses
        .flatMap(chunk => chunk.events)
        .slice(0, 20); // Top 20 events

      // Determine time range
      const dates = chunkAnalyses
        .flatMap(chunk => chunk.timestamps)
        .filter(date => date)
        .sort();
      
      if (dates.length > 0) {
        analysis.timeRange.start = dates[0];
        analysis.timeRange.end = dates[dates.length - 1];
      }

      logger.info('Conversation analysis complete', {
        totalMessages: analysis.totalMessages,
        activeUsers: analysis.activeUsers.length,
        keyTopics: analysis.keyTopics.length
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze conversation', { error });
      throw error;
    }
  }

  /**
   * Finds patterns in large conversation data
   * @param conversationData Raw conversation data
   * @returns Array of identified patterns with frequency
   */
  async findPatterns(conversationData: string | object): Promise<ConversationPattern[]> {
    logger.info('Starting pattern analysis');

    const patternCounts = new Map<string, { count: number; examples: string[] }>();

    await this.handler.processLargeContext(
      conversationData,
      async (chunk: string, index: number) => {
        const chunkPatterns = this.extractPatterns(chunk);
        
        chunkPatterns.forEach(pattern => {
          const existing = patternCounts.get(pattern.pattern);
          if (existing) {
            existing.count += pattern.frequency;
            existing.examples.push(...pattern.examples.slice(0, 2)); // Add a few examples
          } else {
            patternCounts.set(pattern.pattern, {
              count: pattern.frequency,
              examples: pattern.examples.slice(0, 2)
            });
          }
        });

        return `Chunk ${index + 1} processed`;
      }
    );

    // Convert to sorted array
    const patterns: ConversationPattern[] = Array.from(patternCounts.entries())
      .map(([pattern, data]) => ({
        pattern,
        frequency: data.count,
        examples: data.examples.slice(0, 3) // Keep top 3 examples
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 50); // Top 50 patterns

    logger.info(`Found ${patterns.length} conversation patterns`);
    return patterns;
  }

  /**
   * Summarizes conversation themes from large data
   * @param conversationData Raw conversation data
   * @returns Thematic summary of the conversation
   */
  async summarizeThemes(conversationData: string | object): Promise<string> {
    logger.info('Starting theme summarization');

    return await this.handler.summarizeLargeContext(
      conversationData,
      async (chunk: string) => {
        // Extract themes from this chunk
        const themes = this.extractThemes(chunk);
        return `Themes: ${themes.join(', ')}`;
      }
    );
  }

  /**
   * Analyzes a single chunk of conversation data
   */
  private analyzeChunk(chunk: string): {
    messageCount: number;
    users: string[];
    topics: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
    events: string[];
    timestamps: Date[];
  } {
    const lines = chunk.split('\n').filter(line => line.trim());
    const messageCount = lines.filter(line => line.includes(': ')).length;
    
    // Extract users (simplified pattern matching)
    const users = new Set<string>();
    const userPattern = /^(User|Assistant|\w+):/;
    lines.forEach(line => {
      const match = line.match(userPattern);
      if (match && match[1] !== 'User' && match[1] !== 'Assistant') {
        users.add(match[1]);
      }
    });

    // Extract basic topics (keywords)
    const topics = this.extractBasicTopics(chunk);
    
    // Basic sentiment analysis
    const sentiment = this.analyzeSentiment(chunk);
    
    // Extract events (messages with certain keywords)
    const events = this.extractEvents(chunk);
    
    // Extract timestamps (simplified)
    const timestamps = this.extractTimestamps(chunk);

    return {
      messageCount,
      users: Array.from(users),
      topics,
      sentiment,
      events,
      timestamps
    };
  }

  /**
   * Extracts basic topics from text
   */
  private extractBasicTopics(text: string): string[] {
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const topicWords = words.filter(word => 
      !['user', 'assistant', 'this', 'that', 'with', 'from', 'they', 'them', 'were', 'been', 'have', 'will'].includes(word)
    );
    
    // Count frequency and return top topics
    const wordCounts = new Map<string, number>();
    topicWords.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
    
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Basic sentiment analysis
   */
  private analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['good', 'great', 'awesome', 'love', 'like', 'happy', 'excellent', 'wonderful'];
    const negativeWords = ['bad', 'terrible', 'hate', 'dislike', 'awful', 'horrible', 'sad', 'angry'];
    
    const words = text.toLowerCase().split(/\W+/);
    let positiveCount = 0;
    let negativeCount = 0;
    
    words.forEach(word => {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Extracts important events from text
   */
  private extractEvents(text: string): string[] {
    const eventKeywords = ['joined', 'left', 'banned', 'promoted', 'demoted', 'created', 'deleted', 'updated'];
    const lines = text.split('\n');
    
    return lines
      .filter(line => eventKeywords.some(keyword => line.toLowerCase().includes(keyword)))
      .slice(0, 5);
  }

  /**
   * Extracts timestamps from text (simplified)
   */
  private extractTimestamps(text: string): Date[] {
    const datePattern = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g;
    const matches = text.match(datePattern) || [];
    
    return matches
      .map(match => new Date(match))
      .filter(date => !isNaN(date.getTime()));
  }

  /**
   * Extracts patterns from a chunk
   */
  private extractPatterns(chunk: string): ConversationPattern[] {
    const patterns: ConversationPattern[] = [];
    
    // Question patterns
    const questions = chunk.match(/\?[^\n]*/g) || [];
    if (questions.length > 0) {
      patterns.push({
        pattern: 'Questions',
        frequency: questions.length,
        examples: questions.slice(0, 3)
      });
    }
    
    // Mention patterns
    const mentions = chunk.match(/@\w+/g) || [];
    if (mentions.length > 0) {
      patterns.push({
        pattern: 'User Mentions',
        frequency: mentions.length,
        examples: mentions.slice(0, 3)
      });
    }
    
    // URL patterns
    const urls = chunk.match(/https?:\/\/[^\s]+/g) || [];
    if (urls.length > 0) {
      patterns.push({
        pattern: 'URLs Shared',
        frequency: urls.length,
        examples: urls.slice(0, 3)
      });
    }
    
    return patterns;
  }

  /**
   * Extracts themes from text
   */
  private extractThemes(text: string): string[] {
    // Simplified theme extraction based on word clusters
    const themes = [];
    
    if (text.toLowerCase().includes('game') || text.toLowerCase().includes('play')) {
      themes.push('Gaming');
    }
    if (text.toLowerCase().includes('music') || text.toLowerCase().includes('song')) {
      themes.push('Music');
    }
    if (text.toLowerCase().includes('code') || text.toLowerCase().includes('program')) {
      themes.push('Programming');
    }
    if (text.toLowerCase().includes('help') || text.toLowerCase().includes('support')) {
      themes.push('Support');
    }
    
    return themes;
  }

  /**
   * Aggregates sentiment from multiple chunks
   */
  private aggregateSentiment(sentiments: Array<'positive' | 'neutral' | 'negative'>): 'positive' | 'neutral' | 'negative' {
    const counts = { positive: 0, neutral: 0, negative: 0 };
    
    sentiments.forEach(sentiment => {
      counts[sentiment]++;
    });
    
    if (counts.positive > counts.negative && counts.positive > counts.neutral) {
      return 'positive';
    }
    if (counts.negative > counts.positive && counts.negative > counts.neutral) {
      return 'negative';
    }
    return 'neutral';
  }

  /**
   * Gets statistics about the analyzer's temporary file usage
   */
  async getStats() {
    return await this.handler.getStats();
  }

  /**
   * Cleans up analyzer resources
   */
  async cleanup(): Promise<void> {
    await this.handler.cleanupAll();
    logger.info('ContextAnalyzer cleanup complete');
  }
}

// Export singleton for convenience
export const contextAnalyzer = new ContextAnalyzer();