/**
 * Response Processing Service Interface Definitions
 * 
 * Focused interfaces for AI response processing, formatting, and validation.
 * Extracted from GeminiService to improve separation of concerns.
 */

import type { FinishReason, BlockedReason } from '@google/generative-ai';
import type { IService } from './CoreServiceInterfaces';
import type { ProcessedAttachment } from './MultimodalContentInterfaces';

// ============================================================================
// Response Processing Service Interface
// ============================================================================

/**
 * Configuration for response processing behavior
 */
export interface ResponseProcessingConfig {
  /** Whether to include thinking text in responses */
  includeThoughts: boolean;
  /** Maximum characters for Discord messages */
  maxMessageLength: number;
  /** Thinking mode token budget */
  thinkingBudget: number;
  /** Whether this is a multimodal response (includes images) */
  isMultimodal?: boolean;
  /** Attachments that were processed as part of the request */
  processedAttachments?: ProcessedAttachment[];
}

/**
 * Processed response result containing both content and metadata
 */
export interface ProcessedResponse {
  /** Final response text ready for Discord */
  text: string;
  /** Whether thinking text was found and processed */
  hasThinking: boolean;
  /** Length of original thinking text (if any) */
  thinkingLength: number;
  /** Whether response was truncated due to length limits */
  wasTruncated: boolean;
  /** Processing warnings or notes */
  warnings: string[];
  /** Whether this was a multimodal response */
  isMultimodal?: boolean;
  /** Image analysis context if applicable */
  imageContext?: string;
}

/**
 * Raw API response structure for processing
 */
export interface RawAPIResponse {
  /** Response candidates from API */
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
        thinking?: string;
        thoughtText?: string;
      }>;
    };
    finishReason?: FinishReason;
    groundingMetadata?: {
      thoughts?: string;
    };
  }>;
  /** Prompt feedback for blocked requests */
  promptFeedback?: {
    blockReason?: BlockedReason;
  };
  /** Direct text response (some API formats) */
  text?: string | (() => string);
}

/**
 * Core response processing service interface
 * 
 * ## Contract Guarantees
 * - Thread-safe processing of API responses
 * - Consistent error message formatting across all AI providers
 * - Proper handling of safety filters and content blocks
 * - Discord-compatible message formatting
 * 
 * ## Usage Patterns
 * - Process raw API responses into user-friendly text
 * - Extract and format thinking mode content
 * - Generate appropriate error messages for blocked content
 * - Validate response structure and content safety
 * 
 * @example
 * ```typescript
 * const processed = await responseProcessor.processAPIResponse(
 *   rawResponse,
 *   { includeThoughts: true, maxMessageLength: 2000, thinkingBudget: 2048 }
 * );
 * 
 * if (processed.hasThinking) {
 *   console.log(`Thinking: ${processed.thinkingLength} chars`);
 * }
 * 
 * await channel.send(processed.text);
 * ```
 */
export interface IResponseProcessingService extends IService {
  /**
   * Processes raw API response into formatted text ready for Discord
   * 
   * ## Contract
   * - MUST handle all possible response structures gracefully
   * - MUST extract text content from various API response formats
   * - MUST apply thinking mode formatting when enabled
   * - MUST respect Discord message length limits
   * - MUST provide user-friendly error messages for blocked content
   * - MUST preserve response quality while ensuring safety
   * 
   * ## Error Handling
   * - Returns ProcessedResponse with appropriate error text for blocked content
   * - Throws ResponseProcessingError for malformed or invalid responses
   * - Logs processing warnings for debugging and monitoring
   * 
   * ## Thinking Mode Processing
   * - Extracts thinking text from various API response formats
   * - Formats thinking + response within Discord limits
   * - Respects includeThoughts configuration setting
   * - Handles multiple thinking text sources in single response
   * 
   * @param response Raw API response object from AI service
   * @param config Processing configuration options
   * @returns Processed response ready for Discord delivery
   * 
   * @throws {ResponseProcessingError} On processing failure:
   *   - Malformed response structure
   *   - Missing required response data
   *   - Text extraction failure
   *   - Format validation errors
   * 
   * @example
   * ```typescript
   * // Basic response processing
   * const result = await processor.processAPIResponse(apiResponse, {
   *   includeThoughts: false,
   *   maxMessageLength: 2000,
   *   thinkingBudget: 0
   * });
   * 
   * // With thinking mode enabled
   * const resultWithThinking = await processor.processAPIResponse(apiResponse, {
   *   includeThoughts: true,
   *   maxMessageLength: 2000,
   *   thinkingBudget: 2048
   * });
   * ```
   */
  processAPIResponse(
    response: RawAPIResponse | unknown,
    config: ResponseProcessingConfig
  ): Promise<ProcessedResponse>;

  /**
   * Generates user-friendly error message for blocked content
   * 
   * ## Contract
   * - MUST provide helpful guidance for each block reason
   * - MUST be appropriate for Discord chat environment
   * - SHOULD suggest alternative approaches when possible
   * - MUST not reveal internal system details
   * 
   * @param reason The reason content was blocked
   * @returns User-friendly error message
   * 
   * @example
   * ```typescript
   * const message = processor.getBlockedContentMessage('SAFETY');
   * // Returns: "Your request was blocked by safety filters. Try rephrasing with different language."
   * ```
   */
  getBlockedContentMessage(reason: BlockedReason): string;

  /**
   * Generates user-friendly message for response finish reasons
   * 
   * ## Contract
   * - MUST explain why response ended in user-friendly terms
   * - MUST provide actionable guidance when appropriate
   * - SHOULD indicate whether retry is recommended
   * - MUST be contextually appropriate for Discord chat
   * 
   * @param reason The reason response generation finished
   * @returns User-friendly finish reason message
   * 
   * @example
   * ```typescript
   * const message = processor.getFinishReasonMessage('MAX_TOKENS');
   * // Returns: "My response was too long and got cut off. Try asking for a shorter response..."
   * ```
   */
  getFinishReasonMessage(reason: FinishReason): string;

  /**
   * Formats thinking text with response text for Discord display
   * 
   * ## Contract
   * - MUST combine thinking and response within character limits
   * - MUST use clear formatting to distinguish thinking from response
   * - MUST handle edge cases (empty thinking, empty response, etc.)
   * - SHOULD optimize for readability in Discord's markdown environment
   * 
   * @param thinkingText The extracted thinking content
   * @param responseText The main response content
   * @param maxLength Maximum total length for Discord message
   * @returns Formatted combined text
   * 
   * @example
   * ```typescript
   * const formatted = processor.formatThinkingResponse(
   *   "Let me think about this...",
   *   "Here's my answer!",
   *   2000
   * );
   * // Returns formatted text with thinking section and response
   * ```
   */
  formatThinkingResponse(
    thinkingText: string,
    responseText: string,
    maxLength: number
  ): string;

  /**
   * Validates response structure and extracts text content
   * 
   * ## Contract
   * - MUST handle various API response formats
   * - MUST extract text from candidates, parts, or direct text fields
   * - MUST validate required fields are present
   * - SHOULD handle backward compatibility with different API versions
   * 
   * @param response Raw response to validate and extract from
   * @returns Extracted text content and thinking text (if any)
   * 
   * @throws {ResponseProcessingError} If response structure is invalid
   * 
   * @example
   * ```typescript
   * const { text, thinkingText } = processor.extractResponseText(apiResponse);
   * console.log(`Response: ${text}, Thinking: ${thinkingText || 'none'}`);
   * ```
   */
  extractResponseText(response: RawAPIResponse | unknown): {
    text: string;
    thinkingText: string | null;
  };

  /**
   * Processes multimodal response with image context awareness
   * 
   * ## Contract
   * - MUST handle responses that reference analyzed images
   * - MUST provide appropriate context for image-based responses
   * - SHOULD add image reference indicators when needed
   * - MUST maintain response coherence with visual context
   * 
   * @param response Processed response to enhance
   * @param config Processing configuration with attachment info
   * @returns Enhanced response with multimodal context
   * 
   * @example
   * ```typescript
   * const enhanced = processor.processMultimodalResponse(
   *   processedResponse,
   *   { isMultimodal: true, processedAttachments: [...] }
   * );
   * ```
   */
  processMultimodalResponse(
    response: ProcessedResponse,
    config: ResponseProcessingConfig
  ): ProcessedResponse;

  /**
   * Generates image processing error messages
   * 
   * ## Contract
   * - MUST provide user-friendly messages for image errors
   * - MUST suggest alternatives when image processing fails
   * - SHOULD indicate which images failed if multiple
   * - MUST be appropriate for Discord chat context
   * 
   * @param error The image processing error
   * @param attachmentCount Number of attachments that failed
   * @returns User-friendly error message
   * 
   * @example
   * ```typescript
   * const message = processor.getImageProcessingErrorMessage(error, 3);
   * // Returns: "I couldn't process 3 image(s). Please ensure they are valid image files..."
   * ```
   */
  getImageProcessingErrorMessage(
    error: Error,
    attachmentCount: number
  ): string;
}

// ============================================================================
// Response Processing Error Types
// ============================================================================

/**
 * Error thrown during response processing operations
 */
export class ResponseProcessingError extends Error {
  constructor(message: string, public code?: string, public originalError?: Error) {
    super(message);
    this.name = 'ResponseProcessingError';
  }
}