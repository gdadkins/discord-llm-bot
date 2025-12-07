/**
 * Multimodal Content Handler - Orchestrates multimodal content processing
 * 
 * Main responsibilities:
 * - API surface maintenance
 * - Service coordination
 * - Provider format conversion
 * - Response processing integration
 */

import { Collection, Attachment } from 'discord.js';
import { createPartFromBase64, createPartFromText, createPartFromUri, Part, Content } from '@google/genai';
import { logger } from '../../utils/logger';
import { youTubeUrlDetector } from '../../utils/youtubeUrlDetector';
import { MediaProcessor } from './MediaProcessor';
import { ContentValidator } from './ContentValidator';
import type {
  IMultimodalContentHandler,
  ProcessedAttachment,
  MultimodalContent,
  ValidationResult,
  MultimodalConfig
} from '../interfaces/MultimodalContentInterfaces';
import { MultimodalProcessingError } from '../interfaces/MultimodalContentInterfaces';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import type { IResponseProcessingService } from '../interfaces/ResponseProcessingInterfaces';

/**
 * Default configuration for multimodal processing
 */
const DEFAULT_CONFIG: Required<MultimodalConfig> = {
  maxImages: 10,
  maxFileSize: 20 * 1024 * 1024, // 20MB
  supportedMimeTypes: [
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
    'video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 
    'video/x-flv', 'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp',
    'audio/mp3', 'audio/mpeg', 'audio/wav',
    'audio/ogg', 'audio/webm', 'audio/flac'
  ],
  includeReferencedAttachments: true
};

/**
 * Multimodal Content Handler Implementation
 * 
 * Orchestrates media processing and content validation through specialized modules
 */
export class MultimodalContentHandler implements IMultimodalContentHandler {
  private initialized = false;
  private readonly config: Required<MultimodalConfig>;
  private responseProcessor?: IResponseProcessingService;
  private readonly mediaProcessor: MediaProcessor;
  private readonly contentValidator: ContentValidator;

  constructor(
    config?: Partial<MultimodalConfig>,
    responseProcessor?: IResponseProcessingService
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.responseProcessor = responseProcessor;
    
    // Initialize sub-modules
    this.mediaProcessor = new MediaProcessor(this.config);
    this.contentValidator = new ContentValidator(this.config);
    
    logger.info('MultimodalContentHandler initialized with config:', {
      maxImages: this.config.maxImages,
      maxFileSize: `${Math.round(this.config.maxFileSize / 1024 / 1024)}MB`,
      supportedTypes: this.config.supportedMimeTypes,
      hasResponseProcessor: !!responseProcessor
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('MultimodalContentHandler already initialized');
      return;
    }

    logger.info('Initializing MultimodalContentHandler...');
    this.initialized = true;
    logger.info('MultimodalContentHandler initialization complete');
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Shutting down MultimodalContentHandler...');
    this.initialized = false;
    logger.info('MultimodalContentHandler shutdown complete');
  }

  getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.initialized,
      name: 'MultimodalContentHandler',
      errors: this.initialized ? [] : ['Service not initialized'],
      metrics: {
        initialized: this.initialized,
        maxImages: this.config.maxImages,
        maxFileSize: this.config.maxFileSize,
        supportedTypes: this.config.supportedMimeTypes.length,
        hasResponseProcessor: !!this.responseProcessor
      }
    };
  }

  /**
   * Sets the response processing service for enhanced error handling
   */
  setResponseProcessor(responseProcessor: IResponseProcessingService): void {
    this.responseProcessor = responseProcessor;
    logger.info('Response processor set for MultimodalContentHandler');
  }

  /**
   * Processes Discord attachments into AI-ready format
   */
  async processDiscordAttachments(
    attachments: Collection<string, Attachment>,
    config?: MultimodalConfig
  ): Promise<ProcessedAttachment[]> {
    const mergedConfig = { ...this.config, ...config };
    const processedAttachments: ProcessedAttachment[] = [];
    
    if (!attachments || attachments.size === 0) {
      return processedAttachments;
    }

    logger.info(`Processing ${attachments.size} Discord attachment(s)`);

    // Filter and limit attachments
    const supportedAttachments = Array.from(attachments.values())
      .filter(att => att.contentType && mergedConfig.supportedMimeTypes.includes(att.contentType))
      .slice(0, mergedConfig.maxImages);

    if (supportedAttachments.length < attachments.size) {
      logger.info(`Filtered to ${supportedAttachments.length} supported attachment(s) from ${attachments.size} total`);
    }

    // Process each attachment
    for (const attachment of supportedAttachments) {
      try {
        // Validate attachment first
        const validation = this.validateAttachmentMetadata(attachment, mergedConfig);
        if (!validation.valid && validation.errors) {
          throw new MultimodalProcessingError(
            validation.errors[0],
            'VALIDATION_FAILED',
            attachment.url
          );
        }

        // Process attachment through MediaProcessor
        const processed = await this.mediaProcessor.processAttachment(attachment);
        
        // Validate processed attachment
        const postValidation = this.contentValidator.validateAttachment(processed);
        if (!postValidation.valid && postValidation.errors) {
          throw new MultimodalProcessingError(
            postValidation.errors[0],
            'POST_VALIDATION_FAILED',
            attachment.url
          );
        }
        
        processedAttachments.push(processed);
      } catch (error) {
        logger.error(`Failed to process attachment ${attachment.name}:`, error);
        // Log error with user-friendly message for monitoring
        if (error instanceof Error) {
          const errorMessage = this.getImageErrorMessage(error, 1);
          logger.debug(`User-friendly error message: ${errorMessage}`);
        }
        // Continue processing other attachments
      }
    }

    logger.info(`Successfully processed ${processedAttachments.length} attachment(s)`);
    return processedAttachments;
  }

  /**
   * Fetches and processes images from URLs
   */
  async fetchAndProcessImages(
    imageUrls: string[],
    config?: MultimodalConfig
  ): Promise<ProcessedAttachment[]> {
    const mergedConfig = { ...this.config, ...config };
    const processedAttachments: ProcessedAttachment[] = [];

    if (!imageUrls || imageUrls.length === 0) {
      return processedAttachments;
    }

    logger.info(`Fetching ${imageUrls.length} image(s) from URL(s)`);

    // Limit number of images
    const urlsToProcess = imageUrls.slice(0, mergedConfig.maxImages);

    for (const url of urlsToProcess) {
      try {
        const processed = await this.fetchAndProcessSingleImage(url, mergedConfig);
        processedAttachments.push(processed);
      } catch (error) {
        logger.error(`Failed to fetch/process image from ${url}:`, error);
        if (error instanceof Error) {
          const errorMessage = this.getImageErrorMessage(error, 1);
          logger.debug(`User-friendly error message: ${errorMessage}`);
        }
      }
    }

    logger.info(`Successfully processed ${processedAttachments.length} image(s) from URL(s)`);
    return processedAttachments;
  }

  /**
   * Builds multimodal content combining text and attachments
   */
  buildMultimodalContent(
    text: string,
    attachments: ProcessedAttachment[]
  ): MultimodalContent {
    const content: MultimodalContent = {
      text: text || '',
      attachments: attachments || [],
      apiContent: undefined
    };

    if (attachments && attachments.length > 0) {
      logger.info(`Building multimodal content with ${attachments.length} attachment(s)`);
    }

    return content;
  }

  /**
   * Processes and enhances multimodal content for responses
   */
  async processMultimodalContent(
    text: string,
    attachments: ProcessedAttachment[],
    provider: 'gemini' | 'openai' = 'gemini'
  ): Promise<MultimodalContent> {
    // Build basic multimodal content
    const content = this.buildMultimodalContent(text, attachments);
    
    // Convert to provider format
    if (attachments && attachments.length > 0) {
      content.apiContent = this.buildProviderContent(text, attachments, provider);
    }
    
    return content;
  }

  /**
   * Converts attachments to provider-specific format
   */
  convertToProviderFormat(
    attachments: ProcessedAttachment[],
    provider: 'gemini' | 'openai'
  ): unknown {
    if (!attachments || attachments.length === 0) {
      return provider === 'gemini' ? [] : null;
    }

    // Validate attachments for provider
    for (const attachment of attachments) {
      const validation = this.contentValidator.validateForProvider(attachment, provider);
      if (!validation.valid && validation.errors) {
        throw new MultimodalProcessingError(
          validation.errors[0],
          'PROVIDER_VALIDATION_FAILED'
        );
      }
    }

    switch (provider) {
    case 'gemini':
      return this.convertToGeminiParts(attachments);
    case 'openai':
      return this.convertToOpenAIFormat(attachments);
    default:
      throw new MultimodalProcessingError(
        `Unsupported provider: ${provider}`,
        'UNSUPPORTED_PROVIDER'
      );
    }
  }

  /**
   * Validates image data and format
   */
  validateImageData(
    attachment: ProcessedAttachment,
    config?: MultimodalConfig
  ): ValidationResult {
    const mergedConfig = { ...this.config, ...config };
    const validator = new ContentValidator(mergedConfig);
    return validator.validateAttachment(attachment);
  }

  /**
   * Builds provider-specific multimodal API content
   */
  buildProviderContent(
    text: string,
    attachments: ProcessedAttachment[] | undefined,
    provider: 'gemini' | 'openai'
  ): unknown {
    switch (provider) {
    case 'gemini':
      return this.buildGeminiContent(text, attachments);
    case 'openai':
      return this.buildOpenAIContent(text, attachments);
    default:
      throw new MultimodalProcessingError(
        `Unsupported provider: ${provider}`,
        'UNSUPPORTED_PROVIDER'
      );
    }
  }

  /**
   * Detects and processes YouTube URLs in text content
   */
  async processYouTubeUrls(
    text: string,
    _config?: MultimodalConfig
  ): Promise<Array<{
    url: string;
    videoId?: string;
    isValid: boolean;
    requiresConfirmation: boolean;
    warningMessage?: string;
    errorMessage?: string;
    estimatedTokenCost?: number;
  }>> {
    const urls = youTubeUrlDetector.detectYouTubeUrls(text);
    const results = [];

    for (const url of urls) {
      const result = await this.mediaProcessor.processYouTubeUrl(url);
      results.push(result);
    }

    return results;
  }

  /**
   * Processes a YouTube video into AI-ready format
   */
  async processYouTubeVideo(
    videoId: string,
    requireUserConfirmation: boolean,
    _config?: MultimodalConfig
  ): Promise<{
    success: boolean;
    attachment?: ProcessedAttachment;
    errorMessage?: string;
    requiresConfirmation?: boolean;
    warningMessage?: string;
  }> {
    return this.mediaProcessor.processYouTubeVideo(videoId, requireUserConfirmation);
  }

  /**
   * Private helper methods
   */

  private getImageErrorMessage(error: Error, attachmentCount: number = 1): string {
    if (this.responseProcessor) {
      return this.responseProcessor.getImageProcessingErrorMessage(error, attachmentCount);
    }
    
    const imageText = attachmentCount === 1 ? 'image' : `${attachmentCount} image(s)`;
    return `I encountered an error while processing the ${imageText}. Please ensure they are valid image files and try again.`;
  }

  private validateAttachmentMetadata(attachment: Attachment, config: Required<MultimodalConfig>): ValidationResult {
    const errors: string[] = [];

    if (!attachment.contentType || !config.supportedMimeTypes.includes(attachment.contentType)) {
      if (!attachment.contentType) {
        errors.push('The file type could not be determined. Please ensure you are uploading a valid media file.');
      } else if (attachment.contentType === 'image/gif') {
        errors.push('GIF files are not supported. Please upload PNG, JPEG, or WebP images instead.');
      } else {
        errors.push(`The file type '${attachment.contentType}' is not supported.`);
      }
    }

    if (attachment.size && attachment.size > config.maxFileSize) {
      const fileSizeMB = Math.round(attachment.size / 1024 / 1024);
      const maxSizeMB = Math.round(config.maxFileSize / 1024 / 1024);
      errors.push(`The file is too large (${fileSizeMB}MB). Please use files smaller than ${maxSizeMB}MB.`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  private async fetchAndProcessSingleImage(
    url: string,
    config: Required<MultimodalConfig>
  ): Promise<ProcessedAttachment> {
    const startTime = Date.now();

    try {
      // Validate URL
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new MultimodalProcessingError(
          'Invalid URL protocol',
          'INVALID_URL',
          url
        );
      }

      // Create a mock attachment for the media processor
      const mockAttachment: Attachment = {
        url,
        contentType: 'image/jpeg', // Will be determined from response
        name: url.split('/').pop() || 'image',
        size: 0
      } as Attachment;

      // Fetch to get content type first
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok && response.headers.get('content-type')) {
        mockAttachment.contentType = response.headers.get('content-type')!;
      }

      return await this.mediaProcessor.processImage(mockAttachment);
    } catch (error) {
      if (error instanceof MultimodalProcessingError) {
        throw error;
      }
      
      throw new MultimodalProcessingError(
        `Failed to fetch/process image: ${error instanceof Error ? error.message : String(error)}`,
        'PROCESSING_FAILED',
        url,
        error instanceof Error ? error : undefined
      );
    }
  }

  private convertToGeminiParts(attachments: ProcessedAttachment[]): Part[] {
    return attachments.map((attachment, index) => {
      logger.debug(`Converting attachment ${index + 1} to Gemini Part: ${attachment.filename || 'unnamed'}`);
      
      // Handle YouTube URLs with fileData format
      if (attachment.mimeType === 'video/youtube' && attachment.base64Data.startsWith('http')) {
        logger.info(`Converting YouTube URL to fileData format: ${attachment.base64Data}`);
        return {
          fileData: {
            fileUri: attachment.base64Data
          }
        } as Part;
      }
      
      // Handle video attachments with file URI
      if (attachment.contentType === 'video' && attachment.base64Data.startsWith('gs://')) {
        if (attachment.metadata?.videoMetadata) {
          const { startOffset, endOffset } = attachment.metadata.videoMetadata;
          return {
            fileData: {
              mimeType: attachment.mimeType,
              fileUri: attachment.base64Data
            },
            videoMetadata: {
              startOffset,
              endOffset
            }
          };
        }
        return createPartFromUri(attachment.base64Data, attachment.mimeType);
      }
      
      // Handle inline video attachments (base64 encoded)
      if (attachment.mimeType?.startsWith('video/') || attachment.contentType === 'video') {
        logger.info(`Converting inline video to Gemini Part: ${attachment.filename} (${attachment.mimeType})`);
        return {
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.base64Data
          }
        } as Part;
      }
      
      // Handle audio attachments
      if (attachment.mimeType?.startsWith('audio/') || attachment.contentType === 'audio') {
        logger.info(`Converting audio to Gemini Part: ${attachment.filename} (${attachment.mimeType})`);
        return {
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.base64Data
          }
        } as Part;
      }
      
      // Handle image attachments with base64
      return createPartFromBase64(attachment.base64Data, attachment.mimeType);
    });
  }

  private convertToOpenAIFormat(attachments: ProcessedAttachment[]): unknown {
    return attachments.map(attachment => ({
      type: 'image_url',
      image_url: {
        url: `data:${attachment.mimeType};base64,${attachment.base64Data}`,
        detail: 'auto'
      }
    }));
  }

  private buildGeminiContent(text: string, attachments?: ProcessedAttachment[]): Content {
    const parts: Part[] = [];
    
    if (text) {
      parts.push(createPartFromText(text));
    }
    
    if (attachments && attachments.length > 0) {
      const mediaParts = this.convertToGeminiParts(attachments);
      parts.push(...mediaParts);
      
      const mediaTypes = this.getMediaTypeSummary(attachments);
      if (mediaTypes.length > 0) {
        logger.info(`Built Gemini content with ${mediaTypes.join(' and ')}`);
      }
    }
    
    return {
      role: 'user',
      parts
    };
  }

  private buildOpenAIContent(text: string, attachments?: ProcessedAttachment[]): unknown {
    const content: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [];
    
    if (text) {
      content.push({ type: 'text', text });
    }
    
    if (attachments && attachments.length > 0) {
      const imageContent = this.convertToOpenAIFormat(attachments) as Array<{ type: string; image_url: { url: string; detail: string } }>;
      content.push(...imageContent);
      logger.info(`Built OpenAI content with ${attachments.length} image(s)`);
    }
    
    return {
      role: 'user',
      content
    };
  }

  private getMediaTypeSummary(attachments: ProcessedAttachment[]): string[] {
    const videoCount = attachments.filter(a => a.mimeType?.startsWith('video/') || a.contentType === 'video').length;
    const audioCount = attachments.filter(a => a.mimeType?.startsWith('audio/') || a.contentType === 'audio').length;
    const imageCount = attachments.length - videoCount - audioCount;
    
    const mediaTypes = [];
    if (imageCount > 0) mediaTypes.push(`${imageCount} image(s)`);
    if (videoCount > 0) mediaTypes.push(`${videoCount} video(s)`);
    if (audioCount > 0) mediaTypes.push(`${audioCount} audio file(s)`);
    
    return mediaTypes;
  }
}