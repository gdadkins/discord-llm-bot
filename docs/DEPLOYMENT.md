# Deployment

Deployment instructions for the Discord LLM Bot.

## Prerequisites

- Node.js 18.0.0+
- Discord Bot Token ([Developer Portal](https://discord.com/developers/applications))
- Google AI API Key ([Google AI Studio](https://makersuite.google.com/app/apikey))

## Quick Start

```bash
git clone <repository-url>
cd discord-llm-bot
npm install
cp .env.example .env
# Edit .env with your tokens
npm run build
npm start
```

## Development Mode

```bash
npm run dev  # Hot reload with debug logging
```

## Docker Deployment

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  discord-bot:
    build: .
    env_file: .env.production
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

**Commands:**
```bash
docker-compose up -d          # Start
docker-compose logs -f        # View logs
docker-compose down           # Stop
```

## Production Setup

**Environment (.env.production):**
```env
NODE_ENV=production
LOG_LEVEL=warn
DISCORD_TOKEN=your_token
GOOGLE_API_KEY=your_key
RATE_LIMIT_RPM=12
CONTEXT_MAX_CHARS=50000
```

**Process Manager (PM2):**
```bash
npm install -g pm2
pm2 start dist/index.js --name discord-bot
pm2 save
pm2 startup
```

## Security

- Set file permissions: `chmod 600 .env`
- Use secrets management in production
- Rotate API keys regularly
- Never commit tokens to version control

## Health Check

The bot provides health status:
- Command: `/status`
- Endpoint: `GET /health` (if enabled)

## Troubleshooting

**Bot won't start:**
- Check tokens are correct
- Verify Node.js version (18+)
- Check logs: `LOG_LEVEL=debug npm run dev`

**Memory issues:**
- Reduce `CONTEXT_MAX_CHARS`
- Reduce `CACHE_MAX_SIZE`
- Check memory: `/status`

**Network issues:**
```bash
# Test Discord API
curl -H "Authorization: Bot $DISCORD_TOKEN" https://discord.com/api/v10/users/@me
```

## Platform Guides

- [UNRAID_GUIDE.md](UNRAID_GUIDE.md) - Unraid deployment
