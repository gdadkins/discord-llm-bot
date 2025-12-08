"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const gracefulDegradation_1 = require("../../../src/services/gracefulDegradation");
const test_utils_1 = require("../../test-utils");
(0, globals_1.describe)('GracefulDegradation', () => {
    let gracefulDegradation;
    let testEnv;
    let mockTimers;
    (0, globals_1.beforeEach)(() => {
        testEnv = (0, test_utils_1.createTestEnvironment)();
        mockTimers = new test_utils_1.MockTimers();
        gracefulDegradation = new gracefulDegradation_1.GracefulDegradation();
        // Reset environment variables
        delete process.env.DEGRADATION_MAX_FAILURES;
        delete process.env.DEGRADATION_RESET_TIMEOUT_MS;
        delete process.env.DEGRADATION_MAX_QUEUE_SIZE;
    });
    (0, globals_1.afterEach)(() => {
        testEnv.cleanup();
        mockTimers.clearAll();
    });
    (0, globals_1.describe)('initialization', () => {
        (0, globals_1.it)('should initialize with default configuration', async () => {
            await (0, globals_1.expect)(gracefulDegradation.initialize()).resolves.not.toThrow();
            const status = gracefulDegradation.getStatus();
            (0, globals_1.expect)(status.overall).toBe('healthy');
            (0, globals_1.expect)(status.circuits.gemini.state).toBe('closed');
            (0, globals_1.expect)(status.circuits.discord.state).toBe('closed');
            (0, globals_1.expect)(status.queue.size).toBe(0);
        });
        (0, globals_1.it)('should use environment variables for configuration', async () => {
            process.env.DEGRADATION_MAX_FAILURES = '3';
            process.env.DEGRADATION_RESET_TIMEOUT_MS = '30000';
            process.env.DEGRADATION_MAX_QUEUE_SIZE = '50';
            const degradation = new gracefulDegradation_1.GracefulDegradation();
            await degradation.initialize();
            // Test configuration indirectly through behavior
            const status = degradation.getStatus();
            (0, globals_1.expect)(status.overall).toBe('healthy');
            await degradation.shutdown();
        });
        (0, globals_1.it)('should start queue processing and recovery monitoring', async () => {
            await gracefulDegradation.initialize();
            // Verify timers are running (indirectly)
            (0, globals_1.expect)(gracefulDegradation.queueProcessingTimer).toBeTruthy();
            (0, globals_1.expect)(gracefulDegradation.recoveryTimer).toBeTruthy();
            await gracefulDegradation.shutdown();
        });
    });
    (0, globals_1.describe)('circuit breaker functionality', () => {
        (0, globals_1.beforeEach)(async () => {
            await gracefulDegradation.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await gracefulDegradation.shutdown();
        });
        (0, globals_1.it)('should execute operations successfully when circuit is closed', async () => {
            const mockOperation = globals_1.jest.fn().mockResolvedValue('success');
            const result = await gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini');
            (0, globals_1.expect)(result).toBe('success');
            (0, globals_1.expect)(mockOperation).toHaveBeenCalled();
            const status = gracefulDegradation.getStatus();
            (0, globals_1.expect)(status.circuits.gemini.state).toBe('closed');
        });
        (0, globals_1.it)('should record failures and open circuit after threshold', async () => {
            const mockOperation = globals_1.jest.fn().mockRejectedValue(new Error('Operation failed'));
            // Execute enough failures to trigger circuit breaker
            for (let i = 0; i < 5; i++) {
                try {
                    await gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini');
                }
                catch (error) {
                    // Expected to fail
                }
            }
            const status = gracefulDegradation.getStatus();
            (0, globals_1.expect)(status.circuits.gemini.state).toBe('open');
            (0, globals_1.expect)(status.circuits.gemini.failures).toBe(5);
        });
        (0, globals_1.it)('should reject operations immediately when circuit is open', async () => {
            const mockOperation = globals_1.jest.fn();
            // First, trigger circuit to open
            const failingOperation = globals_1.jest.fn().mockRejectedValue(new Error('Service down'));
            for (let i = 0; i < 5; i++) {
                try {
                    await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
                }
                catch (error) {
                    // Expected to fail
                }
            }
            // Now try to execute with open circuit
            await (0, globals_1.expect)(gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini')).rejects.toThrow('Circuit breaker is OPEN for gemini');
            (0, globals_1.expect)(mockOperation).not.toHaveBeenCalled();
        });
        (0, globals_1.it)('should transition to half-open after timeout', async () => {
            // Mock Date.now to control time
            const originalNow = Date.now;
            let mockTime = Date.now();
            Date.now = globals_1.jest.fn(() => mockTime);
            const failingOperation = globals_1.jest.fn().mockRejectedValue(new Error('Service down'));
            // Trigger circuit to open
            for (let i = 0; i < 5; i++) {
                try {
                    await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
                }
                catch (error) {
                    // Expected to fail
                }
            }
            (0, globals_1.expect)(gracefulDegradation.getStatus().circuits.gemini.state).toBe('open');
            // Advance time past reset timeout (default 60 seconds)
            mockTime += 70000;
            const successOperation = globals_1.jest.fn().mockResolvedValue('success');
            const result = await gracefulDegradation.executeWithCircuitBreaker(successOperation, 'gemini');
            (0, globals_1.expect)(result).toBe('success');
            (0, globals_1.expect)(gracefulDegradation.getStatus().circuits.gemini.state).toBe('half-open');
            // Restore Date.now
            Date.now = originalNow;
        });
        (0, globals_1.it)('should close circuit after successful operations in half-open state', async () => {
            // First open the circuit
            const failingOperation = globals_1.jest.fn().mockRejectedValue(new Error('Service down'));
            for (let i = 0; i < 5; i++) {
                try {
                    await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
                }
                catch (error) {
                    // Expected to fail
                }
            }
            // Manually transition to half-open for testing
            gracefulDegradation.serviceStatus.gemini.state = 'half-open';
            gracefulDegradation.serviceStatus.gemini.consecutiveSuccesses = 0;
            const successOperation = globals_1.jest.fn().mockResolvedValue('success');
            // Execute enough successful operations to close circuit (default 3)
            for (let i = 0; i < 3; i++) {
                await gracefulDegradation.executeWithCircuitBreaker(successOperation, 'gemini');
            }
            (0, globals_1.expect)(gracefulDegradation.getStatus().circuits.gemini.state).toBe('closed');
        });
    });
    (0, globals_1.describe)('degradation assessment', () => {
        (0, globals_1.beforeEach)(async () => {
            await gracefulDegradation.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await gracefulDegradation.shutdown();
        });
        (0, globals_1.it)('should not degrade when all systems are healthy', async () => {
            const status = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(status.shouldDegrade).toBe(false);
            (0, globals_1.expect)(status.reason).toBe('All systems operational');
            (0, globals_1.expect)(status.severity).toBe('low');
        });
        (0, globals_1.it)('should degrade when Gemini circuit is open', async () => {
            // Manually open Gemini circuit for testing
            gracefulDegradation.serviceStatus.gemini.state = 'open';
            const status = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(status.shouldDegrade).toBe(true);
            (0, globals_1.expect)(status.reason).toBe('Gemini API circuit breaker is open');
            (0, globals_1.expect)(status.severity).toBe('high');
        });
        (0, globals_1.it)('should degrade when Discord circuit is open', async () => {
            // Manually open Discord circuit for testing
            gracefulDegradation.serviceStatus.discord.state = 'open';
            const status = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(status.shouldDegrade).toBe(true);
            (0, globals_1.expect)(status.reason).toBe('Discord API circuit breaker is open');
            (0, globals_1.expect)(status.severity).toBe('medium');
        });
        (0, globals_1.it)('should assess health-based degradation when health monitor is available', async () => {
            const mockHealthMonitor = {
                getCurrentMetrics: globals_1.jest.fn().mockResolvedValue({
                    ...(0, test_utils_1.createMockMetrics)(),
                    memoryUsage: { rss: 500 * 1024 * 1024 }, // 500MB (over default 400MB threshold)
                }),
            };
            gracefulDegradation.setHealthMonitor(mockHealthMonitor);
            const status = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(mockHealthMonitor.getCurrentMetrics).toHaveBeenCalled();
            (0, globals_1.expect)(status.shouldDegrade).toBe(true);
            (0, globals_1.expect)(status.reason).toContain('High memory usage');
            (0, globals_1.expect)(status.severity).toBe('high');
        });
        (0, globals_1.it)('should degrade based on queue pressure', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Fill queue to 80% capacity (default max is 100)
            for (let i = 0; i < 85; i++) {
                await gracefulDegradation.queueMessage(`user-${i}`, 'test message', mockRespond, 'test-server', 'low');
            }
            const status = await gracefulDegradation.shouldDegrade();
            (0, globals_1.expect)(status.shouldDegrade).toBe(true);
            (0, globals_1.expect)(status.reason).toContain('Message queue pressure');
            (0, globals_1.expect)(status.severity).toBe('medium');
        });
    });
    (0, globals_1.describe)('message queueing', () => {
        (0, globals_1.beforeEach)(async () => {
            await gracefulDegradation.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await gracefulDegradation.shutdown();
        });
        (0, globals_1.it)('should queue messages successfully', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            await gracefulDegradation.queueMessage('test-user', 'test message', mockRespond, 'test-server', 'medium');
            const status = gracefulDegradation.getStatus();
            (0, globals_1.expect)(status.queue.size).toBe(1);
            (0, globals_1.expect)(mockRespond).toHaveBeenCalledWith(globals_1.expect.stringContaining('Your message has been queued'));
        });
        (0, globals_1.it)('should prioritize high priority messages', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Add low priority message first
            await gracefulDegradation.queueMessage('user-1', 'low priority', mockRespond, 'test-server', 'low');
            // Add high priority message second
            await gracefulDegradation.queueMessage('user-2', 'high priority', mockRespond, 'test-server', 'high');
            // Verify queue ordering by checking internal queue
            const queue = gracefulDegradation.messageQueue;
            (0, globals_1.expect)(queue[0].priority).toBe('high');
            (0, globals_1.expect)(queue[1].priority).toBe('low');
        });
        (0, globals_1.it)('should reject messages when queue is full', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Fill queue to capacity (default 100)
            for (let i = 0; i < 100; i++) {
                await gracefulDegradation.queueMessage(`user-${i}`, 'test message', globals_1.jest.fn().mockResolvedValue(undefined), 'test-server', 'medium');
            }
            // Try to add one more
            await gracefulDegradation.queueMessage('overflow-user', 'overflow message', mockRespond, 'test-server', 'medium');
            (0, globals_1.expect)(mockRespond).toHaveBeenCalledWith(globals_1.expect.stringContaining('System is currently overloaded'));
        });
        (0, globals_1.it)('should remove old low priority messages when queue is full', async () => {
            const firstRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Fill queue with mostly low priority messages
            for (let i = 0; i < 100; i++) {
                const respond = i === 0 ? firstRespond : globals_1.jest.fn().mockResolvedValue(undefined);
                await gracefulDegradation.queueMessage(`user-${i}`, 'test message', respond, 'test-server', 'low');
            }
            // Add a high priority message that should displace a low priority one
            await gracefulDegradation.queueMessage('priority-user', 'important message', mockRespond, 'test-server', 'high');
            // The first low priority message should have been dropped
            (0, globals_1.expect)(firstRespond).toHaveBeenCalledWith(globals_1.expect.stringContaining('system is overloaded and your message was dropped'));
            // The new high priority message should be queued successfully
            (0, globals_1.expect)(mockRespond).toHaveBeenCalledWith(globals_1.expect.stringContaining('Your message has been queued'));
        });
        (0, globals_1.it)('should estimate wait times for queued messages', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Add a few messages to create a queue
            for (let i = 0; i < 3; i++) {
                await gracefulDegradation.queueMessage(`user-${i}`, 'test message', globals_1.jest.fn().mockResolvedValue(undefined), 'test-server', 'medium');
            }
            await gracefulDegradation.queueMessage('test-user', 'test message', mockRespond, 'test-server', 'low');
            // Should provide wait time estimate in the response
            (0, globals_1.expect)(mockRespond).toHaveBeenCalledWith(globals_1.expect.stringMatching(/Estimated processing time: \d+/));
        });
    });
    (0, globals_1.describe)('fallback response generation', () => {
        (0, globals_1.beforeEach)(async () => {
            await gracefulDegradation.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await gracefulDegradation.shutdown();
        });
        (0, globals_1.it)('should generate generic fallback responses', async () => {
            const response = await gracefulDegradation.generateFallbackResponse('test prompt', 'test-user', 'test-server');
            (0, globals_1.expect)(response).toContain('experiencing some technical difficulties');
        });
        (0, globals_1.it)('should generate maintenance responses for high severity degradation', async () => {
            // Force high severity degradation
            gracefulDegradation.serviceStatus.gemini.state = 'open';
            gracefulDegradation.serviceStatus.discord.state = 'open';
            const response = await gracefulDegradation.generateFallbackResponse('test prompt', 'test-user', 'test-server');
            (0, globals_1.expect)(response).toMatch(/🔧|⚙️|🛠️|📋|🔄/);
        });
        (0, globals_1.it)('should include context about current issues', async () => {
            // Force degradation with specific reason
            gracefulDegradation.serviceStatus.gemini.state = 'open';
            const response = await gracefulDegradation.generateFallbackResponse('test prompt', 'test-user', 'test-server');
            (0, globals_1.expect)(response).toContain('Current issue: Gemini API circuit breaker is open');
        });
        (0, globals_1.it)('should include queue information when applicable', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Add some messages to the queue
            for (let i = 0; i < 5; i++) {
                await gracefulDegradation.queueMessage(`user-${i}`, 'test message', mockRespond, 'test-server', 'medium');
            }
            const response = await gracefulDegradation.generateFallbackResponse('test prompt', 'test-user', 'test-server');
            (0, globals_1.expect)(response).toContain('Messages in queue: 5');
        });
    });
    (0, globals_1.describe)('recovery mechanisms', () => {
        (0, globals_1.beforeEach)(async () => {
            await gracefulDegradation.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await gracefulDegradation.shutdown();
        });
        (0, globals_1.it)('should attempt manual recovery for specific service', async () => {
            await (0, globals_1.expect)(gracefulDegradation.triggerRecovery('gemini')).resolves.not.toThrow();
            const recovery = gracefulDegradation.getStatus().recovery;
            (0, globals_1.expect)(recovery.gemini?.attempts).toBeGreaterThan(0);
        });
        (0, globals_1.it)('should attempt recovery for all services when none specified', async () => {
            await (0, globals_1.expect)(gracefulDegradation.triggerRecovery()).resolves.not.toThrow();
            const recovery = gracefulDegradation.getStatus().recovery;
            (0, globals_1.expect)(recovery.gemini?.attempts).toBeGreaterThan(0);
            (0, globals_1.expect)(recovery.discord?.attempts).toBeGreaterThan(0);
        });
        (0, globals_1.it)('should track recovery metrics', async () => {
            // Attempt recovery multiple times
            await gracefulDegradation.triggerRecovery('gemini');
            await gracefulDegradation.triggerRecovery('gemini');
            const recovery = gracefulDegradation.getStatus().recovery;
            (0, globals_1.expect)(recovery.gemini?.attempts).toBe(2);
            (0, globals_1.expect)(recovery.gemini?.lastAttempt).toBeGreaterThan(0);
        });
        (0, globals_1.it)('should automatically attempt recovery for open circuits', async () => {
            // Open a circuit
            gracefulDegradation.serviceStatus.gemini.state = 'open';
            // Manually trigger recovery monitoring
            await gracefulDegradation.performRecoveryAttempts();
            const recovery = gracefulDegradation.getStatus().recovery;
            (0, globals_1.expect)(recovery.gemini?.attempts).toBeGreaterThan(0);
        });
    });
    (0, globals_1.describe)('queue processing', () => {
        (0, globals_1.beforeEach)(async () => {
            await gracefulDegradation.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await gracefulDegradation.shutdown();
        });
        (0, globals_1.it)('should process queued messages when system recovers', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Add messages to queue
            await gracefulDegradation.queueMessage('test-user', 'test message', mockRespond, 'test-server', 'medium');
            // Manually trigger queue processing
            await gracefulDegradation.processQueue();
            // Message should be processed (mock implementation sends success response)
            (0, globals_1.expect)(mockRespond).toHaveBeenCalledWith(globals_1.expect.stringContaining('Your queued message has been processed'));
        });
        (0, globals_1.it)('should skip processing when system is still degraded', async () => {
            // Force high severity degradation
            gracefulDegradation.serviceStatus.gemini.state = 'open';
            gracefulDegradation.serviceStatus.discord.state = 'open';
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            await gracefulDegradation.queueMessage('test-user', 'test message', mockRespond, 'test-server', 'medium');
            // Manually trigger queue processing
            await gracefulDegradation.processQueue();
            // Queue should remain unprocessed
            (0, globals_1.expect)(gracefulDegradation.getStatus().queue.size).toBe(1);
        });
        (0, globals_1.it)('should handle expired messages in queue', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Add message to queue
            await gracefulDegradation.queueMessage('test-user', 'test message', mockRespond, 'test-server', 'medium');
            // Manually expire the message by modifying its timestamp
            const queue = gracefulDegradation.messageQueue;
            queue[0].timestamp = Date.now() - 400000; // 400 seconds ago (over 5 min default)
            // Process queue
            await gracefulDegradation.processQueue();
            (0, globals_1.expect)(mockRespond).toHaveBeenCalledWith(globals_1.expect.stringContaining('your message expired while in the queue'));
        });
        (0, globals_1.it)('should retry failed messages up to max retries', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            await gracefulDegradation.queueMessage('test-user', 'test message', mockRespond, 'test-server', 'medium');
            // Mock the processing to fail initially
            const queue = gracefulDegradation.messageQueue;
            const originalRespond = queue[0].respond;
            queue[0].respond = globals_1.jest.fn().mockRejectedValue(new Error('Processing failed'));
            // Process queue multiple times to trigger retries
            for (let i = 0; i < 4; i++) {
                await gracefulDegradation.processQueue();
            }
            // After max retries (3), should send failure message
            (0, globals_1.expect)(originalRespond).toHaveBeenCalledWith(globals_1.expect.stringContaining("couldn't process your message after multiple attempts"));
        });
    });
    (0, globals_1.describe)('status reporting', () => {
        (0, globals_1.beforeEach)(async () => {
            await gracefulDegradation.initialize();
        });
        (0, globals_1.afterEach)(async () => {
            await gracefulDegradation.shutdown();
        });
        (0, globals_1.it)('should provide comprehensive status information', () => {
            const status = gracefulDegradation.getStatus();
            (0, globals_1.expect)(status).toMatchObject({
                overall: globals_1.expect.stringMatching(/healthy|degraded|critical/),
                circuits: {
                    gemini: {
                        state: globals_1.expect.stringMatching(/closed|open|half-open/),
                        failures: globals_1.expect.any(Number),
                        lastFailure: globals_1.expect.any(Number),
                        consecutiveSuccesses: globals_1.expect.any(Number),
                    },
                    discord: {
                        state: globals_1.expect.stringMatching(/closed|open|half-open/),
                        failures: globals_1.expect.any(Number),
                        lastFailure: globals_1.expect.any(Number),
                        consecutiveSuccesses: globals_1.expect.any(Number),
                    },
                },
                queue: {
                    size: globals_1.expect.any(Number),
                    oldestMessage: null, // Empty queue initially
                },
                recovery: globals_1.expect.any(Object),
            });
        });
        (0, globals_1.it)('should calculate oldest message age correctly', async () => {
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            await gracefulDegradation.queueMessage('test-user', 'test message', mockRespond, 'test-server', 'medium');
            const status = gracefulDegradation.getStatus();
            (0, globals_1.expect)(status.queue.size).toBe(1);
            (0, globals_1.expect)(status.queue.oldestMessage).toBeGreaterThan(0);
        });
        (0, globals_1.it)('should update overall status based on circuit states', () => {
            // Initially healthy
            (0, globals_1.expect)(gracefulDegradation.getStatus().overall).toBe('healthy');
            // Open one circuit - should become degraded
            gracefulDegradation.serviceStatus.gemini.state = 'open';
            gracefulDegradation.updateOverallStatus();
            (0, globals_1.expect)(gracefulDegradation.getStatus().overall).toBe('degraded');
            // Open both circuits - should become critical
            gracefulDegradation.serviceStatus.discord.state = 'open';
            gracefulDegradation.updateOverallStatus();
            (0, globals_1.expect)(gracefulDegradation.getStatus().overall).toBe('critical');
        });
    });
    (0, globals_1.describe)('shutdown and cleanup', () => {
        (0, globals_1.it)('should stop timers and drain queue on shutdown', async () => {
            await gracefulDegradation.initialize();
            const mockRespond = globals_1.jest.fn().mockResolvedValue(undefined);
            // Add some messages to queue
            await gracefulDegradation.queueMessage('test-user', 'test message', mockRespond, 'test-server', 'medium');
            await gracefulDegradation.shutdown();
            // Queue should be drained with shutdown message
            (0, globals_1.expect)(mockRespond).toHaveBeenCalledWith(globals_1.expect.stringContaining('System is shutting down'));
            // Timers should be cleared
            (0, globals_1.expect)(gracefulDegradation.queueProcessingTimer).toBeNull();
            (0, globals_1.expect)(gracefulDegradation.recoveryTimer).toBeNull();
        });
        (0, globals_1.it)('should handle shutdown gracefully when not initialized', async () => {
            await (0, globals_1.expect)(gracefulDegradation.shutdown()).resolves.not.toThrow();
        });
    });
    (0, globals_1.describe)('configuration validation', () => {
        (0, globals_1.it)('should use environment variables for thresholds', () => {
            process.env.DEGRADATION_MEMORY_THRESHOLD_MB = '256';
            process.env.DEGRADATION_ERROR_RATE_THRESHOLD = '2.0';
            const degradation = new gracefulDegradation_1.GracefulDegradation();
            // Test configuration indirectly through degradation assessment
            const config = degradation.config;
            (0, globals_1.expect)(config.memoryThresholdMB).toBe(256);
            (0, globals_1.expect)(config.errorRateThreshold).toBe(2.0);
            // Cleanup
            delete process.env.DEGRADATION_MEMORY_THRESHOLD_MB;
            delete process.env.DEGRADATION_ERROR_RATE_THRESHOLD;
        });
        (0, globals_1.it)('should validate health metrics against configured thresholds', async () => {
            await gracefulDegradation.initialize();
            const assessHealth = gracefulDegradation.assessHealthBasedDegradation.bind(gracefulDegradation);
            // Test memory threshold
            let metrics = (0, test_utils_1.createMockMetrics)();
            metrics.memoryUsage.rss = 500 * 1024 * 1024; // 500MB (over default 400MB)
            let assessment = assessHealth(metrics);
            (0, globals_1.expect)(assessment.shouldDegrade).toBe(true);
            (0, globals_1.expect)(assessment.reason).toContain('High memory usage');
            // Test error rate threshold
            metrics = (0, test_utils_1.createMockMetrics)();
            metrics.errorRate = 15; // Over default 10%
            assessment = assessHealth(metrics);
            (0, globals_1.expect)(assessment.shouldDegrade).toBe(true);
            (0, globals_1.expect)(assessment.reason).toContain('High error rate');
            // Test response time threshold
            metrics = (0, test_utils_1.createMockMetrics)();
            metrics.responseTime.p95 = 15000; // Over default 10000ms
            assessment = assessHealth(metrics);
            (0, globals_1.expect)(assessment.shouldDegrade).toBe(true);
            (0, globals_1.expect)(assessment.reason).toContain('Slow response times');
            // Test API health
            metrics = (0, test_utils_1.createMockMetrics)();
            metrics.apiHealth.gemini = false;
            assessment = assessHealth(metrics);
            (0, globals_1.expect)(assessment.shouldDegrade).toBe(true);
            (0, globals_1.expect)(assessment.reason).toContain('Unhealthy services');
        });
    });
});
//# sourceMappingURL=gracefulDegradation.test.js.map