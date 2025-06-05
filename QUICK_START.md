# Discord LLM Bot - Quick Start Guide

## 1. Setup (2 minutes)

```bash
# Clone and install
git clone [your-repo]
cd discord-llm-bot
npm install
mkdir -p data

# Configure
cp .env.example .env
# Edit .env with your tokens
```

## 2. Required Environment Variables

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_app_id
GOOGLE_API_KEY=your_gemini_api_key
```

## 3. Choose Your Bot Personality

### Option A: Balanced Roaster (Default)
```env
# 50/50 chance of roasting vs helping
GEMINI_SYSTEM_INSTRUCTION="You're a witty roast bot for friends. Be savage but helpful."
```

### Option B: Maximum Chaos
```env
ROAST_BASE_CHANCE=0.8
ROAST_COOLDOWN=false
GEMINI_SYSTEM_INSTRUCTION="You're an absolutely ruthless roast bot. No mercy."
```

### Option C: Mostly Helpful
```env
ROAST_BASE_CHANCE=0.2
ROAST_MAX_CHANCE=0.5
HELPFUL_INSTRUCTION="You are a professional Discord assistant."
```

## 4. Run the Bot

```bash
npm run build
npm start
```

## 5. Test It Out

1. **Invite bot to your server**
2. **Try commands:**
   - `/chat how do I center a div?`
   - `@YourBot what's 2+2?`
   - `/remember @friend couldn't exit vim`
   - `/status` - Check bot stats

## 6. Advanced Features

- **Extended Memory**: Set `MAX_CONVERSATION_MESSAGES=200` for longer memory
- **Longer Sessions**: Set `CONVERSATION_TIMEOUT_MINUTES=120` for 2-hour memory
- **Running Gags**: `/addgag [inside joke]` for server-specific humor

## Common Issues

- **Bot not responding**: Check bot has message content intent enabled
- **Rate limits**: Default is 9 RPM, 450 daily (with safety margin)
- **Memory resets**: Conversations clear after timeout or bot restart
- **Long responses cut off**: Bot now splits messages automatically

## Next Steps

- Read [PERSONALITY_EXAMPLES.md](PERSONALITY_EXAMPLES.md) for more personalities
- Check [ROASTING_BEHAVIOR.md](ROASTING_BEHAVIOR.md) for probability tuning
- See [CLAUDE.md](CLAUDE.md) for technical architecture