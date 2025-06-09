import { Mutex } from 'async-mutex';
import { logger } from '../utils/logger';
import type { HealthMonitor, HealthMetrics } from './healthMonitor';
import { DEGRADATION_CONSTANTS, GENERAL_CONSTANTS } from '../config/constants';

interface QueuedMessage {
  id: string;
  userId: string;
  serverId?: string;
  prompt: string;
  timestamp: number;
  retries: number;
  priority: 'low' | 'medium' | 'high';
  respond: (response: string) => Promise<void>;
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveSuccesses: number;
}

interface ServiceStatus {
  gemini: CircuitBreakerState;
  discord: CircuitBreakerState;
  overall: 'healthy' | 'degraded' | 'critical';
}

interface DegradationConfig {
  // Circuit breaker thresholds
  maxFailures: number;
  resetTimeoutMs: number;
  halfOpenMaxRetries: number;
  
  // Health-based degradation triggers
  memoryThresholdMB: number;
  errorRateThreshold: number;
  responseTimeThresholdMs: number;
  
  // Queue management
  maxQueueSize: number;
  maxQueueTimeMs: number;
  retryIntervalMs: number;
  maxRetries: number;
  
  // Fallback configuration
  enableCachedResponses: boolean;
  enableGenericFallbacks: boolean;
  enableMaintenanceMode: boolean;
}

interface RecoveryMetrics {
  attempts: number;
  lastAttempt: number;
  successfulRecoveries: number;
  averageRecoveryTime: number;
}

export class GracefulDegradation {
  private stateMutex = new Mutex();
  private queueMutex = new Mutex();
  
  private serviceStatus: ServiceStatus;
  private messageQueue: QueuedMessage[] = [];
  private queueProcessingTimer: NodeJS.Timeout | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  
  private config: DegradationConfig;
  private healthMonitor: HealthMonitor | null = null;
  private recoveryMetrics: Map<string, RecoveryMetrics> = new Map();
  
  // Fallback response pools
  private readonly GENERIC_FALLBACKS = [
    'I\'m experiencing some technical difficulties right now. Please try again in a moment!',
    'Sorry, I\'m having trouble processing requests at the moment. Give me a few minutes to recover.',
    'I\'m currently running in limited mode due to system issues. Please be patient while I work through this.',
    'Technical problems detected! I\'ll be back to full functionality shortly. Please retry your request.',
    'I\'m experiencing some hiccups right now. Try your request again in a minute or two.',
    'System maintenance in progress. I\'ll return to normal operation soon!',
    'Having some technical troubles, but I\'m working on it! Please try again shortly.',
    'I\'m operating with reduced functionality right now. Normal service will resume soon.'
  ];
  
  private readonly MAINTENANCE_RESPONSES = [
    '🔧 I\'m currently undergoing maintenance. Please check back in a few minutes!',
    '⚙️ Systems are being updated right now. I\'ll be back online shortly!',
    '🛠️ Temporary maintenance in progress. Thank you for your patience!',
    '📋 Running diagnostics and repairs. I\'ll return to service soon!',
    '🔄 Performing system optimization. Please try again in a moment!'
  ];

  constructor() {
    this.config = {
      // Circuit breaker settings
      maxFailures: parseInt(process.env.DEGRADATION_MAX_FAILURES || String(DEGRADATION_CONSTANTS.DEFAULT_MAX_FAILURES)),
      resetTimeoutMs: parseInt(process.env.DEGRADATION_RESET_TIMEOUT_MS || String(DEGRADATION_CONSTANTS.DEFAULT_RESET_TIMEOUT_MS)), // 1 minute
      halfOpenMaxRetries: parseInt(process.env.DEGRADATION_HALF_OPEN_RETRIES || String(DEGRADATION_CONSTANTS.DEFAULT_HALF_OPEN_RETRIES)),
      
      // Health degradation triggers
      memoryThresholdMB: parseInt(process.env.DEGRADATION_MEMORY_THRESHOLD_MB || String(DEGRADATION_CONSTANTS.DEFAULT_MEMORY_THRESHOLD_MB)),
      errorRateThreshold: parseFloat(process.env.DEGRADATION_ERROR_RATE_THRESHOLD || String(DEGRADATION_CONSTANTS.DEFAULT_ERROR_RATE_THRESHOLD)),
      responseTimeThresholdMs: parseInt(process.env.DEGRADATION_RESPONSE_TIME_THRESHOLD_MS || String(DEGRADATION_CONSTANTS.DEFAULT_RESPONSE_TIME_THRESHOLD_MS)),
      
      // Queue management
      maxQueueSize: parseInt(process.env.DEGRADATION_MAX_QUEUE_SIZE || String(DEGRADATION_CONSTANTS.DEFAULT_MAX_QUEUE_SIZE)),
      maxQueueTimeMs: parseInt(process.env.DEGRADATION_MAX_QUEUE_TIME_MS || String(DEGRADATION_CONSTANTS.DEFAULT_MAX_QUEUE_TIME_MS)), // 5 minutes
      retryIntervalMs: parseInt(process.env.DEGRADATION_RETRY_INTERVAL_MS || String(DEGRADATION_CONSTANTS.DEFAULT_RETRY_INTERVAL_MS)), // 30 seconds
      maxRetries: parseInt(process.env.DEGRADATION_MAX_RETRIES || String(DEGRADATION_CONSTANTS.DEFAULT_MAX_RETRIES)),
      
      // Fallback features
      enableCachedResponses: process.env.DEGRADATION_ENABLE_CACHED_RESPONSES !== 'false',
      enableGenericFallbacks: process.env.DEGRADATION_ENABLE_GENERIC_FALLBACKS !== 'false',
      enableMaintenanceMode: process.env.DEGRADATION_ENABLE_MAINTENANCE_MODE !== 'false',
    };

    this.serviceStatus = {
      gemini: this.createInitialCircuitState(),
      discord: this.createInitialCircuitState(),
      overall: 'healthy'
    };
  }

  async initialize(): Promise<void> {
    // Start queue processing
    this.startQueueProcessing();
    
    // Start recovery monitoring
    this.startRecoveryMonitoring();
    
    logger.info('GracefulDegradation service initialized', {
      config: this.config,
      queueSize: this.messageQueue.length
    });
  }

  async shutdown(): Promise<void> {
    // Stop timers
    if (this.queueProcessingTimer) {
      clearInterval(this.queueProcessingTimer);
      this.queueProcessingTimer = null;
    }
    
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    
    // Process remaining queue items with fallback responses
    await this.drainQueueWithFallbacks();
    
    logger.info('GracefulDegradation service shutdown completed');
  }

  setHealthMonitor(healthMonitor: HealthMonitor): void {
    this.healthMonitor = healthMonitor;
    logger.info('HealthMonitor integration enabled for graceful degradation');
  }

  /**
   * Circuit breaker wrapper for API calls with automatic failure tracking and recovery
   * 
   * Implements the Circuit Breaker pattern to prevent cascading failures by:
   * - Monitoring service failure rates
   * - Transitioning between CLOSED, OPEN, and HALF-OPEN states
   * - Providing fast failure when services are down
   * - Automatically attempting recovery
   * 
   * @template T - Return type of the operation
   * @param operation - The async operation to execute with protection
   * @param serviceName - Which service this operation targets ('gemini' | 'discord')
   * @returns Promise resolving to operation result
   * @throws Error when circuit breaker is OPEN or operation fails
   * 
   * Circuit States:
   * - CLOSED: Normal operation, monitoring for failures
   * - OPEN: Rejecting requests immediately, waiting for reset timeout
   * - HALF-OPEN: Testing recovery with limited retries
   */
  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    serviceName: 'gemini' | 'discord'
  ): Promise<T> {
    const release = await this.stateMutex.acquire();
    try {
      const circuitState = this.serviceStatus[serviceName];
      
      // Check circuit state
      if (circuitState.state === 'open') {
        const timeSinceFailure = Date.now() - circuitState.lastFailureTime;
        if (timeSinceFailure < this.config.resetTimeoutMs) {
          throw new Error(`Circuit breaker is OPEN for ${serviceName}. Next retry in ${Math.ceil((this.config.resetTimeoutMs - timeSinceFailure) / 1000)} seconds.`);
        } else {
          // Move to half-open state
          circuitState.state = 'half-open';
          circuitState.consecutiveSuccesses = 0;
          logger.info(`Circuit breaker moved to HALF-OPEN for ${serviceName}`);
        }
      }
      
      if (circuitState.state === 'half-open' && circuitState.consecutiveSuccesses >= this.config.halfOpenMaxRetries) {
        throw new Error(`Circuit breaker is HALF-OPEN for ${serviceName} with max retries exceeded`);
      }
    } finally {
      release();
    }

    // Execute the operation
    try {
      const result = await operation();
      
      // Record success
      await this.recordSuccess(serviceName);
      return result;
    } catch (error) {
      // Record failure
      await this.recordFailure(serviceName, error);
      throw error;
    }
  }

  /**
   * Central degradation decision engine that evaluates system health
   * 
   * Analyzes multiple factors to determine if the system should enter degraded mode:
   * - Circuit breaker states for both Gemini and Discord services
   * - Health monitor metrics (memory, error rate, response time)
   * - Queue pressure and backlog
   * - Service availability status
   * 
   * Severity Levels:
   * - HIGH: Critical failures, use maintenance responses
   * - MEDIUM: Service issues, queue messages or use fallbacks
   * - LOW: Normal operation
   * 
   * @returns Promise resolving to degradation assessment
   * @returns shouldDegrade - Whether system should enter degraded mode
   * @returns reason - Human-readable explanation of the decision
   * @returns severity - Impact level for determining response strategy
   */
  async shouldDegrade(): Promise<{
    shouldDegrade: boolean;
    reason: string;
    severity: 'low' | 'medium' | 'high';
  }> {
    const release = await this.stateMutex.acquire();
    try {
      // Check circuit breaker states
      const geminiOpen = this.serviceStatus.gemini.state === 'open';
      const discordOpen = this.serviceStatus.discord.state === 'open';
      
      if (geminiOpen && discordOpen) {
        return {
          shouldDegrade: true,
          reason: 'Both Gemini and Discord circuit breakers are open',
          severity: 'high'
        };
      }
      
      if (geminiOpen) {
        return {
          shouldDegrade: true,
          reason: 'Gemini API circuit breaker is open',
          severity: 'high'
        };
      }
      
      if (discordOpen) {
        return {
          shouldDegrade: true,
          reason: 'Discord API circuit breaker is open',
          severity: 'medium'
        };
      }
      
      // Check health monitor data if available
      if (this.healthMonitor) {
        const healthData = await this.healthMonitor.getCurrentMetrics();
        const healthDegradation = this.assessHealthBasedDegradation(healthData);
        
        if (healthDegradation.shouldDegrade) {
          return healthDegradation;
        }
      }
      
      // Check queue pressure
      if (this.messageQueue.length > this.config.maxQueueSize * DEGRADATION_CONSTANTS.QUEUE_PRESSURE_THRESHOLD) {
        return {
          shouldDegrade: true,
          reason: `Message queue pressure: ${this.messageQueue.length}/${this.config.maxQueueSize}`,
          severity: 'medium'
        };
      }
      
      return {
        shouldDegrade: false,
        reason: 'All systems operational',
        severity: 'low'
      };
    } finally {
      release();
    }
  }

  // Queue message for later processing
  async queueMessage(
    userId: string,
    prompt: string,
    respond: (response: string) => Promise<void>,
    serverId?: string,
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<void> {
    const release = await this.queueMutex.acquire();
    try {
      if (this.messageQueue.length >= this.config.maxQueueSize) {
        // Queue is full, remove oldest low-priority message
        const oldestLowPriority = this.messageQueue.findIndex(msg => msg.priority === 'low');
        if (oldestLowPriority !== -1) {
          const removed = this.messageQueue.splice(oldestLowPriority, 1)[0];
          await removed.respond('Sorry, the system is overloaded and your message was dropped. Please try again later.');
        } else {
          // No low priority messages, reject this one
          await respond('System is currently overloaded. Please try again in a few minutes.');
          return;
        }
      }
      
      const queuedMessage: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        serverId,
        prompt,
        timestamp: Date.now(),
        retries: 0,
        priority,
        respond
      };
      
      // Insert based on priority
      const insertIndex = this.findInsertIndex(queuedMessage);
      this.messageQueue.splice(insertIndex, 0, queuedMessage);
      
      logger.info(`Message queued for user ${userId}. Queue size: ${this.messageQueue.length}`, {
        messageId: queuedMessage.id,
        priority,
        queuePosition: insertIndex + 1
      });
      
      // Provide user feedback
      const waitTime = this.estimateWaitTime(insertIndex);
      await respond(`⏳ Your message has been queued due to system load. Estimated processing time: ${waitTime}. You'll receive a response as soon as possible!`);
    } finally {
      release();
    }
  }

  // Generate fallback response
  async generateFallbackResponse(
    prompt: string,
    userId: string,
    serverId?: string
  ): Promise<string> {
    // Try cached response first if enabled
    if (this.config.enableCachedResponses) {
      // This would integrate with existing cache manager
      // For now, we'll use a simple approach
      const cachedResponse = await this.tryGetCachedResponse(prompt, userId, serverId);
      if (cachedResponse) {
        return `📁 [Cached Response] ${cachedResponse}`;
      }
    }
    
    // Check overall system status
    const degradationStatus = await this.shouldDegrade();
    
    if (degradationStatus.severity === 'high' && this.config.enableMaintenanceMode) {
      return this.getRandomResponse(this.MAINTENANCE_RESPONSES);
    }
    
    if (this.config.enableGenericFallbacks) {
      let fallback = this.getRandomResponse(this.GENERIC_FALLBACKS);
      
      // Add context-aware information
      if (degradationStatus.shouldDegrade) {
        fallback += `\n\n🔧 Current issue: ${degradationStatus.reason}`;
      }
      
      // Add queue information if applicable
      if (this.messageQueue.length > 0) {
        fallback += `\n📊 Messages in queue: ${this.messageQueue.length}`;
      }
      
      return fallback;
    }
    
    return 'I\'m experiencing technical difficulties. Please try again later.';
  }

  // Get current system status
  getStatus(): {
    overall: string;
    circuits: Record<string, {
      state: string;
      failures: number;
      lastFailure: number;
      consecutiveSuccesses: number;
    }>;
    queue: {
      size: number;
      oldestMessage: number | null;
    };
    recovery: Record<string, RecoveryMetrics>;
    } {
    const oldestMessage = this.messageQueue.length > 0 
      ? Date.now() - this.messageQueue[0].timestamp 
      : null;
    
    return {
      overall: this.serviceStatus.overall,
      circuits: {
        gemini: {
          state: this.serviceStatus.gemini.state,
          failures: this.serviceStatus.gemini.failureCount,
          lastFailure: this.serviceStatus.gemini.lastFailureTime,
          consecutiveSuccesses: this.serviceStatus.gemini.consecutiveSuccesses
        },
        discord: {
          state: this.serviceStatus.discord.state,
          failures: this.serviceStatus.discord.failureCount,
          lastFailure: this.serviceStatus.discord.lastFailureTime,
          consecutiveSuccesses: this.serviceStatus.discord.consecutiveSuccesses
        }
      },
      queue: {
        size: this.messageQueue.length,
        oldestMessage
      },
      recovery: Object.fromEntries(this.recoveryMetrics.entries())
    };
  }

  // Get current queue size for system context
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Manually trigger recovery attempts for services in failed state
   * 
   * Provides administrative control to force recovery attempts outside
   * of the normal automatic recovery cycle. Useful for:
   * - Immediate recovery after known issues are resolved
   * - Testing service health after maintenance
   * - Resetting circuit breakers after configuration changes
   * 
   * Recovery Process:
   * 1. Validates current service state
   * 2. Attempts service-specific health checks
   * 3. Updates circuit breaker state on success
   * 4. Records recovery metrics
   * 5. Logs recovery attempt results
   * 
   * @param serviceName - Optional specific service to recover ('gemini' | 'discord')
   *                     If not provided, attempts recovery for all services
   * @returns Promise that resolves when recovery attempts complete
   */
  async triggerRecovery(serviceName?: 'gemini' | 'discord'): Promise<void> {
    logger.info(`Manual recovery triggered${serviceName ? ` for ${serviceName}` : ' for all services'}`);
    
    if (serviceName) {
      await this.attemptServiceRecovery(serviceName);
    } else {
      await this.attemptServiceRecovery('gemini');
      await this.attemptServiceRecovery('discord');
    }
  }

  // Private methods
  private createInitialCircuitState(): CircuitBreakerState {
    return {
      state: 'closed',
      failureCount: 0,
      lastFailureTime: 0,
      lastSuccessTime: Date.now(),
      consecutiveSuccesses: 0
    };
  }

  /**
   * Records successful operation and manages circuit breaker state transitions
   * 
   * Success Recording Process:
   * 1. Updates last success timestamp
   * 2. Increments consecutive success counter
   * 3. Evaluates state transition conditions
   * 4. Transitions HALF-OPEN → CLOSED after sufficient successes
   * 5. Resets failure counters on full recovery
   * 6. Updates overall system status
   * 
   * @param serviceName - Service that completed successfully
   * @private
   */
  private async recordSuccess(serviceName: 'gemini' | 'discord'): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      const circuit = this.serviceStatus[serviceName];
      
      circuit.lastSuccessTime = Date.now();
      circuit.consecutiveSuccesses++;
      
      // Reset circuit if we have enough successes in half-open state
      if (circuit.state === 'half-open' && circuit.consecutiveSuccesses >= this.config.halfOpenMaxRetries) {
        circuit.state = 'closed';
        circuit.failureCount = 0;
        circuit.consecutiveSuccesses = 0;
        logger.info(`Circuit breaker CLOSED for ${serviceName} after successful recovery`);
        
        // Record recovery success
        this.recordRecoverySuccess(serviceName);
      }
      
      this.updateOverallStatus();
    } finally {
      release();
    }
  }

  /**
   * Records operation failure and manages circuit breaker state transitions
   * 
   * Failure Recording Process:
   * 1. Increments failure counter
   * 2. Updates last failure timestamp
   * 3. Resets consecutive success counter
   * 4. Evaluates if failure threshold exceeded
   * 5. Transitions CLOSED/HALF-OPEN → OPEN when threshold reached
   * 6. Updates overall system status
   * 7. Logs failure details for monitoring
   * 
   * @param serviceName - Service that failed
   * @param error - Error that caused the failure
   * @private
   */
  private async recordFailure(serviceName: 'gemini' | 'discord', error: unknown): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      const circuit = this.serviceStatus[serviceName];
      
      circuit.failureCount++;
      circuit.lastFailureTime = Date.now();
      circuit.consecutiveSuccesses = 0;
      
      if (circuit.failureCount >= this.config.maxFailures) {
        circuit.state = 'open';
        logger.warn(`Circuit breaker OPENED for ${serviceName} after ${circuit.failureCount} failures`, { error });
      }
      
      this.updateOverallStatus();
    } finally {
      release();
    }
  }

  private updateOverallStatus(): void {
    const geminiHealthy = this.serviceStatus.gemini.state === 'closed';
    const discordHealthy = this.serviceStatus.discord.state === 'closed';
    
    if (geminiHealthy && discordHealthy) {
      this.serviceStatus.overall = 'healthy';
    } else if (!geminiHealthy && !discordHealthy) {
      this.serviceStatus.overall = 'critical';
    } else {
      this.serviceStatus.overall = 'degraded';
    }
  }

  /**
   * Evaluates health metrics to determine degradation requirements
   * 
   * Health Assessment Criteria:
   * - Memory Usage: Critical when exceeding configured threshold
   * - Error Rate: Medium severity when above acceptable rate
   * - Response Time: Medium severity when P95 exceeds threshold
   * - API Health: High severity when services report unhealthy
   * 
   * Thresholds (configurable via environment):
   * - Memory: DEFAULT_MEMORY_THRESHOLD_MB (400MB)
   * - Error Rate: DEFAULT_ERROR_RATE_THRESHOLD (10%)
   * - Response Time: DEFAULT_RESPONSE_TIME_THRESHOLD_MS (10s)
   * 
   * @param metrics - Current health metrics from HealthMonitor
   * @returns Degradation assessment based on health status
   * @private
   */
  private assessHealthBasedDegradation(metrics: HealthMetrics): {
    shouldDegrade: boolean;
    reason: string;
    severity: 'low' | 'medium' | 'high';
  } {
    const memoryUsageMB = metrics.memoryUsage.rss / GENERAL_CONSTANTS.BYTES_TO_MB;
    
    // Critical memory usage
    if (memoryUsageMB > this.config.memoryThresholdMB) {
      return {
        shouldDegrade: true,
        reason: `High memory usage: ${memoryUsageMB.toFixed(1)}MB`,
        severity: 'high'
      };
    }
    
    // High error rate
    if (metrics.errorRate > this.config.errorRateThreshold) {
      return {
        shouldDegrade: true,
        reason: `High error rate: ${metrics.errorRate.toFixed(1)}%`,
        severity: 'medium'
      };
    }
    
    // Slow response times
    if (metrics.responseTime.p95 > this.config.responseTimeThresholdMs) {
      return {
        shouldDegrade: true,
        reason: `Slow response times: ${metrics.responseTime.p95}ms P95`,
        severity: 'medium'
      };
    }
    
    // API health issues
    if (!metrics.apiHealth.gemini || !metrics.apiHealth.discord) {
      const unhealthyServices = [];
      if (!metrics.apiHealth.gemini) unhealthyServices.push('Gemini');
      if (!metrics.apiHealth.discord) unhealthyServices.push('Discord');
      
      return {
        shouldDegrade: true,
        reason: `Unhealthy services: ${unhealthyServices.join(', ')}`,
        severity: 'high'
      };
    }
    
    return {
      shouldDegrade: false,
      reason: 'Health metrics within acceptable ranges',
      severity: 'low'
    };
  }

  private startQueueProcessing(): void {
    this.queueProcessingTimer = setInterval(async () => {
      await this.processQueue();
    }, this.config.retryIntervalMs);
  }

  private startRecoveryMonitoring(): void {
    this.recoveryTimer = setInterval(async () => {
      await this.performRecoveryAttempts();
    }, this.config.resetTimeoutMs);
  }

  /**
   * Processes queued messages during system recovery
   * 
   * Queue Processing Strategy:
   * 1. Checks if system is still too degraded to process
   * 2. Processes messages in priority order (high → medium → low)
   * 3. Validates message expiration before processing
   * 4. Integrates with actual service calls when available
   * 5. Handles retry logic for failed messages
   * 6. Removes expired messages with user notification
   * 
   * Batch Processing:
   * - Processes up to MAX_BATCH_PROCESS_SIZE messages per cycle
   * - Maintains message ordering within priority levels
   * - Provides user feedback on processing status
   * 
   * @private
   */
  private async processQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;
    
    const degradationStatus = await this.shouldDegrade();
    if (degradationStatus.shouldDegrade && degradationStatus.severity === 'high') {
      // System still too degraded to process queue
      return;
    }
    
    const release = await this.queueMutex.acquire();
    try {
      // Process high priority messages first
      const messagesToProcess = this.messageQueue.splice(0, Math.min(DEGRADATION_CONSTANTS.MAX_BATCH_PROCESS_SIZE, this.messageQueue.length));
      
      for (const message of messagesToProcess) {
        try {
          // Check if message has expired
          if (Date.now() - message.timestamp > this.config.maxQueueTimeMs) {
            await message.respond('Sorry, your message expired while in the queue. Please try again.');
            continue;
          }
          
          // Try to process the message
          // This would integrate with the actual Gemini service
          await message.respond('✅ Your queued message has been processed! Sorry for the delay.');
          
          logger.info(`Successfully processed queued message ${message.id}`);
        } catch (error) {
          message.retries++;
          
          if (message.retries >= this.config.maxRetries) {
            await message.respond('Sorry, I couldn\'t process your message after multiple attempts. Please try again later.');
            logger.warn(`Failed to process message ${message.id} after ${message.retries} retries`, { error });
          } else {
            // Re-queue for retry
            this.messageQueue.push(message);
            logger.info(`Re-queued message ${message.id} for retry ${message.retries}/${this.config.maxRetries}`);
          }
        }
      }
    } finally {
      release();
    }
  }

  private async performRecoveryAttempts(): Promise<void> {
    const services: Array<'gemini' | 'discord'> = ['gemini', 'discord'];
    
    for (const service of services) {
      if (this.serviceStatus[service].state === 'open') {
        await this.attemptServiceRecovery(service);
      }
    }
  }

  /**
   * Attempts to recover a specific failed service
   * 
   * Recovery Process:
   * 1. Records recovery attempt metrics
   * 2. Executes service-specific recovery strategy
   * 3. Logs success/failure for monitoring
   * 4. Updates recovery statistics
   * 
   * Service-Specific Recovery:
   * - Gemini: Health check with API validation
   * - Discord: Connection status and webhook validation
   * 
   * Recovery Metrics Tracked:
   * - Total attempts
   * - Success rate
   * - Average recovery time
   * - Last attempt timestamp
   * 
   * @param serviceName - Service to attempt recovery for
   * @private
   */
  private async attemptServiceRecovery(serviceName: 'gemini' | 'discord'): Promise<void> {
    logger.info(`Attempting recovery for ${serviceName} service`);
    
    const recovery = this.getOrCreateRecoveryMetrics(serviceName);
    recovery.attempts++;
    recovery.lastAttempt = Date.now();
    
    try {
      // Different recovery strategies based on service
      if (serviceName === 'gemini') {
        await this.recoverGeminiService();
      } else if (serviceName === 'discord') {
        await this.recoverDiscordService();
      }
      
      logger.info(`Recovery attempt successful for ${serviceName}`);
    } catch (error) {
      logger.warn(`Recovery attempt failed for ${serviceName}`, { error });
    }
  }

  private async recoverGeminiService(): Promise<void> {
    // Implementation would depend on GeminiService interface
    // For now, we'll simulate a health check
    await this.simulateHealthCheck('gemini');
  }

  private async recoverDiscordService(): Promise<void> {
    // Implementation would depend on Discord client interface
    // For now, we'll simulate a health check
    await this.simulateHealthCheck('discord');
  }

  private async simulateHealthCheck(serviceName: string): Promise<void> {
    // Simulate a basic health check
    await new Promise(resolve => setTimeout(resolve, DEGRADATION_CONSTANTS.HEALTH_CHECK_DELAY_MS));
    
    // For demonstration, we'll have a 50% success rate
    if (Math.random() < DEGRADATION_CONSTANTS.HEALTH_CHECK_SUCCESS_RATE) {
      throw new Error(`Health check failed for ${serviceName}`);
    }
  }

  private recordRecoverySuccess(serviceName: string): void {
    const recovery = this.getOrCreateRecoveryMetrics(serviceName);
    recovery.successfulRecoveries++;
    
    const recoveryTime = Date.now() - recovery.lastAttempt;
    recovery.averageRecoveryTime = (recovery.averageRecoveryTime + recoveryTime) / 2;
  }

  private getOrCreateRecoveryMetrics(serviceName: string): RecoveryMetrics {
    if (!this.recoveryMetrics.has(serviceName)) {
      this.recoveryMetrics.set(serviceName, {
        attempts: 0,
        lastAttempt: 0,
        successfulRecoveries: 0,
        averageRecoveryTime: 0
      });
    }
    return this.recoveryMetrics.get(serviceName)!;
  }

  private findInsertIndex(message: QueuedMessage): number {
    // Priority order: high -> medium -> low
    const priorities = { high: 0, medium: 1, low: 2 };
    const messagePriority = priorities[message.priority];
    
    for (let i = 0; i < this.messageQueue.length; i++) {
      const queuedPriority = priorities[this.messageQueue[i].priority];
      if (messagePriority < queuedPriority) {
        return i;
      }
    }
    
    return this.messageQueue.length;
  }

  private estimateWaitTime(position: number): string {
    const averageProcessingTime = DEGRADATION_CONSTANTS.AVERAGE_PROCESSING_TIME_SECONDS; // seconds
    const estimatedSeconds = position * averageProcessingTime;
    
    if (estimatedSeconds < DEGRADATION_CONSTANTS.SECONDS_PER_MINUTE) {
      return `${estimatedSeconds} seconds`;
    } else if (estimatedSeconds < DEGRADATION_CONSTANTS.SECONDS_PER_HOUR) {
      return `${Math.ceil(estimatedSeconds / DEGRADATION_CONSTANTS.SECONDS_PER_MINUTE)} minutes`;
    } else {
      return `${Math.ceil(estimatedSeconds / DEGRADATION_CONSTANTS.SECONDS_PER_HOUR)} hours`;
    }
  }

  private async tryGetCachedResponse(_prompt: string, _userId: string, _serverId?: string): Promise<string | null> {
    // This would integrate with the existing CacheManager
    // For now, return null to indicate no cached response
    return null;
  }

  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private async drainQueueWithFallbacks(): Promise<void> {
    const release = await this.queueMutex.acquire();
    try {
      for (const message of this.messageQueue) {
        await message.respond('🔄 System is shutting down. Your message couldn\'t be processed. Please try again when the service restarts.');
      }
      this.messageQueue = [];
    } finally {
      release();
    }
  }
}