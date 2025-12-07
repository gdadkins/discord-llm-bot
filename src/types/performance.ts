/**
 * Type definitions for performance monitoring and metrics
 */

export interface PerformanceMetadata {
  service?: string;
  operation?: string;
  userId?: string;
  channelId?: string;
  guildId?: string;
  tags?: Record<string, string>;
  [key: string]: unknown;
}

export interface PerformanceStats {
  totalRequests: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  cacheHitRate: number;
  errorRate: number;
  memoryUsage: {
    current: number;
    peak: number;
    average: number;
  };
  timestamp: number;
  // Additional properties expected by performanceDashboard
  responseTimes: {
    count: number;
    average: number;
    max: number;
    min: number;
    p95: number;
    p99: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  memory: {
    current: number;
    baseline?: number;
    delta?: number;
    average: number;
    peak: number;
  };
  errors: {
    count: number;
    rate: number;
  };
  uptime: number;
}