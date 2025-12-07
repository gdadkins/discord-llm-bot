/**
 * Roasting System Module Exports
 * 
 * Main export point for the modular roasting system components
 */

export { RoastingEngine } from './RoastingEngine';
export { RoastGenerator } from './RoastGenerator';
export { RoastPersonalizer } from './RoastPersonalizer';
export { ChaosEventManager } from './ChaosEventManager';
export { RoastingDecisionEngine } from './RoastingDecisionEngine';

// Export types for external use
export type {
  UserQuestionStats,
  RoastingState,
  MoodCache,
  RoastConfig,
  RoastingStrategy,
  RoastingContext,
  OverrideResult,
  ModifierCalculators,
  ComplexityCalculatorParams,
  ConsecutiveCalculatorParams,
  TimeCalculatorParams,
  MoodCalculatorParams,
  DebtCalculatorParams,
  ServerCalculatorParams,
  ModifierCalculator,
  ChaosInfo
} from './types';