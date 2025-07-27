# unRAID Deployment Guide for Discord LLM Bot

## Method 1: Pre-build Image (Recommended)

1. **SSH into your unRAID server and build the image:**
   ```bash
   cd /mnt/cache-pcie/docker-share/appdata/discord-llm-bot
   docker build -t discord-llm-bot:latest .
   ```

2. **Create .env file:**
   ```bash
   cp .env.unraid.example .env
   # Edit .env with your actual tokens
   nano .env
   ```

3. **Deploy via Portainer:**
   - Go to Stacks → Add Stack
   - Name: discord-llm-bot
   - Use the `docker-compose.unraid.yml` file
   - Upload or paste the compose file content
   - Add environment variables from .env file
   - Deploy the stack

## Method 2: Build via Portainer

If you need Portainer to build the image:

1. **Ensure Portainer has access to the build context:**
   - Check Portainer's volume mounts
   - The path must be accessible from within Portainer's container

2. **Use relative paths in compose file:**
   ```yaml
   build:
     context: .
     dockerfile: Dockerfile
   ```

3. **Deploy from the correct directory:**
   - In Portainer, set the working directory to where your Dockerfile is located

## Method 3: Using Git Repository

1. **Push your code to a Git repository**
2. **Use Portainer's Git deployment:**
   ```yaml
   build:
     context: https://github.com/yourusername/discord-llm-bot.git
     dockerfile: Dockerfile
   ```

## Troubleshooting

### Path Not Found Error
- Verify Portainer's volume mounts include `/mnt/cache-pcie`
- Check Portainer container settings: `docker inspect portainer`

### Permission Issues
- Ensure PUID=99 and PGID=100 match your unRAID user
- Check directory permissions: `ls -la /mnt/cache-pcie/docker-share/appdata/`

### Network Issues
- The subnet `172.25.0.0/16` might conflict with existing networks
- Check existing networks: `docker network ls`
- Adjust subnet if needed

## Quick Deploy Commands

```bash
# Build image manually
docker build -t discord-llm-bot:latest /mnt/cache-pcie/docker-share/appdata/discord-llm-bot

# Test run
docker run --rm -it \
  -e DISCORD_TOKEN="your_token" \
  -e DISCORD_CLIENT_ID="your_client_id" \
  -e GOOGLE_API_KEY="your_api_key" \
  discord-llm-bot:latest

# Check logs
docker logs discord-llm-bot
```