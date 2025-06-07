import { Mutex } from 'async-mutex';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { RateLimiter } from './rateLimiter';
import { ContextManager } from './contextManager';
import { GeminiService } from './gemini';

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
}

interface HealthSnapshot {
  timestamp: number;
  metrics: HealthMetrics;
}

interface AlertConfig {
  memoryThreshold: number; // MB
  errorRateThreshold: number; // percentage
  responseTimeThreshold: number; // ms
  diskSpaceThreshold: number; // percentage
  enabled: boolean;
}

interface AlertState {
  lastMemoryAlert: number;
  lastErrorRateAlert: number;
  lastResponseTimeAlert: number;
  lastDiskSpaceAlert: number;
  consecutiveAlerts: Map<string, number>;
}

interface PerformanceBuffer {
  responseTimes: number[];
  errors: number[];
  requests: number[];
  bufferSize: number;
  bufferIndex: number;
}

export class HealthMonitor {
  private metricsData: Map<number, HealthSnapshot> = new Map();
  private readonly stateMutex = new Mutex();
  private readonly ioMutex = new Mutex();
  private readonly dataFile: string;
  private metricsTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // Configuration
  private readonly COLLECTION_INTERVAL_MS = 30000; // 30 seconds
  private readonly RETENTION_DAYS = 7;
  private readonly MAX_SNAPSHOTS = (this.RETENTION_DAYS * 24 * 60 * 60 * 1000) / this.COLLECTION_INTERVAL_MS; // ~20,160 snapshots
  private readonly CLEANUP_INTERVAL_MS = 300000; // 5 minutes
  private readonly MAX_PERFORMANCE_BUFFER = 1000; // Last 1000 operations
  
  // Performance tracking
  private performanceBuffer: PerformanceBuffer = {
    responseTimes: new Array(this.MAX_PERFORMANCE_BUFFER).fill(0),
    errors: new Array(this.MAX_PERFORMANCE_BUFFER).fill(0),
    requests: new Array(this.MAX_PERFORMANCE_BUFFER).fill(0),
    bufferSize: 0,
    bufferIndex: 0,
  };
  
  // Alert configuration and state
  private alertConfig: AlertConfig = {
    memoryThreshold: parseInt(process.env.HEALTH_MEMORY_THRESHOLD_MB || '500'),
    errorRateThreshold: parseFloat(process.env.HEALTH_ERROR_RATE_THRESHOLD || '5.0'),
    responseTimeThreshold: parseInt(process.env.HEALTH_RESPONSE_TIME_THRESHOLD_MS || '5000'),
    diskSpaceThreshold: parseFloat(process.env.HEALTH_DISK_SPACE_THRESHOLD || '85.0'),
    enabled: process.env.HEALTH_ALERTS_ENABLED === 'true',
  };
  
  private alertState: AlertState = {
    lastMemoryAlert: 0,
    lastErrorRateAlert: 0,
    lastResponseTimeAlert: 0,
    lastDiskSpaceAlert: 0,
    consecutiveAlerts: new Map(),
  };
  
  // Service references
  private rateLimiter: RateLimiter | null = null;
  private contextManager: ContextManager | null = null;
  private geminiService: GeminiService | null = null;
  
  // Bot lifecycle tracking
  private startTime: number = Date.now();
  private isDiscordConnected = false;
  private lastGeminiCheck = 0;
  private lastGeminiStatus = false;
  
  constructor(dataFile = './data/health-metrics.json') {
    this.dataFile = dataFile;
  }

  async initialize(): Promise<void> {
    try {
      await this.ensureDataDirectory();
      await this.loadMetricsData();
      
      // Start metrics collection
      this.startMetricsCollection();
      
      // Start cleanup process
      this.startCleanupProcess();
      
      logger.info('HealthMonitor initialized', {
        retentionDays: this.RETENTION_DAYS,
        collectionIntervalMs: this.COLLECTION_INTERVAL_MS,
        maxSnapshots: this.MAX_SNAPSHOTS,
        alertsEnabled: this.alertConfig.enabled,
      });
    } catch (error) {
      logger.error('Failed to initialize HealthMonitor:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Clear timers
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Force final metrics save
    await this.saveMetricsData();
    
    logger.info('HealthMonitor shutdown completed');
  }

  // Service registration methods
  setRateLimiter(rateLimiter: RateLimiter): void {
    this.rateLimiter = rateLimiter;
  }

  setContextManager(contextManager: ContextManager): void {
    this.contextManager = contextManager;
  }

  setGeminiService(geminiService: GeminiService): void {
    this.geminiService = geminiService;
  }

  setDiscordConnected(connected: boolean): void {
    this.isDiscordConnected = connected;
  }

  // Performance tracking methods
  recordResponseTime(responseTimeMs: number): void {
    this.addToBuffer('responseTimes', responseTimeMs);
  }

  recordError(): void {
    this.addToBuffer('errors', 1);
  }

  recordRequest(): void {
    this.addToBuffer('requests', 1);
  }

  private addToBuffer(type: keyof PerformanceBuffer, value: number): void {
    if (type === 'bufferSize' || type === 'bufferIndex') return;
    
    const buffer = this.performanceBuffer[type] as number[];
    buffer[this.performanceBuffer.bufferIndex] = value;
    
    if (this.performanceBuffer.bufferSize < this.MAX_PERFORMANCE_BUFFER) {
      this.performanceBuffer.bufferSize++;
    }
    
    this.performanceBuffer.bufferIndex = (this.performanceBuffer.bufferIndex + 1) % this.MAX_PERFORMANCE_BUFFER;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = values.slice(0, this.performanceBuffer.bufferSize).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  private calculateErrorRate(): number {
    if (this.performanceBuffer.bufferSize === 0) return 0;
    
    const errors = this.performanceBuffer.errors.slice(0, this.performanceBuffer.bufferSize);
    const requests = this.performanceBuffer.requests.slice(0, this.performanceBuffer.bufferSize);
    
    const totalErrors = errors.reduce((sum, val) => sum + val, 0);
    const totalRequests = requests.reduce((sum, val) => sum + val, 0);
    
    if (totalRequests === 0) return 0;
    return (totalErrors / totalRequests) * 100;
  }

  private async collectHealthMetrics(): Promise<HealthMetrics> {
    const now = Date.now();
    
    // Memory usage
    const memoryUsage = process.memoryUsage();
    
    // Rate limiter metrics
    let rateLimitStatus = {
      minuteRemaining: 0,
      dailyRemaining: 0,
      requestsThisMinute: 0,
      requestsToday: 0,
    };
    
    if (this.rateLimiter) {
      const remaining = this.rateLimiter.getRemainingQuota();
      const rpmLimit = Math.floor((parseInt(process.env.GEMINI_RATE_LIMIT_RPM || '10')) * 0.9);
      const dailyLimit = Math.floor((parseInt(process.env.GEMINI_RATE_LIMIT_DAILY || '500')) * 0.9);
      
      rateLimitStatus = {
        minuteRemaining: remaining.minute,
        dailyRemaining: remaining.daily,
        requestsThisMinute: rpmLimit - remaining.minute,
        requestsToday: dailyLimit - remaining.daily,
      };
    }
    
    // Conversation metrics
    let activeConversations = 0;
    if (this.geminiService) {
      const conversationStats = this.geminiService.getConversationStats();
      activeConversations = conversationStats.activeUsers;
    }
    
    // Performance metrics
    const responseTimes = this.performanceBuffer.responseTimes.slice(0, this.performanceBuffer.bufferSize);
    const responseTime = {
      p50: this.calculatePercentile(responseTimes, 50),
      p95: this.calculatePercentile(responseTimes, 95),
      p99: this.calculatePercentile(responseTimes, 99),
    };
    
    const errorRate = this.calculateErrorRate();
    
    // API health checks
    const geminiHealth = await this.checkGeminiHealth();
    const apiHealth = {
      gemini: geminiHealth,
      discord: this.isDiscordConnected,
    };
    
    // Cache metrics
    let cacheMetrics = {
      hitRate: 0,
      memoryUsage: 0,
      size: 0,
    };
    
    if (this.geminiService) {
      const cacheStats = this.geminiService.getCacheStats();
      cacheMetrics = {
        hitRate: cacheStats.hitRate,
        memoryUsage: cacheStats.memoryUsage,
        size: cacheStats.cacheSize,
      };
    }
    
    // Context metrics
    let contextMetrics = {
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
    
    if (this.contextManager) {
      const memoryStats = this.contextManager.getMemoryStats();
      contextMetrics = {
        totalServers: memoryStats.totalServers,
        totalMemoryUsage: memoryStats.totalMemoryUsage,
        averageServerSize: memoryStats.averageServerSize,
        largestServerSize: memoryStats.largestServerSize,
        itemCounts: memoryStats.itemCounts,
        compressionStats: memoryStats.compressionStats,
      };
    }
    
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
    };
  }

  private async checkGeminiHealth(): Promise<boolean> {
    const now = Date.now();
    
    // Cache health check results for 5 minutes
    if (now - this.lastGeminiCheck < 300000) {
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
      
      // For now, consider Gemini healthy if we have quota
      // In the future, we could add actual API health checks
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

  private async checkAlerts(metrics: HealthMetrics): Promise<void> {
    if (!this.alertConfig.enabled) return;
    
    const now = Date.now();
    const alertCooldown = 300000; // 5 minutes between similar alerts
    
    // Memory alert
    const memoryUsageMB = metrics.memoryUsage.rss / (1024 * 1024);
    if (memoryUsageMB > this.alertConfig.memoryThreshold && 
        now - this.alertState.lastMemoryAlert > alertCooldown) {
      
      await this.triggerAlert('memory', `High memory usage: ${memoryUsageMB.toFixed(1)}MB (threshold: ${this.alertConfig.memoryThreshold}MB)`, metrics);
      this.alertState.lastMemoryAlert = now;
    }
    
    // Error rate alert
    if (metrics.errorRate > this.alertConfig.errorRateThreshold && 
        now - this.alertState.lastErrorRateAlert > alertCooldown) {
      
      await this.triggerAlert('error_rate', `High error rate: ${metrics.errorRate.toFixed(1)}% (threshold: ${this.alertConfig.errorRateThreshold}%)`, metrics);
      this.alertState.lastErrorRateAlert = now;
    }
    
    // Response time alert
    if (metrics.responseTime.p95 > this.alertConfig.responseTimeThreshold && 
        now - this.alertState.lastResponseTimeAlert > alertCooldown) {
      
      await this.triggerAlert('response_time', `High response time: ${metrics.responseTime.p95}ms (threshold: ${this.alertConfig.responseTimeThreshold}ms)`, metrics);
      this.alertState.lastResponseTimeAlert = now;
    }
    
    // API health alerts
    if (!metrics.apiHealth.gemini || !metrics.apiHealth.discord) {
      const unhealthyServices = [];
      if (!metrics.apiHealth.gemini) unhealthyServices.push('Gemini');
      if (!metrics.apiHealth.discord) unhealthyServices.push('Discord');
      
      await this.triggerAlert('api_health', `Unhealthy services: ${unhealthyServices.join(', ')}`, metrics);
    }
  }

  private async triggerAlert(type: string, message: string, metrics: HealthMetrics): Promise<void> {
    logger.warn(`HEALTH ALERT [${type}]: ${message}`, {
      type,
      message,
      metrics: {
        memoryUsageMB: (metrics.memoryUsage.rss / (1024 * 1024)).toFixed(1),
        errorRate: metrics.errorRate.toFixed(1),
        responseTimeP95: metrics.responseTime.p95,
        apiHealth: metrics.apiHealth,
      },
    });
    
    // Increment consecutive alerts
    const consecutiveCount = (this.alertState.consecutiveAlerts.get(type) || 0) + 1;
    this.alertState.consecutiveAlerts.set(type, consecutiveCount);
    
    // Attempt self-healing for certain alert types
    await this.attemptSelfHealing(type, consecutiveCount, metrics);
  }

  private async attemptSelfHealing(type: string, consecutiveCount: number, metrics: HealthMetrics): Promise<void> {
    logger.info(`Attempting self-healing for alert type: ${type} (consecutive: ${consecutiveCount})`);
    
    try {
      switch (type) {
      case 'memory':
        await this.healMemoryIssues();
        break;
      case 'error_rate':
        await this.healErrorRateIssues();
        break;
      case 'response_time':
        await this.healResponseTimeIssues();
        break;
      case 'api_health':
        await this.healApiHealthIssues(metrics);
        break;
      default:
        logger.debug(`No self-healing available for alert type: ${type}`);
      }
    } catch (error) {
      logger.error(`Self-healing failed for ${type}:`, error);
    }
  }

  private async healMemoryIssues(): Promise<void> {
    logger.info('Attempting memory usage self-healing');
    
    // Clear caches if available
    if (this.geminiService) {
      this.geminiService.clearCache();
      logger.info('Cleared Gemini response cache');
    }
    
    // Trigger garbage collection if available
    if (global.gc) {
      global.gc();
      logger.info('Triggered manual garbage collection');
    }
    
    // Clear old performance data
    this.performanceBuffer.bufferSize = Math.min(this.performanceBuffer.bufferSize, Math.floor(this.MAX_PERFORMANCE_BUFFER * 0.5));
    logger.info('Reduced performance buffer size');
  }

  private async healErrorRateIssues(): Promise<void> {
    logger.info('Attempting error rate self-healing');
    
    // Clear error buffer to reset error rate calculation
    this.performanceBuffer.errors.fill(0);
    this.performanceBuffer.bufferSize = Math.min(this.performanceBuffer.bufferSize, 100);
    logger.info('Reset error tracking buffer');
  }

  private async healResponseTimeIssues(): Promise<void> {
    logger.info('Attempting response time self-healing');
    
    // Clear response time buffer
    this.performanceBuffer.responseTimes.fill(0);
    logger.info('Reset response time tracking');
    
    // Clear caches to potentially improve response times
    if (this.geminiService) {
      this.geminiService.clearCache();
      logger.info('Cleared response cache to improve performance');
    }
  }

  private async healApiHealthIssues(metrics: HealthMetrics): Promise<void> {
    logger.info('Attempting API health self-healing', { apiHealth: metrics.apiHealth });
    
    // For now, just log the issue
    // In the future, could implement reconnection logic
    if (!metrics.apiHealth.discord) {
      logger.warn('Discord API unhealthy - consider reconnection');
    }
    
    if (!metrics.apiHealth.gemini) {
      logger.warn('Gemini API unhealthy - check API key and quotas');
    }
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(async () => {
      try {
        const metrics = await this.collectHealthMetrics();
        
        const release = await this.stateMutex.acquire();
        try {
          const snapshot: HealthSnapshot = {
            timestamp: Date.now(),
            metrics,
          };
          
          this.metricsData.set(snapshot.timestamp, snapshot);
          
          // Check for alerts
          await this.checkAlerts(metrics);
          
          // Trim data if needed (keep in memory for fast access)
          if (this.metricsData.size > this.MAX_SNAPSHOTS) {
            const sortedKeys = Array.from(this.metricsData.keys()).sort();
            const toRemove = sortedKeys.slice(0, sortedKeys.length - this.MAX_SNAPSHOTS);
            for (const key of toRemove) {
              this.metricsData.delete(key);
            }
          }
        } finally {
          release();
        }
        
        // Async save (don't block metrics collection)
        this.saveMetricsData().catch(error => {
          logger.error('Failed to save metrics data:', error);
        });
        
      } catch (error) {
        logger.error('Error during metrics collection:', error);
      }
    }, this.COLLECTION_INTERVAL_MS);
  }

  private startCleanupProcess(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error('Error during health monitor cleanup:', error);
      }
    }, this.CLEANUP_INTERVAL_MS);
  }

  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const cutoffTime = now - (this.RETENTION_DAYS * 24 * 60 * 60 * 1000);
    
    const release = await this.stateMutex.acquire();
    try {
      let removedCount = 0;
      for (const [timestamp] of this.metricsData.entries()) {
        if (timestamp < cutoffTime) {
          this.metricsData.delete(timestamp);
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        logger.info(`Health monitor cleanup: removed ${removedCount} old snapshots`);
      }
    } finally {
      release();
    }
    
    // Clear old alert consecutive counts
    for (const [alertType, count] of this.alertState.consecutiveAlerts.entries()) {
      if (count === 0) {
        this.alertState.consecutiveAlerts.delete(alertType);
      }
    }
  }

  // Public API methods
  async getCurrentMetrics(): Promise<HealthMetrics> {
    return await this.collectHealthMetrics();
  }

  async getHistoricalMetrics(fromTime?: number, toTime?: number): Promise<HealthSnapshot[]> {
    const release = await this.stateMutex.acquire();
    try {
      const now = Date.now();
      const from = fromTime || (now - (24 * 60 * 60 * 1000)); // Default: last 24 hours
      const to = toTime || now;
      
      const snapshots: HealthSnapshot[] = [];
      for (const [timestamp, snapshot] of this.metricsData.entries()) {
        if (timestamp >= from && timestamp <= to) {
          snapshots.push(snapshot);
        }
      }
      
      return snapshots.sort((a, b) => a.timestamp - b.timestamp);
    } finally {
      release();
    }
  }

  getAlertConfig(): AlertConfig {
    return { ...this.alertConfig };
  }

  updateAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
    logger.info('Health monitor alert configuration updated', this.alertConfig);
  }

  private async ensureDataDirectory(): Promise<void> {
    const dir = path.dirname(this.dataFile);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create health monitor data directory:', error);
    }
  }

  private async saveMetricsData(): Promise<void> {
    const release = await this.ioMutex.acquire();
    try {
      // Only save recent data to disk (last 24 hours for persistence)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const recentSnapshots: HealthSnapshot[] = [];
      
      for (const [timestamp, snapshot] of this.metricsData.entries()) {
        if (timestamp >= oneDayAgo) {
          recentSnapshots.push(snapshot);
        }
      }
      
      const data = {
        snapshots: recentSnapshots,
        alertState: this.alertState,
        lastSaved: Date.now(),
      };
      
      await fs.writeFile(this.dataFile, JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to save health monitor data:', error);
    } finally {
      release();
    }
  }

  private async loadMetricsData(): Promise<void> {
    try {
      const data = await fs.readFile(this.dataFile, 'utf8');
      const parsed = JSON.parse(data);
      
      if (parsed.snapshots && Array.isArray(parsed.snapshots)) {
        for (const snapshot of parsed.snapshots) {
          if (snapshot.timestamp && snapshot.metrics) {
            this.metricsData.set(snapshot.timestamp, snapshot);
          }
        }
        logger.info(`Loaded ${parsed.snapshots.length} health metric snapshots from disk`);
      }
      
      if (parsed.alertState) {
        this.alertState = {
          ...this.alertState,
          ...parsed.alertState,
          consecutiveAlerts: new Map(Object.entries(parsed.alertState.consecutiveAlerts || {})),
        };
      }
    } catch (error) {
      logger.info('No existing health monitor data found, starting fresh');
    }
  }
}