# Extended Context Features - Leveraging Gemini's 1M Token Window

## What We Built

We've transformed your Discord bot from a simple Q&A bot into a context-aware roasting machine that leverages Gemini 2.0 Flash's massive 1M token context window while working within Discord's 2000 character limits.

## New Features

### 1. **Extended Conversation Memory**
- **Before**: 10 messages (20 total)
- **Now**: Configurable up to 100+ messages per user
- **Benefit**: Bot can reference conversations from hours ago

```env
CONVERSATION_TIMEOUT_MINUTES=120    # 2 hours
MAX_CONVERSATION_MESSAGES=200       # 200 messages per user
MAX_CONTEXT_CHARS=100000           # 100KB of context
```

### 2. **Server-Wide Context Tracking**
New `ContextManager` tracks:
- Embarrassing moments across the server
- Bad code submissions (hall of shame)
- Running gags and inside jokes
- Per-user code history

### 3. **New Slash Commands**

#### `/remember <user> <moment>`
```
/remember @Bob couldn't figure out how to exit vim for 3 hours
Bot: I'll remember that Bob couldn't figure out how to exit vim for 3 hours. This will come up later... 😈
```

#### `/roastcode <code> [description]`
```
/roastcode "if (x == true) { return true; } else { return false; }" checking boolean
Bot: [Brutal roast about redundant code, stored for future reference]
```

#### `/addgag <gag>`
```
/addgag Bob's infamous "just use regex" solution to everything
Bot: Added to the server's running gags
```

### 4. **Reaction Tracking**
Bot learns from reactions:
- 😂 = Good roast, worked well
- 💀 = Killed them, maximum damage
- 🔥 = Fire roast

### 5. **Smart Message Splitting**
Long responses are now intelligently split at:
1. Paragraph boundaries
2. Sentence boundaries
3. Word boundaries (last resort)

No more cut-off roasts!

## How Context Flows

```
User: "How do I center a div?"
[Bot checks:]
1. Server-wide context (any CSS failures from this user?)
2. Conversation history (recent related questions?)
3. Code hall of shame (bad CSS attempts?)
4. Running gags (is this user known for CSS struggles?)

Bot: "YOU AGAIN with the CSS? Remember last week when you tried to use 
tables for layout? And that time you had 47 !important declarations? 
Here's flexbox AGAIN: display: flex; justify-content: center; 
align-items: center; Write it down this time!"
```

## Usage Examples

### Example 1: Building Context Over Time
```
Monday:
User: /roastcode "def add(a, b): return a + b + 1" addition function
Bot: "Nice off-by-one error. This is why we can't have nice things."

Thursday:
User: "What's 2+2?"
Bot: "Given your history with that addition function that adds an extra 1, 
I'm surprised you trust me to answer this. It's 4, not 5 like your code would say."
```

### Example 2: Cross-User Roasting
```
/remember @Alice spent 2 hours debugging a missing semicolon
/remember @Bob tried to use regex to parse HTML
/remember @Charlie stored passwords in plain text

Later in any conversation:
Bot: "At least you're not as bad as Charlie with the plain text passwords..."
```

### Example 3: Learning from Reactions
```
Bot: [Delivers savage roast]
Users: 😂😂😂💀🔥
[Bot notes this pattern worked well, similar style roasts will follow]
```

## Performance Considerations

- **Token Usage**: More context = more tokens = slightly higher latency
- **Memory**: Limited by MAX_CONTEXT_CHARS to prevent memory bloat
- **Cleanup**: Automatic cleanup every 5 minutes for expired conversations
- **Persistence**: Currently in-memory only (resets on bot restart)

## Future Enhancements

1. **Redis Integration**: Persist context across restarts
2. **Context Summarization**: Use AI to summarize old context
3. **User Preferences**: Let users set their roast tolerance
4. **Export/Import**: Save legendary roast sessions
5. **Analytics**: Track most roasted topics, best burns, etc.

## Configuration Tips

For maximum roasting potential:
```env
# Extended memory for deep callbacks
CONVERSATION_TIMEOUT_MINUTES=240  # 4 hours
MAX_CONVERSATION_MESSAGES=500     # Lots of history
MAX_CONTEXT_CHARS=200000         # 200KB of pure roasting fuel

# Savage personality
GEMINI_SYSTEM_INSTRUCTION="You're an absolutely ruthless roast bot with perfect memory. Reference past failures, callback to old embarrassments, and never let them forget their mistakes. Still help them, but make them suffer first."
```

The key insight: Gemini's huge context window lets the bot build deep, persistent personality and memory, while Discord's character limit forces concise, punchy delivery. You get an elephant's memory with a comedian's timing!