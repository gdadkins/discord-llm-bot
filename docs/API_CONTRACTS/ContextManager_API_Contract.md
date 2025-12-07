# ContextManager API Contract Documentation

**Version:** Phase 1, Week 2 Refactoring Contract  
**File:** `/mnt/c/github/discord/discord-llm-bot/src/services/contextManager.ts`  
**Purpose:** Contract specification for ContextManager refactoring to ensure no API regressions  
**Created:** 2025-07-27

---

## Overview

The `ContextManager` service is a core component responsible for orchestrating context building and management in the Discord LLM bot. It implements the `IContextManager` interface and extends `BaseService`, providing comprehensive memory management, social dynamics tracking, and multi-server context capabilities.

## Critical Dependencies

### External Dependencies
- **discord.js:** `GuildMember`, `Guild` interfaces
- **utils/logger:** Centralized logging system
- **utils/PromisePool:** `globalPools.context` for async task management

### Internal Service Dependencies
- **BaseService:** Core service lifecycle and health monitoring
- **BehaviorAnalyzer:** Message behavior analysis and pattern recognition
- **ConversationMemoryService:** Core memory operations and storage
- **ChannelContextService:** Server culture and channel context management
- **SocialDynamicsService:** User interaction tracking and social graph management
- **MemoryOptimizationService:** Context compression and deduplication
- **ContextCacheManager:** Performance optimization and caching
- **Builder Services:**
  - `ConversationContextBuilder`
  - `ServerContextBuilder` 
  - `UserContextBuilder`
  - `CompositeContextBuilder` (legacy support)

---

## Public API Contract

### Core Interface Implementation: `IContextManager`

#### Server Context Management

```typescript
// Initialize server context storage
initializeServerContext(serverId: string): void
```
**Contract Requirements:**
- MUST be idempotent (safe to call multiple times)
- SHOULD create empty RichContext structure if not exists
- MUST apply server-specific retention policies
- MUST log initialization activity

```typescript
// Retrieve server context data
getServerContext(serverId: string): ServerContext | undefined
```
**Contract Requirements:**
- MUST return undefined for uninitialized servers
- SHOULD apply automatic compression if needed
- MUST respect user privacy settings
- MUST convert internal RichContext to external ServerContext format

```typescript
// Get server context size in bytes
getServerContextSize(serverId: string): number
```
**Contract Requirements:**
- MUST return 0 for non-existent servers
- SHOULD use cached approximateSize for performance
- MUST reflect current memory usage accurately

#### Content Addition Methods

```typescript
// Add embarrassing moment for comedy context
addEmbarrassingMoment(serverId: string, userId: string, moment: string): void
```
**Contract Requirements:**
- MUST validate input for appropriate content
- SHOULD deduplicate similar moments using semantic hashing
- MUST respect user privacy settings
- SHOULD limit storage per user to prevent abuse
- MUST update context size and trigger intelligent trimming

```typescript
// Store code snippet for future reference
addCodeSnippet(serverId: string, userId: string, userMessage: string, code: string): void
```
**Contract Requirements:**
- MUST sanitize code for security
- SHOULD detect and prevent semantic duplicates
- MUST limit snippet size and count per user
- SHOULD provide search capabilities via semantic hash
- MUST associate with user message context

```typescript
// Add running gag for server culture
addRunningGag(serverId: string, gag: string): void
```
**Contract Requirements:**
- MUST validate for appropriate content
- SHOULD prevent duplicate gags using semantic analysis
- MUST limit total gags per server (respects memory limits)
- SHOULD provide moderation capabilities
- MUST trigger intelligent trimming when limits exceeded

```typescript
// Store summarized fact with importance weighting
addSummarizedFact(serverId: string, fact: string, importance: number = 5): void
```
**Contract Requirements:**
- MUST validate fact content and length
- SHOULD merge similar facts automatically using semantic hashing
- MUST apply importance-based retention (0-10 scale)
- SHOULD track fact usage for relevance scoring
- MUST prevent duplicate facts

#### Context Building Methods

```typescript
// Build comprehensive context from all available data
buildSuperContext(serverId: string, userId: string, maxLength?: number): string
```
**Contract Requirements:**
- MUST prioritize recent and important information
- SHOULD balance user-specific and server-wide context
- MUST respect maxLength parameter strictly (truncate with "...")
- SHOULD include relevance scoring
- MUST use caching for performance optimization
- SHOULD delegate to specialized builders for modularity

**Context Prioritization Order:**
1. Recent embarrassing moments and interactions
2. Relevant code snippets and technical discussions  
3. Server running gags and culture
4. Important summarized facts
5. Cross-server insights (if enabled)

```typescript
// Build server culture context from Discord metadata
buildServerCultureContext(guild: Guild): string
```
**Contract Requirements:**
- MUST extract server name, description, and rules
- SHOULD include channel structure and topics
- MUST respect privacy settings for member data
- SHOULD cache results for performance (via ServerContextBuilder)

```typescript
// Build smart context using AI-powered relevance scoring  
buildSmartContext(serverId: string, userId: string, currentMessage: string): string
```
**Contract Requirements:**
- MUST analyze current message for context relevance
- SHOULD prioritize contextually relevant information
- MUST maintain performance (< 100ms typical)
- SHOULD adapt context based on conversation flow
- MUST include keyword analysis for code context detection

#### Enhanced Builder Access Methods

```typescript
// Get specialized builders for advanced usage
getConversationBuilder(): ConversationContextBuilder
getServerBuilder(): ServerContextBuilder  
getUserBuilder(): UserContextBuilder
getCacheManager(): ContextCacheManager
```
**Contract Requirements:**
- MUST return fully initialized builder instances
- SHOULD maintain builder state consistency
- MUST provide access to all builder capabilities

```typescript
// Build enhanced conversation context
buildConversationContext(
  serverId: string, 
  userId: string, 
  options?: ConversationContextOptions
): string
```

```typescript
// Build enhanced user context with personality mapping
buildUserContext(
  serverId: string,
  userId: string, 
  member?: GuildMember,
  options?: UserContextOptions
): string
```
**Contract Requirements:**
- MUST delegate to specialized builders
- SHOULD apply options validation and defaults
- MUST handle missing context gracefully (return empty string)

#### Bulk Operations

```typescript
// Bulk summarization and compression
summarizeAndCompress(serverId: string): Promise<{ removed: number; kept: number }>
```
**Contract Requirements:**
- MUST perform complete summarization cycle
- SHOULD return accurate before/after item counts
- MUST update compression ratio and statistics
- SHOULD log operation results for monitoring

```typescript
// Manual deduplication of server context
deduplicateServerContext(serverId: string): { removed: number; duplicates: string[] }
```
**Contract Requirements:**
- MUST remove semantic duplicates across all content types
- SHOULD return count of removed items
- MUST maintain data integrity during deduplication
- SHOULD preserve most recent/important duplicates

#### Cross-Server Operations

```typescript
// Global context management
isGlobalContextEnabled(): boolean
enableGlobalContext(): void
disableGlobalContext(): void
```
**Contract Requirements:**
- MUST maintain global state consistency
- SHOULD log state changes for auditing
- MUST apply privacy compliance for cross-server features

```typescript
// Cross-server insights for user
getCrossServerInsights(userId: string): CrossServerInsights
```
**Contract Requirements:**
- MUST respect privacy settings (crossServerEnabled flag)
- SHOULD exclude current server from results
- MUST limit content exposure (2 moments, 1 code snippet per server)
- SHOULD provide meaningful pattern analysis

```typescript
// Enable cross-server context for specific server
enableCrossServerContext(userId: string, serverId: string, enabled: boolean): void
```
**Contract Requirements:**
- MUST update server context crossServerEnabled flag
- SHOULD log privacy setting changes
- MUST respect user consent requirements

#### Memory Management

```typescript
// Get comprehensive memory statistics
getMemoryStats(): MemoryStats
```
**Contract Requirements:**
- MUST provide accurate memory usage statistics
- SHOULD use cached approximateSize for performance
- MUST include item counts and compression statistics
- SHOULD calculate memory savings from compression

```typescript
// Get server-specific compression statistics
getServerCompressionStats(serverId: string): { compressionRatio: number; memorySaved: number } | null
```
**Contract Requirements:**
- MUST return null for non-existent servers
- SHOULD provide accurate compression metrics
- MUST calculate memory savings correctly

```typescript
// Force immediate summarization
summarizeServerContextNow(serverId: string): boolean
```
**Contract Requirements:**
- MUST return false for non-existent servers
- SHOULD perform immediate context summarization
- MUST update lastSummarization timestamp

#### Social Dynamics

```typescript
// Update social interaction graph
updateSocialGraph(
  serverId: string,
  userId: string, 
  targetUserId: string,
  interactionType: 'mention' | 'reply' | 'roast'
): void
```
**Contract Requirements:**
- MUST track interaction types accurately
- SHOULD update interaction counts and timestamps
- MUST maintain social graph data structure integrity

```typescript
// Get top user interactions
getTopInteractions(
  serverId: string,
  userId: string,
  limit: number = 5
): Array<{ userId: string; count: number; type: string }>
```
**Contract Requirements:**
- MUST return empty array for non-existent servers
- SHOULD sort by interaction frequency
- MUST respect limit parameter
- SHOULD include interaction type metadata

```typescript
// Get recent interactions for context
getRecentInteractions(
  serverId: string,
  userId: string, 
  hoursAgo: number = 24
): string[]
```
**Contract Requirements:**
- MUST filter by time window accurately
- SHOULD return formatted interaction strings
- MUST handle timezone considerations
- SHOULD provide meaningful context descriptions

#### Behavioral Analysis

```typescript
// Analyze message for behavioral patterns (async, non-blocking)
analyzeMessageBehavior(userId: string, message: string): Promise<void>
```
**Contract Requirements:**
- MUST use promise pool for non-critical background analysis
- SHOULD handle analysis failures gracefully (log only)
- MUST not block primary execution flow
- SHOULD update user behavior patterns

```typescript
// Get user behavioral pattern
getBehaviorPattern(userId: string): UserBehaviorPattern | null
```
**Contract Requirements:**
- MUST return null for unknown users
- SHOULD provide current behavior analysis
- MUST include pattern confidence scores

```typescript
// Get behavioral analysis statistics
getBehaviorStats(): {
  totalUsers: number;
  activePatterns: number; 
  stalePatterns: number;
  averageComplexity: number;
  averageFrequency: number;
}
```
**Contract Requirements:**
- MUST provide accurate aggregate statistics
- SHOULD include performance metrics
- MUST handle empty state gracefully

#### Legacy/Deprecated Methods

```typescript
// Deprecated: User context has been removed
cleanupDiscordCache(maxAge?: number): number
buildDiscordUserContext(member: GuildMember, includeServerData: boolean = false): string
```
**Contract Requirements:**
- MUST return safe default values (0, empty string)
- SHOULD log deprecation warnings if used
- MUST not throw errors for backward compatibility

#### Utility Methods

```typescript
// Get importance threshold for server (stub implementation)
getImportanceThreshold(serverId: string): number
```
**Contract Requirements:**
- MUST return consistent default value (5)
- SHOULD provide stable threshold for fact importance

---

## Interface Definitions

### Core Data Structures

#### ContextItem
```typescript
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

#### RichContext (Internal)
```typescript
interface RichContext {
  conversations: Map<string, string[]>;
  codeSnippets: Map<string, ContextItem[]>;
  embarrassingMoments: ContextItem[];
  runningGags: ContextItem[];
  lastRoasted: Map<string, Date>;
  approximateSize: number;
  lastSizeUpdate: number;
  summarizedFacts: ContextItem[];
  crossServerEnabled: boolean;
  compressionRatio: number;
  lastSummarization: number;
  socialGraph: Map<string, SocialGraph>;
}
```

#### ServerContext (External Interface)
```typescript
interface ServerContext {
  serverId: string;
  embarrassingMoments: Map<string, string[]>;
  codeSnippets: Map<string, CodeSnippet[]>;
  runningGags: string[];
  summarizedFacts: SummarizedFact[];
  lastSummarized: number;
  compressionStats: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
}
```

#### Builder Options

```typescript
interface ConversationContextOptions {
  maxMessages?: number;           // Default: 10
  includeCodeContext?: boolean;   // Default: false
  relevanceThreshold?: number;    // Default: 0.5
  timeWindow?: number;           // Default: 24 hours
}

interface ServerContextOptions {
  includeChannels?: boolean;      // Default: false
  includeRoles?: boolean;        // Default: false  
  includeCulture?: boolean;      // Default: false
  includeRunningGags?: boolean;  // Default: false
  maxItems?: number;             // Default: 10
}

interface UserContextOptions {
  includeBehavior?: boolean;         // Default: false
  includeInteractions?: boolean;     // Default: false
  includePersonality?: boolean;      // Default: false
  includeEmbarrassingMoments?: boolean; // Default: false
  includeCodeHistory?: boolean;      // Default: false
  maxItems?: number;                 // Default: 10
  timeWindow?: number;               // Default: 168 hours (1 week)
}
```

#### Supporting Types

```typescript
interface SocialGraph {
  interactions: Map<string, number>;
  mentions: Map<string, number>;
  roasts: Map<string, number>;
  lastInteraction: Map<string, Date>;
}

interface ServerCulture {
  guildId: string;
  popularEmojis: Array<{emoji: string, count: number}>;
  activeVoiceChannels: string[];
  recentEvents: Array<{name: string, date: Date}>;
  boostLevel: number;
  topChannels: Array<{name: string, messageCount: number}>;
  preferredLocale: string;
  cachedAt: number;
  ttl: number;
}

interface CrossServerInsights {
  userId: string;
  globalPatterns: string[];
  serverCount: number;
  mostActiveServer?: string;
  totalInteractions: number;
}

interface MemoryStats {
  totalServers: number;
  totalMemoryUsage: number;
  averageServerSize: number;
  largestServerSize: number;
  itemCounts: {
    embarrassingMoments: number;
    codeSnippets: number;
    runningGags: number;
    summarizedFacts: number;
  };
  compressionStats: {
    averageCompressionRatio: number;
    totalMemorySaved: number;
    duplicatesRemoved: number;
  };
}
```

---

## Performance Characteristics

### Memory Management
- **Memory Thresholds:** Warning: 400MB, Critical: 500MB
- **Cache Configuration:** TTL: 5 minutes, Max Entries: 1000
- **Background Intervals:**
  - Memory Check: 5 minutes
  - Summarization: 30 minutes  
  - Stale Data Cleanup: 1 hour
  - Memory Monitoring: 30 seconds

### Context Building Performance
- **Super Context:** Uses multi-level caching with hash validation
- **Smart Context:** < 100ms typical response time
- **Server Culture:** 1-hour cache TTL for expensive Discord API calls

### Memory Optimization
- **Compression Ratio:** Tracks 30-70% memory reduction via intelligent summarization
- **Stale Data:** Automatic cleanup of data older than 30 days
- **Deduplication:** Semantic hash-based duplicate detection and removal

---

## Contract Testing Requirements

To ensure no regressions during Phase 1, Week 2 refactoring, contract tests MUST verify:

### 1. **API Surface Stability**
- All public methods maintain exact signatures
- Return types remain consistent with interface contracts
- Optional parameters preserve default behavior

### 2. **Behavioral Contracts**
- Content addition methods properly deduplicate and validate
- Context building methods respect length limits and prioritization
- Memory management maintains performance thresholds
- Cross-server operations respect privacy settings

### 3. **State Management**
- Server context initialization remains idempotent
- Builder state consistency across multiple calls
- Cache invalidation triggers properly

### 4. **Error Handling**
- Deprecated methods return safe defaults without throwing
- Missing server contexts handled gracefully
- Background task failures logged but don't crash service

### 5. **Performance Guarantees**
- Context building operations maintain sub-100ms response times
- Memory usage stays within configured thresholds
- Cache hit rates maintain acceptable performance levels

### 6. **Integration Points**
- BaseService lifecycle integration remains functional
- Promise pool utilization for background tasks
- Logger integration maintains proper log levels

### 7. **Data Structure Integrity**
- Internal RichContext to external ServerContext conversion accuracy
- Social graph updates maintain referential integrity
- Compression statistics calculation correctness

### 8. **Builder Pattern Consistency**
- All specialized builders remain accessible via getter methods
- Builder options validation and default application
- Legacy composite builder backward compatibility

### 9. **Memory Management Contracts**
- Automatic cleanup schedules maintain configured intervals
- Compression ratios accurately reflect memory savings
- Stale data removal respects configured retention periods

### 10. **Cross-Server Privacy Compliance**
- Privacy flags properly control data sharing
- Content exposure limits enforced consistently
- User consent mechanisms function correctly

---

## Notes for Refactoring

- **Critical:** Maintain all existing public method signatures
- **Important:** Preserve caching behavior and performance characteristics  
- **Required:** Keep all interface implementations complete and functional
- **Essential:** Maintain backward compatibility for deprecated methods
- **Mandatory:** Preserve existing error handling and logging patterns

This contract serves as the definitive reference for ensuring zero regression during the ContextManager refactoring process.