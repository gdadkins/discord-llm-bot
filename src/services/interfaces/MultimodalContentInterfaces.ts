/**
 * Multimodal Content Handler Interface Definitions
 * 
 * Focused interfaces for processing multimodal content (images, text, etc.)
 * across different AI providers and Discord attachments.
 */

import type { Collection, Attachment } from 'discord.js';
import type { IService } from './CoreServiceInterfaces';
import type { Part, Content } from '@google/generative-ai';
import type { IResponseProcessingService } from './ResponseProcessingInterfaces';

// ============================================================================
// Multimodal Content Types
// ============================================================================

/**
 * Processed attachment ready for AI consumption
 */
export interface ProcessedAttachment {
  /** Original URL of the attachment */
  url: string;
  /** MIME type of the content */
  mimeType: string;
  /** Base64 encoded data for images, or file URI for videos */
  base64Data: string;
  /** Original filename if available */
  filename?: string;
  /** Size in bytes */
  size?: number;
  /** Content type: 'image', 'video', or 'audio' */
  contentType?: 'image' | 'video' | 'audio';
  /** Processing metadata */
  metadata?: {
    width?: number;
    height?: number;
    processingTime?: number;
    // Video-specific metadata
    duration?: number;
    videoId?: string;
    thumbnailUrl?: string;
    channelName?: string;
    estimatedTokenCost?: number;
    // Partial processing metadata
    videoMetadata?: {
      startOffset: string;
      endOffset: string;
    };
    // Audio-specific metadata
    format?: string;
    bitrate?: number;
    channels?: number;
    sampleRate?: number;
    audioMetadata?: {
      startOffset: string;
      endOffset: string;
    };
    partialProcessingMessage?: string;
  };
}

/**
 * Multimodal content structure for AI APIs
 */
export interface MultimodalContent {
  /** Text content */
  text: string;
  /** Processed attachments */
  attachments: ProcessedAttachment[];
  /** Combined content ready for API */
  apiContent?: unknown;
}

/**
 * Validation result for image data
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Validation errors if any */
  errors?: string[];
  /** Warnings that don't block processing */
  warnings?: string[];
}

/**
 * Configuration for multimodal processing
 */
export interface MultimodalConfig {
  /** Maximum number of images to process */
  maxImages?: number;
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Supported MIME types */
  supportedMimeTypes?: string[];
  /** Whether to fetch referenced message attachments */
  includeReferencedAttachments?: boolean;
}

// ============================================================================
// Multimodal Content Handler Interface
// ============================================================================

/**
 * Core multimodal content handler interface
 * 
 * ## Contract Guarantees
 * - Thread-safe processing of concurrent attachment requests
 * - Automatic validation and format conversion
 * - Memory-efficient handling of large images
 * - Provider-agnostic content preparation
 * 
 * ## Usage Patterns
 * - Process Discord message attachments for AI analysis
 * - Fetch and validate images from URLs
 * - Convert between different AI provider formats
 * - Build combined text + image prompts
 * 
 * @example
 * ```typescript
 * const handler = serviceRegistry.get<IMultimodalContentHandler>('MultimodalContentHandler');
 * 
 * // Process Discord attachments
 * const processed = await handler.processDiscordAttachments(message.attachments);
 * 
 * // Build multimodal content
 * const content = await handler.buildMultimodalContent(
 *   'What do you see in these images?',
 *   processed
 * );
 * 
 * // Convert to Gemini format
 * const geminiParts = handler.convertToProviderFormat(processed, 'gemini');
 * ```
 */
export interface IMultimodalContentHandler extends IService {
  /**
   * Sets the response processing service for enhanced error handling
   * 
   * ## Contract
   * - MUST accept ResponseProcessingService instance
   * - SHOULD use it for error message generation
   * - MAY use it for multimodal response enhancement
   * 
   * @param responseProcessor Response processing service instance
   */
  setResponseProcessor(responseProcessor: IResponseProcessingService): void;

  /**
   * Processes Discord attachments into AI-ready format
   * 
   * ## Contract
   * - MUST handle all Discord attachment types gracefully
   * - MUST fetch and encode image data as base64
   * - MUST validate MIME types and file sizes
   * - SHOULD handle network errors with retries
   * - MUST filter out non-image attachments
   * 
   * ## Processing Steps
   * 1. Filter attachments by supported MIME types
   * 2. Fetch image data from Discord CDN
   * 3. Validate image format and size
   * 4. Convert to base64 encoding
   * 5. Return processed attachments
   * 
   * @param attachments Discord message attachments collection
   * @param config Optional processing configuration
   * @returns Array of processed attachments ready for AI
   * 
   * @throws {MultimodalProcessingError} On processing failure:
   *   - Network fetch failures
   *   - Invalid image formats
   *   - Size limit exceeded
   *   - Encoding errors
   * 
   * @example
   * ```typescript
   * const processed = await handler.processDiscordAttachments(
   *   message.attachments,
   *   { maxImages: 5, maxFileSize: 20 * 1024 * 1024 }
   * );
   * ```
   */
  processDiscordAttachments(
    attachments: Collection<string, Attachment>,
    config?: MultimodalConfig
  ): Promise<ProcessedAttachment[]>;

  /**
   * Fetches and processes images from URLs
   * 
   * ## Contract
   * - MUST validate URLs before fetching
   * - MUST handle various image formats
   * - MUST respect size and count limits
   * - SHOULD implement timeout for fetches
   * - MUST handle failed fetches gracefully
   * 
   * @param imageUrls Array of image URLs to process
   * @param config Optional processing configuration
   * @returns Array of processed attachments
   * 
   * @throws {MultimodalProcessingError} On fetch/processing errors
   * 
   * @example
   * ```typescript
   * const images = await handler.fetchAndProcessImages([
   *   'https://example.com/image1.jpg',
   *   'https://example.com/image2.png'
   * ]);
   * ```
   */
  fetchAndProcessImages(
    imageUrls: string[],
    config?: MultimodalConfig
  ): Promise<ProcessedAttachment[]>;

  /**
   * Builds multimodal content combining text and attachments
   * 
   * ## Contract
   * - MUST combine text and images into unified structure
   * - MUST maintain order of attachments
   * - MUST handle empty text or attachments gracefully
   * - SHOULD optimize content structure for AI processing
   * 
   * @param text Text prompt or content
   * @param attachments Processed attachments to include
   * @returns Combined multimodal content structure
   * 
   * @example
   * ```typescript
   * const content = handler.buildMultimodalContent(
   *   'Analyze these images and describe what you see',
   *   processedAttachments
   * );
   * ```
   */
  buildMultimodalContent(
    text: string,
    attachments: ProcessedAttachment[]
  ): MultimodalContent;

  /**
   * Converts attachments to provider-specific format
   * 
   * ## Contract
   * - MUST support multiple AI provider formats
   * - MUST preserve all attachment data during conversion
   * - MUST handle provider-specific limitations
   * - SHOULD validate against provider requirements
   * 
   * ## Supported Providers
   * - 'gemini': Converts to Gemini Part[] format
   * - 'openai': Converts to OpenAI message format
   * - Future: Additional providers as needed
   * 
   * @param attachments Processed attachments to convert
   * @param provider Target AI provider format
   * @returns Provider-specific content format
   * 
   * @throws {MultimodalProcessingError} On conversion errors
   * 
   * @example
   * ```typescript
   * // For Gemini
   * const parts = handler.convertToProviderFormat(attachments, 'gemini') as Part[];
   * 
   * // For OpenAI
   * const messages = handler.convertToProviderFormat(attachments, 'openai');
   * ```
   */
  convertToProviderFormat(
    attachments: ProcessedAttachment[],
    provider: 'gemini' | 'openai'
  ): unknown;

  /**
   * Validates image data and format
   * 
   * ## Contract
   * - MUST check MIME type validity
   * - MUST validate base64 encoding
   * - MUST check size constraints
   * - SHOULD detect corrupted data
   * - MUST provide detailed error messages
   * 
   * @param attachment Attachment to validate
   * @param config Optional validation configuration
   * @returns Validation result with errors/warnings
   * 
   * @example
   * ```typescript
   * const result = handler.validateImageData(attachment);
   * if (!result.valid) {
   *   console.error('Validation errors:', result.errors);
   * }
   * ```
   */
  validateImageData(
    attachment: ProcessedAttachment,
    config?: MultimodalConfig
  ): ValidationResult;

  /**
   * Builds provider-specific multimodal API content
   * 
   * ## Contract
   * - MUST create complete API-ready content structure
   * - MUST handle both text-only and multimodal cases
   * - MUST apply provider-specific formatting rules
   * - SHOULD optimize for provider capabilities
   * 
   * @param text Text prompt
   * @param attachments Optional processed attachments
   * @param provider Target AI provider
   * @returns Provider-specific API content
   * 
   * @example
   * ```typescript
   * // For Gemini with images
   * const content = handler.buildProviderContent(
   *   'What is in this image?',
   *   processedImages,
   *   'gemini'
   * ) as Content;
   * ```
   */
  buildProviderContent(
    text: string,
    attachments: ProcessedAttachment[] | undefined,
    provider: 'gemini' | 'openai'
  ): unknown;

  /**
   * Processes and enhances multimodal content for responses
   * 
   * ## Contract
   * - MUST build complete multimodal content structure
   * - MUST convert to provider-specific format
   * - SHOULD leverage ResponseProcessingService when available
   * - MUST maintain backward compatibility
   * 
   * @param text Text content
   * @param attachments Processed attachments
   * @param provider Target AI provider (defaults to 'gemini')
   * @returns Enhanced multimodal content
   * 
   * @example
   * ```typescript
   * const content = await handler.processMultimodalContent(
   *   'Analyze these images',
   *   processedAttachments,
   *   'gemini'
   * );
   * ```
   */
  processMultimodalContent(
    text: string,
    attachments: ProcessedAttachment[],
    provider?: 'gemini' | 'openai'
  ): Promise<MultimodalContent>;

  /**
   * Detects and processes YouTube URLs in text content
   * 
   * ## Contract
   * - MUST detect all supported YouTube URL formats
   * - MUST validate video accessibility and duration
   * - MUST provide token cost warnings
   * - SHOULD return user confirmation requirements
   * - MUST handle private/unavailable videos gracefully
   * 
   * @param text Text content to scan for YouTube URLs
   * @param config Optional processing configuration
   * @returns Array of YouTube processing results
   * 
   * @example
   * ```typescript
   * const results = await handler.processYouTubeUrls(
   *   'Check out this video: https://youtu.be/dQw4w9WgXcQ'
   * );
   * ```
   */
  processYouTubeUrls(
    text: string,
    config?: MultimodalConfig
  ): Promise<Array<{
    url: string;
    videoId?: string;
    isValid: boolean;
    requiresConfirmation: boolean;
    warningMessage?: string;
    errorMessage?: string;
    estimatedTokenCost?: number;
  }>>;

  /**
   * Processes a YouTube video into AI-ready format
   * 
   * ## Contract
   * - MUST validate video accessibility and duration limits
   * - MUST generate appropriate file URI for AI processing
   * - MUST calculate token cost estimates
   * - SHOULD provide user-friendly error messages
   * - MUST handle rate limiting and API errors
   * 
   * @param videoId YouTube video ID
   * @param requireUserConfirmation Whether user confirmation was provided
   * @param config Optional processing configuration
   * @returns Processed video attachment or error
   * 
   * @example
   * ```typescript
   * const result = await handler.processYouTubeVideo(
   *   'dQw4w9WgXcQ',
   *   true // user confirmed
   * );
   * ```
   */
  processYouTubeVideo(
    videoId: string,
    requireUserConfirmation: boolean,
    config?: MultimodalConfig
  ): Promise<{
    success: boolean;
    attachment?: ProcessedAttachment;
    errorMessage?: string;
    requiresConfirmation?: boolean;
    warningMessage?: string;
  }>;
}

// ============================================================================
// Multimodal Processing Error Types
// ============================================================================

/**
 * Error thrown during multimodal content processing
 */
export class MultimodalProcessingError extends Error {
  constructor(
    message: string,
    public code?: string,
    public attachmentUrl?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'MultimodalProcessingError';
  }
}