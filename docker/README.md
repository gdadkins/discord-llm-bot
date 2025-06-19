# Docker Deployment Guide for Discord LLM Bot

This guide covers deploying the Discord LLM Bot as a Docker container on unRAID and other platforms.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [unRAID Deployment](#unraid-deployment)
- [Building the Image](#building-the-image)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker and Docker Compose installed
- Discord Bot Token
- Google API Key for Gemini
- At least 1GB of free RAM
- 2GB of free disk space

## Quick Start

1. **Clone the repository** (if not already done):
   ```bash
   git clone https://github.com/yourusername/discord-llm-bot.git
   cd discord-llm-bot
   ```

2. **Create your environment file**:
   ```bash
   cp .env.example .env
   nano .env  # Edit with your Discord token and Google API key
   ```

3. **Build and start the container**:
   ```bash
   docker-compose up -d
   ```

4. **Check logs**:
   ```bash
   docker-compose logs -f
   ```

## unRAID Deployment

### Method 1: Using Community Applications (Recommended)

1. **Install Community Applications** plugin if not already installed
2. **Add custom repository** (if the bot is published):
   - Navigate to Apps → Settings → Template Repositories
   - Add the repository URL

### Method 2: Manual Docker Compose Deployment

1. **SSH into your unRAID server**:
   ```bash
   ssh root@your-unraid-ip
   ```

2. **Create app directory**:
   ```bash
   mkdir -p /mnt/user/appdata/discord-llm-bot
   cd /mnt/user/appdata/discord-llm-bot
   ```

3. **Download files**:
   ```bash
   # Download the repository or copy files
   wget https://raw.githubusercontent.com/yourusername/discord-llm-bot/main/docker-compose.yml
   wget https://raw.githubusercontent.com/yourusername/discord-llm-bot/main/Dockerfile
   wget https://raw.githubusercontent.com/yourusername/discord-llm-bot/main/.dockerignore
   wget https://raw.githubusercontent.com/yourusername/discord-llm-bot/main/.env.example
   
   # Or use git clone
   git clone https://github.com/yourusername/discord-llm-bot.git .
   ```

4. **Configure environment**:
   ```bash
   cp .env.example .env
   nano .env
   ```

5. **Modify docker-compose.yml for unRAID paths**:
   ```yaml
   volumes:
     - /mnt/user/appdata/discord-llm-bot/data:/app/data
     - /mnt/user/appdata/discord-llm-bot/logs:/app/logs
     - /mnt/user/appdata/discord-llm-bot/temp:/app/temp
   ```

6. **Deploy using docker-compose**:
   ```bash
   docker-compose up -d
   ```

### Method 3: Using unRAID Docker Template

Create a new Docker container with these settings:

- **Name**: discord-llm-bot
- **Repository**: discord-llm-bot:latest (after building)
- **Network Type**: Bridge
- **Console shell command**: Shell

**Port Mappings**: None required (Discord bots use outbound connections)

**Path Mappings**:
- Container Path: `/app/data` → Host Path: `/mnt/user/appdata/discord-llm-bot/data`
- Container Path: `/app/logs` → Host Path: `/mnt/user/appdata/discord-llm-bot/logs`
- Container Path: `/app/temp` → Host Path: `/mnt/user/appdata/discord-llm-bot/temp`

**Variables** (Add these as needed):
- `DISCORD_TOKEN` → Your Discord bot token
- `DISCORD_CLIENT_ID` → Your Discord client ID
- `GOOGLE_API_KEY` → Your Google API key
- `NODE_ENV` → production
- `TZ` → Your timezone (e.g., America/New_York)

## Building the Image

### Build locally:
```bash
docker build -t discord-llm-bot:latest .
```

### Build with docker-compose:
```bash
docker-compose build
```

### Build for multiple architectures (if needed):
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t discord-llm-bot:latest .
```

## Configuration

### Environment Variables

The bot is configured through environment variables. Key variables include:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
GOOGLE_API_KEY=your_google_api_key

# Optional
NODE_ENV=production
LOG_LEVEL=info
RATE_LIMIT_RPM=15
RATE_LIMIT_DAILY=1500
GEMINI_VISION_PROFILE=HIGH_ACCURACY_VISION
```

See `.env.example` for all available options.

### Volume Mounts

The container uses these directories:
- `/app/data` - Persistent bot data (user preferences, cache, etc.)
- `/app/logs` - Application logs
- `/app/temp` - Temporary files

### Resource Limits

Default limits in docker-compose.yml:
- CPU: 2.0 cores max, 0.5 cores reserved
- Memory: 1GB max, 512MB reserved

Adjust based on your server capacity and bot usage.

## Maintenance

### Update the bot:
```bash
cd /mnt/user/appdata/discord-llm-bot
git pull
docker-compose build
docker-compose up -d
```

### View logs:
```bash
docker-compose logs -f discord-llm-bot
```

### Restart the bot:
```bash
docker-compose restart discord-llm-bot
```

### Stop the bot:
```bash
docker-compose down
```

### Backup data:
```bash
tar -czf discord-bot-backup-$(date +%Y%m%d).tar.gz data/
```

## Troubleshooting

### Container won't start

1. Check logs:
   ```bash
   docker-compose logs discord-llm-bot
   ```

2. Verify environment variables:
   ```bash
   docker-compose config
   ```

3. Check file permissions:
   ```bash
   ls -la /mnt/user/appdata/discord-llm-bot/
   ```

### Bot is online but not responding

1. Check Discord permissions
2. Verify the bot has been invited to your server
3. Check rate limits in logs
4. Ensure Google API key is valid

### High memory usage

1. Reduce cache size in environment variables
2. Lower context retention settings
3. Adjust resource limits in docker-compose.yml

### Permission errors

Run this to fix permissions:
```bash
docker exec discord-llm-bot chown -R nodejs:nodejs /app/data /app/logs
```

## Security Considerations

1. **Never commit .env files** to version control
2. **Use secrets management** for production deployments
3. **Regularly update** the base image and dependencies
4. **Monitor logs** for suspicious activity
5. **Limit resource usage** to prevent DoS

## Support

For issues specific to Docker deployment:
1. Check this guide first
2. Review container logs
3. Check the main project README
4. Open an issue on GitHub with Docker-specific details