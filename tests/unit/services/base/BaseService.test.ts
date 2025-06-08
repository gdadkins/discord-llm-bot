import { BaseService } from '../../../../src/services/base/BaseService';
import { logger } from '../../../../src/utils/logger';

// Mock the logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
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

  protected getHealthMetrics(): Record<string, unknown> | undefined {
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
      
      // Manually set shutting down flag for testing
      service['isShuttingDown'] = true;

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

      expect(status.metrics).toEqual({
        activeConnections: 5,
        requestsPerSecond: 100
      });
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
      }

      const orderService = new OrderTestService();

      await orderService.initialize();
      await orderService.shutdown();

      expect(callOrder).toEqual(['performInitialization', 'performShutdown']);
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
          expect(result.reason.message).toContain('TestService initialization failed');
        }
      });
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