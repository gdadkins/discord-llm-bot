# Discord LLM Bot

A production-ready Discord bot powered by Google's Gemini AI, featuring intelligent conversation management, dynamic personality switching, and enterprise-grade reliability.

## Features

### AI Integration
- **Gemini 2.5 Flash** - Latest AI model with 1M token context window
- **Dual Personalities** - Switches between savage roasting and helpful assistance
- **Dynamic Behavior** - Probability-based personality switching with mood system
- **Thinking Mode** - Advanced reasoning with configurable token budget
- **Multimodal Support** - Process images, videos, and audio attachments

### Conversation Management
- **Extended Memory** - Up to 100+ messages per user with configurable session timeout
- **Server Context** - Tracks embarrassing moments, running gags, and code snippets
- **Smart Compression** - 40% memory reduction through intelligent algorithms
- **Cross-Server Context** - Optional privacy-respecting context sharing

### Enterprise Reliability
- **Health Monitoring** - Real-time system health tracking and alerts
- **Graceful Degradation** - Continues operation during service failures
- **Circuit Breakers** - Automatic failure detection and recovery
- **Rate Limiting** - Thread-safe with persistent state across restarts
- **Distributed Tracing** - Performance monitoring and debugging

### Administration
- **Hot Reload** - Configuration changes without restart
- **Version Control** - Configuration history with rollback capability
- **Audit Logging** - Track all administrative changes
- **Privacy Controls** - GDPR-compliant with user data management

## Quick Start

### Prerequisites

- Node.js 18+
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Google AI API Key ([Google AI Studio](https://aistudio.google.com/apikey))

### Installation

```bash
# Clone the repository
git clone https://github.com/gdadkins/discord-llm-bot.git
cd discord-llm-bot

# Install dependencies
npm install

# Create data directory
mkdir -p data

# Configure environment
cp .env.example .env
# Edit .env with your tokens
```

### Configuration

Edit `.env` with your credentials:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
GOOGLE_API_KEY=your_google_ai_api_key

# Optional - Personality
GEMINI_SYSTEM_INSTRUCTION="Your custom personality prompt"
ROAST_BASE_CHANCE=0.5        # 50% base chance to roast
ROAST_MAX_CHANCE=0.9         # Maximum 90% chance
ROAST_COOLDOWN=true          # Be helpful after roasting

# Optional - Memory
CONVERSATION_TIMEOUT_MINUTES=30
MAX_CONVERSATION_MESSAGES=100
```

See [.env.example](.env.example) for all configuration options.

### Running

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Commands

| Command | Description |
|---------|-------------|
| `/chat <message>` | Chat with the AI |
| `/status` | View bot stats and API quota |
| `/health` | Detailed health metrics |
| `/clear` | Reset your conversation history |
| `/remember <user> <moment>` | Track embarrassing moments |
| `/addgag <gag>` | Add server-wide running jokes |
| `/config` | Configuration management (admin) |
| `/privacy` | Data privacy controls |

The bot also responds to **@mentions** for natural conversation.

## Docker Deployment

```bash
# Clone and configure
git clone https://github.com/gdadkins/discord-llm-bot.git
cd discord-llm-bot
cp .env.example .env
# Edit .env with your tokens

# Build and run
docker-compose up -d

# View logs
docker-compose logs -f
```

For unRAID deployment, see [docs/UNRAID_GUIDE.md](docs/UNRAID_GUIDE.md).

## Architecture

```
src/
├── index.ts              # Main entry point
├── core/                 # Bot initialization and service lifecycle
├── commands/             # Slash command definitions
├── handlers/             # Event and command handlers
├── services/             # Core service layer
│   ├── gemini/          # AI integration (Gemini API)
│   ├── context/         # Context and memory management
│   ├── analytics/       # Usage analytics and metrics
│   ├── config/          # Configuration management
│   ├── health/          # Health monitoring
│   ├── roasting/        # Roasting engine and personality
│   ├── resilience/      # Circuit breakers, retry logic
│   ├── rate-limiting/   # API rate limiting
│   └── tracing/         # Distributed tracing
├── utils/                # Utility functions
└── types/                # TypeScript type definitions

data/                     # Persistent storage (git-ignored)
├── rate-limit.json      # Rate limit state
├── bot-config.json      # Configuration
└── health-metrics.json  # Health data
```

## Documentation

### Getting Started
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Configuration Reference](docs/CONFIGURATION_REFERENCE.md) - All configuration options
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) - Production deployment

### For Users
- [User Experience Guide](docs/USER_EXPERIENCE.md) - Features and preferences
- [Personality Examples](docs/PERSONALITY_EXAMPLES.md) - Custom personality prompts
- [Roasting Behavior](docs/ROASTING_BEHAVIOR.md) - How the roasting system works

### For Administrators
- [Admin Guide](docs/ADMIN_GUIDE.md) - Administrative procedures
- [Health Monitoring](docs/HEALTH_MONITORING.md) - System health tracking
- [Analytics System](docs/ANALYTICS_SYSTEM.md) - Usage analytics

### For Developers
- [Architecture Overview](docs/ARCHITECTURE.md) - System design
- [API Reference](docs/API_REFERENCE.md) - Complete API documentation
- [Testing Strategy](docs/TESTING_STRATEGY.md) - Testing approach
- [Development Workflows](docs/DEVELOPMENT_WORKFLOWS.md) - Contributing guidelines

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
```

### Professional Server
```env
ROAST_BASE_CHANCE=0.1
ROAST_MAX_CHANCE=0.2
HELPFUL_INSTRUCTION="You are a professional assistant..."
```

## Development

```bash
# Run tests
npm test

# Run linter
npm run lint

# Format code
npm run format

# Build
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please read the [Development Workflows](docs/DEVELOPMENT_WORKFLOWS.md) guide for contributing guidelines and code standards.
