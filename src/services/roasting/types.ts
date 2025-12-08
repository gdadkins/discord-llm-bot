/**
 * Shared Type Definitions for Roasting System
 * 
 * Contains all interfaces and types used across the roasting modules
 */

// ============================================================================
// Core Types
// ============================================================================

export interface UserQuestionStats {
  count: number;
  lastRoasted: boolean;
}

export interface RoastingState {
  baseChance: number;
  lastBaseChanceUpdate: number;
  botMood: 'sleepy' | 'caffeinated' | 'chaotic' | 'reverse_psychology' | 'bloodthirsty';
  moodStartTime: number;
  serverRoastHistory: Map<string, { recent: number; lastRoastTime: number }>;
  chaosMode: { active: boolean; endTime: number; multiplier: number };
  roastDebt: Map<string, number>;
}

export interface MoodCache {
  mood: 'sleepy' | 'caffeinated' | 'chaotic' | 'reverse_psychology' | 'bloodthirsty';
  modifiersByCount: Map<number, number>;
  timestamp: number;
}

export interface RoastConfig {
  maxChance: number;
  cooldownAfterRoast: boolean;
}

// ============================================================================
// Strategy Pattern Types
// ============================================================================

export interface RoastingStrategy {
  calculateRoastChance(context: RoastingContext): number;
  shouldOverride(context: RoastingContext): OverrideResult | null;
}

export interface RoastingContext {
  userId: string;
  message: string;
  serverId?: string;
  userStats: UserQuestionStats;
  baseChance: number;
  roastingState: RoastingState;
  calculators: ModifierCalculators;
}

export interface OverrideResult {
  shouldRoast: boolean;
  reason: string;
}

export interface ModifierCalculators {
  consecutive: () => number;
  complexity: () => number;
  time: () => number;
  mood: () => number;
  debt: () => number;
  server: () => number;
}

// ============================================================================
// Calculator Parameter Types
// ============================================================================

export interface ModifierCalculator {
  calculate(params: ComplexityCalculatorParams | ConsecutiveCalculatorParams | TimeCalculatorParams | MoodCalculatorParams | DebtCalculatorParams | ServerCalculatorParams): number;
}

export interface ComplexityCalculatorParams {
  message: string;
}

export interface ConsecutiveCalculatorParams {
  questionCount: number;
}

export interface TimeCalculatorParams {
  hour?: number;
}

export interface MoodCalculatorParams {
  mood: string;
  questionCount: number;
}

export interface DebtCalculatorParams {
  userId: string;
  serverId?: string;
}

export interface ServerCalculatorParams {
  serverId?: string;
}

// ============================================================================
// Chaos Event Types
// ============================================================================

export interface ChaosInfo {
  active: boolean;
  endTime: number;
  multiplier: number;
}