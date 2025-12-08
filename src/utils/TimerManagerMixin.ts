/**
 * Timer Manager Mixin
 * 
 * Provides advanced timer management capabilities that can be mixed into services
 * for efficient timer handling and resource optimization.
 * 
 * Features:
 * - Timer batching and coalescing
 * - Adaptive interval adjustment
 * - Timer priority management
 * - Performance monitoring
 * - Automatic cleanup
 * 
 * @module TimerManagerMixin
 */

import { logger } from './logger';

/**
 * Timer priority levels
 */
export enum TimerPriority {
  CRITICAL = 0,  // Always run on schedule
  HIGH = 1,      // Minimal coalescing
  NORMAL = 2,    // Standard coalescing
  LOW = 3        // Aggressive coalescing
}

/**
 * Timer execution statistics
 */
export interface TimerStats {
  executionCount: number;
  totalExecutionTime: number;
  avgExecutionTime: number;
  lastExecutionTime: number;
  lastExecutionDuration: number;
  skippedExecutions: number;
}

/**
 * Managed timer with advanced features
 */
export interface ManagedTimerAdvanced {
  id: string;
  name: string;
  callback: () => void | Promise<void>;
  interval: number;
  priority: TimerPriority;
  stats: TimerStats;
  adaptive: boolean;
  minInterval?: number;
  maxInterval?: number;
}

/**
 * Timer manager configuration
 */
export interface TimerManagerConfig {
  enableAdaptive?: boolean;
  enableBatching?: boolean;
  batchWindow?: number;
  performanceThreshold?: number;
  debug?: boolean;
}

/**
 * Timer Manager Mixin
 * 
 * Can be mixed into any class to provide advanced timer management
 */
export class TimerManagerMixin {
  private managedTimers = new Map<string, ManagedTimerAdvanced>();
  private timerBatches = new Map<number, Set<string>>();
  private config: Required<TimerManagerConfig>;
  
  constructor(config: TimerManagerConfig = {}) {
    this.config = {
      enableAdaptive: true,
      enableBatching: true,
      batchWindow: 5000, // 5 second batching window
      performanceThreshold: 100, // 100ms execution time threshold
      debug: false,
      ...config
    };
  }
  
  /**
   * Create an advanced managed timer
   */
  protected createManagedTimer(
    name: string,
    callback: () => void | Promise<void>,
    interval: number,
    options?: {
      priority?: TimerPriority;
      adaptive?: boolean;
      minInterval?: number;
      maxInterval?: number;
    }
  ): string {
    const id = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const timer: ManagedTimerAdvanced = {
      id,
      name,
      callback,
      interval,
      priority: options?.priority ?? TimerPriority.NORMAL,
      adaptive: options?.adaptive ?? this.config.enableAdaptive,
      minInterval: options?.minInterval ?? interval * 0.5,
      maxInterval: options?.maxInterval ?? interval * 2,
      stats: {
        executionCount: 0,
        totalExecutionTime: 0,
        avgExecutionTime: 0,
        lastExecutionTime: 0,
        lastExecutionDuration: 0,
        skippedExecutions: 0
      }
    };
    
    this.managedTimers.set(id, timer);
    
    // Schedule timer based on batching configuration
    if (this.config.enableBatching && timer.priority >= TimerPriority.NORMAL) {
      this.scheduleInBatch(timer);
    } else {
      this.scheduleDirect(timer);
    }
    
    if (this.config.debug) {
      logger.debug(`Created managed timer: ${name}`, {
        id,
        interval,
        priority: TimerPriority[timer.priority],
        adaptive: timer.adaptive
      });
    }
    
    return id;
  }
  
  /**
   * Schedule timer in a batch
   */
  private scheduleInBatch(timer: ManagedTimerAdvanced): void {
    // Round to nearest batch window
    const batchInterval = Math.ceil(timer.interval / this.config.batchWindow) * this.config.batchWindow;
    
    // Get or create batch
    let batch = this.timerBatches.get(batchInterval);
    if (!batch) {
      batch = new Set();
      this.timerBatches.set(batchInterval, batch);
      
      // Create batch executor
      setInterval(() => {
        this.executeBatch(batchInterval);
      }, batchInterval);
    }
    
    batch.add(timer.id);
  }
  
  /**
   * Schedule timer directly (no batching)
   */
  private scheduleDirect(timer: ManagedTimerAdvanced): void {
    const executeTimer = async () => {
      const startTime = Date.now();
      
      try {
        await timer.callback();
        
        const duration = Date.now() - startTime;
        this.updateTimerStats(timer, duration);
        
        // Adaptive interval adjustment
        if (timer.adaptive) {
          this.adjustTimerInterval(timer);
        }
        
      } catch (error) {
        logger.error(`Error in managed timer ${timer.name}:`, error);
      }
    };
    
    setInterval(executeTimer, timer.interval);
  }
  
  /**
   * Execute a batch of timers
   */
  private async executeBatch(batchInterval: number): Promise<void> {
    const batch = this.timerBatches.get(batchInterval);
    if (!batch || batch.size === 0) return;
    
    const startTime = Date.now();
    const timersToExecute: ManagedTimerAdvanced[] = [];
    
    // Collect timers to execute
    for (const timerId of batch) {
      const timer = this.managedTimers.get(timerId);
      if (timer) {
        timersToExecute.push(timer);
      }
    }
    
    // Sort by priority
    timersToExecute.sort((a, b) => a.priority - b.priority);
    
    // Execute timers
    for (const timer of timersToExecute) {
      const timerStart = Date.now();
      
      try {
        // Skip if previous execution is still running
        if (timer.stats.lastExecutionTime && 
            Date.now() - timer.stats.lastExecutionTime < timer.interval) {
          timer.stats.skippedExecutions++;
          continue;
        }
        
        await timer.callback();
        
        const duration = Date.now() - timerStart;
        this.updateTimerStats(timer, duration);
        
      } catch (error) {
        logger.error(`Error in batched timer ${timer.name}:`, error);
      }
    }
    
    const batchDuration = Date.now() - startTime;
    
    if (this.config.debug && batchDuration > this.config.performanceThreshold) {
      logger.warn(`Timer batch execution took ${batchDuration}ms`, {
        batchInterval,
        timerCount: timersToExecute.length
      });
    }
  }
  
  /**
   * Update timer statistics
   */
  private updateTimerStats(timer: ManagedTimerAdvanced, duration: number): void {
    timer.stats.executionCount++;
    timer.stats.totalExecutionTime += duration;
    timer.stats.avgExecutionTime = timer.stats.totalExecutionTime / timer.stats.executionCount;
    timer.stats.lastExecutionTime = Date.now();
    timer.stats.lastExecutionDuration = duration;
  }
  
  /**
   * Adjust timer interval based on performance
   */
  private adjustTimerInterval(timer: ManagedTimerAdvanced): void {
    const { avgExecutionTime } = timer.stats;
    
    // If execution is taking too long, increase interval
    if (avgExecutionTime > this.config.performanceThreshold) {
      const newInterval = Math.min(
        timer.interval * 1.1,
        timer.maxInterval || timer.interval * 2
      );
      
      if (newInterval !== timer.interval) {
        timer.interval = newInterval;
        
        if (this.config.debug) {
          logger.info(`Adjusted timer ${timer.name} interval to ${newInterval}ms due to performance`);
        }
      }
    }
    // If execution is fast and we have many skips, decrease interval
    else if (timer.stats.skippedExecutions > 5 && avgExecutionTime < this.config.performanceThreshold * 0.5) {
      const newInterval = Math.max(
        timer.interval * 0.9,
        timer.minInterval || timer.interval * 0.5
      );
      
      if (newInterval !== timer.interval) {
        timer.interval = newInterval;
        timer.stats.skippedExecutions = 0;
        
        if (this.config.debug) {
          logger.info(`Adjusted timer ${timer.name} interval to ${newInterval}ms for better responsiveness`);
        }
      }
    }
  }
  
  /**
   * Get timer statistics
   */
  protected getTimerStatistics(timerId: string): TimerStats | undefined {
    const timer = this.managedTimers.get(timerId);
    return timer?.stats;
  }
  
  /**
   * Get all timer statistics
   */
  protected getAllTimerStatistics(): Map<string, TimerStats> {
    const stats = new Map<string, TimerStats>();
    
    for (const [id, timer] of this.managedTimers) {
      stats.set(`${timer.name} (${id})`, { ...timer.stats });
    }
    
    return stats;
  }
  
  /**
   * Remove a managed timer
   */
  protected removeManagedTimer(timerId: string): boolean {
    const timer = this.managedTimers.get(timerId);
    if (!timer) return false;
    
    // Remove from batch if applicable
    for (const [, batch] of this.timerBatches) {
      batch.delete(timerId);
    }
    
    this.managedTimers.delete(timerId);
    
    if (this.config.debug) {
      logger.debug(`Removed managed timer: ${timer.name}`);
    }
    
    return true;
  }
  
  /**
   * Clear all managed timers
   */
  protected clearAllManagedTimers(): void {
    const count = this.managedTimers.size;
    
    this.managedTimers.clear();
    this.timerBatches.clear();
    
    if (count > 0) {
      logger.info(`Cleared ${count} managed timers`);
    }
  }
  
  /**
   * Get timer management metrics
   */
  protected getTimerManagementMetrics(): Record<string, unknown> {
    const totalTimers = this.managedTimers.size;
    const batchCount = this.timerBatches.size;
    let totalSkipped = 0;
    let avgExecutionTime = 0;
    
    for (const timer of this.managedTimers.values()) {
      totalSkipped += timer.stats.skippedExecutions;
      avgExecutionTime += timer.stats.avgExecutionTime;
    }
    
    if (totalTimers > 0) {
      avgExecutionTime /= totalTimers;
    }
    
    return {
      totalTimers,
      batchCount,
      totalSkipped,
      avgExecutionTime: Math.round(avgExecutionTime * 10) / 10,
      config: {
        batching: this.config.enableBatching,
        adaptive: this.config.enableAdaptive,
        batchWindow: this.config.batchWindow
      }
    };
  }
}