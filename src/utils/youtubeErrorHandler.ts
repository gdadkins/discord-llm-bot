/**
 * YouTube Error Handling Utilities
 * 
 * Specialized error handling for YouTube URL detection and video processing.
 * Provides user-friendly error messages and appropriate fallback strategies.
 */

import { logger } from './logger';
import type { YouTubeUrlValidation } from '../services/multimodal/detectors/YouTubeUrlDetector';

/**
 * YouTube-specific error types
 */
export type YouTubeErrorType = 
  | 'INVALID_URL'
  | 'UNSUPPORTED_FORMAT'
  | 'PRIVATE_VIDEO'
  | 'VIDEO_NOT_FOUND'
  | 'DURATION_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'PROCESSING_ERROR';

/**
 * YouTube error details
 */
export interface YouTubeError {
  type: YouTubeErrorType;
  message: string;
  userMessage: string;
  recoverable: boolean;
  videoId?: string;
  originalUrl?: string;
  details?: unknown;
}

/**
 * YouTube Error Handler Class
 */
export class YouTubeErrorHandler {
  /**
   * Creates a YouTube error from validation result
   */
  static fromValidation(validation: YouTubeUrlValidation): YouTubeError {
    const errorType = validation.errorCode || 'PROCESSING_ERROR';
    const message = validation.error || 'Unknown validation error';
    
    return {
      type: errorType,
      message,
      userMessage: this.getUserFriendlyMessage(errorType, message),
      recoverable: this.isRecoverable(errorType),
      videoId: validation.videoId,
      originalUrl: validation.originalUrl
    };
  }

  /**
   * Creates a YouTube error from exception
   */
  static fromException(error: Error, context?: { videoId?: string; url?: string }): YouTubeError {
    let errorType: YouTubeErrorType = 'PROCESSING_ERROR';
    
    // Classify error based on message content
    if (error.message.includes('network') || error.message.includes('fetch')) {
      errorType = 'NETWORK_ERROR';
    } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
      errorType = 'QUOTA_EXCEEDED';
    } else if (error.message.includes('API') || error.message.includes('youtube')) {
      errorType = 'API_ERROR';
    }

    return {
      type: errorType,
      message: error.message,
      userMessage: this.getUserFriendlyMessage(errorType, error.message),
      recoverable: this.isRecoverable(errorType),
      videoId: context?.videoId,
      originalUrl: context?.url,
      details: error.stack
    };
  }

  /**
   * Gets user-friendly error message
   */
  static getUserFriendlyMessage(errorType: YouTubeErrorType, originalMessage?: string): string {
    switch (errorType) {
    case 'INVALID_URL':
      return 'The provided URL is not a valid YouTube link. Please check the URL and try again.';
      
    case 'UNSUPPORTED_FORMAT':
      return 'This YouTube URL format is not supported. Please use a standard YouTube video link.';
      
    case 'PRIVATE_VIDEO':
      return 'This video is private, unlisted, or has been removed. Only public YouTube videos can be processed.';
      
    case 'VIDEO_NOT_FOUND':
      return 'The YouTube video could not be found. It may have been deleted or made private.';
      
    case 'DURATION_LIMIT_EXCEEDED':
      return originalMessage || 'This video is too long to process. Please use videos shorter than 3 minutes.';
      
    case 'QUOTA_EXCEEDED':
      return 'YouTube processing quota has been exceeded. Please try again later or contact an administrator.';
      
    case 'API_ERROR':
      return 'There was an issue accessing YouTube\'s services. Please try again in a few minutes.';
      
    case 'NETWORK_ERROR':
      return 'Network connection issue while accessing YouTube. Please check your connection and try again.';
      
    case 'PROCESSING_ERROR':
    default:
      return 'An error occurred while processing the YouTube video. Please try again or contact support if the issue persists.';
    }
  }

  /**
   * Determines if error is recoverable with retry
   */
  static isRecoverable(errorType: YouTubeErrorType): boolean {
    switch (errorType) {
    case 'NETWORK_ERROR':
    case 'API_ERROR':
    case 'PROCESSING_ERROR':
      return true;
      
    case 'QUOTA_EXCEEDED':
      return false; // Needs time/admin intervention
      
    case 'INVALID_URL':
    case 'UNSUPPORTED_FORMAT':
    case 'PRIVATE_VIDEO':
    case 'VIDEO_NOT_FOUND':
    case 'DURATION_LIMIT_EXCEEDED':
    default:
      return false; // User needs to fix input
    }
  }

  /**
   * Generates actionable user guidance
   */
  static getActionableGuidance(error: YouTubeError): string {
    const baseMessage = error.userMessage;
    
    switch (error.type) {
    case 'INVALID_URL':
      return `${baseMessage}\n\n✅ **Supported formats:**\n• https://youtube.com/watch?v=VIDEO_ID\n• https://youtu.be/VIDEO_ID\n• https://youtube.com/shorts/VIDEO_ID`;
      
    case 'PRIVATE_VIDEO':
      return `${baseMessage}\n\n✅ **To fix this:** Make sure the video is public and not unlisted.`;
      
    case 'DURATION_LIMIT_EXCEEDED':
      return `${baseMessage}\n\n✅ **Tip:** Try using shorter clips or highlight videos for analysis.`;
      
    case 'QUOTA_EXCEEDED':
      return `${baseMessage}\n\n⏰ **This is temporary** - YouTube processing will be available again soon.`;
      
    case 'NETWORK_ERROR':
    case 'API_ERROR':
      return `${baseMessage}\n\n🔄 **You can retry** this request in a few minutes.`;
      
    default:
      return baseMessage;
    }
  }

  /**
   * Logs YouTube error with appropriate level
   */
  static logError(error: YouTubeError, context?: string): void {
    const logContext = {
      type: error.type,
      videoId: error.videoId,
      url: error.originalUrl,
      recoverable: error.recoverable,
      context
    };

    if (error.recoverable) {
      logger.warn(`YouTube processing error (recoverable): ${error.message}`, logContext);
    } else {
      logger.info(`YouTube processing error (user fixable): ${error.message}`, logContext);
    }

    // Log full details for debugging
    if (error.details) {
      logger.debug('YouTube error details:', error.details);
    }
  }

  /**
   * Creates enhanced error response for Discord
   */
  static createDiscordErrorResponse(error: YouTubeError, includeGuidance = true): string {
    const guidance = includeGuidance ? this.getActionableGuidance(error) : error.userMessage;
    
    if (error.recoverable) {
      return `⚠️ **Temporary Issue**\n\n${guidance}`;
    } else {
      return `❌ **YouTube Processing Error**\n\n${guidance}`;
    }
  }
}

/**
 * Utility function to handle YouTube operations with error wrapping
 */
export async function withYouTubeErrorHandling<T>(
  operation: () => Promise<T>,
  context?: { videoId?: string; url?: string }
): Promise<{ success: true; data: T } | { success: false; error: YouTubeError }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const youtubeError = error instanceof Error 
      ? YouTubeErrorHandler.fromException(error, context)
      : YouTubeErrorHandler.fromException(new Error(String(error)), context);
    
    YouTubeErrorHandler.logError(youtubeError, 'withYouTubeErrorHandling');
    return { success: false, error: youtubeError };
  }
}

/**
 * Validates YouTube error response format for consistent API responses
 */
export function isYouTubeErrorResponse(obj: unknown): obj is { success: false; error: YouTubeError } {
  return obj !== null && 
    typeof obj === 'object' && 
    'success' in obj &&
    obj.success === false && 
    'error' in obj &&
    obj.error !== null &&
    typeof obj.error === 'object' &&
    'type' in obj.error &&
    'message' in obj.error &&
    'userMessage' in obj.error &&
    'recoverable' in obj.error &&
    typeof (obj.error as YouTubeError).type === 'string' &&
    typeof (obj.error as YouTubeError).message === 'string' &&
    typeof (obj.error as YouTubeError).userMessage === 'string' &&
    typeof (obj.error as YouTubeError).recoverable === 'boolean';
}

// Export singleton instance for convenience
export const youTubeErrorHandler = YouTubeErrorHandler;