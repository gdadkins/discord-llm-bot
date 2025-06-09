# Deployment Guide

This guide provides comprehensive deployment instructions for the Discord LLM Bot across different environments and platforms.

## Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Google AI API Key ([Google AI Studio](https://makersuite.google.com/app/apikey))

### Basic Deployment
```bash
# Clone the repository
git clone <repository-url>
cd discord-llm-bot

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit configuration (see Environment Configuration below)
nano .env

# Build and start
npm run build
npm start
```

## Environment Configuration

### Development Environment

**File: `.env.development`**
```env
# Core Configuration
NODE_ENV=development
LOG_LEVEL=debug
DISCORD_TOKEN=your_development_bot_token
GOOGLE_API_KEY=your_google_api_key

# Development-optimized settings
RATE_LIMIT_RPM=30
RATE_LIMIT_DAILY=2000
RATE_LIMIT_BURST=10

# Enhanced debugging
GEMINI_INCLUDE_THOUGHTS=true
GEMINI_THINKING_BUDGET=30000
HEALTH_CHECK_INTERVAL_MS=15000

# Relaxed context settings for testing
CONTEXT_MAX_CHARS=100000
CONTEXT_TIMEOUT_MINUTES=120
CACHE_MAX_SIZE=2000
CACHE_TTL_MINUTES=10

# Testing-friendly roasting
ROAST_BASE_CHANCE=0.6
ROAST_MAX_CHANCE=0.9

# Features enabled for testing
GEMINI_ENABLE_CODE_EXECUTION=true
GEMINI_ENABLE_STRUCTURED_OUTPUT=true
CONTEXT_CROSS_SERVER_ENABLED=true
```

**Development Commands:**
```bash
# Start in development mode with hot reload
npm run dev

# Run with specific environment
NODE_ENV=development npm run dev

# Debug mode with enhanced logging
LOG_LEVEL=debug npm run dev
```

### Staging Environment

**File: `.env.staging`**
```env
# Core Configuration
NODE_ENV=staging
LOG_LEVEL=info
DISCORD_TOKEN=your_staging_bot_token
GOOGLE_API_KEY=your_google_api_key

# Production-like rate limiting
RATE_LIMIT_RPM=15
RATE_LIMIT_DAILY=1500
RATE_LIMIT_BURST=8

# Optimized for testing performance
GEMINI_INCLUDE_THOUGHTS=false
GEMINI_THINKING_BUDGET=20000
HEALTH_CHECK_INTERVAL_MS=30000

# Production-like context settings
CONTEXT_MAX_CHARS=75000
CONTEXT_TIMEOUT_MINUTES=60
CACHE_MAX_SIZE=1000
CACHE_TTL_MINUTES=5

# Moderate roasting for testing
ROAST_BASE_CHANCE=0.4
ROAST_MAX_CHANCE=0.8

# Limited features for stability testing
GEMINI_ENABLE_CODE_EXECUTION=false
GEMINI_ENABLE_STRUCTURED_OUTPUT=false
CONTEXT_CROSS_SERVER_ENABLED=false

# Enhanced monitoring
ALERT_MEMORY_USAGE=0.7
ALERT_ERROR_RATE=0.05
ALERT_RESPONSE_TIME_MS=3000
METRICS_RETENTION_HOURS=48
```

**Staging Deployment:**
```bash
# Set environment
export NODE_ENV=staging

# Build and test
npm run build
npm run test:ci

# Start with staging config
npm start
```

### Production Environment

**File: `.env.production`**
```env
# Core Configuration
NODE_ENV=production
LOG_LEVEL=warn
DISCORD_TOKEN=your_production_bot_token
GOOGLE_API_KEY=your_production_api_key

# Conservative rate limiting for stability
RATE_LIMIT_RPM=12
RATE_LIMIT_DAILY=1200
RATE_LIMIT_BURST=5

# Production-optimized settings
GEMINI_INCLUDE_THOUGHTS=false
GEMINI_THINKING_BUDGET=15000
HEALTH_CHECK_INTERVAL_MS=60000

# Memory-optimized context settings
CONTEXT_MAX_CHARS=50000
CONTEXT_TIMEOUT_MINUTES=45
CACHE_MAX_SIZE=800
CACHE_TTL_MINUTES=3

# Conservative roasting for production
ROAST_BASE_CHANCE=0.3
ROAST_MAX_CHANCE=0.7

# Disabled experimental features
GEMINI_ENABLE_CODE_EXECUTION=false
GEMINI_ENABLE_STRUCTURED_OUTPUT=false
CONTEXT_CROSS_SERVER_ENABLED=false

# Production monitoring
ALERT_MEMORY_USAGE=0.8
ALERT_ERROR_RATE=0.1
ALERT_RESPONSE_TIME_MS=5000
METRICS_RETENTION_HOURS=168
```

**Production Deployment:**
```bash
# Set production environment
export NODE_ENV=production

# Build optimized version
npm run build

# Run production checks
npm run lint
npm run test:ci

# Start with production settings
npm start
```

## Platform-Specific Deployments

### Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime

RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=botuser:nodejs . .

# Build application
RUN npm run build

# Create data directory with proper permissions
RUN mkdir -p data logs && chown -R botuser:nodejs data logs

USER botuser

EXPOSE 3000

CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  discord-bot:
    build: .
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    env_file:
      - .env.production
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Redis for caching
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

**Docker Commands:**
```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f discord-bot

# Scale (if needed)
docker-compose up --scale discord-bot=2

# Update deployment
docker-compose pull && docker-compose up -d
```

### Kubernetes Deployment

**k8s/namespace.yaml:**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: discord-bot
```

**k8s/secret.yaml:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: discord-bot-secrets
  namespace: discord-bot
type: Opaque
stringData:
  DISCORD_TOKEN: "your_discord_token"
  GOOGLE_API_KEY: "your_google_api_key"
```

**k8s/configmap.yaml:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: discord-bot-config
  namespace: discord-bot
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  RATE_LIMIT_RPM: "12"
  RATE_LIMIT_DAILY: "1200"
  CONTEXT_MAX_CHARS: "50000"
  CACHE_MAX_SIZE: "800"
  ROAST_BASE_CHANCE: "0.3"
```

**k8s/deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: discord-bot
  namespace: discord-bot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: discord-bot
  template:
    metadata:
      labels:
        app: discord-bot
    spec:
      containers:
      - name: discord-bot
        image: discord-bot:latest
        envFrom:
        - configMapRef:
            name: discord-bot-config
        - secretRef:
            name: discord-bot-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        volumeMounts:
        - name: data-volume
          mountPath: /app/data
        - name: logs-volume
          mountPath: /app/logs
        livenessProbe:
          exec:
            command:
            - node
            - -e
            - "process.exit(0)"
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          exec:
            command:
            - node
            - -e
            - "process.exit(0)"
          initialDelaySeconds: 10
          periodSeconds: 10
      volumes:
      - name: data-volume
        persistentVolumeClaim:
          claimName: discord-bot-data
      - name: logs-volume
        emptyDir: {}
```

**Deploy to Kubernetes:**
```bash
# Apply all configurations
kubectl apply -f k8s/

# Check status
kubectl get pods -n discord-bot

# View logs
kubectl logs -f deployment/discord-bot -n discord-bot

# Scale deployment
kubectl scale deployment discord-bot --replicas=2 -n discord-bot
```

### Cloud Platform Deployments

#### Heroku Deployment

**Procfile:**
```
release: npm run build
web: npm start
```

**app.json:**
```json
{
  "name": "Discord LLM Bot",
  "description": "Discord bot with Gemini AI integration",
  "repository": "https://github.com/your-repo/discord-llm-bot",
  "keywords": ["discord", "bot", "ai", "gemini"],
  "env": {
    "NODE_ENV": {
      "description": "Node environment",
      "value": "production"
    },
    "DISCORD_TOKEN": {
      "description": "Discord bot token",
      "required": true
    },
    "GOOGLE_API_KEY": {
      "description": "Google AI API key",
      "required": true
    },
    "LOG_LEVEL": {
      "description": "Logging level",
      "value": "info"
    }
  },
  "formation": {
    "web": {
      "quantity": 1,
      "size": "basic"
    }
  },
  "addons": [
    "heroku-redis:mini"
  ]
}
```

**Heroku Commands:**
```bash
# Create and deploy
heroku create your-discord-bot
heroku config:set DISCORD_TOKEN=your_token
heroku config:set GOOGLE_API_KEY=your_key
git push heroku main

# Scale dyno
heroku ps:scale web=1

# View logs
heroku logs --tail

# Add Redis addon
heroku addons:create heroku-redis:mini
```

#### AWS EC2 Deployment

**User Data Script:**
```bash
#!/bin/bash
yum update -y
yum install -y nodejs npm git

# Install PM2 globally
npm install -g pm2

# Create bot user
useradd -m botuser

# Clone repository
sudo -u botuser git clone https://github.com/your-repo/discord-llm-bot.git /home/botuser/bot
cd /home/botuser/bot

# Install dependencies and build
sudo -u botuser npm install
sudo -u botuser npm run build

# Set environment variables (use AWS Systems Manager Parameter Store)
echo "DISCORD_TOKEN=$(aws ssm get-parameter --name /discord-bot/token --with-decryption --query Parameter.Value --output text)" > .env
echo "GOOGLE_API_KEY=$(aws ssm get-parameter --name /discord-bot/google-key --with-decryption --query Parameter.Value --output text)" >> .env
echo "NODE_ENV=production" >> .env

# Start with PM2
sudo -u botuser pm2 start npm --name "discord-bot" -- start
sudo -u botuser pm2 save
sudo -u botuser pm2 startup

# Setup PM2 as system service
env PATH=$PATH:/usr/bin pm2 startup systemd -u botuser --hp /home/botuser
```

**PM2 Ecosystem File (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [{
    name: 'discord-bot',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    merge_logs: true,
    time: true
  }]
};
```

#### Digital Ocean App Platform

**app.yaml:**
```yaml
name: discord-llm-bot
services:
- name: bot
  source_dir: /
  github:
    repo: your-username/discord-llm-bot
    branch: main
  run_command: npm start
  build_command: npm run build
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: NODE_ENV
    value: production
  - key: DISCORD_TOKEN
    value: your_discord_token
    type: SECRET
  - key: GOOGLE_API_KEY
    value: your_google_api_key
    type: SECRET
  - key: LOG_LEVEL
    value: info
```

**Deploy Command:**
```bash
# Install doctl CLI
snap install doctl

# Create app
doctl apps create app.yaml

# Update app
doctl apps update your-app-id app.yaml
```

## Environment-Specific Optimizations

### Low Resource Environments

**Configuration for VPS with 1GB RAM:**
```env
# Minimal resource usage
NODE_ENV=production
LOG_LEVEL=warn

# Reduced memory footprint
CONTEXT_MAX_CHARS=25000
CACHE_MAX_SIZE=500
CONTEXT_TIMEOUT_MINUTES=30
METRICS_RETENTION_HOURS=24

# Conservative rate limiting
RATE_LIMIT_RPM=8
RATE_LIMIT_DAILY=800
RATE_LIMIT_BURST=3

# Optimized monitoring
HEALTH_CHECK_INTERVAL_MS=120000
ALERT_MEMORY_USAGE=0.85
```

### High Availability Setup

**Load Balanced Configuration:**
```env
# Production settings with scaling
NODE_ENV=production
LOG_LEVEL=info

# Higher capacity settings
CONTEXT_MAX_CHARS=75000
CACHE_MAX_SIZE=2000
RATE_LIMIT_RPM=25
RATE_LIMIT_DAILY=5000

# Shared state considerations
CONTEXT_CROSS_SERVER_ENABLED=true

# Enhanced monitoring
HEALTH_CHECK_INTERVAL_MS=30000
METRICS_RETENTION_HOURS=168
```

## Security Configuration

### Environment Security

**Production Security Checklist:**
- [ ] Use environment variables, not config files
- [ ] Rotate API keys regularly
- [ ] Implement proper file permissions (600)
- [ ] Use secrets management (Kubernetes secrets, AWS SSM, etc.)
- [ ] Enable audit logging
- [ ] Implement rate limiting
- [ ] Use HTTPS for all external communications

**Secure Environment Setup:**
```bash
# Set restrictive permissions
chmod 600 .env*
chown root:root .env*

# Use systemd for process management
sudo systemctl enable discord-bot
sudo systemctl start discord-bot

# Setup log rotation
sudo logrotate -d /etc/logrotate.d/discord-bot
```

### API Key Management

**AWS Systems Manager:**
```bash
# Store secrets
aws ssm put-parameter --name "/discord-bot/token" --value "your_token" --type "SecureString"
aws ssm put-parameter --name "/discord-bot/google-key" --value "your_key" --type "SecureString"

# Retrieve in application
DISCORD_TOKEN=$(aws ssm get-parameter --name "/discord-bot/token" --with-decryption --query Parameter.Value --output text)
```

**Kubernetes Secrets:**
```bash
# Create secret from literals
kubectl create secret generic discord-bot-secrets \
  --from-literal=DISCORD_TOKEN=your_token \
  --from-literal=GOOGLE_API_KEY=your_key

# Create secret from file
kubectl create secret generic discord-bot-secrets \
  --from-env-file=.env.production
```

## Monitoring and Health Checks

### Health Check Endpoints

The bot exposes several health check endpoints:

```javascript
// Basic health check
GET /health
Response: { "status": "ok", "timestamp": "..." }

// Detailed health status
GET /health/detailed
Response: {
  "status": "ok",
  "services": {
    "discord": "connected",
    "gemini": "available",
    "database": "connected"
  },
  "metrics": {
    "memory": "45%",
    "uptime": "24h"
  }
}
```

### Monitoring Setup

**Prometheus Configuration:**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'discord-bot'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

**Grafana Dashboard:**
```json
{
  "dashboard": {
    "title": "Discord Bot Metrics",
    "panels": [
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "discord_bot_response_time_seconds"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "targets": [
          {
            "expr": "discord_bot_memory_usage_bytes"
          }
        ]
      }
    ]
  }
}
```

## Backup and Recovery

### Configuration Backup

**Automated Backup Script:**
```bash
#!/bin/bash
# backup-config.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/discord-bot"
DATA_DIR="/app/data"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup configuration and data
tar -czf $BACKUP_DIR/config_$DATE.tar.gz $DATA_DIR/bot-config.json
tar -czf $BACKUP_DIR/versions_$DATE.tar.gz $DATA_DIR/config-versions/
tar -czf $BACKUP_DIR/audit_$DATE.tar.gz $DATA_DIR/config-audit.json

# Keep only last 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

**Cron Schedule:**
```bash
# Daily backup at 2 AM
0 2 * * * /usr/local/bin/backup-config.sh

# Weekly full backup
0 1 * * 0 /usr/local/bin/full-backup.sh
```

### Recovery Procedures

**Configuration Recovery:**
```bash
# Stop the bot
sudo systemctl stop discord-bot

# Restore configuration
tar -xzf /backups/discord-bot/config_20240115_020000.tar.gz -C /

# Verify configuration
npm run dev -- --validate-config

# Restart bot
sudo systemctl start discord-bot
```

## Troubleshooting Deployment

### Common Issues

#### Permission Errors
```bash
# Fix file permissions
sudo chown -R botuser:botuser /app
sudo chmod -R 755 /app
sudo chmod 600 /app/.env*
```

#### Memory Issues
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head

# Optimize configuration
export CONTEXT_MAX_CHARS=25000
export CACHE_MAX_SIZE=500
```

#### Network Issues
```bash
# Test Discord connectivity
curl -H "Authorization: Bot $DISCORD_TOKEN" https://discord.com/api/v10/users/@me

# Test Gemini API
curl -H "Authorization: Bearer $GOOGLE_API_KEY" https://generativelanguage.googleapis.com/v1/models
```

### Log Analysis

**Common Log Patterns:**
```bash
# Find configuration errors
grep "Configuration" /app/logs/error.log

# Monitor rate limiting
grep "Rate limit" /app/logs/combined.log

# Check memory warnings
grep -i "memory" /app/logs/combined.log

# Track API errors
grep "API error" /app/logs/error.log
```

### Performance Monitoring

**Resource Usage Commands:**
```bash
# CPU and memory monitoring
top -p $(pgrep -f "discord-bot")

# Network monitoring
netstat -tlnp | grep :3000

# Disk usage
du -sh /app/data /app/logs

# Process monitoring
ps aux | grep discord-bot
```

## Migration Guide

### Version Migration

**From v1.0 to v2.0:**
```bash
# Backup current version
cp -r /app/data /backups/v1.0-backup

# Update codebase
git pull origin main
npm install
npm run build

# Migrate configuration
npm run migrate-config

# Test configuration
npm run dev -- --validate-config

# Deploy new version
npm start
```

### Environment Migration

**Development to Production:**
```bash
# Export development configuration
npm run config export > dev-config.json

# Apply production overrides
sed -i 's/"development"/"production"/g' dev-config.json
sed -i 's/"debug"/"info"/g' dev-config.json

# Import to production
npm run config import < dev-config.json
```

## Related Documentation

- [Configuration Reference](CONFIGURATION_REFERENCE.md) - Detailed configuration options
- [Architecture Guide](ARCHITECTURE.md) - System architecture overview
- [API Reference](API_REFERENCE.md) - Service APIs and interfaces
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions
- [Performance Guide](PERFORMANCE.md) - Optimization strategies