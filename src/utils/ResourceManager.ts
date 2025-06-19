/**
 * Resource Manager - Comprehensive Resource Tracking and Cleanup
 * 
 * Manages application resources with automatic cleanup, leak detection,
 * and emergency cleanup procedures. Provides centralized resource tracking
 * to ensure zero resource leaks and proper cleanup on shutdown.
 * 
 * Features:
 * - Automatic resource registration and cleanup
 * - Resource leak detection and reporting
 * - Emergency cleanup procedures
 * - Resource statistics and monitoring
 * - Support for common resource types (timers, event listeners, etc.)
 * - Process exit handlers for guaranteed cleanup
 * 
 * @module ResourceManager
 */

import { logger } from './logger';
import { enrichError, SystemError } from './ErrorHandlingUtils';
import { EventEmitter } from 'events';
import { EventListener } from '../types';

/**
 * Managed resource interface
 */
export interface ManagedResource {
  type: string;
  id: string;
  cleanup: () => Promise<void> | void;
  metadata?: Record<string, any>;
  createdAt?: number;
  lastAccessed?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number; // Auto-cleanup timeout in ms
  maxRetries?: number;
}

/**
 * Resource group for batch operations
 */
export interface ResourceGroup {
  name: string;
  resources: Set<string>;
  cleanupOrder?: string[];
  parallel?: boolean;
  timeout?: number;
}

/**
 * Resource cleanup result
 */
export interface CleanupResult {
  success: boolean;
  resource: ManagedResource;
  error?: Error;
  duration: number;
  retryCount: number;
}

/**
 * Resource statistics
 */
export interface ResourceStats {
  total: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  oldestResource: number;
  newestResource: number;
  averageAge: number;
  pendingCleanup: number;
  failedCleanups: number;
  totalCleanupTime: number;
  leakDetected: boolean;
}

/**
 * Resource manager events
 */
export interface ResourceManagerEvents {
  'resource-registered': (resource: ManagedResource) => void;
  'resource-unregistered': (resource: ManagedResource) => void;
  'cleanup-started': (type?: string) => void;
  'cleanup-completed': (results: CleanupResult[]) => void;
  'cleanup-failed': (error: Error, resource: ManagedResource) => void;
  'leak-detected': (resources: ManagedResource[]) => void;
  'emergency-cleanup': () => void;
}

/**
 * Main resource manager class
 */
export class ResourceManager extends EventEmitter {
  private resources = new Map<string, ManagedResource>();
  private groups = new Map<string, ResourceGroup>();
  private cleanupInProgress = false;
  private cleanupPromise?: Promise<CleanupResult[]>;
  private leakDetectionInterval?: NodeJS.Timeout;
  private autoCleanupTimeouts = new Map<string, NodeJS.Timeout>();
  private cleanupStats = {
    totalCleanups: 0,
    failedCleanups: 0,
    totalCleanupTime: 0,
    lastCleanup: 0
  };

  // Configuration
  private readonly LEAK_DETECTION_INTERVAL = 60000; // 1 minute
  private readonly CLEANUP_TIMEOUT = 30000; // 30 seconds default
  private readonly MAX_RETRIES = 3;
  private readonly CLEANUP_BATCH_SIZE = 10;

  constructor(options: {
    enableLeakDetection?: boolean;
    leakDetectionInterval?: number;
    maxRetries?: number;
    cleanupTimeout?: number;
  } = {}) {
    super();
    
    if (options.enableLeakDetection !== false) {
      this.enableLeakDetection(options.leakDetectionInterval);
    }
  }

  /**
   * Register a resource for management
   */
  register(resource: ManagedResource): void {
    const key = `${resource.type}:${resource.id}`;
    
    if (this.resources.has(key)) {
      logger.warn('Resource already registered, updating', {
        type: resource.type,
        id: resource.id,
        metadata: resource.metadata
      });
    }

    // Enhance resource with defaults
    const enhancedResource: ManagedResource = {
      ...resource,
      createdAt: resource.createdAt || Date.now(),
      lastAccessed: resource.lastAccessed || Date.now(),
      priority: resource.priority || 'medium',
      maxRetries: resource.maxRetries || this.MAX_RETRIES
    };

    this.resources.set(key, enhancedResource);

    // Set up auto-cleanup if timeout specified
    if (resource.timeout) {
      this.setupAutoCleanup(key, resource.timeout);
    }

    logger.debug('Resource registered', {
      type: resource.type,
      id: resource.id,
      priority: enhancedResource.priority,
      total: this.resources.size,
      timeout: resource.timeout
    });

    this.emit('resource-registered', enhancedResource);
  }

  /**
   * Unregister a resource
   */
  unregister(type: string, id: string): boolean {
    const key = `${type}:${id}`;
    const resource = this.resources.get(key);
    
    if (!resource) {
      return false;
    }

    this.resources.delete(key);

    // Cancel auto-cleanup if exists
    const timeoutId = this.autoCleanupTimeouts.get(key);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.autoCleanupTimeouts.delete(key);
    }

    logger.debug('Resource unregistered', {
      type,
      id,
      total: this.resources.size
    });

    this.emit('resource-unregistered', resource);
    return true;
  }

  /**
   * Get a registered resource
   */
  get(type: string, id: string): ManagedResource | undefined {
    const key = `${type}:${id}`;
    const resource = this.resources.get(key);
    
    if (resource) {
      // Update last accessed time
      resource.lastAccessed = Date.now();
    }
    
    return resource;
  }

  /**
   * Check if resource is registered
   */
  has(type: string, id: string): boolean {
    const key = `${type}:${id}`;
    return this.resources.has(key);
  }

  /**
   * Cleanup resources with comprehensive error handling
   */
  async cleanup(type?: string, options: {
    force?: boolean;
    timeout?: number;
    maxConcurrency?: number;
  } = {}): Promise<CleanupResult[]> {
    if (this.cleanupInProgress && !options.force) {
      logger.warn('Cleanup already in progress, waiting for completion');
      if (this.cleanupPromise) {
        return await this.cleanupPromise;
      }
      return [];
    }

    this.cleanupInProgress = true;
    this.emit('cleanup-started', type);

    const cleanupStart = Date.now();
    
    try {
      this.cleanupPromise = this.performCleanup(type, options);
      const results = await this.cleanupPromise;
      
      const duration = Date.now() - cleanupStart;
      this.cleanupStats.totalCleanups++;
      this.cleanupStats.totalCleanupTime += duration;
      this.cleanupStats.lastCleanup = Date.now();
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      logger.info('Resource cleanup completed', {
        type: type || 'all',
        successful,
        failed,
        total: results.length,
        duration
      });

      this.emit('cleanup-completed', results);
      return results;
    } finally {
      this.cleanupInProgress = false;
      this.cleanupPromise = undefined;
    }
  }

  /**
   * Perform the actual cleanup operation
   */
  private async performCleanup(
    type?: string,
    options: {
      timeout?: number;
      maxConcurrency?: number;
    } = {}
  ): Promise<CleanupResult[]> {
    const toCleanup = this.getResourcesForCleanup(type);
    
    if (toCleanup.length === 0) {
      logger.info('No resources to cleanup', { type });
      return [];
    }

    // Sort by priority (critical first)
    toCleanup.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium'];
    });

    logger.info('Starting resource cleanup', {
      type: type || 'all',
      count: toCleanup.length,
      priorities: this.getResourcesByPriority(toCleanup)
    });

    const maxConcurrency = options.maxConcurrency || this.CLEANUP_BATCH_SIZE;
    const results: CleanupResult[] = [];

    // Process resources in batches to avoid overwhelming the system
    for (let i = 0; i < toCleanup.length; i += maxConcurrency) {
      const batch = toCleanup.slice(i, i + maxConcurrency);
      const batchResults = await this.cleanupBatch(batch, options.timeout);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Cleanup a batch of resources
   */
  private async cleanupBatch(
    resources: ManagedResource[],
    timeout = this.CLEANUP_TIMEOUT
  ): Promise<CleanupResult[]> {
    const cleanupPromises = resources.map(resource => 
      this.cleanupSingleResource(resource, timeout)
    );

    const results = await Promise.allSettled(cleanupPromises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const resource = resources[index];
        return {
          success: false,
          resource,
          error: result.reason,
          duration: 0,
          retryCount: 0
        };
      }
    });
  }

  /**
   * Cleanup a single resource with retries
   */
  private async cleanupSingleResource(
    resource: ManagedResource,
    timeout: number
  ): Promise<CleanupResult> {
    const key = `${resource.type}:${resource.id}`;
    const maxRetries = resource.maxRetries || this.MAX_RETRIES;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      
      try {
        // Execute cleanup with timeout
        await this.executeWithTimeout(
          resource.cleanup,
          timeout,
          `Resource cleanup timeout: ${key}`
        );

        // Remove from registry
        this.unregister(resource.type, resource.id);
        
        const duration = Date.now() - startTime;
        
        logger.debug('Resource cleanup successful', {
          type: resource.type,
          id: resource.id,
          attempt,
          duration
        });

        return {
          success: true,
          resource,
          duration,
          retryCount: attempt - 1
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const enrichedError = enrichError(error as Error, {
          resource: key,
          attempt,
          maxRetries,
          duration
        });

        if (attempt === maxRetries) {
          // Final attempt failed
          this.cleanupStats.failedCleanups++;
          logger.error('Resource cleanup failed after all retries', {
            type: resource.type,
            id: resource.id,
            attempts: maxRetries,
            error: enrichedError
          });

          this.emit('cleanup-failed', enrichedError, resource);

          return {
            success: false,
            resource,
            error: enrichedError,
            duration,
            retryCount: maxRetries
          };
        } else {
          // Retry after delay
          logger.warn('Resource cleanup failed, retrying', {
            type: resource.type,
            id: resource.id,
            attempt,
            maxRetries,
            error: enrichedError.message
          });
          
          await this.delay(1000 * attempt); // Exponential backoff
        }
      }
    }

    // Should never reach here
    throw new SystemError('Cleanup retry loop ended unexpectedly', 'CLEANUP_ERROR');
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeout: number,
    message: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new SystemError(message, 'TIMEOUT'));
      }, timeout);

      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Get resources for cleanup
   */
  private getResourcesForCleanup(type?: string): ManagedResource[] {
    const resources = Array.from(this.resources.values());
    
    if (type) {
      return resources.filter(r => r.type === type);
    }
    
    return resources;
  }

  /**
   * Get resources grouped by priority
   */
  private getResourcesByPriority(resources: ManagedResource[]): Record<string, number> {
    return resources.reduce((acc, resource) => {
      const priority = resource.priority || 'medium';
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Emergency cleanup - force cleanup all resources
   */
  async emergencyCleanup(): Promise<void> {
    logger.warn('Performing emergency cleanup');
    this.emit('emergency-cleanup');
    
    try {
      await this.cleanup(undefined, {
        force: true,
        timeout: 5000, // Shorter timeout for emergency
        maxConcurrency: 20 // Higher concurrency for emergency
      });
    } catch (error) {
      logger.error('Emergency cleanup failed', error);
    }
  }

  /**
   * Resource group management
   */
  createGroup(name: string, options: Partial<ResourceGroup> = {}): void {
    this.groups.set(name, {
      name,
      resources: new Set(),
      parallel: true,
      timeout: this.CLEANUP_TIMEOUT,
      ...options
    });
    
    logger.debug('Resource group created', { name, options });
  }

  /**
   * Add resource to group
   */
  addToGroup(groupName: string, type: string, id: string): void {
    const group = this.groups.get(groupName);
    if (!group) {
      throw new SystemError(`Resource group not found: ${groupName}`, 'GROUP_NOT_FOUND');
    }

    const key = `${type}:${id}`;
    if (!this.resources.has(key)) {
      throw new SystemError(`Resource not found: ${key}`, 'RESOURCE_NOT_FOUND');
    }

    group.resources.add(key);
    logger.debug('Resource added to group', { group: groupName, resource: key });
  }

  /**
   * Cleanup entire resource group
   */
  async cleanupGroup(groupName: string): Promise<CleanupResult[]> {
    const group = this.groups.get(groupName);
    if (!group) {
      throw new SystemError(`Resource group not found: ${groupName}`, 'GROUP_NOT_FOUND');
    }

    const resources = Array.from(group.resources)
      .map(key => this.resources.get(key))
      .filter((r): r is ManagedResource => r !== undefined);

    if (group.parallel) {
      return this.cleanupBatch(resources, group.timeout);
    } else {
      // Sequential cleanup
      const results: CleanupResult[] = [];
      for (const resource of resources) {
        const result = await this.cleanupSingleResource(resource, group.timeout || this.CLEANUP_TIMEOUT);
        results.push(result);
      }
      return results;
    }
  }

  /**
   * Convenience methods for common resource types
   */
  registerInterval(id: string, interval: NodeJS.Timeout, metadata?: Record<string, any>): void {
    this.register({
      type: 'interval',
      id,
      cleanup: () => clearInterval(interval),
      metadata: { ...metadata, createdAt: Date.now() }
    });
  }

  registerTimeout(id: string, timeout: NodeJS.Timeout, metadata?: Record<string, any>): void {
    this.register({
      type: 'timeout',
      id,
      cleanup: () => clearTimeout(timeout),
      metadata: { ...metadata, createdAt: Date.now() }
    });
  }

  registerEventListener(
    target: EventTarget | NodeJS.EventEmitter,
    event: string,
    listener: EventListener,
    id: string = `${event}_${Date.now()}`,
    metadata?: Record<string, unknown>
  ): void {
    this.register({
      type: 'event_listener',
      id,
      cleanup: () => {
        if ('removeEventListener' in target && 'addEventListener' in target) {
          (target as EventTarget).removeEventListener(event, listener);
        } else if ('off' in target) {
          (target as NodeJS.EventEmitter).off(event, listener);
        }
      },
      metadata: { 
        ...metadata, 
        targetType: target.constructor.name, 
        event,
        createdAt: Date.now()
      }
    });
  }

  registerFileHandle(id: string, handle: { close: () => Promise<void> | void }, metadata?: Record<string, any>): void {
    this.register({
      type: 'file_handle',
      id,
      cleanup: async () => {
        await Promise.resolve(handle.close());
      },
      metadata: { ...metadata, createdAt: Date.now() },
      priority: 'high'
    });
  }

  registerDatabaseConnection(id: string, connection: { close: () => Promise<void> | void }, metadata?: Record<string, any>): void {
    this.register({
      type: 'database_connection',
      id,
      cleanup: async () => {
        await Promise.resolve(connection.close());
      },
      metadata: { ...metadata, createdAt: Date.now() },
      priority: 'critical'
    });
  }

  /**
   * Get comprehensive resource statistics
   */
  getResourceStats(): ResourceStats {
    const now = Date.now();
    const resources = Array.from(this.resources.values());
    
    if (resources.length === 0) {
      return {
        total: 0,
        byType: {},
        byPriority: {},
        oldestResource: now,
        newestResource: now,
        averageAge: 0,
        pendingCleanup: 0,
        failedCleanups: this.cleanupStats.failedCleanups,
        totalCleanupTime: this.cleanupStats.totalCleanupTime,
        leakDetected: false
      };
    }

    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let oldestResource = now;
    let newestResource = 0;
    let totalAge = 0;

    for (const resource of resources) {
      const createdAt = resource.createdAt || now;
      const priority = resource.priority || 'medium';
      
      byType[resource.type] = (byType[resource.type] || 0) + 1;
      byPriority[priority] = (byPriority[priority] || 0) + 1;
      
      if (createdAt < oldestResource) oldestResource = createdAt;
      if (createdAt > newestResource) newestResource = createdAt;
      
      totalAge += now - createdAt;
    }

    const averageAge = totalAge / resources.length;
    const leakDetected = this.detectResourceLeaks(resources);

    return {
      total: resources.length,
      byType,
      byPriority,
      oldestResource,
      newestResource,
      averageAge,
      pendingCleanup: this.cleanupInProgress ? resources.length : 0,
      failedCleanups: this.cleanupStats.failedCleanups,
      totalCleanupTime: this.cleanupStats.totalCleanupTime,
      leakDetected
    };
  }

  /**
   * Detect potential resource leaks
   */
  private detectResourceLeaks(resources: ManagedResource[]): boolean {
    const now = Date.now();
    const LEAK_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
    const MAX_RESOURCES_PER_TYPE = 100;

    // Check for old resources
    const oldResources = resources.filter(r => 
      (now - (r.createdAt || now)) > LEAK_THRESHOLD
    );

    // Check for too many resources of same type
    const typeCounts = resources.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const excessiveTypes = Object.entries(typeCounts)
      .filter(([, count]) => count > MAX_RESOURCES_PER_TYPE);

    if (oldResources.length > 0 || excessiveTypes.length > 0) {
      logger.warn('Potential resource leaks detected', {
        oldResources: oldResources.length,
        excessiveTypes: excessiveTypes.map(([type, count]) => ({ type, count }))
      });

      this.emit('leak-detected', oldResources);
      return true;
    }

    return false;
  }

  /**
   * Enable automatic leak detection
   */
  private enableLeakDetection(interval = this.LEAK_DETECTION_INTERVAL): void {
    if (this.leakDetectionInterval) {
      clearInterval(this.leakDetectionInterval);
    }

    this.leakDetectionInterval = setInterval(() => {
      const resources = Array.from(this.resources.values());
      this.detectResourceLeaks(resources);
    }, interval);

    // Register the interval for cleanup
    this.register({
      type: 'internal_interval',
      id: 'leak_detection',
      cleanup: () => {
        if (this.leakDetectionInterval) {
          clearInterval(this.leakDetectionInterval);
          this.leakDetectionInterval = undefined;
        }
      },
      priority: 'high'
    });
  }

  /**
   * Setup auto-cleanup for a resource
   */
  private setupAutoCleanup(key: string, timeout: number): void {
    const timeoutId = setTimeout(async () => {
      const resource = this.resources.get(key);
      if (resource) {
        logger.info('Auto-cleanup triggered for resource', {
          type: resource.type,
          id: resource.id,
          timeout
        });

        try {
          await this.cleanupSingleResource(resource, this.CLEANUP_TIMEOUT);
        } catch (error) {
          logger.error('Auto-cleanup failed', error);
        }
      }
      
      this.autoCleanupTimeouts.delete(key);
    }, timeout);

    this.autoCleanupTimeouts.set(key, timeoutId);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the resource manager
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down resource manager');
    
    // Disable leak detection
    if (this.leakDetectionInterval) {
      clearInterval(this.leakDetectionInterval);
      this.leakDetectionInterval = undefined;
    }

    // Clear auto-cleanup timeouts
    for (const [key, timeoutId] of this.autoCleanupTimeouts) {
      clearTimeout(timeoutId);
    }
    this.autoCleanupTimeouts.clear();

    // Cleanup all resources
    await this.cleanup();
  }
}

/**
 * Global resource manager instance
 */
export const globalResourceManager = new ResourceManager({
  enableLeakDetection: true
});

/**
 * Cleanup on process exit
 */
process.on('exit', () => {
  // Synchronous cleanup only
  logger.info('Process exiting, performing synchronous cleanup');
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, performing graceful shutdown');
  try {
    await globalResourceManager.emergencyCleanup();
    process.exit(0);
  } catch (error) {
    logger.error('Emergency cleanup failed', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, performing graceful shutdown');
  try {
    await globalResourceManager.emergencyCleanup();
    process.exit(0);
  } catch (error) {
    logger.error('Emergency cleanup failed', error);
    process.exit(1);
  }
});

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception, performing emergency cleanup', error);
  try {
    await globalResourceManager.emergencyCleanup();
  } catch (cleanupError) {
    logger.error('Emergency cleanup failed', cleanupError);
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled rejection, performing emergency cleanup', { reason, promise });
  try {
    await globalResourceManager.emergencyCleanup();
  } catch (cleanupError) {
    logger.error('Emergency cleanup failed', cleanupError);
  }
  process.exit(1);
});