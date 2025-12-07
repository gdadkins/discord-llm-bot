/**
 * Response Processing Service Tests
 * 
 * Tests for the extracted response processing functionality.
 */

import { ResponseProcessingService } from '../../../src/services/responseProcessingService';
import type { ResponseProcessingConfig, RawAPIResponse } from '../../../src/services/interfaces/ResponseProcessingInterfaces';
import { FinishReason, BlockedReason } from '@google/genai';

describe('ResponseProcessingService', () => {
  let service: ResponseProcessingService;
  let defaultConfig: ResponseProcessingConfig;

  beforeEach(() => {
    service = new ResponseProcessingService();
    defaultConfig = {
      includeThoughts: false,
      maxMessageLength: 2000,
      thinkingBudget: 0
    };
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('Service Lifecycle', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      
      const healthStatus = service.getHealthStatus();
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.name).toBe('ResponseProcessingService');
      expect(healthStatus.errors).toHaveLength(0);
    });

    it('should handle multiple initializations gracefully', async () => {
      await service.initialize();
      await service.initialize(); // Should not throw
      
      const healthStatus = service.getHealthStatus();
      expect(healthStatus.healthy).toBe(true);
    });

    it('should shutdown properly', async () => {
      await service.initialize();
      await service.shutdown();
      
      const healthStatus = service.getHealthStatus();
      expect(healthStatus.healthy).toBe(false);
      expect(healthStatus.errors).toContain('Service not initialized');
    });
  });

  describe('processAPIResponse', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should throw error for null response', async () => {
      await expect(service.processAPIResponse(null, defaultConfig))
        .rejects.toThrow('No response received from API');
    });

    it('should handle prompt-level blocking', async () => {
      const blockedResponse: RawAPIResponse = {
        promptFeedback: { blockReason: BlockedReason.SAFETY },
        candidates: []
      };

      const result = await service.processAPIResponse(blockedResponse, defaultConfig);
      
      expect(result.text).toBe('Your request was blocked by safety filters. Try rephrasing with different language.');
      expect(result.hasThinking).toBe(false);
      expect(result.warnings).toContain('Blocked at prompt level: SAFETY');
    });

    it('should throw error for no candidates', async () => {
      const response: RawAPIResponse = {
        candidates: []
      };

      await expect(service.processAPIResponse(response, defaultConfig))
        .rejects.toThrow('No response candidates generated');
    });

    it('should handle safety finish reasons', async () => {
      const response: RawAPIResponse = {
        candidates: [{
          finishReason: FinishReason.SAFETY,
          content: { parts: [{ text: 'Some content' }] }
        }]
      };

      const result = await service.processAPIResponse(response, defaultConfig);
      
      expect(result.text).toBe('I couldn\'t complete that response due to safety guidelines. Try rephrasing your request!');
      expect(result.hasThinking).toBe(false);
      expect(result.warnings).toContain('Finished with reason: SAFETY');
    });

    it('should throw error for retryable finish reasons', async () => {
      const response: RawAPIResponse = {
        candidates: [{
          finishReason: FinishReason.RECITATION,
          content: { parts: [{ text: 'Some content' }] }
        }]
      };

      await expect(service.processAPIResponse(response, defaultConfig))
        .rejects.toThrow('Response blocked: RECITATION');
    });

    it('should extract text from simple response', async () => {
      const response: RawAPIResponse = {
        candidates: [{
          finishReason: FinishReason.STOP,
          content: {
            parts: [{ text: 'Hello, how can I help you?' }]
          }
        }]
      };

      const result = await service.processAPIResponse(response, defaultConfig);
      
      expect(result.text).toBe('Hello, how can I help you?');
      expect(result.hasThinking).toBe(false);
      expect(result.thinkingLength).toBe(0);
      expect(result.wasTruncated).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should extract text from function response', async () => {
      const response = {
        text: () => 'Function response text',
        candidates: [{
          finishReason: FinishReason.STOP,
          content: { parts: [{ text: 'Function response text' }] }
        }]
      };

      const result = await service.processAPIResponse(response, defaultConfig);
      
      expect(result.text).toBe('Function response text');
      expect(result.hasThinking).toBe(false);
    });

    it('should extract text from string response', async () => {
      const response = {
        text: 'String response text',
        candidates: [{
          finishReason: FinishReason.STOP,
          content: { parts: [{ text: 'String response text' }] }
        }]
      };

      const result = await service.processAPIResponse(response, defaultConfig);
      
      expect(result.text).toBe('String response text');
      expect(result.hasThinking).toBe(false);
    });

    it('should handle thinking mode when enabled', async () => {
      const response: RawAPIResponse = {
        candidates: [{
          finishReason: FinishReason.STOP,
          content: {
            parts: [
              { text: 'Let me think about this...', thought: true },
              { text: 'Here is my response.' }
            ]
          }
        }]
      };

      const configWithThinking: ResponseProcessingConfig = {
        includeThoughts: true,
        maxMessageLength: 2000,
        thinkingBudget: 1000
      };

      const result = await service.processAPIResponse(response, configWithThinking);
      
      expect(result.hasThinking).toBe(true);
      expect(result.thinkingLength).toBe(26); // "Let me think about this..."
      expect(result.text).toContain('**Thinking:**');
      expect(result.text).toContain('Let me think about this...');
      expect(result.text).toContain('Here is my response.');
    });

    it('should handle thinking in grounding metadata', async () => {
      const response: RawAPIResponse = {
        candidates: [{
          finishReason: FinishReason.STOP,
          content: {
            parts: [{ text: 'Final response' }]
          },
          groundingMetadata: {
            thoughts: 'Some thinking process'
          }
        }]
      };

      const configWithThinking: ResponseProcessingConfig = {
        includeThoughts: true,
        maxMessageLength: 2000,
        thinkingBudget: 1000
      };

      const result = await service.processAPIResponse(response, configWithThinking);
      
      expect(result.hasThinking).toBe(true);
      expect(result.thinkingLength).toBe(21); // "Some thinking process"
      expect(result.text).toContain('**Thinking:**');
      expect(result.text).toContain('Some thinking process');
    });

    it('should truncate response if too long', async () => {
      const longText = 'a'.repeat(2500);
      const response: RawAPIResponse = {
        candidates: [{
          finishReason: FinishReason.STOP,
          content: {
            parts: [{ text: longText }]
          }
        }]
      };

      const result = await service.processAPIResponse(response, defaultConfig);
      
      expect(result.text.length).toBeLessThanOrEqual(2000);
      expect(result.text.endsWith('...')).toBe(true);
      expect(result.wasTruncated).toBe(true);
      expect(result.warnings).toContain('Response truncated to fit Discord message limits');
    });

    it('should handle thinking markers in text', async () => {
      const responseText = '<thinking>Let me analyze this</thinking>Here is my answer';
      const response: RawAPIResponse = {
        candidates: [{
          finishReason: FinishReason.STOP,
          content: {
            parts: [
              { text: '<thinking>Let me analyze this</thinking>Here is my answer' },
              { text: '' } // Second part needed to trigger thinking marker extraction
            ]
          }
        }]
      };

      const configWithThinking: ResponseProcessingConfig = {
        includeThoughts: true,
        maxMessageLength: 2000,
        thinkingBudget: 1000
      };

      const result = await service.processAPIResponse(response, configWithThinking);
      
      expect(result.hasThinking).toBe(true);
      expect(result.thinkingLength).toBe(19); // "Let me analyze this"
      expect(result.text).toContain('**Thinking:**');
      expect(result.text).toContain('Let me analyze this');
      expect(result.text).toContain('Here is my answer');
    });
  });

  describe('getBlockedContentMessage', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return appropriate message for SAFETY', () => {
      const message = service.getBlockedContentMessage(BlockedReason.SAFETY);
      expect(message).toBe('Your request was blocked by safety filters. Try rephrasing with different language.');
    });

    it('should return appropriate message for BLOCKLIST', () => {
      const message = service.getBlockedContentMessage(BlockedReason.BLOCKLIST);
      expect(message).toBe('Your request contains blocked terminology. Please use different wording.');
    });

    it('should return appropriate message for PROHIBITED_CONTENT', () => {
      const message = service.getBlockedContentMessage(BlockedReason.PROHIBITED_CONTENT);
      expect(message).toBe('Your request relates to prohibited content. Please ask about something else.');
    });

    it('should return default message for OTHER', () => {
      const message = service.getBlockedContentMessage(BlockedReason.OTHER);
      expect(message).toBe('Your request was blocked for policy reasons. Try rephrasing your question.');
    });
  });

  describe('getFinishReasonMessage', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return appropriate message for MAX_TOKENS', () => {
      const message = service.getFinishReasonMessage(FinishReason.MAX_TOKENS);
      expect(message).toContain('My response was too long and got cut off');
      expect(message).toContain('thinking mode');
    });

    it('should return appropriate message for SAFETY', () => {
      const message = service.getFinishReasonMessage(FinishReason.SAFETY);
      expect(message).toBe('I couldn\'t complete that response due to safety guidelines. Try rephrasing your request!');
    });

    it('should return appropriate message for RECITATION', () => {
      const message = service.getFinishReasonMessage(FinishReason.RECITATION);
      expect(message).toContain('copyright material');
    });

    it('should return appropriate message for SPII', () => {
      const message = service.getFinishReasonMessage(FinishReason.SPII);
      expect(message).toContain('sensitive personal information');
    });
  });

  describe('extractResponseText', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should throw error for null response', () => {
      expect(() => service.extractResponseText(null))
        .toThrow('No response to extract text from');
    });

    it('should extract text from function', () => {
      const response = {
        text: () => 'Function text'
      };

      const result = service.extractResponseText(response);
      
      expect(result.text).toBe('Function text');
      expect(result.thinkingText).toBeNull();
    });

    it('should extract text from string', () => {
      const response = {
        text: 'String text'
      };

      const result = service.extractResponseText(response);
      
      expect(result.text).toBe('String text');
      expect(result.thinkingText).toBeNull();
    });

    it('should extract text from candidates', () => {
      const response: RawAPIResponse = {
        candidates: [{
          content: {
            parts: [
              { text: 'First part' },
              { text: 'Second part' }
            ]
          }
        }]
      };

      const result = service.extractResponseText(response);
      
      expect(result.text).toBe('First partSecond part');
      expect(result.thinkingText).toBeNull();
    });

    it('should extract thinking from thought parts', () => {
      const response: RawAPIResponse = {
        candidates: [{
          content: {
            parts: [
              { text: 'Thinking content', thought: true },
              { text: 'Response content' }
            ]
          }
        }]
      };

      const result = service.extractResponseText(response);
      
      expect(result.text).toBe('Response content');
      expect(result.thinkingText).toBe('Thinking content');
    });

    it('should throw error for empty text', () => {
      const response: RawAPIResponse = {
        candidates: [{
          content: {
            parts: [{ text: '' }]
          }
        }]
      };

      expect(() => service.extractResponseText(response))
        .toThrow('No text content found in response');
    });
  });

  describe('formatThinkingResponse', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should format thinking and response correctly', () => {
      const thinking = 'Let me think about this question.';
      const response = 'Here is my answer.';
      
      const formatted = service.formatThinkingResponse(thinking, response, 1000);
      
      expect(formatted).toContain('**Thinking:**');
      expect(formatted).toContain(thinking);
      expect(formatted).toContain(response);
      expect(formatted.length).toBeLessThanOrEqual(1000);
    });

    it('should handle empty thinking', () => {
      const thinking = '';
      const response = 'Just the response.';
      
      const formatted = service.formatThinkingResponse(thinking, response, 1000);
      
      expect(formatted).toContain('💭 **Thinking:**');
      expect(formatted).toContain('**Response:**');
      expect(formatted).toContain(response);
    });

    it('should handle empty response', () => {
      const thinking = 'Some thinking';
      const response = '';
      
      const formatted = service.formatThinkingResponse(thinking, response, 1000);
      
      expect(formatted).toContain('**Thinking:**');
      expect(formatted).toContain(thinking);
    });
  });
});