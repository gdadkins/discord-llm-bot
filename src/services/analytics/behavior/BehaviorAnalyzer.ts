/**
 * Behavioral Pattern Recognition Service - Main Coordinator
 * 
 * Analyzes user messaging patterns to understand behavior and preferences.
 * Coordinates pattern detection and behavior prediction modules.
 */

import { logger } from '../../../utils/logger';
import { PatternDetector } from './PatternDetector';
import { BehaviorPredictor } from './BehaviorPredictor';
import type { MessageContext } from '../../../commands';
import type { 
  IBehaviorAnalyzer, 
  BehaviorAnalysis, 
  UserPatterns, 
  AnomalyDetection, 
  ActionPrediction, 
  IntentPrediction 
} from '../../interfaces/BehaviorAnalysisInterfaces';
import type { ServiceHealthStatus } from '../../interfaces/CoreServiceInterfaces';
import type { 
  UserBehaviorPattern, 
  BehaviorMetrics
} from './types';
import { BEHAVIOR_CONSTANTS } from './types';

export class BehaviorAnalyzer implements IBehaviorAnalyzer {
  private patterns: Map<string, UserBehaviorPattern> = new Map();
  private patternDetector: PatternDetector;
  private behaviorPredictor: BehaviorPredictor;
  
  private readonly CACHE_TTL = BEHAVIOR_CONSTANTS.CACHE_TTL;
  private readonly MAX_TIMESTAMPS = BEHAVIOR_CONSTANTS.MAX_TIMESTAMPS;
  private readonly STALE_THRESHOLD = BEHAVIOR_CONSTANTS.STALE_THRESHOLD;
  private readonly CLEANUP_THRESHOLD = BEHAVIOR_CONSTANTS.CLEANUP_THRESHOLD;

  constructor() {
    this.patternDetector = new PatternDetector();
    this.behaviorPredictor = new BehaviorPredictor();
  }

  /**
   * Analyze a message and update user behavioral patterns
   */
  async analyzeMessage(userId: string, message: string): Promise<void> {
    try {
      const pattern = this.patterns.get(userId) || this.createNewPattern(userId);
      const now = Date.now();
      
      // Update message timestamps
      this.updateMessageTimestamps(pattern, now);
      
      // Update message frequency
      pattern.messageFrequency = this.calculateMessageRate(pattern.messageTimestamps);
      
      // Extract and update topics
      pattern.favoriteTopics = this.patternDetector.extractTopics(message, pattern.favoriteTopics);
      
      // Detect and update languages
      const languages = this.patternDetector.detectProgrammingLanguages(message);
      if (languages.length > 0) {
        pattern.detectedLanguages = this.patternDetector.mergeLanguages(
          pattern.detectedLanguages, 
          languages
        );
      }
      
      // Update complexity score
      pattern.complexityScore = this.behaviorPredictor.updateComplexityScore(
        pattern.complexityScore, 
        message
      );
      
      // Detect and update mistakes
      const mistakes = this.patternDetector.detectCommonMistakes(message);
      if (mistakes.length > 0) {
        pattern.commonMistakes = this.patternDetector.mergeMistakes(
          pattern.commonMistakes, 
          mistakes
        );
      }
      
      // Update roast resistance
      pattern.roastResistance = this.behaviorPredictor.updateRoastResistance(
        pattern.roastResistance, 
        message
      );
      
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
   * Analyze user behavior from a message with context
   */
  async analyzeUserBehavior(userId: string, message: string, context: MessageContext): Promise<BehaviorAnalysis> {
    // Update pattern analysis
    await this.analyzeMessage(userId, message);
    
    // Get current pattern
    const pattern = this.getBehaviorPattern(userId);
    
    // Extract message metrics
    const sentiment = this.analyzeSentiment(message);
    const topics = this.patternDetector.extractTopics(message, pattern?.favoriteTopics || []);
    const engagement = this.behaviorPredictor.calculateEngagement(message, context);
    const patterns = this.patternDetector.identifyMessagePatterns(message);
    
    const analysis: BehaviorAnalysis = {
      userId,
      timestamp: Date.now(),
      messageLength: message.length,
      sentiment,
      topics: topics.slice(0, 5),
      engagement: engagement.score,
      patterns
    };
    
    logger.debug(`Behavior analysis completed for user ${userId}`, {
      sentiment: analysis.sentiment,
      engagement: analysis.engagement,
      topicsCount: analysis.topics.length
    });
    
    return analysis;
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
      logger.debug(`Behavior pattern for user ${userId} is stale (${Math.floor((now - pattern.lastUpdated) / 60000)} minutes old)`);
    }
    
    return { ...pattern }; // Return a copy
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
   * Detect patterns for a specific user
   */
  detectPatterns(userId: string): UserPatterns {
    const pattern = this.getBehaviorPattern(userId);
    return this.patternDetector.detectPatterns(pattern);
  }

  /**
   * Detect anomalies in user behavior
   */
  detectAnomalies(userId: string, behavior: BehaviorAnalysis): AnomalyDetection[] {
    const pattern = this.getBehaviorPattern(userId);
    return this.patternDetector.detectAnomalies(pattern, behavior);
  }

  /**
   * Predict next likely actions for a user
   */
  predictNextAction(userId: string): ActionPrediction[] {
    const pattern = this.getBehaviorPattern(userId);
    return this.behaviorPredictor.predictNextAction(pattern);
  }

  /**
   * Predict user intent from a message
   */
  predictUserIntent(message: string, context: MessageContext): IntentPrediction {
    return this.patternDetector.predictUserIntent(message, context);
  }

  /**
   * Get behavior analysis statistics
   */
  getStats(): BehaviorMetrics {
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

  /**
   * Clean up expired patterns
   */
  cleanup(): void {
    const now = Date.now();
    const expiredUsers: string[] = [];
    
    Array.from(this.patterns.entries()).forEach(([userId, pattern]) => {
      if (now - pattern.lastUpdated > this.CLEANUP_THRESHOLD) {
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
   * Get health status of the service
   */
  getHealthStatus(): ServiceHealthStatus {
    const errors: string[] = [];
    const now = Date.now();
    let stalePatterns = 0;
    
    this.patterns.forEach((pattern) => {
      if (now - pattern.lastUpdated > this.CACHE_TTL) {
        stalePatterns++;
      }
    });
    
    if (stalePatterns > this.patterns.size * 0.5) {
      errors.push(`High number of stale patterns: ${stalePatterns}/${this.patterns.size}`);
    }
    
    return {
      healthy: errors.length === 0,
      name: 'BehaviorAnalyzer',
      errors,
      metrics: {
        totalPatterns: this.patterns.size,
        stalePatterns,
        cacheUtilization: this.patterns.size > 0 ? (this.patterns.size - stalePatterns) / this.patterns.size : 0
      }
    };
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    logger.info('BehaviorAnalyzer initialized successfully');
  }

  /**
   * Shutdown the service and clean up resources
   */
  async shutdown(): Promise<void> {
    this.patterns.clear();
    logger.info('BehaviorAnalyzer shutdown completed');
  }

  // ========== PRIVATE HELPER METHODS ==========

  private createNewPattern(userId: string): UserBehaviorPattern {
    return {
      userId,
      messageFrequency: 0,
      favoriteTopics: [],
      detectedLanguages: [],
      commonMistakes: [],
      complexityScore: 5.0,
      roastResistance: 5.0,
      lastUpdated: Date.now(),
      messageTimestamps: []
    };
  }

  private updateMessageTimestamps(pattern: UserBehaviorPattern, now: number): void {
    pattern.messageTimestamps.push(now);
    
    // Trim old timestamps (keep only last 24 hours)
    const dayAgo = now - (24 * 60 * 60 * 1000);
    pattern.messageTimestamps = pattern.messageTimestamps.filter(ts => ts > dayAgo);
    
    // Trim to max timestamps
    if (pattern.messageTimestamps.length > this.MAX_TIMESTAMPS) {
      pattern.messageTimestamps = pattern.messageTimestamps.slice(-this.MAX_TIMESTAMPS);
    }
  }

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
    
    return recentMessages.length;
  }

  private analyzeSentiment(message: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['good', 'great', 'excellent', 'awesome', 'love', 'like', 'happy', 'thanks', 'thank you'];
    const negativeWords = ['bad', 'terrible', 'hate', 'dislike', 'angry', 'frustrated', 'problem', 'error', 'broken'];
    
    const messageLower = message.toLowerCase();
    const positiveCount = positiveWords.filter(word => messageLower.includes(word)).length;
    const negativeCount = negativeWords.filter(word => messageLower.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private isPatternTooStale(pattern: UserBehaviorPattern): boolean {
    const now = Date.now();
    return (now - pattern.lastUpdated) > this.STALE_THRESHOLD;
  }
}