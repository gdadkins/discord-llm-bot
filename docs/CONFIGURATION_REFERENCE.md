# Configuration Reference

This document provides comprehensive reference for all configuration options, environment variables, and deployment settings for the Discord LLM Bot.

## Overview

The bot uses a multi-layered configuration system:
1. **Environment Variables** - Runtime settings from `.env` files or system environment
2. **Configuration Factory** - Type-safe configuration creation with validation
3. **Configuration Manager** - Dynamic configuration management with hot-reloading
4. **Default Configuration** - Fallback values for all settings

## Environment Variables

### Core Requirements

#### Discord Configuration
| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `DISCORD_TOKEN` | **Yes** | None | Discord bot token from Developer Portal | Valid bot token |
| `DISCORD_CLIENT_ID` | **Yes** | None | Discord application client ID | Valid client ID |

#### AI Service Configuration
| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `GOOGLE_API_KEY` | **Yes** | None | Google AI API key for Gemini access | Valid API key |
| `GEMINI_API_KEY` | Alternative | None | Alternative name for Google API key | Valid API key |

### Gemini AI Configuration

#### Model Settings
| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `GEMINI_MODEL` | No | `gemini-2.0-flash-exp` | Gemini model version | Valid model name |
| `GEMINI_TEMPERATURE` | No | `0.9` | Response creativity (higher = more creative) | `0.0` - `2.0` |
| `GEMINI_TOP_K` | No | `40` | Top-K sampling parameter | `1` - `100` |
| `GEMINI_TOP_P` | No | `0.95` | Top-P (nucleus) sampling parameter | `0.0` - `1.0` |
| `GEMINI_MAX_OUTPUT_TOKENS` | No | `8192` | Maximum tokens in response | `1` - `32768` |

#### System Instructions
| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `GEMINI_ROASTING_INSTRUCTION` | No | Default roasting prompt | Personality when roasting users | Any string |
| `GEMINI_HELPFUL_INSTRUCTION` | No | Default helpful prompt | Personality when being helpful | Any string |
| `GEMINI_SYSTEM_INSTRUCTION` | No | Same as roasting | Legacy alias for roasting instruction | Any string |
| `HELPFUL_INSTRUCTION` | No | Same as helpful | Legacy alias for helpful instruction | Any string |

#### Advanced Features
| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `GEMINI_GOOGLE_SEARCH_THRESHOLD` | No | `0.3` | Grounding threshold for Google Search | `0.0` - `1.0` |
| `GEMINI_ENABLE_GOOGLE_SEARCH` | No | `false` | Enable Google Search grounding | `true`, `false` |
| `GEMINI_THINKING_BUDGET` | No | `20000` | Token budget for thinking mode | `0` - `100000` |
| `GEMINI_INCLUDE_THOUGHTS` | No | `false` | Include thinking process in responses | `true`, `false` |
| `GEMINI_ENABLE_CODE_EXECUTION` | No | `false` | Enable Python code execution | `true`, `false` |
| `GEMINI_ENABLE_STRUCTURED_OUTPUT` | No | `false` | Enable JSON structured responses | `true`, `false` |

### Rate Limiting Configuration

| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `RATE_LIMIT_RPM` | No | `15` | Requests per minute limit | `1` - `60` |
| `RATE_LIMIT_DAILY` | No | `500` | Daily request limit | `1` - `10000` |
| `RATE_LIMIT_BURST` | No | `5` | Burst request allowance | `1` - `20` |
| `GEMINI_MAX_RETRIES` | No | `3` | Maximum retry attempts | `0` - `10` |
| `GEMINI_RETRY_DELAY_MS` | No | `500` | Base retry delay in milliseconds | `100` - `10000` |
| `GEMINI_RETRY_MULTIPLIER` | No | `2.0` | Retry delay multiplier | `1.0` - `5.0` |

**Rate Limiting Notes:**
- Free tier: 15 RPM, 1500 requests/day recommended
- Paid tier: Adjust based on your quota
- Burst size should not exceed RPM limit
- Safety margin of 10% is automatically applied

### Context Memory Configuration

| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `CONTEXT_TIMEOUT_MINUTES` | No | `60` | Context retention time | `1` - `1440` |
| `CONTEXT_MAX_MESSAGES` | No | `100` | Maximum messages per context | `1` - `1000` |
| `CONTEXT_MAX_CHARS` | No | `75000` | Maximum characters in context | `1000` - `1000000` |
| `CONTEXT_CROSS_SERVER_ENABLED` | No | `false` | Enable cross-server memory | `true`, `false` |

### Roasting Engine Configuration

| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `ROAST_BASE_CHANCE` | No | `0.3` | Base probability of roasting | `0.0` - `1.0` |
| `ROAST_MAX_CHANCE` | No | `0.8` | Maximum roasting probability | `0.0` - `1.0` |

**Roasting Engine Notes:**
- Base chance: 30% = occasional roasting, 70% = frequent roasting
- Max chance prevents 100% roasting probability
- Advanced roasting features are configured via constants file

### Caching Configuration

| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `CACHE_MAX_SIZE` | No | `1000` | Maximum cache entries | `10` - `10000` |
| `CACHE_TTL_MINUTES` | No | `5` | Cache time-to-live | `1` - `60` |

### Monitoring Configuration

| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `HEALTH_CHECK_INTERVAL_MS` | No | `30000` | Health metrics collection interval | `5000` - `300000` |
| `METRICS_RETENTION_HOURS` | No | `24` | Metrics retention period | `1` - `168` |
| `ALERT_MEMORY_USAGE` | No | `0.8` | Memory usage alert threshold | `0.1` - `0.95` |
| `ALERT_ERROR_RATE` | No | `0.1` | Error rate alert threshold | `0.01` - `0.5` |
| `ALERT_RESPONSE_TIME_MS` | No | `5000` | Response time alert threshold | `1000` - `30000` |

### System Configuration

| Variable | Required | Default | Description | Valid Range |
|----------|----------|---------|-------------|-------------|
| `NODE_ENV` | No | `development` | Node.js environment | `development`, `production`, `test` |
| `LOG_LEVEL` | No | `info` | Winston log level | `error`, `warn`, `info`, `debug` |

## Configuration Validation

### Automatic Validation
All configuration values are automatically validated:
- **Type checking**: Ensures strings, numbers, and booleans are correct types
- **Range validation**: Clamps numeric values to valid ranges
- **Business logic validation**: Checks for contradictory settings

### Validation Examples
```typescript
// Invalid: Base chance higher than max chance
ROAST_BASE_CHANCE=0.9
ROAST_MAX_CHANCE=0.7  // Will cause validation error

// Invalid: RPM exceeds daily limit
RATE_LIMIT_RPM=60
RATE_LIMIT_DAILY=100  // Will cause validation error

// Invalid: Burst size exceeds RPM
RATE_LIMIT_RPM=10
RATE_LIMIT_BURST=15   // Will cause warning
```

### Configuration Errors
When validation fails:
1. **Critical errors**: Bot will not start
2. **Warnings**: Bot starts with corrected values
3. **Range violations**: Values are clamped to valid ranges

## Configuration Relationships

### Memory vs Performance
- Higher `CONTEXT_MAX_CHARS` = better memory, higher token usage
- Higher `CACHE_MAX_SIZE` = faster responses, more memory usage
- Lower `CONTEXT_TIMEOUT_MINUTES` = less memory, reduced context quality

### Rate Limiting Dependencies
- `RATE_LIMIT_DAILY` should be >= `RATE_LIMIT_RPM * 24 * 60`
- `RATE_LIMIT_BURST` should be <= `RATE_LIMIT_RPM`
- Retry settings affect actual throughput under load

### AI Model Relationships
- Higher `GEMINI_TEMPERATURE` = more creative but less consistent
- Higher `GEMINI_THINKING_BUDGET` = better reasoning, more token usage
- `GEMINI_INCLUDE_THOUGHTS` significantly increases response length

## Security Considerations

### Sensitive Variables
Store these securely and never commit to version control:
- `DISCORD_TOKEN` - Full bot access
- `GOOGLE_API_KEY` - API usage charges
- `DISCORD_CLIENT_ID` - Application identification

### Environment File Security
```bash
# Set proper permissions
chmod 600 .env

# Add to .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

### Production Security
```bash
# Use environment variables instead of files
export DISCORD_TOKEN="your-token"
export GOOGLE_API_KEY="your-key"

# Or use container secrets
docker run -e DISCORD_TOKEN_FILE=/run/secrets/discord-token bot
```

## Configuration Schema

### TypeScript Interfaces
The bot uses strict TypeScript interfaces for configuration:

```typescript
interface BotConfiguration {
  version: string;
  lastModified: string;
  modifiedBy: string;
  discord: DiscordConfig;
  gemini: GeminiConfig;
  rateLimiting: RateLimitingConfig;
  features: FeatureConfig;
}
```

### JSON Schema Validation
Configuration is validated using JSON Schema:
- Required fields must be present
- Types must match interface definitions
- Additional properties are rejected
- Business logic validation is applied

## Configuration Files

### Primary Configuration
- **Location**: `./data/bot-config.json`
- **Format**: JSON with metadata
- **Auto-generated**: Created from environment variables
- **Hot-reload**: Monitors file changes (disabled in production)

### Version History
- **Location**: `./data/config-versions/`
- **Format**: Individual JSON files per version
- **Retention**: Last 50 versions kept
- **Compression**: Files >1KB are compressed

### Audit Log
- **Location**: `./data/config-audit.json`
- **Format**: JSON array of changes
- **Compression**: Files >4KB are compressed
- **Rotation**: Automatic cleanup

## Configuration Migration

### Version Updates
Configuration automatically migrates between versions:
1. **Schema evolution**: New fields added with defaults
2. **Deprecated fields**: Removed with warnings
3. **Value migration**: Converted to new formats

### Backup Strategy
- **Automatic backups**: Created before each change
- **Version history**: Full configuration snapshots
- **Rollback capability**: Restore any previous version

### Migration Example
```typescript
// Old configuration
{
  "rateLimiting": {
    "rpm": 10
  }
}

// Migrated configuration
{
  "rateLimiting": {
    "rpm": 10,
    "daily": 500,        // Added with default
    "burstSize": 5,      // Added with default
    "safetyMargin": 0.1  // Added with default
  }
}
```

## Troubleshooting Configuration

### Common Issues

#### Bot Won't Start
```
Configuration validation failed: Missing required field
```
**Solution**: Check required environment variables (DISCORD_TOKEN, GOOGLE_API_KEY)

#### Rate Limiting Errors
```
Rate limiting configuration warning: Burst size exceeds RPM
```
**Solution**: Reduce RATE_LIMIT_BURST or increase RATE_LIMIT_RPM

#### Memory Issues
```
Health alert: Memory usage above threshold
```
**Solution**: Reduce CONTEXT_MAX_CHARS or CACHE_MAX_SIZE

### Configuration Validation
Use the built-in validation command:
```bash
npm run dev -- --validate-config
```

### Environment Debugging
Check loaded environment variables:
```typescript
console.log('Environment variables:', {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN ? '***SET***' : 'MISSING',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? '***SET***' : 'MISSING',
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL
});
```

## Performance Tuning

### Low Resource Settings
```env
# Minimal memory usage
CONTEXT_MAX_CHARS=25000
CACHE_MAX_SIZE=100
CONTEXT_TIMEOUT_MINUTES=15
METRICS_RETENTION_HOURS=6
```

### High Performance Settings
```env
# Maximum performance
CONTEXT_MAX_CHARS=150000
CACHE_MAX_SIZE=5000
CONTEXT_TIMEOUT_MINUTES=180
RATE_LIMIT_BURST=10
```

### Balanced Settings (Recommended)
```env
# Good balance of features and performance
CONTEXT_MAX_CHARS=75000
CACHE_MAX_SIZE=1000
CONTEXT_TIMEOUT_MINUTES=60
RATE_LIMIT_RPM=15
RATE_LIMIT_DAILY=1500
```

## Best Practices

### Development Environment
```env
NODE_ENV=development
LOG_LEVEL=debug
GEMINI_INCLUDE_THOUGHTS=true
RATE_LIMIT_RPM=30
```

### Production Environment
```env
NODE_ENV=production
LOG_LEVEL=info
GEMINI_INCLUDE_THOUGHTS=false
HEALTH_CHECK_INTERVAL_MS=60000
```

### Testing Environment
```env
NODE_ENV=test
LOG_LEVEL=warn
CONTEXT_TIMEOUT_MINUTES=5
RATE_LIMIT_RPM=60
```

## Configuration Commands

### Available Commands
- `/config get [section]` - View current configuration
- `/config set <path> <value>` - Update configuration value
- `/config reload` - Reload from file
- `/config validate` - Validate current configuration
- `/config rollback <version>` - Restore previous version
- `/config history` - View configuration history

### Command Examples
```
/config get gemini
/config set features.roasting.baseChance 0.4
/config reload
/config rollback v2024-01-15T10-30-00-000Z
```

## Related Documentation

- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Environment-specific deployment
- [Architecture Guide](ARCHITECTURE.md) - System architecture overview
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions
- [API Reference](API_REFERENCE.md) - Service APIs and interfaces