# Developer API Reference

## Overview

This comprehensive API reference covers all internal APIs, service interfaces, and extension points for the Discord LLM Bot. This documentation is designed for developers who want to extend, integrate with, or contribute to the bot's functionality.

## Architecture Overview

### Core Service Architecture

The bot follows a modular service-oriented architecture with clear separation of concerns:

```typescript
// Main service interfaces
interface ServiceLifecycle {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  updateConfiguration?(config: any): Promise<void>;
  validateConfiguration?(config: any): Promise<{ valid: boolean; errors: string[] }>;
}

interface HealthCheckable {
  getHealthStatus(): Promise<HealthStatus>;
  performHealthCheck(): Promise<boolean>;
}
```

### Service Registry

```typescript
interface ServiceRegistry {
  register<T extends ServiceLifecycle>(name: string, service: T): void;
  get<T>(name: string): T | undefined;
  list(): string[];
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

## Core Services API

### Gemini Service

#### Interface Definition
```typescript
interface GeminiServiceAPI {
  // Core conversation methods
  processMessage(
    userId: string, 
    prompt: string, 
    serverId?: string
  ): Promise<string>;
  
  // Configuration management
  updatePersonality(personality: PersonalityConfig): Promise<void>;
  getCurrentModel(): string;
  getUsageStatistics(): GeminiUsageStats;
  
  // Rate limiting
  checkRateLimit(userId: string): Promise<RateLimitStatus>;
  
  // Context management
  clearConversation(userId: string): Promise<void>;
  getConversationSize(userId: string): number;
}

interface PersonalityConfig {
  roasting: string;
  helpful: string;
  temperature: number;
  topK: number;
  topP: number;
}

interface GeminiUsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  rateLimitHits: number;
}
```

#### Usage Example
```typescript
import { GeminiService } from './services/gemini';

const geminiService = new GeminiService();

// Process a user message
const response = await geminiService.processMessage(
  'user123',
  'How do I deploy a Node.js app?',
  'server456'
);

// Update personality configuration
await geminiService.updatePersonality({
  roasting: 'You are a witty AI with sharp humor...',
  helpful: 'You are a professional assistant...',
  temperature: 0.9,
  topK: 40,
  topP: 0.8
});

// Check usage statistics
const stats = geminiService.getUsageStatistics();
console.log(`Success rate: ${stats.successfulRequests / stats.totalRequests * 100}%`);
```

### Context Manager

#### Interface Definition
```typescript
interface ContextManagerAPI {
  // Context management
  addEmbarrassingMoment(serverId: string, userId: string, moment: string): void;
  addCodeSnippet(serverId: string, userId: string, code: string, description: string): void;
  addRunningGag(serverId: string, gag: string): void;
  
  // Context retrieval
  buildSuperContext(serverId: string, userId: string): string;
  getServerContext(serverId: string): RichContext | undefined;
  getMemoryStats(): MemoryStats;
  
  // Memory optimization
  optimizeMemory(): Promise<OptimizationResult>;
  forceCleanup(): Promise<void>;
  summarizeConversations(): Promise<SummarizationResult>;
}

interface RichContext {
  conversations: Map<string, string[]>;
  codeSnippets: Map<string, ContextItem[]>;
  embarrassingMoments: ContextItem[];
  runningGags: ContextItem[];
  summarizedFacts: ContextItem[];
  lastRoasted: Map<string, Date>;
  approximateSize: number;
  compressionRatio: number;
}

interface ContextItem {
  content: string;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  relevanceScore?: number;
  importanceScore?: number;
  semanticHash?: string;
}
```

#### Usage Example
```typescript
import { ContextManager } from './services/contextManager';

const contextManager = new ContextManager();

// Add embarrassing moment
contextManager.addEmbarrassingMoment(
  'server123',
  'user456',
  'Spent 3 hours debugging a missing semicolon'
);

// Add code snippet
contextManager.addCodeSnippet(
  'server123',
  'user456',
  'const hello = () => console.log("Hello World");',
  'Simple hello world function'
);

// Build context for conversation
const context = contextManager.buildSuperContext('server123', 'user456');

// Get memory statistics
const stats = contextManager.getMemoryStats();
console.log(`Total memory usage: ${stats.totalMemoryUsage}MB`);
```

### Health Monitor

#### Interface Definition
```typescript
interface HealthMonitorAPI {
  // Metrics collection
  getCurrentMetrics(): Promise<HealthMetrics>;
  getHistoricalMetrics(timeframe: string): Promise<HealthSnapshot[]>;
  
  // Performance tracking
  trackPerformance(operation: string, duration: number, success: boolean): void;
  trackError(error: Error, context?: string): void;
  
  // Alert management
  configureAlerts(config: AlertConfig): Promise<void>;
  getAlertHistory(limit?: number): Promise<AlertEvent[]>;
  
  // Health checks
  performSystemHealthCheck(): Promise<SystemHealthStatus>;
  registerCustomHealthCheck(name: string, check: HealthCheckFunction): void;
}

interface HealthMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  activeConversations: number;
  rateLimitStatus: RateLimitState;
  uptime: number;
  errorRate: number;
  responseTime: { p50: number; p95: number; p99: number };
  apiHealth: { gemini: boolean; discord: boolean };
  cacheMetrics: CacheMetrics;
  contextMetrics: ContextMetrics;
}

type HealthCheckFunction = () => Promise<boolean>;
```

#### Usage Example
```typescript
import { HealthMonitor } from './services/healthMonitor';

const healthMonitor = new HealthMonitor();

// Track performance
healthMonitor.trackPerformance('gemini_request', 1250, true);

// Register custom health check
healthMonitor.registerCustomHealthCheck('database', async () => {
  try {
    await database.ping();
    return true;
  } catch {
    return false;
  }
});

// Get current system health
const metrics = await healthMonitor.getCurrentMetrics();
if (metrics.errorRate > 5) {
  console.warn('High error rate detected');
}
```

### Configuration Manager

#### Interface Definition
```typescript
interface ConfigurationManagerAPI {
  // Configuration loading
  loadConfiguration(): Promise<BotConfiguration>;
  reloadConfiguration(): Promise<void>;
  
  // Configuration updates
  updateConfiguration(updates: Partial<BotConfiguration>): Promise<void>;
  validateConfiguration(config: BotConfiguration): Promise<ValidationResult>;
  
  // Version management
  getConfigurationHistory(limit?: number): Promise<ConfigurationVersion[]>;
  rollbackConfiguration(versionId: string): Promise<void>;
  
  // Watch for changes
  watchConfigurationFile(): void;
  onConfigurationChange(callback: ConfigurationChangeCallback): void;
}

interface BotConfiguration {
  version: string;
  lastModified: string;
  modifiedBy: string;
  discord: DiscordConfig;
  gemini: GeminiConfig;
  rateLimiting: RateLimitConfig;
  features: FeatureConfig;
}

type ConfigurationChangeCallback = (
  oldConfig: BotConfiguration,
  newConfig: BotConfiguration,
  changes: ConfigurationChange[]
) => void;
```

#### Usage Example
```typescript
import { ConfigurationManager } from './services/configurationManager';

const configManager = new ConfigurationManager();

// Load current configuration
const config = await configManager.loadConfiguration();

// Update specific configuration section
await configManager.updateConfiguration({
  features: {
    ...config.features,
    roasting: {
      ...config.features.roasting,
      baseChance: 0.7
    }
  }
});

// Watch for configuration changes
configManager.onConfigurationChange((oldConfig, newConfig, changes) => {
  console.log('Configuration updated:', changes);
});
```

### Graceful Degradation

#### Interface Definition
```typescript
interface GracefulDegradationAPI {
  // Service health monitoring
  reportServiceHealth(service: string, healthy: boolean): void;
  getServiceStatus(service: string): CircuitBreakerState;
  
  // Message queuing
  queueMessage(message: QueuedMessage): Promise<string>;
  processQueue(): Promise<void>;
  getQueueStatus(): QueueStatus;
  
  // Fallback responses
  getFallbackResponse(context: string): string;
  addFallbackResponse(pattern: string, response: string): void;
  
  // Recovery management
  attemptRecovery(service: string): Promise<boolean>;
  getRecoveryMetrics(): Map<string, RecoveryMetrics>;
}

interface QueuedMessage {
  id: string;
  userId: string;
  serverId?: string;
  prompt: string;
  timestamp: number;
  retries: number;
  priority: 'low' | 'medium' | 'high';
  respond: (response: string) => Promise<void>;
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveSuccesses: number;
}
```

#### Usage Example
```typescript
import { GracefulDegradation } from './services/gracefulDegradation';

const degradation = new GracefulDegradation();

// Report service health
degradation.reportServiceHealth('gemini', false);

// Queue message during service degradation
const messageId = await degradation.queueMessage({
  id: 'msg123',
  userId: 'user456',
  serverId: 'server789',
  prompt: 'How does async/await work?',
  timestamp: Date.now(),
  retries: 0,
  priority: 'medium',
  respond: async (response) => {
    await sendToDiscord(response);
  }
});

// Get fallback response
const fallback = degradation.getFallbackResponse('technical_question');
```

## Analytics and Reporting API

### Analytics Manager

#### Interface Definition
```typescript
interface AnalyticsManagerAPI {
  // Event tracking
  trackCommandUsage(command: string, userId: string, serverId: string, success: boolean, duration: number): Promise<void>;
  trackUserEngagement(userId: string, serverId: string, eventType: string, metadata?: any): Promise<void>;
  trackError(error: string, category: string, context?: string): Promise<void>;
  trackPerformance(metric: string, value: number, context?: string): Promise<void>;
  
  // Report generation
  generateReport(type: 'daily' | 'weekly' | 'monthly', serverId?: string): Promise<AnalyticsReport>;
  getCommandStatistics(timeframe: string, serverId?: string): Promise<CommandStatistics>;
  getUserEngagementMetrics(timeframe: string, serverId?: string): Promise<EngagementMetrics>;
  
  // Privacy management
  optOutUser(userId: string): Promise<void>;
  optInUser(userId: string): Promise<void>;
  exportUserData(userId: string): Promise<UserAnalyticsData>;
  deleteUserData(userId: string): Promise<void>;
}

interface AnalyticsReport {
  period: string;
  serverId?: string;
  metrics: {
    totalCommands: number;
    uniqueUsers: number;
    successRate: number;
    avgResponseTime: number;
    topCommands: CommandUsage[];
    errorSummary: ErrorSummary[];
    engagementScore: number;
  };
  trends: TrendData[];
  recommendations: string[];
}
```

#### Usage Example
```typescript
import { AnalyticsManager } from './services/analyticsManager';

const analytics = new AnalyticsManager();

// Track command usage
await analytics.trackCommandUsage(
  'chat',
  'user123',
  'server456',
  true,
  1250
);

// Generate weekly report
const report = await analytics.generateReport('weekly', 'server456');
console.log(`Success rate: ${report.metrics.successRate}%`);

// Export user data for GDPR compliance
const userData = await analytics.exportUserData('user123');
```

## Bot Commands API

### Built-in Commands

#### ASCII Art Command
Generate AI-powered ASCII art based on user prompts.

```typescript
// Command: /ascii
interface ASCIICommandOptions {
  prompt: string; // Required: What to create ASCII art of
}

// Example usage in Discord:
// /ascii starfish
// /ascii dragon breathing fire
// /ascii coffee cup with steam
```

**Response Format:**
- ASCII art is wrapped in code blocks for proper formatting
- Includes a descriptive title showing the requested prompt
- Uses standard ASCII characters for maximum compatibility
- Medium-sized output optimized for Discord display

**Implementation Details:**
```typescript
async function handleAsciiCommand(interaction: ChatInputCommandInteraction) {
  const prompt = interaction.options.getString('prompt', true);
  
  const asciiPrompt = `Create ASCII art of "${prompt}". Make it detailed and recognizable. Use only standard ASCII characters. Make it medium-sized (not too small, not too large). Focus on creating clear, recognizable shapes and patterns that represent "${prompt}".`;
  
  const response = await geminiService.generateResponse(asciiPrompt, interaction.user.id, interaction.guildId || undefined);
  
  const formattedResponse = `Here's your ASCII art of **${prompt}**:\n\`\`\`\n${response}\n\`\`\``;
  
  await interaction.editReply(formattedResponse);
}
```

#### Other Core Commands

For complete command documentation, see the command handlers in `src/index.ts`:

- `/chat` - Direct conversation with the AI
- `/status` - Bot health and API quota information
- `/clear` - Clear conversation history
- `/remember` - Add embarrassing moments about users
- `/addgag` - Add server running gags
- `/setpersonality` / `/mypersonality` - Personality management
- `/execute` - Python code execution (when enabled)
- `/contextstats` - Advanced context statistics
- `/config` - Configuration management (admin only)
- `/preferences` - User preference management
- `/analytics` - Usage analytics and reporting (admin only)
- `/privacy` - Data privacy controls
- `/ascii` - AI-generated ASCII art

## Extension Points

### Command Handler Interface

#### Custom Command Registration
```typescript
interface CommandHandler {
  name: string;
  description: string;
  options: CommandOption[];
  permissions: PermissionLevel[];
  execute(interaction: CommandInteraction): Promise<void>;
}

interface CommandRegistry {
  register(handler: CommandHandler): void;
  unregister(name: string): void;
  get(name: string): CommandHandler | undefined;
  list(): CommandHandler[];
}
```

#### Example Custom Command
```typescript
import { CommandHandler, CommandRegistry } from './commands';

const customCommand: CommandHandler = {
  name: 'weather',
  description: 'Get weather information',
  options: [
    {
      name: 'location',
      description: 'Location to get weather for',
      type: 'string',
      required: true
    }
  ],
  permissions: ['user'],
  async execute(interaction) {
    const location = interaction.options.getString('location', true);
    const weather = await getWeather(location);
    await interaction.reply(`Weather in ${location}: ${weather}`);
  }
};

// Register the command
CommandRegistry.register(customCommand);
```

### Middleware System

#### Middleware Interface
```typescript
interface Middleware {
  name: string;
  priority: number;
  execute(context: MiddlewareContext, next: NextFunction): Promise<void>;
}

interface MiddlewareContext {
  interaction: CommandInteraction;
  user: User;
  server: Guild;
  command: string;
  metadata: Map<string, any>;
}

type NextFunction = () => Promise<void>;
```

#### Example Middleware
```typescript
const loggingMiddleware: Middleware = {
  name: 'logging',
  priority: 100,
  async execute(context, next) {
    const start = Date.now();
    logger.info(`Command ${context.command} started by ${context.user.id}`);
    
    try {
      await next();
      logger.info(`Command ${context.command} completed in ${Date.now() - start}ms`);
    } catch (error) {
      logger.error(`Command ${context.command} failed:`, error);
      throw error;
    }
  }
};
```

### Plugin System

#### Plugin Interface
```typescript
interface Plugin {
  name: string;
  version: string;
  description: string;
  dependencies: string[];
  
  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
}

interface PluginContext {
  services: ServiceRegistry;
  commands: CommandRegistry;
  events: EventEmitter;
  config: BotConfiguration;
}
```

#### Example Plugin
```typescript
class WeatherPlugin implements Plugin {
  name = 'weather';
  version = '1.0.0';
  description = 'Weather information plugin';
  dependencies = ['http-client'];
  
  async initialize(context: PluginContext) {
    // Register weather command
    context.commands.register({
      name: 'weather',
      description: 'Get weather information',
      options: [/* ... */],
      permissions: ['user'],
      execute: this.handleWeatherCommand.bind(this)
    });
    
    // Listen for events
    context.events.on('userJoin', this.handleUserJoin.bind(this));
  }
  
  async shutdown() {
    // Cleanup resources
  }
  
  private async handleWeatherCommand(interaction: CommandInteraction) {
    // Implementation
  }
  
  private async handleUserJoin(user: User) {
    // Implementation
  }
}
```

## Database API

### Data Persistence Interface

```typescript
interface DataStore {
  // Generic storage operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  
  // Collection operations
  getCollection<T>(collection: string): Promise<T[]>;
  addToCollection<T>(collection: string, item: T): Promise<void>;
  removeFromCollection<T>(collection: string, predicate: (item: T) => boolean): Promise<number>;
  
  // Batch operations
  batch(operations: BatchOperation[]): Promise<void>;
  
  // Cleanup and maintenance
  cleanup(retentionDays: number): Promise<number>;
  backup(path: string): Promise<void>;
  restore(path: string): Promise<void>;
}

interface BatchOperation {
  type: 'set' | 'delete';
  key: string;
  value?: any;
}
```

### Analytics Database Schema

```sql
-- Command usage tracking
CREATE TABLE command_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  command_name TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  server_hash TEXT NOT NULL,
  success INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_type TEXT,
  error_category TEXT
);

-- User engagement tracking
CREATE TABLE user_engagement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  user_hash TEXT NOT NULL,
  server_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  interaction_depth INTEGER NOT NULL
);

-- Performance metrics
CREATE TABLE performance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  context TEXT
);
```

## Event System

### Event Emitter Interface

```typescript
interface BotEventEmitter extends EventEmitter {
  // User events
  on(event: 'userJoin', listener: (user: User, server: Guild) => void): this;
  on(event: 'userLeave', listener: (user: User, server: Guild) => void): this;
  on(event: 'userMessage', listener: (message: Message) => void): this;
  
  // Command events
  on(event: 'commandStart', listener: (command: string, user: User) => void): this;
  on(event: 'commandComplete', listener: (command: string, user: User, duration: number) => void): this;
  on(event: 'commandError', listener: (command: string, user: User, error: Error) => void): this;
  
  // System events
  on(event: 'healthAlert', listener: (alert: HealthAlert) => void): this;
  on(event: 'configurationChange', listener: (changes: ConfigurationChange[]) => void): this;
  on(event: 'serviceStart', listener: (service: string) => void): this;
  on(event: 'serviceStop', listener: (service: string) => void): this;
}
```

### Event Usage Example

```typescript
import { botEvents } from './events';

// Listen for health alerts
botEvents.on('healthAlert', (alert) => {
  if (alert.severity === 'critical') {
    notifyAdministrators(alert);
  }
});

// Track command completion
botEvents.on('commandComplete', (command, user, duration) => {
  analytics.trackPerformance(command, duration);
});

// Handle configuration changes
botEvents.on('configurationChange', (changes) => {
  logger.info('Configuration updated:', changes);
  reloadAffectedServices(changes);
});
```

## Testing Utilities

### Mock Services

```typescript
// Mock Gemini service for testing
class MockGeminiService implements GeminiServiceAPI {
  private responses: Map<string, string> = new Map();
  
  setMockResponse(prompt: string, response: string): void {
    this.responses.set(prompt, response);
  }
  
  async processMessage(userId: string, prompt: string): Promise<string> {
    return this.responses.get(prompt) || 'Mock response';
  }
  
  // ... other methods
}

// Test helper functions
export const TestHelpers = {
  createMockInteraction(commandName: string, options: any = {}): CommandInteraction {
    // Create mock Discord interaction
  },
  
  createMockUser(id: string = 'test-user'): User {
    // Create mock Discord user
  },
  
  createMockGuild(id: string = 'test-guild'): Guild {
    // Create mock Discord guild
  },
  
  async waitForEvent(emitter: EventEmitter, event: string, timeout: number = 5000): Promise<any> {
    // Wait for specific event with timeout
  }
};
```

### Integration Testing

```typescript
import { TestHelpers, MockGeminiService } from './test-utils';

describe('Bot Integration Tests', () => {
  let mockGemini: MockGeminiService;
  let testBot: DiscordBot;
  
  beforeEach(async () => {
    mockGemini = new MockGeminiService();
    testBot = new DiscordBot({
      geminiService: mockGemini,
      // ... other mocked services
    });
    await testBot.initialize();
  });
  
  afterEach(async () => {
    await testBot.shutdown();
  });
  
  test('should handle chat command', async () => {
    mockGemini.setMockResponse('Hello', 'Hello there!');
    
    const interaction = TestHelpers.createMockInteraction('chat', {
      message: 'Hello'
    });
    
    await testBot.handleCommand(interaction);
    
    expect(interaction.replied).toBe(true);
    expect(interaction.reply).toHaveBeenCalledWith('Hello there!');
  });
});
```

## Performance Monitoring API

### Benchmarking Interface

```typescript
interface BenchmarkAPI {
  // Performance measurement
  startTimer(operation: string): PerformanceTimer;
  measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<T>;
  measureSync<T>(operation: string, fn: () => T): T;
  
  // Memory profiling
  profileMemory(duration: number): Promise<MemoryProfile>;
  takeMemorySnapshot(): MemorySnapshot;
  
  // Load testing
  runLoadTest(config: LoadTestConfig): Promise<LoadTestResults>;
  
  // Reporting
  generatePerformanceReport(): Promise<PerformanceReport>;
  exportMetrics(format: 'json' | 'csv'): Promise<string>;
}

interface PerformanceTimer {
  stop(): number;
  lap(): number;
}

interface LoadTestConfig {
  concurrentUsers: number;
  duration: number;
  operations: OperationConfig[];
}
```

### Usage Example

```typescript
import { benchmark } from './utils/benchmark';

// Measure async operation
const result = await benchmark.measureAsync('gemini_request', async () => {
  return await geminiService.processMessage('user123', 'Hello world');
});

// Profile memory usage
const memoryProfile = await benchmark.profileMemory(60000); // 1 minute
console.log(`Peak memory usage: ${memoryProfile.peak}MB`);

// Run load test
const loadTestResults = await benchmark.runLoadTest({
  concurrentUsers: 50,
  duration: 300000, // 5 minutes
  operations: [
    { name: 'chat_command', weight: 0.8 },
    { name: 'status_command', weight: 0.2 }
  ]
});
```

## Security API

### Authentication and Authorization

```typescript
interface SecurityAPI {
  // Authentication
  authenticateUser(userId: string, token?: string): Promise<AuthenticationResult>;
  generateUserToken(userId: string): Promise<string>;
  validateToken(token: string): Promise<TokenValidation>;
  
  // Authorization
  checkPermission(userId: string, permission: string): Promise<boolean>;
  getUserRoles(userId: string): Promise<string[]>;
  assignRole(userId: string, role: string): Promise<void>;
  
  // Security auditing
  logSecurityEvent(event: SecurityEvent): Promise<void>;
  getSecurityAudit(timeframe: string): Promise<SecurityAuditLog>;
  
  // Rate limiting
  checkRateLimit(identifier: string, operation: string): Promise<RateLimitResult>;
  updateRateLimit(identifier: string, operation: string): Promise<void>;
}

interface SecurityEvent {
  type: 'authentication' | 'authorization' | 'suspicious_activity';
  userId: string;
  description: string;
  metadata?: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
}
```

## Development Guidelines

### Code Style and Standards

```typescript
// Use strict TypeScript configuration
// Always define interfaces for public APIs
// Implement proper error handling
// Include comprehensive JSDoc comments

/**
 * Processes a user message through the Gemini AI service
 * @param userId - Unique identifier for the user
 * @param prompt - The user's message/prompt
 * @param serverId - Optional server identifier for context
 * @returns Promise resolving to the AI response
 * @throws {RateLimitError} When rate limit is exceeded
 * @throws {ValidationError} When input validation fails
 */
async processMessage(
  userId: string, 
  prompt: string, 
  serverId?: string
): Promise<string> {
  // Implementation with proper error handling
}
```

### Error Handling Patterns

```typescript
// Define custom error types
export class BotError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'BotError';
  }
}

export class RateLimitError extends BotError {
  constructor(resetTime: number) {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
    this.resetTime = resetTime;
  }
}

// Use Result type for error handling
type Result<T, E = Error> = {
  success: true;
  data: T;
} | {
  success: false;
  error: E;
};
```

### Logging Standards

```typescript
import { logger } from '../utils/logger';

// Structured logging with context
logger.info('Processing message', {
  userId,
  serverId,
  promptLength: prompt.length,
  operation: 'gemini_request'
});

// Error logging with stack traces
logger.error('Gemini API request failed', {
  error: error.message,
  stack: error.stack,
  userId,
  retryAttempt: 2
});
```

This comprehensive API reference provides all the necessary information for developers to extend, integrate with, and contribute to the Discord LLM Bot effectively.