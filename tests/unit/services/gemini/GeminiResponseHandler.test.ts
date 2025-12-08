/**
 * GeminiResponseHandler Unit Tests
 * Comprehensive test suite for response extraction and processing
 * Target coverage: 80%+
 */

import { GeminiResponseHandler } from '../../../../src/services/gemini/GeminiResponseHandler';
import { logger } from '../../../../src/utils/logger';
import type { 
  IResponseProcessingService,
  IHealthMonitor,
  StructuredOutputOptions,
  ProcessedResponse
} from '../../../../src/services/interfaces';
import type { ImageAttachment } from '../../../../src/services/gemini/interfaces';

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('GeminiResponseHandler', () => {
  let responseHandler: GeminiResponseHandler;
  let mockResponseProcessingService: jest.Mocked<IResponseProcessingService>;
  let mockHealthMonitor: jest.Mocked<IHealthMonitor>;
  let config: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock response processing service
    mockResponseProcessingService = {
      processAPIResponse: jest.fn().mockResolvedValue({
        text: 'Processed response text',
        hasThinking: false,
        thinkingLength: 0,
        wasTruncated: false,
        warnings: [],
        isMultimodal: false,
        imageContext: undefined
      })
    } as unknown as jest.Mocked<IResponseProcessingService>;

    // Setup mock health monitor
    mockHealthMonitor = {
      getService: jest.fn().mockReturnValue({
        trackPerformance: jest.fn().mockResolvedValue(undefined)
      })
    } as unknown as jest.Mocked<IHealthMonitor>;

    // Default config
    config = {
      includeThoughts: true,
      thinkingBudget: 50000,
      enableCodeExecution: false,
      enableGoogleSearch: false
    };

    // Create handler instance
    responseHandler = new GeminiResponseHandler(mockResponseProcessingService, config);
  });

  describe('Basic Response Extraction', () => {
    it('should extract basic text response', async () => {
      const response = {
        candidates: [{
          content: { parts: [{ text: 'Test response' }] }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toBe('Processed response text');
      expect(mockResponseProcessingService.processAPIResponse).toHaveBeenCalledWith(
        response,
        expect.objectContaining({
          includeThoughts: true,
          maxMessageLength: 2000,
          thinkingBudget: 50000,
          isMultimodal: false
        })
      );
    });

    it('should handle multimodal response', async () => {
      const response = { candidates: [{ content: { parts: [{ text: 'Test' }] } }] };
      const imageAttachments: ImageAttachment[] = [{
        url: 'http://example.com/image.jpg',
        mimeType: 'image/jpeg',
        base64Data: 'base64data'
      }];

      await responseHandler.extractResponseText(response, true, imageAttachments);

      expect(mockResponseProcessingService.processAPIResponse).toHaveBeenCalledWith(
        response,
        expect.objectContaining({
          isMultimodal: true,
          processedAttachments: expect.arrayContaining([
            expect.objectContaining({
              url: 'http://example.com/image.jpg',
              mimeType: 'image/jpeg'
            })
          ])
        })
      );
    });

    it('should handle dynamic thinking budget', async () => {
      const response = { candidates: [{ content: { parts: [{ text: 'Test' }] } }] };

      await responseHandler.extractResponseText(response, false, undefined, 75000);

      expect(mockResponseProcessingService.processAPIResponse).toHaveBeenCalledWith(
        response,
        expect.objectContaining({
          thinkingBudget: 75000
        })
      );
    });
  });

  describe('Code Execution Handling', () => {
    beforeEach(() => {
      config.enableCodeExecution = true;
      responseHandler = new GeminiResponseHandler(mockResponseProcessingService, config);
    });

    it('should extract and format code execution results', async () => {
      const response = {
        candidates: [{
          content: {
            parts: [
              { text: 'Here is the code:' },
              {
                executableCode: {
                  code: 'print("Hello, World!")',
                  language: 'python'
                }
              },
              {
                codeExecutionResult: {
                  output: 'Hello, World!'
                }
              }
            ]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toContain('```python');
      expect(result).toContain('print("Hello, World!")');
      expect(result).toContain('**Output:**');
      expect(result).toContain('Hello, World!');
    });

    it('should handle code execution errors', async () => {
      const response = {
        candidates: [{
          content: {
            parts: [
              {
                executableCode: {
                  code: 'invalid_code()',
                  language: 'python'
                }
              },
              {
                codeExecutionResult: {
                  error: 'NameError: name \'invalid_code\' is not defined'
                }
              }
            ]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toContain('**Execution Error:**');
      expect(result).toContain('NameError');
    });

    it('should handle code execution timeout', async () => {
      const response = {
        candidates: [{
          content: {
            parts: [
              {
                executableCode: {
                  code: 'while True: pass',
                  language: 'python'
                }
              },
              {
                codeExecutionResult: {
                  timeout: true
                }
              }
            ]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toContain('**Execution Timeout:**');
      expect(result).toContain('exceeded the time limit');
    });

    it('should combine code execution with regular response', async () => {
      const response = {
        candidates: [{
          content: {
            parts: [
              { text: 'Let me calculate that for you:' },
              {
                executableCode: { code: '2 + 2', language: 'python' }
              },
              {
                codeExecutionResult: { output: '4' }
              }
            ]
          }
        }]
      };

      mockResponseProcessingService.processAPIResponse.mockResolvedValue({
        text: 'Let me calculate that for you:',
        hasThinking: false,
        thinkingLength: 0,
        wasTruncated: false,
        warnings: [],
        isMultimodal: false,
        imageContext: undefined
      });

      const result = await responseHandler.extractResponseText(response);

      expect(result).toContain('Let me calculate that for you:');
      expect(result).toContain('```python\n2 + 2\n```');
      expect(result).toContain('**Output:**\n```\n4\n```');
    });

    it('should truncate long code execution output', async () => {
      const longOutput = 'a'.repeat(3000);
      const response = {
        candidates: [{
          content: {
            parts: [
              {
                codeExecutionResult: { output: longOutput }
              }
            ]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result.length).toBeLessThanOrEqual(2000);
      expect(result).toContain('...');
      expect(logger.warn).toHaveBeenCalledWith('Code execution output truncated due to length');
    });

    it('should sanitize code output', async () => {
      const response = {
        candidates: [{
          content: {
            parts: [
              {
                codeExecutionResult: {
                  output: '```test``` @everyone @here \x1b[31mRed Text\x1b[0m'
                }
              }
            ]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toContain('\\`\\`\\`test\\`\\`\\`');
      expect(result).toContain('@\u200Beveryone');
      expect(result).toContain('@\u200Bhere');
      expect(result).not.toContain('\x1b[31m');
    });

    it('should handle no code execution in response', async () => {
      const response = {
        candidates: [{
          content: { parts: [{ text: 'Regular response' }] }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toBe('Processed response text');
    });
  });

  describe('Google Search Grounding', () => {
    beforeEach(() => {
      config.enableGoogleSearch = true;
      responseHandler = new GeminiResponseHandler(mockResponseProcessingService, config);
    });

    it('should append grounding sources', async () => {
      const response = {
        candidates: [{
          content: { parts: [{ text: 'Response text' }] },
          groundingMetadata: {
            groundingChunks: [
              {
                web: {
                  title: 'Example Article',
                  uri: 'https://example.com/article'
                }
              },
              {
                web: {
                  title: 'Another Source',
                  uri: 'https://example.com/source'
                }
              }
            ]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toContain('**Additional Sources:**');
      expect(result).toContain('[1] Example Article - https://example.com/article');
      expect(result).toContain('[2] Another Source - https://example.com/source');
    });

    it('should not append sources already in response', async () => {
      mockResponseProcessingService.processAPIResponse.mockResolvedValue({
        text: 'Check out this article: https://example.com/article',
        hasThinking: false,
        thinkingLength: 0,
        wasTruncated: false,
        warnings: [],
        isMultimodal: false,
        imageContext: undefined
      });

      const response = {
        candidates: [{
          content: { parts: [{ text: 'Response' }] },
          groundingMetadata: {
            groundingChunks: [{
              web: {
                title: 'Example Article',
                uri: 'https://example.com/article'
              }
            }]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).not.toContain('**Additional Sources:**');
      expect(logger.info).toHaveBeenCalledWith('All 1 grounding sources already present in response text');
    });

    it('should handle grounding with snippets', async () => {
      const response = {
        candidates: [{
          content: { parts: [{ text: 'Response' }] },
          groundingMetadata: {
            searchEntryPoint: {
              renderedContent: 'Search query used'
            },
            groundingChunks: [{
              web: {
                title: 'Source',
                uri: 'https://example.com'
              },
              retrievedContent: {
                content: 'This is a very long snippet that contains important information about the topic...'
              }
            }]
          }
        }]
      };

      const metadata = responseHandler.extractGroundingMetadata(response);

      expect(metadata).toBeDefined();
      expect(metadata?.sources[0].snippet).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith('Grounding search query:', 'Search query used');
    });

    it('should truncate response to fit grounding sources', async () => {
      const longText = 'a'.repeat(1950);
      mockResponseProcessingService.processAPIResponse.mockResolvedValue({
        text: longText,
        hasThinking: false,
        thinkingLength: 0,
        wasTruncated: false,
        warnings: [],
        isMultimodal: false,
        imageContext: undefined
      });

      const response = {
        candidates: [{
          content: { parts: [{ text: 'Response' }] },
          groundingMetadata: {
            groundingChunks: [{
              web: {
                title: 'Source',
                uri: 'https://example.com'
              }
            }]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result.length).toBeLessThanOrEqual(2000);
      expect(result).toContain('...**Additional Sources:**');
      expect(logger.warn).toHaveBeenCalledWith('Truncated response to include additional grounding sources');
    });

    it('should handle no grounding metadata', async () => {
      const response = {
        candidates: [{
          content: { parts: [{ text: 'Response' }] }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toBe('Processed response text');
      expect(result).not.toContain('**Additional Sources:**');
    });
  });

  describe('Thinking Analytics', () => {
    it('should track thinking analytics when thinking is present', async () => {
      responseHandler.setHealthMonitor(mockHealthMonitor);

      mockResponseProcessingService.processAPIResponse.mockResolvedValue({
        text: 'Response with thinking',
        hasThinking: true,
        thinkingLength: 1000,
        wasTruncated: false,
        warnings: [],
        isMultimodal: false,
        imageContext: 'Some thinking text'
      });

      const response = { candidates: [{ content: { parts: [{ text: 'Test' }] } }] };

      await responseHandler.extractResponseText(response);

      const analyticsService = mockHealthMonitor.getService('AnalyticsManager');
      expect(analyticsService.trackPerformance).toHaveBeenCalledWith(
        'api_latency',
        1000,
        'thinking_tokens_budget_50000'
      );
      expect(analyticsService.trackPerformance).toHaveBeenCalledWith(
        'cache_hit_rate',
        expect.any(Number),
        'thinking_effectiveness_ratio'
      );
    });

    it('should handle analytics tracking errors gracefully', async () => {
      responseHandler.setHealthMonitor(mockHealthMonitor);
      
      const analyticsService = mockHealthMonitor.getService('AnalyticsManager');
      (analyticsService.trackPerformance as jest.Mock).mockRejectedValue(new Error('Analytics error'));

      mockResponseProcessingService.processAPIResponse.mockResolvedValue({
        text: 'Response',
        hasThinking: true,
        thinkingLength: 500,
        wasTruncated: false,
        warnings: [],
        isMultimodal: false,
        imageContext: undefined
      });

      const response = { candidates: [{ content: { parts: [{ text: 'Test' }] } }] };

      // Should not throw
      const result = await responseHandler.extractResponseText(response);

      expect(result).toBe('Response');
      expect(logger.debug).toHaveBeenCalledWith('Failed to track thinking analytics:', expect.any(Error));
    });
  });

  describe('Response Formatting', () => {
    it('should format response with thoughts included', () => {
      const text = 'Normal text <thinking>Hidden thoughts</thinking> More text';
      
      const result = responseHandler.formatResponse(text, true);
      
      expect(result).toBe(text);
    });

    it('should remove thinking markers when not including thoughts', () => {
      const text = 'Normal text <thinking>Hidden thoughts</thinking> More text';
      
      const result = responseHandler.formatResponse(text, false);
      
      expect(result).toBe('Normal text  More text');
    });

    it('should truncate long responses', () => {
      const longText = 'a'.repeat(2500);
      
      const result = responseHandler.formatResponse(longText, true);
      
      expect(result.length).toBe(2000);
      expect(result).toEndWith('...');
    });
  });

  describe('Structured Response Parsing', () => {
    it('should parse valid JSON response', async () => {
      const jsonResponse = '{"result": "success", "value": 42}';
      const options: StructuredOutputOptions = {
        schema: {
          type: 'object',
          properties: {
            result: { type: 'string' },
            value: { type: 'number' }
          },
          required: ['result']
        }
      };

      const result = await responseHandler.parseStructuredResponse(jsonResponse, options);

      expect(result).toEqual({ result: 'success', value: 42 });
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully parsed structured response',
        expect.objectContaining({
          responseKeys: ['result', 'value']
        })
      );
    });

    it('should validate required fields', async () => {
      const jsonResponse = '{"value": 42}';
      const options: StructuredOutputOptions = {
        schema: {
          type: 'object',
          properties: {
            result: { type: 'string' },
            value: { type: 'number' }
          },
          required: ['result', 'value']
        },
        validateResponse: true,
        fallbackBehavior: 'error'
      };

      await expect(responseHandler.parseStructuredResponse(jsonResponse, options))
        .rejects.toThrow('Missing required fields: result');
    });

    it('should skip validation when disabled', async () => {
      const jsonResponse = '{"value": 42}';
      const options: StructuredOutputOptions = {
        schema: {
          type: 'object',
          properties: {
            result: { type: 'string' },
            value: { type: 'number' }
          },
          required: ['result']
        },
        validateResponse: false
      };

      const result = await responseHandler.parseStructuredResponse(jsonResponse, options);

      expect(result).toEqual({ value: 42 });
    });

    it('should handle parse errors with raw fallback', async () => {
      const invalidJson = 'not valid json';
      const options: StructuredOutputOptions = {
        schema: {},
        fallbackBehavior: 'raw'
      };

      const result = await responseHandler.parseStructuredResponse(invalidJson, options);

      expect(result).toEqual({
        raw: 'not valid json',
        error: 'Failed to parse as JSON'
      });
    });

    it('should handle parse errors with error fallback', async () => {
      const invalidJson = 'not valid json';
      const options: StructuredOutputOptions = {
        schema: {},
        fallbackBehavior: 'error'
      };

      await expect(responseHandler.parseStructuredResponse(invalidJson, options))
        .rejects.toThrow('Failed to parse structured response');
    });

    it('should log parse errors', async () => {
      const invalidJson = 'not valid json';
      const options: StructuredOutputOptions = {
        schema: {},
        schemaName: 'TestSchema',
        fallbackBehavior: 'raw'
      };

      await responseHandler.parseStructuredResponse(invalidJson, options);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to parse structured response',
        expect.objectContaining({
          schemaName: 'TestSchema',
          responsePreview: 'not valid json'
        })
      );
    });
  });

  describe('Response Processing Logging', () => {
    it('should log warnings from processed response', async () => {
      mockResponseProcessingService.processAPIResponse.mockResolvedValue({
        text: 'Response',
        hasThinking: false,
        thinkingLength: 0,
        wasTruncated: false,
        warnings: ['Warning 1', 'Warning 2'],
        isMultimodal: false,
        imageContext: undefined
      });

      const response = { candidates: [{ content: { parts: [{ text: 'Test' }] } }] };
      await responseHandler.extractResponseText(response);

      expect(logger.warn).toHaveBeenCalledWith('Response processing warnings:', ['Warning 1', 'Warning 2']);
    });

    it('should log truncation warning', async () => {
      mockResponseProcessingService.processAPIResponse.mockResolvedValue({
        text: 'Truncated response',
        hasThinking: false,
        thinkingLength: 0,
        wasTruncated: true,
        warnings: [],
        isMultimodal: false,
        imageContext: undefined
      });

      const response = { candidates: [{ content: { parts: [{ text: 'Test' }] } }] };
      await responseHandler.extractResponseText(response);

      expect(logger.warn).toHaveBeenCalledWith('Response was truncated to fit Discord message limits');
    });

    it('should log multimodal processing', async () => {
      mockResponseProcessingService.processAPIResponse.mockResolvedValue({
        text: 'Response',
        hasThinking: false,
        thinkingLength: 0,
        wasTruncated: false,
        warnings: [],
        isMultimodal: true,
        imageContext: 'Image context'
      });

      const response = { candidates: [{ content: { parts: [{ text: 'Test' }] } }] };
      await responseHandler.extractResponseText(response);

      expect(logger.info).toHaveBeenCalledWith('Processed multimodal response with image context');
    });
  });

  describe('Edge Cases', () => {
    it('should handle response with no candidates', async () => {
      const response = {};
      
      const result = await responseHandler.extractResponseText(response);
      
      expect(result).toBe('Processed response text');
    });

    it('should handle empty grounding chunks', async () => {
      config.enableGoogleSearch = true;
      responseHandler = new GeminiResponseHandler(mockResponseProcessingService, config);

      const response = {
        candidates: [{
          content: { parts: [{ text: 'Response' }] },
          groundingMetadata: {
            groundingChunks: []
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toBe('Processed response text');
      expect(result).not.toContain('**Additional Sources:**');
    });

    it('should handle code execution with no regular text', async () => {
      config.enableCodeExecution = true;
      responseHandler = new GeminiResponseHandler(mockResponseProcessingService, config);

      mockResponseProcessingService.processAPIResponse.mockResolvedValue({
        text: '',
        hasThinking: false,
        thinkingLength: 0,
        wasTruncated: false,
        warnings: [],
        isMultimodal: false,
        imageContext: undefined
      });

      const response = {
        candidates: [{
          content: {
            parts: [{
              codeExecutionResult: { output: 'Hello' }
            }]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      expect(result).toContain('**Output:**');
      expect(result).toContain('Hello');
    });

    it('should handle very long lines in code output', async () => {
      config.enableCodeExecution = true;
      responseHandler = new GeminiResponseHandler(mockResponseProcessingService, config);

      const longLine = 'a'.repeat(300);
      const response = {
        candidates: [{
          content: {
            parts: [{
              codeExecutionResult: { 
                output: `${longLine}\nShort line\n${longLine}` 
              }
            }]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      // Each long line should be truncated
      const lines = result.split('\n');
      const outputLines = lines.filter(line => line.length > 0 && !line.startsWith('**'));
      outputLines.forEach(line => {
        if (line.includes('a'.repeat(50))) { // Check if it's one of our long lines
          expect(line.length).toBeLessThanOrEqual(200);
          expect(line).toEndWith('...');
        }
      });
    });

    it('should handle many lines in code output', async () => {
      config.enableCodeExecution = true;
      responseHandler = new GeminiResponseHandler(mockResponseProcessingService, config);

      const manyLines = Array(100).fill('Line').map((v, i) => `${v} ${i}`).join('\n');
      const response = {
        candidates: [{
          content: {
            parts: [{
              codeExecutionResult: { output: manyLines }
            }]
          }
        }]
      };

      const result = await responseHandler.extractResponseText(response);

      const lines = result.split('\n');
      expect(lines.length).toBeLessThanOrEqual(60); // Some for formatting, max 50 output lines
      expect(result).toContain('... (output truncated)');
    });
  });
});