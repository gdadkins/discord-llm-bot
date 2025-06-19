/**
 * TracingMiddleware - Service instrumentation and automatic tracing
 * 
 * Provides automatic method instrumentation and tracing capabilities:
 * - Method-level span creation and management
 * - Automatic error correlation
 * - Service-wide instrumentation
 * - Performance monitoring integration
 * 
 * Agent 6: Distributed Tracing Implementation Specialist
 */

import { logger } from '../utils/logger';
import { RequestContext } from '../utils/tracing/RequestContext';

/**
 * Decorator function to add tracing to async methods
 */
export function withTracing<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  operationName: string,
  options: {
    extractTags?: (...args: Parameters<T>) => Record<string, unknown>;
    shouldTrace?: (...args: Parameters<T>) => boolean;
    skipIfNoContext?: boolean;
  } = {}
): T {
  return (async (...args: Parameters<T>) => {
    const context = RequestContext.current();
    
    // Skip tracing if no context and skipIfNoContext is true
    if (!context && options.skipIfNoContext) {
      return fn(...args);
    }
    
    // If no context, create a minimal one for this operation
    if (!context) {
      const newContext = new RequestContext(undefined, {
        source: 'untraced_operation',
        operation: operationName
      });
      return newContext.runWithContextAsync(async () => {
        return withTracing(fn, operationName, { ...options, skipIfNoContext: true })(...args);
      });
    }
    
    // Check if we should trace this call
    if (options.shouldTrace && !options.shouldTrace(...args)) {
      return fn(...args);
    }
    
    const span = context.startSpan(operationName);
    
    try {
      // Extract additional tags from arguments
      if (options.extractTags) {
        const additionalTags = options.extractTags(...args);
        context.addTags(additionalTags);
      }
      
      // Add basic performance tracking
      const startMemory = process.memoryUsage();
      context.addTags({
        startMemoryMB: Math.round(startMemory.heapUsed / 1024 / 1024),
        argumentCount: args.length
      });
      
      const result = await fn(...args);
      
      // Add completion tags
      const endMemory = process.memoryUsage();
      context.addTags({
        endMemoryMB: Math.round(endMemory.heapUsed / 1024 / 1024),
        memoryDeltaMB: Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024),
        resultType: typeof result,
        hasResult: result !== undefined && result !== null
      });
      
      context.endSpan(span.spanId);
      return result;
    } catch (error) {
      // Add error context
      context.addTags({
        errorType: (error as Error).name,
        errorMessage: (error as Error).message
      });
      
      context.addLog(
        `Operation failed: ${(error as Error).message}`,
        'error',
        {
          errorName: (error as Error).name,
          errorStack: (error as Error).stack,
          operationName
        }
      );
      
      context.endSpan(span.spanId, error as Error);
      throw error;
    }
  }) as T;
}

/**
 * Decorator for synchronous functions
 */
export function withTracingSync<T extends (...args: unknown[]) => unknown>(
  fn: T,
  operationName: string,
  options: {
    extractTags?: (...args: Parameters<T>) => Record<string, unknown>;
    shouldTrace?: (...args: Parameters<T>) => boolean;
    skipIfNoContext?: boolean;
  } = {}
): T {
  return ((...args: Parameters<T>) => {
    const context = RequestContext.current();
    
    // Skip tracing if no context and skipIfNoContext is true
    if (!context && options.skipIfNoContext) {
      return fn(...args);
    }
    
    // If no context, run without tracing for sync functions
    if (!context) {
      logger.debug('No trace context for sync operation', { operationName });
      return fn(...args);
    }
    
    // Check if we should trace this call
    if (options.shouldTrace && !options.shouldTrace(...args)) {
      return fn(...args);
    }
    
    const span = context.startSpan(operationName);
    
    try {
      // Extract additional tags from arguments
      if (options.extractTags) {
        const additionalTags = options.extractTags(...args);
        context.addTags(additionalTags);
      }
      
      const result = fn(...args);
      
      context.addTags({
        resultType: typeof result,
        hasResult: result !== undefined && result !== null
      });
      
      context.endSpan(span.spanId);
      return result;
    } catch (error) {
      context.addTags({
        errorType: (error as Error).name,
        errorMessage: (error as Error).message
      });
      
      context.endSpan(span.spanId, error as Error);
      throw error;
    }
  }) as T;
}

/**
 * Automatically instrument all methods of a service class
 */
export function instrumentService<T extends object>(
  service: T,
  serviceName: string,
  options: {
    skipMethods?: string[];
    onlyMethods?: string[];
    extractServiceTags?: (service: T) => Record<string, unknown>;
  } = {}
): T {
  const instrumented = Object.create(Object.getPrototypeOf(service));
  const prototype = Object.getPrototypeOf(service);
  
  // Copy all properties from the original service
  Object.setPrototypeOf(instrumented, prototype);
  for (const key of Object.getOwnPropertyNames(service)) {
    const descriptor = Object.getOwnPropertyDescriptor(service, key);
    if (descriptor) {
      Object.defineProperty(instrumented, key, descriptor);
    }
  }
  
  // Get service-level tags
  const serviceTags = options.extractServiceTags ? options.extractServiceTags(service) : {};
  
  // Instrument methods
  for (const key of Object.getOwnPropertyNames(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    
    if (
      descriptor &&
      typeof descriptor.value === 'function' &&
      key !== 'constructor' &&
      (!options.skipMethods || !options.skipMethods.includes(key)) &&
      (!options.onlyMethods || options.onlyMethods.includes(key))
    ) {
      const originalMethod = descriptor.value;
      const operationName = `${serviceName}.${key}`;
      
      // Check if method is async
      const isAsync = originalMethod.constructor.name === 'AsyncFunction' ||
                    originalMethod.toString().includes('async ') ||
                    originalMethod.toString().includes('return') && originalMethod.toString().includes('await');
      
      const instrumentedMethod = isAsync
        ? withTracing(
          originalMethod.bind(service),
          operationName,
          {
            extractTags: () => ({
              ...serviceTags,
              serviceName,
              methodName: key
            })
          }
        )
        : withTracingSync(
          originalMethod.bind(service),
          operationName,
          {
            extractTags: () => ({
              ...serviceTags,
              serviceName,
              methodName: key
            })
          }
        );
      
      Object.defineProperty(instrumented, key, {
        ...descriptor,
        value: instrumentedMethod
      });
    }
  }
  
  logger.debug('Service instrumented for tracing', {
    serviceName,
    instrumentedMethods: Object.getOwnPropertyNames(prototype).filter(key =>
      typeof prototype[key] === 'function' && key !== 'constructor'
    ).length
  });
  
  return instrumented;
}

/**
 * Instrument specific methods of a service
 */
export function instrumentMethods<T extends object>(
  service: T,
  methodMap: Record<string, string>, // methodName -> operationName
  serviceName: string
): T {
  const instrumented = { ...service };
  
  for (const [methodName, operationName] of Object.entries(methodMap)) {
    const originalMethod = (service as Record<string, unknown>)[methodName];
    
    if (typeof originalMethod === 'function') {
      const isAsync = originalMethod.constructor.name === 'AsyncFunction';
      
      (instrumented as Record<string, unknown>)[methodName] = isAsync
        ? withTracing(
          originalMethod.bind(service),
          operationName,
          {
            extractTags: () => ({
              serviceName,
              methodName,
              operationName
            })
          }
        )
        : withTracingSync(
          originalMethod.bind(service),
          operationName,
          {
            extractTags: () => ({
              serviceName,
              methodName,
              operationName
            })
          }
        );
    }
  }
  
  return instrumented;
}

/**
 * Create a traced execution wrapper for arbitrary functions
 */
export async function traced<T>(
  operationName: string,
  fn: () => Promise<T>,
  tags?: Record<string, unknown>
): Promise<T> {
  const context = RequestContext.current();
  
  if (!context) {
    // Create temporary context for this operation
    return new RequestContext(undefined, { operation: operationName })
      .runWithContextAsync(async () => {
        return traced(operationName, fn, tags);
      });
  }
  
  const span = context.startSpan(operationName, tags);
  
  try {
    const result = await fn();
    context.endSpan(span.spanId);
    return result;
  } catch (error) {
    context.endSpan(span.spanId, error as Error);
    throw error;
  }
}

/**
 * Create a traced execution wrapper for synchronous functions
 */
export function tracedSync<T>(
  operationName: string,
  fn: () => T,
  tags?: Record<string, unknown>
): T {
  const context = RequestContext.current();
  
  if (!context) {
    logger.debug('No trace context for sync traced operation', { operationName });
    return fn();
  }
  
  const span = context.startSpan(operationName, tags);
  
  try {
    const result = fn();
    context.endSpan(span.spanId);
    return result;
  } catch (error) {
    context.endSpan(span.spanId, error as Error);
    throw error;
  }
}

/**
 * Performance timing utility with automatic span integration
 */
export class PerformanceTimer {
  private startTime: number;
  private checkpoints: Array<{ name: string; time: number }> = [];
  
  constructor(private operationName: string) {
    this.startTime = Date.now();
  }
  
  checkpoint(name: string): void {
    this.checkpoints.push({
      name,
      time: Date.now() - this.startTime
    });
    
    const context = RequestContext.current();
    if (context) {
      context.addLog(`Checkpoint: ${name}`, 'debug', {
        checkpoint: name,
        elapsed: Date.now() - this.startTime,
        operationName: this.operationName
      });
    }
  }
  
  finish(): { totalTime: number; checkpoints: Array<{ name: string; time: number }> } {
    const totalTime = Date.now() - this.startTime;
    
    const context = RequestContext.current();
    if (context) {
      context.addTags({
        totalDuration: totalTime,
        checkpoints: this.checkpoints.length,
        checkpointData: this.checkpoints
      });
    }
    
    return {
      totalTime,
      checkpoints: this.checkpoints
    };
  }
}