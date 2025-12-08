/**
 * Multimodal Module Exports
 * 
 * Provides centralized access to multimodal content processing components
 */

export { MultimodalContentHandler } from './MultimodalContentHandler';
export { MediaProcessor } from './MediaProcessor';
export { ContentValidator } from './ContentValidator';
export type { MediaProcessorConfig } from './MediaProcessor';
export type { ValidationConfig } from './ContentValidator';

// Re-export core types from interfaces for convenience
export type {
  ProcessedAttachment,
  MultimodalContent,
  ValidationResult,
  MultimodalConfig
} from '../interfaces/MultimodalContentInterfaces';