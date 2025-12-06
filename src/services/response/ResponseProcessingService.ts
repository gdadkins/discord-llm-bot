/**
 * Response Processing Service - Handles AI response validation, formatting, and delivery
 * 
 * Extracted from GeminiService to improve separation of concerns and enable reuse
 * across different AI providers.
 */

import { FinishReason, BlockReason } from '@google/generative-ai';
import { logger } from '../../utils/logger';
import { formatThinkingResponse } from '../../utils/thinkingFormatter';
import type { 
  IResponseProcessingService, 
  ResponseProcessingConfig, 
  ProcessedResponse, 
  RawAPIResponse
} from '../interfaces/ResponseProcessingInterfaces';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import type { ProcessedAttachment } from '../interfaces/MultimodalContentInterfaces'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PerformanceMetadata } from '../../types';

/**
 * Extended part interface with role information
 */
interface ExtendedResponsePart {
  text?: string;
  thought?: boolean;
  thinking?: string;
  thoughtText?: string;
  role?: string;
}

/**
 * Thinking metadata for response formatting
 */
interface ThinkingMetadata {
  confidence?: number;
  complexity?: 'low' | 'medium' | 'high';
  tokenCount?: number;
}

/**
 * Response Processing Service Implementation
 * 
 * Handles all aspects of AI response processing including:
 * - Response structure validation and text extraction
 * - Safety filter and content blocking handling
 * - Thinking mode text processing and formatting
 * - Discord-compatible message formatting
 * - User-friendly error message generation
 */
export class ResponseProcessingService implements IResponseProcessingService {
  private initialized = false;

  constructor() {
    logger.info('ResponseProcessingService initialized');
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('ResponseProcessingService already initialized');
      return;
    }

    logger.info('Initializing ResponseProcessingService...');
    this.initialized = true;
    logger.info('ResponseProcessingService initialization complete');
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Shutting down ResponseProcessingService...');
    this.initialized = false;
    logger.info('ResponseProcessingService shutdown complete');
  }

  getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.initialized,
      name: 'ResponseProcessingService',
      errors: this.initialized ? [] : ['Service not initialized'],
      metrics: {
        initialized: this.initialized
      }
    };
  }

  /**
   * Processes raw API response into formatted text ready for Discord
   */
  async processAPIResponse(
    response: RawAPIResponse | unknown,
    config: ResponseProcessingConfig
  ): Promise<ProcessedResponse> {
    try {
      // Validate response exists and is an object
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response: not an object');
      }

      const res = response as RawAPIResponse;

      // Validate critical properties exist before using
      if (!('candidates' in res) && !('promptFeedback' in res)) {
        throw new Error('Invalid response structure: missing candidates and promptFeedback');
      }

      const warnings: string[] = [];

      // Check for prompt feedback (blocked before processing)
      if (res.promptFeedback?.blockReason) {
        const message = this.getBlockedContentMessage(res.promptFeedback.blockReason);
        logger.warn(`Request blocked at prompt level: ${res.promptFeedback.blockReason}`);
        
        return {
          text: message,
          hasThinking: false,
          thinkingLength: 0,
          wasTruncated: false,
          warnings: [`Blocked at prompt level: ${res.promptFeedback.blockReason}`]
        };
      }

      // Validate candidates array
      if (!res.candidates || res.candidates.length === 0) {
        logger.warn('No candidates in response');
        throw new Error('No response candidates generated');
      }

      const candidate = res.candidates[0];

      // Check finish reason for various blocking conditions
      if (candidate.finishReason && candidate.finishReason !== FinishReason.STOP) {
        const message = this.getFinishReasonMessage(candidate.finishReason);
        logger.warn(`Response finished with reason: ${candidate.finishReason}`);

        // For some finish reasons, we should return the message instead of throwing
        if (this.shouldReturnMessageForFinishReason(candidate.finishReason)) {
          return {
            text: message,
            hasThinking: false,
            thinkingLength: 0,
            wasTruncated: false,
            warnings: [`Finished with reason: ${candidate.finishReason}`]
          };
        }

        // For others, throw error to trigger retry
        throw new Error(`Response blocked: ${candidate.finishReason}`);
      }

      // Extract text content and thinking
      const { text, thinkingText } = this.extractResponseText(response);

      if (!text || text.trim() === '') {
        logger.warn('Empty text in response');
        throw new Error('Empty response text');
      }

      // Process thinking mode if enabled and thinking text exists
      let finalText = text;
      let hasThinking = false;
      let thinkingLength = 0;
      let wasTruncated = false;

      if (config.includeThoughts && thinkingText && config.thinkingBudget > 0) {
        hasThinking = true;
        thinkingLength = thinkingText.length;
        
        // Calculate thinking metadata for enhanced formatting
        const thinkingMetadata = {
          tokenCount: thinkingLength, // Approximate tokens by character count
          complexity: this.calculateComplexityFromBudget(config.thinkingBudget),
          confidence: undefined // Can be added later if API provides confidence scores
        };
        
        // Format thinking with response within Discord limits
        finalText = this.formatThinkingResponse(thinkingText, text, config.maxMessageLength, thinkingMetadata);
        
        // Check if response was truncated due to length
        if (finalText.length < (thinkingText.length + text.length)) {
          wasTruncated = true;
          warnings.push('Response truncated to fit Discord message limits');
        }

        logger.info(`Processed thinking response (thinking: ${thinkingLength} chars, final: ${finalText.length} chars)`);
      } else if (thinkingText) {
        // Thinking text found but not included
        thinkingLength = thinkingText.length;
        logger.info(`Thinking text found but not included (${thinkingLength} chars, includeThoughts: ${config.includeThoughts})`);
      }

      // Clean up duplicate URLs in markdown format
      finalText = this.cleanupDuplicateUrls(finalText);

      // Ensure final text doesn't exceed Discord limits
      if (finalText.length > config.maxMessageLength) {
        finalText = finalText.substring(0, config.maxMessageLength - 3) + '...';
        wasTruncated = true;
        warnings.push('Response truncated to fit Discord message limits');
      }

      // Handle multimodal responses if configured
      let processedResult: ProcessedResponse = {
        text: finalText,
        hasThinking,
        thinkingLength,
        wasTruncated,
        warnings,
        isMultimodal: config.isMultimodal
      };

      if (config.isMultimodal && config.processedAttachments) {
        processedResult = this.processMultimodalResponse(processedResult, config);
      }

      logger.info('Response processing completed successfully');
      
      return processedResult;

    } catch (error) {
      logger.error('Error processing API response:', error);
      
      if (error instanceof Error) {
        throw error; // Re-throw with original message
      }
      
      throw new Error('Failed to process API response. Please try again.');
    }
  }

  /**
   * Generates user-friendly error message for blocked content
   */
  getBlockedContentMessage(reason: BlockReason): string {
    switch (reason) {
    case BlockReason.SAFETY:
      return 'Your request was blocked by safety filters. Try rephrasing with different language.';
    case (BlockReason as any).BLOCKLIST:
      return 'Your request contains blocked terminology. Please use different wording.';
    case (BlockReason as any).PROHIBITED_CONTENT:
      return 'Your request relates to prohibited content. Please ask about something else.';
    case BlockReason.OTHER:
      return 'Your request was blocked for policy reasons. Try rephrasing your question.';
    default:
      return 'Your request was blocked. Please try rephrasing your question.';
    }
  }

  /**
   * Generates user-friendly message for response finish reasons
   */
  getFinishReasonMessage(reason: FinishReason): string {
    switch (reason) {
    case FinishReason.SAFETY:
      return 'I couldn\'t complete that response due to safety guidelines. Try rephrasing your request!';
    case FinishReason.MAX_TOKENS:
      return 'My response was too long and got cut off. Try asking for a shorter response or break your question into smaller parts. (Tip: Complex questions with thinking mode may need more tokens)';
    case FinishReason.RECITATION:
      return 'I detected potential copyright material in my response. Let me try a different approach to your question.';
    case (FinishReason as any).LANGUAGE:
      return 'I encountered a language processing issue. Could you try rephrasing your message?';
    case (FinishReason as any).BLOCKLIST:
      return 'Your request contains terms that I can\'t process. Please rephrase without any restricted content.';
    case (FinishReason as any).PROHIBITED_CONTENT:
      return 'I can\'t generate content related to that topic. Try asking about something else!';
    case (FinishReason as any).SPII:
      return 'I detected potentially sensitive personal information. Please avoid sharing private details.';
    case (FinishReason as any).MALFORMED_FUNCTION_CALL:
      return 'There was a technical issue with function calling. This shouldn\'t happen - please try again.';
    case FinishReason.OTHER:
      return 'I encountered an unexpected issue while generating the response. Please try again.';
    default:
      return 'I encountered an unknown issue while generating the response. Please try again.';
    }
  }

  /**
   * Formats thinking text with response text for Discord display
   */
  formatThinkingResponse(thinkingText: string, responseText: string, maxLength: number, metadata?: PerformanceMetadata): string {
    // Convert PerformanceMetadata to the expected thinking metadata format
    const thinkingMetadata: ThinkingMetadata | undefined = metadata ? {
      confidence: this.isValidNumber(metadata.confidence) ? metadata.confidence : undefined,
      complexity: this.isValidComplexity(metadata.complexity) ? metadata.complexity : undefined,
      tokenCount: this.isValidNumber(metadata.tokenCount) ? metadata.tokenCount : undefined
    } : undefined;
    
    return formatThinkingResponse(thinkingText, responseText, maxLength, thinkingMetadata);
  }
  
  /**
   * Type guard for complexity levels
   */
  private isValidComplexity(value: unknown): value is 'low' | 'medium' | 'high' {
    return typeof value === 'string' && ['low', 'medium', 'high'].includes(value);
  }
  
  /**
   * Type guard for valid numbers
   */
  private isValidNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value);
  }
  
  /**
   * Calculates complexity level based on thinking budget
   */
  private calculateComplexityFromBudget(budget: number): 'low' | 'medium' | 'high' {
    if (budget >= 20000) return 'high';
    if (budget >= 10000) return 'medium';
    return 'low';
  }

  /**
   * Validates response structure and extracts text content
   */
  extractResponseText(response: RawAPIResponse | unknown): { text: string; thinkingText: string | null } {
    if (!response) {
      throw new Error('No response to extract text from');
    }

    const res = response as RawAPIResponse;
    let text = '';
    let thinkingText: string | null = null;

    // Debug log the response structure
    logger.debug('=== EXTRACTING RESPONSE TEXT ===');
    logger.debug('Response type:', typeof response);
    logger.debug('Response keys:', Object.keys(res));

    // Try to get text from the response object
    if (res.text) {
      if (typeof res.text === 'function') {
        text = res.text();
        logger.debug('Got text from res.text() function');
      } else if (typeof res.text === 'string') {
        text = res.text;
        logger.debug('Got text from res.text string');
      }
    } else if (res.candidates && res.candidates.length > 0) {
      // Extract from content parts
      const candidate = res.candidates[0];
      logger.debug('Candidate keys:', Object.keys(candidate));

      // Check for thinking in grounding metadata first
      if (candidate.groundingMetadata?.thoughts) {
        thinkingText = String(candidate.groundingMetadata.thoughts);
        logger.debug('Found thinking in groundingMetadata.thoughts');
      }

      if (candidate.content?.parts && candidate.content.parts.length > 0) {
        const parts = candidate.content.parts;
        logger.debug(`Found ${parts.length} parts in content`);

        // Separate thinking and response parts
        const thinkingParts: string[] = [];
        const responseParts: string[] = [];

        parts.forEach((part, index) => {
          logger.debug(`Part ${index} keys:`, Object.keys(part));
          
          // Cast to extended part interface for role access
          const extendedPart = part as ExtendedResponsePart;
          
          // Log part content preview with role information
          const partPreview = {
            text: part.text ? part.text.substring(0, 100) + '...' : 'none',
            thought: part.thought,
            role: extendedPart.role,
            thinking: part.thinking ? 'present' : 'none',
            thoughtText: part.thoughtText ? 'present' : 'none'
          };
          logger.debug(`Part ${index} content preview:`, partPreview);

          // Enhanced thinking detection - check both part.thought and part.role
          const isThinkingPart = part.thought === true || 
                                extendedPart.role === 'model-thinking' ||
                                extendedPart.role === 'thinking';

          if (isThinkingPart && part.text) {
            logger.debug(`Part ${index} identified as thinking content (thought=${part.thought}, role=${extendedPart.role})`);
            thinkingParts.push(String(part.text));
          } else if (part.text) {
            // Regular response text
            responseParts.push(String(part.text));
          }

          // Also check dedicated thinking properties
          if (part.thinking && typeof part.thinking === 'string') {
            logger.debug(`Part ${index} has thinking property`);
            thinkingParts.push(String(part.thinking));
          }

          if (part.thoughtText && typeof part.thoughtText === 'string') {
            logger.debug(`Part ${index} has thoughtText property`);
            thinkingParts.push(String(part.thoughtText));
          }
        });

        // Combine parts - join thinking parts with double newline for better separation
        if (thinkingParts.length > 0) {
          thinkingText = thinkingParts.join('\n\n').trim();
          logger.info(`Accumulated ${thinkingParts.length} thinking sections (${thinkingText.length} chars total)`);
        }
        
        // Join response parts without separator (they're continuous text)
        text = responseParts.join('').trim();
        logger.info(`Accumulated ${responseParts.length} response sections (${text.length} chars total)`);
      }
    }

    // Additional thinking text extraction for Gemini 2.5 format
    if (!thinkingText && res.candidates && res.candidates.length > 0) {
      const candidate = res.candidates[0];
      
      if (candidate.content?.parts && candidate.content.parts.length > 1) {
        // Look for thinking patterns in the text itself
        const fullText = candidate.content.parts.map(p => p.text || '').join('');
        
        // Check for common thinking markers
        const thinkingMarkers = [
          { start: '<thinking>', end: '</thinking>' },
          { start: '<thought>', end: '</thought>' },
          { start: '```thinking', end: '```' },
          { start: '{{thinking}}', end: '{{/thinking}}' },
          { start: '**Thinking:**', end: '**Response:**' },
          { start: '**Reasoning:**', end: '**Answer:**' },
          { start: '1. First, your detailed thinking', end: '2. Then, your final answer' }
        ];

        for (const marker of thinkingMarkers) {
          const startIdx = fullText.indexOf(marker.start);
          const endIdx = fullText.indexOf(marker.end, startIdx + marker.start.length);

          if (startIdx !== -1 && endIdx !== -1) {
            thinkingText = fullText.substring(startIdx + marker.start.length, endIdx).trim();
            // Remove thinking from main text
            text = fullText.substring(0, startIdx) + fullText.substring(endIdx + marker.end.length);
            logger.debug(`Found thinking text using ${marker.start} markers`);
            break;
          }
        }

        // Alternative: Check if the response has a clear separation between thinking and response
        if (!thinkingText && fullText.includes('\n\nResponse:') && fullText.includes('Thinking:')) {
          const thinkingStart = fullText.indexOf('Thinking:');
          const responseStart = fullText.indexOf('\n\nResponse:');
          if (thinkingStart < responseStart) {
            thinkingText = fullText.substring(thinkingStart + 9, responseStart).trim();
            text = fullText.substring(responseStart + 11).trim();
            logger.debug('Found thinking text using Thinking:/Response: format');
          }
        }
      }
    }

    if (!text || text.trim() === '') {
      throw new Error('No text content found in response');
    }

    logger.debug(`Extracted text: ${text.length} chars, thinking: ${thinkingText?.length || 0} chars`);
    
    return { text: text.trim(), thinkingText };
  }

  /**
   * Determines if a finish reason should return a message instead of throwing an error
   */
  private shouldReturnMessageForFinishReason(finishReason: FinishReason): boolean {
    return [
      FinishReason.SAFETY,
      (FinishReason as any).BLOCKLIST,
      (FinishReason as any).PROHIBITED_CONTENT,
      (FinishReason as any).SPII,
      FinishReason.MAX_TOKENS  // Don't retry MAX_TOKENS - return friendly message
    ].includes(finishReason);
  }

  /**
   * Processes multimodal response with image/video context awareness
   */
  processMultimodalResponse(
    response: ProcessedResponse,
    config: ResponseProcessingConfig
  ): ProcessedResponse {
    if (!config.isMultimodal || !config.processedAttachments) {
      return response;
    }

    const videoAttachments = config.processedAttachments.filter(a => a.contentType === 'video');
    const imageAttachments = config.processedAttachments.filter(a => a.contentType !== 'video');
    
    logger.info(`Processing multimodal response with ${imageAttachments.length} image(s) and ${videoAttachments.length} video(s)`);

    // Check for partial video processing messages
    const partialVideoMessages: string[] = [];
    videoAttachments.forEach(attachment => {
      if (attachment.metadata?.partialProcessingMessage) {
        partialVideoMessages.push(attachment.metadata.partialProcessingMessage);
      }
    });

    // Add partial processing messages to the beginning of the response
    if (partialVideoMessages.length > 0) {
      const partialInfo = partialVideoMessages.join('\n\n');
      response.text = `${partialInfo}\n\n---\n\n${response.text}`;
      response.warnings.push('Video partially processed due to token limits');
    }

    // Add image context to response
    if (imageAttachments.length > 0) {
      const imageContext = imageAttachments.length === 1 
        ? 'Based on the image provided'
        : `Based on the ${imageAttachments.length} images provided`;

      // Check if response already references the images
      const hasImageReference = response.text.toLowerCase().includes('image') || 
                               response.text.toLowerCase().includes('picture') ||
                               response.text.toLowerCase().includes('photo') ||
                               response.text.toLowerCase().includes('visual');

      // If the response doesn't reference images and it's clearly an image analysis,
      // we might want to add context (but this is optional based on response quality)
      if (!hasImageReference) {
        response.imageContext = imageContext;
      }
    }

    // Add multimodal flag
    response.isMultimodal = true;

    // Log processing details
    config.processedAttachments.forEach((attachment, index) => {
      if (attachment.contentType === 'video') {
        logger.debug(`Video ${index + 1}: ${attachment.filename || 'unnamed'} (duration: ${attachment.metadata?.duration}s)`);
      } else {
        logger.debug(`Image ${index + 1}: ${attachment.filename || 'unnamed'} (${attachment.mimeType}, ${Math.round((attachment.size || 0) / 1024)}KB)`);
      }
    });

    return response;
  }

  /**
   * Generates image processing error messages
   */
  getImageProcessingErrorMessage(
    error: Error,
    attachmentCount: number
  ): string {
    const imageText = attachmentCount === 1 ? 'image' : `${attachmentCount} image(s)`;
    const errorMessage = error.message.toLowerCase();
    
    // Check for specific error types and provide actionable advice
    if (errorMessage.includes('size') || errorMessage.includes('large') || errorMessage.includes('limit')) {
      return `I couldn't process the ${imageText} because they exceed the 20MB size limit. Please compress your images or use smaller ones.`;
    }
    
    if (errorMessage.includes('format') || errorMessage.includes('type') || errorMessage.includes('unsupported')) {
      return `I couldn't process the ${imageText} because the format isn't supported. Please use JPEG, PNG, or WebP images (GIF isn't supported yet).`;
    }
    
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('download')) {
      return `I couldn't download the ${imageText}. This might be a temporary network issue - please try uploading them again.`;
    }
    
    if (errorMessage.includes('corrupt') || errorMessage.includes('invalid') || errorMessage.includes('base64')) {
      return `The ${imageText} appear to be corrupted or damaged. Please try with different images.`;
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return `Processing the ${imageText} took too long. Try uploading fewer images or smaller files.`;
    }
    
    if (errorMessage.includes('url') || errorMessage.includes('link')) {
      return `I couldn't access the ${imageText} from the provided URL. Please check the link or upload the images directly.`;
    }
    
    // Generic error message with helpful guidance
    return `I encountered an error while processing the ${imageText}. Please ensure they are valid image files (JPEG, PNG, or WebP) under 20MB each and try again.`;
  }

  /**
   * Cleans up duplicate URLs in markdown format where the link text and URL are the same
   * Converts [https://example.com](https://example.com) to just https://example.com
   */
  private cleanupDuplicateUrls(text: string): string {
    // Regular expression to match markdown links where the text and URL are identical
    const duplicateUrlPattern = /\[([^\]]+)\]\((\1)\)/g;
    
    // Replace duplicate URLs with just the URL
    const cleanedText = text.replace(duplicateUrlPattern, '$1');
    
    // Log if any URLs were cleaned up
    const matches = text.match(duplicateUrlPattern);
    if (matches && matches.length > 0) {
      logger.debug(`Cleaned up ${matches.length} duplicate URL(s) in response`);
    }
    
    return cleanedText;
  }
}