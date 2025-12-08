# Context Management

Conversation context, memory management, and context optimization.

## Overview

The bot maintains contextual memory at three levels:
1. **User Context**: Profile, roles, permissions, status
2. **Channel Context**: Metadata, threads, pinned messages
3. **Social Dynamics**: Interaction graphs, relationship patterns

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTEXT_TIMEOUT_MINUTES` | `60` | Context retention time |
| `CONTEXT_MAX_MESSAGES` | `100` | Max messages per context |
| `CONTEXT_MAX_CHARS` | `75000` | Max context characters |
| `CONTEXT_CROSS_SERVER_ENABLED` | `false` | Cross-server memory |

## Context Types

### Conversation Memory
- Per-user conversation history
- Automatic cleanup after timeout
- Message limit enforcement

### Server Culture
- Popular emojis
- Active channels
- Server boost level
- Running gags

### Embarrassing Moments
- User-specific memorable moments
- Used for personalized roasting
- Stored per-server

## Memory Optimization

### Automatic Features
- **Compression**: 40% memory reduction via deduplication
- **LRU Eviction**: Oldest entries removed when at capacity
- **Summarization**: Large contexts automatically summarized

### Memory Usage
- ~500B-2KB per user context
- 1-year cache retention for small user bases
- Automatic cleanup via `/clear` or timeout

## Commands

| Command | Description |
|---------|-------------|
| `/clear` | Clear your conversation history |
| `/remember @user <moment>` | Add embarrassing moment |
| `/addgag <gag>` | Add server running gag |
| `/contextstats` | View context statistics |

## Data Flow

```
Discord Event -> Context Extraction -> Context Manager -> Gemini Service
     |                                      |              |
  Message    ->  Build Context     ->  Store/Cache  ->  Include in Prompt
```

## Storage

- **In-memory**: Conversation history, cache
- **Configurable retention**: Set via environment variables
- **Automatic cleanup**: LRU eviction and age-based trimming

## Best Practices

1. **Clear contexts** regularly to prevent memory bloat
2. **Set appropriate timeouts** for your server activity level
3. **Monitor memory** via `/status` command
4. **Adjust limits** based on server size
