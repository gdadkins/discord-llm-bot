import { Mutex } from 'async-mutex';
import { logger } from '../utils/logger';
import { BaseService } from './base/BaseService';
import { DataStore, DataValidator } from '../utils/DataStore';
import { dataStoreFactory } from '../utils/DataStoreFactory';
import { validate, batchValidate } from '../utils/validation';
import { RATE_LIMITER_CONSTANTS } from '../config/constants';
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

export class RateLimiter extends BaseService implements IRateLimiter {
  private stateMutex = new Mutex();
  private ioMutex = new Mutex();
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
  private readonly FLUSH_INTERVAL_MS = RATE_LIMITER_CONSTANTS.FLUSH_INTERVAL_MS; // Batch writes every 10 seconds
  private readonly WINDOW_CACHE_MS = RATE_LIMITER_CONSTANTS.WINDOW_CACHE_MS; // Cache window calculations for 1 second

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
      logger.info('Rate limiter initialized with persisted state');
    } catch (error) {
      logger.info('No persisted rate limit state found, starting fresh');
      // DataStore handles directory creation automatically
    }
    
    // Start periodic flush timer
    this.createInterval('stateFlush', () => {
      this.performScheduledFlush();
    }, this.FLUSH_INTERVAL_MS);
  }
  
  protected async performShutdown(): Promise<void> {
    // BaseService automatically clears all timers
    // Force final flush before shutdown
    if (this.isDirty) {
      await this.forceFlush();
    }
  }


  async checkAndIncrement(): Promise<{
    allowed: boolean;
    reason: string;
    remaining: { minute: number; daily: number };
  }> {
    const release = await this.stateMutex.acquire();
    try {
      // Update time windows if needed (cached)
      this.updateTimeWindowsCached();

      // Check limits
      if (this.state.requestsThisMinute >= this.rpmLimit) {
        const remaining = this.getRemainingQuotaCached();
        return {
          allowed: false,
          reason: `Rate limit exceeded (${this.rpmLimit} requests per minute)`,
          remaining,
        };
      }

      if (this.state.requestsToday >= this.dailyLimit) {
        const remaining = this.getRemainingQuotaCached();
        return {
          allowed: false,
          reason: `Daily limit exceeded (${this.dailyLimit} requests per day)`,
          remaining,
        };
      }

      // Increment counters
      this.state.requestsThisMinute++;
      this.state.requestsToday++;
      this.isDirty = true;

      // Mark as dirty for next flush cycle
      // Timer-based flushing will handle persistence

      const remaining = this.getRemainingQuotaCached();
      logger.info(
        `Rate limit check passed. Usage: ${this.state.requestsThisMinute}/${this.rpmLimit} per minute, ${this.state.requestsToday}/${this.dailyLimit} daily`,
      );

      return { allowed: true, reason: 'Request allowed', remaining };
    } finally {
      release();
    }
  }

  getRemainingQuota(): { minute: number; daily: number } {
    return this.getRemainingQuotaCached();
  }

  getRemainingRequests(_userId: string): number {
    // For global rate limiting, return daily remaining regardless of user
    // This could be enhanced with per-user limits in the future
    return this.getRemainingQuotaCached().daily;
  }

  getDailyLimit(): number {
    return this.dailyLimit;
  }

  getStatus(_userId: string): RateLimitStatus {
    this.updateTimeWindowsCached();
    
    const nextMinuteReset = this.state.minuteWindowStart + (60 * 1000); // Next minute
    const nextDayReset = this.state.dayWindowStart + (24 * 60 * 60 * 1000); // Next day
    
    return {
      rpm: {
        current: this.state.requestsThisMinute,
        limit: this.rpmLimit,
        resetsAt: nextMinuteReset
      },
      daily: {
        current: this.state.requestsToday,
        limit: this.dailyLimit,
        resetsAt: nextDayReset
      }
    };
  }
  
  private getRemainingQuotaCached(): { minute: number; daily: number } {
    return {
      minute: Math.max(0, this.rpmLimit - this.state.requestsThisMinute),
      daily: Math.max(0, this.dailyLimit - this.state.requestsToday),
    };
  }

  private async updateTimeWindows(): Promise<void> {
    const currentMinuteWindow = this.getCurrentMinuteWindow();
    const currentDayWindow = this.getCurrentDayWindow();

    // Reset minute counter if we're in a new minute
    if (currentMinuteWindow > this.state.minuteWindowStart) {
      this.state.requestsThisMinute = 0;
      this.state.minuteWindowStart = currentMinuteWindow;
      this.isDirty = true;
      logger.info('Minute window reset');
    }

    // Reset daily counter if we're in a new day
    if (currentDayWindow > this.state.dayWindowStart) {
      this.state.requestsToday = 0;
      this.state.dayWindowStart = currentDayWindow;
      this.isDirty = true;
      logger.info('Daily window reset');
    }
  }
  
  private updateTimeWindowsCached(): void {
    const now = Date.now();
    
    // Only recalculate if cache is expired
    if (now - this.lastWindowUpdate > this.WINDOW_CACHE_MS) {
      const currentMinuteWindow = this.getCurrentMinuteWindow();
      const currentDayWindow = this.getCurrentDayWindow();
      
      this.cachedMinuteWindow = currentMinuteWindow;
      this.cachedDayWindow = currentDayWindow;
      this.lastWindowUpdate = now;
      
      // Reset minute counter if we're in a new minute
      if (currentMinuteWindow > this.state.minuteWindowStart) {
        this.state.requestsThisMinute = 0;
        this.state.minuteWindowStart = currentMinuteWindow;
        this.isDirty = true;
        logger.info('Minute window reset');
      }

      // Reset daily counter if we're in a new day
      if (currentDayWindow > this.state.dayWindowStart) {
        this.state.requestsToday = 0;
        this.state.dayWindowStart = currentDayWindow;
        this.isDirty = true;
        logger.info('Daily window reset');
      }
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
    const release = await this.ioMutex.acquire();
    try {
      // Use DataStore for atomic writes with backup
      await this.stateDataStore.save(this.state);
      this.isDirty = false;
      this.lastFlushTime = Date.now();
    } catch (error) {
      logger.error('Failed to save rate limit state:', error);
    } finally {
      release();
    }
  }
  
  private async performScheduledFlush(): Promise<void> {
    if (this.isDirty) {
      await this.saveState();
    }
  }
  
  private async forceFlush(): Promise<void> {
    if (this.isDirty) {
      await this.saveState();
    }
  }

  private async loadState(): Promise<void> {
    try {
      const loadedState = await this.stateDataStore.load();

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
    
    // Check if data store is available
    if (!this.stateDataStore) {
      errors.push('Data store not initialized');
    }
    
    // Check for any potential issues with flush operations
    const timeSinceLastFlush = Date.now() - this.lastFlushTime;
    if (this.isDirty && timeSinceLastFlush > this.FLUSH_INTERVAL_MS * 3) {
      errors.push('State has not been persisted recently');
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
    const remaining = this.getRemainingQuotaCached();
    const timeSinceLastFlush = Date.now() - this.lastFlushTime;
    
    return {
      rateLimiting: {
        rpmLimit: this.rpmLimit,
        dailyLimit: this.dailyLimit,
        currentRpmUsage: this.state?.requestsThisMinute || 0,
        currentDailyUsage: this.state?.requestsToday || 0,
        remainingRpm: remaining.minute,
        remainingDaily: remaining.daily,
        isDirty: this.isDirty,
        timeSinceLastFlush: timeSinceLastFlush,
        flushInterval: this.FLUSH_INTERVAL_MS,
        stateFile: this.stateFile
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
