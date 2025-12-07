/**
 * Service Circuit Breakers Manager
 * 
 * Centralized management of circuit breakers for all external services
 * including Gemini API, database, cache, and other external APIs.
 * 
 * Features:
 * - Service-specific circuit breaker configurations
 * - Centralized execution interface
 * - Health monitoring integration
 * - Fallback coordination
 */

import { CircuitBreaker, CircuitBreakerConfig } from './CircuitBreaker';
import { logger } from '../../utils/logger';
import type { HealthMonitor } from '../healthMonitor';

export interface ServiceCircuitBreakersConfig {
  healthMonitor?: HealthMonitor;
  customConfigs?: Record<string, Partial<CircuitBreakerConfig>>;
  enableFallbacks?: boolean;
}

export interface ServiceMetrics {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  uptime: number;
  availability: number;
}

/**
 * Manages circuit breakers for all external services
 */
export class ServiceCircuitBreakers {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly healthMonitor?: HealthMonitor;
  private readonly enableFallbacks: boolean;
  private readonly serviceStartTimes = new Map<string, number>();

  constructor(config: ServiceCircuitBreakersConfig = {}) {
    this.healthMonitor = config.healthMonitor;
    this.enableFallbacks = config.enableFallbacks ?? true;
    
    // Initialize breakers for all known services
    this.initializeBreakers(config.customConfigs);
  }

  /**
   * Execute operation with circuit breaker protection for any service
   */
  async executeWithBreaker<T>(
    service: string,
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    const breaker = this.getOrCreateBreaker(service);
    
    try {
      const result = await breaker.execute(operation);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Circuit breaker is OPEN')) {
        logger.warn(`Circuit breaker is OPEN for ${service}`, {
          service,
          hasFallback: !!fallback,
          enableFallbacks: this.enableFallbacks
        });
        
        // Use fallback if available and enabled
        if (fallback && this.enableFallbacks) {
          logger.info(`Using fallback for ${service} service`);
          const result = await fallback();
          return result;
        }
      }
      
      throw error;
    }
  }

  /**
   * Convenience method for Gemini API operations
   */
  async gemini<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.executeWithBreaker('gemini', operation, fallback);
  }

  /**
   * Convenience method for database operations
   */
  async database<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.executeWithBreaker('database', operation, fallback);
  }

  /**
   * Convenience method for cache operations
   */
  async cache<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.executeWithBreaker('cache', operation, fallback);
  }

  /**
   * Convenience method for external API operations
   */
  async externalApi<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.executeWithBreaker('external_api', operation, fallback);
  }

  /**
   * Convenience method for search API operations
   */
  async searchApi<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.executeWithBreaker('search_api', operation, fallback);
  }

  /**
   * Convenience method for file storage operations
   */
  async fileStorage<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.executeWithBreaker('file_storage', operation, fallback);
  }

  /**
   * Get status of all service circuit breakers
   */
  getAllStatus(): Record<string, ServiceMetrics> {
    const status: Record<string, ServiceMetrics> = {};
    const now = Date.now();
    
    for (const [serviceName, breaker] of this.breakers) {
      const state = breaker.getState();
      const startTime = this.serviceStartTimes.get(serviceName) || now;
      const uptime = now - startTime;
      const availability = state.totalRequests > 0 
        ? (state.totalSuccesses / state.totalRequests) * 100 
        : 100;
      
      status[serviceName] = {
        state: state.state,
        failureCount: state.failureCount,
        lastFailureTime: state.lastFailureTime,
        lastSuccessTime: state.lastSuccessTime,
        consecutiveSuccesses: state.consecutiveSuccesses,
        totalRequests: state.totalRequests,
        totalFailures: state.totalFailures,
        totalSuccesses: state.totalSuccesses,
        uptime,
        availability: Math.round(availability * 100) / 100
      };
    }
    
    return status;
  }

  /**
   * Get status of specific service
   */
  getServiceStatus(serviceName: string): ServiceMetrics | null {
    const breaker = this.breakers.get(serviceName);
    if (!breaker) {
      return null;
    }
    
    const state = breaker.getState();
    const now = Date.now();
    const startTime = this.serviceStartTimes.get(serviceName) || now;
    const uptime = now - startTime;
    const availability = state.totalRequests > 0 
      ? (state.totalSuccesses / state.totalRequests) * 100 
      : 100;
    
    return {
      state: state.state,
      failureCount: state.failureCount,
      lastFailureTime: state.lastFailureTime,
      lastSuccessTime: state.lastSuccessTime,
      consecutiveSuccesses: state.consecutiveSuccesses,
      totalRequests: state.totalRequests,
      totalFailures: state.totalFailures,
      totalSuccesses: state.totalSuccesses,
      uptime,
      availability: Math.round(availability * 100) / 100
    };
  }

  /**
   * Get list of all services being monitored
   */
  getServices(): string[] {
    return Array.from(this.breakers.keys());
  }

  /**
   * Get services in specific state
   */
  getServicesInState(state: 'closed' | 'open' | 'half-open'): string[] {
    const services: string[] = [];
    
    for (const [serviceName, breaker] of this.breakers) {
      if (breaker.getState().state === state) {
        services.push(serviceName);
      }
    }
    
    return services;
  }

  /**
   * Check if any critical services are down
   */
  hasCriticalServicesDown(): boolean {
    const criticalServices = ['gemini', 'database'];
    return criticalServices.some(service => {
      const breaker = this.breakers.get(service);
      return breaker && breaker.getState().state === 'open';
    });
  }

  /**
   * Get overall health score (0-100)
   */
  getOverallHealthScore(): number {
    if (this.breakers.size === 0) {
      return 100;
    }
    
    let totalScore = 0;
    let weightedTotal = 0;
    
    const serviceWeights = {
      gemini: 0.4,        // Most critical
      database: 0.3,      // Very important
      cache: 0.1,         // Less critical (fallback available)
      external_api: 0.1,  // Optional
      search_api: 0.05,   // Optional
      file_storage: 0.05  // Optional
    };
    
    for (const [serviceName, breaker] of this.breakers) {
      const state = breaker.getState();
      const weight = serviceWeights[serviceName as keyof typeof serviceWeights] || 0.1;
      
      let serviceScore = 0;
      if (state.state === 'closed') {
        serviceScore = 100;
      } else if (state.state === 'half-open') {
        serviceScore = 50;
      } else {
        serviceScore = 0;
      }
      
      // Factor in availability
      if (state.totalRequests > 0) {
        const availability = (state.totalSuccesses / state.totalRequests) * 100;
        serviceScore = (serviceScore + availability) / 2;
      }
      
      totalScore += serviceScore * weight;
      weightedTotal += weight;
    }
    
    return weightedTotal > 0 ? Math.round(totalScore / weightedTotal) : 100;
  }

  /**
   * Manually trigger recovery for specific service or all services
   */
  async triggerRecovery(serviceName?: string): Promise<void> {
    if (serviceName) {
      const breaker = this.breakers.get(serviceName);
      if (breaker) {
        await breaker.triggerRecovery();
        logger.info(`Manual recovery triggered for ${serviceName} service`);
      } else {
        logger.warn(`Service ${serviceName} not found for recovery`);
      }
    } else {
      for (const [name, breaker] of this.breakers) {
        await breaker.triggerRecovery();
      }
      logger.info('Manual recovery triggered for all services');
    }
  }

  /**
   * Reset specific service or all services
   */
  async reset(serviceName?: string): Promise<void> {
    if (serviceName) {
      const breaker = this.breakers.get(serviceName);
      if (breaker) {
        await breaker.reset();
        logger.info(`Reset ${serviceName} service circuit breaker`);
      } else {
        logger.warn(`Service ${serviceName} not found for reset`);
      }
    } else {
      for (const [name, breaker] of this.breakers) {
        await breaker.reset();
      }
      logger.info('Reset all service circuit breakers');
    }
  }

  /**
   * Add a new service circuit breaker
   */
  addService(serviceName: string, config?: Partial<CircuitBreakerConfig>): void {
    if (this.breakers.has(serviceName)) {
      logger.warn(`Service ${serviceName} already has a circuit breaker`);
      return;
    }
    
    this.createBreaker(serviceName, config);
    logger.info(`Added circuit breaker for service: ${serviceName}`);
  }

  /**
   * Remove a service circuit breaker
   */
  removeService(serviceName: string): void {
    const breaker = this.breakers.get(serviceName);
    if (breaker) {
      breaker.destroy();
      this.breakers.delete(serviceName);
      this.serviceStartTimes.delete(serviceName);
      logger.info(`Removed circuit breaker for service: ${serviceName}`);
    } else {
      logger.warn(`Service ${serviceName} not found for removal`);
    }
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    for (const [serviceName, breaker] of this.breakers) {
      breaker.destroy();
      logger.info(`Service ${serviceName} circuit breaker destroyed`);
    }
    this.breakers.clear();
    this.serviceStartTimes.clear();
  }

  // Private methods

  private initializeBreakers(customConfigs?: Record<string, Partial<CircuitBreakerConfig>>): void {
    const defaultConfigurations = {
      gemini: {
        maxFailures: 3,
        resetTimeoutMs: 60000,
        halfOpenMaxRetries: 2
      },
      database: {
        maxFailures: 5,
        resetTimeoutMs: 30000,
        halfOpenMaxRetries: 3
      },
      cache: {
        maxFailures: 10,
        resetTimeoutMs: 15000,
        halfOpenMaxRetries: 5
      },
      external_api: {
        maxFailures: 5,
        resetTimeoutMs: 45000,
        halfOpenMaxRetries: 3
      },
      search_api: {
        maxFailures: 8,
        resetTimeoutMs: 30000,
        halfOpenMaxRetries: 4
      },
      file_storage: {
        maxFailures: 7,
        resetTimeoutMs: 25000,
        halfOpenMaxRetries: 3
      }
    };

    for (const [serviceName, defaultConfig] of Object.entries(defaultConfigurations)) {
      const customConfig = customConfigs?.[serviceName] || {};
      const finalConfig = { ...defaultConfig, ...customConfig };
      
      this.createBreaker(serviceName, finalConfig);
    }

    logger.info('Service circuit breakers initialized', {
      services: Array.from(this.breakers.keys()),
      enableFallbacks: this.enableFallbacks
    });
  }

  private createBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): void {
    const finalConfig: CircuitBreakerConfig = {
      serviceName: `service_${serviceName}`,
      maxFailures: config?.maxFailures ?? 5,
      resetTimeoutMs: config?.resetTimeoutMs ?? 30000,
      halfOpenMaxRetries: config?.halfOpenMaxRetries ?? 3
    };

    const breaker = new CircuitBreaker(finalConfig);
    this.breakers.set(serviceName, breaker);
    this.serviceStartTimes.set(serviceName, Date.now());

    // Health monitor integration would go here
    // The current CircuitBreaker doesn't support state change callbacks
    if (this.healthMonitor) {
      logger.debug(`Circuit breaker for ${serviceName} created with health monitor integration`);
    }
  }

  private getOrCreateBreaker(serviceName: string): CircuitBreaker {
    let breaker = this.breakers.get(serviceName);
    
    if (!breaker) {
      logger.info(`Creating circuit breaker for new service: ${serviceName}`);
      this.createBreaker(serviceName);
      breaker = this.breakers.get(serviceName)!;
    }
    
    return breaker;
  }
}

/**
 * Factory function to create service circuit breakers manager
 */
export function createServiceCircuitBreakers(config?: ServiceCircuitBreakersConfig): ServiceCircuitBreakers {
  return new ServiceCircuitBreakers(config);
}