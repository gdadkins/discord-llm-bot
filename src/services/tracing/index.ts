/**
 * Tracing Services Export Module
 * 
 * Central exports for distributed tracing functionality:
 * - TraceCollector: Main trace analysis and collection service
 * - TracingIntegration: Main integration point for the tracing system
 * - ServiceInstrumentation: Service-specific instrumentation utilities
 * - RequestContext: Core tracing context and span management (from utils)
 * - Tracing middleware: Service instrumentation utilities (from middleware)
 * 
 * Agent 6: Distributed Tracing Implementation Specialist
 */

export { TraceCollector } from './TraceCollector';
export { TracingIntegration } from './TracingIntegration';
export { 
  instrumentGeminiService,
  instrumentConversationManager,
  instrumentContextManager,
  instrumentHealthMonitor,
  instrumentCacheManager,
  instrumentAnalyticsManager,
  instrumentRateLimiter,
  batchInstrumentServices,
  createInstrumentedServiceFactory,
  createTracingProxy,
  instrumentServiceWithFilters,
  ServiceMethodFilters
} from './ServiceInstrumentation';

export type { 
  TraceAnalysis, 
  PerformanceMetrics, 
  ServiceHealthInsight 
} from './TraceCollector';