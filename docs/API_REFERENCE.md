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

The GeminiService is the primary AI interface for the Discord LLM Bot, providing comprehensive text generation, multimodal processing, and sophisticated response processing capabilities.

#### Core Interface Definition

```typescript
interface IAIService extends 
  IAITextGenerator,
  IAIQuotaManager,
  IAIConversationManager,
  IAIContextManager,
  IAIDependencyManager,
  IAICacheManager,
  IAIDegradationManager,
  IAIConfigurationManager {
}

interface IAITextGenerator {
  generateResponse(
    prompt: string,
    userId: string,
    serverId?: string,
    respond?: (response: string) => Promise<void>,
    messageContext?: MessageContext,
    member?: GuildMember,
    guild?: Guild,
    imageAttachments?: Array<{
      url: string;
      mimeType: string;
      base64Data: string;
      filename?: string;
      size?: number;
    }>
  ): Promise<string>;
}
```

#### Complete Public API Surface

##### Core AI Generation Methods
```typescript
// Primary text generation with full context support
generateResponse(
  prompt: string,
  userId: string,
  serverId?: string,
  respond?: (response: string) => Promise<void>,
  messageContext?: MessageContext,
  member?: GuildMember,
  guild?: Guild,
  imageAttachments?: ImageAttachment[]
): Promise<string>
```

**Key Features:**
- **Multimodal Support**: Text + image + video processing with base64 encoding
- **Video Processing**: Support for MP4, MOV, AVI, WebM formats (up to 20MB, 3min duration)
- **Token Cost Management**: Automatic cost estimation and user confirmation for video
- **Streaming Responses**: Real-time response streaming via callback
- **Rich Context**: Discord member, guild, and channel metadata integration
- **Graceful Degradation**: Circuit breaker and fallback mechanisms

##### Service Management Methods
```typescript
// Service lifecycle management
initialize(): Promise<void>
shutdown(): Promise<void>
setHealthMonitor(healthMonitor: IHealthMonitor): void
setDiscordClient(client: Client): void
getHealthStatus(): ServiceHealthStatus

// API quota management
getRemainingQuota(): { 
  minuteRemaining: number; 
  dailyRemaining: number; 
}
```

##### Conversation Management
```typescript
// Conversation history management
clearUserConversation(userId: string): boolean
getConversationStats(): {
  activeUsers: number;
  totalMessages: number;
  totalContextSize: number;
}
buildConversationContext(userId: string, messageLimit?: number): string
```

##### Context Management
```typescript
// Server context enrichment
addEmbarrassingMoment(serverId: string, userId: string, moment: string): void
addRunningGag(serverId: string, gag: string): void
```

##### Cache Management
```typescript
// Performance optimization
getCacheStats(): CacheStats
getCachePerformance(): CachePerformance
clearCache(): void
```

##### Configuration Management
```typescript
// Dynamic configuration updates
updateConfiguration(config: AIServiceConfig): Promise<void>
validateConfiguration(config: BotConfiguration): Promise<{
  valid: boolean;
  errors: string[];
}>
```

##### Service Access Methods
```typescript
// Access to integrated services
getPersonalityManager(): IPersonalityManager
getRateLimiter(): IRateLimiter
getContextManager(): IContextManager
getRoastingEngine(): IRoastingEngine
getConversationManager(): IConversationManager
```

#### Configuration Interfaces

##### Gemini Configuration
```typescript
interface GeminiConfig {
  model: string;
  temperature: number;
  topK: number;
  topP: number;
  maxTokens: number;
  safetySettings: {
    harassment: SafetyLevel;
    hateSpeech: SafetyLevel;
    sexuallyExplicit: SafetyLevel;
    dangerousContent: SafetyLevel;
  };
  systemInstructions: {
    roasting: string;
    helpful: string;
  };
  grounding: {
    threshold: number;
    enabled: boolean;
  };
  thinking: {
    budget: number;
    includeInResponse: boolean;
  };
}

type SafetyLevel = 'block_none' | 'block_low_and_above' | 'block_medium_and_above' | 'block_high';
```

##### Enhanced Vision Configuration
```typescript
// Specialized configurations for multimodal processing
export const VISION_CONFIGS = {
  SNL_EXPERT: {
    model: 'gemini-2.0-flash-exp',
    systemInstruction: 'You are an expert in character recognition and analysis...',
    generationConfig: { temperature: 0.1, topK: 10, topP: 0.5 }
  },
  HIGH_ACCURACY_VISION: {
    model: 'gemini-2.0-flash-exp',
    systemInstruction: 'Provide extremely detailed and accurate analysis...',
    generationConfig: { temperature: 0.05, topK: 5, topP: 0.3 }
  }
};
```

#### Response Processing Architecture

##### Processing Pipeline
The GeminiService implements a sophisticated response processing pipeline:

```typescript
interface ResponseProcessingPipeline {
  // 1. Degradation Check
  handleDegradationCheck(): Promise<boolean>;
  
  // 2. Cache Lookup
  handleCacheLookup(cacheKey: string): Promise<string | null>;
  
  // 3. Input Validation
  validateInputAndRateLimits(userId: string, prompt: string): Promise<void>;
  
  // 4. AI Generation
  performAIGeneration(context: GenerationContext): Promise<string>;
  
  // 5. Post-Generation Processing
  handlePostGeneration(response: string, context: GenerationContext): Promise<void>;
  
  // 6. Error Handling
  handleGenerationError(error: Error, context: GenerationContext): Promise<string>;
}
```

##### Context Aggregation
```typescript
interface ContextSources {
  conversationContext: string | null;
  superContext: string;
  serverCultureContext: string;
  personalityContext: string | null;
  messageContextString: string;
  systemContextString: string;
  dateContext: string;
}
```

#### Usage Patterns and Integration Examples

##### Standard Response Generation
```typescript
// Basic text generation with context
const response = await geminiService.generateResponse(
  "How do I implement async/await in JavaScript?",
  interaction.user.id,
  interaction.guildId || undefined,
  undefined,
  messageContext,
  interaction.member as GuildMember | undefined
);
```

##### Streaming Response Pattern
```typescript
// Real-time response streaming for better UX
const respondCallback = async (responseText: string) => {
  if (responseText && !responseSent) {
    responseSent = true;
    const chunks = splitMessage(responseText, 2000);
    await message.reply(chunks[0]);
    
    // Send remaining chunks
    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send(chunks[i]);
    }
  }
};

const response = await geminiService.generateResponse(
  prompt,
  message.author.id,
  message.guild?.id,
  respondCallback, // Streaming callback
  messageContext,
  message.member || undefined,
  message.guild || undefined,
  imageAttachments
);
```

##### Multimodal Processing Integration
```typescript
// Image processing with comprehensive metadata
const imageAttachments: ImageAttachment[] = [];

for (const attachment of attachments.values()) {
  if (attachment.contentType && supportedImageTypes.includes(attachment.contentType)) {
    const response = await fetch(attachment.url);
    const buffer = await response.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString('base64');
    
    imageAttachments.push({
      url: attachment.url,
      mimeType: attachment.contentType,
      base64Data: base64Data,
      filename: attachment.name,
      size: attachment.size
    });
  }
}

const response = await geminiService.generateResponse(
  prompt,
  userId,
  serverId,
  respondCallback,
  messageContext,
  member,
  guild,
  imageAttachments // Multimodal support
);
```

##### Error Handling and Graceful Degradation
```typescript
// Circuit breaker integration
try {
  const response = await gracefulDegradation.executeWithCircuitBreaker(
    async () => {
      return await geminiService.generateResponse(...);
    },
    'gemini'
  );
  await respondCallback(response);
} catch (error) {
  // Fallback response generation
  const fallback = await gracefulDegradation.generateFallbackResponse(
    prompt, userId, serverId
  );
  await respondCallback(fallback);
}
```

##### Retry Logic with Exponential Backoff
```typescript
// Retry handler integration
const response = await retryHandler.executeWithRetry(
  async () => {
    return await geminiService.generateResponse(...);
  },
  { 
    maxRetries: 3, 
    retryDelay: 1000, 
    retryMultiplier: 2.0 
  },
  (error) => retryHandler.isRetryableError(error)
);
```

#### Service Factory and Dependency Injection

##### Service Creation Pattern
```typescript
// Comprehensive dependency injection
const services = serviceFactory.createAIServiceWithDependencies(
  apiKey,
  geminiConfig,
  {
    rateLimiter: await serviceFactory.createRateLimiter(config.rateLimiting),
    contextManager: await serviceFactory.createContextManager(config.context),
    personalityManager: await serviceFactory.createPersonalityManager(config.personality),
    cacheManager: await serviceFactory.createCacheManager(config.cache),
    gracefulDegradation: await serviceFactory.createGracefulDegradation(config.degradation),
    roastingEngine: await serviceFactory.createRoastingEngine(config.roasting),
    conversationManager: await serviceFactory.createConversationManager(config.conversation),
    retryHandler: await serviceFactory.createRetryHandler(config.retry),
    systemContextBuilder: await serviceFactory.createSystemContextBuilder(config.system),
    responseProcessingService: await serviceFactory.createResponseProcessingService(config.processing)
  }
);
```

#### Performance Optimization Patterns

##### Intelligent Message Splitting
```typescript
// Thinking-aware response formatting
function splitResponse(responseText: string, maxLength: number = 2000): string[] {
  if (responseText.includes('💭 **Thinking:**') && responseText.includes('**Response:**')) {
    return splitThinkingResponse(responseText, maxLength);
  } else {
    return splitMessage(responseText, maxLength);
  }
}
```

##### Race Condition Prevention
```typescript
// User-specific mutex management
const userMutex = raceConditionManager.getUserMutex(userKey);
const release = await userMutex.acquire();
try {
  const response = await geminiService.generateResponse(...);
  await handleResponse(response);
} finally {
  release();
}
```

##### Large Context Optimization
```typescript
// Intelligent context summarization
if (conversationContext && conversationContext.length > 500000) {
  logger.info('Large context detected, triggering summarization', {
    userId,
    contextSize: conversationContext.length
  });
  
  const summarizedContext = await largeContextHandler.summarizeContext(
    conversationContext,
    userId
  );
  
  conversationContext = summarizedContext;
}
```

#### Advanced Integration Patterns

##### Health Monitoring Integration
```typescript
// Service health tracking
geminiService.setHealthMonitor(healthMonitor);
const status = geminiService.getHealthStatus();

if (!status.healthy) {
  logger.warn('GeminiService unhealthy', {
    reason: status.reason,
    metrics: status.metrics
  });
}
```

##### Analytics Integration
```typescript
// Usage tracking and performance monitoring
await analyticsService.trackCommandUsage({
  commandName: 'chat',
  userHash: hashUserId(userId),
  success: true,
  durationMs: processingTime,
  modelUsed: geminiService.getCurrentModel()
});
```

#### Security and Privacy Features

##### Data Protection
```typescript
// User data management
interface PrivacyControls {
  optOutUser(userId: string): Promise<void>;
  optInUser(userId: string): Promise<void>;
  exportUserData(userId: string): Promise<UserAnalyticsData>;
  deleteUserData(userId: string): Promise<void>;
}
```

##### Rate Limiting and Quota Management
```typescript
// Intelligent quota management
const quota = geminiService.getRemainingQuota();
if (quota.minuteRemaining < 5) {
  logger.warn('Low API quota detected', quota);
  await gracefulDegradation.activateQuotaProtection();
}
```

This comprehensive API documentation provides developers with everything needed to integrate with, extend, and troubleshoot the GeminiService effectively.

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
  
  // Video processing configuration
  video: {
    enabled: boolean;
    maxDurationSeconds: number;
    maxFileSizeMB: number;
    supportedFormats: string[];
    tokenWarningThreshold: number;
    requireConfirmation: boolean;
    youtubeUrlSupport: boolean;
    processingTimeoutSeconds: number;
    rateLimits: {
      tokensPerHour: number;
      tokensPerDay: number;
      requestsPerHour: number;
      requestsPerDay: number;
      cooldownSeconds: number;
    };
  };
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

### Video Processing Service

The video processing service handles multimodal content including video files and YouTube URLs with comprehensive cost management and user experience optimization.

#### Interface Definition
```typescript
interface VideoProcessingService {
  // Configuration management
  isVideoSupportEnabled(): boolean;
  getVideoConfiguration(): VideoConfiguration;
  updateVideoConfiguration(config: Partial<VideoConfiguration>): Promise<void>;
  
  // Video validation
  validateVideoFile(file: VideoFile): ValidationResult;
  validateVideoUrl(url: string): ValidationResult;
  
  // Cost estimation
  estimateTokenCost(durationSeconds: number): number;
  estimateProcessingTime(durationSeconds: number): number;
  
  // Processing workflow
  requestVideoProcessing(request: VideoProcessingRequest): Promise<VideoProcessingResponse>;
  processVideo(videoData: VideoData, options: ProcessingOptions): Promise<string>;
  
  // Rate limiting
  checkVideoRateLimit(userId: string, estimatedTokens: number): Promise<VideoRateLimitResult>;
  
  // User experience
  generateConfirmationPrompt(request: VideoProcessingRequest): ConfirmationPrompt;
  generateProcessingStatus(request: VideoProcessingRequest): ProcessingStatus;
}

interface VideoFile {
  filename: string;
  size: number;
  mimeType: string;
  duration?: number;
  url: string;
}

interface VideoProcessingRequest {
  user: { id: string; username: string };
  video: VideoFile;
  estimatedDuration: number;
  requestId: string;
  timestamp: number;
}

interface VideoProcessingResponse {
  success: boolean;
  requestId: string;
  estimatedTokens: number;
  estimatedProcessingTime: number;
  confirmationRequired: boolean;
  errorMessage?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

#### Configuration Options
```typescript
interface VideoConfiguration {
  // Core settings
  videoSupportEnabled: boolean;
  maxVideoDurationSeconds: number;
  videoFileSizeLimitMB: number;
  supportedVideoFormats: string[];
  
  // Cost management
  videoTokenWarningThreshold: number;
  requireVideoConfirmation: boolean;
  videoProcessingTimeoutSeconds: number;
  
  // Platform support
  youtubeUrlSupportEnabled: boolean;
  
  // Rate limiting
  rateLimits: {
    tokensPerHour: number;
    tokensPerDay: number;
    requestsPerHour: number;
    requestsPerDay: number;
    cooldownSeconds: number;
  };
}
```

#### Usage Example
```typescript
import { VideoProcessingService } from './services/videoProcessingService';
import { VideoUXHelper, VideoProcessingEstimator } from './config/videoConfig';

const videoService = new VideoProcessingService();

// Check if video support is enabled
if (!videoService.isVideoSupportEnabled()) {
  return "Video processing is disabled";
}

// Validate video file
const videoFile = {
  filename: "example.mp4",
  size: 15728640, // 15MB
  mimeType: "video/mp4",
  duration: 120,
  url: "https://example.com/video.mp4"
};

const validation = videoService.validateVideoFile(videoFile);
if (!validation.valid) {
  console.error("Video validation failed:", validation.errors);
  return;
}

// Estimate costs
const tokenCost = VideoProcessingEstimator.estimateTokenCost(120);
const processingTime = VideoProcessingEstimator.estimateProcessingTime(120);

console.log(`Estimated cost: ${tokenCost} tokens`);
console.log(`Estimated processing time: ${processingTime} seconds`);

// Check rate limits
const rateLimitCheck = await videoService.checkVideoRateLimit("user123", tokenCost);
if (!rateLimitCheck.allowed) {
  console.error("Rate limit exceeded:", rateLimitCheck.reason);
  return;
}

// Process video with confirmation
const request: VideoProcessingRequest = {
  user: { id: "user123", username: "testuser" },
  video: videoFile,
  estimatedDuration: 120,
  requestId: "req-" + Date.now(),
  timestamp: Date.now()
};

const response = await videoService.requestVideoProcessing(request);
if (response.confirmationRequired) {
  const prompt = videoService.generateConfirmationPrompt(request);
  // Show confirmation to user
}
```

#### Environment Variables
```bash
# Video processing configuration
VIDEO_SUPPORT_ENABLED=false
MAX_VIDEO_DURATION_SECONDS=180
VIDEO_FILE_SIZE_LIMIT_MB=20
VIDEO_TOKEN_WARNING_THRESHOLD=10000
YOUTUBE_URL_SUPPORT_ENABLED=true
REQUIRE_VIDEO_CONFIRMATION=true

# Rate limiting for video processing
VIDEO_TOKENS_PER_HOUR=100000
VIDEO_TOKENS_PER_DAY=500000
VIDEO_REQUESTS_PER_HOUR=10
VIDEO_REQUESTS_PER_DAY=50
VIDEO_REQUEST_COOLDOWN_SECONDS=60
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