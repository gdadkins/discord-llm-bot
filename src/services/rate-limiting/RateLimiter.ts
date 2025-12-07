import { Mutex } from 'async-mutex';
import { logger } from '../utils/logger';
import { BaseService } from './base/BaseService';
import { DataStore, DataValidator } from '../utils/DataStore';
import { dataStoreFactory } from '../utils/DataStoreFactory';
import { validate, batchValidate } from '../utils/validation';
import { RATE_LIMITER_CONSTANTS } from '../config/constants';
import { wrapDatabaseOperation } from '../utils/timeoutUtils';
import type { IRateLimiter, RateLimitStatus } from './interfaces/RateLimitingInterfaces';

interface RateLimitingConfig {
  rpm: number;
  daily: number;
  burstSize: number;
  safetyMargin: number;
  retryOptions: {
    maxRetries: number;
    retryDelay: number;
    retryMultiplier: number;
  };
}

interface RateLimitState {
  requestsThisMinute: number;
  requestsToday: number;
  minuteWindowStart: number;
  dayWindowStart: number;
}

interface WindowCache {
  minute: {
    value: number;
    expiry: number;
  };
  hour: {
    value: number;
    expiry: number;
  };
  day: {
    value: number;
    expiry: number;
  };
}

interface BatchUpdate {
  timestamp: number;
  deltaMinute: number;
  deltaDaily: number;
}

export class RateLimiter extends BaseService implements IRateLimiter {
  private stateMutex = new Mutex();
  private ioMutex = new Mutex();
  private batchMutex = new Mutex();
  private state: RateLimitState;
  private readonly stateFile: string;
  private rpmLimit: number;
  private dailyLimit: number;
  private stateDataStore: DataStore<RateLimitState>;
  
  // Performance optimization fields
  private isDirty = false;
  private lastFlushTime = 0;
  private cachedMinuteWindow = 0;
  private cachedDayWindow = 0;
  private lastWindowUpdate = 0;
  
  // Memory-first storage
  private inMemoryState = new Map<string, RateLimitState>();
  
  // Batch updates
  private pendingUpdates = new Map<string, BatchUpdate>();
  private batchSize = 0;
  private readonly MAX_BATCH_SIZE = 50;
  
  // Window calculation cache
  private windowCache: WindowCache = {
    minute: { value: 0, expiry: 0 },
    hour: { value: 0, expiry: 0 },
    day: { value: 0, expiry: 0 }
  };
  
  // Optimized timing constants
  private readonly BATCH_FLUSH_INTERVAL_MS = 5000; // Batch flush every 5 seconds
  private readonly MEMORY_SYNC_INTERVAL_MS = 30000; // Sync to disk every 30 seconds
  private readonly WINDOW_CACHE_TTL = {
    minute: 10000, // 10 seconds
    hour: 60000,   // 60 seconds
    day: 300000    // 300 seconds (5 minutes)
  };

  constructor(
    rpmLimit: number,
    dailyLimit: number,
    stateFile = './data/rate-limit.json',
  ) {
    super();
    // Use 90% of actual limits for safety margin
    this.rpmLimit = Math.floor(rpmLimit * RATE_LIMITER_CONSTANTS.SAFETY_MARGIN);
    this.dailyLimit = Math.floor(dailyLimit * RATE_LIMITER_CONSTANTS.SAFETY_MARGIN);
    this.stateFile = stateFile;

    // Initialize with current time windows
    this.state = {
      requestsThisMinute: 0,
      requestsToday: 0,
      minuteWindowStart: this.getCurrentMinuteWindow(),
      dayWindowStart: this.getCurrentDayWindow(),
    };

    // Initialize DataStore with validation
    const stateValidator: DataValidator<RateLimitState> = (data: unknown): data is RateLimitState => {
      if (typeof data !== 'object' || !data) return false;
      const state = data as RateLimitState;
      return typeof state.requestsThisMinute === 'number' &&
             typeof state.requestsToday === 'number' &&
             typeof state.minuteWindowStart === 'number' &&
             typeof state.dayWindowStart === 'number';
    };

    this.stateDataStore = dataStoreFactory.createStateStore<RateLimitState>(
      this.stateFile,
      stateValidator
    );
  }

  protected getServiceName(): string {
    return 'RateLimiter';
  }

  protected async performInitialization(): Promise<void> {
    try {
      await this.loadState();
      // Load state into memory cache
      this.inMemoryState.set('global', { ...this.state });
      logger.info('Rate limiter initialized with persisted state');
    } catch (error) {
      logger.info('No persisted rate limit state found, starting fresh');
      // Initialize memory state
      this.inMemoryState.set('global', { ...this.state });
    }
    
    // Start batch flush timer
    this.createInterval('batchFlush', () => {
      this.performBatchFlush();
    }, this.BATCH_FLUSH_INTERVAL_MS);
    
    // Start memory sync timer
    this.createInterval('memorySync', () => {
      this.performMemorySync();
    }, this.MEMORY_SYNC_INTERVAL_MS);
  }
  
  protected async performShutdown(): Promise<void> {
    // BaseService automatically clears all timers
    // Flush any pending batch updates
    if (this.pendingUpdates.size > 0) {
      await this.flushBatchUpdates();
    }
    // Force final sync before shutdown
    if (this.isDirty) {
      await this.syncMemoryToDisk();
    }
  }


  async checkAndIncrement(): Promise<{
    allowed: boolean;
    reason: string;
    remaining: { minute: number; daily: number };
  }> {
    const startTime = Date.now();
    const release = await this.stateMutex.acquire();
    try {
      // Get state from memory (no I/O)
      const memState = this.inMemoryState.get('global')!;
      
      // Update time windows using cached calculations
      this.updateMemoryStateWindows(memState);

      // Check limits
      if (memState.requestsThisMinute >= this.rpmLimit) {
        const remaining = this.getMemoryQuota(memState);
        return {
          allowed: false,
          reason: `Rate limit exceeded (${this.rpmLimit} requests per minute)`,
          remaining,
        };
      }

      if (memState.requestsToday >= this.dailyLimit) {
        const remaining = this.getMemoryQuota(memState);
        return {
          allowed: false,
          reason: `Daily limit exceeded (${this.dailyLimit} requests per day)`,
          remaining,
        };
      }

      // Increment counters in memory
      memState.requestsThisMinute++;
      memState.requestsToday++;
      
      // Update main state reference
      this.state = memState;
      this.isDirty = true;
      
      // Queue batch update
      this.queueBatchUpdate(1, 1);

      const remaining = this.getMemoryQuota(memState);
      
      const responseTime = Date.now() - startTime;
      if (responseTime > 5) {
        logger.warn(`Rate limit check took ${responseTime}ms`);
      }

      return { allowed: true, reason: 'Request allowed', remaining };
    } finally {
      release();
    }
  }

  getRemainingQuota(): { minute: number; daily: number } {
    const memState = this.inMemoryState.get('global')!;
    return this.getMemoryQuota(memState);
  }

  getRemainingRequests(_userId: string): number {
    // For global rate limiting, return daily remaining regardless of user
    // This could be enhanced with per-user limits in the future
    const memState = this.inMemoryState.get('global')!;
    return this.getMemoryQuota(memState).daily;
  }

  getDailyLimit(): number {
    return this.dailyLimit;
  }

  getStatus(_userId: string): RateLimitStatus {
    const memState = this.inMemoryState.get('global')!;
    this.updateMemoryStateWindows(memState);
    
    const nextMinuteReset = memState.minuteWindowStart + (60 * 1000); // Next minute
    const nextDayReset = memState.dayWindowStart + (24 * 60 * 60 * 1000); // Next day
    
    return {
      rpm: {
        current: memState.requestsThisMinute,
        limit: this.rpmLimit,
        resetsAt: nextMinuteReset
      },
      daily: {
        current: memState.requestsToday,
        limit: this.dailyLimit,
        resetsAt: nextDayReset
      }
    };
  }
  
  private getRemainingQuotaCached(): { minute: number; daily: number } {
    const memState = this.inMemoryState.get('global')!;
    return this.getMemoryQuota(memState);
  }

  private async updateTimeWindows(): Promise<void> {
    const memState = this.inMemoryState.get('global')!;
    const updated = this.updateMemoryStateWindows(memState);
    
    if (updated) {
      this.state = memState;
      this.isDirty = true;
    }
  }
  
  private updateMemoryStateWindows(memState: RateLimitState): boolean {
    const currentMinuteWindow = this.getCachedWindow('minute');
    const currentDayWindow = this.getCachedWindow('day');
    let updated = false;
    
    // Reset minute counter if we're in a new minute
    if (currentMinuteWindow > memState.minuteWindowStart) {
      memState.requestsThisMinute = 0;
      memState.minuteWindowStart = currentMinuteWindow;
      updated = true;
    }

    // Reset daily counter if we're in a new day
    if (currentDayWindow > memState.dayWindowStart) {
      memState.requestsToday = 0;
      memState.dayWindowStart = currentDayWindow;
      updated = true;
    }
    
    return updated;
  }
  
  private getCachedWindow(type: 'minute' | 'hour' | 'day'): number {
    const now = Date.now();
    const cache = this.windowCache[type];
    
    // Return cached value if still valid
    if (cache.expiry > now) {
      return cache.value;
    }
    
    // Calculate new window value
    let windowValue: number;
    switch (type) {
    case 'minute':
      windowValue = this.getCurrentMinuteWindow();
      break;
    case 'hour':
      windowValue = this.getCurrentHourWindow();
      break;
    case 'day':
      windowValue = this.getCurrentDayWindow();
      break;
    }
    
    // Update cache
    this.windowCache[type] = {
      value: windowValue,
      expiry: now + this.WINDOW_CACHE_TTL[type]
    };
    
    return windowValue;
  }
  
  private getCurrentHourWindow(): number {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now.getTime();
  }
  
  private getMemoryQuota(memState: RateLimitState): { minute: number; daily: number } {
    return {
      minute: Math.max(0, this.rpmLimit - memState.requestsThisMinute),
      daily: Math.max(0, this.dailyLimit - memState.requestsToday),
    };
  }
  
  private queueBatchUpdate(deltaMinute: number, deltaDaily: number): void {
    const key = 'global';
    const existing = this.pendingUpdates.get(key);
    
    if (existing) {
      existing.deltaMinute += deltaMinute;
      existing.deltaDaily += deltaDaily;
      existing.timestamp = Date.now();
    } else {
      this.pendingUpdates.set(key, {
        timestamp: Date.now(),
        deltaMinute,
        deltaDaily
      });
      this.batchSize++;
    }
    
    // Trigger flush if batch is full
    if (this.batchSize >= this.MAX_BATCH_SIZE) {
      this.performBatchFlush();
    }
  }
  
  private async performBatchFlush(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;
    
    const release = await this.batchMutex.acquire();
    try {
      await this.flushBatchUpdates();
    } finally {
      release();
    }
  }
  
  private async flushBatchUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;
    
    // Clear pending updates
    this.pendingUpdates.clear();
    this.batchSize = 0;
    
    // Updates are already applied to in-memory state
    // No I/O needed here - wait for periodic sync
  }
  
  private async performMemorySync(): Promise<void> {
    if (!this.isDirty) return;
    
    await this.syncMemoryToDisk();
  }
  
  private async syncMemoryToDisk(): Promise<void> {
    const release = await this.ioMutex.acquire();
    try {
      const memState = this.inMemoryState.get('global');
      if (!memState) return;
      
      // Single atomic write operation (error is already handled inside atomicWriteState)
      await this.atomicWriteState(memState);
      this.isDirty = false;
      this.lastFlushTime = Date.now();
    } catch (error) {
      // This should rarely happen since atomicWriteState handles its own errors
      logger.error('Unexpected error during memory sync to disk:', error);
    } finally {
      release();
    }
  }
  
  private async atomicWriteState(state: RateLimitState): Promise<void> {
    // Use DataStore for atomic writes with backup and timeout protection
    // Increased timeout to 10 seconds and added error handling
    try {
      await wrapDatabaseOperation(
        () => this.stateDataStore.save(state),
        'rateLimiter-saveState',
        10000 // Increased from 3000ms to 10000ms
      );
    } catch (error) {
      // Log the error but don't throw - rate limiter should continue working
      // even if disk persistence fails
      logger.error('Failed to persist rate limiter state to disk', {
        error,
        state,
        context: 'atomicWriteState'
      });
      // State is still in memory and rate limiting will continue to work
    }
  }

  private getCurrentMinuteWindow(): number {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.getTime();
  }

  private getCurrentDayWindow(): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }

  private async saveState(): Promise<void> {
    await this.syncMemoryToDisk();
  }
  
  private async performScheduledFlush(): Promise<void> {
    // Legacy method - now handled by performMemorySync
    await this.performMemorySync();
  }
  
  private async forceFlush(): Promise<void> {
    // Force immediate sync
    await this.syncMemoryToDisk();
  }

  private async loadState(): Promise<void> {
    try {
      const loadedState = await wrapDatabaseOperation(
        () => this.stateDataStore.load(),
        'rateLimiter-loadState',
        3000
      );

      if (loadedState) {
        this.state = loadedState;
        // Force update windows in case we've moved to a new time period
        await this.updateTimeWindows();
      }
    } catch (error) {
      throw new Error(`Failed to load state: ${error}`);
    }
  }

  // Configuration management methods
  async updateConfiguration(config: {
    rpmLimit?: number;
    dailyLimit?: number;
    burstSize?: number;
    safetyMargin?: number;
    retryOptions?: {
      maxRetries: number;
      retryDelay: number;
      retryMultiplier: number;
    };
  }): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      logger.info('Updating RateLimiter configuration...');

      if (config.rpmLimit !== undefined) {
        const oldRpmLimit = this.rpmLimit;
        this.rpmLimit = Math.floor(config.rpmLimit * (config.safetyMargin || 0.9));
        logger.info(`RPM limit updated: ${oldRpmLimit} -> ${this.rpmLimit} (with safety margin)`);
      }

      if (config.dailyLimit !== undefined) {
        const oldDailyLimit = this.dailyLimit;
        this.dailyLimit = Math.floor(config.dailyLimit * (config.safetyMargin || 0.9));
        logger.info(`Daily limit updated: ${oldDailyLimit} -> ${this.dailyLimit} (with safety margin)`);
      }

      // Note: burstSize and retryOptions would need additional implementation
      // depending on how they're used in the rate limiting logic

      logger.info('RateLimiter configuration update completed');
    } finally {
      release();
    }
  }

  async validateConfiguration(config: { rateLimiting: RateLimitingConfig }): Promise<{ valid: boolean; errors: string[] }> {
    try {
      if (!config.rateLimiting) {
        return { valid: true, errors: [] };
      }

      const rateLimitConfig = config.rateLimiting;
      const batch = batchValidate()
        .add('rpm', validate(rateLimitConfig.rpm, 'RPM').isNumber().numberRange(1).validate())
        .add('daily', validate(rateLimitConfig.daily, 'Daily limit').isNumber().numberRange(1).validate())
        .add('safetyMargin', validate(rateLimitConfig.safetyMargin, 'Safety margin').isNumber().numberRange(0.1, 1).validate())
        .add('burstSize', validate(rateLimitConfig.burstSize, 'Burst size').isNumber().numberRange(1).validate());

      // Custom validation for RPM vs daily limit relationship
      if (rateLimitConfig.rpm > rateLimitConfig.daily / 24) {
        batch.add('rpmDailyRatio', { valid: false, errors: ['RPM limit cannot exceed daily limit divided by 24 hours'] });
      }

      // Validate retry options if present
      if (rateLimitConfig.retryOptions) {
        const retryOptions = rateLimitConfig.retryOptions;
        batch
          .add('maxRetries', validate(retryOptions.maxRetries, 'Max retries').isNumber().numberRange(0, 10).validate())
          .add('retryDelay', validate(retryOptions.retryDelay, 'Retry delay').isNumber().numberRange(100, 10000).validate())
          .add('retryMultiplier', validate(retryOptions.retryMultiplier, 'Retry multiplier').isNumber().numberRange(1, 5).validate());
      }

      return batch.validateAll();
    } catch (error) {
      return { valid: false, errors: [`Rate limiter validation error: ${error}`] };
    }
  }

  /**
   * Updates rate limiting configuration
   * Required by IRateLimiter interface
   */
  updateLimits(rpm: number, daily: number): void {
    logger.info(`Updating rate limits: RPM ${this.rpmLimit} -> ${rpm}, Daily ${this.dailyLimit} -> ${daily}`);
    
    // Apply safety margin to new limits
    this.rpmLimit = Math.floor(rpm * RATE_LIMITER_CONSTANTS.SAFETY_MARGIN);
    this.dailyLimit = Math.floor(daily * RATE_LIMITER_CONSTANTS.SAFETY_MARGIN);
    
    logger.info(`Rate limits updated with safety margin: RPM ${this.rpmLimit}, Daily ${this.dailyLimit}`);
  }

  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();
    
    // Check if state is properly initialized
    if (!this.state) {
      errors.push('Rate limiter state not initialized');
    }
    
    // Check if memory state is initialized
    if (!this.inMemoryState.has('global')) {
      errors.push('In-memory state not initialized');
    }
    
    // Check if data store is available
    if (!this.stateDataStore) {
      errors.push('Data store not initialized');
    }
    
    // Check for any potential issues with sync operations
    const timeSinceLastFlush = Date.now() - this.lastFlushTime;
    if (this.isDirty && timeSinceLastFlush > this.MEMORY_SYNC_INTERVAL_MS * 2) {
      errors.push('State has not been synced to disk recently');
    }
    
    // Check memory usage
    const memoryUsage = this.inMemoryState.size * 100; // Rough estimate
    if (memoryUsage > 50 * 1024 * 1024) { // 50MB limit
      errors.push('Memory usage exceeds 50MB limit');
    }
    
    // Check if limits are reasonable
    if (this.rpmLimit <= 0 || this.dailyLimit <= 0) {
      errors.push('Invalid rate limits configured');
    }
    
    // Check if daily limit is consistent with RPM limit
    if (this.rpmLimit > this.dailyLimit / 24) {
      errors.push('RPM limit exceeds theoretical daily capacity');
    }
    
    return errors;
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    const memState = this.inMemoryState.get('global')!;
    const remaining = this.getMemoryQuota(memState);
    const timeSinceLastFlush = Date.now() - this.lastFlushTime;
    
    // Calculate memory usage
    const memoryUsage = this.inMemoryState.size * 100; // Rough estimate in bytes
    
    return {
      rateLimiting: {
        rpmLimit: this.rpmLimit,
        dailyLimit: this.dailyLimit,
        currentRpmUsage: memState?.requestsThisMinute || 0,
        currentDailyUsage: memState?.requestsToday || 0,
        remainingRpm: remaining.minute,
        remainingDaily: remaining.daily,
        isDirty: this.isDirty,
        timeSinceLastFlush: timeSinceLastFlush,
        batchFlushInterval: this.BATCH_FLUSH_INTERVAL_MS,
        memorySyncInterval: this.MEMORY_SYNC_INTERVAL_MS,
        stateFile: this.stateFile,
        performance: {
          memoryUsageBytes: memoryUsage,
          pendingBatchUpdates: this.pendingUpdates.size,
          batchSize: this.batchSize,
          cacheHitRate: 'N/A' // Could be tracked if needed
        }
      }
    };
  }

  /**
   * Checks if a video processing request can be made considering token cost
   * TODO: Implement proper video-specific rate limiting in Phase 2
   */
  async checkVideoProcessing(estimatedTokens: number, _userId?: string): Promise<import('./interfaces/RateLimitingInterfaces').VideoRateLimitResult> {
    // For Phase 1, use standard rate limiting
    const standardCheck = await this.checkAndIncrement();
    
    return {
      allowed: standardCheck.allowed,
      reason: standardCheck.reason,
      tokenCost: estimatedTokens,
      remaining: {
        tokens: {
          hourly: 1000, // Placeholder values for Phase 1
          daily: 10000
        },
        requests: {
          minute: standardCheck.remaining.minute,
          hourly: standardCheck.remaining.minute * 60
        }
      }
    };
  }

  /**
   * Gets video-specific rate limiting status
   * TODO: Implement proper video-specific status tracking in Phase 2
   */
  getVideoStatus(userId?: string): import('./interfaces/RateLimitingInterfaces').VideoRateLimitStatus {
    const standardStatus = this.getStatus(userId || '');
    
    return {
      tokens: {
        hourly: {
          current: 0, // Placeholder values for Phase 1
          limit: 1000,
          resetsAt: Date.now() + 3600000 // 1 hour from now
        },
        daily: {
          current: 0,
          limit: 10000,
          resetsAt: Date.now() + 86400000 // 24 hours from now
        }
      },
      requests: {
        hourly: {
          current: standardStatus.rpm.current,
          limit: standardStatus.rpm.limit * 60,
          resetsAt: standardStatus.rpm.resetsAt
        },
        daily: {
          current: standardStatus.daily.current,
          limit: standardStatus.daily.limit,
          resetsAt: standardStatus.daily.resetsAt
        }
      }
    };
  }
}