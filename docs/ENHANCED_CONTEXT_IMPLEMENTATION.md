# Enhanced Context Implementation Guide

## Overview

This document outlines the implementation of enhanced context features for the Discord LLM bot to improve response quality, personalization, and contextual awareness. The bot currently uses Gemini AI with a sophisticated memory system, and these enhancements will build upon the existing architecture.

## Current State Analysis

### Existing Context System
- **Location**: `src/services/contextManager.ts`
- **Current Context**: User personality, conversation history, server-wide super context, running gags, hall of shame
- **API Integration**: `src/services/gemini.ts` builds prompts with available context
- **Memory Management**: Circular buffer with 1M token limit, LRU trimming, semantic deduplication

### Integration Points
- **Gemini Service**: `src/services/gemini.ts` - Line 193-287 where prompts are constructed
- **Message Handler**: `src/commands/index.ts` - Lines 11-65 where messages are processed
- **Context Manager**: `src/services/contextManager.ts` - Existing memory system

## Implementation Tasks

### 1. Discord-Specific User Context Enhancement

**Priority**: HIGH  
**Files to Modify**: 
- `src/services/gemini.ts`
- `src/services/contextManager.ts`

**Implementation Details**:
```typescript
// Add to contextManager.ts
interface DiscordUserContext {
  userId: string;
  username: string;
  displayName: string;
  roles: string[];
  joinedAt: Date;
  accountAge: number;
  nitroStatus: number;
  currentStatus: string;
  voiceChannel: string | null;
}

// Method to build Discord-specific context
async buildDiscordUserContext(member: GuildMember): Promise<string> {
  const context = {
    userId: member.id,
    username: member.user.username,
    displayName: member.displayName,
    roles: member.roles.cache.map(r => r.name).filter(r => r !== '@everyone'),
    joinedAt: member.joinedTimestamp,
    accountAge: Date.now() - member.user.createdTimestamp,
    nitroStatus: member.user.premiumType || 0,
    currentStatus: member.presence?.status || 'offline',
    voiceChannel: member.voice?.channel?.name || null
  };
  
  return `Discord Profile: ${context.username} (${context.displayName})
Roles: ${context.roles.join(', ') || 'none'}
Server Member Since: ${new Date(context.joinedAt).toLocaleDateString()}
Account Age: ${Math.floor(context.accountAge / (1000 * 60 * 60 * 24))} days
Nitro: ${context.nitroStatus > 0 ? 'Yes' : 'No'}
Status: ${context.currentStatus}${context.voiceChannel ? ` (in voice: ${context.voiceChannel})` : ''}`;
}
```

**Integration Point**: Modify `gemini.ts` line 212 to include Discord user context in prompt construction.

### 2. Message & Channel Context Enrichment

**Priority**: HIGH  
**Files to Modify**:
- `src/commands/index.ts`
- `src/services/gemini.ts`

**Implementation Details**:
```typescript
// Add to message processing in index.ts
interface MessageContext {
  channelName: string;
  channelType: string;
  isThread: boolean;
  threadName?: string;
  lastActivity: Date;
  pinnedCount: number;
  attachments: string[];
  recentEmojis: string[];
}

// Build message context before calling generateResponse
const messageContext = {
  channelName: message.channel.name,
  channelType: message.channel.type,
  isThread: message.channel.isThread(),
  threadName: message.channel.isThread() ? message.channel.name : undefined,
  lastActivity: message.channel.lastMessageAt,
  pinnedCount: await message.channel.messages.fetchPinned().then(pins => pins.size),
  attachments: message.attachments.map(a => a.contentType || 'unknown'),
  recentEmojis: extractRecentEmojis(message.channel) // implement emoji extraction
};
```

**Integration Point**: Pass messageContext to generateResponse method and include in prompt.

### 3. Social Dynamics Tracking

**Priority**: MEDIUM  
**Files to Modify**:
- `src/services/contextManager.ts` (new methods)
- `src/events/messageCreate.ts` (create if not exists)

**Implementation Details**:
```typescript
// Add to contextManager.ts
interface SocialGraph {
  userId: string;
  interactions: Map<string, number>; // targetUserId -> interaction count
  recentMentions: string[];
  replyChains: number[];
  roastHistory: Array<{target: string, timestamp: number}>;
}

// Track social interactions
async updateSocialGraph(userId: string, targetUserId: string, interactionType: 'mention' | 'reply' | 'roast') {
  const graph = await this.getSocialGraph(userId);
  graph.interactions.set(targetUserId, (graph.interactions.get(targetUserId) || 0) + 1);
  
  if (interactionType === 'roast') {
    graph.roastHistory.push({target: targetUserId, timestamp: Date.now()});
  }
  
  await this.saveSocialGraph(userId, graph);
}

// Get top conversation partners
async getTopInteractions(userId: string, limit: number = 5): Promise<string[]> {
  const graph = await this.getSocialGraph(userId);
  return Array.from(graph.interactions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([userId]) => userId);
}
```

### 4. Server Culture & Activity Context

**Priority**: MEDIUM  
**Files to Modify**:
- `src/services/contextManager.ts`
- `src/services/gemini.ts`

**Implementation Details**:
```typescript
// Add server-level context tracking
interface ServerCulture {
  guildId: string;
  popularEmojis: Array<{emoji: string, count: number}>;
  activeVoiceChannels: string[];
  recentEvents: Array<{name: string, date: Date}>;
  boostLevel: number;
  topChannels: Array<{name: string, messageCount: number}>;
  preferredLocale: string;
}

// Method to build server culture context
async buildServerCultureContext(guild: Guild): Promise<string> {
  const culture = await this.getServerCulture(guild.id);
  
  return `Server Culture:
Popular Emojis: ${culture.popularEmojis.slice(0, 5).map(e => e.emoji).join(' ')}
Active Voice: ${culture.activeVoiceChannels.length} channels
Recent Events: ${culture.recentEvents.slice(0, 3).map(e => e.name).join(', ')}
Boost Level: ${culture.boostLevel}
Top Channels: ${culture.topChannels.slice(0, 3).map(c => `#${c.name}`).join(', ')}
Language: ${culture.preferredLocale}`;
}
```

### 5. Behavioral Pattern Recognition

**Priority**: LOW  
**Files to Modify**:
- `src/services/contextManager.ts`
- Create `src/services/behaviorAnalyzer.ts`

**Implementation Details**:
```typescript
// New service: behaviorAnalyzer.ts
export class BehaviorAnalyzer {
  private patterns: Map<string, UserBehaviorPattern> = new Map();
  
  interface UserBehaviorPattern {
    userId: string;
    messageFrequency: number; // messages per hour
    favoriteTopics: string[];
    detectedLanguages: string[];
    commonMistakes: string[];
    complexityScore: number; // 0-10
    roastResistance: number; // 0-10
  }
  
  async analyzeMessage(userId: string, message: string) {
    const pattern = this.patterns.get(userId) || this.createNewPattern(userId);
    
    // Update message frequency
    pattern.messageFrequency = this.calculateMessageRate(userId);
    
    // Extract topics using keyword detection
    pattern.favoriteTopics = this.extractTopics(message, pattern.favoriteTopics);
    
    // Detect programming languages
    const languages = this.detectProgrammingLanguages(message);
    if (languages.length > 0) {
      pattern.detectedLanguages = [...new Set([...pattern.detectedLanguages, ...languages])];
    }
    
    // Update complexity score based on message length and vocabulary
    pattern.complexityScore = this.calculateComplexity(message);
    
    this.patterns.set(userId, pattern);
  }
}
```

### 6. Performance & System Context

**Priority**: HIGH  
**Files to Modify**:
- `src/services/gemini.ts`
- `src/services/rateLimiter.ts`

**Implementation Details**:
```typescript
// Add to gemini.ts generateResponse method
const systemContext = {
  queuePosition: this.messageQueue.length,
  apiQuota: {
    remaining: this.rateLimiter.getRemainingRequests(userId),
    limit: this.rateLimiter.getDailyLimit()
  },
  botLatency: this.client.ws.ping,
  memoryUsage: this.contextManager.getMemoryStats(),
  activeConversations: this.getActiveConversationCount(),
  rateLimitStatus: this.rateLimiter.getStatus(userId)
};

// Include in prompt when system is under load
if (systemContext.queuePosition > 5 || systemContext.apiQuota.remaining < 100) {
  promptParts.push(`System Status: Currently handling ${systemContext.queuePosition} requests. API quota: ${systemContext.apiQuota.remaining} remaining.`);
}
```

## Implementation Order

1. **Phase 1 - Core Context** (Week 1)
   - Discord-specific user context
   - Message & channel enrichment
   - Performance & system context

2. **Phase 2 - Social Features** (Week 2)
   - Social dynamics tracking
   - Server culture context
   - Cross-server intelligence enhancement

3. **Phase 3 - Advanced Analytics** (Week 3)
   - Behavioral pattern recognition
   - Temporal context
   - Advanced roasting intelligence

## Testing Strategy

### Unit Tests
- Test each context builder method independently
- Mock Discord.js objects for testing
- Verify context string formatting

### Integration Tests
- Test full prompt construction with all contexts
- Verify token count stays within limits
- Test performance impact

### Load Tests
- Measure context building performance
- Test memory usage with full contexts
- Verify caching effectiveness

## Performance Considerations

1. **Caching Strategy**:
   - Cache static Discord data (roles, server info) for 5 minutes
   - Cache user behavior patterns for 15 minutes
   - Use lazy loading for expensive context

2. **Token Budget**:
   - Monitor total context size
   - Implement dynamic context selection based on available tokens
   - Prioritize most relevant context for each query

3. **Database Optimization**:
   - Index frequently queried fields
   - Batch write operations
   - Implement connection pooling if using external DB

## Migration Notes

1. The existing context system is well-architected and should be extended, not replaced
2. New context should integrate seamlessly with existing prompt construction
3. Maintain backward compatibility with existing features
4. Test thoroughly with both roasting and helpful personalities

## Success Metrics

- Response relevance improvement (user feedback)
- Reduced context misunderstandings
- Increased roasting accuracy and humor
- Performance maintained under 2s response time
- Memory usage stays within limits

## Code Examples

### Example: Integrating Discord Context into Prompt

```typescript
// In gemini.ts, modify generateResponse method around line 212
async generateResponse(
  message: Message,
  userMessage: string,
  userId: string,
  userName: string,
  channelId: string,
  messageId: string
): Promise<{ response: string; debugInfo?: any }> {
  // ... existing code ...
  
  // Build enhanced context
  const discordContext = await this.contextManager.buildDiscordUserContext(message.member);
  const messageContext = this.buildMessageContext(message);
  const socialContext = await this.contextManager.getSocialContext(userId);
  
  // Include in prompt construction
  promptParts.push(`\n=== ENHANCED CONTEXT ===`);
  promptParts.push(discordContext);
  promptParts.push(messageContext);
  if (socialContext) {
    promptParts.push(socialContext);
  }
  
  // ... rest of existing prompt construction ...
}
```

### Example: Caching Implementation

```typescript
// Add to contextManager.ts
private contextCache: Map<string, { data: any, timestamp: number }> = new Map();
private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async getCachedContext(key: string, builder: () => Promise<any>): Promise<any> {
  const cached = this.contextCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
    return cached.data;
  }
  
  const data = await builder();
  this.contextCache.set(key, { data, timestamp: Date.now() });
  
  return data;
}
```

## Final Notes

This implementation enhances the bot's contextual awareness while maintaining the existing architecture's strengths. The modular approach allows for incremental deployment and testing. Each enhancement is designed to integrate smoothly with the current codebase without requiring major refactoring.

The enhanced context will significantly improve the bot's ability to:
- Provide more personalized and relevant responses
- Generate better roasts based on user history and patterns
- Understand and adapt to server culture
- Maintain awareness of system performance and limitations

Remember to update CLAUDE.md with any new patterns or best practices discovered during implementation.