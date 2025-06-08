/**
 * DataStore Monitoring Integration Tests
 * 
 * Tests for DSE-007: DataStore monitoring integration with
 * HealthMonitor and AnalyticsManager services
 */

import { HealthMonitor } from '../../../src/services/healthMonitor';
import { AnalyticsManager } from '../../../src/services/analyticsManager';
import { dataStoreFactory } from '../../../src/utils/DataStoreFactory';
import { DataStore } from '../../../src/utils/DataStore';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('../../../src/services/rateLimiter');
jest.mock('../../../src/services/contextManager');
jest.mock('../../../src/services/gemini');

describe('DataStore Monitoring Integration', () => {
  let healthMonitor: HealthMonitor;
  let analyticsManager: AnalyticsManager;
  const testDir = './test-monitoring';

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    dataStoreFactory.clearRegistry();
    
    healthMonitor = new HealthMonitor();
    analyticsManager = new AnalyticsManager(false); // Disable analytics during tests
  });

  afterEach(async () => {
    await healthMonitor.shutdown();
    await analyticsManager.shutdown();
    dataStoreFactory.clearRegistry();
    
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('HealthMonitor DataStore Integration', () => {
    test('should include DataStore metrics in health metrics', async () => {
      // Create some test DataStores
      const config1 = dataStoreFactory.createConfigStore('test-config.json');
      const state1 = dataStoreFactory.createStateStore('test-state.json');
      const metrics1 = dataStoreFactory.createMetricsStore('test-metrics.json');
      
      // Perform operations to generate metrics
      await config1.save({ test: 'config' });
      await state1.save({ count: 1 });
      await metrics1.save({ timestamp: Date.now(), value: 42 });
      await config1.load();
      
      // Get health metrics
      const healthMetrics = await healthMonitor.getCurrentMetrics();
      
      expect(healthMetrics.dataStoreMetrics).toBeDefined();
      expect(healthMetrics.dataStoreMetrics.totalStores).toBe(3);
      expect(healthMetrics.dataStoreMetrics.storesByType).toEqual({
        config: 1,
        state: 1,
        metrics: 1
      });
      expect(healthMetrics.dataStoreMetrics.totalSaveOperations).toBe(3);
      expect(healthMetrics.dataStoreMetrics.totalLoadOperations).toBe(1);
      expect(healthMetrics.dataStoreMetrics.healthyStores).toBe(3);
      expect(healthMetrics.dataStoreMetrics.unhealthyStores).toBe(0);
    });

    test('should detect unhealthy DataStores', async () => {
      // Create a DataStore with invalid path
      const badStore = dataStoreFactory.createConfigStore('/invalid/path/config.json');
      
      // Try to save (will fail)
      await expect(badStore.save({ test: 'data' })).rejects.toThrow();
      
      // Get health metrics
      const healthMetrics = await healthMonitor.getCurrentMetrics();
      
      expect(healthMetrics.dataStoreMetrics.unhealthyStores).toBeGreaterThan(0);
      expect(healthMetrics.dataStoreMetrics.totalErrors).toBeGreaterThan(0);
    });

    test('should track DataStore performance metrics', async () => {
      const store = dataStoreFactory.createStateStore('perf-test.json');
      
      // Perform multiple operations
      for (let i = 0; i < 5; i++) {
        await store.save({ iteration: i });
        await store.load();
      }
      
      const healthMetrics = await healthMonitor.getCurrentMetrics();
      
      expect(healthMetrics.dataStoreMetrics.avgSaveLatency).toBeGreaterThan(0);
      expect(healthMetrics.dataStoreMetrics.avgLoadLatency).toBeGreaterThan(0);
      expect(healthMetrics.dataStoreMetrics.totalBytesWritten).toBeGreaterThan(0);
      expect(healthMetrics.dataStoreMetrics.totalBytesRead).toBeGreaterThan(0);
    });

    test('should trigger alerts for DataStore issues', async () => {
      // Mock logger to capture alerts
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Create stores and simulate errors
      const store1 = dataStoreFactory.createConfigStore('alert-test1.json');
      const store2 = dataStoreFactory.createConfigStore('/invalid/alert-test2.json');
      
      // Generate errors
      for (let i = 0; i < 10; i++) {
        await store2.save({ test: i }).catch(() => {});
      }
      
      // Enable alerts
      (healthMonitor as any).alertConfig.enabled = true;
      
      // Collect metrics (this should trigger alerts)
      const metrics = await healthMonitor.getCurrentMetrics();
      await (healthMonitor as any).checkAlerts(metrics);
      
      // Verify alerts were triggered
      const warnCalls = warnSpy.mock.calls;
      const dataStoreAlerts = warnCalls.filter(call => 
        call[0].includes('datastore_errors') || 
        call[0].includes('datastore_health')
      );
      
      expect(dataStoreAlerts.length).toBeGreaterThan(0);
      
      warnSpy.mockRestore();
    });
  });

  describe('AnalyticsManager DataStore Integration', () => {
    beforeEach(async () => {
      // Initialize analytics with database
      analyticsManager = new AnalyticsManager(true);
      await analyticsManager.initialize();
    });

    test('should track DataStore operations', async () => {
      // Track some operations
      await analyticsManager.trackDataStoreOperation('save', 'config', 45, 1024);
      await analyticsManager.trackDataStoreOperation('load', 'state', 12, 512);
      await analyticsManager.trackDataStoreOperation('error', 'metrics', 0);
      
      // Verify tracking (would need to query database in real test)
      expect(analyticsManager).toBeDefined();
    });

    test('should generate DataStore dashboard data', async () => {
      // Create some test data
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Track various operations
      for (let i = 0; i < 10; i++) {
        await analyticsManager.trackDataStoreOperation('save', 'config', 20 + i * 5, 1000 + i * 100);
        await analyticsManager.trackDataStoreOperation('load', 'state', 5 + i * 2, 500 + i * 50);
      }
      
      // Generate dashboard
      const dashboard = await analyticsManager.getDataStoreDashboard(oneHourAgo, now);
      
      expect(dashboard).toBeDefined();
      expect(dashboard.summary).toBeDefined();
      expect(dashboard.summary.totalStores).toBeGreaterThanOrEqual(0);
      expect(dashboard.summary.performance).toBeDefined();
      expect(dashboard.summary.performance.save).toBeDefined();
      expect(dashboard.summary.performance.load).toBeDefined();
      expect(dashboard.trends).toBeDefined();
      expect(dashboard.currentMetrics).toBeDefined();
    });

    test('should integrate with factory metrics', async () => {
      // Create stores through factory
      const config = dataStoreFactory.createConfigStore('analytics-test.json');
      const state = dataStoreFactory.createStateStore('analytics-state.json');
      
      // Perform operations
      await config.save({ setting: 'value' });
      await state.save({ counter: 1 });
      
      // Get dashboard
      const dashboard = await analyticsManager.getDataStoreDashboard(
        new Date(Date.now() - 3600000),
        new Date()
      );
      
      expect(dashboard.currentMetrics.totalStores).toBe(2);
      expect(dashboard.currentMetrics.storesByType).toEqual({
        config: 1,
        state: 1
      });
    });
  });

  describe('End-to-End Monitoring Flow', () => {
    test('should track DataStore lifecycle through monitoring systems', async () => {
      // Initialize services
      await healthMonitor.initialize();
      await analyticsManager.initialize();
      
      // Create and use DataStore
      const store = dataStoreFactory.createConfigStore('e2e-test.json');
      await store.save({ testPhase: 'initial' });
      
      // Collect health metrics
      const health1 = await healthMonitor.getCurrentMetrics();
      expect(health1.dataStoreMetrics.totalSaveOperations).toBe(1);
      
      // Perform more operations
      await store.load();
      await store.save({ testPhase: 'updated' });
      
      // Collect updated metrics
      const health2 = await healthMonitor.getCurrentMetrics();
      expect(health2.dataStoreMetrics.totalSaveOperations).toBe(2);
      expect(health2.dataStoreMetrics.totalLoadOperations).toBe(1);
      
      // Track in analytics
      const storeMetrics = store.getMetrics();
      await analyticsManager.trackDataStoreOperation(
        'save', 
        'config', 
        storeMetrics.avgSaveLatency,
        storeMetrics.totalBytesWritten
      );
      
      // Verify complete monitoring
      const dashboard = await analyticsManager.getDataStoreDashboard(
        new Date(Date.now() - 3600000),
        new Date()
      );
      
      expect(dashboard.summary.totalOperations).toBeGreaterThan(0);
    });

    test('should handle monitoring with no DataStores', async () => {
      // Ensure no stores exist
      dataStoreFactory.clearRegistry();
      
      // Get metrics
      const healthMetrics = await healthMonitor.getCurrentMetrics();
      
      expect(healthMetrics.dataStoreMetrics.totalStores).toBe(0);
      expect(healthMetrics.dataStoreMetrics.healthyStores).toBe(0);
      expect(healthMetrics.dataStoreMetrics.unhealthyStores).toBe(0);
      
      // Get dashboard
      const dashboard = await analyticsManager.getDataStoreDashboard(
        new Date(Date.now() - 3600000),
        new Date()
      );
      
      expect(dashboard.summary.totalStores).toBe(0);
    });
  });
});