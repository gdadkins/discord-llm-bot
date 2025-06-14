/**
 * Graceful Degradation Service - Main Orchestrator
 * 
 * Coordinates circuit breakers and fallback strategies to maintain
 * service availability during failures. Implements the main interface
 * while delegating specific responsibilities to specialized modules.
 */

import { BaseService } from '../base/BaseService';
import { CircuitBreaker, createCircuitBreaker } from './CircuitBreaker';
import { FallbackManager, FallbackContext } from './FallbackManager';
import { assessHealthBasedDegradation, loadDegradationConfig, convertCircuitState } from './utils';
import type { HealthMonitor } from '../healthMonitor';
import type { 
  IGracefulDegradationService, 
  DegradationStatus, 
  CircuitBreakerState as IDegradationCircuitBreakerState,
  DegradationDecision
} from '../interfaces/GracefulDegradationInterfaces';
import { DEGRADATION_CONSTANTS } from '../../config/constants';
import { logger } from '../../utils/logger';

export class GracefulDegradation extends BaseService implements IGracefulDegradationService {
  private config: ReturnType<typeof loadDegradationConfig>;
  private healthMonitor: HealthMonitor | null = null;
  
  // Circuit breakers for each service
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  
  // Fallback manager for handling degraded responses
  private fallbackManager: FallbackManager;
  
  // Overall system status
  private overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';

  constructor() {
    super();
    this.config = loadDegradationConfig();
    
    // Initialize circuit breakers
    this.initializeCircuitBreakers();
    
    // Initialize fallback manager
    this.fallbackManager = new FallbackManager({
      enableCachedResponses: this.config.enableCachedResponses,
      enableGenericFallbacks: this.config.enableGenericFallbacks,
      enableMaintenanceMode: this.config.enableMaintenanceMode,
      maxQueueSize: this.config.maxQueueSize,
      maxQueueTimeMs: this.config.maxQueueTimeMs,
      retryIntervalMs: this.config.retryIntervalMs,
      maxRetries: this.config.maxRetries
    });
  }

  protected getServiceName(): string {
    return 'GracefulDegradation';
  }

  protected async performInitialization(): Promise<void> {
    // Start queue processing
    this.createInterval('queueProcessing', async () => {
      await this.processQueuedMessages();
    }, this.config.retryIntervalMs);

    // Start recovery monitoring
    this.createInterval('recoveryMonitoring', async () => {
      await this.performRecoveryAttempts();
    }, this.config.resetTimeoutMs);
    
    logger.info('GracefulDegradation service initialized', {
      config: this.config,
      queueSize: this.fallbackManager.getQueueSize()
    });
  }

  protected async performShutdown(): Promise<void> {
    // Cleanup circuit breakers
    for (const [name, breaker] of this.circuitBreakers) {
      breaker.destroy();
      logger.info(`Circuit breaker for ${name} destroyed`);
    }
    
    // Drain queue with fallback responses
    await this.fallbackManager.drainQueue();
    
    // Cleanup fallback manager
    this.fallbackManager.destroy();
    
    logger.info('GracefulDegradation service shutdown completed');
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    const circuitBreakerStates: Record<string, unknown> = {};
    
    for (const [name, breaker] of this.circuitBreakers) {
      const state = breaker.getState();
      const recovery = breaker.getRecoveryMetrics();
      
      circuitBreakerStates[name] = {
        state: state.state,
        failures: state.failureCount,
        lastFailure: state.lastFailureTime,
        consecutiveSuccesses: state.consecutiveSuccesses,
        totalRequests: state.totalRequests,
        totalFailures: state.totalFailures,
        totalSuccesses: state.totalSuccesses,
        recovery: {
          attempts: recovery.attempts,
          successfulRecoveries: recovery.successfulRecoveries,
          lastAttempt: recovery.lastAttempt,
          averageRecoveryTime: recovery.averageRecoveryTime
        }
      };
    }
    
    const queueMetrics = this.fallbackManager.getQueueMetrics();
    
    return {
      gracefulDegradation: {
        overallStatus: this.overallStatus,
        circuitBreakers: circuitBreakerStates,
        queue: {
          currentSize: queueMetrics.currentSize,
          maxSize: queueMetrics.maxSize,
          messagesProcessed: queueMetrics.messagesProcessed,
          messagesDropped: queueMetrics.messagesDropped,
          messagesExpired: queueMetrics.messagesExpired,
          averageWaitTime: queueMetrics.averageWaitTime
        },
        config: {
          maxFailures: this.config.maxFailures,
          resetTimeoutMs: this.config.resetTimeoutMs,
          memoryThresholdMB: this.config.memoryThresholdMB,
          errorRateThreshold: this.config.errorRateThreshold,
          responseTimeThresholdMs: this.config.responseTimeThresholdMs
        }
      }
    };
  }

  setHealthMonitor(healthMonitor: HealthMonitor): void {
    this.healthMonitor = healthMonitor;
    logger.info('HealthMonitor integration enabled for graceful degradation');
  }

  /**
   * Circuit breaker wrapper for API calls
   */
  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    serviceName: string
  ): Promise<T> {
    const breaker = this.getOrCreateCircuitBreaker(serviceName);
    
    try {
      const result = await breaker.execute(operation);
      this.updateOverallStatus();
      return result;
    } catch (error) {
      this.updateOverallStatus();
      throw error;
    }
  }

  /**
   * Central degradation decision engine
   */
  async shouldDegrade(): Promise<DegradationDecision> {
    // Check circuit breaker states
    const circuitStates = this.getCircuitBreakerStates();
    const openBreakers = circuitStates.filter(([_, state]) => state === 'open');
    
    if (openBreakers.length === this.circuitBreakers.size && this.circuitBreakers.size > 0) {
      return {
        shouldDegrade: true,
        reason: 'All circuit breakers are open',
        severity: 'high'
      };
    }
    
    if (openBreakers.some(([name]) => name === 'gemini')) {
      return {
        shouldDegrade: true,
        reason: 'Gemini API circuit breaker is open',
        severity: 'high'
      };
    }
    
    if (openBreakers.some(([name]) => name === 'discord')) {
      return {
        shouldDegrade: true,
        reason: 'Discord API circuit breaker is open',
        severity: 'medium'
      };
    }
    
    // Check health monitor data if available
    if (this.healthMonitor) {
      const healthData = await this.healthMonitor.getCurrentMetrics();
      const healthDegradation = assessHealthBasedDegradation(healthData, {
        memoryThresholdMB: this.config.memoryThresholdMB,
        errorRateThreshold: this.config.errorRateThreshold,
        responseTimeThresholdMs: this.config.responseTimeThresholdMs
      });
      
      if (healthDegradation.shouldDegrade) {
        return healthDegradation;
      }
    }
    
    // Check queue pressure
    const queueSize = this.fallbackManager.getQueueSize();
    if (queueSize > this.config.maxQueueSize * DEGRADATION_CONSTANTS.QUEUE_PRESSURE_THRESHOLD) {
      return {
        shouldDegrade: true,
        reason: `Message queue pressure: ${queueSize}/${this.config.maxQueueSize}`,
        severity: 'medium'
      };
    }
    
    return {
      shouldDegrade: false,
      reason: 'All systems operational',
      severity: 'low'
    };
  }

  /**
   * Queue message for later processing
   */
  async queueMessage(
    userId: string,
    prompt: string,
    respond: (response: string) => Promise<void>,
    serverId?: string,
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<void> {
    await this.fallbackManager.queueMessage(userId, prompt, respond, serverId, priority);
  }

  /**
   * Generate fallback response
   */
  async generateFallbackResponse(
    prompt: string,
    userId: string,
    serverId?: string
  ): Promise<string> {
    const degradationStatus = await this.shouldDegrade();
    
    const context: FallbackContext = {
      prompt,
      userId,
      serverId,
      severity: degradationStatus.severity,
      degradationReason: degradationStatus.shouldDegrade ? degradationStatus.reason : undefined,
      queueSize: this.fallbackManager.getQueueSize()
    };
    
    return await this.fallbackManager.generateFallbackResponse(context);
  }

  /**
   * Get current system status
   */
  getStatus(): DegradationStatus {
    const circuitBreakers = new Map<string, IDegradationCircuitBreakerState>();
    
    for (const [name, breaker] of this.circuitBreakers) {
      const state = breaker.getState();
      circuitBreakers.set(name, {
        state: convertCircuitState(state.state),
        failures: state.failureCount,
        lastFailure: state.lastFailureTime || null,
        successCount: state.consecutiveSuccesses
      });
    }
    
    const queueMetrics = this.fallbackManager.getQueueMetrics();
    
    // Determine current severity
    let currentSeverity: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (this.overallStatus === 'critical') {
      currentSeverity = 'high';
    } else if (this.overallStatus === 'degraded') {
      currentSeverity = 'medium';
    } else if (queueMetrics.currentSize > this.config.maxQueueSize * 0.5) {
      currentSeverity = 'low';
    }
    
    return {
      circuitBreakers,
      queueSize: queueMetrics.currentSize,
      activeWorkers: 0, // Not tracked in this refactored version
      fallbacksGenerated: 0, // Would need to be tracked if needed
      lastDegradationTime: this.overallStatus !== 'healthy' ? Date.now() : null,
      currentSeverity
    };
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.fallbackManager.getQueueSize();
  }

  /**
   * Manually trigger recovery
   */
  async triggerRecovery(serviceName?: 'gemini' | 'discord'): Promise<void> {
    logger.info(`Manual recovery triggered${serviceName ? ` for ${serviceName}` : ' for all services'}`);
    
    if (serviceName) {
      const breaker = this.circuitBreakers.get(serviceName);
      if (breaker) {
        await breaker.triggerRecovery();
      }
    } else {
      for (const breaker of this.circuitBreakers.values()) {
        await breaker.triggerRecovery();
      }
    }
  }

  // Protected methods for BaseService

  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();
    
    // Check circuit breaker states
    for (const [name, breaker] of this.circuitBreakers) {
      const state = breaker.getState();
      if (state.state === 'open') {
        errors.push(`${name} circuit breaker is OPEN (${state.failureCount} failures)`);
      }
    }
    
    // Check queue status
    const queueSize = this.fallbackManager.getQueueSize();
    if (queueSize > this.config.maxQueueSize * 0.8) {
      errors.push(`Message queue near capacity: ${queueSize}/${this.config.maxQueueSize}`);
    }
    
    // Service is unhealthy if overall status is not healthy
    if (this.overallStatus !== 'healthy') {
      errors.push(`Service status is ${this.overallStatus}`);
    }
    
    return errors;
  }

  protected getServiceSpecificMetrics(): Record<string, unknown> {
    const circuitBreakerMetrics: Record<string, unknown> = {};
    
    for (const [name, breaker] of this.circuitBreakers) {
      const state = breaker.getState();
      circuitBreakerMetrics[name] = {
        state: state.state,
        failures: state.failureCount,
        lastFailure: state.lastFailureTime,
        consecutiveSuccesses: state.consecutiveSuccesses
      };
    }
    
    const queueMetrics = this.fallbackManager.getQueueMetrics();
    
    return {
      queueSize: queueMetrics.currentSize,
      maxQueueSize: this.config.maxQueueSize,
      overallStatus: this.overallStatus,
      circuitBreakers: circuitBreakerMetrics
    };
  }

  // Private methods

  private initializeCircuitBreakers(): void {
    // Create circuit breakers for known services
    this.circuitBreakers.set('gemini', createCircuitBreaker('gemini', {
      maxFailures: this.config.maxFailures,
      resetTimeoutMs: this.config.resetTimeoutMs,
      halfOpenMaxRetries: this.config.halfOpenMaxRetries
    }));
    
    this.circuitBreakers.set('discord', createCircuitBreaker('discord', {
      maxFailures: this.config.maxFailures,
      resetTimeoutMs: this.config.resetTimeoutMs,
      halfOpenMaxRetries: this.config.halfOpenMaxRetries
    }));
  }

  private getOrCreateCircuitBreaker(serviceName: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(serviceName);
    
    if (!breaker) {
      breaker = createCircuitBreaker(serviceName, {
        maxFailures: this.config.maxFailures,
        resetTimeoutMs: this.config.resetTimeoutMs,
        halfOpenMaxRetries: this.config.halfOpenMaxRetries
      });
      
      this.circuitBreakers.set(serviceName, breaker);
      logger.info(`Created new circuit breaker for service: ${serviceName}`);
    }
    
    return breaker;
  }

  private getCircuitBreakerStates(): Array<[string, string]> {
    const states: Array<[string, string]> = [];
    
    for (const [name, breaker] of this.circuitBreakers) {
      states.push([name, breaker.getState().state]);
    }
    
    return states;
  }

  private updateOverallStatus(): void {
    const states = this.getCircuitBreakerStates();
    const openCount = states.filter(([_, state]) => state === 'open').length;
    const totalCount = states.length;
    
    if (openCount === 0) {
      this.overallStatus = 'healthy';
    } else if (openCount === totalCount) {
      this.overallStatus = 'critical';
    } else {
      this.overallStatus = 'degraded';
    }
  }


  private async processQueuedMessages(): Promise<void> {
    const degradationStatus = await this.shouldDegrade();
    
    if (degradationStatus.shouldDegrade && degradationStatus.severity === 'high') {
      // System still too degraded to process queue
      return;
    }
    
    await this.fallbackManager.processQueue(async (message) => {
      try {
        // This would integrate with the actual Gemini service
        // For now, we'll simulate successful processing
        logger.info(`Processing queued message ${message.id}`);
        return true;
      } catch (error) {
        logger.error(`Failed to process message ${message.id}`, { error });
        return false;
      }
    });
  }

  private async performRecoveryAttempts(): Promise<void> {
    for (const [name, breaker] of this.circuitBreakers) {
      const state = breaker.getState();
      if (state.state === 'open') {
        logger.info(`Checking recovery for ${name} circuit breaker`);
        // Recovery is handled automatically by the circuit breaker
        // based on the reset timeout
      }
    }
  }
}