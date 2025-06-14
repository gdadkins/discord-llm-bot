# Video Support Architecture Analysis and Technical Specification

**Agent 1 Report**: Comprehensive analysis for implementing Gemini 2.5 Flash video processing capabilities in the Discord bot.

## Executive Summary

This document provides a detailed technical specification for implementing video support in the Discord bot using Gemini 2.5 Flash's multimodal capabilities. The analysis reveals that video processing can leverage existing multimodal infrastructure but requires significant enhancements for token cost management, file size handling, and processing method selection.

**Critical Finding**: Video processing has extremely high token costs (~300 tokens/second = 18,000 tokens/minute), requiring careful implementation to prevent quota exhaustion.

## Current Architecture Analysis

### 1. MultimodalContentHandler.ts Analysis

**Current Image Processing Pattern** (Lines 123-163):
- **Entry Point**: `processDiscordAttachments()` method
- **Validation**: MIME type filtering against `supportedMimeTypes` array (line 29)
- **Size Limits**: 20MB max file size (line 28)
- **Processing**: CDN fetch → base64 encoding → Gemini Parts format
- **Error Handling**: Comprehensive error types with user-friendly messages

**Key Architecture Patterns**:
- Configuration-driven processing via `MultimodalConfig` interface
- Provider-agnostic content building with `convertToProviderFormat()`
- Atomic processing per attachment with detailed error context
- Memory-efficient streaming for large files

### 2. GeminiService.ts Integration Pattern

**Multimodal API Call Structure** (Lines 902-1046):
- **Detection Logic**: `isMultimodal` flag based on attachment presence (line 922)
- **Content Building**: Uses MultimodalContentHandler to create Gemini `Content` format (lines 934-938)
- **API Configuration**: Dynamic model selection based on content type (lines 913-917)
- **Response Processing**: Delegated to ResponseProcessingService

**Integration Points**:
- Line 442-448: Image attachments parameter in `generateResponse()`
- Line 926-932: ProcessedAttachment mapping for multimodal content
- Line 942-944: System instruction injection for vision tasks

### 3. Rate Limiting and Token Cost Infrastructure

**Current Rate Limiting** (RateLimiter.ts):
- **Metrics**: RPM (requests per minute) and daily request limits
- **Safety Margin**: 90% of actual API limits (line 54)
- **No Token Awareness**: Current system only tracks request count, not token consumption

**Gap Analysis**: Video processing requires token-aware rate limiting due to variable token costs per request.

## Video Support Technical Specification

### 1. Supported Video Formats and Processing Methods

**Supported MIME Types** (Per Gemini 2.5 Flash specification):
```typescript
const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/mpeg', 
  'video/mov',
  'video/avi',
  'video/x-flv',
  'video/mpg',
  'video/webm',
  'video/wmv',
  'video/3gpp'
];
```

**Processing Methods**:

1. **Inline Processing** (Files ≤20MB):
   - Direct base64 encoding similar to current image processing
   - Suitable for short video clips
   - Uses existing CDN fetch infrastructure

2. **File API Processing** (Files >20MB):
   - Upload to Google Cloud Storage
   - Reference via `fileData.fileUri` in Gemini request
   - Requires additional file management infrastructure

3. **YouTube URL Processing**:
   - Direct URL processing via `fileData.fileUri`
   - No file upload required
   - Immediate processing capability

### 2. Token Cost Management Framework

**Token Calculation Formula**:
```
Video Tokens = Duration (seconds) × 300 tokens/second
```

**Cost Examples**:
- 10-second clip: 3,000 tokens
- 30-second clip: 9,000 tokens  
- 1-minute video: 18,000 tokens
- 5-minute video: 90,000 tokens

**Required Rate Limiting Enhancements**:
- Token-aware rate limiting alongside request-based limits
- Pre-processing token estimation and user warnings
- Dynamic token budget allocation per user

### 3. File Size and Duration Limits

**Recommended Limits**:
- **Phase 1**: YouTube URLs only (no file size limits)
- **Phase 2**: ≤30 seconds duration (≤9,000 tokens)
- **Phase 3**: ≤2 minutes duration (≤36,000 tokens) with user warnings

**Size Validation Strategy**:
- Pre-upload duration estimation via metadata
- Progressive disclosure of costs to users
- Graceful degradation for oversized content

## Integration Points Analysis

### 1. MultimodalContentHandler.ts Modifications

**File: `/mnt/c/github/discord/discord-llm-bot/src/services/multimodalContentHandler.ts`**

**Line 29**: Extend `supportedMimeTypes` array
```typescript
supportedMimeTypes: [
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
  // Add video MIME types
  ...VIDEO_MIME_TYPES
]
```

**Line 123**: Enhance `processDiscordAttachments()` method
- Add video format detection
- Implement duration-based validation
- Add token cost estimation

**Line 349**: Extend `processSingleAttachment()` method
- Add video-specific processing logic
- Implement File API upload for large videos
- Add metadata extraction (duration, resolution)

**New Methods Required**:
```typescript
// Line ~632: Add after convertToOpenAIFormat()
private async processVideoAttachment(attachment: Attachment): Promise<ProcessedAttachment>
private estimateVideoDuration(videoBuffer: ArrayBuffer): Promise<number>
private shouldUseFileAPI(attachment: Attachment): boolean
```

### 2. GeminiService.ts Integration

**File: `/mnt/c/github/discord/discord-llm-bot/src/services/gemini.ts`**

**Line 442**: Extend `generateResponse()` parameters
```typescript
videoAttachments?: Array<{
  url: string;
  mimeType: string;
  base64Data?: string;
  fileUri?: string; // For File API uploads
  duration?: number;
  estimatedTokens?: number;
}>
```

**Line 913-917**: Enhance model configuration selection
- Add video-specific model configuration
- Implement token budget validation
- Add cost warning generation

**Line 926-932**: Extend multimodal content building
- Handle File API references
- Add video metadata to content structure
- Implement YouTube URL processing

### 3. ResponseProcessingService.ts Enhancements

**File: `/mnt/c/github/discord/discord-llm-bot/src/services/responseProcessingService.ts`**

**Line 442**: Extend `getImageProcessingErrorMessage()` to handle video errors
```typescript
getVideoProcessingErrorMessage(error: Error, videoCount: number): string
```

**New Error Handling Patterns**:
- Duration limit exceeded messages
- Token cost warnings
- File API upload failures
- Unsupported video format guidance

### 4. Rate Limiting Infrastructure

**File: `/mnt/c/github/discord/discord-llm-bot/src/services/rateLimiter.ts`**

**Line 22**: Extend `RateLimitState` interface
```typescript
interface RateLimitState {
  requestsThisMinute: number;
  requestsToday: number;
  tokensThisMinute: number;    // New
  tokensToday: number;         // New
  minuteWindowStart: number;
  dayWindowStart: number;
}
```

**Line 110**: Enhance `checkAndIncrement()` method
```typescript
async checkAndIncrement(estimatedTokens?: number): Promise<{
  allowed: boolean;
  reason: string;
  remaining: { minute: number; daily: number; tokens: number };
}>
```

### 5. Configuration Management

**File: `/mnt/c/github/discord/discord-llm-bot/src/services/interfaces/MultimodalContentInterfaces.ts`**

**Line 66**: Extend `MultimodalConfig` interface
```typescript
export interface MultimodalConfig {
  maxImages?: number;
  maxVideos?: number;           // New
  maxVideoFileSize?: number;    // New
  maxVideoDuration?: number;    // New (in seconds)
  enableYouTubeUrls?: boolean;  // New
  tokenBudgetWarning?: number;  // New (warn when approaching limit)
  maxFileSize?: number;
  supportedMimeTypes?: string[];
  includeReferencedAttachments?: boolean;
}
```

## Risk Assessment and Mitigation Strategies

### 1. Critical Risks

**Token Cost Explosion**:
- **Risk**: Single 5-minute video = 90,000 tokens (entire daily quota)
- **Mitigation**: 
  - Strict duration limits (≤30 seconds initially)
  - Pre-processing cost estimation and user warnings
  - Token-aware rate limiting with rollback capability

**File Storage Costs**:
- **Risk**: Large video files consuming cloud storage
- **Mitigation**:
  - Temporary storage with automatic cleanup
  - File API only for files >20MB
  - YouTube URL preference over file uploads

**Processing Time Impact**:
- **Risk**: Long processing times for large videos
- **Mitigation**:
  - Async processing with status updates
  - Connection timeout handling
  - Progressive processing disclosure

### 2. Technical Risks

**Memory Consumption**:
- **Risk**: Large video files consuming application memory
- **Mitigation**:
  - Streaming upload to File API
  - Memory monitoring and limits
  - Process isolation for video handling

**Error Handling Complexity**:
- **Risk**: Increased error surface area with video processing
- **Mitigation**:
  - Comprehensive error taxonomy
  - Graceful fallback to text-only processing
  - Enhanced logging for video-specific issues

### 3. Operational Risks

**Quota Management**:
- **Risk**: Video processing exhausting API quotas rapidly
- **Mitigation**:
  - Real-time quota monitoring
  - Dynamic feature disabling when approaching limits
  - Priority queuing system for different content types

**User Experience Impact**:
- **Risk**: Slow video processing degrading bot responsiveness  
- **Mitigation**:
  - Clear processing time expectations
  - Progress indicators for long operations
  - Async processing with notification

## Phased Implementation Roadmap

### Phase 1: YouTube URL Support (Conservative Start)
**Timeline**: 2-3 weeks
**Scope**: Minimal risk implementation

**Features**:
- YouTube URL detection and processing
- Basic token cost estimation
- Simple duration warnings

**Integration Points**:
- `MultimodalContentHandler.ts:349` - Add YouTube URL detection
- `GeminiService.ts:926` - Add fileUri processing
- Minimal rate limiting changes

**Success Criteria**:
- Process YouTube URLs without file uploads
- Display token cost estimates to users
- Maintain existing image processing functionality

### Phase 2: Short Video File Support (≤30 seconds)
**Timeline**: 3-4 weeks
**Scope**: Controlled file processing

**Features**:
- Video file upload and processing (≤30 seconds)
- Enhanced token-aware rate limiting
- Duration validation and user feedback
- File API integration for large files

**Integration Points**:
- `MultimodalContentHandler.ts:29` - Extend MIME type support
- `RateLimiter.ts:22` - Add token tracking
- `ResponseProcessingService.ts:442` - Video error handling

**Success Criteria**:
- Process short video files reliably
- Prevent token quota exhaustion
- Provide clear user feedback on limitations

### Phase 3: Full Video Feature Set
**Timeline**: 4-6 weeks  
**Scope**: Complete implementation

**Features**:
- Extended duration support (≤2 minutes)
- Advanced file management and cleanup
- Comprehensive error handling and recovery
- Performance monitoring and optimization

**Integration Points**:
- Complete architecture integration
- Advanced rate limiting with predictive analytics
- Enhanced user experience features

**Success Criteria**:
- Support full range of video formats and durations
- Maintain system stability under load
- Achieve 95% success rate for video processing

## Implementation Guidelines

### 1. Development Standards

**Code Organization**:
- Follow existing service architecture patterns
- Maintain separation of concerns between services
- Use dependency injection for testability

**Error Handling**:
- Extend existing `MultimodalProcessingError` class
- Provide specific error codes for video processing
- Implement comprehensive logging for debugging

**Testing Strategy**:
- Unit tests for video processing methods
- Integration tests with mock video files
- Performance tests for token cost calculations
- End-to-end tests with real video content

### 2. Configuration Management

**Environment Variables**:
```bash
# Video processing configuration
VIDEO_PROCESSING_ENABLED=true
MAX_VIDEO_DURATION_SECONDS=30
MAX_VIDEO_FILE_SIZE_MB=100
ENABLE_YOUTUBE_URLS=true
TOKEN_BUDGET_WARNING_THRESHOLD=15000
VIDEO_FILE_API_ENABLED=false  # Phase 2
```

**Runtime Configuration**:
- Dynamic feature flags for gradual rollout
- A/B testing capability for different limits
- Real-time configuration updates without restart

### 3. Monitoring and Observability

**Key Metrics**:
- Video processing success/failure rates
- Token consumption per video type
- Processing time by video duration
- File API upload success rates
- User engagement with video features

**Alerting Thresholds**:
- Token consumption approaching quota limits
- Video processing failure rate >5%
- Average processing time >30 seconds
- File storage costs exceeding budget

## Conclusion

The implementation of video support leverages the existing robust multimodal infrastructure while addressing the unique challenges of video processing. The phased approach minimizes risk while providing incremental value to users.

**Key Success Factors**:
1. **Conservative Token Management**: Start with strict limits and gradually expand
2. **User Education**: Clear communication about costs and limitations  
3. **Robust Error Handling**: Comprehensive error coverage for video-specific issues
4. **Performance Monitoring**: Real-time tracking of token usage and processing times

**Next Steps**:
1. Review and approve technical specification
2. Begin Phase 1 implementation with YouTube URL support
3. Establish monitoring infrastructure for token tracking
4. Develop user documentation and usage guidelines

This architecture analysis provides a solid foundation for implementing video support while maintaining system stability and managing operational costs.