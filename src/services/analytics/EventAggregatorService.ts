/**
 * Event Aggregator Service
 * 
 * Provides advanced event aggregation capabilities including:
 * - Time-window based aggregation
 * - Statistical calculations (min, max, avg, percentiles)
 * - Event deduplication
 * - Pattern detection
 * - Intelligent sampling strategies
 * 
 * @module EventAggregatorService
 */

import { Mutex } from 'async-mutex';
import { BaseService } from '../base/BaseService';
import { logger } from '../../utils/logger';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';

export interface AggregationWindow {
  id: string;
  startTime: number;
  endTime: number;
  eventType: string;
  eventKey: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  values: number[]; // For percentile calculations
  metadata: Record<string, unknown>;
}

export interface AggregationConfig {
  windowSizeMs: number; // Default: 60000 (1 minute)
  maxValuesPerWindow: number; // Default: 1000
  percentilesToCalculate: number[]; // Default: [50, 90, 95, 99]
  enablePatternDetection: boolean; // Default: true
  patternThreshold: number; // Default: 0.8 (80% similarity)
}

export interface AggregationResult {
  windowId: string;
  eventType: string;
  eventKey: string;
  startTime: number;
  endTime: number;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  percentiles: Record<number, number>;
  stdDev: number;
  patterns?: PatternMatch[];
  metadata: Record<string, unknown>;
}

export interface PatternMatch {
  type: 'spike' | 'drop' | 'trend' | 'anomaly';
  confidence: number;
  description: string;
  startTime: number;
  endTime: number;
}

export interface IAggregatorService {
  /**
   * Initialize the aggregator service
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the aggregator service
   */
  shutdown(): Promise<void>;

  /**
   * Add event to aggregation window
   */
  addEvent(
    eventType: string,
    eventKey: string,
    value: number,
    metadata?: Record<string, unknown>
  ): void;
  
  /**
   * Get aggregation results for a time range
   */
  getAggregations(
    startTime: number,
    endTime: number,
    eventType?: string
  ): AggregationResult[];
  
  /**
   * Force close current windows and return results
   */
  closeWindows(): AggregationResult[];
  
  /**
   * Update aggregation configuration
   */
  updateConfig(config: Partial<AggregationConfig>): void;
  
  /**
   * Get current configuration
   */
  getConfig(): AggregationConfig;
  
  /**
   * Clear all aggregation data
   */
  clear(): void;
}

/**
 * Event Aggregator Service Implementation
 * 
 * Aggregates events within time windows for efficient storage and analysis.
 */
export class EventAggregatorService extends BaseService implements IAggregatorService {
  private readonly mutex = new Mutex();
  
  // Active aggregation windows
  private windows: Map<string, AggregationWindow> = new Map();
  
  // Completed aggregation results
  private results: AggregationResult[] = [];
  
  // Configuration
  private config: AggregationConfig = {
    windowSizeMs: 60000, // 1 minute
    maxValuesPerWindow: 1000,
    percentilesToCalculate: [50, 90, 95, 99],
    enablePatternDetection: true,
    patternThreshold: 0.8
  };
  
  // Window cleanup timer
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // Pattern detection state
  private recentPatterns: Map<string, number[]> = new Map();
  
  constructor() {
    super();
  }
  
  /**
   * Get service name
   */
  protected getServiceName(): string {
    return 'EventAggregatorService';
  }

  /**
   * Perform service-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    this.startCleanupTimer();
    logger.info('EventAggregatorService initialized', {
      windowSizeMs: this.config.windowSizeMs,
      maxValuesPerWindow: this.config.maxValuesPerWindow
    });
  }

  /**
   * Perform service-specific shutdown
   */
  protected async performShutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Close all active windows
    this.closeWindows();
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredWindows();
    }, this.config.windowSizeMs / 2); // Check twice per window
  }

  /**
   * Add event to aggregation
   */
  addEvent(
    eventType: string,
    eventKey: string,
    value: number,
    metadata?: Record<string, unknown>
  ): void {
    const now = Date.now();
    const windowKey = this.getWindowKey(eventType, eventKey, now);
    
    let window = this.windows.get(windowKey);
    if (!window) {
      window = this.createWindow(eventType, eventKey, now);
      this.windows.set(windowKey, window);
    }
    
    // Update aggregation
    window.count++;
    window.sum += value;
    window.min = Math.min(window.min, value);
    window.max = Math.max(window.max, value);
    
    // Store value for percentile calculations if under limit
    if (window.values.length < this.config.maxValuesPerWindow) {
      window.values.push(value);
    } else {
      // Reservoir sampling for values beyond limit
      const randomIndex = Math.floor(Math.random() * window.count);
      if (randomIndex < this.config.maxValuesPerWindow) {
        window.values[randomIndex] = value;
      }
    }
    
    // Merge metadata
    if (metadata) {
      Object.assign(window.metadata, metadata);
    }
  }

  /**
   * Get window key
   */
  private getWindowKey(eventType: string, eventKey: string, timestamp: number): string {
    const windowStart = Math.floor(timestamp / this.config.windowSizeMs) * this.config.windowSizeMs;
    return `${eventType}:${eventKey}:${windowStart}`;
  }

  /**
   * Create new aggregation window
   */
  private createWindow(eventType: string, eventKey: string, timestamp: number): AggregationWindow {
    const windowStart = Math.floor(timestamp / this.config.windowSizeMs) * this.config.windowSizeMs;
    return {
      id: `${eventType}:${eventKey}:${windowStart}`,
      startTime: windowStart,
      endTime: windowStart + this.config.windowSizeMs,
      eventType,
      eventKey,
      count: 0,
      sum: 0,
      min: Number.MAX_VALUE,
      max: Number.MIN_VALUE,
      values: [],
      metadata: {}
    };
  }

  /**
   * Cleanup expired windows
   */
  private cleanupExpiredWindows(): void {
    const now = Date.now();
    const expiredWindows: string[] = [];
    
    for (const [key, window] of this.windows) {
      if (window.endTime < now) {
        expiredWindows.push(key);
      }
    }
    
    for (const key of expiredWindows) {
      const window = this.windows.get(key)!;
      this.windows.delete(key);
      
      // Convert to result
      const result = this.windowToResult(window);
      this.results.push(result);
      
      // Detect patterns if enabled
      if (this.config.enablePatternDetection) {
        result.patterns = this.detectPatterns(window);
      }
      
      // Maintain recent patterns for comparison
      this.updateRecentPatterns(window);
    }
    
    // Clean up old results (keep last 24 hours)
    const cutoff = now - 24 * 60 * 60 * 1000;
    this.results = this.results.filter(r => r.startTime > cutoff);
  }

  /**
   * Convert window to aggregation result
   */
  private windowToResult(window: AggregationWindow): AggregationResult {
    const avg = window.count > 0 ? window.sum / window.count : 0;
    const sortedValues = [...window.values].sort((a, b) => a - b);
    
    // Calculate percentiles
    const percentiles: Record<number, number> = {};
    for (const p of this.config.percentilesToCalculate) {
      percentiles[p] = this.calculatePercentile(sortedValues, p);
    }
    
    // Calculate standard deviation
    const stdDev = this.calculateStdDev(window.values, avg);
    
    return {
      windowId: window.id,
      eventType: window.eventType,
      eventKey: window.eventKey,
      startTime: window.startTime,
      endTime: window.endTime,
      count: window.count,
      sum: window.sum,
      min: window.min === Number.MAX_VALUE ? 0 : window.min,
      max: window.max === Number.MIN_VALUE ? 0 : window.max,
      avg,
      median: percentiles[50] || 0,
      percentiles,
      stdDev,
      metadata: window.metadata
    };
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (lower === upper) {
      return sortedValues[lower];
    }
    
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    
    const sumSquaredDiff = values.reduce((sum, val) => {
      const diff = val - mean;
      return sum + diff * diff;
    }, 0);
    
    return Math.sqrt(sumSquaredDiff / (values.length - 1));
  }

  /**
   * Detect patterns in aggregation window
   */
  private detectPatterns(window: AggregationWindow): PatternMatch[] {
    const patterns: PatternMatch[] = [];
    const patternKey = `${window.eventType}:${window.eventKey}`;
    const recentValues = this.recentPatterns.get(patternKey) || [];
    
    if (recentValues.length >= 3) {
      // Spike detection
      const recentAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
      const currentAvg = window.count > 0 ? window.sum / window.count : 0;
      
      if (currentAvg > recentAvg * 2) {
        patterns.push({
          type: 'spike',
          confidence: Math.min(currentAvg / recentAvg / 2, 1),
          description: `Value spike detected: ${Math.round((currentAvg / recentAvg - 1) * 100)}% increase`,
          startTime: window.startTime,
          endTime: window.endTime
        });
      }
      
      // Drop detection
      if (currentAvg < recentAvg * 0.5) {
        patterns.push({
          type: 'drop',
          confidence: Math.min((recentAvg - currentAvg) / recentAvg, 1),
          description: `Value drop detected: ${Math.round((1 - currentAvg / recentAvg) * 100)}% decrease`,
          startTime: window.startTime,
          endTime: window.endTime
        });
      }
      
      // Anomaly detection using standard deviation
      if (window.values.length > 10) {
        const avg = window.sum / window.count;
        const stdDev = this.calculateStdDev(window.values, avg);
        const anomalies = window.values.filter(v => Math.abs(v - avg) > 3 * stdDev);
        
        if (anomalies.length > 0) {
          patterns.push({
            type: 'anomaly',
            confidence: Math.min(anomalies.length / window.values.length * 10, 1),
            description: `${anomalies.length} anomalous values detected (>3 std dev from mean)`,
            startTime: window.startTime,
            endTime: window.endTime
          });
        }
      }
    }
    
    return patterns;
  }

  /**
   * Update recent patterns for trend detection
   */
  private updateRecentPatterns(window: AggregationWindow): void {
    const patternKey = `${window.eventType}:${window.eventKey}`;
    const recentValues = this.recentPatterns.get(patternKey) || [];
    
    const avg = window.count > 0 ? window.sum / window.count : 0;
    recentValues.push(avg);
    
    // Keep last 10 windows for pattern detection
    if (recentValues.length > 10) {
      recentValues.shift();
    }
    
    this.recentPatterns.set(patternKey, recentValues);
  }

  /**
   * Get aggregation results for time range
   */
  getAggregations(
    startTime: number,
    endTime: number,
    eventType?: string
  ): AggregationResult[] {
    return this.results.filter(r => {
      const inTimeRange = r.startTime >= startTime && r.endTime <= endTime;
      const matchesType = !eventType || r.eventType === eventType;
      return inTimeRange && matchesType;
    });
  }

  /**
   * Force close all windows and return results
   */
  closeWindows(): AggregationResult[] {
    const closedResults: AggregationResult[] = [];
    
    for (const [key, window] of this.windows) {
      const result = this.windowToResult(window);
      
      if (this.config.enablePatternDetection) {
        result.patterns = this.detectPatterns(window);
      }
      
      closedResults.push(result);
      this.results.push(result);
    }
    
    this.windows.clear();
    return closedResults;
  }

  /**
   * Update aggregation configuration
   */
  updateConfig(config: Partial<AggregationConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart cleanup timer if window size changed
    if (config.windowSizeMs && this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.startCleanupTimer();
    }
    
    logger.info('Aggregation configuration updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): AggregationConfig {
    return { ...this.config };
  }

  /**
   * Clear all aggregation data
   */
  clear(): void {
    this.windows.clear();
    this.results = [];
    this.recentPatterns.clear();
    logger.info('Aggregation data cleared');
  }

  /**
   * Check if service is healthy
   */
  protected isHealthy(): boolean {
    return !!this.cleanupTimer;
  }
  
  /**
   * Get health errors
   */
  protected getHealthErrors(): string[] {
    const errors: string[] = [];
    if (!this.cleanupTimer) {
      errors.push('Cleanup timer not running');
    }
    return errors;
  }
  
  /**
   * Collect service metrics
   */
  protected collectServiceMetrics(): Record<string, unknown> {
    return {
      activeWindows: this.windows.size,
      storedResults: this.results.length,
      patternCacheSize: this.recentPatterns.size,
      config: this.config,
      memoryUsage: {
        windowsSize: this.windows.size * 100, // Approximate bytes per window
        resultsSize: this.results.length * 200, // Approximate bytes per result
        totalValues: Array.from(this.windows.values()).reduce((sum, w) => sum + w.values.length, 0)
      }
    };
  }
}