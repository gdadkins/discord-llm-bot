/**
 * HealthStatusEvaluator Tests
 * 
 * Unit tests for the HealthStatusEvaluator component
 */

import { HealthStatusEvaluator } from '../../../../src/services/health/HealthStatusEvaluator';
import type { HealthMetrics, AlertConfig } from '../../../../src/services/health/types';

// Mock logger to capture alert messages
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('HealthStatusEvaluator', () => {
  let evaluator: HealthStatusEvaluator;
  let mockMetrics: HealthMetrics;
  let alertConfig: AlertConfig;

  beforeEach(() => {
    evaluator = new HealthStatusEvaluator();
    
    // Create mock metrics
    mockMetrics = {
      memoryUsage: {
        rss: 100 * 1024 * 1024, // 100MB
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 60 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      },
      activeConversations: 3,
      rateLimitStatus: {
        minuteRemaining: 10,
        dailyRemaining: 100,
        requestsThisMinute: 5,
        requestsToday: 50
      },
      uptime: 3600000, // 1 hour
      errorRate: 2.5,
      responseTime: { p50: 200, p95: 500, p99: 800 },
      apiHealth: { gemini: true, discord: true },
      cacheMetrics: {
        hitRate: 0.8,
        memoryUsage: 1024,
        size: 50
      },
      contextMetrics: {
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
      },
      dataStoreMetrics: {
        totalStores: 5,
        storesByType: { user: 2, server: 3 },
        totalSaveOperations: 100,
        totalLoadOperations: 200,
        totalErrors: 2,
        avgSaveLatency: 50,
        avgLoadLatency: 30,
        healthyStores: 5,
        unhealthyStores: 0,
        totalBytesWritten: 1024,
        totalBytesRead: 2048
      }
    };

    alertConfig = {
      memoryThreshold: 150, // 150MB
      errorRateThreshold: 5.0, // 5%
      responseTimeThreshold: 1000, // 1000ms
      diskSpaceThreshold: 80, // 80%
      enabled: true
    };

    jest.clearAllMocks();
  });

  describe('Alert State Management', () => {
    it('should initialize with default alert state', () => {
      const alertState = evaluator.getAlertState();
      
      expect(alertState.lastMemoryAlert).toBe(0);
      expect(alertState.lastErrorRateAlert).toBe(0);
      expect(alertState.lastResponseTimeAlert).toBe(0);
      expect(alertState.lastDiskSpaceAlert).toBe(0);
      expect(alertState.consecutiveAlerts).toBeInstanceOf(Map);
    });

    it('should update alert state correctly', () => {
      const newState = {
        lastMemoryAlert: Date.now(),
        lastErrorRateAlert: Date.now(),
        lastResponseTimeAlert: Date.now(),
        lastDiskSpaceAlert: Date.now(),
        consecutiveAlerts: new Map([['memory', 2]])
      };

      evaluator.setAlertState(newState);
      const retrievedState = evaluator.getAlertState();

      expect(retrievedState.lastMemoryAlert).toBe(newState.lastMemoryAlert);
      expect(retrievedState.consecutiveAlerts.get('memory')).toBe(2);
    });
  });

  describe('Alert Checking', () => {
    it('should not trigger alerts when disabled', async () => {
      const disabledConfig = { ...alertConfig, enabled: false };
      
      await evaluator.checkAlerts(mockMetrics, disabledConfig);
      
      // No alerts should be triggered
      const { logger } = require('../../../../src/utils/logger');
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should not trigger memory alert when below threshold', async () => {
      await evaluator.checkAlerts(mockMetrics, alertConfig);
      
      const { logger } = require('../../../../src/utils/logger');
      const warnCalls = logger.warn.mock.calls;
      const memoryAlerts = warnCalls.filter((call: any[]) => 
        call[0].includes('memory') && call[0].includes('HEALTH ALERT')
      );
      
      expect(memoryAlerts).toHaveLength(0);
    });

    it('should trigger memory alert when above threshold', async () => {
      // Set memory usage to 200MB (above 150MB threshold)
      mockMetrics.memoryUsage.rss = 200 * 1024 * 1024;
      
      await evaluator.checkAlerts(mockMetrics, alertConfig);
      
      const { logger } = require('../../../../src/utils/logger');
      const warnCalls = logger.warn.mock.calls;
      const memoryAlerts = warnCalls.filter((call: any[]) => 
        call[0].includes('memory') && call[0].includes('HEALTH ALERT')
      );
      
      expect(memoryAlerts.length).toBeGreaterThan(0);
    });

    it('should trigger error rate alert when above threshold', async () => {
      // Set error rate above threshold
      mockMetrics.errorRate = 6.0; // Above 5% threshold
      
      await evaluator.checkAlerts(mockMetrics, alertConfig);
      
      const { logger } = require('../../../../src/utils/logger');
      const warnCalls = logger.warn.mock.calls;
      const errorRateAlerts = warnCalls.filter((call: any[]) => 
        call[0].includes('error_rate') && call[0].includes('HEALTH ALERT')
      );
      
      expect(errorRateAlerts.length).toBeGreaterThan(0);
    });

    it('should trigger response time alert when above threshold', async () => {
      // Set response time above threshold
      mockMetrics.responseTime.p95 = 1500; // Above 1000ms threshold
      
      await evaluator.checkAlerts(mockMetrics, alertConfig);
      
      const { logger } = require('../../../../src/utils/logger');
      const warnCalls = logger.warn.mock.calls;
      const responseTimeAlerts = warnCalls.filter((call: any[]) => 
        call[0].includes('response_time') && call[0].includes('HEALTH ALERT')
      );
      
      expect(responseTimeAlerts.length).toBeGreaterThan(0);
    });

    it('should trigger API health alert when services are unhealthy', async () => {
      // Set API services as unhealthy
      mockMetrics.apiHealth.gemini = false;
      mockMetrics.apiHealth.discord = false;
      
      await evaluator.checkAlerts(mockMetrics, alertConfig);
      
      const { logger } = require('../../../../src/utils/logger');
      const warnCalls = logger.warn.mock.calls;
      const apiHealthAlerts = warnCalls.filter((call: any[]) => 
        call[0].includes('api_health') && call[0].includes('HEALTH ALERT')
      );
      
      expect(apiHealthAlerts.length).toBeGreaterThan(0);
    });

    it('should trigger DataStore health alert when stores are unhealthy', async () => {
      // Set some stores as unhealthy
      mockMetrics.dataStoreMetrics.unhealthyStores = 2;
      
      await evaluator.checkAlerts(mockMetrics, alertConfig);
      
      const { logger } = require('../../../../src/utils/logger');
      const warnCalls = logger.warn.mock.calls;
      const dataStoreAlerts = warnCalls.filter((call: any[]) => 
        call[0].includes('datastore_health') && call[0].includes('HEALTH ALERT')
      );
      
      expect(dataStoreAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('Self-Healing', () => {
    it('should attempt self-healing for memory issues', async () => {
      await evaluator.attemptSelfHealing('memory', 1, mockMetrics);
      
      const { logger } = require('../../../../src/utils/logger');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting self-healing for alert type: memory')
      );
    });

    it('should attempt self-healing for error rate issues', async () => {
      await evaluator.attemptSelfHealing('error_rate', 1, mockMetrics);
      
      const { logger } = require('../../../../src/utils/logger');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting self-healing for alert type: error_rate')
      );
    });

    it('should log when no self-healing is available', async () => {
      await evaluator.attemptSelfHealing('unknown_type', 1, mockMetrics);
      
      const { logger } = require('../../../../src/utils/logger');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('No self-healing available for alert type: unknown_type')
      );
    });
  });
});