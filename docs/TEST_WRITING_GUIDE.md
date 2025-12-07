# Test Writing Guide

Practical guide for writing comprehensive tests for service extractions and modular architecture components. Includes real examples, templates, and best practices.

## Quick Reference

### Test Templates
- [BaseService Testing Template](#baseservice-testing-template)
- [Context Service Testing Template](#context-service-testing-template)
- [Configuration Service Testing Template](#configuration-service-testing-template)
- [Integration Testing Template](#integration-testing-template)

### Testing Patterns
- [Mock Strategies](#mock-strategies)
- [Error Testing Patterns](#error-testing-patterns)
- [Async Operation Testing](#async-operation-testing)
- [Performance Testing](#performance-testing)

## BaseService Testing Template

All services extending BaseService should use this comprehensive testing template:

### Complete BaseService Test Example

```typescript
/**
 * @file ExampleService.test.ts - Unit tests for ExampleService
 * @module tests/unit/services
 */

import { ExampleService } from '../../../src/services/ExampleService';
import { logger } from '../../../src/utils/logger';
import { createMockConfiguration, createTestEnvironment } from '../../test-utils';

// Mock external dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('ExampleService', () => {
  let service: ExampleService;
  let testEnv: ReturnType<typeof createTestEnvironment>;
  let mockConfig: any;

  beforeEach(() => {
    testEnv = createTestEnvironment();
    mockConfig = createMockConfiguration();
    service = new ExampleService(mockConfig);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await service.shutdown();
    testEnv.cleanup();
  });

  describe('service lifecycle', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      
      expect(service.getHealthStatus().healthy).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Initializing ExampleService...');
      expect(logger.info).toHaveBeenCalledWith('ExampleService initialized successfully');
    });

    it('should handle initialization failures gracefully', async () => {
      // Mock initialization failure
      const mockError = new Error('Initialization failed');
      jest.spyOn(service as any, 'performInitialization')
        .mockRejectedValueOnce(mockError);

      await expect(service.initialize()).rejects.toThrow(
        'ExampleService initialization failed: Initialization failed'
      );

      expect(service.getHealthStatus().healthy).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize ExampleService: Initialization failed',
        mockError
      );
    });

    it('should not initialize twice', async () => {
      await service.initialize();
      jest.clearAllMocks();

      await service.initialize();

      expect(logger.warn).toHaveBeenCalledWith('ExampleService is already initialized');
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should shutdown gracefully', async () => {
      await service.initialize();
      jest.clearAllMocks();

      await service.shutdown();

      expect(service.getHealthStatus().healthy).toBe(false);
      expect(logger.info).toHaveBeenCalledWith('Shutting down ExampleService...');
      expect(logger.info).toHaveBeenCalledWith('ExampleService shutdown complete');
    });

    it('should not shutdown if not initialized', async () => {
      await service.shutdown();

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle shutdown errors gracefully', async () => {
      await service.initialize();
      
      const mockError = new Error('Shutdown failed');
      jest.spyOn(service as any, 'performShutdown')
        .mockRejectedValueOnce(mockError);

      await service.shutdown();

      expect(service.getHealthStatus().healthy).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Error during ExampleService shutdown:',
        mockError
      );
    });
  });

  describe('health monitoring', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should report healthy status when operational', () => {
      const status = service.getHealthStatus();

      expect(status).toEqual({
        healthy: true,
        name: 'ExampleService',
        errors: [],
        metrics: expect.any(Object)
      });
    });

    it('should report unhealthy status with errors', () => {
      // Trigger an error condition
      service['addHealthError']('Database connection lost');

      const status = service.getHealthStatus();

      expect(status.healthy).toBe(false);
      expect(status.errors).toContain('Database connection lost');
    });

    it('should include service-specific metrics', () => {
      const status = service.getHealthStatus();

      expect(status.metrics).toBeDefined();
      expect(status.metrics).toMatchObject({
        // Service-specific metrics
        activeConnections: expect.any(Number),
        requestsPerSecond: expect.any(Number),
        // Timer metrics from BaseService
        timers: expect.any(Object)
      });
    });
  });

  describe('timer management', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create and manage interval timers', async () => {
      const callback = jest.fn();
      const timerId = service['createInterval']('test-interval', callback, 100);

      expect(timerId).toBeDefined();
      expect(service['hasTimer'](timerId)).toBe(true);
      expect(service['getTimerCount']()).toBe(1);

      // Wait for timer execution
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(callback).toHaveBeenCalled();

      // Cleanup
      const cleared = service['clearTimer'](timerId);
      expect(cleared).toBe(true);
      expect(service['getTimerCount']()).toBe(0);
    });

    it('should handle timer callback errors', async () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Timer callback error');
      });

      service['createInterval']('error-timer', errorCallback, 50);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/Timer callback error/),
        expect.objectContaining({
          service: 'ExampleService',
          timerId: expect.stringContaining('error-timer'),
          errorCount: 1
        })
      );
    });

    it('should clear all timers on shutdown', async () => {
      service['createInterval']('timer1', () => {}, 1000);
      service['createTimeout']('timer2', () => {}, 2000);

      expect(service['getTimerCount']()).toBe(2);

      await service.shutdown();

      expect(service['getTimerCount']()).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(
        'Timer cleanup completed',
        expect.objectContaining({
          service: 'ExampleService',
          clearedCount: 2,
          errorCount: 0,
          totalTimers: 2
        })
      );
    });
  });

  describe('business logic', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should process requests successfully', async () => {
      const mockRequest = { type: 'test', data: 'example' };
      
      const result = await service.processRequest(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should validate request parameters', async () => {
      const invalidRequest = { type: 'invalid' };

      await expect(service.processRequest(invalidRequest))
        .rejects.toThrow('Invalid request: missing required data');
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(10).fill(null).map((_, i) => 
        service.processRequest({ type: 'test', data: `request-${i}` })
      );

      const results = await Promise.all(requests);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should handle external API failures', async () => {
      // Mock API failure
      const mockError = new Error('External API unavailable');
      jest.spyOn(service as any, 'callExternalAPI')
        .mockRejectedValueOnce(mockError);

      const result = await service.performOperation();

      expect(result.success).toBe(false);
      expect(result.error).toContain('External API unavailable');
      expect(service.getHealthStatus().healthy).toBe(true); // Should stay healthy
    });

    it('should retry failed operations', async () => {
      const mockAPI = jest.spyOn(service as any, 'callExternalAPI')
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ success: true });

      const result = await service.performOperation();

      expect(result.success).toBe(true);
      expect(mockAPI).toHaveBeenCalledTimes(2);
    });

    it('should circuit break after repeated failures', async () => {
      // Mock multiple failures
      const mockAPI = jest.spyOn(service as any, 'callExternalAPI');
      for (let i = 0; i < 5; i++) {
        mockAPI.mockRejectedValueOnce(new Error('API failure'));
      }

      // Should open circuit after threshold
      for (let i = 0; i < 5; i++) {
        await service.performOperation();
      }

      const result = await service.performOperation();
      expect(result.error).toContain('Circuit breaker open');
    });
  });

  describe('configuration management', () => {
    it('should validate configuration on initialization', async () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.features;

      const invalidService = new ExampleService(invalidConfig);

      await expect(invalidService.initialize())
        .rejects.toThrow('Invalid configuration');
    });

    it('should handle configuration updates', async () => {
      await service.initialize();
      
      const newConfig = { ...mockConfig, timeout: 5000 };
      
      await service.updateConfiguration(newConfig);
      
      expect(service.getConfiguration().timeout).toBe(5000);
    });

    it('should validate configuration updates', async () => {
      await service.initialize();
      
      const invalidUpdate = { timeout: -1 };

      await expect(service.updateConfiguration(invalidUpdate))
        .rejects.toThrow('Invalid timeout value');
    });
  });

  describe('performance', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should meet response time targets', async () => {
      const startTime = Date.now();
      await service.processRequest({ type: 'performance-test', data: 'test' });
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(200); // 200ms target
    });

    it('should handle high-frequency operations', async () => {
      const operations = Array(1000).fill(null).map(() => 
        service.processRequest({ type: 'test', data: 'high-frequency' })
      );

      const startTime = Date.now();
      await Promise.all(operations);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(5000); // 5s for 1000 operations
    });

    it('should maintain stable memory usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform memory-intensive operations
      for (let i = 0; i < 100; i++) {
        await service.processLargeRequest({ size: 1000 });
      }

      global.gc?.(); // Force garbage collection if available

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB limit
    });
  });
});
```

## Context Service Testing Template

For services managing context and state:

```typescript
describe('ContextService', () => {
  let service: ContextService;
  let mockGuild: jest.Mocked<Guild>;

  beforeEach(() => {
    service = new ContextService();
    mockGuild = createMockGuild();
    jest.clearAllMocks();
  });

  describe('context building', () => {
    it('should build server culture context', () => {
      const context = service.buildServerCultureContext(mockGuild);

      expect(context).toContain('SERVER CULTURE CONTEXT:');
      expect(context).toContain('Popular Emojis:');
      expect(context).toContain('Boost Level:');
      expect(context).toContain('Top Channels:');
    });

    it('should cache context for performance', () => {
      const context1 = service.buildServerCultureContext(mockGuild);
      const context2 = service.buildServerCultureContext(mockGuild);

      expect(context1).toBe(context2); // Same reference = cached
    });

    it('should handle empty server data gracefully', () => {
      const emptyGuild = {
        ...mockGuild,
        emojis: { cache: new Map() },
        channels: { cache: new Map() }
      } as any;

      const context = service.buildServerCultureContext(emptyGuild);

      expect(context).toBeDefined();
      expect(context).not.toContain('Popular Emojis:');
    });
  });

  describe('memory management', () => {
    it('should compress context data', () => {
      const largeContext = 'x'.repeat(10000);
      const compressed = service.compressContext(largeContext);

      expect(compressed.length).toBeLessThan(largeContext.length);
    });

    it('should evict old context entries', () => {
      // Fill cache beyond capacity
      for (let i = 0; i < 150; i++) {
        service.addContext(`guild-${i}`, `context-${i}`);
      }

      const cacheSize = service.getCacheSize();
      expect(cacheSize).toBeLessThan(150); // Should have evicted old entries
    });

    it('should deduplicate similar context', () => {
      const context1 = 'Similar context content';
      const context2 = 'Similar context content with minor differences';

      service.addContext('guild-1', context1);
      service.addContext('guild-2', context2);

      const metrics = service.getCompressionMetrics();
      expect(metrics.duplicatesRemoved).toBeGreaterThan(0);
    });
  });
});
```

## Configuration Service Testing Template

For configuration management services:

```typescript
describe('ConfigurationManager', () => {
  let manager: ConfigurationManager;
  let testEnv: ReturnType<typeof createTestEnvironment>;

  beforeEach(async () => {
    testEnv = createTestEnvironment();
    manager = new ConfigurationManager(
      path.join(testEnv.tempDir, 'config.json'),
      path.join(testEnv.tempDir, 'versions'),
      path.join(testEnv.tempDir, 'audit.log')
    );
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.shutdown();
    testEnv.cleanup();
  });

  describe('configuration validation', () => {
    it('should validate complete configuration', () => {
      const config = createMockConfiguration();
      const result = manager.validateConfiguration(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidConfig = createMockConfiguration();
      delete invalidConfig.discord.intents;

      const result = manager.validateConfiguration(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Discord intents are required');
    });

    it('should validate nested configuration sections', () => {
      const config = createMockConfiguration();
      config.gemini.temperature = 2.5; // Invalid range

      const result = manager.validateConfiguration(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Temperature must be between 0 and 2');
    });
  });

  describe('configuration updates', () => {
    it('should update configuration sections', async () => {
      const originalConfig = manager.getConfiguration();
      
      await manager.updateConfigurationSection(
        'gemini',
        { temperature: 0.5 },
        'test-user',
        'Update temperature'
      );

      const updatedConfig = manager.getConfiguration();
      expect(updatedConfig.gemini.temperature).toBe(0.5);
      expect(originalConfig.gemini.temperature).not.toBe(0.5); // Original unchanged
    });

    it('should emit change events', async () => {
      const changeHandler = jest.fn();
      manager.on('config:changed', changeHandler);

      await manager.updateConfigurationSection(
        'discord',
        { permissions: { newRole: 'admin' } },
        'test-user',
        'Add role permission'
      );

      expect(changeHandler).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['discord', 'permissions', 'newRole'],
            oldValue: undefined,
            newValue: 'admin'
          })
        ])
      );
    });

    it('should rollback failed updates', async () => {
      const originalConfig = manager.getConfiguration();
      
      const invalidUpdate = { temperature: 5.0 }; // Out of valid range

      await expect(
        manager.updateConfigurationSection(
          'gemini',
          invalidUpdate,
          'test-user',
          'Invalid update'
        )
      ).rejects.toThrow();

      const currentConfig = manager.getConfiguration();
      expect(currentConfig).toEqual(originalConfig);
    });
  });

  describe('version management', () => {
    it('should track configuration versions', async () => {
      await manager.updateConfiguration(
        createMockConfiguration(),
        'test-user',
        'Initial version'
      );

      const versions = await manager.getConfigurationHistory();
      expect(versions).toHaveLength(1);
      expect(versions[0].modifiedBy).toBe('test-user');
      expect(versions[0].changeDescription).toBe('Initial version');
    });

    it('should rollback to previous versions', async () => {
      const initialConfig = manager.getConfiguration();
      
      // Make an update
      await manager.updateConfiguration(
        { ...initialConfig, newField: 'test' },
        'test-user',
        'Add new field'
      );

      // Rollback
      const versions = await manager.getConfigurationHistory();
      await manager.rollbackToVersion(versions[0].version);

      const rolledBackConfig = manager.getConfiguration();
      expect(rolledBackConfig).toEqual(initialConfig);
    });
  });

  describe('environment overrides', () => {
    it('should apply environment variable overrides', () => {
      process.env.DISCORD_TOKEN = 'override-token';
      process.env.GEMINI_API_KEY = 'override-key';

      const config = manager.getConfiguration();

      expect(config.discord.token).toBe('override-token');
      expect(config.gemini.apiKey).toBe('override-key');

      // Cleanup
      delete process.env.DISCORD_TOKEN;
      delete process.env.GEMINI_API_KEY;
    });

    it('should validate environment overrides', () => {
      process.env.GEMINI_TEMPERATURE = 'invalid';

      expect(() => manager.getConfiguration())
        .toThrow('Invalid environment variable: GEMINI_TEMPERATURE');

      delete process.env.GEMINI_TEMPERATURE;
    });
  });
});
```

## Integration Testing Template

For testing service interactions:

```typescript
describe('Service Integration', () => {
  let healthMonitor: HealthMonitor;
  let configManager: ConfigurationManager;
  let serviceA: ServiceA;
  let serviceB: ServiceB;
  let testEnv: ReturnType<typeof createTestEnvironment>;

  beforeEach(async () => {
    testEnv = createTestEnvironment();
    
    // Initialize services in dependency order
    configManager = new ConfigurationManager(
      path.join(testEnv.tempDir, 'config.json')
    );
    await configManager.initialize();

    healthMonitor = new HealthMonitor();
    await healthMonitor.initialize();

    serviceA = new ServiceA(configManager, healthMonitor);
    serviceB = new ServiceB(configManager, healthMonitor);

    await serviceA.initialize();
    await serviceB.initialize();
  });

  afterEach(async () => {
    // Shutdown in reverse order
    await serviceB.shutdown();
    await serviceA.shutdown();
    await healthMonitor.shutdown();
    await configManager.shutdown();
    testEnv.cleanup();
  });

  describe('cross-service communication', () => {
    it('should coordinate between services', async () => {
      const result = await serviceA.requestDataFromServiceB('test-data');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle service unavailability', async () => {
      await serviceB.shutdown();

      const result = await serviceA.requestDataFromServiceB('test-data');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Service unavailable');
    });
  });

  describe('configuration propagation', () => {
    it('should propagate config changes to all services', async () => {
      const configChanges: any[] = [];
      
      serviceA.on('config:changed', (changes) => configChanges.push('A'));
      serviceB.on('config:changed', (changes) => configChanges.push('B'));

      await configManager.updateConfiguration(
        createMockConfiguration(),
        'test-user',
        'Integration test update'
      );

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(configChanges).toContain('A');
      expect(configChanges).toContain('B');
    });
  });

  describe('health monitoring integration', () => {
    it('should aggregate health from all services', async () => {
      const overallHealth = await healthMonitor.getOverallHealth();

      expect(overallHealth.healthy).toBe(true);
      expect(overallHealth.services).toContain('ServiceA');
      expect(overallHealth.services).toContain('ServiceB');
    });

    it('should detect service health degradation', async () => {
      // Trigger health issue in serviceA
      serviceA['addHealthError']('Test error');

      const overallHealth = await healthMonitor.getOverallHealth();

      expect(overallHealth.healthy).toBe(false);
      expect(overallHealth.errors).toContain('ServiceA: Test error');
    });
  });

  describe('error propagation', () => {
    it('should isolate service failures', async () => {
      // Cause serviceA to fail
      await serviceA.shutdown();

      // ServiceB should continue working
      const result = await serviceB.performOperation();
      expect(result.success).toBe(true);

      const healthStatus = await healthMonitor.getOverallHealth();
      expect(healthStatus.services.filter(s => s.healthy)).toContain('ServiceB');
    });

    it('should handle cascading failure scenarios', async () => {
      // Simulate configuration service failure
      await configManager.shutdown();

      // Services should degrade gracefully
      const resultA = await serviceA.performOperation();
      const resultB = await serviceB.performOperation();

      expect(resultA.success).toBe(false);
      expect(resultB.success).toBe(false);
      expect(resultA.error).toContain('Configuration unavailable');
    });
  });

  describe('resource coordination', () => {
    it('should coordinate shared resource access', async () => {
      const sharedResource = 'shared-data-file';
      
      // Both services try to access the same resource
      const promiseA = serviceA.accessSharedResource(sharedResource);
      const promiseB = serviceB.accessSharedResource(sharedResource);

      const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

      // Both should succeed without conflicts
      expect(resultA.success).toBe(true);
      expect(resultB.success).toBe(true);
    });

    it('should handle resource contention', async () => {
      const promises = Array(10).fill(null).map((_, i) =>
        i % 2 === 0 
          ? serviceA.accessSharedResource('contended-resource')
          : serviceB.accessSharedResource('contended-resource')
      );

      const results = await Promise.all(promises);

      // All operations should complete successfully
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});
```

## Mock Strategies

### External Service Mocking

```typescript
// Mock Discord.js
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue('logged-in'),
    on: jest.fn(),
    destroy: jest.fn().mockResolvedValue(undefined),
    guilds: {
      cache: new Map([
        ['guild-1', createMockGuild()]
      ])
    }
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4
  }
}));

// Mock Google AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'Mock AI response'
        }
      })
    })
  }))
}));

// Mock File System
jest.mock('fs-extra', () => ({
  readJSON: jest.fn(),
  writeJSON: jest.fn(),
  pathExists: jest.fn(),
  remove: jest.fn(),
  ensureDir: jest.fn()
}));
```

### Service Factory Mocking

```typescript
const createMockService = <T>(ServiceClass: new (...args: any[]) => T): jest.Mocked<T> => {
  const mockInstance = Object.create(ServiceClass.prototype);
  
  // Mock all methods
  Object.getOwnPropertyNames(ServiceClass.prototype).forEach(method => {
    if (method !== 'constructor' && typeof mockInstance[method] === 'function') {
      mockInstance[method] = jest.fn();
    }
  });

  // Set up common method implementations
  mockInstance.initialize = jest.fn().mockResolvedValue(undefined);
  mockInstance.shutdown = jest.fn().mockResolvedValue(undefined);
  mockInstance.getHealthStatus = jest.fn().mockReturnValue({
    healthy: true,
    name: ServiceClass.name,
    errors: [],
    metrics: {}
  });

  return mockInstance;
};

// Usage
const mockGeminiService = createMockService(GeminiService);
const mockContextManager = createMockService(ContextManager);
```

## Error Testing Patterns

### Exception Handling Tests

```typescript
describe('error handling', () => {
  it('should handle and log errors properly', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Trigger an error
    await service.performOperationThatMightFail();
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Error occurred/),
      expect.any(Error)
    );
    
    consoleErrorSpy.mockRestore();
  });

  it('should provide meaningful error messages', async () => {
    try {
      await service.performInvalidOperation();
      fail('Expected operation to throw');
    } catch (error) {
      expect(error.message).toContain('Operation failed');
      expect(error.message).toContain('reason'); // Should explain why
    }
  });

  it('should not leak sensitive information in errors', async () => {
    process.env.SECRET_TOKEN = 'super-secret-value';
    
    try {
      await service.performOperationWithSecret();
      fail('Expected operation to throw');
    } catch (error) {
      expect(error.message).not.toContain('super-secret-value');
    } finally {
      delete process.env.SECRET_TOKEN;
    }
  });
});
```

### Network Error Simulation

```typescript
describe('network resilience', () => {
  beforeEach(() => {
    // Mock network failures
    jest.spyOn(global, 'fetch').mockImplementation(() => 
      Promise.reject(new Error('Network error'))
    );
  });

  it('should retry on network failures', async () => {
    const result = await service.performNetworkOperation();
    
    expect(global.fetch).toHaveBeenCalledTimes(3); // Should retry 3 times
    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('should implement exponential backoff', async () => {
    const startTime = Date.now();
    await service.performNetworkOperation();
    const endTime = Date.now();
    
    // Should have waited for retries (1s + 2s + 4s)
    expect(endTime - startTime).toBeGreaterThan(7000);
  });
});
```

## Async Operation Testing

### Promise Handling

```typescript
describe('async operations', () => {
  it('should handle concurrent promises', async () => {
    const promises = Array(10).fill(null).map(() => 
      service.performAsyncOperation()
    );
    
    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled');
    expect(successful.length).toBe(10);
  });

  it('should timeout long-running operations', async () => {
    jest.setTimeout(1000); // Set short timeout for test
    
    await expect(service.performLongOperation())
      .rejects.toThrow('Operation timed out');
  }, 1000);

  it('should cancel pending operations on shutdown', async () => {
    const operationPromise = service.performLongOperation();
    
    // Shutdown while operation is pending
    await service.shutdown();
    
    await expect(operationPromise)
      .rejects.toThrow('Operation cancelled');
  });
});
```

### Event-driven Testing

```typescript
describe('event handling', () => {
  it('should emit events correctly', async () => {
    const eventHandler = jest.fn();
    service.on('data-processed', eventHandler);
    
    await service.processData({ test: 'data' });
    
    expect(eventHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        test: 'data',
        processed: true
      })
    );
  });

  it('should handle event listener errors', async () => {
    const errorHandler = jest.fn(() => {
      throw new Error('Event handler error');
    });
    
    service.on('data-processed', errorHandler);
    
    // Should not crash the service
    await expect(service.processData({ test: 'data' }))
      .resolves.not.toThrow();
    
    expect(errorHandler).toHaveBeenCalled();
  });
});
```

## Performance Testing

### Memory Usage Testing

```typescript
describe('memory usage', () => {
  it('should not leak memory during normal operations', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Perform many operations
    for (let i = 0; i < 1000; i++) {
      await service.processRequest({ data: `request-${i}` });
    }
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Should not increase by more than 50MB
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
  });

  it('should clean up resources properly', async () => {
    const initialResources = service.getResourceCount();
    
    // Create many resources
    for (let i = 0; i < 100; i++) {
      await service.createResource(`resource-${i}`);
    }
    
    // Clean up
    await service.cleanupResources();
    
    const finalResources = service.getResourceCount();
    expect(finalResources).toBe(initialResources);
  });
});
```

### Benchmark Testing

```typescript
describe('performance benchmarks', () => {
  it('should meet response time targets', async () => {
    const measurements: number[] = [];
    
    // Take multiple measurements for statistical significance
    for (let i = 0; i < 100; i++) {
      const startTime = process.hrtime.bigint();
      await service.performOperation();
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1_000_000;
      measurements.push(durationMs);
    }
    
    // Calculate percentiles
    measurements.sort((a, b) => a - b);
    const p50 = measurements[Math.floor(measurements.length * 0.5)];
    const p95 = measurements[Math.floor(measurements.length * 0.95)];
    const p99 = measurements[Math.floor(measurements.length * 0.99)];
    
    expect(p50).toBeLessThan(100); // 100ms P50
    expect(p95).toBeLessThan(200); // 200ms P95
    expect(p99).toBeLessThan(500); // 500ms P99
  });

  it('should handle high throughput', async () => {
    const requestCount = 1000;
    const startTime = Date.now();
    
    const promises = Array(requestCount).fill(null).map(() => 
      service.performOperation()
    );
    
    await Promise.all(promises);
    
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    const throughput = requestCount / durationSeconds;
    
    // Should handle at least 100 requests per second
    expect(throughput).toBeGreaterThan(100);
  });
});
```

## Quality Checklist

### Test Completeness
- [ ] All public methods tested
- [ ] Error conditions covered
- [ ] Edge cases identified and tested
- [ ] Async operations properly tested
- [ ] Resource cleanup verified
- [ ] Performance targets validated
- [ ] Configuration scenarios covered
- [ ] Integration points tested

### Test Quality
- [ ] Descriptive test names
- [ ] Clear arrange-act-assert structure
- [ ] Proper mock isolation
- [ ] No shared state between tests
- [ ] Consistent test data
- [ ] Proper cleanup in afterEach
- [ ] Meaningful assertions
- [ ] Good error messages

### Code Coverage
- [ ] Line coverage ≥ 85%
- [ ] Branch coverage ≥ 85%
- [ ] Function coverage ≥ 90%
- [ ] Critical paths ≥ 95%

---

*For testing strategy overview and framework details, see the [Testing Strategy](TESTING_STRATEGY.md).*