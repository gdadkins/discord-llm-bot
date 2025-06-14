/**
 * Internal interfaces for Gemini service modules
 * These interfaces define contracts between the modular components
 */

import type { GoogleGenAI, Content } from '@google/genai';
import type { MessageContext } from '../../commands';
import type { GuildMember, Guild } from 'discord.js';
import type { 
  GeminiGenerationOptions,
  StructuredOutputOptions
} from '../interfaces';

export interface ContextSources {
  conversationContext: string | null;
  superContext: string;
  serverCultureContext: string;
  personalityContext: string | null;
  messageContextString: string;
  systemContextString: string;
  dateContext: string;
}

export interface ImageAttachment {
  url: string;
  mimeType: string;
  base64Data: string;
  filename?: string;
  size?: number;
}

/**
 * Interface for Gemini API client module
 * Handles direct API interaction and configuration
 */
export interface IGeminiAPIClient {
  /**
   * Executes API call with proper configuration
   * @param fullPrompt Complete prompt with context
   * @param imageAttachments Optional images for multimodal
   * @param dynamicThinkingBudget Optional thinking budget override
   * @returns Raw API response
   */
  executeAPICall(
    fullPrompt: string,
    imageAttachments?: ImageAttachment[],
    dynamicThinkingBudget?: number
  ): Promise<unknown>;

  /**
   * Builds generation configuration for API calls
   * @param profile Configuration profile name
   * @param optionsOrBudget Generation options or thinking budget
   * @returns Configuration object
   */
  buildGenerationConfig(
    profile: string,
    optionsOrBudget?: GeminiGenerationOptions | number
  ): any;

  /**
   * Gets the configured AI instance
   */
  getAI(): GoogleGenAI;

  /**
   * Gets current configuration values
   */
  getConfig(): {
    systemInstruction: string;
    groundingThreshold: number;
    thinkingBudget: number;
    includeThoughts: boolean;
    enableCodeExecution: boolean;
    enableStructuredOutput: boolean;
    forceThinkingPrompt: boolean;
    thinkingTrigger: string;
    enableGoogleSearch: boolean;
    unfilteredMode: boolean;
  };
}

/**
 * Interface for Gemini context processor module
 * Handles context assembly and prompt building
 */
export interface IGeminiContextProcessor {
  /**
   * Assembles context from all available sources
   * @param userId User ID for personalization
   * @param serverId Optional server ID
   * @param messageContext Optional message metadata
   * @param member Optional guild member
   * @param guild Optional guild object
   * @param prompt User prompt for analysis
   * @param hasImages Whether request includes images
   * @returns Aggregated context sources
   */
  assembleContext(
    userId: string,
    serverId?: string,
    messageContext?: MessageContext,
    member?: GuildMember,
    guild?: Guild,
    prompt?: string,
    hasImages?: boolean
  ): ContextSources;

  /**
   * Builds complete prompt from instruction and context
   * @param shouldRoastNow Whether to use roasting personality
   * @param contextSources Aggregated context
   * @param userPrompt User's input
   * @returns Complete prompt for API
   */
  buildSystemContext(
    shouldRoastNow: boolean,
    contextSources: ContextSources,
    userPrompt: string
  ): Promise<string>;

  /**
   * Calculates thinking budget based on complexity
   * @param prompt User prompt
   * @param complexity Optional complexity hint
   * @returns Thinking budget in tokens
   */
  calculateThinkingBudget(
    prompt: string,
    complexity?: 'low' | 'medium' | 'high'
  ): number;

  /**
   * Checks if prompt is general knowledge query
   * @param prompt User prompt
   * @returns True if general knowledge
   */
  isGeneralKnowledgeQuery(prompt: string): boolean;

  /**
   * Checks if request is basic image analysis
   * @param prompt User prompt
   * @param hasImages Whether images are attached
   * @returns True if basic image analysis
   */
  isBasicImageAnalysis(prompt: string, hasImages: boolean): boolean;
}

/**
 * Interface for Gemini response handler module
 * Handles response extraction and processing
 */
export interface IGeminiResponseHandler {
  /**
   * Extracts and formats response text
   * @param response Raw API response
   * @param isMultimodal Whether request was multimodal
   * @param processedAttachments Image attachments if any
   * @param dynamicThinkingBudget Thinking budget used
   * @returns Formatted response text
   */
  extractResponseText(
    response: unknown,
    isMultimodal?: boolean,
    processedAttachments?: ImageAttachment[],
    dynamicThinkingBudget?: number
  ): Promise<string>;

  /**
   * Formats response for Discord display
   * @param text Raw response text
   * @param includeThoughts Whether to include thinking
   * @returns Discord-ready formatted text
   */
  formatResponse(
    text: string,
    includeThoughts: boolean
  ): string;

  /**
   * Parses code execution results
   * @param response Raw API response
   * @returns Formatted code results or null
   */
  parseCodeExecutionResults(response: unknown): string | null;

  /**
   * Extracts grounding metadata
   * @param response Raw API response
   * @returns Grounding sources or null
   */
  extractGroundingMetadata(
    response: unknown
  ): { sources: Array<{ title: string; url: string; snippet?: string }> } | null;

  /**
   * Parses structured JSON response
   * @param response Response text
   * @param options Structured output options
   * @returns Parsed object
   */
  parseStructuredResponse(
    response: string,
    options: StructuredOutputOptions
  ): Promise<unknown>;
}