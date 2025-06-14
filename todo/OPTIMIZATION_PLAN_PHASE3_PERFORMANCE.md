# Phase 3: Performance Optimization Plan

## Overview
This phase focuses on implementing critical performance optimizations identified during analysis. Expected improvements: 30-50% response time reduction, 40-60% memory usage reduction.

## Timeline: 1 Week
- Day 1-2: Cache and memory optimizations (Agents 1-3)
- Day 3-4: I/O and async optimizations (Agents 4-6)  
- Day 5-7: Integration and benchmarking (Agent 7)

## Performance Bottlenecks Identified
1. **CacheManager**: O(n) LRU operations, no compression
2. **ContextManager**: Memory leaks, redundant building
3. **RateLimiter**: Synchronous file I/O on every request
4. **AnalyticsManager**: No event batching (100s of DB writes)
5. **HealthMonitor**: Excessive metric collection
6. **General**: Sequential async operations, no pooling

## Agent Task Assignments

### Agent 1: Cache Performance Optimization
**Priority**: CRITICAL
**Target**: 10x performance improvement for cache operations
**Files**: src/services/cacheManager.ts

**Task Details**:

1. **Replace Array-based LRU with Map** (Current: O(n), Target: O(1)):
```typescript
// OLD: Linear array search
private accessOrder: string[] = [];

// NEW: Timestamp-based Map
private accessOrder: Map<string, number> = new Map();
private accessCounter = 0;

private updateAccessOrder(key: string): void {
  this.accessOrder.set(key, ++this.accessCounter);
}

private evictLRU(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  
  for (const [key, time] of this.accessOrder) {
    if (time < oldestTime) {
      oldestTime = time;
      oldestKey = key;
    }
  }
  
  if (oldestKey) {
    this.cache.delete(oldestKey);
    this.accessOrder.delete(oldestKey);
  }
}
```

2. **Implement Response Compression**:
```typescript
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

interface CacheEntry {
  response: string;
  compressed: boolean;
  timestamp: number;
  metadata: CacheMetadata;
}

async set(prompt: string, userId: string, response: string, serverId?: string): Promise<void> {
  const key = this.generateCacheKey(prompt, userId, serverId);
  
  // Compress responses > 1KB
  let entry: CacheEntry;
  if (response.length > 1024) {
    const compressed = await gzipAsync(Buffer.from(response));
    entry = {
      response: compressed.toString('base64'),
      compressed: true,
      timestamp: Date.now(),
      metadata: { /* ... */ }
    };
  } else {
    entry = {
      response,
      compressed: false,
      timestamp: Date.now(),
      metadata: { /* ... */ }
    };
  }
  
  this.cache.set(key, entry);
  this.updateAccessOrder(key);
}
```

3. **Add Read-Write Lock Pattern**:
```typescript
class ReadWriteLock {
  private readers = 0;
  private writers = 0;
  private waitingWriters = 0;
  private readQueue: (() => void)[] = [];
  private writeQueue: (() => void)[] = [];
  
  async acquireRead(): Promise<() => void> {
    while (this.writers > 0 || this.waitingWriters > 0) {
      await new Promise<void>(resolve => this.readQueue.push(resolve));
    }
    this.readers++;
    return () => this.releaseRead();
  }
  
  async acquireWrite(): Promise<() => void> {
    this.waitingWriters++;
    while (this.readers > 0 || this.writers > 0) {
      await new Promise<void>(resolve => this.writeQueue.push(resolve));
    }
    this.waitingWriters--;
    this.writers++;
    return () => this.releaseWrite();
  }
}
```

4. **Implement Cache Warming**:
```typescript
async warmCache(commonPrompts: string[], userId: string): Promise<void> {
  const warmingPromises = commonPrompts.map(async (prompt) => {
    const key = this.generateCacheKey(prompt, userId);
    if (!this.cache.has(key)) {
      // Pre-generate response
      const response = await this.responseGenerator(prompt, userId);
      await this.set(prompt, userId, response);
    }
  });
  
  await Promise.all(warmingPromises);
}
```

**Success Criteria**:
- Cache operations < 1ms
- 30-70% memory reduction via compression
- No blocking during concurrent reads
- Cache hit rate > 40%

### Agent 2: Memory Leak Prevention
**Priority**: CRITICAL
**Target**: Zero memory leaks, 40% memory reduction
**Files**: src/services/contextManager.ts, src/services/conversationManager.ts

**Task Details**:

1. **Implement Stale Data Cleanup**:
```typescript
// Add to ContextManager
private cleanupInterval: NodeJS.Timeout;
private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
private readonly STALE_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 days

async initialize(): Promise<void> {
  // ... existing init
  this.cleanupInterval = setInterval(() => {
    this.cleanupStaleData();
  }, this.CLEANUP_INTERVAL);
}

private cleanupStaleData(): void {
  const now = Date.now();
  const staleThreshold = now - this.STALE_THRESHOLD;
  let cleaned = 0;
  
  // Clean server contexts
  for (const [serverId, context] of this.serverContext.entries()) {
    // Clean conversations
    for (const [userId, conversation] of context.conversations.entries()) {
      if (conversation.lastInteraction < staleThreshold) {
        context.conversations.delete(userId);
        cleaned++;
      }
    }
    
    // Clean social graph
    for (const [userId, relationships] of context.socialGraph.entries()) {
      if (relationships.lastUpdated < staleThreshold) {
        context.socialGraph.delete(userId);
        cleaned++;
      }
    }
    
    // Remove empty contexts
    if (context.conversations.size === 0 && context.socialGraph.size === 0) {
      this.serverContext.delete(serverId);
    }
  }
  
  if (cleaned > 0) {
    logger.info(`Cleaned ${cleaned} stale context entries`);
  }
}
```

2. **Add Context Caching with TTL**:
```typescript
interface CachedContext {
  context: string;
  expires: number;
  hash: string;
}

private contextCache = new Map<string, CachedContext>();
private readonly CONTEXT_TTL = 5 * 60 * 1000; // 5 minutes

async buildSuperContext(serverId: string, userId: string): Promise<string> {
  const cacheKey = `${serverId}:${userId}`;
  const cached = this.contextCache.get(cacheKey);
  
  if (cached && cached.expires > Date.now()) {
    return cached.context;
  }
  
  // Build context
  const context = await this.buildContextInternal(serverId, userId);
  const hash = this.hashContext(context);
  
  // Cache with TTL
  this.contextCache.set(cacheKey, {
    context,
    expires: Date.now() + this.CONTEXT_TTL,
    hash
  });
  
  // Limit cache size
  if (this.contextCache.size > 1000) {
    this.evictExpiredContexts();
  }
  
  return context;
}
```

3. **Implement Weak References for User Data**:
```typescript
// Use WeakMap for user-specific data that can be GC'd
private userWeakCache = new WeakMap<object, UserContextData>();

getUserContext(userKey: object): UserContextData | undefined {
  return this.userWeakCache.get(userKey);
}

setUserContext(userKey: object, data: UserContextData): void {
  this.userWeakCache.set(userKey, data);
  // No need to manually clean - GC handles it
}
```

4. **Add Memory Monitoring**:
```typescript
private monitorMemoryUsage(): void {
  setInterval(() => {
    const usage = process.memoryUsage();
    const contextSize = this.estimateContextMemory();
    
    if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB threshold
      logger.warn('High memory usage detected', {
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
        contextSize: `${Math.round(contextSize / 1024 / 1024)}MB`
      });
      
      // Trigger aggressive cleanup
      this.performAggressiveCleanup();
    }
  }, 30000); // Check every 30s
}
```

**Success Criteria**:
- No growth in memory over 24h period
- Automatic cleanup of stale data
- Context cache hit rate > 60%
- Memory usage < 300MB steady state

### Agent 3: Rate Limiter I/O Optimization
**Priority**: HIGH
**Target**: 90% reduction in I/O operations
**Files**: src/services/rateLimiter.ts

**Task Details**:

1. **Implement Batch State Updates**:
```typescript
private pendingUpdates = new Map<string, RateLimitState>();
private batchTimer: NodeJS.Timeout | null = null;
private lastFlush = Date.now();
private readonly BATCH_INTERVAL = 5000; // 5 seconds
private readonly BATCH_SIZE = 50;

async checkAndIncrement(
  userId: string,
  isCommand: boolean = false,
  serverId?: string
): Promise<RateLimitCheckResult> {
  // ... existing check logic
  
  // Queue state update instead of immediate write
  this.pendingUpdates.set(userId, userLimits);
  
  // Schedule batch flush
  if (!this.batchTimer) {
    this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_INTERVAL);
  }
  
  // Force flush if batch is large
  if (this.pendingUpdates.size >= this.BATCH_SIZE) {
    await this.flushBatch();
  }
  
  return result;
}

private async flushBatch(): Promise<void> {
  if (this.pendingUpdates.size === 0) return;
  
  const updates = new Map(this.pendingUpdates);
  this.pendingUpdates.clear();
  this.batchTimer = null;
  
  try {
    // Write all updates in single operation
    const stateData: Record<string, RateLimitState> = {};
    for (const [userId, state] of updates) {
      stateData[userId] = state;
    }
    
    await this.atomicWriteState(stateData);
    this.lastFlush = Date.now();
  } catch (error) {
    logger.error('Failed to flush rate limit batch:', error);
    // Re-queue failed updates
    for (const [userId, state] of updates) {
      this.pendingUpdates.set(userId, state);
    }
  }
}
```

2. **Cache Window Calculations**:
```typescript
interface CachedWindow {
  value: number;
  expires: number;
}

private windowCache = {
  minute: new Map<string, CachedWindow>(),
  hour: new Map<string, CachedWindow>(),
  day: new Map<string, CachedWindow>()
};

private getCachedWindowCount(
  userId: string,
  window: 'minute' | 'hour' | 'day',
  requests: RateLimitRequest[]
): number {
  const cache = this.windowCache[window];
  const cached = cache.get(userId);
  
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }
  
  // Calculate window
  const windowMs = this.getWindowMs(window);
  const cutoff = Date.now() - windowMs;
  const count = requests.filter(r => r.timestamp > cutoff).length;
  
  // Cache with appropriate TTL
  const ttl = window === 'minute' ? 10000 : window === 'hour' ? 60000 : 300000;
  cache.set(userId, {
    value: count,
    expires: Date.now() + ttl
  });
  
  return count;
}
```

3. **Implement Memory-First Storage**:
```typescript
private inMemoryState = new Map<string, RateLimitState>();
private readonly MEMORY_SYNC_INTERVAL = 30000; // 30s

async loadState(): Promise<void> {
  try {
    const fileState = await this.loadStateFromFile();
    // Load into memory
    for (const [userId, state] of Object.entries(fileState)) {
      this.inMemoryState.set(userId, state);
    }
  } catch (error) {
    logger.warn('Could not load rate limit state from file');
  }
  
  // Periodic sync to disk
  setInterval(() => this.syncToDisk(), this.MEMORY_SYNC_INTERVAL);
}

private async syncToDisk(): Promise<void> {
  if (this.pendingUpdates.size > 0) {
    await this.flushBatch();
  }
  
  // Write current memory state
  const stateObj: Record<string, RateLimitState> = {};
  for (const [userId, state] of this.inMemoryState) {
    stateObj[userId] = state;
  }
  
  await this.atomicWriteState(stateObj);
}
```

**Success Criteria**:
- File I/O reduced by 90%+
- Response time < 5ms for checks
- No data loss on crashes
- Memory usage < 50MB for 10k users

### Agent 4: Analytics Event Batching
**Priority**: HIGH
**Target**: 95% reduction in database writes
**Files**: src/services/analyticsManager.ts, src/services/analytics/*

**Task Details**:

1. **Implement Event Queue with Batching**:
```typescript
interface QueuedEvent {
  type: EventType;
  data: any;
  timestamp: number;
  priority: 'high' | 'normal' | 'low';
}

private eventQueue = new Map<EventType, QueuedEvent[]>();
private batchTimer: NodeJS.Timeout | null = null;
private readonly BATCH_SIZE = 100;
private readonly BATCH_INTERVAL = 1000; // 1 second
private readonly MAX_QUEUE_SIZE = 1000;

async trackEvent(type: EventType, data: any, priority: 'normal' = 'normal'): Promise<void> {
  if (!this.enabled) return;
  
  const event: QueuedEvent = {
    type,
    data,
    timestamp: Date.now(),
    priority
  };
  
  // Add to queue by type
  if (!this.eventQueue.has(type)) {
    this.eventQueue.set(type, []);
  }
  
  const typeQueue = this.eventQueue.get(type)!;
  typeQueue.push(event);
  
  // Check queue limits
  if (typeQueue.length > this.MAX_QUEUE_SIZE) {
    // Drop oldest low-priority events
    const highPriority = typeQueue.filter(e => e.priority === 'high');
    const normalPriority = typeQueue.filter(e => e.priority === 'normal').slice(-500);
    this.eventQueue.set(type, [...highPriority, ...normalPriority]);
  }
  
  // Schedule batch processing
  if (!this.batchTimer) {
    this.batchTimer = setTimeout(() => this.processBatch(), this.BATCH_INTERVAL);
  }
  
  // Force flush for high priority or large batches
  if (priority === 'high' || this.getTotalQueueSize() >= this.BATCH_SIZE) {
    await this.processBatch();
  }
}

private async processBatch(): Promise<void> {
  this.batchTimer = null;
  
  if (this.getTotalQueueSize() === 0) return;
  
  // Process each event type
  const promises: Promise<void>[] = [];
  
  for (const [type, events] of this.eventQueue) {
    if (events.length > 0) {
      const batch = events.splice(0, this.BATCH_SIZE);
      promises.push(this.writeBatch(type, batch));
    }
  }
  
  // Clean empty queues
  for (const [type, events] of this.eventQueue) {
    if (events.length === 0) {
      this.eventQueue.delete(type);
    }
  }
  
  await Promise.all(promises);
}

private async writeBatch(type: EventType, events: QueuedEvent[]): Promise<void> {
  try {
    await this.database.transaction(async (trx) => {
      const rows = events.map(event => ({
        type: event.type,
        data: JSON.stringify(event.data),
        timestamp: new Date(event.timestamp),
        user_id: event.data.userId,
        server_id: event.data.serverId
      }));
      
      await trx.batchInsert('analytics_events', rows, 100);
    });
    
    logger.debug(`Wrote ${events.length} ${type} events to database`);
  } catch (error) {
    logger.error(`Failed to write ${type} event batch:`, error);
    // Re-queue failed events with backoff
    setTimeout(() => {
      const queue = this.eventQueue.get(type) || [];
      queue.unshift(...events);
      this.eventQueue.set(type, queue);
    }, 5000);
  }
}
```

2. **Add Event Aggregation**:
```typescript
private aggregators = new Map<string, EventAggregator>();

interface EventAggregator {
  count: number;
  firstSeen: number;
  lastSeen: number;
  data: any;
}

async trackAggregatedEvent(
  key: string,
  data: any,
  aggregationWindow: number = 60000 // 1 minute
): Promise<void> {
  const existing = this.aggregators.get(key);
  
  if (existing && (Date.now() - existing.firstSeen) < aggregationWindow) {
    // Update aggregation
    existing.count++;
    existing.lastSeen = Date.now();
    existing.data = this.mergeEventData(existing.data, data);
  } else {
    // Flush existing and start new
    if (existing) {
      await this.flushAggregatedEvent(key, existing);
    }
    
    this.aggregators.set(key, {
      count: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      data
    });
  }
}

private async flushAggregatedEvent(key: string, aggregator: EventAggregator): Promise<void> {
  await this.trackEvent('aggregated', {
    key,
    count: aggregator.count,
    duration: aggregator.lastSeen - aggregator.firstSeen,
    ...aggregator.data
  });
  
  this.aggregators.delete(key);
}
```

3. **Implement Sampling for High-Volume Events**:
```typescript
private samplingRates = new Map<EventType, number>([
  ['message_processed', 0.1], // Sample 10%
  ['cache_hit', 0.05], // Sample 5%
  ['command_used', 1.0], // Track all
]);

shouldSampleEvent(type: EventType): boolean {
  const rate = this.samplingRates.get(type) || 1.0;
  return Math.random() < rate;
}

async trackSampledEvent(type: EventType, data: any): Promise<void> {
  if (!this.shouldSampleEvent(type)) {
    return; // Skip this event
  }
  
  // Add sampling metadata
  const sampledData = {
    ...data,
    _sampled: true,
    _sampleRate: this.samplingRates.get(type) || 1.0
  };
  
  await this.trackEvent(type, sampledData);
}
```

**Success Criteria**:
- Database writes reduced by 95%+
- Event latency < 10ms
- No event loss under load
- Accurate aggregated metrics

### Agent 5: Async Operation Optimization
**Priority**: HIGH
**Target**: 2-3x response time improvement
**Files**: Multiple service files

**Task Details**:

1. **Parallelize Independent Operations**:
```typescript
// In GeminiService
async generateResponse(prompt: string, userId: string, serverId?: string): Promise<string> {
  // OLD: Sequential
  // const conversationContext = await this.conversationManager.getContext(userId);
  // const serverContext = await this.contextManager.getServerContext(serverId);
  // const userPreferences = await this.userPreferenceManager.getPreferences(userId);
  
  // NEW: Parallel
  const [conversationContext, serverContext, userPreferences] = await Promise.all([
    this.conversationManager.getContext(userId),
    this.contextManager.getServerContext(serverId),
    this.userPreferenceManager.getPreferences(userId)
  ]);
  
  // Continue processing...
}

// In CommandHandler
async handleCommand(interaction: CommandInteraction): Promise<void> {
  // Parallel permission and rate limit checks
  const [hasPermission, rateLimitResult] = await Promise.all([
    this.checkPermissions(interaction),
    this.rateLimiter.check(interaction.user.id)
  ]);
  
  if (!hasPermission || !rateLimitResult.allowed) {
    // Handle rejection
    return;
  }
  
  // Continue...
}
```

2. **Implement Promise Pool for Rate-Limited Operations**:
```typescript
export class PromisePool {
  private running = 0;
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  
  constructor(private maxConcurrent: number) {}
  
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }
  
  private async process(): Promise<void> {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.running++;
      
      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      } finally {
        this.running--;
        this.process(); // Process next in queue
      }
    }
  }
}

// Usage in services
private apiPool = new PromisePool(5); // Max 5 concurrent API calls

async makeAPICall(endpoint: string, data: any): Promise<any> {
  return this.apiPool.run(async () => {
    return await fetch(endpoint, { method: 'POST', body: JSON.stringify(data) });
  });
}
```

3. **Remove Unnecessary Awaits**:
```typescript
// Identify and remove awaits on non-promise operations
// OLD
async logEvent(event: string, data: any): Promise<void> {
  await logger.info(event, data); // logger.info doesn't return a promise!
}

// NEW
logEvent(event: string, data: any): void {
  logger.info(event, data);
}

// For fire-and-forget operations
trackAnalytics(event: AnalyticsEvent): void {
  // Don't await - let it run in background
  this.analyticsManager.track(event).catch(error => {
    logger.error('Analytics tracking failed:', error);
  });
}
```

4. **Implement Request Coalescing**:
```typescript
class RequestCoalescer<T> {
  private pending = new Map<string, Promise<T>>();
  
  async get(
    key: string,
    factory: () => Promise<T>,
    ttl: number = 1000
  ): Promise<T> {
    // Check if request is already pending
    const existing = this.pending.get(key);
    if (existing) {
      return existing;
    }
    
    // Create new request
    const promise = factory().finally(() => {
      // Clean up after TTL
      setTimeout(() => this.pending.delete(key), ttl);
    });
    
    this.pending.set(key, promise);
    return promise;
  }
}

// Usage - multiple simultaneous requests for same data share single API call
private contextCoalescer = new RequestCoalescer<string>();

async getContext(userId: string): Promise<string> {
  return this.contextCoalescer.get(
    userId,
    () => this.buildContextInternal(userId),
    5000 // 5 second coalescing window
  );
}
```

**Success Criteria**:
- Response time improved by 2-3x
- No race conditions
- Proper error propagation
- Resource usage remains stable

### Agent 6: Timer and Resource Management
**Priority**: MEDIUM
**Target**: 60% reduction in timer overhead
**Files**: src/services/base/BaseService.ts, multiple services

**Task Details**:

1. **Implement Timer Coalescing**:
```typescript
// In BaseService
private timerManager = new TimerManager();

protected createInterval(
  name: string,
  callback: () => void | Promise<void>,
  interval: number
): string {
  return this.timerManager.createInterval(name, callback, interval);
}

// TimerManager implementation
class TimerManager {
  private timers = new Map<string, TimerInfo>();
  private coalescedTimers = new Map<number, CoalescedTimer>();
  private readonly COALESCE_THRESHOLD = 10000; // 10 seconds
  
  createInterval(
    name: string,
    callback: () => void | Promise<void>,
    interval: number
  ): string {
    const timerId = `${name}_${Date.now()}`;
    
    // Round to nearest 10 seconds for coalescing
    const coalescedInterval = Math.round(interval / this.COALESCE_THRESHOLD) * this.COALESCE_THRESHOLD;
    
    // Get or create coalesced timer
    let coalesced = this.coalescedTimers.get(coalescedInterval);
    if (!coalesced) {
      coalesced = {
        interval: coalescedInterval,
        callbacks: new Map(),
        timer: setInterval(() => this.executeCoalesced(coalescedInterval), coalescedInterval)
      };
      this.coalescedTimers.set(coalescedInterval, coalesced);
    }
    
    // Add callback to coalesced timer
    coalesced.callbacks.set(timerId, {
      name,
      callback,
      lastRun: 0,
      actualInterval: interval
    });
    
    this.timers.set(timerId, {
      coalescedInterval,
      created: Date.now()
    });
    
    return timerId;
  }
  
  private executeCoalesced(interval: number): void {
    const coalesced = this.coalescedTimers.get(interval);
    if (!coalesced) return;
    
    const now = Date.now();
    
    for (const [timerId, info] of coalesced.callbacks) {
      // Check if it's time to run this callback
      if (now - info.lastRun >= info.actualInterval) {
        info.lastRun = now;
        
        // Execute callback with error handling
        Promise.resolve(info.callback()).catch(error => {
          logger.error(`Timer callback error (${info.name}):`, error);
        });
      }
    }
  }
}
```

2. **Implement Object Pooling**:
```typescript
// Generic object pool
export class ObjectPool<T> {
  private pool: T[] = [];
  private created = 0;
  
  constructor(
    private factory: () => T,
    private reset: (obj: T) => void,
    private maxSize: number = 100
  ) {}
  
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    
    this.created++;
    return this.factory();
  }
  
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }
  
  get stats() {
    return {
      pooled: this.pool.length,
      created: this.created,
      efficiency: this.pool.length / Math.max(1, this.created)
    };
  }
}

// Context object pool
const contextPool = new ObjectPool(
  () => ({
    user: '',
    server: '',
    channel: '',
    messages: [],
    metadata: {}
  }),
  (ctx) => {
    ctx.user = '';
    ctx.server = '';
    ctx.channel = '';
    ctx.messages = [];
    ctx.metadata = {};
  },
  50
);

// Usage
async buildContext(): Promise<Context> {
  const ctx = contextPool.acquire();
  try {
    // Build context
    ctx.user = userId;
    // ... populate context
    return { ...ctx }; // Return copy
  } finally {
    contextPool.release(ctx);
  }
}
```

3. **Regex and Pattern Caching**:
```typescript
// Global regex cache
const regexCache = new Map<string, RegExp>();

export function getCachedRegex(pattern: string, flags?: string): RegExp {
  const key = `${pattern}:${flags || ''}`;
  
  let regex = regexCache.get(key);
  if (!regex) {
    regex = new RegExp(pattern, flags);
    regexCache.set(key, regex);
    
    // Limit cache size
    if (regexCache.size > 1000) {
      // Remove oldest entries
      const entries = Array.from(regexCache.entries());
      entries.slice(0, 100).forEach(([k]) => regexCache.delete(k));
    }
  }
  
  return regex;
}

// Usage in services
const mentionPattern = getCachedRegex(`<@!?${userId}>`, 'g');
const matches = content.match(mentionPattern);
```

4. **Connection Pooling for External Services**:
```typescript
// HTTP connection pool
import { Agent } from 'https';

class ConnectionPool {
  private agents = new Map<string, Agent>();
  
  getAgent(baseUrl: string): Agent {
    const url = new URL(baseUrl);
    const key = `${url.protocol}//${url.host}`;
    
    let agent = this.agents.get(key);
    if (!agent) {
      agent = new Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 10,
        maxFreeSockets: 5,
        timeout: 60000,
        scheduling: 'fifo'
      });
      this.agents.set(key, agent);
    }
    
    return agent;
  }
  
  destroy(): void {
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();
  }
}

// Usage in API clients
const pool = new ConnectionPool();

async makeRequest(url: string, options: RequestOptions): Promise<Response> {
  const agent = pool.getAgent(url);
  return fetch(url, {
    ...options,
    agent
  });
}
```

**Success Criteria**:
- Timer overhead reduced by 60%+
- Object creation reduced by 80%+
- Connection reuse > 90%
- Stable memory usage

### Agent 7: Integration and Benchmarking
**Priority**: CRITICAL
**Target**: Validate all optimizations, create performance dashboard
**Files**: New test files and monitoring

**Task Details**:

1. **Create Performance Test Suite**:
```typescript
// tests/performance/benchmarks.test.ts
import { performance } from 'perf_hooks';

describe('Performance Benchmarks', () => {
  const results: BenchmarkResult[] = [];
  
  afterAll(() => {
    // Generate report
    generateBenchmarkReport(results);
  });
  
  describe('Cache Performance', () => {
    test('LRU operations should be O(1)', async () => {
      const cache = new CacheManager();
      const iterations = 10000;
      
      // Warm up
      for (let i = 0; i < 1000; i++) {
        await cache.set(`key${i}`, `user${i}`, `response${i}`);
      }
      
      // Benchmark get operation
      const getStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await cache.get(`key${i % 1000}`, `user${i % 1000}`);
      }
      const getTime = performance.now() - getStart;
      const avgGet = getTime / iterations;
      
      expect(avgGet).toBeLessThan(1); // < 1ms per operation
      results.push({
        name: 'Cache Get Operation',
        avgTime: avgGet,
        operations: iterations
      });
    });
    
    test('Compression should reduce memory by 30%+', async () => {
      const cache = new CacheManager();
      const largeResponse = 'x'.repeat(10000);
      
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 100; i++) {
        await cache.set(`key${i}`, 'user', largeResponse);
      }
      const after = process.memoryUsage().heapUsed;
      
      const uncompressedSize = 100 * largeResponse.length;
      const actualSize = after - before;
      const compressionRatio = 1 - (actualSize / uncompressedSize);
      
      expect(compressionRatio).toBeGreaterThan(0.3);
      results.push({
        name: 'Cache Compression',
        compressionRatio,
        savedBytes: uncompressedSize - actualSize
      });
    });
  });
  
  describe('Async Operations', () => {
    test('Parallel operations should be 2x+ faster', async () => {
      // Sequential
      const sequentialStart = performance.now();
      for (let i = 0; i < 10; i++) {
        await mockAPICall(100); // 100ms delay
      }
      const sequentialTime = performance.now() - sequentialStart;
      
      // Parallel
      const parallelStart = performance.now();
      await Promise.all(
        Array(10).fill(0).map(() => mockAPICall(100))
      );
      const parallelTime = performance.now() - parallelStart;
      
      const speedup = sequentialTime / parallelTime;
      expect(speedup).toBeGreaterThan(2);
      
      results.push({
        name: 'Async Parallelization',
        speedup,
        sequentialTime,
        parallelTime
      });
    });
  });
});
```

2. **Create Load Testing Script**:
```typescript
// scripts/loadTest.ts
import { Worker } from 'worker_threads';
import { performance } from 'perf_hooks';

interface LoadTestConfig {
  users: number;
  duration: number; // seconds
  rampUp: number; // seconds
  scenarios: LoadScenario[];
}

async function runLoadTest(config: LoadTestConfig) {
  const results = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgResponseTime: 0,
    p95ResponseTime: 0,
    p99ResponseTime: 0,
    requestsPerSecond: 0,
    errors: new Map<string, number>()
  };
  
  const responseTimes: number[] = [];
  const workers: Worker[] = [];
  
  // Create worker threads
  for (let i = 0; i < config.users; i++) {
    const worker = new Worker('./loadTestWorker.js', {
      workerData: {
        userId: `loadtest_${i}`,
        scenarios: config.scenarios,
        duration: config.duration,
        delay: (config.rampUp / config.users) * i
      }
    });
    
    worker.on('message', (msg) => {
      if (msg.type === 'result') {
        results.totalRequests++;
        if (msg.success) {
          results.successfulRequests++;
          responseTimes.push(msg.responseTime);
        } else {
          results.failedRequests++;
          const count = results.errors.get(msg.error) || 0;
          results.errors.set(msg.error, count + 1);
        }
      }
    });
    
    workers.push(worker);
  }
  
  // Wait for test completion
  await new Promise(resolve => setTimeout(resolve, (config.duration + config.rampUp) * 1000));
  
  // Calculate statistics
  responseTimes.sort((a, b) => a - b);
  results.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  results.p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)];
  results.p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)];
  results.requestsPerSecond = results.totalRequests / config.duration;
  
  // Terminate workers
  await Promise.all(workers.map(w => w.terminate()));
  
  return results;
}

// Run load test
const testConfig: LoadTestConfig = {
  users: 100,
  duration: 300, // 5 minutes
  rampUp: 60, // 1 minute
  scenarios: [
    { weight: 0.7, action: 'sendMessage' },
    { weight: 0.2, action: 'useCommand' },
    { weight: 0.1, action: 'sendImage' }
  ]
};

runLoadTest(testConfig).then(results => {
  console.log('Load Test Results:', results);
  generateLoadTestReport(results);
});
```

3. **Create Performance Monitoring Dashboard**:
```typescript
// src/monitoring/performanceDashboard.ts
export class PerformanceDashboard {
  private metrics = {
    responseTime: new CircularBuffer<number>(1000),
    cacheHitRate: new CircularBuffer<number>(1000),
    memoryUsage: new CircularBuffer<number>(1000),
    errorRate: new CircularBuffer<number>(1000),
    activeUsers: new CircularBuffer<number>(1000)
  };
  
  private collectors: MetricCollector[] = [];
  
  initialize(): void {
    // Response time collector
    this.collectors.push(
      new MetricCollector('responseTime', 1000, async () => {
        const recent = await this.getRecentResponseTimes();
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        this.metrics.responseTime.push(avg);
        return avg;
      })
    );
    
    // Cache hit rate collector
    this.collectors.push(
      new MetricCollector('cacheHitRate', 5000, async () => {
        const stats = await this.cacheManager.getStats();
        const hitRate = stats.hits / (stats.hits + stats.misses);
        this.metrics.cacheHitRate.push(hitRate);
        return hitRate;
      })
    );
    
    // Memory usage collector
    this.collectors.push(
      new MetricCollector('memoryUsage', 10000, async () => {
        const usage = process.memoryUsage();
        const mb = usage.heapUsed / 1024 / 1024;
        this.metrics.memoryUsage.push(mb);
        return mb;
      })
    );
    
    // Start collectors
    this.collectors.forEach(c => c.start());
  }
  
  async generateReport(): Promise<PerformanceReport> {
    const report: PerformanceReport = {
      timestamp: new Date(),
      summary: {
        avgResponseTime: this.calculateAverage(this.metrics.responseTime),
        p95ResponseTime: this.calculatePercentile(this.metrics.responseTime, 0.95),
        cacheHitRate: this.calculateAverage(this.metrics.cacheHitRate),
        avgMemoryUsage: this.calculateAverage(this.metrics.memoryUsage),
        peakMemoryUsage: Math.max(...this.metrics.memoryUsage.toArray()),
        errorRate: this.calculateAverage(this.metrics.errorRate)
      },
      trends: {
        responseTimeTrend: this.calculateTrend(this.metrics.responseTime),
        memoryTrend: this.calculateTrend(this.metrics.memoryUsage),
        errorTrend: this.calculateTrend(this.metrics.errorRate)
      },
      alerts: this.checkAlerts()
    };
    
    return report;
  }
  
  private checkAlerts(): Alert[] {
    const alerts: Alert[] = [];
    
    // Response time alert
    const avgResponseTime = this.calculateAverage(this.metrics.responseTime);
    if (avgResponseTime > 1000) {
      alerts.push({
        level: 'warning',
        metric: 'responseTime',
        message: `Average response time (${avgResponseTime}ms) exceeds threshold`,
        value: avgResponseTime,
        threshold: 1000
      });
    }
    
    // Memory usage alert
    const currentMemory = this.metrics.memoryUsage.latest();
    if (currentMemory > 500) {
      alerts.push({
        level: 'critical',
        metric: 'memory',
        message: `Memory usage (${currentMemory}MB) exceeds critical threshold`,
        value: currentMemory,
        threshold: 500
      });
    }
    
    return alerts;
  }
}
```

4. **Create Performance Regression Tests**:
```typescript
// tests/performance/regression.test.ts
describe('Performance Regression Tests', () => {
  const baseline = loadBaseline(); // Load from previous runs
  
  test('Response time should not regress', async () => {
    const results = await runResponseTimeBenchmark();
    const regression = (results.avg - baseline.responseTime) / baseline.responseTime;
    
    expect(regression).toBeLessThan(0.1); // Allow 10% regression max
    
    if (regression < -0.1) {
      console.log(`Performance improved by ${Math.abs(regression * 100).toFixed(1)}%!`);
    }
  });
  
  test('Memory usage should not increase', async () => {
    const results = await runMemoryBenchmark();
    const increase = (results.steadyState - baseline.memory) / baseline.memory;
    
    expect(increase).toBeLessThan(0.05); // Allow 5% increase max
  });
  
  test('Cache efficiency should be maintained', async () => {
    const results = await runCacheBenchmark();
    expect(results.hitRate).toBeGreaterThan(baseline.cacheHitRate * 0.95);
  });
});
```

**Success Criteria**:
- All optimizations validated
- Performance dashboard operational
- Automated regression detection
- Load test passing at 100 concurrent users

## Coordination and Integration

### Daily Tasks
- Morning: Review overnight metrics
- Implement assigned optimizations
- Run local performance tests
- Update progress in TODO system

### Integration Points
- Agents 1-3: Core performance improvements
- Agents 4-6: I/O and resource optimization
- Agent 7: Validation and monitoring

### Rollout Strategy
1. Feature flag each optimization
2. Enable in dev environment first
3. Monitor metrics for 24 hours
4. Gradual production rollout
5. Full deployment after validation

## Success Metrics
- **Response Time**: 30-50% improvement
- **Memory Usage**: 40-60% reduction
- **I/O Operations**: 90%+ reduction
- **Cache Hit Rate**: > 40%
- **Error Rate**: < 0.1%
- **Concurrent Users**: Support 100+