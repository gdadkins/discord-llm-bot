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
(0, globals_1.describe)('Service Integration Tests', () => {
    let testEnv;
    let healthMonitor;
    let gracefulDegradation;
    let configurationManager;
    (0, globals_1.beforeEach)(async () => {
        testEnv = (0, test_utils_1.createTestEnvironment)();
        healthMonitor = new healthMonitor_1.HealthMonitor(path.join(global.TEST_HEALTH_DIR, 'integration-metrics.json'));
        gracefulDegradation = new gracefulDegradation_1.GracefulDegradation();
        configurationManager = new configurationManager_1.ConfigurationManager(path.join(global.TEST_CONFIG_DIR, 'integration-config.json'), path.join(global.TEST_CONFIG_DIR, 'integration-versions'), path.join(global.TEST_CONFIG_DIR, 'integration-audit.log'));
        // Initialize services
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
    (0, globals_1.describe)('HealthMonitor and GracefulDegradation Integration', () => {
        (0, globals_1.it)('should integrate health monitor with graceful degradation', async () => {
            // Connect health monitor to graceful degradation
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Verify integration works
            const status = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(status.shouldDegrade).toBe(false);
            (0, globals_1.expect)(status.reason).toBe('All systems operational');
        });
        (0, globals_1.it)('should trigger degradation based on health metrics', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Mock high memory usage
            const mockMetrics = (0, test_utils_1.createMockMetrics)();
            mockMetrics.memoryUsage.rss = 600 * 1024 * 1024; // 600MB (over 400MB default threshold)
            const mockHealthMonitor = {
                getCurrentMetrics: globals_1.jest.fn().mockResolvedValue(mockMetrics),
            };
            gracefulDegradation.setHealthMonitor(mockHealthMonitor);
            const status = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(status.shouldDegrade).toBe(true);
            (0, globals_1.expect)(status.reason).toContain('High memory usage');
            (0, globals_1.expect)(status.severity).toBe('high');
        });
        (0, globals_1.it)('should handle health monitor unavailability gracefully', async () => {
            // Don't set health monitor
            const status = await gracefulDegradation.shouldDegrade();
            // Should still work without health monitor
            (0, globals_1.expect)(status).toBeDefined();
            (0, globals_1.expect)(typeof status.shouldDegrade).toBe('boolean');
        });
        (0, globals_1.it)('should coordinate self-healing between services', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Mock a service that can be cleared
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
            // Trigger memory healing
            await healthMonitor.healMemoryIssues();
            (0, globals_1.expect)(mockGeminiService.clearCache).toHaveBeenCalled();
        });
    });
    (0, globals_1.describe)('ConfigurationManager Integration', () => {
        (0, globals_1.it)('should provide configuration to other services', async () => {
            const config = configurationManager.getConfiguration();
            // Verify configuration structure is compatible with services
            (0, globals_1.expect)(config.features.monitoring.healthMetrics.enabled).toBeDefined();
            (0, globals_1.expect)(config.features.monitoring.gracefulDegradation.enabled).toBeDefined();
            (0, globals_1.expect)(config.features.monitoring.alerts.enabled).toBeDefined();
        });
        (0, globals_1.it)('should update service configurations dynamically', async () => {
            const originalConfig = configurationManager.getMonitoringConfig();
            // Update monitoring configuration
            await configurationManager.updateConfigurationSection('features', {
                monitoring: {
                    ...originalConfig,
                    healthMetrics: {
                        ...originalConfig.healthMetrics,
                        collectionInterval: 60000, // Change from 30s to 60s
                    },
                },
            }, 'test-integration', 'Update collection interval');
            const updatedConfig = configurationManager.getMonitoringConfig();
            (0, globals_1.expect)(updatedConfig.healthMetrics.collectionInterval).toBe(60000);
        });
        (0, globals_1.it)('should validate cross-service configuration consistency', async () => {
            const config = (0, test_utils_1.createMockConfiguration)();
            // Create inconsistent configuration
            config.features.monitoring.gracefulDegradation.circuitBreaker.failureThreshold = 10;
            // But set environment to expect lower threshold
            process.env.DEGRADATION_MAX_FAILURES = '3';
            const validation = configurationManager.validateConfiguration(config);
            // Configuration should still be valid as environment overrides aren't validated here
            (0, globals_1.expect)(validation.valid).toBe(true);
            // Cleanup
            delete process.env.DEGRADATION_MAX_FAILURES;
        });
        (0, globals_1.it)('should handle configuration reloads affecting multiple services', async () => {
            const changeHandler = globals_1.jest.fn();
            configurationManager.on('config:changed', changeHandler);
            // Update configuration that affects multiple services
            await configurationManager.updateConfiguration({
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
            }, 'test-integration', 'Disable alerts');
            (0, globals_1.expect)(changeHandler).toHaveBeenCalled();
            const changes = changeHandler.mock.calls[0][0];
            (0, globals_1.expect)(changes).toEqual(globals_1.expect.arrayContaining([
                globals_1.expect.objectContaining({
                    path: globals_1.expect.arrayContaining(['features', 'monitoring', 'alerts', 'enabled']),
                    newValue: false,
                }),
            ]));
        });
    });
    (0, globals_1.describe)('Error Propagation and Handling', () => {
        (0, globals_1.it)('should handle cascading failures gracefully', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Simulate health monitor failure
            const mockHealthMonitor = {
                getCurrentMetrics: globals_1.jest.fn().mockRejectedValue(new Error('Health monitor failed')),
            };
            gracefulDegradation.setHealthMonitor(mockHealthMonitor);
            // Graceful degradation should still work
            const status = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(status).toBeDefined();
            (0, globals_1.expect)(status.shouldDegrade).toBe(false); // Falls back to circuit breaker only
        });
        (0, globals_1.it)('should isolate service failures', async () => {
            // If one service fails, others should continue working
            const mockFailingService = {
                getCurrentMetrics: globals_1.jest.fn().mockRejectedValue(new Error('Service failed')),
            };
            gracefulDegradation.setHealthMonitor(mockFailingService);
            // Configuration manager should still work
            const config = configurationManager.getConfiguration();
            (0, globals_1.expect)(config).toBeDefined();
            // Health monitor (different instance) should still work
            const metrics = await healthMonitor.getCurrentMetrics();
            (0, globals_1.expect)(metrics).toBeDefined();
        });
        (0, globals_1.it)('should provide fallback responses when all services degrade', async () => {
            // Simulate all services in degraded state
            gracefulDegradation.serviceStatus.gemini.state = 'open';
            gracefulDegradation.serviceStatus.discord.state = 'open';
            const fallback = await gracefulDegradation.generateFallbackResponse('test prompt', 'test-user', 'test-server');
            (0, globals_1.expect)(fallback).toBeDefined();
            (0, globals_1.expect)(fallback).toMatch(/maintenance|technical difficulties/i);
        });
    });
    (0, globals_1.describe)('Performance Impact of Integration', () => {
        (0, globals_1.it)('should not significantly impact performance when services are integrated', async () => {
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
            (0, globals_1.expect)(duration).toBeLessThan(1000);
        });
        (0, globals_1.it)('should handle concurrent operations safely', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Execute multiple concurrent operations
            const promises = Array.from({ length: 5 }, async (_, i) => {
                // Mix of different operations
                if (i % 2 === 0) {
                    return gracefulDegradation.shouldDegrade();
                }
                else {
                    return healthMonitor.getCurrentMetrics();
                }
            });
            const results = await Promise.all(promises);
            // All operations should complete successfully
            (0, globals_1.expect)(results).toHaveLength(5);
            results.forEach(result => {
                (0, globals_1.expect)(result).toBeDefined();
            });
        });
        (0, globals_1.it)('should maintain thread safety under load', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Simulate high load with rapid configuration changes and health checks
            const configPromises = Array.from({ length: 3 }, async (_, i) => {
                return configurationManager.updateConfigurationSection('features', {
                    monitoring: {
                        ...configurationManager.getMonitoringConfig(),
                        healthMetrics: {
                            ...configurationManager.getMonitoringConfig().healthMetrics,
                            collectionInterval: 30000 + (i * 1000),
                        },
                    },
                }, `user-${i}`, `Update ${i}`);
            });
            const healthPromises = Array.from({ length: 5 }, () => {
                return healthMonitor.getCurrentMetrics();
            });
            const degradationPromises = Array.from({ length: 5 }, () => {
                return gracefulDegradation.shouldDegrade();
            });
            // All operations should complete without race conditions
            await (0, globals_1.expect)(Promise.all([
                ...configPromises,
                ...healthPromises,
                ...degradationPromises,
            ])).resolves.not.toThrow();
        });
    });
    (0, globals_1.describe)('Data Consistency and State Management', () => {
        (0, globals_1.it)('should maintain consistent state across service interactions', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Record some health data
            healthMonitor.recordResponseTime(500);
            healthMonitor.recordRequest();
            healthMonitor.recordError();
            const metrics = await healthMonitor.getCurrentMetrics();
            const degradationStatus = await gracefulDegradation.shouldDegrade();
            // State should be consistent
            (0, globals_1.expect)(metrics.errorRate).toBeGreaterThan(0);
            (0, globals_1.expect)(degradationStatus.shouldDegrade).toBe(false); // Default thresholds not exceeded
        });
        (0, globals_1.it)('should handle state transitions correctly', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Create mock operation that fails
            const failingOperation = globals_1.jest.fn().mockRejectedValue(new Error('Operation failed'));
            // Trigger circuit breaker
            for (let i = 0; i < 5; i++) {
                try {
                    await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
                }
                catch (error) {
                    // Expected to fail
                }
            }
            // Check degradation status
            let status = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(status.shouldDegrade).toBe(true);
            (0, globals_1.expect)(status.reason).toContain('Gemini API circuit breaker is open');
            // Verify health monitor reflects the degraded state
            const circuitStatus = gracefulDegradation.getStatus();
            (0, globals_1.expect)(circuitStatus.circuits.gemini.state).toBe('open');
        });
        (0, globals_1.it)('should synchronize configuration changes across services', async () => {
            // Update alert configuration
            await configurationManager.updateConfigurationSection('features', {
                monitoring: {
                    ...configurationManager.getMonitoringConfig(),
                    alerts: {
                        ...configurationManager.getMonitoringConfig().alerts,
                        memoryThreshold: 1024, // Increase threshold
                    },
                },
            }, 'test-integration', 'Increase memory threshold');
            // Health monitor should be able to use new configuration if it subscribes to changes
            const newConfig = configurationManager.getMonitoringConfig();
            (0, globals_1.expect)(newConfig.alerts.memoryThreshold).toBe(1024);
        });
    });
    (0, globals_1.describe)('Monitoring and Observability Integration', () => {
        (0, globals_1.it)('should provide comprehensive system status', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Get status from all services
            const healthMetrics = await healthMonitor.getCurrentMetrics();
            const degradationStatus = gracefulDegradation.getStatus();
            const configHealth = configurationManager.getHealthStatus();
            // Verify all provide useful information
            (0, globals_1.expect)(healthMetrics).toHaveProperty('memoryUsage');
            (0, globals_1.expect)(healthMetrics).toHaveProperty('uptime');
            (0, globals_1.expect)(healthMetrics).toHaveProperty('errorRate');
            (0, globals_1.expect)(degradationStatus).toHaveProperty('overall');
            (0, globals_1.expect)(degradationStatus).toHaveProperty('circuits');
            (0, globals_1.expect)(degradationStatus).toHaveProperty('queue');
            (0, globals_1.expect)(configHealth).toHaveProperty('healthy');
            (0, globals_1.expect)(configHealth).toHaveProperty('errors');
        });
        (0, globals_1.it)('should enable centralized monitoring', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Mock external monitoring service
            const monitoringData = {
                health: await healthMonitor.getCurrentMetrics(),
                degradation: gracefulDegradation.getStatus(),
                configuration: configurationManager.getHealthStatus(),
                timestamp: Date.now(),
            };
            // Verify monitoring data structure
            (0, globals_1.expect)(monitoringData.health).toBeDefined();
            (0, globals_1.expect)(monitoringData.degradation).toBeDefined();
            (0, globals_1.expect)(monitoringData.configuration).toBeDefined();
            (0, globals_1.expect)(monitoringData.timestamp).toBeGreaterThan(0);
            // Should be serializable for external monitoring
            (0, globals_1.expect)(() => JSON.stringify(monitoringData)).not.toThrow();
        });
        (0, globals_1.it)('should support historical analysis', async () => {
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
            (0, globals_1.expect)(metrics.responseTime.p50).toBeGreaterThan(0);
            (0, globals_1.expect)(historical).toBeDefined();
        });
    });
    (0, globals_1.describe)('Recovery and Resilience', () => {
        (0, globals_1.it)('should coordinate recovery across services', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Trigger degradation
            gracefulDegradation.serviceStatus.gemini.state = 'open';
            // Attempt recovery
            await gracefulDegradation.triggerRecovery('gemini');
            // Verify recovery was attempted
            const status = gracefulDegradation.getStatus();
            (0, globals_1.expect)(status.recovery.gemini?.attempts).toBeGreaterThan(0);
        });
        (0, globals_1.it)('should maintain service availability during recovery', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Even during recovery attempts, services should remain available
            const configPromise = configurationManager.getConfiguration();
            const healthPromise = healthMonitor.getCurrentMetrics();
            const recoveryPromise = gracefulDegradation.triggerRecovery();
            const [config, health] = await Promise.all([
                configPromise,
                healthPromise,
                recoveryPromise.catch(() => { }), // Recovery might fail, that's ok
            ]);
            (0, globals_1.expect)(config).toBeDefined();
            (0, globals_1.expect)(health).toBeDefined();
        });
        (0, globals_1.it)('should prevent cascading failures', async () => {
            gracefulDegradation.setHealthMonitor(healthMonitor);
            // Simulate failure in one component
            const mockFailingHealthMonitor = {
                getCurrentMetrics: globals_1.jest.fn().mockRejectedValue(new Error('Health monitor down')),
            };
            gracefulDegradation.setHealthMonitor(mockFailingHealthMonitor);
            // Other services should still work
            const config = configurationManager.getConfiguration();
            const degradationStatus = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(config).toBeDefined();
            (0, globals_1.expect)(degradationStatus).toBeDefined();
            (0, globals_1.expect)(degradationStatus.shouldDegrade).toBe(false); // No health data available, so no degradation
        });
    });
});
//# sourceMappingURL=serviceIntegration.test.js.map