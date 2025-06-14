# Dynamic Response Handling for Discord

## Overview
Implemented intelligent response handling that allows Gemini to generate longer responses while automatically formatting them for Discord's 2000 character limit.

## Changes Made

### 1. Increased Token Limit
- Changed `GEMINI_MAX_TOKENS` from 1024 to 8192 in `.env`
- This prevents MAX_TOKENS errors for complex questions
- Allows thinking mode to work properly without running out of tokens

### 2. MAX_TOKENS Error Handling
- MAX_TOKENS finish reason now returns a user-friendly message instead of throwing an error
- No more retry loops when responses are too long
- Clear guidance provided to users when this happens

### 3. Intelligent Response Formatting
- Created `thinkingFormatter.ts` with two key functions:
  - `formatThinkingResponse()`: Ensures thinking + response fits in 2000 chars
  - `splitThinkingResponse()`: Intelligently splits long responses across messages

### 4. Priority-Based Truncation
When a response with thinking is too long:
1. Prioritizes showing the actual answer over thinking process
2. Truncates thinking first (with "... (truncated)" indicator)
3. Ensures at least 500 chars for the actual response
4. Only truncates response if absolutely necessary

### 5. Multi-Message Support
For very long responses:
- First message contains beginning of thinking process
- Subsequent messages continue thinking with "..." indicators
- Response section stays together when possible
- Clean formatting maintained across message boundaries

## Benefits

1. **No More Token Errors**: Users can ask complex questions without errors
2. **Better UX**: Automatic handling instead of asking users to shorten prompts
3. **Thinking Visibility**: Thinking process is preserved when space allows
4. **Answer Priority**: Actual answers are never lost due to long thinking
5. **Clean Formatting**: Professional appearance even when split

## Configuration

```env
# Recommended settings for thinking mode
GEMINI_MAX_TOKENS=8192      # Allow plenty of generation space
THINKING_BUDGET=250         # Reasonable thinking depth
INCLUDE_THOUGHTS=true       # Show thinking when it fits
```

## How It Works

1. Gemini generates response with up to 8192 tokens
2. If thinking is included, formatter ensures it fits in Discord's limit
3. If too long, thinking is truncated first, preserving the answer
4. If still too long, response is split intelligently across messages
5. Each message maintains proper formatting with continuation indicators

## Example Output

**Single Message (fits in 2000 chars):**
```
💭 **Thinking:**
[Full thinking process]

**Response:**
[Complete answer]
```

**Multiple Messages (too long):**
```
Message 1:
💭 **Thinking:**
[Beginning of thinking process]...

Message 2:
...[Rest of thinking]

**Response:**
[Complete answer]
```

**Truncated Thinking (prioritizes answer):**
```
💭 **Thinking:**
[Partial thinking]
... (truncated)

**Response:**
[Complete answer preserved]
```