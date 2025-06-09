# Error Handling and Recovery Guide

## Table of Contents

1. [Overview](#overview)
2. [Circuit Breaker System](#circuit-breaker-system)
3. [Graceful Degradation](#graceful-degradation)
4. [Health Monitoring Integration](#health-monitoring-integration)
5. [Error Scenarios and Recovery Procedures](#error-scenarios-and-recovery-procedures)
6. [Message Queue Management](#message-queue-management)
7. [Fallback Response System](#fallback-response-system)
8. [Manual Recovery Procedures](#manual-recovery-procedures)
9. [Error Code Reference](#error-code-reference)
10. [Monitoring and Observability](#monitoring-and-observability)
11. [Configuration Reference](#configuration-reference)

## Overview

The Discord LLM Bot implements a comprehensive error handling and recovery system designed to maintain service availability during various failure scenarios. The system combines circuit breaker patterns, graceful degradation, message queuing, and automated recovery mechanisms.

### Core Components

- **GracefulDegradation Service**: Central error handling and recovery coordination
- **HealthMonitor Service**: Continuous system health assessment and alerting
- **Circuit Breakers**: Per-service failure protection for Gemini and Discord APIs
- **Message Queue**: Request queuing during degraded states
- **Fallback System**: Alternative responses when primary services are unavailable

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

---

This guide provides comprehensive coverage of the error handling and recovery system. For additional support or system-specific issues, consult the [TROUBLESHOOTING.md](TROUBLESHOOTING.md) documentation or the session-specific [TROUBLESHOOTING_LOG.md](../TROUBLESHOOTING_LOG.md).