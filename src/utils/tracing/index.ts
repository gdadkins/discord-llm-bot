/**
 * Tracing Utilities Export Module
 * 
 * Core tracing utilities for distributed request tracking:
 * - RequestContext: Context management and span tracking
 * - Utility functions for context creation and management
 * 
 * Agent 6: Distributed Tracing Implementation Specialist
 */

export { 
  RequestContext,
  asyncLocalStorage,
  getOrCreateContext,
  withNewContext,
  withNewContextAsync
} from './RequestContext';

export type { 
  TraceSpan, 
  TraceData, 
  TraceContext 
} from './RequestContext';