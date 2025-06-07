# Memory Management Guide

## Overview

This guide covers memory management, storage strategies, and monitoring for the Discord LLM bot's context system.

## Storage Architecture

### In-Memory Storage
All context data is currently stored in memory using Maps and arrays. Data persists only during bot runtime.

### Data Categories

1. **Discord User Context** (~500B-2KB per user)
   - User profiles (roles, permissions, status)
   - Join dates and account age
   - Cached for 1 year (configurable)
   - Minimal storage impact

2. **Social Dynamics** (~1-2KB per active user)
   - Interaction graphs (mentions, replies, roasts)
   - Tracked relationships between users
   - Stored for 1 year

3. **Conversation History** (Variable, ~5-10KB per conversation)
   - Recent messages and responses
   - 30-day retention (higher storage cost)
   - Automatically compressed over time

4. **Server Context** (~10-50KB per server)
   - Embarrassing moments (max 60)
   - Running gags (max 30)
   - Code snippets (max 12 per user)
   - Summarized facts (max 50)

## Configuration

All retention and limits are configured in `src/config/contextConfig.ts`:

```typescript
// Example configuration
limits: {
  embarrassingMoments: 60,
  codeSnippetsPerUser: 12,
  runningGags: 30,
  summarizedFacts: 50,
  socialInteractionsPerUser: 100,
}

retention: {
  discordProfileCache: 365 * 24 * 60 * 60 * 1000,  // 1 year
  conversationHistory: 30 * 24 * 60 * 60 * 1000,   // 30 days
  socialDynamics: 365 * 24 * 60 * 60 * 1000,       // 1 year
  embarrassingMoments: 365 * 24 * 60 * 60 * 1000,  // 1 year
}
```

## Storage Monitoring

### Command Line Monitoring
Use `/analytics discord-storage` to view:
- Total storage size in MB
- Number of cached entries
- Oldest and newest entries
- Per-server breakdown
- Storage recommendations

### Programmatic Access
```typescript
const stats = contextManager.getDiscordDataStorageStats();
console.log(`Total Discord data: ${stats.estimatedSizeMB} MB`);
console.log(`Cache entries: ${stats.cacheEntries}`);
```

## Memory Management Strategies

### 1. Automatic Cleanup
- **LRU Eviction**: Least recently used items removed first
- **Age-based Cleanup**: Items older than retention period
- **Size-based Trimming**: When limits exceeded

### 2. Intelligent Compression
- **Semantic Deduplication**: Similar messages merged
- **Summarization**: Old conversations compressed to facts
- **Relevance Scoring**: Important items retained longer

### 3. Cache Management
```typescript
// Manual cleanup if needed
const removed = contextManager.cleanupDiscordCache();
console.log(`Cleaned up ${removed} old cache entries`);
```

## Storage Estimates

### Small Server (10-50 users)
- Discord profiles: ~25KB
- Social dynamics: ~50KB
- Conversations: ~200KB
- **Total: ~275KB**

### Medium Server (100-500 users)
- Discord profiles: ~500KB
- Social dynamics: ~1MB
- Conversations: ~2MB
- **Total: ~3.5MB**

### Large Server (1000+ users)
- Discord profiles: ~2MB
- Social dynamics: ~5MB
- Conversations: ~10MB
- **Total: ~17MB**

## Best Practices

### 1. Monitor Regularly
- Check storage weekly with `/analytics discord-storage`
- Set up alerts for high memory usage
- Review per-server breakdown for outliers

### 2. Tune Retention
- Adjust retention in `contextConfig.ts` based on usage
- Shorter retention for high-volume servers
- Longer retention for small, tight-knit communities

### 3. Optimize Limits
- Reduce limits if memory constrained
- Increase for better context quality
- Balance between memory and user experience

### 4. Future Considerations
- Implement Redis for persistence
- Add database backend for large scale
- Consider tiered storage (hot/warm/cold)

## Troubleshooting

### High Memory Usage
1. Check `/analytics discord-storage`
2. Identify servers with high usage
3. Reduce retention or limits
4. Run manual cleanup if needed

### Missing Context
1. Verify cache hasn't been cleared
2. Check retention settings
3. Ensure user has recent activity
4. Review relevance scoring

### Performance Issues
1. Monitor memory check intervals
2. Adjust compression ratios
3. Review deduplication threshold
4. Consider reducing cache size

## Future Enhancements

1. **Persistent Storage**
   - Redis integration for cache persistence
   - SQLite for long-term storage
   - S3 for conversation archives

2. **Advanced Analytics**
   - Memory usage trends
   - Growth projections
   - Optimization recommendations

3. **Intelligent Archiving**
   - Automatic archival of old data
   - Restoration on demand
   - Compressed storage formats