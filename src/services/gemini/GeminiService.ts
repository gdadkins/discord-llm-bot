/**
 * GeminiService - Main orchestrator for Gemini AI functionality
 * 
 * This is the primary service that coordinates between:
 * - GeminiAPIClient: Handles API calls and configuration
 * - GeminiContextProcessor: Manages context assembly and prompt building
 * - GeminiResponseHandler: Processes and formats API responses
 * - GeminiConfigurationHandler: Manages service configuration
 * - GeminiStructuredOutputHandler: Handles structured JSON generation
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
  GeminiConfig,
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
  StructuredOutputOptions
} from '../interfaces';
import type { IConversationManager } from '../interfaces';
import type { IRetryHandler } from '../interfaces';
import type { ISystemContextBuilder } from '../interfaces';

import { GeminiAPIClient } from './GeminiAPIClient';
import { GeminiContextProcessor } from './GeminiContextProcessor';
import { GeminiResponseHandler } from './GeminiResponseHandler';
import { GeminiConfigurationHandler } from './GeminiConfiguration';
import { GeminiStructuredOutputHandler } from './GeminiStructuredOutput';
import type { IGeminiAPIClient, IGeminiContextProcessor, IGeminiResponseHandler } from './interfaces';

/**
 * Main Gemini service orchestrator implementing IAIService
 * Coordinates between specialized modules for AI generation
 */
export class GeminiService implements IAIService {
  // Module instances
  private apiClient: GeminiAPIClient;
  private contextProcessor: GeminiContextProcessor;
  private responseHandler: GeminiResponseHandler;
  private configHandler: GeminiConfigurationHandler;
  private structuredOutputHandler: GeminiStructuredOutputHandler;

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
    config: GeminiConfig,
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
      config as any,
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
        systemInstruction: config.systemInstructions?.roasting || process.env.GEMINI_ROASTING_INSTRUCTION || 'You are a sarcastic AI that enjoys roasting users in a playful way.',
        helpfulInstruction: config.systemInstructions?.helpful || process.env.GEMINI_HELPFUL_INSTRUCTION || 'You are a helpful Discord bot. Answer any request directly and concisely.',
        forceThinkingPrompt: this.apiClient.getConfig().forceThinkingPrompt || false,
        thinkingTrigger: this.apiClient.getConfig().thinkingTrigger || ''
      }
    );

    this.responseHandler = new GeminiResponseHandler(
      dependencies.responseProcessingService,
      this.apiClient.getConfig()
    );

    this.configHandler = new GeminiConfigurationHandler(dependencies.cacheManager);

    this.structuredOutputHandler = new GeminiStructuredOutputHandler(
      this.apiClient,
      this.contextProcessor,
      this.responseHandler,
      dependencies.cacheManager,
      dependencies.retryHandler,
      dependencies.rateLimiter
    );
  }

  async initialize(): Promise<void> {
    // Initialize large context handler for handling oversized contexts
    await largeContextHandler.initialize();
    logger.info('Large context handler initialized for conversation summarization');

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
      logger.warn('⚠️  UNFILTERED MODE ENABLED - Bot will provide unrestricted responses to all requests');
    }
  }

  async shutdown(): Promise<void> {
    // Clean up any temporary files from large context handler
    await largeContextHandler.cleanupAll();
    logger.info('Large context handler cleanup complete');

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
    }>)
    : Promise<string> {
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
          .catch(error => logger.error('Post-generation task failed', { error }));

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
    }>)
    : Promise<string> {
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
        logger.error('Fallback response generation failed', { fallbackError });
        return 'I\'m experiencing high load right now. Your message has been queued and I\'ll respond as soon as possible. Thanks for your patience!';
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
    await this.configHandler.updateConfiguration(config);
  }

  async validateConfiguration(config: BotConfiguration): Promise<{ valid: boolean; errors: string[] }> {
    return await this.configHandler.validateConfiguration(config);
  }

  /**
   * Parses and validates structured JSON responses
   */
  async parseStructuredResponse(
    response: string,
    options: StructuredOutputOptions
  ): Promise<unknown> {
    return await this.structuredOutputHandler.parseStructuredResponse(response, options);
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
    return await this.structuredOutputHandler.generateStructuredResponse<T>(
      prompt,
      structuredOutput,
      userId,
      serverId,
      messageContext,
      this.handleDegradationCheck.bind(this),
      this.handleCacheLookup.bind(this)
    );
  }
}
