/**
 * DataStoreFactory Unit Tests
 * 
 * Tests for DataStore factory pattern implementation:
 * - Factory methods for different store types
 * - Standardized configurations
 * - Registry management
 * - Health checks and metrics aggregation
 */

import { DataStoreFactory, dataStoreFactory } from '../../../src/utils/DataStoreFactory';
import { DataStore } from '../../../src/utils/DataStore';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('DataStoreFactory', () => {
  const testDir = './test-data-factory';
  
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    // Clear registry between tests
    dataStoreFactory.clearRegistry();
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

  describe('Config Store Creation', () => {
    test('should create config store with optimal settings', async () => {
      const configPath = path.join(testDir, 'config.json');
      const store = dataStoreFactory.createConfigStore(configPath);
      
      expect(store).toBeInstanceOf(DataStore);
      
      // Verify it works
      await store.save({ test: 'config' });
      const loaded = await store.load();
      expect(loaded).toEqual({ test: 'config' });
      
      // Check registry
      const registry = dataStoreFactory.getRegistry();
      expect(registry.size).toBe(1);
      const entry = registry.get(path.join('./data', configPath));
      expect(entry?.type).toBe('config');
    });

    test('should apply custom validator', async () => {
      const configPath = path.join(testDir, 'validated-config.json');
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
      
      // Invalid data should fail
      await expect(store.save({ invalid: true } as any)).rejects.toThrow();
    });
  });

  describe('Metrics Store Creation', () => {
    test('should create metrics store with TTL support', async () => {
      const metricsPath = path.join(testDir, 'metrics.json');
      const ttl = 1000; // 1 second TTL for testing
      const store = dataStoreFactory.createMetricsStore(metricsPath, ttl);
      
      expect(store).toBeInstanceOf(DataStore);
      
      // Save metrics with timestamp
      const metrics = {
        timestamp: Date.now(),
        cpu: 50,
        memory: 1024
      };
      await store.save(metrics);
      
      // Should load successfully
      const loaded = await store.load();
      expect(loaded).toEqual(metrics);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Expired data should fail validation on save
      const expiredMetrics = {
        timestamp: Date.now() - 2000, // 2 seconds ago
        cpu: 60,
        memory: 2048
      };
      await expect(store.save(expiredMetrics)).rejects.toThrow('validation failed');
    });

    test('should use default TTL of 30 days', () => {
      const metricsPath = path.join(testDir, 'metrics-default.json');
      const store = dataStoreFactory.createMetricsStore(metricsPath);
      
      expect(store).toBeInstanceOf(DataStore);
      
      // Check registry
      const registry = dataStoreFactory.getRegistry();
      const entry = Array.from(registry.values()).find(e => e.type === 'metrics');
      expect(entry).toBeDefined();
    });
  });

  describe('Cache Store Creation', () => {
    test('should create cache store with entry limit', async () => {
      const cachePath = path.join(testDir, 'cache.json');
      const maxEntries = 3;
      const store = dataStoreFactory.createCacheStore(cachePath, maxEntries);
      
      expect(store).toBeInstanceOf(DataStore);
      
      // Array format should enforce max entries
      const validCache = ['entry1', 'entry2', 'entry3'];
      await store.save(validCache);
      
      // Too many entries should fail
      const invalidCache = ['entry1', 'entry2', 'entry3', 'entry4'];
      await expect(store.save(invalidCache)).rejects.toThrow('validation failed');
      
      // Object format with entries array
      const objectCache = {
        entries: ['item1', 'item2'],
        metadata: { created: Date.now() }
      };
      await store.save(objectCache);
      
      // Too many entries in object format
      const invalidObjectCache = {
        entries: ['item1', 'item2', 'item3', 'item4'],
        metadata: { created: Date.now() }
      };
      await expect(store.save(invalidObjectCache)).rejects.toThrow('validation failed');
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

  describe('Registry Management', () => {
    test('should track all created stores', () => {
      const store1 = dataStoreFactory.createConfigStore('config1.json');
      const store2 = dataStoreFactory.createMetricsStore('metrics1.json');
      const store3 = dataStoreFactory.createCacheStore('cache1.json');
      const store4 = dataStoreFactory.createStateStore('state1.json');
      const store5 = dataStoreFactory.createCustomStore('custom1.json');
      
      const registry = dataStoreFactory.getRegistry();
      expect(registry.size).toBe(5);
      
      // Check types
      const types = Array.from(registry.values()).map(e => e.type);
      expect(types).toContain('config');
      expect(types).toContain('metrics');
      expect(types).toContain('cache');
      expect(types).toContain('state');
      expect(types).toContain('custom');
    });

    test('should get store by path', () => {
      const configPath = 'test-config.json';
      const store = dataStoreFactory.createConfigStore(configPath);
      
      const retrieved = dataStoreFactory.getStore(configPath);
      expect(retrieved).toBe(store);
      
      // Non-existent store
      const notFound = dataStoreFactory.getStore('non-existent.json');
      expect(notFound).toBeUndefined();
    });

    test('should get stores by type', () => {
      dataStoreFactory.createConfigStore('config1.json');
      dataStoreFactory.createConfigStore('config2.json');
      dataStoreFactory.createMetricsStore('metrics1.json');
      
      const configStores = dataStoreFactory.getStoresByType('config');
      expect(configStores).toHaveLength(2);
      
      const metricsStores = dataStoreFactory.getStoresByType('metrics');
      expect(metricsStores).toHaveLength(1);
      
      const cacheStores = dataStoreFactory.getStoresByType('cache');
      expect(cacheStores).toHaveLength(0);
    });

    test('should update last accessed time', async () => {
      const store = dataStoreFactory.createConfigStore('access-test.json');
      
      const registry1 = dataStoreFactory.getRegistry();
      const entry1 = Array.from(registry1.values())[0];
      const firstAccess = entry1.lastAccessed;
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Access registry again
      const registry2 = dataStoreFactory.getRegistry();
      const entry2 = Array.from(registry2.values())[0];
      const secondAccess = entry2.lastAccessed;
      
      expect(secondAccess).toBeGreaterThan(firstAccess);
    });
  });

  describe('Health Checks', () => {
    test('should perform health check on all stores', async () => {
      const store1 = dataStoreFactory.createConfigStore('health1.json');
      const store2 = dataStoreFactory.createStateStore('health2.json');
      
      await store1.save({ config: true });
      await store2.save({ state: true });
      
      const healthResults = await dataStoreFactory.healthCheckAll();
      expect(healthResults.size).toBe(2);
      
      for (const [path, result] of healthResults) {
        expect(result.type).toBeDefined();
        expect(result.health).toBeDefined();
        expect(result.health.healthy).toBe(true);
      }
    });

    test('should handle health check errors', async () => {
      const store = dataStoreFactory.createConfigStore('error-test.json');
      
      // Mock health check to throw error
      jest.spyOn(store, 'healthCheck').mockRejectedValue(new Error('Health check failed'));
      
      const healthResults = await dataStoreFactory.healthCheckAll();
      const result = Array.from(healthResults.values())[0];
      
      expect(result.error).toBe('Health check failed');
    });
  });

  describe('Aggregated Metrics', () => {
    test('should aggregate metrics from all stores', async () => {
      const store1 = dataStoreFactory.createConfigStore('metrics-test1.json');
      const store2 = dataStoreFactory.createStateStore('metrics-test2.json');
      
      // Perform operations to generate metrics
      await store1.save({ test: 1 });
      await store1.load();
      await store2.save({ test: 2 });
      
      const aggregated = dataStoreFactory.getAggregatedMetrics();
      
      expect(aggregated.totalStores).toBe(2);
      expect(aggregated.totalSaveOperations).toBe(2);
      expect(aggregated.totalLoadOperations).toBe(1);
      expect(aggregated.storesByType).toEqual({
        config: 1,
        state: 1
      });
      expect(aggregated.avgSaveLatency).toBeGreaterThan(0);
    });

    test('should handle empty metrics', () => {
      dataStoreFactory.createConfigStore('empty1.json');
      dataStoreFactory.createMetricsStore('empty2.json');
      
      const aggregated = dataStoreFactory.getAggregatedMetrics();
      
      expect(aggregated.totalStores).toBe(2);
      expect(aggregated.totalSaveOperations).toBe(0);
      expect(aggregated.totalLoadOperations).toBe(0);
      expect(aggregated.avgSaveLatency).toBe(0);
      expect(aggregated.avgLoadLatency).toBe(0);
    });
  });

  describe('Configuration Presets', () => {
    test('should provide standard backup configuration', () => {
      const backupConfig = dataStoreFactory.getStandardBackupConfig();
      
      expect(backupConfig).toEqual({
        maxBackups: 5,
        retentionPeriod: '30d',
        compressionEnabled: true
      });
    });

    test('should provide preset configurations', () => {
      const presets = dataStoreFactory.getPresets();
      
      expect(presets.configStore.maxBackups).toBe(10);
      expect(presets.metricsStore.maxBackups).toBe(3);
      expect(presets.cacheStore.maxBackups).toBe(2);
      expect(presets.stateStore.maxBackups).toBe(5);
      
      // All should have standard settings
      for (const preset of Object.values(presets)) {
        expect(preset.createDirectories).toBe(true);
        expect(preset.fileMode).toBe(0o644);
      }
    });
  });

  describe('Path Resolution', () => {
    test('should resolve relative paths to data directory', () => {
      const store = dataStoreFactory.createConfigStore('relative.json');
      const registry = dataStoreFactory.getRegistry();
      const paths = Array.from(registry.keys());
      
      expect(paths[0]).toMatch(/^\.\/data\/relative\.json$/);
    });

    test('should preserve absolute paths', () => {
      const absolutePath = path.resolve(testDir, 'absolute.json');
      const store = dataStoreFactory.createConfigStore(absolutePath);
      const registry = dataStoreFactory.getRegistry();
      const paths = Array.from(registry.keys());
      
      expect(paths[0]).toBe(absolutePath);
    });
  });
});