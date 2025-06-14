/**
 * Resilience Module Exports
 * 
 * Provides circuit breaker and fallback management components
 * for building resilient services that gracefully degrade
 * during failures.
 */

// Main service export
export { GracefulDegradation } from './GracefulDegradation';

// Circuit breaker exports
export { 
  CircuitBreaker,
  createCircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type RecoveryMetrics
} from './CircuitBreaker';

// Fallback manager exports
export {
  FallbackManager,
  type FallbackConfig,
  type FallbackStrategy,
  type FallbackContext,
  type QueuedMessage,
  type QueueMetrics
} from './FallbackManager';

// Utility functions
export {
  assessHealthBasedDegradation,
  loadDegradationConfig,
  convertCircuitState
} from './utils';

// Re-export interfaces for convenience
export type {
  IGracefulDegradationService,
  DegradationDecision,
  DegradationStatus,
  CircuitBreakerState
} from '../interfaces/GracefulDegradationInterfaces';