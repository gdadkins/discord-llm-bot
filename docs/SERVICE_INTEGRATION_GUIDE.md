# Service Integration Guide

This guide provides step-by-step instructions for integrating services into the Discord LLM Bot architecture. Follow these patterns to ensure consistent, maintainable, and robust service integration.

## Table of Contents

- [Overview](#overview)
- [Service Architecture Principles](#service-architecture-principles)
- [Step-by-Step Integration Process](#step-by-step-integration-process)
- [Dependency Injection Patterns](#dependency-injection-patterns)
- [Configuration Management](#configuration-management)
- [Health Monitoring Integration](#health-monitoring-integration)
- [Error Handling and Recovery](#error-handling-and-recovery)
- [Testing Integration](#testing-integration)
- [Performance Considerations](#performance-considerations)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting Guide](#troubleshooting-guide)

## Overview

The Discord LLM Bot uses a sophisticated service-oriented architecture with dependency injection, comprehensive health monitoring, and robust error handling. All services follow consistent patterns for initialization, operation, and shutdown.

### Key Components

- **BaseService**: Abstract foundation for all services
- **ServiceFactory**: Creates and configures services with dependencies
- **ServiceRegistry**: Manages service lifecycle and dependency resolution
- **Configuration Management**: Environment-based configuration with validation
- **Health Monitoring**: Real-time service health tracking and alerting

## Service Architecture Principles

### 1. Single Responsibility Principle
Each service has a focused responsibility and well-defined interface.

### 2. Dependency Inversion
Services depend on abstractions (interfaces), not concrete implementations.

### 3. Interface Segregation
Services expose minimal, focused interfaces for their functionality.

### 4. Consistent Lifecycle Management
All services follow the same initialize → operate → shutdown lifecycle.

### 5. Comprehensive Health Monitoring
Every service provides health status and metrics for monitoring.

## Step-by-Step Integration Process

### Step 1: Define Service Interface

Create a clear interface that extends the base service contract:

```typescript
// src/services/interfaces/MyServiceInterfaces.ts
import type { IService } from './CoreServiceInterfaces';

export interface IMyService extends IService {
  /**
   * Primary service operation
   * @param input Service-specific input
   * @returns Promise resolving to service result
   */
  performOperation(input: ServiceInput): Promise<ServiceResult>;
  
  /**
   * Service-specific configuration
   * @param config Configuration object
   */
  configure(config: MyServiceConfig): void;
  
  /**
   * Get service metrics
   * @returns Current service metrics
   */
  getMetrics(): ServiceMetrics;
}

export interface ServiceInput {
  // Define input structure
}

export interface ServiceResult {
  // Define result structure
}

export interface MyServiceConfig {
  // Define configuration structure
}

export interface ServiceMetrics {
  // Define metrics structure
}
```

### Step 2: Implement Service Class

Create the concrete service implementation extending BaseService:

```typescript
// src/services/myService.ts
import { BaseService } from './base/BaseService';
import { logger } from '../utils/logger';
import type { IMyService, ServiceInput, ServiceResult, MyServiceConfig } from './interfaces';

export class MyService extends BaseService implements IMyService {
  private config?: MyServiceConfig;
  private connectionPool: Map<string, Connection> = new Map();
  private metrics = {
    operationsCount: 0,
    successCount: 0,
    errorCount: 0,
    lastOperationTime: 0
  };

  protected getServiceName(): string {
    return 'MyService';
  }

  protected async performInitialization(): Promise<void> {
    // Validate configuration
    if (!this.config) {
      throw new Error('Service configuration is required');
    }

    // Initialize resources
    await this.initializeConnectionPool();
    
    // Set up monitoring timers
    this.createInterval('metrics-collection', () => {
      this.collectMetrics();
    }, 30000); // Every 30 seconds

    // Set up cleanup timer
    this.createInterval('cleanup', () => {
      this.performMaintenance();
    }, 300000); // Every 5 minutes

    logger.info('MyService initialized successfully', {
      connections: this.connectionPool.size,
      config: this.config
    });
  }

  protected async performShutdown(): Promise<void> {
    // Clean up connections
    for (const [id, connection] of this.connectionPool) {
      try {
        await connection.close();
        logger.debug(`Closed connection: ${id}`);
      } catch (error) {
        logger.error(`Failed to close connection ${id}:`, error);
      }
    }
    
    this.connectionPool.clear();
    logger.info('MyService shutdown completed');
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      operations: this.metrics,
      connections: {
        total: this.connectionPool.size,
        active: Array.from(this.connectionPool.values())
          .filter(conn => conn.isActive).length
      },
      timers: {
        count: this.getTimerCount()
      }
    };
  }

  // Service-specific health checks
  protected isHealthy(): boolean {
    const baseHealthy = super.isHealthy();
    const hasConnections = this.connectionPool.size > 0;
    const errorRate = this.metrics.operationsCount > 0 ? 
      this.metrics.errorCount / this.metrics.operationsCount : 0;
    
    return baseHealthy && hasConnections && errorRate < 0.1; // Less than 10% error rate
  }

  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();
    
    if (this.connectionPool.size === 0) {
      errors.push('No active connections available');
    }
    
    const errorRate = this.metrics.operationsCount > 0 ? 
      this.metrics.errorCount / this.metrics.operationsCount : 0;
    
    if (errorRate >= 0.1) {
      errors.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    }
    
    return errors;
  }

  // Interface implementation
  configure(config: MyServiceConfig): void {
    this.config = config;
    logger.info('MyService configured', { config });
  }

  async performOperation(input: ServiceInput): Promise<ServiceResult> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    const startTime = Date.now();
    this.metrics.operationsCount++;

    try {
      // Perform the actual operation
      const result = await this.executeOperation(input);
      
      this.metrics.successCount++;
      this.metrics.lastOperationTime = Date.now() - startTime;
      
      logger.debug('Operation completed successfully', {
        duration: this.metrics.lastOperationTime,
        input: input
      });
      
      return result;
    } catch (error) {
      this.metrics.errorCount++;
      logger.error('Operation failed', { error, input });
      throw error;
    }
  }

  getMetrics(): ServiceMetrics {
    return {
      operations: { ...this.metrics },
      connections: this.connectionPool.size,
      health: this.getHealthStatus()
    };
  }

  // Private helper methods
  private async initializeConnectionPool(): Promise<void> {
    // Implementation specific to service needs
  }

  private async executeOperation(input: ServiceInput): Promise<ServiceResult> {
    // Implementation specific to service needs
  }

  private collectMetrics(): void {
    // Collect additional metrics
  }

  private performMaintenance(): void {
    // Perform regular maintenance tasks
  }
}
```

### Step 3: Register Interface in Barrel Export

Add the new interface to the main interfaces index:

```typescript
// src/services/interfaces/index.ts

// Add to the barrel exports
export * from './MyServiceInterfaces';

// Update the main comment to include your service
```

### Step 4: Update Service Factory

Add service creation methods to the ServiceFactory:

```typescript
// src/services/interfaces/serviceFactory.ts

export class ServiceFactory implements IServiceFactory {
  
  // Add to createServices method
  createServices(config: BotConfiguration): Map<string, IService> {
    const services = super.createServices(config);
    
    // Create your service
    const myService = this.createMyService(config.myService);
    services.set('myService', myService);
    
    return services;
  }

  /**
   * Creates MyService instance
   */
  createMyService(config: MyServiceConfig): IMyService {
    const service = new MyService();
    service.configure(config);
    return service;
  }
}
```

### Step 5: Add Configuration Support

Update configuration interfaces and factories:

```typescript
// src/services/interfaces/ConfigurationInterfaces.ts

export interface BotConfiguration {
  // Add your service configuration
  myService: MyServiceConfig;
  
  // ... existing configurations
}

// src/config/ConfigurationFactory.ts

export class ConfigurationFactory {
  static async createConfiguration(): Promise<BotConfiguration> {
    return {
      myService: {
        // Load from environment or defaults
        enabled: process.env.MY_SERVICE_ENABLED === 'true',
        connectionLimit: parseInt(process.env.MY_SERVICE_CONNECTIONS || '10'),
        timeout: parseInt(process.env.MY_SERVICE_TIMEOUT || '5000')
      },
      // ... other configurations
    };
  }
}
```

### Step 6: Integration Testing

Create comprehensive tests for your service integration:

```typescript
// tests/integration/myService.integration.test.ts

describe('MyService Integration', () => {
  let services: Map<string, IService>;
  let myService: IMyService;

  beforeAll(async () => {
    const config = await ConfigurationFactory.createConfiguration();
    const factory = new ServiceFactory();
    services = factory.createServices(config);
    
    myService = services.get('myService') as IMyService;
    
    // Initialize all services
    for (const service of services.values()) {
      await service.initialize();
    }
  });

  afterAll(async () => {
    for (const service of services.values()) {
      await service.shutdown();
    }
  });

  it('should integrate with other services', async () => {
    const result = await myService.performOperation({
      // test input
    });
    
    expect(result).toBeDefined();
    
    const health = myService.getHealthStatus();
    expect(health.healthy).toBe(true);
  });
});
```

## Dependency Injection Patterns

### Constructor Injection

For services with hard dependencies:

```typescript
export class ServiceWithDependencies extends BaseService {
  constructor(
    private dependency1: IDependency1,
    private dependency2: IDependency2
  ) {
    super();
  }
  
  protected async performInitialization(): Promise<void> {
    // Use injected dependencies
    await this.dependency1.initialize();
    await this.dependency2.initialize();
  }
}
```

### Setter Injection

For optional or late-bound dependencies:

```typescript
export class ServiceWithSetters extends BaseService {
  private optionalDependency?: IOptionalDependency;
  
  setOptionalDependency(dependency: IOptionalDependency): void {
    this.optionalDependency = dependency;
  }
  
  protected async performInitialization(): Promise<void> {
    if (this.optionalDependency) {
      await this.optionalDependency.initialize();
    }
  }
}
```

### Service Registry Pattern

For runtime dependency resolution:

```typescript
export class ServiceRegistryExample {
  constructor(private registry: IServiceRegistry) {}
  
  async performComplexOperation(): Promise<void> {
    const aiService = this.registry.getRequired<IAIService>('aiService');
    const analytics = this.registry.get<IAnalyticsService>('analytics');
    
    const result = await aiService.generateResponse('test', 'user', 'server');
    
    if (analytics) {
      await analytics.trackUserEngagement('user', 'server', 'operation');
    }
  }
}
```

## Configuration Management

### Environment-Based Configuration

```typescript
// src/config/myServiceConfig.ts

export interface MyServiceConfig {
  enabled: boolean;
  connectionString: string;
  timeout: number;
  retryAttempts: number;
  features: {
    advancedMode: boolean;
    caching: boolean;
  };
}

export function createMyServiceConfig(): MyServiceConfig {
  return {
    enabled: process.env.MY_SERVICE_ENABLED === 'true',
    connectionString: process.env.MY_SERVICE_CONNECTION || 'default://localhost',
    timeout: parseInt(process.env.MY_SERVICE_TIMEOUT || '5000'),
    retryAttempts: parseInt(process.env.MY_SERVICE_RETRY_ATTEMPTS || '3'),
    features: {
      advancedMode: process.env.MY_SERVICE_ADVANCED === 'true',
      caching: process.env.MY_SERVICE_CACHING !== 'false' // Default true
    }
  };
}
```

### Configuration Validation

```typescript
import { z } from 'zod';

const MyServiceConfigSchema = z.object({
  enabled: z.boolean(),
  connectionString: z.string().url(),
  timeout: z.number().min(1000).max(30000),
  retryAttempts: z.number().min(0).max(10),
  features: z.object({
    advancedMode: z.boolean(),
    caching: z.boolean()
  })
});

export function validateMyServiceConfig(config: unknown): MyServiceConfig {
  try {
    return MyServiceConfigSchema.parse(config);
  } catch (error) {
    throw new Error(`Invalid MyService configuration: ${error.message}`);
  }
}
```

## Health Monitoring Integration

### Basic Health Monitoring

```typescript
export class MonitoredService extends BaseService {
  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      // Core metrics
      operationsPerSecond: this.calculateOPS(),
      averageResponseTime: this.getAverageResponseTime(),
      errorRate: this.getErrorRate(),
      
      // Resource metrics
      memoryUsage: process.memoryUsage(),
      connectionCount: this.getConnectionCount(),
      
      // Business metrics
      activeUsers: this.getActiveUserCount(),
      queueLength: this.getQueueLength(),
      
      // Custom metrics
      customMetric1: this.getCustomMetric1(),
      customMetric2: this.getCustomMetric2()
    };
  }
  
  protected isHealthy(): boolean {
    const baseHealthy = super.isHealthy();
    
    // Custom health checks
    const responseTimeOk = this.getAverageResponseTime() < 5000; // 5s max
    const errorRateOk = this.getErrorRate() < 0.05; // 5% max
    const memoryOk = this.getMemoryUsagePercent() < 0.8; // 80% max
    
    return baseHealthy && responseTimeOk && errorRateOk && memoryOk;
  }
}
```

### Advanced Health Monitoring

```typescript
export class AdvancedMonitoredService extends BaseService {
  private healthChecks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  
  protected async performInitialization(): Promise<void> {
    // Register custom health checks
    this.registerHealthCheck('database', async () => {
      try {
        await this.database.ping();
        return { healthy: true, latency: 50 };
      } catch (error) {
        return { healthy: false, error: error.message };
      }
    });
    
    this.registerHealthCheck('external-api', async () => {
      try {
        const response = await fetch('https://api.example.com/health');
        return { 
          healthy: response.ok,
          statusCode: response.status,
          responseTime: Date.now() - startTime
        };
      } catch (error) {
        return { healthy: false, error: error.message };
      }
    });
  }
  
  private registerHealthCheck(
    name: string, 
    check: () => Promise<HealthCheckResult>
  ): void {
    this.healthChecks.set(name, check);
  }
  
  async runAllHealthChecks(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    
    for (const [name, check] of this.healthChecks) {
      try {
        const result = await Promise.race([
          check(),
          new Promise<HealthCheckResult>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        results.set(name, result);
      } catch (error) {
        results.set(name, { 
          healthy: false, 
          error: error.message 
        });
      }
    }
    
    return results;
  }
}

interface HealthCheckResult {
  healthy: boolean;
  error?: string;
  [key: string]: any;
}
```

## Error Handling and Recovery

### Graceful Degradation

```typescript
export class ResilientService extends BaseService {
  private fallbackMode = false;
  private retryHandler: IRetryHandler;
  
  constructor(retryHandler: IRetryHandler) {
    super();
    this.retryHandler = retryHandler;
  }
  
  async performOperation(input: ServiceInput): Promise<ServiceResult> {
    try {
      // Try primary operation
      return await this.retryHandler.executeWithRetry(
        () => this.primaryOperation(input),
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          shouldRetry: (error) => this.shouldRetryError(error)
        }
      );
    } catch (primaryError) {
      logger.warn('Primary operation failed, attempting fallback', { 
        error: primaryError.message 
      });
      
      try {
        // Try fallback operation
        this.fallbackMode = true;
        return await this.fallbackOperation(input);
      } catch (fallbackError) {
        logger.error('Both primary and fallback operations failed', {
          primaryError: primaryError.message,
          fallbackError: fallbackError.message
        });
        throw new Error(`Operation failed: ${primaryError.message}`);
      }
    }
  }
  
  private shouldRetryError(error: Error): boolean {
    // Retry on transient errors
    return error.message.includes('timeout') ||
           error.message.includes('network') ||
           error.message.includes('503') ||
           error.message.includes('429');
  }
  
  protected isHealthy(): boolean {
    const baseHealthy = super.isHealthy();
    // Service is still healthy even in fallback mode
    return baseHealthy;
  }
  
  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();
    if (this.fallbackMode) {
      errors.push('Running in fallback mode');
    }
    return errors;
  }
}
```

### Circuit Breaker Pattern

```typescript
export class CircuitBreakerService extends BaseService {
  private circuitBreaker: CircuitBreaker;
  
  protected async performInitialization(): Promise<void> {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      timeoutDuration: 10000,
      resetTimeout: 30000,
      onStateChange: (state) => {
        logger.info(`Circuit breaker state changed to: ${state}`);
      }
    });
  }
  
  async performOperation(input: ServiceInput): Promise<ServiceResult> {
    return await this.circuitBreaker.execute(async () => {
      return await this.riskyOperation(input);
    });
  }
  
  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      ...super.collectServiceMetrics(),
      circuitBreaker: {
        state: this.circuitBreaker.getState(),
        failureCount: this.circuitBreaker.getFailureCount(),
        successCount: this.circuitBreaker.getSuccessCount(),
        lastFailureTime: this.circuitBreaker.getLastFailureTime()
      }
    };
  }
}
```

## Performance Considerations

### Caching Integration

```typescript
export class CachedService extends BaseService {
  private cache: ICacheManager;
  
  constructor(cacheManager: ICacheManager) {
    super();
    this.cache = cacheManager;
  }
  
  async performOperation(input: ServiceInput): Promise<ServiceResult> {
    const cacheKey = this.generateCacheKey(input);
    
    // Try to get from cache first
    const cached = await this.cache.get<ServiceResult>(cacheKey);
    if (cached) {
      logger.debug('Cache hit for operation', { cacheKey });
      return cached;
    }
    
    // Perform operation
    const result = await this.executeOperation(input);
    
    // Cache the result
    await this.cache.set(cacheKey, result, 300); // 5 minute TTL
    
    return result;
  }
  
  private generateCacheKey(input: ServiceInput): string {
    return `operation:${JSON.stringify(input)}`;
  }
}
```

### Connection Pooling

```typescript
export class PooledService extends BaseService {
  private connectionPool: ConnectionPool;
  
  protected async performInitialization(): Promise<void> {
    this.connectionPool = new ConnectionPool({
      min: 5,
      max: 20,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 300000
    });
  }
  
  async performOperation(input: ServiceInput): Promise<ServiceResult> {
    const connection = await this.connectionPool.acquire();
    
    try {
      return await this.executeWithConnection(connection, input);
    } finally {
      this.connectionPool.release(connection);
    }
  }
  
  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      ...super.collectServiceMetrics(),
      connectionPool: {
        size: this.connectionPool.size,
        available: this.connectionPool.available,
        pending: this.connectionPool.pending
      }
    };
  }
}
```

## Security Best Practices

### Input Validation

```typescript
export class SecureService extends BaseService {
  async performOperation(input: ServiceInput): Promise<ServiceResult> {
    // Validate input
    const validatedInput = this.validateInput(input);
    
    // Sanitize input
    const sanitizedInput = this.sanitizeInput(validatedInput);
    
    // Perform operation with validated input
    return await this.executeSecureOperation(sanitizedInput);
  }
  
  private validateInput(input: ServiceInput): ServiceInput {
    // Use schema validation (Zod, Joi, etc.)
    const schema = z.object({
      // Define input schema
    });
    
    try {
      return schema.parse(input);
    } catch (error) {
      throw new Error(`Invalid input: ${error.message}`);
    }
  }
  
  private sanitizeInput(input: ServiceInput): ServiceInput {
    // Sanitize strings, escape special characters, etc.
    return {
      ...input,
      // Apply sanitization
    };
  }
}
```

### Secure Configuration

```typescript
export class SecureConfigService extends BaseService {
  protected async performInitialization(): Promise<void> {
    // Validate sensitive configuration
    this.validateSecureConfig();
    
    // Set up secure connections
    await this.initializeSecureConnections();
  }
  
  private validateSecureConfig(): void {
    const requiredSecrets = [
      'API_KEY',
      'DATABASE_PASSWORD',
      'ENCRYPTION_KEY'
    ];
    
    for (const secret of requiredSecrets) {
      if (!process.env[secret]) {
        throw new Error(`Missing required secret: ${secret}`);
      }
      
      if (process.env[secret].length < 32) {
        throw new Error(`Secret ${secret} is too short`);
      }
    }
  }
  
  private async initializeSecureConnections(): Promise<void> {
    // Use TLS, validate certificates, etc.
  }
}
```

## Troubleshooting Guide

### Common Integration Issues

#### 1. Service Initialization Failures

**Problem**: Service fails to initialize with unclear error messages.

**Solutions**:
```typescript
// Add detailed error logging
protected async performInitialization(): Promise<void> {
  try {
    logger.info('Starting service initialization', { 
      serviceName: this.getServiceName(),
      config: this.config 
    });
    
    await this.initializeStep1();
    logger.debug('Step 1 completed');
    
    await this.initializeStep2();
    logger.debug('Step 2 completed');
    
    // ... more steps
    
  } catch (error) {
    logger.error('Service initialization failed', {
      serviceName: this.getServiceName(),
      error: error.message,
      stack: error.stack,
      config: this.config
    });
    throw error;
  }
}
```

#### 2. Dependency Resolution Issues

**Problem**: Services cannot find their dependencies.

**Solutions**:
```typescript
// In ServiceFactory
createServices(config: BotConfiguration): Map<string, IService> {
  const services = new Map<string, IService>();
  
  // Create services in dependency order
  const dependencyOrder = [
    'configuration',
    'analytics',      // No dependencies
    'rateLimiter',    // No dependencies
    'cacheManager',   // No dependencies
    'contextManager', // Depends on cacheManager
    'aiService'       // Depends on contextManager, rateLimiter, etc.
  ];
  
  for (const serviceName of dependencyOrder) {
    try {
      const service = this.createService(serviceName, config, services);
      services.set(serviceName, service);
      logger.debug(`Created service: ${serviceName}`);
    } catch (error) {
      logger.error(`Failed to create service: ${serviceName}`, error);
      throw error;
    }
  }
  
  return services;
}
```

#### 3. Health Check Failures

**Problem**: Services report unhealthy status incorrectly.

**Solutions**:
```typescript
protected isHealthy(): boolean {
  const baseHealthy = super.isHealthy();
  
  try {
    // Add specific health checks with logging
    const connectionsHealthy = this.checkConnectionsHealth();
    const resourcesHealthy = this.checkResourcesHealth();
    const operationsHealthy = this.checkOperationsHealth();
    
    const result = baseHealthy && connectionsHealthy && resourcesHealthy && operationsHealthy;
    
    logger.debug('Health check completed', {
      serviceName: this.getServiceName(),
      baseHealthy,
      connectionsHealthy,
      resourcesHealthy,
      operationsHealthy,
      result
    });
    
    return result;
  } catch (error) {
    logger.error('Health check failed', { 
      serviceName: this.getServiceName(),
      error: error.message 
    });
    return false;
  }
}
```

#### 4. Memory Leaks

**Problem**: Services consume increasing memory over time.

**Solutions**:
```typescript
export class MemoryEfficientService extends BaseService {
  protected async performShutdown(): Promise<void> {
    // Clear all timers (handled by BaseService)
    
    // Clear event listeners
    this.removeAllListeners();
    
    // Clear caches
    this.clearInternalCaches();
    
    // Close connections
    await this.closeAllConnections();
    
    // Clear references
    this.clearReferences();
    
    logger.info('Memory cleanup completed', {
      serviceName: this.getServiceName()
    });
  }
  
  private removeAllListeners(): void {
    // Remove event listeners to prevent memory leaks
  }
  
  private clearInternalCaches(): void {
    // Clear any internal caches or maps
  }
  
  private clearReferences(): void {
    // Set large objects to null
  }
}
```

### Debugging Tools

#### Service Status Inspector

```typescript
export class ServiceStatusInspector {
  constructor(private serviceRegistry: IServiceRegistry) {}
  
  async generateStatusReport(): Promise<ServiceStatusReport> {
    const services = await this.serviceRegistry.getHealthStatus();
    const report: ServiceStatusReport = {
      timestamp: new Date().toISOString(),
      overallHealthy: await this.serviceRegistry.isHealthy(),
      services: new Map()
    };
    
    for (const [name, status] of services) {
      report.services.set(name, {
        ...status,
        uptime: this.calculateUptime(name),
        lastHeartbeat: this.getLastHeartbeat(name)
      });
    }
    
    return report;
  }
  
  async diagnoseProblem(serviceName: string): Promise<DiagnosisResult> {
    const service = this.serviceRegistry.get(serviceName);
    if (!service) {
      return { issue: 'Service not found', suggestions: ['Check service registration'] };
    }
    
    const health = await service.getHealthStatus();
    if (health.healthy) {
      return { issue: 'No problems detected', suggestions: [] };
    }
    
    const suggestions: string[] = [];
    
    // Analyze common issues
    if (health.errors.includes('Not initialized')) {
      suggestions.push('Service may not have been properly initialized');
      suggestions.push('Check initialization order and dependencies');
    }
    
    if (health.errors.some(e => e.includes('connection'))) {
      suggestions.push('Check network connectivity');
      suggestions.push('Verify connection configuration');
    }
    
    return { issue: health.errors.join(', '), suggestions };
  }
}
```

### Performance Profiling

```typescript
export class ServiceProfiler {
  private operationTimes: Map<string, number[]> = new Map();
  
  async profileOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = process.hrtime.bigint();
    
    try {
      const result = await operation();
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000; // Convert to ms
      
      this.recordOperationTime(operationName, duration);
      
      return result;
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;
      
      this.recordOperationTime(`${operationName}_error`, duration);
      throw error;
    }
  }
  
  private recordOperationTime(operation: string, duration: number): void {
    if (!this.operationTimes.has(operation)) {
      this.operationTimes.set(operation, []);
    }
    
    const times = this.operationTimes.get(operation)!;
    times.push(duration);
    
    // Keep only last 100 measurements
    if (times.length > 100) {
      times.shift();
    }
  }
  
  getPerformanceReport(): PerformanceReport {
    const report: PerformanceReport = {
      timestamp: new Date().toISOString(),
      operations: new Map()
    };
    
    for (const [operation, times] of this.operationTimes) {
      const sorted = [...times].sort((a, b) => a - b);
      const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
      
      report.operations.set(operation, {
        count: times.length,
        average: avg,
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        min: sorted[0],
        max: sorted[sorted.length - 1]
      });
    }
    
    return report;
  }
}
```

## Best Practices Summary

1. **Follow the BaseService pattern** for consistent lifecycle management
2. **Use dependency injection** for loose coupling and testability
3. **Implement comprehensive health monitoring** for operational visibility
4. **Handle errors gracefully** with proper fallback mechanisms
5. **Validate configuration** thoroughly before service initialization
6. **Use appropriate design patterns** (Circuit Breaker, Retry, etc.)
7. **Implement proper resource cleanup** to prevent memory leaks
8. **Add comprehensive logging** for debugging and monitoring
9. **Write integration tests** to verify service interactions
10. **Monitor performance** and optimize based on real usage patterns

## Related Documentation

- [API Usage Examples](./API_USAGE_EXAMPLES.md) - Practical code examples
- [Architecture Documentation](./ARCHITECTURE.md) - System architecture overview
- [Service Contracts](./SERVICE_CONTRACTS.md) - Detailed interface specifications
- [Troubleshooting Guide](./TROUBLESHOOTING.md) - Common issues and solutions