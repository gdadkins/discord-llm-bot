/**
 * Service Container for Dependency Injection
 *
 * Lightweight DI container with lifecycle management.
 * Supports lazy initialization and proper shutdown ordering.
 */

import { logger } from '../../utils/logger';
import type {
  IService,
  IServiceRegistry,
  ServiceHealthStatus
} from '../interfaces/CoreServiceInterfaces';
import {
  ServiceNotFoundError,
  ServiceInitializationError
} from '../interfaces/CoreServiceInterfaces';
import { ServiceToken, ServiceNames } from './ServiceTokens';

type ServiceFactory<T extends IService> = () => T;

interface ServiceRegistration<T extends IService = IService> {
  factory: ServiceFactory<T>;
  instance?: T;
  dependencies: ServiceToken[];
  initialized: boolean;
}

export class ServiceContainer implements IServiceRegistry {
  private registrations = new Map<ServiceToken, ServiceRegistration>();
  private initializationOrder: ServiceToken[] = [];
  private isShutdown = false;

  /**
   * Registers a service factory with optional dependencies
   */
  registerFactory<T extends IService>(
    token: ServiceToken,
    factory: ServiceFactory<T>,
    dependencies: ServiceToken[] = []
  ): void {
    if (this.isShutdown) {
      throw new Error('Cannot register services after container shutdown');
    }
    this.registrations.set(token, {
      factory,
      dependencies,
      initialized: false
    });
  }

  /**
   * Registers a pre-created service instance
   */
  register<T extends IService>(name: string, service: T): void {
    const token = this.findTokenByName(name);
    if (!token) {
      logger.warn(`No token found for service name: ${name}`);
      return;
    }
    this.registrations.set(token, {
      factory: () => service,
      instance: service,
      dependencies: [],
      initialized: false
    });
  }

  /**
   * Resolves a service by token (lazy initialization)
   */
  resolve<T extends IService>(token: ServiceToken): T {
    const registration = this.registrations.get(token);
    if (!registration) {
      const name = this.getServiceName(token);
      throw new ServiceNotFoundError(name);
    }

    if (!registration.instance) {
      // Resolve dependencies first
      for (const dep of registration.dependencies) {
        this.resolve(dep);
      }
      registration.instance = registration.factory();
    }

    return registration.instance as T;
  }

  /**
   * Gets a service by string name (legacy compatibility)
   */
  get<T extends IService>(name: string): T | undefined {
    const token = this.findTokenByName(name);
    if (!token) return undefined;

    try {
      return this.resolve<T>(token);
    } catch {
      return undefined;
    }
  }

  /**
   * Gets a required service by string name
   */
  getRequired<T extends IService>(name: string): T {
    const service = this.get<T>(name);
    if (!service) {
      throw new ServiceNotFoundError(name);
    }
    return service;
  }

  /**
   * Initializes all registered services in dependency order
   */
  async initializeAll(): Promise<void> {
    if (this.isShutdown) {
      throw new Error('Cannot initialize after container shutdown');
    }

    const sorted = this.topologicalSort();
    this.initializationOrder = sorted;

    for (const token of sorted) {
      const registration = this.registrations.get(token);
      if (!registration) continue;

      const name = this.getServiceName(token);
      try {
        const service = this.resolve(token);
        if (!registration.initialized) {
          logger.info(`Initializing service: ${name}`);
          await service.initialize();
          registration.initialized = true;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ServiceInitializationError(name, message);
      }
    }

    logger.info(`Initialized ${sorted.length} services`);
  }

  /**
   * Shuts down all services in reverse initialization order
   */
  async shutdownAll(): Promise<void> {
    const reversed = [...this.initializationOrder].reverse();

    for (const token of reversed) {
      const registration = this.registrations.get(token);
      if (!registration?.instance || !registration.initialized) continue;

      const name = this.getServiceName(token);
      try {
        logger.info(`Shutting down service: ${name}`);
        await registration.instance.shutdown();
        registration.initialized = false;
      } catch (error) {
        logger.error(`Error shutting down ${name}:`, error);
      }
    }

    this.isShutdown = true;
    logger.info('All services shut down');
  }

  /**
   * Gets health status for all initialized services
   */
  async getHealthStatus(): Promise<Map<string, ServiceHealthStatus>> {
    const results = new Map<string, ServiceHealthStatus>();

    for (const [token, registration] of this.registrations) {
      if (!registration.instance || !registration.initialized) continue;

      const name = this.getServiceName(token);
      try {
        const status = await registration.instance.getHealthStatus();
        results.set(name, status);
      } catch (error) {
        results.set(name, {
          healthy: false,
          name,
          errors: [error instanceof Error ? error.message : 'Health check failed']
        });
      }
    }

    return results;
  }

  /**
   * Checks if all services are healthy
   */
  async isHealthy(): Promise<boolean> {
    const statuses = await this.getHealthStatus();
    for (const status of statuses.values()) {
      if (!status.healthy) return false;
    }
    return true;
  }

  /**
   * Clears all registrations (for testing)
   */
  clear(): void {
    this.registrations.clear();
    this.initializationOrder = [];
    this.isShutdown = false;
  }

  /**
   * Topological sort for dependency ordering
   */
  private topologicalSort(): ServiceToken[] {
    const visited = new Set<ServiceToken>();
    const result: ServiceToken[] = [];

    const visit = (token: ServiceToken) => {
      if (visited.has(token)) return;
      visited.add(token);

      const registration = this.registrations.get(token);
      if (registration) {
        for (const dep of registration.dependencies) {
          visit(dep);
        }
      }
      result.push(token);
    };

    for (const token of this.registrations.keys()) {
      visit(token);
    }

    return result;
  }

  /**
   * Finds token by string name
   */
  private findTokenByName(name: string): ServiceToken | undefined {
    for (const [token, serviceName] of Object.entries(ServiceNames)) {
      if (serviceName === name) {
        return token as unknown as ServiceToken;
      }
    }
    return undefined;
  }

  /**
   * Gets service name from token
   */
  private getServiceName(token: ServiceToken): string {
    return ServiceNames[token] || token.toString();
  }
}

// Global container instance
let globalContainer: ServiceContainer | null = null;

/**
 * Gets or creates the global service container
 */
export function getServiceContainer(): ServiceContainer {
  if (!globalContainer) {
    globalContainer = new ServiceContainer();
  }
  return globalContainer;
}

/**
 * Resets the global container (for testing)
 */
export function resetServiceContainer(): void {
  if (globalContainer) {
    globalContainer.clear();
  }
  globalContainer = null;
}
