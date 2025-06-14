# Multimodal Accuracy Improvements

## Overview

This document describes the improvements made to enhance image recognition accuracy in the Discord bot, specifically addressing issues with character and scene identification in images.

## Problem Statement

The bot previously misidentified characters in images (e.g., identifying Turd Ferguson from SNL as Bill Hader as "Fred Blassie"). This was due to using generic parameters that weren't optimized for visual understanding tasks.

## Solution

### 1. Configuration Profiles

Created specialized configuration profiles in `/src/config/geminiConfig.ts` with different optimization strategies:

- **HIGH_ACCURACY_VISION**: Optimized for maximum accuracy in image recognition
  - Model: `gemini-pro-vision` (specialized for vision tasks)
  - Temperature: 0.1 (very low for deterministic responses)
  - TopK: 10 (narrow selection for consistency)
  - TopP: 0.8 (focus on high-probability tokens)

- **BALANCED_VISION**: Good accuracy with reasonable response times
  - Model: `gemini-2.0-flash`
  - Temperature: 0.3
  - TopK: 20
  - TopP: 0.9

- **FAST_VISION**: Prioritizes speed while maintaining reasonable accuracy
  - Model: `gemini-1.5-flash`
  - Temperature: 0.5
  - TopK: 40
  - TopP: 0.95

### 2. System Instructions

Added specialized system instructions for vision tasks that guide the model to:
- Focus on identifying specific characters, costumes, and visual details
- Consider context, setting, and visible text
- Draw from knowledge of popular culture, TV shows, movies, and memes
- Provide confidence levels when uncertain
- Be specific about visual elements that led to identification

### 3. Model Selection

The bot now automatically selects appropriate models based on the task:
- Uses specialized vision models for image analysis
- Falls back to general models for text-only requests
- Configurable via environment variables

## Configuration

### Environment Variables

```bash
# Select vision profile (default: HIGH_ACCURACY_VISION)
GEMINI_VISION_PROFILE=HIGH_ACCURACY_VISION

# Override specific parameters (model defaults to free tier)
GEMINI_MODEL=gemini-2.5-flash-preview-05-20  # Only free model currently
GEMINI_TEMPERATURE=0.1
GEMINI_TOP_K=10
GEMINI_TOP_P=0.8
GEMINI_MAX_TOKENS=2048
```

**Important**: All profiles use `gemini-2.5-flash-preview-05-20` by default (the free tier model with 10 RPM and 500 req/day limits). The model can be overridden via `GEMINI_MODEL` environment variable when other models become available.

### Available Profiles

1. **HIGH_ACCURACY_VISION** - Best for character/person recognition
2. **BALANCED_VISION** - General purpose with good accuracy
3. **FAST_VISION** - Quick responses with acceptable accuracy
4. **CREATIVE_VISION** - For exploratory interpretations
5. **LEGACY** - Previous configuration (backward compatibility)

## Key Parameters Explained

### Temperature (0.0 - 1.0)
- **Lower values (0.1-0.3)**: More deterministic, consistent, and accurate
- **Higher values (0.7-1.0)**: More creative but less accurate

### TopK
- **Lower values (10-20)**: More focused selection, better for accuracy
- **Higher values (40-50)**: Broader selection, more variety

### TopP
- **Lower values (0.8-0.9)**: Focus on high-probability responses
- **Higher values (0.95-1.0)**: Include more diverse options

## Implementation Details

The improvements are implemented in:
- `/src/config/geminiConfig.ts` - Configuration profiles and settings
- `/src/services/gemini.ts` - Updated to use dynamic configuration

The bot automatically detects when images are attached and switches to the appropriate vision profile for optimal accuracy.

## Testing

To test the improvements:
1. Send an image with a character recognition query
2. The bot will use the HIGH_ACCURACY_VISION profile by default
3. Monitor logs to see which model and configuration is being used

## Future Improvements

Potential enhancements:
1. Image preprocessing (resolution optimization, format conversion)
2. Multi-image context understanding
3. Video frame analysis
4. OCR integration for text extraction
5. Confidence scoring and fallback strategies