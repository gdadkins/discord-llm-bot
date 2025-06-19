/**
 * PromisePool - Rate-limited concurrent operation executor
 * 
 * This class provides a way to execute promises with a maximum concurrency limit,
 * preventing resource exhaustion while maximizing throughput.
 * 
 * Features:
 * - Configurable concurrency limit
 * - FIFO queue processing
 * - Error isolation (one failure doesn't affect others)
 * - Graceful shutdown support
 * - Performance metrics tracking
 */

import { logger } from './logger';

export interface PromisePoolOptions {
  /**
   * Maximum number of promises that can run concurrently
   * @default 5
   */
  concurrency?: number;
  
  /**
   * Name for the pool (used in logging)
   * @default 'PromisePool'
   */
  name?: string;
  
  /**
   * Whether to continue processing on individual errors
   * @default true
   */
  continueOnError?: boolean;
}

export interface PoolMetrics {
  totalExecuted: number;
  totalErrors: number;
  averageExecutionTime: number;
  currentQueueSize: number;
  activePromises: number;
}

interface QueuedTask<T> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  addedAt: number;
}

export class PromisePool {
  private readonly concurrency: number;
  private readonly name: string;
  private readonly continueOnError: boolean;
  private readonly queue: QueuedTask<any>[] = [];
  private activeCount = 0;
  private isShuttingDown = false;
  
  // Metrics
  private totalExecuted = 0;
  private totalErrors = 0;
  private totalExecutionTime = 0;

  constructor(options: PromisePoolOptions = {}) {
    this.concurrency = options.concurrency || 5;
    this.name = options.name || 'PromisePool';
    this.continueOnError = options.continueOnError ?? true;
  }

  /**
   * Execute a promise-returning function with rate limiting
   */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    if (this.isShuttingDown) {
      throw new Error(`${this.name} is shutting down`);
    }

    return new Promise<T>((resolve, reject) => {
      const queuedTask: QueuedTask<T> = {
        task,
        resolve,
        reject,
        addedAt: Date.now()
      };

      this.queue.push(queuedTask);
      this.processQueue();
    });
  }

  /**
   * Execute multiple tasks and wait for all to complete
   */
  async executeAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    const promises = tasks.map(task => this.execute(task));
    return Promise.all(promises);
  }

  /**
   * Execute multiple tasks and return results as they complete
   */
  async *executeStream<T>(tasks: Array<() => Promise<T>>): AsyncGenerator<T, void, unknown> {
    const promises = tasks.map((task, index) => 
      this.execute(task).then(result => ({ result, index }))
    );

    // Use Promise.race to yield results as they complete
    const pending = new Set(promises);
    
    while (pending.size > 0) {
      const { result, index } = await Promise.race(pending);
      pending.delete(promises[index]);
      yield result;
    }
  }

  /**
   * Process queued tasks up to concurrency limit
   */
  private async processQueue(): Promise<void> {
    while (this.activeCount < this.concurrency && this.queue.length > 0 && !this.isShuttingDown) {
      const queuedTask = this.queue.shift();
      if (!queuedTask) break;

      this.activeCount++;
      this.executeTask(queuedTask);
    }
  }

  /**
   * Execute a single task with error handling
   */
  private async executeTask<T>(queuedTask: QueuedTask<T>): Promise<void> {
    const startTime = Date.now();
    const queueTime = startTime - queuedTask.addedAt;

    try {
      logger.debug(`${this.name}: Executing task after ${queueTime}ms in queue`);
      const result = await queuedTask.task();
      
      const executionTime = Date.now() - startTime;
      this.totalExecuted++;
      this.totalExecutionTime += executionTime;
      
      queuedTask.resolve(result);
    } catch (error) {
      this.totalErrors++;
      logger.error(`${this.name}: Task execution failed`, { error });
      
      if (!this.continueOnError) {
        this.isShuttingDown = true;
      }
      
      queuedTask.reject(error);
    } finally {
      this.activeCount--;
      // Process next item in queue
      this.processQueue();
    }
  }

  /**
   * Get current pool metrics
   */
  getMetrics(): PoolMetrics {
    return {
      totalExecuted: this.totalExecuted,
      totalErrors: this.totalErrors,
      averageExecutionTime: this.totalExecuted > 0 
        ? this.totalExecutionTime / this.totalExecuted 
        : 0,
      currentQueueSize: this.queue.length,
      activePromises: this.activeCount
    };
  }

  /**
   * Wait for all active promises to complete
   */
  async drain(): Promise<void> {
    while (this.activeCount > 0 || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Shutdown the pool gracefully
   */
  async shutdown(): Promise<void> {
    logger.info(`${this.name}: Shutting down with ${this.queue.length} tasks in queue`);
    this.isShuttingDown = true;
    
    // Reject all queued tasks
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        task.reject(new Error('Pool is shutting down'));
      }
    }
    
    // Wait for active tasks to complete
    await this.drain();
    logger.info(`${this.name}: Shutdown complete`);
  }

  /**
   * Create a rate-limited version of an async function
   */
  static rateLimited<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: PromisePoolOptions = {}
  ): (...args: TArgs) => Promise<TResult> {
    const pool = new PromisePool(options);
    
    return (...args: TArgs): Promise<TResult> => {
      return pool.execute(() => fn(...args));
    };
  }
}

/**
 * Global promise pools for different operations
 */
export const globalPools = {
  discord: new PromisePool({ concurrency: 10, name: 'DiscordAPI' }),
  gemini: new PromisePool({ concurrency: 5, name: 'GeminiAPI' }),
  context: new PromisePool({ concurrency: 20, name: 'ContextProcessing' })
};

/**
 * Shutdown all global pools
 */
export async function shutdownAllPools(): Promise<void> {
  await Promise.all([
    globalPools.discord.shutdown(),
    globalPools.gemini.shutdown(),
    globalPools.context.shutdown()
  ]);
}