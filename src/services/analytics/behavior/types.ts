/**
 * Shared types for behavior analytics modules
 */

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

export interface BehaviorMetrics {
  totalUsers: number;
  activePatterns: number;
  stalePatterns: number;
  averageComplexity: number;
  averageFrequency: number;
}

export interface MessageMetrics {
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  engagement: number;
  patterns: string[];
}

export const BEHAVIOR_CONSTANTS = {
  CACHE_TTL: 365 * 24 * 60 * 60 * 1000, // 1 year
  MAX_TIMESTAMPS: 100,
  STALE_THRESHOLD: 60 * 60 * 1000, // 1 hour
  CLEANUP_THRESHOLD: 24 * 60 * 60 * 1000 // 24 hours
} as const;