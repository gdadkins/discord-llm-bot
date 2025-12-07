/**
 * GeminiAPIClient Unit Tests
 * Comprehensive test suite for the Gemini API client
 * Target coverage: 80%+
 */

import { GeminiAPIClient } from '../../../../src/services/gemini/GeminiAPIClient';
import { GoogleGenAI } from '@google/genai';
import { getGeminiConfig, GEMINI_MODELS } from '../../../../src/config/geminiConfig';
import { ConfigurationFactory } from '../../../../src/config/ConfigurationFactory';
import { wrapExternalAPIOperation } from '../../../../src/utils/timeoutUtils';
import { logger } from '../../../../src/utils/logger';
import type { 
  IGracefulDegradationService,
  IMultimodalContentHandler,
  GeminiGenerationOptions,
  StructuredOutputOptions
} from '../../../../src/services/interfaces';
import type { GeminiConfig, HarmCategory, HarmBlockThreshold } from '../../../../src/types';

// Mock all external modules
jest.mock('@google/genai');
jest.mock('../../../../src/config/geminiConfig');
jest.mock('../../../../src/config/ConfigurationFactory');
jest.mock('../../../../src/utils/timeoutUtils');
jest.mock('../../../../src/utils/logger');

describe('GeminiAPIClient', () => {
  let geminiAPIClient: GeminiAPIClient;
  let mockGracefulDegradation: jest.Mocked<IGracefulDegradationService>;
  let mockMultimodalContentHandler: jest.Mocked<IMultimodalContentHandler>;
  let mockGoogleGenAI: jest.Mocked<GoogleGenAI>;
  let mockGenerateContent: jest.Mock;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock graceful degradation
    mockGracefulDegradation = {
      executeWithCircuitBreaker: jest.fn().mockImplementation((fn) => fn())
    } as unknown as jest.Mocked<IGracefulDegradationService>;

    // Setup mock multimodal content handler
    mockMultimodalContentHandler = {
      buildProviderContent: jest.fn().mockReturnValue({
        parts: [{ text: 'Test content' }]
      })
    } as unknown as jest.Mocked<IMultimodalContentHandler>;

    // Setup mock Google Gen AI
    mockGenerateContent = jest.fn().mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ text: 'Generated response' }]
        }
      }]
    });

    mockGoogleGenAI = {
      models: {
        generateContent: mockGenerateContent
      }
    } as unknown as jest.Mocked<GoogleGenAI>;

    (GoogleGenAI as jest.MockedClass<typeof GoogleGenAI>).mockImplementation(() => mockGoogleGenAI);

    // Setup configuration factory mock
    (ConfigurationFactory.createGeminiServiceConfig as jest.Mock).mockReturnValue({
      systemInstruction: 'Test system instruction',
      groundingThreshold: 0.5,
      thinkingBudget: 50000,
      includeThoughts: true,
      enableCodeExecution: true,
      enableStructuredOutput: true,
      forceThinkingPrompt: false,
      thinkingTrigger: '',
      enableGoogleSearch: false,
      unfilteredMode: false
    });

    // Setup gemini config mock
    (getGeminiConfig as jest.Mock).mockReturnValue({
      model: 'gemini-pro',
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048
    });

    // Setup timeout wrapper mock
    (wrapExternalAPIOperation as jest.Mock).mockImplementation((fn) => fn());

    // Create client instance
    geminiAPIClient = new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with valid configuration', () => {
      expect(geminiAPIClient).toBeDefined();
      expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
      expect(ConfigurationFactory.createGeminiServiceConfig).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('GeminiAPIClient initialized with Gemini API integration');
    });

    it('should log configuration on initialization', () => {
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Google Search grounding configured with threshold: 0.5')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Thinking mode configured with budget: 50000 tokens')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Additional features: Code execution: true')
      );
    });

    it('should log code execution enabled', () => {
      expect(logger.info).toHaveBeenCalledWith(
        'Code execution enabled - Python code blocks in responses will be executed automatically'
      );
    });

    it('should log force thinking prompt when enabled', () => {
      (ConfigurationFactory.createGeminiServiceConfig as jest.Mock).mockReturnValue({
        forceThinkingPrompt: true,
        thinkingTrigger: 'Think about this'
      });

      new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);

      expect(logger.info).toHaveBeenCalledWith(
        'Force thinking prompt enabled with trigger: "Think about this"'
      );
    });

    it('should log Google search when enabled', () => {
      (ConfigurationFactory.createGeminiServiceConfig as jest.Mock).mockReturnValue({
        enableGoogleSearch: true,
        groundingThreshold: 0.7
      });

      new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);

      expect(logger.info).toHaveBeenCalledWith(
        'Google Search grounding enabled with threshold: 0.7'
      );
    });

    it('should warn when unfiltered mode is enabled', () => {
      (ConfigurationFactory.createGeminiServiceConfig as jest.Mock).mockReturnValue({
        unfilteredMode: true
      });

      new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);

      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️  UNFILTERED MODE ENABLED - Bot will provide unrestricted responses to all requests'
      );
    });
  });

  describe('Getters', () => {
    it('should return AI instance', () => {
      const ai = geminiAPIClient.getAI();
      expect(ai).toBe(mockGoogleGenAI);
    });

    it('should return config copy', () => {
      const config = geminiAPIClient.getConfig();
      expect(config).toEqual({
        systemInstruction: 'Test system instruction',
        groundingThreshold: 0.5,
        thinkingBudget: 50000,
        includeThoughts: true,
        enableCodeExecution: true,
        enableStructuredOutput: true,
        forceThinkingPrompt: false,
        thinkingTrigger: '',
        enableGoogleSearch: false,
        unfilteredMode: false
      });

      // Verify it's a copy
      config.thinkingBudget = 100000;
      expect(geminiAPIClient.getConfig().thinkingBudget).toBe(50000);
    });
  });

  describe('buildGenerationConfig', () => {
    it('should build basic generation config', () => {
      const config = geminiAPIClient.buildGenerationConfig('LEGACY');

      expect(config).toEqual({
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      });
    });

    it('should override with options', () => {
      const options: GeminiGenerationOptions = {
        temperature: 0.9,
        topK: 50,
        maxOutputTokens: 4096,
        presencePenalty: 0.5,
        frequencyPenalty: 0.3,
        stopSequences: ['STOP']
      };

      const config = geminiAPIClient.buildGenerationConfig('LEGACY', options);

      expect(config).toEqual(expect.objectContaining({
        temperature: 0.9,
        topK: 50,
        maxOutputTokens: 4096,
        presencePenalty: 0.5,
        frequencyPenalty: 0.3,
        stopSequences: ['STOP']
      }));
    });

    it('should handle dynamic thinking budget as number', () => {
      (getGeminiConfig as jest.Mock).mockReturnValue({
        model: 'gemini-2.5-pro',
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      });

      const config = geminiAPIClient.buildGenerationConfig('LEGACY', 100000);

      expect(config).toEqual(expect.objectContaining({
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 100000
        }
      }));
    });

    it('should add thinking config for 2.5 models', () => {
      (getGeminiConfig as jest.Mock).mockReturnValue({
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      });

      const config = geminiAPIClient.buildGenerationConfig('LEGACY');

      expect(config).toEqual(expect.objectContaining({
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 50000
        }
      }));
    });

    it('should not add thinking config for non-2.5 models', () => {
      (getGeminiConfig as jest.Mock).mockReturnValue({
        model: 'gemini-pro',
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      });

      const config = geminiAPIClient.buildGenerationConfig('LEGACY');

      expect(config).not.toHaveProperty('thinkingConfig');
    });

    it('should configure structured output', () => {
      const structuredOutput: StructuredOutputOptions = {
        schema: {
          type: 'object',
          properties: {
            result: { type: 'string' }
          },
          required: ['result']
        },
        validateResponse: true
      };

      const options: GeminiGenerationOptions = {
        structuredOutput
      };

      const config = geminiAPIClient.buildGenerationConfig('LEGACY', options);

      expect(config).toEqual(expect.objectContaining({
        responseMimeType: 'application/json',
        responseSchema: structuredOutput.schema
      }));
    });

    it('should add reasoning to structured output', () => {
      const structuredOutput: StructuredOutputOptions = {
        schema: {
          type: 'object',
          properties: {
            result: { type: 'string' }
          },
          required: ['result']
        }
      };

      const options: GeminiGenerationOptions = {
        structuredOutput,
        includeReasoning: true
      };

      const config = geminiAPIClient.buildGenerationConfig('LEGACY', options);

      expect(config.responseSchema).toEqual({
        type: 'object',
        properties: {
          result: { type: 'string' },
          reasoning: {
            type: 'string',
            description: 'Step-by-step reasoning that led to this response'
          }
        },
        required: ['result', 'reasoning']
      });
    });
  });

  describe('executeAPICall', () => {
    it('should execute text-only call', async () => {
      const result = await geminiAPIClient.executeAPICall('Test prompt');

      expect(mockGracefulDegradation.executeWithCircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        'gemini'
      );
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(result).toEqual({
        candidates: [{
          content: {
            parts: [{ text: 'Generated response' }]
          }
        }]
      });
    });

    it('should execute multimodal call with images', async () => {
      const imageAttachments = [{
        url: 'http://example.com/image.jpg',
        mimeType: 'image/jpeg',
        base64Data: 'base64data'
      }];

      const result = await geminiAPIClient.executeAPICall('Test prompt', imageAttachments);

      expect(mockMultimodalContentHandler.buildProviderContent).toHaveBeenCalledWith(
        'Test prompt',
        imageAttachments,
        'gemini'
      );
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should use vision profile for images', async () => {
      process.env.GEMINI_VISION_PROFILE = 'CUSTOM_VISION';
      
      const imageAttachments = [{
        url: 'http://example.com/image.jpg',
        mimeType: 'image/jpeg',
        base64Data: 'base64data'
      }];

      await geminiAPIClient.executeAPICall('Test prompt', imageAttachments);

      expect(getGeminiConfig).toHaveBeenCalledWith('CUSTOM_VISION');
      
      delete process.env.GEMINI_VISION_PROFILE;
    });

    it('should handle API call timeout', async () => {
      const error = new Error('Request timeout');
      (wrapExternalAPIOperation as jest.Mock).mockRejectedValue(error);

      await expect(geminiAPIClient.executeAPICall('Test prompt')).rejects.toThrow('Request timeout');
      expect(logger.error).toHaveBeenCalledWith(
        'Text-only Gemini API call failed',
        expect.objectContaining({
          error: 'Request timeout'
        })
      );
    });

    it('should record successful duration', async () => {
      await geminiAPIClient.executeAPICall('Test prompt');

      // Verify adaptive timeout recording by checking logs
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('=== GEMINI API RESPONSE DEBUG')
      );
    });

    it('should handle dynamic thinking budget', async () => {
      (getGeminiConfig as jest.Mock).mockReturnValue({
        model: 'gemini-2.5-pro',
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      });

      await geminiAPIClient.executeAPICall('Test prompt', undefined, 75000);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 75000
            }
          })
        })
      );
    });
  });

  describe('Tools Configuration', () => {
    it('should add code execution tool when enabled', async () => {
      await geminiAPIClient.executeAPICall('Test prompt');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            { codeExecution: { enabled: true } }
          ])
        })
      );
      expect(logger.info).toHaveBeenCalledWith('Adding code execution tool to API request');
    });

    it('should add Google search tool when enabled', async () => {
      (ConfigurationFactory.createGeminiServiceConfig as jest.Mock).mockReturnValue({
        enableGoogleSearch: true,
        groundingThreshold: 0.7,
        enableCodeExecution: false
      });

      const client = new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);
      await client.executeAPICall('Test prompt');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            {
              googleSearchRetrieval: {
                dynamicRetrievalConfig: {
                  mode: 'MODE_DYNAMIC',
                  dynamicThreshold: 0.7
                }
              }
            }
          ])
        })
      );
    });

    it('should add both tools when both enabled', async () => {
      (ConfigurationFactory.createGeminiServiceConfig as jest.Mock).mockReturnValue({
        enableGoogleSearch: true,
        enableCodeExecution: true,
        groundingThreshold: 0.6
      });

      const client = new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);
      await client.executeAPICall('Test prompt');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            { codeExecution: { enabled: true } },
            {
              googleSearchRetrieval: {
                dynamicRetrievalConfig: {
                  mode: 'MODE_DYNAMIC',
                  dynamicThreshold: 0.6
                }
              }
            }
          ])
        })
      );
    });
  });

  describe('Safety Settings', () => {
    it('should add safety settings for unfiltered mode', async () => {
      (ConfigurationFactory.createGeminiServiceConfig as jest.Mock).mockReturnValue({
        unfilteredMode: true
      });

      const client = new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);
      await client.executeAPICall('Test prompt');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          safetySettings: expect.arrayContaining([
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
          ])
        })
      );
    });

    it('should add safety settings for Google search', async () => {
      (ConfigurationFactory.createGeminiServiceConfig as jest.Mock).mockReturnValue({
        enableGoogleSearch: true
      });

      const client = new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);
      await client.executeAPICall('Test prompt');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          safetySettings: expect.arrayContaining([
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
          ])
        })
      );
    });

    it('should not add safety settings by default', async () => {
      await geminiAPIClient.executeAPICall('Test prompt');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.not.objectContaining({
          safetySettings: expect.anything()
        })
      );
    });
  });

  describe('Response Debug Logging', () => {
    it('should log response debug info', async () => {
      await geminiAPIClient.executeAPICall('Test prompt');

      expect(logger.info).toHaveBeenCalledWith('=== GEMINI API RESPONSE DEBUG (text-only) ===');
      expect(logger.info).toHaveBeenCalledWith('Response type:', 'object');
      expect(logger.info).toHaveBeenCalledWith('Response keys:', ['candidates']);
    });

    it('should log multimodal response debug', async () => {
      const imageAttachments = [{
        url: 'http://example.com/image.jpg',
        mimeType: 'image/jpeg',
        base64Data: 'base64data'
      }];

      await geminiAPIClient.executeAPICall('Test prompt', imageAttachments);

      expect(logger.info).toHaveBeenCalledWith('=== GEMINI API RESPONSE DEBUG (multimodal) ===');
    });

    it('should handle response with missing candidates', async () => {
      mockGenerateContent.mockResolvedValue({});

      await geminiAPIClient.executeAPICall('Test prompt');

      expect(logger.info).toHaveBeenCalledWith('Response keys:', []);
    });
  });

  describe('Error Handling', () => {
    it('should handle circuit breaker errors', async () => {
      const error = new Error('Circuit breaker is OPEN');
      mockGracefulDegradation.executeWithCircuitBreaker.mockRejectedValue(error);

      await expect(geminiAPIClient.executeAPICall('Test prompt')).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should log multimodal error details', async () => {
      const error = new Error('API error');
      (wrapExternalAPIOperation as jest.Mock).mockRejectedValue(error);

      const imageAttachments = [{
        url: 'http://example.com/image.jpg',
        mimeType: 'image/jpeg',
        base64Data: 'base64data'
      }];

      await expect(geminiAPIClient.executeAPICall('Test prompt', imageAttachments)).rejects.toThrow('API error');

      expect(logger.error).toHaveBeenCalledWith(
        'Multimodal Gemini API call failed',
        expect.objectContaining({
          imageCount: 1,
          error: 'API error'
        })
      );
    });
  });

  describe('Multimodal Content Handling', () => {
    it('should add system instruction to multimodal content', async () => {
      const imageAttachments = [{
        url: 'http://example.com/image.jpg',
        mimeType: 'image/jpeg',
        base64Data: 'base64data'
      }];

      (getGeminiConfig as jest.Mock).mockReturnValue({
        model: 'gemini-pro-vision',
        systemInstruction: 'Vision system instruction',
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      });

      mockMultimodalContentHandler.buildProviderContent.mockReturnValue({
        parts: [{ text: 'User content' }]
      });

      await geminiAPIClient.executeAPICall('Test prompt', imageAttachments);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{
            parts: [
              { text: 'Vision system instruction' },
              { text: 'User content' }
            ]
          }]
        })
      );
    });
  });

  describe('Default Model Handling', () => {
    it('should use default model when not specified', async () => {
      (getGeminiConfig as jest.Mock).mockReturnValue({
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      });

      await geminiAPIClient.executeAPICall('Test prompt');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: GEMINI_MODELS.FLASH_PREVIEW
        })
      );
    });
  });
});