/**
 * DataStore Service Factory Pattern
 * 
 * Provides standardized factory methods for creating DataStore instances with
 * optimal configurations for different use cases. Ensures consistency across
 * the codebase and centralizes DataStore management.
 * 
 * Features:
 * - Type-specific factory methods with optimal defaults
 * - Standardized backup and compression configurations
 * - DataStore registry for centralized management
 * - Configuration validation and error handling
 * - Performance-optimized settings per use case
 * 
 * @author Claude Code
 * @version 1.0.0
 */

import { DataStore, DataStoreConfig, DataValidator } from './DataStore';
import { logger } from './logger';

/**
 * Factory configuration types based on DSE-006 specifications
 */
export interface FactoryBackupConfig {
  maxBackups: number;
  retentionPeriod: string;
  compressionEnabled: boolean;
}

export interface ConfigStoreDefaults {
  maxBackups: number;
  compressionEnabled: boolean;
  validationRequired: boolean;
}

export interface MetricsStoreDefaults {
  compressionEnabled: boolean;
  compressionThreshold: number;
  ttl: number;
}

export interface CacheStoreDefaults {
  ttl: number;
  maxEntries: number;
  autoCleanup: boolean;
}

export interface StateStoreDefaults {
  maxBackups: number;
  compressionEnabled: boolean;
  autoCleanup: boolean;
  retryDelayMs: number;
}

/**
 * Factory configuration with standardized settings
 */
export interface DataStoreFactoryConfig {
  standardBackupConfig: FactoryBackupConfig;
  configStoreDefaults: ConfigStoreDefaults;
  metricsStoreDefaults: MetricsStoreDefaults;
  cacheStoreDefaults: CacheStoreDefaults;
  stateStoreDefaults: StateStoreDefaults;
}

/**
 * DataStore registry entry for centralized management
 */
export interface DataStoreRegistryEntry<T = unknown> {
  id: string;
  type: 'config' | 'metrics' | 'cache' | 'state' | 'custom';
  instance: DataStore<T>;
  filePath: string;
  created: Date;
  lastAccessed: Date;
  configuration: DataStoreConfig<T>;
}

/**
 * DataStore Factory for standardized creation and management
 */
export class DataStoreFactory {
  private static instance: DataStoreFactory;
  private readonly registry = new Map<string, DataStoreRegistryEntry>();
  
  /**
   * Factory configuration based on DSE-006 specifications
   */
  private readonly factoryConfig: DataStoreFactoryConfig = {
    standardBackupConfig: {
      maxBackups: 5,
      retentionPeriod: '30d',
      compressionEnabled: true
    },
    configStoreDefaults: {
      maxBackups: 10,
      compressionEnabled: true,
      validationRequired: true
    },
    metricsStoreDefaults: {
      compressionEnabled: true,
      compressionThreshold: 10000,
      ttl: 2592000000 // 30 days in milliseconds
    },
    cacheStoreDefaults: {
      ttl: 31536000000, // 1 year in milliseconds
      maxEntries: 100,
      autoCleanup: true
    },
    stateStoreDefaults: {
      maxBackups: 5,
      compressionEnabled: true,
      autoCleanup: true,
      retryDelayMs: 100
    }
  };

  private constructor() {
    logger.info('DataStoreFactory initialized with DSE-006 configuration');
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
   * Create a configuration store with config-specific defaults
   * Optimized for configuration data with high validation requirements
   * 
   * @param filePath - Path to configuration file
   * @param validator - Configuration data validator
   * @param overrides - Optional configuration overrides
   * @returns Configured DataStore for configuration data
   */
  createConfigStore<T>(
    filePath: string,
    validator?: DataValidator<T>,
    overrides: Partial<DataStoreConfig<T>> = {}
  ): DataStore<T> {
    const config: DataStoreConfig<T> = {
      validator: validator || this.createDefaultValidator<T>(),
      maxBackups: this.factoryConfig.configStoreDefaults.maxBackups,
      compressionEnabled: this.factoryConfig.configStoreDefaults.compressionEnabled,
      compressionThreshold: 1024, // Compress configs over 1KB
      createDirectories: true,
      enableDebugLogging: false,
      maxRetries: 3,
      retryDelayMs: 100,
      fileMode: 0o644,
      ...overrides
    };

    const store = this.createDataStoreWithValidation(filePath, config);
    this.registerDataStore('config', filePath, store, config);
    
    logger.debug(`Created config store: ${filePath}`);
    return store;
  }

  /**
   * Create a metrics store with compression and TTL
   * Optimized for high-volume metrics data with automatic cleanup
   * 
   * @param filePath - Path to metrics file
   * @param validator - Metrics data validator
   * @param overrides - Optional configuration overrides
   * @returns Configured DataStore for metrics data
   */
  createMetricsStore<T>(
    filePath: string,
    validator?: DataValidator<T>,
    overrides: Partial<DataStoreConfig<T>> = {}
  ): DataStore<T> {
    const config: DataStoreConfig<T> = {
      validator: validator || this.createDefaultValidator<T>(),
      maxBackups: this.factoryConfig.standardBackupConfig.maxBackups,
      compressionEnabled: this.factoryConfig.metricsStoreDefaults.compressionEnabled,
      compressionThreshold: this.factoryConfig.metricsStoreDefaults.compressionThreshold,
      ttl: this.factoryConfig.metricsStoreDefaults.ttl,
      autoCleanup: true,
      createDirectories: true,
      enableDebugLogging: false,
      maxRetries: 2, // Fewer retries for metrics to avoid blocking
      retryDelayMs: 50,
      fileMode: 0o644,
      ...overrides
    };

    const store = this.createDataStoreWithValidation(filePath, config);
    this.registerDataStore('metrics', filePath, store, config);
    
    logger.debug(`Created metrics store: ${filePath}`);
    return store;
  }

  /**
   * Create a generic cache store with LRU eviction
   * Optimized for temporary data with automatic cleanup
   * 
   * @param filePath - Path to cache file
   * @param validator - Cache data validator
   * @param overrides - Optional configuration overrides
   * @returns Configured DataStore for cache data
   */
  createCacheStore<T>(
    filePath: string,
    validator?: DataValidator<T>,
    overrides: Partial<DataStoreConfig<T>> = {}
  ): DataStore<T> {
    const config: DataStoreConfig<T> = {
      validator: validator || this.createDefaultValidator<T>(),
      maxBackups: 3, // Fewer backups for cache data
      compressionEnabled: false, // Cache prioritizes speed over space
      ttl: this.factoryConfig.cacheStoreDefaults.ttl,
      maxEntries: this.factoryConfig.cacheStoreDefaults.maxEntries,
      autoCleanup: this.factoryConfig.cacheStoreDefaults.autoCleanup,
      createDirectories: true,
      enableDebugLogging: false,
      maxRetries: 1, // Fast fail for cache operations
      retryDelayMs: 25,
      fileMode: 0o644,
      ...overrides
    };

    const store = this.createDataStoreWithValidation(filePath, config);
    this.registerDataStore('cache', filePath, store, config);
    
    logger.debug(`Created cache store: ${filePath}`);
    return store;
  }

  /**
   * Create a state store for stateful services like RateLimiter
   * Optimized for frequently updated state data with reliability
   * 
   * @param filePath - Path to state file
   * @param validator - State data validator
   * @param overrides - Optional configuration overrides
   * @returns Configured DataStore for state data
   */
  createStateStore<T>(
    filePath: string,
    validator?: DataValidator<T>,
    overrides: Partial<DataStoreConfig<T>> = {}
  ): DataStore<T> {
    const config: DataStoreConfig<T> = {
      validator: validator || this.createDefaultValidator<T>(),
      maxBackups: this.factoryConfig.stateStoreDefaults.maxBackups,
      compressionEnabled: this.factoryConfig.stateStoreDefaults.compressionEnabled,
      compressionThreshold: 2048, // Compress state files over 2KB
      autoCleanup: this.factoryConfig.stateStoreDefaults.autoCleanup,
      createDirectories: true,
      enableDebugLogging: false,
      maxRetries: 3, // Reliable state persistence
      retryDelayMs: this.factoryConfig.stateStoreDefaults.retryDelayMs,
      fileMode: 0o644,
      ...overrides
    };

    const store = this.createDataStoreWithValidation(filePath, config);
    this.registerDataStore('state', filePath, store, config);
    
    logger.debug(`Created state store: ${filePath}`);
    return store;
  }

  /**
   * Create a custom DataStore with manual configuration
   * For specialized use cases requiring custom settings
   * 
   * @param filePath - Path to data file
   * @param config - Custom configuration
   * @returns Configured DataStore with custom settings
   */
  createCustomStore<T>(
    filePath: string,
    config: DataStoreConfig<T>
  ): DataStore<T> {
    // Apply standard backup config as defaults for custom stores
    const configWithDefaults: DataStoreConfig<T> = {
      maxBackups: this.factoryConfig.standardBackupConfig.maxBackups,
      compressionEnabled: this.factoryConfig.standardBackupConfig.compressionEnabled,
      createDirectories: true,
      ...config
    };

    const store = this.createDataStoreWithValidation(filePath, configWithDefaults);
    this.registerDataStore('custom', filePath, store, configWithDefaults);
    
    logger.debug(`Created custom store: ${filePath}`);
    return store;
  }

  /**
   * Get standardized backup configuration
   * Used across all factory-created DataStores
   * 
   * @returns Standard backup configuration
   */
  getStandardBackupConfig(): FactoryBackupConfig {
    return { ...this.factoryConfig.standardBackupConfig };
  }

  /**
   * Get factory configuration for inspection
   * 
   * @returns Complete factory configuration
   */
  getFactoryConfig(): DataStoreFactoryConfig {
    return JSON.parse(JSON.stringify(this.factoryConfig));
  }

  /**
   * Get all registered DataStores for centralized management
   * 
   * @returns Array of registry entries
   */
  getRegisteredStores(): DataStoreRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get a registered DataStore by file path
   * 
   * @param filePath - Path to the DataStore file
   * @returns Registry entry or undefined if not found
   */
  getRegisteredStore(filePath: string): DataStoreRegistryEntry | undefined {
    return this.registry.get(this.normalizeFilePath(filePath));
  }

  /**
   * Unregister a DataStore (useful for cleanup)
   * 
   * @param filePath - Path to the DataStore file
   * @returns True if unregistered, false if not found
   */
  unregisterStore(filePath: string): boolean {
    const normalizedPath = this.normalizeFilePath(filePath);
    return this.registry.delete(normalizedPath);
  }

  /**
   * Get registry statistics for monitoring
   * 
   * @returns Registry statistics
   */
  getRegistryStats(): {
    totalStores: number;
    storesByType: Record<string, number>;
    oldestStore: Date | null;
    newestStore: Date | null;
    } {
    const stores = Array.from(this.registry.values());
    const storesByType: Record<string, number> = {};
    
    for (const store of stores) {
      storesByType[store.type] = (storesByType[store.type] || 0) + 1;
    }

    const dates = stores.map(s => s.created);
    
    return {
      totalStores: stores.length,
      storesByType,
      oldestStore: dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null,
      newestStore: dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
    };
  }

  /**
   * Validate factory configuration on startup
   * 
   * @throws Error if configuration is invalid
   */
  validateConfiguration(): void {
    const config = this.factoryConfig;
    
    // Validate backup configuration
    if (config.standardBackupConfig.maxBackups < 1) {
      throw new Error('Standard backup config maxBackups must be >= 1');
    }
    
    // Validate config store defaults
    if (config.configStoreDefaults.maxBackups < 1) {
      throw new Error('Config store maxBackups must be >= 1');
    }
    
    // Validate metrics store defaults
    if (config.metricsStoreDefaults.compressionThreshold < 0) {
      throw new Error('Metrics store compressionThreshold must be >= 0');
    }
    
    if (config.metricsStoreDefaults.ttl < 0) {
      throw new Error('Metrics store TTL must be >= 0');
    }
    
    // Validate cache store defaults
    if (config.cacheStoreDefaults.maxEntries < 1) {
      throw new Error('Cache store maxEntries must be >= 1');
    }
    
    if (config.cacheStoreDefaults.ttl < 0) {
      throw new Error('Cache store TTL must be >= 0');
    }
    
    // Validate state store defaults
    if (config.stateStoreDefaults.retryDelayMs < 0) {
      throw new Error('State store retryDelayMs must be >= 0');
    }
    
    logger.debug('DataStore factory configuration validated successfully');
  }

  /**
   * Perform health check on all registered DataStores
   * 
   * @returns Health check results
   */
  async performHealthCheck(): Promise<{
    totalStores: number;
    healthyStores: number;
    unhealthyStores: number;
    errors: Array<{ filePath: string; error: string }>;
  }> {
    const stores = Array.from(this.registry.values());
    const errors: Array<{ filePath: string; error: string }> = [];
    let healthyCount = 0;
    
    for (const entry of stores) {
      try {
        const health = await entry.instance.healthCheck();
        if (health.healthy) {
          healthyCount++;
        } else {
          errors.push({
            filePath: entry.filePath,
            error: `Health check failed: exists=${health.fileExists}, readable=${health.readable}, writable=${health.writable}`
          });
        }
        
        // Update last accessed time
        entry.lastAccessed = new Date();
      } catch (error) {
        errors.push({
          filePath: entry.filePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return {
      totalStores: stores.length,
      healthyStores: healthyCount,
      unhealthyStores: stores.length - healthyCount,
      errors
    };
  }

  // Private helper methods

  /**
   * Create DataStore with configuration validation
   */
  private createDataStoreWithValidation<T>(
    filePath: string,
    config: DataStoreConfig<T>
  ): DataStore<T> {
    try {
      // Validate configuration before creating store
      this.validateStoreConfig(config);
      
      return new DataStore<T>(filePath, config);
    } catch (error) {
      logger.error(`Failed to create DataStore for ${filePath}:`, error);
      throw new Error(`DataStore creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate individual store configuration
   */
  private validateStoreConfig<T>(config: DataStoreConfig<T>): void {
    if (config.maxBackups && config.maxBackups < 0) {
      throw new Error('maxBackups must be >= 0');
    }
    
    if (config.maxRetries && config.maxRetries < 0) {
      throw new Error('maxRetries must be >= 0');
    }
    
    if (config.retryDelayMs && config.retryDelayMs < 0) {
      throw new Error('retryDelayMs must be >= 0');
    }
    
    if (config.compressionThreshold && config.compressionThreshold < 0) {
      throw new Error('compressionThreshold must be >= 0');
    }
    
    if (config.ttl && config.ttl < 0) {
      throw new Error('TTL must be >= 0');
    }
    
    if (config.maxEntries && config.maxEntries < 1) {
      throw new Error('maxEntries must be >= 1');
    }
  }

  /**
   * Register a DataStore in the centralized registry
   */
  private registerDataStore<T>(
    type: DataStoreRegistryEntry['type'],
    filePath: string,
    instance: DataStore<T>,
    configuration: DataStoreConfig<T>
  ): void {
    const normalizedPath = this.normalizeFilePath(filePath);
    const now = new Date();
    
    const entry: DataStoreRegistryEntry = {
      id: this.generateStoreId(type, normalizedPath),
      type,
      instance: instance as DataStore<unknown>,
      filePath: normalizedPath,
      created: now,
      lastAccessed: now,
      configuration: configuration as DataStoreConfig<unknown>
    };
    
    this.registry.set(normalizedPath, entry);
    logger.debug(`Registered ${type} DataStore: ${normalizedPath}`);
  }

  /**
   * Normalize file path for consistent registry keys
   */
  private normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  /**
   * Generate unique store ID
   */
  private generateStoreId(type: string, filePath: string): string {
    const timestamp = Date.now();
    const pathHash = filePath.split('').reduce((hash, char) => {
      return ((hash << 5) - hash + char.charCodeAt(0)) & 0xffffffff;
    }, 0);
    
    return `${type}_${Math.abs(pathHash)}_${timestamp}`;
  }

  /**
   * Create default validator that accepts any valid JSON
   */
  private createDefaultValidator<T>(): DataValidator<T> {
    return (data: unknown): data is T => {
      return data !== null && data !== undefined;
    };
  }
}

/**
 * Singleton factory instance for global use
 */
export const dataStoreFactory = DataStoreFactory.getInstance();

/**
 * Validate factory configuration on module load
 */
dataStoreFactory.validateConfiguration();

// Note: Configuration types are already exported above with their declarations