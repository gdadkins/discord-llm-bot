/**
 * Service Interface Definitions and Contracts - Barrel Export
 * 
 * This file provides backward-compatible exports for all service interfaces.
 * The interfaces have been split into focused files for better maintainability
 * while maintaining full backward compatibility through barrel exports.
 * 
 * ## Design Principles
 * 1. **Interface Segregation** - Services depend on minimal interfaces
 * 2. **Dependency Inversion** - Services depend on abstractions, not concrete implementations
 * 3. **Clear Contracts** - All methods have defined inputs, outputs, and error conditions
 * 4. **Loose Coupling** - Services interact through well-defined interfaces
 * 
 * ## Contract Guarantees
 * - All async methods return Promises that resolve to specified types
 * - Error conditions are documented with specific error types thrown
 * - Side effects are clearly documented for each method
 * - Resource cleanup is guaranteed through standardized lifecycle methods
 * 
 * ## Usage Guidelines
 * - Always implement the base IService interface for lifecycle management
 * - Use dependency injection for service composition
 * - Mock interfaces for testing using the provided mock patterns
 * - Follow the documented error handling contracts
 * 
 * @see {@link docs/SERVICE_CONTRACTS.md} for detailed implementation guidelines
 * @see {@link tests/unit/services/} for testing patterns and examples
 */

// ============================================================================
// Backward Compatible Barrel Exports
// ============================================================================

// Core service interfaces and base types
// Provides: IService, IServiceRegistry, ServiceHealthStatus, error types
export * from './CoreServiceInterfaces';

// Analytics services and privacy management
// Provides: IAnalyticsService, IAnalyticsTracker, IAnalyticsReporter, privacy interfaces
export * from './AnalyticsInterfaces';

// AI/LLM service interfaces (segmented)
// Provides: IAIService, IAITextGenerator, quota management, conversation management
export * from './AIServiceInterfaces';

// Configuration management and validation
// Provides: IConfigurationService, BotConfiguration, validation and versioning
export * from './ConfigurationInterfaces';

// Health monitoring and metrics
// Provides: IHealthMonitor, health status tracking, metrics collection
export * from './HealthMonitoringInterfaces';

// Rate limiting and quota management
// Provides: IRateLimiter, quota tracking, burst handling, retry policies
export * from './RateLimitingInterfaces';

// Context and memory management
// Provides: IContextManager, conversation memory, server context, cross-server insights
export * from './ContextManagementInterfaces';

// Cache management and performance
// Provides: ICacheManager, cache statistics, performance optimization
export * from './CacheManagementInterfaces';

// Personality management
// Provides: IPersonalityManager, mood system, personality traits, adaptive behavior
export * from './PersonalityManagementInterfaces';

// Roasting engine and mood system
// Provides: IRoastingEngine, roast probability, mood-based behavior, psychological warfare
export * from './RoastingEngineInterfaces';

// Graceful degradation and circuit breakers
// Provides: IGracefulDegradation, circuit breaker patterns, fallback mechanisms
export * from './GracefulDegradationInterfaces';

// User preferences and settings
// Provides: IUserPreferenceManager, preference persistence, user-specific configuration
export * from './UserPreferenceInterfaces';

// Help system and tutorials
// Provides: IHelpSystem, interactive help, command documentation, tutorials
export * from './HelpSystemInterfaces';

// Behavior analysis and pattern detection
// Provides: IBehaviorAnalyzer, pattern recognition, user behavior insights
export * from './BehaviorAnalysisInterfaces';

// Conversation management
// Provides: IConversationManager, message threading, conversation state tracking
export * from './ConversationManagementInterfaces';

// Retry handling and error management
// Provides: IRetryHandler, exponential backoff, error classification, recovery strategies
export * from './RetryHandlerInterfaces';

// System context building
// Provides: ISystemContextBuilder, system information aggregation, environment context
export * from './SystemContextBuilderInterfaces';

// Service factory patterns
// Provides: IServiceFactory, dependency injection patterns, service instantiation
export * from './ServiceFactoryInterfaces';

// Legacy imports - maintain compatibility
// Provides: backward compatibility for existing implementations
export * from './serviceRegistry';
export * from './serviceFactory';