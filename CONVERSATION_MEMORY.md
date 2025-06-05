# Conversation Memory Implementation

## Overview

The bot now remembers conversation context for each user, enabling more natural and contextual interactions. This is especially useful for the roasting/banter personalities where the bot can reference earlier messages.

## How It Works

1. **Per-User Memory**: Each Discord user has their own isolated conversation history
2. **Time-Based Sessions**: Conversations expire after 30 minutes of inactivity
3. **Limited History**: Stores last 10 exchanges (20 messages total) to prevent token bloat
4. **Automatic Cleanup**: Expired conversations are cleaned up every 5 minutes

## Technical Implementation

### Data Structure
```typescript
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  messages: Message[];
  lastActive: number;
}

// Stored as: Map<userId, Conversation>
```

### API Flow
1. User sends message
2. Bot retrieves user's conversation history (if exists and not expired)
3. Sends full context to Gemini: System Instruction + Previous Conversation + Current Message
4. Stores the exchange in conversation history
5. Returns response

## Example Interaction

```
User: "How do I center a div?"
Bot: "Still can't figure out basic CSS? Use display: flex and justify-content: center, genius."

User: "What about vertically?"
Bot: "Of course you forgot about align-items: center. Did you even try googling this before wasting my time?"
[Bot remembers the context about centering divs]

[After 30 minutes of no activity]
User: "What about horizontally?"
Bot: "What about what horizontally? Be specific, I'm not a mind reader."
[Context has expired, bot doesn't remember the div centering discussion]
```

## Commands

- `/clear` - Manually clear your conversation history
- `/status` - Shows active users and total messages in memory

## Configuration

Currently hardcoded but could be made configurable:
- `SESSION_TIMEOUT_MS`: 30 minutes
- `MAX_MESSAGES_PER_CONVERSATION`: 10 exchanges (20 messages)
- Cleanup interval: 5 minutes

## Privacy & Performance

- **Privacy**: Conversations are never shared between users
- **Memory Usage**: Limited by message count and automatic cleanup
- **No Persistence**: Conversations are lost on bot restart (by design for privacy)
- **Performance**: Minimal impact with proper cleanup and limits

## Future Enhancements

1. **Redis Storage**: For persistence across restarts
2. **Channel-Based Memory**: Different behavior for different channels
3. **Configurable Timeouts**: Via environment variables
4. **Export/Import**: Let users save/load their conversations
5. **Smart Summarization**: Compress old messages instead of deleting