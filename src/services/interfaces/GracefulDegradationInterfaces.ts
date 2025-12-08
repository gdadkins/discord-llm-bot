/**
 * Graceful Degradation Service Interface Definitions
 * 
 * Interfaces for circuit breakers, fallback handling, and degradation management.
 */

import type { IService } from './CoreServiceInterfaces';
import type { IHealthMonitor } from './HealthMonitoringInterfaces';

// ============================================================================
// Graceful Degradation Service Interfaces
// ============================================================================

export interface IGracefulDegradationService extends IService {
  /**
   * Circuit breaker operations
   */
  executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    serviceName: string
  ): Promise<T>;
  
  /**
   * Degradation checks
   */
  shouldDegrade(): Promise<DegradationDecision>;
  
  /**
   * Fallback operations
   */
  generateFallbackResponse(prompt: string, userId: string, serverId?: string): Promise<string>;
  
  /**
   * Queue management
   */
  queueMessage(
    userId: string,
    prompt: string,
    respond: (response: string) => Promise<void>,
    serverId?: string,
    priority?: 'low' | 'medium' | 'high'
  ): Promise<void>;
  
  getQueueSize(): number;
  
  /**
   * Recovery operations
   */
  triggerRecovery(serviceName?: 'gemini' | 'discord'): Promise<void>;
  
  /**
   * Status
   */
  getStatus(): DegradationStatus;
  
  /**
   * Dependencies
   */
  setHealthMonitor(healthMonitor: IHealthMonitor): void;
}

export interface DegradationDecision {
  shouldDegrade: boolean;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface DegradationStatus {
  circuitBreakers: Map<string, CircuitBreakerState>;
  queueSize: number;
  activeWorkers: number;
  fallbacksGenerated: number;
  lastDegradationTime: number | null;
  currentSeverity: 'none' | 'low' | 'medium' | 'high';
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure: number | null;
  successCount: number;
}