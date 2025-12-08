export const TYPES = {
    // Core
    Container: Symbol.for('Container'),
    Config: Symbol.for('Config'),
    Logger: Symbol.for('Logger'),
    DiscordClient: Symbol.for('DiscordClient'),

    // Infrastructure Services
    ServiceRegistry: Symbol.for('ServiceRegistry'),
    CommandRegistry: Symbol.for('CommandRegistry'),
    TracingIntegration: Symbol.for('TracingIntegration'),

    // Technical Services
    RateLimiter: Symbol.for('RateLimiter'),
    CacheManager: Symbol.for('CacheManager'),
    RetryHandler: Symbol.for('RetryHandler'),
    HealthMonitor: Symbol.for('HealthMonitor'),
    GracefulDegradation: Symbol.for('GracefulDegradation'),

    // Domain Services
    GeminiService: Symbol.for('GeminiService'),
    UserAnalysisService: Symbol.for('UserAnalysisService'),
    ContextManager: Symbol.for('ContextManager'),
    PersonalityManager: Symbol.for('PersonalityManager'),
    RoastingEngine: Symbol.for('RoastingEngine'),
    ConversationManager: Symbol.for('ConversationManager'),
    SystemContextBuilder: Symbol.for('SystemContextBuilder'),
    ResponseProcessingService: Symbol.for('ResponseProcessingService'),
    MultimodalContentHandler: Symbol.for('MultimodalContentHandler'),

    // Handlers/Other
    GeminiAPIClient: Symbol.for('GeminiAPIClient'),
    GeminiContextProcessor: Symbol.for('GeminiContextProcessor'),
    GeminiResponseHandler: Symbol.for('GeminiResponseHandler')
};
