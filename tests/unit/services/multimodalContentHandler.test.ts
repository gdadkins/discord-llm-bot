/**
 * Tests for MultimodalContentHandler Service
 * 
 * Validates audio processing functionality including:
 * - Audio MIME type support
 * - Audio attachment processing
 * - Base64 encoding
 * - Metadata extraction
 * - Partial processing for long audio files
 * - Error handling
 */

import { Collection, Attachment } from 'discord.js';
import { MultimodalContentHandler } from '../../../src/services/multimodalContentHandler';
import { audioProcessor } from '../../../src/services/multimodal/processors/AudioProcessor';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/audioProcessor', () => ({
  audioProcessor: {
    validateAudioFile: jest.fn(),
    extractMetadata: jest.fn(),
    needsPartialProcessing: jest.fn(),
    generatePartialMetadata: jest.fn(),
    getAudioErrorMessage: jest.fn()
  }
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as jest.Mock;

describe('MultimodalContentHandler - Audio Processing', () => {
  let handler: MultimodalContentHandler;
  let mockLogger: jest.Mocked<typeof logger>;
  let mockAudioProcessor: jest.Mocked<typeof audioProcessor>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset fetch mock
    mockFetch.mockReset();
    
    // Setup logger mock
    mockLogger = logger as jest.Mocked<typeof logger>;
    mockLogger.info = jest.fn();
    mockLogger.error = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.debug = jest.fn();

    // Setup audio processor mock
    mockAudioProcessor = audioProcessor as jest.Mocked<typeof audioProcessor>;
    mockAudioProcessor.validateAudioFile = jest.fn();
    mockAudioProcessor.extractMetadata = jest.fn();
    mockAudioProcessor.needsPartialProcessing = jest.fn();
    mockAudioProcessor.generatePartialMetadata = jest.fn();
    mockAudioProcessor.getAudioErrorMessage = jest.fn();

    handler = new MultimodalContentHandler();
    
    // Initialize the handler to ensure processAudioAttachment is available
    handler.initialize();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Audio MIME Type Support', () => {
    it('should include audio MIME types in default configuration', () => {
      const config = handler['config'];
      
      expect(config.supportedMimeTypes).toContain('audio/mp3');
      expect(config.supportedMimeTypes).toContain('audio/mpeg');
      expect(config.supportedMimeTypes).toContain('audio/wav');
      expect(config.supportedMimeTypes).toContain('audio/ogg');
      expect(config.supportedMimeTypes).toContain('audio/webm');
      expect(config.supportedMimeTypes).toContain('audio/flac');
    });
  });

  describe('processAudioAttachment', () => {
    const createMockAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
      id: '123456789',
      url: 'https://cdn.discordapp.com/attachments/123/456/audio.mp3',
      proxyURL: 'https://media.discordapp.net/attachments/123/456/audio.mp3',
      name: 'test-audio.mp3',
      contentType: 'audio/mpeg',
      size: 5 * 1024 * 1024, // 5MB
      height: null,
      width: null,
      ephemeral: false,
      spoiler: false,
      ...overrides
    } as Attachment);

    it('should process valid audio attachment successfully', async () => {
      const mockAttachment = createMockAttachment();
      const mockAudioData = 'mock audio data';
      const mockBase64 = 'bW9jayBhdWRpbyBkYXRh'; // Base64 of 'mock audio data'

      // Mock validation
      mockAudioProcessor.validateAudioFile.mockReturnValue({
        isValid: true,
        mimeType: 'audio/mpeg'
      });

      // Mock buffer and base64 conversion
      const mockBuffer = {
        buffer: new ArrayBuffer(mockAudioData.length),
        toString: jest.fn().mockReturnValue(mockBase64)
      };
      
      // Mock Buffer.from
      jest.spyOn(Buffer, 'from').mockReturnValue(mockBuffer as any);
      
      // Mock fetch response
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(mockAudioData.length))
      });

      // Mock metadata extraction
      mockAudioProcessor.extractMetadata.mockResolvedValue({
        format: 'mpeg',
        duration: 180, // 3 minutes
        bitrate: 128000,
        channels: 2,
        sampleRate: 44100,
        size: 5 * 1024 * 1024
      });

      mockAudioProcessor.needsPartialProcessing.mockReturnValue(false);

      // Create attachment collection
      const attachments = new Collection<string, Attachment>();
      attachments.set(mockAttachment.id, mockAttachment);

      // Process attachments
      const result = await handler.processDiscordAttachments(attachments);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        url: mockAttachment.url,
        mimeType: 'audio/mpeg',
        base64Data: mockBase64,
        filename: 'test-audio.mp3',
        size: 5 * 1024 * 1024,
        contentType: 'audio',
        metadata: expect.objectContaining({
          format: 'mpeg',
          duration: 180,
          bitrate: 128000,
          channels: 2,
          sampleRate: 44100
        })
      });

      expect(mockAudioProcessor.validateAudioFile).toHaveBeenCalledWith(
        'audio/mpeg',
        5 * 1024 * 1024,
        'test-audio.mp3'
      );
    });

    it('should handle partial processing for long audio files', async () => {
      const mockAttachment = createMockAttachment();
      const mockAudioData = 'mock audio data';
      const mockBase64 = 'bW9jayBhdWRpbyBkYXRh';
      
      // Mock buffer and base64 conversion
      const mockBuffer = {
        buffer: new ArrayBuffer(mockAudioData.length),
        toString: jest.fn().mockReturnValue(mockBase64)
      };
      
      // Mock Buffer.from
      jest.spyOn(Buffer, 'from').mockReturnValue(mockBuffer as any);

      mockAudioProcessor.validateAudioFile.mockReturnValue({
        isValid: true,
        mimeType: 'audio/mpeg'
      });

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(mockAudioData.length))
      });

      // Mock long duration requiring partial processing
      mockAudioProcessor.extractMetadata.mockResolvedValue({
        format: 'mpeg',
        duration: 900, // 15 minutes
        bitrate: 128000,
        channels: 2,
        sampleRate: 44100,
        size: 5 * 1024 * 1024
      });

      mockAudioProcessor.needsPartialProcessing.mockReturnValue(true);
      mockAudioProcessor.generatePartialMetadata.mockReturnValue({
        startOffset: '0s',
        endOffset: '600s',
        processedDuration: 600
      });

      const attachments = new Collection<string, Attachment>();
      attachments.set(mockAttachment.id, mockAttachment);

      const result = await handler.processDiscordAttachments(attachments);

      expect(result).toHaveLength(1);
      expect(result[0].metadata).toMatchObject({
        duration: 900,
        audioMetadata: {
          startOffset: '0s',
          endOffset: '600s'
        },
        partialProcessingMessage: expect.stringContaining('Processing first')
      });

      expect(mockAudioProcessor.needsPartialProcessing).toHaveBeenCalledWith(900);
      expect(mockAudioProcessor.generatePartialMetadata).toHaveBeenCalledWith(900);
    });

    it('should reject unsupported audio formats', async () => {
      const mockAttachment = createMockAttachment({
        contentType: 'audio/aac',
        name: 'test.aac'
      });

      const attachments = new Collection<string, Attachment>();
      attachments.set(mockAttachment.id, mockAttachment);

      const result = await handler.processDiscordAttachments(attachments);

      // Unsupported formats are filtered out before processing
      expect(result).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Filtered to 0 supported image(s) from 1 total attachment(s)'
      );
    });

    it('should handle audio file size limits', async () => {
      const mockAttachment = createMockAttachment({
        size: 25 * 1024 * 1024 // 25MB, over limit
      });

      mockAudioProcessor.validateAudioFile.mockReturnValue({
        isValid: false,
        error: 'The audio file is too large (25MB). Please use audio files smaller than 20MB.'
      });

      const attachments = new Collection<string, Attachment>();
      attachments.set(mockAttachment.id, mockAttachment);

      const result = await handler.processDiscordAttachments(attachments);

      expect(result).toHaveLength(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process attachment'),
        expect.any(Error)
      );
    });

    it('should handle fetch errors gracefully', async () => {
      const mockAttachment = createMockAttachment();

      mockAudioProcessor.validateAudioFile.mockReturnValue({
        isValid: true,
        mimeType: 'audio/mpeg'
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const attachments = new Collection<string, Attachment>();
      attachments.set(mockAttachment.id, mockAttachment);

      const result = await handler.processDiscordAttachments(attachments);

      expect(result).toHaveLength(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process attachment'),
        expect.any(Error)
      );
    });

    it('should log warnings for large audio files', async () => {
      const mockAttachment = createMockAttachment({
        size: 18 * 1024 * 1024 // 18MB, close to limit
      });
      
      const mockBase64 = 'large-file-base64';
      
      // Mock buffer and base64 conversion
      const mockBuffer = {
        buffer: new ArrayBuffer(18 * 1024 * 1024),
        toString: jest.fn().mockReturnValue(mockBase64)
      };
      
      // Mock Buffer.from
      jest.spyOn(Buffer, 'from').mockReturnValue(mockBuffer as any);

      mockAudioProcessor.validateAudioFile.mockReturnValue({
        isValid: true,
        mimeType: 'audio/mpeg',
        warnings: ['Audio file size (18MB) is close to the 20MB limit']
      });

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(18 * 1024 * 1024))
      });

      mockAudioProcessor.extractMetadata.mockResolvedValue({
        format: 'mpeg',
        duration: 180,
        size: 18 * 1024 * 1024
      });

      const attachments = new Collection<string, Attachment>();
      attachments.set(mockAttachment.id, mockAttachment);

      await handler.processDiscordAttachments(attachments);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Audio processing warning: Audio file size (18MB) is close to the 20MB limit'
      );
    });
  });

  describe('convertToGeminiParts - Audio Support', () => {
    it('should convert audio attachments to Gemini inline data format', () => {
      const audioAttachments = [
        {
          url: 'https://example.com/audio1.mp3',
          mimeType: 'audio/mpeg',
          base64Data: 'base64AudioData1',
          filename: 'audio1.mp3',
          size: 1024 * 1024,
          contentType: 'audio' as const,
          metadata: {
            format: 'mpeg',
            duration: 120
          }
        },
        {
          url: 'https://example.com/audio2.wav',
          mimeType: 'audio/wav',
          base64Data: 'base64AudioData2',
          filename: 'audio2.wav',
          size: 2 * 1024 * 1024,
          contentType: 'audio' as const,
          metadata: {
            format: 'wav',
            duration: 60
          }
        }
      ];

      const parts = handler['convertToGeminiParts'](audioAttachments);

      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({
        inlineData: {
          mimeType: 'audio/mpeg',
          data: 'base64AudioData1'
        }
      });
      expect(parts[1]).toEqual({
        inlineData: {
          mimeType: 'audio/wav',
          data: 'base64AudioData2'
        }
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Converting audio to Gemini Part: audio1.mp3 (audio/mpeg)'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Converting audio to Gemini Part: audio2.wav (audio/wav)'
      );
    });

    it('should handle audio with partial processing metadata', () => {
      const audioAttachment = {
        url: 'https://example.com/long-audio.mp3',
        mimeType: 'audio/mpeg',
        base64Data: 'base64AudioData',
        filename: 'long-audio.mp3',
        size: 10 * 1024 * 1024,
        contentType: 'audio' as const,
        metadata: {
          format: 'mpeg',
          duration: 900,
          audioMetadata: {
            startOffset: '0s',
            endOffset: '600s'
          }
        }
      };

      const parts = handler['convertToGeminiParts']([audioAttachment]);

      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({
        inlineData: {
          mimeType: 'audio/mpeg',
          data: 'base64AudioData'
        }
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Audio has partial processing metadata')
      );
    });
  });

  describe('buildGeminiContent - Audio Support', () => {
    it('should build content with mixed media types', () => {
      const text = 'Analyze these media files';
      const attachments = [
        {
          url: 'https://example.com/image.jpg',
          mimeType: 'image/jpeg',
          base64Data: 'imageData',
          contentType: 'image' as const
        },
        {
          url: 'https://example.com/video.mp4',
          mimeType: 'video/mp4',
          base64Data: 'videoData',
          contentType: 'video' as const
        },
        {
          url: 'https://example.com/audio.mp3',
          mimeType: 'audio/mpeg',
          base64Data: 'audioData',
          contentType: 'audio' as const
        }
      ];

      const content = handler['buildGeminiContent'](text, attachments);

      expect(content.parts).toHaveLength(4); // 1 text + 3 media
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Built Gemini content with 1 image(s) and 1 video(s) and 1 audio file(s)'
      );
    });
  });

  describe('Error Handling', () => {
    it('should use audio-specific error messages', async () => {
      const mockAttachment = createMockAttachment({
        contentType: 'audio/mpeg',
        name: 'test-audio.mp3'
      });

      mockAudioProcessor.validateAudioFile.mockReturnValue({
        isValid: true,
        mimeType: 'audio/mpeg'
      });

      const fetchError = new Error('Network error');
      mockFetch.mockRejectedValue(fetchError);

      const attachments = new Collection<string, Attachment>();
      attachments.set(mockAttachment.id, mockAttachment);

      const result = await handler.processDiscordAttachments(attachments);

      expect(result).toHaveLength(0);
      // The error is logged but processing continues for other attachments
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process attachment'),
        expect.any(Error)
      );
    });
  });
});

function createMockAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: '123456789',
    url: 'https://cdn.discordapp.com/attachments/123/456/file.ext',
    proxyURL: 'https://media.discordapp.net/attachments/123/456/file.ext',
    name: 'file.ext',
    contentType: 'application/octet-stream',
    size: 1024,
    height: null,
    width: null,
    ephemeral: false,
    spoiler: false,
    ...overrides
  } as Attachment;
}