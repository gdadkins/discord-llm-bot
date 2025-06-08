import { logger } from '../../utils/logger';
import type { IService, ServiceHealthStatus } from '../interfaces';

/**
 * Abstract base class for all services implementing IService interface
 * 
 * Provides template method pattern for service lifecycle management:
 * - Initialize: Sets up service resources with error handling
 * - Shutdown: Gracefully cleans up resources
 * - Health Status: Provides default implementation with extensibility
 * 
 * Subclasses must implement:
 * - getServiceName(): Returns the service name for logging
 * - performInitialization(): Service-specific initialization logic
 * - performShutdown(): Service-specific cleanup logic
 * 
 * Subclasses may optionally override:
 * - getHealthMetrics(): Provide service-specific health metrics
 * - isHealthy(): Custom health check logic
 * - getHealthErrors(): Return current health errors
 */
export abstract class BaseService implements IService {
  protected isInitialized = false;
  protected isShuttingDown = false;

  /**
   * Gets the service name for logging and identification
   */
  protected abstract getServiceName(): string;

  /**
   * Performs service-specific initialization
   * @throws Error if initialization fails
   */
  protected abstract performInitialization(): Promise<void>;

  /**
   * Performs service-specific shutdown/cleanup
   */
  protected abstract performShutdown(): Promise<void>;

  /**
   * Template method for service initialization
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn(`${this.getServiceName()} is already initialized`);
      return;
    }

    try {
      logger.info(`Initializing ${this.getServiceName()}...`);
      await this.performInitialization();
      this.isInitialized = true;
      logger.info(`${this.getServiceName()} initialized successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize ${this.getServiceName()}: ${errorMessage}`, error);
      throw new Error(`${this.getServiceName()} initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Template method for service shutdown
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    try {
      logger.info(`Shutting down ${this.getServiceName()}...`);
      await this.performShutdown();
      logger.info(`${this.getServiceName()} shutdown complete`);
    } catch (error) {
      logger.error(`Error during ${this.getServiceName()} shutdown:`, error);
      // Continue shutdown even if errors occur
    } finally {
      this.isInitialized = false;
      this.isShuttingDown = false;
    }
  }

  /**
   * Default health status implementation
   * Subclasses can override specific methods to customize
   */
  getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.isHealthy(),
      name: this.getServiceName(),
      errors: this.getHealthErrors(),
      metrics: this.getHealthMetrics()
    };
  }

  /**
   * Override to provide custom health check logic
   * Default: healthy if initialized and not shutting down
   */
  protected isHealthy(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }

  /**
   * Override to provide health error messages
   * Default: returns empty array
   */
  protected getHealthErrors(): string[] {
    const errors: string[] = [];
    if (!this.isInitialized) {
      errors.push('Service not initialized');
    }
    if (this.isShuttingDown) {
      errors.push('Service is shutting down');
    }
    return errors;
  }

  /**
   * Override to provide service-specific health metrics
   * Default: returns undefined (no metrics)
   */
  protected getHealthMetrics(): Record<string, unknown> | undefined {
    return undefined;
  }
}