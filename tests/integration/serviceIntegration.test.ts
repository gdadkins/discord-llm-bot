
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { HealthMonitor } from '../../src/services/health/HealthMonitor';
import { GracefulDegradation } from '../../src/services/core/GracefulDegradation';
import { ConfigurationManager } from '../../src/config/ConfigurationManager';
import { createTestEnvironment, MockMetrics } from '../test-utils';
import * as path from 'path';

// Mock logger to reduce noise in tests
jest.mock('../../src/utils/logger');

describe('Service Integration Tests', () => {
  let testEnv: ReturnType<typeof createTestEnvironment>;
  let healthMonitor: HealthMonitor;
  let gracefulDegradation: GracefulDegradation;
  let configurationManager: ConfigurationManager;

  beforeEach(async () => {
    testEnv = createTestEnvironment();
    
    // Initialize services
    configurationManager = ConfigurationManager.getInstance();
    await configurationManager.initialize();
    
    healthMonitor = new HealthMonitor();
    await healthMonitor.initialize();

    gracefulDegradation = new GracefulDegradation(healthMonitor);
    await gracefulDegradation.initialize();
  });

  afterEach(async () => {
    await gracefulDegradation.shutdown();
    await healthMonitor.shutdown();
    await configurationManager.shutdown();
    testEnv.cleanup();
  });

  describe('HealthMonitor and GracefulDegradation Integration', () => {
    it('should trigger degradation based on health metrics', async () => {
      // Mock high memory usage
      const mockMetrics = new MockMetrics();
      mockMetrics.memoryUsage = {
        rss: 600 * 1024 * 1024, // 600MB
        heapTotal: 700 * 1024 * 1024,
        heapUsed: 650 * 1024 * 1024,
        external: 50 * 1024 * 1024,
        arrayBuffers: 10 * 1024 * 1024,
      };

      (healthMonitor as any).collectMetrics = jest.fn().mockResolvedValue(mockMetrics);

      const status = await gracefulDegradation.shouldDegrade();
      expect(status.shouldDegrade).toBe(true);
      expect(status.reason).toContain('High memory usage');
    });

    it('should handle health monitor unavailability gracefully', async () => {
      const degradationWithoutMonitor = new GracefulDegradation();
      const status = await degradationWithoutMonitor.shouldDegrade();
      expect(status).toBeDefined();
      expect(status.shouldDegrade).toBe(false);
    });
  });

  describe('ConfigurationManager Integration', () => {
    it('should provide configuration to other services', () => {
      const config = configurationManager.getConfiguration();
      expect(config.features.monitoring.healthMetrics.enabled).toBeDefined();
      expect(config.features.monitoring.gracefulDegradation.enabled).toBeDefined();
    });
  });

  describe('Error Propagation and Handling', () => {
    it('should handle cascading failures gracefully', async () => {
        const failingHealthMonitor = new HealthMonitor();
        failingHealthMonitor.getHealthStatus = jest.fn().mockReturnValue({
            healthy: false,
            name: 'HealthMonitor',
            errors: ['Simulated failure'],
        });

      const degradationWithFailingMonitor = new GracefulDegradation(failingHealthMonitor);
      const status = await degradationWithFailingMonitor.shouldDegrade();
      expect(status).toBeDefined();
      expect(status.shouldDegrade).toBe(true);
    });

    it('should isolate service failures', async () => {
        const failingHealthMonitor = new HealthMonitor();
        failingHealthMonitor.getHealthStatus = jest.fn().mockReturnValue({
            healthy: false,
            name: 'HealthMonitor',
            errors: ['Simulated failure'],
        });

      const degradationWithFailingMonitor = new GracefulDegradation(failingHealthMonitor);

      // Other services should not be affected
      const config = configurationManager.getConfiguration();
      expect(config).toBeDefined();

      const degradationStatus = await degradationWithFailingMonitor.shouldDegrade();
      expect(degradationStatus.shouldDegrade).toBe(true);
    });
  });
});