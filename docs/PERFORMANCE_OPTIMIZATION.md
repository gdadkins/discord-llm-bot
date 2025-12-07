# Performance Optimization Guide

This guide provides comprehensive strategies for optimizing the performance of the Discord LLM Bot across all major components.

## Table of Contents

1. [Overview](#overview)
2. [Service Performance Characteristics](#service-performance-characteristics)
3. [Memory Optimization](#memory-optimization)
4. [Response Time Optimization](#response-time-optimization)
5. [Caching Strategies](#caching-strategies)
6. [Database and Storage Performance](#database-and-storage-performance)
7. [Network and API Optimization](#network-and-api-optimization)
8. [Resource Management](#resource-management)
9. [Scaling Guidelines](#scaling-guidelines)
10. [Performance Testing](#performance-testing)
11. [Best Practices](#best-practices)

## Overview

The Discord LLM Bot is designed for high-performance operation across multiple services. Key performance metrics include:

- **Response Time Target**: < 2 seconds for 95% of requests
- **Memory Usage**: < 500MB under normal load
- **Throughput**: 100+ requests per minute
- **Error Rate**: < 1% under normal conditions
- **Cache Hit Rate**: > 80% for frequently accessed data

### Performance Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Rate Limiter  │    │  Health Monitor │    │ Graceful Degrad │
│   Throughput:   │    │  Collection:    │    │ Circuit Breaker │
│   10,000 ops/s  │    │  30s intervals  │    │ Recovery: <1min │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
┌─────────────────────────────────┼─────────────────────────────────┐
│                           Core Services                            │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│ Context Manager │  Cache Manager  │ Gemini Service  │ DataStore   │
│ Memory: O(n)    │ LRU: 5min TTL   │ API Calls      │ Compression │
│ Build: O(k logk)│ Hit Rate: >80%  │ Rate Limited   │ Atomic I/O  │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
```

## Service Performance Characteristics

### HealthMonitor

**Performance Profile:**
- **Metrics Collection**: 30-second intervals (configurable)
- **Memory Usage**: ~10MB baseline + 100KB per snapshot
- **CPU Impact**: < 1% during collection
- **Storage**: Compressed JSON with 30-70% size reduction

**Optimization Strategies:**
```typescript
// Configure collection intervals based on load
const COLLECTION_INTERVALS = {
  low_load: 60000,     // 1 minute
  normal_load: 30000,  // 30 seconds (default)
  high_load: 15000,    // 15 seconds
  critical_load: 5000  // 5 seconds
};

// Implement adaptive collection
if (metrics.responseTime.p95 > 5000) {
  this.COLLECTION_INTERVAL_MS = COLLECTION_INTERVALS.high_load;
}
```

**Memory Management:**
- Snapshots automatically aggregated after 24 hours
- Compression reduces storage by 30-70%
- Automatic cleanup of expired data
- Buffer size limited to 1000 operations

### CacheManager

**Performance Profile:**
- **Lookup Time**: < 0.1ms (in-memory hash map)
- **Hit Rate Target**: > 80%
- **Memory Efficiency**: ~2 bytes per character + 100 bytes overhead
- **Eviction**: LRU with 5-minute TTL

**Optimization Strategies:**
```typescript
// Optimize cache key generation
private generateCacheKey(prompt: string, userId: string, serverId?: string): string {
  // Use hash instead of full string for memory efficiency
  const input = `${prompt}:${userId}:${serverId || 'dm'}`;
  return createHash('sha256').update(input).digest('hex');
}

// Implement cache warming for frequent patterns
async warmCache(commonPrompts: string[], users: string[]): Promise<void> {
  for (const prompt of commonPrompts) {
    for (const user of users) {
      // Pre-populate cache with likely responses
      await this.preloadResponse(prompt, user);
    }
  }
}
```

**Memory Optimization:**
- Maximum 100 entries with LRU eviction
- Response truncation for large responses
- Periodic cleanup of expired entries
- Bypass cache for time-sensitive operations

### RateLimiter

**Performance Profile:**
- **Check Latency**: < 1ms for cached windows
- **Throughput**: 10,000+ operations/second
- **Memory Usage**: O(1) - constant space
- **Persistence**: Batched writes every 10 seconds

**Optimization Strategies:**
```typescript
// Implement window caching for performance
private updateTimeWindowsCached(): void {
  const now = Date.now();
  
  // Cache window calculations for 1 second
  if (now - this.lastWindowUpdate > this.WINDOW_CACHE_MS) {
    this.cachedMinuteWindow = this.getCurrentMinuteWindow();
    this.cachedDayWindow = this.getCurrentDayWindow();
    this.lastWindowUpdate = now;
  }
}

// Batch state persistence
private scheduleFlush(): void {
  if (!this.flushTimer && this.isDirty) {
    this.flushTimer = setTimeout(() => {
      this.performScheduledFlush();
    }, this.FLUSH_INTERVAL_MS);
  }
}
```

### ContextManager

**Performance Profile:**
- **Context Building**: O(k * log k) where k = items per category
- **Memory Usage**: Scales linearly with server count
- **Relevance Scoring**: < 10ms for typical server context
- **Cross-server Context**: Limited to 2 moments + 1 code snippet per server

**Optimization Strategies:**
```typescript
// Implement Builder pattern for modular performance
buildSuperContext(serverId: string, userId: string): string {
  const context = this.serverContext.get(serverId);
  if (!context) return '';

  const parts: string[] = [];
  
  // Use parallel context building for independent sections
  const builders = [
    new FactsContextBuilder(context, userId, this.conversationMemoryService, Date.now()),
    new BehaviorContextBuilder(this.behaviorAnalyzer, userId),
    new SocialDynamicsContextBuilder(this.socialDynamicsService, context, userId)
  ];
  
  // Execute builders in parallel
  builders.forEach(builder => builder.addContext(parts));
  return parts.join('');
}
```

## Memory Optimization

### Memory Usage Targets

| Component | Target | Warning Threshold | Critical Threshold |
|-----------|--------|-------------------|-------------------|
| HealthMonitor | < 50MB | 75MB | 100MB |
| CacheManager | < 20MB | 30MB | 40MB |
| ContextManager | < 200MB | 350MB | 500MB |
| RateLimiter | < 5MB | 10MB | 15MB |
| **Total System** | **< 500MB** | **750MB** | **1GB** |

### Memory Management Strategies

#### 1. Intelligent Trimming
```typescript
// Context Manager intelligent trimming
private intelligentTrim(context: RichContext): void {
  const limits = this.getMemoryLimits();
  
  // Trim by LRU access patterns
  context.embarrassingMoments = context.embarrassingMoments
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, limits.maxEmbarrassingMoments);
    
  // Remove semantic duplicates
  context.embarrassingMoments = this.deduplicateBySemanticHash(
    context.embarrassingMoments
  );
}
```

#### 2. Memory Pressure Response
```typescript
// Automated memory pressure handling
async onMemoryPressure(memoryUsageMB: number): Promise<void> {
  if (memoryUsageMB > 750) {
    // Critical: Aggressive cleanup
    this.clearNonEssentialCaches();
    this.compressOldestContext();
    this.triggerGarbageCollection();
  } else if (memoryUsageMB > 500) {
    // Warning: Moderate cleanup
    this.trimLargestContexts();
    this.evictOldCacheEntries();
  }
}
```

#### 3. Compression Strategies
```typescript
// DataStore compression configuration
const compressionConfig = {
  compressionEnabled: true,
  compressionThreshold: 10000, // 10KB
  maxBackups: 5,
  compressionRatio: 0.3 // Target 70% size reduction
};
```

### Memory Leak Prevention

1. **Timer Cleanup**: All intervals and timeouts properly cleared
2. **Event Listener Management**: Remove listeners on shutdown
3. **Circular Reference Prevention**: Weak references where appropriate
4. **Buffer Management**: Fixed-size circular buffers

## Response Time Optimization

### Response Time Targets

| Operation Type | Target | Acceptable | Slow |
|----------------|--------|------------|------|
| Cache Hit | < 0.1ms | < 1ms | > 1ms |
| Rate Limit Check | < 1ms | < 5ms | > 5ms |
| Context Building | < 50ms | < 200ms | > 200ms |
| Health Metrics | < 10ms | < 50ms | > 50ms |
| API Response | < 2s | < 5s | > 5s |

### Optimization Techniques

#### 1. Async/Await Optimization
```typescript
// Parallel processing for independent operations
async buildContextOptimized(serverId: string, userId: string): Promise<string> {
  const [
    behaviorContext,
    socialContext,
    cacheStats
  ] = await Promise.all([
    this.behaviorAnalyzer.getBehaviorContext(userId),
    this.socialDynamicsService.buildContext(serverId, userId),
    this.getCacheMetrics()
  ]);
  
  return this.combineContexts(behaviorContext, socialContext, cacheStats);
}
```

#### 2. Memoization for Expensive Operations
```typescript
// Cache expensive calculations
private memoizedComplexityAnalysis = new Map<string, number>();

calculateMessageComplexity(message: string): number {
  const cacheKey = this.generateMessageHash(message);
  
  if (this.memoizedComplexityAnalysis.has(cacheKey)) {
    return this.memoizedComplexityAnalysis.get(cacheKey)!;
  }
  
  const complexity = this.performComplexityAnalysis(message);
  this.memoizedComplexityAnalysis.set(cacheKey, complexity);
  
  return complexity;
}
```

#### 3. Early Return Patterns
```typescript
// Optimize context building with early returns
buildSuperContext(serverId: string, userId: string): string {
  const context = this.serverContext.get(serverId);
  if (!context) return ''; // Early return for empty context
  
  // Check if context is too small to be useful
  if (this.isContextTooSmall(context)) {
    return this.buildMinimalContext(userId);
  }
  
  // Continue with full context building...
}
```

## Caching Strategies

### Multi-Level Caching Architecture

```
┌─────────────────┐
│   L1: In-Memory │  < 0.1ms lookup
│   (Hot Data)    │  100 entries max
└─────────────────┘
         │
┌─────────────────┐
│   L2: Compressed│  < 1ms lookup
│   (Warm Data)   │  1000 entries max
└─────────────────┘
         │
┌─────────────────┐
│   L3: Disk      │  < 10ms lookup
│   (Cold Data)   │  Persistent storage
└─────────────────┘
```

### Cache Optimization Strategies

#### 1. Intelligent Cache Warming
```typescript
async warmCriticalCaches(): Promise<void> {
  // Pre-load frequently accessed data
  const popularServers = await this.getPopularServers();
  const activeUsers = await this.getActiveUsers();
  
  await Promise.all([
    this.preloadServerContexts(popularServers),
    this.preloadUserBehaviorPatterns(activeUsers),
    this.preloadCommonResponsePatterns()
  ]);
}
```

#### 2. Cache Hit Rate Optimization
```typescript
// Dynamic cache sizing based on hit rates
adjustCacheSize(): void {
  const hitRate = this.getCacheHitRate();
  
  if (hitRate < 0.7) {
    // Increase cache size or improve eviction policy
    this.maxCacheSize = Math.min(this.maxCacheSize * 1.2, 200);
  } else if (hitRate > 0.95) {
    // Decrease cache size to free memory
    this.maxCacheSize = Math.max(this.maxCacheSize * 0.9, 50);
  }
}
```

#### 3. Cache Invalidation Strategies
```typescript
// Smart cache invalidation
invalidateRelatedCache(userId: string, serverId: string): void {
  // Invalidate user-specific entries
  this.cache.delete(`user:${userId}:*`);
  
  // Invalidate server context if user is active
  if (this.isUserActiveInServer(userId, serverId)) {
    this.cache.delete(`server:${serverId}:context`);
  }
  
  // Preserve unrelated cache entries
}
```

## Database and Storage Performance

### DataStore Performance Characteristics

| Operation | Target Latency | Throughput | Optimization |
|-----------|----------------|------------|-------------|
| Save | < 50ms | 100 ops/s | Batching |
| Load | < 10ms | 500 ops/s | Caching |
| Health Check | < 5ms | 1000 ops/s | Cached |
| Compression | < 100ms | 50 ops/s | Background |

### Storage Optimization Strategies

#### 1. Compression and Serialization
```typescript
// Optimized data serialization
private serializeWithCompression(data: T): Buffer {
  const serialized = JSON.stringify(data);
  
  // Only compress if size exceeds threshold
  if (serialized.length > this.compressionThreshold) {
    return zlib.gzipSync(Buffer.from(serialized));
  }
  
  return Buffer.from(serialized);
}
```

#### 2. Batch Operations
```typescript
// Batch multiple operations for efficiency
async batchSave(operations: Array<{key: string, data: any}>): Promise<void> {
  const batchSize = 10;
  
  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(op => this.save(op.key, op.data))
    );
    
    // Prevent event loop blocking
    if (i % (batchSize * 5) === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}
```

#### 3. Storage Health Monitoring
```typescript
// Monitor storage performance
async monitorStorageHealth(): Promise<StorageHealth> {
  const metrics = await Promise.all([
    this.measureReadLatency(),
    this.measureWriteLatency(),
    this.checkDiskSpace(),
    this.validateDataIntegrity()
  ]);
  
  return {
    readLatency: metrics[0],
    writeLatency: metrics[1],
    diskSpace: metrics[2],
    integrity: metrics[3],
    status: this.determineStorageStatus(metrics)
  };
}
```

## Network and API Optimization

### Rate Limiting Optimization

```typescript
// Adaptive rate limiting based on API health
class AdaptiveRateLimiter {
  adjustLimitsBasedOnHealth(apiHealth: boolean, latency: number): void {
    if (!apiHealth || latency > 5000) {
      // Reduce limits during API issues
      this.currentRpm = Math.floor(this.baseRpm * 0.5);
    } else if (latency < 1000) {
      // Increase limits for healthy API
      this.currentRpm = Math.min(this.baseRpm * 1.2, this.maxRpm);
    }
  }
}
```

### API Call Optimization

#### 1. Request Batching
```typescript
// Batch API requests where possible
async batchApiRequests<T>(requests: ApiRequest[]): Promise<T[]> {
  const batchSize = 5;
  const results: T[] = [];
  
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(req => this.makeApiCall(req))
    );
    
    results.push(...batchResults
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value)
    );
    
    // Respect rate limits between batches
    await this.waitForRateLimit();
  }
  
  return results;
}
```

#### 2. Connection Pooling
```typescript
// HTTP connection pooling for better performance
const httpAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
  freeSocketTimeout: 30000
});
```

## Resource Management

### CPU Optimization

#### 1. Event Loop Monitoring
```typescript
// Monitor event loop lag
class EventLoopMonitor {
  private lagThreshold = 50; // ms
  
  measureEventLoopLag(): number {
    const start = process.hrtime.bigint();
    
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000;
      
      if (lag > this.lagThreshold) {
        this.handleEventLoopLag(lag);
      }
    });
    
    return lag;
  }
  
  private handleEventLoopLag(lag: number): void {
    // Reduce processing load
    this.reduceBackgroundTasks();
    this.increaseAsyncBreaks();
  }
}
```

#### 2. Worker Thread Usage
```typescript
// CPU-intensive operations in worker threads
import { Worker, isMainThread, parentPort } from 'worker_threads';

class PerformanceWorker {
  async processIntensiveTask(data: any): Promise<any> {
    if (isMainThread) {
      // Main thread: delegate to worker
      return new Promise((resolve, reject) => {
        const worker = new Worker(__filename);
        worker.postMessage(data);
        worker.on('message', resolve);
        worker.on('error', reject);
      });
    } else {
      // Worker thread: process data
      const result = this.performIntensiveCalculation(data);
      parentPort?.postMessage(result);
    }
  }
}
```

### Memory Management

#### 1. Garbage Collection Optimization
```typescript
// Manual GC triggering during low-activity periods
class GarbageCollectionManager {
  scheduleGC(): void {
    // Trigger GC during low activity
    if (this.isLowActivity() && global.gc) {
      global.gc();
      this.recordGCEvent();
    }
  }
  
  private isLowActivity(): boolean {
    return this.getCurrentRequestRate() < 10; // requests per minute
  }
}
```

#### 2. Memory Pool Management
```typescript
// Object pooling for frequently created objects
class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  
  constructor(factory: () => T, initialSize: number = 10) {
    this.factory = factory;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }
  
  acquire(): T {
    return this.pool.pop() || this.factory();
  }
  
  release(obj: T): void {
    this.resetObject(obj);
    this.pool.push(obj);
  }
}
```

## Scaling Guidelines

### Horizontal Scaling

#### 1. Load Balancing Strategy
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Bot Instance  │    │   Bot Instance  │    │   Bot Instance  │
│       #1        │    │       #2        │    │       #3        │
│   Servers 1-100 │    │  Servers 101-200│    │  Servers 201-300│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Shared Storage │
                    │   Redis/DB      │
                    └─────────────────┘
```

#### 2. Server Distribution
```typescript
// Intelligent server distribution
class ServerDistributor {
  distributeServers(servers: string[], instanceCount: number): string[][] {
    const distribution: string[][] = Array(instanceCount).fill(null).map(() => []);
    
    // Sort servers by activity level
    const sortedServers = servers.sort((a, b) => 
      this.getServerActivity(b) - this.getServerActivity(a)
    );
    
    // Round-robin distribution with load balancing
    sortedServers.forEach((server, index) => {
      const instanceIndex = index % instanceCount;
      distribution[instanceIndex].push(server);
    });
    
    return distribution;
  }
}
```

### Vertical Scaling

#### Resource Allocation Guidelines

| Load Level | Memory | CPU | Concurrent Users |
|------------|--------|-----|------------------|
| Light | 512MB | 1 vCPU | < 100 |
| Medium | 1GB | 2 vCPU | 100-500 |
| Heavy | 2GB | 4 vCPU | 500-1000 |
| Enterprise | 4GB+ | 8+ vCPU | 1000+ |

#### Auto-scaling Configuration
```typescript
// Auto-scaling based on metrics
class AutoScaler {
  async evaluateScaling(): Promise<ScalingDecision> {
    const metrics = await this.gatherMetrics();
    
    if (metrics.memoryUsage > 80 || metrics.cpuUsage > 75) {
      return { action: 'scale_up', reason: 'High resource usage' };
    }
    
    if (metrics.memoryUsage < 30 && metrics.cpuUsage < 25) {
      return { action: 'scale_down', reason: 'Low resource usage' };
    }
    
    return { action: 'maintain', reason: 'Optimal resource usage' };
  }
}
```

## Performance Testing

### Benchmark Suite Configuration

#### 1. Load Testing
```typescript
// Comprehensive load testing
class PerformanceTestSuite {
  async runLoadTest(config: LoadTestConfig): Promise<LoadTestResults> {
    const {
      concurrentUsers,
      duration,
      requestsPerSecond
    } = config;
    
    const results = await Promise.all([
      this.testContextManagerLoad(concurrentUsers),
      this.testCacheManagerLoad(requestsPerSecond),
      this.testRateLimiterLoad(requestsPerSecond * 2),
      this.testHealthMonitorLoad(duration)
    ]);
    
    return this.aggregateResults(results);
  }
}
```

#### 2. Memory Profiling
```typescript
// Memory profiling during operations
class MemoryProfiler {
  async profileMemoryUsage(operation: () => Promise<void>): Promise<MemoryProfile> {
    const initialMemory = process.memoryUsage();
    const snapshots: MemorySnapshot[] = [];
    
    // Take snapshots during operation
    const interval = setInterval(() => {
      snapshots.push({
        timestamp: Date.now(),
        memory: process.memoryUsage()
      });
    }, 100);
    
    await operation();
    clearInterval(interval);
    
    const finalMemory = process.memoryUsage();
    
    return {
      initialMemory,
      finalMemory,
      snapshots,
      peakMemory: this.findPeakMemory(snapshots),
      memoryGrowth: finalMemory.heapUsed - initialMemory.heapUsed
    };
  }
}
```

### Performance Regression Testing

```typescript
// Automated performance regression detection
class RegressionTester {
  async detectRegressions(current: BenchmarkResults, baseline: BenchmarkResults): Promise<Regression[]> {
    const regressions: Regression[] = [];
    
    // Check response time regression
    if (current.avgResponseTime > baseline.avgResponseTime * 1.1) {
      regressions.push({
        metric: 'response_time',
        change: ((current.avgResponseTime - baseline.avgResponseTime) / baseline.avgResponseTime) * 100,
        severity: current.avgResponseTime > baseline.avgResponseTime * 1.5 ? 'critical' : 'warning'
      });
    }
    
    // Check memory usage regression
    if (current.memoryUsage > baseline.memoryUsage * 1.2) {
      regressions.push({
        metric: 'memory_usage',
        change: ((current.memoryUsage - baseline.memoryUsage) / baseline.memoryUsage) * 100,
        severity: 'warning'
      });
    }
    
    return regressions;
  }
}
```

## Best Practices

### Development Guidelines

1. **Profile Before Optimizing**: Always measure performance before making optimizations
2. **Incremental Optimization**: Make small, measurable improvements
3. **Monitor in Production**: Use real-world metrics to guide optimization efforts
4. **Test Under Load**: Verify optimizations work under realistic conditions

### Code Optimization Patterns

#### 1. Lazy Loading
```typescript
// Lazy initialization for expensive resources
class ServiceManager {
  private _geminiService?: GeminiService;
  
  get geminiService(): GeminiService {
    if (!this._geminiService) {
      this._geminiService = new GeminiService();
    }
    return this._geminiService;
  }
}
```

#### 2. Debouncing
```typescript
// Debounce expensive operations
class DebouncedUpdater {
  private updateTimer?: NodeJS.Timeout;
  
  scheduleUpdate(data: any): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    this.updateTimer = setTimeout(() => {
      this.performUpdate(data);
    }, 500); // 500ms debounce
  }
}
```

#### 3. Error Handling Performance
```typescript
// Efficient error handling that doesn't impact performance
class ErrorHandlingService {
  async safeOperation<T>(operation: () => Promise<T>): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      // Log asynchronously to avoid blocking
      setImmediate(() => this.logError(error));
      return null;
    }
  }
}
```

### Configuration Optimization

#### 1. Environment-Specific Tuning
```typescript
// Performance configuration by environment
const PERFORMANCE_CONFIG = {
  development: {
    cacheSize: 50,
    batchSize: 5,
    metricsInterval: 60000
  },
  production: {
    cacheSize: 100,
    batchSize: 10,
    metricsInterval: 30000
  },
  high_load: {
    cacheSize: 200,
    batchSize: 20,
    metricsInterval: 15000
  }
};
```

#### 2. Dynamic Configuration
```typescript
// Runtime configuration adjustment
class DynamicConfig {
  adjustBasedOnLoad(currentLoad: number): void {
    if (currentLoad > 80) {
      this.increaseBufferSizes();
      this.reduceCacheEviction();
      this.increaseParallelization();
    } else if (currentLoad < 20) {
      this.decreaseBufferSizes();
      this.increaseCacheEviction();
      this.decreaseParallelization();
    }
  }
}
```

### Monitoring and Alerting

#### 1. Performance Metrics Dashboard
```typescript
// Key performance indicators to monitor
const PERFORMANCE_KPIs = {
  responseTime: {
    p50: 500,   // 50th percentile target: 500ms
    p95: 2000,  // 95th percentile target: 2s
    p99: 5000   // 99th percentile target: 5s
  },
  throughput: {
    min: 50,    // Minimum requests per minute
    target: 100 // Target requests per minute
  },
  resources: {
    memory: 500,  // MB
    cpu: 70       // Percentage
  }
};
```

#### 2. Automated Performance Alerts
```typescript
// Performance alerting system
class PerformanceAlerter {
  async checkThresholds(metrics: PerformanceMetrics): Promise<void> {
    if (metrics.responseTime.p95 > 5000) {
      await this.sendAlert('CRITICAL', 'High response time detected');
    }
    
    if (metrics.memoryUsage > 750) {
      await this.sendAlert('WARNING', 'High memory usage detected');
    }
    
    if (metrics.errorRate > 5) {
      await this.sendAlert('ERROR', 'High error rate detected');
    }
  }
}
```

---

This performance optimization guide provides comprehensive strategies for maintaining optimal performance across all components of the Discord LLM Bot. Regular monitoring and proactive optimization ensure the system scales efficiently with growing usage.