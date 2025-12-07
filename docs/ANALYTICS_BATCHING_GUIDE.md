# Analytics Event Batching Guide

## Overview

The Analytics Event Batching system reduces database writes by 95%+ through intelligent batching, aggregation, and sampling strategies. This guide explains how the system works and how to configure it for optimal performance.

## Architecture

### Components

1. **EventBatchingService**
   - Manages event queues organized by type and priority
   - Controls batch processing intervals
   - Implements sampling strategies
   - Handles event aggregation

2. **EventAggregatorService**
   - Provides advanced time-window aggregation
   - Calculates statistical metrics (min, max, avg, percentiles)
   - Detects patterns (spikes, drops, anomalies)
   - Maintains aggregation state across windows

3. **EventTrackingService**
   - Routes events to batching system
   - Provides fallback for direct writes
   - Manages batching configuration

## Key Features

### 1. Event Queuing

Events are queued in memory and processed in batches:

```typescript
// Events are queued, not written immediately
await analyticsManager.trackCommandUsage({
  commandName: 'help',
  userHash: 'user123',
  serverHash: 'server456',
  success: true,
  durationMs: 250
});
```

### 2. Priority-Based Processing

Three priority levels ensure critical events are processed quickly:

- **High Priority**: Errors, failed commands, critical metrics
- **Normal Priority**: Successful commands, standard metrics
- **Low Priority**: Cache hits, memory usage metrics

High priority events trigger immediate flush when threshold is reached.

### 3. Event Sampling

Reduce data volume for high-frequency events:

```typescript
samplingRates: new Map([
  ['message_processed', 0.1],     // Sample 10%
  ['cache_hit', 0.05],            // Sample 5%
  ['performance.response_time', 0.5], // Sample 50%
])
```

### 4. Event Aggregation

Performance metrics are aggregated within time windows:

```typescript
// These 100 events become 1 aggregated record
for (let i = 0; i < 100; i++) {
  await trackPerformance('response_time', Math.random() * 200);
}

// Result: Single record with min, max, avg, percentiles
```

### 5. Pattern Detection

The aggregator detects patterns in real-time:

- **Spike Detection**: Values 2x above recent average
- **Drop Detection**: Values 50% below recent average
- **Anomaly Detection**: Values >3 standard deviations from mean
- **Trend Analysis**: Gradual increases/decreases over time

## Configuration

### Default Configuration

```typescript
{
  maxBatchSize: 100,                    // Events per batch
  batchIntervalMs: 1000,                // 1 second batches
  highPriorityFlushThreshold: 10,       // Flush after 10 high priority events
  aggregationWindowMs: 60000,           // 1 minute aggregation windows
  samplingRates: Map<string, number>    // Event-specific sampling rates
}
```

### Performance Tuning

#### For High-Volume Systems
```typescript
await eventTrackingService.configureBatching(true, {
  maxBatchSize: 500,
  batchIntervalMs: 5000,  // 5 second batches
  aggregationWindowMs: 300000, // 5 minute windows
  samplingRates: new Map([
    ['chat', 0.01], // Sample only 1% of chat commands
  ])
});
```

#### For Low-Latency Requirements
```typescript
await eventTrackingService.configureBatching(true, {
  maxBatchSize: 50,
  batchIntervalMs: 500,  // 500ms batches
  highPriorityFlushThreshold: 5,
  aggregationWindowMs: 30000 // 30 second windows
});
```

## Metrics and Monitoring

### Batch Metrics

Monitor batching performance:

```typescript
const metrics = batchingService.getMetrics();
console.log({
  eventsQueued: metrics.eventsQueued,
  eventsProcessed: metrics.eventsProcessed,
  batchesProcessed: metrics.batchesProcessed,
  eventsDropped: metrics.eventsDropped,
  eventsSampled: metrics.eventsSampled,
  eventsAggregated: metrics.eventsAggregated,
  averageBatchSize: metrics.averageBatchSize
});
```

### Database Write Reduction

Calculate write reduction percentage:

```typescript
const reduction = ((eventsQueued - databaseWrites) / eventsQueued) * 100;
// Target: 95%+ reduction
```

## Implementation Details

### Event Flow

1. **Event Creation**: Application creates analytics event
2. **Sampling Decision**: Event passes sampling check (or is dropped)
3. **Aggregation Check**: Aggregatable events go to aggregator
4. **Queue Placement**: Non-aggregated events queued by priority
5. **Batch Processing**: Timer or threshold triggers batch write
6. **Database Write**: Batch transaction writes all events

### Aggregation Process

1. **Window Assignment**: Events assigned to time windows
2. **Statistical Calculation**: Min, max, avg, percentiles computed
3. **Pattern Detection**: Anomalies and trends identified
4. **Window Closure**: Completed windows converted to events
5. **Result Storage**: Aggregated metrics written to database

### Memory Management

- Event queues have size limits to prevent memory issues
- Old aggregation windows are automatically cleaned up
- Reservoir sampling used for large value sets
- Results are persisted and cleared from memory

## Best Practices

### 1. Configure Sampling Thoughtfully

```typescript
// High-value events: No sampling
['error', 1.0],
['purchase', 1.0],

// Medium-value events: Moderate sampling  
['page_view', 0.1],
['api_call', 0.2],

// Low-value events: Heavy sampling
['cache_hit', 0.01],
['heartbeat', 0.001]
```

### 2. Use Appropriate Priorities

```typescript
// High priority for failures
priority: event.success ? 'normal' : 'high'

// High priority for errors
priority: event.type === 'error' ? 'high' : 'normal'

// Low priority for routine metrics
priority: metric === 'memory_usage' ? 'low' : 'normal'
```

### 3. Monitor Batch Performance

```typescript
// Log metrics periodically
setInterval(() => {
  const metrics = batchingService.getMetrics();
  logger.info('Batching metrics', metrics);
}, 60000);
```

### 4. Handle Shutdown Gracefully

```typescript
// Always flush on shutdown
process.on('SIGTERM', async () => {
  await eventTrackingService.flushBatchedEvents();
  await eventTrackingService.shutdown();
});
```

## Troubleshooting

### Events Not Being Written

1. Check if batching is enabled
2. Verify batch interval hasn't been set too high
3. Ensure flush is called on shutdown
4. Check sampling rates aren't too aggressive

### High Memory Usage

1. Reduce maxBatchSize
2. Decrease aggregationWindowMs
3. Lower maxValuesPerWindow in aggregator
4. Check for event generation loops

### Patterns Not Detected

1. Ensure sufficient events in window
2. Verify pattern detection is enabled
3. Check pattern threshold configuration
4. Review recent pattern cache size

## Performance Impact

### Database Write Reduction

- **Before**: 1,000 events = 1,000 database writes
- **After**: 1,000 events = ~50 database writes (95% reduction)

### CPU Usage

- Minimal overhead from batching logic
- Aggregation calculations are efficient
- Pattern detection uses sliding window approach

### Memory Usage

- ~100 bytes per queued event
- ~1KB per aggregation window
- Automatic cleanup prevents memory leaks

## Future Enhancements

1. **Adaptive Sampling**: Automatically adjust sampling rates based on volume
2. **Compression**: Compress batched events before writing
3. **Multi-Level Aggregation**: Hour, day, week aggregations
4. **Machine Learning**: Anomaly detection using ML models
5. **Distributed Batching**: Coordinate batching across multiple instances