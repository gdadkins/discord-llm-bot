# API Usage Examples

This document provides practical code examples for integrating and using the Discord LLM Bot services. All examples are based on real implementation patterns used throughout the codebase.

## Table of Contents

- [BaseService Pattern](#baseservice-pattern)
- [Service Factory Usage](#service-factory-usage)
- [Configuration Management](#configuration-management)
- [Context Management](#context-management)
- [AI Service Integration](#ai-service-integration)
- [Analytics Service](#analytics-service)
- [Health Monitoring](#health-monitoring)
- [Error Handling Patterns](#error-handling-patterns)
- [Dependency Injection](#dependency-injection)
- [Testing Patterns](#testing-patterns)

## BaseService Pattern

All services extend the `BaseService` class, which provides comprehensive lifecycle management, timer handling, and health monitoring.

### Creating a Custom Service

```typescript
import { BaseService } from '../services/base/BaseService';
import { logger } from '../utils/logger';

export class CustomService extends BaseService {
  private cleanupTimer?: string;
  private connectionPool: Map<string, Connection> = new Map();

  protected getServiceName(): string {
    return 'CustomService';
  }

  protected async performInitialization(): Promise<void> {
    // Initialize resources
    await this.setupConnectionPool();
    
    // Set up managed timers
    this.cleanupTimer = this.createInterval('cleanup', () => {
      this.performCleanup();
    }, 60000); // Run every minute
    
    logger.info('Custom service initialized with connection pool');
  }

  protected async performShutdown(): Promise<void> {
    // Timers are automatically cleared by BaseService
    
    // Clean up custom resources
    for (const [id, connection] of this.connectionPool) {
      try {
        await connection.close();
        logger.debug(`Closed connection: ${id}`);
      } catch (error) {
        logger.error(`Failed to close connection ${id}:`, error);
      }
    }
    
    this.connectionPool.clear();
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      connectionCount: this.connectionPool.size,
      activeConnections: Array.from(this.connectionPool.values())
        .filter(conn => conn.isActive).length,
      lastCleanup: this.lastCleanupTime
    };
  }

  // Custom health check
  protected isHealthy(): boolean {
    return super.isHealthy() && this.connectionPool.size > 0;
  }

  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();
    
    if (this.connectionPool.size === 0) {
      errors.push('No active connections available');
    }
    
    return errors;
  }

  private async setupConnectionPool(): Promise<void> {
    // Implementation details...
  }

  private performCleanup(): void {
    // Clean up stale connections
    this.lastCleanupTime = Date.now();
  }

  private lastCleanupTime = Date.now();
}
```

### Timer Management Examples

```typescript
export class TimerExampleService extends BaseService {
  private heartbeatTimer?: string;
  private batchProcessTimer?: string;

  protected async performInitialization(): Promise<void> {
    // Heartbeat every 30 seconds
    this.heartbeatTimer = this.createInterval('heartbeat', () => {
      this.sendHeartbeat();
    }, 30000);

    // Delayed startup task
    this.createTimeout('delayed-start', () => {
      this.performDelayedInitialization();
    }, 5000);

    // Batch processing every 5 minutes
    this.batchProcessTimer = this.createInterval('batch-process', () => {
      this.processBatch();
    }, 5 * 60 * 1000);
  }

  // Check if timers are running
  public isHeartbeatActive(): boolean {
    return this.heartbeatTimer ? this.hasTimer(this.heartbeatTimer) : false;
  }

  // Manually clear specific timer
  public stopBatchProcessing(): void {
    if (this.batchProcessTimer) {
      this.clearTimer(this.batchProcessTimer);
      this.batchProcessTimer = undefined;
    }
  }

  // Get timer information
  public getTimerStatus(): Record<string, unknown> {
    return {
      totalTimers: this.getTimerCount(),
      heartbeatInfo: this.heartbeatTimer ? 
        this.getTimerInfo(this.heartbeatTimer) : null,
      batchProcessInfo: this.batchProcessTimer ? 
        this.getTimerInfo(this.batchProcessTimer) : null
    };
  }
}
```

## Service Factory Usage

The `ServiceFactory` creates and configures all services with proper dependencies.

### Basic Service Creation

```typescript
import { ServiceFactory } from '../services/interfaces/serviceFactory';
import { ConfigurationFactory } from '../config/ConfigurationFactory';

async function createServices() {
  // Load configuration
  const config = await ConfigurationFactory.createConfiguration();
  
  // Create service factory
  const factory = new ServiceFactory();
  
  // Create all services
  const services = factory.createServices(config);
  
  // Initialize services in dependency order
  const initOrder = [
    'configuration',
    'analytics', 
    'rateLimiter',
    'healthMonitor',
    'contextManager',
    'cacheManager',
    'personalityManager',
    'roastingEngine',
    'gracefulDegradation',
    'conversationManager',
    'retryHandler',
    'systemContextBuilder',
    'responseProcessingService',
    'multimodalContentHandler',
    'aiService',
    'userPreferences',
    'helpSystem',
    'behaviorAnalyzer',
    'userAnalysisService'
  ];

  for (const serviceName of initOrder) {
    const service = services.get(serviceName);
    if (service) {
      try {
        await service.initialize();
        logger.info(`Initialized ${serviceName}`);
      } catch (error) {
        logger.error(`Failed to initialize ${serviceName}:`, error);
        throw error;
      }
    }
  }

  return services;
}
```

### Custom Service Factory

```typescript
export class CustomServiceFactory extends ServiceFactory {
  // Override specific service creation
  createAnalyticsService(config: AnalyticsConfig): IAnalyticsService {
    // Custom analytics implementation
    return new CustomAnalyticsManager(config);
  }

  // Add custom service creation
  createCustomService(): ICustomService {
    return new CustomServiceImpl();
  }

  // Override service creation with custom logic
  createServices(config: BotConfiguration): Map<string, IService> {
    const services = super.createServices(config);
    
    // Add custom services
    services.set('customService', this.createCustomService());
    
    return services;
  }
}
```

## Configuration Management

### Loading and Using Configuration

```typescript
import { ConfigurationManager } from '../services/configurationManager';
import type { IConfigurationService, BotConfiguration } from '../services/interfaces';

async function configurationExample() {
  const configService: IConfigurationService = new ConfigurationManager();
  
  try {
    // Initialize configuration service
    await configService.initialize();
    
    // Get current configuration
    const config: BotConfiguration = configService.getConfiguration();
    
    // Access specific configuration sections
    const geminiConfig = config.gemini;
    const rateLimitConfig = config.rateLimiting;
    const featureConfig = config.features;
    
    console.log(`Bot version: ${config.version}`);
    console.log(`Gemini model: ${geminiConfig.modelName}`);
    console.log(`Rate limit: ${rateLimitConfig.rpm} RPM`);
    
    // Update configuration
    const newConfig = {
      ...config,
      gemini: {
        ...config.gemini,
        temperature: 0.8
      }
    };
    
    await configService.updateConfiguration(newConfig);
    
    // Validate configuration
    const validationResult = configService.validateConfiguration(newConfig);
    if (!validationResult.isValid) {
      console.error('Configuration errors:', validationResult.errors);
    }
    
  } catch (error) {
    console.error('Configuration error:', error);
  }
}
```

### Environment-Based Configuration

```typescript
import { ConfigurationFactory } from '../config/ConfigurationFactory';

// Create configuration from environment
const config = await ConfigurationFactory.createConfiguration();

// Access environment-specific settings
if (process.env.NODE_ENV === 'development') {
  config.gemini.temperature = 0.9; // More creative in dev
  config.features.monitoring.detailedLogging = true;
}

// Validate required environment variables
const requiredEnvVars = [
  'DISCORD_TOKEN',
  'GOOGLE_API_KEY',
  'GEMINI_MODEL'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
```

## Context Management

### Managing Conversation Context

```typescript
import { ContextManager } from '../services/contextManager';
import type { IContextManager, ServerContext } from '../services/interfaces';

async function contextExample(contextManager: IContextManager) {
  const serverId = 'server_123';
  const userId = 'user_456';
  
  // Initialize server context
  contextManager.initializeServerContext(serverId);
  
  // Add context data
  contextManager.addEmbarrassingMoment(
    serverId, 
    userId, 
    'Asked how to exit vim for the 10th time this week'
  );
  
  contextManager.addCodeSnippet(
    serverId,
    userId,
    'How do I reverse a string in Python?',
    'return string[::-1]'
  );
  
  contextManager.addRunningGag(
    serverId,
    'Everyone pretends to understand quantum computing'
  );
  
  contextManager.addSummarizedFact(
    serverId,
    'Team prefers TypeScript over JavaScript',
    8 // High importance
  );
  
  // Build smart context for AI
  const contextData = contextManager.buildSmartContext(
    serverId,
    userId,
    'Can you help me with Python again?'
  );
  
  console.log('Context for AI:', contextData);
  
  // Get server context for inspection
  const serverContext: ServerContext | undefined = 
    contextManager.getServerContext(serverId);
  
  if (serverContext) {
    console.log(`Server has ${serverContext.runningGags.length} running gags`);
    console.log(`User has ${serverContext.embarrassingMoments.get(userId)?.length || 0} embarrassing moments`);
  }
}
```

### Context Optimization

```typescript
async function optimizeContext(contextManager: IContextManager) {
  const serverId = 'server_123';
  
  // Summarize and compress context when it gets too large
  const compressionResult = await contextManager.summarizeAndCompress(serverId);
  console.log(`Compression: removed ${compressionResult.removed}, kept ${compressionResult.kept}`);
  
  // Remove duplicate entries
  const deduplicationResult = contextManager.deduplicateServerContext(serverId);
  console.log(`Deduplication: removed ${deduplicationResult.removed} duplicates`);
  console.log('Duplicate examples:', deduplicationResult.duplicates);
  
  // Export context for backup or analysis
  const exportData = await contextManager.exportServerContext(serverId);
  console.log('Exported context size:', JSON.stringify(exportData).length);
}
```

## AI Service Integration

### Basic AI Service Usage

```typescript
import { GeminiService } from '../services/gemini';
import type { IAIService } from '../services/interfaces';

async function aiServiceExample(aiService: IAIService) {
  const userId = 'user_123';
  const serverId = 'server_456';
  const message = 'Explain quantum computing in simple terms';
  
  try {
    // Generate response with context
    const response = await aiService.generateResponse(
      message,
      userId,
      serverId,
      async (chunk) => {
        // Streaming callback for real-time responses
        console.log('Streaming chunk:', chunk);
      }
    );
    
    console.log('Full response:', response);
    
    // Generate response with specific options
    const customResponse = await aiService.generateResponseWithOptions(
      message,
      userId,
      serverId,
      {
        temperature: 0.7,
        maxTokens: 1000,
        enableThinking: true,
        forceRoast: false
      }
    );
    
    // Get conversation statistics
    const stats = aiService.getConversationStats();
    console.log('Conversation stats:', stats);
    
    // Get user-specific statistics
    const userStats = aiService.getUserStats(userId);
    console.log('User stats:', userStats);
    
  } catch (error) {
    console.error('AI service error:', error);
    
    // Handle specific error types
    if (error.message.includes('rate limit')) {
      console.log('Rate limited, should retry later');
    } else if (error.message.includes('quota')) {
      console.log('API quota exceeded');
    }
  }
}
```

### Advanced AI Service Features

```typescript
async function advancedAIExample(aiService: IAIService) {
  const userId = 'user_123';
  const serverId = 'server_456';
  
  // Check if user should be roasted
  const shouldRoast = await aiService.shouldRoastUser(userId, serverId);
  console.log('Should roast user:', shouldRoast);
  
  // Generate roast with context
  if (shouldRoast) {
    const roast = await aiService.generateRoast(userId, serverId);
    console.log('Generated roast:', roast);
  }
  
  // Handle multimodal content
  const imageUrl = 'https://example.com/image.jpg';
  const multimodalResponse = await aiService.generateResponse(
    'What do you see in this image?',
    userId,
    serverId,
    undefined, // No streaming
    [{ type: 'image', url: imageUrl }]
  );
  
  // Clear user context if needed
  await aiService.clearUserContext(userId, serverId);
  
  // Get service health
  const health = await aiService.getHealthStatus();
  console.log('AI service health:', health);
}
```

## Analytics Service

### Tracking User Engagement

```typescript
import { AnalyticsManager } from '../services/analyticsManager';
import type { IAnalyticsService } from '../services/interfaces';

async function analyticsExample(analytics: IAnalyticsService) {
  const userId = 'user_123';
  const serverId = 'server_456';
  
  // Check if analytics is enabled
  if (!analytics.isEnabled()) {
    console.log('Analytics is disabled');
    return;
  }
  
  // Track user engagement
  await analytics.trackUserEngagement(userId, serverId, 'mention');
  await analytics.trackUserEngagement(userId, serverId, 'command');
  await analytics.trackUserEngagement(userId, serverId, 'reaction');
  
  // Track command usage
  const startTime = Date.now();
  try {
    // ... execute command ...
    const duration = Date.now() - startTime;
    
    await analytics.trackCommandUsage({
      commandName: 'help',
      userHash: userId,
      serverHash: serverId,
      success: true,
      durationMs: duration
    });
  } catch (error) {
    await analytics.trackCommandUsage({
      commandName: 'help',
      userHash: userId,
      serverHash: serverId,
      success: false,
      durationMs: Date.now() - startTime
    });
  }
  
  // Track errors
  await analytics.trackError(
    'api_error',
    'Gemini API timeout',
    { 
      endpoint: '/generate',
      userId,
      serverId 
    }
  );
  
  // Get analytics reports
  const report = await analytics.generateReport('weekly');
  console.log('Weekly analytics report:', report);
  
  // Get user engagement metrics
  const userMetrics = await analytics.getUserEngagementMetrics(userId);
  console.log('User engagement:', userMetrics);
}
```

### Privacy-Compliant Analytics

```typescript
async function privacyAnalyticsExample(analytics: IAnalyticsService) {
  // Configure privacy settings
  const privacyConfig = {
    anonymizeUserIds: true,
    retentionDays: 30,
    allowCrossServerAnalysis: false
  };
  
  // Track with privacy settings
  await analytics.trackUserEngagement(
    'hashed_user_id', // Pre-hashed for privacy
    'hashed_server_id',
    'mention'
  );
  
  // Export user data (GDPR compliance)
  const userData = await analytics.exportUserData('user_123');
  console.log('User data export:', userData);
  
  // Delete user data (GDPR compliance)
  await analytics.deleteUserData('user_123');
  
  // Generate aggregated, anonymous reports
  const anonymousReport = await analytics.generateAnonymousReport();
  console.log('Anonymous analytics:', anonymousReport);
}
```

## Health Monitoring

### Monitoring Service Health

```typescript
import { HealthMonitor } from '../services/healthMonitor';
import type { IHealthMonitor } from '../services/interfaces';

async function healthMonitoringExample(healthMonitor: IHealthMonitor) {
  // Get current metrics
  const metrics = await healthMonitor.getCurrentMetrics();
  console.log('Current metrics:', {
    memoryUsage: `${(metrics.memoryUsage.rss / 1024 / 1024).toFixed(1)}MB`,
    apiHealth: metrics.apiHealth,
    responseTime: `${metrics.responseTime.p50}ms median`,
    errorRate: `${(metrics.errorRate * 100).toFixed(2)}%`
  });
  
  // Check specific API health
  if (!metrics.apiHealth.gemini) {
    console.warn('Gemini API is unhealthy');
  }
  
  if (!metrics.apiHealth.discord) {
    console.warn('Discord API is unhealthy');
  }
  
  // Get historical metrics
  const history = await healthMonitor.getMetricHistory('responseTime', 3600); // Last hour
  console.log('Response time history:', history);
  
  // Set up health alerts
  healthMonitor.setHealthThresholds({
    maxMemoryUsageMB: 500,
    maxResponseTimeMs: 5000,
    maxErrorRate: 0.1 // 10%
  });
  
  // Register health alert callback
  healthMonitor.onHealthAlert((alert) => {
    console.error('Health alert:', alert);
    
    switch (alert.type) {
      case 'memory':
        console.log('Consider restarting or optimizing memory usage');
        break;
      case 'response_time':
        console.log('API responses are too slow');
        break;
      case 'error_rate':
        console.log('Too many errors occurring');
        break;
    }
  });
}
```

### Custom Health Checks

```typescript
async function customHealthChecks(healthMonitor: IHealthMonitor) {
  // Add custom health check
  healthMonitor.addCustomHealthCheck('database', async () => {
    try {
      // Check database connectivity
      await database.ping();
      return { healthy: true, metrics: { latencyMs: 50 } };
    } catch (error) {
      return { 
        healthy: false, 
        error: error.message,
        metrics: { lastError: Date.now() }
      };
    }
  });
  
  // Add external service health check
  healthMonitor.addCustomHealthCheck('external_api', async () => {
    try {
      const response = await fetch('https://api.example.com/health');
      const isHealthy = response.ok;
      
      return {
        healthy: isHealthy,
        metrics: {
          statusCode: response.status,
          responseTimeMs: Date.now() - startTime
        }
      };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  });
  
  // Run all health checks
  const allHealthStatus = await healthMonitor.runAllHealthChecks();
  console.log('All health checks:', allHealthStatus);
}
```

## Error Handling Patterns

### Service-Level Error Handling

```typescript
import { ServiceInitializationError } from '../services/interfaces';

async function errorHandlingExample() {
  try {
    const service = new CustomService();
    await service.initialize();
    
    // Use service...
    
  } catch (error) {
    if (error instanceof ServiceInitializationError) {
      logger.error('Service failed to initialize:', error.message);
      
      // Attempt graceful degradation
      await handleServiceInitializationFailure(error);
    } else {
      logger.error('Unexpected error:', error);
      throw error;
    }
  }
}

async function handleServiceInitializationFailure(error: ServiceInitializationError) {
  // Log detailed error information
  logger.error('Service initialization failed:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  // Notify monitoring systems
  await notifyMonitoring('service_init_failure', {
    service: error.message,
    error: error.message
  });
  
  // Attempt alternative service configuration
  try {
    const fallbackService = new FallbackService();
    await fallbackService.initialize();
    return fallbackService;
  } catch (fallbackError) {
    logger.error('Fallback service also failed:', fallbackError);
    throw new Error('All service initialization attempts failed');
  }
}
```

### Retry Patterns

```typescript
import { RetryHandler } from '../services/retryHandler';
import type { IRetryHandler } from '../services/interfaces';

async function retryPatternExample(retryHandler: IRetryHandler) {
  // Simple retry with exponential backoff
  const result = await retryHandler.executeWithRetry(
    async () => {
      const response = await fetch('https://api.example.com/data');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    },
    {
      maxRetries: 3,
      baseDelayMs: 1000,
      multiplier: 2.0,
      jitter: true
    }
  );
  
  // Conditional retry with custom logic
  const conditionalResult = await retryHandler.executeWithRetry(
    async () => {
      return await riskyOperation();
    },
    {
      maxRetries: 5,
      shouldRetry: (error: Error, attempt: number) => {
        // Only retry on specific errors
        if (error.message.includes('timeout')) return true;
        if (error.message.includes('rate limit') && attempt < 3) return true;
        return false;
      },
      onRetry: (error: Error, attempt: number) => {
        logger.warn(`Retry attempt ${attempt} after error: ${error.message}`);
      }
    }
  );
}
```

## Dependency Injection

### Using Service Registry

```typescript
import { ServiceRegistry } from '../services/interfaces/serviceRegistry';
import type { IServiceRegistry, IAIService, IAnalyticsService } from '../services/interfaces';

async function dependencyInjectionExample() {
  const registry: IServiceRegistry = new ServiceRegistry();
  
  // Register services
  registry.register('aiService', new GeminiService(/* dependencies */));
  registry.register('analytics', new AnalyticsManager('./data/analytics.db'));
  
  // Initialize all services
  await registry.initializeAll();
  
  // Get services with type safety
  const aiService = registry.getRequired<IAIService>('aiService');
  const analytics = registry.get<IAnalyticsService>('analytics');
  
  // Use services
  if (analytics) {
    await analytics.trackUserEngagement('user123', 'server456', 'mention');
  }
  
  const response = await aiService.generateResponse(
    'Hello world',
    'user123',
    'server456'
  );
  
  // Check overall health
  const isHealthy = await registry.isHealthy();
  console.log('All services healthy:', isHealthy);
  
  if (!isHealthy) {
    const statuses = await registry.getHealthStatus();
    for (const [name, status] of statuses) {
      if (!status.healthy) {
        console.error(`${name} is unhealthy:`, status.errors);
      }
    }
  }
  
  // Shutdown all services
  await registry.shutdownAll();
}
```

### Custom Dependency Injection

```typescript
class CustomApplication {
  private services: Map<string, IService> = new Map();
  
  constructor(
    private aiService: IAIService,
    private analytics: IAnalyticsService,
    private contextManager: IContextManager
  ) {
    this.services.set('ai', aiService);
    this.services.set('analytics', analytics);
    this.services.set('context', contextManager);
  }
  
  async initialize(): Promise<void> {
    // Initialize services in dependency order
    const initOrder = ['analytics', 'context', 'ai'];
    
    for (const serviceName of initOrder) {
      const service = this.services.get(serviceName);
      if (service) {
        await service.initialize();
      }
    }
  }
  
  async processMessage(message: string, userId: string, serverId: string): Promise<string> {
    // Use injected dependencies
    const context = this.contextManager.buildSmartContext(serverId, userId, message);
    
    const response = await this.aiService.generateResponse(
      message,
      userId,
      serverId
    );
    
    if (this.analytics.isEnabled()) {
      await this.analytics.trackUserEngagement(userId, serverId, 'message');
    }
    
    return response;
  }
  
  async shutdown(): Promise<void> {
    // Shutdown in reverse order
    const shutdownOrder = ['ai', 'context', 'analytics'];
    
    for (const serviceName of shutdownOrder) {
      const service = this.services.get(serviceName);
      if (service) {
        await service.shutdown();
      }
    }
  }
}
```

## Testing Patterns

### Service Unit Testing

```typescript
import { jest } from '@jest/globals';
import { CustomService } from '../services/customService';

describe('CustomService', () => {
  let service: CustomService;
  
  beforeEach(async () => {
    service = new CustomService();
  });
  
  afterEach(async () => {
    await service.shutdown();
  });
  
  it('should initialize successfully', async () => {
    await service.initialize();
    
    const health = service.getHealthStatus();
    expect(health.healthy).toBe(true);
    expect(health.name).toBe('CustomService');
  });
  
  it('should handle initialization failure', async () => {
    // Mock a failure condition
    jest.spyOn(service as any, 'setupConnectionPool')
      .mockRejectedValue(new Error('Connection failed'));
    
    await expect(service.initialize()).rejects.toThrow('Connection failed');
    
    const health = service.getHealthStatus();
    expect(health.healthy).toBe(false);
  });
  
  it('should clean up timers on shutdown', async () => {
    await service.initialize();
    
    // Verify timers are created
    expect(service.getTimerCount()).toBeGreaterThan(0);
    
    await service.shutdown();
    
    // Verify timers are cleaned up
    expect(service.getTimerCount()).toBe(0);
  });
});
```

### Integration Testing

```typescript
import { ServiceFactory } from '../services/interfaces/serviceFactory';
import { ConfigurationFactory } from '../config/ConfigurationFactory';

describe('Service Integration', () => {
  let services: Map<string, IService>;
  
  beforeAll(async () => {
    const config = await ConfigurationFactory.createConfiguration();
    const factory = new ServiceFactory();
    services = factory.createServices(config);
    
    // Initialize services
    for (const service of services.values()) {
      await service.initialize();
    }
  });
  
  afterAll(async () => {
    // Shutdown services
    for (const service of services.values()) {
      await service.shutdown();
    }
  });
  
  it('should have all required services', () => {
    expect(services.has('aiService')).toBe(true);
    expect(services.has('analytics')).toBe(true);
    expect(services.has('contextManager')).toBe(true);
    expect(services.has('healthMonitor')).toBe(true);
  });
  
  it('should process messages end-to-end', async () => {
    const aiService = services.get('aiService') as IAIService;
    const analytics = services.get('analytics') as IAnalyticsService;
    
    const response = await aiService.generateResponse(
      'Hello world',
      'test_user',
      'test_server'
    );
    
    expect(response).toBeTruthy();
    expect(typeof response).toBe('string');
    
    // Verify analytics tracking
    if (analytics.isEnabled()) {
      const userMetrics = await analytics.getUserEngagementMetrics('test_user');
      expect(userMetrics).toBeDefined();
    }
  });
});
```

### Mock Service Patterns

```typescript
import type { IAIService, IAnalyticsService } from '../services/interfaces';

// Mock AI Service for testing
export class MockAIService implements IAIService {
  private initialized = false;
  
  async initialize(): Promise<void> {
    this.initialized = true;
  }
  
  async shutdown(): Promise<void> {
    this.initialized = false;
  }
  
  getHealthStatus() {
    return {
      healthy: this.initialized,
      name: 'MockAIService',
      errors: this.initialized ? [] : ['Not initialized']
    };
  }
  
  async generateResponse(message: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('Service not initialized');
    }
    return `Mock response to: ${message}`;
  }
  
  // Implement other required methods with mocks...
}

// Mock Analytics Service
export class MockAnalyticsService implements IAnalyticsService {
  private events: Array<{ type: string; data: any }> = [];
  
  isEnabled(): boolean {
    return true;
  }
  
  async trackUserEngagement(userId: string, serverId: string | null, type: string): Promise<void> {
    this.events.push({ type: 'engagement', data: { userId, serverId, type } });
  }
  
  getTrackedEvents() {
    return this.events;
  }
  
  clearEvents() {
    this.events = [];
  }
  
  // Implement other required methods...
}

// Usage in tests
describe('Component with Dependencies', () => {
  let mockAI: MockAIService;
  let mockAnalytics: MockAnalyticsService;
  
  beforeEach(() => {
    mockAI = new MockAIService();
    mockAnalytics = new MockAnalyticsService();
  });
  
  it('should work with mocked services', async () => {
    await mockAI.initialize();
    
    const response = await mockAI.generateResponse('test message');
    expect(response).toBe('Mock response to: test message');
    
    await mockAnalytics.trackUserEngagement('user123', 'server456', 'test');
    expect(mockAnalytics.getTrackedEvents()).toHaveLength(1);
  });
});
```

## Best Practices Summary

1. **Always extend BaseService** for consistent lifecycle management
2. **Use ServiceFactory** for dependency injection and configuration
3. **Implement comprehensive error handling** with specific error types
4. **Follow the initialization order** for services with dependencies
5. **Use health monitoring** to track service status
6. **Implement graceful shutdown** in all services
7. **Write comprehensive tests** with proper mocking
8. **Handle async operations properly** with appropriate error handling
9. **Use configuration management** for environment-specific settings
10. **Implement retry patterns** for resilient operations

For more information, see the [Service Integration Guide](./SERVICE_INTEGRATION_GUIDE.md) and [Architecture Documentation](./ARCHITECTURE.md).