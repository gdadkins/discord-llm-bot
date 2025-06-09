# Service Interface Contracts

This document provides comprehensive service interface contracts, implementation guidelines, and testing patterns for the Discord LLM Bot's service architecture.

## Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [Core Service Contracts](#core-service-contracts)
4. [Service Categories](#service-categories)
5. [Implementation Guidelines](#implementation-guidelines)
6. [Dependency Injection Patterns](#dependency-injection-patterns)
7. [Testing Strategies](#testing-strategies)
8. [Error Handling Contracts](#error-handling-contracts)
9. [Performance Contracts](#performance-contracts)
10. [Versioning and Compatibility](#versioning-and-compatibility)

## Overview

The service architecture is built on well-defined contracts that ensure:

- **Predictable Behavior**: All services follow consistent patterns
- **Type Safety**: Full TypeScript support with compile-time guarantees
- **Testability**: Clear interfaces enable comprehensive testing
- **Maintainability**: Separation of concerns and loose coupling
- **Reliability**: Robust error handling and graceful degradation

## Design Principles

### 1. Interface Segregation Principle (ISP)
Services depend only on the interfaces they need, not on monolithic interfaces.

```typescript
// ✅ Good: Focused interfaces
interface IAnalyticsTracker {
  trackCommandUsage(event: CommandUsageEvent): Promise<void>;
}

interface IAnalyticsReporter {
  generateReport(period: 'daily' | 'weekly'): Promise<AnalyticsReport>;
}

// ❌ Bad: Monolithic interface
interface IAnalytics {
  trackCommandUsage(event: CommandUsageEvent): Promise<void>;
  generateReport(period: string): Promise<AnalyticsReport>;
  managePrivacy(userId: string): Promise<void>;
  // ... many more unrelated methods
}
```

### 2. Dependency Inversion Principle (DIP)
High-level modules depend on abstractions, not concrete implementations.

```typescript
// ✅ Good: Depend on interface
class ChatService {
  constructor(private aiService: IAIService) {}
}

// ❌ Bad: Depend on concrete class
class ChatService {
  constructor(private geminiService: GeminiService) {}
}
```

### 3. Contract-First Design
Interfaces define expected behavior, error conditions, and side effects.

```typescript
interface IService {
  /**
   * Initializes the service
   * 
   * ## Contract
   * - MUST be idempotent
   * - MUST throw ServiceInitializationError on failure
   * - SHOULD validate all dependencies
   */
  initialize(): Promise<void>;
}
```

## Core Service Contracts

### Base Service Interface (IService)

All services MUST implement the base `IService` interface:

```typescript
interface IService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getHealthStatus(): ServiceHealthStatus | Promise<ServiceHealthStatus>;
}
```

#### Lifecycle Contract

1. **Uninitialized State**: Services start uninitialized
2. **Initialization**: `initialize()` must be called before use
3. **Operational State**: Service is ready for operations
4. **Shutdown**: `shutdown()` releases all resources
5. **Disposed State**: Service cannot be reused after shutdown

#### Implementation Requirements

```typescript
class MyService implements IService {
  private initialized = false;
  private shuttingDown = false;

  async initialize(): Promise<void> {
    if (this.initialized) return; // Idempotent
    
    try {
      // Validate dependencies
      // Set up resources
      this.initialized = true;
    } catch (error) {
      throw new ServiceInitializationError('MyService', error.message);
    }
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return; // Prevent double shutdown
    this.shuttingDown = true;
    
    // Release resources (never throw)
    try {
      // Cleanup logic
    } catch (error) {
      console.error('Shutdown error:', error);
    }
  }

  getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.initialized && !this.shuttingDown,
      name: 'MyService',
      errors: [],
      metrics: {}
    };
  }
}
```

### Service Registry Contract (IServiceRegistry)

The service registry manages service lifecycle and dependencies:

```typescript
interface IServiceRegistry {
  register<T extends IService>(name: string, service: T): void;
  get<T extends IService>(name: string): T | undefined;
  getRequired<T extends IService>(name: string): T;
  initializeAll(): Promise<void>;
  shutdownAll(): Promise<void>;
  getHealthStatus(): Promise<Map<string, ServiceHealthStatus>>;
  isHealthy(): Promise<boolean>;
}
```

#### Registration Contract

```typescript
// Services are registered but NOT initialized
registry.register('database', new DatabaseService());
registry.register('api', new ApiService());

// Dependencies are resolved during initialization
await registry.initializeAll();
```

#### Dependency Resolution

Services are initialized in dependency order. If Service A depends on Service B, Service B is initialized first.

## Service Categories

### 1. Core Services

Essential services that form the foundation:

- **IService**: Base interface for all services
- **IServiceRegistry**: Service lifecycle management
- **IConfigurationService**: Configuration management
- **IHealthMonitor**: System health monitoring

### 2. Business Logic Services

Domain-specific services:

- **IAIService**: AI/LLM text generation
- **IAnalyticsService**: Usage tracking and reporting
- **IContextManager**: Conversation memory management
- **IRoastingEngine**: Personality and mood system

### 3. Infrastructure Services

Support services for system operations:

- **ICacheManager**: Performance optimization
- **IRateLimiter**: API quota management
- **IGracefulDegradation**: Circuit breaker patterns
- **IRetryHandler**: Error recovery

### 4. Integration Services

External system interfaces:

- **Discord Client**: Discord API integration
- **Gemini API**: Google AI integration
- **Data Store**: Persistence layer

## Implementation Guidelines

### Service Implementation Checklist

- [ ] Implements base `IService` interface
- [ ] Validates dependencies in `initialize()`
- [ ] Handles errors gracefully
- [ ] Provides meaningful health status
- [ ] Releases resources in `shutdown()`
- [ ] Includes comprehensive JSDoc documentation
- [ ] Has corresponding unit tests
- [ ] Follows naming conventions

### Example Service Implementation

```typescript
/**
 * Example service implementation following all contracts
 */
export class ExampleService implements IExampleService {
  private initialized = false;
  private dependencies: {
    config: IConfigurationService;
    logger: ILogger;
  };

  constructor(
    private config: IConfigurationService,
    private logger: ILogger
  ) {
    this.dependencies = { config, logger };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('ExampleService already initialized');
      return;
    }

    try {
      // Validate dependencies
      this.validateDependencies();
      
      // Validate configuration
      const config = this.config.getExampleConfig();
      this.validateConfiguration(config);
      
      // Initialize resources
      await this.setupResources();
      
      this.initialized = true;
      this.logger.info('ExampleService initialized successfully');
    } catch (error) {
      this.logger.error('ExampleService initialization failed:', error);
      throw new ServiceInitializationError('ExampleService', error.message);
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.cleanupResources();
      this.initialized = false;
      this.logger.info('ExampleService shut down successfully');
    } catch (error) {
      this.logger.error('ExampleService shutdown error:', error);
      // Don't throw during shutdown
    }
  }

  getHealthStatus(): ServiceHealthStatus {
    const errors: string[] = [];
    
    if (!this.initialized) {
      errors.push('Service not initialized');
    }

    // Add specific health checks
    if (!this.checkDatabaseConnection()) {
      errors.push('Database connection failed');
    }

    return {
      healthy: errors.length === 0,
      name: 'ExampleService',
      errors,
      metrics: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed
      }
    };
  }

  private validateDependencies(): void {
    Object.entries(this.dependencies).forEach(([name, service]) => {
      if (!service) {
        throw new ServiceDependencyError('ExampleService', name);
      }
    });
  }

  private validateConfiguration(config: ExampleConfig): void {
    if (!config.apiKey) {
      throw new ServiceConfigurationError('ExampleService', 'Missing API key');
    }
  }

  private async setupResources(): Promise<void> {
    // Initialize resources
  }

  private async cleanupResources(): Promise<void> {
    // Clean up resources
  }

  private checkDatabaseConnection(): boolean {
    // Health check logic
    return true;
  }
}
```

## Dependency Injection Patterns

### Constructor Injection (Recommended)

```typescript
class ChatService implements IChatService {
  constructor(
    private aiService: IAIService,
    private contextManager: IContextManager,
    private rateLimiter: IRateLimiter
  ) {}
}
```

### Service Registry Injection

```typescript
class ChatService implements IChatService {
  private aiService: IAIService;
  private contextManager: IContextManager;

  async initialize(): Promise<void> {
    this.aiService = this.registry.getRequired<IAIService>('aiService');
    this.contextManager = this.registry.getRequired<IContextManager>('contextManager');
  }
}
```

### Factory Pattern

```typescript
interface IServiceFactory {
  createChatService(): IChatService;
  createAnalyticsService(): IAnalyticsService;
}

class ServiceFactory implements IServiceFactory {
  constructor(private registry: IServiceRegistry) {}

  createChatService(): IChatService {
    return new ChatService(
      this.registry.getRequired<IAIService>('aiService'),
      this.registry.getRequired<IContextManager>('contextManager')
    );
  }
}
```

## Testing Strategies

### Interface Mocking

```typescript
// Create mock that implements interface
const mockAIService: jest.Mocked<IAIService> = {
  initialize: jest.fn().mockResolvedValue(undefined),
  shutdown: jest.fn().mockResolvedValue(undefined),
  getHealthStatus: jest.fn().mockReturnValue({
    healthy: true,
    name: 'MockAIService',
    errors: []
  }),
  generateResponse: jest.fn().mockResolvedValue('mock response')
};
```

### Service Testing Pattern

```typescript
describe('ChatService', () => {
  let chatService: ChatService;
  let mockAIService: jest.Mocked<IAIService>;
  let mockContextManager: jest.Mocked<IContextManager>;

  beforeEach(async () => {
    // Setup mocks
    mockAIService = createMockAIService();
    mockContextManager = createMockContextManager();
    
    // Create service with mocks
    chatService = new ChatService(mockAIService, mockContextManager);
    await chatService.initialize();
  });

  afterEach(async () => {
    await chatService.shutdown();
    jest.clearAllMocks();
  });

  describe('generateResponse', () => {
    it('should generate response using AI service', async () => {
      // Arrange
      const prompt = 'Hello';
      const expectedResponse = 'Hi there!';
      mockAIService.generateResponse.mockResolvedValue(expectedResponse);

      // Act
      const result = await chatService.generateResponse(prompt, 'user123');

      // Assert
      expect(result).toBe(expectedResponse);
      expect(mockAIService.generateResponse).toHaveBeenCalledWith(
        prompt,
        'user123',
        expect.any(Object)
      );
    });

    it('should handle AI service errors gracefully', async () => {
      // Arrange
      mockAIService.generateResponse.mockRejectedValue(
        new Error('AI service error')
      );

      // Act & Assert
      await expect(
        chatService.generateResponse('Hello', 'user123')
      ).rejects.toThrow('AI service error');
    });
  });

  describe('health status', () => {
    it('should report healthy when dependencies are healthy', () => {
      // Arrange
      mockAIService.getHealthStatus.mockReturnValue({
        healthy: true,
        name: 'AIService',
        errors: []
      });

      // Act
      const health = chatService.getHealthStatus();

      // Assert
      expect(health.healthy).toBe(true);
    });

    it('should report unhealthy when dependencies are unhealthy', () => {
      // Arrange
      mockAIService.getHealthStatus.mockReturnValue({
        healthy: false,
        name: 'AIService',
        errors: ['Connection failed']
      });

      // Act
      const health = chatService.getHealthStatus();

      // Assert
      expect(health.healthy).toBe(false);
      expect(health.errors).toContain('AIService: Connection failed');
    });
  });
});
```

### Integration Testing

```typescript
describe('Service Integration', () => {
  let registry: IServiceRegistry;

  beforeEach(async () => {
    registry = new ServiceRegistry();
    
    // Register real services
    registry.register('config', new ConfigurationService());
    registry.register('aiService', new GeminiService());
    registry.register('chatService', new ChatService());
    
    await registry.initializeAll();
  });

  afterEach(async () => {
    await registry.shutdownAll();
  });

  it('should handle end-to-end chat flow', async () => {
    const chatService = registry.getRequired<IChatService>('chatService');
    
    const response = await chatService.generateResponse(
      'Hello, how are you?',
      'user123',
      'server456'
    );
    
    expect(response).toBeDefined();
    expect(typeof response).toBe('string');
  });
});
```

## Error Handling Contracts

### Error Hierarchy

```typescript
// Base service error
class ServiceError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Specific error types
class ServiceInitializationError extends ServiceError {}
class ServiceNotFoundError extends ServiceError {}
class ServiceDependencyError extends ServiceError {}
class ServiceConfigurationError extends ServiceError {}
```

### Error Handling Patterns

```typescript
// Service methods should handle errors appropriately
class ExampleService implements IExampleService {
  async performOperation(input: string): Promise<string> {
    try {
      // Validate input
      if (!input) {
        throw new ValidationError('Input is required');
      }

      // Perform operation
      const result = await this.processInput(input);
      return result;
    } catch (error) {
      // Log error
      this.logger.error('Operation failed:', error);

      // Re-throw with context
      if (error instanceof ValidationError) {
        throw error; // Don't wrap validation errors
      }

      throw new ServiceError(
        `Failed to perform operation: ${error.message}`,
        'OPERATION_FAILED'
      );
    }
  }
}
```

### Graceful Degradation

```typescript
class ExampleService implements IExampleService {
  async performOptionalOperation(): Promise<string | null> {
    try {
      return await this.performOperation();
    } catch (error) {
      // Log error but don't fail
      this.logger.warn('Optional operation failed:', error);
      return null;
    }
  }

  async performCriticalOperation(): Promise<string> {
    try {
      return await this.performOperation();
    } catch (error) {
      // Critical operations should fail fast
      this.logger.error('Critical operation failed:', error);
      throw error;
    }
  }
}
```

## Performance Contracts

### Response Time Requirements

- **Health Checks**: < 100ms
- **Configuration Operations**: < 500ms
- **Cache Operations**: < 50ms
- **AI Generation**: < 30s (with timeout)
- **Database Operations**: < 1s

### Memory Management

```typescript
class ExampleService implements IExampleService {
  private cache = new Map<string, CachedItem>();

  async processData(data: LargeDataSet): Promise<void> {
    try {
      // Process in chunks to manage memory
      const chunks = this.chunkData(data, 1000);
      
      for (const chunk of chunks) {
        await this.processChunk(chunk);
        
        // Allow garbage collection
        if (chunks.indexOf(chunk) % 10 === 0) {
          await this.sleep(0);
        }
      }
    } finally {
      // Clean up resources
      this.clearTemporaryData();
    }
  }

  getHealthStatus(): ServiceHealthStatus {
    const memoryUsage = process.memoryUsage();
    const errors: string[] = [];

    // Check memory usage
    if (memoryUsage.heapUsed > 512 * 1024 * 1024) { // 512MB
      errors.push('High memory usage detected');
    }

    // Check cache size
    if (this.cache.size > 10000) {
      errors.push('Cache size exceeded threshold');
    }

    return {
      healthy: errors.length === 0,
      name: 'ExampleService',
      errors,
      metrics: {
        memoryUsage: memoryUsage.heapUsed,
        cacheSize: this.cache.size
      }
    };
  }
}
```

### Resource Cleanup

```typescript
class ExampleService implements IExampleService {
  private timers: NodeJS.Timeout[] = [];
  private connections: Connection[] = [];

  async initialize(): Promise<void> {
    // Setup periodic cleanup
    const cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, 60000); // Every minute

    this.timers.push(cleanupTimer);
  }

  async shutdown(): Promise<void> {
    // Clear all timers
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];

    // Close all connections
    await Promise.all(
      this.connections.map(conn => conn.close())
    );
    this.connections = [];
  }

  private performCleanup(): void {
    // Remove expired cache entries
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiry < now) {
        this.cache.delete(key);
      }
    }
  }
}
```

## Versioning and Compatibility

### Interface Versioning

```typescript
// Version 1
interface IAnalyticsService_V1 {
  trackEvent(event: string): Promise<void>;
}

// Version 2 - Backward compatible
interface IAnalyticsService_V2 extends IAnalyticsService_V1 {
  trackEventWithMetadata(event: string, metadata: Record<string, unknown>): Promise<void>;
}

// Current version alias
type IAnalyticsService = IAnalyticsService_V2;
```

### Migration Strategies

```typescript
class AnalyticsService implements IAnalyticsService {
  // Implement both versions for backward compatibility
  async trackEvent(event: string): Promise<void> {
    return this.trackEventWithMetadata(event, {});
  }

  async trackEventWithMetadata(
    event: string, 
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    // Implementation
  }
}
```

### Configuration Compatibility

```typescript
interface ConfigurationMigration {
  version: string;
  migrate(config: any): any;
}

class ConfigurationService implements IConfigurationService {
  private migrations: ConfigurationMigration[] = [
    {
      version: '1.1.0',
      migrate: (config) => ({
        ...config,
        newFeature: { enabled: false }
      })
    }
  ];

  private migrateConfiguration(config: any): any {
    let migrated = { ...config };
    
    for (const migration of this.migrations) {
      if (this.shouldApplyMigration(migrated, migration.version)) {
        migrated = migration.migrate(migrated);
      }
    }
    
    return migrated;
  }
}
```

## Best Practices Summary

### Interface Design
- ✅ Keep interfaces focused and cohesive
- ✅ Use descriptive method names
- ✅ Document contracts with JSDoc
- ✅ Include usage examples
- ✅ Specify error conditions

### Implementation
- ✅ Follow the service lifecycle contract
- ✅ Implement proper error handling
- ✅ Provide meaningful health status
- ✅ Clean up resources in shutdown
- ✅ Make operations idempotent where possible

### Testing
- ✅ Mock interfaces, not implementations
- ✅ Test contract compliance
- ✅ Include integration tests
- ✅ Test error conditions
- ✅ Verify resource cleanup

### Performance
- ✅ Keep health checks lightweight
- ✅ Implement proper resource management
- ✅ Use appropriate caching strategies
- ✅ Monitor memory usage
- ✅ Set reasonable timeouts

### Documentation
- ✅ Document all public interfaces
- ✅ Include usage examples
- ✅ Specify error conditions
- ✅ Document side effects
- ✅ Maintain up-to-date examples

This comprehensive service contract guide ensures consistent, reliable, and maintainable service implementations across the Discord LLM Bot architecture.