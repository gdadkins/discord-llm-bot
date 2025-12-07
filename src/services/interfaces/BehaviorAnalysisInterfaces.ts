/**
 * Behavior Analysis Service Interface Definitions
 * 
 * Interfaces for user behavior analysis, pattern detection, and predictions.
 */

import type { MessageContext } from '../../commands';
import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Behavior Analysis Service Interfaces
// ============================================================================

export interface IBehaviorAnalyzer extends IService {
  /**
   * Pattern analysis
   */
  analyzeUserBehavior(userId: string, message: string, context: MessageContext): Promise<BehaviorAnalysis>;
  detectPatterns(userId: string): UserPatterns;
  
  /**
   * Anomaly detection
   */
  detectAnomalies(userId: string, behavior: BehaviorAnalysis): AnomalyDetection[];
  
  /**
   * Predictions
   */
  predictNextAction(userId: string): ActionPrediction[];
  predictUserIntent(message: string, context: MessageContext): IntentPrediction;
}

export interface BehaviorAnalysis {
  userId: string;
  timestamp: number;
  messageLength: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  engagement: number;
  patterns: string[];
}

export interface UserPatterns {
  userId: string;
  activityPatterns: {
    peakHours: number[];
    averageMessageLength: number;
    preferredChannels: string[];
  };
  communicationPatterns: {
    dominantSentiment: string;
    topicPreferences: string[];
    responseTime: number;
  };
  socialPatterns: {
    frequentInteractions: string[];
    groupDynamics: string[];
  };
}

export interface AnomalyDetection {
  type: 'activity' | 'sentiment' | 'pattern';
  severity: 'low' | 'medium' | 'high';
  description: string;
  confidence: number;
}

export interface ActionPrediction {
  action: string;
  probability: number;
  timeframe: string;
}

export interface IntentPrediction {
  intent: string;
  confidence: number;
  entities: Array<{ type: string; value: string }>;
}