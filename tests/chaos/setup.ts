/**
 * Chaos Test Setup
 * 
 * Global setup and configuration for chaos engineering tests.
 * Initializes test environment, mocks, and utilities.
 */

import { jest } from '@jest/globals';
import { logger } from '../../src/utils/logger';

// Global test configuration
global.CHAOS_TEST_CONFIG = {
  enableVerboseLogging: process.env.CHAOS_VERBOSE === 'true',
  enableMetrics: process.env.CHAOS_METRICS !== 'false',
  timeoutMultiplier: parseFloat(process.env.CHAOS_TIMEOUT_MULTIPLIER || '1.0'),
  maxMemoryUsage: parseInt(process.env.CHAOS_MAX_MEMORY_MB || '2048'), // 2GB default
};

// Enhanced console for better test output
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn((...args) => {
    if (global.CHAOS_TEST_CONFIG.enableVerboseLogging) {
      originalConsole.log('[CHAOS TEST]', ...args);
    }
  }),
  warn: jest.fn((...args) => {
    originalConsole.warn('[CHAOS TEST WARN]', ...args);
  }),
  error: jest.fn((...args) => {
    originalConsole.error('[CHAOS TEST ERROR]', ...args);
  }),
  info: jest.fn((...args) => {
    if (global.CHAOS_TEST_CONFIG.enableVerboseLogging) {
      originalConsole.info('[CHAOS TEST INFO]', ...args);
    }
  })
};

// Global test utilities
global.chaosTestUtils = {
  // Memory monitoring
  getMemoryUsage: () => {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed / 1024 / 1024, // MB
      heapTotal: usage.heapTotal / 1024 / 1024, // MB
      external: usage.external / 1024 / 1024, // MB
      rss: usage.rss / 1024 / 1024 // MB
    };
  },

  // Performance monitoring
  createPerformanceMonitor: () => {
    const startTime = process.hrtime.bigint();
    return {
      elapsed: () => {
        const endTime = process.hrtime.bigint();
        return Number(endTime - startTime) / 1000000; // Convert to milliseconds
      }
    };
  },

  // Wait utility with timeout
  waitWithTimeout: async (ms: number, condition?: () => boolean) => {
    const timeout = ms * global.CHAOS_TEST_CONFIG.timeoutMultiplier;
    
    if (!condition) {
      return new Promise(resolve => setTimeout(resolve, timeout));
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100)); // Check every 100ms
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  },

  // Mock factory
  createMockService: (name: string, methods: string[] = []) => {
    const mock: any = {
      name,
      initialized: false,
      callCounts: new Map<string, number>(),
      
      // Standard service methods
      initialize: jest.fn().mockImplementation(async () => {
        mock.initialized = true;
        return Promise.resolve();
      }),
      
      shutdown: jest.fn().mockImplementation(async () => {
        mock.initialized = false;
        return Promise.resolve();
      }),
      
      getHealthStatus: jest.fn().mockReturnValue({
        healthy: true,
        name,
        errors: [],
        metrics: {}
      })
    };

    // Add custom methods
    methods.forEach(method => {
      mock[method] = jest.fn().mockImplementation((...args: any[]) => {
        const count = mock.callCounts.get(method) || 0;
        mock.callCounts.set(method, count + 1);
        
        // Default successful response
        return Promise.resolve(`${method}_result_${count}`);
      });
    });

    return mock;
  },

  // Error simulation
  createErrorSimulator: (errorTypes: string[] = ['timeout', 'service_unavailable', 'network']) => {
    let callCount = 0;
    const errorHistory: Array<{ type: string; timestamp: number }> = [];

    return {
      shouldError: (rate: number = 0.1) => {
        callCount++;
        return Math.random() < rate;
      },

      getError: (type?: string) => {
        const errorType = type || errorTypes[Math.floor(Math.random() * errorTypes.length)];
        const error = new Error(`Simulated ${errorType} error`);
        
        errorHistory.push({ type: errorType, timestamp: Date.now() });
        
        return error;
      },

      getStats: () => ({
        totalCalls: callCount,
        errorHistory: [...errorHistory],
        errorsByType: errorHistory.reduce((acc, err) => {
          acc[err.type] = (acc[err.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }),

      reset: () => {
        callCount = 0;
        errorHistory.length = 0;
      }
    };
  },

  // System state capture
  captureSystemState: () => {
    const memory = global.chaosTestUtils.getMemoryUsage();
    
    return {
      timestamp: Date.now(),
      memory,
      uptime: process.uptime(),
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
      // Add more system metrics as needed
      activeHandles: (process as any)._getActiveHandles?.()?.length || 0,
      activeRequests: (process as any)._getActiveRequests?.()?.length || 0
    };
  }
};

// Setup Jest environment
beforeAll(async () => {
  logger.info('Setting up chaos test environment', {
    config: global.CHAOS_TEST_CONFIG,
    nodeVersion: process.version,
    platform: process.platform
  });

  // Set up global error handlers for better test debugging
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection in chaos test:', reason);
    console.error('Promise:', promise);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception in chaos test:', error);
  });

  // Memory monitoring
  if (global.CHAOS_TEST_CONFIG.enableMetrics) {
    const initialMemory = global.chaosTestUtils.getMemoryUsage();
    logger.info('Initial memory usage', initialMemory);

    // Set up memory monitoring interval
    const memoryCheckInterval = setInterval(() => {
      const currentMemory = global.chaosTestUtils.getMemoryUsage();
      
      if (currentMemory.heapUsed > global.CHAOS_TEST_CONFIG.maxMemoryUsage) {
        console.warn('High memory usage detected', {
          current: currentMemory.heapUsed,
          limit: global.CHAOS_TEST_CONFIG.maxMemoryUsage
        });
      }
    }, 10000); // Check every 10 seconds

    // Store interval for cleanup
    (global as any).memoryCheckInterval = memoryCheckInterval;
  }
});

afterAll(async () => {
  logger.info('Cleaning up chaos test environment');

  // Clean up memory monitoring
  if ((global as any).memoryCheckInterval) {
    clearInterval((global as any).memoryCheckInterval);
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    const finalMemory = global.chaosTestUtils.getMemoryUsage();
    logger.info('Final memory usage after cleanup', finalMemory);
  }

  // Reset console
  global.console = originalConsole;
});

// Extend Jest matchers for chaos testing
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },

  toHaveRecoveredWithin(received: any, timeMs: number) {
    const pass = received.recoveryTime !== undefined && received.recoveryTime <= timeMs;
    if (pass) {
      return {
        message: () => `expected recovery time ${received.recoveryTime}ms not to be within ${timeMs}ms`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected recovery time ${received.recoveryTime}ms to be within ${timeMs}ms`,
        pass: false,
      };
    }
  },

  toHaveSuccessRate(received: any, expectedRate: number, tolerance: number = 0.05) {
    const actualRate = received.successfulRequests / received.totalRequests;
    const pass = Math.abs(actualRate - expectedRate) <= tolerance;
    
    if (pass) {
      return {
        message: () => `expected success rate ${actualRate} not to be approximately ${expectedRate}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected success rate ${actualRate} to be approximately ${expectedRate} (±${tolerance})`,
        pass: false,
      };
    }
  }
});

// Type declarations for global utilities
declare global {
  const CHAOS_TEST_CONFIG: {
    enableVerboseLogging: boolean;
    enableMetrics: boolean;
    timeoutMultiplier: number;
    maxMemoryUsage: number;
  };

  const chaosTestUtils: {
    getMemoryUsage: () => {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
    createPerformanceMonitor: () => {
      elapsed: () => number;
    };
    waitWithTimeout: (ms: number, condition?: () => boolean) => Promise<void>;
    createMockService: (name: string, methods?: string[]) => any;
    createErrorSimulator: (errorTypes?: string[]) => {
      shouldError: (rate?: number) => boolean;
      getError: (type?: string) => Error;
      getStats: () => any;
      reset: () => void;
    };
    captureSystemState: () => any;
  };

  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toHaveRecoveredWithin(timeMs: number): R;
      toHaveSuccessRate(expectedRate: number, tolerance?: number): R;
    }
  }
}

export {};