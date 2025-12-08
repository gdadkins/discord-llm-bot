/**
 * Health Monitoring System Exports
 * 
 * This module exports all components of the modular health monitoring system,
 * including the main orchestrator, specialized components, types, and interfaces.
 * 
 * @module HealthSystem
 */

// Main orchestrator
export { HealthMonitor } from './HealthMonitor';

// Specialized components
export { HealthMetricsCollector } from './HealthMetricsCollector';
export { HealthStatusEvaluator } from './HealthStatusEvaluator';
export { HealthReportGenerator } from './HealthReportGenerator';

// Types and interfaces
export type {
  // Public API types
  HealthMetrics,
  HealthSnapshot,
  AlertConfig,
  
  // Internal types
  HealthMetricsData,
  AlertState,
  PerformanceBuffer,
  DataStoreHealthResult,
  DetailedDataStoreMetrics,
  DataStorePerformanceBaseline,
  
  // Component interfaces
  IHealthMetricsCollector,
  IHealthStatusEvaluator,
  IHealthReportGenerator,
  
  // Utility types
  AlertType,
  AlertHandler,
} from './types';

// Constants
export { HEALTH_CONSTANTS } from './types';