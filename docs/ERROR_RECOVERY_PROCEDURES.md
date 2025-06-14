# Error Recovery Procedures

## Table of Contents

1. [Overview](#overview)
2. [Immediate Response Procedures](#immediate-response-procedures)
3. [Layer-Specific Recovery Procedures](#layer-specific-recovery-procedures)
4. [Critical Failure Scenarios](#critical-failure-scenarios)
5. [Service Recovery Workflows](#service-recovery-workflows)
6. [Data Recovery Procedures](#data-recovery-procedures)
7. [Performance Recovery Procedures](#performance-recovery-procedures)
8. [Validation and Testing](#validation-and-testing)
9. [Post-Recovery Analysis](#post-recovery-analysis)

## Overview

This document provides step-by-step recovery procedures for common error scenarios in the Discord LLM Bot. These procedures are derived from comprehensive analysis of error handling patterns across all system layers and complement the error handling patterns documented in [ERROR_HANDLING_GUIDE.md](ERROR_HANDLING_GUIDE.md).

### Recovery Priorities

1. **P0 - Critical**: Service unavailable, data corruption, security issues
2. **P1 - High**: Performance degradation, partial service loss
3. **P2 - Medium**: Non-critical feature failures, logging issues
4. **P3 - Low**: Documentation, cosmetic issues

### Recovery Principles

- **Fail Safe**: Ensure system stability before attempting recovery
- **Minimize Impact**: Prioritize actions that restore most users first
- **Document Everything**: Log all recovery actions for analysis
- **Validate Success**: Confirm recovery before marking complete

## Immediate Response Procedures

### Emergency Triage Checklist

When multiple errors occur simultaneously, follow this triage order:

1. **Check System Status** (30 seconds)
   ```bash
   curl http://localhost:3000/api/health/status
   curl http://localhost:3000/api/health/degradation
   ```

2. **Identify Critical Services** (1 minute)
   - Discord connection status
   - Gemini API availability
   - Memory and CPU usage
   - Database/DataStore connectivity

3. **Determine Impact Scope** (1 minute)
   - Number of affected users
   - Duration of issues
   - Severity of degradation

4. **Take Immediate Action** (2 minutes)
   - Enable maintenance mode if necessary
   - Stop additional load if overloaded
   - Trigger emergency circuit breakers

### Quick Commands Reference

```bash
# System Status
curl http://localhost:3000/api/health/status
curl http://localhost:3000/api/health/circuits
curl http://localhost:3000/api/health/memory

# Emergency Actions
curl -X POST http://localhost:3000/api/admin/maintenance/enable
curl -X POST http://localhost:3000/api/admin/circuit/reset/all
curl -X POST http://localhost:3000/api/admin/gc

# Recovery Validation
curl http://localhost:3000/api/test/echo -d '{"message":"test"}'
```

## Layer-Specific Recovery Procedures

### Services Layer Recovery

#### 1. BaseService Initialization Failures (`src/services/base/BaseService.ts`)

**Symptoms**:
- Service fails to start during bot initialization
- "Failed to initialize [ServiceName]" errors
- Dependency injection failures

**Recovery Procedure**:
```bash
# Step 1: Check service dependencies
curl http://localhost:3000/api/health/dependencies

# Step 2: Validate configuration
npm run config:validate

# Step 3: Restart individual service
curl -X POST http://localhost:3000/api/admin/service/restart/[serviceName]

# Step 4: If persistent, restart entire bot
npm run restart

# Step 5: Validate recovery
curl http://localhost:3000/api/health/services
```

**Prevention**:
- Add timeout wrappers to service initialization
- Implement dependency validation before service creation
- Add rollback mechanism for partial initialization failures

#### 2. Circuit Breaker Recovery (`src/services/gracefulDegradation.ts`)

**Symptoms**:
- "Circuit breaker is OPEN" errors
- Services consistently failing
- Timeouts and connection errors

**Recovery Procedure**:
```bash
# Step 1: Check circuit breaker status
curl http://localhost:3000/api/health/circuits

# Step 2: Identify root cause
# Check external service status
curl http://localhost:3000/api/health/external/gemini
curl http://localhost:3000/api/health/external/discord

# Step 3: Manual circuit reset (if external service recovered)
curl -X POST http://localhost:3000/api/admin/circuit/reset/gemini
curl -X POST http://localhost:3000/api/admin/circuit/reset/discord

# Step 4: Monitor recovery
tail -f logs/application.log | grep "Circuit breaker"

# Step 5: Validate normal operation
curl -X POST http://localhost:3000/api/test/echo -d '{"message":"test circuit"}'
```

#### 3. Memory Pressure Recovery (`src/services/healthMonitor.ts`)

**Symptoms**:
- Memory usage > 400MB threshold
- Slow response times
- Memory-related errors

**Recovery Procedure**:
```bash
# Step 1: Trigger garbage collection
curl -X POST http://localhost:3000/api/admin/gc

# Step 2: Check memory breakdown
curl http://localhost:3000/api/health/memory/detailed

# Step 3: Clear caches if available
curl -X POST http://localhost:3000/api/admin/cache/clear

# Step 4: Reduce processing load
curl -X POST http://localhost:3000/api/admin/degradation/enable

# Step 5: Monitor memory trends
watch -n 5 'curl -s http://localhost:3000/api/health/memory'

# Step 6: If persistent, restart service
npm run restart
```

#### 4. Rate Limiter Recovery (`src/services/rateLimiter.ts`)

**Symptoms**:
- "Rate limit exceeded" errors
- Mutex timeout errors
- Request queuing failures

**Recovery Procedure**:
```bash
# Step 1: Check rate limiter status
curl http://localhost:3000/api/admin/ratelimit/status

# Step 2: Reset rate limit counters if appropriate
curl -X POST http://localhost:3000/api/admin/ratelimit/reset

# Step 3: Check for mutex deadlocks
curl http://localhost:3000/api/admin/mutex/status

# Step 4: Force mutex cleanup if needed
curl -X POST http://localhost:3000/api/admin/mutex/cleanup

# Step 5: Validate normal operation
curl -X POST http://localhost:3000/api/test/rate-limit
```

### Handlers and Events Layer Recovery

#### 1. Command Handler Failures (`src/handlers/commandHandlers.ts`)

**Symptoms**:
- Discord commands not responding
- Permission errors for valid users
- Command execution timeouts

**Recovery Procedure**:
```bash
# Step 1: Check Discord connection
curl http://localhost:3000/api/health/external/discord

# Step 2: Validate bot permissions
# Use Discord Developer Portal to check bot permissions in affected guild

# Step 3: Test command execution manually
curl -X POST http://localhost:3000/api/test/command \
  -H "Content-Type: application/json" \
  -d '{"command": "ping", "userId": "test"}'

# Step 4: Restart event handlers if needed
curl -X POST http://localhost:3000/api/admin/handlers/restart

# Step 5: Monitor command success rate
tail -f logs/application.log | grep "Command.*executed"
```

#### 2. Event Handler Race Conditions (`src/handlers/eventHandlers.ts`)

**Symptoms**:
- Duplicate message processing
- "Duplicate message object detected" warnings
- Message processing delays

**Recovery Procedure**:
```bash
# Step 1: Check race condition manager status
curl http://localhost:3000/api/admin/race-condition/status

# Step 2: Clear processed message cache
curl -X POST http://localhost:3000/api/admin/race-condition/clear

# Step 3: Check message processing queue
curl http://localhost:3000/api/admin/queue/status

# Step 4: Force process pending messages
curl -X POST http://localhost:3000/api/admin/queue/process

# Step 5: Monitor for duplicates
tail -f logs/application.log | grep "Duplicate message"
```

#### 3. API Interaction Failures (`src/handlers/eventHandlers.ts`)

**Symptoms**:
- Gemini API failures with fallback responses
- Image processing failures
- Analysis generation errors

**Recovery Procedure**:
```bash
# Step 1: Check API health
curl http://localhost:3000/api/health/external/gemini

# Step 2: Test API connectivity
curl -X POST http://localhost:3000/api/test/gemini \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test"}'

# Step 3: Check API credentials
curl http://localhost:3000/api/admin/config/validate

# Step 4: If API recovered, reset circuit breaker
curl -X POST http://localhost:3000/api/admin/circuit/reset/gemini

# Step 5: Monitor API success rate
tail -f logs/application.log | grep "Gemini.*response"
```

### Utilities and Core Recovery

#### 1. DataStore Corruption Recovery (`src/utils/DataStore.ts`)

**Symptoms**:
- "Data validation failed during load" errors
- SyntaxError during data loading
- Backup recovery attempts

**Recovery Procedure**:
```bash
# Step 1: Identify corrupted files
find data/ -name "*.json" -exec node -c "JSON.parse(require('fs').readFileSync('{}', 'utf8'))" \; 2>&1 | grep -B1 "SyntaxError"

# Step 2: Attempt automatic backup recovery
curl -X POST http://localhost:3000/api/admin/datastore/recover/[fileName]

# Step 3: If automatic recovery fails, manual recovery:
# Backup current file
cp data/corrupted-file.json data/corrupted-file.json.backup

# Restore from backup
cp data/corrupted-file.json.bak data/corrupted-file.json

# Step 4: Validate recovered data
curl -X POST http://localhost:3000/api/admin/datastore/validate/[fileName]

# Step 5: Monitor for recurring corruption
tail -f logs/application.log | grep "Data validation failed"
```

#### 2. Mutex Deadlock Recovery (`src/utils/MutexManager.ts`)

**Symptoms**:
- MutexTimeoutError exceptions
- Operations hanging indefinitely
- High mutex contention

**Recovery Procedure**:
```bash
# Step 1: Check mutex status
curl http://localhost:3000/api/admin/mutex/status

# Step 2: Identify deadlocked mutexes
curl http://localhost:3000/api/admin/mutex/deadlocks

# Step 3: Force release deadlocked mutexes
curl -X POST http://localhost:3000/api/admin/mutex/force-release/[mutexName]

# Step 4: Reset mutex statistics
curl -X POST http://localhost:3000/api/admin/mutex/reset-stats

# Step 5: Monitor mutex health
watch -n 2 'curl -s http://localhost:3000/api/admin/mutex/status'
```

#### 3. Large Context Handler Recovery (`src/utils/largeContextHandler.ts`)

**Symptoms**:
- Chunk processing failures
- File I/O errors
- Memory issues during processing

**Recovery Procedure**:
```bash
# Step 1: Check disk space
df -h

# Step 2: Clean up temporary files
curl -X POST http://localhost:3000/api/admin/temp/cleanup

# Step 3: Check file permissions
ls -la temp/context/

# Step 4: Restart context processing
curl -X POST http://localhost:3000/api/admin/context/restart

# Step 5: Process failed chunks manually
curl -X POST http://localhost:3000/api/admin/context/retry-failed
```

## Critical Failure Scenarios

### High Priority Fixes

#### 1. messageSplitter.ts - Infinite Loop Protection

**Current Issue**: No error boundaries for malformed input

**Immediate Fix**:
```typescript
// Add to src/utils/messageSplitter.ts
export function splitMessage(text: string, maxLength: number = 2000): string[] {
  // Input validation
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text must be a non-empty string');
  }
  if (maxLength <= 0 || maxLength > 4000) {
    throw new Error('Invalid maxLength: must be between 1 and 4000');
  }
  
  // Prevent infinite loops
  let iterations = 0;
  const maxIterations = Math.ceil(text.length / 100); // Safety limit
  
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0 && iterations < maxIterations) {
    iterations++;
    
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    
    // Find suitable break point
    let breakPoint = maxLength;
    const lastSpace = remaining.lastIndexOf(' ', maxLength);
    if (lastSpace > maxLength * 0.7) {
      breakPoint = lastSpace;
    }
    
    chunks.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint).trim();
  }
  
  if (iterations >= maxIterations) {
    throw new Error('Message splitting exceeded maximum iterations - possible infinite loop');
  }
  
  return chunks;
}
```

#### 2. validation.ts - Enhanced URL Validation

**Current Issue**: Silent URL validation failures

**Immediate Fix**:
```typescript
// Add to src/utils/validation.ts
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    
    // Additional validation
    if (!['http:', 'https:'].includes(url.protocol)) {
      logger.debug('URL validation failed: Invalid protocol', { value, protocol: url.protocol });
      return false;
    }
    
    if (!url.hostname) {
      logger.debug('URL validation failed: Missing hostname', { value });
      return false;
    }
    
    return true;
  } catch (error) {
    logger.debug('URL validation failed: Malformed URL', { 
      value, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return false;
  }
}
```

#### 3. botInitializer.ts - Initialization Timeout

**Current Issue**: No timeout protection during service startup

**Immediate Fix**:
```typescript
// Add to src/core/botInitializer.ts
export async function initializeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 30000,
  operationName: string = 'operation'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    operation()
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// Usage in service initialization
await initializeWithTimeout(
  () => serviceRegistry.initializeAll(),
  30000,
  'Service initialization'
);
```

## Service Recovery Workflows

### Gemini API Recovery

```bash
#!/bin/bash
# gemini-recovery.sh

echo "Starting Gemini API recovery..."

# Check API status
echo "1. Checking Gemini API status..."
API_STATUS=$(curl -s http://localhost:3000/api/health/external/gemini | jq -r '.status')

if [ "$API_STATUS" = "healthy" ]; then
  echo "Gemini API is healthy, checking circuit breaker..."
  
  # Reset circuit breaker if needed
  CIRCUIT_STATUS=$(curl -s http://localhost:3000/api/health/circuits | jq -r '.gemini.state')
  if [ "$CIRCUIT_STATUS" = "open" ]; then
    echo "2. Resetting Gemini circuit breaker..."
    curl -X POST http://localhost:3000/api/admin/circuit/reset/gemini
  fi
else
  echo "Gemini API is unhealthy. Check:"
  echo "- API key validity"
  echo "- Network connectivity"
  echo "- API quota limits"
  exit 1
fi

# Validate recovery
echo "3. Validating recovery..."
TEST_RESULT=$(curl -s -X POST http://localhost:3000/api/test/gemini \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test"}' | jq -r '.success')

if [ "$TEST_RESULT" = "true" ]; then
  echo "✅ Gemini API recovery successful"
else
  echo "❌ Gemini API recovery failed"
  exit 1
fi
```

### Discord Connection Recovery

```bash
#!/bin/bash
# discord-recovery.sh

echo "Starting Discord connection recovery..."

# Check Discord connection
echo "1. Checking Discord connection..."
DISCORD_STATUS=$(curl -s http://localhost:3000/api/health/external/discord | jq -r '.status')

if [ "$DISCORD_STATUS" != "healthy" ]; then
  echo "2. Attempting Discord reconnection..."
  curl -X POST http://localhost:3000/api/admin/discord/reconnect
  
  # Wait for reconnection
  sleep 10
  
  # Recheck status
  DISCORD_STATUS=$(curl -s http://localhost:3000/api/health/external/discord | jq -r '.status')
fi

if [ "$DISCORD_STATUS" = "healthy" ]; then
  # Reset circuit breaker
  echo "3. Resetting Discord circuit breaker..."
  curl -X POST http://localhost:3000/api/admin/circuit/reset/discord
  
  # Test message sending
  echo "4. Testing message functionality..."
  TEST_RESULT=$(curl -s -X POST http://localhost:3000/api/test/discord-message \
    -H "Content-Type: application/json" \
    -d '{"message": "Recovery test"}' | jq -r '.success')
  
  if [ "$TEST_RESULT" = "true" ]; then
    echo "✅ Discord connection recovery successful"
  else
    echo "❌ Discord message test failed"
    exit 1
  fi
else
  echo "❌ Discord connection recovery failed"
  echo "Check bot token and permissions"
  exit 1
fi
```

## Data Recovery Procedures

### DataStore Recovery Workflow

```bash
#!/bin/bash
# datastore-recovery.sh

DATASTORE_PATH=${1:-"data/"}
BACKUP_PATH="${DATASTORE_PATH}backups/"

echo "Starting DataStore recovery for: $DATASTORE_PATH"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_PATH"

# Find corrupted files
echo "1. Scanning for corrupted files..."
find "$DATASTORE_PATH" -name "*.json" -not -path "*/backups/*" | while read file; do
  if ! jq empty "$file" >/dev/null 2>&1; then
    echo "Found corrupted file: $file"
    
    # Backup corrupted file
    cp "$file" "${BACKUP_PATH}$(basename $file).corrupted.$(date +%s)"
    
    # Look for backup
    backup_file="${file}.bak"
    if [ -f "$backup_file" ]; then
      echo "Restoring from backup: $backup_file"
      cp "$backup_file" "$file"
      
      # Validate restore
      if jq empty "$file" >/dev/null 2>&1; then
        echo "✅ Successfully restored: $file"
      else
        echo "❌ Backup is also corrupted: $file"
        # Create empty valid JSON
        echo '{}' > "$file"
      fi
    else
      echo "⚠️ No backup found for: $file"
      # Create empty valid JSON
      echo '{}' > "$file"
    fi
  fi
done

echo "2. Validating all DataStore files..."
curl -X POST http://localhost:3000/api/admin/datastore/validate-all

echo "DataStore recovery completed"
```

### Configuration Recovery

```bash
#!/bin/bash
# config-recovery.sh

echo "Starting configuration recovery..."

# Backup current config
echo "1. Backing up current configuration..."
cp .env .env.backup.$(date +%s)

# Validate configuration
echo "2. Validating configuration..."
if npm run config:validate; then
  echo "✅ Configuration is valid"
else
  echo "❌ Configuration validation failed"
  
  # Restore from template
  echo "3. Restoring from template..."
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "⚠️ Configuration restored from template"
    echo "Please update with your specific values"
  else
    echo "❌ No configuration template found"
    exit 1
  fi
fi

# Test configuration
echo "4. Testing configuration..."
if npm run test:config; then
  echo "✅ Configuration test passed"
else
  echo "❌ Configuration test failed"
  exit 1
fi
```

## Performance Recovery Procedures

### Memory Optimization Recovery

```bash
#!/bin/bash
# memory-recovery.sh

echo "Starting memory optimization recovery..."

# Get current memory usage
MEMORY_USAGE=$(curl -s http://localhost:3000/api/health/memory | jq -r '.heapUsed')
MEMORY_LIMIT=419430400  # 400MB in bytes

echo "Current memory usage: $(($MEMORY_USAGE / 1024 / 1024))MB"

if [ "$MEMORY_USAGE" -gt "$MEMORY_LIMIT" ]; then
  echo "Memory usage above threshold, starting recovery..."
  
  # Force garbage collection
  echo "1. Triggering garbage collection..."
  curl -X POST http://localhost:3000/api/admin/gc
  
  sleep 5
  
  # Clear caches
  echo "2. Clearing caches..."
  curl -X POST http://localhost:3000/api/admin/cache/clear
  
  # Check memory again
  NEW_MEMORY_USAGE=$(curl -s http://localhost:3000/api/health/memory | jq -r '.heapUsed')
  echo "Memory usage after cleanup: $(($NEW_MEMORY_USAGE / 1024 / 1024))MB"
  
  if [ "$NEW_MEMORY_USAGE" -gt "$MEMORY_LIMIT" ]; then
    echo "3. Memory still high, enabling degradation mode..."
    curl -X POST http://localhost:3000/api/admin/degradation/enable
    
    echo "⚠️ System in degradation mode due to memory pressure"
  else
    echo "✅ Memory recovery successful"
  fi
else
  echo "✅ Memory usage within normal limits"
fi
```

### Response Time Recovery

```bash
#!/bin/bash
# response-time-recovery.sh

echo "Starting response time recovery..."

# Check current response times
RESPONSE_TIME=$(curl -s http://localhost:3000/api/health/performance | jq -r '.responseTime.p95')
THRESHOLD=5000  # 5 seconds

echo "Current P95 response time: ${RESPONSE_TIME}ms"

if [ "$RESPONSE_TIME" -gt "$THRESHOLD" ]; then
  echo "Response time above threshold, starting recovery..."
  
  # Enable request queuing
  echo "1. Enabling request queuing..."
  curl -X POST http://localhost:3000/api/admin/queue/enable
  
  # Reduce concurrent processing
  echo "2. Reducing concurrent processing..."
  curl -X POST http://localhost:3000/api/admin/concurrency/reduce
  
  # Clear processing backlogs
  echo "3. Clearing processing backlogs..."
  curl -X POST http://localhost:3000/api/admin/queue/process-priority
  
  # Monitor improvement
  echo "4. Monitoring response time improvement..."
  sleep 30
  
  NEW_RESPONSE_TIME=$(curl -s http://localhost:3000/api/health/performance | jq -r '.responseTime.p95')
  echo "Response time after optimization: ${NEW_RESPONSE_TIME}ms"
  
  if [ "$NEW_RESPONSE_TIME" -lt "$THRESHOLD" ]; then
    echo "✅ Response time recovery successful"
    # Gradually restore normal processing
    curl -X POST http://localhost:3000/api/admin/concurrency/restore
  else
    echo "⚠️ Response time still elevated, maintaining reduced capacity"
  fi
else
  echo "✅ Response time within normal limits"
fi
```

## Validation and Testing

### Recovery Validation Checklist

After any recovery procedure, validate the following:

```bash
#!/bin/bash
# validate-recovery.sh

echo "=== Recovery Validation Checklist ==="

# 1. System Health
echo "1. Checking system health..."
HEALTH_STATUS=$(curl -s http://localhost:3000/api/health/status | jq -r '.status')
echo "   System status: $HEALTH_STATUS"

# 2. Circuit Breakers
echo "2. Checking circuit breakers..."
GEMINI_CIRCUIT=$(curl -s http://localhost:3000/api/health/circuits | jq -r '.gemini.state')
DISCORD_CIRCUIT=$(curl -s http://localhost:3000/api/health/circuits | jq -r '.discord.state')
echo "   Gemini circuit: $GEMINI_CIRCUIT"
echo "   Discord circuit: $DISCORD_CIRCUIT"

# 3. External Services
echo "3. Checking external services..."
GEMINI_HEALTH=$(curl -s http://localhost:3000/api/health/external/gemini | jq -r '.status')
DISCORD_HEALTH=$(curl -s http://localhost:3000/api/health/external/discord | jq -r '.status')
echo "   Gemini API: $GEMINI_HEALTH"
echo "   Discord API: $DISCORD_HEALTH"

# 4. Performance Metrics
echo "4. Checking performance metrics..."
MEMORY_USAGE=$(curl -s http://localhost:3000/api/health/memory | jq -r '.heapUsed')
RESPONSE_TIME=$(curl -s http://localhost:3000/api/health/performance | jq -r '.responseTime.p95')
echo "   Memory usage: $(($MEMORY_USAGE / 1024 / 1024))MB"
echo "   P95 response time: ${RESPONSE_TIME}ms"

# 5. End-to-End Test
echo "5. Running end-to-end test..."
E2E_RESULT=$(curl -s -X POST http://localhost:3000/api/test/e2e \
  -H "Content-Type: application/json" \
  -d '{"test": "recovery validation"}' | jq -r '.success')
echo "   E2E test: $E2E_RESULT"

# Summary
echo ""
echo "=== Validation Summary ==="
if [ "$HEALTH_STATUS" = "healthy" ] && \
   [ "$GEMINI_CIRCUIT" = "closed" ] && \
   [ "$DISCORD_CIRCUIT" = "closed" ] && \
   [ "$E2E_RESULT" = "true" ]; then
  echo "✅ All validation checks passed"
  exit 0
else
  echo "❌ Some validation checks failed"
  exit 1
fi
```

### Load Testing Post-Recovery

```bash
#!/bin/bash
# load-test-recovery.sh

echo "Starting load test after recovery..."

# Gradual load increase
for load in 1 5 10 20; do
  echo "Testing with $load concurrent requests..."
  
  # Run load test
  for i in $(seq 1 $load); do
    curl -s -X POST http://localhost:3000/api/test/load \
      -H "Content-Type: application/json" \
      -d "{\"id\": $i}" &
  done
  
  wait
  
  # Check system health
  HEALTH=$(curl -s http://localhost:3000/api/health/status | jq -r '.status')
  RESPONSE_TIME=$(curl -s http://localhost:3000/api/health/performance | jq -r '.responseTime.p95')
  
  echo "  Health: $HEALTH, Response time: ${RESPONSE_TIME}ms"
  
  if [ "$HEALTH" != "healthy" ] || [ "$RESPONSE_TIME" -gt "5000" ]; then
    echo "❌ System degraded at $load concurrent requests"
    break
  fi
  
  sleep 10
done

echo "Load test completed"
```

## Post-Recovery Analysis

### Recovery Documentation Template

After each recovery incident, document the following:

```markdown
# Recovery Incident Report

## Incident Details
- **Date/Time**: [ISO timestamp]
- **Duration**: [Start to resolution time]
- **Severity**: [P0/P1/P2/P3]
- **Impact**: [Number of users affected, service degradation]

## Root Cause Analysis
- **Primary Cause**: [Technical root cause]
- **Contributing Factors**: [Configuration, load, timing, etc.]
- **Detection Method**: [How was the issue discovered]

## Recovery Actions Taken
1. [Action 1 with timestamp]
2. [Action 2 with timestamp]
3. [Action 3 with timestamp]

## Validation Results
- [ ] System health restored
- [ ] Circuit breakers closed
- [ ] External services responding
- [ ] Performance within thresholds
- [ ] End-to-end tests passing

## Lessons Learned
- **What Worked Well**: [Effective procedures, tools, monitoring]
- **What Could Improve**: [Gaps in procedures, monitoring, automation]
- **Preventive Measures**: [Changes to prevent recurrence]

## Action Items
- [ ] [Immediate fixes needed]
- [ ] [Process improvements]
- [ ] [Monitoring enhancements]
- [ ] [Documentation updates]
```

### Metrics Collection

```bash
#!/bin/bash
# collect-recovery-metrics.sh

INCIDENT_ID=${1:-$(date +%s)}
METRICS_DIR="recovery-metrics/$INCIDENT_ID"

mkdir -p "$METRICS_DIR"

echo "Collecting recovery metrics for incident: $INCIDENT_ID"

# System health snapshot
curl -s http://localhost:3000/api/health/status > "$METRICS_DIR/health-status.json"
curl -s http://localhost:3000/api/health/circuits > "$METRICS_DIR/circuit-status.json"
curl -s http://localhost:3000/api/health/memory > "$METRICS_DIR/memory-usage.json"
curl -s http://localhost:3000/api/health/performance > "$METRICS_DIR/performance.json"

# Service-specific metrics
curl -s http://localhost:3000/api/metrics/gemini > "$METRICS_DIR/gemini-metrics.json"
curl -s http://localhost:3000/api/metrics/discord > "$METRICS_DIR/discord-metrics.json"
curl -s http://localhost:3000/api/metrics/queue > "$METRICS_DIR/queue-metrics.json"

# Log snapshots
tail -n 1000 logs/application.log > "$METRICS_DIR/recent-logs.txt"
grep -i error logs/application.log | tail -n 100 > "$METRICS_DIR/recent-errors.txt"

echo "Metrics collected in: $METRICS_DIR"
```

---

This document provides comprehensive recovery procedures for all identified error scenarios. For additional support or system-specific issues, consult the [ERROR_HANDLING_GUIDE.md](ERROR_HANDLING_GUIDE.md) for patterns and [TROUBLESHOOTING_LOG.md](../TROUBLESHOOTING_LOG.md) for historical resolution examples.