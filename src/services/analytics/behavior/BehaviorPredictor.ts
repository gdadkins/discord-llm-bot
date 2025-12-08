/**
 * Behavior Prediction Module
 * 
 * Handles prediction algorithms, confidence scoring, and recommendation engine
 * for user behavior predictions and engagement analysis.
 */

import type { UserBehaviorPattern } from './types';
import type { 
  ActionPrediction,
  BehaviorAnalysis
} from '../../interfaces/BehaviorAnalysisInterfaces';
import type { MessageContext } from '../../../commands';

export interface PredictionConfig {
  readonly PREDICTION_CONFIDENCE_THRESHOLDS: {
    readonly high: number;
    readonly medium: number;
    readonly low: number;
  };
  readonly ACTIVITY_THRESHOLDS: {
    readonly veryActive: number;
    readonly active: number;
    readonly moderate: number;
  };
  readonly COMPLEXITY_WEIGHTS: {
    readonly length: number;
    readonly technical: number;
    readonly structure: number;
    readonly mathematical: number;
  };
}

export interface EngagementMetrics {
  score: number;
  factors: {
    messageLength: number;
    interactivity: number;
    mediaContent: number;
    threadParticipation: number;
  };
}

export interface ComplexityMetrics {
  score: number;
  factors: {
    length: number;
    vocabulary: number;
    codeContent: number;
    structure: number;
  };
}

export class BehaviorPredictor {
  private readonly config: PredictionConfig = {
    PREDICTION_CONFIDENCE_THRESHOLDS: {
      high: 0.8,
      medium: 0.6,
      low: 0.4
    },
    ACTIVITY_THRESHOLDS: {
      veryActive: 5,
      active: 2,
      moderate: 1
    },
    COMPLEXITY_WEIGHTS: {
      length: 0.2,
      technical: 0.4,
      structure: 0.2,
      mathematical: 0.2
    }
  };

  /**
   * Predict next likely actions for a user
   */
  predictNextAction(pattern: UserBehaviorPattern | null): ActionPrediction[] {
    const predictions: ActionPrediction[] = [];
    
    if (!pattern) {
      // Generic predictions for unknown users
      return this.getDefaultPredictions();
    }
    
    // Activity-based predictions
    this.addActivityPredictions(predictions, pattern);
    
    // Topic-based predictions
    this.addTopicPredictions(predictions, pattern);
    
    // Behavior-based predictions
    this.addBehaviorPredictions(predictions, pattern);
    
    // Always include idle prediction
    predictions.push({
      action: 'idle',
      probability: 0.3,
      timeframe: '1h'
    });
    
    // Normalize probabilities and sort
    return this.normalizePredictions(predictions);
  }

  /**
   * Calculate message complexity score
   */
  calculateComplexity(message: string): ComplexityMetrics {
    const factors = {
      length: this.calculateLengthScore(message),
      vocabulary: this.calculateVocabularyScore(message),
      codeContent: this.calculateCodeScore(message),
      structure: this.calculateStructureScore(message)
    };
    
    const score = 
      factors.length * this.config.COMPLEXITY_WEIGHTS.length +
      factors.vocabulary * this.config.COMPLEXITY_WEIGHTS.technical +
      factors.codeContent * this.config.COMPLEXITY_WEIGHTS.structure +
      factors.structure * this.config.COMPLEXITY_WEIGHTS.mathematical;
    
    return {
      score: Math.max(0, Math.min(10, score)),
      factors
    };
  }

  /**
   * Update complexity score with exponential moving average
   */
  updateComplexityScore(currentScore: number, message: string, alpha: number = 0.3): number {
    const messageComplexity = this.calculateComplexity(message).score;
    return currentScore * (1 - alpha) + messageComplexity * alpha;
  }

  /**
   * Calculate engagement score based on message and context
   */
  calculateEngagement(message: string, context: MessageContext): EngagementMetrics {
    const factors = {
      messageLength: this.calculateLengthEngagement(message),
      interactivity: this.calculateInteractivityScore(message),
      mediaContent: this.calculateMediaEngagement(context),
      threadParticipation: context.isThread ? 0.1 : 0
    };
    
    const score = 
      factors.messageLength +
      factors.interactivity +
      factors.mediaContent +
      factors.threadParticipation;
    
    return {
      score: Math.max(0, Math.min(1, score)),
      factors
    };
  }

  /**
   * Update roast resistance based on message patterns
   */
  updateRoastResistance(currentResistance: number, message: string, alpha: number = 0.2): number {
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
    
    const newValue = currentResistance + (adjustment * alpha);
    return Math.max(0, Math.min(10, newValue));
  }

  /**
   * Generate recommendations based on behavior analysis
   */
  generateRecommendations(pattern: UserBehaviorPattern, analysis: BehaviorAnalysis): string[] {
    const recommendations: string[] = [];
    
    // Activity-based recommendations
    if (pattern.messageFrequency > this.config.ACTIVITY_THRESHOLDS.veryActive) {
      recommendations.push('Consider enabling rate limiting for this user');
    }
    
    // Complexity-based recommendations
    if (pattern.complexityScore > 8) {
      recommendations.push('User engages with technical content - provide detailed responses');
    } else if (pattern.complexityScore < 3) {
      recommendations.push('User prefers simple explanations - avoid technical jargon');
    }
    
    // Topic-based recommendations
    if (pattern.favoriteTopics.length > 0) {
      const topTopic = pattern.favoriteTopics[0];
      recommendations.push(`Tailor responses to ${topTopic} interests`);
    }
    
    // Sentiment-based recommendations
    if (analysis.sentiment === 'negative') {
      recommendations.push('User may be frustrated - respond with empathy');
    }
    
    return recommendations;
  }

  /**
   * Calculate confidence score for predictions
   */
  calculatePredictionConfidence(
    pattern: UserBehaviorPattern,
    predictionType: string
  ): number {
    let confidence = 0.5; // Base confidence
    
    // More data points increase confidence
    const dataPoints = pattern.messageTimestamps.length;
    if (dataPoints > 100) confidence += 0.3;
    else if (dataPoints > 50) confidence += 0.2;
    else if (dataPoints > 20) confidence += 0.1;
    
    // Recent activity increases confidence
    const hoursSinceLastMessage = (Date.now() - pattern.lastUpdated) / (1000 * 60 * 60);
    if (hoursSinceLastMessage < 1) confidence += 0.2;
    else if (hoursSinceLastMessage < 24) confidence += 0.1;
    else confidence -= 0.1;
    
    // Prediction type adjustments
    if (predictionType === 'activity' && pattern.messageFrequency > 1) {
      confidence += 0.1;
    } else if (predictionType === 'topic' && pattern.favoriteTopics.length > 3) {
      confidence += 0.1;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  // ========== PRIVATE HELPER METHODS ==========

  private getDefaultPredictions(): ActionPrediction[] {
    return [
      { action: 'send_message', probability: 0.6, timeframe: '5m' },
      { action: 'idle', probability: 0.4, timeframe: '10m' }
    ];
  }

  private addActivityPredictions(
    predictions: ActionPrediction[],
    pattern: UserBehaviorPattern
  ): void {
    if (pattern.messageFrequency > this.config.ACTIVITY_THRESHOLDS.veryActive) {
      predictions.push({
        action: 'send_message',
        probability: 0.8,
        timeframe: '2m'
      });
      predictions.push({
        action: 'send_multiple_messages',
        probability: 0.6,
        timeframe: '5m'
      });
    } else if (pattern.messageFrequency > this.config.ACTIVITY_THRESHOLDS.active) {
      predictions.push({
        action: 'send_message',
        probability: 0.6,
        timeframe: '10m'
      });
    } else if (pattern.messageFrequency > this.config.ACTIVITY_THRESHOLDS.moderate) {
      predictions.push({
        action: 'send_message',
        probability: 0.4,
        timeframe: '30m'
      });
    }
  }

  private addTopicPredictions(
    predictions: ActionPrediction[],
    pattern: UserBehaviorPattern
  ): void {
    if (pattern.favoriteTopics.includes('programming')) {
      predictions.push({
        action: 'ask_technical_question',
        probability: 0.4,
        timeframe: '30m'
      });
      predictions.push({
        action: 'share_code_snippet',
        probability: 0.3,
        timeframe: '1h'
      });
    }
    
    if (pattern.favoriteTopics.includes('gaming')) {
      predictions.push({
        action: 'discuss_game',
        probability: 0.3,
        timeframe: '1h'
      });
    }
    
    if (pattern.detectedLanguages.length > 0) {
      predictions.push({
        action: 'discuss_programming_language',
        probability: 0.3,
        timeframe: '2h'
      });
    }
  }

  private addBehaviorPredictions(
    predictions: ActionPrediction[],
    pattern: UserBehaviorPattern
  ): void {
    if (pattern.roastResistance < 3) {
      predictions.push({
        action: 'react_emotionally',
        probability: 0.3,
        timeframe: '5m'
      });
    } else if (pattern.roastResistance > 7) {
      predictions.push({
        action: 'respond_confidently',
        probability: 0.4,
        timeframe: '10m'
      });
    }
    
    if (pattern.complexityScore > 7) {
      predictions.push({
        action: 'engage_technical_discussion',
        probability: 0.5,
        timeframe: '15m'
      });
    }
  }

  private normalizePredictions(predictions: ActionPrediction[]): ActionPrediction[] {
    // Calculate total probability
    const totalProbability = predictions.reduce((sum, pred) => sum + pred.probability, 0);
    
    // Normalize if needed
    if (totalProbability > 1) {
      predictions.forEach(pred => {
        pred.probability = pred.probability / totalProbability;
      });
    }
    
    // Sort by probability descending
    return predictions.sort((a, b) => b.probability - a.probability);
  }

  private calculateLengthScore(message: string): number {
    const length = message.length;
    if (length > 500) return 2.0;
    if (length > 200) return 1.0;
    if (length < 20) return -1.0;
    return 0;
  }

  private calculateVocabularyScore(message: string): number {
    const technicalTerms = /\b(algorithm|implementation|architecture|optimization|refactor|abstraction|polymorphism|inheritance|asynchronous|synchronous|middleware|framework|library|dependency|deployment|scalability|performance|security|authentication|authorization|encryption|database|normalization|indexing|caching|load balancing|microservices|containerization|orchestration|devops|ci\/cd|version control|repository|branch|merge|commit|pull request|api|rest|graphql|json|xml|http|https|tcp|udp|ssl|tls|oauth|jwt|cors|sql injection|xss|csrf)\b/gi;
    const matches = (message.match(technicalTerms) || []).length;
    return Math.min(matches * 0.5, 2.0);
  }

  private calculateCodeScore(message: string): number {
    let score = 0;
    if (/```[\s\S]*```/g.test(message)) score += 1.5;
    if (/`[^`]+`/g.test(message)) score += 0.5;
    if (/\b(function|class|const|let|var|if|for|while|try|catch|async|await)\b/gi.test(message)) score += 1.0;
    return score;
  }

  private calculateStructureScore(message: string): number {
    let score = 0;
    const sentences = message.split(/[.!?]+/).length - 1;
    if (sentences > 3) score += 0.5;
    
    const parentheses = (message.match(/\([^)]*\)/g) || []).length;
    if (parentheses > 2) score += 0.5;
    
    if (/[=+\-*/^%]|\\[a-z]+|_{[^}]+}|\^{[^}]+}/g.test(message)) score += 0.5;
    
    return score;
  }

  private calculateLengthEngagement(message: string): number {
    if (message.length > 300) return 0.4;
    if (message.length > 100) return 0.2;
    return 0.1;
  }

  private calculateInteractivityScore(message: string): number {
    let score = 0;
    const questionMarks = (message.match(/\?/g) || []).length;
    score += Math.min(questionMarks * 0.1, 0.3);
    
    const exclamationMarks = (message.match(/!/g) || []).length;
    score += Math.min(exclamationMarks * 0.05, 0.2);
    
    return score;
  }

  private calculateMediaEngagement(context: MessageContext): number {
    if (context.imageAttachments && context.imageAttachments.length > 0) {
      return 0.3;
    }
    return 0;
  }
}