
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { BaseService, ServiceState } from '../../src/services/base/BaseService';
import { IService } from '../../src/services/interfaces';
import { createTestEnvironment } from '../test-utils';

// Test implementation of BaseService for contract testing
class TestBaseService extends BaseService {
  public initializeCallCount = 0;
  public shutdownCallCount = 0;
  public shouldFailInitialization = false;
  public shouldFailShutdown = false;
  public initializationDelay = 0;
  public shutdownDelay = 0;

  protected getServiceName(): string {
    return 'TestService';
  }

  protected async performInitialization(): Promise<void> {
    this.initializeCallCount++;
    
    if (this.shouldFailInitialization) {
      throw new Error('Simulated initialization failure');
    }
    
    if (this.initializationDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.initializationDelay));
    }
  }

  protected async performShutdown(): Promise<void> {
    this.shutdownCallCount++;
    
    if (this.shouldFailShutdown) {
      throw new Error('Simulated shutdown failure');
    }
    
    if (this.shutdownDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.shutdownDelay));
    }
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      initializeCallCount: this.initializeCallCount,
      shutdownCallCount: this.shutdownCallCount
    };
  }

  // Expose protected methods for testing
  public testCreateInterval(name: string, callback: () => void, interval: number, options?: { coalesce?: boolean }): string {
    return this.createInterval(name, callback, interval, options);
  }

  public testCreateTimeout(name: string, callback: () => void, delay: number): string {
    return this.createTimeout(name, callback, delay);
  }

  public testClearTimer(timerId: string): boolean {
    return this.clearTimer(timerId);
  }

  public testHasTimer(timerId: string): boolean {
    return this.hasTimer(timerId);
  }

  public testGetTimerCount(): number {
    return this.getTimerCount();
  }

  public testGetTimerInfo(timerId: string) {
    return this.getTimerInfo(timerId);
  }

  public testRegisterOperation<T>(operation: Promise<T>): Promise<T> {
    return this.registerOperation(operation);
  }
}

describe('BaseService API Contract Tests', () => {
  let testService: TestBaseService;
  let testEnv: ReturnType<typeof createTestEnvironment>;

  beforeAll(async () => {
    testEnv = createTestEnvironment();
  });

  afterAll(() => {
    testEnv?.cleanup();
  });

  beforeEach(() => {
    testService = new TestBaseService();
  });

  afterEach(async () => {
    if (testService && testService.getServiceState() !== ServiceState.SHUTDOWN) {
      await testService.shutdown();
    }
  });

  describe('IService Interface Contract', () => {
    it('should implement all required IService methods', () => {
      expect(testService).toBeInstanceOf(BaseService);
      const iService: IService = testService;
      expect(typeof iService.initialize).toBe('function');
      expect(typeof iService.shutdown).toBe('function');
      expect(typeof iService.getHealthStatus).toBe('function');
    });

    it('should maintain initialize method signature contract', async () => {
      const result = testService.initialize();
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(testService.initializeCallCount).toBe(1);
    });

    it('should maintain shutdown method signature contract', async () => {
      await testService.initialize();
      const result = testService.shutdown();
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(testService.shutdownCallCount).toBe(1);
    });

    it('should maintain getHealthStatus method signature contract', async () => {
      await testService.initialize();
      const health = testService.getHealthStatus();
      expect(health).toBeDefined();
      expect(typeof health).toBe('object');
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('name');
      expect(typeof health.healthy).toBe('boolean');
      expect(typeof health.name).toBe('string');
    });
  });

  describe('Service Lifecycle Contract', () => {
    it('should maintain proper state transitions during initialization', async () => {
      expect(testService.getServiceState()).toBe(ServiceState.CREATED);
      const initPromise = testService.initialize();
      expect(testService.getServiceState()).toBe(ServiceState.INITIALIZING);
      await initPromise;
      expect(testService.getServiceState()).toBe(ServiceState.READY);
    });

    it('should maintain proper state transitions during shutdown', async () => {
      await testService.initialize();
      expect(testService.getServiceState()).toBe(ServiceState.READY);
      const shutdownPromise = testService.shutdown();
      expect(testService.getServiceState()).toBe(ServiceState.SHUTTING_DOWN);
      await shutdownPromise;
      expect(testService.getServiceState()).toBe(ServiceState.SHUTDOWN);
    });

    it('should handle initialization failure contract', async () => {
      testService.shouldFailInitialization = true;
      await expect(testService.initialize()).rejects.toThrow('Simulated initialization failure');
      expect(testService.getServiceState()).toBe(ServiceState.FAILED);
    });

    it('should handle shutdown failure contract', async () => {
      await testService.initialize();
      testService.shouldFailShutdown = true;
      await expect(testService.shutdown()).rejects.toThrow('Simulated shutdown failure');
    });
  });

  describe('Timer Management Contract', () => {
    beforeEach(async () => {
      await testService.initialize();
    });

    it('should maintain createInterval method signature contract', async () => {
      const callback = jest.fn();
      const timerId = testService.testCreateInterval('test', callback, 10);
      expect(typeof timerId).toBe('string');
      await new Promise(resolve => setTimeout(resolve, 25));
      expect(callback).toHaveBeenCalled();
      testService.testClearTimer(timerId);
    });

    it('should maintain createTimeout method signature contract', async () => {
        const callback = jest.fn();
        const timerId = testService.testCreateTimeout('test', callback, 10);
        expect(typeof timerId).toBe('string');
        await new Promise(resolve => setTimeout(resolve, 25));
        expect(callback).toHaveBeenCalled();
      });

    it('should maintain clearTimer method signature contract', () => {
      const timerId = testService.testCreateInterval('test', () => {}, 10);
      const result = testService.testClearTimer(timerId);
      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });

    it('should maintain hasTimer method signature contract', () => {
      const timerId = testService.testCreateInterval('test', () => {}, 10);
      expect(testService.testHasTimer(timerId)).toBe(true);
      testService.testClearTimer(timerId);
      expect(testService.testHasTimer(timerId)).toBe(false);
    });

    it('should maintain getTimerCount method signature contract', () => {
        expect(typeof testService.testGetTimerCount()).toBe('number');
    });
  });

  describe('Resource Management Contract', () => {
    beforeEach(async () => {
        await testService.initialize();
      });

    it('should maintain registerOperation method signature contract', () => {
        const promise = Promise.resolve();
        expect(() => testService.testRegisterOperation(promise)).not.toThrow();
    });
  });
});