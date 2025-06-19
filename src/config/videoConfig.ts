/**
 * Video Processing Configuration
 * Centralized configuration for video processing capabilities
 */

import { VIDEO_CONSTANTS } from './constants';
import { getConfigValue } from '../utils/ConfigurationValidator';

export interface VideoConfiguration {
  /** Enable/disable video processing entirely */
  videoSupportEnabled: boolean;
  
  /** Maximum video duration in seconds */
  maxVideoDurationSeconds: number;
  
  /** Token warning threshold for video processing */
  videoTokenWarningThreshold: number;
  
  /** Enable/disable YouTube URL processing */
  youtubeUrlSupportEnabled: boolean;
  
  /** Maximum video file size in MB */
  videoFileSizeLimitMB: number;
  
  /** Require user confirmation before processing videos */
  requireVideoConfirmation: boolean;
  
  /** Video processing timeout in seconds */
  videoProcessingTimeoutSeconds: number;
  
  /** Supported video file formats */
  supportedVideoFormats: readonly string[];
}

/**
 * Default video configuration with conservative safety settings
 */
export const DEFAULT_VIDEO_CONFIG: VideoConfiguration = {
  videoSupportEnabled: VIDEO_CONSTANTS.DEFAULT_VIDEO_SUPPORT_ENABLED,
  maxVideoDurationSeconds: VIDEO_CONSTANTS.MAX_VIDEO_DURATION_SECONDS,
  videoTokenWarningThreshold: VIDEO_CONSTANTS.VIDEO_TOKEN_WARNING_THRESHOLD,
  youtubeUrlSupportEnabled: VIDEO_CONSTANTS.DEFAULT_YOUTUBE_URL_SUPPORT_ENABLED,
  videoFileSizeLimitMB: VIDEO_CONSTANTS.VIDEO_FILE_SIZE_LIMIT_MB,
  requireVideoConfirmation: VIDEO_CONSTANTS.DEFAULT_REQUIRE_VIDEO_CONFIRMATION,
  videoProcessingTimeoutSeconds: VIDEO_CONSTANTS.VIDEO_PROCESSING_TIMEOUT_SECONDS,
  supportedVideoFormats: VIDEO_CONSTANTS.SUPPORTED_VIDEO_FORMATS,
};

/**
 * Video processing cost estimation utilities
 */
export class VideoProcessingEstimator {
  /**
   * Estimate token cost for video processing
   */
  static estimateTokenCost(durationSeconds: number): number {
    // Updated estimation: ~300 tokens per second of video
    const tokensPerSecond = 300;
    const estimatedTokens = Math.ceil(durationSeconds * tokensPerSecond);
    
    // For videos under 83 seconds, return actual estimate
    // For longer videos, cap at 25k tokens
    return Math.min(estimatedTokens, 25000);
  }
  
  /**
   * Estimate processing time for video
   */
  static estimateProcessingTime(durationSeconds: number): number {
    const minutes = durationSeconds / 60;
    return Math.ceil(minutes * VIDEO_CONSTANTS.PROCESSING_TIME_PER_MINUTE);
  }
  
  /**
   * Format duration for user display
   */
  static formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes === 0) {
      return `${remainingSeconds}s`;
    }
    
    return remainingSeconds === 0 
      ? `${minutes}m` 
      : `${minutes}m ${remainingSeconds}s`;
  }
  
  /**
   * Check if video file is supported
   */
  static isSupportedFormat(filename: string, config: VideoConfiguration): boolean {
    const extension = filename.toLowerCase().split('.').pop();
    return extension ? config.supportedVideoFormats.includes(extension) : false;
  }
  
  /**
   * Validate video file size
   */
  static isValidFileSize(fileSizeBytes: number, config: VideoConfiguration): boolean {
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    return fileSizeMB <= config.videoFileSizeLimitMB;
  }
  
  /**
   * Validate video duration
   */
  static isValidDuration(durationSeconds: number, config: VideoConfiguration): boolean {
    return durationSeconds <= config.maxVideoDurationSeconds;
  }
}

/**
 * Video processing user experience utilities
 */
export class VideoUXHelper {
  /**
   * Generate confirmation message for video processing
   * Note: With automatic processing up to 25k tokens, this is rarely used
   */
  static generateConfirmationMessage(
    durationSeconds: number, 
    estimatedTokens: number, 
    estimatedProcessingTime: number
  ): string {
    const duration = VideoProcessingEstimator.formatDuration(durationSeconds);
    const processingTime = VideoProcessingEstimator.formatDuration(estimatedProcessingTime);
    
    return '🎥 **Video Processing Notice**\n\n' +
           `📹 Video Duration: ${duration}\n` +
           `🪙 Token Usage: ${estimatedTokens.toLocaleString()} tokens\n` +
           `⏱️ Processing Time: ~${processingTime}\n\n` +
           'Processing will begin automatically...';
  }
  
  /**
   * Generate processing status message
   */
  static generateProcessingMessage(durationSeconds: number): string {
    const duration = VideoProcessingEstimator.formatDuration(durationSeconds);
    const estimatedTime = VideoProcessingEstimator.estimateProcessingTime(durationSeconds);
    const formattedTime = VideoProcessingEstimator.formatDuration(estimatedTime);
    
    return `🎬 **Processing Video** (${duration})\n\n` +
           `Please wait approximately ${formattedTime}...\n` +
           'Video analysis in progress...';
  }
  
  /**
   * Generate error message for unsupported video
   */
  static generateUnsupportedFormatMessage(
    filename: string, 
    config: VideoConfiguration
  ): string {
    const supportedFormats = config.supportedVideoFormats.join(', ').toUpperCase();
    
    return '❌ **Unsupported Video Format**\n\n' +
           `File: ${filename}\n` +
           `Supported formats: ${supportedFormats}\n` +
           `Maximum file size: ${config.videoFileSizeLimitMB}MB\n` +
           `Maximum duration: ${VideoProcessingEstimator.formatDuration(config.maxVideoDurationSeconds)}`;
  }
  
  /**
   * Generate error message for video too large
   */
  static generateFileTooLargeMessage(
    fileSizeMB: number, 
    config: VideoConfiguration
  ): string {
    return '❌ **Video File Too Large**\n\n' +
           `File size: ${fileSizeMB.toFixed(1)}MB\n` +
           `Maximum allowed: ${config.videoFileSizeLimitMB}MB\n\n` +
           'Please upload a smaller video file or trim the video duration.';
  }
  
  /**
   * Generate error message for video too long
   */
  static generateVideoTooLongMessage(
    durationSeconds: number, 
    config: VideoConfiguration
  ): string {
    const duration = VideoProcessingEstimator.formatDuration(durationSeconds);
    const maxDuration = VideoProcessingEstimator.formatDuration(config.maxVideoDurationSeconds);
    const estimatedTokens = VideoProcessingEstimator.estimateTokenCost(durationSeconds);
    
    return '⚠️ **Video Exceeds Token Limit**\n\n' +
           `Video duration: ${duration}\n` +
           `Maximum processable: ${maxDuration} (25k tokens)\n\n` +
           `This video would require ~${estimatedTokens.toLocaleString()} tokens.\n` +
           'I\'ll process the first 83 seconds of the video.';
  }
}

/**
 * Get video configuration from environment variables using ConfigurationValidator
 */
export function getVideoConfigFromEnv(): Partial<VideoConfiguration> {
  const config: Partial<VideoConfiguration> = {};
  
  // Use ConfigurationValidator for type-safe configuration parsing
  const videoSupportEnabled = getConfigValue<boolean>('VIDEO_SUPPORT_ENABLED');
  if (videoSupportEnabled !== undefined) {
    config.videoSupportEnabled = videoSupportEnabled;
  }
  
  const maxVideoDurationSeconds = getConfigValue<number>('MAX_VIDEO_DURATION_SECONDS');
  if (maxVideoDurationSeconds !== undefined) {
    config.maxVideoDurationSeconds = maxVideoDurationSeconds;
  }
  
  const videoTokenWarningThreshold = getConfigValue<number>('VIDEO_TOKEN_WARNING_THRESHOLD');
  if (videoTokenWarningThreshold !== undefined) {
    config.videoTokenWarningThreshold = videoTokenWarningThreshold;
  }
  
  const youtubeUrlSupportEnabled = getConfigValue<boolean>('YOUTUBE_URL_SUPPORT_ENABLED');
  if (youtubeUrlSupportEnabled !== undefined) {
    config.youtubeUrlSupportEnabled = youtubeUrlSupportEnabled;
  }
  
  const videoFileSizeLimitMB = getConfigValue<number>('VIDEO_FILE_SIZE_LIMIT_MB');
  if (videoFileSizeLimitMB !== undefined) {
    config.videoFileSizeLimitMB = videoFileSizeLimitMB;
  }
  
  const requireVideoConfirmation = getConfigValue<boolean>('REQUIRE_VIDEO_CONFIRMATION');
  if (requireVideoConfirmation !== undefined) {
    config.requireVideoConfirmation = requireVideoConfirmation;
  }
  
  return config;
}

/**
 * Create final video configuration by merging defaults with environment overrides
 */
export function createVideoConfiguration(): VideoConfiguration {
  const envConfig = getVideoConfigFromEnv();
  return { ...DEFAULT_VIDEO_CONFIG, ...envConfig };
}

// Note: Configuration validation is performed during bot initialization
// to avoid duplicate validation errors during module loading