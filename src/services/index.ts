/**
 * Services Module Index
 *
 * Consolidated exports for all service layer components.
 * Import services from this module for cleaner imports.
 */

// Core AI Services
export { GeminiService } from './gemini/GeminiService';
export { GeminiAPIClient } from './gemini/GeminiAPIClient';
export { GeminiContextProcessor } from './gemini/GeminiContextProcessor';
export { GeminiResponseHandler } from './gemini/GeminiResponseHandler';

// Context & Conversation
export { ContextManager } from './context/ContextManager';
export { SystemContextBuilder } from './context/SystemContextBuilder';
export { ConversationManager } from './conversation/ConversationManager';

// Analytics
export { AnalyticsManager } from './analytics/AnalyticsManager';
export { BehaviorAnalyzer } from './analytics/BehaviorAnalyzer';

// Configuration
export { ConfigurationManager } from './config/ConfigurationManager';
export { ConfigurationLoader } from './config/ConfigurationLoader';
export { ConfigurationAdapter } from './adapters/ConfigurationAdapter';

// Health & Monitoring
export { HealthMonitor } from './health/HealthMonitor';

// Help System
export { HelpSystem } from './help/HelpSystem';
export { HelpContentManager } from './help/HelpContentManager';
export { HelpCommandBuilder } from './help/HelpCommandBuilder';

// Personality & Roasting
export { PersonalityManager } from './personality/PersonalityManager';
export { RoastingEngine } from './roasting/RoastingEngine';

// Rate Limiting
export { RateLimiter } from './rate-limiting/RateLimiter';

// Resilience & Fault Tolerance
export { GracefulDegradation } from './resilience/GracefulDegradation';
export { CircuitBreaker } from './resilience/CircuitBreaker';
export { RetryHandler } from './resilience/RetryHandler';
export { FallbackManager } from './resilience/FallbackManager';

// Security
// SecretManager is deprecated and has been moved to src/services/security/deprecated/SecretManager.ts

// Response Processing
export { ResponseProcessingService } from './response/ResponseProcessingService';

// Multimodal
export { MultimodalContentHandler } from './multimodal/MultimodalContentHandler';

// Cache
export { CacheManager } from './cache/CacheManager';

// Command Processing
export { CommandParserService } from './command-processing/CommandParser';

// Dependency Injection Container
export {
  ServiceContainer,
  getServiceContainer,
  resetServiceContainer,
  ServiceTokens,
  ServiceNames,
  type ServiceToken
} from './container';
