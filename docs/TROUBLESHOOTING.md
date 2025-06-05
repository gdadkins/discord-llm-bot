# Troubleshooting Guide

## Common Issues and Solutions

### Empty Response from Gemini API

**Symptoms:**
- Error: "Empty response from Gemini API"
- Bot crashes after certain questions

**Causes:**
1. Gemini safety filters blocking content
2. Complex prompts exceeding limits
3. Conversation context too large

**Solutions:**
- The bot now automatically retries with simplified prompts
- Both personalities have no content restrictions to minimize safety blocks
- Clear conversation history with `/clear` if context grows too large

### Rate Limit Errors

**Symptoms:**
- "Rate limit exceeded" messages
- Bot stops responding

**Solutions:**
- Wait 1 minute for per-minute limit reset
- Check `/status` to see current usage
- Configured with 10% safety margin (9 RPM, 450 daily)

### Bot Personality Inconsistency

**Symptoms:**
- Bot sometimes roasts, sometimes doesn't
- Conflicting messages about content restrictions

**Solutions:**
- This is intentional! The bot uses dynamic probability
- Check current mood with `/status`
- Adjust `ROAST_BASE_CHANCE` in .env for consistent behavior

### Code Execution Not Working

**Symptoms:**
- `/execute` command says feature is disabled

**Solutions:**
- Set `ENABLE_CODE_EXECUTION=true` in .env file
- Restart the bot after changing settings

### Missing Dependencies

**Symptoms:**
- Import errors when starting bot
- "Cannot find module" errors

**Solutions:**
```bash
npm install
```

### Bot Not Responding to Mentions

**Symptoms:**
- @mentioning the bot does nothing
- No typing indicator appears

**Solutions:**
- Ensure bot has proper permissions in the channel
- Check if bot has MESSAGE_CONTENT intent enabled
- Verify bot is online with `/status`

## Debug Mode

Add to .env for verbose logging:
```env
LOG_LEVEL=debug
```

## Package Information

- **NPM Package**: `@google/genai` v1.4.0
- **Main Class**: `GoogleGenAI`
- **Import**: `import { GoogleGenAI } from '@google/genai';`

## Error Handling Features

The bot includes:
- Automatic retry on empty responses
- Safety filter detection with friendly messages
- Detailed logging for debugging
- Graceful error messages to users