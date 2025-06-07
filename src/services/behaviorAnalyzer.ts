/**
 * Behavioral Pattern Recognition Service
 * 
 * Analyzes user messaging patterns to understand behavior and preferences.
 * Features keyword-based topic extraction, programming language detection,
 * and complexity scoring with 1-year cache TTL for long-term behavioral insights.
 */

import { logger } from '../utils/logger';

export interface UserBehaviorPattern {
  userId: string;
  messageFrequency: number; // messages per hour
  favoriteTopics: string[];
  detectedLanguages: string[];
  commonMistakes: string[];
  complexityScore: number; // 0-10
  roastResistance: number; // 0-10
  lastUpdated: number;
  messageTimestamps: number[]; // Track recent message times for frequency calculation
}

export class BehaviorAnalyzer {
  private patterns: Map<string, UserBehaviorPattern> = new Map();
  private readonly CACHE_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year (behavioral patterns are valuable long-term insights, ~10 users = negligible storage)
  private readonly MAX_TIMESTAMPS = 100; // Keep last 100 message timestamps per user
  private readonly MAX_TOPICS = 10; // Maximum topics to track per user
  private readonly MAX_LANGUAGES = 5; // Maximum programming languages to track per user
  private readonly MAX_MISTAKES = 15; // Maximum common mistakes to track per user

  /**
   * Analyze a message and update user behavioral patterns
   */
  async analyzeMessage(userId: string, message: string): Promise<void> {
    try {
      const pattern = this.patterns.get(userId) || this.createNewPattern(userId);
      const now = Date.now();
      
      // Update message timestamps for frequency calculation
      pattern.messageTimestamps.push(now);
      
      // Trim old timestamps (keep only last 24 hours)
      const dayAgo = now - (24 * 60 * 60 * 1000);
      pattern.messageTimestamps = pattern.messageTimestamps.filter(ts => ts > dayAgo);
      
      // Trim to max timestamps
      if (pattern.messageTimestamps.length > this.MAX_TIMESTAMPS) {
        pattern.messageTimestamps = pattern.messageTimestamps.slice(-this.MAX_TIMESTAMPS);
      }
      
      // Update message frequency (messages per hour over last 24h)
      pattern.messageFrequency = this.calculateMessageRate(pattern.messageTimestamps);
      
      // Extract topics using keyword detection
      pattern.favoriteTopics = this.extractTopics(message, pattern.favoriteTopics);
      
      // Detect programming languages
      const languages = this.detectProgrammingLanguages(message);
      if (languages.length > 0) {
        pattern.detectedLanguages = this.mergeLanguages(pattern.detectedLanguages, languages);
      }
      
      // Update complexity score based on message length and vocabulary
      pattern.complexityScore = this.updateComplexityScore(pattern.complexityScore, message);
      
      // Detect common mistakes
      const mistakes = this.detectCommonMistakes(message);
      if (mistakes.length > 0) {
        pattern.commonMistakes = this.mergeMistakes(pattern.commonMistakes, mistakes);
      }
      
      // Update roast resistance based on message patterns
      pattern.roastResistance = this.updateRoastResistance(pattern.roastResistance, message);
      
      pattern.lastUpdated = now;
      this.patterns.set(userId, pattern);
      
      logger.debug(`Behavior pattern updated for user ${userId}`, {
        messageFrequency: pattern.messageFrequency,
        topicsCount: pattern.favoriteTopics.length,
        languagesCount: pattern.detectedLanguages.length,
        complexityScore: pattern.complexityScore
      });
      
    } catch (error) {
      logger.error('Error analyzing message for behavioral patterns:', error);
    }
  }

  /**
   * Get behavioral pattern for a user
   */
  getBehaviorPattern(userId: string): UserBehaviorPattern | null {
    const pattern = this.patterns.get(userId);
    
    if (!pattern) {
      return null;
    }
    
    // Check if pattern is expired
    const now = Date.now();
    if (now - pattern.lastUpdated > this.CACHE_TTL) {
      // Pattern is stale but don't delete - just mark as outdated
      logger.debug(`Behavior pattern for user ${userId} is stale (${Math.floor((now - pattern.lastUpdated) / 60000)} minutes old)`);
    }
    
    return { ...pattern }; // Return a copy to prevent external modification
  }

  /**
   * Get behavioral context string for context building
   */
  getBehaviorContext(userId: string): string {
    const pattern = this.getBehaviorPattern(userId);
    
    if (!pattern || this.isPatternTooStale(pattern)) {
      return '';
    }
    
    const parts: string[] = ['BEHAVIORAL ANALYSIS:\n'];
    
    // Message activity
    parts.push(`Activity Level: ${pattern.messageFrequency.toFixed(1)} messages/hour`);
    
    // Favorite topics
    if (pattern.favoriteTopics.length > 0) {
      parts.push(`Interests: ${pattern.favoriteTopics.slice(0, 5).join(', ')}`);
    }
    
    // Programming languages
    if (pattern.detectedLanguages.length > 0) {
      parts.push(`Programming Languages: ${pattern.detectedLanguages.join(', ')}`);
    }
    
    // Complexity and communication style
    parts.push(`Communication Complexity: ${Math.round(pattern.complexityScore)}/10`);
    parts.push(`Roast Resistance: ${Math.round(pattern.roastResistance)}/10`);
    
    // Common mistakes (for roasting potential)
    if (pattern.commonMistakes.length > 0) {
      parts.push(`Common Issues: ${pattern.commonMistakes.slice(0, 3).join(', ')}`);
    }
    
    return parts.join('\n') + '\n';
  }

  /**
   * Clean up expired patterns
   */
  cleanup(): void {
    const now = Date.now();
    const expiredUsers: string[] = [];
    
    Array.from(this.patterns.entries()).forEach(([userId, pattern]) => {
      // Remove patterns older than 24 hours of inactivity
      if (now - pattern.lastUpdated > (24 * 60 * 60 * 1000)) {
        expiredUsers.push(userId);
      }
    });
    
    expiredUsers.forEach(userId => {
      this.patterns.delete(userId);
      logger.debug(`Cleaned up expired behavior pattern for user ${userId}`);
    });
    
    if (expiredUsers.length > 0) {
      logger.info(`Cleaned up ${expiredUsers.length} expired behavior patterns`);
    }
  }

  /**
   * Get behavior analysis statistics
   */
  getStats(): {
    totalUsers: number;
    activePatterns: number;
    stalePatterns: number;
    averageComplexity: number;
    averageFrequency: number;
    } {
    const now = Date.now();
    let activePatterns = 0;
    let stalePatterns = 0;
    let totalComplexity = 0;
    let totalFrequency = 0;
    
    Array.from(this.patterns.values()).forEach((pattern) => {
      if (now - pattern.lastUpdated > this.CACHE_TTL) {
        stalePatterns++;
      } else {
        activePatterns++;
      }
      totalComplexity += pattern.complexityScore;
      totalFrequency += pattern.messageFrequency;
    });
    
    const totalUsers = this.patterns.size;
    
    return {
      totalUsers,
      activePatterns,
      stalePatterns,
      averageComplexity: totalUsers > 0 ? totalComplexity / totalUsers : 0,
      averageFrequency: totalUsers > 0 ? totalFrequency / totalUsers : 0
    };
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Create a new behavior pattern for a user
   */
  private createNewPattern(userId: string): UserBehaviorPattern {
    return {
      userId,
      messageFrequency: 0,
      favoriteTopics: [],
      detectedLanguages: [],
      commonMistakes: [],
      complexityScore: 5.0, // Start with neutral complexity
      roastResistance: 5.0, // Start with neutral resistance
      lastUpdated: Date.now(),
      messageTimestamps: []
    };
  }

  /**
   * Calculate message frequency (messages per hour)
   */
  private calculateMessageRate(timestamps: number[]): number {
    if (timestamps.length < 2) {
      return 0;
    }
    
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    
    // Count messages in the last hour
    const recentMessages = timestamps.filter(ts => ts > hourAgo);
    
    // If no recent messages, calculate over available timespan
    if (recentMessages.length === 0) {
      const timespan = now - Math.min(...timestamps);
      const hours = timespan / (60 * 60 * 1000);
      return hours > 0 ? timestamps.length / hours : 0;
    }
    
    return recentMessages.length; // Messages in the last hour
  }

  /**
   * Extract topics from message using keyword analysis
   */
  private extractTopics(message: string, existingTopics: string[]): string[] {
    const topicKeywords = new Map([
      ['programming', ['code', 'function', 'variable', 'class', 'method', 'algorithm', 'debug', 'compile', 'syntax']],
      ['web development', ['html', 'css', 'javascript', 'react', 'vue', 'angular', 'frontend', 'backend', 'api', 'rest']],
      ['databases', ['sql', 'database', 'query', 'table', 'mysql', 'postgres', 'mongodb', 'nosql']],
      ['devops', ['docker', 'kubernetes', 'deployment', 'ci/cd', 'server', 'cloud', 'aws', 'azure', 'linux']],
      ['gaming', ['game', 'gaming', 'player', 'match', 'fps', 'mmo', 'rpg', 'console', 'pc gaming']],
      ['music', ['song', 'album', 'artist', 'band', 'music', 'guitar', 'piano', 'spotify', 'sound']],
      ['movies', ['movie', 'film', 'cinema', 'actor', 'director', 'netflix', 'series', 'tv show']],
      ['sports', ['football', 'basketball', 'soccer', 'tennis', 'baseball', 'hockey', 'olympics', 'team']],
      ['food', ['recipe', 'cooking', 'restaurant', 'food', 'meal', 'dinner', 'lunch', 'breakfast']],
      ['travel', ['trip', 'vacation', 'travel', 'flight', 'hotel', 'country', 'city', 'tourism']],
      ['technology', ['tech', 'gadget', 'smartphone', 'computer', 'laptop', 'ai', 'machine learning', 'blockchain']],
      ['science', ['research', 'experiment', 'theory', 'physics', 'chemistry', 'biology', 'mathematics']]
    ]);
    
    const messageLower = message.toLowerCase();
    const detectedTopics: string[] = [];
    
    Array.from(topicKeywords.entries()).forEach(([topic, keywords]) => {
      const matchCount = keywords.filter(keyword => messageLower.includes(keyword)).length;
      if (matchCount >= 1) { // Topic detected if at least 1 keyword matches
        detectedTopics.push(topic);
      }
    });
    
    // Merge with existing topics and maintain frequency-based ordering
    const topicCounts = new Map<string, number>();
    
    // Count existing topics
    existingTopics.forEach(topic => {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    });
    
    // Add new topics
    detectedTopics.forEach(topic => {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    });
    
    // Sort by frequency and return top topics
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
      .slice(0, this.MAX_TOPICS);
  }

  /**
   * Detect programming languages mentioned in the message
   */
  private detectProgrammingLanguages(message: string): string[] {
    const languagePatterns = new Map([
      ['JavaScript', [/javascript/i, /\bjs\b/i, /node\.?js/i, /react/i, /vue/i, /angular/i]],
      ['Python', [/python/i, /\bpy\b/i, /django/i, /flask/i, /pandas/i, /numpy/i]],
      ['Java', [/\bjava\b/i, /spring/i, /maven/i, /gradle/i]],
      ['C++', [/c\+\+/i, /cpp/i]],
      ['C#', [/c#/i, /csharp/i, /\.net/i, /dotnet/i]],
      ['Go', [/\bgo\b/i, /golang/i]],
      ['Rust', [/rust/i, /cargo/i]],
      ['TypeScript', [/typescript/i, /\bts\b/i]],
      ['PHP', [/php/i, /laravel/i, /symfony/i]],
      ['Ruby', [/ruby/i, /rails/i]],
      ['Swift', [/swift/i, /ios/i, /xcode/i]],
      ['Kotlin', [/kotlin/i]],
      ['Dart', [/dart/i, /flutter/i]],
      ['SQL', [/\bsql\b/i, /mysql/i, /postgres/i, /sqlite/i]],
      ['Shell', [/bash/i, /shell/i, /zsh/i, /fish/i]],
      ['R', [/\br\b/i, /rstudio/i]],
      ['MATLAB', [/matlab/i]],
      ['Scala', [/scala/i]],
      ['Lua', [/lua/i]]
    ]);
    
    const detectedLanguages: string[] = [];
    
    Array.from(languagePatterns.entries()).forEach(([language, patterns]) => {
      const hasMatch = patterns.some(pattern => pattern.test(message));
      if (hasMatch) {
        detectedLanguages.push(language);
      }
    });
    
    return detectedLanguages;
  }

  /**
   * Calculate complexity score based on message content
   */
  private calculateComplexity(message: string): number {
    let score = 5.0; // Base complexity
    
    // Length factor
    if (message.length > 200) score += 1.0;
    if (message.length > 500) score += 1.0;
    if (message.length < 20) score -= 1.0;
    
    // Technical vocabulary
    const technicalTerms = /\b(algorithm|implementation|architecture|optimization|refactor|abstraction|polymorphism|inheritance|asynchronous|synchronous|middleware|framework|library|dependency|deployment|scalability|performance|security|authentication|authorization|encryption|database|normalization|indexing|caching|load balancing|microservices|containerization|orchestration|devops|ci\/cd|version control|repository|branch|merge|commit|pull request|api|rest|graphql|json|xml|http|https|tcp|udp|ssl|tls|oauth|jwt|cors|sql injection|xss|csrf)\b/gi;
    const technicalMatches = (message.match(technicalTerms) || []).length;
    score += Math.min(technicalMatches * 0.5, 2.0);
    
    // Code patterns
    if (/```[\s\S]*```/g.test(message)) score += 1.5; // Code blocks
    if (/`[^`]+`/g.test(message)) score += 0.5; // Inline code
    if (/\b(function|class|const|let|var|if|for|while|try|catch|async|await)\b/gi.test(message)) score += 1.0;
    
    // Complex punctuation and structure
    const sentences = message.split(/[.!?]+/).length - 1;
    if (sentences > 3) score += 0.5;
    
    const parentheses = (message.match(/\([^)]*\)/g) || []).length;
    if (parentheses > 2) score += 0.5;
    
    // Mathematical expressions
    if (/[=+\-*/^%]|\\[a-z]+|_{[^}]+}|\^{[^}]+}/g.test(message)) score += 0.5;
    
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Update complexity score with exponential moving average
   */
  private updateComplexityScore(currentScore: number, message: string): number {
    const messageComplexity = this.calculateComplexity(message);
    const alpha = 0.3; // Smoothing factor
    return currentScore * (1 - alpha) + messageComplexity * alpha;
  }

  /**
   * Detect common mistakes in messages
   */
  private detectCommonMistakes(message: string): string[] {
    const mistakes: string[] = [];
    
    // Spelling/grammar patterns
    if (/\b(recieve|seperate|definately|occured|enviroment|neccessary|accomodate|priviledge|maintainance|independant)\b/gi.test(message)) {
      mistakes.push('spelling errors');
    }
    
    // Programming mistakes
    if (/\b(loose instead of lose|then instead of than|affect instead of effect)\b/i.test(message)) {
      mistakes.push('common word confusion');
    }
    
    // Code-related mistakes
    if (/\b(forgot semicolon|missing bracket|undefined variable|null pointer|memory leak|infinite loop)\b/i.test(message)) {
      mistakes.push('programming errors');
    }
    
    // Caps lock usage
    if (/[A-Z]{4,}/.test(message) && !/\b(API|URL|HTTP|JSON|XML|SQL|HTML|CSS|JS|TS|AWS|GCP|GPU|CPU|RAM|SSD|HDD|USB|WiFi|VPN)\b/.test(message)) {
      mistakes.push('excessive caps');
    }
    
    // Multiple exclamation/question marks
    if (/[!]{2,}|[?]{2,}/.test(message)) {
      mistakes.push('excessive punctuation');
    }
    
    return mistakes;
  }

  /**
   * Update roast resistance based on message patterns
   */
  private updateRoastResistance(currentResistance: number, message: string): number {
    let adjustment = 0;
    
    // Confident language increases resistance
    if (/\b(obviously|clearly|definitely|absolutely|certainly|of course|easy|simple|trivial)\b/i.test(message)) {
      adjustment += 0.5;
    }
    
    // Humble language decreases resistance
    if (/\b(maybe|perhaps|might be|not sure|think|probably|sorry|my bad|oops)\b/i.test(message)) {
      adjustment -= 0.3;
    }
    
    // Error admissions decrease resistance
    if (/\b(wrong|mistake|error|failed|broke|crashed|bug|issue|problem)\b/i.test(message)) {
      adjustment -= 0.4;
    }
    
    // Technical expertise increases resistance
    if (/\b(optimization|architecture|scalability|performance|algorithm|implementation)\b/i.test(message)) {
      adjustment += 0.3;
    }
    
    const alpha = 0.2; // Smoothing factor
    const newValue = currentResistance + (adjustment * alpha);
    return Math.max(0, Math.min(10, newValue));
  }

  /**
   * Merge new languages with existing ones, maintaining frequency order
   */
  private mergeLanguages(existing: string[], newLanguages: string[]): string[] {
    const languageSet = new Set([...existing, ...newLanguages]);
    return Array.from(languageSet).slice(0, this.MAX_LANGUAGES);
  }

  /**
   * Merge new mistakes with existing ones, maintaining frequency order
   */
  private mergeMistakes(existing: string[], newMistakes: string[]): string[] {
    const mistakeSet = new Set([...existing, ...newMistakes]);
    return Array.from(mistakeSet).slice(0, this.MAX_MISTAKES);
  }

  /**
   * Check if pattern is too stale to be useful
   */
  private isPatternTooStale(pattern: UserBehaviorPattern): boolean {
    const now = Date.now();
    return (now - pattern.lastUpdated) > (60 * 60 * 1000); // 1 hour
  }
}