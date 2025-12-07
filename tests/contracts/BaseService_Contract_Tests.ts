/**
 * BaseService API Contract Tests
 * 
 * This file contains comprehensive contract tests for the BaseService class
 * to ensure no regressions during refactoring. These tests validate:
 * 
 * 1. API surface compatibility
 * 2. Behavioral contracts
 * 3. Performance characteristics  
 * 4. Error handling patterns
 * 5. State management
 * 6. Timer functionality
 * 7. Resource management
 * 8. Health monitoring
 * 
 * Usage: Copy this file to your test directory and run with Jest
 */

import {
  BaseServiceContract,
  ExpectedServiceState,
  ExpectedTimerType,
  validateBaseServiceContract,
  runContractTests,
  isValidServiceHealthStatus,
  isValidTimerInfo,
  MockBaseService
} from './BaseService_Contract_Interfaces';

// Import the actual BaseService for testing
// Note: Adjust this import path based on your project structure
// import { BaseService } from '../../../src/services/base/BaseService';

/**
 * Mock concrete service implementation for testing
 */
class TestableService extends MockBaseService {
  private initializationDelay = 0;
  private shutdownDelay = 0;
  private shouldFailInitialization = false;
  private shouldFailShutdown = false;
  private customMetrics: Record<string, unknown> = {};

  constructor(options: {
    initializationDelay?: number;
    shutdownDelay?: number;
    shouldFailInitialization?: boolean;
    shouldFailShutdown?: boolean;
    customMetrics?: Record<string, unknown>;
  } = {}) {
    super();
    this.initializationDelay = options.initializationDelay || 0;
    this.shutdownDelay = options.shutdownDelay || 0;
    this.shouldFailInitialization = options.shouldFailInitialization || false;
    this.shouldFailShutdown = options.shouldFailShutdown || false;
    this.customMetrics = options.customMetrics || {};
  }

  getServiceName(): string {
    return 'TestableService';
  }

  async performInitialization(): Promise<void> {
    if (this.initializationDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.initializationDelay));
    }
    if (this.shouldFailInitialization) {
      throw new Error('Initialization failed for testing');
    }
  }

  async performShutdown(): Promise<void> {
    if (this.shutdownDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.shutdownDelay));
    }
    if (this.shouldFailShutdown) {
      throw new Error('Shutdown failed for testing');
    }
  }

  collectServiceMetrics(): Record<string, unknown> | undefined {
    return Object.keys(this.customMetrics).length > 0 ? this.customMetrics : undefined;
  }
}

describe('BaseService API Contract Tests', () => {
  let service: TestableService;

  beforeEach(() => {
    service = new TestableService();
  });

  afterEach(async () => {
    // Ensure service is properly shut down after each test
    try {
      await service.shutdown();
    } catch (error) {
      // Ignore shutdown errors in tests
    }
  });

  describe('API Structure Contract', () => {
    it('should implement complete BaseService contract interface', () => {
      expect(validateBaseServiceContract(service)).toBe(true);
    });

    it('should have all required IService methods', () => {
      expect(typeof service.initialize).toBe('function');
      expect(typeof service.shutdown).toBe('function');
      expect(typeof service.getHealthStatus).toBe('function');
    });

    it('should have all extended public methods', () => {
      expect(typeof service.getServiceState).toBe('function');
      expect(typeof service.isAcceptingWork).toBe('function');
      expect(typeof service.getServiceStatus).toBe('function');
      expect(typeof service.on).toBe('function');
    });

    it('should have all timer management methods', () => {
      expect(typeof service.createInterval).toBe('function');
      expect(typeof service.createTimeout).toBe('function');
      expect(typeof service.createCoalescedInterval).toBe('function');
      expect(typeof service.createManagedInterval).toBe('function');
      expect(typeof service.createManagedTimeout).toBe('function');
      expect(typeof service.clearTimer).toBe('function');
      expect(typeof service.clearAllTimers).toBe('function');
      expect(typeof service.hasTimer).toBe('function');
      expect(typeof service.getTimerCount).toBe('function');
      expect(typeof service.getTimerInfo).toBe('function');
    });

    it('should have all resource management methods', () => {
      expect(typeof service.registerOperation).toBe('function');
      expect(typeof service.stopAcceptingWork).toBe('function');
      expect(typeof service.waitForOngoingOperations).toBe('function');
    });

    it('should have all abstract and template methods', () => {
      expect(typeof service.getServiceName).toBe('function');
      expect(typeof service.performInitialization).toBe('function');
      expect(typeof service.performShutdown).toBe('function');
      expect(typeof service.collectServiceMetrics).toBe('function');
      expect(typeof service.buildHealthStatus).toBe('function');
      expect(typeof service.isHealthy).toBe('function');
      expect(typeof service.getHealthErrors).toBe('function');
      expect(typeof service.getHealthMetrics).toBe('function');
    });
  });

  describe('Lifecycle State Management Contract', () => {
    it('should start in CREATED state', () => {
      expect(service.getServiceState()).toBe(ExpectedServiceState.CREATED);
    });

    it('should not accept work before initialization', () => {
      expect(service.isAcceptingWork()).toBe(false);
    });

    it('should transition to READY after successful initialization', async () => {
      await service.initialize();
      expect(service.getServiceState()).toBe(ExpectedServiceState.READY);
      expect(service.isAcceptingWork()).toBe(true);
    });

    it('should transition to SHUTDOWN after shutdown', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.getServiceState()).toBe(ExpectedServiceState.SHUTDOWN);
      expect(service.isAcceptingWork()).toBe(false);
    });

    it('should handle initialization failure gracefully', async () => {
      const failingService = new TestableService({ shouldFailInitialization: true });
      
      await expect(failingService.initialize()).rejects.toThrow('Initialization failed for testing');
      expect(failingService.getServiceState()).toBe(ExpectedServiceState.FAILED);
      expect(failingService.isAcceptingWork()).toBe(false);
    });

    it('should be idempotent for initialization', async () => {
      await service.initialize();
      await service.initialize(); // Should not throw
      expect(service.getServiceState()).toBe(ExpectedServiceState.READY);
    });

    it('should be idempotent for shutdown', async () => {
      await service.initialize();
      await service.shutdown();
      await service.shutdown(); // Should not throw
      expect(service.getServiceState()).toBe(ExpectedServiceState.SHUTDOWN);
    });

    it('should emit lifecycle events', async () => {
      const events: string[] = [];
      
      service.on('initialization-started', () => events.push('init-started'));
      service.on('initialization-completed', () => events.push('init-completed'));
      service.on('shutdown-started', () => events.push('shutdown-started'));
      service.on('shutdown-completed', () => events.push('shutdown-completed'));

      await service.initialize();
      await service.shutdown();

      expect(events).toContain('init-started');
      expect(events).toContain('init-completed');
      expect(events).toContain('shutdown-started');
      expect(events).toContain('shutdown-completed');
    });
  });

  describe('Timer Management Contract', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create and track interval timers', () => {
      const timerId = service.createInterval('test-interval', () => {}, 1000);
      
      expect(typeof timerId).toBe('string');
      expect(timerId).toMatch(/TestableService_test-interval_\d+/);
      expect(service.hasTimer(timerId)).toBe(true);
      expect(service.getTimerCount()).toBe(1);
    });

    it('should create and track timeout timers', () => {
      const timerId = service.createTimeout('test-timeout', () => {}, 1000);
      
      expect(typeof timerId).toBe('string');
      expect(timerId).toMatch(/TestableService_test-timeout_\d+/);
      expect(service.hasTimer(timerId)).toBe(true);
      expect(service.getTimerCount()).toBe(1);
    });

    it('should provide valid timer information', () => {
      const timerId = service.createInterval('test-info', () => {}, 5000);
      const timerInfo = service.getTimerInfo(timerId);
      
      expect(timerInfo).toBeDefined();
      expect(isValidTimerInfo(timerInfo!)).toBe(true);
      expect(timerInfo!.id).toBe(timerId);
      expect(timerInfo!.type).toBe(ExpectedTimerType.INTERVAL);
      expect(timerInfo!.intervalMs).toBe(5000);
      expect(timerInfo!.errorCount).toBe(0);
    });

    it('should clear individual timers', () => {
      const timerId = service.createInterval('test-clear', () => {}, 1000);
      
      expect(service.hasTimer(timerId)).toBe(true);
      expect(service.clearTimer(timerId)).toBe(true);
      expect(service.hasTimer(timerId)).toBe(false);
      expect(service.getTimerCount()).toBe(0);
    });

    it('should clear all timers', () => {
      const timer1 = service.createInterval('test1', () => {}, 1000);
      const timer2 = service.createTimeout('test2', () => {}, 2000);
      
      expect(service.getTimerCount()).toBe(2);
      service.clearAllTimers();
      expect(service.getTimerCount()).toBe(0);
      expect(service.hasTimer(timer1)).toBe(false);
      expect(service.hasTimer(timer2)).toBe(false);
    });

    it('should handle clearing non-existent timers gracefully', () => {
      expect(service.clearTimer('non-existent')).toBe(false);
      expect(() => service.clearAllTimers()).not.toThrow();
    });

    it('should create managed timers with resource tracking', () => {
      const timerId = service.createManagedInterval('managed-test', async () => {}, 1000, {
        priority: 'high'
      });
      
      expect(typeof timerId).toBe('string');
      expect(service.hasTimer(timerId)).toBe(true);
    });

    it('should create coalesced timers for long intervals', () => {
      const timerId = service.createCoalescedInterval('coalesced-test', () => {}, 7000);
      
      expect(typeof timerId).toBe('string');
      expect(service.hasTimer(timerId)).toBe(true);
    });

    it('should automatically clean up timers during shutdown', async () => {
      service.createInterval('cleanup-test1', () => {}, 1000);
      service.createTimeout('cleanup-test2', () => {}, 2000);
      
      expect(service.getTimerCount()).toBe(2);
      await service.shutdown();
      // Note: In mock implementation, timers are cleared during shutdown
      expect(service.getTimerCount()).toBe(0);
    });
  });

  describe('Resource Management Contract', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should register and track ongoing operations', async () => {
      const operation = new Promise<string>(resolve => 
        setTimeout(() => resolve('test-result'), 100)
      );

      const trackedOperation = service.registerOperation(operation);
      expect(trackedOperation).toBe(operation);

      const result = await trackedOperation;
      expect(result).toBe('test-result');
    });

    it('should reject operations when not accepting work', async () => {
      service.stopAcceptingWork();
      
      const operation = Promise.resolve('test');
      expect(() => service.registerOperation(operation)).toThrow('Service not accepting work');
    });

    it('should wait for ongoing operations during shutdown', async () => {
      let operationCompleted = false;
      
      const longOperation = service.registerOperation(
        new Promise<void>(resolve => 
          setTimeout(() => {
            operationCompleted = true;
            resolve();
          }, 50)
        )
      );

      // Start shutdown (should wait for operation)
      const shutdownPromise = service.shutdown();
      
      // Operation should complete before shutdown
      await Promise.all([longOperation, shutdownPromise]);
      expect(operationCompleted).toBe(true);
    });
  });

  describe('Health Monitoring Contract', () => {
    it('should provide valid health status structure', () => {
      const health = service.getHealthStatus();
      expect(isValidServiceHealthStatus(health)).toBe(true);
    });

    it('should reflect service name in health status', () => {
      const health = service.getHealthStatus();
      expect(health.name).toBe(service.getServiceName());
    });

    it('should indicate unhealthy before initialization', () => {
      const health = service.getHealthStatus();
      expect(health.healthy).toBe(false);
      expect(health.errors.length).toBeGreaterThan(0);
    });

    it('should indicate healthy after initialization', async () => {
      await service.initialize();
      const health = service.getHealthStatus();
      expect(health.healthy).toBe(true);
      expect(health.errors).toEqual([]);
    });

    it('should include timer metrics in health status', async () => {
      await service.initialize();
      service.createInterval('health-test', () => {}, 1000);
      
      const health = service.getHealthStatus();
      expect(health.metrics).toBeDefined();
      expect(health.metrics!.timers).toBeDefined();
    });

    it('should include service-specific metrics', () => {
      const serviceWithMetrics = new TestableService({
        customMetrics: { customValue: 42, operationCount: 100 }
      });
      
      const health = serviceWithMetrics.getHealthStatus();
      expect(health.metrics).toBeDefined();
      expect(health.metrics!.customValue).toBe(42);
      expect(health.metrics!.operationCount).toBe(100);
    });

    it('should provide comprehensive service status', async () => {
      await service.initialize();
      const status = service.getServiceStatus();
      
      expect(status.name).toBe('TestableService');
      expect(status.state).toBe(ExpectedServiceState.READY);
      expect(status.healthy).toBe(true);
      expect(status.acceptingWork).toBe(true);
      expect(typeof status.uptime).toBe('number');
      expect(typeof status.timers).toBe('number');
      expect(typeof status.ongoingOperations).toBe('number');
      expect(Array.isArray(status.errors)).toBe(true);
      expect(status.resources).toBeDefined();
    });
  });

  describe('Error Handling Contract', () => {
    it('should throw appropriate errors for invalid state transitions', async () => {
      await service.initialize();
      await service.shutdown();
      
      // Should not be able to initialize after shutdown
      await expect(service.initialize()).rejects.toThrow();
    });

    it('should handle timer callback errors gracefully', async () => {
      await service.initialize();
      
      // Create timer with failing callback
      expect(() => {
        service.createInterval('failing-timer', () => {
          throw new Error('Timer callback error');
        }, 100);
      }).not.toThrow();
    });

    it('should enrich errors with service context', async () => {
      const failingService = new TestableService({ shouldFailInitialization: true });
      
      try {
        await failingService.initialize();
        fail('Expected initialization to fail');
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain('Initialization failed for testing');
      }
    });
  });

  describe('Performance Characteristics Contract', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should handle large numbers of timers efficiently', () => {
      const timerCount = 100;
      const timerIds: string[] = [];
      
      const startTime = Date.now();
      
      for (let i = 0; i < timerCount; i++) {
        timerIds.push(service.createInterval(`timer-${i}`, () => {}, 1000));
      }
      
      const creationTime = Date.now() - startTime;
      expect(creationTime).toBeLessThan(1000); // Should create 100 timers in < 1 second
      expect(service.getTimerCount()).toBe(timerCount);
      
      // Cleanup should also be efficient
      const cleanupStartTime = Date.now();
      service.clearAllTimers();
      const cleanupTime = Date.now() - cleanupStartTime;
      
      expect(cleanupTime).toBeLessThan(100); // Should cleanup quickly
      expect(service.getTimerCount()).toBe(0);
    });

    it('should provide fast health status checks', async () => {
      // Create some timers for more realistic scenario
      for (let i = 0; i < 10; i++) {
        service.createInterval(`perf-timer-${i}`, () => {}, 1000);
      }
      
      const iterations = 100;
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        service.getHealthStatus();
      }
      
      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / iterations;
      
      expect(avgTime).toBeLessThan(10); // Should average < 10ms per health check
    });
  });

  describe('Comprehensive Contract Validation', () => {
    it('should pass all contract tests', () => {
      const { passed, results } = runContractTests(service);
      
      if (!passed) {
        console.error('Contract test failures:', results);
      }
      
      expect(passed).toBe(true);
      expect(results.contractStructure.valid).toBe(true);
      expect(results.lifecycleBehavior.valid).toBe(true);
      expect(results.timerBehavior.valid).toBe(true);
      expect(results.healthStatusContract.valid).toBe(true);
    });

    it('should maintain contract through complete lifecycle', async () => {
      // Test contract at each lifecycle stage
      expect(runContractTests(service).passed).toBe(true);
      
      await service.initialize();
      expect(runContractTests(service).passed).toBe(true);
      
      // Add some timers and operations
      service.createInterval('lifecycle-timer', () => {}, 1000);
      service.registerOperation(Promise.resolve('test'));
      expect(runContractTests(service).passed).toBe(true);
      
      await service.shutdown();
      expect(runContractTests(service).passed).toBe(true);
    });
  });
});

describe('BaseService Integration Contract Tests', () => {
  it('should work correctly with multiple service instances', async () => {
    const service1 = new TestableService();
    const service2 = new TestableService();
    
    try {
      // Initialize both services
      await Promise.all([service1.initialize(), service2.initialize()]);
      
      // Both should be healthy and independent
      expect(service1.isAcceptingWork()).toBe(true);
      expect(service2.isAcceptingWork()).toBe(true);
      expect(service1.getServiceState()).toBe(ExpectedServiceState.READY);
      expect(service2.getServiceState()).toBe(ExpectedServiceState.READY);
      
      // Timers should be independent
      const timer1 = service1.createInterval('service1-timer', () => {}, 1000);
      const timer2 = service2.createInterval('service2-timer', () => {}, 1000);
      
      expect(service1.hasTimer(timer1)).toBe(true);
      expect(service1.hasTimer(timer2)).toBe(false);
      expect(service2.hasTimer(timer2)).toBe(true);
      expect(service2.hasTimer(timer1)).toBe(false);
      
    } finally {
      await Promise.allSettled([service1.shutdown(), service2.shutdown()]);
    }
  });

  it('should handle concurrent operations safely', async () => {
    const service = new TestableService();
    
    try {
      await service.initialize();
      
      // Start multiple concurrent operations
      const operations = Array.from({ length: 10 }, (_, i) =>
        service.registerOperation(
          new Promise<number>(resolve => 
            setTimeout(() => resolve(i), Math.random() * 100)
          )
        )
      );
      
      // All operations should complete successfully
      const results = await Promise.all(operations);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      
    } finally {
      await service.shutdown();
    }
  });
});

export {
  TestableService,
  ExpectedServiceState,
  ExpectedTimerType,
  validateBaseServiceContract,
  runContractTests
};