# Partial Video Processing Implementation Report

## Overview
Implemented partial video processing capability for YouTube videos that exceed the 25k token limit. When a video is longer than approximately 83 seconds, the system will automatically process as much as possible and inform the user about the partial analysis.

## Implementation Details

### 1. Video Metadata Handling (`youtubeUrlDetector.ts`)
- **Token Estimation**: Videos consume approximately 300 tokens per second (18,000 per minute)
- **Maximum Processable Duration**: 83 seconds (25,000 tokens ÷ 300 tokens/second)
- **Configuration**:
  ```typescript
  const DEFAULT_CONFIG: TokenCostConfig = {
    baseTokensPerMinute: 18000,  // 300 tokens/second * 60
    maxVideoLengthSeconds: 600,  // 10 minutes max
    warningThresholdTokens: 5000,
    maxTokensPerVideo: 25000     // Gemini's limit
  };
  ```

### 2. Key Methods Added
- **`calculateProcessableDuration(totalDuration)`**: Determines how much of a video can be processed within token limits
- **`needsPartialProcessing(duration)`**: Checks if video exceeds token limit
- **`generateVideoMetadata(duration)`**: Creates metadata with start/end offsets for Gemini API
- **`generatePartialProcessingMessage()`**: Creates user-friendly notification about partial processing

### 3. Gemini API Integration (`multimodalContentHandler.ts`)
- **Video Metadata Support**: Added support for `videoMetadata` with `startOffset` and `endOffset`
- **Content Structure**:
  ```javascript
  {
    fileData: {
      mimeType: 'video/mp4',
      fileUri: 'gs://youtube-videos/videoId.mp4'
    },
    videoMetadata: {
      startOffset: '0s',
      endOffset: '83s'  // Process first 83 seconds
    }
  }
  ```

### 4. User Messaging (`responseProcessingService.ts`)
- **Partial Processing Notification**: Automatically prepends partial processing messages to responses
- **Enhanced Multimodal Processing**: Distinguishes between video and image attachments
- **Warning System**: Adds warnings about partial processing to response metadata

## Examples

### 1. Short Video (Under Limit)
```
User: @Bot https://youtu.be/abc123 (60 second video)
Bot: [Processes entire video without notification]
```

### 2. Long Video (Exceeds Limit)
```
User: @Bot https://youtu.be/xyz789 (5 minute video)
Bot: 📹 **Partial Video Analysis**: Processing first 1m 23s of 5m 0s video (28% coverage) due to token limits.

[Analysis of the first 83 seconds follows...]
```

### 3. Warning Messages
- **Under limit**: "🎥 Processing video (1m 0s) - Using 18,000 tokens..."
- **Over limit**: "⚠️ This video (5m 0s) exceeds the token limit. I'll process the first **1m 23s** of the video (approximately 25,000 tokens)."

## Technical Approach

### Token Calculation
```typescript
// Estimate tokens for a video
estimateTokenCost(durationSeconds: number): number {
  const durationMinutes = durationSeconds / 60;
  const estimatedTokens = Math.ceil(durationMinutes * this.config.baseTokensPerMinute);
  return Math.min(estimatedTokens, this.config.maxTokensPerVideo);
}
```

### Partial Processing Detection
```typescript
// Check if partial processing needed
needsPartialProcessing(durationSeconds: number): boolean {
  const durationMinutes = durationSeconds / 60;
  const actualTokens = Math.ceil(durationMinutes * this.config.baseTokensPerMinute);
  return actualTokens > this.config.maxTokensPerVideo;
}
```

## File Changes

### Modified Files
1. **`src/utils/youtubeUrlDetector.ts`** (lines: 39-54, 150-239, 410-429)
   - Added token limit configuration
   - Implemented partial processing methods
   - Enhanced warning messages

2. **`src/services/multimodalContentHandler.ts`** (lines: 566-583, 725-776)
   - Added video metadata support in Gemini parts conversion
   - Updated processYouTubeVideo to handle partial processing

3. **`src/services/responseProcessingService.ts`** (lines: 399-462)
   - Enhanced processMultimodalResponse for video attachments
   - Added partial processing message injection

4. **`src/services/interfaces/MultimodalContentInterfaces.ts`** (lines: 44-49)
   - Extended ProcessedAttachment metadata interface

## Benefits
1. **Always Process Content**: Users get value even from long videos
2. **Clear Communication**: Users understand exactly what portion was analyzed
3. **Token Efficiency**: Maximizes usage within the 25k token limit
4. **Graceful Degradation**: No failures - always process what's possible

## Future Enhancements
1. Allow users to specify which portion of video to process (e.g., "analyze from 2:00 to 3:23")
2. Implement video chunking to process multiple segments
3. Add support for timestamp-based analysis
4. Cache processed video segments for efficient re-analysis