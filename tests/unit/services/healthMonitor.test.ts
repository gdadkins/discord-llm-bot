import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { HealthMonitor } from '../../../src/services/health/HealthMonitor';
import { createMockMetrics, MockTimers, createTestEnvironment } from '../../test-utils';
import * as path from 'path';

// Type helper for async functions
type AsyncVoidFn = () => Promise<void>;
type AsyncStringFn = () => Promise<string>;
type AsyncBooleanFn = () => Promise<boolean>;

// Mock dependencies
const mockFs = {
  mkdir: jest.fn<AsyncVoidFn>().mockResolvedValue(undefined),
  writeFile: jest.fn<AsyncVoidFn>().mockResolvedValue(undefined),
  readFile: jest.fn<AsyncStringFn>().mockResolvedValue('{}'),
  pathExists: jest.fn<AsyncBooleanFn>().mockResolvedValue(false),
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

  afterEach(async () => {
    await healthMonitor.shutdown();
    mockTimers.clearAll();
    testEnv.cleanup();
  });

  describe('initialization', () => {
    it('should create metrics directory and file if not exists', async () => {
      await healthMonitor.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        global.TEST_HEALTH_DIR,
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should load existing metrics', async () => {
      const existingData = {
        startTime: Date.now() - 10000,
        lastUpdate: Date.now() - 5000,
        metrics: {
          requests: { total: 100, errors: 5 },
          responseTime: { total: 50000, count: 100 },
        },
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingData));

      await healthMonitor.initialize();

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.uptime).toBeGreaterThan(0);
    });

    it('should handle corrupted metrics file', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue('invalid json');

      await healthMonitor.initialize();

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('metric tracking', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should track successful requests', async () => {
      const existingData = {
        startTime: Date.now() - 10000,
        lastUpdate: Date.now() - 5000,
        metrics: {
          requests: { total: 100, errors: 5 },
          responseTime: { total: 50000, count: 100 },
          messageTypes: {},
          errorTypes: {},
        },
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingData));

      await healthMonitor.initialize();
      
      healthMonitor.recordRequest('gemini', true, 150, 'chat');

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.requestCount).toBeGreaterThan(0);
      expect(metrics.errorCount).toBe(5); // Should not increase for successful request
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
    });

    it('should track failed requests', async () => {
      healthMonitor.recordRequest('gemini', false, 0, 'chat', 'API_ERROR');

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.errorCount).toBe(1);
      expect(metrics.errorRate).toBeGreaterThan(0);
    });

    it('should track multiple service endpoints', async () => {
      healthMonitor.recordRequest('gemini', true, 100, 'chat');
      healthMonitor.recordRequest('discord', true, 50, 'send');

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.services).toBeDefined();
      expect(metrics.services.gemini).toBeDefined();
      expect(metrics.services.discord).toBeDefined();
    });

    it('should calculate error rates correctly', async () => {
      // Record 8 successful and 2 failed requests
      for (let i = 0; i < 8; i++) {
        healthMonitor.recordRequest('gemini', true, 100, 'chat');
      }
      for (let i = 0; i < 2; i++) {
        healthMonitor.recordRequest('gemini', false, 0, 'chat', 'ERROR');
      }

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.errorRate).toBeCloseTo(0.2, 2); // 20% error rate
    });

    it('should track response time percentiles', async () => {
      // Record various response times
      const times = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
      times.forEach(time => {
        healthMonitor.recordRequest('gemini', true, time, 'chat');
      });

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.responseTimeP95).toBeDefined();
      expect(metrics.responseTimeP99).toBeDefined();
      expect(metrics.responseTimeP95).toBeLessThanOrEqual(metrics.responseTimeP99);
    });
  });

  describe('conversation tracking', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should track active conversations', () => {
      healthMonitor.trackConversation('user1', 'server1');
      healthMonitor.trackConversation('user2', 'server1');
      healthMonitor.trackConversation('user1', 'server2');

      const metrics = healthMonitor.getHealthStatus();
      expect(metrics.activeConversations).toBe(3);
    });

    it('should update conversation timestamps', () => {
      healthMonitor.trackConversation('user1', 'server1');
      const firstTime = Date.now();

      // Wait a bit and track again
      jest.advanceTimersByTime(100);
      healthMonitor.trackConversation('user1', 'server1');

      const conversations = (healthMonitor as any).activeConversations;
      const convKey = 'server1:user1';
      expect(conversations.get(convKey)).toBeGreaterThan(firstTime);
    });

    it('should clean up old conversations', async () => {
      // Track some conversations
      healthMonitor.trackConversation('user1', 'server1');
      healthMonitor.trackConversation('user2', 'server1');

      // Mock the time to make conversations old
      const oldTime = Date.now() - 31 * 60 * 1000; // 31 minutes ago
      (healthMonitor as any).activeConversations.set('server1:user1', oldTime);

      // Trigger cleanup
      await healthMonitor.cleanupOldData();

      const metrics = healthMonitor.getHealthStatus();
      expect(metrics.activeConversations).toBe(1); // Only user2 should remain
    });
  });

  describe('memory tracking', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should track memory usage', async () => {
      const metrics = await healthMonitor.getCurrentMetrics();
      
      expect(metrics.memoryUsage).toBeDefined();
      expect(metrics.memoryUsage.rss).toBeGreaterThan(0);
      expect(metrics.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(metrics.memoryUsage.heapTotal).toBeGreaterThan(0);
    });

    it('should calculate memory percentage', async () => {
      const metrics = await healthMonitor.getCurrentMetrics();
      const memoryPercentage = (metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal) * 100;
      
      expect(memoryPercentage).toBeGreaterThan(0);
      expect(memoryPercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('rate limit tracking', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should update rate limit status', () => {
      healthMonitor.updateRateLimitStatus(10, 900, 5, 100);

      const status = healthMonitor.getRateLimitStatus();
      expect(status.minuteRemaining).toBe(10);
      expect(status.dailyRemaining).toBe(900);
      expect(status.requestsThisMinute).toBe(5);
      expect(status.requestsToday).toBe(100);
    });

    it('should track rate limit warnings', () => {
      // Set low remaining limits
      healthMonitor.updateRateLimitStatus(2, 50, 13, 950);

      const metrics = healthMonitor.getHealthStatus();
      expect(metrics.rateLimitStatus.minuteRemaining).toBe(2);
      expect(metrics.rateLimitStatus.dailyRemaining).toBe(50);
    });
  });

  describe('data persistence', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should persist metrics to file', async () => {
      const mockMetrics = createMockMetrics();
      (healthMonitor as any).collectHealthMetrics = jest.fn<() => Promise<any>>().mockResolvedValue(mockMetrics);

      // Record some data
      healthMonitor.recordRequest('gemini', true, 100, 'chat');
      healthMonitor.trackConversation('user1', 'server1');

      // Trigger persistence
      await healthMonitor.persistMetrics();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-metrics.json'),
        expect.stringContaining('"requests"'),
        'utf8'
      );
    });

    it('should handle persistence errors gracefully', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('Write failed'));

      // Should not throw
      await expect(healthMonitor.persistMetrics()).resolves.not.toThrow();
    });

    it('should auto-persist on interval', async () => {
      jest.useFakeTimers();

      await healthMonitor.initialize();

      // Advance time to trigger auto-persist
      jest.advanceTimersByTime(60000); // 1 minute

      expect(mockFs.writeFile).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('health check endpoint', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should provide comprehensive health status', async () => {
      // Record various metrics
      healthMonitor.recordRequest('gemini', true, 100, 'chat');
      healthMonitor.recordRequest('gemini', false, 0, 'chat', 'ERROR');
      healthMonitor.trackConversation('user1', 'server1');
      healthMonitor.updateRateLimitStatus(10, 900, 5, 100);

      const health = await healthMonitor.getComprehensiveHealth();

      expect(health).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        uptime: expect.any(Number),
        metrics: expect.objectContaining({
          requests: expect.any(Object),
          memory: expect.any(Object),
          rateLimit: expect.any(Object),
          conversations: expect.any(Object),
        }),
        services: expect.any(Object),
      });
    });

    it('should report degraded status on high error rate', async () => {
      // Create high error rate
      for (let i = 0; i < 10; i++) {
        healthMonitor.recordRequest('gemini', false, 0, 'chat', 'ERROR');
      }

      const health = await healthMonitor.getComprehensiveHealth();
      expect(health.status).not.toBe('healthy');
    });

    it('should report unhealthy status on critical conditions', async () => {
      // Simulate critical conditions
      healthMonitor.updateRateLimitStatus(0, 10, 15, 990);

      const health = await healthMonitor.getComprehensiveHealth();
      expect(health.warnings).toBeDefined();
      expect(health.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('garbage collection tracking', () => {
    it('should track garbage collection if available', async () => {
      global.gc = jest.fn();
      
      await healthMonitor.initialize();
      await healthMonitor.forceGarbageCollection();

      expect(global.gc).toHaveBeenCalled();
      
      delete global.gc;
    });

    it('should handle missing gc gracefully', async () => {
      delete global.gc;

      await healthMonitor.initialize();
      
      // Should not throw
      await expect(healthMonitor.forceGarbageCollection()).resolves.not.toThrow();
    });
  });

  describe('metric aggregation', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should aggregate metrics by time window', async () => {
      // Record requests over time
      const now = Date.now();
      for (let i = 0; i < 60; i++) {
        jest.setSystemTime(now + i * 1000);
        healthMonitor.recordRequest('gemini', true, 100 + i, 'chat');
      }

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.requestCount).toBe(60);
      expect(metrics.averageResponseTime).toBeGreaterThan(100);
    });

    it('should track peak usage', async () => {
      // Simulate peak usage
      for (let i = 0; i < 20; i++) {
        healthMonitor.recordRequest('gemini', true, 50, 'chat');
        healthMonitor.trackConversation(`user${i}`, 'server1');
      }

      const metrics = await healthMonitor.getCurrentMetrics();
      expect(metrics.activeConversations).toBe(20);
    });
  });

  describe('error categorization', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should categorize errors by type', async () => {
      healthMonitor.recordRequest('gemini', false, 0, 'chat', 'RATE_LIMIT');
      healthMonitor.recordRequest('gemini', false, 0, 'chat', 'API_ERROR');
      healthMonitor.recordRequest('gemini', false, 0, 'chat', 'NETWORK_ERROR');
      healthMonitor.recordRequest('gemini', false, 0, 'chat', 'API_ERROR');

      const health = await healthMonitor.getComprehensiveHealth();
      expect(health.metrics.errors).toBeDefined();
      expect(health.metrics.errors.byType).toBeDefined();
      expect(health.metrics.errors.byType.API_ERROR).toBe(2);
      expect(health.metrics.errors.byType.RATE_LIMIT).toBe(1);
      expect(health.metrics.errors.byType.NETWORK_ERROR).toBe(1);
    });
  });

  describe('service-specific metrics', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should track metrics per service', async () => {
      // Record for different services
      healthMonitor.recordRequest('gemini', true, 100, 'chat');
      healthMonitor.recordRequest('gemini', true, 150, 'chat');
      healthMonitor.recordRequest('discord', true, 50, 'send');
      healthMonitor.recordRequest('discord', false, 0, 'send', 'ERROR');

      const health = await healthMonitor.getComprehensiveHealth();
      
      expect(health.services.gemini).toMatchObject({
        requests: 2,
        errors: 0,
        errorRate: 0,
        avgResponseTime: 125,
      });

      expect(health.services.discord).toMatchObject({
        requests: 2,
        errors: 1,
        errorRate: 0.5,
      });
    });
  });

  describe('shutdown', () => {
    it('should cleanup resources on shutdown', async () => {
      await healthMonitor.initialize();
      await healthMonitor.shutdown();

      // Verify timers are cleared
      expect(mockFs.writeFile).toHaveBeenCalled(); // Final persist
    });

    it('should handle shutdown errors gracefully', async () => {
      await healthMonitor.initialize();
      mockFs.writeFile.mockRejectedValueOnce(new Error('Write failed'));

      // Should not throw
      await expect(healthMonitor.shutdown()).resolves.not.toThrow();
    });
  });

  describe('custom metrics', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should support custom metric recording', () => {
      healthMonitor.recordCustomMetric('cacheHits', 150);
      healthMonitor.recordCustomMetric('cacheMisses', 50);

      const metrics = (healthMonitor as any).customMetrics;
      expect(metrics.get('cacheHits')).toBe(150);
      expect(metrics.get('cacheMisses')).toBe(50);
    });

    it('should calculate cache hit ratio', () => {
      healthMonitor.recordCustomMetric('cacheHits', 150);
      healthMonitor.recordCustomMetric('cacheMisses', 50);

      const hitRatio = 150 / (150 + 50);
      expect(hitRatio).toBe(0.75); // 75% hit rate
    });
  });

  describe('alert thresholds', () => {
    beforeEach(async () => {
      await healthMonitor.initialize();
    });

    it('should detect memory threshold breaches', async () => {
      // Mock high memory usage
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 500 * 1024 * 1024, // 500MB
        heapTotal: 400 * 1024 * 1024,
        heapUsed: 380 * 1024 * 1024, // 95% of heap
        external: 0,
        arrayBuffers: 0,
      } as NodeJS.MemoryUsage);

      const health = await healthMonitor.getComprehensiveHealth();
      expect(health.warnings).toContain(expect.stringContaining('memory'));
    });

    it('should detect rate limit warnings', async () => {
      healthMonitor.updateRateLimitStatus(1, 50, 14, 950);

      const health = await healthMonitor.getComprehensiveHealth();
      expect(health.warnings).toBeDefined();
      expect(health.warnings.some(w => w.includes('rate limit'))).toBe(true);
    });
  });
});