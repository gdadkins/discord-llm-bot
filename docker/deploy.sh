#!/bin/bash
# Quick deployment script for Discord LLM Bot

set -e

echo "Discord LLM Bot Docker Deployment"
echo "================================="

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please edit .env with your Discord token and Google API key"
    echo "Then run this script again."
    exit 1
fi

# Check if required variables are set in .env
if ! grep -q "DISCORD_TOKEN=your_discord_bot_token_here" .env; then
    echo "Building Docker image..."
    docker-compose build
    
    echo "Starting containers..."
    docker-compose up -d
    
    echo "Deployment complete!"
    echo ""
    echo "Useful commands:"
    echo "  View logs:    docker-compose logs -f"
    echo "  Stop bot:     docker-compose down"
    echo "  Restart bot:  docker-compose restart"
    echo "  Update bot:   git pull && docker-compose build && docker-compose up -d"
else
    echo "ERROR: Please configure your .env file first!"
    echo "Edit .env and replace the placeholder values with your actual tokens."
    exit 1
fi