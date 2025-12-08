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

// Discord circuit breaker exports
export {
  DiscordCircuitBreaker,
  createDiscordCircuitBreaker,
  type DiscordCircuitBreakerConfig,
  type IFallbackService,
  type DiscordError,
  type CircuitBreakerStatus
} from './DiscordCircuitBreaker';

// Service circuit breakers exports
export {
  ServiceCircuitBreakers,
  createServiceCircuitBreakers,
  type ServiceCircuitBreakersConfig,
  type ServiceMetrics
} from './ServiceCircuitBreakers';

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

// Health integration exports
export {
  CircuitBreakerHealthIntegration,
  createCircuitBreakerHealthIntegration,
  circuitBreakerHealthIntegration,
  type CircuitBreakerHealthMetrics,
  type CircuitBreakerAlert
} from './CircuitBreakerHealthIntegration';

// Re-export interfaces for convenience
export type {
  IGracefulDegradationService,
  DegradationDecision,
  DegradationStatus,
  CircuitBreakerState
} from '../interfaces/GracefulDegradationInterfaces';