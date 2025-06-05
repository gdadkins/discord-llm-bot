# Structured Output Examples

This document explains how structured output works when `ENABLE_STRUCTURED_OUTPUT=true`.

## Overview

Structured output ensures the AI returns responses in a consistent JSON format, making it easier to:
- Parse responses programmatically
- Extract specific information (code, explanations, metadata)
- Build rich Discord embeds with formatted content
- Handle different response types consistently

## Use Cases

### 1. Code Execution Responses

When users run `/execute` with structured output enabled:

**User Input:**
```
/execute code: Calculate the first 10 Fibonacci numbers
```

**Raw API Response (JSON):**
```json
{
  "explanation": "I'll calculate the first 10 Fibonacci numbers using Python",
  "code": "def fibonacci(n):\n    fib = [0, 1]\n    for i in range(2, n):\n        fib.append(fib[i-1] + fib[i-2])\n    return fib\n\nresult = fibonacci(10)\nprint(f\"First 10 Fibonacci numbers: {result}\")",
  "output": "First 10 Fibonacci numbers: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]",
  "visualizations": []
}
```

**What Users See (formatted):**
```
I'll calculate the first 10 Fibonacci numbers using Python

```python
def fibonacci(n):
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    return fib

result = fibonacci(10)
print(f"First 10 Fibonacci numbers: {result}")
```

**Output:**
First 10 Fibonacci numbers: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```

### 2. Regular Chat with Metadata

For normal `/chat` commands, structured output could provide additional context:

**User Input:**
```
/chat message: What's the weather like on Mars?
```

**Raw API Response (JSON):**
```json
{
  "response": "Mars has extreme weather! Average temperature is -80°F (-60°C), with massive dust storms that can cover the entire planet for months. The atmosphere is 95% carbon dioxide with almost no oxygen.",
  "mood": "helpful",
  "confidence": 0.98,
  "suggestions": [
    "Ask about Mars rovers",
    "Learn about terraforming Mars",
    "Compare Earth and Mars atmospheres"
  ]
}
```

**What Users See:**
Just the main response text, but the bot could use the metadata to:
- Adjust its personality based on mood
- Show confidence indicators
- Provide follow-up suggestions as buttons

### 3. Error Handling

Structured output also helps with consistent error responses:

```json
{
  "response": "I couldn't execute that code due to a syntax error",
  "error": true,
  "errorType": "SyntaxError",
  "errorDetails": "Unexpected token on line 3",
  "suggestion": "Check your Python syntax, especially indentation"
}
```

## When NOT to Use Structured Output

1. **Simple conversations** - Adds unnecessary complexity
2. **Creative writing** - Can limit the AI's natural flow
3. **When you don't need metadata** - Just uses more tokens

## Implementation Note

Currently, structured output is prepared in the code but requires the @google/genai package to be updated. Once available, the bot will:

1. Send requests with the defined schema
2. Parse the JSON response
3. Extract and format the relevant fields
4. Handle any parsing errors gracefully

## Configuration

Enable in `.env`:
```env
ENABLE_STRUCTURED_OUTPUT=true
```

This feature is completely optional and disabled by default to keep responses simple and token-efficient.

## Technical Notes

- Uses `@google/genai` v1.4.0 package
- Class: `GoogleGenAI` (not `GoogleGenerativeAI`)
- Feature awaiting full SDK support for configuration options