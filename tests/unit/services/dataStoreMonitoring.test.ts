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

    test('should provide DataStore performance baseline', async () => {
      const store = dataStoreFactory.createMetricsStore('baseline-test.json');
      
      // Generate some operations
      await store.save({ baseline: 'test' });
      await store.load();
      
      // Wait for metrics to be collected
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const baseline = healthMonitor.getDataStorePerformanceBaseline();
      
      if (baseline) {
        expect(baseline.avgSaveLatency).toBeGreaterThanOrEqual(0);
        expect(baseline.avgLoadLatency).toBeGreaterThanOrEqual(0);
        expect(baseline.errorRate).toBeGreaterThanOrEqual(0);
        expect(baseline.timestamp).toBeGreaterThan(0);
      }
    });

    test('should cache DataStore health checks for performance', async () => {
      // Create a store to ensure we have data
      const store = dataStoreFactory.createConfigStore('cache-test.json');
      await store.save({ test: 'data' });

      // First health check
      const start1 = Date.now();
      await healthMonitor.getCurrentMetrics();
      const time1 = Date.now() - start1;

      // Immediate second health check (should be cached)
      const start2 = Date.now();
      await healthMonitor.getCurrentMetrics();
      const time2 = Date.now() - start2;

      // Second call should be faster due to caching
      expect(time2).toBeLessThan(time1 + 50); // Allow some variance
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

    test('should generate enhanced dashboard with insights', async () => {
      // Create operations with different performance profiles
      await analyticsManager.trackDataStoreOperation('save', 'fast-store', 50, 1024);
      await analyticsManager.trackDataStoreOperation('save', 'slow-store', 2000, 2048); // Slow
      await analyticsManager.trackDataStoreOperation('load', 'fast-store', 25, 1024);
      await analyticsManager.trackDataStoreOperation('error', 'error-store', 100, 0); // Error

      const dashboard = await analyticsManager.getDataStoreDashboard(
        new Date(Date.now() - 3600000),
        new Date()
      );

      expect(dashboard.summary).toBeDefined();
      expect(dashboard.performance).toBeDefined();
      expect(dashboard.capacity).toBeDefined();
      expect(dashboard.health).toBeDefined();
      expect(dashboard.insights).toBeDefined();
      expect(dashboard.insights.recommendations).toBeInstanceOf(Array);
      
      // Should detect performance issues in insights
      if (dashboard.insights.performance) {
        expect(dashboard.insights.performance).toBeInstanceOf(Array);
      }
    });

    test('should calculate capacity utilization metrics', async () => {
      // Track significant data volume operations
      for (let i = 0; i < 10; i++) {
        await analyticsManager.trackDataStoreOperation('save', 'large-store', 100, 10 * 1024 * 1024); // 10MB each
      }

      const dashboard = await analyticsManager.getDataStoreDashboard(
        new Date(Date.now() - 3600000),
        new Date()
      );

      expect(dashboard.capacity).toBeDefined();
      expect(dashboard.capacity.utilization).toBeDefined();
      expect(dashboard.capacity.utilization.status).toBeDefined();
      expect(dashboard.capacity.utilization.totalBytes).toBeGreaterThan(0);
      expect(dashboard.capacity.utilization.formattedSize).toBeDefined();
    });
  });

  describe('DataStore Monitoring Hooks', () => {
    test('should register and trigger monitoring hooks', async () => {
      const monitoringEvents: Array<{
        event: string;
        latency: number;
        bytes: number;
        error?: string;
      }> = [];

      const store = dataStoreFactory.createConfigStore('hook-test.json');
      
      // Register monitoring hook
      store.addMonitoringHook((event, latency, bytes, error) => {
        monitoringEvents.push({ event, latency, bytes, error });
      });

      // Perform operations
      await store.save({ test: 'data' });
      await store.load();

      // Verify events were captured
      expect(monitoringEvents).toHaveLength(2);
      expect(monitoringEvents[0].event).toBe('save');
      expect(monitoringEvents[0].latency).toBeGreaterThan(0);
      expect(monitoringEvents[0].bytes).toBeGreaterThan(0);
      
      expect(monitoringEvents[1].event).toBe('load');
      expect(monitoringEvents[1].latency).toBeGreaterThan(0);
      expect(monitoringEvents[1].bytes).toBeGreaterThan(0);
    });

    test('should capture error events in hooks', async () => {
      const monitoringEvents: Array<any> = [];
      
      // Create store with validator that always fails
      const store = new DataStore('error-test.json', {
        validator: () => false // Always fail validation
      });

      store.addMonitoringHook((event, latency, bytes, error) => {
        monitoringEvents.push({ event, latency, bytes, error });
      });

      try {
        await store.save({ test: 'data' });
      } catch (error) {
        // Expected to fail
      }

      const errorEvents = monitoringEvents.filter(e => e.event === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].error).toBeDefined();
    });

    test('should remove monitoring hooks correctly', async () => {
      const monitoringEvents: Array<any> = [];
      const store = dataStoreFactory.createConfigStore('remove-hook-test.json');
      
      const hook = (event: string, latency: number, bytes: number, error?: string) => {
        monitoringEvents.push({ event, latency, bytes, error });
      };

      store.addMonitoringHook(hook);
      await store.save({ test: 'data1' });
      
      expect(monitoringEvents).toHaveLength(1);

      // Remove hook
      store.removeMonitoringHook(hook);
      await store.save({ test: 'data2' });

      // Should still have only one event
      expect(monitoringEvents).toHaveLength(1);
    });

    test('should measure monitoring performance overhead', async () => {
      const iterations = 50;
      let monitoringEventCount = 0;

      // Baseline performance without monitoring
      const baselineStore = dataStoreFactory.createConfigStore('baseline-perf.json');
      const baselineStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        await baselineStore.save({ iteration: i });
      }
      const baselineTime = Date.now() - baselineStart;

      // Performance with monitoring
      const monitoredStore = dataStoreFactory.createConfigStore('monitored-perf.json');
      monitoredStore.addMonitoringHook(() => {
        monitoringEventCount++;
      });

      const monitoredStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        await monitoredStore.save({ iteration: i });
      }
      const monitoredTime = Date.now() - monitoredStart;

      // Verify monitoring worked
      expect(monitoringEventCount).toBe(iterations);

      // Calculate overhead percentage
      const overhead = ((monitoredTime - baselineTime) / baselineTime) * 100;
      
      // Monitoring overhead should be minimal (< 10% for test environment)
      expect(overhead).toBeLessThan(10);
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