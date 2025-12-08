/**
 * Pattern Detection Module
 * 
 * Handles pattern recognition, anomaly detection, and trend analysis
 * for user behavior patterns in Discord conversations.
 */

import type { UserBehaviorPattern } from './types';
import type { 
  BehaviorAnalysis, 
  UserPatterns, 
  AnomalyDetection,
  IntentPrediction 
} from '../../interfaces/BehaviorAnalysisInterfaces';
import type { MessageContext } from '../../../commands';

export interface PatternDetectionConfig {
  readonly MAX_TOPICS: number;
  readonly MAX_LANGUAGES: number;
  readonly MAX_MISTAKES: number;
  readonly ANOMALY_THRESHOLDS: {
    readonly messageLength: number;
    readonly sentimentDeviation: number;
    readonly patternAbsence: number;
  };
}

export class PatternDetector {
  private readonly config: PatternDetectionConfig = {
    MAX_TOPICS: 10,
    MAX_LANGUAGES: 5,
    MAX_MISTAKES: 15,
    ANOMALY_THRESHOLDS: {
      messageLength: 3.0,
      sentimentDeviation: 0.6,
      patternAbsence: 0.5
    }
  };

  private readonly topicKeywords = new Map([
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

  private readonly languagePatterns = new Map([
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

  /**
   * Extract topics from message using keyword analysis
   */
  extractTopics(message: string, existingTopics: string[]): string[] {
    const messageLower = message.toLowerCase();
    const detectedTopics: string[] = [];
    
    Array.from(this.topicKeywords.entries()).forEach(([topic, keywords]) => {
      const matchCount = keywords.filter(keyword => messageLower.includes(keyword)).length;
      if (matchCount >= 1) {
        detectedTopics.push(topic);
      }
    });
    
    // Merge with existing topics and maintain frequency-based ordering
    const topicCounts = new Map<string, number>();
    
    existingTopics.forEach(topic => {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    });
    
    detectedTopics.forEach(topic => {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    });
    
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
      .slice(0, this.config.MAX_TOPICS);
  }

  /**
   * Detect programming languages mentioned in the message
   */
  detectProgrammingLanguages(message: string): string[] {
    const detectedLanguages: string[] = [];
    
    Array.from(this.languagePatterns.entries()).forEach(([language, patterns]) => {
      const hasMatch = patterns.some(pattern => pattern.test(message));
      if (hasMatch) {
        detectedLanguages.push(language);
      }
    });
    
    return detectedLanguages;
  }

  /**
   * Merge new languages with existing ones, maintaining frequency order
   */
  mergeLanguages(existing: string[], newLanguages: string[]): string[] {
    const languageSet = new Set([...existing, ...newLanguages]);
    return Array.from(languageSet).slice(0, this.config.MAX_LANGUAGES);
  }

  /**
   * Detect common mistakes in messages
   */
  detectCommonMistakes(message: string): string[] {
    const mistakes: string[] = [];
    
    // Spelling/grammar patterns
    if (/\b(recieve|seperate|definately|occured|enviroment|neccessary|accomodate|priviledge|maintainance|independant)\b/gi.test(message)) {
      mistakes.push('spelling errors');
    }
    
    // Common word confusion
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
   * Merge new mistakes with existing ones, maintaining frequency order
   */
  mergeMistakes(existing: string[], newMistakes: string[]): string[] {
    const mistakeSet = new Set([...existing, ...newMistakes]);
    return Array.from(mistakeSet).slice(0, this.config.MAX_MISTAKES);
  }

  /**
   * Identify patterns in a message
   */
  identifyMessagePatterns(message: string): string[] {
    const patterns: string[] = [];
    
    if (/```[\s\S]*```/.test(message)) patterns.push('code_block');
    if (/`[^`]+`/.test(message)) patterns.push('inline_code');
    if (/\bhttps?:\/\/\S+/.test(message)) patterns.push('contains_url');
    if (/\b\d+\b/.test(message)) patterns.push('contains_numbers');
    if (/[!]{2,}/.test(message)) patterns.push('emphatic');
    if (/[?]{2,}/.test(message)) patterns.push('confused');
    if (message.length > 500) patterns.push('long_form');
    if (message.length < 20) patterns.push('brief');
    
    return patterns;
  }

  /**
   * Detect patterns for a specific user
   */
  detectPatterns(pattern: UserBehaviorPattern | null): UserPatterns {
    const defaultPatterns: UserPatterns = {
      userId: pattern?.userId || '',
      activityPatterns: {
        peakHours: [],
        averageMessageLength: 0,
        preferredChannels: []
      },
      communicationPatterns: {
        dominantSentiment: 'neutral',
        topicPreferences: [],
        responseTime: 0
      },
      socialPatterns: {
        frequentInteractions: [],
        groupDynamics: []
      }
    };

    if (!pattern) {
      return defaultPatterns;
    }
    
    // Calculate peak hours from message timestamps
    const peakHours = this.calculatePeakHours(pattern.messageTimestamps);
    
    // Calculate average message length (estimated)
    const averageMessageLength = this.estimateAverageMessageLength(pattern);
    
    return {
      userId: pattern.userId,
      activityPatterns: {
        peakHours,
        averageMessageLength,
        preferredChannels: []
      },
      communicationPatterns: {
        dominantSentiment: this.getDominantSentiment(pattern),
        topicPreferences: pattern.favoriteTopics.slice(0, 5),
        responseTime: 0
      },
      socialPatterns: {
        frequentInteractions: [],
        groupDynamics: []
      }
    };
  }

  /**
   * Detect anomalies in user behavior
   */
  detectAnomalies(pattern: UserBehaviorPattern | null, behavior: BehaviorAnalysis): AnomalyDetection[] {
    const anomalies: AnomalyDetection[] = [];
    
    if (!pattern) {
      return anomalies;
    }
    
    // Check for unusual message length
    const averageLength = this.estimateAverageMessageLength(pattern);
    if (behavior.messageLength > averageLength * this.config.ANOMALY_THRESHOLDS.messageLength) {
      anomalies.push({
        type: 'activity',
        severity: 'medium',
        description: 'Unusually long message compared to typical behavior',
        confidence: 0.7
      });
    }
    
    // Check for sentiment anomaly
    const dominantSentiment = this.getDominantSentiment(pattern);
    if (dominantSentiment !== 'neutral' && behavior.sentiment !== dominantSentiment) {
      anomalies.push({
        type: 'sentiment',
        severity: 'low',
        description: `Sentiment differs from typical pattern (${dominantSentiment} vs ${behavior.sentiment})`,
        confidence: this.config.ANOMALY_THRESHOLDS.sentimentDeviation
      });
    }
    
    // Check for pattern disruption
    if (behavior.patterns.length === 0 && pattern.favoriteTopics.length > 0) {
      anomalies.push({
        type: 'pattern',
        severity: 'low',
        description: 'Message lacks typical communication patterns',
        confidence: this.config.ANOMALY_THRESHOLDS.patternAbsence
      });
    }
    
    return anomalies;
  }

  /**
   * Predict user intent from a message
   */
  predictUserIntent(message: string, _context: MessageContext): IntentPrediction {
    const messageLower = message.toLowerCase();
    
    // Question detection
    if (messageLower.includes('?') || messageLower.startsWith('how') || 
        messageLower.startsWith('what') || messageLower.startsWith('why') ||
        messageLower.startsWith('when') || messageLower.startsWith('where')) {
      return {
        intent: 'ask_question',
        confidence: 0.8,
        entities: this.extractQuestionEntities(message)
      };
    }
    
    // Help request detection
    if (messageLower.includes('help') || messageLower.includes('assist') ||
        messageLower.includes('support') || messageLower.includes('explain')) {
      return {
        intent: 'request_help',
        confidence: 0.7,
        entities: [{ type: 'topic', value: 'general' }]
      };
    }
    
    // Code-related intent
    if (messageLower.includes('code') || messageLower.includes('function') ||
        messageLower.includes('debug') || messageLower.includes('error')) {
      return {
        intent: 'discuss_code',
        confidence: 0.7,
        entities: this.extractCodeEntities(message)
      };
    }
    
    // Greeting detection
    if (messageLower.includes('hello') || messageLower.includes('hi') ||
        messageLower.includes('hey') || messageLower.includes('good morning')) {
      return {
        intent: 'greeting',
        confidence: 0.9,
        entities: []
      };
    }
    
    // Default to casual conversation
    return {
      intent: 'casual_conversation',
      confidence: 0.5,
      entities: []
    };
  }

  // ========== HELPER METHODS ==========

  private calculatePeakHours(timestamps: number[]): number[] {
    const hourCounts = new Array(24).fill(0);
    
    timestamps.forEach(timestamp => {
      const hour = new Date(timestamp).getHours();
      hourCounts[hour]++;
    });
    
    const maxCount = Math.max(...hourCounts);
    if (maxCount === 0) return [];
    
    return hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(({ count }) => count >= maxCount * 0.7)
      .map(({ hour }) => hour);
  }

  private estimateAverageMessageLength(pattern: UserBehaviorPattern): number {
    return Math.max(20, pattern.complexityScore * 15);
  }

  private getDominantSentiment(pattern: UserBehaviorPattern): string {
    if (pattern.roastResistance > 7) return 'positive';
    if (pattern.roastResistance < 3) return 'negative';
    return 'neutral';
  }

  private extractQuestionEntities(message: string): Array<{ type: string; value: string }> {
    const entities: Array<{ type: string; value: string }> = [];
    
    const languages = this.detectProgrammingLanguages(message);
    languages.forEach(lang => {
      entities.push({ type: 'programming_language', value: lang });
    });
    
    if (message.toLowerCase().includes('database')) {
      entities.push({ type: 'topic', value: 'database' });
    }
    
    return entities;
  }

  private extractCodeEntities(message: string): Array<{ type: string; value: string }> {
    const entities: Array<{ type: string; value: string }> = [];
    
    const languages = this.detectProgrammingLanguages(message);
    languages.forEach(lang => {
      entities.push({ type: 'programming_language', value: lang });
    });
    
    if (message.toLowerCase().includes('syntax error')) {
      entities.push({ type: 'error_type', value: 'syntax_error' });
    }
    
    return entities;
  }
}