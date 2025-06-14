# Thinking Mode Verification Guide

## How to Verify Thinking Mode is Working

### 1. Check Console Logs
After rebuilding and restarting the bot, you should see these log messages:

```
info: Executing text-only Gemini API call using model: gemini-2.5-flash-preview-05-20, thinking budget: 250 tokens
```

Then after the response:
```
info: Thinking mode active: Found XXX characters of thinking text
info: Included thinking in response (XXX chars)
```

OR if no thinking was needed:
```
info: No thinking text found in response (thinking may not be supported or no complex reasoning needed)
```

### 2. Types of Questions That Trigger Thinking

According to Google's documentation, thinking mode is most likely to activate for:
- Complex reasoning problems
- Multi-step math problems
- Logic puzzles
- Code analysis and debugging
- Creative writing with constraints
- Scientific explanations requiring step-by-step reasoning

### 3. Test Prompts to Verify Thinking

Try these prompts that should trigger thinking:

```
@bot If I have 3 apples and you have twice as many as me, and then we both give half our apples to charity, how many apples do we have in total?

@bot Write a haiku about recursion that itself demonstrates recursion

@bot Debug this code: for(i=0;i<10;i++) { console.log(arr[i]); } // throws error sometimes

@bot What weighs more: a pound of feathers or a pound of steel? Explain your reasoning step by step.
```

### 4. Visual Confirmation in Discord

With `INCLUDE_THOUGHTS=true`, you'll see:
```
💭 **Thinking:**
[The AI's reasoning process]

**Response:**
[The actual answer]
```

### 5. Monitoring Token Usage

The thinking budget affects your API usage:
- Each thinking token counts toward your daily limit (500 requests/day on free tier)
- Monitor in logs: The bot shows daily usage after each request

### 6. Troubleshooting

If you don't see thinking in responses:
1. **Simple Questions**: Not all prompts require thinking (e.g., "What's 2+2?")
2. **Model Support**: Ensure you're using `gemini-2.5-flash-preview-05-20`
3. **Configuration**: Verify `THINKING_BUDGET` is set (not 0)
4. **API Response**: The model decides when to use thinking based on complexity

### Note on Thought Summaries

The Google documentation mentions thought summaries, but these are:
- Not applicable to Discord (no UI elements for summaries)
- Meant for applications with sophisticated interfaces
- Less useful than full thinking text in conversational contexts

For Discord, showing the full thinking process (when enabled) provides the most value to users.