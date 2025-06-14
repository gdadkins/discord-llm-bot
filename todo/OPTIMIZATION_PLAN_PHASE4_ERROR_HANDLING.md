# Phase 4: Error Handling and Resilience Plan

## Overview
This phase focuses on implementing comprehensive error handling, extending circuit breakers, and ensuring production-grade resilience. The codebase already has excellent ErrorHandlingUtils but needs broader application.

## Timeline: 1 Week
- Day 1-2: Try-catch coverage and timeout protection (Agents 1-2)
- Day 3-4: Circuit breaker extensions (Agents 3-4)
- Day 5-6: Resource cleanup and monitoring (Agents 5-6)
- Day 7: Integration testing and chaos engineering (Agent 7)

## Critical Gaps Identified
1. **Missing Try-Catch**: Event handlers, service initialization, background operations
2. **Limited Circuit Breakers**: Only Gemini protected, Discord API vulnerable
3. **Fire-and-Forget Issues**: Unhandled promise rejections
4. **No Timeout Protection**: Operations can hang indefinitely
5. **Resource Cleanup**: No rollback on initialization failures
6. **Inconsistent Error Formats**: Different services return different error shapes

## Agent Task Assignments

### Agent 1: Comprehensive Try-Catch Implementation
**Priority**: CRITICAL
**Target**: 100% async operation coverage
**Files**: src/handlers/*, src/services/*, src/core/*

**Task Details**:

1. **Event Handler Protection**:
```typescript
// src/handlers/eventHandlers.ts
import { enrichError, isRetryableError, getUserFriendlyMessage } from '../utils/ErrorHandlingUtils';

export async function handleMessageCreate(
  message: Message,
  services: ServiceRegistry,
  activeRequests: Map<string, AbortController>
): Promise<void> {
  const requestId = `msg_${message.id}_${Date.now()}`;
  const abortController = new AbortController();
  activeRequests.set(requestId, abortController);
  
  try {
    // Wrap mutex acquisition with timeout
    const messageRelease = await Promise.race([
      messageMutex.acquire(),
      createTimeoutPromise(5000).then(() => {
        throw enrichError(new Error('Mutex acquisition timeout'), {
          operation: 'messageMutex.acquire',
          messageId: message.id
        });
      })
    ]);
    
    try {
      // Check abort signal
      if (abortController.signal.aborted) {
        logger.debug('Request aborted before processing', { requestId });
        return;
      }
      
      // Process message with timeout
      await Promise.race([
        processMessageInternal(message, services, abortController.signal),
        createTimeoutPromise(30000).then(() => {
          throw enrichError(new Error('Message processing timeout'), {
            operation: 'processMessage',
            messageId: message.id,
            timeout: 30000
          });
        })
      ]);
      
    } finally {
      messageRelease(); // Always release mutex
    }
    
  } catch (error) {
    const enrichedError = enrichError(error as Error, {
      messageId: message.id,
      userId: message.author.id,
      channelId: message.channel.id,
      guildId: message.guild?.id,
      requestId
    });
    
    // Log error with context
    logger.error('Message handling failed', {
      error: enrichedError,
      errorCategory: enrichedError.category,
      retryable: isRetryableError(enrichedError)
    });
    
    // Handle based on error type
    if (isRetryableError(enrichedError)) {
      // Queue for retry with graceful degradation
      try {
        await services.get('gracefulDegradation').queueMessage({
          message,
          error: enrichedError,
          retryCount: 0,
          maxRetries: 3
        });
      } catch (queueError) {
        logger.error('Failed to queue message for retry', queueError);
      }
    } else {
      // Send user-friendly error message
      try {
        const errorMessage = getUserFriendlyMessage(enrichedError);
        await message.reply({
          content: errorMessage,
          allowedMentions: { repliedUser: false }
        });
      } catch (replyError) {
        logger.error('Failed to send error message to user', replyError);
      }
    }
    
    // Track error metrics
    services.get('analyticsManager')?.trackError({
      type: 'message_processing',
      error: enrichedError,
      userId: message.author.id,
      guildId: message.guild?.id
    }).catch(err => logger.error('Failed to track error', err));
    
  } finally {
    // Clean up request tracking
    activeRequests.delete(requestId);
  }
}

// Command handler with comprehensive error handling
export async function handleSlashCommand(
  interaction: CommandInteraction,
  services: ServiceRegistry
): Promise<void> {
  const commandName = interaction.commandName;
  const startTime = Date.now();
  
  try {
    // Defer reply with timeout
    await Promise.race([
      interaction.deferReply(),
      createTimeoutPromise(3000).then(() => {
        throw enrichError(new Error('Failed to defer reply'), {
          operation: 'deferReply',
          commandName
        });
      })
    ]);
    
    // Execute command with timeout
    const command = commands.get(commandName);
    if (!command) {
      throw enrichError(new Error('Command not found'), {
        category: ErrorCategory.VALIDATION,
        commandName,
        availableCommands: Array.from(commands.keys())
      });
    }
    
    await Promise.race([
      command.execute(interaction, services),
      createTimeoutPromise(25000).then(() => {
        throw enrichError(new Error('Command execution timeout'), {
          operation: 'command.execute',
          commandName,
          timeout: 25000
        });
      })
    ]);
    
    // Track success metrics
    const duration = Date.now() - startTime;
    services.get('analyticsManager')?.trackCommandSuccess({
      commandName,
      duration,
      userId: interaction.user.id,
      guildId: interaction.guild?.id
    }).catch(err => logger.error('Failed to track command success', err));
    
  } catch (error) {
    const enrichedError = enrichError(error as Error, {
      commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      duration: Date.now() - startTime
    });
    
    logger.error('Command execution failed', {
      error: enrichedError,
      errorCategory: enrichedError.category
    });
    
    // Send error response
    const errorMessage = getUserFriendlyMessage(enrichedError);
    try {
      if (interaction.deferred) {
        await interaction.editReply(errorMessage);
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      logger.error('Failed to send error response', replyError);
    }
    
    // Track error metrics
    services.get('analyticsManager')?.trackCommandError({
      commandName,
      error: enrichedError,
      userId: interaction.user.id,
      guildId: interaction.guild?.id
    }).catch(err => logger.error('Failed to track command error', err));
  }
}
```

2. **Service Method Protection Template**:
```typescript
// Template for wrapping service methods
export function wrapServiceMethod<T extends (...args: any[]) => Promise<any>>(
  method: T,
  serviceName: string,
  methodName: string,
  options: {
    timeout?: number;
    retryable?: boolean;
    fallback?: (...args: Parameters<T>) => ReturnType<T>;
  } = {}
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const startTime = Date.now();
    const context = {
      service: serviceName,
      method: methodName,
      args: args.map(arg => typeof arg === 'object' ? '[Object]' : arg)
    };
    
    try {
      // Apply timeout if specified
      let promise = method.apply(this, args);
      
      if (options.timeout) {
        promise = Promise.race([
          promise,
          createTimeoutPromise(options.timeout).then(() => {
            throw enrichError(new Error(`${methodName} timeout`), {
              ...context,
              timeout: options.timeout
            });
          })
        ]);
      }
      
      const result = await promise;
      
      // Track success metrics
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        logger.warn('Slow service method', { ...context, duration });
      }
      
      return result;
      
    } catch (error) {
      const enrichedError = enrichError(error as Error, {
        ...context,
        duration: Date.now() - startTime
      });
      
      // Check if retryable
      if (options.retryable && isRetryableError(enrichedError)) {
        enrichedError.retryable = true;
      }
      
      // Try fallback if available
      if (options.fallback) {
        logger.warn('Using fallback for service method', {
          ...context,
          error: enrichedError
        });
        return options.fallback.apply(this, args);
      }
      
      throw enrichedError;
    }
  }) as T;
}

// Usage in services
class SomeService {
  constructor() {
    // Wrap methods with error handling
    this.processData = wrapServiceMethod(
      this.processData.bind(this),
      'SomeService',
      'processData',
      { timeout: 5000, retryable: true }
    );
  }
  
  private async processData(data: any): Promise<any> {
    // Original implementation
  }
}
```

3. **Background Operation Protection**:
```typescript
// src/utils/backgroundOperations.ts
export function scheduleBackgroundTask(
  name: string,
  task: () => Promise<void>,
  interval: number,
  options: {
    maxExecutionTime?: number;
    errorThreshold?: number;
    onError?: (error: Error) => void;
  } = {}
): NodeJS.Timeout {
  let consecutiveErrors = 0;
  const maxExecutionTime = options.maxExecutionTime || 30000;
  const errorThreshold = options.errorThreshold || 5;
  
  const wrappedTask = async () => {
    const startTime = Date.now();
    
    try {
      await Promise.race([
        task(),
        createTimeoutPromise(maxExecutionTime).then(() => {
          throw enrichError(new Error('Background task timeout'), {
            task: name,
            timeout: maxExecutionTime
          });
        })
      ]);
      
      // Reset error counter on success
      consecutiveErrors = 0;
      
      // Log if task took long
      const duration = Date.now() - startTime;
      if (duration > maxExecutionTime * 0.8) {
        logger.warn('Background task approaching timeout', {
          task: name,
          duration,
          threshold: maxExecutionTime
        });
      }
      
    } catch (error) {
      consecutiveErrors++;
      const enrichedError = enrichError(error as Error, {
        task: name,
        consecutiveErrors,
        duration: Date.now() - startTime
      });
      
      logger.error('Background task failed', {
        error: enrichedError,
        consecutiveErrors
      });
      
      // Call error handler if provided
      if (options.onError) {
        try {
          options.onError(enrichedError);
        } catch (handlerError) {
          logger.error('Error handler failed', handlerError);
        }
      }
      
      // Stop task if error threshold exceeded
      if (consecutiveErrors >= errorThreshold) {
        logger.error('Background task disabled due to repeated failures', {
          task: name,
          failures: consecutiveErrors
        });
        clearInterval(intervalId);
        
        // Notify monitoring
        monitoringService.alert({
          level: 'critical',
          component: 'background_tasks',
          message: `Task ${name} disabled after ${consecutiveErrors} failures`,
          task: name,
          lastError: enrichedError
        });
      }
    }
  };
  
  // Run immediately
  wrappedTask().catch(err => 
    logger.error('Initial background task execution failed', err)
  );
  
  // Schedule recurring execution
  const intervalId = setInterval(wrappedTask, interval);
  
  return intervalId;
}
```

**Success Criteria**:
- All async operations have try-catch
- All errors enriched with context
- User-friendly error messages
- Proper resource cleanup in finally blocks

### Agent 2: Timeout Protection Implementation
**Priority**: CRITICAL
**Target**: No hanging operations
**Files**: src/utils/*, src/services/*

**Task Details**:

1. **Create Comprehensive Timeout Utilities**:
```typescript
// src/utils/timeoutUtils.ts
import { enrichError, ErrorCategory } from './ErrorHandlingUtils';

export interface TimeoutOptions {
  message?: string;
  category?: ErrorCategory;
  context?: Record<string, unknown>;
}

/**
 * Creates a promise that rejects after specified timeout
 */
export function createTimeoutPromise(
  ms: number,
  options: TimeoutOptions = {}
): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(options.message || `Operation timed out after ${ms}ms`);
      reject(enrichError(error, {
        category: options.category || ErrorCategory.TIMEOUT,
        timeout: ms,
        ...options.context
      }));
    }, ms);
  });
}

/**
 * Wraps a promise with timeout protection
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  options: TimeoutOptions = {}
): Promise<T> {
  return Promise.race([
    promise,
    createTimeoutPromise(ms, options)
  ]);
}

/**
 * Creates a timeout-protected function
 */
export function timeoutProtected<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  defaultTimeout: number,
  name: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    // Allow timeout override via last parameter
    let timeout = defaultTimeout;
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'object' && lastArg !== null && 'timeout' in lastArg) {
      timeout = lastArg.timeout;
      args = args.slice(0, -1) as Parameters<T>;
    }
    
    return withTimeout(
      fn(...args),
      timeout,
      {
        message: `${name} timed out`,
        context: { function: name, timeout }
      }
    );
  }) as T;
}

/**
 * Implements timeout with cancellation
 */
export class CancellableTimeout {
  private timeoutId: NodeJS.Timeout | null = null;
  private abortController = new AbortController();
  
  async run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeout: number,
    options: TimeoutOptions = {}
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Set timeout
      this.timeoutId = setTimeout(() => {
        this.abortController.abort();
        const error = new Error(options.message || `Operation cancelled after ${timeout}ms`);
        reject(enrichError(error, {
          category: ErrorCategory.TIMEOUT,
          timeout,
          cancelled: true,
          ...options.context
        }));
      }, timeout);
      
      // Run operation
      operation(this.abortController.signal)
        .then(result => {
          this.cleanup();
          resolve(result);
        })
        .catch(error => {
          this.cleanup();
          reject(error);
        });
    });
  }
  
  cancel(): void {
    this.abortController.abort();
    this.cleanup();
  }
  
  private cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

/**
 * Adaptive timeout based on historical performance
 */
export class AdaptiveTimeout {
  private history: number[] = [];
  private readonly maxHistory = 100;
  
  constructor(
    private baseTimeout: number,
    private readonly options: {
      minTimeout?: number;
      maxTimeout?: number;
      percentile?: number;
    } = {}
  ) {}
  
  recordDuration(duration: number): void {
    this.history.push(duration);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
  
  getTimeout(): number {
    if (this.history.length < 10) {
      return this.baseTimeout;
    }
    
    // Calculate percentile-based timeout
    const sorted = [...this.history].sort((a, b) => a - b);
    const percentile = this.options.percentile || 0.95;
    const index = Math.floor(sorted.length * percentile);
    const calculated = sorted[index] * 1.5; // 50% buffer
    
    // Apply bounds
    const min = this.options.minTimeout || this.baseTimeout / 2;
    const max = this.options.maxTimeout || this.baseTimeout * 3;
    
    return Math.max(min, Math.min(max, calculated));
  }
}
```

2. **Apply Timeouts to External API Calls**:
```typescript
// Update GeminiService
class GeminiService {
  private readonly apiTimeout = new AdaptiveTimeout(30000, {
    minTimeout: 10000,
    maxTimeout: 60000,
    percentile: 0.95
  });
  
  async executeGeminiAPICall(
    content: Content | string,
    options: GeminiOptions = {}
  ): Promise<GeminiResponse> {
    const timeout = options.timeout || this.apiTimeout.getTimeout();
    const startTime = Date.now();
    
    try {
      const response = await withTimeout(
        this.ai.models.generateContent({
          model: this.model,
          contents: content,
          config: this.buildGenerationConfig(options)
        }),
        timeout,
        {
          message: 'Gemini API call timed out',
          context: {
            model: this.model,
            contentLength: typeof content === 'string' ? content.length : JSON.stringify(content).length
          }
        }
      );
      
      // Record successful duration for adaptive timeout
      const duration = Date.now() - startTime;
      this.apiTimeout.recordDuration(duration);
      
      return response;
      
    } catch (error) {
      if (error.category === ErrorCategory.TIMEOUT) {
        // Track timeout metrics
        this.metrics.recordTimeout('gemini_api', timeout);
      }
      throw error;
    }
  }
}

// Update Discord API calls
async function sendDiscordMessage(
  channel: TextChannel,
  content: string,
  options: MessageOptions = {}
): Promise<Message> {
  return withTimeout(
    channel.send({
      content,
      ...options
    }),
    5000,
    {
      message: 'Discord message send timed out',
      context: {
        channelId: channel.id,
        contentLength: content.length
      }
    }
  );
}
```

3. **Database Operation Timeouts**:
```typescript
// src/services/database/timeoutWrapper.ts
export function wrapDatabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  timeout: number = 5000
): Promise<T> {
  const cancellableTimeout = new CancellableTimeout();
  
  return cancellableTimeout.run(
    async (signal) => {
      // For databases that support cancellation
      if ('cancel' in operation) {
        signal.addEventListener('abort', () => {
          (operation as any).cancel();
        });
      }
      
      return operation();
    },
    timeout,
    {
      message: `Database operation '${operationName}' timed out`,
      category: ErrorCategory.DATABASE,
      context: { operation: operationName }
    }
  );
}

// Usage
async function getUserPreferences(userId: string): Promise<UserPreferences> {
  return wrapDatabaseOperation(
    () => db.query('SELECT * FROM user_preferences WHERE user_id = ?', [userId]),
    'getUserPreferences',
    3000
  );
}
```

**Success Criteria**:
- All external API calls have timeouts
- All database operations have timeouts
- Adaptive timeouts for variable operations
- Cancellation support where possible

### Agent 3: Circuit Breaker Extension
**Priority**: HIGH
**Target**: All external services protected
**Files**: src/services/resilience/*, src/services/gracefulDegradation.ts

**Task Details**:

1. **Create Generic Circuit Breaker**:
```typescript
// src/services/resilience/CircuitBreaker.ts
export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxAttempts: number;
  onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private halfOpenAttempts = 0;
  private stateChangeTime: number = Date.now();
  
  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions
  ) {}
  
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    // Check if circuit should be reset
    this.checkReset();
    
    if (this.state === CircuitState.OPEN) {
      const error = enrichError(new Error('Circuit breaker is OPEN'), {
        category: ErrorCategory.CIRCUIT_BREAKER,
        circuitBreaker: this.name,
        state: this.state,
        timeInState: Date.now() - this.stateChangeTime
      });
      
      if (fallback) {
        logger.warn('Circuit breaker open, using fallback', {
          circuit: this.name,
          state: this.state
        });
        return fallback();
      }
      
      throw error;
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      
      if (fallback && this.state === CircuitState.OPEN) {
        logger.warn('Circuit breaker opened, using fallback', {
          circuit: this.name,
          error
        });
        return fallback();
      }
      
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.options.halfOpenMaxAttempts) {
        this.setState(CircuitState.CLOSED);
      }
    }
  }
  
  private onFailure(error: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.setState(CircuitState.OPEN);
    } else if (
      this.state === CircuitState.CLOSED &&
      this.failures >= this.options.failureThreshold
    ) {
      this.setState(CircuitState.OPEN);
    }
    
    // Enrich error with circuit breaker context
    (error as any).circuitBreaker = {
      name: this.name,
      state: this.state,
      failures: this.failures
    };
  }
  
  private checkReset(): void {
    if (
      this.state === CircuitState.OPEN &&
      this.lastFailureTime &&
      Date.now() - this.lastFailureTime >= this.options.resetTimeout
    ) {
      this.setState(CircuitState.HALF_OPEN);
      this.halfOpenAttempts = 0;
      this.successes = 0;
    }
  }
  
  private setState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangeTime = Date.now();
    
    logger.info('Circuit breaker state changed', {
      circuit: this.name,
      oldState,
      newState,
      failures: this.failures
    });
    
    if (this.options.onStateChange) {
      try {
        this.options.onStateChange(oldState, newState);
      } catch (error) {
        logger.error('Circuit breaker state change handler failed', error);
      }
    }
  }
  
  getStatus(): {
    state: CircuitState;
    failures: number;
    lastFailureTime?: number;
    timeInState: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      timeInState: Date.now() - this.stateChangeTime
    };
  }
}
```

2. **Discord API Circuit Breaker**:
```typescript
// src/services/resilience/DiscordCircuitBreaker.ts
export class DiscordCircuitBreaker {
  private readonly breakers = new Map<string, CircuitBreaker>();
  
  constructor(
    private readonly healthMonitor: IHealthMonitor,
    private readonly fallbackService: IFallbackService
  ) {
    // Create breakers for different Discord operations
    this.createBreaker('send_message', {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000,
      halfOpenMaxAttempts: 3
    });
    
    this.createBreaker('edit_message', {
      failureThreshold: 3,
      resetTimeout: 20000,
      monitoringPeriod: 60000,
      halfOpenMaxAttempts: 2
    });
    
    this.createBreaker('add_reaction', {
      failureThreshold: 10,
      resetTimeout: 15000,
      monitoringPeriod: 60000,
      halfOpenMaxAttempts: 5
    });
  }
  
  private createBreaker(name: string, options: CircuitBreakerOptions): void {
    const breaker = new CircuitBreaker(`discord_${name}`, {
      ...options,
      onStateChange: (oldState, newState) => {
        // Update health monitor
        this.healthMonitor.updateCircuitBreakerStatus(`discord_${name}`, {
          state: newState,
          timestamp: Date.now()
        });
        
        // Alert on circuit open
        if (newState === CircuitState.OPEN) {
          this.healthMonitor.alert({
            level: 'warning',
            component: 'discord_api',
            message: `Discord ${name} circuit breaker opened`,
            details: { operation: name }
          });
        }
      }
    });
    
    this.breakers.set(name, breaker);
  }
  
  async sendMessage(
    channel: TextChannel,
    content: MessageOptions
  ): Promise<Message | null> {
    const breaker = this.breakers.get('send_message')!;
    
    return breaker.execute(
      async () => {
        // Add Discord-specific error handling
        try {
          return await channel.send(content);
        } catch (error) {
          // Classify Discord errors
          if (error.code === 50013) { // Missing permissions
            throw enrichError(error, {
              category: ErrorCategory.VALIDATION,
              retryable: false,
              discord: { code: error.code, message: 'Missing permissions' }
            });
          } else if (error.code === 50001) { // Missing access
            throw enrichError(error, {
              category: ErrorCategory.AUTHORIZATION,
              retryable: false,
              discord: { code: error.code, message: 'Missing access' }
            });
          } else if (error.code >= 500) { // Server errors
            throw enrichError(error, {
              category: ErrorCategory.EXTERNAL_SERVICE,
              retryable: true,
              discord: { code: error.code }
            });
          }
          throw error;
        }
      },
      // Fallback
      async () => {
        logger.warn('Using fallback for Discord message send', {
          channelId: channel.id,
          contentLength: content.content?.length
        });
        
        // Queue message for later delivery
        await this.fallbackService.queueMessage({
          channelId: channel.id,
          content,
          timestamp: Date.now()
        });
        
        return null;
      }
    );
  }
  
  async editMessage(
    message: Message,
    content: string | MessageEditOptions
  ): Promise<Message | null> {
    const breaker = this.breakers.get('edit_message')!;
    
    return breaker.execute(
      async () => message.edit(content),
      async () => {
        logger.warn('Using fallback for Discord message edit', {
          messageId: message.id
        });
        return null;
      }
    );
  }
  
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus();
    }
    
    return status;
  }
}
```

3. **Service-Specific Circuit Breakers**:
```typescript
// src/services/resilience/ServiceCircuitBreakers.ts
export class ServiceCircuitBreakers {
  private readonly breakers = new Map<string, CircuitBreaker>();
  
  constructor(private readonly config: CircuitBreakerConfig) {
    // Initialize breakers for all external services
    this.initializeBreakers();
  }
  
  private initializeBreakers(): void {
    // Gemini API
    this.addBreaker('gemini', {
      failureThreshold: 3,
      resetTimeout: 60000,
      monitoringPeriod: 300000,
      halfOpenMaxAttempts: 2
    });
    
    // Database
    this.addBreaker('database', {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000,
      halfOpenMaxAttempts: 3
    });
    
    // Redis/Cache
    this.addBreaker('cache', {
      failureThreshold: 10,
      resetTimeout: 15000,
      monitoringPeriod: 60000,
      halfOpenMaxAttempts: 5
    });
    
    // External APIs
    this.addBreaker('external_api', {
      failureThreshold: 5,
      resetTimeout: 45000,
      monitoringPeriod: 120000,
      halfOpenMaxAttempts: 3
    });
  }
  
  private addBreaker(name: string, options: CircuitBreakerOptions): void {
    this.breakers.set(name, new CircuitBreaker(name, options));
  }
  
  async executeWithBreaker<T>(
    service: string,
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    const breaker = this.breakers.get(service);
    if (!breaker) {
      logger.warn('No circuit breaker for service', { service });
      return operation();
    }
    
    return breaker.execute(operation, fallback);
  }
  
  // Convenience methods for common services
  async gemini<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.executeWithBreaker('gemini', operation, fallback);
  }
  
  async database<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.executeWithBreaker('database', operation, fallback);
  }
  
  async cache<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.executeWithBreaker('cache', operation, fallback);
  }
}
```

**Success Criteria**:
- All external services have circuit breakers
- Proper fallback mechanisms
- Health monitoring integration
- No cascading failures

### Agent 4: Resource Cleanup and Lifecycle Management
**Priority**: HIGH
**Target**: Zero resource leaks, proper cleanup
**Files**: src/core/*, src/services/base/*

**Task Details**:

1. **Service Initialization Rollback**:
```typescript
// src/core/ServiceInitializer.ts
export class ServiceInitializer {
  private initializationStack: Array<{
    name: string;
    cleanup: () => Promise<void>;
  }> = [];
  
  async initializeServices(
    serviceDefinitions: ServiceDefinition[]
  ): Promise<ServiceRegistry> {
    const registry = new ServiceRegistry();
    const startTime = Date.now();
    
    try {
      // Sort by dependencies
      const sorted = this.topologicalSort(serviceDefinitions);
      
      for (const definition of sorted) {
        const serviceStart = Date.now();
        
        try {
          logger.info(`Initializing service: ${definition.name}`);
          
          // Create service instance
          const instance = await this.createInstance(definition);
          
          // Initialize with timeout
          await withTimeout(
            instance.initialize(),
            definition.initTimeout || 30000,
            {
              message: `Service ${definition.name} initialization timeout`,
              context: { service: definition.name }
            }
          );
          
          // Register cleanup
          this.initializationStack.push({
            name: definition.name,
            cleanup: async () => {
              try {
                await instance.shutdown();
              } catch (error) {
                logger.error(`Failed to shutdown ${definition.name}`, error);
              }
            }
          });
          
          // Add to registry
          registry.register(definition.name, instance);
          
          const duration = Date.now() - serviceStart;
          logger.info(`Service ${definition.name} initialized`, { duration });
          
        } catch (error) {
          const enrichedError = enrichError(error as Error, {
            service: definition.name,
            phase: 'initialization',
            duration: Date.now() - serviceStart
          });
          
          logger.error(`Failed to initialize ${definition.name}`, enrichedError);
          
          // Rollback all initialized services
          await this.rollback();
          
          throw enrichedError;
        }
      }
      
      const totalDuration = Date.now() - startTime;
      logger.info('All services initialized successfully', {
        count: sorted.length,
        duration: totalDuration
      });
      
      return registry;
      
    } catch (error) {
      logger.error('Service initialization failed, performing rollback', error);
      throw error;
    }
  }
  
  private async rollback(): Promise<void> {
    logger.info('Starting initialization rollback', {
      servicesInitialized: this.initializationStack.length
    });
    
    // Rollback in reverse order
    const stack = [...this.initializationStack].reverse();
    this.initializationStack = [];
    
    for (const { name, cleanup } of stack) {
      try {
        logger.info(`Rolling back service: ${name}`);
        await withTimeout(cleanup(), 10000, {
          message: `Rollback timeout for ${name}`
        });
      } catch (error) {
        logger.error(`Rollback failed for ${name}`, error);
        // Continue with other rollbacks
      }
    }
    
    logger.info('Initialization rollback completed');
  }
  
  async shutdown(registry: ServiceRegistry): Promise<void> {
    const services = registry.getAllServices();
    const shutdownOrder = [...services].reverse(); // Reverse of init order
    
    logger.info('Starting graceful shutdown', {
      serviceCount: shutdownOrder.length
    });
    
    const shutdownPromises = shutdownOrder.map(async ([name, service]) => {
      try {
        await withTimeout(
          service.shutdown(),
          15000,
          {
            message: `Service ${name} shutdown timeout`,
            context: { service: name }
          }
        );
        logger.info(`Service ${name} shut down successfully`);
      } catch (error) {
        logger.error(`Failed to shutdown service ${name}`, error);
      }
    });
    
    await Promise.allSettled(shutdownPromises);
    logger.info('Graceful shutdown completed');
  }
}
```

2. **Resource Tracking and Cleanup**:
```typescript
// src/utils/ResourceManager.ts
export interface ManagedResource {
  type: string;
  id: string;
  cleanup: () => Promise<void> | void;
  metadata?: Record<string, any>;
}

export class ResourceManager {
  private resources = new Map<string, ManagedResource>();
  private cleanupInProgress = false;
  
  register(resource: ManagedResource): void {
    const key = `${resource.type}:${resource.id}`;
    
    if (this.resources.has(key)) {
      logger.warn('Resource already registered', {
        type: resource.type,
        id: resource.id
      });
    }
    
    this.resources.set(key, resource);
    logger.debug('Resource registered', {
      type: resource.type,
      id: resource.id,
      total: this.resources.size
    });
  }
  
  unregister(type: string, id: string): void {
    const key = `${type}:${id}`;
    this.resources.delete(key);
  }
  
  async cleanup(type?: string): Promise<void> {
    if (this.cleanupInProgress) {
      logger.warn('Cleanup already in progress');
      return;
    }
    
    this.cleanupInProgress = true;
    
    try {
      const toCleanup = type
        ? Array.from(this.resources.values()).filter(r => r.type === type)
        : Array.from(this.resources.values());
      
      logger.info('Starting resource cleanup', {
        type: type || 'all',
        count: toCleanup.length
      });
      
      const results = await Promise.allSettled(
        toCleanup.map(async (resource) => {
          try {
            await Promise.resolve(resource.cleanup());
            this.unregister(resource.type, resource.id);
            return { success: true, resource };
          } catch (error) {
            logger.error('Resource cleanup failed', {
              type: resource.type,
              id: resource.id,
              error
            });
            return { success: false, resource, error };
          }
        })
      );
      
      const failed = results.filter(r => 
        r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
      );
      
      if (failed.length > 0) {
        logger.error('Some resources failed to cleanup', {
          failed: failed.length,
          total: toCleanup.length
        });
      }
      
    } finally {
      this.cleanupInProgress = false;
    }
  }
  
  // Automatic cleanup for common resources
  registerInterval(id: string, interval: NodeJS.Timeout): void {
    this.register({
      type: 'interval',
      id,
      cleanup: () => clearInterval(interval)
    });
  }
  
  registerTimeout(id: string, timeout: NodeJS.Timeout): void {
    this.register({
      type: 'timeout',
      id,
      cleanup: () => clearTimeout(timeout),
      metadata: { createdAt: Date.now() }
    });
  }
  
  registerEventListener(
    target: EventTarget,
    event: string,
    listener: EventListener,
    id: string = `${event}_${Date.now()}`
  ): void {
    this.register({
      type: 'event_listener',
      id,
      cleanup: () => target.removeEventListener(event, listener),
      metadata: { target: target.constructor.name, event }
    });
  }
  
  getResourceStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const resource of this.resources.values()) {
      stats[resource.type] = (stats[resource.type] || 0) + 1;
    }
    
    return stats;
  }
}

// Global resource manager
export const globalResourceManager = new ResourceManager();

// Cleanup on process exit
process.on('exit', () => {
  globalResourceManager.cleanup().catch(console.error);
});
```

3. **Enhanced Base Service with Lifecycle**:
```typescript
// src/services/base/BaseService.ts
export abstract class BaseService {
  protected readonly resources = new ResourceManager();
  protected initPromise?: Promise<void>;
  protected shutdownPromise?: Promise<void>;
  protected state: ServiceState = ServiceState.CREATED;
  
  async initialize(): Promise<void> {
    if (this.state !== ServiceState.CREATED) {
      throw new Error(`Cannot initialize service in state ${this.state}`);
    }
    
    this.state = ServiceState.INITIALIZING;
    
    try {
      // Run initialization
      this.initPromise = this.performInitialization();
      await this.initPromise;
      
      this.state = ServiceState.READY;
      logger.info(`${this.constructor.name} initialized successfully`);
      
    } catch (error) {
      this.state = ServiceState.FAILED;
      
      // Cleanup any partial initialization
      await this.emergencyCleanup();
      
      throw enrichError(error as Error, {
        service: this.constructor.name,
        phase: 'initialization'
      });
    }
  }
  
  async shutdown(): Promise<void> {
    if (this.state === ServiceState.SHUTDOWN) {
      return this.shutdownPromise!;
    }
    
    if (this.state !== ServiceState.READY && this.state !== ServiceState.FAILED) {
      logger.warn(`Shutting down service in unexpected state: ${this.state}`);
    }
    
    this.state = ServiceState.SHUTTING_DOWN;
    
    this.shutdownPromise = this.performShutdown();
    
    try {
      await this.shutdownPromise;
      this.state = ServiceState.SHUTDOWN;
      logger.info(`${this.constructor.name} shut down successfully`);
    } catch (error) {
      logger.error(`${this.constructor.name} shutdown error`, error);
      throw error;
    }
  }
  
  private async performShutdown(): Promise<void> {
    // Stop accepting new work
    this.stopAcceptingWork();
    
    // Wait for ongoing operations
    await this.waitForOngoingOperations();
    
    // Clean up resources
    await this.resources.cleanup();
    
    // Service-specific cleanup
    await this.onShutdown();
  }
  
  protected createInterval(
    callback: () => void | Promise<void>,
    interval: number,
    name: string
  ): void {
    const intervalId = setInterval(async () => {
      if (this.state !== ServiceState.READY) {
        return; // Skip if not ready
      }
      
      try {
        await Promise.resolve(callback());
      } catch (error) {
        logger.error(`Interval ${name} error`, error);
      }
    }, interval);
    
    this.resources.registerInterval(name, intervalId);
  }
  
  protected abstract onInitialize(): Promise<void>;
  protected abstract onShutdown(): Promise<void>;
  protected abstract stopAcceptingWork(): void;
  protected abstract waitForOngoingOperations(): Promise<void>;
  
  private async emergencyCleanup(): Promise<void> {
    try {
      await this.resources.cleanup();
    } catch (error) {
      logger.error('Emergency cleanup failed', error);
    }
  }
}
```

**Success Criteria**:
- Clean rollback on initialization failure
- All resources tracked and cleaned
- Graceful shutdown procedures
- No dangling resources

### Agent 5: Error Response Standardization
**Priority**: MEDIUM
**Target**: Consistent error handling across services
**Files**: src/services/interfaces/*, src/utils/*

**Task Details**:

1. **Standardized Error Response Types**:
```typescript
// src/services/interfaces/ServiceResponses.ts
export enum ServiceErrorCode {
  // Client errors (4xx equivalent)
  INVALID_INPUT = 'INVALID_INPUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Server errors (5xx equivalent)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  
  // Business logic errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  PRECONDITION_FAILED = 'PRECONDITION_FAILED',
  CONFLICT = 'CONFLICT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED'
}

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  userMessage: string;
  details?: Record<string, any>;
  retryable: boolean;
  retryAfter?: number; // milliseconds
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  requestId?: string;
  service: string;
  operation: string;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceError;
  metadata?: {
    duration: number;
    retryCount?: number;
    fromCache?: boolean;
    fallbackUsed?: boolean;
    circuitBreakerState?: string;
  };
}

export class ServiceResponse {
  static success<T>(
    data: T,
    metadata?: ServiceResult<T>['metadata']
  ): ServiceResult<T> {
    return {
      success: true,
      data,
      metadata: {
        duration: 0,
        ...metadata
      }
    };
  }
  
  static error<T>(
    error: Partial<ServiceError> & Pick<ServiceError, 'code' | 'message' | 'service' | 'operation'>
  ): ServiceResult<T> {
    return {
      success: false,
      error: {
        userMessage: getUserFriendlyMessage({
          message: error.message,
          category: this.mapCodeToCategory(error.code)
        } as any),
        retryable: this.isRetryableCode(error.code),
        severity: error.severity || 'medium',
        timestamp: Date.now(),
        ...error
      }
    };
  }
  
  private static mapCodeToCategory(code: ServiceErrorCode): ErrorCategory {
    const mapping: Record<ServiceErrorCode, ErrorCategory> = {
      [ServiceErrorCode.INVALID_INPUT]: ErrorCategory.VALIDATION,
      [ServiceErrorCode.UNAUTHORIZED]: ErrorCategory.AUTHORIZATION,
      [ServiceErrorCode.FORBIDDEN]: ErrorCategory.AUTHORIZATION,
      [ServiceErrorCode.NOT_FOUND]: ErrorCategory.NOT_FOUND,
      [ServiceErrorCode.RATE_LIMITED]: ErrorCategory.RATE_LIMIT,
      [ServiceErrorCode.INTERNAL_ERROR]: ErrorCategory.INTERNAL,
      [ServiceErrorCode.SERVICE_UNAVAILABLE]: ErrorCategory.EXTERNAL_SERVICE,
      [ServiceErrorCode.TIMEOUT]: ErrorCategory.TIMEOUT,
      [ServiceErrorCode.DEPENDENCY_ERROR]: ErrorCategory.EXTERNAL_SERVICE,
      [ServiceErrorCode.VALIDATION_FAILED]: ErrorCategory.VALIDATION,
      [ServiceErrorCode.PRECONDITION_FAILED]: ErrorCategory.VALIDATION,
      [ServiceErrorCode.CONFLICT]: ErrorCategory.CONFLICT,
      [ServiceErrorCode.QUOTA_EXCEEDED]: ErrorCategory.RATE_LIMIT
    };
    
    return mapping[code] || ErrorCategory.UNKNOWN;
  }
  
  private static isRetryableCode(code: ServiceErrorCode): boolean {
    const retryableCodes = new Set([
      ServiceErrorCode.SERVICE_UNAVAILABLE,
      ServiceErrorCode.TIMEOUT,
      ServiceErrorCode.DEPENDENCY_ERROR,
      ServiceErrorCode.INTERNAL_ERROR
    ]);
    
    return retryableCodes.has(code);
  }
}
```

2. **Service Method Wrapper with Standardized Responses**:
```typescript
// src/utils/ServiceMethodWrapper.ts
export function standardizedServiceMethod<T extends (...args: any[]) => Promise<any>>(
  method: T,
  service: string,
  operation: string,
  options: {
    timeout?: number;
    fallback?: (...args: Parameters<T>) => Promise<any>;
    errorMapping?: (error: Error) => ServiceErrorCode;
  } = {}
): (...args: Parameters<T>) => Promise<ServiceResult<Awaited<ReturnType<T>>>> {
  return async (...args: Parameters<T>) => {
    const startTime = Date.now();
    const requestId = `${service}_${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Execute with timeout
      let result = method(...args);
      if (options.timeout) {
        result = withTimeout(result, options.timeout, {
          context: { service, operation, requestId }
        });
      }
      
      const data = await result;
      
      return ServiceResponse.success(data, {
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      const enrichedError = enrichError(error as Error, {
        service,
        operation,
        requestId,
        args: args.map(arg => typeof arg === 'object' ? '[Object]' : arg)
      });
      
      // Try fallback if available
      if (options.fallback && isRetryableError(enrichedError)) {
        try {
          const fallbackResult = await options.fallback(...args);
          return ServiceResponse.success(fallbackResult, {
            duration: Date.now() - startTime,
            fallbackUsed: true
          });
        } catch (fallbackError) {
          logger.error('Fallback also failed', {
            service,
            operation,
            originalError: enrichedError,
            fallbackError
          });
        }
      }
      
      // Map to service error code
      const errorCode = options.errorMapping
        ? options.errorMapping(enrichedError)
        : this.defaultErrorMapping(enrichedError);
      
      return ServiceResponse.error({
        code: errorCode,
        message: enrichedError.message,
        service,
        operation,
        details: {
          originalError: enrichedError.name,
          stack: process.env.NODE_ENV === 'development' ? enrichedError.stack : undefined,
          ...enrichedError.context
        },
        requestId
      });
    }
  };
}

// Usage in services
class UserService {
  getUserPreferences = standardizedServiceMethod(
    async (userId: string) => {
      // Original implementation
      return this.database.query(...);
    },
    'UserService',
    'getUserPreferences',
    {
      timeout: 5000,
      fallback: async (userId) => this.getDefaultPreferences(userId),
      errorMapping: (error) => {
        if (error.message.includes('not found')) {
          return ServiceErrorCode.NOT_FOUND;
        }
        return ServiceErrorCode.INTERNAL_ERROR;
      }
    }
  );
}
```

3. **Error Aggregation and Reporting**:
```typescript
// src/services/ErrorAggregator.ts
export class ErrorAggregator {
  private errors = new Map<string, AggregatedError>();
  private readonly AGGREGATION_WINDOW = 60000; // 1 minute
  
  recordError(error: ServiceError): void {
    const key = `${error.service}:${error.operation}:${error.code}`;
    
    let aggregated = this.errors.get(key);
    if (!aggregated || Date.now() - aggregated.firstSeen > this.AGGREGATION_WINDOW) {
      aggregated = {
        service: error.service,
        operation: error.operation,
        code: error.code,
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        samples: [],
        userIds: new Set(),
        requestIds: []
      };
      this.errors.set(key, aggregated);
    }
    
    aggregated.count++;
    aggregated.lastSeen = Date.now();
    
    if (aggregated.samples.length < 5) {
      aggregated.samples.push(error);
    }
    
    if (error.details?.userId) {
      aggregated.userIds.add(error.details.userId);
    }
    
    if (error.requestId) {
      aggregated.requestIds.push(error.requestId);
    }
  }
  
  getReport(): ErrorReport {
    const now = Date.now();
    const report: ErrorReport = {
      timestamp: now,
      errors: [],
      summary: {
        total: 0,
        byService: {},
        bySeverity: {},
        topErrors: []
      }
    };
    
    for (const [key, aggregated] of this.errors) {
      if (now - aggregated.lastSeen > this.AGGREGATION_WINDOW) {
        this.errors.delete(key);
        continue;
      }
      
      report.errors.push({
        ...aggregated,
        affectedUsers: aggregated.userIds.size,
        errorRate: aggregated.count / ((aggregated.lastSeen - aggregated.firstSeen) / 1000)
      });
      
      report.summary.total += aggregated.count;
      report.summary.byService[aggregated.service] = 
        (report.summary.byService[aggregated.service] || 0) + aggregated.count;
    }
    
    // Sort by count for top errors
    report.summary.topErrors = report.errors
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(e => ({
        key: `${e.service}:${e.operation}:${e.code}`,
        count: e.count,
        errorRate: e.errorRate
      }));
    
    return report;
  }
}
```

**Success Criteria**:
- All services return standardized responses
- Consistent error codes across services
- Error aggregation for monitoring
- Clear user-friendly messages

### Agent 6: Distributed Tracing Implementation
**Priority**: MEDIUM
**Target**: Full request tracing across service boundaries
**Files**: src/utils/tracing/*, src/middleware/*

**Task Details**:

1. **Request Context and Tracing**:
```typescript
// src/utils/tracing/RequestContext.ts
export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, any>;
  logs: Array<{
    timestamp: number;
    message: string;
    level: string;
    fields?: Record<string, any>;
  }>;
  status: 'in_progress' | 'success' | 'error';
  error?: Error;
}

export class RequestContext {
  public readonly traceId: string;
  public readonly startTime: number;
  private spans = new Map<string, TraceSpan>();
  private currentSpan?: TraceSpan;
  
  constructor(
    traceId?: string,
    public readonly metadata: Record<string, any> = {}
  ) {
    this.traceId = traceId || this.generateTraceId();
    this.startTime = Date.now();
    
    // Create root span
    this.startSpan('root', {
      userId: metadata.userId,
      guildId: metadata.guildId,
      source: metadata.source
    });
  }
  
  private generateTraceId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  startSpan(
    operationName: string,
    tags: Record<string, any> = {}
  ): TraceSpan {
    const spanId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const span: TraceSpan = {
      spanId,
      parentSpanId: this.currentSpan?.spanId,
      operationName,
      startTime: Date.now(),
      tags,
      logs: [],
      status: 'in_progress'
    };
    
    this.spans.set(spanId, span);
    this.currentSpan = span;
    
    return span;
  }
  
  endSpan(spanId: string, error?: Error): void {
    const span = this.spans.get(spanId);
    if (!span) {
      logger.warn('Attempted to end non-existent span', { spanId });
      return;
    }
    
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = error ? 'error' : 'success';
    span.error = error;
    
    // Update current span to parent
    if (this.currentSpan?.spanId === spanId && span.parentSpanId) {
      this.currentSpan = this.spans.get(span.parentSpanId);
    }
  }
  
  addLog(
    message: string,
    level: string = 'info',
    fields?: Record<string, any>
  ): void {
    if (!this.currentSpan) {
      logger.warn('No active span for logging');
      return;
    }
    
    this.currentSpan.logs.push({
      timestamp: Date.now(),
      message,
      level,
      fields
    });
  }
  
  addTags(tags: Record<string, any>): void {
    if (!this.currentSpan) {
      logger.warn('No active span for tags');
      return;
    }
    
    Object.assign(this.currentSpan.tags, tags);
  }
  
  getTrace(): {
    traceId: string;
    duration: number;
    spans: TraceSpan[];
    metadata: Record<string, any>;
  } {
    return {
      traceId: this.traceId,
      duration: Date.now() - this.startTime,
      spans: Array.from(this.spans.values()),
      metadata: this.metadata
    };
  }
  
  // AsyncLocalStorage integration
  static current(): RequestContext | undefined {
    return asyncLocalStorage.getStore()?.context;
  }
  
  runWithContext<T>(fn: () => T): T {
    return asyncLocalStorage.run({ context: this }, fn);
  }
}

// Async context storage
import { AsyncLocalStorage } from 'async_hooks';
export const asyncLocalStorage = new AsyncLocalStorage<{ context: RequestContext }>();
```

2. **Service Integration with Tracing**:
```typescript
// src/middleware/tracingMiddleware.ts
export function withTracing<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operationName: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const context = RequestContext.current();
    if (!context) {
      // No active context, run without tracing
      return fn(...args);
    }
    
    const span = context.startSpan(operationName);
    
    try {
      const result = await fn(...args);
      context.endSpan(span.spanId);
      return result;
    } catch (error) {
      context.endSpan(span.spanId, error as Error);
      throw error;
    }
  }) as T;
}

// Auto-instrument service methods
export function instrumentService<T extends object>(
  service: T,
  serviceName: string
): T {
  const instrumented = Object.create(Object.getPrototypeOf(service));
  
  for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(service))) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(service), key);
    
    if (descriptor && typeof descriptor.value === 'function' && key !== 'constructor') {
      instrumented[key] = withTracing(
        descriptor.value.bind(service),
        `${serviceName}.${key}`
      );
    }
  }
  
  return instrumented;
}

// Usage in services
class InstrumentedGeminiService extends GeminiService {
  constructor(...args: any[]) {
    super(...args);
    return instrumentService(this, 'GeminiService');
  }
}
```

3. **Trace Collection and Export**:
```typescript
// src/services/tracing/TraceCollector.ts
export class TraceCollector {
  private traces = new Map<string, RequestContext>();
  private readonly MAX_TRACES = 1000;
  private readonly TRACE_TTL = 3600000; // 1 hour
  
  collectTrace(context: RequestContext): void {
    const trace = context.getTrace();
    
    // Store trace
    this.traces.set(trace.traceId, context);
    
    // Analyze for issues
    this.analyzeTrace(trace);
    
    // Cleanup old traces
    if (this.traces.size > this.MAX_TRACES) {
      this.cleanupOldTraces();
    }
  }
  
  private analyzeTrace(trace: any): void {
    // Check for slow operations
    const slowSpans = trace.spans.filter(s => s.duration && s.duration > 1000);
    if (slowSpans.length > 0) {
      logger.warn('Slow operations detected', {
        traceId: trace.traceId,
        slowSpans: slowSpans.map(s => ({
          operation: s.operationName,
          duration: s.duration
        }))
      });
    }
    
    // Check for errors
    const errorSpans = trace.spans.filter(s => s.status === 'error');
    if (errorSpans.length > 0) {
      logger.error('Errors in trace', {
        traceId: trace.traceId,
        errors: errorSpans.map(s => ({
          operation: s.operationName,
          error: s.error?.message
        }))
      });
    }
    
    // Check for deep nesting (possible infinite loops)
    const maxDepth = this.calculateMaxDepth(trace.spans);
    if (maxDepth > 20) {
      logger.warn('Deep span nesting detected', {
        traceId: trace.traceId,
        maxDepth
      });
    }
  }
  
  private calculateMaxDepth(spans: TraceSpan[]): number {
    const spanMap = new Map(spans.map(s => [s.spanId, s]));
    let maxDepth = 0;
    
    for (const span of spans) {
      let depth = 0;
      let current = span;
      
      while (current.parentSpanId && spanMap.has(current.parentSpanId)) {
        depth++;
        current = spanMap.get(current.parentSpanId)!;
      }
      
      maxDepth = Math.max(maxDepth, depth);
    }
    
    return maxDepth;
  }
  
  getTraceReport(traceId: string): any {
    const context = this.traces.get(traceId);
    if (!context) {
      return null;
    }
    
    const trace = context.getTrace();
    
    return {
      ...trace,
      summary: {
        totalDuration: trace.duration,
        spanCount: trace.spans.length,
        errorCount: trace.spans.filter(s => s.status === 'error').length,
        slowestOperation: trace.spans
          .filter(s => s.duration)
          .sort((a, b) => b.duration! - a.duration!)[0],
        timeline: this.generateTimeline(trace.spans)
      }
    };
  }
  
  private generateTimeline(spans: TraceSpan[]): any[] {
    return spans
      .sort((a, b) => a.startTime - b.startTime)
      .map(span => ({
        operation: span.operationName,
        start: span.startTime - spans[0].startTime,
        duration: span.duration || 0,
        status: span.status
      }));
  }
}
```

**Success Criteria**:
- Full request tracing implemented
- Cross-service correlation working
- Performance insights available
- Error tracking enhanced

### Agent 7: Chaos Engineering and Testing
**Priority**: HIGH
**Target**: Validate all error handling improvements
**Files**: tests/chaos/*, tests/resilience/*

**Task Details**:

1. **Chaos Testing Framework**:
```typescript
// tests/chaos/ChaosTestFramework.ts
export interface ChaosScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  execute: () => Promise<void>;
  verify: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export class ChaosTestFramework {
  private scenarios: ChaosScenario[] = [];
  
  addScenario(scenario: ChaosScenario): void {
    this.scenarios.push(scenario);
  }
  
  async runScenario(name: string): Promise<TestResult> {
    const scenario = this.scenarios.find(s => s.name === name);
    if (!scenario) {
      throw new Error(`Scenario ${name} not found`);
    }
    
    const result: TestResult = {
      scenario: name,
      startTime: Date.now(),
      steps: []
    };
    
    try {
      // Setup
      await this.runStep(scenario.setup, 'setup', result);
      
      // Execute chaos
      await this.runStep(scenario.execute, 'execute', result);
      
      // Wait for system to handle chaos
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verify system behavior
      await this.runStep(scenario.verify, 'verify', result);
      
      result.success = true;
      
    } catch (error) {
      result.success = false;
      result.error = error as Error;
    } finally {
      // Always cleanup
      await this.runStep(scenario.cleanup, 'cleanup', result);
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
    }
    
    return result;
  }
  
  private async runStep(
    step: () => Promise<void>,
    name: string,
    result: TestResult
  ): Promise<void> {
    const stepResult = {
      name,
      startTime: Date.now(),
      success: false
    };
    
    try {
      await step();
      stepResult.success = true;
    } catch (error) {
      stepResult.error = error as Error;
      throw error;
    } finally {
      stepResult.endTime = Date.now();
      stepResult.duration = stepResult.endTime - stepResult.startTime;
      result.steps.push(stepResult);
    }
  }
}
```

2. **Specific Chaos Scenarios**:
```typescript
// tests/chaos/scenarios/ServiceFailures.ts
export const serviceFailureScenarios: ChaosScenario[] = [
  {
    name: 'gemini_api_timeout',
    description: 'Simulates Gemini API timeouts',
    setup: async () => {
      // Mock Gemini to delay responses
      jest.spyOn(geminiService, 'generateContent').mockImplementation(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 40000)); // 40s delay
          throw new Error('Timeout');
        }
      );
    },
    execute: async () => {
      // Send multiple messages
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          bot.handleMessage({
            content: `Test message ${i}`,
            author: { id: `test_user_${i}` }
          })
        );
      }
      await Promise.allSettled(promises);
    },
    verify: async () => {
      // Check circuit breaker opened
      const status = gracefulDegradation.getStatus();
      expect(status.circuitBreakers.get('gemini').state).toBe('OPEN');
      
      // Check fallback responses sent
      const metrics = await analyticsManager.getMetrics();
      expect(metrics.fallbackResponses).toBeGreaterThan(0);
      
      // Check no unhandled errors
      expect(metrics.unhandledErrors).toBe(0);
    },
    cleanup: async () => {
      jest.restoreAllMocks();
    }
  },
  
  {
    name: 'discord_api_degradation',
    description: 'Simulates Discord API degradation',
    setup: async () => {
      let callCount = 0;
      jest.spyOn(discordClient, 'send').mockImplementation(async () => {
        callCount++;
        if (callCount % 3 === 0) {
          throw new Error('Discord API Error: 503 Service Unavailable');
        }
        return mockMessage;
      });
    },
    execute: async () => {
      // Trigger high message volume
      for (let i = 0; i < 20; i++) {
        await bot.handleMessage(createMockMessage());
      }
    },
    verify: async () => {
      // Check retry mechanism worked
      const retryMetrics = await retryHandler.getMetrics();
      expect(retryMetrics.successfulRetries).toBeGreaterThan(0);
      
      // Check messages queued for later
      const queueSize = await gracefulDegradation.getQueueSize();
      expect(queueSize).toBeGreaterThan(0);
    },
    cleanup: async () => {
      jest.restoreAllMocks();
      await gracefulDegradation.clearQueue();
    }
  },
  
  {
    name: 'memory_pressure',
    description: 'Simulates high memory usage',
    setup: async () => {
      // Create large objects to consume memory
      global.memoryBloat = [];
      for (let i = 0; i < 100; i++) {
        global.memoryBloat.push(new Array(1000000).fill('x'));
      }
    },
    execute: async () => {
      // Continue normal operations under memory pressure
      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(bot.handleMessage(createMockMessage()));
        operations.push(contextManager.buildContext(`user_${i}`, 'server_1'));
      }
      await Promise.allSettled(operations);
    },
    verify: async () => {
      // Check memory cleanup triggered
      const contextStats = contextManager.getStats();
      expect(contextStats.cacheSize).toBeLessThan(100);
      
      // Check system still responsive
      const response = await bot.handleMessage(createMockMessage());
      expect(response).toBeDefined();
    },
    cleanup: async () => {
      delete global.memoryBloat;
      global.gc && global.gc(); // Force garbage collection if available
    }
  },
  
  {
    name: 'cascading_failures',
    description: 'Simulates cascading service failures',
    setup: async () => {
      // Make cache fail
      jest.spyOn(cacheManager, 'get').mockRejectedValue(new Error('Cache error'));
      jest.spyOn(cacheManager, 'set').mockRejectedValue(new Error('Cache error'));
      
      // Make database slow
      jest.spyOn(database, 'query').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return [];
      });
    },
    execute: async () => {
      // Send burst of requests
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(bot.handleCommand({
          commandName: 'help',
          user: { id: `user_${i}` }
        }));
      }
      await Promise.allSettled(requests);
    },
    verify: async () => {
      // Check circuit breakers protected system
      const cacheBreaker = serviceCircuitBreakers.getStatus('cache');
      expect(cacheBreaker.state).toBe('OPEN');
      
      // Check system degraded gracefully
      const health = await healthMonitor.getHealth();
      expect(health.status).toBe('degraded');
      expect(health.services.cache).toBe('unavailable');
      
      // But core functionality still works
      expect(health.services.discord).toBe('healthy');
    },
    cleanup: async () => {
      jest.restoreAllMocks();
    }
  }
];
```

3. **Resilience Test Suite**:
```typescript
// tests/resilience/ResilienceTests.ts
describe('System Resilience', () => {
  const chaosFramework = new ChaosTestFramework();
  
  beforeAll(() => {
    // Load all scenarios
    serviceFailureScenarios.forEach(scenario => 
      chaosFramework.addScenario(scenario)
    );
  });
  
  describe('Service Failures', () => {
    test('handles Gemini API timeouts gracefully', async () => {
      const result = await chaosFramework.runScenario('gemini_api_timeout');
      expect(result.success).toBe(true);
    }, 60000);
    
    test('handles Discord API degradation', async () => {
      const result = await chaosFramework.runScenario('discord_api_degradation');
      expect(result.success).toBe(true);
    }, 30000);
  });
  
  describe('Resource Constraints', () => {
    test('handles memory pressure', async () => {
      const result = await chaosFramework.runScenario('memory_pressure');
      expect(result.success).toBe(true);
    }, 45000);
  });
  
  describe('Cascading Failures', () => {
    test('prevents cascade through circuit breakers', async () => {
      const result = await chaosFramework.runScenario('cascading_failures');
      expect(result.success).toBe(true);
    }, 60000);
  });
  
  describe('Error Recovery', () => {
    test('recovers from transient errors', async () => {
      let errorCount = 0;
      const mockService = {
        call: jest.fn().mockImplementation(async () => {
          errorCount++;
          if (errorCount < 3) {
            throw new Error('Transient error');
          }
          return 'Success';
        })
      };
      
      const result = await retryHandler.execute(
        () => mockService.call(),
        { maxRetries: 5, retryDelay: 100 }
      );
      
      expect(result).toBe('Success');
      expect(mockService.call).toHaveBeenCalledTimes(3);
    });
    
    test('handles permanent failures appropriately', async () => {
      const mockService = {
        call: jest.fn().mockRejectedValue(new Error('Permanent failure'))
      };
      
      await expect(
        retryHandler.execute(
          () => mockService.call(),
          { maxRetries: 3, retryDelay: 100 }
        )
      ).rejects.toThrow('Permanent failure');
      
      expect(mockService.call).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });
});
```

4. **Load Testing with Error Injection**:
```typescript
// tests/load/LoadTestWithErrors.ts
export async function runLoadTestWithErrors(config: LoadTestConfig) {
  const errorInjector = new ErrorInjector({
    errorRate: 0.1, // 10% error rate
    errorTypes: [
      { type: 'timeout', weight: 0.4 },
      { type: 'service_unavailable', weight: 0.3 },
      { type: 'rate_limit', weight: 0.2 },
      { type: 'internal_error', weight: 0.1 }
    ]
  });
  
  const results = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    recoveredRequests: 0,
    responseTimes: [] as number[],
    errorsByType: new Map<string, number>()
  };
  
  // Run load test with error injection
  const workers = await createWorkers(config.concurrentUsers);
  
  for (const worker of workers) {
    worker.on('message', (msg) => {
      results.totalRequests++;
      
      if (msg.success) {
        results.successfulRequests++;
      } else if (msg.recovered) {
        results.recoveredRequests++;
      } else {
        results.failedRequests++;
        const count = results.errorsByType.get(msg.errorType) || 0;
        results.errorsByType.set(msg.errorType, count + 1);
      }
      
      if (msg.responseTime) {
        results.responseTimes.push(msg.responseTime);
      }
    });
  }
  
  // Monitor system health during test
  const healthSnapshots = [];
  const healthInterval = setInterval(async () => {
    const health = await healthMonitor.getHealth();
    healthSnapshots.push({
      timestamp: Date.now(),
      ...health
    });
  }, 5000);
  
  // Run test
  await new Promise(resolve => setTimeout(resolve, config.duration));
  
  // Stop monitoring
  clearInterval(healthInterval);
  
  // Calculate resilience metrics
  const resilienceScore = calculateResilienceScore(results, healthSnapshots);
  
  return {
    ...results,
    resilienceScore,
    healthSnapshots,
    analysis: analyzeResults(results, healthSnapshots)
  };
}

function calculateResilienceScore(results: any, healthSnapshots: any[]): number {
  const recoveryRate = results.recoveredRequests / results.failedRequests;
  const availabilityRate = results.successfulRequests / results.totalRequests;
  const degradationHandling = healthSnapshots.filter(h => h.status === 'degraded').length > 0 ? 0.8 : 0.5;
  
  return (recoveryRate * 0.4 + availabilityRate * 0.4 + degradationHandling * 0.2) * 100;
}
```

**Success Criteria**:
- All chaos scenarios pass
- System recovers from failures
- No data loss during failures
- Graceful degradation verified

## Integration and Validation

### Daily Checkpoints
- Morning: Review overnight error logs
- Implement assigned error handling
- Run chaos tests locally
- Update progress in TODO system

### Final Integration (Day 7)
1. Run full chaos test suite
2. Perform load test with error injection
3. Validate all error paths covered
4. Generate resilience report

### Rollout Strategy
1. Enable enhanced error handling in dev
2. Run chaos tests for 24 hours
3. Monitor error rates and recovery
4. Gradual production deployment

## Success Metrics
- **Error Handling Coverage**: 100% of async operations
- **Circuit Breaker Coverage**: All external services
- **Recovery Success Rate**: > 95% for transient errors  
- **Resource Cleanup**: Zero leaks after 48 hours
- **Error Response Time**: < 100ms for error handling
- **Chaos Test Pass Rate**: 100%
- **Load Test Resilience Score**: > 85%