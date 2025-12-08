# API Reference

Service APIs and interfaces for the Discord LLM Bot.

## Core Services

### GeminiService
Primary AI service for message processing.

```typescript
interface IGeminiService {
  processMessage(params: {
    prompt: string;
    userId: string;
    username: string;
    channelId: string;
    serverId?: string;
    mode?: 'roasting' | 'helpful';
    conversationHistory?: Message[];
  }): Promise<GeminiResponse>;

  getHealthStatus(): ServiceHealthStatus;
}

interface GeminiResponse {
  content: string;
  thoughts?: string;
  searchResults?: SearchResult[];
  usage?: { promptTokens: number; completionTokens: number };
}
```

### ContextManager
Manages conversation context and memory.

```typescript
interface IContextManager {
  buildContext(userId: string, channelId: string): Promise<ConversationContext>;
  addMessage(userId: string, channelId: string, message: Message): void;
  clearContext(userId: string, channelId?: string): void;
  getContextStats(): ContextStats;
}
```

### RateLimiter
Controls request throughput.

```typescript
interface IRateLimiter {
  checkRateLimit(userId: string): Promise<boolean>;
  recordRequest(userId: string): void;
  getRateLimitStatus(userId: string): RateLimitStatus;
}

interface RateLimitStatus {
  allowed: boolean;
  remainingRequests: number;
  resetTime: number;
}
```

### CacheManager
Response caching for performance.

```typescript
interface ICacheManager {
  get(key: string): CachedResponse | undefined;
  set(key: string, response: CachedResponse, ttl?: number): void;
  clear(): void;
  getStats(): CacheStats;
}
```

## Health Status

All services implement:

```typescript
interface IService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getHealthStatus(): ServiceHealthStatus;
}

interface ServiceHealthStatus {
  healthy: boolean;
  name: string;
  errors?: string[];
  metrics?: Record<string, any>;
}
```

## Error Types

| Error | Description |
|-------|-------------|
| `RateLimitError` | Request exceeds rate limit |
| `GeminiAPIError` | Gemini API failure |
| `ContextOverflowError` | Context exceeds limits |
| `CircuitOpenError` | Circuit breaker is open |

## Discord Commands

### User Commands
| Command | Description |
|---------|-------------|
| `/chat <message>` | Send message to bot |
| `/clear` | Clear conversation history |
| `/status` | View system status |
| `/help` | Show help information |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/config view` | View configuration |
| `/config rollback` | Restore previous config |
| `/analytics` | View usage analytics |
| `/health` | Detailed health metrics |
