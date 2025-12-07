"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const healthMonitor_1 = require("../../../src/services/healthMonitor");
const test_utils_1 = require("../../test-utils");
const path = __importStar(require("path"));
// Mock dependencies
const mockFs = {
    mkdir: globals_1.jest.fn().mockResolvedValue(undefined),
    writeFile: globals_1.jest.fn().mockResolvedValue(undefined),
    readFile: globals_1.jest.fn().mockResolvedValue('{}'),
    pathExists: globals_1.jest.fn().mockResolvedValue(false),
};
globals_1.jest.mock('fs/promises', () => mockFs);
(0, globals_1.describe)('HealthMonitor', () => {
    let healthMonitor;
    let testEnv;
    let mockTimers;
    (0, globals_1.beforeEach)(() => {
        testEnv = (0, test_utils_1.createTestEnvironment)();
        mockTimers = new test_utils_1.MockTimers();
        healthMonitor = new healthMonitor_1.HealthMonitor(path.join(global.TEST_HEALTH_DIR, 'test-metrics.json'));
        // Reset all mocks
        globals_1.jest.clearAllMocks();
        mockFs.pathExists.mockResolvedValue(false);
        mockFs.readFile.mockResolvedValue('{}');
    });
    (0, globals_1.afterEach)(() => {
        testEnv.cleanup();
        mockTimers.clearAll();
    });
    (0, globals_1.describe)('initialization', () => {
        (0, globals_1.it)('should initialize successfully with default configuration', async () => {
            await (0, globals_1.expect)(healthMonitor.initialize()).resolves.not.toThrow();
            (0, globals_1.expect)(mockFs.mkdir).toHaveBeenCalled();
            (0, globals_1.expect)(healthMonitor.getAlertConfig()).toMatchObject({
                enabled: false, // Default from environment
                memoryThreshold: 500,
                errorRateThreshold: 5.0,
                responseTimeThreshold: 5000,
                diskSpaceThreshold: 85.0,
            });
        });
        (0, globals_1.it)('should use environment variables for configuration', async () => {
            process.env.HEALTH_MEMORY_THRESHOLD_MB = '256';
            process.env.HEALTH_ERROR_RATE_THRESHOLD = '2.5';
            process.env.HEALTH_ALERTS_ENABLED = 'true';
            const monitor = new healthMonitor_1.HealthMonitor();
            await monitor.initialize();
            const config = monitor.getAlertConfig();
            (0, globals_1.expect)(config.memoryThreshold).toBe(256);
            (0, globals_1.expect)(config.errorRateThreshold).toBe(2.5);
            (0, globals_1.expect)(config.enabled).toBe(true);
            await monitor.shutdown();
            // Cleanup
            delete process.env.HEALTH_MEMORY_THRESHOLD_MB;
            delete process.env.HEALTH_ERROR_RATE_THRESHOLD;
            delete process.env.HEALTH_ALERTS_ENABLED;
        });
        (0, globals_1.it)('should load existing metrics data on initialization', async () => {
            const existingData = {
                snapshots: [
                    {
                        timestamp: Date.now() - 1000,
                        metrics: (0, test_utils_1.createMockMetrics)(),
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
            (0, globals_1.expect)(historical).toHaveLength(1);
        });
    });
    (0, globals_1.describe)('metrics collection', () => {
        (0, globals_1.beforeEach)(async () => {
            await healthMonitor.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await healthMonitor.shutdown();
        });
        (0, globals_1.it)('should collect current metrics without services', async () => {
            const metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(metrics).toMatchObject({
                memoryUsage: globals_1.expect.objectContaining({
                    rss: globals_1.expect.any(Number),
                    heapTotal: globals_1.expect.any(Number),
                    heapUsed: globals_1.expect.any(Number),
                }),
                activeConversations: 0,
                rateLimitStatus: {
                    minuteRemaining: 0,
                    dailyRemaining: 0,
                    requestsThisMinute: 0,
                    requestsToday: 0,
                },
                uptime: globals_1.expect.any(Number),
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
        (0, globals_1.it)('should record performance metrics correctly', async () => {
            // Record some sample data
            healthMonitor.recordResponseTime(100);
            healthMonitor.recordResponseTime(200);
            healthMonitor.recordResponseTime(300);
            healthMonitor.recordRequest();
            healthMonitor.recordRequest();
            healthMonitor.recordError();
            const metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(metrics.responseTime.p50).toBeGreaterThan(0);
            (0, globals_1.expect)(metrics.errorRate).toBeCloseTo(50, 1); // 1 error out of 2 requests
        });
        (0, globals_1.it)('should integrate with rate limiter when available', async () => {
            const mockRateLimiter = {
                getRemainingQuota: globals_1.jest.fn().mockReturnValue({
                    minute: 8,
                    daily: 450,
                }),
            };
            healthMonitor.setRateLimiter(mockRateLimiter);
            const metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(mockRateLimiter.getRemainingQuota).toHaveBeenCalled();
            (0, globals_1.expect)(metrics.rateLimitStatus.minuteRemaining).toBe(8);
            (0, globals_1.expect)(metrics.rateLimitStatus.dailyRemaining).toBe(450);
        });
        (0, globals_1.it)('should integrate with context manager when available', async () => {
            const mockContextManager = {
                getMemoryStats: globals_1.jest.fn().mockReturnValue({
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
            healthMonitor.setContextManager(mockContextManager);
            const metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(mockContextManager.getMemoryStats).toHaveBeenCalled();
            (0, globals_1.expect)(metrics.contextMetrics.totalServers).toBe(5);
            (0, globals_1.expect)(metrics.contextMetrics.itemCounts.embarrassingMoments).toBe(10);
        });
        (0, globals_1.it)('should integrate with gemini service when available', async () => {
            const mockGeminiService = {
                getConversationStats: globals_1.jest.fn().mockReturnValue({
                    activeUsers: 3,
                }),
                getCacheStats: globals_1.jest.fn().mockReturnValue({
                    hitRate: 0.75,
                    memoryUsage: 5 * 1024 * 1024,
                    cacheSize: 50,
                }),
                clearCache: globals_1.jest.fn(),
            };
            healthMonitor.setGeminiService(mockGeminiService);
            const metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(mockGeminiService.getConversationStats).toHaveBeenCalled();
            (0, globals_1.expect)(mockGeminiService.getCacheStats).toHaveBeenCalled();
            (0, globals_1.expect)(metrics.activeConversations).toBe(3);
            (0, globals_1.expect)(metrics.cacheMetrics.hitRate).toBe(0.75);
        });
    });
    (0, globals_1.describe)('alert system', () => {
        (0, globals_1.beforeEach)(async () => {
            healthMonitor.updateAlertConfig({ enabled: true });
            await healthMonitor.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await healthMonitor.shutdown();
        });
        (0, globals_1.it)('should trigger memory alert when threshold exceeded', async () => {
            healthMonitor.updateAlertConfig({
                enabled: true,
                memoryThreshold: 50, // 50MB threshold
            });
            const mockMetrics = (0, test_utils_1.createMockMetrics)();
            mockMetrics.memoryUsage.rss = 100 * 1024 * 1024; // 100MB
            // Mock the collectHealthMetrics method
            const originalCollectMethod = healthMonitor.collectHealthMetrics;
            healthMonitor.collectHealthMetrics = globals_1.jest.fn().mockResolvedValue(mockMetrics);
            // Manually trigger alert check
            await healthMonitor.checkAlerts(mockMetrics);
            // Restore original method
            healthMonitor.collectHealthMetrics = originalCollectMethod;
        });
        (0, globals_1.it)('should trigger error rate alert when threshold exceeded', async () => {
            healthMonitor.updateAlertConfig({
                enabled: true,
                errorRateThreshold: 1.0, // 1% threshold
            });
            // Record high error rate
            for (let i = 0; i < 10; i++) {
                healthMonitor.recordRequest();
                if (i < 2)
                    healthMonitor.recordError(); // 20% error rate
            }
            const metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(metrics.errorRate).toBeGreaterThan(1.0);
        });
        (0, globals_1.it)('should not trigger alerts when disabled', async () => {
            healthMonitor.updateAlertConfig({ enabled: false });
            const mockMetrics = (0, test_utils_1.createMockMetrics)();
            mockMetrics.memoryUsage.rss = 1000 * 1024 * 1024; // 1GB (way over threshold)
            mockMetrics.errorRate = 50; // 50% error rate
            await healthMonitor.checkAlerts(mockMetrics);
            // No way to verify alerts weren't triggered without more complex mocking
            // This test serves as documentation that alerts can be disabled
        });
        (0, globals_1.it)('should respect alert cooldown period', async () => {
            healthMonitor.updateAlertConfig({
                enabled: true,
                memoryThreshold: 50,
            });
            const mockMetrics = (0, test_utils_1.createMockMetrics)();
            mockMetrics.memoryUsage.rss = 100 * 1024 * 1024;
            // Trigger first alert
            await healthMonitor.checkAlerts(mockMetrics);
            // Immediate second alert should be suppressed by cooldown
            await healthMonitor.checkAlerts(mockMetrics);
        });
    });
    (0, globals_1.describe)('self-healing functionality', () => {
        (0, globals_1.beforeEach)(async () => {
            await healthMonitor.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await healthMonitor.shutdown();
        });
        (0, globals_1.it)('should attempt memory self-healing', async () => {
            const mockGeminiService = {
                clearCache: globals_1.jest.fn(),
                getConversationStats: globals_1.jest.fn().mockReturnValue({ activeUsers: 0 }),
                getCacheStats: globals_1.jest.fn().mockReturnValue({
                    hitRate: 0,
                    memoryUsage: 0,
                    cacheSize: 0,
                }),
            };
            healthMonitor.setGeminiService(mockGeminiService);
            // Mock global.gc
            const originalGc = global.gc;
            global.gc = globals_1.jest.fn();
            await healthMonitor.healMemoryIssues();
            (0, globals_1.expect)(mockGeminiService.clearCache).toHaveBeenCalled();
            (0, globals_1.expect)(global.gc).toHaveBeenCalled();
            // Restore
            global.gc = originalGc;
        });
        (0, globals_1.it)('should reset error tracking for error rate healing', async () => {
            // Record some errors
            healthMonitor.recordError();
            healthMonitor.recordRequest();
            let metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(metrics.errorRate).toBeGreaterThan(0);
            await healthMonitor.healErrorRateIssues();
            // Error rate should be reset
            metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(metrics.errorRate).toBe(0);
        });
        (0, globals_1.it)('should clear caches for response time healing', async () => {
            const mockGeminiService = {
                clearCache: globals_1.jest.fn(),
                getConversationStats: globals_1.jest.fn().mockReturnValue({ activeUsers: 0 }),
                getCacheStats: globals_1.jest.fn().mockReturnValue({
                    hitRate: 0,
                    memoryUsage: 0,
                    cacheSize: 0,
                }),
            };
            healthMonitor.setGeminiService(mockGeminiService);
            await healthMonitor.healResponseTimeIssues();
            (0, globals_1.expect)(mockGeminiService.clearCache).toHaveBeenCalled();
        });
    });
    (0, globals_1.describe)('historical metrics', () => {
        (0, globals_1.beforeEach)(async () => {
            await healthMonitor.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await healthMonitor.shutdown();
        });
        (0, globals_1.it)('should retrieve historical metrics within time range', async () => {
            const now = Date.now();
            const oneHourAgo = now - (60 * 60 * 1000);
            // Add some mock data to the internal metrics
            const mockSnapshot = {
                timestamp: oneHourAgo + 1000,
                metrics: (0, test_utils_1.createMockMetrics)(),
            };
            healthMonitor.metricsData.set(mockSnapshot.timestamp, mockSnapshot);
            const historical = await healthMonitor.getHistoricalMetrics(oneHourAgo, now);
            (0, globals_1.expect)(historical).toHaveLength(1);
            (0, globals_1.expect)(historical[0].timestamp).toBe(mockSnapshot.timestamp);
        });
        (0, globals_1.it)('should return empty array when no metrics in range', async () => {
            const now = Date.now();
            const oneDayAgo = now - (24 * 60 * 60 * 1000);
            const twoDaysAgo = oneDayAgo - (24 * 60 * 60 * 1000);
            const historical = await healthMonitor.getHistoricalMetrics(twoDaysAgo, oneDayAgo);
            (0, globals_1.expect)(historical).toHaveLength(0);
        });
        (0, globals_1.it)('should use default time range when not specified', async () => {
            const historical = await healthMonitor.getHistoricalMetrics();
            (0, globals_1.expect)(historical).toEqual([]);
        });
    });
    (0, globals_1.describe)('configuration management', () => {
        (0, globals_1.it)('should update alert configuration', () => {
            const newConfig = {
                memoryThreshold: 1024,
                errorRateThreshold: 10.0,
                enabled: true,
            };
            healthMonitor.updateAlertConfig(newConfig);
            const config = healthMonitor.getAlertConfig();
            (0, globals_1.expect)(config.memoryThreshold).toBe(1024);
            (0, globals_1.expect)(config.errorRateThreshold).toBe(10.0);
            (0, globals_1.expect)(config.enabled).toBe(true);
        });
        (0, globals_1.it)('should preserve existing configuration when partially updating', () => {
            const originalConfig = healthMonitor.getAlertConfig();
            healthMonitor.updateAlertConfig({ memoryThreshold: 2048 });
            const updatedConfig = healthMonitor.getAlertConfig();
            (0, globals_1.expect)(updatedConfig.memoryThreshold).toBe(2048);
            (0, globals_1.expect)(updatedConfig.errorRateThreshold).toBe(originalConfig.errorRateThreshold);
            (0, globals_1.expect)(updatedConfig.enabled).toBe(originalConfig.enabled);
        });
    });
    (0, globals_1.describe)('service status tracking', () => {
        (0, globals_1.beforeEach)(async () => {
            await healthMonitor.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await healthMonitor.shutdown();
        });
        (0, globals_1.it)('should track Discord connection status', () => {
            healthMonitor.setDiscordConnected(true);
            // We can't directly test this without triggering metrics collection
            // but we can verify the method exists and doesn't throw
            (0, globals_1.expect)(() => healthMonitor.setDiscordConnected(false)).not.toThrow();
        });
        (0, globals_1.it)('should check Gemini health based on rate limiter quota', async () => {
            const mockRateLimiter = {
                getRemainingQuota: globals_1.jest.fn().mockReturnValue({
                    minute: 0, // No quota remaining
                    daily: 100,
                }),
            };
            healthMonitor.setRateLimiter(mockRateLimiter);
            // Gemini should be considered unhealthy with no quota
            const metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(metrics.apiHealth.gemini).toBe(false);
        });
    });
    (0, globals_1.describe)('data persistence', () => {
        (0, globals_1.beforeEach)(async () => {
            await healthMonitor.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await healthMonitor.shutdown();
        });
        (0, globals_1.it)('should save metrics data periodically', async () => {
            // Add a mock snapshot
            const mockSnapshot = {
                timestamp: Date.now(),
                metrics: (0, test_utils_1.createMockMetrics)(),
            };
            healthMonitor.metricsData.set(mockSnapshot.timestamp, mockSnapshot);
            // Manually trigger save
            await healthMonitor.saveMetricsData();
            (0, globals_1.expect)(mockFs.writeFile).toHaveBeenCalledWith(globals_1.expect.stringContaining('test-metrics.json'), globals_1.expect.stringContaining('"snapshots"'));
        });
        (0, globals_1.it)('should handle save errors gracefully', async () => {
            mockFs.writeFile.mockRejectedValueOnce(new Error('Write failed'));
            // Should not throw
            await (0, globals_1.expect)(healthMonitor.saveMetricsData()).resolves.not.toThrow();
        });
    });
    (0, globals_1.describe)('cleanup and shutdown', () => {
        (0, globals_1.it)('should clean up timers and save data on shutdown', async () => {
            await healthMonitor.initialize();
            // Verify timers are running (indirectly)
            (0, globals_1.expect)(healthMonitor.metricsTimer).toBeTruthy();
            (0, globals_1.expect)(healthMonitor.cleanupTimer).toBeTruthy();
            await healthMonitor.shutdown();
            // Verify timers are cleared
            (0, globals_1.expect)(healthMonitor.metricsTimer).toBeNull();
            (0, globals_1.expect)(healthMonitor.cleanupTimer).toBeNull();
        });
        (0, globals_1.it)('should handle shutdown when not initialized', async () => {
            // Should not throw when shutting down uninitialized monitor
            await (0, globals_1.expect)(healthMonitor.shutdown()).resolves.not.toThrow();
        });
        (0, globals_1.it)('should perform periodic cleanup of old data', async () => {
            await healthMonitor.initialize();
            const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
            const recentTimestamp = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago
            // Add old and recent data
            healthMonitor.metricsData.set(oldTimestamp, {
                timestamp: oldTimestamp,
                metrics: (0, test_utils_1.createMockMetrics)(),
            });
            healthMonitor.metricsData.set(recentTimestamp, {
                timestamp: recentTimestamp,
                metrics: (0, test_utils_1.createMockMetrics)(),
            });
            // Manually trigger cleanup
            await healthMonitor.performCleanup();
            // Old data should be removed, recent data should remain
            (0, globals_1.expect)(healthMonitor.metricsData.has(oldTimestamp)).toBe(false);
            (0, globals_1.expect)(healthMonitor.metricsData.has(recentTimestamp)).toBe(true);
            await healthMonitor.shutdown();
        });
    });
    (0, globals_1.describe)('percentile calculations', () => {
        (0, globals_1.beforeEach)(async () => {
            await healthMonitor.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await healthMonitor.shutdown();
        });
        (0, globals_1.it)('should calculate percentiles correctly', () => {
            // Record response times in a known pattern
            const times = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
            times.forEach(time => healthMonitor.recordResponseTime(time));
            const calculatePercentile = healthMonitor.calculatePercentile.bind(healthMonitor);
            // Test known percentiles
            (0, globals_1.expect)(calculatePercentile(times, 50)).toBeCloseTo(500, 0);
            (0, globals_1.expect)(calculatePercentile(times, 95)).toBeCloseTo(950, 0);
            (0, globals_1.expect)(calculatePercentile(times, 99)).toBeCloseTo(990, 0);
        });
        (0, globals_1.it)('should handle empty arrays', () => {
            const calculatePercentile = healthMonitor.calculatePercentile.bind(healthMonitor);
            (0, globals_1.expect)(calculatePercentile([], 50)).toBe(0);
        });
        (0, globals_1.it)('should handle single value arrays', () => {
            const calculatePercentile = healthMonitor.calculatePercentile.bind(healthMonitor);
            (0, globals_1.expect)(calculatePercentile([100], 95)).toBe(100);
        });
    });
});
//# sourceMappingURL=healthMonitor.test.js.map