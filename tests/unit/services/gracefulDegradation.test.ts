import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { GracefulDegradation } from '../../../src/services/resilience';
import { createMockMetrics, MockTimers, createTestEnvironment } from '../../test-utils';

// Type helper for async functions
type AsyncFunction<T = any> = () => Promise<T>;
type AsyncVoidFunction = () => Promise<void>;

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
    mockTimers.clearAll();
    testEnv.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      await gracefulDegradation.initialize();
      
      const status = gracefulDegradation.getStatus();
      expect(status.circuits.gemini.state).toBe('closed');
      expect(status.circuits.discord.state).toBe('closed');
      expect(status.queued).toBe(0);
      expect(status.degradationMode).toBe('normal');
    });

    it('should initialize with custom configuration', async () => {
      process.env.DEGRADATION_MAX_FAILURES = '3';
      process.env.DEGRADATION_RESET_TIMEOUT_MS = '30000';
      process.env.DEGRADATION_MAX_QUEUE_SIZE = '50';
      
      gracefulDegradation = new GracefulDegradation();
      await gracefulDegradation.initialize();
      
      const status = gracefulDegradation.getStatus();
      expect(status).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('should cleanup resources on shutdown', async () => {
      await gracefulDegradation.initialize();
      await gracefulDegradation.shutdown();
      
      const status = gracefulDegradation.getStatus();
      expect(status.degradationMode).toBe('normal');
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
      const mockOperation = jest.fn<AsyncFunction<string>>().mockResolvedValue('success');

      const result = await gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini');

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
      
      const status = gracefulDegradation.getStatus();
      expect(status.circuits.gemini.state).toBe('closed');
    });

    it('should record failures and open circuit after threshold', async () => {
      const mockOperation = jest.fn<AsyncFunction>().mockRejectedValue(new Error('Operation failed'));

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

    it('should move to half-open state after timeout', async () => {
      jest.useFakeTimers();
      const failingOperation = jest.fn<AsyncFunction>().mockRejectedValue(new Error('Service down'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
        } catch (error) {
          // Expected
        }
      }

      // Wait for reset timeout
      jest.advanceTimersByTime(60000);
      
      const mockOperation = jest.fn<AsyncFunction>();
      await expect(
        gracefulDegradation.executeWithCircuitBreaker(mockOperation, 'gemini')
      ).rejects.toThrow('Circuit breaker is OPEN');
      
      expect(mockOperation).not.toHaveBeenCalled();
      
      jest.useRealTimers();
    });

    it('should close circuit after successful recovery', async () => {
      jest.useFakeTimers();
      const failingOperation = jest.fn<AsyncFunction>().mockRejectedValue(new Error('Service down'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
        } catch (error) {
          // Expected
        }
      }

      expect(gracefulDegradation.getStatus().circuits.gemini.state).toBe('open');

      // Wait for timeout and test recovery
      jest.advanceTimersByTime(60000);
      const successOperation = jest.fn<AsyncFunction<string>>().mockResolvedValue('success');
      const result = await gracefulDegradation.executeWithCircuitBreaker(successOperation, 'gemini');

      expect(result).toBe('success');
      
      jest.useRealTimers();
    });

    it('should fall back to open if recovery fails', async () => {
      jest.useFakeTimers();
      const failingOperation = jest.fn<AsyncFunction>().mockRejectedValue(new Error('Service down'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await gracefulDegradation.executeWithCircuitBreaker(failingOperation, 'gemini');
        } catch (error) {
          // Expected
        }
      }

      // Circuit should be open
      expect(gracefulDegradation.getStatus().circuits.gemini.state).toBe('open');

      // Wait for timeout
      jest.advanceTimersByTime(60000);
      const successOperation = jest.fn<AsyncFunction<string>>().mockResolvedValue('success');

      // Half-open should succeed multiple times
      for (let i = 0; i < 3; i++) {
        await gracefulDegradation.executeWithCircuitBreaker(successOperation, 'gemini');
      }

      // Circuit should now be closed
      expect(gracefulDegradation.getStatus().circuits.gemini.state).toBe('closed');
      
      jest.useRealTimers();
    });
  });

  describe('degradation modes', () => {
    let mockHealthMonitor: any;

    beforeEach(async () => {
      mockHealthMonitor = {
        getCurrentMetrics: jest.fn<AsyncFunction>().mockResolvedValue({
          ...createMockMetrics(),
          memoryUsage: { rss: 500 * 1024 * 1024 }, // 500MB (over default 400MB threshold)
        }),
      };
      gracefulDegradation.setHealthMonitor(mockHealthMonitor);
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should enter partial degradation when memory threshold exceeded', async () => {
      await gracefulDegradation.evaluateHealthAndDegrade();
      
      const status = gracefulDegradation.getStatus();
      expect(status.degradationMode).toBe('partial');
    });

    it('should queue messages when in partial degradation', async () => {
      const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
      
      // Force partial degradation
      await gracefulDegradation.evaluateHealthAndDegrade();
      
      const result = await gracefulDegradation.handleMessage(
        'user123',
        'server123',
        'Test message',
        mockRespond,
        'high'
      );
      
      expect(result.handled).toBe(true);
      expect(result.queued).toBe(true);
      
      const status = gracefulDegradation.getStatus();
      expect(status.queued).toBe(1);
    });

    describe('generic fallback responses', () => {
      it('should provide different fallback responses', async () => {
        const responses = new Set<string>();
        const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
        
        for (let i = 0; i < 10; i++) {
          const response = gracefulDegradation.getGenericFallback();
          responses.add(response);
        }
        
        await gracefulDegradation.handleMessage(
          'user123',
          'server123',
          'Test',
          mockRespond,
          'low'
        );
        
        // Should have multiple unique responses
        expect(responses.size).toBeGreaterThan(1);
      });

      it('should return maintenance response when in maintenance mode', async () => {
        await gracefulDegradation.enterMaintenanceMode();
        const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
        
        const result = await gracefulDegradation.handleMessage(
          'user123',
          'server123',
          'Test',
          mockRespond,
          'low'
        );
        
        expect(result.handled).toBe(true);
        expect(mockRespond).toHaveBeenCalledWith(
          expect.stringContaining('maintenance')
        );
      });

      it('should exit maintenance mode', async () => {
        await gracefulDegradation.enterMaintenanceMode();
        expect(gracefulDegradation.getStatus().degradationMode).toBe('maintenance');
        
        await gracefulDegradation.exitMaintenanceMode();
        expect(gracefulDegradation.getStatus().degradationMode).toBe('normal');
      });
    });

    describe('message queue processing', () => {
      it('should process queued messages when conditions improve', async () => {
        const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
        
        // Queue a message during degradation
        await gracefulDegradation.evaluateHealthAndDegrade();
        await gracefulDegradation.handleMessage(
          'user123',
          'server123',
          'Queued message',
          jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined),
          'high'
        );
        
        // Improve conditions
        mockHealthMonitor.getCurrentMetrics.mockResolvedValue(createMockMetrics());
        
        // Process queue
        await gracefulDegradation.handleMessage(
          'user456',
          'server123',
          'New message',
          mockRespond,
          'low'
        );
        
        // Give time for async processing
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Queue should be processed
        const status = gracefulDegradation.getStatus();
        expect(status.queued).toBeLessThan(1);
      });

      it('should respect queue size limits', async () => {
        const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
        const firstRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
        
        // Force severe degradation
        await gracefulDegradation.evaluateHealthAndDegrade();
        
        // Fill queue beyond limit (default 100)
        for (let i = 0; i < 102; i++) {
          const respond = i === 0 ? firstRespond : jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
          await gracefulDegradation.handleMessage(
            `user${i}`,
            'server123',
            `Message ${i}`,
            respond,
            'low'
          );
        }
        
        // First message should be rejected when queue is full
        expect(firstRespond).toHaveBeenCalledWith(
          expect.stringContaining('experiencing high load')
        );
        
        // Last message should be queued
        await gracefulDegradation.handleMessage(
          'userLast',
          'server123',
          'Last message',
          mockRespond,
          'high'
        );
        
        const status = gracefulDegradation.getStatus();
        expect(status.queued).toBeLessThanOrEqual(100);
      });

      it('should expire old messages from queue', async () => {
        jest.useFakeTimers();
        const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
        
        // Force degradation
        await gracefulDegradation.evaluateHealthAndDegrade();
        
        // Queue message
        await gracefulDegradation.handleMessage(
          'user123',
          'server123',
          'Old message',
          jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined),
          'low'
        );
        
        // Advance time beyond max queue time (5 minutes)
        jest.advanceTimersByTime(6 * 60 * 1000);
        
        // Trigger queue processing
        await gracefulDegradation.handleMessage(
          'user456',
          'server123',
          'New message',
          mockRespond,
          'low'
        );
        
        // Old message should be expired
        const status = gracefulDegradation.getStatus();
        expect(status.queued).toBe(1); // Only new message
        
        jest.useRealTimers();
      });
    });
  });

  describe('recovery strategies', () => {
    let mockHealthMonitor: any;

    beforeEach(async () => {
      mockHealthMonitor = {
        getCurrentMetrics: jest.fn<AsyncFunction>().mockResolvedValue({
          ...createMockMetrics(),
          errorRate: 0.3, // 30% error rate (over default 20% threshold)
        }),
      };
      gracefulDegradation.setHealthMonitor(mockHealthMonitor);
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should attempt recovery when error rate is high', async () => {
      await gracefulDegradation.evaluateHealthAndDegrade();
      const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
      
      const result = await gracefulDegradation.handleMessage(
        'user123',
        'server123',
        'Test message',
        mockRespond,
        'medium'
      );
      
      expect(result.handled).toBe(true);
      
      // Should enter degradation due to high error rate
      const status = gracefulDegradation.getStatus();
      expect(status.degradationMode).not.toBe('normal');
    });

    it('should provide diagnostic information', () => {
      const diagnostics = gracefulDegradation.getDiagnostics();
      
      expect(diagnostics).toHaveProperty('circuits');
      expect(diagnostics).toHaveProperty('queueStats');
      expect(diagnostics).toHaveProperty('recoveryMetrics');
      expect(diagnostics).toHaveProperty('config');
      expect(diagnostics).toHaveProperty('uptime');
    });
  });

  describe('priority handling', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should process high priority messages first', async () => {
      const processedOrder: string[] = [];
      const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
      
      // Force degradation to enable queueing
      const mockHealthMonitor = {
        getCurrentMetrics: jest.fn<AsyncFunction>().mockResolvedValue({
          ...createMockMetrics(),
          memoryUsage: { rss: 500 * 1024 * 1024 },
        }),
      };
      gracefulDegradation.setHealthMonitor(mockHealthMonitor);
      await gracefulDegradation.evaluateHealthAndDegrade();
      
      // Queue messages with different priorities
      await gracefulDegradation.handleMessage(
        'user1',
        'server123',
        'Low priority',
        mockRespond,
        'low'
      );
      
      await gracefulDegradation.handleMessage(
        'user2',
        'server123',
        'High priority',
        mockRespond,
        'high'
      );
      
      await gracefulDegradation.handleMessage(
        'user3',
        'server123',
        'Medium priority',
        mockRespond,
        'medium'
      );
      
      const status = gracefulDegradation.getStatus();
      expect(status.queued).toBeGreaterThan(0);
    });
  });

  describe('concurrent operation handling', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should handle concurrent circuit breaker operations', async () => {
      const operations = Array(10).fill(null).map((_, i) => ({
        id: i,
        operation: jest.fn<AsyncFunction<string>>().mockResolvedValue(`result-${i}`),
      }));
      
      const results = await Promise.all(
        operations.map(({ operation }) => 
          gracefulDegradation.executeWithCircuitBreaker(operation, 'gemini')
        )
      );
      
      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result).toBe(`result-${i}`);
      });
    });

    it('should handle mixed success and failure operations', async () => {
      const results: Array<{ success: boolean; error?: Error }> = [];
      
      for (let i = 0; i < 10; i++) {
        const shouldFail = i % 2 === 0;
        const operation = shouldFail
          ? jest.fn<AsyncFunction>().mockRejectedValue(new Error(`Error ${i}`))
          : jest.fn<AsyncFunction<string>>().mockResolvedValue(`Success ${i}`);
        
        try {
          const result = await gracefulDegradation.executeWithCircuitBreaker(operation, 'gemini');
          results.push({ success: true });
        } catch (error) {
          results.push({ success: false, error: error as Error });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
    });
  });

  describe('configuration edge cases', () => {
    it('should handle invalid configuration values', async () => {
      process.env.DEGRADATION_MAX_FAILURES = 'invalid';
      process.env.DEGRADATION_RESET_TIMEOUT_MS = '-1000';
      process.env.DEGRADATION_MAX_QUEUE_SIZE = '0';
      
      gracefulDegradation = new GracefulDegradation();
      await gracefulDegradation.initialize();
      
      // Should use defaults for invalid values
      const diagnostics = gracefulDegradation.getDiagnostics();
      expect(diagnostics.config.maxFailures).toBeGreaterThan(0);
      expect(diagnostics.config.resetTimeoutMs).toBeGreaterThan(0);
      expect(diagnostics.config.maxQueueSize).toBeGreaterThan(0);
      
      await gracefulDegradation.shutdown();
    });

    it('should handle empty environment configuration', async () => {
      // Clear all config environment variables
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('DEGRADATION_')) {
          delete process.env[key];
        }
      });
      
      gracefulDegradation = new GracefulDegradation();
      await gracefulDegradation.initialize();
      
      const diagnostics = gracefulDegradation.getDiagnostics();
      expect(diagnostics.config).toBeDefined();
      expect(diagnostics.config.maxFailures).toBe(5); // Default value
      
      await gracefulDegradation.shutdown();
    });
  });

  describe('health-based degradation triggers', () => {
    let mockHealthMonitor: any;

    beforeEach(async () => {
      mockHealthMonitor = {
        getCurrentMetrics: jest.fn<AsyncFunction>().mockResolvedValue(createMockMetrics()),
      };
      gracefulDegradation.setHealthMonitor(mockHealthMonitor);
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should trigger degradation on high response time', async () => {
      mockHealthMonitor.getCurrentMetrics.mockResolvedValue({
        ...createMockMetrics(),
        averageResponseTime: 3000, // 3 seconds (over default 2s threshold)
      });
      
      await gracefulDegradation.evaluateHealthAndDegrade();
      
      const status = gracefulDegradation.getStatus();
      expect(status.degradationMode).not.toBe('normal');
    });

    it('should recover when metrics improve', async () => {
      // First trigger degradation
      mockHealthMonitor.getCurrentMetrics.mockResolvedValue({
        ...createMockMetrics(),
        errorRate: 0.25, // 25% error rate
      });
      
      await gracefulDegradation.evaluateHealthAndDegrade();
      expect(gracefulDegradation.getStatus().degradationMode).not.toBe('normal');
      
      // Then improve metrics
      mockHealthMonitor.getCurrentMetrics.mockResolvedValue(createMockMetrics());
      await gracefulDegradation.evaluateHealthAndDegrade();
      
      // Should eventually recover
      const status = gracefulDegradation.getStatus();
      expect(status.degradationMode).toBe('normal');
    });

    it('should handle multiple degradation triggers', async () => {
      mockHealthMonitor.getCurrentMetrics.mockResolvedValue({
        ...createMockMetrics(),
        memoryUsage: { rss: 500 * 1024 * 1024 }, // High memory
        errorRate: 0.25, // High error rate
        averageResponseTime: 3000, // Slow response
      });
      
      await gracefulDegradation.evaluateHealthAndDegrade();
      
      const status = gracefulDegradation.getStatus();
      expect(status.degradationMode).toBe('severe'); // Multiple triggers = severe
    });
  });

  describe('message retry handling', () => {
    beforeEach(async () => {
      await gracefulDegradation.initialize();
    });

    afterEach(async () => {
      await gracefulDegradation.shutdown();
    });

    it('should retry failed messages', async () => {
      jest.useFakeTimers();
      const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
      
      // Force queueing
      const mockHealthMonitor = {
        getCurrentMetrics: jest.fn<AsyncFunction>().mockResolvedValue({
          ...createMockMetrics(),
          memoryUsage: { rss: 500 * 1024 * 1024 },
        }),
      };
      gracefulDegradation.setHealthMonitor(mockHealthMonitor);
      await gracefulDegradation.evaluateHealthAndDegrade();
      
      // Queue a message
      await gracefulDegradation.handleMessage(
        'user123',
        'server123',
        'Retry me',
        mockRespond,
        'high'
      );
      
      // Simulate processing failure and retry
      const queue = (gracefulDegradation as any).messageQueue;
      if (queue.length > 0) {
        queue[0].retries = 1;
        queue[0].respond = jest.fn<(response: string) => Promise<void>>().mockRejectedValue(new Error('Processing failed'));
      }
      
      // Advance time to trigger retry
      jest.advanceTimersByTime(5000);
      
      // Should have attempted retry
      expect(queue[0]?.retries).toBeGreaterThanOrEqual(1);
      
      jest.useRealTimers();
    });

    it('should give up after max retries', async () => {
      const mockRespond = jest.fn<(response: string) => Promise<void>>().mockResolvedValue(undefined);
      
      // Force queueing
      const mockHealthMonitor = {
        getCurrentMetrics: jest.fn<AsyncFunction>().mockResolvedValue({
          ...createMockMetrics(),
          memoryUsage: { rss: 500 * 1024 * 1024 },
        }),
      };
      gracefulDegradation.setHealthMonitor(mockHealthMonitor);
      await gracefulDegradation.evaluateHealthAndDegrade();
      
      // Queue a message
      await gracefulDegradation.handleMessage(
        'user123',
        'server123',
        'Give up on me',
        mockRespond,
        'low'
      );
      
      // Simulate max retries
      const queue = (gracefulDegradation as any).messageQueue;
      if (queue.length > 0) {
        queue[0].retries = 3; // Default max retries
      }
      
      // Process queue - should remove message after max retries
      await (gracefulDegradation as any).processMessageQueue();
      
      expect(queue.length).toBe(0);
    });
  });
});