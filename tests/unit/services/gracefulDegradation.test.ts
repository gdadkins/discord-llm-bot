import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { GracefulDegradation } from '../../../src/services/gracefulDegradation';
import { createMockMetrics, MockTimers, createTestEnvironment } from '../../test-utils';

describe('GracefulDegradation', () => {
  let gracefulDegradation: GracefulDegradation;
  let testEnv: ReturnType<typeof createTestEnvironment>;
  let mockTimers: MockTimers;

  beforeEach(() => {
    testEnv = createTestEnvironment();
    mockTimers = new MockTimers();
    gracefulDegradation = new GracefulDegradation();
    
    // Reset environment variables
    delete process.env.DEGRADATION_MAX_FAILURES;
    delete process.env.DEGRADATION_RESET_TIMEOUT_MS;
    delete process.env.DEGRADATION_MAX_QUEUE_SIZE;
  });

  afterEach(() => {
    testEnv.cleanup();
    mockTimers.clearAll();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      await expect(gracefulDegradation.initialize()).resolves.not.toThrow();
      
      const status = gracefulDegradation.getStatus();
      expect(status.overall).toBe('healthy');
      expect(status.circuits.gemini.state).toBe('closed');
      expect(status.circuits.discord.state).toBe('closed');
      expect(status.queue.size).toBe(0);
    });

    it('should use environment variables for configuration', async () => {
      process.env.DEGRADATION_MAX_FAILURES = '3';
      process.env.DEGRADATION_RESET_TIMEOUT_MS = '30000';
      process.env.DEGRADATION_MAX_QUEUE_SIZE = '50';

      const degradation = new GracefulDegradation();
      await degradation.initialize();

      // Test configuration indirectly through behavior
      const status = degradation.getStatus();
      expect(status.overall).toBe('healthy');

      await degradation.shutdown();
    });

    it('should start queue processing and recovery monitoring', async () => {
      await gracefulDegradation.initialize();
      
      // Verify timers are running (indirectly)
      expect((gracefulDegradation as any).queueProcessingTimer).toBeTruthy();
      expect((gracefulDegradation as any).recoveryTimer).toBeTruthy();

      await gracefulDegradation.shutdown();
    });
  });

  describe('circuit breaker functionality', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should execute operations successfully when circuit is closed', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini');

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
      
      const status = gracefulDegradation.getStatus();
      expect(status.circuits.gemini.state).toBe('closed');
    });

    it('should record failures and open circuit after threshold', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      // Execute enough failures to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini');
        } catch (error) {
          // Expected to fail
        }
      }

      const status = gracefulDegradation.getStatus();
      expect(status.circuits.gemini.state).toBe('open');
      expect(status.circuits.gemini.failures).toBe(5);
    });

    it('should reject operations immediately when circuit is open', async () => {
      const mockOperation = jest.fn();

      // First, trigger circuit to open
      const failingOperation = jest.fn().mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 5; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
        } catch (error) {
          // Expected to fail
        }
      }

      // Now try to execute with open circuit
      await expect(
        gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini')
      ).rejects.toThrow('Circuit breaker is OPEN for gemini');

      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should transition to half-open after timeout', async () => {
      // Mock Date.now to control time
      const originalNow = Date.now;
      let mockTime = Date.now();
      Date.now = jest.fn(() => mockTime);

      const failingOperation = jest.fn().mockRejectedValue(new Error('Service down'));

      // Trigger circuit to open
      for (let i = 0; i < 5; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
        } catch (error) {
          // Expected to fail
        }
      }

      expect(gracefulDegradation.getStatus().circuits.gemini.state).toBe('open');

      // Advance time past reset timeout (default 60 seconds)
      mockTime += 70000;

      const successOperation = jest.fn().mockResolvedValue('success');
      const result = await gracefulDegradation.executeWithCircuitBreaker(successOperation, 'gemini');

      expect(result).toBe('success');
      expect(gracefulDegradation.getStatus().circuits.gemini.state).toBe('half-open');

      // Restore Date.now
      Date.now = originalNow;
    });

    it('should close circuit after successful operations in half-open state', async () => {
      // First open the circuit
      const failingOperation = jest.fn().mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 5; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
        } catch (error) {
          // Expected to fail
        }
      }

      // Manually transition to half-open for testing
      (gracefulDegradation as any).serviceStatus.gemini.state = 'half-open';
      (gracefulDegradation as any).serviceStatus.gemini.consecutiveSuccesses = 0;

      const successOperation = jest.fn().mockResolvedValue('success');

      // Execute enough successful operations to close circuit (default 3)
      for (let i = 0; i < 3; i++) {
        await gracefulDegradation.executeWithCircuitBreaker(successOperation, 'gemini');
      }

      expect(gracefulDegradation.getStatus().circuits.gemini.state).toBe('closed');
    });
  });

  describe('degradation assessment', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should not degrade when all systems are healthy', async () => {
      const status = await gracefulDegradation.shouldDegrade();

      expect(status.shouldDegrade).toBe(false);
      expect(status.reason).toBe('All systems operational');
      expect(status.severity).toBe('low');
    });

    it('should degrade when Gemini circuit is open', async () => {
      // Manually open Gemini circuit for testing
      (gracefulDegradation as any).serviceStatus.gemini.state = 'open';

      const status = await gracefulDegradation.shouldDegrade();

      expect(status.shouldDegrade).toBe(true);
      expect(status.reason).toBe('Gemini API circuit breaker is open');
      expect(status.severity).toBe('high');
    });

    it('should degrade when Discord circuit is open', async () => {
      // Manually open Discord circuit for testing
      (gracefulDegradation as any).serviceStatus.discord.state = 'open';

      const status = await gracefulDegradation.shouldDegrade();

      expect(status.shouldDegrade).toBe(true);
      expect(status.reason).toBe('Discord API circuit breaker is open');
      expect(status.severity).toBe('medium');
    });

    it('should assess health-based degradation when health monitor is available', async () => {
      const mockHealthMonitor = {
        getCurrentMetrics: jest.fn().mockResolvedValue({
          ...createMockMetrics(),
          memoryUsage: { rss: 500 * 1024 * 1024 }, // 500MB (over default 400MB threshold)
        }),
      };

      gracefulDegradation.setHealthMonitor(mockHealthMonitor as any);

      const status = await gracefulDegradation.shouldDegrade();

      expect(mockHealthMonitor.getCurrentMetrics).toHaveBeenCalled();
      expect(status.shouldDegrade).toBe(true);
      expect(status.reason).toContain('High memory usage');
      expect(status.severity).toBe('high');
    });

    it('should degrade based on queue pressure', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Fill queue to 80% capacity (default max is 100)
      for (let i = 0; i < 85; i++) {
        await gracefulDegradation.queueMessage(
          `user-${i}`,
          'test message',
          mockRespond,
          'test-server',
          'low'
        );
      }

      const status = await gracefulDegradation.shouldDegrade();

      expect(status.shouldDegrade).toBe(true);
      expect(status.reason).toContain('Message queue pressure');
      expect(status.severity).toBe('medium');
    });
  });

  describe('message queueing', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should queue messages successfully', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      await gracefulDegradation.queueMessage(
        'test-user',
        'test message',
        mockRespond,
        'test-server',
        'medium'
      );

      const status = gracefulDegradation.getStatus();
      expect(status.queue.size).toBe(1);
      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringContaining('Your message has been queued')
      );
    });

    it('should prioritize high priority messages', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Add low priority message first
      await gracefulDegradation.queueMessage(
        'user-1',
        'low priority',
        mockRespond,
        'test-server',
        'low'
      );

      // Add high priority message second
      await gracefulDegradation.queueMessage(
        'user-2',
        'high priority',
        mockRespond,
        'test-server',
        'high'
      );

      // Verify queue ordering by checking internal queue
      const queue = (gracefulDegradation as any).messageQueue;
      expect(queue[0].priority).toBe('high');
      expect(queue[1].priority).toBe('low');
    });

    it('should reject messages when queue is full', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Fill queue to capacity (default 100)
      for (let i = 0; i < 100; i++) {
        await gracefulDegradation.queueMessage(
          `user-${i}`,
          'test message',
          jest.fn().mockResolvedValue(undefined),
          'test-server',
          'medium'
        );
      }

      // Try to add one more
      await gracefulDegradation.queueMessage(
        'overflow-user',
        'overflow message',
        mockRespond,
        'test-server',
        'medium'
      );

      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringContaining('System is currently overloaded')
      );
    });

    it('should remove old low priority messages when queue is full', async () => {
      const firstRespond = jest.fn().mockResolvedValue(undefined);
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Fill queue with mostly low priority messages
      for (let i = 0; i < 100; i++) {
        const respond = i === 0 ? firstRespond : jest.fn().mockResolvedValue(undefined);
        await gracefulDegradation.queueMessage(
          `user-${i}`,
          'test message',
          respond,
          'test-server',
          'low'
        );
      }

      // Add a high priority message that should displace a low priority one
      await gracefulDegradation.queueMessage(
        'priority-user',
        'important message',
        mockRespond,
        'test-server',
        'high'
      );

      // The first low priority message should have been dropped
      expect(firstRespond).toHaveBeenCalledWith(
        expect.stringContaining('system is overloaded and your message was dropped')
      );

      // The new high priority message should be queued successfully
      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringContaining('Your message has been queued')
      );
    });

    it('should estimate wait times for queued messages', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Add a few messages to create a queue
      for (let i = 0; i < 3; i++) {
        await gracefulDegradation.queueMessage(
          `user-${i}`,
          'test message',
          jest.fn().mockResolvedValue(undefined),
          'test-server',
          'medium'
        );
      }

      await gracefulDegradation.queueMessage(
        'test-user',
        'test message',
        mockRespond,
        'test-server',
        'low'
      );

      // Should provide wait time estimate in the response
      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringMatching(/Estimated processing time: \d+/)
      );
    });
  });

  describe('fallback response generation', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should generate generic fallback responses', async () => {
      const response = await gracefulDegradation.generateFallbackResponse(
        'test prompt',
        'test-user',
        'test-server'
      );

      expect(response).toContain('experiencing some technical difficulties');
    });

    it('should generate maintenance responses for high severity degradation', async () => {
      // Force high severity degradation
      (gracefulDegradation as any).serviceStatus.gemini.state = 'open';
      (gracefulDegradation as any).serviceStatus.discord.state = 'open';

      const response = await gracefulDegradation.generateFallbackResponse(
        'test prompt',
        'test-user',
        'test-server'
      );

      expect(response).toMatch(/🔧|⚙️|🛠️|📋|🔄/);
    });

    it('should include context about current issues', async () => {
      // Force degradation with specific reason
      (gracefulDegradation as any).serviceStatus.gemini.state = 'open';

      const response = await gracefulDegradation.generateFallbackResponse(
        'test prompt',
        'test-user',
        'test-server'
      );

      expect(response).toContain('Current issue: Gemini API circuit breaker is open');
    });

    it('should include queue information when applicable', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Add some messages to the queue
      for (let i = 0; i < 5; i++) {
        await gracefulDegradation.queueMessage(
          `user-${i}`,
          'test message',
          mockRespond,
          'test-server',
          'medium'
        );
      }

      const response = await gracefulDegradation.generateFallbackResponse(
        'test prompt',
        'test-user',
        'test-server'
      );

      expect(response).toContain('Messages in queue: 5');
    });
  });

  describe('recovery mechanisms', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should attempt manual recovery for specific service', async () => {
      await expect(gracefulDegradation.triggerRecovery('gemini')).resolves.not.toThrow();
      
      const recovery = gracefulDegradation.getStatus().recovery;
      expect(recovery.gemini?.attempts).toBeGreaterThan(0);
    });

    it('should attempt recovery for all services when none specified', async () => {
      await expect(gracefulDegradation.triggerRecovery()).resolves.not.toThrow();
      
      const recovery = gracefulDegradation.getStatus().recovery;
      expect(recovery.gemini?.attempts).toBeGreaterThan(0);
      expect(recovery.discord?.attempts).toBeGreaterThan(0);
    });

    it('should track recovery metrics', async () => {
      // Attempt recovery multiple times
      await gracefulDegradation.triggerRecovery('gemini');
      await gracefulDegradation.triggerRecovery('gemini');

      const recovery = gracefulDegradation.getStatus().recovery;
      expect(recovery.gemini?.attempts).toBe(2);
      expect(recovery.gemini?.lastAttempt).toBeGreaterThan(0);
    });

    it('should automatically attempt recovery for open circuits', async () => {
      // Open a circuit
      (gracefulDegradation as any).serviceStatus.gemini.state = 'open';

      // Manually trigger recovery monitoring
      await (gracefulDegradation as any).performRecoveryAttempts();

      const recovery = gracefulDegradation.getStatus().recovery;
      expect(recovery.gemini?.attempts).toBeGreaterThan(0);
    });
  });

  describe('queue processing', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should process queued messages when system recovers', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Add messages to queue
      await gracefulDegradation.queueMessage(
        'test-user',
        'test message',
        mockRespond,
        'test-server',
        'medium'
      );

      // Manually trigger queue processing
      await (gracefulDegradation as any).processQueue();

      // Message should be processed (mock implementation sends success response)
      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringContaining('Your queued message has been processed')
      );
    });

    it('should skip processing when system is still degraded', async () => {
      // Force high severity degradation
      (gracefulDegradation as any).serviceStatus.gemini.state = 'open';
      (gracefulDegradation as any).serviceStatus.discord.state = 'open';

      const mockRespond = jest.fn().mockResolvedValue(undefined);

      await gracefulDegradation.queueMessage(
        'test-user',
        'test message',
        mockRespond,
        'test-server',
        'medium'
      );

      // Manually trigger queue processing
      await (gracefulDegradation as any).processQueue();

      // Queue should remain unprocessed
      expect(gracefulDegradation.getStatus().queue.size).toBe(1);
    });

    it('should handle expired messages in queue', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Add message to queue
      await gracefulDegradation.queueMessage(
        'test-user',
        'test message',
        mockRespond,
        'test-server',
        'medium'
      );

      // Manually expire the message by modifying its timestamp
      const queue = (gracefulDegradation as any).messageQueue;
      queue[0].timestamp = Date.now() - 400000; // 400 seconds ago (over 5 min default)

      // Process queue
      await (gracefulDegradation as any).processQueue();

      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringContaining('your message expired while in the queue')
      );
    });

    it('should retry failed messages up to max retries', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      await gracefulDegradation.queueMessage(
        'test-user',
        'test message',
        mockRespond,
        'test-server',
        'medium'
      );

      // Mock the processing to fail initially
      const queue = (gracefulDegradation as any).messageQueue;
      const originalRespond = queue[0].respond;
      queue[0].respond = jest.fn().mockRejectedValue(new Error('Processing failed'));

      // Process queue multiple times to trigger retries
      for (let i = 0; i < 4; i++) {
        await (gracefulDegradation as any).processQueue();
      }

      // After max retries (3), should send failure message
      expect(originalRespond).toHaveBeenCalledWith(
        expect.stringContaining("couldn't process your message after multiple attempts")
      );
    });
  });

  describe('status reporting', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should provide comprehensive status information', () => {
      const status = gracefulDegradation.getStatus();

      expect(status).toMatchObject({
        overall: expect.stringMatching(/healthy|degraded|critical/),
        circuits: {
          gemini: {
            state: expect.stringMatching(/closed|open|half-open/),
            failures: expect.any(Number),
            lastFailure: expect.any(Number),
            consecutiveSuccesses: expect.any(Number),
          },
          discord: {
            state: expect.stringMatching(/closed|open|half-open/),
            failures: expect.any(Number),
            lastFailure: expect.any(Number),
            consecutiveSuccesses: expect.any(Number),
          },
        },
        queue: {
          size: expect.any(Number),
          oldestMessage: null, // Empty queue initially
        },
        recovery: expect.any(Object),
      });
    });

    it('should calculate oldest message age correctly', async () => {
      const mockRespond = jest.fn().mockResolvedValue(undefined);

      await gracefulDegradation.queueMessage(
        'test-user',
        'test message',
        mockRespond,
        'test-server',
        'medium'
      );

      const status = gracefulDegradation.getStatus();
      expect(status.queue.size).toBe(1);
      expect(status.queue.oldestMessage).toBeGreaterThan(0);
    });

    it('should update overall status based on circuit states', () => {
      // Initially healthy
      expect(gracefulDegradation.getStatus().overall).toBe('healthy');

      // Open one circuit - should become degraded
      (gracefulDegradation as any).serviceStatus.gemini.state = 'open';
      (gracefulDegradation as any).updateOverallStatus();
      expect(gracefulDegradation.getStatus().overall).toBe('degraded');

      // Open both circuits - should become critical
      (gracefulDegradation as any).serviceStatus.discord.state = 'open';
      (gracefulDegradation as any).updateOverallStatus();
      expect(gracefulDegradation.getStatus().overall).toBe('critical');
    });
  });

  describe('shutdown and cleanup', () => {
    it('should stop timers and drain queue on shutdown', async () => {
      await gracefulDegradation.initialize();

      const mockRespond = jest.fn().mockResolvedValue(undefined);

      // Add some messages to queue
      await gracefulDegradation.queueMessage(
        'test-user',
        'test message',
        mockRespond,
        'test-server',
        'medium'
      );

      await gracefulDegradation.shutdown();

      // Queue should be drained with shutdown message
      expect(mockRespond).toHaveBeenCalledWith(
        expect.stringContaining('System is shutting down')
      );

      // Timers should be cleared
      expect((gracefulDegradation as any).queueProcessingTimer).toBeNull();
      expect((gracefulDegradation as any).recoveryTimer).toBeNull();
    });

    it('should handle shutdown gracefully when not initialized', async () => {
      await expect(gracefulDegradation.shutdown()).resolves.not.toThrow();
    });
  });

  describe('configuration validation', () => {
    it('should use environment variables for thresholds', () => {
      process.env.DEGRADATION_MEMORY_THRESHOLD_MB = '256';
      process.env.DEGRADATION_ERROR_RATE_THRESHOLD = '2.0';

      const degradation = new GracefulDegradation();

      // Test configuration indirectly through degradation assessment
      const config = (degradation as any).config;
      expect(config.memoryThresholdMB).toBe(256);
      expect(config.errorRateThreshold).toBe(2.0);

      // Cleanup
      delete process.env.DEGRADATION_MEMORY_THRESHOLD_MB;
      delete process.env.DEGRADATION_ERROR_RATE_THRESHOLD;
    });

    it('should validate health metrics against configured thresholds', async () => {
      await gracefulDegradation.initialize();

      const assessHealth = (gracefulDegradation as any).assessHealthBasedDegradation.bind(gracefulDegradation);

      // Test memory threshold
      let metrics = createMockMetrics();
      metrics.memoryUsage.rss = 500 * 1024 * 1024; // 500MB (over default 400MB)
      let assessment = assessHealth(metrics);
      expect(assessment.shouldDegrade).toBe(true);
      expect(assessment.reason).toContain('High memory usage');

      // Test error rate threshold
      metrics = createMockMetrics();
      metrics.errorRate = 15; // Over default 10%
      assessment = assessHealth(metrics);
      expect(assessment.shouldDegrade).toBe(true);
      expect(assessment.reason).toContain('High error rate');

      // Test response time threshold
      metrics = createMockMetrics();
      metrics.responseTime.p95 = 15000; // Over default 10000ms
      assessment = assessHealth(metrics);
      expect(assessment.shouldDegrade).toBe(true);
      expect(assessment.reason).toContain('Slow response times');

      // Test API health
      metrics = createMockMetrics();
      metrics.apiHealth.gemini = false;
      assessment = assessHealth(metrics);
      expect(assessment.shouldDegrade).toBe(true);
      expect(assessment.reason).toContain('Unhealthy services');
    });
  });
});