# Error Handling and Recovery Guide

## Table of Contents

1. [Overview](#overview)
2. [Error Handling Patterns by Layer](#error-handling-patterns-by-layer)
3. [Circuit Breaker System](#circuit-breaker-system)
4. [Graceful Degradation](#graceful-degradation)
5. [Health Monitoring Integration](#health-monitoring-integration)
6. [Error Scenarios and Recovery Procedures](#error-scenarios-and-recovery-procedures)
7. [Message Queue Management](#message-queue-management)
8. [Fallback Response System](#fallback-response-system)
9. [Manual Recovery Procedures](#manual-recovery-procedures)
10. [Error Code Reference](#error-code-reference)
11. [Monitoring and Observability](#monitoring-and-observability)
12. [Configuration Reference](#configuration-reference)
13. [Best Practices and Standardization](#best-practices-and-standardization)

## Overview

The Discord LLM Bot implements a comprehensive error handling and recovery system designed to maintain service availability during various failure scenarios. The system combines circuit breaker patterns, graceful degradation, message queuing, and automated recovery mechanisms.

### Core Components

- **GracefulDegradation Service**: Central error handling and recovery coordination
- **HealthMonitor Service**: Continuous system health assessment and alerting
- **Circuit Breakers**: Per-service failure protection for Gemini and Discord APIs
- **Message Queue**: Request queuing during degraded states
- **Fallback System**: Alternative responses when primary services are unavailable

## Error Handling Patterns by Layer

This section documents the comprehensive error handling patterns implemented across all layers of the Discord bot architecture, providing specific examples and file references for each pattern.

### Services Layer Patterns

#### 1. BaseService Template Pattern (`src/services/base/BaseService.ts`)

**Pattern**: Standardized error handling through inheritance with template methods
- **Lines 85-101**: Template method for initialization with comprehensive try-catch
- **Lines 106-127**: Template method for shutdown with error continuation
- **Lines 249-257, 301-308**: Timer creation with error handling and logging

**Key Features**:
- Standardized error logging with service name context
- Error propagation with enhanced error messages
- Graceful degradation during shutdown (continues despite errors)
- Timer error isolation to prevent cascade failures

**Implementation Example**:
```typescript
try {
  logger.info(`Initializing ${this.getServiceName()}...`);
  await this.performInitialization();
  this.isInitialized = true;
  logger.info(`${this.getServiceName()} initialized successfully`);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  logger.error(`Failed to initialize ${this.getServiceName()}: ${errorMessage}`, error);
  throw new Error(`${this.getServiceName()} initialization failed: ${errorMessage}`);
}
```

#### 2. Retry Handler Service (`src/services/retryHandler.ts`)

**Pattern**: Dedicated retry orchestration with exponential backoff
- **Lines 72-127**: Core retry execution with configurable retry logic
- **Lines 129-162**: Categorized retryable error detection
- **Lines 164-219**: User-friendly error message translation

**Error Categories Handled**:
- Network errors (timeouts, connection resets, DNS failures)
- Server errors (5xx HTTP status codes)
- Rate limiting (429 status codes)
- Temporary service unavailability

#### 3. Circuit Breaker Pattern (`src/services/gracefulDegradation.ts`)

**Pattern**: Circuit breaker with graceful degradation
- **Lines 217-257**: Circuit breaker execution wrapper
- **Lines 599-622**: Success recording with state transitions
- **Lines 640-658**: Failure recording with threshold management

**Circuit States**:
- **CLOSED**: Normal operation with failure monitoring
- **OPEN**: Fast failure with timeout-based recovery
- **HALF-OPEN**: Testing recovery with limited retries

#### 4. Mutex-Protected Operations (`src/services/rateLimiter.ts`)

**Pattern**: Thread-safe operations with resource protection
- **Lines 110-156**: Rate limit checking with mutex protection
- **Lines 264-274**: State persistence with atomic writes
- **Lines 345-380**: Retry operations with rate limit handling

**Resource Protection**:
- Mutex acquisition/release with finally blocks
- Atomic state updates with rollback capabilities
- I/O operation isolation with separate mutex

#### 5. Self-Healing Monitoring (`src/services/healthMonitor.ts`)

**Pattern**: Proactive monitoring with automated recovery
- **Lines 539-620**: Alert checking with cooldown management
- **Lines 642-722**: Self-healing attempt mechanisms
- **Lines 847-883**: Metrics collection with error isolation

**Self-Healing Mechanisms**:
- Memory cleanup (cache clearing, garbage collection)
- Error rate reset (buffer clearing)
- Performance optimization (cache management)
- Service reconnection attempts

### Handlers and Events Layer Patterns

#### 1. User-Facing Error Communication (`src/handlers/commandHandlers.ts`)

**Pattern**: Comprehensive try-catch with context-specific user messaging
- **File:Line**: commandHandlers.ts:99-102, 145-151, 414-417
- **Approach**: Each command handler wraps operations and provides user-friendly error messages

**Permission Validation Pattern**:
```typescript
if (!hasAdminPermissions(interaction)) {
  await interaction.reply({ 
    content: 'You need Administrator or Manage Server permissions to use this command!', 
    ephemeral: true 
  });
  return;
}
```

**Input Validation Pattern**:
```typescript
if (!prompt) {
  await interaction.reply('Please provide a message!');
  return;
}
```

#### 2. Multi-Layer Error Handling (`src/handlers/eventHandlers.ts`)

**Pattern**: Nested try-catch blocks with specific error recovery
- **Lines 139-151**: Command execution errors
- **Lines 1094-1105**: User communication errors
- **Lines 1106-1114**: Final safety net

**Race Condition Prevention**:
- **Lines 360-391**: Mutex-based duplicate message prevention with atomic operations
- Prevents concurrent processing with comprehensive logging

#### 3. API Interaction Error Recovery (`src/handlers/eventHandlers.ts`)

**Pattern**: Graceful degradation with fallback responses
- **Lines 894-922**: Local analysis fallback when API analysis fails
- **Lines 926-929**: Continued operation despite analysis failures

**Example**:
```typescript
} catch (analysisError) {
  logger.error('Error generating user analysis:', analysisError);
  // Fallback: Create basic roast without AI
  const fallbackRoast = `Oh, ${targetUser.username}... where do I even begin?`;
  await replyMessage.edit(fallbackRoast);
}
```

### Utilities and Core Component Patterns

#### 1. Comprehensive Error Management (`src/utils/DataStore.ts`)

**Pattern**: Full try-catch coverage with typed error handling and recovery
- **Lines 358-378**: Multi-level error recovery with backup restoration
- **Lines 810-838**: Retry logic with exponential backoff and jitter

**Error Categories**:
- ENOENT handling with null returns
- Syntax error detection with backup recovery
- Validation failure handling with rollback
- Monitoring integration with error metrics

**Implementation Example**:
```typescript
try {
  const data = this.config.serialization.deserialize(content);
  if (!this.config.validator(data)) {
    throw new Error('Data validation failed during load');
  }
  return data as T;
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    this.debugLog(`File not found: ${this.filePath}`);
    return null;
  }
  if (error instanceof SyntaxError || 
      (error instanceof Error && error.message.includes('validation failed'))) {
    logger.warn(`Data file corrupted, attempting backup recovery: ${this.filePath}`);
    return await this.recoverFromBackup();
  }
  this.metrics.errorCount++;
  throw error;
}
```

#### 2. Custom Error Types (`src/utils/MutexManager.ts`)

**Pattern**: Custom error classes with context and timeout handling
- **Lines 333-338**: MutexTimeoutError with context information
- **Lines 94-151**: Timeout protection with statistical tracking

**Custom Error Definition**:
```typescript
export class MutexTimeoutError extends Error {
  constructor(message: string, public mutexName: string) {
    super(message);
    this.name = 'MutexTimeoutError';
  }
}
```

#### 3. Partial Failure Handling (`src/utils/largeContextHandler.ts`)

**Pattern**: Individual chunk processing with error isolation
- **Lines 67-86**: Continues processing other chunks if one fails
- Resource management with automatic cleanup

**Implementation Example**:
```typescript
for (let i = 0; i < chunks.length; i++) {
  try {
    const result = await processor(chunks[i], i, chunks.length);
    results.push(result);
  } catch (error) {
    logger.error('Error processing chunk', { 
      chunkIndex: i, 
      totalChunks: chunks.length, 
      error 
    });
    results.push(''); // Continue with empty result
  }
}
```

#### 4. Silent Error Handling (`src/utils/validation.ts`)

**Pattern**: Catches errors but returns default values without logging
- **Lines 199-205**: URL validation with silent failure
- **Note**: This pattern is identified as needing improvement

**Current Implementation** (needs enhancement):
```typescript
try {
  new URL(value);
  return true;
} catch {
  return false; // Silent failure - no logging
}
```

### Error Type Classification

#### 1. Discord API Errors
- **Location**: conversationManager.ts:345-380, gemini.ts:456-485
- **Types**: Rate limits (code: 50013), permissions, network timeouts
- **Recovery**: Exponential backoff, permission fallbacks, retry mechanisms

#### 2. Configuration Errors
- **Location**: configurationManager.ts:608-649, BaseService.ts:96-100
- **Types**: Schema validation failures, environment variable issues
- **Recovery**: Default value fallbacks, graceful degradation

#### 3. Service Initialization Errors
- **Location**: BaseService.ts:85-101, healthMonitor.ts:199-224
- **Types**: Resource allocation failures, dependency injection issues
- **Recovery**: Resource cleanup, error propagation with context

#### 4. Runtime Operation Errors
- **Location**: contextManager.ts:468-487, cacheManager.ts:166-186
- **Types**: Memory exhaustion, data corruption, timeout failures
- **Recovery**: Automatic cleanup, cache eviction, timer reset

#### 5. External Service Errors
- **Location**: gemini.ts:1300-1352, retryHandler.ts:129-162
- **Types**: API failures, network issues, service unavailability
- **Recovery**: Circuit breaker patterns, fallback responses, retry logic

### Critical Failure Scenarios Identified

#### High Priority Issues

1. **messageSplitter.ts** - No Error Boundaries
   - **Risk**: Infinite loops with malformed input
   - **Impact**: Service hang, memory exhaustion
   - **Recovery**: Add input validation and timeout protection

2. **validation.ts** - Silent URL Validation
   - **Risk**: Invalid URLs accepted without error context
   - **Impact**: Downstream failures with poor debugging
   - **Recovery**: Add error logging and context reporting

3. **botInitializer.ts** - No Initialization Timeout
   - **Risk**: Hang during service startup
   - **Impact**: Bot never becomes available
   - **Recovery**: Add timeout wrapper with graceful failure

#### Medium Priority Issues

1. **raceConditionManager.ts** - Silent Typing Failures
   - **Risk**: User experience degradation without visibility
   - **Recovery**: Add warning-level logging for typing failures

2. **largeContextHandler.ts** - No Disk Space Validation
   - **Risk**: Failed writes without clear error messaging
   - **Recovery**: Add disk space checks before write operations

## Circuit Breaker System

### Circuit Breaker States

The system maintains separate circuit breakers for each external service (Gemini API, Discord API) with three distinct states:

#### CLOSED State (Normal Operation)
```
Service: Available and healthy
Behavior: All requests pass through normally
Monitoring: Tracking failure rate and response times
Transition: → OPEN when failure threshold exceeded
```

#### OPEN State (Service Failed)
```
Service: Considered unavailable
Behavior: All requests fail immediately
Duration: Configured reset timeout (default: 60 seconds)
Transition: → HALF-OPEN after timeout expires
```

#### HALF-OPEN State (Testing Recovery)
```
Service: Testing for recovery
Behavior: Limited requests allowed (default: 3 retries)
Success: → CLOSED after consecutive successes
Failure: → OPEN immediately
```

### State Transition Diagram

```
     ┌─────────┐     Failures ≥ Threshold     ┌──────┐
     │ CLOSED  │ ─────────────────────────────→│ OPEN │
     │         │                               │      │
     │ Normal  │                               │ Fast │
     │ Operation│                               │ Fail │
     └─────────┘                               └──────┘
          ↑                                       │
          │                                       │
          │ Success ≥ Required                    │ Timeout
          │                                       │ Expires
          │                                       ↓
      ┌──────────┐                           ┌─────────┐
      │HALF-OPEN │                           │ WAIT    │
      │          │                           │ STATE   │
      │ Testing  │←──────────────────────────│         │
      │ Recovery │                           └─────────┘
      └──────────┘
```

### Circuit Breaker Configuration

```typescript
// Default values - configurable via environment variables
const circuitBreakerConfig = {
  maxFailures: 5,              // DEGRADATION_MAX_FAILURES
  resetTimeoutMs: 60000,       // DEGRADATION_RESET_TIMEOUT_MS
  halfOpenMaxRetries: 3        // DEGRADATION_HALF_OPEN_RETRIES
};
```

## Graceful Degradation

### Degradation Triggers

The system evaluates multiple factors to determine when to enter degraded mode:

#### 1. Circuit Breaker States
- **High Severity**: Both Gemini and Discord circuits open
- **High Severity**: Gemini circuit open (core functionality lost)
- **Medium Severity**: Discord circuit open (communication issues)

#### 2. Health Metrics
- **High Severity**: Memory usage > 400MB (configurable)
- **Medium Severity**: Error rate > 10% (configurable)
- **Medium Severity**: P95 response time > 10 seconds (configurable)
- **High Severity**: API health checks failing

#### 3. System Pressure
- **Medium Severity**: Message queue > 80% capacity
- **Low Severity**: Normal operational variance

### Degradation Severity Levels

#### Low Severity
```
Status: Minor performance variations
Response: Continue normal operation with monitoring
Fallbacks: None required
Queue: Normal processing
```

#### Medium Severity
```
Status: Service issues or performance degradation
Response: Queue incoming messages, use cached responses
Fallbacks: Generic fallback responses with context
Queue: Active processing when possible
```

#### High Severity
```
Status: Critical service failures
Response: Maintenance mode responses
Fallbacks: Maintenance mode messages
Queue: Hold all messages until recovery
```

## Health Monitoring Integration

### Health Metrics Collection

The HealthMonitor service provides real-time metrics for degradation decisions:

```typescript
interface HealthMetrics {
  memoryUsage: NodeJS.MemoryUsage;      // System memory consumption
  activeConversations: number;           // Current active sessions
  errorRate: number;                     // Percentage of failed requests
  responseTime: {                        // Performance percentiles
    p50: number;
    p95: number;
    p99: number;
  };
  apiHealth: {                          // External service status
    gemini: boolean;
    discord: boolean;
  };
  contextMetrics: {                     // Context system health
    totalServers: number;
    totalMemoryUsage: number;
    // ... additional metrics
  };
}
```

### Health Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Memory Usage | 300MB | 400MB | Trigger degradation |
| Error Rate | 5% | 10% | Queue messages |
| P95 Response Time | 5s | 10s | Enable fallbacks |
| API Health | Intermittent | Persistent | Circuit breaker |

### Alert Configuration

```typescript
const alertConfig = {
  memoryThreshold: 500,           // MB
  errorRateThreshold: 5.0,        // Percentage
  responseTimeThreshold: 5000,    // Milliseconds
  diskSpaceThreshold: 85.0,       // Percentage
  enabled: true
};
```

## Error Scenarios and Recovery Procedures

### Scenario 1: Gemini API Outage

**Symptoms:**
- High failure rate from Gemini service
- Circuit breaker transitioning to OPEN state
- Users receiving timeout errors

**Automatic Response:**
1. Circuit breaker opens after 5 consecutive failures
2. System enters HIGH severity degradation
3. Incoming messages queued for later processing
4. Users receive maintenance mode responses

**Recovery Process:**
1. Health checks attempt recovery every 60 seconds
2. Circuit transitions to HALF-OPEN for testing
3. Limited requests allowed to validate recovery
4. Full service restoration on successful validation

**Manual Recovery Steps:**
```bash
# Check current circuit breaker status
curl http://localhost:3000/api/health/degradation

# Manually trigger recovery
curl -X POST http://localhost:3000/api/admin/recovery/gemini

# Monitor recovery progress
tail -f logs/application.log | grep "Circuit breaker"
```

### Scenario 2: Memory Pressure

**Symptoms:**
- Memory usage exceeding 400MB
- Slow response times
- Potential memory leak indicators

**Automatic Response:**
1. Health monitor triggers degradation
2. System reduces processing load
3. Message queuing activated
4. Memory cleanup procedures initiated

**Recovery Process:**
1. Automatic garbage collection
2. Context optimization and compression
3. Queue processing suspension during high memory
4. Gradual service restoration as memory stabilizes

**Manual Recovery Steps:**
```bash
# Force garbage collection
curl -X POST http://localhost:3000/api/admin/gc

# Check memory statistics
curl http://localhost:3000/api/health/memory

# Restart service if necessary
npm run restart
```

### Scenario 3: Discord Connection Loss

**Symptoms:**
- Discord API failures
- Message sending failures
- Webhook connectivity issues

**Automatic Response:**
1. Discord circuit breaker activates
2. MEDIUM severity degradation mode
3. Message queuing for retry
4. Alternative response channels explored

**Recovery Process:**
1. Connection health checks
2. Discord client reconnection attempts
3. Message queue processing on recovery
4. Service validation and restoration

### Scenario 4: High Error Rate

**Symptoms:**
- Error rate exceeding 10%
- Multiple service failures
- User experience degradation

**Automatic Response:**
1. Error rate monitoring triggers degradation
2. Enhanced error logging
3. Fallback response activation
4. Service load reduction

**Recovery Process:**
1. Error pattern analysis
2. Service-specific recovery attempts
3. Gradual load restoration
4. Continuous monitoring for stability

## Message Queue Management

### Queue Priority System

The message queue processes requests based on priority levels:

```typescript
type MessagePriority = 'low' | 'medium' | 'high';

// Processing order: high → medium → low
const priorityOrder = {
  high: 0,    // Administrative commands, error reports
  medium: 1,  // Regular user interactions
  low: 2      // Background tasks, analytics
};
```

### Queue Processing Logic

1. **Capacity Management**: Maximum 100 messages (configurable)
2. **Expiration Handling**: Messages expire after 5 minutes
3. **Retry Logic**: Up to 3 retry attempts per message
4. **Batch Processing**: Process up to 5 messages per cycle
5. **Priority Ordering**: High priority messages processed first

### Queue States and Responses

#### Normal Queue Processing
```typescript
// User receives immediate acknowledgment
"⏳ Your message has been queued due to system load. 
Estimated processing time: 2 minutes. 
You'll receive a response as soon as possible!"
```

#### Queue Full Scenario
```typescript
// For low priority messages when queue is full
"System is currently overloaded. 
Please try again in a few minutes."

// For medium/high priority messages
// System removes oldest low priority message to make space
```

#### Message Expiration
```typescript
// After 5 minutes in queue without processing
"Sorry, your message expired while in the queue. 
Please try again."
```

## Fallback Response System

### Response Categories

#### 1. Generic Fallbacks (Medium Severity)
```typescript
const genericFallbacks = [
  "I'm experiencing some technical difficulties right now. Please try again in a moment!",
  "Sorry, I'm having trouble processing requests at the moment. Give me a few minutes to recover.",
  "I'm currently running in limited mode due to system issues. Please be patient while I work through this."
];
```

#### 2. Maintenance Responses (High Severity)
```typescript
const maintenanceResponses = [
  "🔧 I'm currently undergoing maintenance. Please check back in a few minutes!",
  "⚙️ Systems are being updated right now. I'll be back online shortly!",
  "🛠️ Temporary maintenance in progress. Thank you for your patience!"
];
```

#### 3. Cached Responses (When Available)
```typescript
// Format: "📁 [Cached Response] {original_response}"
// Used when similar queries have been processed recently
```

### Response Selection Logic

1. **Check Cache**: Look for similar recent responses
2. **Assess Severity**: Determine appropriate response category
3. **Add Context**: Include degradation reason and queue status
4. **Personalize**: Add user-specific information when available

### Contextual Information

Fallback responses include helpful context:
```typescript
"Current issue: Gemini API circuit breaker is open"
"Messages in queue: 15"
"Estimated recovery time: 3 minutes"
```

## Manual Recovery Procedures

### Administrative Commands

#### 1. Status Check
```bash
# Get overall system status
curl http://localhost:3000/api/health/status

# Get degradation-specific status
curl http://localhost:3000/api/health/degradation

# Get circuit breaker states
curl http://localhost:3000/api/health/circuits
```

#### 2. Manual Recovery Triggers
```bash
# Trigger recovery for all services
curl -X POST http://localhost:3000/api/admin/recovery

# Trigger recovery for specific service
curl -X POST http://localhost:3000/api/admin/recovery/gemini
curl -X POST http://localhost:3000/api/admin/recovery/discord

# Force circuit breaker reset
curl -X POST http://localhost:3000/api/admin/circuit/reset/gemini
```

#### 3. Queue Management
```bash
# Check queue status
curl http://localhost:3000/api/admin/queue/status

# Clear expired messages
curl -X POST http://localhost:3000/api/admin/queue/cleanup

# Force queue processing
curl -X POST http://localhost:3000/api/admin/queue/process
```

#### 4. Emergency Procedures
```bash
# Enable maintenance mode
curl -X POST http://localhost:3000/api/admin/maintenance/enable

# Disable maintenance mode
curl -X POST http://localhost:3000/api/admin/maintenance/disable

# Emergency shutdown with queue drain
curl -X POST http://localhost:3000/api/admin/shutdown/graceful
```

### Recovery Validation

After manual recovery attempts, validate system health:

```bash
# 1. Check service connectivity
curl http://localhost:3000/api/health/ping

# 2. Verify circuit breaker states
curl http://localhost:3000/api/health/circuits

# 3. Monitor error rates
tail -f logs/application.log | grep -E "(ERROR|WARN)"

# 4. Test end-to-end functionality
curl -X POST http://localhost:3000/api/test/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'
```

## Video Processing Error Handling

### Video Processing Error Categories

Video processing introduces unique error scenarios due to high resource consumption, token costs, and processing time requirements. This section covers comprehensive error handling for video-related operations.

#### 1. Configuration Errors

**VIDEO_SUPPORT_DISABLED**
- **Cause**: Video processing is disabled in configuration
- **User Message**: "Video processing is currently disabled on this server."
- **Recovery**: Admin must enable VIDEO_SUPPORT_ENABLED in environment
- **Severity**: Low (expected behavior)

**INVALID_VIDEO_CONFIG**
- **Cause**: Invalid video configuration parameters
- **User Message**: "Video processing configuration error. Please contact an administrator."
- **Recovery**: Check and correct video configuration values
- **Severity**: High (prevents all video processing)

#### 2. File Validation Errors

**UNSUPPORTED_VIDEO_FORMAT**
- **Cause**: Video file format not in supported list (MP4, MOV, AVI, WebM)
- **User Message**: "❌ Unsupported video format. Supported formats: MP4, MOV, AVI, WebM"
- **Recovery**: User must convert video to supported format
- **Severity**: Low (user correctable)

**VIDEO_FILE_TOO_LARGE**
- **Cause**: Video file exceeds size limit (default 20MB)
- **User Message**: "❌ Video file too large (X.XMB). Maximum allowed: 20MB"
- **Recovery**: User must reduce file size or trim video
- **Severity**: Low (user correctable)

**VIDEO_DURATION_TOO_LONG**
- **Cause**: Video duration exceeds limit (default 180 seconds)
- **User Message**: "❌ Video too long (Xm Ys). Maximum duration: 3m 0s"
- **Recovery**: User must trim video to shorter duration
- **Severity**: Low (user correctable)

#### 3. Rate Limiting Errors

**VIDEO_RATE_LIMIT_EXCEEDED**
- **Cause**: User exceeded video processing rate limits
- **User Message**: "❌ Video rate limit exceeded. Please wait Xm Ys before processing another video."
- **Recovery**: User must wait for rate limit reset
- **Severity**: Medium (prevents processing but protects system)

**VIDEO_TOKEN_LIMIT_EXCEEDED**
- **Cause**: Estimated token cost exceeds daily/hourly limits
- **User Message**: "❌ Video would exceed your token limit. Remaining: X,XXX tokens"
- **Recovery**: User must wait for token limit reset
- **Severity**: Medium (cost protection)

#### 4. Processing Errors

**VIDEO_PROCESSING_TIMEOUT**
- **Cause**: Video processing exceeds timeout limit (default 300 seconds)
- **User Message**: "❌ Video processing timed out. Please try a shorter video."
- **Recovery**: User should try shorter video or contact admin for timeout adjustment
- **Severity**: Medium (system protection)

**VIDEO_PROCESSING_FAILED**
- **Cause**: AI service failed to process video content
- **User Message**: "❌ Failed to process video. Please try again or contact support."
- **Recovery**: Automatic retry with exponential backoff, fallback to text response
- **Severity**: High (service availability)

**VIDEO_ENCODING_ERROR**
- **Cause**: Video file is corrupted or has encoding issues
- **User Message**: "❌ Video file appears to be corrupted. Please try a different file."
- **Recovery**: User must provide valid video file
- **Severity**: Low (user correctable)

#### 5. YouTube URL Errors

**YOUTUBE_SUPPORT_DISABLED**
- **Cause**: YouTube URL processing is disabled
- **User Message**: "❌ YouTube URL processing is currently disabled."
- **Recovery**: Admin must enable YOUTUBE_URL_SUPPORT_ENABLED
- **Severity**: Low (expected behavior)

**INVALID_YOUTUBE_URL**
- **Cause**: Provided URL is not a valid YouTube URL
- **User Message**: "❌ Invalid YouTube URL format. Please provide a valid YouTube video URL."
- **Recovery**: User must provide correct YouTube URL
- **Severity**: Low (user correctable)

**YOUTUBE_VIDEO_UNAVAILABLE**
- **Cause**: YouTube video is private, deleted, or restricted
- **User Message**: "❌ YouTube video is unavailable or restricted."
- **Recovery**: User must provide accessible YouTube video
- **Severity**: Low (user correctable)

### Video Error Handling Implementation

#### Error Detection and Logging
```typescript
// Video processing error wrapper
async function processVideoWithErrorHandling(
  videoFile: VideoFile,
  userId: string
): Promise<ProcessingResult> {
  const logger = getLogger('VideoProcessing');
  
  try {
    // Validate video before processing
    const validation = validateVideoFile(videoFile);
    if (!validation.valid) {
      logger.warn('Video validation failed', {
        userId,
        filename: videoFile.filename,
        errors: validation.errors
      });
      
      return {
        success: false,
        errorType: 'VALIDATION_ERROR',
        userMessage: generateValidationErrorMessage(validation.errors),
        technicalMessage: validation.errors.join('; ')
      };
    }
    
    // Check rate limits
    const rateLimitCheck = await checkVideoRateLimit(userId, videoFile.estimatedTokens);
    if (!rateLimitCheck.allowed) {
      logger.info('Video rate limit exceeded', {
        userId,
        reason: rateLimitCheck.reason,
        remaining: rateLimitCheck.remaining
      });
      
      return {
        success: false,
        errorType: 'RATE_LIMIT_EXCEEDED',
        userMessage: rateLimitCheck.reason,
        retryAfter: rateLimitCheck.retryAfter
      };
    }
    
    // Process video with timeout
    const processingResult = await processVideoWithTimeout(videoFile);
    
    logger.info('Video processing completed successfully', {
      userId,
      filename: videoFile.filename,
      duration: videoFile.duration,
      tokensUsed: processingResult.tokensUsed
    });
    
    return processingResult;
    
  } catch (error) {
    logger.error('Video processing failed', {
      userId,
      filename: videoFile.filename,
      error: error.message,
      stack: error.stack
    });
    
    // Determine error type and appropriate response
    const errorResponse = classifyVideoError(error);
    
    // Update health metrics
    trackVideoProcessingError(errorResponse.errorType);
    
    return errorResponse;
  }
}
```

#### User Experience Error Handling
```typescript
// User-friendly error message generation
function generateUserFriendlyVideoError(error: VideoProcessingError): string {
  const errorMessages = {
    UNSUPPORTED_FORMAT: (error) => 
      VideoUXHelper.generateUnsupportedFormatMessage(error.filename, error.config),
    
    FILE_TOO_LARGE: (error) => 
      VideoUXHelper.generateFileTooLargeMessage(error.fileSizeMB, error.config),
    
    DURATION_TOO_LONG: (error) => 
      VideoUXHelper.generateVideoTooLongMessage(error.duration, error.config),
    
    RATE_LIMIT_EXCEEDED: (error) => 
      `❌ Video rate limit exceeded. Please wait ${formatDuration(error.retryAfter)} before processing another video.`,
    
    PROCESSING_TIMEOUT: () => 
      "❌ Video processing timed out. Please try a shorter video or contact support if this persists.",
    
    PROCESSING_FAILED: () => 
      "❌ Failed to process video. Please try again in a moment or contact support if the issue continues."
  };
  
  const messageGenerator = errorMessages[error.type];
  return messageGenerator ? messageGenerator(error) : "❌ An unexpected error occurred while processing your video.";
}
```

#### Monitoring and Alerting

**Key Metrics to Monitor:**
- Video processing success rate
- Average processing time per video
- Token consumption patterns
- Rate limit hit frequency
- File validation failure rates
- YouTube URL processing success rate

**Alert Thresholds:**
- Video processing failure rate > 10%
- Average processing time > 90 seconds
- Rate limit hits > 50 per hour
- Token consumption > 80% of daily limit

### Recovery Procedures

#### For Administrators

**Video Processing Service Down:**
1. Check video service configuration
2. Verify file storage accessibility
3. Restart video processing service
4. Monitor error logs for specific failures

**High Token Consumption:**
1. Review recent video processing requests
2. Adjust token rate limits if necessary
3. Consider temporary video processing restrictions
4. Notify users of token conservation measures

**Processing Performance Issues:**
1. Check system resources (CPU, memory, disk)
2. Review video processing queue depth
3. Consider increasing processing timeout
4. Scale processing resources if needed

#### For Users

**Video Processing Failures:**
1. Verify video file meets requirements (format, size, duration)
2. Try processing a shorter or smaller video
3. Wait and retry if rate limited
4. Contact support if issues persist

**YouTube Video Issues:**
1. Verify YouTube URL is correct and accessible
2. Check if video is public and not restricted
3. Try a different YouTube video to test functionality
4. Report persistent YouTube processing issues

## Error Code Reference

### System Error Codes

| Code | Description | Severity | Recovery Action |
|------|-------------|----------|-----------------|
| ERR_CIRCUIT_OPEN | Circuit breaker open | High | Wait for timeout or manual reset |
| ERR_QUEUE_FULL | Message queue at capacity | Medium | Retry later or increase priority |
| ERR_MEMORY_PRESSURE | High memory usage | High | Reduce load, trigger GC |
| ERR_HIGH_ERROR_RATE | Error rate exceeded threshold | Medium | Enable fallbacks |
| ERR_SLOW_RESPONSE | Response time threshold exceeded | Medium | Queue processing |
| ERR_SERVICE_UNAVAILABLE | External service down | High | Circuit breaker activation |
| ERR_MESSAGE_EXPIRED | Queued message timeout | Low | User retry required |
| ERR_RECOVERY_FAILED | Service recovery attempt failed | Medium | Automated retry scheduled |

### Service-Specific Error Codes

#### Gemini Service
| Code | Description | Recovery |
|------|-------------|----------|
| GEMINI_AUTH_FAILED | API key authentication failed | Check credentials |
| GEMINI_RATE_LIMITED | Rate limit exceeded | Wait for reset |
| GEMINI_TIMEOUT | Request timeout | Retry with circuit breaker |
| GEMINI_INVALID_RESPONSE | Malformed API response | Fallback response |

#### Discord Service
| Code | Description | Recovery |
|------|-------------|----------|
| DISCORD_CONNECTION_LOST | WebSocket connection dropped | Reconnection attempt |
| DISCORD_PERMISSION_DENIED | Insufficient bot permissions | Check guild settings |
| DISCORD_WEBHOOK_FAILED | Webhook delivery failure | Alternative delivery method |
| DISCORD_RATE_LIMITED | Discord API rate limit | Queue with backoff |

### Error Response Formats

#### JSON API Responses
```json
{
  "error": {
    "code": "ERR_CIRCUIT_OPEN",
    "message": "Circuit breaker is OPEN for gemini service",
    "severity": "high",
    "retryAfter": 60000,
    "context": {
      "serviceName": "gemini",
      "failureCount": 5,
      "lastFailureTime": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### User-Facing Messages
```typescript
// High severity with technical context
"🔧 I'm currently experiencing technical difficulties with my AI processing system. Current issue: Gemini API circuit breaker is open. I'll be back to full functionality shortly!"

// Medium severity with helpful information
"⏳ Your message has been queued due to high system load. Position in queue: 3. Estimated processing time: 1 minute. You'll receive a response as soon as possible!"
```

## Monitoring and Observability

### Key Metrics to Monitor

#### 1. Circuit Breaker Metrics
```typescript
interface CircuitBreakerMetrics {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  consecutiveSuccesses: number;
  resetCount: number;           // Number of times circuit has reset
  averageFailureTime: number;   // Average time between failures
}
```

#### 2. Queue Metrics
```typescript
interface QueueMetrics {
  size: number;                 // Current queue size
  oldestMessageAge: number;     // Age of oldest message in ms
  processedCount: number;       // Messages processed since start
  expiredCount: number;         // Messages that expired in queue
  averageWaitTime: number;      // Average time in queue
  priorityDistribution: {       // Messages by priority
    high: number;
    medium: number;
    low: number;
  };
}
```

#### 3. Recovery Metrics
```typescript
interface RecoveryMetrics {
  attempts: number;             // Total recovery attempts
  successfulRecoveries: number; // Successful recoveries
  averageRecoveryTime: number;  // Average time to recover
  lastRecoveryTime: number;     // Timestamp of last recovery
  currentStreak: number;        // Current uptime streak
}
```

### Alerting Thresholds

#### Critical Alerts (Immediate Response Required)
- Circuit breaker open for > 5 minutes
- Memory usage > 90% of threshold
- Error rate > 25%
- Queue size > 90% capacity
- No successful operations in 10 minutes

#### Warning Alerts (Monitor Closely)
- Circuit breaker open for > 1 minute
- Memory usage > 75% of threshold
- Error rate > 15%
- Queue size > 70% capacity
- Response time P95 > 8 seconds

#### Information Alerts (Log Only)
- Circuit breaker state changes
- Recovery attempts
- Queue processing statistics
- Performance metric updates

### Log Analysis

#### Error Pattern Detection
```bash
# Circuit breaker state changes
grep "Circuit breaker" logs/application.log | tail -20

# Recovery attempts
grep "Recovery attempt" logs/application.log | tail -10

# Queue processing issues
grep "Queue.*failed\|expired" logs/application.log | tail -15

# Memory pressure events
grep "Memory.*threshold" logs/application.log | tail -10
```

#### Performance Analysis
```bash
# Response time trends
grep "Response time" logs/application.log | \
  awk '{print $1, $2, $NF}' | tail -20

# Error rate calculations
grep -c "ERROR" logs/application.log
grep -c "INFO\|DEBUG\|WARN\|ERROR" logs/application.log

# Queue throughput
grep "processed.*messages" logs/application.log | tail -10
```

### Dashboard Metrics

Recommended monitoring dashboard should include:

1. **System Health Overview**
   - Overall system status
   - Circuit breaker states
   - Current degradation level

2. **Performance Metrics**
   - Response times (P50, P95, P99)
   - Error rates
   - Memory usage trends

3. **Queue Management**
   - Queue size over time
   - Message processing rate
   - Wait time distributions

4. **Recovery Tracking**
   - Recovery success rate
   - Time to recovery
   - Failure patterns

## Configuration Reference

### Environment Variables

#### Circuit Breaker Configuration
```bash
# Maximum failures before opening circuit (default: 5)
DEGRADATION_MAX_FAILURES=5

# Circuit reset timeout in milliseconds (default: 60000)
DEGRADATION_RESET_TIMEOUT_MS=60000

# Half-open state max retries (default: 3)
DEGRADATION_HALF_OPEN_RETRIES=3
```

#### Health Monitoring Configuration
```bash
# Memory threshold in MB (default: 400)
DEGRADATION_MEMORY_THRESHOLD_MB=400

# Error rate threshold percentage (default: 10.0)
DEGRADATION_ERROR_RATE_THRESHOLD=10.0

# Response time threshold in milliseconds (default: 10000)
DEGRADATION_RESPONSE_TIME_THRESHOLD_MS=10000
```

#### Queue Management Configuration
```bash
# Maximum queue size (default: 100)
DEGRADATION_MAX_QUEUE_SIZE=100

# Maximum queue time in milliseconds (default: 300000)
DEGRADATION_MAX_QUEUE_TIME_MS=300000

# Retry interval in milliseconds (default: 30000)
DEGRADATION_RETRY_INTERVAL_MS=30000

# Maximum retries per message (default: 3)
DEGRADATION_MAX_RETRIES=3
```

#### Feature Toggles
```bash
# Enable cached responses (default: true)
DEGRADATION_ENABLE_CACHED_RESPONSES=true

# Enable generic fallbacks (default: true)
DEGRADATION_ENABLE_GENERIC_FALLBACKS=true

# Enable maintenance mode (default: true)
DEGRADATION_ENABLE_MAINTENANCE_MODE=true
```

### Configuration Validation

The system validates configuration on startup:

```typescript
// Validates that all thresholds are reasonable
const validateConfig = (config: DegradationConfig): boolean => {
  return config.maxFailures > 0 &&
         config.resetTimeoutMs > 0 &&
         config.memoryThresholdMB > 0 &&
         config.errorRateThreshold > 0 &&
         config.maxQueueSize > 0;
};
```

## Troubleshooting Quick Reference

### Common Issues and Solutions

#### Issue: Circuit Breaker Stuck Open
```bash
# Check failure reason
curl http://localhost:3000/api/health/circuits

# Manual reset
curl -X POST http://localhost:3000/api/admin/circuit/reset/gemini

# Verify service health
curl http://localhost:3000/api/health/external/gemini
```

#### Issue: Queue Not Processing
```bash
# Check degradation status
curl http://localhost:3000/api/health/degradation

# Force queue processing
curl -X POST http://localhost:3000/api/admin/queue/process

# Check for expired messages
curl -X POST http://localhost:3000/api/admin/queue/cleanup
```

#### Issue: High Memory Usage
```bash
# Force garbage collection
curl -X POST http://localhost:3000/api/admin/gc

# Check memory breakdown
curl http://localhost:3000/api/health/memory/detailed

# Restart if necessary
npm run restart
```

#### Issue: Persistent High Error Rate
```bash
# Check error patterns
tail -f logs/application.log | grep ERROR

# Reset error counters
curl -X POST http://localhost:3000/api/admin/metrics/reset

# Check external service status
curl http://localhost:3000/api/health/external
```

## Best Practices and Standardization

Based on the comprehensive analysis of error handling patterns across the codebase, this section provides standardization recommendations and best practices to improve consistency and maintainability.

### Current Strengths

#### 1. **Standardized Logging**
All services use consistent logger with service context:
```typescript
logger.error(`Failed to initialize ${this.getServiceName()}: ${errorMessage}`, error);
```

#### 2. **Error Message Enhancement**
Errors are enriched with service names and context:
```typescript
throw new Error(`${this.getServiceName()} initialization failed: ${errorMessage}`);
```

#### 3. **Resource Cleanup**
Try-finally patterns ensure resource deallocation:
```typescript
const release = await this.stateMutex.acquire();
try {
  // Operation
} finally {
  release();
}
```

#### 4. **User-Friendly Messages**
Technical errors translated to user-readable messages through RetryHandler:
```typescript
const userMessage = this.retryHandler.getUserFriendlyErrorMessage(error) || 'An error occurred';
```

### Identified Inconsistencies

#### 1. **Error Propagation Strategies**
- **Issue**: Some services throw enhanced errors (BaseService), others return null/undefined
- **Files**: BaseService.ts:99 vs cacheManager.ts:89-100
- **Impact**: Inconsistent caller expectations

#### 2. **Retry Logic Implementation**
- **Issue**: Dedicated RetryHandler vs. inline retry logic
- **Files**: retryHandler.ts vs conversationManager.ts:345-380
- **Impact**: Code duplication and varying retry behaviors

#### 3. **Health Reporting Patterns**
- **Issue**: Different error collection mechanisms
- **Files**: BaseService.ts:171-180 vs healthMonitor.ts:1269-1300
- **Impact**: Inconsistent health status formats

### Standardization Recommendations

#### 1. **Unified Error Interface**

Create a standardized error interface for all services:

```typescript
interface ServiceError {
  service: string;
  operation: string;
  category: 'network' | 'configuration' | 'runtime' | 'external';
  retryable: boolean;
  userMessage: string;
  technicalMessage: string;
  timestamp: number;
  correlationId?: string;
}

class StandardServiceError extends Error implements ServiceError {
  constructor(
    public service: string,
    public operation: string,
    public category: ServiceError['category'],
    public retryable: boolean,
    public userMessage: string,
    public technicalMessage: string,
    public timestamp: number = Date.now(),
    public correlationId?: string
  ) {
    super(technicalMessage);
    this.name = 'StandardServiceError';
  }
}
```

#### 2. **Standardized Retry Decorator**

Centralize all retry logic through RetryHandler service:

```typescript
// Instead of inline retry logic, use:
const result = await this.retryHandler.executeWithRetry(
  async () => await someOperation(),
  {
    maxRetries: 3,
    retryDelay: 1000,
    retryMultiplier: 2,
    operationName: 'someOperation',
    serviceName: this.getServiceName()
  }
);
```

#### 3. **Enhanced Error Context**

Include operation context in all error messages:

```typescript
// Standard error context pattern
const errorContext = {
  service: this.getServiceName(),
  operation: 'operationName',
  userId: 'user123',
  timestamp: Date.now(),
  correlationId: generateCorrelationId()
};

try {
  // Operation
} catch (error) {
  logger.error('Operation failed', { ...errorContext, error });
  throw new StandardServiceError(
    errorContext.service,
    errorContext.operation,
    'runtime',
    true,
    'User-friendly message',
    error.message,
    errorContext.timestamp,
    errorContext.correlationId
  );
}
```

#### 4. **Consistent Health Reporting**

Standardize health status structure across all services:

```typescript
interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  uptime: number;
  errorCount: number;
  lastError?: StandardServiceError;
  metrics: {
    responseTime?: number;
    memoryUsage?: number;
    errorRate?: number;
  };
}
```

### Implementation Guidelines

#### 1. **Error Handling Checklist**

For all new services and functions:

- [ ] Use try-catch blocks for all external calls
- [ ] Implement proper resource cleanup (finally blocks)
- [ ] Log errors with consistent format and context
- [ ] Provide user-friendly error messages
- [ ] Include operation name and service context
- [ ] Use RetryHandler for retryable operations
- [ ] Implement graceful degradation where applicable
- [ ] Add health check integration
- [ ] Include error metrics collection
- [ ] Add correlation IDs for error tracking

#### 2. **Error Recovery Patterns**

**For Network Errors:**
```typescript
try {
  const result = await externalApiCall();
  return result;
} catch (error) {
  if (isNetworkError(error)) {
    return await this.retryHandler.executeWithRetry(
      () => externalApiCall(),
      { maxRetries: 3, retryDelay: 1000 }
    );
  }
  throw new StandardServiceError(/* parameters */);
}
```

**For Validation Errors:**
```typescript
try {
  const validated = await validateInput(input);
  return processValidatedInput(validated);
} catch (error) {
  if (error instanceof ValidationError) {
    return {
      success: false,
      userMessage: 'Please check your input and try again',
      technicalMessage: error.message
    };
  }
  throw error;
}
```

**For Resource Errors:**
```typescript
const resource = await acquireResource();
try {
  return await processWithResource(resource);
} catch (error) {
  logger.error('Resource processing failed', { error, resourceId: resource.id });
  throw new StandardServiceError(/* parameters */);
} finally {
  await releaseResource(resource);
}
```

#### 3. **Testing Error Scenarios**

Create comprehensive error tests for all patterns:

```typescript
describe('Error Handling', () => {
  it('should handle network failures with retry', async () => {
    // Mock network failure
    mockApiCall.mockRejectedValueOnce(new Error('Network error'));
    mockApiCall.mockResolvedValueOnce('success');
    
    const result = await serviceMethod();
    expect(result).toBe('success');
    expect(mockApiCall).toHaveBeenCalledTimes(2);
  });
  
  it('should provide user-friendly error messages', async () => {
    mockApiCall.mockRejectedValue(new Error('Internal server error'));
    
    await expect(serviceMethod()).rejects.toThrow(StandardServiceError);
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('User-friendly message')
    );
  });
});
```

### Migration Strategy

#### Phase 1: Critical Components (High Priority)
1. **messageSplitter.ts**: Add error boundaries and input validation
2. **validation.ts**: Enhance URL validation with proper error logging
3. **botInitializer.ts**: Add initialization timeout wrapper

#### Phase 2: Standardization (Medium Priority)
1. Implement StandardServiceError across all services
2. Centralize retry logic through RetryHandler
3. Standardize health reporting format

#### Phase 3: Enhancement (Low Priority)
1. Add error correlation IDs
2. Implement error recovery metrics
3. Create error pattern analytics

### Error Handling Anti-Patterns to Avoid

#### 1. **Silent Failures**
```typescript
// DON'T DO THIS
try {
  await operation();
} catch {
  return false; // No logging, no context
}

// DO THIS INSTEAD
try {
  await operation();
  return true;
} catch (error) {
  logger.error('Operation failed', { error, context });
  return false;
}
```

#### 2. **Generic Error Messages**
```typescript
// DON'T DO THIS
throw new Error('Something went wrong');

// DO THIS INSTEAD
throw new StandardServiceError(
  'userService',
  'updateProfile',
  'validation',
  false,
  'Please check your profile information and try again',
  `Validation failed: ${validationError.message}`
);
```

#### 3. **Swallowing Errors**
```typescript
// DON'T DO THIS
try {
  await criticalOperation();
} catch (error) {
  // Ignore error, continue
}

// DO THIS INSTEAD
try {
  await criticalOperation();
} catch (error) {
  logger.error('Critical operation failed', { error });
  await this.gracefulDegradation.handleFailure('criticalOperation', error);
  throw error; // Re-throw after handling
}
```

---

This guide provides comprehensive coverage of the error handling and recovery system. For additional support or system-specific issues, consult the [TROUBLESHOOTING.md](TROUBLESHOOTING.md) documentation or the session-specific [TROUBLESHOOTING_LOG.md](../TROUBLESHOOTING_LOG.md).