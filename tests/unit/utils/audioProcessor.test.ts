/**
 * Audio Processor Tests
 */

import { 
  AudioProcessor, 
  SUPPORTED_AUDIO_TYPES,
  type AudioMetadata,
  type AudioValidationResult 
} from '../../../src/services/multimodal/processors/AudioProcessor';

describe('AudioProcessor', () => {
  let audioProcessor: AudioProcessor;

  beforeEach(() => {
    audioProcessor = new AudioProcessor();
  });

  describe('validateAudioFile', () => {
    it('should validate supported audio types', () => {
      const supportedTypes = [
        'audio/mp3',
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'audio/webm',
        'audio/flac'
      ];

      supportedTypes.forEach(mimeType => {
        const result = audioProcessor.validateAudioFile(mimeType, 1024 * 1024, 'test.mp3');
        expect(result.isValid).toBe(true);
        expect(result.mimeType).toBe(mimeType);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject unsupported audio types', () => {
      const unsupportedTypes = [
        'audio/aac',
        'audio/midi',
        'video/mp4',
        'image/png'
      ];

      unsupportedTypes.forEach(mimeType => {
        const result = audioProcessor.validateAudioFile(mimeType, 1024 * 1024, 'test.file');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Unsupported audio format');
      });
    });

    it('should reject files that are too large', () => {
      const result = audioProcessor.validateAudioFile(
        'audio/mp3',
        25 * 1024 * 1024, // 25MB
        'large.mp3'
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should warn about large files', () => {
      const result = audioProcessor.validateAudioFile(
        'audio/mp3',
        18 * 1024 * 1024, // 18MB (90% of 20MB limit)
        'large.mp3'
      );
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings![0]).toContain('large');
    });

    it('should handle null MIME type', () => {
      const result = audioProcessor.validateAudioFile(null, 1024 * 1024, 'test.mp3');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unable to determine audio file type');
    });
  });

  describe('isSupportedAudioType', () => {
    it('should correctly identify supported types', () => {
      SUPPORTED_AUDIO_TYPES.forEach(type => {
        expect(audioProcessor.isSupportedAudioType(type)).toBe(true);
      });
    });

    it('should reject unsupported types', () => {
      expect(audioProcessor.isSupportedAudioType('audio/aac')).toBe(false);
      expect(audioProcessor.isSupportedAudioType('video/mp4')).toBe(false);
      expect(audioProcessor.isSupportedAudioType('text/plain')).toBe(false);
    });
  });

  describe('extractMetadata', () => {
    it('should extract basic metadata', async () => {
      const buffer = new ArrayBuffer(1024 * 1024); // 1MB
      const metadata = await audioProcessor.extractMetadata(buffer, 'audio/mp3', 'test.mp3');

      expect(metadata.size).toBe(1024 * 1024);
      expect(metadata.format).toBe('MP3');
      expect(metadata.duration).toBeDefined();
    });
  });

  describe('needsPartialProcessing', () => {
    it('should identify files needing partial processing', () => {
      expect(audioProcessor.needsPartialProcessing(300)).toBe(false); // 5 minutes
      expect(audioProcessor.needsPartialProcessing(700)).toBe(true);  // 11.67 minutes
    });
  });

  describe('generatePartialMetadata', () => {
    it('should generate correct partial processing metadata', () => {
      const metadata = audioProcessor.generatePartialMetadata(900); // 15 minutes
      
      expect(metadata.startOffset).toBe('0s');
      expect(metadata.endOffset).toBe('600s'); // 10 minutes max
      expect(metadata.processedDuration).toBe(600);
    });
  });

  describe('getAudioErrorMessage', () => {
    it('should generate user-friendly error messages', () => {
      const sizeError = new Error('size exceeded');
      const message = audioProcessor.getAudioErrorMessage(sizeError, 'test.mp3');
      expect(message).toContain('too large');
      expect(message).toContain('20MB');

      const formatError = new Error('Invalid format');
      const formatMessage = audioProcessor.getAudioErrorMessage(formatError);
      expect(formatMessage).toContain('audio formats');

      const durationError = new Error('duration too long');
      const durationMessage = audioProcessor.getAudioErrorMessage(durationError);
      expect(durationMessage).toContain('too long');
      expect(durationMessage).toContain('10 minutes');
    });
  });
});