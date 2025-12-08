/**
 * Content Validator Module - Validates multimodal content and attachments
 * 
 * Responsible for:
 * - MIME type validation
 * - File size validation  
 * - Base64 format validation
 * - Content integrity checks
 * - Provider-specific requirement validation
 */

import { logger } from '../../utils/logger';
import type { 
  ProcessedAttachment, 
  ValidationResult, 
  MultimodalConfig 
} from '../interfaces/MultimodalContentInterfaces';

/**
 * Validation configuration with extended options
 */
export interface ValidationConfig extends MultimodalConfig {
  /** Strict mode for validation (rejects warnings) */
  strictMode?: boolean;
  /** Allow unknown MIME types with warning */
  allowUnknownMimeTypes?: boolean;
  /** Custom validators for specific MIME types */
  customValidators?: Map<string, (attachment: ProcessedAttachment) => ValidationResult>;
}

/**
 * Content Validator Implementation
 * 
 * Provides comprehensive validation for multimodal content
 */
export class ContentValidator {
  private readonly config: Required<ValidationConfig>;
  private readonly customValidators: Map<string, (attachment: ProcessedAttachment) => ValidationResult>;

  constructor(config?: Partial<ValidationConfig>) {
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
      strictMode: config?.strictMode ?? false,
      allowUnknownMimeTypes: config?.allowUnknownMimeTypes ?? false,
      customValidators: config?.customValidators ?? new Map()
    };
    
    this.customValidators = this.config.customValidators;
  }

  /**
   * Validates a processed attachment
   */
  validateAttachment(attachment: ProcessedAttachment): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!attachment.base64Data) {
      errors.push('Missing base64 data');
    }
    if (!attachment.mimeType) {
      errors.push('Missing MIME type');
    }

    // Validate MIME type
    const mimeTypeResult = this.validateMimeType(attachment);
    if (mimeTypeResult.errors) {
      errors.push(...mimeTypeResult.errors);
    }
    if (mimeTypeResult.warnings) {
      warnings.push(...mimeTypeResult.warnings);
    }

    // Validate base64 format (skip for special cases)
    if (attachment.base64Data && !this.isSpecialCase(attachment)) {
      const base64Result = this.validateBase64Format(attachment.base64Data);
      if (base64Result.errors) {
        errors.push(...base64Result.errors);
      }
    }

    // Validate file size
    const sizeResult = this.validateFileSize(attachment);
    if (sizeResult.errors) {
      errors.push(...sizeResult.errors);
    }
    if (sizeResult.warnings) {
      warnings.push(...sizeResult.warnings);
    }

    // Run custom validators if available
    if (attachment.mimeType && this.customValidators.has(attachment.mimeType)) {
      const customValidator = this.customValidators.get(attachment.mimeType)!;
      const customResult = customValidator(attachment);
      if (customResult.errors) {
        errors.push(...customResult.errors);
      }
      if (customResult.warnings) {
        warnings.push(...customResult.warnings);
      }
    }

    // Apply strict mode
    if (this.config.strictMode && warnings.length > 0) {
      errors.push(...warnings);
      warnings.length = 0;
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates MIME type with detailed error messages
   */
  private validateMimeType(attachment: ProcessedAttachment): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!attachment.mimeType) {
      return { valid: false, errors: ['Missing MIME type'] };
    }

    // Special case for YouTube videos
    if (attachment.mimeType === 'video/youtube') {
      return { valid: true };
    }

    // Check supported types
    if (!this.config.supportedMimeTypes.includes(attachment.mimeType)) {
      if (attachment.mimeType === 'image/gif') {
        errors.push('Sorry, GIF files are not supported. Please upload PNG, JPG, or WebP images instead.');
      } else if (this.config.allowUnknownMimeTypes) {
        warnings.push(`Unknown MIME type: ${attachment.mimeType}. Processing may fail.`);
      } else {
        const mediaType = this.getMediaType(attachment.mimeType);
        const supportedFormats = this.getSupportedFormats(mediaType);
        errors.push(`The file type '${attachment.mimeType.replace(`${mediaType}/`, '')}' is not supported. Please use one of these formats: ${supportedFormats}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates base64 string format
   */
  private validateBase64Format(base64Data: string): ValidationResult {
    const errors: string[] = [];

    // Check if it's a valid base64 string
    if (!this.isValidBase64(base64Data)) {
      errors.push('Invalid base64 data format');
    }

    // Check for common base64 issues
    if (base64Data.includes(' ')) {
      errors.push('Base64 data contains spaces');
    }

    if (base64Data.includes('\n') || base64Data.includes('\r')) {
      errors.push('Base64 data contains line breaks');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Validates file size with warnings for large files
   */
  private validateFileSize(attachment: ProcessedAttachment): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const size = attachment.size || this.estimateBase64Size(attachment.base64Data);
    
    if (size > this.config.maxFileSize) {
      const fileSizeMB = Math.round(size / 1024 / 1024);
      const maxSizeMB = Math.round(this.config.maxFileSize / 1024 / 1024);
      errors.push(`File size (${fileSizeMB}MB) exceeds limit (${maxSizeMB}MB)`);
    } else if (size > this.config.maxFileSize * 0.8) {
      const fileSizeMB = Math.round(size / 1024 / 1024);
      warnings.push(`File size (${fileSizeMB}MB) is close to limit`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates content for specific AI provider requirements
   */
  validateForProvider(
    attachment: ProcessedAttachment, 
    provider: 'gemini' | 'openai'
  ): ValidationResult {
    const baseResult = this.validateAttachment(attachment);
    const errors: string[] = [...(baseResult.errors || [])];
    const warnings: string[] = [...(baseResult.warnings || [])];

    switch (provider) {
    case 'gemini':
      // Gemini-specific validations
      if (attachment.contentType === 'video' && attachment.size && attachment.size > 100 * 1024 * 1024) {
        errors.push('Gemini does not support videos larger than 100MB');
      }
      break;
      
    case 'openai':
      // OpenAI-specific validations
      if (attachment.contentType === 'video') {
        errors.push('OpenAI does not currently support video processing');
      }
      if (attachment.contentType === 'audio') {
        errors.push('OpenAI vision models do not support audio files');
      }
      if (attachment.size && attachment.size > 20 * 1024 * 1024) {
        errors.push('OpenAI has a 20MB limit for images');
      }
      break;
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Batch validates multiple attachments with aggregated results
   */
  validateAttachments(attachments: ProcessedAttachment[]): {
    allValid: boolean;
    results: ValidationResult[];
    summary: {
      totalErrors: number;
      totalWarnings: number;
      invalidAttachments: number;
    };
  } {
    const results = attachments.map(att => this.validateAttachment(att));
    
    const totalErrors = results.reduce((sum, r) => sum + (r.errors?.length || 0), 0);
    const totalWarnings = results.reduce((sum, r) => sum + (r.warnings?.length || 0), 0);
    const invalidAttachments = results.filter(r => !r.valid).length;

    return {
      allValid: invalidAttachments === 0,
      results,
      summary: {
        totalErrors,
        totalWarnings,
        invalidAttachments
      }
    };
  }

  /**
   * Checks if attachment is a special case that bypasses certain validations
   */
  private isSpecialCase(attachment: ProcessedAttachment): boolean {
    // YouTube URLs stored as file URIs
    if (attachment.mimeType === 'video/youtube') {
      return true;
    }
    
    // File URIs for cloud storage
    if (attachment.base64Data.startsWith('gs://') || attachment.base64Data.startsWith('http')) {
      return true;
    }
    
    return false;
  }

  /**
   * Validates base64 string format
   */
  private isValidBase64(str: string): boolean {
    try {
      // Basic regex check for base64 format
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
        return false;
      }
      
      // Try to decode to verify it's valid
      if (typeof atob !== 'undefined') {
        atob(str);
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Estimates size from base64 string
   */
  private estimateBase64Size(base64Data: string): number {
    if (!base64Data) return 0;
    
    // Special cases don't have inline data
    if (base64Data.startsWith('gs://') || base64Data.startsWith('http')) {
      return 0;
    }
    
    // Base64 encoding increases size by ~33%
    return Math.floor((base64Data.length * 3) / 4);
  }

  /**
   * Gets media type from MIME type
   */
  private getMediaType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'file';
  }

  /**
   * Gets supported formats for a media type
   */
  private getSupportedFormats(mediaType: string): string {
    const formats = this.config.supportedMimeTypes
      .filter(type => type.startsWith(`${mediaType}/`))
      .map(type => type.replace(new RegExp(`^${mediaType}/`), ''))
      .join(', ');
    
    return formats || 'none';
  }

  /**
   * Creates a custom validator for a specific MIME type
   */
  addCustomValidator(
    mimeType: string, 
    validator: (attachment: ProcessedAttachment) => ValidationResult
  ): void {
    this.customValidators.set(mimeType, validator);
    logger.info(`Added custom validator for MIME type: ${mimeType}`);
  }

  /**
   * Removes a custom validator
   */
  removeCustomValidator(mimeType: string): void {
    this.customValidators.delete(mimeType);
    logger.info(`Removed custom validator for MIME type: ${mimeType}`);
  }
}