# Google Search URL Duplication Fix Report

## Issue Description
When Google Search grounding is enabled (`GEMINI_ENABLE_GOOGLE_SEARCH=true`), URLs from search results were appearing twice in bot responses:
1. Once as markdown links within the response text (formatted by Gemini)
2. Again in the appended "Sources:" section

### Example of the Problem
**Bot Response:**
```
Based on my search, Discord bots can be created using the [Discord Developer Portal](https://discord.com/developers/).

**Sources:**
[1] Discord Developer Portal - https://discord.com/developers/
```

The same URL appears twice - once as a clickable markdown link and once as plain text.

## Root Cause Analysis
The issue occurred in `src/services/gemini.ts` in the `processAndValidateResponse` method:
1. Gemini's Google Search integration automatically formats URLs as markdown links in the response
2. The bot was unconditionally appending ALL grounding sources to the response
3. No check was performed to see if URLs were already present in the response text

## Solution Implemented
Modified the grounding source processing logic to:
1. Check if each URL is already present in the response (either as plain text or in markdown format)
2. Only include sources in the "Additional Sources" section if they're NOT already in the response
3. Changed the section heading from "Sources:" to "Additional Sources:" for clarity
4. Added detailed logging to track which sources are included/excluded

### Code Changes
**File:** `src/services/gemini.ts` (lines 1676-1720)

**Key Logic:**
```typescript
// Check which URLs are already present in the response text
const urlsNotInResponse = groundingData.sources.filter(source => {
  if (!source.url) return false;
  
  // Check if URL appears in the response as plain text or in markdown link format
  const urlInPlainText = processed.text.includes(source.url);
  const urlInMarkdown = processed.text.includes(`(${source.url})`);
  
  // Only include sources that aren't already mentioned in the response
  return !urlInPlainText && !urlInMarkdown;
});
```

## Testing & Verification
Created comprehensive tests to verify the fix handles:
- URLs in markdown link format: `[text](url)` - NOT included in Additional Sources
- URLs as plain text: `https://example.com` - NOT included in Additional Sources  
- URLs not mentioned in response - INCLUDED in Additional Sources
- Partial URL matches - correctly handled

## Benefits
1. **Cleaner Responses**: No more duplicate URLs cluttering the message
2. **Better UX**: Users see each URL only once, reducing confusion
3. **Smarter Formatting**: Only truly additional sources are listed separately
4. **Maintained Functionality**: All source attribution is preserved

## Configuration
No configuration changes required. The fix works automatically when Google Search is enabled.

## Monitoring
The fix includes enhanced logging:
- Reports how many sources were found
- Reports how many were already in the text
- Reports how many additional sources were added

Example log output:
```
Added 2 additional grounding sources to response (3 already in text)
```
or
```
All 5 grounding sources already present in response text, skipping Sources section
```

## Future Considerations
1. Could add configuration option to force showing all sources if desired
2. Could enhance to detect partial URL matches or URL shorteners
3. Could format sources differently based on how they appear in the response

## Status
✅ **Fixed and Deployed** - URLs will no longer be duplicated in bot responses when Google Search grounding is enabled.