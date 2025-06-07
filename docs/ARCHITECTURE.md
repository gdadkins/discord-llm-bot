# Architecture Overview

This is a Discord bot that integrates with Google's Gemini AI. The bot uses Discord.js v14 for Discord integration and @google/genai for Gemini API calls. The bot supports both slash commands and @mention functionality for natural conversation.

## Core Components

- **Main Entry Point** (`src/index.ts`): 
  - Discord client with TypeScript types and graceful shutdown
  - Handles slash commands, @mentions, and reaction tracking
  - Smart message splitting for long responses
  - Memory leak fixes in typing indicators

- **Gemini Service** (`src/services/gemini.ts`): 
  - AI integration with `gemini-2.5-flash-preview-05-20` model
  - Dynamic dual personality system (roasting vs helpful)
  - Randomized behavior with configurable probability
  - Extended conversation memory (default 100 messages, 30min timeout)
  - Per-user roast tracking and probability adjustment
  - Server-wide context integration
  - Google Search grounding for real-time information (configurable threshold)
  - Thinking mode enabled by default in Gemini 2.5 (configurable budget)

- **Rate Limiter** (`src/services/rateLimiter.ts`):
  - Thread-safe with mutex protection
  - Persistent state in `data/rate-limit.json`
  - 10% safety margin (9 RPM, 450 daily effective limits)
  - Proper time window alignment

- **Context Manager** (`src/services/contextManager.ts`):
  - Leverages Gemini's 1M token context window
  - Tracks embarrassing moments, code snippets, running gags
  - Server-wide memory for deep roasting callbacks
  - Auto-trimming to prevent memory bloat

- **Message Splitter** (`src/utils/messageSplitter.ts`):
  - Intelligent splitting at paragraph/sentence boundaries
  - Handles Discord's 2000 char limit gracefully

- **Commands** (`src/commands/index.ts`): 
  - `/chat` - Main conversation
  - `/ascii` - AI-generated ASCII art from prompts
  - `/status` - Bot stats and memory usage
  - `/clear` - Reset conversation
  - `/remember` - Track embarrassing moments
  - `/addgag` - Add server running gags
  - `/execute` - Execute Python code (when enabled)
  - Personality commands: `/setpersonality`, `/mypersonality`, `/getpersonality`, `/removepersonality`, `/clearpersonality`
  - Enterprise commands: `/config`, `/analytics`, `/privacy`, `/health`, `/preferences`

## Key Systems

### Rate Limiting
- Mutex-protected, persistent across restarts
- 10% safety margin: 9 RPM, 450 daily (configurable)
- Stored in `data/rate-limit.json`

### Dynamic Roasting Behavior
- Dynamic base chance (20-70%, updates hourly)
- Bot moods: sleepy, caffeinated, chaotic, reverse_psychology, bloodthirsty
- Chaos consecutive bonuses with random escalation and bonus bombs
- Chaos mode events (5% trigger chance, 0.5x-2.5x multipliers)
- Psychological warfare: roast debt, mercy kills, cooldown breaking
- Contextual intelligence: message complexity, time of day, server activity
- Caps at 90%, optional cooldown with 15% override chance
- Per-user tracking with sophisticated probability calculations
- Dual personalities: roasting vs helpful

### Extended Context Memory
- Leverages Gemini's 1M token window
- Configurable: up to 100+ messages, hours of memory
- Server-wide tracking of embarrassments and gags
- Smart trimming by size and message count

## Command Handling Patterns

### Slash Commands
Commands are handled in the main interaction event listener with a switch statement. Each command function receives the interaction object and handles its own response logic including:
- Input validation
- Deferred replies for long operations
- Error handling with user-friendly messages
- Discord message length limits (2000 chars)

### @Mention Handling
The bot also responds to mentions in the `MessageCreate` event:
- Extracts message content after the mention
- Shows typing indicator while processing
- Maintains typing indicator with 5-second intervals for long responses
- Properly clears typing intervals to prevent memory leaks
- Handles message length limits automatically
- Provides error messages on failure

## Environment Configuration

**Required:**
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application client ID  
- `GOOGLE_API_KEY` - Google AI API key

**Personality & Behavior:**
- `GEMINI_SYSTEM_INSTRUCTION` - Roasting personality (no content restrictions)
- `HELPFUL_INSTRUCTION` - Non-roasting personality (no content restrictions)
- `ROAST_BASE_CHANCE` - Initial roast probability (0.5)
- `ROAST_CONSECUTIVE_BONUS` - Increase per question (0.25)
- `ROAST_MAX_CHANCE` - Maximum probability (0.9)
- `ROAST_COOLDOWN` - Skip roast after roasting (true)

**Memory & Context:**
- `CONVERSATION_TIMEOUT_MINUTES` - Session timeout (30)
- `MAX_CONVERSATION_MESSAGES` - Messages per user (100)
- `MAX_CONTEXT_CHARS` - Context size limit (50000)
- `GROUNDING_THRESHOLD` - Google Search grounding threshold (0.3)
- `THINKING_BUDGET` - Thinking mode token budget (1024)
- `INCLUDE_THOUGHTS` - Include thinking process in responses (false)

**Advanced Features:**
- `ENABLE_CODE_EXECUTION` - Enable Python code execution (false)
- `ENABLE_STRUCTURED_OUTPUT` - Enable JSON structured responses (false)

### Structured Output Use Cases

When `ENABLE_STRUCTURED_OUTPUT=true`, the bot can return structured JSON responses for:

1. **Code Execution Results**:
   ```json
   {
     "explanation": "Here's how to calculate the factorial of 5",
     "code": "def factorial(n):\n    return 1 if n <= 1 else n * factorial(n-1)\n\nresult = factorial(5)",
     "output": "120",
     "visualizations": []
   }
   ```

2. **General Responses with Metadata** (alternative schema):
   ```json
   {
     "response": "The answer to your question is 42",
     "mood": "helpful",
     "confidence": 0.95,
     "suggestions": ["Try asking about the meaning of life", "Calculate 6 × 7"]
   }
   ```

The bot would parse these and display them appropriately - users wouldn't see raw JSON.

**Rate Limiting:**
- `GEMINI_RATE_LIMIT_RPM` - Per minute limit (10)
- `GEMINI_RATE_LIMIT_DAILY` - Daily limit (500)

**Other:**
- `LOG_LEVEL` - Winston log level (info)
- `NODE_ENV` - Environment mode

## Bot Management Scripts

Windows-specific scripts in `/scripts/` for production deployment:
- **start-bot.ps1/bat** - Start bot in interactive mode with visible console
- **start-bot-background.vbs** - Start bot in background (hidden)
- **restart-bot.ps1** - Stop and restart the bot in one command
- **kill-bot.ps1/bat** - Force terminate bot processes
- **create-startup-task.ps1** - Configure Windows Task Scheduler for auto-startup