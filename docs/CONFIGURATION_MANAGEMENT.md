# Configuration Management System

## Overview

The Discord LLM Bot now includes a comprehensive configuration management system that provides:

- **JSON Schema Validation**: All configuration changes are validated against a schema
- **Hot Reload**: Configuration changes are applied without restarting the bot
- **Environment Variable Overrides**: Environment variables take precedence over config files
- **Version Control**: Complete configuration history with rollback capability
- **Audit Logging**: Track who changed what and when
- **Service Integration**: Dynamic reconfiguration of running services

## Architecture

### Core Components

1. **ConfigurationManager** (`src/services/configurationManager.ts`)
   - Manages configuration loading, validation, and persistence
   - Handles file watching for hot reload
   - Manages version history and audit logging
   - Processes environment variable overrides

2. **ConfigurationAdapter** (`src/services/configurationAdapter.ts`)
   - Bridges configuration changes to service updates
   - Manages service registration and reconfiguration
   - Provides validation coordination across services

3. **Configuration Commands** (`src/commands/configurationCommands.ts`)
   - Discord slash commands for configuration management
   - `/config`, `/reload`, `/validate` commands

## Configuration Structure

The bot configuration is stored in `./data/bot-config.json` with the following structure:

```json
{
  "version": "1.0.0",
  "lastModified": "2024-01-01T00:00:00.000Z",
  "modifiedBy": "system",
  "discord": {
    "intents": ["Guilds", "GuildMessages", "MessageContent", "GuildMessageReactions"],
    "permissions": {},
    "commands": {
      "chat": { "enabled": true, "permissions": "all", "cooldown": 2000 }
    }
  },
  "gemini": {
    "model": "gemini-2.5-flash-preview-05-20",
    "temperature": 0.9,
    "topK": 40,
    "topP": 0.8,
    "maxTokens": 8192,
    "safetySettings": {
      "harassment": "block_none",
      "hateSpeech": "block_none",
      "sexuallyExplicit": "block_none",
      "dangerousContent": "block_none"
    },
    "systemInstructions": {
      "roasting": "You are a witty AI assistant with a talent for clever roasting.",
      "helpful": "You are a helpful AI assistant."
    },
    "grounding": {
      "threshold": 0.3,
      "enabled": true
    },
    "thinking": {
      "budget": 1024,
      "includeInResponse": false
    }
  },
  "rateLimiting": {
    "rpm": 10,
    "daily": 500,
    "burstSize": 5,
    "safetyMargin": 0.9,
    "retryOptions": {
      "maxRetries": 3,
      "retryDelay": 1000,
      "retryMultiplier": 2
    }
  },
  "features": {
    "roasting": {
      "baseChance": 0.5,
      "consecutiveBonus": 0.25,
      "maxChance": 0.9,
      "cooldownEnabled": true,
      "moodSystem": {
        "enabled": true,
        "moodDuration": 3600000,
        "chaosEvents": {
          "enabled": true,
          "triggerChance": 0.05,
          "durationRange": [300000, 1800000],
          "multiplierRange": [0.5, 2.5]
        }
      },
      "psychologicalWarfare": {
        "roastDebt": true,
        "mercyKills": true,
        "cooldownBreaking": true
      }
    },
    "codeExecution": false,
    "structuredOutput": false,
    "monitoring": {
      "healthMetrics": {
        "enabled": true,
        "collectionInterval": 30000,
        "retentionDays": 7
      },
      "alerts": {
        "enabled": true,
        "memoryThreshold": 512,
        "errorRateThreshold": 5,
        "responseTimeThreshold": 5000
      },
      "gracefulDegradation": {
        "enabled": true,
        "circuitBreaker": {
          "failureThreshold": 5,
          "timeout": 30000,
          "resetTimeout": 60000
        },
        "queueing": {
          "maxSize": 100,
          "maxAge": 300000
        }
      }
    },
    "contextMemory": {
      "enabled": true,
      "maxMessages": 100,
      "timeoutMinutes": 30,
      "maxContextChars": 50000,
      "compressionEnabled": true,
      "crossServerEnabled": false
    },
    "caching": {
      "enabled": true,
      "maxSize": 100,
      "ttlMinutes": 5,
      "compressionEnabled": true
    }
  }
}
```

## Environment Variable Overrides

Environment variables take precedence over configuration file values. The following mappings are supported:

| Environment Variable | Configuration Path |
|---------------------|-------------------|
| `GEMINI_RATE_LIMIT_RPM` | `rateLimiting.rpm` |
| `GEMINI_RATE_LIMIT_DAILY` | `rateLimiting.daily` |
| `ROAST_BASE_CHANCE` | `features.roasting.baseChance` |
| `ROAST_CONSECUTIVE_BONUS` | `features.roasting.consecutiveBonus` |
| `ROAST_MAX_CHANCE` | `features.roasting.maxChance` |
| `ROAST_COOLDOWN` | `features.roasting.cooldownEnabled` |
| `CONVERSATION_TIMEOUT_MINUTES` | `features.contextMemory.timeoutMinutes` |
| `MAX_CONVERSATION_MESSAGES` | `features.contextMemory.maxMessages` |
| `MAX_CONTEXT_CHARS` | `features.contextMemory.maxContextChars` |
| `GROUNDING_THRESHOLD` | `gemini.grounding.threshold` |
| `THINKING_BUDGET` | `gemini.thinking.budget` |
| `INCLUDE_THOUGHTS` | `gemini.thinking.includeInResponse` |
| `ENABLE_CODE_EXECUTION` | `features.codeExecution` |
| `ENABLE_STRUCTURED_OUTPUT` | `features.structuredOutput` |

## Discord Commands

### `/config` Command

Main configuration management command with multiple subcommands:

#### `/config view [section]`
View current configuration or specific section.
- **section**: `discord`, `gemini`, `rateLimiting`, `features`, or `all` (default)

#### `/config versions [limit]`
View configuration version history.
- **limit**: Number of versions to show (1-50, default: 10)

#### `/config rollback <version> [reason]`
Rollback to a previous configuration version.
- **version**: Version ID to rollback to (required)
- **reason**: Reason for rollback (optional)

#### `/config export [format]`
Export current configuration.
- **format**: Export format (`json` only for now)

#### `/config audit [limit]`
View configuration audit log.
- **limit**: Number of entries to show (1-100, default: 20)

### `/reload [reason]` Command

Reload configuration from file without restarting the bot.
- **reason**: Reason for reload (optional)

### `/validate [service]` Command

Validate current configuration and service states.
- **service**: Specific service to validate or `all` (default)

## Hot Reload

The configuration system automatically watches the configuration file for changes and applies them without restarting the bot:

1. **File Watching**: Uses `chokidar` to monitor configuration file changes
2. **Validation**: All changes are validated before applying
3. **Service Updates**: Services are automatically reconfigured with new settings
4. **Error Handling**: Invalid configurations are rejected with detailed error messages

### Testing Hot Reload

```bash
# Run the test script to create a configuration and test hot reload
node test-config.js
```

## Version Control

### Version History

- All configuration changes are stored in `./data/config-versions/`
- Each version includes timestamp, configuration snapshot, and SHA-256 hash
- Last 50 versions are retained automatically

### Rollback

```bash
# View version history
/config versions

# Rollback to a specific version
/config rollback v2024-01-01T12-00-00-000Z "Reverting problematic changes"
```

## Audit Logging

All configuration changes are logged to `./data/config-audit.log` with:

- Timestamp
- User who made the change
- Change type (create, update, reload, rollback)
- Configuration path modified
- Old and new values
- Reason for change
- Source (file, command, environment, api)

### Viewing Audit Log

```bash
# View recent audit entries
/config audit

# View more entries
/config audit limit:50
```

## Service Integration

### Supported Services

Currently integrated services that support dynamic reconfiguration:

1. **GeminiService**: Model parameters, rate limiting, roasting configuration
2. **RateLimiter**: Rate limits, safety margins, retry options

### Adding Service Integration

To add configuration support to a service:

1. **Implement updateConfiguration method**:
```typescript
async updateConfiguration(config: ServiceConfigType): Promise<void> {
  // Update internal configuration
  logger.info('Service configuration updated');
}
```

2. **Implement validateConfiguration method**:
```typescript
async validateConfiguration(config: BotConfiguration): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  // Validation logic
  return { valid: errors.length === 0, errors };
}
```

3. **Register with ConfigurationAdapter**:
```typescript
configAdapter.registerService('serviceName', serviceInstance);
```

## Error Handling

### Validation Errors

- Configuration changes that fail validation are rejected
- Detailed error messages explain what's wrong
- Original configuration is preserved

### Service Update Errors

- If a service fails to update, the error is logged
- Other services continue to be updated
- Failed services can be retried individually

### File System Errors

- Configuration file corruption is detected and reported
- Automatic backup and recovery from version history
- Graceful degradation when file system is unavailable

## Best Practices

### Configuration Changes

1. **Test First**: Use `/validate` before making major changes
2. **Document Changes**: Always provide a reason when using `/reload` or rollback
3. **Monitor Impact**: Check service status after configuration changes
4. **Backup**: Version history provides automatic backup, but consider external backups for critical configs

### Environment Variables

1. **Use for Secrets**: Keep sensitive values in environment variables
2. **Document Mappings**: Update the mapping table when adding new overrides
3. **Validation**: Ensure environment values are properly validated

### Service Integration

1. **Graceful Updates**: Services should handle configuration updates without disrupting ongoing operations
2. **Validation**: Always validate configuration before applying
3. **Cleanup**: Implement proper cleanup for resources when configuration changes
4. **Logging**: Log configuration changes for debugging

## Performance Considerations

### Hot Reload Performance

- File watching has minimal overhead
- Configuration validation is fast for normal-sized configs
- Service updates are asynchronous and non-blocking

### Memory Usage

- Version history is limited to 50 versions
- Audit log entries are append-only but can be rotated
- Configuration objects are lightweight

### Disk Usage

- Configuration files are small (typically <50KB)
- Version history uses ~2.5MB for 50 versions
- Audit log grows over time but can be managed

## Troubleshooting

### Common Issues

1. **Configuration Not Loading**
   - Check file permissions
   - Verify JSON syntax
   - Review validation errors in logs

2. **Hot Reload Not Working**
   - Ensure file watcher has permission to monitor directory
   - Check for file system events in logs
   - Verify configuration file is in the correct location

3. **Service Update Failures**
   - Check individual service logs
   - Verify service supports updateConfiguration method
   - Use `/validate` to check service-specific issues

### Debug Information

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

View configuration status:
```bash
/validate all
```

## Security Considerations

### Access Control

- Configuration commands require Administrator or Manage Server permissions
- Audit log tracks all changes with user attribution
- Environment variables can override file-based configuration

### Validation

- JSON Schema validation prevents malformed configurations
- Business logic validation ensures sensible values
- Service-specific validation catches integration issues

### Backup and Recovery

- Automatic version history provides rollback capability
- Configuration corruption is detected and can be recovered
- External backup recommendations for production environments

## Future Enhancements

### Planned Features

1. **Web Interface**: Browser-based configuration management
2. **Configuration Templates**: Pre-built configuration sets for different use cases
3. **Configuration Encryption**: Encrypt sensitive configuration values
4. **Advanced Validation**: Cross-service validation rules
5. **Configuration Migration**: Automatic migration between configuration versions

### API Extensions

1. **REST API**: HTTP endpoints for external configuration management
2. **Webhooks**: Notifications for configuration changes
3. **Bulk Operations**: Update multiple configuration sections atomically
4. **Configuration Diff**: Visual comparison between versions

This configuration management system provides a robust foundation for managing the Discord LLM Bot's complex configuration requirements while maintaining reliability and ease of use.