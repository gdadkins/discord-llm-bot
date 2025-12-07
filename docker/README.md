# Docker Deployment Guide

Deploy the Discord LLM Bot using Docker for easy management and consistent environments.

## Prerequisites

- Docker and Docker Compose installed
- Discord Bot Token ([Get one here](https://discord.com/developers/applications))
- Google API Key for Gemini ([Get one here](https://aistudio.google.com/apikey))
- At least 1GB RAM and 2GB disk space

## Quick Start

```bash
# Clone the repository
git clone https://github.com/gdadkins/discord-llm-bot.git
cd discord-llm-bot

# Configure environment
cp .env.example .env
nano .env  # Add your Discord token and Google API key

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f
```

## Configuration

### Environment Variables

All configuration is done through the `.env` file. Required variables:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
GOOGLE_API_KEY=your_google_api_key
```

See `.env.example` for all available options.

### Volume Mounts

The container uses these directories for persistent data:

| Container Path | Purpose |
|----------------|---------|
| `/app/data` | Bot data (preferences, cache) |
| `/app/logs` | Application logs |
| `/app/temp` | Temporary files |

### Resource Limits

Default limits in `docker-compose.yml`:
- **CPU**: 2.0 cores max, 0.5 reserved
- **Memory**: 1GB max, 512MB reserved

Adjust in `docker-compose.yml` based on your needs.

## unRAID Deployment

### Method 1: Docker Compose (Recommended)

```bash
# SSH into unRAID
ssh root@your-unraid-ip

# Create app directory
mkdir -p /mnt/user/appdata/discord-llm-bot
cd /mnt/user/appdata/discord-llm-bot

# Clone repository
git clone https://github.com/gdadkins/discord-llm-bot.git .

# Configure
cp .env.example .env
nano .env  # Add your tokens

# Start
docker-compose up -d
```

### Method 2: unRAID Docker UI

1. Add container manually with these settings:
   - **Repository**: Build from local Dockerfile
   - **Network**: Bridge

2. Add these path mappings:
   - `/app/data` -> `/mnt/user/appdata/discord-llm-bot/data`
   - `/app/logs` -> `/mnt/user/appdata/discord-llm-bot/logs`

3. Add environment variables from your `.env` file

For detailed unRAID instructions, see [docs/UNRAID_GUIDE.md](../docs/UNRAID_GUIDE.md).

## Commands

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# View logs
docker-compose logs -f

# Restart
docker-compose restart

# Rebuild after updates
git pull
docker-compose build
docker-compose up -d

# Check health
docker-compose ps
```

## Building the Image

```bash
# Standard build
docker build -t discord-llm-bot:latest .

# For unRAID (uses npm install instead of npm ci)
docker build -f Dockerfile.unraid -t discord-llm-bot:latest .
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs discord-llm-bot

# Verify config
docker-compose config
```

### Bot online but not responding
1. Check Discord bot permissions
2. Verify bot is invited to your server
3. Check rate limits in logs
4. Ensure Google API key is valid

### Permission errors
```bash
# Fix ownership
docker exec discord-llm-bot chown -R nodejs:nodejs /app/data /app/logs
```

### High memory usage
- Reduce `CACHE_MAX_SIZE` in `.env`
- Lower `CONTEXT_MAX_CHARS`
- Adjust resource limits in `docker-compose.yml`

## Security Notes

- Never commit `.env` files (they're gitignored)
- The Docker files are safe to share - secrets are only in `.env`
- Use Docker secrets for production deployments
- Regularly update base images for security patches
