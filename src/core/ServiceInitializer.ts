/**
 * Service Initializer - Comprehensive Initialization with Rollback
 * 
 * Manages service initialization with topological sorting, timeout protection,
 * and automatic rollback on failure. Ensures clean state on initialization
 * errors and provides comprehensive resource management.
 * 
 * Features:
 * - Dependency-aware initialization order
 * - Automatic rollback on any failure
 * - Timeout protection for each service
 * - Resource tracking and cleanup
 * - Graceful shutdown procedures
 * 
 * @module ServiceInitializer
 */

import { logger } from '../utils/logger';
import { enrichError, SystemError } from '../utils/ErrorHandlingUtils';
import { globalResourceManager, ResourceManager } from '../utils/ResourceManager';
import type { IService } from '../services/interfaces';

/**
 * Service definition for initialization
 */
export interface ServiceDefinition {
  name: string;
  factory: () => Promise<IService> | IService;
  dependencies?: string[];
  initTimeout?: number;
  shutdownTimeout?: number;
  critical?: boolean; // If true, failure causes immediate rollback
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Service registry for managing initialized services
 */
export class ServiceRegistry {
  private services = new Map<string, IService>();
  private initializationOrder: string[] = [];

  register(name: string, service: IService): void {
    this.services.set(name, service);
    this.initializationOrder.push(name);
  }

  get(name: string): IService | undefined {
    return this.services.get(name);
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  getAllServices(): Array<[string, IService]> {
    return Array.from(this.services.entries());
  }

  getInitializationOrder(): string[] {
    return [...this.initializationOrder];
  }

  getShutdownOrder(): string[] {
    return [...this.initializationOrder].reverse();
  }

  size(): number {
    return this.services.size;
  }

  clear(): void {
    this.services.clear();
    this.initializationOrder = [];
  }
}

/**
 * Service initialization state tracking
 */
interface ServiceInitState {
  name: string;
  service?: IService;
  cleanup: () => Promise<void>;
  startTime: number;
  endTime?: number;
  attempts: number;
  lastError?: Error;
}

/**
 * Timeout utility with promise support
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: { message: string; context?: Record<string, unknown> }
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new SystemError(
          context.message,
          'TIMEOUT',
          context.context
        )
      );
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Main service initializer with comprehensive error handling and rollback
 */
export class ServiceInitializer {
  private initializationStack: ServiceInitState[] = [];
  private resourceManager = new ResourceManager();
  private isShuttingDown = false;

  /**
   * Initialize services with dependency resolution and rollback support
   */
  async initializeServices(
    serviceDefinitions: ServiceDefinition[]
  ): Promise<ServiceRegistry> {
    const registry = new ServiceRegistry();
    const startTime = Date.now();

    logger.info('Starting service initialization', {
      serviceCount: serviceDefinitions.length,
      services: serviceDefinitions.map(def => ({
        name: def.name,
        dependencies: def.dependencies || [],
        timeout: def.initTimeout || 30000,
        critical: def.critical || false
      }))
    });

    try {
      // Validate service definitions
      this.validateServiceDefinitions(serviceDefinitions);

      // Sort by dependencies using topological sort
      const sorted = this.topologicalSort(serviceDefinitions);
      logger.info('Service initialization order determined', {
        order: sorted.map(def => def.name)
      });

      // Initialize services in dependency order
      for (const definition of sorted) {
        await this.initializeService(definition, registry);
      }

      const totalDuration = Date.now() - startTime;
      logger.info('All services initialized successfully', {
        count: sorted.length,
        duration: totalDuration,
        services: this.initializationStack.map(state => ({
          name: state.name,
          duration: (state.endTime || Date.now()) - state.startTime,
          attempts: state.attempts
        }))
      });

      // Register global cleanup handlers
      this.registerGlobalCleanupHandlers(registry);

      return registry;
    } catch (error) {
      const enrichedError = enrichError(error as Error, {
        phase: 'service-initialization',
        duration: Date.now() - startTime,
        initializedCount: this.initializationStack.length,
        totalCount: serviceDefinitions.length
      });

      logger.error('Service initialization failed, performing rollback', enrichedError);
      await this.rollback();
      throw enrichedError;
    }
  }

  /**
   * Initialize a single service with retry logic
   */
  private async initializeService(
    definition: ServiceDefinition,
    registry: ServiceRegistry
  ): Promise<void> {
    const serviceStart = Date.now();
    const maxAttempts = definition.retryAttempts || 1;
    const retryDelay = definition.retryDelay || 1000;

    const state: ServiceInitState = {
      name: definition.name,
      cleanup: async () => {}, // Will be set after creation
      startTime: serviceStart,
      attempts: 0
    };

    this.initializationStack.push(state);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      state.attempts = attempt;

      try {
        logger.info(`Initializing service: ${definition.name} (attempt ${attempt}/${maxAttempts})`);

        // Create service instance
        const instance = await this.createInstance(definition);
        state.service = instance;

        // Set up cleanup function
        state.cleanup = async () => {
          try {
            if (instance.shutdown) {
              await withTimeout(
                instance.shutdown(),
                definition.shutdownTimeout || 15000,
                {
                  message: `Service ${definition.name} shutdown timeout`,
                  context: { service: definition.name }
                }
              );
            }
          } catch (shutdownError) {
            logger.error(`Failed to shutdown ${definition.name}`, shutdownError);
          }
        };

        // Initialize with timeout
        if (instance.initialize) {
          await withTimeout(
            instance.initialize(),
            definition.initTimeout || 30000,
            {
              message: `Service ${definition.name} initialization timeout`,
              context: { service: definition.name, attempt }
            }
          );
        }

        // Register in service registry
        registry.register(definition.name, instance);

        // Track resources
        this.resourceManager.register({
          type: 'service',
          id: definition.name,
          cleanup: state.cleanup,
          metadata: {
            critical: definition.critical,
            dependencies: definition.dependencies,
            initDuration: Date.now() - serviceStart
          }
        });

        state.endTime = Date.now();
        const duration = state.endTime - serviceStart;

        logger.info(`Service ${definition.name} initialized successfully`, {
          duration,
          attempt,
          maxAttempts
        });

        return; // Success, exit retry loop
      } catch (error) {
        const currentError = enrichError(error as Error, {
          service: definition.name,
          phase: 'initialization',
          attempt,
          maxAttempts,
          duration: Date.now() - serviceStart
        });

        state.lastError = currentError;

        if (attempt === maxAttempts || definition.critical) {
          // Last attempt or critical service failure
          logger.error(`Failed to initialize ${definition.name} after ${attempt} attempts`, currentError);
          throw currentError;
        } else {
          // Retry after delay
          logger.warn(`Service ${definition.name} initialization failed, retrying in ${retryDelay}ms`, {
            attempt,
            maxAttempts,
            error: currentError.message
          });

          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
  }

  /**
   * Create service instance from definition
   */
  private async createInstance(definition: ServiceDefinition): Promise<IService> {
    try {
      const instance = await Promise.resolve(definition.factory());
      
      if (!instance) {
        throw new Error(`Service factory returned null/undefined for ${definition.name}`);
      }

      return instance;
    } catch (error) {
      throw enrichError(error as Error, {
        service: definition.name,
        phase: 'factory-creation'
      });
    }
  }

  /**
   * Perform rollback of all initialized services
   */
  private async rollback(): Promise<void> {
    if (this.initializationStack.length === 0) {
      logger.info('No services to rollback');
      return;
    }

    logger.info('Starting initialization rollback', {
      servicesInitialized: this.initializationStack.length
    });

    // Rollback in reverse order (LIFO)
    const stack = [...this.initializationStack].reverse();
    this.initializationStack = [];

    const rollbackPromises = stack.map(async (state) => {
      const rollbackStart = Date.now();
      
      try {
        logger.info(`Rolling back service: ${state.name}`);
        
        await withTimeout(
          state.cleanup(),
          10000,
          {
            message: `Rollback timeout for ${state.name}`,
            context: { service: state.name }
          }
        );

        const rollbackDuration = Date.now() - rollbackStart;
        logger.info(`Service ${state.name} rolled back successfully`, {
          rollbackDuration
        });

        return { success: true, service: state.name, duration: rollbackDuration };
      } catch (error) {
        const rollbackDuration = Date.now() - rollbackStart;
        const enrichedError = enrichError(error as Error, {
          service: state.name,
          phase: 'rollback',
          duration: rollbackDuration
        });

        logger.error(`Rollback failed for ${state.name}`, enrichedError);
        
        return { 
          success: false, 
          service: state.name, 
          duration: rollbackDuration, 
          error: enrichedError 
        };
      }
    });

    // Execute rollbacks with Promise.allSettled to ensure all are attempted
    const results = await Promise.allSettled(rollbackPromises);
    
    const successful = results.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length;
    
    const failed = results.filter(r => 
      r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
    ).length;

    // Clean up resource manager
    await this.resourceManager.cleanup('service');

    logger.info('Initialization rollback completed', {
      successful,
      failed,
      total: stack.length
    });
  }

  /**
   * Graceful shutdown of all services in registry
   */
  async shutdown(registry: ServiceRegistry): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    const shutdownStart = Date.now();

    try {
      const services = registry.getAllServices();
      const shutdownOrder = registry.getShutdownOrder();

      logger.info('Starting graceful shutdown', {
        serviceCount: services.length,
        order: shutdownOrder
      });

      // Shutdown services in reverse initialization order
      for (const serviceName of shutdownOrder) {
        const service = registry.get(serviceName);
        if (!service) {
          logger.warn(`Service not found during shutdown: ${serviceName}`);
          continue;
        }

        const serviceShutdownStart = Date.now();

        try {
          if (service.shutdown) {
            await withTimeout(
              service.shutdown(),
              15000,
              {
                message: `Service ${serviceName} shutdown timeout`,
                context: { service: serviceName }
              }
            );
          }

          const shutdownDuration = Date.now() - serviceShutdownStart;
          logger.info(`Service ${serviceName} shut down successfully`, {
            duration: shutdownDuration
          });
        } catch (error) {
          const shutdownDuration = Date.now() - serviceShutdownStart;
          const enrichedError = enrichError(error as Error, {
            service: serviceName,
            phase: 'shutdown',
            duration: shutdownDuration
          });

          logger.error(`Failed to shutdown service ${serviceName}`, enrichedError);
          // Continue with other shutdowns
        }
      }

      // Clean up all resources
      await this.resourceManager.cleanup();
      await globalResourceManager.cleanup();

      const totalShutdownDuration = Date.now() - shutdownStart;
      logger.info('Graceful shutdown completed', {
        duration: totalShutdownDuration,
        serviceCount: services.length
      });
    } finally {
      this.isShuttingDown = false;
      registry.clear();
    }
  }

  /**
   * Validate service definitions before initialization
   */
  private validateServiceDefinitions(definitions: ServiceDefinition[]): void {
    const names = new Set<string>();
    const errors: string[] = [];

    for (const def of definitions) {
      // Check for duplicate names
      if (names.has(def.name)) {
        errors.push(`Duplicate service name: ${def.name}`);
      }
      names.add(def.name);

      // Validate required fields
      if (!def.name || typeof def.name !== 'string') {
        errors.push('Service definition missing valid name');
      }
      if (!def.factory || typeof def.factory !== 'function') {
        errors.push(`Service ${def.name} missing valid factory function`);
      }

      // Validate dependencies exist
      if (def.dependencies) {
        for (const dep of def.dependencies) {
          if (!names.has(dep) && !definitions.some(d => d.name === dep)) {
            errors.push(`Service ${def.name} has unknown dependency: ${dep}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new SystemError(
        'Invalid service definitions',
        'VALIDATION_ERROR',
        { errors }
      );
    }
  }

  /**
   * Topological sort for dependency-aware initialization order
   */
  private topologicalSort(definitions: ServiceDefinition[]): ServiceDefinition[] {
    const graph = new Map<string, ServiceDefinition>();
    const inDegree = new Map<string, number>();
    const dependencies = new Map<string, string[]>();

    // Build graph
    for (const def of definitions) {
      graph.set(def.name, def);
      inDegree.set(def.name, 0);
      dependencies.set(def.name, def.dependencies || []);
    }

    // Calculate in-degrees
    for (const [name, deps] of dependencies) {
      for (const dep of deps) {
        if (!graph.has(dep)) {
          throw new SystemError(
            `Service ${name} depends on unknown service: ${dep}`,
            'DEPENDENCY_ERROR',
            { service: name, dependency: dep }
          );
        }
        inDegree.set(name, (inDegree.get(name) || 0) + 1);
      }
    }

    // Kahn's algorithm for topological sorting
    const queue: string[] = [];
    const result: ServiceDefinition[] = [];

    // Find nodes with no incoming edges
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDef = graph.get(current)!;
      result.push(currentDef);

      // Process all services that depend on current service
      for (const [name, deps] of dependencies) {
        if (deps.includes(current)) {
          const newDegree = (inDegree.get(name) || 0) - 1;
          inDegree.set(name, newDegree);
          
          if (newDegree === 0) {
            queue.push(name);
          }
        }
      }
    }

    // Check for cycles
    if (result.length !== definitions.length) {
      const remaining = definitions.filter(def => !result.includes(def));
      throw new SystemError(
        'Circular dependency detected in service definitions',
        'CIRCULAR_DEPENDENCY',
        { 
          sortedServices: result.map(def => def.name),
          remainingServices: remaining.map(def => def.name)
        }
      );
    }

    return result;
  }

  /**
   * Register global cleanup handlers for process exit
   */
  private registerGlobalCleanupHandlers(registry: ServiceRegistry): void {
    const cleanup = async (signal: string) => {
      logger.info(`Received ${signal}, initiating shutdown...`);
      try {
        await this.shutdown(registry);
        process.exit(0);
      } catch (error) {
        logger.error('Error during signal cleanup', error);
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGHUP', () => cleanup('SIGHUP'));

    // Register uncaught exception handler
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception, performing emergency shutdown', error);
      try {
        await this.shutdown(registry);
      } catch (shutdownError) {
        logger.error('Emergency shutdown failed', shutdownError);
      }
      process.exit(1);
    });

    // Register unhandled rejection handler
    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled promise rejection, performing emergency shutdown', {
        reason,
        promise
      });
      try {
        await this.shutdown(registry);
      } catch (shutdownError) {
        logger.error('Emergency shutdown failed', shutdownError);
      }
      process.exit(1);
    });

    globalResourceManager.register({
      type: 'service-registry',
      id: 'main',
      cleanup: () => this.shutdown(registry)
    });
  }

  /**
   * Get initialization statistics
   */
  getInitializationStats(): {
    initialized: number;
    total: number;
    duration: number;
    services: Array<{
      name: string;
      duration: number;
      attempts: number;
      success: boolean;
    }>;
    } {
    return {
      initialized: this.initializationStack.length,
      total: this.initializationStack.length,
      duration: this.initializationStack.length > 0 
        ? Math.max(...this.initializationStack.map(s => (s.endTime || Date.now()) - s.startTime))
        : 0,
      services: this.initializationStack.map(state => ({
        name: state.name,
        duration: (state.endTime || Date.now()) - state.startTime,
        attempts: state.attempts,
        success: !state.lastError
      }))
    };
  }
}

/**
 * Global service initializer instance
 */
export const globalServiceInitializer = new ServiceInitializer();