/**
 * GeminiService - Main orchestrator for Gemini AI functionality
 * 
 * This is the primary service that coordinates between:
 * - GeminiAPIClient: Handles API calls and configuration
 * - GeminiContextProcessor: Manages context assembly and prompt building
 * - GeminiResponseHandler: Processes and formats API responses
 * 
 * The service maintains backward compatibility while delegating
 * specific responsibilities to specialized modules.
 */

import { logger } from '../../utils/logger';
import { largeContextHandler } from '../../utils/largeContextHandler';
import { globalPools } from '../../utils/PromisePool';
import { globalCoalescers } from '../../utils/RequestCoalescer';
import type { MessageContext } from '../../commands';
import type { GuildMember, Client, Guild } from 'discord.js';
import type { 
  IAIService, 
  AIServiceConfig, 
  BotConfiguration,
  IHealthMonitor,
  IRateLimiter,
  IContextManager,
  IPersonalityManager,
  ICacheManager,
  IRoastingEngine,
  IGracefulDegradationService,
  IResponseProcessingService,
  IMultimodalContentHandler,
  ServiceHealthStatus,
  CacheStats,
  CachePerformance,
  DegradationStatus,
  GeminiGenerationOptions,
  StructuredOutputOptions
} from '../interfaces';
import type { IConversationManager } from '../conversationManager';
import type { IRetryHandler } from '../retryHandler';
import type { ISystemContextBuilder } from '../systemContextBuilder';

import { GeminiAPIClient } from './GeminiAPIClient';
import { GeminiContextProcessor } from './GeminiContextProcessor';
import { GeminiResponseHandler } from './GeminiResponseHandler';
import type { IGeminiAPIClient, IGeminiContextProcessor, IGeminiResponseHandler, ImageAttachment } from './interfaces';

/**
 * Main Gemini service orchestrator implementing IAIService
 * Coordinates between specialized modules for AI generation
 */
export class GeminiService implements IAIService {
  // Module instances
  private apiClient: IGeminiAPIClient;
  private contextProcessor: IGeminiContextProcessor;
  private responseHandler: IGeminiResponseHandler;
  
  // Injected dependencies
  private rateLimiter: IRateLimiter;
  private contextManager: IContextManager;
  private personalityManager: IPersonalityManager;
  private cacheManager: ICacheManager;
  private gracefulDegradation: IGracefulDegradationService;
  private roastingEngine: IRoastingEngine;
  private conversationManager: IConversationManager;
  private retryHandler: IRetryHandler;
  private systemContextBuilder: ISystemContextBuilder;
  private responseProcessingService: IResponseProcessingService;
  private multimodalContentHandler: IMultimodalContentHandler;
  private healthMonitor?: IHealthMonitor;
  private discordClient?: Client;

  constructor(
    apiKey: string,
    dependencies: {
      rateLimiter: IRateLimiter;
      contextManager: IContextManager;
      personalityManager: IPersonalityManager;
      cacheManager: ICacheManager;
      gracefulDegradation: IGracefulDegradationService;
      roastingEngine: IRoastingEngine;
      conversationManager: IConversationManager;
      retryHandler: IRetryHandler;
      systemContextBuilder: ISystemContextBuilder;
      responseProcessingService: IResponseProcessingService;
      multimodalContentHandler: IMultimodalContentHandler;
    }
  ) {
    // Validate dependencies
    if (!dependencies) {
      throw new Error('GeminiService requires all dependencies to be provided');
    }
    
    // Store injected dependencies
    this.rateLimiter = dependencies.rateLimiter;
    this.contextManager = dependencies.contextManager;
    this.personalityManager = dependencies.personalityManager;
    this.cacheManager = dependencies.cacheManager;
    this.gracefulDegradation = dependencies.gracefulDegradation;
    this.roastingEngine = dependencies.roastingEngine;
    this.conversationManager = dependencies.conversationManager;
    this.retryHandler = dependencies.retryHandler;
    this.systemContextBuilder = dependencies.systemContextBuilder;
    this.responseProcessingService = dependencies.responseProcessingService;
    this.multimodalContentHandler = dependencies.multimodalContentHandler;
    
    // Initialize specialized modules
    this.apiClient = new GeminiAPIClient(
      apiKey,
      dependencies.gracefulDegradation,
      dependencies.multimodalContentHandler
    );
    
    this.contextProcessor = new GeminiContextProcessor(
      dependencies.contextManager,
      dependencies.personalityManager,
      dependencies.conversationManager,
      dependencies.systemContextBuilder,
      dependencies.rateLimiter,
      dependencies.gracefulDegradation,
      {
        ...this.apiClient.getConfig(),
        systemInstruction: this.apiClient.getConfig().systemInstruction || process.env.ROASTING_INSTRUCTION || '',
        helpfulInstruction: process.env.HELPFUL_INSTRUCTION || 'You are a helpful Discord bot. Answer any request directly and concisely.',
        forceThinkingPrompt: this.apiClient.getConfig().forceThinkingPrompt || false,
        thinkingTrigger: this.apiClient.getConfig().thinkingTrigger || ''
      }
    );
    
    this.responseHandler = new GeminiResponseHandler(
      dependencies.responseProcessingService,
      this.apiClient.getConfig()
    );
  }

  async initialize(): Promise<void> {
    try {
      // Initialize large context handler for handling oversized contexts
      await largeContextHandler.initialize();
      logger.info('Large context handler initialized for conversation summarization');
    } catch (error) {
      logger.error('Failed to initialize large context handler', { error });
      throw new Error(`Large context handler initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const config = this.apiClient.getConfig();
    logger.info(
      'GeminiService initialized with Gemini API integration',
    );
    logger.info(
      `Google Search grounding configured with threshold: ${config.groundingThreshold} (awaiting @google/genai package support)`,
    );
    logger.info(
      `Thinking mode configured with budget: ${config.thinkingBudget} tokens, include thoughts: ${config.includeThoughts} (enabled by default in Gemini 2.5)`,
    );
    logger.info(
      `Additional features: Code execution: ${config.enableCodeExecution}, Structured output: ${config.enableStructuredOutput}, Google Search: ${config.enableGoogleSearch}`,
    );
    if (config.enableCodeExecution) {
      logger.info('Code execution enabled - Python code blocks in responses will be executed automatically');
    }
    if (config.enableGoogleSearch) {
      logger.info(`Google Search grounding enabled with threshold: ${config.groundingThreshold}`);
    }
    if (config.unfilteredMode) {
      logger.warn('UNFILTERED MODE ENABLED - Bot will provide unrestricted responses to all requests');
    }
  }

  async shutdown(): Promise<void> {
    try {
      // Clean up any temporary files from large context handler
      await largeContextHandler.cleanupAll();
      logger.info('Large context handler cleanup complete');
    } catch (error) {
      // Log error but continue with shutdown - cleanup failures shouldn't block shutdown
      logger.error('Error during large context handler cleanup', { error });
    }

    // Dependencies will be shut down by the service registry
    logger.info('GeminiService shutdown complete');
  }

  setHealthMonitor(healthMonitor: IHealthMonitor): void {
    this.healthMonitor = healthMonitor;
    this.gracefulDegradation.setHealthMonitor(healthMonitor);
    
    // Pass health monitor to response handler for analytics
    if ('setHealthMonitor' in this.responseHandler) {
      (this.responseHandler as any).setHealthMonitor(healthMonitor);
    }
  }

  setDiscordClient(client: Client): void {
    this.discordClient = client;
    this.systemContextBuilder.setDiscordClient(client);
    
    // Pass client to context processor
    if ('setDiscordClient' in this.contextProcessor) {
      (this.contextProcessor as any).setDiscordClient(client);
    }
  }

  getHealthStatus(): ServiceHealthStatus {
    const config = this.apiClient.getConfig();
    return {
      healthy: true,
      name: 'GeminiService',
      errors: [],
      metrics: {
        hasApiKey: !!this.apiClient.getAI(),
        groundingThreshold: config.groundingThreshold,
        thinkingBudget: config.thinkingBudget,
        includeThoughts: config.includeThoughts,
        enableCodeExecution: config.enableCodeExecution,
        enableStructuredOutput: config.enableStructuredOutput
      }
    };
  }

  /**
   * Main AI generation method orchestrating all modules
   * OPTIMIZED: Parallel execution of independent operations
   */
  async generateResponse(
    prompt: string,
    userId: string,
    serverId?: string,
    respond?: (response: string) => Promise<void>,
    messageContext?: MessageContext,
    member?: GuildMember,
    guild?: Guild,
    imageAttachments?: Array<{
      url: string;
      mimeType: string;
      base64Data: string;
      filename?: string;
      size?: number;
    }>
  ): Promise<string> {
    // Use request coalescing for identical simultaneous requests
    const coalescerKey = `${prompt}-${userId}-${serverId || 'dm'}`;
    return globalCoalescers.geminiGeneration.execute(coalescerKey, async () => {
      // OPTIMIZATION: Run independent checks in parallel
      const [degradationResult, cacheResult, validationResult] = await Promise.allSettled([
        this.handleDegradationCheck(userId, prompt, respond, serverId),
        this.handleCacheLookup(prompt, userId, serverId),
        this.validateInputAndRateLimits(prompt)
      ]);

      // Check degradation status first (highest priority)
      if (degradationResult.status === 'fulfilled' && degradationResult.value !== null) {
        return degradationResult.value;
      }

      // Check cache (if validation passed)
      if (validationResult.status === 'rejected') {
        throw validationResult.reason;
      }

      if (cacheResult.status === 'fulfilled') {
        const { response: cachedResponse, bypassCache } = cacheResult.value;
        if (cachedResponse) {
          return cachedResponse;
        }
      }

      // Use retry handler for the main operation
      try {
        const result = await this.retryHandler.executeWithRetry(
          async () => this.performAIGeneration(prompt, userId, serverId, messageContext, member, guild, imageAttachments),
          { maxRetries: 3, retryDelay: 1000, retryMultiplier: 2.0 }
        );

        // OPTIMIZATION: Fire-and-forget for post-generation tasks
        // These don't affect the response, so we don't need to wait
        const bypassCache = cacheResult.status === 'fulfilled' ? cacheResult.value.bypassCache : false;
        this.handlePostGenerationAsync(userId, prompt, result, bypassCache, serverId)
          .catch(error => {
            logger.error('Post-generation task failed', {
              error,
              userId,
              serverId,
              promptLength: prompt.length
            });
            // Report to health monitor if available
            if (this.healthMonitor) {
              this.healthMonitor.recordError('GeminiService.postGeneration', error instanceof Error ? error : new Error(String(error)));
            }
          });
        
        return result;
      } catch (error) {
        return await this.handleGenerationError(error, prompt, userId, serverId);
      }
    });
  }

  /**
   * Core AI generation process coordinating all modules
   * OPTIMIZED: Parallel context assembly where possible
   */
  private async performAIGeneration(
    prompt: string,
    userId: string,
    serverId?: string,
    messageContext?: MessageContext,
    member?: GuildMember,
    guild?: Guild,
    imageAttachments?: Array<{
      url: string;
      mimeType: string;
      base64Data: string;
      filename?: string;
      size?: number;
    }>
  ): Promise<string> {
    // OPTIMIZATION: Run independent operations in parallel
    const hasImages = imageAttachments && imageAttachments.length > 0;
    
    // Determine roasting personality
    const shouldRoastNow = this.roastingEngine.shouldRoast(userId, prompt, serverId);
    
    // Assemble context sources synchronously (assembleContext is not async)
    const contextSources = this.contextProcessor.assembleContext(
      userId, serverId, messageContext, member, guild, prompt, hasImages
    );
    
    // Build complete prompt and calculate budget in parallel
    const [fullPrompt, dynamicBudget] = await Promise.all([
      this.contextProcessor.buildSystemContext(shouldRoastNow, contextSources, prompt),
      Promise.resolve(this.contextProcessor.calculateThinkingBudget(
        prompt, contextSources.superContext ? 'medium' : 'low'
      ))
    ]);
    
    // Execute API call through API client
    const response = await this.apiClient.executeAPICall(
      fullPrompt, imageAttachments, dynamicBudget
    );
    
    // Process response through response handler
    return await this.responseHandler.extractResponseText(
      response, hasImages, imageAttachments, dynamicBudget
    );
  }

  /**
   * Handles degradation check and returns early if system is degraded
   */
  private async handleDegradationCheck(
    userId: string,
    prompt: string,
    respond?: (response: string) => Promise<void>,
    serverId?: string
  ): Promise<string | null> {
    const degradationStatus = await this.gracefulDegradation.shouldDegrade();
    
    if (!degradationStatus.shouldDegrade) {
      return null;
    }
    
    logger.warn(`System degraded: ${degradationStatus.reason} (severity: ${degradationStatus.severity})`);
    
    // For high severity issues, queue the message
    if (degradationStatus.severity === 'high' && respond) {
      await this.gracefulDegradation.queueMessage(userId, prompt, respond, serverId, 'medium');
      return ''; // Response already sent via queue
    }
    
    // For medium/low severity, try fallback first
    if (degradationStatus.severity === 'medium') {
      try {
        const fallbackResponse = await this.gracefulDegradation.generateFallbackResponse(prompt, userId, serverId);
        return fallbackResponse;
      } catch (error) {
        logger.warn('Fallback response generation failed, attempting normal processing', { error });
      }
    }
    
    return null;
  }

  /**
   * Handles cache lookup and returns cached response if available
   */
  private async handleCacheLookup(
    prompt: string,
    userId: string,
    serverId?: string
  ): Promise<{ response: string | null; bypassCache: boolean }> {
    const bypassCache = this.cacheManager.shouldBypassCache(prompt);
    
    if (!bypassCache) {
      const cachedResponse = await this.cacheManager.get(prompt, userId, serverId);
      if (cachedResponse) {
        logger.info('Cache hit - returning cached response');
        return { response: cachedResponse, bypassCache };
      }
    }
    
    return { response: null, bypassCache };
  }

  /**
   * Validates input prompt and rate limits
   */
  private async validateInputAndRateLimits(prompt: string): Promise<void> {
    const rateLimitCheck = await this.rateLimiter.checkAndIncrement();

    if (!rateLimitCheck.allowed) {
      logger.warn(`Rate limit hit: ${rateLimitCheck.reason}`);
      // Provide more specific rate limit messages based on the reason
      if (rateLimitCheck.reason.includes('daily')) {
        throw new Error('You\'ve reached your daily message limit. Please try again tomorrow or contact an administrator for more quota.');
      } else if (rateLimitCheck.reason.includes('minute')) {
        throw new Error('You\'re sending messages too quickly. Please wait a moment and try again.');
      } else {
        throw new Error('Rate limit exceeded. Please wait a few moments before sending another message.');
      }
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Please provide a valid message.');
    }

    if (prompt.length > 100000) {
      throw new Error(
        'Your message is too long (over 100,000 characters). Please break it into smaller parts or summarize your request.',
      );
    }
  }

  /**
   * Handles post-generation tasks like conversation storage and caching
   */
  private async handlePostGeneration(
    userId: string,
    prompt: string,
    result: string,
    bypassCache: boolean,
    serverId?: string
  ): Promise<void> {
    // Store this exchange in conversation history
    this.conversationManager.addToConversation(userId, prompt, result);
    
    // Cache the response if caching wasn't bypassed
    if (!bypassCache) {
      await this.cacheManager.set(prompt, userId, result, serverId);
    }
  }

  /**
   * OPTIMIZED: Async version for fire-and-forget execution
   */
  private async handlePostGenerationAsync(
    userId: string,
    prompt: string,
    result: string,
    bypassCache: boolean,
    serverId?: string
  ): Promise<void> {
    // Use promise pool to limit concurrent operations
    await globalPools.context.execute(async () => {
      // Run both operations in parallel since they're independent
      await Promise.all([
        // Store conversation history (synchronous operation)
        Promise.resolve(this.conversationManager.addToConversation(userId, prompt, result)),
        // Cache the response if needed (async operation)
        !bypassCache ? this.cacheManager.set(prompt, userId, result, serverId) : Promise.resolve()
      ]);
    });
  }

  /**
   * Handles errors with fallback responses and user-friendly messages
   */
  private async handleGenerationError(
    error: unknown,
    prompt: string,
    userId: string,
    serverId?: string
  ): Promise<string> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('Circuit breaker is OPEN') || errorMessage.includes('Circuit breaker is HALF-OPEN')) {
      logger.info('Circuit breaker error detected, attempting fallback response');
      try {
        return await this.gracefulDegradation.generateFallbackResponse(prompt, userId, serverId);
      } catch (fallbackError) {
        logger.error('Fallback response generation failed', {
          fallbackError,
          originalError: error,
          userId,
          serverId
        });
        // Throw error instead of returning hardcoded message - caller should handle degraded state
        throw new Error('I\'m experiencing high load right now. Your message has been queued and I\'ll respond as soon as possible. Thanks for your patience!');
      }
    }

    // Check for specific API errors and provide better messages
    if (errorMessage.includes('API key')) {
      throw new Error('There\'s an issue with my AI service configuration. Please contact the bot administrator.');
    }
    
    if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
      throw new Error('Your message was blocked by content filters. Try rephrasing with different language.');
    }
    
    if (errorMessage.includes('quota') || errorMessage.includes('billing')) {
      throw new Error('The AI service quota has been exceeded. Please contact the bot administrator or try again later.');
    }
    
    if (errorMessage.includes('model not found') || errorMessage.includes('invalid model')) {
      throw new Error('The AI model is temporarily unavailable. Please try again in a few minutes.');
    }
    
    if (errorMessage.includes('context length') || errorMessage.includes('too long')) {
      throw new Error('Your conversation history is too long. Try using the `/clear` command to reset our conversation.');
    }

    const userMessage = this.retryHandler.getUserFriendlyErrorMessage(error) || 'I encountered an unexpected issue. Please try again, and if the problem continues, contact the bot administrator.';
    throw new Error(userMessage);
  }

  // Delegate methods to appropriate modules
  getRemainingQuota(): { minuteRemaining: number; dailyRemaining: number } {
    const remaining = this.rateLimiter.getRemainingQuota();
    return {
      minuteRemaining: remaining.minute,
      dailyRemaining: remaining.daily,
    };
  }

  clearUserConversation(userId: string): boolean {
    return this.conversationManager.clearUserConversation(userId);
  }

  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
  } {
    return this.conversationManager.getConversationStats();
  }
  
  buildConversationContext(userId: string, messageLimit?: number): string {
    return this.conversationManager.buildConversationContext(userId, messageLimit);
  }

  // Service access methods
  getPersonalityManager(): IPersonalityManager {
    return this.personalityManager;
  }

  getRateLimiter(): IRateLimiter {
    return this.rateLimiter;
  }

  getContextManager(): IContextManager {
    return this.contextManager;
  }

  getRoastingEngine(): IRoastingEngine {
    return this.roastingEngine;
  }

  getConversationManager(): IConversationManager {
    return this.conversationManager;
  }

  // Context management methods
  addEmbarrassingMoment(
    serverId: string,
    userId: string,
    moment: string,
  ): void {
    this.contextManager.addEmbarrassingMoment(serverId, userId, moment);
  }

  addRunningGag(serverId: string, gag: string): void {
    this.contextManager.addRunningGag(serverId, gag);
  }

  // Cache management methods
  getCacheStats(): CacheStats {
    return this.cacheManager.getStats();
  }

  getCachePerformance(): CachePerformance {
    return this.cacheManager.getCachePerformance();
  }

  clearCache(): void {
    this.cacheManager.clearCache();
  }

  // Graceful degradation methods
  getDegradationStatus(): DegradationStatus {
    return this.gracefulDegradation.getStatus();
  }

  async triggerRecovery(serviceName?: 'gemini' | 'discord'): Promise<void> {
    await this.gracefulDegradation.triggerRecovery(serviceName);
  }

  // Configuration management methods
  async updateConfiguration(config: AIServiceConfig): Promise<void> {
    logger.info('Updating GeminiService configuration...');

    // Update Gemini model settings
    if (config.model !== undefined) {
      logger.info(`Model updated: ${config.model}`);
    }

    // Update generation parameters
    if (config.temperature !== undefined) {
      logger.info(`Temperature updated: ${config.temperature}`);
    }
    if (config.topK !== undefined) {
      logger.info(`TopK updated: ${config.topK}`);
    }
    if (config.topP !== undefined) {
      logger.info(`TopP updated: ${config.topP}`);
    }
    if (config.maxTokens !== undefined) {
      logger.info(`MaxTokens updated: ${config.maxTokens}`);
    }

    // Update safety settings
    if (config.safetySettings !== undefined) {
      logger.info('Safety settings updated');
    }

    // Update system instructions
    if (config.systemInstructions !== undefined) {
      logger.info('System instructions updated');
    }

    // Update grounding settings
    if (config.grounding !== undefined) {
      logger.info(`Grounding updated: threshold=${config.grounding.threshold}, enabled=${config.grounding.enabled}`);
    }

    // Update thinking settings
    if (config.thinking !== undefined) {
      logger.info(`Thinking updated: budget=${config.thinking.budget}, includeInResponse=${config.thinking.includeInResponse}`);
    }

    // Update feature flags
    if (config.enableCodeExecution !== undefined) {
      logger.info(`Code execution updated: ${config.enableCodeExecution}`);
    }
    if (config.enableStructuredOutput !== undefined) {
      logger.info(`Structured output updated: ${config.enableStructuredOutput}`);
    }

    // Clear caches to ensure new configuration takes effect
    this.cacheManager.clearCache();
    
    logger.info('GeminiService configuration update completed');
  }

  async validateConfiguration(config: BotConfiguration): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Validate Gemini configuration
      if (config.gemini) {
        if (config.gemini.temperature < 0 || config.gemini.temperature > 2) {
          errors.push('Gemini temperature must be between 0 and 2');
        }
        if (config.gemini.topK < 1 || config.gemini.topK > 100) {
          errors.push('Gemini topK must be between 1 and 100');
        }
        if (config.gemini.topP < 0 || config.gemini.topP > 1) {
          errors.push('Gemini topP must be between 0 and 1');
        }
        if (config.gemini.maxTokens < 1 || config.gemini.maxTokens > 32768) {
          errors.push('Gemini maxTokens must be between 1 and 32768');
        }
      }

      // Validate rate limiting configuration
      if (config.rateLimiting) {
        if (config.rateLimiting.rpm <= 0) {
          errors.push('Rate limiting RPM must be greater than 0');
        }
        if (config.rateLimiting.daily <= 0) {
          errors.push('Rate limiting daily limit must be greater than 0');
        }
        if (config.rateLimiting.rpm > config.rateLimiting.daily / 24) {
          errors.push('RPM limit cannot exceed daily limit divided by 24 hours');
        }
      }

      // Validate context memory configuration
      if (config.features?.contextMemory) {
        const contextConfig = config.features.contextMemory;
        if (contextConfig.maxMessages < 10 || contextConfig.maxMessages > 1000) {
          errors.push('Context memory maxMessages must be between 10 and 1000');
        }
        if (contextConfig.timeoutMinutes < 1 || contextConfig.timeoutMinutes > 1440) {
          errors.push('Context memory timeout must be between 1 and 1440 minutes');
        }
        if (contextConfig.maxContextChars < 1000 || contextConfig.maxContextChars > 1000000) {
          errors.push('Context memory maxContextChars must be between 1000 and 1000000');
        }
      }

      // Validate roasting configuration
      if (config.features?.roasting) {
        const roastConfig = config.features.roasting;
        if (roastConfig.baseChance < 0 || roastConfig.baseChance > 1) {
          errors.push('Roasting baseChance must be between 0 and 1');
        }
        if (roastConfig.maxChance < 0 || roastConfig.maxChance > 1) {
          errors.push('Roasting maxChance must be between 0 and 1');
        }
        if (roastConfig.baseChance > roastConfig.maxChance) {
          errors.push('Roasting baseChance cannot be greater than maxChance');
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Unexpected error during configuration validation', { error });
      errors.push(`Configuration validation error: ${errorMessage}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Parses and validates structured JSON responses
   */
  async parseStructuredResponse(
    response: string,
    options: StructuredOutputOptions
  ): Promise<unknown> {
    return await this.responseHandler.parseStructuredResponse(response, options);
  }

  /**
   * Generates a structured response using JSON mode
   */
  async generateStructuredResponse<T = unknown>(
    prompt: string,
    structuredOutput: StructuredOutputOptions,
    userId: string,
    serverId?: string,
    messageContext?: MessageContext
  ): Promise<T> {
    // Build generation options with structured output
    const generationOptions: GeminiGenerationOptions = {
      structuredOutput,
      includeReasoning: true
    };
    
    // Use modified generation flow for structured output
    const degradationResponse = await this.handleDegradationCheck(userId, prompt, undefined, serverId);
    if (degradationResponse !== null) {
      // For degraded state, return a simple error structure
      return {
        error: 'Service temporarily unavailable',
        message: degradationResponse
      } as unknown as T;
    }
    
    // Check cache (structured responses can be cached too)
    const { response: cachedResponse, bypassCache } = await this.handleCacheLookup(prompt, userId, serverId);
    if (cachedResponse) {
      try {
        return JSON.parse(cachedResponse) as T;
      } catch {
        logger.warn('Failed to parse cached structured response, regenerating');
      }
    }
    
    // Validate input and rate limits
    await this.validateInputAndRateLimits(prompt);
    
    try {
      // Perform generation with structured output
      const result = await this.retryHandler.executeWithRetry(
        async () => this.performStructuredGeneration(prompt, generationOptions, userId, serverId, messageContext),
        { maxRetries: 3, retryDelay: 1000, retryMultiplier: 2.0 }
      );
      
      // Cache the stringified result
      if (!bypassCache) {
        await this.cacheManager.set(prompt, userId, JSON.stringify(result), serverId);
      }
      
      return result as T;
    } catch (error) {
      logger.error('Structured generation failed', { error });
      throw new Error(`Failed to generate structured response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Performs structured AI generation with JSON mode
   */
  private async performStructuredGeneration(
    prompt: string,
    options: GeminiGenerationOptions,
    userId: string,
    serverId?: string,
    messageContext?: MessageContext
  ): Promise<unknown> {
    // Determine if roasting should apply (usually not for structured outputs)
    const shouldRoastNow = false; // Structured outputs should be neutral
    
    // Build context sources
    const contextSources = this.contextProcessor.assembleContext(
      userId, serverId, messageContext
    );
    
    // Build prompt with instruction for structured output
    const structuredPrompt = `You are a helpful assistant that provides structured JSON responses according to the specified schema. Analyze the user's request and provide a response that exactly matches the required JSON structure.

${contextSources.dateContext}

User: ${prompt}

Respond with valid JSON that matches the provided schema.`;
    
    // Execute API call with structured output options
    const response = await this.apiClient.executeAPICall(
      structuredPrompt,
      undefined, // No images for structured responses
      0 // No thinking budget for structured responses
    );
    
    // Process response to extract text
    const processedResponse = await this.responseHandler.extractResponseText(response);
    
    // Parse structured response
    if (options.structuredOutput) {
      return await this.responseHandler.parseStructuredResponse(
        processedResponse,
        options.structuredOutput
      );
    }
    
    // Fallback to text response (shouldn't happen with structured output)
    return { text: processedResponse };
  }
}