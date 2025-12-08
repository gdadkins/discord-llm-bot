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
const healthMonitor_1 = require("../../src/services/healthMonitor");
const gracefulDegradation_1 = require("../../src/services/gracefulDegradation");
const configurationManager_1 = require("../../src/services/configurationManager");
const test_utils_1 = require("../test-utils");
const path = __importStar(require("path"));
(0, globals_1.describe)('Performance Load Tests', () => {
    let testEnv;
    let healthMonitor;
    let gracefulDegradation;
    let configurationManager;
    // Performance thresholds
    const PERFORMANCE_THRESHOLDS = {
        healthMetricsCollection: 50, // ms per operation
        configurationValidation: 10, // ms per validation
        circuitBreakerOperation: 5, // ms per circuit breaker check
        massiveDataHandling: 1000, // ms for large data sets
        concurrentOperations: 2000, // ms for 100 concurrent operations
    };
    (0, globals_1.beforeEach)(async () => {
        testEnv = (0, test_utils_1.createTestEnvironment)();
        healthMonitor = new healthMonitor_1.HealthMonitor(path.join(global.TEST_HEALTH_DIR, 'load-metrics.json'));
        gracefulDegradation = new gracefulDegradation_1.GracefulDegradation();
        configurationManager = new configurationManager_1.ConfigurationManager(path.join(global.TEST_CONFIG_DIR, 'load-config.json'), path.join(global.TEST_CONFIG_DIR, 'load-versions'), path.join(global.TEST_CONFIG_DIR, 'load-audit.log'));
        await configurationManager.initialize();
        await healthMonitor.initialize();
        await gracefulDegradation.initialize();
    });
    (0, globals_1.afterEach)(async () => {
        await gracefulDegradation.shutdown();
        await healthMonitor.shutdown();
        await configurationManager.shutdown();
        testEnv.cleanup();
    });
    (0, globals_1.describe)('HealthMonitor Performance', () => {
        (0, globals_1.it)('should collect metrics within performance threshold', async () => {
            const iterations = 100;
            const startTime = Date.now();
            for (let i = 0; i < iterations; i++) {
                await healthMonitor.getCurrentMetrics();
            }
            const endTime = Date.now();
            const averageTime = (endTime - startTime) / iterations;
            (0, globals_1.expect)(averageTime).toBeLessThan(PERFORMANCE_THRESHOLDS.healthMetricsCollection);
            console.log(`Health metrics collection: ${averageTime.toFixed(2)}ms average`);
        });
        (0, globals_1.it)('should handle high-frequency performance data recording', async () => {
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
            (0, globals_1.expect)(totalTime).toBeLessThan(100);
            console.log(`Performance data recording: ${totalTime}ms for ${iterations} operations`);
            // Verify data integrity
            const metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(metrics.errorRate).toBeGreaterThan(0);
            (0, globals_1.expect)(metrics.responseTime.p50).toBeGreaterThan(0);
        });
        (0, globals_1.it)('should maintain performance with large metric history', async () => {
            // Simulate large amount of historical data
            for (let i = 0; i < 1000; i++) {
                const timestamp = Date.now() - (i * 1000);
                healthMonitor.metricsData.set(timestamp, {
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
            (0, globals_1.expect)(queryTime).toBeLessThan(100);
            (0, globals_1.expect)(historical.length).toBeGreaterThan(0);
            console.log(`Historical metrics query: ${queryTime}ms for ${historical.length} records`);
        });
        (0, globals_1.it)('should handle concurrent metrics collection', async () => {
            const concurrentRequests = 50;
            const startTime = Date.now();
            const promises = Array.from({ length: concurrentRequests }, () => healthMonitor.getCurrentMetrics());
            const results = await Promise.all(promises);
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            (0, globals_1.expect)(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.concurrentOperations);
            (0, globals_1.expect)(results).toHaveLength(concurrentRequests);
            console.log(`Concurrent metrics collection: ${totalTime}ms for ${concurrentRequests} requests`);
        });
        (0, globals_1.it)('should efficiently clean up old data', async () => {
            // Add many old snapshots
            const oldDataCount = 10000;
            const cutoffTime = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
            for (let i = 0; i < oldDataCount; i++) {
                const timestamp = cutoffTime - (i * 1000);
                healthMonitor.metricsData.set(timestamp, {
                    timestamp,
                    metrics: { uptime: i },
                });
            }
            const startTime = Date.now();
            await healthMonitor.performCleanup();
            const endTime = Date.now();
            const cleanupTime = endTime - startTime;
            (0, globals_1.expect)(cleanupTime).toBeLessThan(500); // Should clean up quickly
            console.log(`Data cleanup: ${cleanupTime}ms for ${oldDataCount} old records`);
        });
    });
    (0, globals_1.describe)('GracefulDegradation Performance', () => {
        (0, globals_1.it)('should evaluate degradation status quickly', async () => {
            const iterations = 500;
            const startTime = Date.now();
            for (let i = 0; i < iterations; i++) {
                await gracefulDegradation.shouldDegrade();
            }
            const endTime = Date.now();
            const averageTime = (endTime - startTime) / iterations;
            (0, globals_1.expect)(averageTime).toBeLessThan(10); // Very fast operations
            console.log(`Degradation evaluation: ${averageTime.toFixed(2)}ms average`);
        });
        (0, globals_1.it)('should handle high-volume circuit breaker operations', async () => {
            const operations = 1000;
            const mockOperation = globals_1.jest.fn().mockResolvedValue('success');
            const startTime = Date.now();
            const promises = Array.from({ length: operations }, () => gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini'));
            await Promise.all(promises);
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            const averageTime = totalTime / operations;
            (0, globals_1.expect)(averageTime).toBeLessThan(PERFORMANCE_THRESHOLDS.circuitBreakerOperation);
            console.log(`Circuit breaker operations: ${averageTime.toFixed(2)}ms average`);
        });
        (0, globals_1.it)('should efficiently manage large message queues', async () => {
            const queueSize = 1000;
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            const startTime = Date.now();
            // Fill queue with messages
            const queuePromises = Array.from({ length: queueSize }, (_, i) => gracefulDegradation.queueMessage(`user-${i}`, `message ${i}`, mockRespond, 'test-server', i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low'));
            await Promise.all(queuePromises);
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            (0, globals_1.expect)(totalTime).toBeLessThan(1000); // Should queue efficiently
            console.log(`Message queueing: ${totalTime}ms for ${queueSize} messages`);
            // Verify queue size and ordering
            const status = gracefulDegradation.getStatus();
            (0, globals_1.expect)(status.queue.size).toBeLessThanOrEqual(100); // Default max queue size
        });
        (0, globals_1.it)('should process queued messages efficiently', async () => {
            const messageCount = 100;
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Add messages to queue
            for (let i = 0; i < messageCount; i++) {
                await gracefulDegradation.queueMessage(`user-${i}`, `message ${i}`, mockRespond, 'test-server', 'medium');
            }
            const startTime = Date.now();
            // Process queue multiple times to clear it
            for (let i = 0; i < 25; i++) { // 100 messages / 5 per batch = 20 batches
                await gracefulDegradation.processQueue();
                await (0, test_utils_1.waitForAsync)(1); // Small delay to simulate real processing
            }
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            (0, globals_1.expect)(totalTime).toBeLessThan(2000); // Should process reasonably fast
            console.log(`Queue processing: ${totalTime}ms for ${messageCount} messages`);
        });
        (0, globals_1.it)('should handle rapid state transitions', async () => {
            const transitions = 100;
            const mockOperation = globals_1.jest.fn();
            // Alternate between success and failure to trigger state transitions
            mockOperation.mockImplementation((call) => {
                if (call % 2 === 0) {
                    return Promise.resolve('success');
                }
                else {
                    return Promise.reject(new Error('failure'));
                }
            });
            const startTime = Date.now();
            for (let i = 0; i < transitions; i++) {
                try {
                    await gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini');
                }
                catch (error) {
                    // Expected for half the operations
                }
            }
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            (0, globals_1.expect)(totalTime).toBeLessThan(1000);
            console.log(`State transitions: ${totalTime}ms for ${transitions} operations`);
        });
    });
    (0, globals_1.describe)('ConfigurationManager Performance', () => {
        (0, globals_1.it)('should validate configuration quickly', async () => {
            const config = configurationManager.getConfiguration();
            const iterations = 100;
            const startTime = Date.now();
            for (let i = 0; i < iterations; i++) {
                const result = configurationManager.validateConfiguration(config);
                (0, globals_1.expect)(result.valid).toBe(true);
            }
            const endTime = Date.now();
            const averageTime = (endTime - startTime) / iterations;
            (0, globals_1.expect)(averageTime).toBeLessThan(PERFORMANCE_THRESHOLDS.configurationValidation);
            console.log(`Configuration validation: ${averageTime.toFixed(2)}ms average`);
        });
        (0, globals_1.it)('should handle rapid configuration updates', async () => {
            const updates = 50;
            const startTime = Date.now();
            for (let i = 0; i < updates; i++) {
                await configurationManager.updateConfigurationSection('features', {
                    monitoring: {
                        ...configurationManager.getMonitoringConfig(),
                        healthMetrics: {
                            ...configurationManager.getMonitoringConfig().healthMetrics,
                            collectionInterval: 30000 + i,
                        },
                    },
                }, `user-${i}`, `Update ${i}`);
            }
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            const averageTime = totalTime / updates;
            (0, globals_1.expect)(averageTime).toBeLessThan(50); // Should update quickly
            console.log(`Configuration updates: ${averageTime.toFixed(2)}ms average`);
        });
        (0, globals_1.it)('should efficiently manage version history', async () => {
            const versionCount = 100;
            // Create many versions
            for (let i = 0; i < versionCount; i++) {
                await configurationManager.updateConfiguration({
                    ...configurationManager.getConfiguration(),
                    version: `test-version-${i}`,
                }, `user-${i}`, `Version ${i}`);
            }
            const startTime = Date.now();
            const versions = await configurationManager.getVersionHistory();
            const endTime = Date.now();
            const queryTime = endTime - startTime;
            (0, globals_1.expect)(queryTime).toBeLessThan(100);
            (0, globals_1.expect)(versions.length).toBeLessThanOrEqual(50); // Should enforce version limit
            console.log(`Version history query: ${queryTime}ms for ${versions.length} versions`);
        });
        (0, globals_1.it)('should handle large audit logs efficiently', async () => {
            // Simulate large audit log
            const logEntries = Array.from({ length: 1000 }, (_, i) => JSON.stringify({
                timestamp: new Date(Date.now() - i * 1000).toISOString(),
                version: `v-${i}`,
                modifiedBy: `user-${i}`,
                changeType: 'update',
                path: ['test'],
                oldValue: i - 1,
                newValue: i,
            })).join('\n');
            // Mock large audit log
            const mockFs = require('fs-extra');
            mockFs.pathExists.mockResolvedValue(true);
            mockFs.readFile.mockResolvedValue(logEntries);
            const startTime = Date.now();
            const auditLog = await configurationManager.getAuditLog(100);
            const endTime = Date.now();
            const queryTime = endTime - startTime;
            (0, globals_1.expect)(queryTime).toBeLessThan(100);
            (0, globals_1.expect)(auditLog.length).toBeLessThanOrEqual(100);
            console.log(`Audit log query: ${queryTime}ms for ${auditLog.length} entries`);
        });
    });
    (0, globals_1.describe)('Memory Usage and Resource Management', () => {
        (0, globals_1.it)('should maintain stable memory usage under load', async () => {
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
            (0, globals_1.expect)(memoryIncreaseMB).toBeLessThan(50);
            console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
        });
        (0, globals_1.it)('should handle timer and interval cleanup properly', async () => {
            // Initialize multiple services to create timers
            const services = Array.from({ length: 10 }, () => {
                const hm = new healthMonitor_1.HealthMonitor();
                const gd = new gracefulDegradation_1.GracefulDegradation();
                return { hm, gd };
            });
            // Initialize all
            for (const service of services) {
                await service.hm.initialize();
                await service.gd.initialize();
            }
            // Shutdown all rapidly
            const startTime = Date.now();
            await Promise.all(services.map(async (service) => {
                await service.gd.shutdown();
                await service.hm.shutdown();
            }));
            const endTime = Date.now();
            const shutdownTime = endTime - startTime;
            (0, globals_1.expect)(shutdownTime).toBeLessThan(1000);
            console.log(`Rapid shutdown: ${shutdownTime}ms for ${services.length * 2} services`);
        });
    });
    (0, globals_1.describe)('Stress Testing', () => {
        (0, globals_1.it)('should handle extreme load without failures', async () => {
            const extremeLoad = 1000;
            const startTime = Date.now();
            const promises = [];
            // Create massive concurrent load
            for (let i = 0; i < extremeLoad; i++) {
                if (i % 3 === 0) {
                    promises.push(healthMonitor.getCurrentMetrics());
                }
                else if (i % 3 === 1) {
                    promises.push(gracefulDegradation.shouldDegrade());
                }
                else {
                    promises.push(Promise.resolve(configurationManager.getConfiguration()));
                }
            }
            const results = await Promise.all(promises);
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            (0, globals_1.expect)(totalTime).toBeLessThan(5000); // Should handle extreme load in 5 seconds
            (0, globals_1.expect)(results).toHaveLength(extremeLoad);
            // Verify no null/undefined results
            results.forEach(result => {
                (0, globals_1.expect)(result).toBeDefined();
            });
            console.log(`Extreme load test: ${totalTime}ms for ${extremeLoad} operations`);
        });
        (0, globals_1.it)('should maintain data integrity under concurrent modifications', async () => {
            const concurrentModifications = 25;
            const modificationPromises = Array.from({ length: concurrentModifications }, async (_, i) => {
                // Mix different types of modifications
                if (i % 3 === 0) {
                    return configurationManager.updateConfigurationSection('features', {
                        monitoring: {
                            ...configurationManager.getMonitoringConfig(),
                            healthMetrics: {
                                ...configurationManager.getMonitoringConfig().healthMetrics,
                                collectionInterval: 30000 + i,
                            },
                        },
                    }, `stress-user-${i}`, `Stress test ${i}`);
                }
                else if (i % 3 === 1) {
                    // Health data recording
                    healthMonitor.recordResponseTime(i * 10);
                    healthMonitor.recordRequest();
                    return Promise.resolve();
                }
                else {
                    // Circuit breaker operations
                    const mockOp = globals_1.jest.fn().mockResolvedValue(`result-${i}`);
                    return gracefulDegradation.executeWithCircuitBreaker(mockOp, 'gemini');
                }
            });
            await Promise.all(modificationPromises);
            // Verify system is still consistent
            const config = configurationManager.getConfiguration();
            const metrics = await healthMonitor.getCurrentMetrics();
            const status = gracefulDegradation.getStatus();
            (0, globals_1.expect)(config).toBeDefined();
            (0, globals_1.expect)(metrics).toBeDefined();
            (0, globals_1.expect)(status).toBeDefined();
            console.log('Concurrent modifications completed successfully');
        });
    });
    (0, globals_1.describe)('Performance Regression Detection', () => {
        (0, globals_1.it)('should not regress from baseline performance', async () => {
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
                const times = [];
                for (let i = 0; i < iterations; i++) {
                    const start = Date.now();
                    await test.operation();
                    const end = Date.now();
                    times.push(end - start);
                }
                const averageTime = times.reduce((a, b) => a + b) / times.length;
                const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
                (0, globals_1.expect)(averageTime).toBeLessThan(test.expectedMax);
                console.log(`${test.name}: avg=${averageTime.toFixed(2)}ms, p95=${p95Time}ms`);
            }
        });
    });
});
//# sourceMappingURL=performanceLoad.test.js.map