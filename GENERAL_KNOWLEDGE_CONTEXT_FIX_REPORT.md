# General Knowledge Context Fix Report

## Issue
The Discord bot was including irrelevant Discord-specific context (like admin status, days on server) when answering general knowledge questions such as math problems, trivia, or technical queries.

## Example
When asked about a probability problem with colored balls, the bot responded with:
> "jOdaxd, you've been an admin on this digital shithole for 3551 days, and you're asking about the color of the last ball?"

This personal information was irrelevant to the mathematical question being asked.

## Root Cause
The `aggregateContextSources` method in GeminiService was always including Discord user context for all prompts except basic image analysis. There was no mechanism to detect when a query was a general knowledge question that didn't benefit from personal context.

## Solution Implemented

### 1. General Knowledge Detection
Added a new method `isGeneralKnowledgeQuery()` that identifies questions that don't need personal context:

```typescript
private isGeneralKnowledgeQuery(prompt: string): boolean {
  // Checks for:
  // - Math/probability questions
  // - Science/academic questions
  // - Trivia/factual questions
  // - Coding/technical questions
  // - General what/how/why questions
  // - Excludes queries with personal pronouns (my, me, I, etc.)
}
```

### 2. Context Aggregation Update
Modified the context aggregation logic to skip Discord context for both:
- Basic image analysis requests (existing)
- General knowledge queries (new)

### 3. Pattern Matching
The detection uses regex patterns to identify:
- Mathematical operations and probability keywords
- Scientific/academic terminology
- Factual question patterns (who was, when did, etc.)
- Technical/coding queries
- General knowledge patterns without personal references

## Benefits
1. **Focused Responses**: General knowledge questions get direct answers without irrelevant personal information
2. **Maintained Personalization**: Questions with personal pronouns still receive contextual responses
3. **Better User Experience**: Responses are more appropriate to the query type

## Testing Scenarios
- ✅ Math questions: "What's the probability of drawing a red ball?"
- ✅ Science questions: "Explain quantum mechanics"
- ✅ Trivia: "Who invented the telephone?"
- ✅ Coding: "How do I implement a binary search?"
- ✅ Personal questions: "What's my role on this server?" (still includes context)

## Files Modified
- `/src/services/gemini.ts` - Added general knowledge detection and updated context aggregation logic