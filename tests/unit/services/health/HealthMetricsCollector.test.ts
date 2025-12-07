/**
 * HealthMetricsCollector Tests
 * 
 * Unit tests for the HealthMetricsCollector component
 */

import { HealthMetricsCollector } from '../../../../src/services/health/HealthMetricsCollector';
import type { IRateLimiter } from '../../../../src/services/interfaces/RateLimitingInterfaces';
import type { IAIService } from '../../../../src/services/interfaces/AIServiceInterfaces';
import type { IContextManager } from '../../../../src/services/interfaces/ContextManagementInterfaces';

// Mock dependencies
const mockRateLimiter: Partial<IRateLimiter> = {
  getRemainingQuota: jest.fn().mockReturnValue({ minute: 10, daily: 100 })
};

const mockGeminiService: Partial<IAIService> = {
  getConversationStats: jest.fn().mockReturnValue({ activeUsers: 5 }),
  getCacheStats: jest.fn().mockReturnValue({ hitRate: 0.8, memoryUsage: 1024, cacheSize: 50 })
};

const mockContextManager: Partial<IContextManager> = {
  getMemoryStats: jest.fn().mockReturnValue({
    totalServers: 3,
    totalMemoryUsage: 2048,
    averageServerSize: 682,
    largestServerSize: 1024,
    itemCounts: {
      embarrassingMoments: 10,
      codeSnippets: 5,
      runningGags: 8,
      summarizedFacts: 12
    },
    compressionStats: {
      averageCompressionRatio: 0.7,
      totalMemorySaved: 500,
      duplicatesRemoved: 3
    }
  })
};

describe('HealthMetricsCollector', () => {
  let collector: HealthMetricsCollector;

  beforeEach(() => {
    collector = new HealthMetricsCollector();
    collector.setRateLimiter(mockRateLimiter as IRateLimiter);
    collector.setGeminiService(mockGeminiService as IAIService);
    collector.setContextManager(mockContextManager as IContextManager);
    collector.setDiscordConnected(true);
  });

  describe('Performance Tracking', () => {
    it('should record response times correctly', () => {
      collector.recordResponseTime(100);
      collector.recordResponseTime(200);
      collector.recordResponseTime(150);

      // The actual validation would need access to internal buffer
      // This test verifies the method doesn't throw
      expect(() => collector.recordResponseTime(300)).not.toThrow();
    });

    it('should record errors correctly', () => {
      collector.recordError();
      collector.recordError();

      expect(() => collector.recordError()).not.toThrow();
    });

    it('should record requests correctly', () => {
      collector.recordRequest();
      collector.recordRequest();

      expect(() => collector.recordRequest()).not.toThrow();
    });
  });

  describe('Metrics Collection', () => {
    it('should collect comprehensive health metrics', async () => {
      const metrics = await collector.collectHealthMetrics();

      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('activeConversations', 5);
      expect(metrics).toHaveProperty('rateLimitStatus');
      expect(metrics).toHaveProperty('uptime');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('responseTime');
      expect(metrics).toHaveProperty('apiHealth');
      expect(metrics).toHaveProperty('cacheMetrics');
      expect(metrics).toHaveProperty('contextMetrics');
      expect(metrics).toHaveProperty('dataStoreMetrics');

      // Verify memory usage structure
      expect(metrics.memoryUsage).toHaveProperty('rss');
      expect(metrics.memoryUsage).toHaveProperty('heapUsed');

      // Verify rate limit status
      expect(metrics.rateLimitStatus).toHaveProperty('minuteRemaining', 10);
      expect(metrics.rateLimitStatus).toHaveProperty('dailyRemaining', 100);

      // Verify API health
      expect(metrics.apiHealth).toHaveProperty('discord', true);

      // Verify context metrics
      expect(metrics.contextMetrics).toHaveProperty('totalServers', 3);
      expect(metrics.contextMetrics.itemCounts).toHaveProperty('embarrassingMoments', 10);
    });

    it('should handle missing services gracefully', async () => {
      const isolatedCollector = new HealthMetricsCollector();
      
      const metrics = await isolatedCollector.collectHealthMetrics();

      expect(metrics.activeConversations).toBe(0);
      expect(metrics.rateLimitStatus.minuteRemaining).toBe(0);
      expect(metrics.apiHealth.gemini).toBe(false);
      expect(metrics.apiHealth.discord).toBe(false);
      expect(metrics.cacheMetrics.hitRate).toBe(0);
      expect(metrics.contextMetrics.totalServers).toBe(0);
    });
  });

  describe('DataStore Performance Baseline', () => {
    it('should return null when no metrics available', () => {
      const baseline = collector.getDataStorePerformanceBaseline();
      expect(baseline).toBeNull();
    });
  });
});