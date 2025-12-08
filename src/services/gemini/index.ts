/**
 * Gemini service module exports
 * 
 * This module provides a refactored, modular implementation of the Gemini AI service:
 * - GeminiService: Main orchestrator implementing IAIService interface
 * - GeminiAPIClient: Handles API calls and configuration
 * - GeminiContextProcessor: Manages context assembly and prompt building
 * - GeminiResponseHandler: Processes and formats API responses
 * 
 * The refactored structure improves maintainability, testability, and follows
 * the single responsibility principle while maintaining backward compatibility.
 */

export { GeminiService } from './GeminiService';
export { GeminiAPIClient } from './GeminiAPIClient';
export { GeminiContextProcessor } from './GeminiContextProcessor';
export { GeminiResponseHandler } from './GeminiResponseHandler';

// Export interfaces for testing and extension
export type {
  IGeminiAPIClient,
  IGeminiContextProcessor,
  IGeminiResponseHandler,
  ContextSources,
  ImageAttachment
} from './interfaces';