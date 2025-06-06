import { Mutex } from 'async-mutex';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

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
  private readonly rpmLimit: number;
  private readonly dailyLimit: number;
  
  // Performance optimization fields
  private isDirty = false;
  private lastFlushTime = 0;
  private flushTimer?: NodeJS.Timeout;
  private cachedMinuteWindow = 0;
  private cachedDayWindow = 0;
  private lastWindowUpdate = 0;
  private readonly FLUSH_INTERVAL_MS = 10000; // Batch writes every 10 seconds
  private readonly WINDOW_CACHE_MS = 1000; // Cache window calculations for 1 second

  constructor(
    rpmLimit: number,
    dailyLimit: number,
    stateFile = './data/rate-limit.json',
  ) {
    // Use 90% of actual limits for safety margin
    this.rpmLimit = Math.floor(rpmLimit * 0.9);
    this.dailyLimit = Math.floor(dailyLimit * 0.9);
    this.stateFile = stateFile;

    // Initialize with current time windows
    this.state = {
      requestsThisMinute: 0,
      requestsToday: 0,
      minuteWindowStart: this.getCurrentMinuteWindow(),
      dayWindowStart: this.getCurrentDayWindow(),
    };
  }

  async initialize(): Promise<void> {
    try {
      await this.loadState();
      logger.info('Rate limiter initialized with persisted state');
    } catch (error) {
      logger.info('No persisted rate limit state found, starting fresh');
      await this.ensureDataDirectory();
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

  private async ensureDataDirectory(): Promise<void> {
    const dir = path.dirname(this.stateFile);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create data directory:', error);
    }
  }

  private async saveState(): Promise<void> {
    const release = await this.ioMutex.acquire();
    try {
      // Optimized serialization without formatting
      await fs.writeFile(this.stateFile, JSON.stringify(this.state));
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
      const data = await fs.readFile(this.stateFile, 'utf8');
      const loadedState = JSON.parse(data) as RateLimitState;

      // Validate loaded state
      if (
        typeof loadedState.requestsThisMinute === 'number' &&
        typeof loadedState.requestsToday === 'number' &&
        typeof loadedState.minuteWindowStart === 'number' &&
        typeof loadedState.dayWindowStart === 'number'
      ) {
        this.state = loadedState;
        // Force update windows in case we've moved to a new time period
        await this.updateTimeWindows();
      }
    } catch (error) {
      throw new Error(`Failed to load state: ${error}`);
    }
  }
}
