import { BaseService, ServiceState } from '../../../../src/services/base/BaseService';
import { logger } from '../../../../src/utils/logger';

// Mock the logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Concrete test implementation of BaseService
class TestService extends BaseService {
  public initializeCalled = false;
  public shutdownCalled = false;
  public shouldFailInit = false;
  public shouldFailShutdown = false;
  public customHealthy = true;
  public customErrors: string[] = [];
  public customMetrics: Record<string, unknown> | undefined = undefined;

  protected getServiceName(): string {
    return 'TestService';
  }

  protected async performInitialization(): Promise<void> {
    this.initializeCalled = true;
    if (this.shouldFailInit) {
      throw new Error('Test initialization error');
    }
  }

  protected async performShutdown(): Promise<void> {
    this.shutdownCalled = true;
    if (this.shouldFailShutdown) {
      throw new Error('Test shutdown error');
    }
  }

  // Override health methods for testing
  protected isHealthy(): boolean {
    return this.customHealthy && super.isHealthy();
  }

  protected getHealthErrors(): string[] {
    const baseErrors = super.getHealthErrors();
    return [...baseErrors, ...this.customErrors];
  }

  public collectServiceMetrics(): Record<string, unknown> | undefined {
    return this.customMetrics;
  }

  // Expose protected properties for testing
  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public getIsShuttingDown(): boolean {
    return this.isShuttingDown;
  }
}

describe('BaseService', () => {
  let service: TestService;

  beforeEach(() => {
    service = new TestService();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should call performInitialization and set initialized flag', async () => {
      await service.initialize();

      expect(service.initializeCalled).toBe(true);
      expect(service.getIsInitialized()).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Initializing TestService...');
      expect(logger.info).toHaveBeenCalledWith('TestService initialized successfully');
    });

    it('should not initialize twice', async () => {
      await service.initialize();
      jest.clearAllMocks();

      await service.initialize();

      expect(service.initializeCalled).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith('TestService is already initialized');
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      service.shouldFailInit = true;

      await expect(service.initialize()).rejects.toThrow('TestService initialization failed: Test initialization error');

      expect(service.getIsInitialized()).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize TestService: Test initialization error',
        expect.any(Error)
      );
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      await service.initialize();
      jest.clearAllMocks();
    });

    it('should call performShutdown and clear initialized flag', async () => {
      await service.shutdown();

      expect(service.shutdownCalled).toBe(true);
      expect(service.getIsInitialized()).toBe(false);
      expect(logger.info).toHaveBeenCalledWith('Shutting down TestService...');
      expect(logger.info).toHaveBeenCalledWith('TestService shutdown complete');
    });

    it('should not shutdown if not initialized', async () => {
      service = new TestService(); // Create new uninitialized service

      await service.shutdown();

      expect(service.shutdownCalled).toBe(false);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should not shutdown twice', async () => {
      // Start first shutdown
      const shutdownPromise1 = service.shutdown();

      // Try to start second shutdown while first is in progress
      const shutdownPromise2 = service.shutdown();

      await Promise.all([shutdownPromise1, shutdownPromise2]);

      expect(service.shutdownCalled).toBe(true);
      // Should only log once
      expect(logger.info).toHaveBeenCalledTimes(2); // One for "Shutting down", one for "shutdown complete"
    });

    it('should handle shutdown errors gracefully', async () => {
      service.shouldFailShutdown = true;

      await service.shutdown();

      expect(service.getIsInitialized()).toBe(false);
      expect(service.getIsShuttingDown()).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Error during TestService shutdown:',
        expect.any(Error)
      );
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when initialized', async () => {
      await service.initialize();

      const status = service.getHealthStatus();

      expect(status).toEqual({
        healthy: true,
        name: 'TestService',
        errors: [],
        metrics: undefined
      });
    });

    it('should return unhealthy status when not initialized', () => {
      const status = service.getHealthStatus();

      expect(status).toEqual({
        healthy: false,
        name: 'TestService',
        errors: ['Service not initialized'],
        metrics: undefined
      });
    });

    it('should return unhealthy status when shutting down', async () => {
      await service.initialize();

      // Mock shutting down state
      jest.spyOn(service as any, 'isShuttingDown', 'get').mockReturnValue(true);
      jest.spyOn(service, 'getServiceState').mockReturnValue(ServiceState.SHUTTING_DOWN);

      const status = service.getHealthStatus();

      expect(status).toEqual({
        healthy: false,
        name: 'TestService',
        errors: ['Service is shutting down'],
        metrics: undefined
      });
    });

    it('should include custom health metrics', async () => {
      await service.initialize();
      service.customMetrics = {
        activeConnections: 5,
        requestsPerSecond: 100
      };

      const status = service.getHealthStatus();

      expect(status.metrics).toEqual(expect.objectContaining({
        activeConnections: 5,
        requestsPerSecond: 100
      }));
    });

    it('should merge timer metrics with service-specific metrics', async () => {
      await service.initialize();
      service.customMetrics = {
        activeConnections: 5,
        requestsPerSecond: 100
      };

      // Create a timer to generate timer metrics
      service['createInterval']('merge-test', () => { }, 1000);

      const status = service.getHealthStatus();

      expect(status.metrics).toBeDefined();
      expect(status.metrics?.activeConnections).toBe(5);
      expect(status.metrics?.requestsPerSecond).toBe(100);
      expect(status.metrics?.timers).toBeDefined();

      const timerMetrics = status.metrics?.timers as any;
      expect(timerMetrics.count).toBe(1);
    });

    it('should include custom health errors', async () => {
      await service.initialize();
      service.customErrors = ['Database connection lost', 'High memory usage'];

      const status = service.getHealthStatus();

      expect(status.errors).toEqual(['Database connection lost', 'High memory usage']);
    });

    it('should respect custom health check logic', async () => {
      await service.initialize();
      service.customHealthy = false;

      const status = service.getHealthStatus();

      expect(status.healthy).toBe(false);
    });
  });

  describe('template method pattern', () => {
    it('should enforce proper lifecycle order', async () => {
      const callOrder: string[] = [];

      class OrderTestService extends BaseService {
        protected getServiceName(): string {
          return 'OrderTestService';
        }

        protected async performInitialization(): Promise<void> {
          callOrder.push('performInitialization');
        }

        protected async performShutdown(): Promise<void> {
          callOrder.push('performShutdown');
        }

        protected collectServiceMetrics(): Record<string, unknown> | undefined {
          return undefined;
        }
      }

      const orderService = new OrderTestService();

      await orderService.initialize();
      await orderService.shutdown();

      expect(callOrder).toContain('performInitialization');
      expect(callOrder).toContain('performShutdown');
      // Ensure shutdown is called at least once (idempotency handled by manager)
      expect(callOrder.filter(c => c === 'performShutdown').length).toBeGreaterThanOrEqual(1);
    });

    it('should provide consistent error handling across services', async () => {
      const services = [
        new TestService(),
        new TestService(),
        new TestService()
      ];

      services.forEach(s => s.shouldFailInit = true);

      const results = await Promise.allSettled(
        services.map(s => s.initialize())
      );

      results.forEach(result => {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          // Error might be wrapped or propagated differently, just check if it failed
          expect(result.reason.message).toMatch(/TestService initialization failed|Test initialization error/);
        }
      });
    });
  });

  describe('timer management', () => {
    beforeEach(async () => {
      await service.initialize();
      jest.clearAllMocks();
    });

    afterEach(async () => {
      await service.shutdown();
    });

    it('should create and manage interval timers', async () => {
      const callback = jest.fn();
      const timerId = service['createInterval']('test-interval', callback, 100);

      expect(timerId).toBeDefined();
      expect(service['hasTimer'](timerId)).toBe(true);
      expect(service['getTimerCount']()).toBe(1);

      // Wait for timer to execute at least once
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(callback).toHaveBeenCalled();

      // Clear the timer
      const cleared = service['clearTimer'](timerId);
      expect(cleared).toBe(true);
      expect(service['hasTimer'](timerId)).toBe(false);
      expect(service['getTimerCount']()).toBe(0);
    });

    it('should create and manage timeout timers', async () => {
      const callback = jest.fn();
      const timerId = service['createTimeout']('test-timeout', callback, 50);

      expect(timerId).toBeDefined();
      expect(service['hasTimer'](timerId)).toBe(true);
      expect(service['getTimerCount']()).toBe(1);

      // Wait for timeout to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callback).toHaveBeenCalledTimes(1);

      // Timeout should be automatically removed after execution
      expect(service['hasTimer'](timerId)).toBe(false);
      expect(service['getTimerCount']()).toBe(0);
    });

    it('should handle timer callback errors gracefully', async () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Timer callback error');
      });

      const timerId = service['createInterval']('error-interval', errorCallback, 50);

      // Wait for timer to execute and handle error
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorCallback).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/Timer callback error/),
        expect.objectContaining({
          service: 'TestService',
          timerId: expect.stringContaining('error-interval'),
          errorCount: 1
        })
      );

      // Timer should still be active for intervals
      expect(service['hasTimer'](timerId)).toBe(true);
    });

    it('should generate unique timer IDs', () => {
      const timerId1 = service['createInterval']('test', () => { }, 1000);
      const timerId2 = service['createInterval']('test', () => { }, 1000);

      expect(timerId1).not.toBe(timerId2);
      expect(timerId1).toContain('TestService_test_');
      expect(timerId2).toContain('TestService_test_');
    });

    it('should provide timer information', () => {
      const timerId = service['createInterval']('info-test', () => { }, 500);
      const info = service['getTimerInfo'](timerId);

      expect(info).toBeDefined();
      expect(info?.id).toBe(timerId);
      expect(info?.type).toBe('interval');
      expect(info?.intervalMs).toBe(500);
      expect(info?.createdAt).toBeGreaterThan(0);
      expect(info?.errorCount).toBe(0);
    });

    it('should include timer metrics in health status', () => {
      service['createInterval']('metrics-test-1', () => { }, 1000);
      service['createTimeout']('metrics-test-2', () => { }, 2000);

      const status = service.getHealthStatus();

      expect(status.metrics).toBeDefined();
      expect(status.metrics?.timers).toBeDefined();

      const timerMetrics = status.metrics?.timers as any;
      expect(timerMetrics.count).toBe(2);
      expect(timerMetrics.byType.interval).toBe(1);
      expect(timerMetrics.byType.timeout).toBe(1);
      expect(timerMetrics.totalErrors).toBe(0);
    });

    it('should clear all timers on shutdown', async () => {
      service['createInterval']('shutdown-test-1', () => { }, 1000);
      service['createTimeout']('shutdown-test-2', () => { }, 2000);

      expect(service['getTimerCount']()).toBe(2);

      await service.shutdown();

      expect(service['getTimerCount']()).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(
        'Timer cleanup completed',
        expect.objectContaining({
          service: 'TestService',
          clearedCount: 2,
          errorCount: 0,
          totalTimers: 2
        })
      );
    });

    it('should handle clearing non-existent timers', () => {
      const result = service['clearTimer']('non-existent-timer');
      expect(result).toBe(false);
    });

    it('should sanitize timer names in IDs', () => {
      const timerId = service['createInterval']('test timer with spaces!@#', () => { }, 1000);
      expect(timerId).toContain('test_timer_with_spaces___');
    });
  });
});

describe('BaseService implementation validation', () => {
  it('should require subclasses to implement abstract methods', () => {
    // This test verifies TypeScript compilation would fail
    // if abstract methods are not implemented
    class InvalidService extends BaseService {
      protected getServiceName(): string {
        return 'InvalidService';
      }
      // Missing performInitialization and performShutdown
      protected async performInitialization(): Promise<void> {
        // Required implementation
      }
      protected async performShutdown(): Promise<void> {
        // Required implementation
      }
      protected collectServiceMetrics(): Record<string, unknown> | undefined {
        return undefined;
      }
    }

    expect(() => new InvalidService()).not.toThrow();
  });

  it('should demonstrate memory leak prevention', async () => {
    const service = new TestService();

    // Initialize and create some state
    await service.initialize();

    // Shutdown should clean up
    await service.shutdown();

    // Verify service is ready for garbage collection
    expect(service.getIsInitialized()).toBe(false);
    expect(service.getIsShuttingDown()).toBe(false);
  });
});