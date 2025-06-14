/**
 * AI Service Interface Definitions
 * 
 * Focused interfaces for AI/LLM services and related functionality.
 * Separated from main interfaces file for better maintainability.
 */

import type { GuildMember, Guild, Client } from 'discord.js';
import type { MessageContext } from '../../commands';
import type { BotConfiguration } from './ConfigurationInterfaces';
import type { IService } from './CoreServiceInterfaces';
import type { IHealthMonitor } from './HealthMonitoringInterfaces';
import type { IRateLimiter } from './RateLimitingInterfaces';
import type { IContextManager } from './ContextManagementInterfaces';
import type { IRoastingEngine } from './RoastingEngineInterfaces';
import type { CacheStats, CachePerformance } from './CacheManagementInterfaces';
import type { DegradationStatus } from './GracefulDegradationInterfaces';
import type { IPersonalityManager } from './PersonalityManagementInterfaces';
import type { IConversationManager } from './ConversationManagementInterfaces';

// ============================================================================
// Core AI Service Interface
// ============================================================================

/**
 * Core AI service interface for text generation
 * 
 * ## Contract Guarantees
 * - Thread-safe operation with concurrent request handling
 * - Automatic rate limiting and quota management
 * - Context-aware responses using conversation history
 * - Graceful degradation during API failures
 * 
 * ## Usage Patterns
 * - Generate responses for user messages in Discord
 * - Maintain conversation context across interactions
 * - Apply personality and mood-based response modification
 * - Handle streaming responses for real-time interaction
 * 
 * @example
 * ```typescript
 * const response = await aiService.generateResponse(
 *   'Hello, how are you?',
 *   'user123',
 *   'server456',
 *   async (chunk) => {
 *     await message.edit(currentText + chunk);
 *   }
 * );
 * ```
 */
export interface IAITextGenerator extends IService {
  /**
   * Generates a response to a user prompt with optional multimodal image processing
   * 
   * ## Contract
   * - MUST return a complete response even if streaming fails
   * - MUST respect rate limits and handle quota exhaustion
   * - MUST incorporate conversation context when available
   * - SHOULD apply personality and mood modifications
   * - MUST sanitize output for Discord message requirements
   * - MUST handle multimodal inputs (text + images) when provided
   * 
   * ## Context Handling
   * - Uses userId to maintain conversation history
   * - Uses serverId to apply server-specific settings
   * - Incorporates member roles and permissions
   * - Applies guild culture and running gags
   * 
   * ## Multimodal Processing
   * - Supports image attachments for visual understanding
   * - Images processed alongside text prompt for comprehensive response
   * - Maintains backward compatibility when no images provided
   * - Image data passed through base64 encoding with metadata
   * 
   * ## Streaming Behavior
   * - When respond callback provided, sends incremental updates
   * - Callback receives cumulative response text
   * - Final return value contains complete response
   * - Streaming failures don't affect final response
   * 
   * @param prompt User's input message (required, non-empty)
   * @param userId User identifier for context tracking
   * @param serverId Server identifier for context (null for DMs)
   * @param respond Optional callback for streaming response updates
   * @param messageContext Additional Discord message context
   * @param member Discord member object for role/permission context
   * @param guild Discord guild object for server culture context
   * @param imageAttachments Optional array of image data for multimodal processing
   * @returns Complete generated response text
   * 
   * @throws {AIServiceError} On generation failure:
   *   - API quota exceeded
   *   - Network connectivity issues
   *   - Invalid input or context
   *   - Service not initialized
   *   - Image processing errors
   * 
   * @example
   * ```typescript
   * // Simple text generation
   * const response = await aiService.generateResponse(
   *   'What is the weather like?',
   *   'user123',
   *   'server456'
   * );
   * 
   * // With image processing
   * const response = await aiService.generateResponse(
   *   'What do you see in this image?',
   *   'user123',
   *   'server456',
   *   async (partialResponse) => {
   *     await message.edit(partialResponse);
   *   },
   *   messageContext,
   *   member,
   *   guild,
   *   [{
   *     url: 'https://example.com/image.jpg',
   *     mimeType: 'image/jpeg',
   *     base64Data: 'base64ImageData...',
   *     filename: 'image.jpg'
   *   }]
   * );
   * ```
   */
  generateResponse(
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
  ): Promise<string>;
}

/**
 * AI service quota management interface
 */
export interface IAIQuotaManager extends IService {
  /**
   * Gets remaining API quota
   */
  getRemainingQuota(): { minuteRemaining: number; dailyRemaining: number };
}

/**
 * AI service conversation management interface
 */
export interface IAIConversationManager extends IService {
  /**
   * Clears conversation history for a user
   * @param userId User identifier
   * @returns Whether conversation existed
   */
  clearUserConversation(userId: string): boolean;
  
  /**
   * Gets conversation statistics
   */
  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
  };
  
  /**
   * Builds conversation context for a user
   * @param userId User identifier
   * @param messageLimit Optional limit on number of messages to include
   * @returns Formatted conversation context string
   */
  buildConversationContext(userId: string, messageLimit?: number): string;
}

/**
 * AI service context management interface
 */
export interface IAIContextManager extends IService {
  /**
   * Context management
   */
  addEmbarrassingMoment(serverId: string, userId: string, moment: string): void;
  addRunningGag(serverId: string, gag: string): void;
}

/**
 * AI service dependency management interface
 */
export interface IAIDependencyManager extends IService {
  /**
   * Service dependencies
   */
  setHealthMonitor(healthMonitor: IHealthMonitor): void;
  setDiscordClient(client: Client): void;
  
  /**
   * Sub-service access
   */
  getPersonalityManager(): IPersonalityManager;
  getRateLimiter(): IRateLimiter;
  getContextManager(): IContextManager;
  getRoastingEngine(): IRoastingEngine;
  getConversationManager(): IConversationManager;
}

/**
 * AI service cache management interface
 */
export interface IAICacheManager extends IService {
  /**
   * Cache management
   */
  getCacheStats(): CacheStats;
  getCachePerformance(): CachePerformance;
  clearCache(): void;
}

/**
 * AI service degradation management interface
 */
export interface IAIDegradationManager extends IService {
  /**
   * Degradation management
   */
  getDegradationStatus(): DegradationStatus;
  triggerRecovery(serviceName?: 'gemini' | 'discord'): Promise<void>;
}

/**
 * AI service configuration management interface
 */
export interface IAIConfigurationManager extends IService {
  /**
   * Configuration management
   */
  updateConfiguration(config: AIServiceConfig): Promise<void>;
  validateConfiguration(config: BotConfiguration): Promise<{ valid: boolean; errors: string[] }>;
}

/**
 * AI service structured output interface
 */
export interface IAIStructuredOutput extends IService {
  /**
   * Generates a structured response using JSON mode
   * 
   * @param prompt - User prompt requesting structured data
   * @param structuredOutput - Schema and validation options
   * @param userId - User ID for context and rate limiting
   * @param serverId - Optional server ID for context
   * @param messageContext - Optional message context
   * @returns Parsed structured response object
   */
  generateStructuredResponse<T = unknown>(
    prompt: string,
    structuredOutput: import('./GeminiInterfaces').StructuredOutputOptions,
    userId: string,
    serverId?: string,
    messageContext?: MessageContext
  ): Promise<T>;
  
  /**
   * Parses and validates structured JSON responses
   * 
   * @param response - Raw response text from API
   * @param options - Structured output options including schema
   * @returns Parsed JSON object or throws error based on fallback behavior
   */
  parseStructuredResponse(
    response: string,
    options: import('./GeminiInterfaces').StructuredOutputOptions
  ): Promise<unknown>;
}

/**
 * Composite AI Service Interface combining all AI service capabilities
 */
export interface IAIService extends 
  IAITextGenerator,
  IAIQuotaManager,
  IAIConversationManager,
  IAIContextManager,
  IAIDependencyManager,
  IAICacheManager,
  IAIDegradationManager,
  IAIConfigurationManager,
  IAIStructuredOutput {
}

// ============================================================================
// AI Service Configuration Types
// ============================================================================

export interface AIServiceConfig {
  model?: string;
  temperature?: number;
  topK?: number;
  topP?: number;
  maxTokens?: number;
  safetySettings?: Record<string, string>;
  systemInstructions?: {
    roasting: string;
    helpful: string;
  };
  grounding?: {
    threshold: number;
    enabled: boolean;
  };
  thinking?: {
    budget: number;
    includeInResponse: boolean;
  };
  enableCodeExecution?: boolean;
  enableStructuredOutput?: boolean;
}

// ============================================================================
// AI Service Error Types
// ============================================================================

export class AIServiceError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AIServiceError';
  }
}