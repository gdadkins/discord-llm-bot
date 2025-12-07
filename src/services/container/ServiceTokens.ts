/**
 * Service Tokens for Dependency Injection
 *
 * Typed constants for identifying services in the DI container.
 * Using Symbol for unique identification.
 */

export const ServiceTokens = {
  // Core Services
  Configuration: Symbol.for('Configuration'),
  Analytics: Symbol.for('Analytics'),
  HealthMonitor: Symbol.for('HealthMonitor'),

  // AI Services
  AIService: Symbol.for('AIService'),

  // Context & Conversation
  ContextManager: Symbol.for('ContextManager'),
  ConversationManager: Symbol.for('ConversationManager'),
  SystemContextBuilder: Symbol.for('SystemContextBuilder'),

  // Rate Limiting & Resilience
  RateLimiter: Symbol.for('RateLimiter'),
  GracefulDegradation: Symbol.for('GracefulDegradation'),
  RetryHandler: Symbol.for('RetryHandler'),

  // Cache
  CacheManager: Symbol.for('CacheManager'),

  // Personality & Roasting
  PersonalityManager: Symbol.for('PersonalityManager'),
  RoastingEngine: Symbol.for('RoastingEngine'),

  // Response Processing
  ResponseProcessingService: Symbol.for('ResponseProcessingService'),
  MultimodalContentHandler: Symbol.for('MultimodalContentHandler'),

  // User Services
  UserPreferenceService: Symbol.for('UserPreferenceService'),
  UserAnalysisService: Symbol.for('UserAnalysisService'),
  BehaviorAnalyzer: Symbol.for('BehaviorAnalyzer'),

  // Help System
  HelpSystem: Symbol.for('HelpSystem')
} as const;

export type ServiceToken = (typeof ServiceTokens)[keyof typeof ServiceTokens];

/**
 * String-based tokens for legacy compatibility
 */
export const ServiceNames = {
  [ServiceTokens.Configuration]: 'configuration',
  [ServiceTokens.Analytics]: 'analytics',
  [ServiceTokens.HealthMonitor]: 'healthMonitor',
  [ServiceTokens.AIService]: 'aiService',
  [ServiceTokens.ContextManager]: 'contextManager',
  [ServiceTokens.ConversationManager]: 'conversationManager',
  [ServiceTokens.SystemContextBuilder]: 'systemContextBuilder',
  [ServiceTokens.RateLimiter]: 'rateLimiter',
  [ServiceTokens.GracefulDegradation]: 'gracefulDegradation',
  [ServiceTokens.RetryHandler]: 'retryHandler',
  [ServiceTokens.CacheManager]: 'cacheManager',
  [ServiceTokens.PersonalityManager]: 'personalityManager',
  [ServiceTokens.RoastingEngine]: 'roastingEngine',
  [ServiceTokens.ResponseProcessingService]: 'responseProcessingService',
  [ServiceTokens.MultimodalContentHandler]: 'multimodalContentHandler',
  [ServiceTokens.UserPreferenceService]: 'userPreferences',
  [ServiceTokens.UserAnalysisService]: 'userAnalysisService',
  [ServiceTokens.BehaviorAnalyzer]: 'behaviorAnalyzer',
  [ServiceTokens.HelpSystem]: 'helpSystem'
} as const;
