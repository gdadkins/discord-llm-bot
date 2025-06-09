import { Mutex } from 'async-mutex';
import { logger } from '../utils/logger';
import { DataStore, DataValidator } from '../utils/DataStore';
import { dataStoreFactory } from '../utils/DataStoreFactory';
import { validate, batchValidate } from '../utils/validation';
import { RATE_LIMITER_CONSTANTS } from '../config/constants';

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

export class RateLimiter {
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
  private flushTimer?: NodeJS.Timeout;
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

  async initialize(): Promise<void> {
    try {
      await this.loadState();
      logger.info('Rate limiter initialized with persisted state');
    } catch (error) {
      logger.info('No persisted rate limit state found, starting fresh');
      // DataStore handles directory creation automatically
    }
    
    // Start periodic flush timer
    this.startFlushTimer();
  }
  
  async shutdown(): Promise<void> {
    // Clear timer and force final flush
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    if (this.isDirty) {
      await this.forceFlush();
    }
  }

  async checkAndIncrement(): Promise<{
    allowed: boolean;
    reason?: string;
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

      // Schedule async flush (non-blocking)
      this.scheduleFlush();

      const remaining = this.getRemainingQuotaCached();
      logger.info(
        `Rate limit check passed. Usage: ${this.state.requestsThisMinute}/${this.rpmLimit} per minute, ${this.state.requestsToday}/${this.dailyLimit} daily`,
      );

      return { allowed: true, remaining };
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

  getStatus(_userId: string): { rpm: { used: number; limit: number }; daily: { used: number; limit: number }; nextReset: { minute: number; day: number } } {
    this.updateTimeWindowsCached();
    
    const nextMinuteReset = this.state.minuteWindowStart + (60 * 1000); // Next minute
    const nextDayReset = this.state.dayWindowStart + (24 * 60 * 60 * 1000); // Next day
    
    return {
      rpm: {
        used: this.state.requestsThisMinute,
        limit: this.rpmLimit
      },
      daily: {
        used: this.state.requestsToday,
        limit: this.dailyLimit
      },
      nextReset: {
        minute: nextMinuteReset,
        day: nextDayReset
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
  
  private startFlushTimer(): void {
    this.flushTimer = setTimeout(() => {
      this.performScheduledFlush();
    }, this.FLUSH_INTERVAL_MS);
  }
  
  private scheduleFlush(): void {
    // If no timer is running and we have dirty data, start one
    if (!this.flushTimer && this.isDirty) {
      this.startFlushTimer();
    }
  }
  
  private async performScheduledFlush(): Promise<void> {
    this.flushTimer = undefined;
    
    if (this.isDirty) {
      await this.saveState();
    }
    
    // Schedule next flush if still dirty
    if (this.isDirty) {
      this.startFlushTimer();
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
}
