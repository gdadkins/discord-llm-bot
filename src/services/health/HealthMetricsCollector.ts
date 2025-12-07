/**
 * Health Metrics Collector
 * 
 * Responsible for collecting system metrics including performance, resource usage,
 * API health, and DataStore statistics. Implements a ring buffer for efficient
 * performance tracking and provides percentile calculations.
 * 
 * @module HealthMetricsCollector
 */

import { logger } from '../../utils/logger';
import { dataStoreFactory } from '../../utils/DataStoreFactory';
import type { IAIService } from '../interfaces/AIServiceInterfaces';
import type { IContextManager } from '../interfaces/ContextManagementInterfaces';
import type { IRateLimiter } from '../interfaces/RateLimitingInterfaces';
import type {
  HealthMetrics,
  PerformanceBuffer,
  DataStoreHealthResult,
  DetailedDataStoreMetrics,
  DataStorePerformanceBaseline,
  IHealthMetricsCollector
} from './types';
import { HEALTH_CONSTANTS } from './types';

/**
 * Implementation of health metrics collection
 */
export class HealthMetricsCollector implements IHealthMetricsCollector {
  // Performance tracking buffer
  private performanceBuffer: PerformanceBuffer;
  
  // Service references
  private rateLimiter: IRateLimiter | null = null;
  private contextManager: IContextManager | null = null;
  private geminiService: IAIService | null = null;
  
  // Connection status
  private isDiscordConnected = false;
  
  // Bot lifecycle tracking
  private startTime: number = Date.now();
  
  // Caching for expensive operations
  private lastGeminiCheck = 0;
  private lastGeminiStatus = false;
  private lastDataStoreHealthCheck = 0;
  private cachedDataStoreHealth: DataStoreHealthResult | null = null;
  private lastDataStoreMetrics: DetailedDataStoreMetrics | null = null;
  
  constructor() {
    // Initialize performance buffer
    this.performanceBuffer = {
      responseTimes: new Array(HEALTH_CONSTANTS.MAX_PERFORMANCE_BUFFER).fill(0),
      errors: new Array(HEALTH_CONSTANTS.MAX_PERFORMANCE_BUFFER).fill(0),
      requests: new Array(HEALTH_CONSTANTS.MAX_PERFORMANCE_BUFFER).fill(0),
      bufferSize: 0,
      bufferIndex: 0,
    };
  }
  
  // ============================================================================
  // Service Registration
  // ============================================================================
  
  /**
   * Set rate limiter service reference
   */
  setRateLimiter(rateLimiter: IRateLimiter): void {
    this.rateLimiter = rateLimiter;
  }
  
  /**
   * Set context manager service reference
   */
  setContextManager(contextManager: IContextManager): void {
    this.contextManager = contextManager;
  }
  
  /**
   * Set Gemini service reference
   */
  setGeminiService(geminiService: IAIService): void {
    this.geminiService = geminiService;
  }
  
  /**
   * Set Discord connection status
   */
  setDiscordConnected(connected: boolean): void {
    this.isDiscordConnected = connected;
  }
  
  // ============================================================================
  // Performance Tracking
  // ============================================================================
  
  /**
   * Record a response time measurement
   */
  recordResponseTime(responseTimeMs: number): void {
    this.addToBuffer('responseTimes', responseTimeMs);
  }
  
  /**
   * Record an error occurrence
   */
  recordError(): void {
    this.addToBuffer('errors', 1);
  }
  
  /**
   * Record a request
   */
  recordRequest(): void {
    this.addToBuffer('requests', 1);
  }
  
  /**
   * Add value to the circular buffer
   */
  private addToBuffer(type: keyof PerformanceBuffer, value: number): void {
    if (type === 'bufferSize' || type === 'bufferIndex') return;
    
    const buffer = this.performanceBuffer[type] as number[];
    buffer[this.performanceBuffer.bufferIndex] = value;
    
    if (this.performanceBuffer.bufferSize < HEALTH_CONSTANTS.MAX_PERFORMANCE_BUFFER) {
      this.performanceBuffer.bufferSize++;
    }
    
    this.performanceBuffer.bufferIndex = 
      (this.performanceBuffer.bufferIndex + 1) % HEALTH_CONSTANTS.MAX_PERFORMANCE_BUFFER;
  }
  
  /**
   * Calculate percentile from buffer values
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = values.slice(0, this.performanceBuffer.bufferSize).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }
  
  /**
   * Calculate error rate from buffer
   */
  private calculateErrorRate(): number {
    if (this.performanceBuffer.bufferSize === 0) return 0;
    
    const errors = this.performanceBuffer.errors.slice(0, this.performanceBuffer.bufferSize);
    const requests = this.performanceBuffer.requests.slice(0, this.performanceBuffer.bufferSize);
    
    const totalErrors = errors.reduce((sum, val) => sum + val, 0);
    const totalRequests = requests.reduce((sum, val) => sum + val, 0);
    
    if (totalRequests === 0) return 0;
    return (totalErrors / totalRequests) * 100;
  }
  
  // ============================================================================
  // Metrics Collection
  // ============================================================================
  
  /**
   * Collect comprehensive health metrics
   */
  async collectHealthMetrics(): Promise<HealthMetrics> {
    const now = Date.now();
    
    // Memory usage
    const memoryUsage = process.memoryUsage();
    
    // Rate limiter metrics
    const rateLimitStatus = this.collectRateLimiterMetrics();
    
    // Conversation metrics
    const activeConversations = this.collectConversationMetrics();
    
    // Performance metrics
    const responseTime = this.collectResponseTimeMetrics();
    const errorRate = this.calculateErrorRate();
    
    // API health checks
    const apiHealth = await this.collectApiHealth();
    
    // Cache metrics
    const cacheMetrics = this.collectCacheMetrics();
    
    // Context metrics
    const contextMetrics = this.collectContextMetrics();
    
    // DataStore metrics
    const dataStoreMetrics = await this.collectDataStoreMetrics(now);
    
    return {
      memoryUsage,
      activeConversations,
      rateLimitStatus,
      uptime: now - this.startTime,
      errorRate,
      responseTime,
      apiHealth,
      cacheMetrics,
      contextMetrics,
      dataStoreMetrics,
    };
  }
  
  /**
   * Collect rate limiter metrics
   */
  private collectRateLimiterMetrics() {
    const defaultStatus = {
      minuteRemaining: 0,
      dailyRemaining: 0,
      requestsThisMinute: 0,
      requestsToday: 0,
    };
    
    if (!this.rateLimiter) return defaultStatus;
    
    const remaining = this.rateLimiter.getRemainingQuota();
    const rpmLimit = Math.floor((parseInt(process.env.GEMINI_RATE_LIMIT_RPM || '10')) * 0.9);
    const dailyLimit = Math.floor((parseInt(process.env.GEMINI_RATE_LIMIT_DAILY || '500')) * 0.9);
    
    return {
      minuteRemaining: remaining.minute,
      dailyRemaining: remaining.daily,
      requestsThisMinute: rpmLimit - remaining.minute,
      requestsToday: dailyLimit - remaining.daily,
    };
  }
  
  /**
   * Collect conversation metrics
   */
  private collectConversationMetrics(): number {
    if (!this.geminiService) return 0;
    
    const conversationStats = this.geminiService.getConversationStats();
    return conversationStats.activeUsers;
  }
  
  /**
   * Collect response time percentiles
   */
  private collectResponseTimeMetrics() {
    const responseTimes = this.performanceBuffer.responseTimes.slice(0, this.performanceBuffer.bufferSize);
    
    return {
      p50: this.calculatePercentile(responseTimes, 50),
      p95: this.calculatePercentile(responseTimes, 95),
      p99: this.calculatePercentile(responseTimes, 99),
    };
  }
  
  /**
   * Collect API health status
   */
  private async collectApiHealth() {
    const geminiHealth = await this.checkGeminiHealth();
    
    return {
      gemini: geminiHealth,
      discord: this.isDiscordConnected,
    };
  }
  
  /**
   * Check Gemini API health with caching
   */
  private async checkGeminiHealth(): Promise<boolean> {
    const now = Date.now();
    
    // Use cached result if still valid
    if (now - this.lastGeminiCheck < HEALTH_CONSTANTS.GEMINI_HEALTH_CACHE_MS) {
      return this.lastGeminiStatus;
    }
    
    try {
      if (!this.geminiService || !this.rateLimiter) {
        this.lastGeminiStatus = false;
        this.lastGeminiCheck = now;
        return false;
      }
      
      // Check if we have remaining quota
      const quota = this.rateLimiter.getRemainingQuota();
      if (quota.minute === 0 || quota.daily === 0) {
        this.lastGeminiStatus = false;
        this.lastGeminiCheck = now;
        return false;
      }
      
      // Consider Gemini healthy if we have quota
      this.lastGeminiStatus = true;
      this.lastGeminiCheck = now;
      return true;
    } catch (error) {
      logger.debug('Gemini health check failed:', error);
      this.lastGeminiStatus = false;
      this.lastGeminiCheck = now;
      return false;
    }
  }
  
  /**
   * Collect cache metrics
   */
  private collectCacheMetrics() {
    const defaultMetrics = {
      hitRate: 0,
      memoryUsage: 0,
      size: 0,
    };
    
    if (!this.geminiService) return defaultMetrics;
    
    const cacheStats = this.geminiService.getCacheStats();
    return {
      hitRate: cacheStats.hitRate,
      memoryUsage: cacheStats.memoryUsage,
      size: cacheStats.cacheSize,
    };
  }
  
  /**
   * Collect context manager metrics
   */
  private collectContextMetrics() {
    const defaultMetrics = {
      totalServers: 0,
      totalMemoryUsage: 0,
      averageServerSize: 0,
      largestServerSize: 0,
      itemCounts: {
        embarrassingMoments: 0,
        codeSnippets: 0,
        runningGags: 0,
        summarizedFacts: 0,
      },
      compressionStats: {
        averageCompressionRatio: 1.0,
        totalMemorySaved: 0,
        duplicatesRemoved: 0,
      },
    };
    
    if (!this.contextManager) return defaultMetrics;
    
    const memoryStats = this.contextManager.getMemoryStats();
    return {
      totalServers: memoryStats.totalServers,
      totalMemoryUsage: memoryStats.totalMemoryUsage,
      averageServerSize: memoryStats.averageServerSize,
      largestServerSize: memoryStats.largestServerSize,
      itemCounts: memoryStats.itemCounts,
      compressionStats: memoryStats.compressionStats,
    };
  }
  
  /**
   * Collect DataStore metrics with aggregation
   */
  private async collectDataStoreMetrics(now: number) {
    const defaultMetrics = {
      totalStores: 0,
      storesByType: {} as Record<string, number>,
      totalSaveOperations: 0,
      totalLoadOperations: 0,
      totalErrors: 0,
      avgSaveLatency: 0,
      avgLoadLatency: 0,
      healthyStores: 0,
      unhealthyStores: 0,
      totalBytesWritten: 0,
      totalBytesRead: 0,
    };
    
    try {
      const registeredStores = dataStoreFactory.getRegisteredStores();
      
      // Calculate aggregated metrics
      let totalSaveLatency = 0;
      let totalLoadLatency = 0;
      let saveOperationCount = 0;
      let loadOperationCount = 0;
      
      const aggregated = registeredStores.reduce((acc, store) => {
        const metrics = store.instance.getMetrics();
        
        // Update store type counts
        acc.storesByType[store.type] = (acc.storesByType[store.type] || 0) + 1;
        
        // Aggregate save operations
        if (metrics.saveCount > 0) {
          totalSaveLatency += metrics.avgSaveLatency * metrics.saveCount;
          saveOperationCount += metrics.saveCount;
        }
        acc.totalSaveOperations += metrics.saveCount;
        
        // Aggregate load operations
        if (metrics.loadCount > 0) {
          totalLoadLatency += metrics.avgLoadLatency * metrics.loadCount;
          loadOperationCount += metrics.loadCount;
        }
        acc.totalLoadOperations += metrics.loadCount;
        
        // Aggregate other metrics
        acc.totalErrors += metrics.errorCount;
        acc.totalBytesWritten += metrics.totalBytesWritten;
        acc.totalBytesRead += metrics.totalBytesRead;
        
        return acc;
      }, {
        totalStores: registeredStores.length,
        storesByType: {} as Record<string, number>,
        totalSaveOperations: 0,
        totalLoadOperations: 0,
        totalErrors: 0,
        totalBytesWritten: 0,
        totalBytesRead: 0,
      });
      
      // Calculate averages
      const avgSaveLatency = saveOperationCount > 0 ? totalSaveLatency / saveOperationCount : 0;
      const avgLoadLatency = loadOperationCount > 0 ? totalLoadLatency / loadOperationCount : 0;
      
      // Get health check results
      const healthResults = await this.getCachedDataStoreHealth();
      
      // Store detailed metrics for analysis
      this.lastDataStoreMetrics = {
        timestamp: now,
        stores: registeredStores.map(store => ({
          id: store.id,
          type: store.type,
          filePath: store.filePath,
          metrics: store.instance.getMetrics(),
          lastAccessed: store.lastAccessed,
        })),
      };
      
      return {
        ...aggregated,
        avgSaveLatency,
        avgLoadLatency,
        healthyStores: healthResults.healthyStores,
        unhealthyStores: healthResults.unhealthyStores,
      };
    } catch (error) {
      logger.error('Failed to collect DataStore metrics:', error);
      this.recordError(); // Track this as a system error
      return defaultMetrics;
    }
  }
  
  /**
   * Get cached DataStore health to avoid excessive health checks
   */
  private async getCachedDataStoreHealth(): Promise<DataStoreHealthResult> {
    const now = Date.now();
    
    if (this.cachedDataStoreHealth && 
        (now - this.lastDataStoreHealthCheck) < HEALTH_CONSTANTS.DATASTORE_HEALTH_CACHE_MS) {
      return this.cachedDataStoreHealth;
    }
    
    try {
      const healthResults = await dataStoreFactory.performHealthCheck();
      this.cachedDataStoreHealth = healthResults;
      this.lastDataStoreHealthCheck = now;
      return healthResults;
    } catch (error) {
      logger.error('DataStore health check failed:', error);
      // Return cached result if available, otherwise default
      return this.cachedDataStoreHealth || {
        healthyStores: 0,
        unhealthyStores: 0,
        errors: [{ filePath: 'health-check', error: 'Health check failed' }],
      };
    }
  }
  
  // ============================================================================
  // DataStore Analysis
  // ============================================================================
  
  /**
   * Get DataStore performance baseline for comparison
   */
  getDataStorePerformanceBaseline(): DataStorePerformanceBaseline | null {
    if (!this.lastDataStoreMetrics) {
      return null;
    }
    
    const stores = this.lastDataStoreMetrics.stores;
    if (stores.length === 0) {
      return null;
    }
    
    const totalSaveLatency = stores.reduce((sum, store) => sum + store.metrics.avgSaveLatency, 0);
    const totalLoadLatency = stores.reduce((sum, store) => sum + store.metrics.avgLoadLatency, 0);
    const totalOperations = stores.reduce((sum, store) => 
      sum + store.metrics.saveCount + store.metrics.loadCount, 0);
    const totalErrors = stores.reduce((sum, store) => sum + store.metrics.errorCount, 0);
    
    return {
      avgSaveLatency: totalSaveLatency / stores.length,
      avgLoadLatency: totalLoadLatency / stores.length,
      errorRate: totalOperations > 0 ? (totalErrors / totalOperations) * 100 : 0,
      timestamp: this.lastDataStoreMetrics.timestamp,
    };
  }
  
  /**
   * Get detailed DataStore metrics
   */
  getDetailedDataStoreMetrics(): DetailedDataStoreMetrics | null {
    return this.lastDataStoreMetrics;
  }
  
  /**
   * Get cached DataStore health result
   */
  getCachedDataStoreHealthResult(): DataStoreHealthResult | null {
    return this.cachedDataStoreHealth;
  }
}