import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { HealthMonitor } from '../../src/services/healthMonitor';
import { GracefulDegradation } from '../../src/services/gracefulDegradation';
import { ConfigurationManager } from '../../src/services/configurationManager';
import { createMockMetrics, createMockConfiguration, createTestEnvironment } from '../test-utils';
import * as path from 'path';

describe('Service Integration Tests', () => {
  let testEnv: ReturnType<typeof createTestEnvironment>;
  let healthMonitor: HealthMonitor;
  let gracefulDegradation: GracefulDegradation;
  let configurationManager: ConfigurationManager;

  beforeEach(async () => {
    testEnv = createTestEnvironment();
    
    healthMonitor = new HealthMonitor(path.join(global.TEST_HEALTH_DIR, 'integration-metrics.json'));
    gracefulDegradation = new GracefulDegradation();
    configurationManager = new ConfigurationManager(
      path.join(global.TEST_CONFIG_DIR, 'integration-config.json'),
      path.join(global.TEST_CONFIG_DIR, 'integration-versions'),
      path.join(global.TEST_CONFIG_DIR, 'integration-audit.log')
    );

    // Initialize services
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

  describe('HealthMonitor and GracefulDegradation Integration', () => {
    it('should integrate health monitor with graceful degradation', async () => {
      // Connect health monitor to graceful degradation
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Verify integration works
      const status = await gracefulDegradation.shouldDegrade();
      expect(status.shouldDegrade).toBe(false);
      expect(status.reason).toBe('All systems operational');
    });

    it('should trigger degradation based on health metrics', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Mock high memory usage
      const mockMetrics = createMockMetrics();
      mockMetrics.memoryUsage.rss = 600 * 1024 * 1024; // 600MB (over 400MB default threshold)

      const mockHealthMonitor = {
        getCurrentMetrics: jest.fn().mockResolvedValue(mockMetrics),
      };

      gracefulDegradation.setHealthMonitor(mockHealthMonitor as any);

      const status = await gracefulDegradation.shouldDegrade();
      expect(status.shouldDegrade).toBe(true);
      expect(status.reason).toContain('High memory usage');
      expect(status.severity).toBe('high');
    });

    it('should handle health monitor unavailability gracefully', async () => {
      // Don't set health monitor
      const status = await gracefulDegradation.shouldDegrade();
      
      // Should still work without health monitor
      expect(status).toBeDefined();
      expect(typeof status.shouldDegrade).toBe('boolean');
    });

    it('should coordinate self-healing between services', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Mock a service that can be cleared
      const mockGeminiService = {
        clearCache: jest.fn(),
        getConversationStats: jest.fn().mockReturnValue({ activeUsers: 0 }),
        getCacheStats: jest.fn().mockReturnValue({
          hitRate: 0,
          memoryUsage: 0,
          cacheSize: 0,
        }),
      };

      healthMonitor.setGeminiService(mockGeminiService as any);

      // Trigger memory healing
      await (healthMonitor as any).healMemoryIssues();

      expect(mockGeminiService.clearCache).toHaveBeenCalled();
    });
  });

  describe('ConfigurationManager Integration', () => {
    it('should provide configuration to other services', async () => {
      const config = configurationManager.getConfiguration();
      
      // Verify configuration structure is compatible with services
      expect(config.features.monitoring.healthMetrics.enabled).toBeDefined();
      expect(config.features.monitoring.gracefulDegradation.enabled).toBeDefined();
      expect(config.features.monitoring.alerts.enabled).toBeDefined();
    });

    it('should update service configurations dynamically', async () => {
      const originalConfig = configurationManager.getMonitoringConfig();
      
      // Update monitoring configuration
      await configurationManager.updateConfigurationSection(
        'features',
        {
          monitoring: {
            ...originalConfig,
            healthMetrics: {
              ...originalConfig.healthMetrics,
              collectionInterval: 60000, // Change from 30s to 60s
            },
          },
        },
        'test-integration',
        'Update collection interval'
      );

      const updatedConfig = configurationManager.getMonitoringConfig();
      expect(updatedConfig.healthMetrics.collectionInterval).toBe(60000);
    });

    it('should validate cross-service configuration consistency', async () => {
      const config = createMockConfiguration();
      
      // Create inconsistent configuration
      config.features.monitoring.gracefulDegradation.circuitBreaker.failureThreshold = 10;
      // But set environment to expect lower threshold
      process.env.DEGRADATION_MAX_FAILURES = '3';

      const validation = configurationManager.validateConfiguration(config);
      
      // Configuration should still be valid as environment overrides aren't validated here
      expect(validation.valid).toBe(true);

      // Cleanup
      delete process.env.DEGRADATION_MAX_FAILURES;
    });

    it('should handle configuration reloads affecting multiple services', async () => {
      const changeHandler = jest.fn();
      configurationManager.on('config:changed', changeHandler);

      // Update configuration that affects multiple services
      await configurationManager.updateConfiguration(
        {
          features: {
            ...configurationManager.getFeatureConfig(),
            monitoring: {
              ...configurationManager.getMonitoringConfig(),
              alerts: {
                ...configurationManager.getMonitoringConfig().alerts,
                enabled: false,
              },
            },
          },
        },
        'test-integration',
        'Disable alerts'
      );

      expect(changeHandler).toHaveBeenCalled();
      
      const changes = changeHandler.mock.calls[0][0];
      expect(changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.arrayContaining(['features', 'monitoring', 'alerts', 'enabled']),
            newValue: false,
          }),
        ])
      );
    });
  });

  describe('Error Propagation and Handling', () => {
    it('should handle cascading failures gracefully', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Simulate health monitor failure
      const mockHealthMonitor = {
        getCurrentMetrics: jest.fn().mockRejectedValue(new Error('Health monitor failed')),
      };

      gracefulDegradation.setHealthMonitor(mockHealthMonitor as any);

      // Graceful degradation should still work
      const status = await gracefulDegradation.shouldDegrade();
      expect(status).toBeDefined();
      expect(status.shouldDegrade).toBe(false); // Falls back to circuit breaker only
    });

    it('should isolate service failures', async () => {
      // If one service fails, others should continue working
      const mockFailingService = {
        getCurrentMetrics: jest.fn().mockRejectedValue(new Error('Service failed')),
      };

      gracefulDegradation.setHealthMonitor(mockFailingService as any);

      // Configuration manager should still work
      const config = configurationManager.getConfiguration();
      expect(config).toBeDefined();

      // Health monitor (different instance) should still work
      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics).toBeDefined();
    });

    it('should provide fallback responses when all services degrade', async () => {
      // Simulate all services in degraded state
      (gracefulDegradation as any).serviceStatus.gemini.state = 'open';
      (gracefulDegradation as any).serviceStatus.discord.state = 'open';

      const fallback = await gracefulDegradation.generateFallbackResponse(
        'test prompt',
        'test-user',
        'test-server'
      );

      expect(fallback).toBeDefined();
      expect(fallback).toMatch(/maintenance|technical difficulties/i);
    });
  });

  describe('Performance Impact of Integration', () => {
    it('should not significantly impact performance when services are integrated', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      const startTime = Date.now();
      
      // Perform multiple operations
      for (let i = 0; i < 10; i++) {
        await gracefulDegradation.shouldDegrade();
        await healthMonitor.getCurrentMetrics();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (1 second for 10 operations)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle concurrent operations safely', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Execute multiple concurrent operations
      const promises = Array.from({ length: 5 }, async (_, i) => {
        // Mix of different operations
        if (i % 2 === 0) {
          return gracefulDegradation.shouldDegrade();
        } else {
          return healthMonitor.getCurrentMetrics();
        }
      });

      const results = await Promise.all(promises);

      // All operations should complete successfully
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should maintain thread safety under load', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Simulate high load with rapid configuration changes and health checks
      const configPromises = Array.from({ length: 3 }, async (_, i) => {
        return configurationManager.updateConfigurationSection(
          'features',
          {
            monitoring: {
              ...configurationManager.getMonitoringConfig(),
              healthMetrics: {
                ...configurationManager.getMonitoringConfig().healthMetrics,
                collectionInterval: 30000 + (i * 1000),
              },
            },
          },
          `user-${i}`,
          `Update ${i}`
        );
      });

      const healthPromises = Array.from({ length: 5 }, () => {
        return healthMonitor.getCurrentMetrics();
      });

      const degradationPromises = Array.from({ length: 5 }, () => {
        return gracefulDegradation.shouldDegrade();
      });

      // All operations should complete without race conditions
      await expect(Promise.all([
        ...configPromises,
        ...healthPromises,
        ...degradationPromises,
      ])).resolves.not.toThrow();
    });
  });

  describe('Data Consistency and State Management', () => {
    it('should maintain consistent state across service interactions', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Record some health data
      healthMonitor.recordResponseTime(500);
      healthMonitor.recordRequest();
      healthMonitor.recordError();

      const metrics = await healthMonitor.getCurrentMetrics();
      const degradationStatus = await gracefulDegradation.shouldDegrade();

      // State should be consistent
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(degradationStatus.shouldDegrade).toBe(false); // Default thresholds not exceeded
    });

    it('should handle state transitions correctly', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Create mock operation that fails
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      // Trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
        } catch (error) {
          // Expected to fail
        }
      }

      // Check degradation status
      let status = await gracefulDegradation.shouldDegrade();
      expect(status.shouldDegrade).toBe(true);
      expect(status.reason).toContain('Gemini API circuit breaker is open');

      // Verify health monitor reflects the degraded state
      const circuitStatus = gracefulDegradation.getStatus();
      expect(circuitStatus.circuits.gemini.state).toBe('open');
    });

    it('should synchronize configuration changes across services', async () => {
      // Update alert configuration
      await configurationManager.updateConfigurationSection(
        'features',
        {
          monitoring: {
            ...configurationManager.getMonitoringConfig(),
            alerts: {
              ...configurationManager.getMonitoringConfig().alerts,
              memoryThreshold: 1024, // Increase threshold
            },
          },
        },
        'test-integration',
        'Increase memory threshold'
      );

      // Health monitor should be able to use new configuration if it subscribes to changes
      const newConfig = configurationManager.getMonitoringConfig();
      expect(newConfig.alerts.memoryThreshold).toBe(1024);
    });
  });

  describe('Monitoring and Observability Integration', () => {
    it('should provide comprehensive system status', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Get status from all services
      const healthMetrics = await healthMonitor.getCurrentMetrics();
      const degradationStatus = gracefulDegradation.getStatus();
      const configHealth = configurationManager.getHealthStatus();

      // Verify all provide useful information
      expect(healthMetrics).toHaveProperty('memoryUsage');
      expect(healthMetrics).toHaveProperty('uptime');
      expect(healthMetrics).toHaveProperty('errorRate');

      expect(degradationStatus).toHaveProperty('overall');
      expect(degradationStatus).toHaveProperty('circuits');
      expect(degradationStatus).toHaveProperty('queue');

      expect(configHealth).toHaveProperty('healthy');
      expect(configHealth).toHaveProperty('errors');
    });

    it('should enable centralized monitoring', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Mock external monitoring service
      const monitoringData = {
        health: await healthMonitor.getCurrentMetrics(),
        degradation: gracefulDegradation.getStatus(),
        configuration: configurationManager.getHealthStatus(),
        timestamp: Date.now(),
      };

      // Verify monitoring data structure
      expect(monitoringData.health).toBeDefined();
      expect(monitoringData.degradation).toBeDefined();
      expect(monitoringData.configuration).toBeDefined();
      expect(monitoringData.timestamp).toBeGreaterThan(0);

      // Should be serializable for external monitoring
      expect(() => JSON.stringify(monitoringData)).not.toThrow();
    });

    it('should support historical analysis', async () => {
      // Record some historical data
      healthMonitor.recordResponseTime(100);
      healthMonitor.recordResponseTime(200);
      healthMonitor.recordRequest();
      healthMonitor.recordRequest();

      // Wait a bit to let data settle
      await new Promise(resolve => setTimeout(resolve, 10));

      const metrics = await healthMonitor.getCurrentMetrics();
      const historical = await healthMonitor.getHistoricalMetrics();

      // Should provide data for analysis
      expect(metrics.responseTime.p50).toBeGreaterThan(0);
      expect(historical).toBeDefined();
    });
  });

  describe('Recovery and Resilience', () => {
    it('should coordinate recovery across services', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Trigger degradation
      (gracefulDegradation as any).serviceStatus.gemini.state = 'open';

      // Attempt recovery
      await gracefulDegradation.triggerRecovery('gemini');

      // Verify recovery was attempted
      const status = gracefulDegradation.getStatus();
      expect(status.recovery.gemini?.attempts).toBeGreaterThan(0);
    });

    it('should maintain service availability during recovery', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Even during recovery attempts, services should remain available
      const configPromise = configurationManager.getConfiguration();
      const healthPromise = healthMonitor.getCurrentMetrics();
      const recoveryPromise = gracefulDegradation.triggerRecovery();

      const [config, health] = await Promise.all([
        configPromise,
        healthPromise,
        recoveryPromise.catch(() => {}), // Recovery might fail, that's ok
      ]);

      expect(config).toBeDefined();
      expect(health).toBeDefined();
    });

    it('should prevent cascading failures', async () => {
      gracefulDegradation.setHealthMonitor(healthMonitor);

      // Simulate failure in one component
      const mockFailingHealthMonitor = {
        getCurrentMetrics: jest.fn().mockRejectedValue(new Error('Health monitor down')),
      };

      gracefulDegradation.setHealthMonitor(mockFailingHealthMonitor as any);

      // Other services should still work
      const config = configurationManager.getConfiguration();
      const degradationStatus = await gracefulDegradation.shouldDegrade();

      expect(config).toBeDefined();
      expect(degradationStatus).toBeDefined();
      expect(degradationStatus.shouldDegrade).toBe(false); // No health data available, so no degradation
    });
  });
});