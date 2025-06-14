# Vision Accuracy Configuration Guide

## Problem
Your Discord bot is having trouble accurately identifying SNL characters in images despite recognizing that the content is from SNL.

## Solution: Optimized Configuration for Maximum Accuracy

### 1. Environment Variables (.env)

Add these settings to your `.env` file for maximum accuracy:

```bash
# Use SNL-specific profile for character recognition
GEMINI_VISION_PROFILE=SNL_EXPERT

# Fine-tuned parameters for accuracy
GEMINI_TEMPERATURE=0.05     # Ultra-low for deterministic responses
GEMINI_TOP_K=5              # Very narrow token selection
GEMINI_TOP_P=0.7            # Tight probability focus
GEMINI_MAX_TOKENS=4096      # Allow detailed analysis

# Optional: When you upgrade to paid tier
# GEMINI_MODEL=gemini-1.5-pro-vision
```

### 2. Why These Settings Improve Accuracy

- **Temperature (0.05)**: Lower temperature makes the model more deterministic and consistent. For character recognition, we want the most probable answer, not creative variations.

- **Top-K (5)**: Limits token selection to only the 5 most likely options at each step. This prevents the model from considering unlikely character identifications.

- **Top-P (0.7)**: Further restricts token selection by cumulative probability. Combined with low Top-K, this ensures only high-confidence predictions.

- **Max Tokens (4096)**: Allows the model to provide detailed reasoning about why it identified a specific character, improving accuracy through analysis.

- **SNL-Specific System Instruction**: The custom prompt specifically mentions SNL characters, sketches, and visual cues unique to the show.

### 3. Model Limitations

Currently using the free `gemini-2.5-flash-preview-05-20` model, which has:
- 10 requests per minute limit
- 500 requests per day limit
- Lower accuracy compared to paid models

For best results, consider upgrading to:
- `gemini-1.5-pro-vision`: Best accuracy for visual tasks
- `gemini-1.5-flash`: Good balance of speed and accuracy

### 4. Testing Your Configuration

After updating your `.env` file:

1. Restart your bot:
   ```bash
   npm run dev
   ```

2. Test with various SNL character images:
   - Classic characters (Church Lady, Wayne, Garth)
   - Modern characters (Stefon, Target Lady)
   - Prosthetic-heavy characters (to test visual recognition)

3. Monitor logs for the profile being used:
   ```
   Executing multimodal Gemini API call with 1 image(s) using model: gemini-2.5-flash-preview-05-20
   ```

### 5. Additional Optimization Tips

1. **Image Quality**: Ensure images are:
   - Clear and well-lit
   - At least 224x224 pixels
   - Under 4MB in size
   - In JPEG, PNG, or WebP format

2. **Context Clues**: When asking about images, provide context:
   - ❌ "Who is this?"
   - ✅ "What SNL character is this?"
   - ✅ "Which cast member is playing this character?"

3. **Multiple Attempts**: If accuracy is still low, the model might need:
   - Multiple images from different angles
   - Images with visible text or logos
   - Screenshots that include the SNL set

### 6. Debugging Poor Recognition

If the bot still struggles:

1. Check logs for the actual parameters being used
2. Verify the vision profile is set correctly: `GEMINI_VISION_PROFILE=SNL_EXPERT`
3. Try even lower temperature (0.01) for more deterministic results
4. Consider implementing a retry mechanism with slightly different prompts

### 7. Example Test Prompts

```
// With an image of Church Lady
"What SNL character is shown in this image?"

// With an image of Stefon
"Which Bill Hader character from Weekend Update is this?"

// With an image from Wayne's World
"Name the SNL sketch and characters in this image"
```

## Summary

The key to improving accuracy is:
1. Use ultra-low temperature (0.05)
2. Restrict token selection (topK=5, topP=0.7)  
3. Use SNL-specific system instructions
4. Provide adequate context in prompts
5. Ensure high-quality images

These settings prioritize accuracy over creativity, which is exactly what you need for character recognition tasks.