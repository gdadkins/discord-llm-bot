/**
 * Health Monitoring Service Interface Definitions
 * 
 * Interfaces for system health monitoring, metrics collection, and alerting.
 */

import type { IService } from './CoreServiceInterfaces';
import type { IAIService } from './AIServiceInterfaces';
import type { IRateLimiter } from './RateLimitingInterfaces';
import type { IContextManager } from './ContextManagementInterfaces';

// ============================================================================
// Health Monitoring Service Interfaces
// ============================================================================

export interface IHealthMonitor extends IService {
  /**
   * Service registration
   */
  setRateLimiter(rateLimiter: IRateLimiter): void;
  setContextManager(contextManager: IContextManager): void;
  setGeminiService(geminiService: IAIService): void;
  setDiscordConnected(connected: boolean): void;
  
  /**
   * Performance tracking
   */
  recordResponseTime(responseTimeMs: number): void;
  recordError(): void;
  recordRequest(): void;
  
  /**
   * Metrics retrieval
   */
  getCurrentMetrics(): Promise<HealthMetrics>;
  getHistoricalMetrics(fromTime?: number, toTime?: number): Promise<HealthSnapshot[]>;
  
  /**
   * Alert configuration
   */
  getAlertConfig(): AlertConfig;
  updateAlertConfig(config: Partial<AlertConfig>): void;
}

export interface HealthMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  activeConversations: number;
  rateLimitStatus: {
    minuteRemaining: number;
    dailyRemaining: number;
    requestsThisMinute: number;
    requestsToday: number;
  };
  uptime: number;
  errorRate: number;
  responseTime: { p50: number; p95: number; p99: number };
  apiHealth: { gemini: boolean; discord: boolean };
  cacheMetrics: {
    hitRate: number;
    memoryUsage: number;
    size: number;
  };
  contextMetrics: {
    totalServers: number;
    totalMemoryUsage: number;
    averageServerSize: number;
    largestServerSize: number;
    itemCounts: {
      embarrassingMoments: number;
      codeSnippets: number;
      runningGags: number;
      summarizedFacts: number;
    };
    compressionStats: {
      averageCompressionRatio: number;
      totalMemorySaved: number;
      duplicatesRemoved: number;
    };
  };
  dataStoreMetrics: {
    totalStores: number;
    storesByType: Record<string, number>;
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

export interface HealthSnapshot {
  timestamp: number;
  metrics: HealthMetrics;
}

export interface AlertConfig {
  memoryThreshold: number;
  errorRateThreshold: number;
  responseTimeThreshold: number;
  diskSpaceThreshold: number;
  enabled: boolean;
}