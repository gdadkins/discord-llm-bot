import { ILocalUserAnalyzer, LocalAnalysisResult } from '../../interfaces/AnalyticsInterfaces';

/**
 * Local User Analysis Utility
 * Performs client-side analysis of Discord user messages to minimize API calls
 * Only used for @user analysis commands, not general chat
 */

export interface ParsedMessage {
  content: string;
  timestamp: Date;
  hour: number;
  dayOfWeek: string;
  wordCount: number;
}

export class LocalUserAnalyzer implements ILocalUserAnalyzer {
  private readonly MIN_MESSAGES_FOR_ANALYSIS = 10;
  private readonly TECH_TERMS = new Set([
    'api', 'bug', 'code', 'database', 'debug', 'deploy', 'dev', 'error', 'function',
    'git', 'github', 'javascript', 'js', 'json', 'method', 'npm', 'programming',
    'python', 'react', 'server', 'sql', 'test', 'typescript', 'variable', 'web',
    'algorithm', 'backend', 'frontend', 'framework', 'library', 'async', 'sync',
    'class', 'object', 'array', 'string', 'number', 'boolean', 'null', 'undefined'
  ]);
  
  private readonly TOPIC_KEYWORDS = new Map<string, string[]>([
    ['gaming', ['game', 'play', 'fps', 'rpg', 'mmo', 'steam', 'xbox', 'playstation', 'nintendo', 'twitch']],
    ['programming', ['code', 'coding', 'program', 'developer', 'software', 'app', 'build', 'compile']],
    ['music', ['song', 'music', 'album', 'artist', 'spotify', 'playlist', 'concert', 'band']],
    ['food', ['eat', 'food', 'cook', 'recipe', 'restaurant', 'meal', 'dinner', 'lunch', 'breakfast']],
    ['sports', ['game', 'team', 'player', 'score', 'win', 'lose', 'championship', 'league']],
    ['movies', ['movie', 'film', 'watch', 'netflix', 'show', 'series', 'episode', 'season']],
    ['tech', ['computer', 'phone', 'laptop', 'device', 'hardware', 'software', 'update', 'install']],
    ['help', ['help', 'how', 'what', 'why', 'when', 'where', 'can', 'should', 'need', 'want']]
  ]);

  /**
   * Parse messages with timestamps
   */
  private parseMessages(messages: string[]): ParsedMessage[] {
    return messages.map(msg => {
      // Expected format: "[HH:MM:SS] message content"
      const match = msg.match(/\[(\d{1,2}:\d{2}:\d{2})\]\s*(.*)/);
      
      if (match) {
        const [, timeStr, content] = match;
        const [hours] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(hours);
        
        return {
          content,
          timestamp: date,
          hour: hours,
          dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' }),
          wordCount: content.split(/\s+/).filter(w => w.length > 0).length
        };
      }
      
      // Fallback if no timestamp
      return {
        content: msg,
        timestamp: new Date(),
        hour: new Date().getHours(),
        dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        wordCount: msg.split(/\s+/).filter(w => w.length > 0).length
      };
    });
  }

  /**
   * Analyze user messages locally to minimize API calls
   */
  analyzeUser(messages: string[]): LocalAnalysisResult {
    const parsedMessages = this.parseMessages(messages);
    
    // Basic stats
    const messageCount = parsedMessages.length;
    const timeRange = this.getTimeRange(parsedMessages);
    const avgMessageLength = this.calculateAvgMessageLength(parsedMessages);
    
    // Activity patterns
    const mostActiveHours = this.getMostActiveHours(parsedMessages);
    const mostActiveDays = this.getMostActiveDays(parsedMessages);
    
    // Content analysis
    const topWords = this.getTopWords(parsedMessages);
    const topEmojis = this.getTopEmojis(parsedMessages);
    const questionCount = this.countQuestions(parsedMessages);
    const exclamationCount = this.countExclamations(parsedMessages);
    const codeBlockCount = this.countCodeBlocks(messages);
    
    // Behavioral indicators
    const capsUsage = this.calculateCapsUsage(parsedMessages);
    const avgWordsPerMessage = this.calculateAvgWords(parsedMessages);
    const linkCount = this.countLinks(parsedMessages);
    const mentionCount = this.countMentions(parsedMessages);
    
    // Conversation style
    const shortMessageRatio = this.calculateShortMessageRatio(parsedMessages);
    const longMessageRatio = this.calculateLongMessageRatio(parsedMessages);
    
    // Interest signals
    const techTermFrequency = this.analyzeTechTerms(parsedMessages);
    const topicSignals = this.analyzeTopics(parsedMessages);
    
    // Determine if API analysis is needed
    const { required, reasons } = this.shouldUseApi({
      messageCount,
      avgWordsPerMessage,
      techTermFrequency,
      codeBlockCount,
      topicSignals
    });
    
    return {
      messageCount,
      timeRange,
      avgMessageLength,
      mostActiveHours,
      mostActiveDays,
      topWords,
      topEmojis,
      questionCount,
      exclamationCount,
      codeBlockCount,
      capsUsage,
      avgWordsPerMessage,
      linkCount,
      mentionCount,
      shortMessageRatio,
      longMessageRatio,
      techTermFrequency,
      topicSignals,
      requiresApiAnalysis: required,
      apiAnalysisReasons: reasons
    };
  }

  /**
   * Generate a roast-style summary from local analysis
   */
  generateLocalRoast(analysis: LocalAnalysisResult, username: string): string {
    const lines: string[] = [];
    
    lines.push(`Oh look, it's ${username}...`);
    
    // Message count roast
    if (analysis.messageCount > 100) {
      lines.push(`**Spam Level:** ${analysis.messageCount} fucking messages, someone needs a hobby`);
    } else if (analysis.messageCount < 20) {
      lines.push(`**Activity:** ${analysis.messageCount} messages? Even lurkers contribute more`);
    }
    
    // Activity time roast
    if (analysis.mostActiveHours[0]?.hour >= 2 && analysis.mostActiveHours[0]?.hour <= 5) {
      lines.push(`**Peak Hours:** ${analysis.mostActiveHours[0].hour}:00 - go to fucking bed`);
    } else if (analysis.mostActiveHours[0]?.hour >= 9 && analysis.mostActiveHours[0]?.hour <= 17) {
      lines.push(`**Peak Hours:** ${analysis.mostActiveHours[0].hour}:00 - shouldn't you be working?`);
    }
    
    // Topic-based roasts from local analysis
    const topTopics = Array.from(analysis.topicSignals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic);
    
    if (topTopics.length > 0) {
      const topicRoasts: Record<string, string> = {
        'gaming': 'still can\'t get past bronze rank',
        'programming': 'stack overflow\'s most frequent visitor',
        'help': 'can\'t figure out shit on their own',
        'food': 'personality is 90% what they ate',
        'tech': 'buying gadgets won\'t fix your problems'
      };
      
      const roastedTopics = topTopics.map(topic => 
        `${topic} (${topicRoasts[topic] || 'boring as fuck'})`
      );
      
      lines.push(`**Interests:** ${roastedTopics.join(', ')}`);
    }
    
    // Communication style from local metrics
    if (analysis.shortMessageRatio > 0.7) {
      lines.push(`**Style:** ${Math.round(analysis.shortMessageRatio * 100)}% short messages - communicate like a caveman`);
    } else if (analysis.longMessageRatio > 0.3) {
      lines.push('**Style:** Writes novels nobody asked for');
    }
    
    // Question frequency roast
    if (analysis.questionCount > analysis.messageCount * 0.3) {
      lines.push(`**Questions:** ${analysis.questionCount} - treats Discord like personal Google`);
    }
    
    // Caps usage roast
    if (analysis.capsUsage > 10) {
      lines.push(`**CAPS USAGE:** ${Math.round(analysis.capsUsage)}% - WE CAN HEAR YOU FINE`);
    }
    
    return lines.join('\n');
  }

  /**
   * Extract messages that need API analysis
   */
  getInterestingMessages(messages: string[]): string[] {
    const parsed = this.parseMessages(messages);
    
    // Get samples of different types
    // Long messages (might have complex content)
    const longMessages = parsed
      .filter(m => m.wordCount > 50)
      .slice(0, 10)
      .map(m => `[${m.timestamp.toLocaleTimeString()}] ${m.content}`);
    
    // Messages with code
    const codeMessages = messages
      .filter(m => m.includes('```') || m.includes('function') || m.includes('class'))
      .slice(0, 10);
    
    // Messages with questions
    const questionMessages = parsed
      .filter(m => m.content.includes('?'))
      .slice(0, 10)
      .map(m => `[${m.timestamp.toLocaleTimeString()}] ${m.content}`);
    
    // High tech term density messages
    const techMessages = parsed
      .filter(m => {
        const words = m.content.toLowerCase().split(/\s+/);
        const techCount = words.filter(w => this.TECH_TERMS.has(w)).length;
        return techCount > 2;
      })
      .slice(0, 10)
      .map(m => `[${m.timestamp.toLocaleTimeString()}] ${m.content}`);
    
    return [...longMessages, ...codeMessages, ...questionMessages, ...techMessages];
  }

  // === Private helper methods ===

  private getTimeRange(messages: ParsedMessage[]): { start: Date; end: Date } {
    if (messages.length === 0) {
      const now = new Date();
      return { start: now, end: now };
    }
    
    const timestamps = messages.map(m => m.timestamp.getTime());
    return {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps))
    };
  }

  private calculateAvgMessageLength(messages: ParsedMessage[]): number {
    if (messages.length === 0) return 0;
    const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.round(totalLength / messages.length);
  }

  private getMostActiveHours(messages: ParsedMessage[]): Array<{ hour: number; count: number }> {
    const hourCounts = new Map<number, number>();
    
    messages.forEach(m => {
      hourCounts.set(m.hour, (hourCounts.get(m.hour) || 0) + 1);
    });
    
    return Array.from(hourCounts.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  private getMostActiveDays(messages: ParsedMessage[]): Array<{ day: string; count: number }> {
    const dayCounts = new Map<string, number>();
    
    messages.forEach(m => {
      dayCounts.set(m.dayOfWeek, (dayCounts.get(m.dayOfWeek) || 0) + 1);
    });
    
    return Array.from(dayCounts.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  private getTopWords(messages: ParsedMessage[]): Array<{ word: string; count: number }> {
    const wordCounts = new Map<string, number>();
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do',
      'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'i', 'you', 'we', 'they', 'he', 'she', 'it', 'this', 'that', 'with',
      'as', 'by', 'of', 'from', 'im', 'just', 'like', 'so', 'my', 'your'
    ]);
    
    messages.forEach(m => {
      const words = m.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        // Clean word and check validity
        const cleaned = word.replace(/[^a-z0-9]/g, '');
        if (cleaned.length > 3 && !stopWords.has(cleaned)) {
          wordCounts.set(cleaned, (wordCounts.get(cleaned) || 0) + 1);
        }
      });
    });
    
    return Array.from(wordCounts.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getTopEmojis(messages: ParsedMessage[]): Array<{ emoji: string; count: number }> {
    const emojiCounts = new Map<string, number>();
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    
    messages.forEach(m => {
      const emojis = m.content.match(emojiRegex) || [];
      emojis.forEach(emoji => {
        emojiCounts.set(emoji, (emojiCounts.get(emoji) || 0) + 1);
      });
    });
    
    return Array.from(emojiCounts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private countQuestions(messages: ParsedMessage[]): number {
    return messages.filter(m => m.content.includes('?')).length;
  }

  private countExclamations(messages: ParsedMessage[]): number {
    return messages.filter(m => m.content.includes('!')).length;
  }

  private countCodeBlocks(messages: string[]): number {
    return messages.filter(m => m.includes('```')).length;
  }

  private calculateCapsUsage(messages: ParsedMessage[]): number {
    let totalChars = 0;
    let capsChars = 0;
    
    messages.forEach(m => {
      const letters = m.content.replace(/[^a-zA-Z]/g, '');
      totalChars += letters.length;
      capsChars += (letters.match(/[A-Z]/g) || []).length;
    });
    
    return totalChars > 0 ? (capsChars / totalChars) * 100 : 0;
  }

  private calculateAvgWords(messages: ParsedMessage[]): number {
    if (messages.length === 0) return 0;
    const totalWords = messages.reduce((sum, m) => sum + m.wordCount, 0);
    return Math.round(totalWords / messages.length);
  }

  private countLinks(messages: ParsedMessage[]): number {
    const linkRegex = /https?:\/\/[^\s]+/g;
    return messages.reduce((count, m) => {
      const links = m.content.match(linkRegex) || [];
      return count + links.length;
    }, 0);
  }

  private countMentions(messages: ParsedMessage[]): number {
    const mentionRegex = /<@!?\d+>/g;
    return messages.reduce((count, m) => {
      const mentions = m.content.match(mentionRegex) || [];
      return count + mentions.length;
    }, 0);
  }

  private calculateShortMessageRatio(messages: ParsedMessage[]): number {
    if (messages.length === 0) return 0;
    const shortMessages = messages.filter(m => m.wordCount < 10).length;
    return shortMessages / messages.length;
  }

  private calculateLongMessageRatio(messages: ParsedMessage[]): number {
    if (messages.length === 0) return 0;
    const longMessages = messages.filter(m => m.wordCount > 50).length;
    return longMessages / messages.length;
  }

  private analyzeTechTerms(messages: ParsedMessage[]): Map<string, number> {
    const termCounts = new Map<string, number>();
    
    messages.forEach(m => {
      const words = m.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (this.TECH_TERMS.has(word)) {
          termCounts.set(word, (termCounts.get(word) || 0) + 1);
        }
      });
    });
    
    return termCounts;
  }

  private analyzeTopics(messages: ParsedMessage[]): Map<string, number> {
    const topicScores = new Map<string, number>();
    
    messages.forEach(m => {
      const msgLower = m.content.toLowerCase();
      
      this.TOPIC_KEYWORDS.forEach((keywords, topic) => {
        const score = keywords.filter(kw => msgLower.includes(kw)).length;
        if (score > 0) {
          topicScores.set(topic, (topicScores.get(topic) || 0) + score);
        }
      });
    });
    
    return topicScores;
  }

  private shouldUseApi(metrics: {
    messageCount: number;
    avgWordsPerMessage: number;
    techTermFrequency: Map<string, number>;
    codeBlockCount: number;
    topicSignals: Map<string, number>;
  }): { required: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    // Not enough data for meaningful analysis
    if (metrics.messageCount < this.MIN_MESSAGES_FOR_ANALYSIS) {
      return { required: false, reasons: ['Not enough messages for deep analysis'] };
    }
    
    // Complex technical discussions
    if (metrics.techTermFrequency.size > 10 || metrics.codeBlockCount > 5) {
      reasons.push('Complex technical content detected');
    }
    
    // Long-form messages that might have nuance
    if (metrics.avgWordsPerMessage > 30) {
      reasons.push('Long-form messages require deeper analysis');
    }
    
    // Diverse topics that need correlation
    if (metrics.topicSignals.size > 5) {
      reasons.push('Diverse topics need AI correlation');
    }
    
    // If user seems very active, do deeper analysis
    if (metrics.messageCount > 50) {
      reasons.push('High activity warrants detailed analysis');
    }
    
    return {
      required: reasons.length > 0,
      reasons
    };
  }
}