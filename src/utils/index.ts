/**
 * Utilities Index
 * 
 * Central export file for all utility modules.
 */

// Core utilities
export { logger } from './logger';
export { DataStore } from './DataStore';
export { DataStoreFactory } from './DataStoreFactory';
export { MutexManager } from './MutexManager';
export { splitMessage } from './messageSplitter';
export { RaceConditionManager } from './raceConditionManager';
export { formatThinkingResponse } from './thinkingFormatter';

// Large context handling
export { 
  LargeContextHandler, 
  largeContextHandler,
  type ChunkProcessorCallback,
  type LargeContextOptions 
} from './largeContextHandler';

export { 
  ContextAnalyzer, 
  contextAnalyzer,
  type ConversationAnalysis,
  type ConversationPattern 
} from './contextAnalyzer';

// Large context examples and utilities
export * from './largeContextExample';

// Validation utilities
export * from './validation';

// Configuration validation
export {
  ConfigurationValidator,
  validateEnvironment,
  getConfigValue,
  getConfigValueWithDefault,
  parseIntWithDefault,
  parseFloatWithDefault,
  parseBooleanWithDefault,
  getStringWithDefault,
  ENV_VAR_SCHEMAS,
  type ValidationError,
  type ValidationResult,
  type EnvVarSchema,
  type ParsedConfig
} from './ConfigurationValidator';

// Standardized error handling utilities
export {
  handleAsyncOperation,
  handleDataStoreOperation,
  handleNetworkOperation,
  handleValidationOperation,
  handleFireAndForget,
  classifyError,
  enrichError,
  isRetryableError,
  calculateRetryDelay,
  createTimeoutPromise,
  getUserFriendlyMessage,
  enrichPromise,
  withErrorHandling,
  ErrorSeverity,
  ErrorCategory,
  type ErrorHandlingConfig,
  type EnrichedError,
  type ErrorResult,
  type FallbackFunction,
  type AsyncResult,
  type AsyncErrorHandler
} from './ErrorHandlingUtils';

// Cache key generation utilities
export {
  CacheKeyGenerator,
  generateUserCacheKey,
  generateServerCacheKey,
  generateConversationCacheKey,
  generateHashedCacheKey,
  type CacheKeyOptions,
  type CacheKeyType
} from './CacheKeyGenerator';

// YouTube URL detection and processing
export {
  YouTubeUrlDetector,
  youTubeUrlDetector,
  type YouTubeUrlValidation,
  type YouTubeVideoInfo
} from './youtubeUrlDetector';

// YouTube error handling
export {
  YouTubeErrorHandler,
  youTubeErrorHandler,
  withYouTubeErrorHandling,
  isYouTubeErrorResponse,
  type YouTubeError,
  type YouTubeErrorType
} from './youtubeErrorHandler';

// Audio processing utilities
export {
  audioProcessor,
  type AudioMetadata,
  type AudioValidationResult,
  type PartialAudioMetadata
} from './audioProcessor';