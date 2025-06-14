# Force Thinking Mode Configuration

## Overview
While Gemini 2.5 Flash determines when to use thinking based on prompt complexity, we can encourage it through prompt engineering.

## Configuration Options

### 1. Basic Thinking Configuration
```bash
# .env settings
THINKING_BUDGET=250        # Token budget for thinking
INCLUDE_THOUGHTS=true      # Show thinking in responses
```

### 2. Force Thinking Mode (Prompt Engineering)
```bash
# Add to .env to encourage thinking on every request
FORCE_THINKING_PROMPT=true
THINKING_TRIGGER="Please think step-by-step before answering."
```

### Alternative Thinking Triggers
You can customize `THINKING_TRIGGER` with different phrases:

```bash
# More explicit
THINKING_TRIGGER="Think carefully about this question step-by-step before providing your answer."

# Mathematical/logical emphasis
THINKING_TRIGGER="Analyze this problem systematically and show your reasoning process."

# Creative emphasis
THINKING_TRIGGER="Consider multiple perspectives and approaches before responding."

# Concise
THINKING_TRIGGER="Think step-by-step."
```

## How It Works

1. **Model Behavior**: Gemini 2.5 Flash has thinking built-in and decides when to use it
2. **Prompt Engineering**: Adding thinking triggers increases the likelihood of activation
3. **Not Guaranteed**: Even with triggers, simple questions may not activate thinking
4. **Token Budget**: The `THINKING_BUDGET` sets the maximum tokens for thinking

## Testing Force Thinking

After setting `FORCE_THINKING_PROMPT=true`, test with both simple and complex prompts:

### Simple Test (may not trigger thinking even with force enabled):
```
@bot What's 2+2?
```

### Complex Test (should definitely trigger thinking):
```
@bot If I have a box with 15 red balls and 10 blue balls, and I remove them randomly one at a time, what's the probability the last ball is red?
```

## Important Notes

1. **API Behavior**: The model ultimately decides whether to use thinking based on:
   - Prompt complexity
   - Presence of thinking triggers
   - Type of task (math, logic, creative writing, etc.)

2. **Token Usage**: Forcing thinking on simple questions wastes tokens:
   - Simple: "What's 2+2?" - Thinking adds no value
   - Complex: Multi-step problems - Thinking improves accuracy

3. **Best Practice**: Consider using force thinking selectively:
   - Enable for complex problem-solving sessions
   - Disable for casual chat or simple queries
   - Monitor token usage (500 requests/day limit on free tier)

## Monitoring

With the enhanced logging, you'll see:
```
info: Force thinking prompt enabled with trigger: "Please think step-by-step before answering."
info: Executing text-only Gemini API call using model: gemini-2.5-flash-preview-05-20, thinking budget: 250 tokens
info: Thinking mode active: Found XXX characters of thinking text
```

## Recommendation

For your use case (maximum accuracy), I recommend:
```bash
# Balanced approach
THINKING_BUDGET=250
INCLUDE_THOUGHTS=true
FORCE_THINKING_PROMPT=false  # Only enable when needed
```

This avoids wasting tokens on simple queries while still allowing thinking for complex problems.