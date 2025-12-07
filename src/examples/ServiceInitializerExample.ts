/**
 * Service Initializer Usage Example
 * 
 * Demonstrates how to use the ServiceInitializer with proper dependency
 * management, resource tracking, and error handling.
 * 
 * @module ServiceInitializerExample
 */

import { ServiceInitializer, ServiceDefinition, ServiceRegistry } from '../core/ServiceInitializer';
import { BaseService, ServiceState } from '../services/base/BaseService';
import { HealthMonitor } from '../services/health/HealthMonitor';
import { logger } from '../utils/logger';

/**
 * Example service that demonstrates proper BaseService usage
 */
class ExampleCoreService extends BaseService {
  protected getServiceName(): string {
    return 'ExampleCoreService';
  }

  protected async performInitialization(): Promise<void> {
    // Simulate initialization work
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Set up some managed resources
    this.createManagedInterval('heartbeat', () => {
      logger.debug('Example service heartbeat');
    }, 30000, { priority: 'low' });

    logger.info('ExampleCoreService initialized');
  }

  protected async performShutdown(): Promise<void> {
    // Service-specific cleanup
    logger.info('ExampleCoreService shutting down');
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      exampleService: {
        initialized: this.getServiceState() === ServiceState.READY,
        uptime: Date.now()
      }
    };
  }
}

/**
 * Example service that depends on the core service
 */
class ExampleDependentService extends BaseService {
  private coreService?: ExampleCoreService;

  constructor(coreService: ExampleCoreService) {
    super();
    this.coreService = coreService;
  }

  protected getServiceName(): string {
    return 'ExampleDependentService';
  }

  protected async performInitialization(): Promise<void> {
    if (!this.coreService || this.coreService.getServiceState() !== ServiceState.READY) {
      throw new Error('ExampleDependentService requires ExampleCoreService to be ready');
    }

    // Simulate some initialization work
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Register some resources
    this.resources.register({
      type: 'example-resource',
      id: 'main',
      cleanup: async () => {
        logger.info('Cleaning up example resource');
      },
      priority: 'medium'
    });

    logger.info('ExampleDependentService initialized');
  }

  protected async performShutdown(): Promise<void> {
    logger.info('ExampleDependentService shutting down');
    await new Promise(resolve => setTimeout(resolve, 75));
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      dependentService: {
        coreServiceReady: this.coreService?.getServiceState() === ServiceState.READY,
        resourceCount: this.resources.getResourceStats().total
      }
    };
  }
}

/**
 * Demonstrates proper service initialization with dependency management
 */
export async function demonstrateServiceInitialization(): Promise<ServiceRegistry> {
  const initializer = new ServiceInitializer();
  
  // Keep references to services for dependency injection
  let coreService: ExampleCoreService;
  let healthMonitor: HealthMonitor;

  // Define service definitions with proper dependencies
  const serviceDefinitions: ServiceDefinition[] = [
    {
      name: 'HealthMonitor',
      factory: async () => {
        healthMonitor = new HealthMonitor();
        return healthMonitor;
      },
      dependencies: [], // No dependencies
      initTimeout: 30000,
      shutdownTimeout: 15000,
      critical: true, // Critical service - failure causes immediate rollback
      retryAttempts: 2,
      retryDelay: 1000
    },
    {
      name: 'ExampleCoreService',
      factory: async () => {
        coreService = new ExampleCoreService();
        return coreService;
      },
      dependencies: ['HealthMonitor'], // Depends on health monitor
      initTimeout: 20000,
      shutdownTimeout: 10000,
      critical: true,
      retryAttempts: 3,
      retryDelay: 500
    },
    {
      name: 'ExampleDependentService',
      factory: async () => {
        return new ExampleDependentService(coreService);
      },
      dependencies: ['ExampleCoreService'], // Depends on core service
      initTimeout: 25000,
      shutdownTimeout: 12000,
      critical: false, // Non-critical service
      retryAttempts: 2,
      retryDelay: 1500
    }
  ];

  try {
    logger.info('Starting service initialization demonstration');
    
    // Initialize all services with dependency resolution
    const registry = await initializer.initializeServices(serviceDefinitions);
    
    // Demonstrate service usage
    const initStats = initializer.getInitializationStats();
    logger.info('Service initialization completed successfully', {
      totalServices: initStats.total,
      initializationDuration: initStats.duration,
      servicesInitialized: initStats.services.map(s => ({
        name: s.name,
        success: s.success,
        attempts: s.attempts,
        duration: s.duration
      }))
    });

    // Demonstrate service status checking
    for (const [name, service] of registry.getAllServices()) {
      if ('getServiceStatus' in service && typeof service.getServiceStatus === 'function') {
        const status = (service as { getServiceStatus: () => unknown }).getServiceStatus();
        logger.info(`Service status: ${name}`, status);
      }
    }

    return registry;
  } catch (error) {
    logger.error('Service initialization demonstration failed', error);
    throw error;
  }
}

/**
 * Demonstrates proper service shutdown
 */
export async function demonstrateServiceShutdown(
  initializer: ServiceInitializer,
  registry: ServiceRegistry
): Promise<void> {
  try {
    logger.info('Starting service shutdown demonstration');
    
    // Perform graceful shutdown
    await initializer.shutdown(registry);
    
    logger.info('Service shutdown demonstration completed successfully');
  } catch (error) {
    logger.error('Service shutdown demonstration failed', error);
    throw error;
  }
}

/**
 * Complete demonstration including initialization and shutdown
 */
export async function runCompleteDemo(): Promise<void> {
  const initializer = new ServiceInitializer();
  let registry: ServiceRegistry | undefined;

  try {
    // Initialize services
    registry = await demonstrateServiceInitialization();
    
    // Simulate some work
    logger.info('Services running, simulating work for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Shutdown services
    await demonstrateServiceShutdown(initializer, registry);
    
    logger.info('Complete service lifecycle demonstration finished');
  } catch (error) {
    logger.error('Service lifecycle demonstration failed', error);
    
    // Attempt emergency cleanup if needed
    if (registry) {
      try {
        await initializer.shutdown(registry);
      } catch (shutdownError) {
        logger.error('Emergency shutdown also failed', shutdownError);
      }
    }
    
    throw error;
  }
}

/**
 * Demonstrates error handling and rollback
 */
export async function demonstrateErrorHandling(): Promise<void> {
  const initializer = new ServiceInitializer();

  // Create a service definition that will fail
  const faultyServiceDefinitions: ServiceDefinition[] = [
    {
      name: 'HealthMonitor',
      factory: async () => new HealthMonitor(),
      dependencies: [],
      critical: true
    },
    {
      name: 'FaultyService',
      factory: async () => {
        // This will fail during initialization
        throw new Error('Simulated initialization failure');
      },
      dependencies: ['HealthMonitor'],
      critical: true, // Critical failure will trigger rollback
      retryAttempts: 2,
      retryDelay: 100
    }
  ];

  try {
    logger.info('Demonstrating error handling and rollback');
    
    // This should fail and trigger rollback
    await initializer.initializeServices(faultyServiceDefinitions);
    
    // Should not reach here
    throw new Error('Expected initialization to fail');
  } catch (error) {
    logger.info('Error handling demonstration completed successfully', {
      error: error instanceof Error ? error.message : String(error),
      rollbackPerformed: true
    });
  }
}

// Export the classes for use in other modules
export { ExampleCoreService, ExampleDependentService };