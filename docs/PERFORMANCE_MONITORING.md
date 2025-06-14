# Performance Monitoring Guide

This guide documents the performance optimization techniques, monitoring patterns, and best practices implemented in the Discord LLM Bot. The system provides comprehensive performance tracking, automatic optimization, and proactive issue detection.

## Architecture Overview

The performance monitoring system consists of several integrated components:

- **HealthMonitor** (`src/services/healthMonitor.ts`) - Central performance metrics collection and alerting
- **RateLimiter** (`src/services/rateLimiter.ts`) - API throttling with performance optimization
- **CacheManager** (`src/services/cacheManager.ts`) - Response caching with performance tracking
- **GracefulDegradation** (`src/services/gracefulDegradation.ts`) - Circuit breaker and fallback handling
- **DataStore Performance** (`src/utils/DataStore.ts`) - Storage optimization and monitoring

## Performance Metrics Collection

### HealthMonitor Service

The HealthMonitor provides comprehensive system monitoring with automatic metric collection:

```typescript
interface HealthMetrics {
  memoryUsage: NodeJS.MemoryUsage;       // RSS, heap, external memory
  activeConversations: number;            // Current active users
  rateLimitStatus: {                      // API quota status
    minuteRemaining: number;
    dailyRemaining: number;
    requestsThisMinute: number;
    requestsToday: number;
  };
  uptime: number;                         // System uptime in ms
  errorRate: number;                      // Error percentage (0-100)
  responseTime: {                         // Response time percentiles
    p50: number;
    p95: number;
    p99: number;
  };
  apiHealth: {                            // Service health status
    gemini: boolean;
    discord: boolean;
  };
  cacheMetrics: {                         // Cache performance
    hitRate: number;
    memoryUsage: number;
    size: number;
  };
  contextMetrics: {                       // Memory optimization stats
    totalServers: number;
    totalMemoryUsage: number;
    averageServerSize: number;
    largestServerSize: number;
    compressionStats: {
      averageCompressionRatio: number;
      totalMemorySaved: number;
      duplicatesRemoved: number;
    };
  };
  dataStoreMetrics: {                     // Storage performance
    totalStores: number;
    totalSaveOperations: number;
    totalLoadOperations: number;
    totalErrors: number;
    avgSaveLatency: number;
    avgLoadLatency: number;
    healthyStores: number;
    unhealthyStores: number;
    totalBytesWritten: number;
    totalBytesRead: number;
  };
}
```

### Key Performance Indicators (KPIs)

The system tracks critical performance metrics:

1. **Response Time**
   - P50: Median response time (target: <2s)
   - P95: 95th percentile response time (target: <5s)
   - P99: 99th percentile response time (target: <10s)

2. **Memory Usage**
   - RSS Memory: Resident set size (target: <500MB)
   - Heap Usage: JavaScript heap (target: <400MB)
   - Memory Growth Rate: Monitor for leaks

3. **Error Rate**
   - API Errors: Failed Gemini API calls (target: <5%)
   - System Errors: Application exceptions (target: <1%)
   - Recovery Rate: Successful error recoveries

4. **Throughput**
   - Requests per minute: Current API usage
   - Cache hit rate: Response cache efficiency (target: >60%)
   - Queue length: Pending message backlog

## Performance Optimization Techniques

### 1. Rate Limiting Optimization

The RateLimiter implements several performance optimization patterns:

#### Batch Operations

```typescript
// Batch state persistence to reduce I/O operations
private readonly FLUSH_INTERVAL_MS = 10000; // Batch writes every 10 seconds
private isDirty = false;

private async performScheduledFlush(): Promise<void> {
  if (this.isDirty) {
    await this.saveState();
  }
}
```

#### Window Caching

```typescript
// Cache window calculations to avoid repeated computation
private readonly WINDOW_CACHE_MS = 1000; // Cache for 1 second
private cachedMinuteWindow = 0;
private cachedDayWindow = 0;
private lastWindowUpdate = 0;

private updateTimeWindowsCached(): void {
  const now = Date.now();
  
  // Only recalculate if cache is expired
  if (now - this.lastWindowUpdate > this.WINDOW_CACHE_MS) {
    // Update cached values
    this.cachedMinuteWindow = this.getCurrentMinuteWindow();
    this.cachedDayWindow = this.getCurrentDayWindow();
    this.lastWindowUpdate = now;
  }
}
```

#### Safety Margins

```typescript
// Apply 90% safety margin to prevent quota exhaustion
this.rpmLimit = Math.floor(rpmLimit * 0.9);
this.dailyLimit = Math.floor(dailyLimit * 0.9);
```

### 2. Cache Performance Optimization

The CacheManager implements advanced caching strategies:

#### LRU (Least Recently Used) Eviction

```typescript
class CacheManager {
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[]; // Track access order for LRU
  private readonly MAX_CACHE_SIZE = 100;
  
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    // Remove least recently used entry
    const lruKey = this.accessOrder.shift();
    if (lruKey && this.cache.has(lruKey)) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }
}
```

#### Cache Performance Metrics

```typescript
interface CacheStats {
  totalHits: number;
  totalMisses: number;
  evictions: number;
  hitRate: number;              // Percentage (0-100)
  cacheSize: number;            // Current entries
  memoryUsage: number;          // Bytes
}

// Performance calculation
getCachePerformance(): CachePerformance {
  const totalRequests = this.stats.hits + this.stats.misses;
  const reduction = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
  
  return {
    reduction: Math.round(reduction * 10) / 10,
    avgLookupTime: 0.1, // Sub-millisecond lookups
    averageSaveTime: 0.2,
    compressionRatio: 1.0,
  };
}
```

#### TTL-Based Expiration

```typescript
// Automatic cleanup of expired entries
this.createInterval('cacheCleanup', () => {
  this.cleanupExpiredEntries();
}, 60 * 1000); // Every minute

private cleanupExpiredEntries(): void {
  const now = Date.now();
  let cleaned = 0;
  
  this.cache.forEach((entry, key) => {
    if (now - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      cleaned++;
    }
  });
  
  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} expired cache entries`);
  }
}
```

### 3. Memory Optimization

#### Data Compression

```typescript
// DataStore with compression for large data
const dataStore = new DataStore<HealthMetricsData>('./data/metrics.json', {
  compressionEnabled: true,
  compressionThreshold: 10000, // 10KB threshold
  ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
  autoCleanup: true,
});

// Compression statistics tracking
async getCompressionStats(): Promise<{
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  savedBytes: number;
  savedPercentage: number;
}> {
  const stats = await this.metricsDataStore.getStats();
  const originalSize = JSON.stringify(data).length;
  const compressedSize = stats.size;
  const savedBytes = originalSize - compressedSize;
  
  return {
    originalSize,
    compressedSize,
    compressionRatio: originalSize / compressedSize,
    savedBytes,
    savedPercentage: (savedBytes / originalSize) * 100,
  };
}
```

#### Memory Aggregation

```typescript
// Aggregate older metrics to reduce memory usage
private async aggregateMetrics(): Promise<HealthSnapshot[]> {
  const hourlyGroups = new Map<number, HealthSnapshot[]>();
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  
  // For recent data (last 24 hours), keep all snapshots
  // For older data, aggregate to hourly averages
  for (const [hourKey, snapshots] of hourlyGroups.entries()) {
    const hourTimestamp = hourKey * 60 * 60 * 1000;
    if (now - hourTimestamp < 24 * 60 * 60 * 1000) {
      aggregatedSnapshots.push(...snapshots);
    } else {
      const aggregated = this.calculateAverageMetrics(snapshots);
      aggregated.timestamp = hourTimestamp;
      aggregatedSnapshots.push(aggregated);
    }
  }
  
  return aggregatedSnapshots;
}
```

### 4. Circuit Breaker Pattern

The GracefulDegradation service implements circuit breaker patterns for resilience:

#### Circuit States

```typescript
interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveSuccesses: number;
}

// Circuit breaker state transitions
async executeWithCircuitBreaker<T>(
  operation: () => Promise<T>,
  serviceName: 'gemini' | 'discord'
): Promise<T> {
  const circuitState = this.serviceStatus[serviceName];
  
  // Check if circuit is open
  if (circuitState.state === 'open') {
    const timeSinceFailure = Date.now() - circuitState.lastFailureTime;
    if (timeSinceFailure < this.config.resetTimeoutMs) {
      throw new Error(`Circuit breaker is OPEN for ${serviceName}`);
    } else {
      // Move to half-open state
      circuitState.state = 'half-open';
      circuitState.consecutiveSuccesses = 0;
    }
  }
  
  try {
    const result = await operation();
    await this.recordSuccess(serviceName);
    return result;
  } catch (error) {
    await this.recordFailure(serviceName, error);
    throw error;
  }
}
```

#### Performance-Based Degradation

```typescript
// Health-based degradation assessment
private assessHealthBasedDegradation(metrics: HealthMetrics): {
  shouldDegrade: boolean;
  reason: string;
  severity: 'low' | 'medium' | 'high';
} {
  const memoryUsageMB = metrics.memoryUsage.rss / (1024 * 1024);
  
  // Critical memory usage
  if (memoryUsageMB > this.config.memoryThresholdMB) {
    return {
      shouldDegrade: true,
      reason: `High memory usage: ${memoryUsageMB.toFixed(1)}MB`,
      severity: 'high'
    };
  }
  
  // High error rate
  if (metrics.errorRate > this.config.errorRateThreshold) {
    return {
      shouldDegrade: true,
      reason: `High error rate: ${metrics.errorRate.toFixed(1)}%`,
      severity: 'medium'
    };
  }
  
  // Slow response times
  if (metrics.responseTime.p95 > this.config.responseTimeThresholdMs) {
    return {
      shouldDegrade: true,
      reason: `Slow response times: ${metrics.responseTime.p95}ms P95`,
      severity: 'medium'
    };
  }
  
  return {
    shouldDegrade: false,
    reason: 'Health metrics within acceptable ranges',
    severity: 'low'
  };
}
```

## Performance Alerting System

### Alert Configuration

```typescript
interface AlertConfig {
  memoryThreshold: number; // MB
  errorRateThreshold: number; // percentage
  responseTimeThreshold: number; // ms
  diskSpaceThreshold: number; // percentage
  enabled: boolean;
}

// Configurable thresholds
private alertConfig: AlertConfig = {
  memoryThreshold: parseInt(process.env.HEALTH_MEMORY_THRESHOLD_MB || '500'),
  errorRateThreshold: parseFloat(process.env.HEALTH_ERROR_RATE_THRESHOLD || '5.0'),
  responseTimeThreshold: parseInt(process.env.HEALTH_RESPONSE_TIME_THRESHOLD_MS || '5000'),
  diskSpaceThreshold: parseFloat(process.env.HEALTH_DISK_SPACE_THRESHOLD || '85.0'),
  enabled: process.env.HEALTH_ALERTS_ENABLED === 'true',
};
```

### Alert Triggering

```typescript
private async checkAlerts(metrics: HealthMetrics): Promise<void> {
  if (!this.alertConfig.enabled) return;
  
  const now = Date.now();
  const alertCooldown = 300000; // 5 minutes between similar alerts
  
  // Memory alert
  const memoryUsageMB = metrics.memoryUsage.rss / (1024 * 1024);
  if (memoryUsageMB > this.alertConfig.memoryThreshold && 
      now - this.alertState.lastMemoryAlert > alertCooldown) {
    
    await this.triggerAlert('memory', 
      `High memory usage: ${memoryUsageMB.toFixed(1)}MB (threshold: ${this.alertConfig.memoryThreshold}MB)`, 
      metrics);
    this.alertState.lastMemoryAlert = now;
  }
  
  // Error rate alert
  if (metrics.errorRate > this.alertConfig.errorRateThreshold && 
      now - this.alertState.lastErrorRateAlert > alertCooldown) {
    
    await this.triggerAlert('error_rate', 
      `High error rate: ${metrics.errorRate.toFixed(1)}% (threshold: ${this.alertConfig.errorRateThreshold}%)`, 
      metrics);
    this.alertState.lastErrorRateAlert = now;
  }
  
  // Response time alert
  if (metrics.responseTime.p95 > this.alertConfig.responseTimeThreshold && 
      now - this.alertState.lastResponseTimeAlert > alertCooldown) {
    
    await this.triggerAlert('response_time', 
      `High response time: ${metrics.responseTime.p95}ms (threshold: ${this.alertConfig.responseTimeThreshold}ms)`, 
      metrics);
    this.alertState.lastResponseTimeAlert = now;
  }
}
```

### Self-Healing Capabilities

```typescript
private async attemptSelfHealing(type: string, consecutiveCount: number, metrics: HealthMetrics): Promise<void> {
  try {
    switch (type) {
    case 'memory':
      await this.healMemoryIssues();
      break;
    case 'error_rate':
      await this.healErrorRateIssues();
      break;
    case 'response_time':
      await this.healResponseTimeIssues();
      break;
    case 'api_health':
      await this.healApiHealthIssues(metrics);
      break;
    }
  } catch (error) {
    logger.error(`Self-healing failed for ${type}:`, error);
  }
}

private async healMemoryIssues(): Promise<void> {
  // Clear caches if available
  if (this.geminiService) {
    this.geminiService.clearCache();
  }
  
  // Trigger garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Clear old performance data
  this.performanceBuffer.bufferSize = Math.min(
    this.performanceBuffer.bufferSize, 
    Math.floor(this.MAX_PERFORMANCE_BUFFER * 0.5)
  );
}
```

## Performance Constants and Configuration

### Performance-Critical Constants

```typescript
// Rate limiter performance constants
export const RATE_LIMITER_CONSTANTS = {
  FLUSH_INTERVAL_MS: 10000,        // Batch writes every 10 seconds
  WINDOW_CACHE_MS: 1000,           // Cache window calculations for 1 second
  SAFETY_MARGIN: 0.9,              // 90% safety margin for rate limits
  
  // Video-specific performance limits
  VIDEO_TOKENS_PER_HOUR: 100000,
  VIDEO_TOKENS_PER_DAY: 500000,
  VIDEO_REQUESTS_PER_HOUR: 10,
  VIDEO_REQUESTS_PER_DAY: 50,
  VIDEO_REQUEST_COOLDOWN_SECONDS: 60,
} as const;

// Health monitor performance constants
export const HEALTH_MONITOR_CONSTANTS = {
  COLLECTION_INTERVAL_MS: 30000,   // Metrics collection every 30 seconds
  RETENTION_DAYS: 7,               // Keep metrics for 7 days
  CLEANUP_INTERVAL_MS: 300000,     // Cleanup every 5 minutes
  MAX_PERFORMANCE_BUFFER: 1000,    // Last 1000 operations
  DEFAULT_MEMORY_THRESHOLD_MB: 500,
  DEFAULT_ERROR_RATE_THRESHOLD: 5.0,
  DEFAULT_RESPONSE_TIME_THRESHOLD_MS: 5000,
} as const;

// Cache performance constants
export const CACHE_CONSTANTS = {
  SERVER_INFLUENCE_CACHE_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  DEFAULT_CACHE_TTL_MS: 60 * 60 * 1000, // 1 hour
} as const;
```

### Performance Tuning Parameters

```typescript
// Degradation performance thresholds
export const DEGRADATION_CONSTANTS = {
  DEFAULT_MAX_FAILURES: 5,
  DEFAULT_RESET_TIMEOUT_MS: 60000,        // 1 minute
  DEFAULT_MEMORY_THRESHOLD_MB: 400,
  DEFAULT_ERROR_RATE_THRESHOLD: 10.0,
  DEFAULT_RESPONSE_TIME_THRESHOLD_MS: 10000, // 10 seconds
  DEFAULT_MAX_QUEUE_SIZE: 100,
  DEFAULT_MAX_QUEUE_TIME_MS: 300000,       // 5 minutes
  DEFAULT_RETRY_INTERVAL_MS: 30000,        // 30 seconds
  
  // Processing performance limits
  MAX_BATCH_PROCESS_SIZE: 5,
  QUEUE_PRESSURE_THRESHOLD: 0.8,          // 80% queue capacity
  AVERAGE_PROCESSING_TIME_SECONDS: 30,
} as const;
```

## Performance Monitoring Dashboard

### Real-Time Metrics

The system provides real-time performance monitoring through the health monitoring interface:

```typescript
// Get current performance snapshot
async getCurrentMetrics(): Promise<HealthMetrics> {
  return await this.collectHealthMetrics();
}

// Get historical performance data
async getHistoricalMetrics(fromTime?: number, toTime?: number): Promise<HealthSnapshot[]> {
  const now = Date.now();
  const from = fromTime || (now - (24 * 60 * 60 * 1000)); // Last 24 hours
  const to = toTime || now;
  
  const snapshots: HealthSnapshot[] = [];
  for (const [timestamp, snapshot] of this.metricsData.entries()) {
    if (timestamp >= from && timestamp <= to) {
      snapshots.push(snapshot);
    }
  }
  
  return snapshots.sort((a, b) => a.timestamp - b.timestamp);
}
```

### Performance Export

```typescript
// Export performance data for analysis
async exportMetrics(
  from: number = Date.now() - (7 * 24 * 60 * 60 * 1000),
  to: number = Date.now(),
  format: 'json' | 'csv' = 'json'
): Promise<string> {
  const snapshots = await this.getHistoricalMetrics(from, to);
  
  if (format === 'csv') {
    const headers = [
      'timestamp', 'date', 'memory_rss_mb', 'memory_heap_used_mb',
      'active_conversations', 'error_rate', 'response_time_p50',
      'response_time_p95', 'cache_hit_rate', 'context_total_servers',
      'rate_limit_minute_remaining', 'rate_limit_daily_remaining'
    ];
    
    const rows = [headers.join(',')];
    
    for (const snapshot of snapshots) {
      const m = snapshot.metrics;
      const row = [
        snapshot.timestamp,
        new Date(snapshot.timestamp).toISOString(),
        (m.memoryUsage.rss / 1024 / 1024).toFixed(2),
        (m.memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
        m.activeConversations,
        m.errorRate.toFixed(2),
        m.responseTime.p50.toFixed(2),
        m.responseTime.p95.toFixed(2),
        m.cacheMetrics.hitRate.toFixed(2),
        m.contextMetrics.totalServers,
        m.rateLimitStatus.minuteRemaining,
        m.rateLimitStatus.dailyRemaining
      ];
      rows.push(row.join(','));
    }
    
    return rows.join('\n');
  }
  
  return JSON.stringify(snapshots, null, 2);
}
```

## Performance Best Practices

### Memory Management

1. **Use Streaming for Large Data**
   ```typescript
   // Stream large responses instead of loading into memory
   const stream = response.createReadStream();
   stream.pipe(outputStream);
   ```

2. **Implement Object Pooling**
   ```typescript
   // Reuse objects to reduce GC pressure
   class ObjectPool<T> {
     private pool: T[] = [];
     
     acquire(): T {
       return this.pool.pop() || this.create();
     }
     
     release(obj: T): void {
       this.reset(obj);
       this.pool.push(obj);
     }
   }
   ```

3. **Monitor Memory Growth**
   ```typescript
   // Track memory usage trends
   const memoryGrowth = currentMemory - baselineMemory;
   if (memoryGrowth > threshold) {
     logger.warn('Memory leak detected', { growth: memoryGrowth });
   }
   ```

### CPU Optimization

1. **Use Asynchronous Operations**
   ```typescript
   // Avoid blocking the event loop
   async function processLargeDataset(data: unknown[]): Promise<void> {
     for (let i = 0; i < data.length; i++) {
       await processItem(data[i]);
       
       // Yield control periodically
       if (i % 100 === 0) {
         await new Promise(resolve => setImmediate(resolve));
       }
     }
   }
   ```

2. **Implement Request Debouncing**
   ```typescript
   // Debounce rapid requests
   const debounce = <T extends (...args: Parameters<T>) => ReturnType<T>>(
     func: T,
     delay: number
   ): T => {
     let timeoutId: NodeJS.Timeout;
     
     return ((...args: Parameters<T>) => {
       clearTimeout(timeoutId);
       timeoutId = setTimeout(() => func(...args), delay);
     }) as T;
   };
   ```

### I/O Optimization

1. **Batch Database Operations**
   ```typescript
   // Batch multiple operations
   const batchOperations = [];
   for (const item of items) {
     batchOperations.push(createOperation(item));
   }
   await Promise.all(batchOperations);
   ```

2. **Use Connection Pooling**
   ```typescript
   // Reuse connections
   class ConnectionPool {
     private connections: Connection[] = [];
     private maxConnections = 10;
     
     async getConnection(): Promise<Connection> {
       if (this.connections.length > 0) {
         return this.connections.pop()!;
       }
       
       if (this.activeConnections < this.maxConnections) {
         return await this.createConnection();
       }
       
       return await this.waitForConnection();
     }
   }
   ```

### Caching Strategies

1. **Implement Multi-Level Caching**
   ```typescript
   // L1: In-memory cache
   // L2: Redis cache
   // L3: Database
   async function getData(key: string): Promise<Data> {
     // Try L1 cache
     let data = memoryCache.get(key);
     if (data) return data;
     
     // Try L2 cache
     data = await redisCache.get(key);
     if (data) {
       memoryCache.set(key, data);
       return data;
     }
     
     // Fetch from database
     data = await database.get(key);
     memoryCache.set(key, data);
     redisCache.set(key, data);
     return data;
   }
   ```

2. **Cache Warming**
   ```typescript
   // Pre-populate cache with frequently accessed data
   async function warmCache(): Promise<void> {
     const popularKeys = await getPopularDataKeys();
     const warmupPromises = popularKeys.map(key => 
       getData(key).catch(err => 
         logger.warn('Cache warm-up failed for key', { key, err })
       )
     );
     await Promise.allSettled(warmupPromises);
   }
   ```

## Performance Troubleshooting

### Memory Leaks

1. **Identify Leak Sources**
   ```typescript
   // Monitor heap snapshots
   const v8 = require('v8');
   
   function takeHeapSnapshot(): void {
     const snapshot = v8.writeHeapSnapshot(`./heap-${Date.now()}.heapsnapshot`);
     logger.info('Heap snapshot written', { snapshot });
   }
   
   // Take snapshots periodically in development
   if (process.env.NODE_ENV === 'development') {
     setInterval(takeHeapSnapshot, 60000);
   }
   ```

2. **Monitor Event Listeners**
   ```typescript
   // Track event listener leaks
   EventEmitter.prototype.addListener = function(type, listener) {
     const listeners = this.listeners(type);
     if (listeners.length > 10) {
       logger.warn('Potential memory leak detected', {
         event: type,
         listenerCount: listeners.length
       });
     }
     return originalAddListener.call(this, type, listener);
   };
   ```

### High CPU Usage

1. **Profile CPU Hotspots**
   ```typescript
   // Use built-in profiler
   const { performance, PerformanceObserver } = require('perf_hooks');
   
   const obs = new PerformanceObserver((list) => {
     const entries = list.getEntries();
     entries.forEach((entry) => {
       if (entry.duration > 100) { // Log operations > 100ms
         logger.warn('Slow operation detected', {
           name: entry.name,
           duration: entry.duration
         });
       }
     });
   });
   obs.observe({ entryTypes: ['measure'] });
   
   // Measure function performance
   function measurePerformance<T>(name: string, fn: () => T): T {
     performance.mark(`${name}-start`);
     const result = fn();
     performance.mark(`${name}-end`);
     performance.measure(name, `${name}-start`, `${name}-end`);
     return result;
   }
   ```

### Network Performance

1. **Monitor API Response Times**
   ```typescript
   // Track API performance
   class APIMonitor {
     private responseTimes = new Map<string, number[]>();
     
     recordResponseTime(endpoint: string, duration: number): void {
       if (!this.responseTimes.has(endpoint)) {
         this.responseTimes.set(endpoint, []);
       }
       
       const times = this.responseTimes.get(endpoint)!;
       times.push(duration);
       
       // Keep only last 100 measurements
       if (times.length > 100) {
         times.shift();
       }
       
       // Alert on slow responses
       const avg = times.reduce((a, b) => a + b, 0) / times.length;
       if (avg > 5000) { // 5 second average
         logger.warn('Slow API detected', { endpoint, avgResponseTime: avg });
       }
     }
   }
   ```

2. **Implement Request Retry Logic**
   ```typescript
   // Exponential backoff retry
   async function retryRequest<T>(
     operation: () => Promise<T>,
     maxRetries: number = 3,
     baseDelay: number = 1000
   ): Promise<T> {
     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         return await operation();
       } catch (error) {
         if (attempt === maxRetries) {
           throw error;
         }
         
         const delay = baseDelay * Math.pow(2, attempt - 1);
         logger.warn('Request failed, retrying', { attempt, delay, error });
         await new Promise(resolve => setTimeout(resolve, delay));
       }
     }
     
     throw new Error('All retry attempts exhausted');
   }
   ```

## Performance Testing

### Load Testing

```typescript
// Simple load test for critical paths
async function loadTest(concurrency: number, duration: number): Promise<void> {
  const startTime = Date.now();
  const results: number[] = [];
  
  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() - startTime < duration) {
      const requestStart = Date.now();
      try {
        await performTestOperation();
        results.push(Date.now() - requestStart);
      } catch (error) {
        logger.error('Load test request failed', { error });
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });
  
  await Promise.all(workers);
  
  // Analyze results
  const sortedResults = results.sort((a, b) => a - b);
  const p50 = sortedResults[Math.floor(sortedResults.length * 0.5)];
  const p95 = sortedResults[Math.floor(sortedResults.length * 0.95)];
  const p99 = sortedResults[Math.floor(sortedResults.length * 0.99)];
  
  logger.info('Load test results', {
    totalRequests: results.length,
    avgResponseTime: results.reduce((a, b) => a + b, 0) / results.length,
    p50,
    p95,
    p99
  });
}
```

### Benchmarking

```typescript
// Benchmark critical operations
async function benchmarkOperation(name: string, operation: () => Promise<void>, iterations: number = 1000): Promise<void> {
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await operation();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000); // Convert to milliseconds
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  logger.info(`Benchmark: ${name}`, {
    iterations,
    avgTime: avg.toFixed(2),
    minTime: min.toFixed(2),
    maxTime: max.toFixed(2)
  });
}
```

This performance monitoring guide provides comprehensive documentation for optimizing and monitoring the Discord LLM Bot's performance across all system components, ensuring optimal user experience and resource efficiency.