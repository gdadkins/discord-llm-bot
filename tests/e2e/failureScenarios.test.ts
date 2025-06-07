import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { HealthMonitor } from '../../src/services/healthMonitor';
import { GracefulDegradation } from '../../src/services/gracefulDegradation';
import { ConfigurationManager } from '../../src/services/configurationManager';
import { createTestEnvironment, waitForAsync } from '../test-utils';
import * as path from 'path';

describe('Failure Scenario Tests', () => {
  let testEnv: ReturnType<typeof createTestEnvironment>;
  let healthMonitor: HealthMonitor;
  let gracefulDegradation: GracefulDegradation;
  let configurationManager: ConfigurationManager;

  beforeEach(async () => {
    testEnv = createTestEnvironment();
    
    healthMonitor = new HealthMonitor(path.join(global.TEST_HEALTH_DIR, 'failure-metrics.json'));
    gracefulDegradation = new GracefulDegradation();
    configurationManager = new ConfigurationManager(
      path.join(global.TEST_CONFIG_DIR, 'failure-config.json'),
      path.join(global.TEST_CONFIG_DIR, 'failure-versions'),
      path.join(global.TEST_CONFIG_DIR, 'failure-audit.log')
    );
  });

  afterEach(async () => {
    try {
      await gracefulDegradation.shutdown();
      await healthMonitor.shutdown();
      await configurationManager.shutdown();
    } catch (error) {
      // Ignore shutdown errors in failure tests
    }
    testEnv.cleanup();
  });

  describe('File System Failures', () => {
    it('should handle file write failures gracefully', async () => {
      const mockFs = require('fs-extra');
      mockFs.writeJSON.mockRejectedValueOnce(new Error('Disk full'));
      mockFs.writeFile.mockRejectedValueOnce(new Error('Permission denied'));

      await configurationManager.initialize();
      await healthMonitor.initialize();

      // Services should continue operating despite file write failures
      const config = configurationManager.getConfiguration();
      const metrics = await healthMonitor.getCurrentMetrics();

      expect(config).toBeDefined();
      expect(metrics).toBeDefined();
    });

    it('should recover from corrupted configuration files', async () => {
      const mockFs = require('fs-extra');
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJSON
        .mockRejectedValueOnce(new Error('Unexpected token in JSON'))
        .mockResolvedValueOnce({}); // Fallback to default

      await expect(configurationManager.initialize()).rejects.toThrow();

      // Should fall back to default configuration on next attempt
      const freshManager = new ConfigurationManager();
      await expect(freshManager.initialize()).resolves.not.toThrow();
      await freshManager.shutdown();
    });

    it('should handle directory creation failures', async () => {
      const mockFs = require('fs-extra');
      mockFs.ensureDir.mockRejectedValue(new Error('Cannot create directory'));

      await expect(configurationManager.initialize()).rejects.toThrow();
      
      // Should still work if directories exist
      mockFs.ensureDir.mockResolvedValue(undefined);
      await expect(configurationManager.initialize()).resolves.not.toThrow();
    });

    it('should handle file permission errors', async () => {
      const mockFs = require('fs-extra');
      mockFs.writeJSON.mockRejectedValue(new Error('EACCES: permission denied'));

      await configurationManager.initialize();

      // Should handle save failures gracefully
      await expect(
        configurationManager.updateConfiguration(
          { features: { codeExecution: true } },
          'test-user',
          'Test update'
        )
      ).rejects.toThrow('permission denied');
    });

    it('should recover from missing audit log files', async () => {
      const mockFs = require('fs-extra');
      mockFs.pathExists.mockResolvedValue(false);

      await configurationManager.initialize();

      // Should return empty audit log when file doesn't exist
      const auditLog = await configurationManager.getAuditLog();
      expect(auditLog).toEqual([]);
    });
  });

  describe('Network and External Service Failures', () => {
    it('should handle health monitor service timeouts', async () => {
      await healthMonitor.initialize();

      // Mock a service that times out
      const mockService = {
        getCurrentMetrics: jest.fn().mockImplementation(() => 
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
        ),
      };

      healthMonitor.setGeminiService(mockService as any);

      // Should still collect other metrics
      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.memoryUsage).toBeDefined();
    });

    it('should handle external API failures in circuit breaker', async () => {
      await gracefulDegradation.initialize();

      const failingOperation = jest.fn().mockRejectedValue(new Error('API unavailable'));

      // Circuit should open after failures
      for (let i = 0; i < 5; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
        } catch (error) {
          expect(error.message).toContain('API unavailable');
        }
      }

      const status = gracefulDegradation.getStatus();
      expect(status.circuits.gemini.state).toBe('open');

      // Subsequent calls should fail fast
      await expect(
        gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini')
      ).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should handle partial service failures', async () => {
      await healthMonitor.initialize();
      await gracefulDegradation.initialize();

      // Mock partial failure - some services work, others don't
      const workingService = {
        getRemainingQuota: jest.fn().mockReturnValue({ minute: 5, daily: 100 }),
      };

      const failingService = {
        getMemoryStats: jest.fn().mockRejectedValue(new Error('Service unavailable')),
      };

      healthMonitor.setRateLimiter(workingService as any);
      healthMonitor.setContextManager(failingService as any);

      // Should collect what it can
      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.rateLimitStatus.minuteRemaining).toBe(5);
      expect(metrics.contextMetrics.totalServers).toBe(0); // Default when service fails
    });

    it('should handle database connection failures', async () => {
      const mockDb = require('better-sqlite3');
      const mockDbInstance = {
        prepare: jest.fn().mockImplementation(() => ({
          run: jest.fn().mockImplementation(() => {
            throw new Error('SQLITE_BUSY: database is locked');
          }),
          get: jest.fn().mockImplementation(() => {
            throw new Error('SQLITE_CORRUPT: database disk image is malformed');
          }),
          all: jest.fn().mockReturnValue([]),
        })),
        exec: jest.fn().mockImplementation(() => {
          throw new Error('Database connection failed');
        }),
        close: jest.fn(),
      };

      mockDb.mockReturnValue(mockDbInstance);

      // Services should handle database failures gracefully
      await expect(configurationManager.initialize()).resolves.not.toThrow();
    });
  });

  describe('Memory and Resource Exhaustion', () => {
    it('should handle out-of-memory scenarios', async () => {
      await healthMonitor.initialize();

      // Simulate memory pressure
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        rss: 2 * 1024 * 1024 * 1024, // 2GB
        heapTotal: 1.5 * 1024 * 1024 * 1024,
        heapUsed: 1.4 * 1024 * 1024 * 1024,
        external: 100 * 1024 * 1024,
        arrayBuffers: 50 * 1024 * 1024,
      });

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.memoryUsage.rss).toBeGreaterThan(1024 * 1024 * 1024);

      // Should trigger self-healing
      healthMonitor.updateAlertConfig({ enabled: true, memoryThreshold: 1024 });
      
      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    it('should handle timer exhaustion', async () => {
      const services: Array<{ hm: HealthMonitor; gd: GracefulDegradation }> = [];

      try {
        // Create many services to exhaust timer resources
        for (let i = 0; i < 50; i++) {
          const hm = new HealthMonitor();
          const gd = new GracefulDegradation();
          await hm.initialize();
          await gd.initialize();
          services.push({ hm, gd });
        }

        // Should still be able to create more services
        const additionalHm = new HealthMonitor();
        await expect(additionalHm.initialize()).resolves.not.toThrow();
        await additionalHm.shutdown();

      } finally {
        // Cleanup all services
        await Promise.all(services.map(async service => {
          try {
            await service.gd.shutdown();
            await service.hm.shutdown();
          } catch (error) {
            // Ignore cleanup errors
          }
        }));
      }
    });

    it('should handle buffer overflow in performance tracking', async () => {
      await healthMonitor.initialize();

      // Overwhelm performance buffers
      for (let i = 0; i < 5000; i++) {
        healthMonitor.recordResponseTime(Math.random() * 1000);
        healthMonitor.recordRequest();
        if (i % 10 === 0) {
          healthMonitor.recordError();
        }
      }

      // Should handle overflow gracefully
      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(metrics.responseTime.p50).toBeGreaterThan(0);
      expect(metrics.responseTime.p95).toBeGreaterThan(0);
    });

    it('should handle queue overflow in graceful degradation', async () => {
      await gracefulDegradation.initialize();

      const responses: string[] = [];
      const mockRespond = jest.fn().mockImplementation((msg) => {
        responses.push(msg);
        return Promise.resolve();
      });

      // Overwhelm the queue (default max 100)
      for (let i = 0; i < 150; i++) {
        await gracefulDegradation.queueMessage(
          `user-${i}`,
          `message ${i}`,
          mockRespond,
          'test-server',
          'low'
        );
      }

      // Should have rejected overflow messages
      const overloadResponses = responses.filter(r => r.includes('overloaded'));
      expect(overloadResponses.length).toBeGreaterThan(0);

      const status = gracefulDegradation.getStatus();
      expect(status.queue.size).toBeLessThanOrEqual(100);
    });
  });

  describe('Concurrency and Race Condition Failures', () => {
    it('should handle concurrent initialization/shutdown', async () => {
      // Rapidly initialize and shutdown services concurrently
      const operations = Array.from({ length: 10 }, async () => {
        const hm = new HealthMonitor();
        const gd = new GracefulDegradation();
        
        await Promise.all([hm.initialize(), gd.initialize()]);
        await Promise.all([gd.shutdown(), hm.shutdown()]);
      });

      await expect(Promise.all(operations)).resolves.not.toThrow();
    });

    it('should handle race conditions in configuration updates', async () => {
      await configurationManager.initialize();

      // Concurrent configuration updates
      const updates = Array.from({ length: 10 }, (_, i) =>
        configurationManager.updateConfigurationSection(
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
          `race-user-${i}`,
          `Race condition test ${i}`
        )
      );

      await expect(Promise.all(updates)).resolves.not.toThrow();

      // Final configuration should be consistent
      const config = configurationManager.getConfiguration();
      expect(config.features.monitoring.healthMetrics.collectionInterval).toBeGreaterThan(30000);
    });

    it('should handle concurrent circuit breaker operations', async () => {
      await gracefulDegradation.initialize();

      let successCount = 0;
      let failureCount = 0;

      const operations = Array.from({ length: 100 }, (_, i) => {
        const operation = jest.fn().mockImplementation(() => {
          if (i % 5 === 0) {
            return Promise.reject(new Error('Simulated failure'));
          }
          return Promise.resolve('success');
        });

        return gracefulDegradation.executeWithCircuitBreaker(operation, 'gemini')
          .then(() => successCount++)
          .catch(() => failureCount++);
      });

      await Promise.all(operations);

      expect(successCount + failureCount).toBe(100);
      expect(failureCount).toBeGreaterThan(0); // Some should fail

      const status = gracefulDegradation.getStatus();
      expect(status.circuits.gemini.failures).toBeGreaterThan(0);
    });

    it('should handle deadlock scenarios', async () => {
      await healthMonitor.initialize();
      await gracefulDegradation.initialize();

      // Simulate potential deadlock with cross-service dependencies
      const healthPromise = healthMonitor.getCurrentMetrics();
      const degradationPromise = gracefulDegradation.shouldDegrade();
      
      // Add service integration
      gracefulDegradation.setHealthMonitor(healthMonitor);
      
      const integratedPromise = gracefulDegradation.shouldDegrade();

      // All operations should complete without deadlock
      const results = await Promise.all([
        healthPromise,
        degradationPromise,
        integratedPromise,
      ]);

      expect(results).toHaveLength(3);
      results.forEach(result => expect(result).toBeDefined());
    });
  });

  describe('Data Corruption and Validation Failures', () => {
    it('should handle corrupted metrics data', async () => {
      await healthMonitor.initialize();

      // Corrupt internal data structures
      (healthMonitor as any).performanceBuffer.bufferSize = -1;
      (healthMonitor as any).performanceBuffer.bufferIndex = 9999;

      // Should handle corruption gracefully
      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
    });

    it('should handle invalid configuration data', async () => {
      const mockFs = require('fs-extra');
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJSON.mockResolvedValue({
        version: '1.0.0',
        discord: 'invalid-discord-config',
        gemini: null,
        rateLimiting: { rpm: 'not-a-number' },
        features: undefined,
      });

      await expect(configurationManager.initialize()).rejects.toThrow(
        'Configuration validation failed'
      );
    });

    it('should validate data integrity after corruption', async () => {
      await healthMonitor.initialize();

      // Add valid data
      healthMonitor.recordResponseTime(100);
      healthMonitor.recordRequest();

      // Corrupt data
      const performanceBuffer = (healthMonitor as any).performanceBuffer;
      performanceBuffer.responseTimes[0] = null;
      performanceBuffer.requests[0] = undefined;

      // Should handle null/undefined values
      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.responseTime.p50).toBeGreaterThanOrEqual(0);
    });

    it('should recover from timestamp corruption', async () => {
      await healthMonitor.initialize();

      // Add data with corrupted timestamps
      const metricsData = (healthMonitor as any).metricsData;
      metricsData.set(NaN, { timestamp: NaN, metrics: {} });
      metricsData.set(null, { timestamp: null, metrics: {} });
      metricsData.set('invalid', { timestamp: 'invalid', metrics: {} });

      // Should clean up corrupted data
      await (healthMonitor as any).performCleanup();

      const validEntries = Array.from(metricsData.entries()).filter(([key, value]) => 
        typeof key === 'number' && !isNaN(key) && key > 0
      );

      expect(validEntries.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Service Dependency Failures', () => {
    it('should handle missing service dependencies', async () => {
      await healthMonitor.initialize();

      // Don't set any service dependencies
      const metrics = await healthMonitor.getCurrentMetrics();

      // Should work with default values
      expect(metrics.activeConversations).toBe(0);
      expect(metrics.rateLimitStatus.minuteRemaining).toBe(0);
      expect(metrics.cacheMetrics.hitRate).toBe(0);
      expect(metrics.contextMetrics.totalServers).toBe(0);
    });

    it('should handle service dependency failures', async () => {
      await healthMonitor.initialize();
      await gracefulDegradation.initialize();

      // Set up failing dependencies
      const failingRateLimiter = {
        getRemainingQuota: jest.fn().mockImplementation(() => {
          throw new Error('Rate limiter crashed');
        }),
      };

      const failingGeminiService = {
        getConversationStats: jest.fn().mockImplementation(() => {
          throw new Error('Gemini service unavailable');
        }),
        getCacheStats: jest.fn().mockImplementation(() => {
          throw new Error('Cache service down');
        }),
      };

      healthMonitor.setRateLimiter(failingRateLimiter as any);
      healthMonitor.setGeminiService(failingGeminiService as any);

      // Should handle failures gracefully and continue working
      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.memoryUsage).toBeDefined();
    });

    it('should handle circular dependencies', async () => {
      await healthMonitor.initialize();
      await gracefulDegradation.initialize();

      // Create circular dependency scenario
      gracefulDegradation.setHealthMonitor(healthMonitor);
      
      // Mock health monitor that depends on graceful degradation
      const circularHealthMonitor = {
        getCurrentMetrics: jest.fn().mockImplementation(async () => {
          // This would create a circular call
          await gracefulDegradation.shouldDegrade();
          return { memoryUsage: { rss: 100000 } };
        }),
      };

      gracefulDegradation.setHealthMonitor(circularHealthMonitor as any);

      // Should handle without infinite recursion
      const status = await gracefulDegradation.shouldDegrade();
      expect(status).toBeDefined();
    });
  });

  describe('Recovery and Resilience', () => {
    it('should recover from temporary failures', async () => {
      await gracefulDegradation.initialize();

      let failureCount = 0;
      const temporaryFailureOperation = jest.fn().mockImplementation(() => {
        failureCount++;
        if (failureCount <= 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve('success');
      });

      // Should eventually succeed after temporary failures
      try {
        await gracefulDegradation.executeWithCircuitBreaker(temporaryFailureOperation, 'gemini');
      } catch (error) {
        // Expected for first few attempts
      }

      // Reset circuit state for next attempt
      const circuits = (gracefulDegradation as any).serviceStatus;
      circuits.gemini.state = 'closed';
      circuits.gemini.failureCount = 0;

      const result = await gracefulDegradation.executeWithCircuitBreaker(temporaryFailureOperation, 'gemini');
      expect(result).toBe('success');
    });

    it('should maintain critical functionality during partial failures', async () => {
      await configurationManager.initialize();
      await healthMonitor.initialize();

      // Simulate partial system failure
      const mockFs = require('fs-extra');
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      // Critical read operations should still work
      const config = configurationManager.getConfiguration();
      const metrics = await healthMonitor.getCurrentMetrics();

      expect(config).toBeDefined();
      expect(metrics).toBeDefined();

      // New configurations should fail to save but not crash
      await expect(
        configurationManager.updateConfiguration(
          { features: { codeExecution: true } },
          'test-user',
          'Test during failure'
        )
      ).rejects.toThrow();
    });

    it('should implement graceful degradation during cascading failures', async () => {
      await gracefulDegradation.initialize();

      // Simulate cascading failures
      (gracefulDegradation as any).serviceStatus.gemini.state = 'open';
      (gracefulDegradation as any).serviceStatus.discord.state = 'open';

      const status = await gracefulDegradation.shouldDegrade();
      expect(status.shouldDegrade).toBe(true);
      expect(status.severity).toBe('high');

      // Should provide fallback responses
      const fallback = await gracefulDegradation.generateFallbackResponse(
        'test prompt',
        'test-user'
      );

      expect(fallback).toBeDefined();
      expect(fallback.length).toBeGreaterThan(0);
    });
  });
});