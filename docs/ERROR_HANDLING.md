# Error Handling

Error handling, circuit breakers, and graceful degradation for the Discord LLM Bot.

## Circuit Breaker Pattern

Each external service (Gemini, Discord) has a circuit breaker with three states:

| State | Behavior | Transition |
|-------|----------|------------|
| **Closed** | Normal operation, failures tracked | Opens after 5 failures |
| **Open** | Requests fail immediately | Half-opens after 60s timeout |
| **Half-Open** | Limited requests allowed | Closes on success, re-opens on failure |

### Configuration
```env
DEGRADATION_MAX_FAILURES=5
DEGRADATION_RESET_TIMEOUT_MS=60000
DEGRADATION_HALF_OPEN_RETRIES=3
```

## Graceful Degradation

### Severity Levels

| Level | Trigger | Response |
|-------|---------|----------|
| **Low** | Minor variance | Normal operation with monitoring |
| **Medium** | Service issues, error rate >10% | Queue messages, use cached responses |
| **High** | Critical failures, both circuits open | Maintenance mode responses |

### Automatic Responses

**Gemini API Failure:**
1. Use cached responses for similar queries
2. Queue new messages for retry
3. Provide maintenance mode responses

**Memory Pressure (>400MB):**
1. Trigger garbage collection
2. Clear old cache entries
3. Trim conversation contexts

**Rate Limit Exhaustion:**
1. Queue requests with priority
2. Provide wait time estimates
3. Process queue when limits reset

## Message Queue

Messages are queued during degraded operation:

- **Priority**: High (admin) > Medium (user) > Low (background)
- **Capacity**: 100 messages max
- **Expiration**: 5 minutes
- **Retries**: 3 attempts per message

## Fallback Responses

### Categories
- **Cached**: Similar previous responses
- **Generic**: "Technical difficulties" messages
- **Maintenance**: System status information

### Example Messages
```
"I'm experiencing some technical difficulties. Please try again in a moment!"
"Your message has been queued. Estimated processing time: 2 minutes."
```

## Recovery

### Automatic
- Circuit breaker timeout-based recovery
- Health checks every 30 seconds
- Gradual traffic increase

### Manual Commands
```
/recover gemini     # Force Gemini recovery
/recover discord    # Force Discord reconnection
/recover all        # Full system recovery
```

## Error Types

| Code | Description | Recovery |
|------|-------------|----------|
| `ERR_CIRCUIT_OPEN` | Circuit breaker open | Wait or manual reset |
| `ERR_QUEUE_FULL` | Queue at capacity | Retry later |
| `ERR_MEMORY_PRESSURE` | High memory | Reduce load, GC |
| `GEMINI_RATE_LIMITED` | API rate limit | Wait for reset |
| `DISCORD_CONNECTION_LOST` | WebSocket dropped | Auto-reconnect |

## Monitoring

Check degradation status:
```
/status degradation    # Current status
/status circuits       # Circuit breaker states
/status queue          # Queue status
```

## Best Practices

1. **Services**: Implement graceful degradation for all external calls
2. **Errors**: Log with context, provide user-friendly messages
3. **Recovery**: Test recovery procedures regularly
4. **Thresholds**: Adjust based on your environment
