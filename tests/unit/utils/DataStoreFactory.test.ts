/**
 * DataStoreFactory Unit Tests - DSE-006 Implementation
 * 
 * Tests for DataStore factory pattern with standardized configurations:
 * - Factory methods for different store types with DSE-006 specifications
 * - Standardized backup configurations and validation
 * - Centralized registry management  
 * - Health checks and configuration validation
 * - Service factory pattern implementation
 */

import { 
  DataStoreFactory, 
  dataStoreFactory,
  DataStoreFactoryConfig,
  ConfigStoreDefaults,
  MetricsStoreDefaults,
  CacheStoreDefaults,
  StateStoreDefaults,
  DataStoreRegistryEntry
} from '../../../src/utils/DataStoreFactory';
import { DataStore } from '../../../src/utils/DataStore';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('DataStoreFactory', () => {
  const testDir = './test-data-factory';
  
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    // Note: Registry cannot be cleared in new implementation due to singleton nature
    // Tests should use unique file paths to avoid conflicts
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Singleton Pattern', () => {
    test('should return same instance', () => {
      const instance1 = DataStoreFactory.getInstance();
      const instance2 = DataStoreFactory.getInstance();
      expect(instance1).toBe(instance2);
    });

    test('should use exported singleton', () => {
      const instance = DataStoreFactory.getInstance();
      expect(dataStoreFactory).toBe(instance);
    });
  });

  describe('DSE-006 Configuration Validation', () => {
    test('should have correct standard backup configuration', () => {
      const backupConfig = dataStoreFactory.getStandardBackupConfig();
      
      expect(backupConfig).toEqual({
        maxBackups: 5,
        retentionPeriod: '30d',
        compressionEnabled: true
      });
    });

    test('should have correct factory configuration', () => {
      const config = dataStoreFactory.getFactoryConfig();
      
      // Validate standard backup config
      expect(config.standardBackupConfig.maxBackups).toBe(5);
      expect(config.standardBackupConfig.retentionPeriod).toBe('30d');
      expect(config.standardBackupConfig.compressionEnabled).toBe(true);
      
      // Validate config store defaults
      expect(config.configStoreDefaults.maxBackups).toBe(10);
      expect(config.configStoreDefaults.compressionEnabled).toBe(true);
      expect(config.configStoreDefaults.validationRequired).toBe(true);
      
      // Validate metrics store defaults
      expect(config.metricsStoreDefaults.compressionEnabled).toBe(true);
      expect(config.metricsStoreDefaults.compressionThreshold).toBe(10000);
      expect(config.metricsStoreDefaults.ttl).toBe(2592000000); // 30 days
      
      // Validate cache store defaults
      expect(config.cacheStoreDefaults.ttl).toBe(31536000000); // 1 year
      expect(config.cacheStoreDefaults.maxEntries).toBe(100);
      expect(config.cacheStoreDefaults.autoCleanup).toBe(true);
      
      // Validate state store defaults
      expect(config.stateStoreDefaults.maxBackups).toBe(5);
      expect(config.stateStoreDefaults.compressionEnabled).toBe(true);
      expect(config.stateStoreDefaults.autoCleanup).toBe(true);
      expect(config.stateStoreDefaults.retryDelayMs).toBe(100);
    });

    test('should validate configuration on startup', () => {
      expect(() => dataStoreFactory.validateConfiguration()).not.toThrow();
    });
  });

  describe('Config Store Creation', () => {
    test('should create config store with DSE-006 optimal settings', async () => {
      const configPath = path.join(testDir, 'config-dse006.json');
      const store = dataStoreFactory.createConfigStore(configPath);
      
      expect(store).toBeInstanceOf(DataStore);
      
      // Verify it works
      await store.save({ test: 'config', version: '1.0.0' });
      const loaded = await store.load();
      expect(loaded).toEqual({ test: 'config', version: '1.0.0' });
      
      // Check registry
      const registeredStores = dataStoreFactory.getRegisteredStores();
      const configStore = registeredStores.find(entry => 
        entry.filePath.includes('config-dse006.json') && entry.type === 'config'
      );
      expect(configStore).toBeDefined();
      expect(configStore!.type).toBe('config');
    });

    test('should apply custom validator with factory defaults', async () => {
      const configPath = path.join(testDir, 'validated-config-dse006.json');
      const validator = (data: unknown): data is { version: string } => {
        return typeof data === 'object' && 
               data !== null && 
               'version' in data &&
               typeof (data as any).version === 'string';
      };
      
      const store = dataStoreFactory.createConfigStore<{ version: string }>(
        configPath,
        validator
      );
      
      // Valid data should save
      await store.save({ version: '1.0.0' });
      
      // Invalid data should fail validation
      await expect(store.save({ invalid: true } as any)).rejects.toThrow();
    });

    test('should use config store defaults from DSE-006', async () => {
      const configPath = path.join(testDir, 'defaults-test.json');
      const store = dataStoreFactory.createConfigStore(configPath);
      
      const registeredStore = dataStoreFactory.getRegisteredStore(configPath);
      expect(registeredStore).toBeDefined();
      
      // Check that factory defaults are applied
      const config = registeredStore!.configuration;
      expect(config.compressionEnabled).toBe(true);
      expect(config.maxBackups).toBe(10);
      expect(config.createDirectories).toBe(true);
    });
  });

  describe('Metrics Store Creation', () => {
    test('should create metrics store with DSE-006 defaults', async () => {
      const metricsPath = path.join(testDir, 'metrics-dse006.json');
      const store = dataStoreFactory.createMetricsStore(metricsPath);
      
      expect(store).toBeInstanceOf(DataStore);
      
      // Save metrics data
      const metrics = {
        timestamp: Date.now(),
        cpu: 50,
        memory: 1024,
        requests: 100
      };
      await store.save(metrics);
      
      // Should load successfully
      const loaded = await store.load();
      expect(loaded).toEqual(metrics);
      
      // Check registry configuration
      const registeredStore = dataStoreFactory.getRegisteredStore(metricsPath);
      expect(registeredStore).toBeDefined();
      expect(registeredStore!.type).toBe('metrics');
      
      const config = registeredStore!.configuration;
      expect(config.compressionEnabled).toBe(true);
      expect(config.compressionThreshold).toBe(10000);
      expect(config.ttl).toBe(2592000000); // 30 days
      expect(config.autoCleanup).toBe(true);
    });

    test('should apply custom validator for metrics', async () => {
      const metricsPath = path.join(testDir, 'validated-metrics.json');
      const validator = (data: unknown): data is { timestamp: number; value: number } => {
        return typeof data === 'object' && 
               data !== null && 
               'timestamp' in data &&
               'value' in data &&
               typeof (data as any).timestamp === 'number' &&
               typeof (data as any).value === 'number';
      };
      
      const store = dataStoreFactory.createMetricsStore<{ timestamp: number; value: number }>(
        metricsPath,
        validator
      );
      
      // Valid metrics
      await store.save({ timestamp: Date.now(), value: 42 });
      
      // Invalid metrics should fail
      await expect(store.save({ invalid: true } as any)).rejects.toThrow();
    });
  });

  describe('Cache Store Creation', () => {
    test('should create cache store with DSE-006 defaults', async () => {
      const cachePath = path.join(testDir, 'cache-dse006.json');
      const store = dataStoreFactory.createCacheStore(cachePath);
      
      expect(store).toBeInstanceOf(DataStore);
      
      // Test basic cache functionality
      const cacheData = {
        entries: ['item1', 'item2', 'item3'],
        metadata: { created: Date.now() }
      };
      await store.save(cacheData);
      
      const loaded = await store.load();
      expect(loaded).toEqual(cacheData);
      
      // Check registry configuration
      const registeredStore = dataStoreFactory.getRegisteredStore(cachePath);
      expect(registeredStore).toBeDefined();
      expect(registeredStore!.type).toBe('cache');
      
      const config = registeredStore!.configuration;
      expect(config.compressionEnabled).toBe(false); // Cache prioritizes speed
      expect(config.ttl).toBe(31536000000); // 1 year
      expect(config.maxEntries).toBe(100);
      expect(config.autoCleanup).toBe(true);
      expect(config.maxBackups).toBe(3); // Fewer backups for cache
    });

    test('should accept custom validator for cache', async () => {
      const cachePath = path.join(testDir, 'validated-cache.json');
      const validator = (data: unknown): data is { items: string[]; count: number } => {
        return typeof data === 'object' && 
               data !== null && 
               'items' in data &&
               'count' in data &&
               Array.isArray((data as any).items) &&
               typeof (data as any).count === 'number';
      };
      
      const store = dataStoreFactory.createCacheStore<{ items: string[]; count: number }>(
        cachePath,
        validator
      );
      
      // Valid cache data
      await store.save({ items: ['a', 'b'], count: 2 });
      
      // Invalid cache data should fail
      await expect(store.save({ invalid: true } as any)).rejects.toThrow();
    });
  });

  describe('State Store Creation', () => {
    test('should create state store for services', async () => {
      const statePath = path.join(testDir, 'service-state.json');
      const store = dataStoreFactory.createStateStore(statePath);
      
      expect(store).toBeInstanceOf(DataStore);
      
      // Save service state
      const state = {
        initialized: true,
        lastSync: Date.now(),
        counters: { requests: 100, errors: 2 }
      };
      await store.save(state);
      
      const loaded = await store.load();
      expect(loaded).toEqual(state);
    });

    test('should accept custom validator', async () => {
      const statePath = path.join(testDir, 'validated-state.json');
      const validator = (data: unknown): data is { count: number } => {
        return typeof data === 'object' && 
               data !== null && 
               'count' in data &&
               typeof (data as any).count === 'number' &&
               (data as any).count >= 0;
      };
      
      const store = dataStoreFactory.createStateStore<{ count: number }>(
        statePath,
        validator
      );
      
      // Valid state
      await store.save({ count: 10 });
      
      // Invalid state
      await expect(store.save({ count: -5 })).rejects.toThrow('validation failed');
    });
  });

  describe('Custom Store Creation', () => {
    test('should create custom store with merged config', async () => {
      const customPath = path.join(testDir, 'custom.json');
      const store = dataStoreFactory.createCustomStore(customPath, {
        maxBackups: 20,
        enableDebugLogging: true
      });
      
      expect(store).toBeInstanceOf(DataStore);
      
      // Should work with custom configuration
      await store.save({ custom: 'data' });
      const loaded = await store.load();
      expect(loaded).toEqual({ custom: 'data' });
    });
  });

  describe('Registry Management - DSE-006', () => {
    test('should track all created stores with unique IDs', () => {
      const testPrefix = Date.now().toString();
      const store1 = dataStoreFactory.createConfigStore(`${testPrefix}-config1.json`);
      const store2 = dataStoreFactory.createMetricsStore(`${testPrefix}-metrics1.json`);
      const store3 = dataStoreFactory.createCacheStore(`${testPrefix}-cache1.json`);
      const store4 = dataStoreFactory.createStateStore(`${testPrefix}-state1.json`);
      
      const registeredStores = dataStoreFactory.getRegisteredStores();
      const testStores = registeredStores.filter(entry => 
        entry.filePath.includes(testPrefix)
      );
      
      expect(testStores).toHaveLength(4);
      
      // Check types
      const types = testStores.map(e => e.type);
      expect(types).toContain('config');
      expect(types).toContain('metrics');
      expect(types).toContain('cache');
      expect(types).toContain('state');
      
      // Check unique IDs
      const ids = testStores.map(e => e.id);
      expect(new Set(ids).size).toBe(4); // All unique
    });

    test('should get store by normalized path', () => {
      const testPrefix = Date.now().toString();
      const configPath = `${testPrefix}-test-config.json`;
      const store = dataStoreFactory.createConfigStore(configPath);
      
      const retrieved = dataStoreFactory.getRegisteredStore(configPath);
      expect(retrieved).toBeDefined();
      expect(retrieved!.instance).toBe(store);
      
      // Non-existent store
      const notFound = dataStoreFactory.getRegisteredStore('non-existent-file.json');
      expect(notFound).toBeUndefined();
    });

    test('should provide registry statistics', () => {
      const testPrefix = Date.now().toString();
      dataStoreFactory.createConfigStore(`${testPrefix}-stats-config1.json`);
      dataStoreFactory.createConfigStore(`${testPrefix}-stats-config2.json`);
      dataStoreFactory.createMetricsStore(`${testPrefix}-stats-metrics1.json`);
      
      const stats = dataStoreFactory.getRegistryStats();
      
      expect(stats.totalStores).toBeGreaterThan(0);
      expect(stats.storesByType.config).toBeGreaterThan(0);
      expect(stats.oldestStore).toBeInstanceOf(Date);
      expect(stats.newestStore).toBeInstanceOf(Date);
    });

    test('should unregister stores', () => {
      const testPrefix = Date.now().toString();
      const testPath = `${testPrefix}-unregister-test.json`;
      
      dataStoreFactory.createConfigStore(testPath);
      
      // Verify store exists
      const beforeUnregister = dataStoreFactory.getRegisteredStore(testPath);
      expect(beforeUnregister).toBeDefined();
      
      // Unregister
      const unregistered = dataStoreFactory.unregisterStore(testPath);
      expect(unregistered).toBe(true);
      
      // Verify store no longer exists
      const afterUnregister = dataStoreFactory.getRegisteredStore(testPath);
      expect(afterUnregister).toBeUndefined();
      
      // Unregistering again should return false
      const unregisteredAgain = dataStoreFactory.unregisterStore(testPath);
      expect(unregisteredAgain).toBe(false);
    });
  });

  describe('Health Checks - DSE-006', () => {
    test('should perform comprehensive health check on all stores', async () => {
      const testPrefix = Date.now().toString();
      const store1 = dataStoreFactory.createConfigStore(`${testPrefix}-health1.json`);
      const store2 = dataStoreFactory.createStateStore(`${testPrefix}-health2.json`);
      
      await store1.save({ config: true, version: '1.0.0' });
      await store2.save({ state: true, lastUpdate: Date.now() });
      
      const healthResults = await dataStoreFactory.performHealthCheck();
      
      expect(healthResults.totalStores).toBeGreaterThan(0);
      expect(healthResults.healthyStores).toBeGreaterThan(0);
      expect(healthResults.healthyStores + healthResults.unhealthyStores).toBe(healthResults.totalStores);
      expect(Array.isArray(healthResults.errors)).toBe(true);
    });

    test('should handle health check errors properly', async () => {
      const testPrefix = Date.now().toString();
      const store = dataStoreFactory.createConfigStore(`${testPrefix}-error-test.json`);
      
      // Mock health check to throw error
      jest.spyOn(store, 'healthCheck').mockRejectedValue(new Error('Simulated health check failure'));
      
      const healthResults = await dataStoreFactory.performHealthCheck();
      
      // Should have at least one error
      const errorForOurStore = healthResults.errors.find(error => 
        error.filePath.includes(`${testPrefix}-error-test.json`)
      );
      expect(errorForOurStore).toBeDefined();
      expect(errorForOurStore!.error).toBe('Simulated health check failure');
    });

    test('should update last accessed time during health checks', async () => {
      const testPrefix = Date.now().toString();
      const store = dataStoreFactory.createConfigStore(`${testPrefix}-access-time.json`);
      
      await store.save({ test: true });
      
      const beforeHealth = dataStoreFactory.getRegisteredStore(`${testPrefix}-access-time.json`);
      const timeBefore = beforeHealth!.lastAccessed;
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Perform health check
      await dataStoreFactory.performHealthCheck();
      
      const afterHealth = dataStoreFactory.getRegisteredStore(`${testPrefix}-access-time.json`);
      const timeAfter = afterHealth!.lastAccessed;
      
      expect(timeAfter.getTime()).toBeGreaterThan(timeBefore.getTime());
    });
  });

  describe('Configuration Access', () => {
    test('should provide factory configuration', () => {
      const config = dataStoreFactory.getFactoryConfig();
      
      expect(config).toBeDefined();
      expect(config.standardBackupConfig).toBeDefined();
      expect(config.configStoreDefaults).toBeDefined();
      expect(config.metricsStoreDefaults).toBeDefined();
      expect(config.cacheStoreDefaults).toBeDefined();
      expect(config.stateStoreDefaults).toBeDefined();
    });

    test('should provide standard backup configuration', () => {
      const backupConfig = dataStoreFactory.getStandardBackupConfig();
      
      expect(backupConfig).toEqual({
        maxBackups: 5,
        retentionPeriod: '30d',
        compressionEnabled: true
      });
    });
  });

  describe('Service Factory Pattern Validation', () => {
    test('should create different store types with appropriate configurations', () => {
      const testPrefix = Date.now().toString();
      
      // Create one of each store type
      const configStore = dataStoreFactory.createConfigStore(`${testPrefix}-pattern-config.json`);
      const metricsStore = dataStoreFactory.createMetricsStore(`${testPrefix}-pattern-metrics.json`);
      const cacheStore = dataStoreFactory.createCacheStore(`${testPrefix}-pattern-cache.json`);
      const stateStore = dataStoreFactory.createStateStore(`${testPrefix}-pattern-state.json`);
      
      // All should be DataStore instances
      expect(configStore).toBeInstanceOf(DataStore);
      expect(metricsStore).toBeInstanceOf(DataStore);
      expect(cacheStore).toBeInstanceOf(DataStore);
      expect(stateStore).toBeInstanceOf(DataStore);
      
      // Check registry tracking
      const registeredStores = dataStoreFactory.getRegisteredStores();
      const patternStores = registeredStores.filter(entry => 
        entry.filePath.includes(testPrefix)
      );
      
      expect(patternStores).toHaveLength(4);
      
      // Verify each store type has different configuration
      const configEntry = patternStores.find(s => s.type === 'config');
      const metricsEntry = patternStores.find(s => s.type === 'metrics');
      const cacheEntry = patternStores.find(s => s.type === 'cache');
      const stateEntry = patternStores.find(s => s.type === 'state');
      
      expect(configEntry?.configuration.maxBackups).toBe(10);
      expect(metricsEntry?.configuration.compressionThreshold).toBe(10000);
      expect(cacheEntry?.configuration.maxEntries).toBe(100);
      expect(stateEntry?.configuration.maxBackups).toBe(5);
    });
  });
});