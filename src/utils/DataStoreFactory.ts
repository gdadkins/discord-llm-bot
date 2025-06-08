/**
 * DataStore Factory Pattern
 * 
 * Provides standardized factory methods for creating DataStore instances
 * with consistent configuration across all services. Implements centralized
 * management and monitoring of all DataStore instances.
 * 
 * Features:
 * - Standardized configurations for different store types
 * - Consistent backup strategies across services
 * - Centralized DataStore registry for monitoring
 * - Type-safe factory methods for common patterns
 * - Configuration validation and error handling
 * 
 * @author Claude Code
 * @version 1.0.0
 */

import { DataStore, DataStoreConfig, DataValidator, SerializationStrategy, JsonSerializationStrategy } from './DataStore';
import { logger } from './logger';
import * as path from 'path';

/**
 * Standard backup configuration applied to all DataStores
 */
export interface StandardBackupConfig {
  maxBackups: number;
  retentionPeriod: string;
  compressionEnabled: boolean;
}

/**
 * Configuration presets for different store types
 */
export interface DataStorePresets {
  configStore: Partial<DataStoreConfig<any>>;
  metricsStore: Partial<DataStoreConfig<any>>;
  cacheStore: Partial<DataStoreConfig<any>>;
  stateStore: Partial<DataStoreConfig<any>>;
}

/**
 * Registry entry for tracking DataStore instances
 */
interface RegistryEntry {
  store: DataStore<any>;
  type: 'config' | 'metrics' | 'cache' | 'state' | 'custom';
  createdAt: number;
  lastAccessed: number;
  filePath: string;
}

/**
 * DataStore Factory class for standardized DataStore creation
 */
export class DataStoreFactory {
  private static instance: DataStoreFactory;
  private registry: Map<string, RegistryEntry> = new Map();
  
  // Standard configuration defaults
  private readonly standardBackupConfig: StandardBackupConfig = {
    maxBackups: 5,
    retentionPeriod: '30d',
    compressionEnabled: true
  };
  
  // Preset configurations for different store types
  private readonly presets: DataStorePresets = {
    configStore: {
      maxBackups: 10,
      maxRetries: 5,
      retryDelayMs: 200,
      createDirectories: true,
      fileMode: 0o644,
      enableDebugLogging: false
    },
    metricsStore: {
      maxBackups: 3,
      maxRetries: 3,
      retryDelayMs: 100,
      createDirectories: true,
      fileMode: 0o644,
      enableDebugLogging: false
    },
    cacheStore: {
      maxBackups: 2,
      maxRetries: 2,
      retryDelayMs: 50,
      createDirectories: true,
      fileMode: 0o644,
      enableDebugLogging: false
    },
    stateStore: {
      maxBackups: 5,
      maxRetries: 4,
      retryDelayMs: 150,
      createDirectories: true,
      fileMode: 0o644,
      enableDebugLogging: false
    }
  };

  private constructor() {
    logger.info('DataStoreFactory initialized');
  }

  /**
   * Get singleton instance of DataStoreFactory
   */
  static getInstance(): DataStoreFactory {
    if (!DataStoreFactory.instance) {
      DataStoreFactory.instance = new DataStoreFactory();
    }
    return DataStoreFactory.instance;
  }

  /**
   * Create a configuration store with optimal settings
   * @param filePath - Path to configuration file
   * @param validator - Optional custom validator
   * @returns Configured DataStore instance
   */
  createConfigStore<T = any>(
    filePath: string,
    validator?: DataValidator<T>
  ): DataStore<T> {
    const fullPath = this.resolveDataPath(filePath);
    const config: DataStoreConfig<T> = {
      ...this.presets.configStore,
      validator: validator || ((data: unknown): data is T => true),
      serialization: new JsonSerializationStrategy()
    };
    
    const store = new DataStore<T>(fullPath, config);
    this.registerStore(fullPath, store, 'config');
    
    logger.info(`Created config store: ${fullPath}`);
    return store;
  }

  /**
   * Create a metrics store with compression and TTL
   * @param filePath - Path to metrics file
   * @param ttl - Time to live in milliseconds (default: 30 days)
   * @returns Configured DataStore instance
   */
  createMetricsStore<T = any>(
    filePath: string,
    ttl: number = 30 * 24 * 60 * 60 * 1000
  ): DataStore<T> {
    const fullPath = this.resolveDataPath(filePath);
    const config: DataStoreConfig<T> = {
      ...this.presets.metricsStore,
      validator: (data: unknown): data is T => {
        // Basic validation for metrics data
        return typeof data === 'object' && data !== null;
      },
      serialization: new JsonSerializationStrategy()
    };
    
    const store = new DataStore<T>(fullPath, config);
    
    // Add TTL validation hook
    store.addValidationHook((data: unknown): data is T => {
      if (typeof data === 'object' && data !== null && 'timestamp' in data) {
        const timestamp = (data as any).timestamp;
        return Date.now() - timestamp < ttl;
      }
      return true;
    });
    
    this.registerStore(fullPath, store, 'metrics');
    
    logger.info(`Created metrics store: ${fullPath} with TTL: ${ttl}ms`);
    return store;
  }

  /**
   * Create a generic cache store
   * @param filePath - Path to cache file
   * @param maxEntries - Maximum number of cache entries
   * @returns Configured DataStore instance
   */
  createCacheStore<T = any>(
    filePath: string,
    maxEntries: number = 100
  ): DataStore<T> {
    const fullPath = this.resolveDataPath(filePath);
    const config: DataStoreConfig<T> = {
      ...this.presets.cacheStore,
      validator: (data: unknown): data is T => {
        // Validate cache structure
        if (typeof data === 'object' && data !== null) {
          if (Array.isArray(data)) {
            return data.length <= maxEntries;
          }
          if ('entries' in data && Array.isArray((data as any).entries)) {
            return (data as any).entries.length <= maxEntries;
          }
        }
        return true;
      },
      serialization: new JsonSerializationStrategy()
    };
    
    const store = new DataStore<T>(fullPath, config);
    this.registerStore(fullPath, store, 'cache');
    
    logger.info(`Created cache store: ${fullPath} with max entries: ${maxEntries}`);
    return store;
  }

  /**
   * Create a state store for stateful services
   * @param filePath - Path to state file
   * @param validator - State validator function
   * @returns Configured DataStore instance
   */
  createStateStore<T = any>(
    filePath: string,
    validator?: DataValidator<T>
  ): DataStore<T> {
    const fullPath = this.resolveDataPath(filePath);
    const config: DataStoreConfig<T> = {
      ...this.presets.stateStore,
      validator: validator || ((data: unknown): data is T => {
        // Basic state validation
        return typeof data === 'object' && data !== null;
      }),
      serialization: new JsonSerializationStrategy()
    };
    
    const store = new DataStore<T>(fullPath, config);
    this.registerStore(fullPath, store, 'state');
    
    logger.info(`Created state store: ${fullPath}`);
    return store;
  }

  /**
   * Create a custom DataStore with factory defaults
   * @param filePath - Path to data file
   * @param config - Custom configuration
   * @returns Configured DataStore instance
   */
  createCustomStore<T = any>(
    filePath: string,
    config: Partial<DataStoreConfig<T>> = {}
  ): DataStore<T> {
    const fullPath = this.resolveDataPath(filePath);
    const mergedConfig: DataStoreConfig<T> = {
      maxBackups: this.standardBackupConfig.maxBackups,
      maxRetries: 3,
      retryDelayMs: 100,
      createDirectories: true,
      fileMode: 0o644,
      enableDebugLogging: false,
      ...config,
      serialization: config.serialization || new JsonSerializationStrategy()
    };
    
    const store = new DataStore<T>(fullPath, mergedConfig);
    this.registerStore(fullPath, store, 'custom');
    
    logger.info(`Created custom store: ${fullPath}`);
    return store;
  }

  /**
   * Get all registered DataStore instances
   * @returns Map of file paths to registry entries
   */
  getRegistry(): Map<string, RegistryEntry> {
    // Update last accessed times
    const now = Date.now();
    for (const entry of this.registry.values()) {
      entry.lastAccessed = now;
    }
    return new Map(this.registry);
  }

  /**
   * Get DataStore by file path
   * @param filePath - Path to data file
   * @returns DataStore instance or undefined
   */
  getStore(filePath: string): DataStore<any> | undefined {
    const fullPath = this.resolveDataPath(filePath);
    const entry = this.registry.get(fullPath);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.store;
    }
    return undefined;
  }

  /**
   * Get all stores of a specific type
   * @param type - Store type to filter by
   * @returns Array of DataStore instances
   */
  getStoresByType(type: RegistryEntry['type']): DataStore<any>[] {
    const stores: DataStore<any>[] = [];
    for (const entry of this.registry.values()) {
      if (entry.type === type) {
        entry.lastAccessed = Date.now();
        stores.push(entry.store);
      }
    }
    return stores;
  }

  /**
   * Perform health check on all registered stores
   * @returns Health check results for all stores
   */
  async healthCheckAll(): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    for (const [filePath, entry] of this.registry) {
      try {
        const health = await entry.store.healthCheck();
        results.set(filePath, {
          type: entry.type,
          createdAt: entry.createdAt,
          lastAccessed: entry.lastAccessed,
          health
        });
      } catch (error) {
        results.set(filePath, {
          type: entry.type,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }

  /**
   * Get aggregated metrics for all stores
   * @returns Combined metrics from all DataStores
   */
  getAggregatedMetrics(): {
    totalStores: number;
    storesByType: Record<string, number>;
    totalSaveOperations: number;
    totalLoadOperations: number;
    totalErrors: number;
    avgSaveLatency: number;
    avgLoadLatency: number;
    } {
    const metrics = {
      totalStores: this.registry.size,
      storesByType: {} as Record<string, number>,
      totalSaveOperations: 0,
      totalLoadOperations: 0,
      totalErrors: 0,
      avgSaveLatency: 0,
      avgLoadLatency: 0
    };
    
    let saveLatencySum = 0;
    let loadLatencySum = 0;
    let storesWithSaves = 0;
    let storesWithLoads = 0;
    
    for (const entry of this.registry.values()) {
      // Count by type
      metrics.storesByType[entry.type] = (metrics.storesByType[entry.type] || 0) + 1;
      
      // Get store metrics
      const storeMetrics = entry.store.getMetrics();
      metrics.totalSaveOperations += storeMetrics.saveCount;
      metrics.totalLoadOperations += storeMetrics.loadCount;
      metrics.totalErrors += storeMetrics.errorCount;
      
      if (storeMetrics.saveCount > 0) {
        saveLatencySum += storeMetrics.avgSaveLatency;
        storesWithSaves++;
      }
      
      if (storeMetrics.loadCount > 0) {
        loadLatencySum += storeMetrics.avgLoadLatency;
        storesWithLoads++;
      }
    }
    
    // Calculate averages
    metrics.avgSaveLatency = storesWithSaves > 0 ? saveLatencySum / storesWithSaves : 0;
    metrics.avgLoadLatency = storesWithLoads > 0 ? loadLatencySum / storesWithLoads : 0;
    
    return metrics;
  }

  /**
   * Clear registry (for testing purposes)
   */
  clearRegistry(): void {
    this.registry.clear();
    logger.info('DataStore registry cleared');
  }

  /**
   * Get standard backup configuration
   */
  getStandardBackupConfig(): StandardBackupConfig {
    return { ...this.standardBackupConfig };
  }

  /**
   * Get preset configurations
   */
  getPresets(): DataStorePresets {
    return JSON.parse(JSON.stringify(this.presets));
  }

  // Private helper methods

  /**
   * Register a DataStore instance
   */
  private registerStore(
    filePath: string,
    store: DataStore<any>,
    type: RegistryEntry['type']
  ): void {
    this.registry.set(filePath, {
      store,
      type,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      filePath
    });
  }

  /**
   * Resolve data file path
   */
  private resolveDataPath(filePath: string): string {
    // Ensure path is in data directory if relative
    if (!path.isAbsolute(filePath)) {
      return path.join('./data', filePath);
    }
    return filePath;
  }
}

/**
 * Export singleton instance getter
 */
export const dataStoreFactory = DataStoreFactory.getInstance();