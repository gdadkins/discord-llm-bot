/**
 * TracingIntegration - Main tracing system integration
 * 
 * Central integration point for distributed tracing system:
 * - Bot initialization tracing
 * - Discord event tracing
 * - Service lifecycle tracing
 * - Performance monitoring integration
 * 
 * Agent 6: Distributed Tracing Implementation Specialist
 */

import { logger } from '../../utils/logger';
import { RequestContext, withNewContextAsync } from '../../utils/tracing/RequestContext';
import { TraceCollector } from './TraceCollector';
import { withTracing } from '../../middleware/tracingMiddleware';
import { batchInstrumentServices } from './ServiceInstrumentation';
import type { Client, Message as DiscordMessage } from 'discord.js';
import type { IService } from '../interfaces';

export class TracingIntegration {
  private static instance: TracingIntegration;
  private traceCollector: TraceCollector;
  private isInitialized = false;
  private performanceReportInterval?: NodeJS.Timeout;
  private traceMonitoringInterval?: NodeJS.Timeout;
  
  constructor() {
    this.traceCollector = new TraceCollector();
  }
  
  static getInstance(): TracingIntegration {
    if (!TracingIntegration.instance) {
      TracingIntegration.instance = new TracingIntegration();
    }
    return TracingIntegration.instance;
  }
  
  /**
   * Initialize tracing system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Tracing system already initialized');
      return;
    }
    
    await withNewContextAsync(async (context) => {
      context.addTags({
        operation: 'tracing_initialization',
        system: 'distributed_tracing',
        version: '1.0.0'
      });
      
      try {
        // Initialize trace collector
        logger.info('Initializing distributed tracing system');
        
        // Set up periodic performance reporting
        this.setupPerformanceReporting();
        
        // Set up trace cleanup monitoring
        this.setupTraceMonitoring();
        
        this.isInitialized = true;
        logger.info('Distributed tracing system initialized successfully');
        
        // Close root span on success
        if (context.rootSpanId) {
          context.endSpan(context.rootSpanId);
        }
        
      } catch (error) {
        logger.error('Failed to initialize tracing system', { error });
        // Close root span with error
        if (context.rootSpanId) {
          context.endSpan(context.rootSpanId, error as Error);
        }
        throw error;
      } finally {
        // Collect this initialization trace
        this.traceCollector.collectTrace(context);
      }
    }, {
      source: 'tracing_system',
      operation: 'initialization'
    });
  }
  
  /**
   * Wrap Discord message handling with tracing
   */
  wrapMessageHandler(handler: (message: DiscordMessage) => Promise<void>) {
    return async (message: DiscordMessage): Promise<void> => {
      await withNewContextAsync(async (context) => {
        context.addTags({
          messageId: message.id,
          channelId: message.channel.id,
          guildId: message.guild?.id,
          userId: message.author.id,
          messageType: message.type,
          hasAttachments: message.attachments.size > 0,
          contentLength: message.content.length
        });
        
        try {
          await handler(message);
          
          context.addTags({
            handlingStatus: 'success',
            responseGenerated: true
          });
          
        } catch (error) {
          context.addTags({
            handlingStatus: 'error',
            errorType: (error as Error).name,
            errorMessage: (error as Error).message
          });
          
          throw error;
        } finally {
          // Collect trace
          const analysis = this.traceCollector.collectTrace(context);
          
          // Log performance insights for slow operations
          // Increased threshold to 5 seconds as AI responses can take 2-4 seconds normally
          if (analysis.performance.slowestOperation && 
              analysis.performance.slowestOperation.duration > 5000) {
            logger.warn('Slow message processing detected', {
              messageId: message.id,
              slowestOperation: analysis.performance.slowestOperation,
              totalDuration: analysis.summary.totalDuration
            });
          }
        }
      }, {
        source: 'discord_message',
        messageId: message.id,
        channelId: message.channel.id,
        guildId: message.guild?.id,
        userId: message.author.id
      });
    };
  }
  
  /**
   * Wrap service initialization with tracing
   */
  wrapServiceInitialization<T extends Record<string, IService>>(
    initializationFn: () => Promise<T>
  ): () => Promise<Record<string, IService>> {
    return withTracing(
      async () => {
        const services = await initializationFn();
        
        // Instrument all services for tracing
        const instrumentedServices = batchInstrumentServices(services);
        
        logger.info('Services instrumented for tracing', {
          serviceCount: Object.keys(services).length,
          instrumentedServices: Object.keys(instrumentedServices)
        });
        
        return instrumentedServices;
      },
      'ServiceInitialization'
    ) as () => Promise<Record<string, IService>>;
  }
  
  /**
   * Get trace analysis for a specific trace ID
   */
  getTraceAnalysis(traceId: string) {
    return this.traceCollector.getTraceAnalysis(traceId);
  }
  
  /**
   * Get overall performance overview
   */
  getPerformanceOverview() {
    return this.traceCollector.getPerformanceOverview();
  }
  
  /**
   * Get trace collector statistics
   */
  getTracingStats() {
    return this.traceCollector.getStats();
  }
  
  /**
   * Get the trace collector instance for direct access
   */
  getTraceCollector() {
    return this.traceCollector;
  }
  
  /**
   * Setup periodic performance reporting
   */
  private setupPerformanceReporting(): void {
    this.performanceReportInterval = setInterval(async () => {
      // Wrap performance reporting in traced context to ensure proper span closure
      await withNewContextAsync(async (context) => {
        try {
          const overview = this.traceCollector.getPerformanceOverview();
          const stats = this.traceCollector.getStats();
          
          logger.info('Periodic tracing performance report', {
            tracingStats: stats,
            serviceHealth: overview.serviceHealth.filter(s => s.status !== 'healthy'),
            trends: overview.trends
          });
          
          // Alert on critical service health issues
          const criticalServices = overview.serviceHealth.filter(s => s.status === 'critical');
          if (criticalServices.length > 0) {
            logger.error('Critical service health issues detected', {
              criticalServices: criticalServices.map(s => ({
                service: s.serviceName,
                issues: s.issues,
                recommendations: s.recommendations
              }))
            });
          }
          
          // Close root span on success
          if (context.rootSpanId) {
            context.endSpan(context.rootSpanId);
          }
        } catch (error) {
          logger.error('Error generating performance report', { error });
          context.addTags({
            reportStatus: 'error',
            errorType: (error as Error).name,
            errorMessage: (error as Error).message
          });
          // Close root span with error
          if (context.rootSpanId) {
            context.endSpan(context.rootSpanId, error as Error);
          }
        } finally {
          // Collect the performance report trace
          this.traceCollector.collectTrace(context);
        }
      }, {
        source: 'tracing_system',
        operation: 'System.performanceReport'
      });
    }, 300000); // Every 5 minutes
  }
  
  /**
   * Setup trace monitoring and cleanup
   */
  private setupTraceMonitoring(): void {
    this.traceMonitoringInterval = setInterval(() => {
      const stats = this.traceCollector.getStats();
      
      // Log memory usage warnings
      if (stats.memoryUsageMB > 50) {
        logger.warn('High trace memory usage detected', {
          memoryUsageMB: stats.memoryUsageMB,
          totalTraces: stats.totalTraces,
          recommendation: 'Consider reducing trace retention time'
        });
      }
      
      // Log performance insights
      if (stats.avgSpansPerTrace > 20) {
        logger.info('Complex trace patterns detected', {
          avgSpansPerTrace: stats.avgSpansPerTrace,
          insight: 'Operations may be deeply nested or have many sub-operations'
        });
      }
      
    }, 600000); // Every 10 minutes
  }
  
  /**
   * Create a trace context for Discord command execution
   */
  createCommandContext(
    command: string,
    userId: string,
    guildId?: string,
    channelId?: string
  ): RequestContext {
    return new RequestContext(undefined, {
      source: 'discord_command',
      command,
      userId,
      guildId,
      channelId,
      timestamp: Date.now()
    });
  }
  
  /**
   * Create a trace context for scheduled tasks
   */
  createScheduledTaskContext(taskName: string): RequestContext {
    return new RequestContext(undefined, {
      source: 'scheduled_task',
      taskName,
      timestamp: Date.now()
    });
  }
  
  /**
   * Create a trace context for health checks
   */
  createHealthCheckContext(serviceName: string): RequestContext {
    return new RequestContext(undefined, {
      source: 'health_check',
      serviceName,
      timestamp: Date.now()
    });
  }
  
  /**
   * Wrap bot client initialization with comprehensive tracing
   */
  wrapBotInitialization(initFn: () => Promise<Client>): () => Promise<Client> {
    return withTracing(
      async () => {
        const client = await initFn();
        
        // Wrap client event handlers with tracing
        const originalOnMessage = client.on.bind(client);
        
        client.on = function(event: string, listener: (...args: unknown[]) => void | Promise<void>) {
          if (event === 'messageCreate') {
            const tracedListener = TracingIntegration.getInstance().wrapMessageHandler(
              listener as (message: DiscordMessage) => Promise<void>
            );
            return originalOnMessage(event, tracedListener);
          }
          
          return originalOnMessage(event, listener);
        };
        
        logger.info('Discord client wrapped with tracing');
        return client;
      },
      'BotInitialization',
      {
        extractTags: () => ({
          component: 'discord_client',
          initialization: 'complete'
        })
      }
    );
  }
  
  /**
   * Export tracing data for external analysis
   */
  exportTracingData(timeRange?: { start: number; end: number }): {
    metadata: {
      exportTime: number;
      tracingStats: ReturnType<TraceCollector['getStats']>;
      timeRange?: { start: number; end: number };
    };
    performanceOverview: ReturnType<TraceCollector['getPerformanceOverview']>;
  } {
    const stats = this.getTracingStats();
    const overview = this.getPerformanceOverview();
    
    return {
      metadata: {
        exportTime: Date.now(),
        tracingStats: stats,
        timeRange
      },
      performanceOverview: overview
    };
  }

  /**
   * Shutdown tracing system and cleanup resources
   */
  shutdown(): void {
    if (this.performanceReportInterval) {
      clearInterval(this.performanceReportInterval);
      this.performanceReportInterval = undefined;
    }

    if (this.traceMonitoringInterval) {
      clearInterval(this.traceMonitoringInterval);
      this.traceMonitoringInterval = undefined;
    }

    this.traceCollector.shutdown();
    this.isInitialized = false;
    logger.info('Tracing system shut down');
  }
}