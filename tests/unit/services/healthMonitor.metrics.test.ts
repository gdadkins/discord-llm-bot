/**
 * Unit tests for HealthMonitor metrics persistence with compression
 */

import { HealthMonitor, HealthSnapshot } from '../../../src/services/healthMonitor';
import { DataStore } from '../../../src/utils/DataStore';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/rateLimiter');
jest.mock('../../../src/services/contextManager');
jest.mock('../../../src/services/gemini');

describe('HealthMonitor Metrics Persistence', () => {
  let healthMonitor: HealthMonitor;

  beforeEach(() => {
    jest.clearAllMocks();
    healthMonitor = new HealthMonitor('./test-data/health-metrics.json');
  });

  afterEach(async () => {
    if (healthMonitor) {
      await healthMonitor.stop();
    }
  });

  describe('metrics aggregation', () => {
    it('should aggregate metrics by hour for older data', async () => {
      // Create test metrics spanning multiple days
      const now = Date.now();
      const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);
      
      // Add test metrics to the private metricsData map
      const metricsData = (healthMonitor as any).metricsData as Map<number, HealthSnapshot>;
      
      // Add hourly data for 2 days ago
      for (let i = 0; i < 24; i++) {
        const timestamp = twoDaysAgo + (i * 60 * 60 * 1000);
        metricsData.set(timestamp, createMockSnapshot(timestamp));
      }
      
      // Add recent data (last 24 hours)
      for (let i = 0; i < 48; i++) {
        const timestamp = now - (24 * 60 * 60 * 1000) + (i * 30 * 60 * 1000);
        metricsData.set(timestamp, createMockSnapshot(timestamp));
      }

      // Call aggregateMetrics
      const aggregated = await (healthMonitor as any).aggregateMetrics();
      
      // Older data should be aggregated to hourly
      const oldDataCount = aggregated.filter((s: HealthSnapshot) => 
        s.timestamp < now - (24 * 60 * 60 * 1000)
      ).length;
      
      // Recent data should be kept as-is
      const recentDataCount = aggregated.filter((s: HealthSnapshot) => 
        s.timestamp >= now - (24 * 60 * 60 * 1000)
      ).length;
      
      expect(oldDataCount).toBeLessThan(24); // Should be aggregated
      expect(recentDataCount).toBe(48); // Should be kept as-is
    });

    it('should calculate average metrics correctly', () => {
      const snapshots: HealthSnapshot[] = [
        createMockSnapshot(1000, { memoryRss: 100, errorRate: 0.1 }),
        createMockSnapshot(2000, { memoryRss: 200, errorRate: 0.2 }),
        createMockSnapshot(3000, { memoryRss: 300, errorRate: 0.3 }),
      ];

      const averaged = (healthMonitor as any).calculateAverageMetrics(snapshots);
      
      expect(averaged.metrics.memoryUsage.rss).toBe(200); // Average of 100, 200, 300
      expect(averaged.metrics.errorRate).toBeCloseTo(0.2); // Average of 0.1, 0.2, 0.3
    });

    it('should handle empty snapshots array', () => {
      expect(() => {
        (healthMonitor as any).calculateAverageMetrics([]);
      }).toThrow('Cannot calculate average of empty snapshots array');
    });
  });

  describe('compression statistics', () => {
    it('should calculate compression statistics', async () => {
      // Initialize with test data
      await healthMonitor.initialize();

      // Get compression stats
      const stats = await healthMonitor.getCompressionStats();
      
      expect(stats).toHaveProperty('originalSize');
      expect(stats).toHaveProperty('compressedSize');
      expect(stats).toHaveProperty('compressionRatio');
      expect(stats).toHaveProperty('savedBytes');
      expect(stats).toHaveProperty('savedPercentage');
      
      // If there's data, verify calculations
      if (stats.originalSize > 0) {
        expect(stats.compressionRatio).toBeGreaterThan(0);
        expect(stats.savedPercentage).toBeGreaterThanOrEqual(0);
        expect(stats.savedPercentage).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('metrics export', () => {
    it('should export metrics in JSON format', async () => {
      // Add test metrics
      const metricsData = (healthMonitor as any).metricsData as Map<number, HealthSnapshot>;
      const now = Date.now();
      
      for (let i = 0; i < 5; i++) {
        metricsData.set(now - (i * 60 * 60 * 1000), createMockSnapshot(now - (i * 60 * 60 * 1000)));
      }

      const exported = await healthMonitor.exportMetrics(
        now - (24 * 60 * 60 * 1000),
        now,
        'json'
      );
      
      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(5);
    });

    it('should export metrics in CSV format', async () => {
      // Add test metrics
      const metricsData = (healthMonitor as any).metricsData as Map<number, HealthSnapshot>;
      const now = Date.now();
      
      for (let i = 0; i < 3; i++) {
        metricsData.set(now - (i * 60 * 60 * 1000), createMockSnapshot(now - (i * 60 * 60 * 1000)));
      }

      const exported = await healthMonitor.exportMetrics(
        now - (24 * 60 * 60 * 1000),
        now,
        'csv'
      );
      
      const lines = exported.split('\n');
      expect(lines[0]).toContain('timestamp'); // Header
      expect(lines.length).toBe(4); // Header + 3 data rows
    });
  });

  describe('TTL and cleanup', () => {
    it('should remove metrics older than 30 days on load', async () => {
      // Mock DataStore load to return old and new metrics
      const mockData = {
        snapshots: [
          createMockSnapshot(Date.now() - (35 * 24 * 60 * 60 * 1000)), // 35 days old
          createMockSnapshot(Date.now() - (25 * 24 * 60 * 60 * 1000)), // 25 days old
          createMockSnapshot(Date.now() - (5 * 24 * 60 * 60 * 1000)),  // 5 days old
        ],
        alertState: {
          lastMemoryAlert: 0,
          lastErrorRateAlert: 0,
          lastResponseTimeAlert: 0,
          lastDiskSpaceAlert: 0,
          consecutiveAlerts: {},
        },
        lastSaved: Date.now(),
      };

      jest.spyOn(healthMonitor['metricsDataStore'], 'load').mockResolvedValue(mockData);
      
      await (healthMonitor as any).loadMetricsData();
      
      const metricsData = (healthMonitor as any).metricsData as Map<number, HealthSnapshot>;
      expect(metricsData.size).toBe(2); // Only 25 and 5 days old metrics
    });
  });

  describe('DataStore integration', () => {
    it('should use DataStore with compression enabled', () => {
      const dataStore = (healthMonitor as any).metricsDataStore as DataStore<any>;
      expect(dataStore).toBeDefined();
      
      // Verify compression is enabled (this is set in constructor)
      const config = (dataStore as any).config;
      expect(config.compressionEnabled).toBe(true);
      expect(config.compressionThreshold).toBe(10000); // 10KB
      expect(config.ttl).toBe(30 * 24 * 60 * 60 * 1000); // 30 days
    });

    it('should save metrics with compression', async () => {
      const saveSpy = jest.spyOn(healthMonitor['metricsDataStore'], 'save');
      
      // Trigger save
      await (healthMonitor as any).saveMetricsData();
      
      expect(saveSpy).toHaveBeenCalled();
      const savedData = saveSpy.mock.calls[0][0];
      expect(savedData).toHaveProperty('snapshots');
      expect(savedData).toHaveProperty('alertState');
      expect(savedData).toHaveProperty('lastSaved');
    });
  });
});

// Helper function to create mock health snapshots
function createMockSnapshot(
  timestamp: number, 
  overrides: { memoryRss?: number; errorRate?: number } = {}
): HealthSnapshot {
  return {
    timestamp,
    metrics: {
      memoryUsage: {
        rss: overrides.memoryRss || 100 * 1024 * 1024,
        heapTotal: 50 * 1024 * 1024,
        heapUsed: 30 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      },
      activeConversations: 5,
      rateLimitStatus: {
        minuteRemaining: 50,
        dailyRemaining: 1000,
        requestsThisMinute: 10,
        requestsToday: 100,
      },
      uptime: 3600000,
      errorRate: overrides.errorRate || 0.01,
      responseTime: { p50: 100, p95: 250, p99: 500 },
      apiHealth: { gemini: true, discord: true },
      cacheMetrics: {
        hitRate: 0.85,
        memoryUsage: 10 * 1024 * 1024,
        size: 100,
      },
      contextMetrics: {
        totalServers: 10,
        totalMemoryUsage: 50 * 1024 * 1024,
        averageServerSize: 5 * 1024 * 1024,
        largestServerSize: 10 * 1024 * 1024,
        itemCounts: {
          embarrassingMoments: 50,
          codeSnippets: 100,
          runningGags: 25,
          summarizedFacts: 200,
        },
        compressionStats: {
          averageCompressionRatio: 0.7,
          totalMemorySaved: 15 * 1024 * 1024,
          duplicatesRemoved: 30,
        },
      },
    },
  };
}