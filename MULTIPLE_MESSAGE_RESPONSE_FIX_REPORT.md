# Multiple Message Response Fix Report - v2

## Issue Summary
The Discord bot was sending 7 responses for a single user mention. This was an evolution of the previous issue where the bot was sending 6 responses. The issue manifested as:
- Exactly 7 different responses being generated
- Each response going through the full processing flow (rate limiting, roast decision, API call)
- All responses appearing to be sent simultaneously

## Root Cause Analysis

### Observed Behavior
From the console logs, we observed:
1. The message was being processed multiple times (2 times initially)
2. Rate limiter was being called 7 times with "Minute window reset" logs
3. Roasting engine made 7 separate decisions with different outcomes
4. Gemini API was called 7 times successfully

### Suspected Root Causes
1. **Multiple Event Listener Registration**: The MessageCreate event handler was being registered 7 times
2. **Discord Client Reconnection**: Possible automatic reconnections causing re-registration
3. **Build/Deployment Issues**: Possible multiple bot instances running simultaneously

## Solution Implemented

### 1. Enhanced Debug Logging
Added comprehensive logging to track:
- Setup handler calls with unique IDs
- Client ID tracking
- Event handler registration count
- Listener count verification

```typescript
let setupCallCount = 0;

export function setupEventHandlers(
  client: Client,
  geminiService: IAIService,
  raceConditionManager: RaceConditionManager
): void {
  setupCallCount++;
  const setupId = Math.random().toString(36).substring(7);
  const clientId = client.user?.id || 'unknown';
  
  logger.info(`[SETUP-${setupId}] setupEventHandlers called (call #${setupCallCount}, client ID: ${clientId})`);
```

### 2. Remove Existing Listeners
Added code to remove all existing event listeners before registering new ones:

```typescript
// Remove all existing listeners first to prevent duplicates
logger.info(`[SETUP-${setupId}] Removing existing event listeners...`);
client.removeAllListeners(Events.InteractionCreate);
client.removeAllListeners(Events.MessageReactionAdd);
client.removeAllListeners(Events.MessageCreate);
```

### 3. Listener Count Verification
Added verification to check the number of registered listeners after setup:

```typescript
const messageCreateListeners = client.listenerCount(Events.MessageCreate);
const interactionListeners = client.listenerCount(Events.InteractionCreate);
const reactionListeners = client.listenerCount(Events.MessageReactionAdd);

logger.info(`[SETUP-${setupId}] Listener counts - MessageCreate: ${messageCreateListeners}, InteractionCreate: ${interactionListeners}, MessageReactionAdd: ${reactionListeners}`);
```

### 4. Unique Handler IDs
Each message handler instance gets a unique ID to track which handler is processing messages:

```typescript
const messageHandlerId = Math.random().toString(36).substring(7);
client.on(Events.MessageCreate, async (message) => {
  logger.info(`[MSG-HANDLER-${messageHandlerId}] MessageCreate event fired for message ${message.id}`);
  await handleMessageCreate(message, client, geminiService, raceConditionManager);
});
```

## Prevention Measures

1. **WeakSet Tracking**: Continues to use WeakSet to track client instances
2. **Explicit Listener Removal**: Always remove existing listeners before adding new ones
3. **Call Count Tracking**: Monitor how many times setupEventHandlers is called
4. **Client ID Verification**: Track which Discord client ID is being used

## Testing Recommendations

1. **Clean Start Test**: Kill all bot processes and start fresh
2. **Single Instance Verification**: Ensure only one bot instance is running
3. **Listener Count Check**: Monitor logs for listener count after setup
4. **Message Test**: Send a mention and verify only one response is generated

## Files Modified

1. `/src/handlers/eventHandlers.ts` - Added comprehensive debugging and listener management
2. `/src/index.ts` - Added ready event tracking

## Next Steps

1. Monitor the bot after restart to verify the fix
2. Check if setupEventHandlers is called multiple times
3. Verify listener counts remain at 1 for each event type
4. Consider implementing a more robust event handler registry pattern if issues persist

## Conclusion

The multiple message issue appears to be caused by event listeners being registered multiple times. The solution implemented removes existing listeners before adding new ones and adds comprehensive logging to track the registration process. This should prevent duplicate event handling and ensure only one response per message.