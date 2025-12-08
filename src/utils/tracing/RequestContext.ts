/**
 * RequestContext - Distributed tracing and request correlation system
 * 
 * Provides comprehensive request tracing across service boundaries with:
 * - Span management and hierarchy tracking
 * - Performance monitoring and correlation
 * - Async context propagation
 * - Error correlation and analysis
 * 
 * Agent 6: Distributed Tracing Implementation Specialist
 */

import { AsyncLocalStorage } from 'async_hooks';
import { logger } from '../logger';

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, any>;
  logs: Array<{
    timestamp: number;
    message: string;
    level: string;
    fields?: Record<string, any>;
  }>;
  status: 'in_progress' | 'success' | 'error';
  error?: Error;
}

export interface TraceData {
  traceId: string;
  duration: number;
  spans: TraceSpan[];
  metadata: Record<string, any>;
}

export interface TraceContext {
  context: RequestContext;
}

export class RequestContext {
  public readonly traceId: string;
  public readonly startTime: number;
  private spans = new Map<string, TraceSpan>();
  private currentSpan?: TraceSpan;
  private _isFinalized = false;
  public rootSpanId?: string;
  
  constructor(
    traceId?: string,
    public readonly metadata: Record<string, any> = {}
  ) {
    this.traceId = traceId || this.generateTraceId();
    this.startTime = Date.now();
    
    // Create root span
    const rootSpan = this.startSpan('root', {
      userId: metadata.userId,
      guildId: metadata.guildId,
      channelId: metadata.channelId,
      source: metadata.source,
      messageId: metadata.messageId
    });
    this.rootSpanId = rootSpan.spanId;
  }
  
  private generateTraceId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `trace_${timestamp}_${randomPart}`;
  }
  
  /**
   * Start a new span within this trace
   */
  startSpan(
    operationName: string,
    tags: Record<string, any> = {}
  ): TraceSpan {
    if (this._isFinalized) {
      logger.warn('Attempted to start span on finalized trace', { 
        traceId: this.traceId, 
        operationName 
      });
      throw new Error('Cannot start span on finalized trace');
    }

    const spanId = this.generateSpanId(operationName);
    
    const span: TraceSpan = {
      spanId,
      parentSpanId: this.currentSpan?.spanId,
      operationName,
      startTime: Date.now(),
      tags: {
        ...tags,
        traceId: this.traceId
      },
      logs: [],
      status: 'in_progress'
    };
    
    this.spans.set(spanId, span);
    this.currentSpan = span;
    
    logger.debug('Started span', {
      traceId: this.traceId,
      spanId,
      operationName,
      parentSpanId: span.parentSpanId
    });
    
    return span;
  }
  
  private generateSpanId(operationName: string): string {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substr(2, 5);
    return `${operationName}_${timestamp}_${randomPart}`;
  }
  
  /**
   * End a span and calculate its duration
   */
  endSpan(spanId: string, error?: Error): void {
    const span = this.spans.get(spanId);
    if (!span) {
      logger.warn('Attempted to end non-existent span', { 
        traceId: this.traceId, 
        spanId 
      });
      return;
    }
    
    if (span.endTime) {
      logger.warn('Attempted to end already completed span', {
        traceId: this.traceId,
        spanId
      });
      return;
    }
    
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = error ? 'error' : 'success';
    span.error = error;
    
    // Add error details to tags if present
    if (error) {
      span.tags.errorName = error.name;
      span.tags.errorMessage = error.message;
      span.tags.errorStack = error.stack;
    }
    
    logger.debug('Ended span', {
      traceId: this.traceId,
      spanId,
      operationName: span.operationName,
      duration: span.duration,
      status: span.status
    });
    
    // Update current span to parent
    if (this.currentSpan?.spanId === spanId && span.parentSpanId) {
      this.currentSpan = this.spans.get(span.parentSpanId);
    } else if (this.currentSpan?.spanId === spanId) {
      this.currentSpan = undefined;
    }
  }
  
  /**
   * Add a log entry to the current span
   */
  addLog(
    message: string,
    level: string = 'info',
    fields?: Record<string, any>
  ): void {
    if (!this.currentSpan) {
      logger.warn('No active span for logging', { 
        traceId: this.traceId, 
        message 
      });
      return;
    }
    
    this.currentSpan.logs.push({
      timestamp: Date.now(),
      message,
      level,
      fields
    });
  }
  
  /**
   * Add tags to the current span
   */
  addTags(tags: Record<string, any>): void {
    if (!this.currentSpan) {
      logger.warn('No active span for tags', { 
        traceId: this.traceId, 
        tags 
      });
      return;
    }
    
    Object.assign(this.currentSpan.tags, tags);
  }
  
  /**
   * Get the current active span
   */
  getCurrentSpan(): TraceSpan | undefined {
    return this.currentSpan;
  }
  
  /**
   * Get a span by ID
   */
  getSpan(spanId: string): TraceSpan | undefined {
    return this.spans.get(spanId);
  }
  
  /**
   * Get all spans in this trace
   */
  getSpans(): TraceSpan[] {
    return Array.from(this.spans.values());
  }
  
  /**
   * Finalize the trace and get complete trace data
   */
  finalize(): TraceData {
    if (this._isFinalized) {
      logger.warn('Trace already finalized', { traceId: this.traceId });
    }
    
    this._isFinalized = true;
    
    // End any remaining open spans without error unless it's not the root span
    for (const span of this.spans.values()) {
      if (span.status === 'in_progress') {
        // For root span, close it normally as it's expected to be open
        if (span.spanId === this.rootSpanId) {
          this.endSpan(span.spanId);
        } else {
          // For other spans, log a warning and close with error
          logger.warn('Non-root span not properly closed', { 
            traceId: this.traceId,
            spanId: span.spanId,
            operationName: span.operationName
          });
          this.endSpan(span.spanId, new Error('Span not properly closed'));
        }
      }
    }
    
    return this.getTrace();
  }
  
  /**
   * Get current trace data without finalizing
   */
  getTrace(): TraceData {
    return {
      traceId: this.traceId,
      duration: Date.now() - this.startTime,
      spans: Array.from(this.spans.values()),
      metadata: this.metadata
    };
  }
  
  /**
   * Check if trace is finalized
   */
  isFinalized(): boolean {
    return this._isFinalized;
  }
  
  /**
   * Get the current context from async local storage
   */
  static current(): RequestContext | undefined {
    return asyncLocalStorage.getStore()?.context;
  }
  
  /**
   * Run a function with this context active
   */
  runWithContext<T>(fn: () => T): T {
    return asyncLocalStorage.run({ context: this }, fn);
  }
  
  /**
   * Run an async function with this context active
   */
  async runWithContextAsync<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      asyncLocalStorage.run({ context: this }, async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  
  /**
   * Create a child context that inherits from this context
   */
  createChild(operationName: string, metadata: Record<string, any> = {}): RequestContext {
    const childContext = new RequestContext(
      `${this.traceId}_child_${Date.now()}`,
      {
        ...this.metadata,
        ...metadata,
        parentTraceId: this.traceId
      }
    );
    
    return childContext;
  }
}

// Async context storage for request correlation
export const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Utility function to get or create a trace context
 */
export function getOrCreateContext(metadata: Record<string, any> = {}): RequestContext {
  const existingContext = RequestContext.current();
  if (existingContext && !existingContext.isFinalized()) {
    return existingContext;
  }
  
  return new RequestContext(undefined, metadata);
}

/**
 * Utility function to run with a new trace context
 */
export function withNewContext<T>(
  fn: (context: RequestContext) => T,
  metadata: Record<string, any> = {}
): T {
  const context = new RequestContext(undefined, metadata);
  return context.runWithContext(() => fn(context));
}

/**
 * Utility function to run async with a new trace context
 */
export async function withNewContextAsync<T>(
  fn: (context: RequestContext) => Promise<T>,
  metadata: Record<string, any> = {}
): Promise<T> {
  const context = new RequestContext(undefined, metadata);
  return context.runWithContextAsync(() => fn(context));
}