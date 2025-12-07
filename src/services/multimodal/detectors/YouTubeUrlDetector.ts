/**
 * YouTube URL Detection and Processing Utility
 * 
 * Provides comprehensive YouTube URL detection, validation, and processing
 * for video support in Discord messages. Supports multiple YouTube URL formats
 * and includes safety checks for video accessibility and duration limits.
 */

import { logger } from '../../../utils/logger';
// import { YouTubeErrorHandler, withYouTubeErrorHandling } from './youtubeErrorHandler';

/**
 * YouTube URL validation result
 */
export interface YouTubeUrlValidation {
  isValid: boolean;
  videoId?: string;
  originalUrl?: string;
  error?: string;
  errorCode?: 'INVALID_URL' | 'UNSUPPORTED_FORMAT' | 'PRIVATE_VIDEO' | 'VIDEO_NOT_FOUND' | 'DURATION_LIMIT_EXCEEDED';
}

/**
 * YouTube video metadata for processing
 */
export interface YouTubeVideoInfo {
  videoId: string;
  title?: string;
  duration?: number; // in seconds
  isAccessible: boolean;
  thumbnailUrl?: string;
  channelName?: string;
  estimatedTokenCost?: number;
}

/**
 * Token cost estimation configuration
 */
interface TokenCostConfig {
  baseTokensPerMinute: number;
  maxVideoLengthSeconds: number;
  warningThresholdTokens: number;
  maxTokensPerVideo: number; // Maximum tokens allowed per video (25k limit)
}

/**
 * Default configuration for YouTube processing
 */
const DEFAULT_CONFIG: TokenCostConfig = {
  baseTokensPerMinute: 18000, // ~300 tokens per second * 60 = 18,000 tokens per minute
  maxVideoLengthSeconds: 83, // 83 seconds = 25k tokens at 300 tokens/second
  warningThresholdTokens: 25000, // Updated to match 25k token processing limit
  maxTokensPerVideo: 25000 // Gemini's token limit for video content
};

/**
 * YouTube URL Detection and Processing Utility
 */
export class YouTubeUrlDetector {
  private readonly config: TokenCostConfig;
  
  /**
   * Comprehensive YouTube URL patterns
   * Supports all major YouTube URL formats including shorts
   */
  private readonly YOUTUBE_URL_PATTERNS = [
    // Standard watch URLs
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    // Short URLs
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    // Embed URLs
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    // YouTube Shorts
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    // Mobile URLs
    /(?:https?:\/\/)?m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
  ];

  constructor(config?: Partial<TokenCostConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('YouTubeUrlDetector initialized', {
      maxVideoLength: `${this.config.maxVideoLengthSeconds}s`,
      tokensPerMinute: this.config.baseTokensPerMinute,
      warningThreshold: this.config.warningThresholdTokens,
      maxTokensPerVideo: this.config.maxTokensPerVideo
    });
  }

  /**
   * Detects YouTube URLs in text content
   */
  detectYouTubeUrls(text: string): string[] {
    const urls: string[] = [];
    
    for (const pattern of this.YOUTUBE_URL_PATTERNS) {
      const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        if (match[0] && !urls.includes(match[0])) {
          urls.push(match[0]);
        }
      }
    }
    
    logger.debug(`Detected ${urls.length} YouTube URL(s) in text`, { urls });
    return urls;
  }

  /**
   * Validates a YouTube URL and extracts video ID
   */
  validateYouTubeUrl(url: string): YouTubeUrlValidation {
    if (!url || typeof url !== 'string') {
      return {
        isValid: false,
        error: 'Invalid URL provided',
        errorCode: 'INVALID_URL'
      };
    }

    for (const pattern of this.YOUTUBE_URL_PATTERNS) {
      const match = url.match(pattern);
      if (match && match[1]) {
        const videoId = match[1];
        
        // Validate video ID format (11 characters, alphanumeric + underscore + hyphen)
        if (videoId.length !== 11 || !/^[a-zA-Z0-9_-]+$/.test(videoId)) {
          return {
            isValid: false,
            originalUrl: url,
            error: 'Invalid YouTube video ID format',
            errorCode: 'INVALID_URL'
          };
        }

        return {
          isValid: true,
          videoId,
          originalUrl: url
        };
      }
    }

    return {
      isValid: false,
      originalUrl: url,
      error: 'URL does not match any supported YouTube format',
      errorCode: 'UNSUPPORTED_FORMAT'
    };
  }

  /**
   * Estimates token cost for video processing
   */
  estimateTokenCost(durationSeconds: number): number {
    if (durationSeconds <= 0) return 0;
    
    const durationMinutes = durationSeconds / 60;
    const estimatedTokens = Math.ceil(durationMinutes * this.config.baseTokensPerMinute);
    
    // Cap at max tokens per video
    return Math.min(estimatedTokens, this.config.maxTokensPerVideo);
  }

  /**
   * Checks if video duration exceeds limits
   */
  isDurationAllowed(durationSeconds: number): boolean {
    return durationSeconds > 0 && durationSeconds <= this.config.maxVideoLengthSeconds;
  }

  /**
   * Calculates the maximum processable duration based on token limits
   * @param totalDurationSeconds - Total video duration in seconds
   * @returns Maximum seconds that can be processed within token limits
   */
  calculateProcessableDuration(totalDurationSeconds: number): number {
    // Calculate how many seconds we can process with available tokens
    const tokensPerSecond = this.config.baseTokensPerMinute / 60;
    const maxProcessableSeconds = Math.floor(this.config.maxTokensPerVideo / tokensPerSecond);
    
    // Return the minimum of total duration or max processable
    return Math.min(totalDurationSeconds, maxProcessableSeconds);
  }

  /**
   * Determines if partial processing is needed
   * @param durationSeconds - Video duration in seconds
   * @returns True if video will be partially processed
   */
  needsPartialProcessing(durationSeconds: number): boolean {
    // Calculate actual tokens without capping
    const durationMinutes = durationSeconds / 60;
    const actualTokens = Math.ceil(durationMinutes * this.config.baseTokensPerMinute);
    return actualTokens > this.config.maxTokensPerVideo;
  }

  /**
   * Generates user-friendly duration warning message
   */
  generateDurationWarning(durationSeconds: number): string {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    const maxSeconds = this.config.maxVideoLengthSeconds;
    const estimatedTokens = this.estimateTokenCost(durationSeconds);
    
    return `Video duration (${durationText}) exceeds the 25k token limit (max ${maxSeconds} seconds). ` +
           `This video would require ~${estimatedTokens.toLocaleString()} tokens. ` +
           `I'll process the first ${maxSeconds} seconds of the video.`;
  }

  /**
   * Generates token cost warning message
   */
  generateTokenCostWarning(estimatedTokens: number, durationSeconds: number): string {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    
    // Check if partial processing will occur
    if (this.needsPartialProcessing(durationSeconds)) {
      const processableDuration = this.calculateProcessableDuration(durationSeconds);
      const processableMinutes = Math.floor(processableDuration / 60);
      const processableSeconds = Math.round(processableDuration % 60);
      const processableText = processableMinutes > 0 ? `${processableMinutes}m ${processableSeconds}s` : `${processableSeconds}s`;
      
      return `⚠️ This video (${durationText}) exceeds the token limit. I'll process the first **${processableText}** of the video (approximately ${this.config.maxTokensPerVideo.toLocaleString()} tokens).`;
    }
    
    return `🎥 Processing video (${durationText}) - Using ${estimatedTokens.toLocaleString()} tokens...`;
  }

  /**
   * Generates partial processing notification message
   */
  generatePartialProcessingMessage(totalDuration: number, processedDuration: number): string {
    const totalMinutes = Math.floor(totalDuration / 60);
    const totalSeconds = Math.round(totalDuration % 60);
    const totalText = totalMinutes > 0 ? `${totalMinutes}m ${totalSeconds}s` : `${totalSeconds}s`;
    
    const processedMinutes = Math.floor(processedDuration / 60);
    const processedSeconds = Math.round(processedDuration % 60);
    const processedText = processedMinutes > 0 ? `${processedMinutes}m ${processedSeconds}s` : `${processedSeconds}s`;
    
    const percentage = Math.round((processedDuration / totalDuration) * 100);
    
    return `📹 **Partial Video Analysis**: Processing first ${processedText} of ${totalText} video (${percentage}% coverage) due to token limits.`;
  }

  /**
   * Checks if token cost warning should be shown
   * Now respects REQUIRE_VIDEO_CONFIRMATION environment variable
   */
  shouldShowTokenWarning(estimatedTokens: number): boolean {
    // Check if confirmation is disabled via environment variable
    const requireConfirmation = process.env.REQUIRE_VIDEO_CONFIRMATION !== 'false';
    if (!requireConfirmation) {
      return false; // Never show warnings if confirmation is disabled
    }
    return estimatedTokens >= this.config.warningThresholdTokens;
  }

  /**
   * Creates a mock video info object for testing
   * In a real implementation, this would call YouTube API
   */
  async getMockVideoInfo(videoId: string): Promise<YouTubeVideoInfo> {
    // Mock data for testing - in real implementation would call YouTube Data API
    
    // Special handling for the famous Rick Roll video ID for consistent testing
    if (videoId === 'dQw4w9WgXcQ') {
      const mockDuration = 212; // 3:32 minutes - realistic for Rick Roll
      return {
        videoId,
        title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
        duration: mockDuration,
        isAccessible: true,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        channelName: 'RickAstleyVEVO',
        estimatedTokenCost: this.estimateTokenCost(mockDuration)
      };
    }
    
    // For other video IDs, generate mock data
    const mockDuration = Math.floor(Math.random() * 80) + 10; // 10-90 seconds (realistic range)
    const estimatedTokens = this.estimateTokenCost(mockDuration);
    
    return {
      videoId,
      title: `Mock Video ${videoId.substring(0, 6)}`,
      duration: mockDuration,
      isAccessible: Math.random() > 0.1, // 90% success rate for mock
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      channelName: 'Mock Channel',
      estimatedTokenCost: estimatedTokens
    };
  }

  /**
   * Validates video accessibility and duration
   * This is a placeholder - real implementation would use YouTube Data API
   */
  async validateVideoAccess(videoId: string): Promise<YouTubeUrlValidation> {
    try {
      // In real implementation, this would make API call to YouTube Data API
      // For now, return mock validation based on video ID patterns
      
      // Mock some predictable responses for testing
      if (videoId === 'privateVid') {
        return {
          isValid: false,
          videoId,
          error: 'This video is private, unlisted, or has been removed',
          errorCode: 'PRIVATE_VIDEO'
        };
      }
      
      if (videoId === 'longVideoId') {
        return {
          isValid: false,
          videoId,
          error: this.generateDurationWarning(100), // 100 seconds > 83 limit
          errorCode: 'DURATION_LIMIT_EXCEEDED'
        };
      }

      // For known test video IDs, return successful validation
      const videoInfo = await this.getMockVideoInfo(videoId);
      
      if (!videoInfo.isAccessible) {
        return {
          isValid: false,
          videoId,
          error: 'This video is private, unlisted, or has been removed',
          errorCode: 'PRIVATE_VIDEO'
        };
      }

      if (videoInfo.duration && !this.isDurationAllowed(videoInfo.duration)) {
        return {
          isValid: false,
          videoId,
          error: this.generateDurationWarning(videoInfo.duration),
          errorCode: 'DURATION_LIMIT_EXCEEDED'
        };
      }

      return {
        isValid: true,
        videoId
      };
    } catch (error) {
      logger.error('Error validating video access:', error);
      return {
        isValid: false,
        videoId,
        error: 'Unable to verify video accessibility. The video may not exist or be temporarily unavailable.',
        errorCode: 'VIDEO_NOT_FOUND'
      };
    }
  }

  /**
   * Comprehensive YouTube URL processing workflow
   */
  async processYouTubeUrl(url: string): Promise<{
    isValid: boolean;
    videoInfo?: YouTubeVideoInfo;
    validation: YouTubeUrlValidation;
    requiresConfirmation: boolean;
    warningMessage?: string;
  }> {
    // Step 1: Basic URL validation
    const validation = this.validateYouTubeUrl(url);
    if (!validation.isValid || !validation.videoId) {
      return {
        isValid: false,
        validation,
        requiresConfirmation: false
      };
    }

    // Step 2: Check video accessibility and duration
    const accessValidation = await this.validateVideoAccess(validation.videoId);
    if (!accessValidation.isValid) {
      return {
        isValid: false,
        validation: accessValidation,
        requiresConfirmation: false
      };
    }

    // Step 3: Get video info and check cost
    const videoInfo = await this.getMockVideoInfo(validation.videoId);
    const requiresConfirmation = this.shouldShowTokenWarning(videoInfo.estimatedTokenCost || 0);
    
    let warningMessage: string | undefined;
    // Only show warning if we're doing partial processing (not for confirmation)
    if (!requiresConfirmation && videoInfo.duration && this.needsPartialProcessing(videoInfo.duration)) {
      warningMessage = this.generateTokenCostWarning(videoInfo.estimatedTokenCost || 0, videoInfo.duration);
    }

    return {
      isValid: true,
      videoInfo,
      validation: {
        isValid: true,
        videoId: validation.videoId,
        originalUrl: url
      },
      requiresConfirmation,
      warningMessage
    };
  }

  /**
   * Generates file URI for Gemini API
   */
  generateGeminiFileUri(videoId: string): string {
    // Note: This is a placeholder format
    // Real implementation would need actual YouTube video file access
    return `gs://youtube-videos/${videoId}.mp4`;
  }

  /**
   * Generates video metadata for partial processing
   * @param totalDuration - Total video duration in seconds
   * @returns Video metadata with start and end offsets
   */
  generateVideoMetadata(totalDuration: number): {
    startOffset: string;
    endOffset: string;
    processedDuration: number;
    isPartial: boolean;
  } {
    const processableDuration = this.calculateProcessableDuration(totalDuration);
    const isPartial = this.needsPartialProcessing(totalDuration);
    
    return {
      startOffset: '0s',
      endOffset: `${Math.floor(processableDuration)}s`,
      processedDuration: processableDuration,
      isPartial
    };
  }
}

// Export singleton instance
export const youTubeUrlDetector = new YouTubeUrlDetector();