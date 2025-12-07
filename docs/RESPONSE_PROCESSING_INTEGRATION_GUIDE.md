# Response Processing Integration Guide

This guide provides comprehensive documentation for integrating with the GeminiService response processing system, including patterns, best practices, and real-world implementation examples.

## Overview

The GeminiService response processing system is designed to handle complex AI-generated responses with support for:

- **Multimodal Processing**: Text and image inputs with sophisticated context building
- **Streaming Responses**: Real-time response delivery for better user experience
- **Graceful Degradation**: Circuit breaker patterns and fallback mechanisms
- **Intelligent Context Management**: Multi-source context aggregation with optimization
- **Performance Optimization**: Caching, rate limiting, and resource management

## Core Integration Patterns

### 1. Standard Response Processing

The most common integration pattern for basic text generation:

```typescript
async function processStandardMessage(
  message: Message,
  prompt: string
): Promise<void> {
  try {
    // Build message context
    const messageContext = buildMessageContext(message);
    
    // Generate response with full context
    const response = await geminiService.generateResponse(
      prompt,
      message.author.id,
      message.guild?.id,
      undefined, // No streaming callback
      messageContext,
      message.member || undefined,
      message.guild || undefined
    );
    
    // Handle response splitting for Discord limits
    const chunks = splitMessage(response, 2000);
    await message.reply(chunks[0]);
    
    // Send remaining chunks
    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send(chunks[i]);
    }
    
  } catch (error) {
    logger.error('Standard message processing failed', {
      userId: message.author.id,
      error: error.message
    });
    await message.reply('Sorry, I encountered an error processing your message.');
  }
}
```

**Key Features:**
- Full context building with Discord metadata
- Automatic response splitting for message limits
- Basic error handling with user-friendly fallbacks

### 2. Streaming Response Integration

For real-time response delivery that improves user experience:

```typescript
async function processStreamingMessage(
  message: Message,
  prompt: string
): Promise<void> {
  let responseSent = false;
  let messageToEdit: Message | null = null;
  
  // Streaming callback for real-time updates
  const respondCallback = async (responseText: string) => {
    if (!responseText || responseSent) return;
    
    try {
      responseSent = true;
      
      // Handle thinking mode responses differently
      const chunks = responseText.includes('💭 **Thinking:**') && responseText.includes('**Response:**')
        ? splitThinkingResponse(responseText, 2000)
        : splitMessage(responseText, 2000);
      
      // Send first chunk as reply
      messageToEdit = await message.reply(chunks[0]);
      
      // Send remaining chunks as follow-up messages
      for (let i = 1; i < chunks.length; i++) {
        await message.channel.send(chunks[i]);
      }
      
    } catch (error) {
      logger.error('Streaming response callback failed', {
        userId: message.author.id,
        error: error.message
      });
    }
  };
  
  try {
    // Race condition prevention
    const userKey = `${message.author.id}-${message.guild?.id || 'dm'}`;
    const userMutex = raceConditionManager.getUserMutex(userKey);
    const release = await userMutex.acquire();
    
    try {
      const messageContext = buildMessageContext(message);
      
      // Generate with streaming callback
      const response = await geminiService.generateResponse(
        prompt,
        message.author.id,
        message.guild?.id,
        respondCallback, // Streaming enabled
        messageContext,
        message.member || undefined,
        message.guild || undefined
      );
      
      // Fallback if streaming didn't trigger
      if (!responseSent && response) {
        await respondCallback(response);
      }
      
    } finally {
      release();
    }
    
  } catch (error) {
    logger.error('Streaming message processing failed', {
      userId: message.author.id,
      error: error.message
    });
    
    if (!responseSent) {
      await message.reply('Sorry, I encountered an error processing your message.');
    }
  }
}
```

**Key Features:**
- Real-time response delivery
- Thinking mode support with specialized formatting
- Race condition prevention with user-specific mutexes
- Fallback handling if streaming fails

### 3. Multimodal Processing Integration

For handling text and image inputs together:

```typescript
async function processMultimodalMessage(
  message: Message,
  prompt: string
): Promise<void> {
  const supportedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const imageAttachments: Array<{
    url: string;
    mimeType: string;
    base64Data: string;
    filename?: string;
    size?: number;
  }> = [];
  
  try {
    // Process image attachments
    for (const attachment of message.attachments.values()) {
      if (attachment.contentType && supportedImageTypes.includes(attachment.contentType)) {
        // Validate file size (10MB limit)
        if (attachment.size && attachment.size > 10 * 1024 * 1024) {
          await message.reply('⚠️ Image too large. Please use images under 10MB.');
          return;
        }
        
        try {
          // Fetch and convert to base64
          const response = await fetch(attachment.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }
          
          const buffer = await response.arrayBuffer();
          const base64Data = Buffer.from(buffer).toString('base64');
          
          imageAttachments.push({
            url: attachment.url,
            mimeType: attachment.contentType,
            base64Data: base64Data,
            filename: attachment.name,
            size: attachment.size
          });
          
          logger.info('Image processed for multimodal request', {
            userId: message.author.id,
            filename: attachment.name,
            size: attachment.size,
            mimeType: attachment.contentType
          });
          
        } catch (error) {
          logger.error('Failed to process image attachment', {
            userId: message.author.id,
            attachmentUrl: attachment.url,
            error: error.message
          });
          await message.reply('⚠️ Failed to process one or more images. Please try again.');
          return;
        }
      }
    }
    
    if (imageAttachments.length === 0 && message.attachments.size > 0) {
      await message.reply('⚠️ No supported images found. Supported formats: JPEG, PNG, GIF, WebP');
      return;
    }
    
    // Enhanced prompt for vision processing
    const visionPrompt = imageAttachments.length > 0 
      ? `${prompt}\n\n[Image${imageAttachments.length > 1 ? 's' : ''} provided for analysis]`
      : prompt;
    
    const messageContext = buildMessageContext(message);
    
    // Streaming callback for multimodal responses
    const respondCallback = async (responseText: string) => {
      if (responseText) {
        const chunks = splitMessage(responseText, 2000);
        await message.reply(chunks[0]);
        
        for (let i = 1; i < chunks.length; i++) {
          await message.channel.send(chunks[i]);
        }
      }
    };
    
    // Generate multimodal response
    const response = await geminiService.generateResponse(
      visionPrompt,
      message.author.id,
      message.guild?.id,
      respondCallback,
      messageContext,
      message.member || undefined,
      message.guild || undefined,
      imageAttachments // Include processed images
    );
    
  } catch (error) {
    logger.error('Multimodal processing failed', {
      userId: message.author.id,
      imageCount: imageAttachments.length,
      error: error.message
    });
    await message.reply('Sorry, I encountered an error processing your request with images.');
  }
}
```

**Key Features:**
- Comprehensive image validation and processing
- Base64 encoding with metadata preservation
- Enhanced prompting for vision models
- Error handling for image processing failures

### 4. Error Handling and Graceful Degradation

Robust error handling with circuit breaker integration:

```typescript
async function processMessageWithDegradation(
  message: Message,
  prompt: string
): Promise<void> {
  try {
    // Check degradation status first
    const degradationStatus = await gracefulDegradation.shouldDegrade();
    
    if (degradationStatus.shouldDegrade) {
      logger.info('Service degraded, queueing message', {
        userId: message.author.id,
        severity: degradationStatus.currentSeverity
      });
      
      // Queue message for later processing
      await gracefulDegradation.queueMessage(
        message.author.id,
        prompt,
        async (response: string) => {
          const chunks = splitMessage(response, 2000);
          await message.reply(`⏳ *[Processed from queue]* ${chunks[0]}`);
          
          for (let i = 1; i < chunks.length; i++) {
            await message.channel.send(chunks[i]);
          }
        },
        message.guild?.id,
        'medium' // Priority level
      );
      
      await message.reply('⏳ System is experiencing high load. Your message has been queued and will be processed shortly.');
      return;
    }
    
    // Circuit breaker protection
    const response = await gracefulDegradation.executeWithCircuitBreaker(
      async () => {
        const messageContext = buildMessageContext(message);
        return await geminiService.generateResponse(
          prompt,
          message.author.id,
          message.guild?.id,
          undefined,
          messageContext,
          message.member || undefined,
          message.guild || undefined
        );
      },
      'gemini' // Service identifier
    );
    
    const chunks = splitMessage(response, 2000);
    await message.reply(chunks[0]);
    
    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send(chunks[i]);
    }
    
  } catch (error) {
    logger.error('Message processing failed with degradation handling', {
      userId: message.author.id,
      error: error.message
    });
    
    // Generate fallback response
    try {
      const fallbackResponse = await gracefulDegradation.generateFallbackResponse(
        prompt,
        message.author.id,
        message.guild?.id
      );
      
      await message.reply(`⚠️ *[Fallback Response]* ${fallbackResponse}`);
      
    } catch (fallbackError) {
      logger.error('Fallback response generation failed', {
        userId: message.author.id,
        error: fallbackError.message
      });
      
      await message.reply('Sorry, I\'m temporarily unavailable. Please try again in a few minutes.');
    }
  }
}
```

**Key Features:**
- Proactive degradation detection
- Message queueing during high load
- Circuit breaker protection
- Multi-level fallback mechanisms

### 5. Retry Logic Integration

Implementing exponential backoff for resilient processing:

```typescript
async function processMessageWithRetry(
  message: Message,
  prompt: string
): Promise<void> {
  const retryConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    retryMultiplier: 2.0,
    maxRetryDelay: 10000
  };
  
  try {
    const response = await retryHandler.executeWithRetry(
      async () => {
        const messageContext = buildMessageContext(message);
        return await geminiService.generateResponse(
          prompt,
          message.author.id,
          message.guild?.id,
          undefined,
          messageContext,
          message.member || undefined,
          message.guild || undefined
        );
      },
      retryConfig,
      (error: Error) => {
        // Determine if error is retryable
        return retryHandler.isRetryableError(error) && 
               !error.message.includes('quota') && 
               !error.message.includes('rate limit');
      }
    );
    
    const chunks = splitMessage(response, 2000);
    await message.reply(chunks[0]);
    
    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send(chunks[i]);
    }
    
  } catch (error) {
    logger.error('Message processing failed after retries', {
      userId: message.author.id,
      maxRetries: retryConfig.maxRetries,
      error: error.message
    });
    
    await message.reply('Sorry, I encountered persistent issues processing your message. Please try again later.');
  }
}
```

**Key Features:**
- Configurable retry logic
- Intelligent retry condition checking
- Exponential backoff with jitter
- Quota-aware retry decisions

## Advanced Integration Patterns

### 1. Context-Aware Response Processing

Leveraging rich context for enhanced responses:

```typescript
async function processContextAwareMessage(
  message: Message,
  prompt: string
): Promise<void> {
  try {
    // Build comprehensive context
    const messageContext = buildEnhancedMessageContext(message);
    
    // Add recent emoji usage for personality
    const recentEmojis = await getRecentChannelEmojis(message.channel, 50);
    if (recentEmojis.length > 0) {
      messageContext.channelMetadata = {
        ...messageContext.channelMetadata,
        recentEmojis: recentEmojis.slice(0, 10)
      };
    }
    
    // Add user interaction history
    const userHistory = await getUserRecentActivity(message.author.id, message.guild?.id);
    messageContext.userMetadata = {
      ...messageContext.userMetadata,
      recentActivity: userHistory
    };
    
    // Generate context-enhanced response
    const response = await geminiService.generateResponse(
      prompt,
      message.author.id,
      message.guild?.id,
      undefined,
      messageContext,
      message.member || undefined,
      message.guild || undefined
    );
    
    // Post-process response based on context
    const enhancedResponse = await enhanceResponseWithContext(response, messageContext);
    
    const chunks = splitMessage(enhancedResponse, 2000);
    await message.reply(chunks[0]);
    
    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send(chunks[i]);
    }
    
  } catch (error) {
    logger.error('Context-aware processing failed', {
      userId: message.author.id,
      error: error.message
    });
    await message.reply('Sorry, I encountered an error processing your message.');
  }
}

function buildEnhancedMessageContext(message: Message): MessageContext {
  return {
    channelId: message.channel.id,
    channelName: message.channel.type === ChannelType.GuildText ? message.channel.name : 'DM',
    channelType: message.channel.type,
    isThread: message.channel.isThread(),
    threadName: message.channel.isThread() ? message.channel.name : undefined,
    guildId: message.guild?.id,
    guildName: message.guild?.name,
    memberCount: message.guild?.memberCount,
    channelMetadata: {
      pinnedMessageCount: message.channel.type === ChannelType.GuildText ? 
        (message.channel as TextChannel).messages.cache.filter(m => m.pinned).size : 0,
      messageHistory: [], // Populated by context manager
      recentEmojis: [] // Will be populated above
    },
    userMetadata: {
      joinedAt: message.member?.joinedAt?.toISOString(),
      roles: message.member?.roles.cache.map(role => role.name) || [],
      isNewUser: message.member ? 
        (Date.now() - (message.member.joinedAt?.getTime() || 0)) < 7 * 24 * 60 * 60 * 1000 : false
    }
  };
}
```

### 2. Performance-Optimized Processing

Implementing caching and optimization strategies:

```typescript
async function processOptimizedMessage(
  message: Message,
  prompt: string
): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cacheKey = generateCacheKey(prompt, message.author.id, message.guild?.id);
    const cachedResponse = await cacheManager.get(cacheKey);
    
    if (cachedResponse) {
      logger.info('Cache hit for message processing', {
        userId: message.author.id,
        cacheKey,
        cacheAge: Date.now() - cachedResponse.timestamp
      });
      
      await message.reply(`🔄 *[Cached Response]* ${cachedResponse.content}`);
      return;
    }
    
    // Optimize context building
    const messageContext = await buildOptimizedMessageContext(message);
    
    // Use streaming for long responses
    let responseReceived = false;
    const respondCallback = async (responseText: string) => {
      if (responseText && !responseReceived) {
        responseReceived = true;
        
        // Cache successful response
        await cacheManager.set(cacheKey, {
          content: responseText,
          timestamp: Date.now(),
          userId: message.author.id
        }, 3600); // 1 hour TTL
        
        const chunks = splitMessage(responseText, 2000);
        await message.reply(chunks[0]);
        
        for (let i = 1; i < chunks.length; i++) {
          await message.channel.send(chunks[i]);
        }
      }
    };
    
    // Generate with optimization
    const response = await geminiService.generateResponse(
      prompt,
      message.author.id,
      message.guild?.id,
      respondCallback,
      messageContext,
      message.member || undefined,
      message.guild || undefined
    );
    
    // Fallback if streaming didn't work
    if (!responseReceived && response) {
      await respondCallback(response);
    }
    
    // Track performance
    const processingTime = Date.now() - startTime;
    await analyticsManager.trackPerformance('message_processing', processingTime, {
      userId: message.author.id,
      promptLength: prompt.length,
      cached: false
    });
    
  } catch (error) {
    logger.error('Optimized processing failed', {
      userId: message.author.id,
      processingTime: Date.now() - startTime,
      error: error.message
    });
    await message.reply('Sorry, I encountered an error processing your message.');
  }
}

function generateCacheKey(prompt: string, userId: string, serverId?: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${prompt}:${userId}:${serverId || 'dm'}`);
  return `response:${hash.digest('hex').substring(0, 16)}`;
}

async function buildOptimizedMessageContext(message: Message): Promise<MessageContext> {
  // Parallel context building for better performance
  const [channelMetadata, userMetadata] = await Promise.all([
    buildChannelMetadata(message.channel),
    buildUserMetadata(message.member)
  ]);
  
  return {
    channelId: message.channel.id,
    channelName: message.channel.type === ChannelType.GuildText ? message.channel.name : 'DM',
    channelType: message.channel.type,
    isThread: message.channel.isThread(),
    threadName: message.channel.isThread() ? message.channel.name : undefined,
    guildId: message.guild?.id,
    guildName: message.guild?.name,
    memberCount: message.guild?.memberCount,
    channelMetadata,
    userMetadata
  };
}
```

## Integration Best Practices

### 1. Error Handling

Always implement comprehensive error handling:

```typescript
// Use structured error handling
try {
  const response = await geminiService.generateResponse(...);
  await handleResponse(response);
} catch (error) {
  if (error instanceof RateLimitError) {
    await handleRateLimitError(error, message);
  } else if (error instanceof ValidationError) {
    await handleValidationError(error, message);
  } else {
    await handleGenericError(error, message);
  }
}
```

### 2. Resource Management

Implement proper resource cleanup:

```typescript
// Use try-finally for resource cleanup
const userMutex = raceConditionManager.getUserMutex(userKey);
const release = await userMutex.acquire();
try {
  // Process message
} finally {
  release(); // Always release mutex
}
```

### 3. Monitoring and Analytics

Track performance and usage:

```typescript
// Track all operations for monitoring
const startTime = Date.now();
try {
  const response = await geminiService.generateResponse(...);
  await analyticsManager.trackSuccess('message_processing', Date.now() - startTime);
} catch (error) {
  await analyticsManager.trackError('message_processing', error, Date.now() - startTime);
}
```

### 4. Configuration Management

Use configuration-driven behavior:

```typescript
// Respect configuration settings
const config = await configurationManager.getConfiguration();
if (!config.features.multimodal.enabled && imageAttachments.length > 0) {
  await message.reply('Image processing is currently disabled.');
  return;
}
```

## Testing Integration

### Unit Testing

```typescript
describe('Response Processing Integration', () => {
  let mockGeminiService: jest.Mocked<IAIService>;
  
  beforeEach(() => {
    mockGeminiService = {
      generateResponse: jest.fn(),
      // ... other methods
    } as jest.Mocked<IAIService>;
  });
  
  test('should handle standard message processing', async () => {
    mockGeminiService.generateResponse.mockResolvedValue('Test response');
    
    const mockMessage = createMockMessage();
    await processStandardMessage(mockMessage, 'Test prompt');
    
    expect(mockGeminiService.generateResponse).toHaveBeenCalledWith(
      'Test prompt',
      mockMessage.author.id,
      mockMessage.guild?.id,
      undefined,
      expect.any(Object),
      mockMessage.member,
      mockMessage.guild
    );
  });
});
```

### Integration Testing

```typescript
describe('End-to-End Response Processing', () => {
  test('should process message with full pipeline', async () => {
    const testBot = await createTestBot();
    const mockMessage = createMockMessage('How do I use async/await?');
    
    await testBot.handleMessage(mockMessage);
    
    expect(mockMessage.reply).toHaveBeenCalled();
    expect(mockMessage.reply.mock.calls[0][0]).toContain('async/await');
  });
});
```

This comprehensive guide provides all the necessary patterns and examples for successful integration with the GeminiService response processing system.