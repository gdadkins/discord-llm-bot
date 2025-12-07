/**
 * Behavior Analytics Module - Export
 * 
 * Provides behavioral pattern recognition, anomaly detection, and prediction services.
 */

export { BehaviorAnalyzer } from './BehaviorAnalyzer';
export { PatternDetector } from './PatternDetector';
export { BehaviorPredictor } from './BehaviorPredictor';
export type { 
  UserBehaviorPattern, 
  BehaviorMetrics,
  MessageMetrics,
  BEHAVIOR_CONSTANTS 
} from './types';
export type {
  PatternDetectionConfig
} from './PatternDetector';
export type {
  PredictionConfig,
  EngagementMetrics,
  ComplexityMetrics
} from './BehaviorPredictor';