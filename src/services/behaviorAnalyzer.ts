/**
 * Behavioral Pattern Recognition Service - Main Export
 * 
 * Re-exports the refactored modular BehaviorAnalyzer for backward compatibility.
 * The implementation has been split into specialized modules for better maintainability.
 */

export { BehaviorAnalyzer } from './analytics/behavior/BehaviorAnalyzer';
export type { UserBehaviorPattern } from './analytics/behavior/types';