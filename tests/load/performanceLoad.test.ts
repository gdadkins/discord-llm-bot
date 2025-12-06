import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { HealthMonitor } from '../../src/services/health/HealthMonitor';
import { GracefulDegradation } from '../../src/services/gracefulDegradation';
import { ConfigurationManager } from '../../src/services/config/ConfigurationManager';
import { createTestEnvironment, waitForAsync } from '../test-utils';
import * as path from 'path';

describe('Performance Load Tests', () => {
  let testEnv: ReturnType<typeof createTestEnvironment>;
  let healthMonitor: HealthMonitor;
  let gracefulDegradation: GracefulDegradation;
  let configurationManager: ConfigurationManager;

  // Performance thresholds
  const PERFORMANCE_THRESHOLDS = {
    healthMetricsCollection: 50, // ms per operation
    configurationValidation: 10, // ms per validation
    circuitBreakerOperation: 5, // ms per circuit breaker check
    massiveDataHandling: 1000, // ms for large data sets
    concurrentOperations: 2000, // ms for 100 concurrent operations
  };

  beforeEach(async () => {
    testEnv = createTestEnvironment();
    
    healthMonitor = new HealthMonitor(path.join(global.TEST_HEALTH_DIR, 'load-metrics.json'));
    gracefulDegradation = new GracefulDegradation();
    configurationManager = new ConfigurationManager(
      path.join(global.TEST_CONFIG_DIR, 'load-config.json'),
      path.join(global.TEST_CONFIG_DIR, 'load-versions'),
      path.join(global.TEST_CONFIG_DIR, 'load-audit.log')
    );

    await configurationManager.initialize();
    await healthMonitor.initialize();
    await gracefulDegradation.initialize();
  });

  afterEach(async () => {
    await gracefulDegradation.shutdown();
    await healthMonitor.shutdown();
    await configurationManager.shutdown();
    testEnv.cleanup();
  });

  describe('HealthMonitor Performance', () => {
    it('should collect metrics within performance threshold', async () => {
      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await healthMonitor.getCurrentMetrics();
      }

      const endTime = Date.now();
      const averageTime = (endTime - startTime) / iterations;

      expect(averageTime).toBeLessThan(PERFORMANCE_THRESHOLDS.healthMetricsCollection);
      console.log(`Health metrics collection: ${averageTime.toFixed(2)}ms average`);
    });

    it('should handle high-frequency performance data recording', async () => {
      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        healthMonitor.recordResponseTime(Math.random() * 1000);
        healthMonitor.recordRequest();
        if (i % 10 === 0) {
          healthMonitor.recordError();
        }
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should handle 1000 recordings in reasonable time
      expect(totalTime).toBeLessThan(100);
      console.log(`Performance data recording: ${totalTime}ms for ${iterations} operations`);

      // Verify data integrity
      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(metrics.responseTime.p50).toBeGreaterThan(0);
    });

    it('should maintain performance with large metric history', async () => {
      // Simulate large amount of historical data
      for (let i = 0; i < 1000; i++) {
        const timestamp = Date.now() - (i * 1000);
        (healthMonitor as any).metricsData.set(timestamp, {
          timestamp,
          metrics: {
            memoryUsage: { rss: Math.random() * 1000000000 },
            uptime: Math.random() * 86400000,
            errorRate: Math.random() * 10,
          },
        });
      }

      const startTime = Date.now();
      const historical = await healthMonitor.getHistoricalMetrics();
      const endTime = Date.now();

      const queryTime = endTime - startTime;
      expect(queryTime).toBeLessThan(100);
      expect(historical.length).toBeGreaterThan(0);
      
      console.log(`Historical metrics query: ${queryTime}ms for ${historical.length} records`);
    });

    it('should handle concurrent metrics collection', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentRequests }, () => 
        healthMonitor.getCurrentMetrics()
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.concurrentOperations);
      expect(results).toHaveLength(concurrentRequests);

      console.log(`Concurrent metrics collection: ${totalTime}ms for ${concurrentRequests} requests`);
    });

    it('should efficiently clean up old data', async () => {
      // Add many old snapshots
      const oldDataCount = 10000;
      const cutoffTime = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago

      for (let i = 0; i < oldDataCount; i++) {
        const timestamp = cutoffTime - (i * 1000);
        (healthMonitor as any).metricsData.set(timestamp, {
          timestamp,
          metrics: { uptime: i },
        });
      }

      const startTime = Date.now();
      await (healthMonitor as any).performCleanup();
      const endTime = Date.now();

      const cleanupTime = endTime - startTime;
      expect(cleanupTime).toBeLessThan(500); // Should clean up quickly

      console.log(`Data cleanup: ${cleanupTime}ms for ${oldDataCount} old records`);
    });
  });

  describe('GracefulDegradation Performance', () => {
    it('should evaluate degradation status quickly', async () => {
      const iterations = 500;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await gracefulDegradation.shouldDegrade();
      }

      const endTime = Date.now();
      const averageTime = (endTime - startTime) / iterations;

      expect(averageTime).toBeLessThan(10); // Very fast operations
      console.log(`Degradation evaluation: ${averageTime.toFixed(2)}ms average`);
    });

    it('should handle high-volume circuit breaker operations', async () => {
      const operations = 1000;
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const startTime = Date.now();

      const promises = Array.from({ length: operations }, () =>
        gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini')
      );

      await Promise.all(promises);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      const averageTime = totalTime / operations;

      expect(averageTime).toBeLessThan(PERFORMANCE_THRESHOLDS.circuitBreakerOperation);
      console.log(`Circuit breaker operations: ${averageTime.toFixed(2)}ms average`);
    });

    it('should efficiently manage large message queues', async () => {
      const queueSize = 1000;
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      const startTime = Date.now();

      // Fill queue with messages
      const queuePromises = Array.from({ length: queueSize }, (_, i) =>
        gracefulDegradation.queueMessage(
          `user-${i}`,
          `message ${i}`,
          mockRespond,
          'test-server',
          i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low'
        )
      );

      await Promise.all(queuePromises);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(1000); // Should queue efficiently

      console.log(`Message queueing: ${totalTime}ms for ${queueSize} messages`);

      // Verify queue size and ordering
      const status = gracefulDegradation.getStatus();
      expect(status.queue.size).toBeLessThanOrEqual(100); // Default max queue size
    });

    it('should process queued messages efficiently', async () => {
      const messageCount = 100;
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Add messages to queue
      for (let i = 0; i < messageCount; i++) {
        await gracefulDegradation.queueMessage(
          `user-${i}`,
          `message ${i}`,
          mockRespond,
          'test-server',
          'medium'
        );
      }

      const startTime = Date.now();
      
      // Process queue multiple times to clear it
      for (let i = 0; i < 25; i++) { // 100 messages / 5 per batch = 20 batches
        await (gracefulDegradation as any).processQueue();
        await waitForAsync(1); // Small delay to simulate real processing
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(2000); // Should process reasonably fast
      console.log(`Queue processing: ${totalTime}ms for ${messageCount} messages`);
    });

    it('should handle rapid state transitions', async () => {
      const transitions = 100;
      const mockOperation = jest.fn();

      // Alternate between success and failure to trigger state transitions
      mockOperation.mockImplementation((call) => {
        if (call % 2 === 0) {
          return Promise.resolve('success');
        } else {
          return Promise.reject(new Error('failure'));
        }
      });

      const startTime = Date.now();

      for (let i = 0; i < transitions; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini');
        } catch (error) {
          // Expected for half the operations
        }
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(1000);
      console.log(`State transitions: ${totalTime}ms for ${transitions} operations`);
    });
  });

  describe('ConfigurationManager Performance', () => {
    it('should validate configuration quickly', async () => {
      const config = configurationManager.getConfiguration();
      const iterations = 100;
      
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const result = configurationManager.validateConfiguration(config);
        expect(result.valid).toBe(true);
      }

      const endTime = Date.now();
      const averageTime = (endTime - startTime) / iterations;

      expect(averageTime).toBeLessThan(PERFORMANCE_THRESHOLDS.configurationValidation);
      console.log(`Configuration validation: ${averageTime.toFixed(2)}ms average`);
    });

    it('should handle rapid configuration updates', async () => {
      const updates = 50;
      const startTime = Date.now();

      for (let i = 0; i < updates; i++) {
        await configurationManager.updateConfigurationSection(
          'features',
          {
            monitoring: {
              ...configurationManager.getMonitoringConfig(),
              healthMetrics: {
                ...configurationManager.getMonitoringConfig().healthMetrics,
                collectionInterval: 30000 + i,
              },
            },
          },
          `user-${i}`,
          `Update ${i}`
        );
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / updates;

      expect(averageTime).toBeLessThan(50); // Should update quickly
      console.log(`Configuration updates: ${averageTime.toFixed(2)}ms average`);
    });

    it('should efficiently manage version history', async () => {
      const versionCount = 100;
      
      // Create many versions
      for (let i = 0; i < versionCount; i++) {
        await configurationManager.updateConfiguration(
          {
            ...configurationManager.getConfiguration(),
            version: `test-version-${i}`,
          },
          `user-${i}`,
          `Version ${i}`
        );
      }

      const startTime = Date.now();
      const versions = await configurationManager.getVersionHistory();
      const endTime = Date.now();

      const queryTime = endTime - startTime;
      expect(queryTime).toBeLessThan(100);
      expect(versions.length).toBeLessThanOrEqual(50); // Should enforce version limit

      console.log(`Version history query: ${queryTime}ms for ${versions.length} versions`);
    });

    it('should handle large audit logs efficiently', async () => {
      // Simulate large audit log
      const logEntries = Array.from({ length: 1000 }, (_, i) => 
        JSON.stringify({
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
          version: `v-${i}`,
          modifiedBy: `user-${i}`,
          changeType: 'update',
          path: ['test'],
          oldValue: i - 1,
          newValue: i,
        })
      ).join('\n');

      // Mock large audit log
      const mockFs = require('fs-extra');
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(logEntries);

      const startTime = Date.now();
      const auditLog = await configurationManager.getAuditLog(100);
      const endTime = Date.now();

      const queryTime = endTime - startTime;
      expect(queryTime).toBeLessThan(100);
      expect(auditLog.length).toBeLessThanOrEqual(100);

      console.log(`Audit log query: ${queryTime}ms for ${auditLog.length} entries`);
    });
  });

  describe('Memory Usage and Resource Management', () => {
    it('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform memory-intensive operations
      for (let i = 0; i < 100; i++) {
        await healthMonitor.getCurrentMetrics();
        await gracefulDegradation.shouldDegrade();
        await configurationManager.getConfiguration();
        
        // Record performance data
        for (let j = 0; j < 10; j++) {
          healthMonitor.recordResponseTime(Math.random() * 1000);
          healthMonitor.recordRequest();
        }

        // Periodic cleanup to simulate real usage
        if (i % 20 === 0) {
          if (global.gc) {
            global.gc();
          }
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncreaseMB).toBeLessThan(50);
      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
    });

    it('should handle timer and interval cleanup properly', async () => {
      // Initialize multiple services to create timers
      const services = Array.from({ length: 10 }, () => {
        const hm = new HealthMonitor();
        const gd = new GracefulDegradation();
        return { hm, gd };
      });

      // Initialize all
      for (const service of services) {
        await service.hm.initialize();
        await service.gd.initialize();
      }

      // Shutdown all rapidly
      const startTime = Date.now();
      
      await Promise.all(services.map(async service => {
        await service.gd.shutdown();
        await service.hm.shutdown();
      }));

      const endTime = Date.now();
      const shutdownTime = endTime - startTime;

      expect(shutdownTime).toBeLessThan(1000);
      console.log(`Rapid shutdown: ${shutdownTime}ms for ${services.length * 2} services`);
    });
  });

  describe('Stress Testing', () => {
    it('should handle extreme load without failures', async () => {
      const extremeLoad = 1000;
      const startTime = Date.now();
      
      const promises: Promise<any>[] = [];

      // Create massive concurrent load
      for (let i = 0; i < extremeLoad; i++) {
        if (i % 3 === 0) {
          promises.push(healthMonitor.getCurrentMetrics());
        } else if (i % 3 === 1) {
          promises.push(gracefulDegradation.shouldDegrade());
        } else {
          promises.push(Promise.resolve(configurationManager.getConfiguration()));
        }
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(5000); // Should handle extreme load in 5 seconds
      expect(results).toHaveLength(extremeLoad);

      // Verify no null/undefined results
      results.forEach(result => {
        expect(result).toBeDefined();
      });

      console.log(`Extreme load test: ${totalTime}ms for ${extremeLoad} operations`);
    });

    it('should maintain data integrity under concurrent modifications', async () => {
      const concurrentModifications = 25;
      
      const modificationPromises = Array.from({ length: concurrentModifications }, async (_, i) => {
        // Mix different types of modifications
        if (i % 3 === 0) {
          return configurationManager.updateConfigurationSection(
            'features',
            {
              monitoring: {
                ...configurationManager.getMonitoringConfig(),
                healthMetrics: {
                  ...configurationManager.getMonitoringConfig().healthMetrics,
                  collectionInterval: 30000 + i,
                },
              },
            },
            `stress-user-${i}`,
            `Stress test ${i}`
          );
        } else if (i % 3 === 1) {
          // Health data recording
          healthMonitor.recordResponseTime(i * 10);
          healthMonitor.recordRequest();
          return Promise.resolve();
        } else {
          // Circuit breaker operations
          const mockOp = jest.fn().mockResolvedValue(`result-${i}`);
          return gracefulDegradation.executeWithCircuitBreaker(mockOp, 'gemini');
        }
      });

      await Promise.all(modificationPromises);

      // Verify system is still consistent
      const config = configurationManager.getConfiguration();
      const metrics = await healthMonitor.getCurrentMetrics();
      const status = gracefulDegradation.getStatus();

      expect(config).toBeDefined();
      expect(metrics).toBeDefined();
      expect(status).toBeDefined();

      console.log('Concurrent modifications completed successfully');
    });
  });

  describe('Performance Regression Detection', () => {
    it('should not regress from baseline performance', async () => {
      // Baseline measurements for regression detection
      const baselineTests = [
        {
          name: 'health metrics collection',
          operation: () => healthMonitor.getCurrentMetrics(),
          expectedMax: PERFORMANCE_THRESHOLDS.healthMetricsCollection,
        },
        {
          name: 'configuration validation',
          operation: () => configurationManager.validateConfiguration(configurationManager.getConfiguration()),
          expectedMax: PERFORMANCE_THRESHOLDS.configurationValidation,
        },
        {
          name: 'degradation assessment',
          operation: () => gracefulDegradation.shouldDegrade(),
          expectedMax: PERFORMANCE_THRESHOLDS.circuitBreakerOperation,
        },
      ];

      for (const test of baselineTests) {
        const iterations = 50;
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = Date.now();
          await test.operation();
          const end = Date.now();
          times.push(end - start);
        }

        const averageTime = times.reduce((a, b) => a + b) / times.length;
        const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

        expect(averageTime).toBeLessThan(test.expectedMax);
        console.log(`${test.name}: avg=${averageTime.toFixed(2)}ms, p95=${p95Time}ms`);
      }
    });
  });
});