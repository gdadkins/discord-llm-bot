# Complete .env Configuration Guide

This comprehensive guide documents every environment variable that can be configured in your `.env` file for the Discord LLM Bot.

## Quick Start (Minimum Required)

```bash
# Essential variables - bot won't start without these
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
GOOGLE_API_KEY=your_google_api_key_here
```

## 🤖 Gemini AI Configuration

### Core Model Settings
```bash
# Model Selection (default: gemini-2.5-flash-preview-05-20)
GEMINI_MODEL=gemini-2.5-flash-preview-05-20

# Response Creativity (default: 0.9)
# Lower = more focused/consistent, Higher = more creative/varied
GEMINI_TEMPERATURE=0.9

# Token Selection Parameters
GEMINI_TOP_K=40          # Top K tokens to consider (default: 40)
GEMINI_TOP_P=0.95        # Cumulative probability cutoff (default: 0.95)
GEMINI_MAX_OUTPUT_TOKENS=8192  # Max response length (default: 8192)

# Optional: Fine-tune repetition
GEMINI_PRESENCE_PENALTY=0.0   # Penalty for using tokens already used (default: 0.0)
GEMINI_FREQUENCY_PENALTY=0.0  # Penalty for frequently used tokens (default: 0.0)
```

### 🎯 NEW: Vision & Image Recognition Settings
```bash
# Vision Profile Selection (NEW FEATURE!)
# Controls how the bot analyzes images for better accuracy
GEMINI_VISION_PROFILE=HIGH_ACCURACY_VISION

# Available profiles:
# - HIGH_ACCURACY_VISION: Best for character/person recognition (slower, more accurate)
# - BALANCED_VISION: Good accuracy with reasonable speed
# - FAST_VISION: Quick responses with acceptable accuracy
# - CREATIVE_VISION: More exploratory image interpretations
# - LEGACY: Previous configuration (backward compatibility)
```

### Bot Personality Instructions
```bash
# When the bot is roasting/teasing users
GEMINI_ROASTING_INSTRUCTION="Your custom roasting personality here"

# When the bot is being helpful
GEMINI_HELPFUL_INSTRUCTION="Your custom helpful personality here"

# Legacy aliases (still supported)
GEMINI_SYSTEM_INSTRUCTION="Same as roasting instruction"
HELPFUL_INSTRUCTION="Same as helpful instruction"
```

### Advanced AI Features
```bash
# Google Search Integration
GEMINI_GOOGLE_SEARCH_THRESHOLD=0.3  # When to trigger search (0.0-1.0, lower = more searches)
GEMINI_ENABLE_GOOGLE_SEARCH=false   # Enable web search for current info

# Thinking Mode (uses more tokens but better reasoning)
GEMINI_THINKING_BUDGET=20000        # Token budget for thinking process
GEMINI_INCLUDE_THOUGHTS=false       # Show thinking process in responses

# Advanced Features (experimental)
GEMINI_ENABLE_CODE_EXECUTION=false     # Enable Python code execution
GEMINI_ENABLE_STRUCTURED_OUTPUT=false  # Enable JSON structured responses
```

## 🚦 Rate Limiting & Performance

### Free Tier Settings (Recommended)
```bash
# Google Gemini Free Tier: 15 RPM, 1500 requests/day
RATE_LIMIT_RPM=15         # Requests per minute
RATE_LIMIT_DAILY=1500     # Requests per day
RATE_LIMIT_BURST=5        # Burst allowance

# Alternative variable names (legacy support)
GEMINI_RATE_LIMIT_RPM=15
GEMINI_RATE_LIMIT_DAILY=1500
```

### Retry Configuration
```bash
GEMINI_MAX_RETRIES=3          # Max retry attempts (default: 3)
GEMINI_RETRY_DELAY_MS=500     # Initial retry delay (default: 500ms)
GEMINI_RETRY_MULTIPLIER=2.0   # Delay multiplier for each retry (default: 2.0)
```

## 🧠 Memory & Context Settings

### Conversation Memory
```bash
# How long to remember conversations (minutes)
CONTEXT_TIMEOUT_MINUTES=60
CONVERSATION_TIMEOUT_MINUTES=60  # Legacy alias

# Maximum messages to remember per user
CONTEXT_MAX_MESSAGES=100
MAX_CONVERSATION_MESSAGES=100    # Legacy alias

# Maximum characters in conversation context
CONTEXT_MAX_CHARS=75000
MAX_CONTEXT_CHARS=75000          # Legacy alias

# Cross-server memory (remember users across different Discord servers)
CONTEXT_CROSS_SERVER_ENABLED=false
```

### Cache Settings
```bash
CACHE_MAX_SIZE=1000      # Max cached items (default: 1000)
CACHE_TTL_MINUTES=5      # Cache expiration time (default: 5 minutes)
```

## 🎭 Roasting Engine Configuration

```bash
# Basic roasting behavior
ROAST_BASE_CHANCE=0.3              # Base 30% chance to roast (0.0-1.0)
ROAST_MAX_CHANCE=0.8               # Maximum 80% roast chance

# Advanced roasting settings (optional)
ROAST_CONSECUTIVE_BONUS=0.25       # +25% chance per question without roasting
ROAST_COOLDOWN=true                # Skip roasting immediately after a roast
```

## 📊 Monitoring & Health

### Health Check Settings
```bash
HEALTH_CHECK_INTERVAL_MS=30000     # Health metrics collection interval (30 seconds)
METRICS_RETENTION_HOURS=24         # How long to keep metrics (24 hours)
```

### Alert Thresholds
```bash
ALERT_MEMORY_USAGE=0.8            # Memory usage alert at 80%
ALERT_ERROR_RATE=0.1              # Error rate alert at 10%
ALERT_RESPONSE_TIME_MS=5000       # Response time alert at 5 seconds
```

## 🔧 System Configuration

### Environment Settings
```bash
NODE_ENV=development    # development, production, or test
LOG_LEVEL=info         # error, warn, info, debug
```

### Legacy Variable Support
```bash
# These are still supported for backward compatibility:
GEMINI_API_KEY=your_google_api_key_here  # Alternative to GOOGLE_API_KEY
GROUNDING_THRESHOLD=0.3                  # Alternative to GEMINI_GOOGLE_SEARCH_THRESHOLD
THINKING_BUDGET=20000                    # Alternative to GEMINI_THINKING_BUDGET
INCLUDE_THOUGHTS=false                   # Alternative to GEMINI_INCLUDE_THOUGHTS
ENABLE_CODE_EXECUTION=false              # Alternative to GEMINI_ENABLE_CODE_EXECUTION
ENABLE_STRUCTURED_OUTPUT=false           # Alternative to GEMINI_ENABLE_STRUCTURED_OUTPUT
```

## 📋 Configuration Presets

### Preset 1: Beginner Setup (Just Works)
```bash
# Required
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
GOOGLE_API_KEY=your_api_key_here

# Optional: Better image recognition
GEMINI_VISION_PROFILE=HIGH_ACCURACY_VISION
```

### Preset 2: Performance Optimized
```bash
# Required
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
GOOGLE_API_KEY=your_api_key_here

# High performance settings
GEMINI_VISION_PROFILE=FAST_VISION
CONTEXT_MAX_CHARS=50000
CACHE_MAX_SIZE=2000
RATE_LIMIT_RPM=15
```

### Preset 3: Maximum Accuracy
```bash
# Required
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
GOOGLE_API_KEY=your_api_key_here

# Accuracy-focused settings
GEMINI_VISION_PROFILE=HIGH_ACCURACY_VISION
GEMINI_TEMPERATURE=0.3
GEMINI_TOP_K=20
GEMINI_TOP_P=0.9
CONTEXT_MAX_CHARS=100000
```

### Preset 4: Creative & Fun
```bash
# Required
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
GOOGLE_API_KEY=your_api_key_here

# Creative settings
GEMINI_VISION_PROFILE=CREATIVE_VISION
GEMINI_TEMPERATURE=0.9
ROAST_BASE_CHANCE=0.6
ROAST_MAX_CHANCE=0.9
GEMINI_ENABLE_GOOGLE_SEARCH=true
```

### Preset 5: Low Resource Usage
```bash
# Required
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
GOOGLE_API_KEY=your_api_key_here

# Minimal resource usage
CONTEXT_MAX_CHARS=25000
CACHE_MAX_SIZE=100
CONTEXT_TIMEOUT_MINUTES=15
METRICS_RETENTION_HOURS=6
GEMINI_MAX_OUTPUT_TOKENS=2048
```

## 🔍 Variable Priority & Overrides

The bot checks variables in this order (higher priority overrides lower):

1. **Environment variables** (highest priority)
2. **Profile defaults** (for vision settings)
3. **System defaults** (lowest priority)

Example:
```bash
# This setup will use HIGH_ACCURACY_VISION profile for images
# but override temperature to 0.2 instead of the profile's default 0.1
GEMINI_VISION_PROFILE=HIGH_ACCURACY_VISION
GEMINI_TEMPERATURE=0.2
```

## 🚨 Important Notes

### Security
- **Never commit your .env file to Git!**
- Keep your tokens and API keys private
- Use different tokens for development and production

### Free Tier Limits
- Google Gemini Free Tier: 15 RPM, 1500 requests/day
- Stay within these limits to avoid API errors
- The bot automatically applies a 10% safety margin

### Model Compatibility
- Currently optimized for `gemini-2.5-flash-preview-05-20` (free tier)
- Other models may require different parameters
- Vision features work best with multimodal-capable models

### Performance Tips
- Lower `CONTEXT_MAX_CHARS` if experiencing memory issues
- Higher `CACHE_MAX_SIZE` improves response times but uses more memory
- `HIGH_ACCURACY_VISION` profile is slower but more accurate for images

## 🛠️ Troubleshooting

### Bot Won't Start
- Check that `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `GOOGLE_API_KEY` are set
- Verify tokens are valid and have correct permissions

### Rate Limit Errors
- Reduce `RATE_LIMIT_RPM` or `RATE_LIMIT_DAILY`
- Check if `RATE_LIMIT_BURST` exceeds `RATE_LIMIT_RPM`

### Memory Issues
- Reduce `CONTEXT_MAX_CHARS` and `CACHE_MAX_SIZE`
- Lower `CONTEXT_TIMEOUT_MINUTES`

### Poor Image Recognition
- Set `GEMINI_VISION_PROFILE=HIGH_ACCURACY_VISION`
- Lower `GEMINI_TEMPERATURE` for more consistent results
- Ensure images are good quality and well-lit

## 📚 Related Documentation

- [Configuration Reference](docs/CONFIGURATION_REFERENCE.md) - Complete technical reference
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) - Production deployment
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Multimodal Accuracy Improvements](MULTIMODAL_ACCURACY_IMPROVEMENTS.md) - Image recognition enhancements