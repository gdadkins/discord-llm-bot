#!/bin/sh
set -e

echo "Starting Discord LLM Bot..."

# Function to check if environment variable is set
check_env() {
    if [ -z "${!1}" ]; then
        echo "ERROR: Required environment variable $1 is not set!"
        return 1
    fi
}

# Check required environment variables
echo "Checking environment variables..."
check_env "DISCORD_TOKEN" || exit 1
check_env "DISCORD_CLIENT_ID" || exit 1
check_env "GOOGLE_API_KEY" || exit 1

# Create necessary directories if they don't exist
echo "Setting up directories..."
mkdir -p /app/data /app/logs /app/temp

# Ensure correct permissions
echo "Setting permissions..."
chown -R nodejs:nodejs /app/data /app/logs /app/temp || true

# If .env file doesn't exist but .env.example does, create it
if [ ! -f /app/.env ] && [ -f /app/.env.example ]; then
    echo "Creating .env file from environment variables..."
    cp /app/.env.example /app/.env
    
    # Update .env with actual values from environment
    sed -i "s/your_discord_bot_token_here/${DISCORD_TOKEN}/" /app/.env
    sed -i "s/your_discord_client_id_here/${DISCORD_CLIENT_ID}/" /app/.env
    sed -i "s/your_google_api_key_here/${GOOGLE_API_KEY}/" /app/.env
fi

# Health check file
touch /app/data/.healthy

# Log startup information
echo "================================"
echo "Discord LLM Bot Container Info"
echo "================================"
echo "Node Version: $(node --version)"
echo "NPM Version: $(npm --version)"
echo "Environment: ${NODE_ENV:-development}"
echo "Log Level: ${LOG_LEVEL:-info}"
echo "Rate Limit RPM: ${RATE_LIMIT_RPM:-15}"
echo "Rate Limit Daily: ${RATE_LIMIT_DAILY:-1500}"
echo "================================"

# Execute the main command
echo "Starting bot application..."
exec "$@"