/**
 * Legacy Roasting Engine - Compatibility Layer
 * 
 * This file provides backward compatibility by re-exporting the modular 
 * RoastingEngine. All new implementations should use the modular structure
 * in the roasting/ directory.
 */

// Re-export the modular implementation
export { RoastingEngine } from './roasting/RoastingEngine';

// Re-export types for backward compatibility
export type { UserQuestionStats } from './roasting/types';