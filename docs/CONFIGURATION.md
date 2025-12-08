# Configuration

Configuration reference for all environment variables and runtime settings.

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Discord bot token from Developer Portal |
| `DISCORD_CLIENT_ID` | Discord application client ID |
| `GOOGLE_API_KEY` | Google AI API key (or `GEMINI_API_KEY`) |

## Gemini AI Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_MODEL` | `gemini-2.0-flash-exp` | Model version |
| `GEMINI_TEMPERATURE` | `0.9` | Response creativity (0.0-2.0) |
| `GEMINI_TOP_K` | `40` | Top-K sampling (1-100) |
| `GEMINI_TOP_P` | `0.95` | Nucleus sampling (0.0-1.0) |
| `GEMINI_MAX_OUTPUT_TOKENS` | `8192` | Max response tokens |
| `GEMINI_THINKING_BUDGET` | `20000` | Token budget for thinking mode |
| `GEMINI_INCLUDE_THOUGHTS` | `false` | Include thinking in responses |
| `GEMINI_ENABLE_CODE_EXECUTION` | `false` | Enable Python execution |
| `GEMINI_ENABLE_GOOGLE_SEARCH` | `false` | Enable search grounding |

## Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_RPM` | `15` | Requests per minute |
| `RATE_LIMIT_DAILY` | `500` | Daily request limit |
| `RATE_LIMIT_BURST` | `5` | Burst allowance |
| `GEMINI_MAX_RETRIES` | `3` | Max retry attempts |

## Context Memory

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTEXT_TIMEOUT_MINUTES` | `60` | Context retention time |
| `CONTEXT_MAX_MESSAGES` | `100` | Max messages per context |
| `CONTEXT_MAX_CHARS` | `75000` | Max context characters |
| `CONTEXT_CROSS_SERVER_ENABLED` | `false` | Cross-server memory |

## Roasting Engine

| Variable | Default | Description |
|----------|---------|-------------|
| `ROAST_BASE_CHANCE` | `0.3` | Base roast probability (0.0-1.0) |
| `ROAST_MAX_CHANCE` | `0.8` | Maximum roast probability |

## Caching

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_MAX_SIZE` | `1000` | Maximum cache entries |
| `CACHE_TTL_MINUTES` | `5` | Cache time-to-live |

## Monitoring

| Variable | Default | Description |
|----------|---------|-------------|
| `HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check interval |
| `ALERT_MEMORY_USAGE` | `0.8` | Memory alert threshold |
| `ALERT_ERROR_RATE` | `0.1` | Error rate threshold |
| `ALERT_RESPONSE_TIME_MS` | `5000` | Response time threshold |

## System

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `LOG_LEVEL` | `info` | Log level (error/warn/info/debug) |

## Configuration Management

### Hot Reload
Configuration file (`./data/bot-config.json`) is watched for changes and applied without restart.

### Commands
- `/config view [section]` - View configuration
- `/config rollback <version>` - Restore previous version
- `/config export` - Export configuration
- `/config audit` - View change history

### Version History
- Stored in `./data/config-versions/`
- Last 50 versions retained
- Full rollback capability

## Recommended Settings

### Development
```env
NODE_ENV=development
LOG_LEVEL=debug
RATE_LIMIT_RPM=30
GEMINI_INCLUDE_THOUGHTS=true
```

### Production
```env
NODE_ENV=production
LOG_LEVEL=warn
RATE_LIMIT_RPM=12
GEMINI_INCLUDE_THOUGHTS=false
```
