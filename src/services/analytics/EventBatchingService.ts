/**
 * Event Batching Service
 * 
 * Implements high-performance event batching to reduce database writes by 95%+.
 * Features:
 * - Event queue with configurable batch sizes and intervals
 * - Priority-based event processing (high/normal/low)
 * - Event aggregation for similar events
 * - Sampling for high-volume events
 * - Automatic force flush for high priority events
 * 
 * @module EventBatchingService
 */

import { Mutex } from 'async-mutex';
import { BaseService } from '../base/BaseService';
import { logger } from '../../utils/logger';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import type {
  CommandUsageEvent,
  UserEngagementEvent,
  ErrorEvent,
  PerformanceEvent
} from '../interfaces/AnalyticsInterfaces';
import Database from 'better-sqlite3';
import { EventAggregatorService, type IAggregatorService } from './EventAggregatorService';

// Event types
export type EventType = 'command' | 'engagement' | 'error' | 'performance' | 'datastore';

export type EventPriority = 'high' | 'normal' | 'low';

export interface BatchableEvent {
  type: EventType;
  priority: EventPriority;
  data: CommandUsageEvent | UserEngagementEvent | ErrorEvent | PerformanceEvent | DataStoreEvent;
  timestamp: number;
  sampled?: boolean;
  sampleRate?: number;
}

export interface DataStoreEvent {
  timestamp: number;
  operation: 'save' | 'load' | 'error';
  storeType: string;
  latency: number;
  bytesProcessed?: number;
}

export interface BatchConfig {
  maxBatchSize: number;
  batchIntervalMs: number;
  highPriorityFlushThreshold: number;
  samplingRates: Map<string, number>;
  aggregationWindowMs: number;
}

export interface BatchMetrics {
  eventsQueued: number;
  eventsProcessed: number;
  batchesProcessed: number;
  eventsDropped: number;
  eventsSampled: number;
  eventsAggregated: number;
  averageBatchSize: number;
  lastFlushTime: number;
}

export interface IEventBatchingService {
  /**
   * Initialize the batching service
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the batching service
   */
  shutdown(): Promise<void>;

  /**
   * Get health status of the batching service
   */
  getBatchingHealthStatus(): { healthy: boolean; errors: string[] };

  /**
   * Add event to batch queue
   */
  queueEvent(event: BatchableEvent): Promise<void>;
  
  /**
   * Force flush all pending events
   */
  flush(): Promise<void>;
  
  /**
   * Get batch metrics
   */
  getMetrics(): BatchMetrics;
  
  /**
   * Update batch configuration
   */
  updateConfig(config: Partial<BatchConfig>): void;
  
  /**
   * Get current batch configuration
   */
  getConfig(): BatchConfig;
}

/**
 * Event Batching Service Implementation
 * 
 * Batches events to reduce database write operations significantly.
 */
export class EventBatchingService extends BaseService implements IEventBatchingService {
  private database: Database.Database | null = null;
  private readonly mutex = new Mutex();
  
  // Event queues organized by type and priority
  private eventQueues: Map<EventType, Map<EventPriority, BatchableEvent[]>> = new Map();
  
  // Event aggregator for advanced aggregation
  private aggregator: IAggregatorService | null = null;
  
  // Batch configuration
  private config: BatchConfig = {
    maxBatchSize: 100,
    batchIntervalMs: 1000, // 1 second
    highPriorityFlushThreshold: 10, // Flush when 10 high priority events are queued
    samplingRates: new Map([
      ['message_processed', 0.1], // Sample 10% of message processed events
      ['cache_hit', 0.05], // Sample 5% of cache hit events
      ['performance.response_time', 0.5], // Sample 50% of response time metrics
      ['performance.memory_usage', 0.1], // Sample 10% of memory usage metrics
    ]),
    aggregationWindowMs: 60000 // 1 minute aggregation window
  };
  
  // Metrics
  private metrics: BatchMetrics = {
    eventsQueued: 0,
    eventsProcessed: 0,
    batchesProcessed: 0,
    eventsDropped: 0,
    eventsSampled: 0,
    eventsAggregated: 0,
    averageBatchSize: 0,
    lastFlushTime: Date.now()
  };
  
  // Timer management is handled by BaseService
  
  // Aggregation state
  private aggregationState: Map<string, AggregatedEvent> = new Map();
  
  constructor(database: Database.Database | null) {
    super();
    this.database = database;
    this.initializeQueues();
  }
  
  /**
   * Get service name
   */
  protected getServiceName(): string {
    return 'EventBatchingService';
  }

  /**
   * Initialize event queues
   */
  private initializeQueues(): void {
    const eventTypes: EventType[] = ['command', 'engagement', 'error', 'performance', 'datastore'];
    const priorities: EventPriority[] = ['high', 'normal', 'low'];
    
    for (const type of eventTypes) {
      const priorityMap = new Map<EventPriority, BatchableEvent[]>();
      for (const priority of priorities) {
        priorityMap.set(priority, []);
      }
      this.eventQueues.set(type, priorityMap);
    }
  }

  /**
   * Perform service-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    // Initialize aggregator
    this.aggregator = new EventAggregatorService();
    await this.aggregator.initialize();
    this.aggregator.updateConfig({
      windowSizeMs: this.config.aggregationWindowMs
    });
    
    // Use coalesced timer for batch processing
    this.createInterval('batchProcessing', async () => {
      try {
        await this.processBatch();
      } catch (error) {
        logger.error('Error processing batch:', error);
      }
    }, this.config.batchIntervalMs, { coalesce: true });
    
    logger.info('EventBatchingService initialized', {
      maxBatchSize: this.config.maxBatchSize,
      batchIntervalMs: this.config.batchIntervalMs,
      samplingRatesCount: this.config.samplingRates.size,
      aggregationEnabled: true,
      timerCoalescing: true
    });
  }

  /**
   * Perform service-specific shutdown
   */
  protected async performShutdown(): Promise<void> {
    // BaseService automatically clears all timers
    
    // Flush all pending events
    await this.flush();
    
    // Shutdown aggregator
    if (this.aggregator) {
      await this.aggregator.shutdown();
      this.aggregator = null;
    }
  }

  /**
   * Queue event for batching
   */
  async queueEvent(event: BatchableEvent): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      // Apply sampling if configured
      const sampleKey = this.getSampleKey(event);
      if (sampleKey && this.config.samplingRates.has(sampleKey)) {
        const sampleRate = this.config.samplingRates.get(sampleKey)!;
        if (Math.random() > sampleRate) {
          this.metrics.eventsDropped++;
          return; // Drop event based on sampling
        }
        event.sampled = true;
        event.sampleRate = sampleRate;
        this.metrics.eventsSampled++;
      }
      
      // Check if event should be aggregated
      if (this.shouldAggregate(event)) {
        this.aggregateEvent(event);
        this.metrics.eventsAggregated++;
        return;
      }
      
      // Add to appropriate queue
      const typeQueue = this.eventQueues.get(event.type);
      if (!typeQueue) {
        logger.error(`Unknown event type: ${event.type}`);
        return;
      }
      
      const priorityQueue = typeQueue.get(event.priority);
      if (!priorityQueue) {
        logger.error(`Unknown priority: ${event.priority}`);
        return;
      }
      
      priorityQueue.push(event);
      this.metrics.eventsQueued++;
      
      // Check if we should force flush for high priority events
      if (event.priority === 'high') {
        const highPriorityCount = typeQueue.get('high')?.length || 0;
        if (highPriorityCount >= this.config.highPriorityFlushThreshold) {
          release(); // Release mutex before async flush
          await this.flush();
          return;
        }
      }
      
      // Check if any queue exceeds max batch size
      for (const [_priority, queue] of typeQueue) {
        if (queue.length >= this.config.maxBatchSize) {
          release(); // Release mutex before async flush
          await this.flush();
          return;
        }
      }
    } finally {
      if (release) release();
    }
  }

  /**
   * Get sample key for event
   */
  private getSampleKey(event: BatchableEvent): string | null {
    if (event.type === 'command' && 'commandName' in event.data) {
      return event.data.commandName;
    }
    if (event.type === 'performance' && 'metric' in event.data) {
      return `performance.${event.data.metric}`;
    }
    if (event.type === 'engagement' && 'eventType' in event.data) {
      return `engagement.${event.data.eventType}`;
    }
    return null;
  }

  /**
   * Check if event should be aggregated
   */
  private shouldAggregate(event: BatchableEvent): boolean {
    // Use advanced aggregator for performance metrics
    if (this.aggregator && event.type === 'performance') {
      return true;
    }
    // Still use simple aggregation for errors and datastore events
    if (event.type === 'error' && 'errorHash' in event.data) {
      return true;
    }
    if (event.type === 'datastore') {
      return true;
    }
    return false;
  }

  /**
   * Aggregate event
   */
  private aggregateEvent(event: BatchableEvent): void {
    // Use advanced aggregator for performance events
    if (this.aggregator && event.type === 'performance' && 'metric' in event.data && 'value' in event.data) {
      const perfEvent = event.data as PerformanceEvent;
      this.aggregator.addEvent(
        'performance',
        `${perfEvent.metric}:${perfEvent.context || 'default'}`,
        perfEvent.value,
        { metric: perfEvent.metric, context: perfEvent.context }
      );
      return;
    }
    
    // Use simple aggregation for other events
    const aggregateKey = this.getAggregateKey(event);
    if (!aggregateKey) return;
    
    const existing = this.aggregationState.get(aggregateKey);
    const now = Date.now();
    
    if (!existing || now - existing.windowStart > this.config.aggregationWindowMs) {
      // Start new aggregation window
      this.aggregationState.set(aggregateKey, {
        type: event.type,
        key: aggregateKey,
        count: 1,
        sum: this.getEventValue(event),
        min: this.getEventValue(event),
        max: this.getEventValue(event),
        windowStart: now,
        lastUpdate: now,
        metadata: this.getEventMetadata(event)
      });
    } else {
      // Update existing aggregation
      const value = this.getEventValue(event);
      existing.count++;
      existing.sum += value;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.lastUpdate = now;
    }
  }

  /**
   * Get aggregation key for event
   */
  private getAggregateKey(event: BatchableEvent): string | null {
    if (event.type === 'performance' && 'metric' in event.data && 'context' in event.data) {
      return `perf:${event.data.metric}:${event.data.context || 'default'}`;
    }
    if (event.type === 'error' && 'errorHash' in event.data) {
      return `error:${event.data.errorHash}`;
    }
    if (event.type === 'datastore' && 'operation' in event.data && 'storeType' in event.data) {
      return `ds:${event.data.operation}:${event.data.storeType}`;
    }
    return null;
  }

  /**
   * Get numeric value from event for aggregation
   */
  private getEventValue(event: BatchableEvent): number {
    if (event.type === 'performance' && 'value' in event.data) {
      return event.data.value;
    }
    if (event.type === 'datastore' && 'latency' in event.data) {
      return event.data.latency;
    }
    if (event.type === 'error' && 'count' in event.data) {
      return event.data.count;
    }
    return 1;
  }

  /**
   * Get event metadata for aggregation
   */
  private getEventMetadata(event: BatchableEvent): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    
    if (event.type === 'performance' && 'metric' in event.data) {
      metadata.metric = event.data.metric;
      if ('context' in event.data) metadata.context = event.data.context;
    }
    if (event.type === 'error') {
      if ('errorType' in event.data) metadata.errorType = event.data.errorType;
      if ('errorCategory' in event.data) metadata.errorCategory = event.data.errorCategory;
    }
    if (event.type === 'datastore') {
      if ('operation' in event.data) metadata.operation = event.data.operation;
      if ('storeType' in event.data) metadata.storeType = event.data.storeType;
    }
    
    return metadata;
  }

  /**
   * Process batch of events
   */
  private async processBatch(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (!this.database) return;
      
      const allEvents: BatchableEvent[] = [];
      
      // Collect events in priority order
      const priorities: EventPriority[] = ['high', 'normal', 'low'];
      for (const [_type, typeQueue] of this.eventQueues) {
        for (const priority of priorities) {
          const queue = typeQueue.get(priority);
          if (queue && queue.length > 0) {
            allEvents.push(...queue.splice(0, this.config.maxBatchSize - allEvents.length));
            if (allEvents.length >= this.config.maxBatchSize) break;
          }
        }
        if (allEvents.length >= this.config.maxBatchSize) break;
      }
      
      // Process simple aggregated events
      const now = Date.now();
      for (const [key, aggregated] of this.aggregationState) {
        if (now - aggregated.windowStart > this.config.aggregationWindowMs) {
          allEvents.push(this.createAggregatedEvent(aggregated));
          this.aggregationState.delete(key);
        }
      }
      
      // Process advanced aggregated events
      if (this.aggregator) {
        const aggregatorResults = this.aggregator.closeWindows();
        for (const result of aggregatorResults) {
          // Convert aggregator result to performance event
          const perfEvent: PerformanceEvent = {
            timestamp: result.endTime,
            metric: result.metadata.metric as any || 'aggregated_metric',
            value: result.avg,
            context: JSON.stringify({
              aggregation: {
                count: result.count,
                min: result.min,
                max: result.max,
                sum: result.sum,
                median: result.median,
                stdDev: result.stdDev,
                percentiles: result.percentiles,
                windowMs: result.endTime - result.startTime,
                patterns: result.patterns
              },
              originalContext: result.metadata.context
            })
          };
          
          allEvents.push({
            type: 'performance',
            priority: 'normal',
            data: perfEvent,
            timestamp: perfEvent.timestamp
          });
        }
      }
      
      if (allEvents.length === 0) return;
      
      // Process events in a transaction
      this.database.transaction(() => {
        for (const event of allEvents) {
          this.writeEvent(event);
        }
      })();
      
      // Update metrics
      this.metrics.eventsProcessed += allEvents.length;
      this.metrics.batchesProcessed++;
      this.metrics.lastFlushTime = now;
      
      // Update average batch size
      this.metrics.averageBatchSize = 
        (this.metrics.averageBatchSize * (this.metrics.batchesProcessed - 1) + allEvents.length) / 
        this.metrics.batchesProcessed;
      
      logger.debug(`Processed batch of ${allEvents.length} events`);
    } finally {
      release();
    }
  }

  /**
   * Create event from aggregated data
   */
  private createAggregatedEvent(aggregated: AggregatedEvent): BatchableEvent {
    const baseEvent: BatchableEvent = {
      type: aggregated.type,
      priority: 'normal',
      timestamp: aggregated.lastUpdate,
      data: {} as any
    };
    
    if (aggregated.type === 'performance') {
      baseEvent.data = {
        timestamp: aggregated.lastUpdate,
        metric: aggregated.metadata.metric as any,
        value: aggregated.sum / aggregated.count, // Average
        context: JSON.stringify({
          ...aggregated.metadata,
          aggregation: {
            count: aggregated.count,
            min: aggregated.min,
            max: aggregated.max,
            sum: aggregated.sum,
            windowMs: aggregated.lastUpdate - aggregated.windowStart
          }
        })
      } as PerformanceEvent;
    } else if (aggregated.type === 'error') {
      baseEvent.data = {
        timestamp: aggregated.lastUpdate,
        errorType: aggregated.metadata.errorType as string,
        errorCategory: aggregated.metadata.errorCategory as any,
        errorHash: aggregated.key.split(':')[1],
        count: aggregated.count
      } as ErrorEvent;
    } else if (aggregated.type === 'datastore') {
      baseEvent.data = {
        timestamp: aggregated.lastUpdate,
        operation: aggregated.metadata.operation as any,
        storeType: aggregated.metadata.storeType as string,
        latency: aggregated.sum / aggregated.count, // Average latency
        bytesProcessed: aggregated.metadata.bytesProcessed as number
      } as DataStoreEvent;
    }
    
    return baseEvent;
  }

  /**
   * Write event to database
   */
  private writeEvent(event: BatchableEvent): void {
    if (!this.database) return;
    
    try {
      switch (event.type) {
        case 'command':
          this.writeCommandEvent(event.data as CommandUsageEvent);
          break;
        case 'engagement':
          this.writeEngagementEvent(event.data as UserEngagementEvent);
          break;
        case 'error':
          this.writeErrorEvent(event.data as ErrorEvent);
          break;
        case 'performance':
          this.writePerformanceEvent(event.data as PerformanceEvent);
          break;
        case 'datastore':
          this.writeDataStoreEvent(event.data as DataStoreEvent);
          break;
      }
    } catch (error) {
      logger.error(`Failed to write ${event.type} event:`, error);
      this.metrics.eventsDropped++;
    }
  }

  /**
   * Write command usage event
   */
  private writeCommandEvent(event: CommandUsageEvent): void {
    const stmt = this.database!.prepare(`
      INSERT INTO command_usage 
      (timestamp, command_name, user_hash, server_hash, success, duration_ms, error_type, error_category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      event.timestamp,
      event.commandName,
      event.userHash,
      event.serverHash || 'dm',
      event.success ? 1 : 0,
      event.durationMs,
      event.errorType || null,
      event.errorCategory || null
    );
  }

  /**
   * Write engagement event
   */
  private writeEngagementEvent(event: UserEngagementEvent): void {
    const stmt = this.database!.prepare(`
      INSERT INTO user_engagement 
      (timestamp, user_hash, server_hash, event_type, session_id, interaction_depth)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      event.timestamp,
      event.userHash,
      event.serverHash,
      event.eventType,
      event.sessionId,
      event.interactionDepth
    );
  }

  /**
   * Write error event
   */
  private writeErrorEvent(event: ErrorEvent): void {
    const stmt = this.database!.prepare(`
      INSERT INTO error_events 
      (timestamp, error_type, error_category, command_context, user_hash, server_hash, error_hash, count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(error_hash, DATE(timestamp / 1000, 'unixepoch')) 
      DO UPDATE SET count = count + excluded.count, timestamp = excluded.timestamp
    `);
    
    stmt.run(
      event.timestamp,
      event.errorType,
      event.errorCategory,
      event.commandContext || null,
      event.userHash || null,
      event.serverHash || null,
      event.errorHash,
      event.count
    );
  }

  /**
   * Write performance event
   */
  private writePerformanceEvent(event: PerformanceEvent): void {
    const stmt = this.database!.prepare(`
      INSERT INTO performance_events (timestamp, metric, value, context)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(
      event.timestamp,
      event.metric,
      event.value,
      event.context || null
    );
  }

  /**
   * Write datastore event
   */
  private writeDataStoreEvent(event: DataStoreEvent): void {
    // Map to performance event
    const metric = event.operation === 'save' ? 'datastore_save_latency' : 
      event.operation === 'load' ? 'datastore_load_latency' : 
        'datastore_error_rate';
    
    const stmt = this.database!.prepare(`
      INSERT INTO performance_events (timestamp, metric, value, context)
      VALUES (?, ?, ?, ?)
    `);
    
    const context = JSON.stringify({ 
      storeType: event.storeType, 
      operation: event.operation,
      bytesProcessed: event.bytesProcessed || 0 
    });
    
    stmt.run(event.timestamp, metric, event.latency, context);
  }

  /**
   * Force flush all pending events
   */
  async flush(): Promise<void> {
    logger.debug('Force flushing all pending events');
    
    // Process all pending batches
    let hasEvents = true;
    while (hasEvents) {
      await this.processBatch();
      
      // Check if there are more events
      hasEvents = false;
      for (const [_type, typeQueue] of this.eventQueues) {
        for (const [_priority, queue] of typeQueue) {
          if (queue.length > 0) {
            hasEvents = true;
            break;
          }
        }
        if (hasEvents) break;
      }
    }
    
    // Flush all aggregated events
    const release = await this.mutex.acquire();
    try {
      const aggregatedEvents: BatchableEvent[] = [];
      
      // Flush simple aggregated events
      for (const [key, aggregated] of this.aggregationState) {
        aggregatedEvents.push(this.createAggregatedEvent(aggregated));
        this.aggregationState.delete(key);
      }
      
      // Flush advanced aggregated events
      if (this.aggregator) {
        const aggregatorResults = this.aggregator.closeWindows();
        for (const result of aggregatorResults) {
          const perfEvent: PerformanceEvent = {
            timestamp: result.endTime,
            metric: result.metadata.metric as any || 'aggregated_metric',
            value: result.avg,
            context: JSON.stringify({
              aggregation: {
                count: result.count,
                min: result.min,
                max: result.max,
                sum: result.sum,
                median: result.median,
                stdDev: result.stdDev,
                percentiles: result.percentiles,
                windowMs: result.endTime - result.startTime,
                patterns: result.patterns
              },
              originalContext: result.metadata.context
            })
          };
          
          aggregatedEvents.push({
            type: 'performance',
            priority: 'normal',
            data: perfEvent,
            timestamp: perfEvent.timestamp
          });
        }
      }
      
      if (aggregatedEvents.length > 0 && this.database) {
        this.database.transaction(() => {
          for (const event of aggregatedEvents) {
            this.writeEvent(event);
          }
        })();
        
        this.metrics.eventsProcessed += aggregatedEvents.length;
        logger.debug(`Flushed ${aggregatedEvents.length} aggregated events`);
      }
    } finally {
      release();
    }
  }

  /**
   * Get batch metrics
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Update batch configuration
   */
  updateConfig(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart timer if interval changed
    if (config.batchIntervalMs) {
      // Timer management is handled automatically by BaseService
      // Configuration will take effect on next initialization
      logger.info('Batch interval configuration updated. Timer will restart on next initialization.');
    }
    
    logger.info('Batch configuration updated', this.config);
  }

  /**
   * Get current batch configuration
   */
  getConfig(): BatchConfig {
    return { ...this.config };
  }

  /**
   * Get health status of the batching service
   * Note: This method provides a simplified health status for interface compatibility
   */
  getBatchingHealthStatus(): { healthy: boolean; errors: string[] } {
    return {
      healthy: this.isHealthy(),
      errors: this.getHealthErrors()
    };
  }

  /**
   * Check if service is healthy
   */
  protected isHealthy(): boolean {
    return !!this.database && this.isInitialized && !this.isShuttingDown;
  }
  
  /**
   * Get health errors
   */
  protected getHealthErrors(): string[] {
    const errors: string[] = [];
    if (!this.database) {
      errors.push('Database connection not available');
    }
    if (!this.isInitialized) {
      errors.push('Service not initialized');
    }
    return errors;
  }
  
  /**
   * Collect service metrics
   */
  protected collectServiceMetrics(): Record<string, unknown> {
    // Count queued events
    let totalQueued = 0;
    for (const [_type, typeQueue] of this.eventQueues) {
      for (const [_priority, queue] of typeQueue) {
        totalQueued += queue.length;
      }
    }
    
    return {
      databaseAvailable: !!this.database,
      serviceInitialized: this.isInitialized,
      config: this.config,
      metrics: this.metrics,
      queuedEvents: totalQueued,
      aggregatedEvents: this.aggregationState.size
    };
  }
}

// Aggregated event interface
interface AggregatedEvent {
  type: EventType;
  key: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  windowStart: number;
  lastUpdate: number;
  metadata: Record<string, unknown>;
}