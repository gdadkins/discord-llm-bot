# Architecture Overview

This document describes the architecture of the Discord LLM Bot, a production-ready Discord bot powered by Google's Gemini AI.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Discord Client                          │
│                    (discord.js v14 + Intents)                  │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Event Handlers Layer                       │
│              (Slash Commands, Mentions, Reactions)              │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ GeminiService│  │ContextManager│  │ RoastingEngine│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ RateLimiter  │  │HealthMonitor │  │ ConfigManager │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Utility Layer                              │
│      (Logger, MessageSplitter, DataStore, Validation)           │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── index.ts                    # Main entry point
├── core/                       # Bot initialization
│   ├── botInitializer.ts      # Service orchestration
│   └── ServiceInitializer.ts  # Dependency injection
├── commands/                   # Slash commands
│   ├── index.ts               # Core commands
│   ├── analyticsCommands.ts   # Analytics commands
│   ├── configurationCommands.ts
│   └── uxCommands.ts          # User experience commands
├── handlers/                   # Event handlers
│   ├── eventHandlers.ts       # Discord event setup
│   └── commandHandlers.ts     # Command execution
├── events/                     # Event listeners
│   └── messageCreate.ts       # Message handling
├── services/                   # Core service layer
│   ├── gemini/                # AI integration
│   ├── context/               # Context management
│   ├── analytics/             # Usage analytics
│   ├── config/                # Configuration
│   ├── health/                # Health monitoring
│   ├── roasting/              # Roasting engine
│   ├── resilience/            # Error handling
│   ├── rate-limiting/         # API rate limiting
│   ├── personality/           # User personalities
│   ├── preferences/           # User preferences
│   ├── conversation/          # Conversation tracking
│   ├── multimodal/            # Media processing
│   ├── cache/                 # Caching layer
│   ├── help/                  # Help system
│   ├── tracing/               # Distributed tracing
│   └── base/                  # BaseService class
├── utils/                      # Utility functions
│   ├── logger.ts              # Winston logging
│   ├── messageSplitter.ts     # Message chunking
│   ├── DataStore.ts           # Persistent storage
│   └── validation.ts          # Input validation
└── types/                      # TypeScript definitions
```

## Core Services

### GeminiService
The main AI integration service, orchestrating:
- **GeminiAPIClient**: Handles API calls to Google Gemini
- **GeminiContextProcessor**: Assembles context from multiple sources
- **GeminiResponseHandler**: Processes and formats responses

### ContextManager
Manages conversation context and memory:
- **ConversationMemoryService**: Per-user conversation history
- **ChannelContextService**: Channel-specific context
- **SocialDynamicsService**: User relationship tracking
- **MemoryOptimizationService**: Compression and deduplication

### RoastingEngine
Dynamic personality system:
- **RoastGenerator**: Dictionary-based roast generation
- **RoastPersonalizer**: User-specific customization
- **RoastingDecisionEngine**: Probability calculations
- **ChaosEventManager**: Random chaos events

### RateLimiter
Thread-safe rate limiting:
- Per-minute and daily limits
- Persistent state across restarts
- Configurable safety margins

### HealthMonitor
System health tracking:
- **HealthMetricsCollector**: Memory, response times, error rates
- **HealthStatusEvaluator**: Threshold-based alerts
- **HealthReportGenerator**: Report generation

### ConfigurationManager
Dynamic configuration:
- Hot reload with file watching
- Version history with rollback
- Audit logging for changes

## Service Lifecycle

All services extend `BaseService` and follow a consistent lifecycle:

```
CREATED → INITIALIZING → READY → SHUTTING_DOWN → SHUTDOWN
                ↓
              ERROR
```

### Initialization Order
Services are initialized using topological sorting based on dependencies:
1. Configuration Manager (no dependencies)
2. Rate Limiter, Context Manager, Cache Manager
3. Personality Manager, Roasting Engine, User Preferences
4. Health Monitor, Analytics Manager
5. Gemini Service (depends on most services)

### Shutdown Order
Services are shut down in reverse initialization order to ensure clean cleanup.

## Key Patterns

### Dependency Injection
Services receive dependencies through constructor injection:
```typescript
class GeminiService extends BaseService {
  constructor(
    private rateLimiter: RateLimiter,
    private contextManager: ContextManager,
    private roastingEngine: RoastingEngine
  ) {
    super();
  }
}
```

### Template Method Pattern
`BaseService` uses template methods for lifecycle hooks:
```typescript
abstract class BaseService {
  async initialize(): Promise<void> {
    // Pre-initialization logic
    await this.performInitialization();
    // Post-initialization logic
  }

  protected abstract performInitialization(): Promise<void>;
}
```

### Circuit Breaker Pattern
Resilience services implement circuit breakers:
- **Closed**: Normal operation
- **Open**: Failing fast after threshold exceeded
- **Half-Open**: Testing recovery

### Graceful Degradation
When services fail, the bot continues with reduced functionality:
- AI service failure → Fallback responses
- Analytics failure → Skip tracking
- Config service failure → Use cached config

## Data Flow

### Message Processing
```
User Message → Discord Client → Event Handler → Command Router
    ↓
Context Assembly ← ContextManager
    ↓
Rate Check ← RateLimiter
    ↓
Roast Decision ← RoastingEngine
    ↓
AI Generation ← GeminiService
    ↓
Response Formatting → Message Splitter → Discord Reply
```

### Health Check Flow
```
Health Check Request → HealthMonitor
    ↓
Collect Metrics ← All Services
    ↓
Evaluate Status → Alert if needed
    ↓
Generate Report → Return to Requester
```

## Configuration

### Environment Variables
All configuration starts with environment variables (`.env`), which can be overridden by:
1. Runtime configuration (`data/bot-config.json`)
2. Hot reload changes

### Key Configuration Areas
- **AI Settings**: Model, temperature, token limits
- **Rate Limiting**: RPM, daily limits, safety margins
- **Memory**: Conversation timeout, message limits
- **Roasting**: Base chance, cooldown, chaos settings

## Persistence

### Data Storage
```
data/
├── rate-limit.json      # Rate limit state
├── bot-config.json      # Runtime configuration
├── health-metrics.json  # Health history
└── config-versions/     # Configuration history
```

### Storage Strategies
- **In-Memory**: Conversation history, cache
- **JSON Files**: Configuration, rate limits
- **SQLite**: Analytics data (optional)

## Performance Considerations

### Caching
- LRU cache with configurable size and TTL
- Response compression for large entries
- Cache warming for common prompts

### Memory Management
- Automatic context compression (40% reduction)
- LRU eviction for stale data
- Memory monitoring with alerts

### Rate Limiting
- Token bucket algorithm
- Burst handling with safety margins
- Persistent state across restarts

## Security

### Input Validation
- All user inputs sanitized
- Command parameter validation
- Message content filtering

### Access Control
- Admin-only commands
- Server-specific permissions
- Rate limiting per user

### Data Privacy
- GDPR-compliant data handling
- User data export/deletion
- Anonymized analytics

## Related Documentation

- [Service Architecture](SERVICE_ARCHITECTURE.md) - Service design guidelines
- [Service Boundaries](SERVICE_BOUNDARIES.md) - Dependency injection patterns
- [API Reference](API_REFERENCE.md) - Complete API documentation
- [Testing Strategy](TESTING_STRATEGY.md) - Testing approach
