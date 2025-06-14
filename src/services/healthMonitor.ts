/**
 * Health Monitor - Legacy Export
 * 
 * This file provides backward compatibility for the refactored health monitoring system.
 * The HealthMonitor has been refactored into a modular system with specialized components.
 * 
 * @deprecated Use the new modular exports from './health/' instead
 * @module HealthMonitorLegacy
 */

// Re-export the main HealthMonitor class for backward compatibility
export { HealthMonitor } from './health/HealthMonitor';

// Re-export types that were previously defined in this file
export type {
  HealthMetrics,
  HealthSnapshot,
  AlertConfig,
} from './health/types';

// Note: The original HealthMonitor (1,356 lines) has been refactored into:
// - HealthMonitor.ts (Main orchestrator ~300 lines)
// - HealthMetricsCollector.ts (~350 lines) 
// - HealthStatusEvaluator.ts (~350 lines)
// - HealthReportGenerator.ts (~350 lines)
// - types.ts (Comprehensive type definitions)
//
// This provides better separation of concerns, improved testability,
// and enhanced maintainability while preserving all existing functionality.