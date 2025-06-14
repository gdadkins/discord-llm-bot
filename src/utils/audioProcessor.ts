/**
 * Audio Processor Utility
 * 
 * Handles audio file validation, metadata extraction, and processing for the Gemini service.
 * Supports various audio formats and includes partial processing for long audio files.
 */

import { logger } from './logger';

/**
 * Audio validation result interface
 */
interface AudioValidationResult {
  isValid: boolean;
  mimeType?: string;
  error?: string;
  warnings?: string[];
}

/**
 * Audio metadata interface
 */
interface AudioMetadata {
  format?: string;
  duration?: number;
  bitrate?: number;
  channels?: number;
  sampleRate?: number;
  size?: number;
}

/**
 * Partial processing metadata for long audio files
 */
interface PartialAudioMetadata {
  startOffset: string;
  endOffset: string;
  processedDuration: number;
}

/**
 * Audio Processor Class
 * 
 * Provides utilities for audio file handling including:
 * - Format validation
 * - Size checking
 * - Metadata extraction
 * - Partial processing for long files
 * - Error message generation
 */
class AudioProcessor {
  // Maximum file size: 20MB
  private readonly MAX_FILE_SIZE = 20 * 1024 * 1024;
  
  // Maximum duration: 10 minutes (600 seconds)
  private readonly MAX_DURATION = 600;
  
  // Supported audio MIME types
  private readonly SUPPORTED_MIME_TYPES = [
    'audio/mp3',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/flac'
  ];

  /**
   * Validates an audio file based on MIME type and size
   */
  validateAudioFile(
    mimeType: string | null,
    size: number,
    filename?: string
  ): AudioValidationResult {
    const result: AudioValidationResult = {
      isValid: true,
      warnings: []
    };

    // Check MIME type
    if (!mimeType) {
      return {
        isValid: false,
        error: 'Unable to determine audio file type. Please ensure you are uploading a valid audio file.'
      };
    }

    // Normalize MIME type
    const normalizedMimeType = this.normalizeMimeType(mimeType, filename);
    
    if (!this.SUPPORTED_MIME_TYPES.includes(normalizedMimeType)) {
      const supportedFormats = this.SUPPORTED_MIME_TYPES
        .map(type => type.replace('audio/', '').toUpperCase())
        .join(', ');
      
      return {
        isValid: false,
        error: `The audio format '${mimeType.replace('audio/', '')}' is not supported. Please use one of these formats: ${supportedFormats}`
      };
    }

    result.mimeType = normalizedMimeType;

    // Check file size
    if (size > this.MAX_FILE_SIZE) {
      const sizeMB = Math.round(size / 1024 / 1024);
      const maxMB = Math.round(this.MAX_FILE_SIZE / 1024 / 1024);
      return {
        isValid: false,
        error: `The audio file is too large (${sizeMB}MB). Please use audio files smaller than ${maxMB}MB.`
      };
    }

    // Add warning if close to size limit
    if (size > this.MAX_FILE_SIZE * 0.8) {
      const sizeMB = Math.round(size / 1024 / 1024);
      const maxMB = Math.round(this.MAX_FILE_SIZE / 1024 / 1024);
      result.warnings?.push(`Audio file size (${sizeMB}MB) is close to the ${maxMB}MB limit`);
    }

    return result;
  }

  /**
   * Normalizes MIME type based on file extension if needed
   */
  private normalizeMimeType(mimeType: string, filename?: string): string {
    // If MIME type is generic, try to determine from extension
    if (mimeType === 'application/octet-stream' && filename) {
      const ext = filename.toLowerCase().split('.').pop();
      switch (ext) {
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'webm':
        return 'audio/webm';
      case 'flac':
        return 'audio/flac';
      default:
        return mimeType;
      }
    }
    
    // Normalize mp3 to mpeg
    if (mimeType === 'audio/mp3') {
      return 'audio/mpeg';
    }
    
    return mimeType;
  }

  /**
   * Extracts metadata from audio buffer
   * 
   * Note: This is a placeholder implementation. In production, you would use
   * libraries like node-ffprobe or music-metadata to extract actual metadata.
   */
  async extractMetadata(
    buffer: ArrayBuffer,
    mimeType: string,
    filename?: string
  ): Promise<AudioMetadata> {
    const size = buffer.byteLength;
    
    // Placeholder metadata - in production, use proper audio parsing libraries
    const metadata: AudioMetadata = {
      format: mimeType.replace('audio/', ''),
      size,
      // Estimate duration based on file size and format
      // This is a rough estimate - actual implementation would parse audio headers
      duration: this.estimateDuration(size, mimeType),
      bitrate: this.estimateBitrate(mimeType),
      channels: 2, // Default stereo
      sampleRate: 44100 // Default CD quality
    };

    logger.debug(`Extracted audio metadata for ${filename || 'audio file'}:`, metadata);
    
    return metadata;
  }

  /**
   * Estimates audio duration based on file size and format
   * This is a placeholder - actual implementation would parse audio headers
   */
  private estimateDuration(size: number, mimeType: string): number {
    // Rough estimates based on common bitrates
    const bitrates: Record<string, number> = {
      'audio/mpeg': 128000, // 128 kbps typical MP3
      'audio/wav': 1411000, // Uncompressed CD quality
      'audio/ogg': 160000, // Typical Ogg Vorbis
      'audio/webm': 128000, // Typical WebM audio
      'audio/flac': 700000 // Typical FLAC compression
    };

    const bitrate = bitrates[mimeType] || 128000;
    const durationSeconds = (size * 8) / bitrate;
    
    return Math.round(durationSeconds);
  }

  /**
   * Estimates bitrate based on format
   */
  private estimateBitrate(mimeType: string): number {
    const bitrates: Record<string, number> = {
      'audio/mpeg': 128000,
      'audio/wav': 1411000,
      'audio/ogg': 160000,
      'audio/webm': 128000,
      'audio/flac': 700000
    };

    return bitrates[mimeType] || 128000;
  }

  /**
   * Checks if audio needs partial processing due to duration
   */
  needsPartialProcessing(duration: number): boolean {
    return duration > this.MAX_DURATION;
  }

  /**
   * Generates partial processing metadata for long audio files
   */
  generatePartialMetadata(duration: number): PartialAudioMetadata {
    // Process first 10 minutes of audio
    const processedDuration = Math.min(duration, this.MAX_DURATION);
    
    return {
      startOffset: '0s',
      endOffset: `${processedDuration}s`,
      processedDuration
    };
  }

  /**
   * Generates user-friendly error messages for audio processing failures
   */
  getAudioErrorMessage(error: Error, filename?: string): string {
    const fileRef = filename ? `"${filename}"` : 'the audio file';
    
    // Network errors
    if (error.message.includes('fetch') || error.message.includes('ENOTFOUND')) {
      return `Unable to download ${fileRef}. Please check your internet connection and try again.`;
    }
    
    // Size errors
    if (error.message.includes('too large') || error.message.includes('size')) {
      return `${fileRef} is too large. Please use audio files smaller than 20MB.`;
    }
    
    // Format errors
    if (error.message.includes('format') || error.message.includes('unsupported')) {
      return `${fileRef} is in an unsupported format. Please use MP3, WAV, OGG, WebM, or FLAC files.`;
    }
    
    // Encoding errors
    if (error.message.includes('encode') || error.message.includes('base64')) {
      return `Failed to process ${fileRef}. The file may be corrupted or in an incompatible encoding.`;
    }
    
    // Generic error
    return `Unable to process ${fileRef}. Please ensure it's a valid audio file and try again.`;
  }

  /**
   * Optimizes audio data if needed (placeholder for future implementation)
   */
  async optimizeAudio(
    buffer: ArrayBuffer,
    mimeType: string,
    targetSize?: number
  ): Promise<ArrayBuffer> {
    // Placeholder for audio optimization
    // In production, this could:
    // - Reduce bitrate
    // - Convert to more efficient format
    // - Trim silence
    // - Reduce sample rate
    
    logger.debug(`Audio optimization requested for ${mimeType} (${buffer.byteLength} bytes)`);
    
    // For now, return the original buffer
    return buffer;
  }
}

// Export singleton instance
export const audioProcessor = new AudioProcessor();

// Export types for external use
export type { AudioValidationResult, AudioMetadata, PartialAudioMetadata };