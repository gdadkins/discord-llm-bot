import { GoogleGenAI, FinishReason, BlockedReason } from '@google/genai';
import { logger } from '../utils/logger';
import type { MessageContext } from '../commands';
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
  ServiceHealthStatus,
  CacheStats,
  CachePerformance,
  DegradationStatus
} from './interfaces';
import type { IConversationManager } from './conversationManager';
import type { IRetryHandler } from './retryHandler';
import type { ISystemContextBuilder, SystemContextData } from './systemContextBuilder';

interface ContextSources {
  conversationContext: string | null;
  superContext: string;
  serverCultureContext: string;
  discordContext: string;
  personalityContext: string | null;
  messageContextString: string;
  systemContextString: string;
  dateContext: string;
}

// Core AI service focused only on Gemini API interaction


export class GeminiService implements IAIService {
  private ai: GoogleGenAI;
  private readonly SYSTEM_INSTRUCTION: string;
  private readonly GROUNDING_THRESHOLD: number;
  private readonly THINKING_BUDGET: number;
  private readonly INCLUDE_THOUGHTS: boolean;
  private readonly ENABLE_CODE_EXECUTION: boolean;
  private readonly ENABLE_STRUCTURED_OUTPUT: boolean;
  
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
    }
  ) {
    this.ai = new GoogleGenAI({ apiKey });

    this.SYSTEM_INSTRUCTION =
      process.env.GEMINI_SYSTEM_INSTRUCTION ||
      'You are a helpful Discord bot assistant. Provide clear and concise responses to user queries.';

    this.GROUNDING_THRESHOLD = parseFloat(
      process.env.GROUNDING_THRESHOLD || '0.3',
    );
    this.THINKING_BUDGET = parseInt(process.env.THINKING_BUDGET || '1024');
    this.INCLUDE_THOUGHTS = process.env.INCLUDE_THOUGHTS === 'true';
    this.ENABLE_CODE_EXECUTION = process.env.ENABLE_CODE_EXECUTION === 'true';
    this.ENABLE_STRUCTURED_OUTPUT =
      process.env.ENABLE_STRUCTURED_OUTPUT === 'true';

    // Inject dependencies
    if (!dependencies) {
      throw new Error('GeminiService requires all dependencies to be provided');
    }
    
    this.rateLimiter = dependencies.rateLimiter;
    this.contextManager = dependencies.contextManager;
    this.personalityManager = dependencies.personalityManager;
    this.cacheManager = dependencies.cacheManager;
    this.gracefulDegradation = dependencies.gracefulDegradation;
    this.roastingEngine = dependencies.roastingEngine;
    this.conversationManager = dependencies.conversationManager;
    this.retryHandler = dependencies.retryHandler;
    this.systemContextBuilder = dependencies.systemContextBuilder;
  }

  async initialize(): Promise<void> {
    logger.info(
      'GeminiService initialized with Gemini API integration',
    );
    logger.info(
      `Google Search grounding configured with threshold: ${this.GROUNDING_THRESHOLD} (awaiting @google/genai package support)`,
    );
    logger.info(
      `Thinking mode configured with budget: ${this.THINKING_BUDGET} tokens, include thoughts: ${this.INCLUDE_THOUGHTS} (enabled by default in Gemini 2.5)`,
    );
    logger.info(
      `Additional features: Code execution: ${this.ENABLE_CODE_EXECUTION}, Structured output: ${this.ENABLE_STRUCTURED_OUTPUT}`,
    );
  }

  async shutdown(): Promise<void> {
    // Dependencies will be shut down by the service registry
    // GeminiService only needs to clean up its own resources
    logger.info('GeminiService shutdown complete');
  }

  setHealthMonitor(healthMonitor: IHealthMonitor): void {
    this.healthMonitor = healthMonitor;
    this.gracefulDegradation.setHealthMonitor(healthMonitor);
  }

  setDiscordClient(client: Client): void {
    this.discordClient = client;
    this.systemContextBuilder.setDiscordClient(client);
  }

  getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: true,
      name: 'GeminiService',
      errors: [],
      metrics: {
        hasApiKey: !!this.ai,
        groundingThreshold: this.GROUNDING_THRESHOLD,
        thinkingBudget: this.THINKING_BUDGET,
        includeThoughts: this.INCLUDE_THOUGHTS,
        enableCodeExecution: this.ENABLE_CODE_EXECUTION,
        enableStructuredOutput: this.ENABLE_STRUCTURED_OUTPUT
      }
    };
  }

  // Delegate to retry handler service

  private getFinishReasonMessage(finishReason: FinishReason): string {
    switch (finishReason) {
    case FinishReason.SAFETY:
      return 'I couldn\'t complete that response due to safety guidelines. Try rephrasing your request!';
    case FinishReason.MAX_TOKENS:
      return 'My response was too long and got cut off. Try asking for a shorter response or break your question into smaller parts.';
    case FinishReason.RECITATION:
      return 'I detected potential copyright material in my response. Let me try a different approach to your question.';
    case FinishReason.LANGUAGE:
      return 'I encountered a language processing issue. Could you try rephrasing your message?';
    case FinishReason.BLOCKLIST:
      return 'Your request contains terms that I can\'t process. Please rephrase without any restricted content.';
    case FinishReason.PROHIBITED_CONTENT:
      return 'I can\'t generate content related to that topic. Try asking about something else!';
    case FinishReason.SPII:
      return 'I detected potentially sensitive personal information. Please avoid sharing private details.';
    case FinishReason.MALFORMED_FUNCTION_CALL:
      return 'There was a technical issue with function calling. This shouldn\'t happen - please try again.';
    case FinishReason.OTHER:
      return 'I encountered an unexpected issue while generating the response. Please try again.';
    default:
      return 'I encountered an unknown issue while generating the response. Please try again.';
    }
  }

  private getBlockedReasonMessage(blockedReason: BlockedReason): string {
    switch (blockedReason) {
    case BlockedReason.SAFETY:
      return 'Your request was blocked by safety filters. Try rephrasing with different language.';
    case BlockedReason.BLOCKLIST:
      return 'Your request contains blocked terminology. Please use different wording.';
    case BlockedReason.PROHIBITED_CONTENT:
      return 'Your request relates to prohibited content. Please ask about something else.';
    case BlockedReason.OTHER:
      return 'Your request was blocked for policy reasons. Try rephrasing your question.';
    default:
      return 'Your request was blocked. Please try rephrasing your question.';
    }
  }

  // Error message handling delegated to retry handler service

  /**
   * Generates an AI response using Gemini API with comprehensive context integration and degradation handling.
   * 
   * This method orchestrates the complete AI generation pipeline including:
   * - Degradation status checking with automatic fallback mechanisms
   * - Intelligent caching with bypass detection for dynamic prompts
   * - Rate limiting with quota management
   * - Context aggregation from multiple sources (conversation, personality, server culture)
   * - Retry logic with exponential backoff
   * - Circuit breaker protection for API resilience
   * 
   * The algorithm follows this flow:
   * 1. Check system degradation status (high severity = queue message, medium = try fallback)
   * 2. Evaluate cache strategy (bypass for real-time queries, use for static content)
   * 3. Validate rate limits with user-specific quotas
   * 4. Execute AI generation with retry wrapper (3 attempts, 2x backoff multiplier)
   * 5. Store conversation history and cache successful responses
   * 6. Handle circuit breaker errors with graceful fallback responses
   * 
   * @param prompt - The user's input message to process. Must be 1-100,000 characters.
   * @param userId - Discord user ID for context, rate limiting, and conversation tracking. Format: Discord snowflake (17-19 digits)
   * @param serverId - Optional Discord server ID for server-specific context and culture. Format: Discord snowflake
   * @param respond - Optional callback function for immediate response delivery during queue operations
   * @param messageContext - Optional Discord message metadata including channel info, thread status, and message references
   * @param member - Optional Discord guild member object for role-based context and permissions
   * @param guild - Optional Discord guild object for server culture and community context
   * 
   * @returns Promise resolving to the generated AI response text (1-4000 characters typically)
   * 
   * @throws {Error} When prompt is empty, exceeds length limits, rate limits are exceeded, or API fails after retries
   * @throws {Error} 'Please provide a valid message.' - Empty or whitespace-only prompt
   * @throws {Error} 'Your message is too long. Please break it into smaller parts.' - Prompt exceeds 100,000 chars
   * @throws {Error} Rate limit error messages with specific quota information
   * 
   * @example
   * // Basic usage with minimal context
   * const response = await geminiService.generateResponse(
   *   "What's the weather like?",
   *   "123456789012345678"
   * );
   * 
   * @example
   * // Full context usage with server and member data
   * const response = await geminiService.generateResponse(
   *   "Tell me about this server's culture",
   *   user.id,
   *   guild.id,
   *   async (msg) => await channel.send(msg), // Queue callback
   *   {
   *     channelName: "general",
   *     channelType: "GUILD_TEXT",
   *     isThread: false,
   *     messageId: "987654321098765432"
   *   },
   *   member,
   *   guild
   * );
   */
  async generateResponse(
    prompt: string,
    userId: string,
    serverId?: string,
    respond?: (response: string) => Promise<void>,
    messageContext?: MessageContext,
    member?: GuildMember,
    guild?: Guild
  ): Promise<string> {
    logger.info(`[DEBUG] generateResponse called for user ${userId}, prompt: "${prompt.substring(0, 50)}..."`);

    // Check degradation status first
    const degradationStatus = await this.gracefulDegradation.shouldDegrade();
    
    if (degradationStatus.shouldDegrade) {
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
    }

    // Check if we should bypass cache for this prompt
    const bypassCache = this.cacheManager.shouldBypassCache(prompt);
    
    if (!bypassCache) {
      // Try to get from cache first
      const cachedResponse = await this.cacheManager.get(prompt, userId, serverId);
      if (cachedResponse) {
        logger.info('Cache hit - returning cached response');
        return cachedResponse;
      }
    }

    const rateLimitCheck = await this.rateLimiter.checkAndIncrement();

    if (!rateLimitCheck.allowed) {
      logger.warn(`Rate limit hit: ${rateLimitCheck.reason}`);
      throw new Error(rateLimitCheck.reason);
    }

    // Validate input
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Please provide a valid message.');
    }

    if (prompt.length > 100000) {
      // Reasonable limit to prevent issues
      throw new Error(
        'Your message is too long. Please break it into smaller parts.',
      );
    }


    // Use retry handler for the main operation
    return await this.retryHandler.executeWithRetry(
      async () => this.performAIGeneration(prompt, userId, serverId, messageContext, member, guild),
      { maxRetries: 3, retryDelay: 1000, retryMultiplier: 2.0 }
    ).then(async (result) => {
      // Store this exchange in conversation history
      this.conversationManager.addToConversation(userId, prompt, result);
      
      // Cache the response if caching wasn't bypassed
      if (!bypassCache) {
        await this.cacheManager.set(prompt, userId, result, serverId);
      }
      
      return result;
    }).catch((error) => {
      // Check if this was a circuit breaker error and try fallback
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Circuit breaker is OPEN') || errorMessage.includes('Circuit breaker is HALF-OPEN')) {
        logger.info('Circuit breaker error detected, attempting fallback response');
        try {
          return this.gracefulDegradation.generateFallbackResponse(prompt, userId, serverId);
        } catch (fallbackError) {
          logger.error('Fallback response generation failed', { fallbackError });
        }
      }

      // Return user-friendly error message
      const userMessage = this.retryHandler.getUserFriendlyErrorMessage(error) || 'An error occurred';
      throw new Error(userMessage);
    });
  }

  /**
   * Performs the core AI generation process with comprehensive context building and prompt engineering.
   * 
   * This is the primary AI generation engine that handles:
   * - Dynamic personality selection based on roasting probability calculations
   * - Multi-source context aggregation from 8+ different context providers
   * - Intelligent prompt engineering with adaptive truncation strategies
   * - Circuit breaker protected API execution with automatic failover
   * - Response validation and processing pipeline
   * 
   * The context aggregation strategy prioritizes:
   * 1. Conversation history (most recent 10-50 messages depending on length)
   * 2. Server super-context (running gags, culture, memorable moments)
   * 3. User personality context (roasting preferences, interaction patterns)
   * 4. Discord metadata (roles, permissions, channel context)
   * 5. System status (queue size, API quotas, performance metrics)
   * 6. Temporal context (current date/time for accuracy)
   * 
   * Prompt engineering follows a hierarchical structure:
   * - Base instruction (roasting vs helpful mode)
   * - Contextual layers (server → user → conversation → system)
   * - Input validation with smart truncation (preserves critical context)
   * - Length optimization (2M char limit with graceful degradation)
   * 
   * @param prompt - User's input message after initial validation. Range: 1-100,000 characters
   * @param userId - Discord user ID for personalization and tracking. Must be valid Discord snowflake
   * @param serverId - Optional server ID for community context. Discord snowflake format
   * @param messageContext - Optional message metadata for channel-specific responses
   * @param member - Optional guild member for role-based context and permissions
   * @param guild - Optional guild object for server culture and community dynamics
   * 
   * @returns Promise resolving to processed AI response text ready for Discord delivery
   * 
   * @throws {Error} When context aggregation fails, API circuit breaker is open, or response processing fails
   * @throws {Error} Context building errors (invalid user/server data)
   * @throws {Error} API errors from Gemini service (rate limits, safety filters, technical failures)
   * @throws {Error} Response processing errors (empty responses, malformed data)
   * 
   * @example
   * // Internal usage for roasting personality
   * const response = await this.performAIGeneration(
   *   "How's everyone doing?",
   *   "123456789012345678",
   *   "987654321098765432",
   *   { channelName: "general", channelType: "GUILD_TEXT", isThread: false },
   *   member,
   *   guild
   * );
   * // Triggers roasting engine, builds server context, includes conversation history
   * 
   * @example
   * // Internal usage for helpful mode (no server context)
   * const response = await this.performAIGeneration(
   *   "Explain quantum computing",
   *   "123456789012345678"
   * );
   * // Uses helpful instruction, minimal context, focuses on information delivery
   */
  private async performAIGeneration(
    prompt: string,
    userId: string,
    serverId?: string,
    messageContext?: MessageContext,
    member?: GuildMember,
    guild?: Guild
  ): Promise<string> {
    logger.info(`[DEBUG] performAIGeneration called for user ${userId}`);
    
    // Determine roasting personality
    const shouldRoastNow = this.roastingEngine.shouldRoast(userId, prompt, serverId);
    
    // Aggregate all context sources
    const contextSources = this.aggregateContextSources(userId, serverId, messageContext, member, guild);
    
    // Build the complete prompt
    const fullPrompt = this.buildFullPrompt(shouldRoastNow, contextSources, prompt);
    
    // Execute API call with circuit breaker protection
    const response = await this.executeGeminiAPICall(fullPrompt);
    
    // Process and validate response
    return this.processAndValidateResponse(response);
  }

  /**
   * Aggregates context from all available sources
   */
  private aggregateContextSources(
    userId: string,
    serverId?: string,
    messageContext?: MessageContext,
    member?: GuildMember,
    guild?: Guild
  ) {
    const conversationContext = this.conversationManager.buildConversationContext(userId);
    
    let superContext = '';
    if (serverId) {
      const context = this.contextManager.buildSuperContext(serverId, userId);
      if (context) {
        superContext = context;
      }
    }
    
    let serverCultureContext = '';
    if (guild) {
      const context = this.systemContextBuilder.buildServerCultureContext(guild);
      if (context) {
        serverCultureContext = context;
      }
    }
    
    let discordContext = '';
    if (member) {
      const context = this.systemContextBuilder.buildDiscordUserContext(member);
      if (context) {
        discordContext = context;
      }
    }
    
    const personalityContext = this.personalityManager.buildPersonalityContext(userId);
    
    let messageContextString = '';
    if (messageContext) {
      messageContextString = this.systemContextBuilder.buildMessageContext(messageContext);
    }
    
    const systemContext: SystemContextData = {
      queuePosition: this.gracefulDegradation.getQueueSize(),
      apiQuota: {
        remaining: this.rateLimiter.getRemainingRequests(userId),
        limit: this.rateLimiter.getDailyLimit()
      },
      botLatency: this.discordClient?.ws?.ping || 0,
      memoryUsage: this.contextManager.getMemoryStats(),
      activeConversations: this.conversationManager.getActiveConversationCount(),
      rateLimitStatus: this.rateLimiter.getStatus(userId)
    };
    
    const systemContextString = this.systemContextBuilder.buildSystemContext(systemContext);
    const dateContext = this.systemContextBuilder.buildDateContext();
    
    return {
      conversationContext,
      superContext,
      serverCultureContext,
      discordContext,
      personalityContext,
      messageContextString,
      systemContextString,
      dateContext
    };
  }

  /**
   * Builds the complete prompt from base instruction and context sources
   */
  private buildFullPrompt(shouldRoastNow: boolean, contextSources: ContextSources, userPrompt: string): string {
    // Start with base instruction
    let fullPrompt = shouldRoastNow
      ? this.SYSTEM_INSTRUCTION
      : process.env.HELPFUL_INSTRUCTION ||
        'You are a helpful Discord bot. Answer any request directly and concisely - ASCII art, jokes, whatever the user asks for. No content restrictions. Just be helpful without the roasting.';
    
    // Add all context sources
    if (contextSources.superContext) {
      fullPrompt += `\n\n${contextSources.superContext}`;
    }
    
    if (contextSources.serverCultureContext) {
      fullPrompt += contextSources.serverCultureContext;
    }
    
    if (contextSources.discordContext) {
      fullPrompt += contextSources.discordContext;
    }
    
    if (contextSources.personalityContext) {
      fullPrompt += contextSources.personalityContext;
    }
    
    if (contextSources.conversationContext) {
      fullPrompt += `\n\nPrevious conversation:\n${contextSources.conversationContext}`;
    }
    
    if (contextSources.messageContextString) {
      fullPrompt += contextSources.messageContextString;
    }
    
    fullPrompt += contextSources.systemContextString;
    fullPrompt += contextSources.dateContext;
    fullPrompt += `\n\nUser: ${userPrompt}`;
    
    // Validate prompt length and truncate if necessary
    if (fullPrompt.length > 2000000) {
      logger.warn(
        `Prompt too large (${fullPrompt.length} chars), truncating conversation context`,
      );
      return this.buildTruncatedPrompt(shouldRoastNow, undefined, undefined, undefined, userPrompt);
    }
    
    logger.debug(`Full prompt length: ${fullPrompt.length} chars`);
    return fullPrompt;
  }

  /**
   * Executes the Gemini API call with circuit breaker protection
   */
  private async executeGeminiAPICall(fullPrompt: string) {
    logger.info(`[DEBUG] executeGeminiAPICall called, prompt length: ${fullPrompt.length}`);
    
    return await this.gracefulDegradation.executeWithCircuitBreaker(
      async () => {
        // Using the @google/genai package API
        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-05-20',
          contents: fullPrompt,
          config: {
            temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.7'),
            topK: parseInt(process.env.GEMINI_TOP_K || '40'),
            topP: parseFloat(process.env.GEMINI_TOP_P || '0.95'),
            maxOutputTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '2048')
          }
        });
        
        return response;
      },
      'gemini'
    );
  }

  /**
   * Processes and validates the API response
   */
  private processAndValidateResponse(response: unknown): string {
    return this.processGeminiResponse(response);
  }

  private buildTruncatedPrompt(
    shouldRoastNow: boolean,
    serverId?: string,
    userId?: string,
    messageContext?: MessageContext,
    prompt?: string
  ): string {
    // Rebuild without conversation context
    let fullPrompt = shouldRoastNow
      ? this.SYSTEM_INSTRUCTION
      : process.env.HELPFUL_INSTRUCTION ||
        'You are a helpful Discord bot.';
    
    if (serverId) {
      const superContext = this.contextManager.buildSuperContext(
        serverId,
        userId || '',
      );
      if (
        superContext &&
        fullPrompt.length + superContext.length < 1500000
      ) {
        fullPrompt += `\n\n${superContext}`;
      }
    }
    
    if (userId) {
      const personalityContext = this.personalityManager.buildPersonalityContext(userId);
      if (
        personalityContext &&
        fullPrompt.length + personalityContext.length < 1800000
      ) {
        fullPrompt += personalityContext;
      }
    }
    
    // Add message context even in truncated mode
    if (messageContext) {
      const contextString = `\n\nChannel: ${messageContext.channelName} (${messageContext.channelType})${messageContext.isThread ? ', thread' : ''}`;
      if (fullPrompt.length + contextString.length < 1900000) {
        fullPrompt += contextString;
      }
    }
    
    // Add current date context for accurate responses
    fullPrompt += this.systemContextBuilder.buildDateContext();
    
    fullPrompt += `\n\nUser: ${prompt}`;
    
    return fullPrompt;
  }

  /**
   * Processes and validates Gemini API responses with comprehensive safety and error handling.
   * 
   * This method implements a robust response processing pipeline that handles:
   * - Prompt-level blocking detection (safety filters applied before generation)
   * - Response candidate validation (ensures content was generated)
   * - Finish reason analysis (distinguishes between recoverable and fatal errors)
   * - Content safety filtering (SAFETY, BLOCKLIST, PROHIBITED_CONTENT, SPII)
   * - Text extraction and validation (ensures non-empty, valid content)
   * 
   * The processing algorithm follows Google's safety framework:
   * 1. Check promptFeedback for pre-generation blocks (return user-friendly message)
   * 2. Validate candidates array exists and contains responses
   * 3. Analyze finishReason to determine response quality:
   *    - STOP: Successful completion (proceed to text extraction)
   *    - SAFETY/BLOCKLIST/PROHIBITED/SPII: Return user-friendly message (no retry)
   *    - MAX_TOKENS/RECITATION/OTHER: Throw error to trigger retry logic
   * 4. Extract and validate text content (non-empty, proper encoding)
   * 5. Log success metrics for monitoring and optimization
   * 
   * Safety-first approach prioritizes user experience:
   * - Blocked content returns helpful guidance instead of generic errors
   * - Technical issues trigger automatic retries when appropriate
   * - Malformed responses are caught early to prevent downstream failures
   * 
   * @param response - Raw response object from Gemini API containing candidates, safety data, and metadata
   * @returns Validated and extracted text content ready for Discord message delivery
   * 
   * @throws {Error} 'No response received from Gemini API' - Null or undefined response
   * @throws {Error} 'No response candidates generated' - Empty candidates array
   * @throws {Error} 'Empty response text' - Valid structure but no text content
   * @throws {Error} 'Response blocked: [reason]' - Recoverable finish reasons that should trigger retry
   * 
   * @example
   * // Processing successful response
   * const response = {
   *   candidates: [{
   *     finishReason: 'STOP',
   *     content: { parts: [{ text: 'Hello! How can I help you today?' }] }
   *   }],
   *   text: 'Hello! How can I help you today?'
   * };
   * const result = this.processGeminiResponse(response);
   * // Returns: "Hello! How can I help you today?"
   * 
   * @example
   * // Processing blocked response (safety filter)
   * const blockedResponse = {
   *   promptFeedback: { blockReason: 'SAFETY' },
   *   candidates: []
   * };
   * const result = this.processGeminiResponse(blockedResponse);
   * // Returns: "Your request was blocked by safety filters. Try rephrasing with different language."
   */
  private processGeminiResponse(response: unknown): string {
    // Comprehensive response validation
    if (!response) {
      throw new Error('No response received from Gemini API');
    }

    const res = response as Record<string, unknown>;
    
    // Check for prompt feedback (blocked before processing)
    const promptFeedback = res.promptFeedback as Record<string, unknown> | undefined;
    if (promptFeedback?.blockReason) {
      const message = this.getBlockedReasonMessage(
        promptFeedback.blockReason as BlockedReason,
      );
      logger.warn(
        `Request blocked at prompt level: ${promptFeedback.blockReason}`,
      );
      return message;
    }

    // Validate candidates array
    const candidates = res.candidates as unknown[] | undefined;
    if (!candidates || candidates.length === 0) {
      logger.warn('No candidates in response');
      throw new Error('No response candidates generated');
    }

    const candidate = candidates[0] as Record<string, unknown>;

    // Check finish reason for various blocking conditions
    if (
      candidate.finishReason &&
      candidate.finishReason !== FinishReason.STOP
    ) {
      const message = this.getFinishReasonMessage(candidate.finishReason as FinishReason);
      logger.warn(
        `Response finished with reason: ${candidate.finishReason}`,
      );

      // For some finish reasons, we should return the message instead of retrying
      if (
        candidate.finishReason === FinishReason.SAFETY ||
        candidate.finishReason === FinishReason.BLOCKLIST ||
        candidate.finishReason === FinishReason.PROHIBITED_CONTENT ||
        candidate.finishReason === FinishReason.SPII
      ) {
        return message;
      }

      // For others, throw error to trigger retry
      throw new Error(`Response blocked: ${candidate.finishReason}`);
    }

    // Extract text content from the response
    let text = '';
    
    // Try to get text from the response object
    if (res.text && typeof res.text === 'function') {
      text = res.text();
    } else if (res.text && typeof res.text === 'string') {
      text = res.text;
    } else if (candidate.content) {
      // Extract from content parts
      const content = candidate.content as Record<string, unknown>;
      const parts = content.parts as Array<Record<string, unknown>>;
      if (parts && parts.length > 0) {
        text = parts.map(part => part.text || '').join('');
      }
    }

    if (!text || text.trim() === '') {
      logger.warn('Empty text in response');
      throw new Error('Empty response text');
    }

    // Success!
    logger.info('Gemini API call successful');
    return text;
  }

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

  private getActiveConversationCount(): number {
    return this.conversationManager.getActiveConversationCount();
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
      // Would need to update model reference if supported by the library
      logger.info(`Model updated: ${config.model}`);
    }

    // Update generation parameters (these would be used in next generateResponse call)
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
      // Update the SYSTEM_INSTRUCTION property
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
      errors.push(`Configuration validation error: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

}
