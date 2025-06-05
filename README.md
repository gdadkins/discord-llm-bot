# Discord LLM Bot

A Discord bot with dual personalities powered by Google's Gemini AI - randomly switches between savage roasting and helpful assistance. Features extended memory, server-wide context tracking, and intelligent conversation management.

**Quick Start**: See [QUICK_START.md](QUICK_START.md) for setup in under 5 minutes.

## Features

- Chat with Gemini AI via Discord slash commands (`/chat`)
- @mention functionality - mention the bot to chat naturally
- Dynamic roasting behavior - randomly decides when to roast vs help (configurable)
- Extended conversation memory - configurable up to 100+ messages per user
- Server-wide context tracking - remembers embarrassing moments and running gags
- Dual personalities - savage roaster AND helpful assistant (no content restrictions)
- Thread-safe rate limiting with persistence (10 RPM, 500 requests/day)
- Reaction tracking - bot learns what roasts land well
- Comprehensive logging with Winston
- Environment-based configuration
- TypeScript for type safety
- Automatic typing indicators with proper cleanup
- Real-time status monitoring with `/status` command
- Memory management commands (`/clear`, `/remember`, `/addgag`)
- Google Search grounding support (ready for when @google/genai package adds support)
- Thinking mode enabled by default in Gemini 2.5 (configurable budget)
- Code execution support - run Python code safely with `/execute` command
- Structured output support for consistent JSON responses
- Advanced personality system with multiple descriptions per user
- Automatic retry mechanism for empty responses
- Safety filter detection with graceful handling

## Setup

### Prerequisites

- Node.js 18+
- Discord Bot Token
- Google AI API Key

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create data directory:
   ```bash
   mkdir -p data
   ```

4. Copy environment file:
   ```bash
   cp .env.example .env
   ```

5. Configure your `.env` file:
   - `DISCORD_TOKEN`: Your Discord bot token (required)
   - `DISCORD_CLIENT_ID`: Your Discord application client ID (required)
   - `GOOGLE_API_KEY`: Your Google AI API key (required)
   - `GEMINI_SYSTEM_INSTRUCTION`: Custom AI personality (optional, see [PERSONALITY_EXAMPLES.md](PERSONALITY_EXAMPLES.md))
   - `GEMINI_RATE_LIMIT_RPM`: Requests per minute limit (default: 10)
   - `GEMINI_RATE_LIMIT_DAILY`: Daily request limit (default: 500)
   - `LOG_LEVEL`: Winston log level (default: info)
   - `CONVERSATION_TIMEOUT_MINUTES`: How long to remember conversations (default: 30)
   - `MAX_CONVERSATION_MESSAGES`: Max messages to keep per user (default: 100)
   - `MAX_CONTEXT_CHARS`: Max total characters of context (default: 50000)
   - `ROAST_BASE_CHANCE`: Base probability to roast (default: 0.5)
   - `ROAST_CONSECUTIVE_BONUS`: Probability increase per question (default: 0.25)
   - `ROAST_MAX_CHANCE`: Maximum roast probability (default: 0.9)
   - `ROAST_COOLDOWN`: Always be helpful after roasting (default: true)
   - `HELPFUL_INSTRUCTION`: Personality when not roasting (optional)

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## Commands

### Commands

**Conversation:**
- `/chat <message>` - Chat with the AI
- `@BotName <message>` - Natural conversation via mentions

**Memory Management:**
- `/clear` - Reset your conversation history
- `/remember <user> <moment>` - Track embarrassing moments
- `/addgag <gag>` - Add server-wide running jokes

**Bot Management:**
- `/status` - View bot stats and memory usage

### Interaction Examples

```
User: /chat how do I center a div?
Bot: [50% chance roasts] "Still can't center a div in 2024?..."

User: what about vertically?
Bot: [Remembers context, might be helpful due to cooldown]

User: /remember @Bob couldn't exit vim for 3 hours
Bot: "I'll remember that Bob couldn't exit vim..."

```

## Rate Limits

- 10 requests per minute (safety margin: 9)
- 500 requests per day (safety margin: 450)
- Thread-safe enforcement with mutex protection
- Persistent state across restarts (stored in `data/rate-limit.json`)
- Proper time window alignment


## Quick Start

```bash
# Install dependencies
npm install

# Create data directory
mkdir -p data

# Copy and configure .env
cp .env.example .env
# Edit .env with your tokens and preferences

# Build and run
npm run build
npm start
```

## Architecture Overview

```
src/
├── commands/          # Slash command definitions
├── services/          
│   ├── gemini.ts     # AI integration + dynamic personality
│   ├── rateLimiter.ts # Persistent rate limiting
│   └── contextManager.ts # Server-wide memory
├── utils/            
│   ├── logger.ts     # Winston logging
│   └── messageSplitter.ts # Smart message chunking
└── index.ts          # Discord client + event handlers

data/                 # Persistent storage
└── rate-limit.json   # Rate limit state
```

## Key Features Explained

### Dynamic Roasting System
The bot randomly decides whether to roast or help:
- **Smart probability**: Starts at 50%, increases with consecutive questions
- **Personalized tracking**: Each user has independent roast chances
- **Cooldown option**: Always helpful after delivering a roast
- **Dual personalities**: Savage roaster OR professional assistant

### Extended Memory System
- **Conversation memory**: Up to 100+ messages over hours
- **Server context**: Remembers embarrassing moments and running gags
- **Leverages Gemini's 1M tokens**: Deep context, concise responses
- **Privacy-first**: Memory clears on restart (no persistence)

### Production Features
- **Rate limiting**: Thread-safe, persistent, with safety margins
- **Message handling**: Smart splitting, no cut-off responses
- **Reaction tracking**: Learns which roasts land well
- **Graceful shutdown**: Proper cleanup on exit

## Configuration Examples

### Balanced Server (Default)
```env
ROAST_BASE_CHANCE=0.5
ROAST_COOLDOWN=true
MAX_CONVERSATION_MESSAGES=100
```

### Savage Server
```env
ROAST_BASE_CHANCE=0.8
ROAST_MAX_CHANCE=1.0
ROAST_COOLDOWN=false
CONVERSATION_TIMEOUT_MINUTES=240
```

### Professional Server
```env
ROAST_BASE_CHANCE=0.2
ROAST_MAX_CHANCE=0.4
HELPFUL_INSTRUCTION="You are a professional assistant..."
```

## Documentation

- [PERSONALITY_EXAMPLES.md](PERSONALITY_EXAMPLES.md) - Roasting personality options
- [ROASTING_BEHAVIOR.md](ROASTING_BEHAVIOR.md) - Dynamic behavior system
- [CONVERSATION_MEMORY.md](CONVERSATION_MEMORY.md) - Memory implementation
- [EXTENDED_CONTEXT_FEATURES.md](EXTENDED_CONTEXT_FEATURES.md) - Advanced features
- [CLAUDE.md](CLAUDE.md) - Technical architecture details

## Windows Management Scripts

Scripts in `/scripts/` for production deployment:
- `start-bot.ps1/.bat` - Start with console
- `start-bot-background.vbs` - Run hidden
- `kill-bot.ps1/.bat` - Force stop
- `restart-bot.ps1` - Full restart
- `create-startup-task.ps1` - Auto-start setup