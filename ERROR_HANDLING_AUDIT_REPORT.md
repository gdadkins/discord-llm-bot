# Error Handling Audit Report
**Generated:** 2025-11-25
**Scope:** TypeScript files in src/ directory (excluding tests)
**Focus:** Async operations, error handling, validation, and failure modes

---

## Executive Summary

This audit identified **47 error handling issues** across the codebase, categorized by severity:

- **Critical:** 12 issues - System stability risks, potential crashes
- **High:** 18 issues - Data loss, inconsistent state, poor UX
- **Medium:** 11 issues - Logging gaps, minor edge cases
- **Low:** 6 issues - Code quality, maintainability

---

## Critical Issues (12)

### 1. Unhandled Promise Rejections in Process Event Handlers
**File:** `/mnt/c/github/discord/discord-llm-bot/src/utils/ResourceManager.ts`
**Lines:** 825-865
**Issue:** Process event handlers (`SIGTERM`, `SIGINT`, `uncaughtException`, `unhandledRejection`) use async/await but don't properly handle failures in the emergency cleanup

```typescript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, performing graceful shutdown');
  try {
    await globalResourceManager.emergencyCleanup();
    process.exit(0);
  } catch (error) {
    logger.error('Emergency cleanup failed', error);
    process.exit(1);
  }
});
```

**Problem:** If `emergencyCleanup()` hangs indefinitely, the process never exits. No timeout protection.

**Severity:** Critical
**Impact:** Application may hang on shutdown, requiring force kill

**Suggested Fix:**
```typescript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, performing graceful shutdown');
  const timeout = setTimeout(() => {
    logger.error('Emergency cleanup timed out, forcing exit');
    process.exit(1);
  }, 5000);

  try {
    await globalResourceManager.emergencyCleanup();
    clearTimeout(timeout);
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    logger.error('Emergency cleanup failed', error);
    process.exit(1);
  }
});
```

---

### 2. Silent Failure in Connection Pool Request
**File:** `/mnt/c/github/discord/discord-llm-bot/src/utils/ConnectionPool.ts`
**Lines:** 226-229
**Issue:** Error updating stats is caught and re-thrown, but the error context is lost

```typescript
} catch (error) {
  // Update error stats
  await this.updateStats(startTime, false, error);
  throw error;
}
```

**Problem:** If `updateStats()` throws, the original error is masked. No error wrapping or context preservation.

**Severity:** Critical
**Impact:** Original request errors lost, debugging becomes impossible

**Suggested Fix:**
```typescript
} catch (error) {
  try {
    await this.updateStats(startTime, false, error);
  } catch (statsError) {
    logger.error('Failed to update stats after request error', {
      statsError,
      originalError: error
    });
  }
  throw enrichError(error as Error, {
    operation: 'ConnectionPool.request',
    url: options.url,
    method: options.method
  });
}
```

---

### 3. Missing Timeout in Mutex Acquisition
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/cacheManager.ts`
**Lines:** 32-44, 46-60
**Issue:** `acquireRead()` and `acquireWrite()` can wait indefinitely in busy-wait loops

```typescript
async acquireRead(): Promise<() => void> {
  const release = await this.readMutex.acquire();
  while (this.writers > 0 || this.waitingWriters > 0) {
    release();
    await new Promise(resolve => setTimeout(resolve, 1));
    await this.readMutex.acquire();
  }
  this.readers++;
  return () => {
    this.readers--;
    release();
  };
}
```

**Problem:** No timeout, no maximum retry count. Can deadlock if state becomes inconsistent.

**Severity:** Critical
**Impact:** Potential deadlock causing complete cache system freeze

**Suggested Fix:**
```typescript
async acquireRead(timeout = 5000): Promise<() => void> {
  const startTime = Date.now();
  const release = await this.readMutex.acquire();

  while (this.writers > 0 || this.waitingWriters > 0) {
    if (Date.now() - startTime > timeout) {
      release();
      throw new Error(`Read lock acquisition timeout after ${timeout}ms`);
    }
    release();
    await new Promise(resolve => setTimeout(resolve, 1));
    await this.readMutex.acquire();
  }
  this.readers++;
  return () => {
    this.readers--;
    release();
  };
}
```

---

### 4. Fire-and-Forget Promise Without Error Handling
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/gemini/GeminiService.ts`
**Lines:** 275-290
**Issue:** Post-generation tasks are fire-and-forget but error handler logs to health monitor which may be undefined

```typescript
this.handlePostGenerationAsync(userId, prompt, result, bypassCache, serverId)
  .catch(error => {
    logger.error('Post-generation task failed', {
      error,
      userId,
      serverId,
      promptLength: prompt.length
    });
    // Report to health monitor if available
    if (this.healthMonitor) {
      this.healthMonitor.recordError('GeminiService.postGeneration', error instanceof Error ? error : new Error(String(error)));
    }
  });
```

**Problem:** If health monitor's `recordError` throws, error is unhandled. No fallback.

**Severity:** Critical
**Impact:** Unhandled promise rejection can crash Node.js process

**Suggested Fix:**
```typescript
this.handlePostGenerationAsync(userId, prompt, result, bypassCache, serverId)
  .catch(error => {
    logger.error('Post-generation task failed', {
      error,
      userId,
      serverId,
      promptLength: prompt.length
    });
    try {
      if (this.healthMonitor) {
        this.healthMonitor.recordError(
          'GeminiService.postGeneration',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    } catch (healthError) {
      logger.error('Failed to record error in health monitor', {
        healthError,
        originalError: error
      });
    }
  });
```

---

### 5. Missing Error Context in API Client
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/gemini/GeminiAPIClient.ts`
**Lines:** 235-248
**Issue:** API errors re-thrown without enrichment, losing request context

```typescript
} catch (error) {
  const duration = Date.now() - startTime;
  const stats = this.apiTimeout.getStats();

  logger.error(`${type} Gemini API call failed`, {
    duration,
    timeout,
    model: model.model,
    adaptiveTimeoutStats: stats,
    error: error instanceof Error ? error.message : String(error)
  });

  throw error;
}
```

**Problem:** Caller receives raw error without model, timeout, or request context. Debugging is difficult.

**Severity:** Critical
**Impact:** Lost debugging information for production failures

**Suggested Fix:**
```typescript
} catch (error) {
  const duration = Date.now() - startTime;
  const stats = this.apiTimeout.getStats();

  const enrichedError = enrichError(error as Error, {
    operation: `executeRequest.${type}`,
    model: model.model,
    timeout,
    duration,
    adaptiveTimeoutStats: stats,
    category: 'API_ERROR' as const
  });

  logger.error(`${type} Gemini API call failed`, {
    error: enrichedError
  });

  throw enrichedError;
}
```

---

### 6. Dangerous Type Casting in Response Processing
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/responseProcessingService.ts`
**Lines:** 98-103
**Issue:** Unsafe type assertion without validation

```typescript
async processAPIResponse(
  response: RawAPIResponse | unknown,
  config: ResponseProcessingConfig
): Promise<ProcessedResponse> {
  try {
    // Validate response exists
    if (!response) {
      throw new Error('No response received from API');
    }

    const res = response as RawAPIResponse;
```

**Problem:** No validation that `response` actually matches `RawAPIResponse` interface before accessing properties.

**Severity:** Critical
**Impact:** Runtime errors accessing undefined properties

**Suggested Fix:**
```typescript
async processAPIResponse(
  response: RawAPIResponse | unknown,
  config: ResponseProcessingConfig
): Promise<ProcessedResponse> {
  try {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response: not an object');
    }

    const res = response as RawAPIResponse;

    // Validate critical properties exist
    if (!('candidates' in res) && !('promptFeedback' in res)) {
      throw new Error('Invalid response structure: missing candidates and promptFeedback');
    }
```

---

### 7. Unhandled Fetch Failures in Event Handler
**File:** `/mnt/c/github/discord/discord-llm-bot/src/handlers/eventHandlers.ts`
**Lines:** 723-741
**Issue:** Fetch operations without proper error handling for network failures

```typescript
const response = await fetch(attachment.url);
if (response.ok) {
  const buffer = await response.arrayBuffer();
  const base64Data = Buffer.from(buffer).toString('base64');

  imageAttachments.push({
    url: attachment.url,
    mimeType: attachment.contentType,
    base64Data: base64Data,
    filename: attachment.name || undefined,
    size: attachment.size || undefined
  });
}
```

**Problem:**
1. No timeout on fetch - can hang indefinitely
2. Only checks `response.ok`, doesn't handle network errors
3. `arrayBuffer()` and `toString()` can throw without handling

**Severity:** Critical
**Impact:** Message processing can hang on slow/failing network requests

**Suggested Fix:**
```typescript
try {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(attachment.url, {
    signal: controller.signal,
    headers: { 'User-Agent': 'Discord-Bot/1.0' }
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const base64Data = Buffer.from(buffer).toString('base64');

  imageAttachments.push({
    url: attachment.url,
    mimeType: attachment.contentType,
    base64Data: base64Data,
    filename: attachment.name || undefined,
    size: attachment.size || undefined
  });
} catch (fetchError) {
  logger.error('Failed to fetch image attachment', {
    url: attachment.url,
    error: fetchError,
    isTimeout: fetchError.name === 'AbortError'
  });
  // Don't push failed attachment - continue processing others
}
```

---

### 8. Missing Validation in CacheManager Set
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/cacheManager.ts`
**Lines:** 240-289
**Issue:** No validation of input parameters before expensive compression operation

```typescript
async set(
  prompt: string,
  userId: string,
  response: string,
  serverId?: string
): Promise<void> {
  const startTime = Date.now();
  const releaseWrite = await this.rwLock.acquireWrite();

  try {
    const key = this.generateCacheKey(prompt, userId, serverId);
```

**Problem:** Doesn't validate:
1. `prompt` and `response` are non-empty strings
2. `userId` is valid
3. `response` size is reasonable (could try to compress massive string)

**Severity:** Critical
**Impact:** Can waste resources compressing invalid data, DoS vector

**Suggested Fix:**
```typescript
async set(
  prompt: string,
  userId: string,
  response: string,
  serverId?: string
): Promise<void> {
  // Validate inputs
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Invalid prompt: must be non-empty string');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId: must be non-empty string');
  }
  if (!response || typeof response !== 'string') {
    throw new Error('Invalid response: must be non-empty string');
  }

  // Reject excessively large responses
  const responseSize = Buffer.byteLength(response, 'utf8');
  if (responseSize > 10 * 1024 * 1024) { // 10MB limit
    logger.warn('Response too large to cache', { size: responseSize, userId });
    return; // Skip caching
  }

  const startTime = Date.now();
  const releaseWrite = await this.rwLock.acquireWrite();
```

---

### 9. Race Condition in Cleanup Flag
**File:** `/mnt/c/github/discord/discord-llm-bot/src/utils/ResourceManager.ts`
**Lines:** 238-247
**Issue:** `cleanupInProgress` flag check and set are not atomic

```typescript
async cleanup(type?: string, options: {
  force?: boolean;
  timeout?: number;
  maxConcurrency?: number;
} = {}): Promise<CleanupResult[]> {
  if (this.cleanupInProgress && !options.force) {
    logger.warn('Cleanup already in progress, waiting for completion');
    if (this.cleanupPromise) {
      return await this.cleanupPromise;
    }
    return [];
  }

  this.cleanupInProgress = true;
```

**Problem:** Between check and set, another caller can start cleanup. Race condition.

**Severity:** Critical
**Impact:** Multiple concurrent cleanups can cause resource double-free

**Suggested Fix:**
```typescript
private cleanupMutex = new Mutex();

async cleanup(type?: string, options: {
  force?: boolean;
  timeout?: number;
  maxConcurrency?: number;
} = {}): Promise<CleanupResult[]> {
  const release = await this.cleanupMutex.acquire();

  try {
    if (this.cleanupInProgress && !options.force) {
      logger.warn('Cleanup already in progress, waiting for completion');
      release();
      if (this.cleanupPromise) {
        return await this.cleanupPromise;
      }
      return [];
    }

    this.cleanupInProgress = true;
    // ... rest of cleanup
  } catch (error) {
    this.cleanupInProgress = false;
    release();
    throw error;
  }
}
```

---

### 10. Missing Error Recovery in Bot Initialization
**File:** `/mnt/c/github/discord/discord-llm-bot/src/core/botInitializer.ts`
**Lines:** 59-105
**Issue:** If service creation fails, no cleanup of partially created services

```typescript
const result = await handleAsyncOperation(
  async () => {
    logger.info('Initializing bot services with dependency injection and distributed tracing...', { requestId });

    const tracingSpan = context.startSpan('tracing_initialization');
    const tracingIntegration = TracingIntegration.getInstance();
    await tracingIntegration.initialize();
    context.endSpan(tracingSpan.spanId);

    // Create bot configuration using factory with timeout
    const configSpan = context.startSpan('configuration_creation');
    const config = await Promise.race([
      Promise.resolve(ConfigurationFactory.createBotConfiguration()),
      createTimeoutPromise(10000).then(() => {
        throw enrichError(new Error('Configuration creation timeout'), {
          operation: 'ConfigurationFactory.createBotConfiguration',
          timeout: 10000,
          requestId
        });
      })
    ]);
```

**Problem:** If any step fails, earlier initialized services (tracing) are not cleaned up.

**Severity:** Critical
**Impact:** Resource leaks, inconsistent application state

**Suggested Fix:**
```typescript
const result = await handleAsyncOperation(
  async () => {
    const cleanupStack: Array<() => Promise<void>> = [];

    try {
      logger.info('Initializing bot services...', { requestId });

      const tracingSpan = context.startSpan('tracing_initialization');
      const tracingIntegration = TracingIntegration.getInstance();
      await tracingIntegration.initialize();
      cleanupStack.push(async () => await tracingIntegration.shutdown());
      context.endSpan(tracingSpan.spanId);

      const configSpan = context.startSpan('configuration_creation');
      const config = await Promise.race([
        Promise.resolve(ConfigurationFactory.createBotConfiguration()),
        createTimeoutPromise(10000).then(() => {
          throw enrichError(new Error('Configuration creation timeout'), {
            operation: 'ConfigurationFactory.createBotConfiguration',
            timeout: 10000,
            requestId
          });
        })
      ]);

      // ... rest of initialization

      return { geminiService, userAnalysisService, serviceRegistry, tracingIntegration };
    } catch (error) {
      // Cleanup in reverse order
      logger.error('Initialization failed, performing cleanup', { error });
      for (let i = cleanupStack.length - 1; i >= 0; i--) {
        try {
          await cleanupStack[i]();
        } catch (cleanupError) {
          logger.error('Cleanup failed during error recovery', { cleanupError });
        }
      }
      throw error;
    }
  },
```

---

### 11. Unhandled Decompression Errors
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/cacheManager.ts`
**Lines:** 176-184
**Issue:** Decompression error is logged and re-thrown, but caller may not handle it properly

```typescript
private async decompressResponse(buffer: Buffer): Promise<string> {
  try {
    const decompressed = await gunzipAsync(buffer);
    return decompressed.toString('utf8');
  } catch (error) {
    logger.error('Decompression error:', error);
    throw error;
  }
}
```

**Problem:** If cached data is corrupted, decompression fails and cache entry should be invalidated, but it's not.

**Severity:** Critical
**Impact:** Corrupted cache entries cause repeated failures, degraded user experience

**Suggested Fix:**
```typescript
async get(prompt: string, userId: string, serverId?: string): Promise<string | null> {
  const startTime = Date.now();
  const releaseRead = await this.rwLock.acquireRead();
  const key = this.generateCacheKey(prompt, userId, serverId);

  try {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // ... TTL check

    // Decompress if needed with corruption handling
    if (entry.compressed && Buffer.isBuffer(entry.response)) {
      try {
        return await this.decompressResponse(entry.response);
      } catch (decompressError) {
        logger.error('Cache entry corrupted, invalidating', {
          key: key.substring(0, 8),
          error: decompressError
        });

        // Need write lock to delete
        releaseRead();
        const releaseWrite = await this.rwLock.acquireWrite();
        try {
          this.cache.delete(key);
          this.lruMap.delete(key);
          this.stats.misses++;
          return null;
        } finally {
          releaseWrite();
        }
      }
    }

    return entry.response as string;
  } finally {
    releaseRead();
  }
}
```

---

### 12. Missing Null/Undefined Checks in Response Extraction
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/responseProcessingService.ts`
**Lines:** 348-406
**Issue:** Accessing nested properties without null checks

```typescript
if (candidate.content?.parts && candidate.content.parts.length > 0) {
  const parts = candidate.content.parts;
  logger.debug(`Found ${parts.length} parts in content`);

  // Separate thinking and response parts
  const thinkingParts: string[] = [];
  const responseParts: string[] = [];

  parts.forEach((part, index) => {
    logger.debug(`Part ${index} keys:`, Object.keys(part));

    // Cast to extended part interface for role access
    const extendedPart = part as ExtendedResponsePart;
```

**Problem:** `part` could be null/undefined, `Object.keys(part)` would throw.

**Severity:** Critical
**Impact:** Crash when processing malformed API responses

**Suggested Fix:**
```typescript
if (candidate.content?.parts && candidate.content.parts.length > 0) {
  const parts = candidate.content.parts;
  logger.debug(`Found ${parts.length} parts in content`);

  const thinkingParts: string[] = [];
  const responseParts: string[] = [];

  parts.forEach((part, index) => {
    if (!part || typeof part !== 'object') {
      logger.warn(`Invalid part at index ${index}, skipping`);
      return;
    }

    logger.debug(`Part ${index} keys:`, Object.keys(part));

    const extendedPart = part as ExtendedResponsePart;
```

---

## High Severity Issues (18)

### 13. Generic Catch Without Error Type Checking
**File:** `/mnt/c/github/discord/discord-llm-bot/src/handlers/eventHandlers.ts`
**Lines:** 922-982
**Issue:** Catches all errors generically without checking error type or category

```typescript
} catch (error) {
  // === ERROR HANDLING ===
  // Comprehensive error handling with graceful user communication
  stopTyping();

  const enrichedError = enrichError(error as Error, {
    messageId: message.id,
    userId: message.author.id,
    channelId: message.channel.id,
    guildId: message.guild?.id,
    requestId,
    operation: 'message_processing',
    duration: Date.now() - startTime
  });
```

**Problem:** All errors handled the same way - no special handling for rate limits, permissions, network errors.

**Severity:** High
**Impact:** Poor user experience, unhelpful error messages

**Suggested Fix:**
```typescript
} catch (error) {
  stopTyping();

  const enrichedError = enrichError(error as Error, {
    messageId: message.id,
    userId: message.author.id,
    channelId: message.channel.id,
    guildId: message.guild?.id,
    requestId,
    operation: 'message_processing',
    duration: Date.now() - startTime
  });

  logger.error('Error generating response for mention', {
    error: enrichedError,
    errorCategory: enrichedError.category,
    retryable: isRetryableError(enrichedError)
  });

  // Handle based on error category
  let userMessage: string;

  if (enrichedError.category === 'RATE_LIMIT') {
    userMessage = 'You\'re sending messages too quickly. Please wait a moment.';
  } else if (enrichedError.category === 'PERMISSION') {
    userMessage = 'I don\'t have permission to perform that action.';
  } else if (enrichedError.category === 'NETWORK') {
    userMessage = 'I\'m having trouble connecting to my AI service. Please try again.';
  } else if (enrichedError.category === 'VALIDATION') {
    userMessage = enrichedError.message || 'Your request was invalid.';
  } else if (isRetryableError(enrichedError)) {
    userMessage = 'I encountered a temporary issue. Please try again in a moment.';
  } else {
    userMessage = getUserFriendlyMessage(enrichedError);
  }

  try {
    await message.reply(userMessage);
  } catch (replyError) {
    logger.error('Failed to send error reply', {
      error: replyError,
      originalError: enrichedError,
      requestId
    });
  }
}
```

---

### 14. Silent Failure in Compression
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/cacheManager.ts`
**Lines:** 153-174
**Issue:** Compression errors are logged but silently return null, caller doesn't know compression failed

```typescript
private async compressResponse(response: string): Promise<{ compressed: Buffer; originalSize: number; compressedSize: number } | null> {
  try {
    const originalSize = Buffer.byteLength(response, 'utf8');
    if (originalSize < this.COMPRESSION_THRESHOLD) {
      return null;
    }

    const compressed = await gzipAsync(response);
    const compressedSize = compressed.length;

    // Only use compression if it saves at least 20%
    if (compressedSize < originalSize * 0.8) {
      this.stats.compressionSavings += originalSize - compressedSize;
      return { compressed, originalSize, compressedSize };
    }

    return null;
  } catch (error) {
    logger.error('Compression error:', error);
    return null;
  }
}
```

**Problem:** Returning null for error vs small size looks the same to caller. Should track compression failures separately.

**Severity:** High
**Impact:** Compression failures untracked, can't detect systemic issues

**Suggested Fix:**
```typescript
private compressionErrorCount = 0;
private readonly MAX_COMPRESSION_ERRORS = 10;

private async compressResponse(response: string): Promise<{
  compressed: Buffer;
  originalSize: number;
  compressedSize: number
} | null> {
  try {
    const originalSize = Buffer.byteLength(response, 'utf8');
    if (originalSize < this.COMPRESSION_THRESHOLD) {
      return null;
    }

    // Disable compression if too many errors
    if (this.compressionErrorCount >= this.MAX_COMPRESSION_ERRORS) {
      logger.warn('Compression disabled due to repeated errors');
      return null;
    }

    const compressed = await gzipAsync(response);
    const compressedSize = compressed.length;

    if (compressedSize < originalSize * 0.8) {
      // Reset error count on success
      this.compressionErrorCount = 0;
      this.stats.compressionSavings += originalSize - compressedSize;
      return { compressed, originalSize, compressedSize };
    }

    return null;
  } catch (error) {
    this.compressionErrorCount++;
    logger.error('Compression error', {
      error,
      errorCount: this.compressionErrorCount,
      disabled: this.compressionErrorCount >= this.MAX_COMPRESSION_ERRORS
    });
    return null;
  }
}
```

---

### 15. Missing Timeout in makeRequest
**File:** `/mnt/c/github/discord/discord-llm-bot/src/utils/ConnectionPool.ts`
**Lines:** 235-293
**Issue:** Request can hang if remote server accepts connection but never responds

```typescript
private makeRequest(
  options: https.RequestOptions,
  body?: string | Buffer
): Promise<{
  statusCode?: number;
  headers: http.IncomingHttpHeaders;
  body: string | Buffer;
}> {
  return new Promise((resolve, reject) => {
    const isHttps = options.protocol === 'https:' || options.port === 443;
    const module = isHttps ? https : http;

    const req = module.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      res.on('end', () => {
```

**Problem:**
1. Timeout only set on request, not on response body streaming
2. If `res.on('data')` never fires after receiving headers, hangs forever
3. No cleanup of event listeners on error

**Severity:** High
**Impact:** Hung requests consume connection pool slots indefinitely

**Suggested Fix:**
```typescript
private makeRequest(
  options: https.RequestOptions,
  body?: string | Buffer
): Promise<{
  statusCode?: number;
  headers: http.IncomingHttpHeaders;
  body: string | Buffer;
}> {
  return new Promise((resolve, reject) => {
    const isHttps = options.protocol === 'https:' || options.port === 443;
    const module = isHttps ? https : http;

    let resolved = false;
    const cleanup = () => {
      if (responseTimeout) clearTimeout(responseTimeout);
      if (req) {
        req.removeAllListeners();
      }
    };

    // Overall timeout for entire request+response
    let responseTimeout: NodeJS.Timeout | null = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        req.destroy();
        reject(new Error('Request timeout (overall)'));
      }
    }, this.options.timeout);

    const req = module.request(options, (res) => {
      const chunks: Buffer[] = [];

      // Reset timeout for response body
      if (responseTimeout) clearTimeout(responseTimeout);
      responseTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          req.destroy();
          reject(new Error('Response body timeout'));
        }
      }, this.options.timeout);

      res.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
        // Reset timeout on each data chunk
        if (responseTimeout) clearTimeout(responseTimeout);
        responseTimeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            req.destroy();
            reject(new Error('Response streaming timeout'));
          }
        }, this.options.timeout);
      });

      res.on('end', () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          const responseBody = Buffer.concat(chunks);

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseBody
          });
        }
      });

      res.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(error);
      }
    });

    req.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        req.destroy();
        reject(new Error('Request timeout'));
      }
    });

    if (this.options.timeout) {
      req.setTimeout(this.options.timeout);
    }

    if (body) {
      req.write(body);
    }

    req.end();
  });
}
```

---

### 16-30. [Additional High Severity Issues]

Due to length constraints, I'll summarize the remaining high severity issues:

16. **Missing validation in response text extraction** (responseProcessingService.ts:329-337) - `res.text` called without checking if it's a function
17. **Hardcoded error messages instead of proper errors** (GeminiService.ts:498) - Throwing Error with hardcoded message instead of using error categories
18. **No retry limit in cleanup** (ResourceManager.ts:361-431) - Exponential backoff without max wait time
19. **Unsafe Promise.race usage** (eventHandlers.ts:877-897) - Timeout can race actual response, causing double-reply
20. **Missing input validation in event handler** (eventHandlers.ts:545-551) - Empty prompt check but no length/content validation
21. **No error handling in typing indicator** (eventHandlers.ts:555-566) - `startTyping()` can throw but not caught
22. **Unsafe channel casting** (eventHandlers.ts:557, 846) - Type assertions without validation
23. **Missing null check before reply** (eventHandlers.ts:841-848) - `message.channel` could be null
24. **No cleanup on mutex timeout** (eventHandlers.ts:481-490) - Timeout promise doesn't release resources
25. **Unhandled YouTube URL processing errors** (eventHandlers.ts:643-684) - Errors logged but processing continues with partial data
26. **No validation of image attachment data** (eventHandlers.ts:728-756) - Base64 conversion can fail with corrupted data
27. **Silent failure in post-generation tasks** (GeminiService.ts:464-473) - Errors logged but not tracked
28. **No recovery from cache corruption** (cacheManager.ts:186-238) - Corrupted entry causes all reads to fail
29. **Missing permission checks before reply** (eventHandlers.ts:919-921) - Assumes bot has SEND_MESSAGES permission
30. **No validation of Discord API responses** (eventHandlers.ts:773-781) - Fetched message could be null

---

## Medium Severity Issues (11)

### 31. Incomplete Error Logging
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/responseProcessingService.ts`
**Lines:** 217-225
**Issue:** Generic error catch doesn't log stack trace or error details

```typescript
} catch (error) {
  logger.error('Error processing API response:', error);

  if (error instanceof Error) {
    throw error; // Re-throw with original message
  }

  throw new Error('Failed to process API response. Please try again.');
}
```

**Severity:** Medium
**Impact:** Difficult to debug processing errors in production

**Suggested Fix:**
```typescript
} catch (error) {
  const enrichedError = enrichError(error as Error, {
    operation: 'processAPIResponse',
    configProvided: !!config,
    responseType: typeof response
  });

  logger.error('Error processing API response', {
    error: enrichedError,
    stack: enrichedError.stack,
    config: {
      includeThoughts: config.includeThoughts,
      isMultimodal: config.isMultimodal,
      maxMessageLength: config.maxMessageLength
    }
  });

  throw enrichedError;
}
```

---

### 32-41. [Additional Medium Severity Issues]

32. **No metrics for eviction failures** (cacheManager.ts:291-316) - LRU eviction can fail silently
33. **Missing context in warmCache errors** (cacheManager.ts:318-332) - Errors logged without prompt details
34. **No validation of cleanup results** (ResourceManager.ts:253-277) - Results not validated for completeness
35. **Unsafe stats mutation** (ConnectionPool.ts:298-327) - Stats updated without mutex protection
36. **No limit on request times array** (ConnectionPool.ts:308) - Can grow unbounded
37. **Missing validation in registerEventListener** (ResourceManager.ts:584-608) - Listener type not validated
38. **No cleanup for leaked intervals** (cacheManager.ts:119-122) - Interval could leak if initialization fails
39. **Incomplete health status** (GeminiService.ts:204-219) - Doesn't check if dependencies are healthy
40. **No error recovery in shutdown** (botInitializer.ts:305-398) - Errors in one service can prevent others from shutting down
41. **Missing validation of environment variables** (botInitializer.ts:288-299) - Only checks DISCORD_TOKEN exists, not format

---

## Low Severity Issues (6)

### 42. Code Quality: Magic Numbers
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/cacheManager.ts`
**Lines:** 68-74
**Issue:** Magic numbers without named constants

**Severity:** Low
**Impact:** Code maintainability

**Suggested Fix:**
```typescript
private readonly MAX_CACHE_SIZE = 100;
private readonly TTL_MS = 5 * 60 * 1000;
private readonly COMPRESSION_THRESHOLD = 1024;
private readonly COMPRESSION_SAVINGS_MIN_PERCENT = 0.8;
private readonly MAX_LOOKUP_TIME_SAMPLES = 100;
```

---

### 43-47. [Additional Low Severity Issues]

43. **Inconsistent error message format** (Multiple files) - Some use "Error:", others don't
44. **No JSDoc for error-prone functions** (cacheManager.ts:compressResponse) - Complex logic without documentation
45. **Inconsistent use of optional chaining** (responseProcessingService.ts) - Some places check manually, others use `?.`
46. **No error codes** (Multiple files) - Errors use string messages, not error codes for i18n
47. **Missing type guards for discriminated unions** (responseProcessingService.ts:291-300) - Manual checks instead of type guards

---

## Recommendations by Priority

### Immediate Actions (Critical)
1. Add timeout protection to all process event handlers
2. Implement proper mutex usage with timeouts for cache locks
3. Add timeout and error handling to all fetch operations
4. Implement error context preservation using `enrichError` throughout
5. Add input validation before expensive operations (compression, API calls)
6. Fix race conditions in ResourceManager cleanup
7. Add cleanup stack to bot initialization for error recovery

### Short-term (High)
1. Implement error categorization and category-specific handling
2. Add metrics and monitoring for compression/decompression failures
3. Implement proper timeout handling for streaming responses
4. Add retry limits and circuit breakers for external service calls
5. Implement proper cleanup of event listeners and timeouts
6. Add validation for all Discord API responses

### Medium-term (Medium)
1. Standardize error logging format across codebase
2. Implement health checks that validate dependency health
3. Add comprehensive metrics collection for error rates
4. Implement graceful degradation for non-critical failures
5. Add structured logging with correlation IDs

### Long-term (Low)
1. Create error code system for internationalization
2. Add JSDoc documentation for all error-prone functions
3. Implement TypeScript strict mode and strict null checks
4. Create type guards for all discriminated unions
5. Standardize on optional chaining vs manual checks

---

## Testing Recommendations

### Unit Tests Needed
1. Error handling in compression/decompression with corrupted data
2. Mutex timeout behavior under contention
3. Resource cleanup under various failure scenarios
4. Cache behavior with invalid/corrupted entries
5. API response parsing with malformed responses

### Integration Tests Needed
1. End-to-end message processing with network failures
2. Graceful shutdown with various service states
3. Error recovery in multi-service initialization
4. Rate limiting and circuit breaker behavior
5. Discord API permission errors

### Load/Stress Tests Needed
1. Cache performance under high concurrency
2. Connection pool behavior under timeout conditions
3. Resource manager under rapid allocation/deallocation
4. Event handler under message spam
5. Graceful degradation under sustained load

---

## Metrics to Track

### Error Metrics
- Error rate by category (NETWORK, VALIDATION, API_ERROR, etc.)
- Error recovery success rate
- Time to detect and recover from errors
- Unhandled promise rejection count

### Performance Metrics
- Mutex acquisition time (p50, p95, p99)
- Cache hit/miss ratio under errors
- Compression success/failure rate
- Request timeout frequency
- Cleanup operation duration

### Resource Metrics
- Active mutex locks (detect potential deadlocks)
- Resource leak detection rate
- Cache memory usage vs corruption rate
- Connection pool utilization vs errors

---

## Conclusion

The codebase shows good intentions with error handling utilities (`enrichError`, `createTimeoutPromise`, etc.) but inconsistent application. The main issues are:

1. **Timeout Protection:** Many async operations lack timeout protection
2. **Error Context:** Errors often re-thrown without enrichment
3. **Input Validation:** Missing validation before expensive operations
4. **Race Conditions:** Several non-atomic check-then-act patterns
5. **Resource Cleanup:** Inconsistent cleanup on error paths

Implementing the critical and high-priority fixes will significantly improve system stability and debuggability.
