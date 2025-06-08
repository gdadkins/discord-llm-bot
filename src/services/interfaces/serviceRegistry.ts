/**
 * Service Registry Implementation
 * 
 * Provides centralized service management with dependency injection,
 * lifecycle management, and health monitoring.
 */

import { logger } from '../../utils/logger';
import type {
  IService,
  IServiceRegistry,
  ServiceHealthStatus
} from './index';
import {
  ServiceNotFoundError,
  ServiceDependencyError,
  ServiceInitializationError
} from './index';

export class ServiceRegistry implements IServiceRegistry {
  private services: Map<string, IService> = new Map();
  private initializationOrder: string[] = [];
  private dependencies: Map<string, string[]> = new Map();
  private initialized = false;

  /**
   * Registers a service with optional dependencies
   */
  register<T extends IService>(name: string, service: T): void;
  register<T extends IService>(
    name: string,
    service: T,
    dependencies: string[]
  ): void;
  register<T extends IService>(
    name: string,
    service: T,
    dependencies: string[] = []
  ): void {
    if (this.initialized) {
      throw new Error('Cannot register services after initialization');
    }

    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    this.services.set(name, service);
    this.dependencies.set(name, dependencies);
    
    // Update initialization order based on dependencies
    this.updateInitializationOrder();
    
    logger.info(`Registered service: ${name}`, {
      dependencies: dependencies.length > 0 ? dependencies : 'none'
    });
  }

  /**
   * Gets a service by name
   */
  get<T extends IService>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  /**
   * Gets a required service (throws if not found)
   */
  getRequired<T extends IService>(name: string): T {
    const service = this.get<T>(name);
    if (!service) {
      throw new ServiceNotFoundError(name);
    }
    return service;
  }

  /**
   * Initializes all services in dependency order
   */
  async initializeAll(): Promise<void> {
    if (this.initialized) {
      logger.warn('Services already initialized');
      return;
    }

    logger.info('Starting service initialization...');
    const startTime = Date.now();

    try {
      // Validate all dependencies exist
      this.validateDependencies();

      // Initialize services in order
      for (const serviceName of this.initializationOrder) {
        const service = this.services.get(serviceName);
        if (!service) continue;

        try {
          logger.info(`Initializing service: ${serviceName}`);
          await service.initialize();
          logger.info(`Service initialized: ${serviceName}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new ServiceInitializationError(serviceName, message);
        }
      }

      this.initialized = true;
      const duration = Date.now() - startTime;
      logger.info(`All services initialized successfully in ${duration}ms`);
    } catch (error) {
      logger.error('Service initialization failed:', error);
      // Attempt to shutdown any initialized services
      await this.shutdownAll();
      throw error;
    }
  }

  /**
   * Shuts down all services in reverse order
   */
  async shutdownAll(): Promise<void> {
    logger.info('Starting service shutdown...');
    const startTime = Date.now();

    // Shutdown in reverse initialization order
    const shutdownOrder = [...this.initializationOrder].reverse();

    for (const serviceName of shutdownOrder) {
      const service = this.services.get(serviceName);
      if (!service) continue;

      try {
        logger.info(`Shutting down service: ${serviceName}`);
        await service.shutdown();
        logger.info(`Service shut down: ${serviceName}`);
      } catch (error) {
        // Log but continue shutdown for other services
        logger.error(`Error shutting down service ${serviceName}:`, error);
      }
    }

    this.initialized = false;
    const duration = Date.now() - startTime;
    logger.info(`All services shut down in ${duration}ms`);
  }

  /**
   * Gets health status for all services
   */
  async getHealthStatus(): Promise<Map<string, ServiceHealthStatus>> {
    const healthMap = new Map<string, ServiceHealthStatus>();

    for (const [name, service] of this.services) {
      try {
        const statusResult = service.getHealthStatus();
        const status = await Promise.resolve(statusResult);
        healthMap.set(name, status);
      } catch (error) {
        // If health check fails, consider service unhealthy
        healthMap.set(name, {
          healthy: false,
          name,
          errors: [`Health check failed: ${error}`]
        });
      }
    }

    return healthMap;
  }

  /**
   * Checks if all services are healthy
   */
  async isHealthy(): Promise<boolean> {
    const healthStatuses = await this.getHealthStatus();
    
    for (const [, status] of healthStatuses) {
      if (!status.healthy) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Validates that all declared dependencies exist
   */
  private validateDependencies(): void {
    for (const [serviceName, deps] of this.dependencies) {
      for (const dep of deps) {
        if (!this.services.has(dep)) {
          throw new ServiceDependencyError(serviceName, dep);
        }
      }
    }
  }

  /**
   * Updates initialization order based on dependencies (topological sort)
   */
  private updateInitializationOrder(): void {
    const visited = new Set<string>();
    const order: string[] = [];
    const visiting = new Set<string>();

    const visit = (name: string): void => {
      if (visited.has(name)) return;
      
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected involving service: ${name}`);
      }
      
      visiting.add(name);
      
      const deps = this.dependencies.get(name) || [];
      for (const dep of deps) {
        visit(dep);
      }
      
      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    // Visit all services
    for (const name of this.services.keys()) {
      visit(name);
    }

    this.initializationOrder = order;
  }

  /**
   * Gets service initialization order (for debugging)
   */
  getInitializationOrder(): string[] {
    return [...this.initializationOrder];
  }

  /**
   * Gets service dependencies (for debugging)
   */
  getServiceDependencies(): Map<string, string[]> {
    return new Map(this.dependencies);
  }

  /**
   * Checks if a specific service is registered
   */
  hasService(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Gets all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Clears the registry (useful for testing)
   */
  clear(): void {
    if (this.initialized) {
      throw new Error('Cannot clear registry while services are initialized');
    }
    
    this.services.clear();
    this.dependencies.clear();
    this.initializationOrder = [];
  }
}