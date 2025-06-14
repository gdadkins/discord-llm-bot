/**
 * Media Processor Module - Handles image, video, and audio processing
 * 
 * Responsible for:
 * - Image fetching and base64 encoding
 * - Video processing and metadata extraction
 * - Audio processing and validation
 * - YouTube URL detection and processing
 * - Media format conversions
 */

import { Attachment } from 'discord.js';
import { logger } from '../../utils/logger';
import { youTubeUrlDetector } from '../../utils/youtubeUrlDetector';
import type { ProcessedAttachment, MultimodalConfig } from '../interfaces/MultimodalContentInterfaces';
import { MultimodalProcessingError } from '../interfaces/MultimodalContentInterfaces';

/**
 * Media-specific processing configuration
 */
export interface MediaProcessorConfig extends MultimodalConfig {
  /** Timeout for media fetching in ms */
  fetchTimeout?: number;
  /** Enable video partial processing */
  enablePartialVideo?: boolean;
  /** Enable audio partial processing */
  enablePartialAudio?: boolean;
}

/**
 * Media Processor Implementation
 * 
 * Handles all media type-specific processing logic
 */
export class MediaProcessor {
  private readonly config: Required<MediaProcessorConfig>;
  
  constructor(config?: Partial<MediaProcessorConfig>) {
    this.config = {
      maxImages: config?.maxImages ?? 10,
      maxFileSize: config?.maxFileSize ?? 20 * 1024 * 1024,
      supportedMimeTypes: config?.supportedMimeTypes ?? [
        'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
        'video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 
        'video/x-flv', 'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp',
        'audio/mp3', 'audio/mpeg', 'audio/wav',
        'audio/ogg', 'audio/webm', 'audio/flac'
      ],
      includeReferencedAttachments: config?.includeReferencedAttachments ?? true,
      fetchTimeout: config?.fetchTimeout ?? 30000,
      enablePartialVideo: config?.enablePartialVideo ?? true,
      enablePartialAudio: config?.enablePartialAudio ?? true
    };
  }

  /**
   * Processes a Discord attachment based on its type
   */
  async processAttachment(attachment: Attachment): Promise<ProcessedAttachment> {
    const contentType = attachment.contentType;
    
    if (!contentType) {
      throw new MultimodalProcessingError(
        'The file type could not be determined. Please ensure you are uploading a valid media file.',
        'UNKNOWN_TYPE',
        attachment.url
      );
    }

    if (contentType.startsWith('image/')) {
      return this.processImage(attachment);
    } else if (contentType.startsWith('video/')) {
      return this.processVideo(attachment);
    } else if (contentType.startsWith('audio/')) {
      return this.processAudio(attachment);
    } else {
      throw new MultimodalProcessingError(
        `Unsupported file type: ${contentType}`,
        'UNSUPPORTED_TYPE',
        attachment.url
      );
    }
  }

  /**
   * Processes an image attachment
   */
  async processImage(attachment: Attachment): Promise<ProcessedAttachment> {
    const startTime = Date.now();
    
    // Fetch image data
    logger.debug(`Fetching image attachment: ${attachment.name} from ${attachment.url}`);
    const buffer = await this.fetchMedia(attachment.url, 'image');
    const base64Data = Buffer.from(buffer).toString('base64');
    
    const processingTime = Date.now() - startTime;
    logger.info(`Processed image attachment ${attachment.name} in ${processingTime}ms`);

    return {
      url: attachment.url,
      mimeType: attachment.contentType!,
      base64Data,
      filename: attachment.name || undefined,
      size: attachment.size || buffer.byteLength,
      contentType: 'image',
      metadata: {
        width: attachment.width || undefined,
        height: attachment.height || undefined,
        processingTime
      }
    };
  }

  /**
   * Processes a video attachment
   */
  async processVideo(attachment: Attachment): Promise<ProcessedAttachment> {
    const startTime = Date.now();
    
    // Fetch video data
    logger.debug(`Fetching video attachment: ${attachment.name} from ${attachment.url}`);
    const buffer = await this.fetchMedia(attachment.url, 'video');
    const base64Data = Buffer.from(buffer).toString('base64');
    
    const processingTime = Date.now() - startTime;
    logger.info(`Processed video attachment ${attachment.name} in ${processingTime}ms`);

    return {
      url: attachment.url,
      mimeType: attachment.contentType!,
      base64Data,
      filename: attachment.name || undefined,
      size: attachment.size || buffer.byteLength,
      contentType: 'video',
      metadata: {
        processingTime
      }
    };
  }

  /**
   * Processes an audio attachment
   */
  async processAudio(attachment: Attachment): Promise<ProcessedAttachment> {
    const { audioProcessor } = await import('../../utils/audioProcessor');
    const startTime = Date.now();

    try {
      // Validate audio file
      const validation = audioProcessor.validateAudioFile(
        attachment.contentType,
        attachment.size || 0,
        attachment.name || undefined
      );

      if (!validation.isValid) {
        throw new MultimodalProcessingError(
          validation.error || 'Invalid audio file',
          'INVALID_AUDIO',
          attachment.url
        );
      }

      // Log warnings
      validation.warnings?.forEach(warning => 
        logger.warn(`Audio processing warning: ${warning}`)
      );

      // Fetch audio data
      logger.debug(`Fetching audio attachment: ${attachment.name} from ${attachment.url}`);
      const buffer = await this.fetchMedia(attachment.url, 'audio');
      const base64Data = Buffer.from(buffer).toString('base64');
      
      // Extract metadata
      const metadata = await audioProcessor.extractMetadata(
        buffer,
        validation.mimeType || attachment.contentType || 'audio/mpeg',
        attachment.name || undefined
      );

      // Check if partial processing is needed
      let audioMetadata;
      let partialProcessingMessage;
      if (metadata.duration && audioProcessor.needsPartialProcessing(metadata.duration) && this.config.enablePartialAudio) {
        const partialData = audioProcessor.generatePartialMetadata(metadata.duration);
        audioMetadata = {
          startOffset: partialData.startOffset,
          endOffset: partialData.endOffset
        };
        partialProcessingMessage = this.generateAudioPartialMessage(metadata.duration, partialData.processedDuration);
      }

      const processingTime = Date.now() - startTime;
      logger.info(`Processed audio attachment ${attachment.name} in ${processingTime}ms`, {
        format: metadata.format,
        duration: metadata.duration,
        size: metadata.size
      });

      return {
        url: attachment.url,
        mimeType: validation.mimeType || attachment.contentType || 'audio/mpeg',
        base64Data,
        filename: attachment.name || undefined,
        size: attachment.size || buffer.byteLength,
        contentType: 'audio',
        metadata: {
          ...metadata,
          processingTime,
          ...(audioMetadata && { audioMetadata }),
          ...(partialProcessingMessage && { partialProcessingMessage })
        }
      };
    } catch (error) {
      if (error instanceof MultimodalProcessingError) {
        throw error;
      }
      
      const errorMessage = audioProcessor.getAudioErrorMessage(
        error instanceof Error ? error : new Error(String(error)),
        attachment.name || undefined
      );
      
      throw new MultimodalProcessingError(
        errorMessage,
        'AUDIO_PROCESSING_FAILED',
        attachment.url,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Fetches media from URL with error handling
   */
  private async fetchMedia(url: string, mediaType: 'image' | 'video' | 'audio'): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.fetchTimeout);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new MultimodalProcessingError(
            `The ${mediaType} could not be found. It may have been deleted or the link expired.`,
            'FETCH_FAILED',
            url
          );
        } else if (response.status === 403) {
          throw new MultimodalProcessingError(
            `Access to the ${mediaType} was denied. Please check the ${mediaType} permissions or try a different ${mediaType}.`,
            'FETCH_FAILED',
            url
          );
        } else {
          throw new MultimodalProcessingError(
            `Failed to download the ${mediaType} (Error ${response.status}). Please try again or use a different ${mediaType}.`,
            'FETCH_FAILED',
            url
          );
        }
      }

      return await response.arrayBuffer();
    } catch (error) {
      clearTimeout(timeout);
      
      if (error instanceof MultimodalProcessingError) {
        throw error;
      }
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MultimodalProcessingError(
          `The ${mediaType} download timed out. Please try a smaller file or check your connection.`,
          'TIMEOUT',
          url
        );
      }
      
      throw new MultimodalProcessingError(
        `Failed to fetch ${mediaType}: ${error instanceof Error ? error.message : String(error)}`,
        'FETCH_FAILED',
        url,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Processes YouTube URLs and returns video metadata
   */
  async processYouTubeUrl(url: string): Promise<{
    url: string;
    videoId?: string;
    isValid: boolean;
    requiresConfirmation: boolean;
    warningMessage?: string;
    errorMessage?: string;
    estimatedTokenCost?: number;
  }> {
    try {
      const processResult = await youTubeUrlDetector.processYouTubeUrl(url);
      
      return {
        url,
        videoId: processResult.validation.videoId,
        isValid: processResult.isValid,
        requiresConfirmation: processResult.requiresConfirmation,
        warningMessage: processResult.warningMessage,
        errorMessage: processResult.isValid ? undefined : processResult.validation.error,
        estimatedTokenCost: processResult.videoInfo?.estimatedTokenCost
      };
    } catch (error) {
      logger.error(`Error processing YouTube URL ${url}:`, error);
      return {
        url,
        isValid: false,
        requiresConfirmation: false,
        errorMessage: 'Failed to process YouTube URL. Please try again later.'
      };
    }
  }

  /**
   * Converts YouTube video to ProcessedAttachment
   */
  async processYouTubeVideo(
    videoId: string,
    requireUserConfirmation: boolean
  ): Promise<{
    success: boolean;
    attachment?: ProcessedAttachment;
    errorMessage?: string;
    requiresConfirmation?: boolean;
    warningMessage?: string;
  }> {
    try {
      const videoInfo = await youTubeUrlDetector.getMockVideoInfo(videoId);
      
      if (!videoInfo.isAccessible) {
        return {
          success: false,
          errorMessage: 'This video is private, unlisted, or has been removed and cannot be processed.'
        };
      }

      // Check if confirmation is required
      const tokenCost = videoInfo.estimatedTokenCost || 0;
      const needsConfirmation = youTubeUrlDetector.shouldShowTokenWarning(tokenCost);
      
      if (needsConfirmation && !requireUserConfirmation) {
        return {
          success: false,
          requiresConfirmation: true,
          warningMessage: youTubeUrlDetector.generateTokenCostWarning(tokenCost, videoInfo.duration || 0)
        };
      }

      // Generate file URI for Gemini API
      const fileUri = youTubeUrlDetector.generateGeminiFileUri(videoId);

      // Generate video metadata for partial processing if needed
      let videoMetadata;
      let partialProcessingMessage;
      if (videoInfo.duration && youTubeUrlDetector.needsPartialProcessing(videoInfo.duration) && this.config.enablePartialVideo) {
        const metadata = youTubeUrlDetector.generateVideoMetadata(videoInfo.duration);
        videoMetadata = {
          startOffset: metadata.startOffset,
          endOffset: metadata.endOffset
        };
        partialProcessingMessage = youTubeUrlDetector.generatePartialProcessingMessage(
          videoInfo.duration,
          metadata.processedDuration
        );
      }

      // Create processed attachment
      const attachment: ProcessedAttachment = {
        url: `https://youtu.be/${videoId}`,
        mimeType: 'video/mp4',
        base64Data: fileUri,
        filename: videoInfo.title || `video_${videoId}.mp4`,
        size: 0, // Video size not available through file URI
        contentType: 'video',
        metadata: {
          duration: videoInfo.duration,
          videoId: videoId,
          thumbnailUrl: videoInfo.thumbnailUrl,
          channelName: videoInfo.channelName,
          estimatedTokenCost: videoInfo.estimatedTokenCost,
          processingTime: Date.now(),
          ...(videoMetadata && { videoMetadata }),
          ...(partialProcessingMessage && { partialProcessingMessage })
        }
      };

      logger.info(`Successfully processed YouTube video ${videoId}`, {
        duration: videoInfo.duration,
        estimatedTokenCost: videoInfo.estimatedTokenCost,
        title: videoInfo.title
      });

      return {
        success: true,
        attachment
      };
    } catch (error) {
      logger.error(`Error processing YouTube video ${videoId}:`, error);
      return {
        success: false,
        errorMessage: 'Failed to process YouTube video. Please verify the video is public and try again.'
      };
    }
  }

  /**
   * Generates partial processing message for audio
   */
  private generateAudioPartialMessage(totalDuration: number, processedDuration: number): string {
    const processedMinutes = Math.floor(processedDuration / 60);
    const processedSeconds = processedDuration % 60;
    const totalMinutes = Math.floor(totalDuration / 60);
    const totalSeconds = totalDuration % 60;
    return `Processing first ${processedMinutes}:${processedSeconds.toString().padStart(2, '0')} of ${totalMinutes}:${totalSeconds.toString().padStart(2, '0')} audio`;
  }
}