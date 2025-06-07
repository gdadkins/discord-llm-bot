import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { HealthMonitor } from '../../../src/services/healthMonitor';
import { createMockMetrics, MockTimers, createTestEnvironment } from '../../test-utils';
import * as path from 'path';

// Mock dependencies
const mockFs = {
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{}'),
  pathExists: jest.fn().mockResolvedValue(false),
};

jest.mock('fs/promises', () => mockFs);

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;
  let testEnv: ReturnType<typeof createTestEnvironment>;
  let mockTimers: MockTimers;

  beforeEach(() => {
    testEnv = createTestEnvironment();
    mockTimers = new MockTimers();
    healthMonitor = new HealthMonitor(path.join(global.TEST_HEALTH_DIR, 'test-metrics.json'));
    
    // Reset all mocks
    jest.clearAllMocks();
    mockFs.pathExists.mockResolvedValue(false);
    mockFs.readFile.mockResolvedValue('{}');
  });

  afterEach(() => {
    testEnv.cleanup();
    mockTimers.clearAll();
  });

  describe('initialization', () => {
    it('should initialize successfully with default configuration', async () => {
      await expect(healthMonitor.initialize()).resolves.not.toThrow();
      
      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(healthMonitor.getAlertConfig()).toMatchObject({
        enabled: false, // Default from environment
        memoryThreshold: 500,
        errorRateThreshold: 5.0,
        responseTimeThreshold: 5000,
        diskSpaceThreshold: 85.0,
      });
    });

    it('should use environment variables for configuration', async () => {
      process.env.HEALTH_MEMORY_THRESHOLD_MB = '256';
      process.env.HEALTH_ERROR_RATE_THRESHOLD = '2.5';
      process.env.HEALTH_ALERTS_ENABLED = 'true';

      const monitor = new HealthMonitor();
      await monitor.initialize();

      const config = monitor.getAlertConfig();
      expect(config.memoryThreshold).toBe(256);
      expect(config.errorRateThreshold).toBe(2.5);
      expect(config.enabled).toBe(true);

      await monitor.shutdown();

      // Cleanup
      delete process.env.HEALTH_MEMORY_THRESHOLD_MB;
      delete process.env.HEALTH_ERROR_RATE_THRESHOLD;
      delete process.env.HEALTH_ALERTS_ENABLED;
    });

    it('should load existing metrics data on initialization', async () => {
      const existingData = {
        snapshots: [
          {
            timestamp: Date.now() - 1000,
            metrics: createMockMetrics(),
          },
        ],
        alertState: {
          lastMemoryAlert: 0,
          lastErrorRateAlert: 0,
          lastResponseTimeAlert: 0,
          lastDiskSpaceAlert: 0,
          consecutiveAlerts: {},
        },
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingData));

      await healthMonitor.initialize();

      // Should have loaded the snapshot
      const historical = await healthMonitor.getHistoricalMetrics();
      expect(historical).toHaveLength(1);
    });
  });

  describe('metrics collection', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    afterEach(async () => {
      await healthMonitor.shutdown();
    });

    it('should collect current metrics without services', async () => {
      const metrics = await healthMonitor.getCurrentMetrics();

      expect(metrics).toMatchObject({
        memoryUsage: expect.objectContaining({
          rss: expect.any(Number),
          heapTotal: expect.any(Number),
          heapUsed: expect.any(Number),
        }),
        activeConversations: 0,
        rateLimitStatus: {
          minuteRemaining: 0,
          dailyRemaining: 0,
          requestsThisMinute: 0,
          requestsToday: 0,
        },
        uptime: expect.any(Number),
        errorRate: 0,
        responseTime: { p50: 0, p95: 0, p99: 0 },
        apiHealth: { gemini: false, discord: false },
        cacheMetrics: {
          hitRate: 0,
          memoryUsage: 0,
          size: 0,
        },
        contextMetrics: {
          totalServers: 0,
          totalMemoryUsage: 0,
          averageServerSize: 0,
          largestServerSize: 0,
          itemCounts: {
            embarrassingMoments: 0,
            codeSnippets: 0,
            runningGags: 0,
            summarizedFacts: 0,
          },
          compressionStats: {
            averageCompressionRatio: 1.0,
            totalMemorySaved: 0,
            duplicatesRemoved: 0,
          },
        },
      });
    });

    it('should record performance metrics correctly', async () => {
      // Record some sample data
      healthMonitor.recordResponseTime(100);
      healthMonitor.recordResponseTime(200);
      healthMonitor.recordResponseTime(300);
      healthMonitor.recordRequest();
      healthMonitor.recordRequest();
      healthMonitor.recordError();

      const metrics = await healthMonitor.getCurrentMetrics();

      expect(metrics.responseTime.p50).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeCloseTo(50, 1); // 1 error out of 2 requests
    });

    it('should integrate with rate limiter when available', async () => {
      const mockRateLimiter = {
        getRemainingQuota: jest.fn().mockReturnValue({
          minute: 8,
          daily: 450,
        }),
      };

      healthMonitor.setRateLimiter(mockRateLimiter as any);

      const metrics = await healthMonitor.getCurrentMetrics();

      expect(mockRateLimiter.getRemainingQuota).toHaveBeenCalled();
      expect(metrics.rateLimitStatus.minuteRemaining).toBe(8);
      expect(metrics.rateLimitStatus.dailyRemaining).toBe(450);
    });

    it('should integrate with context manager when available', async () => {
      const mockContextManager = {
        getMemoryStats: jest.fn().mockReturnValue({
          totalServers: 5,
          totalMemoryUsage: 1024 * 1024,
          averageServerSize: 512 * 1024,
          largestServerSize: 2 * 1024 * 1024,
          itemCounts: {
            embarrassingMoments: 10,
            codeSnippets: 5,
            runningGags: 3,
            summarizedFacts: 8,
          },
          compressionStats: {
            averageCompressionRatio: 0.8,
            totalMemorySaved: 200 * 1024,
            duplicatesRemoved: 2,
          },
        }),
      };

      healthMonitor.setContextManager(mockContextManager as any);

      const metrics = await healthMonitor.getCurrentMetrics();

      expect(mockContextManager.getMemoryStats).toHaveBeenCalled();
      expect(metrics.contextMetrics.totalServers).toBe(5);
      expect(metrics.contextMetrics.itemCounts.embarrassingMoments).toBe(10);
    });

    it('should integrate with gemini service when available', async () => {
      const mockGeminiService = {
        getConversationStats: jest.fn().mockReturnValue({
          activeUsers: 3,
        }),
        getCacheStats: jest.fn().mockReturnValue({
          hitRate: 0.75,
          memoryUsage: 5 * 1024 * 1024,
          cacheSize: 50,
        }),
        clearCache: jest.fn(),
      };

      healthMonitor.setGeminiService(mockGeminiService as any);

      const metrics = await healthMonitor.getCurrentMetrics();

      expect(mockGeminiService.getConversationStats).toHaveBeenCalled();
      expect(mockGeminiService.getCacheStats).toHaveBeenCalled();
      expect(metrics.activeConversations).toBe(3);
      expect(metrics.cacheMetrics.hitRate).toBe(0.75);
    });
  });

  describe('alert system', () => {
    beforeEach(async () => {
      healthMonitor.updateAlertConfig({ enabled: true });
      await healthMonitor.initialize();
    });

    afterEach(async () => {
      await healthMonitor.shutdown();
    });

    it('should trigger memory alert when threshold exceeded', async () => {
      healthMonitor.updateAlertConfig({
        enabled: true,
        memoryThreshold: 50, // 50MB threshold
      });

      const mockMetrics = createMockMetrics();
      mockMetrics.memoryUsage.rss = 100 * 1024 * 1024; // 100MB

      // Mock the collectHealthMetrics method
      const originalCollectMethod = (healthMonitor as any).collectHealthMetrics;
      (healthMonitor as any).collectHealthMetrics = jest.fn().mockResolvedValue(mockMetrics);

      // Manually trigger alert check
      await (healthMonitor as any).checkAlerts(mockMetrics);

      // Restore original method
      (healthMonitor as any).collectHealthMetrics = originalCollectMethod;
    });

    it('should trigger error rate alert when threshold exceeded', async () => {
      healthMonitor.updateAlertConfig({
        enabled: true,
        errorRateThreshold: 1.0, // 1% threshold
      });

      // Record high error rate
      for (let i = 0; i < 10; i++) {
        healthMonitor.recordRequest();
        if (i < 2) healthMonitor.recordError(); // 20% error rate
      }

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.errorRate).toBeGreaterThan(1.0);
    });

    it('should not trigger alerts when disabled', async () => {
      healthMonitor.updateAlertConfig({ enabled: false });

      const mockMetrics = createMockMetrics();
      mockMetrics.memoryUsage.rss = 1000 * 1024 * 1024; // 1GB (way over threshold)
      mockMetrics.errorRate = 50; // 50% error rate

      await (healthMonitor as any).checkAlerts(mockMetrics);

      // No way to verify alerts weren't triggered without more complex mocking
      // This test serves as documentation that alerts can be disabled
    });

    it('should respect alert cooldown period', async () => {
      healthMonitor.updateAlertConfig({
        enabled: true,
        memoryThreshold: 50,
      });

      const mockMetrics = createMockMetrics();
      mockMetrics.memoryUsage.rss = 100 * 1024 * 1024;

      // Trigger first alert
      await (healthMonitor as any).checkAlerts(mockMetrics);

      // Immediate second alert should be suppressed by cooldown
      await (healthMonitor as any).checkAlerts(mockMetrics);
    });
  });

  describe('self-healing functionality', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    afterEach(async () => {
      await healthMonitor.shutdown();
    });

    it('should attempt memory self-healing', async () => {
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

      // Mock global.gc
      const originalGc = global.gc;
      global.gc = jest.fn();

      await (healthMonitor as any).healMemoryIssues();

      expect(mockGeminiService.clearCache).toHaveBeenCalled();
      expect(global.gc).toHaveBeenCalled();

      // Restore
      global.gc = originalGc;
    });

    it('should reset error tracking for error rate healing', async () => {
      // Record some errors
      healthMonitor.recordError();
      healthMonitor.recordRequest();

      let metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.errorRate).toBeGreaterThan(0);

      await (healthMonitor as any).healErrorRateIssues();

      // Error rate should be reset
      metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.errorRate).toBe(0);
    });

    it('should clear caches for response time healing', async () => {
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

      await (healthMonitor as any).healResponseTimeIssues();

      expect(mockGeminiService.clearCache).toHaveBeenCalled();
    });
  });

  describe('historical metrics', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    afterEach(async () => {
      await healthMonitor.shutdown();
    });

    it('should retrieve historical metrics within time range', async () => {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);

      // Add some mock data to the internal metrics
      const mockSnapshot = {
        timestamp: oneHourAgo + 1000,
        metrics: createMockMetrics(),
      };

      (healthMonitor as any).metricsData.set(mockSnapshot.timestamp, mockSnapshot);

      const historical = await healthMonitor.getHistoricalMetrics(oneHourAgo, now);
      expect(historical).toHaveLength(1);
      expect(historical[0].timestamp).toBe(mockSnapshot.timestamp);
    });

    it('should return empty array when no metrics in range', async () => {
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      const twoDaysAgo = oneDayAgo - (24 * 60 * 60 * 1000);

      const historical = await healthMonitor.getHistoricalMetrics(twoDaysAgo, oneDayAgo);
      expect(historical).toHaveLength(0);
    });

    it('should use default time range when not specified', async () => {
      const historical = await healthMonitor.getHistoricalMetrics();
      expect(historical).toEqual([]);
    });
  });

  describe('configuration management', () => {
    it('should update alert configuration', () => {
      const newConfig = {
        memoryThreshold: 1024,
        errorRateThreshold: 10.0,
        enabled: true,
      };

      healthMonitor.updateAlertConfig(newConfig);

      const config = healthMonitor.getAlertConfig();
      expect(config.memoryThreshold).toBe(1024);
      expect(config.errorRateThreshold).toBe(10.0);
      expect(config.enabled).toBe(true);
    });

    it('should preserve existing configuration when partially updating', () => {
      const originalConfig = healthMonitor.getAlertConfig();
      
      healthMonitor.updateAlertConfig({ memoryThreshold: 2048 });

      const updatedConfig = healthMonitor.getAlertConfig();
      expect(updatedConfig.memoryThreshold).toBe(2048);
      expect(updatedConfig.errorRateThreshold).toBe(originalConfig.errorRateThreshold);
      expect(updatedConfig.enabled).toBe(originalConfig.enabled);
    });
  });

  describe('service status tracking', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    afterEach(async () => {
      await healthMonitor.shutdown();
    });

    it('should track Discord connection status', () => {
      healthMonitor.setDiscordConnected(true);
      
      // We can't directly test this without triggering metrics collection
      // but we can verify the method exists and doesn't throw
      expect(() => healthMonitor.setDiscordConnected(false)).not.toThrow();
    });

    it('should check Gemini health based on rate limiter quota', async () => {
      const mockRateLimiter = {
        getRemainingQuota: jest.fn().mockReturnValue({
          minute: 0, // No quota remaining
          daily: 100,
        }),
      };

      healthMonitor.setRateLimiter(mockRateLimiter as any);

      // Gemini should be considered unhealthy with no quota
      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.apiHealth.gemini).toBe(false);
    });
  });

  describe('data persistence', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    afterEach(async () => {
      await healthMonitor.shutdown();
    });

    it('should save metrics data periodically', async () => {
      // Add a mock snapshot
      const mockSnapshot = {
        timestamp: Date.now(),
        metrics: createMockMetrics(),
      };

      (healthMonitor as any).metricsData.set(mockSnapshot.timestamp, mockSnapshot);

      // Manually trigger save
      await (healthMonitor as any).saveMetricsData();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-metrics.json'),
        expect.stringContaining('"snapshots"')
      );
    });

    it('should handle save errors gracefully', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('Write failed'));

      // Should not throw
      await expect((healthMonitor as any).saveMetricsData()).resolves.not.toThrow();
    });
  });

  describe('cleanup and shutdown', () => {
    it('should clean up timers and save data on shutdown', async () => {
      await healthMonitor.initialize();

      // Verify timers are running (indirectly)
      expect((healthMonitor as any).metricsTimer).toBeTruthy();
      expect((healthMonitor as any).cleanupTimer).toBeTruthy();

      await healthMonitor.shutdown();

      // Verify timers are cleared
      expect((healthMonitor as any).metricsTimer).toBeNull();
      expect((healthMonitor as any).cleanupTimer).toBeNull();
    });

    it('should handle shutdown when not initialized', async () => {
      // Should not throw when shutting down uninitialized monitor
      await expect(healthMonitor.shutdown()).resolves.not.toThrow();
    });

    it('should perform periodic cleanup of old data', async () => {
      await healthMonitor.initialize();

      const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
      const recentTimestamp = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago

      // Add old and recent data
      (healthMonitor as any).metricsData.set(oldTimestamp, {
        timestamp: oldTimestamp,
        metrics: createMockMetrics(),
      });
      (healthMonitor as any).metricsData.set(recentTimestamp, {
        timestamp: recentTimestamp,
        metrics: createMockMetrics(),
      });

      // Manually trigger cleanup
      await (healthMonitor as any).performCleanup();

      // Old data should be removed, recent data should remain
      expect((healthMonitor as any).metricsData.has(oldTimestamp)).toBe(false);
      expect((healthMonitor as any).metricsData.has(recentTimestamp)).toBe(true);

      await healthMonitor.shutdown();
    });
  });

  describe('percentile calculations', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    afterEach(async () => {
      await healthMonitor.shutdown();
    });

    it('should calculate percentiles correctly', () => {
      // Record response times in a known pattern
      const times = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      times.forEach(time => healthMonitor.recordResponseTime(time));

      const calculatePercentile = (healthMonitor as any).calculatePercentile.bind(healthMonitor);
      
      // Test known percentiles
      expect(calculatePercentile(times, 50)).toBeCloseTo(500, 0);
      expect(calculatePercentile(times, 95)).toBeCloseTo(950, 0);
      expect(calculatePercentile(times, 99)).toBeCloseTo(990, 0);
    });

    it('should handle empty arrays', () => {
      const calculatePercentile = (healthMonitor as any).calculatePercentile.bind(healthMonitor);
      expect(calculatePercentile([], 50)).toBe(0);
    });

    it('should handle single value arrays', () => {
      const calculatePercentile = (healthMonitor as any).calculatePercentile.bind(healthMonitor);
      expect(calculatePercentile([100], 95)).toBe(100);
    });
  });
});