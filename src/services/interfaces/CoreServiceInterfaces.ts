/**
 * Core Service Interface Definitions
 * 
 * Base interfaces and types that all services must implement.
 * Foundation for the service architecture.
 */

// ============================================================================
// Core Service Interfaces
// ============================================================================

/**
 * Base service interface that all services must implement
 * 
 * ## Contract Guarantees
 * - All services MUST implement this interface
 * - Initialization is idempotent (safe to call multiple times)
 * - Shutdown is graceful and releases all resources
 * - Health status reflects actual service state
 * 
 * ## Lifecycle Contract
 * 1. Services start in uninitialized state
 * 2. `initialize()` must be called before any service operations
 * 3. `shutdown()` must be called to properly release resources
 * 4. After shutdown, service cannot be reused (create new instance)
 * 
 * ## Error Handling
 * - Initialization failures MUST throw ServiceInitializationError
 * - Health status MUST reflect actual operational state
 * - Services MUST handle shutdown gracefully even if partially initialized
 * 
 * @example
 * ```typescript
 * const service = new MyService();
 * try {
 *   await service.initialize();
 *   const health = await service.getHealthStatus();
 *   // Use service...
 * } finally {
 *   await service.shutdown();
 * }
 * ```
 */
export interface IService {
  /**
   * Initializes the service and any required resources
   * 
   * ## Contract
   * - MUST be idempotent (safe to call multiple times)
   * - MUST complete successfully before service can be used
   * - MUST throw ServiceInitializationError on failure
   * - SHOULD validate all configuration and dependencies
   * - SHOULD set up any required connections or resources
   * 
   * ## Side Effects
   * - May create files, directories, or database connections
   * - May register event listeners or start background processes
   * - May validate and cache configuration
   * 
   * @throws {ServiceInitializationError} If initialization fails due to:
   *   - Invalid configuration
   *   - Missing dependencies
   *   - Resource allocation failures
   *   - Network connectivity issues
   * 
   * @example
   * ```typescript
   * await service.initialize();
   * // Service is now ready for use
   * ```
   */
  initialize(): Promise<void>;
  
  /**
   * Gracefully shuts down the service and cleans up resources
   * 
   * ## Contract
   * - MUST release all acquired resources (connections, files, timers)
   * - MUST be safe to call multiple times
   * - MUST complete within reasonable time (30s recommended)
   * - SHOULD save any pending state before shutdown
   * - MUST NOT throw exceptions (log errors instead)
   * 
   * ## Side Effects
   * - Closes database connections and file handles
   * - Removes event listeners and stops background processes
   * - Flushes any pending operations
   * - Clears internal caches and state
   * 
   * @example
   * ```typescript
   * await service.shutdown();
   * // Service is now safely shut down
   * ```
   */
  shutdown(): Promise<void>;
  
  /**
   * Returns the current health status of the service
   * 
   * ## Contract
   * - MUST return current operational state
   * - MUST be lightweight (no expensive operations)
   * - SHOULD include meaningful error information
   * - MAY include performance metrics
   * - MUST be safe to call frequently
   * 
   * ## Health Criteria
   * - healthy: true if service is fully operational
   * - healthy: false if service has critical errors
   * - errors: array of current error messages
   * - metrics: optional performance/operational data
   * 
   * @returns {ServiceHealthStatus | Promise<ServiceHealthStatus>} Current health status
   * 
   * @example
   * ```typescript
   * const health = await service.getHealthStatus();
   * if (!health.healthy) {
   *   console.error('Service unhealthy:', health.errors);
   * }
   * ```
   */
  getHealthStatus(): ServiceHealthStatus | Promise<ServiceHealthStatus>;
}

/**
 * Health status for a service
 * 
 * ## Contract
 * - Represents current operational state of a service
 * - Must accurately reflect service capabilities
 * - Should include actionable error information
 * 
 * @example
 * ```typescript
 * const status: ServiceHealthStatus = {
 *   healthy: false,
 *   name: 'DatabaseService',
 *   errors: ['Connection timeout', 'Invalid credentials'],
 *   metrics: {
 *     connectionCount: 5,
 *     lastSuccessfulQuery: Date.now() - 30000,
 *     queryLatencyMs: 250
 *   }
 * };
 * ```
 */
export interface ServiceHealthStatus {
  /** Whether the service is currently operational and can handle requests */
  healthy: boolean;
  
  /** Human-readable name of the service for identification */
  name: string;
  
  /** Array of current error messages (empty if healthy) */
  errors: string[];
  
  /** Optional performance and operational metrics */
  metrics?: Record<string, unknown>;
}

/**
 * Service initialization error
 * 
 * Thrown when a service fails to initialize properly.
 * Contains specific information about the failure for debugging.
 * 
 * @example
 * ```typescript
 * try {
 *   await service.initialize();
 * } catch (error) {
 *   if (error instanceof ServiceInitializationError) {
 *     console.error('Service failed to start:', error.message);
 *   }
 * }
 * ```
 */
export class ServiceInitializationError extends Error {
  /**
   * Creates a new service initialization error
   * 
   * @param serviceName Name of the service that failed to initialize
   * @param reason Specific reason for the initialization failure
   */
  constructor(serviceName: string, reason: string) {
    super(`Failed to initialize ${serviceName}: ${reason}`);
    this.name = 'ServiceInitializationError';
  }
}

// ============================================================================
// Service Registry Interface
// ============================================================================

/**
 * Service registry for dependency injection and lifecycle management
 * 
 * ## Contract Guarantees
 * - Thread-safe service registration and retrieval
 * - Automatic dependency resolution and initialization ordering
 * - Graceful shutdown with proper cleanup
 * - Health monitoring for all registered services
 * 
 * ## Lifecycle Management
 * 1. Services are registered but not initialized
 * 2. `initializeAll()` initializes services in dependency order
 * 3. `shutdownAll()` shuts down services in reverse order
 * 4. Registry can be reused after shutdown with new services
 * 
 * @example
 * ```typescript
 * const registry = new ServiceRegistry();
 * registry.register('database', new DatabaseService());
 * registry.register('api', new ApiService());
 * 
 * await registry.initializeAll();
 * const api = registry.getRequired<ApiService>('api');
 * // Use services...
 * await registry.shutdownAll();
 * ```
 */
export interface IServiceRegistry {
  /**
   * Registers a service instance with the registry
   * 
   * ## Contract
   * - MUST store service for later retrieval
   * - MUST allow overwriting existing registrations
   * - MUST NOT initialize the service during registration
   * - SHOULD validate service implements IService interface
   * 
   * @param name Unique identifier for the service
   * @param service Service instance to register
   * 
   * @example
   * ```typescript
   * registry.register('myService', new MyService());
   * ```
   */
  register<T extends IService>(name: string, service: T): void;
  
  /**
   * Retrieves a registered service by name
   * 
   * ## Contract
   * - MUST return undefined if service not found
   * - MUST return the exact service instance that was registered
   * - SHOULD be type-safe with generic parameter
   * 
   * @param name Service identifier
   * @returns Service instance or undefined if not found
   * 
   * @example
   * ```typescript
   * const service = registry.get<MyService>('myService');
   * if (service) {
   *   // Use service
   * }
   * ```
   */
  get<T extends IService>(name: string): T | undefined;
  
  /**
   * Retrieves a required service by name
   * 
   * ## Contract
   * - MUST throw ServiceNotFoundError if service not found
   * - MUST return the exact service instance that was registered
   * - SHOULD be type-safe with generic parameter
   * 
   * @param name Service identifier
   * @returns Service instance
   * @throws {ServiceNotFoundError} If service is not registered
   * 
   * @example
   * ```typescript
   * const service = registry.getRequired<MyService>('myService');
   * // Service is guaranteed to exist
   * ```
   */
  getRequired<T extends IService>(name: string): T;
  
  /**
   * Initializes all registered services in dependency order
   * 
   * ## Contract
   * - MUST initialize services in correct dependency order
   * - MUST stop initialization if any service fails
   * - MUST provide meaningful error messages on failure
   * - SHOULD track initialization progress
   * 
   * ## Side Effects
   * - Calls initialize() on all registered services
   * - May create resources, connections, or start background processes
   * 
   * @throws {ServiceInitializationError} If any service fails to initialize
   * 
   * @example
   * ```typescript
   * await registry.initializeAll();
   * // All services are now ready
   * ```
   */
  initializeAll(): Promise<void>;
  
  /**
   * Shuts down all registered services in reverse dependency order
   * 
   * ## Contract
   * - MUST shutdown services in reverse dependency order
   * - MUST continue shutdown even if individual services fail
   * - MUST log but not throw errors during shutdown
   * - SHOULD complete within reasonable time
   * 
   * ## Side Effects
   * - Calls shutdown() on all registered services
   * - Releases resources, closes connections, stops processes
   * 
   * @example
   * ```typescript
   * await registry.shutdownAll();
   * // All services are now safely shut down
   * ```
   */
  shutdownAll(): Promise<void>;
  
  /**
   * Gets health status for all registered services
   * 
   * ## Contract
   * - MUST return health status for all registered services
   * - MUST handle individual service health check failures
   * - SHOULD complete quickly (suitable for monitoring)
   * 
   * @returns Map of service names to their health status
   * 
   * @example
   * ```typescript
   * const healthMap = await registry.getHealthStatus();
   * for (const [name, status] of healthMap) {
   *   if (!status.healthy) {
   *     console.error(`Service ${name} is unhealthy:`, status.errors);
   *   }
   * }
   * ```
   */
  getHealthStatus(): Promise<Map<string, ServiceHealthStatus>>;
  
  /**
   * Checks if all registered services are healthy
   * 
   * ## Contract
   * - MUST return true only if ALL services are healthy
   * - MUST return false if ANY service is unhealthy
   * - SHOULD be optimized for quick health checks
   * 
   * @returns True if all services are healthy, false otherwise
   * 
   * @example
   * ```typescript
   * if (await registry.isHealthy()) {
   *   console.log('All systems operational');
   * } else {
   *   console.error('System degraded');
   * }
   * ```
   */
  isHealthy(): Promise<boolean>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Service not found error
 * 
 * Thrown when attempting to retrieve a service that is not registered.
 * 
 * @example
 * ```typescript
 * try {
 *   const service = registry.getRequired('nonexistent');
 * } catch (error) {
 *   if (error instanceof ServiceNotFoundError) {
 *     console.error('Service not available:', error.message);
 *   }
 * }
 * ```
 */
export class ServiceNotFoundError extends Error {
  /**
   * Creates a new service not found error
   * 
   * @param serviceName Name of the service that was not found
   */
  constructor(serviceName: string) {
    super(`Service '${serviceName}' not found in registry`);
    this.name = 'ServiceNotFoundError';
  }
}

/**
 * Service dependency error
 * 
 * Thrown when a service is missing a required dependency.
 * 
 * @example
 * ```typescript
 * try {
 *   await service.initialize();
 * } catch (error) {
 *   if (error instanceof ServiceDependencyError) {
 *     console.error('Missing dependency:', error.message);
 *   }
 * }
 * ```
 */
export class ServiceDependencyError extends Error {
  /**
   * Creates a new service dependency error
   * 
   * @param serviceName Name of the service with the missing dependency
   * @param dependency Name of the missing dependency
   */
  constructor(serviceName: string, dependency: string) {
    super(`Service '${serviceName}' missing required dependency '${dependency}'`);
    this.name = 'ServiceDependencyError';
  }
}

/**
 * Service configuration error
 * 
 * Thrown when a service has invalid or missing configuration.
 * 
 * @example
 * ```typescript
 * try {
 *   await service.initialize();
 * } catch (error) {
 *   if (error instanceof ServiceConfigurationError) {
 *     console.error('Configuration issue:', error.message);
 *   }
 * }
 * ```
 */
export class ServiceConfigurationError extends Error {
  /**
   * Creates a new service configuration error
   * 
   * @param serviceName Name of the service with configuration issues
   * @param message Specific configuration error message
   */
  constructor(serviceName: string, message: string) {
    super(`Service '${serviceName}' configuration error: ${message}`);
    this.name = 'ServiceConfigurationError';
  }
}