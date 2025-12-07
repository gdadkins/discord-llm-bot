
import { GeminiAPIClient } from '../../../../src/services/gemini/GeminiAPIClient';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { getGeminiConfig, GEMINI_MODELS } from '../../../../src/services/gemini/GeminiConfig';
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
jest.mock('@google/generative-ai');
jest.mock('../../../../src/services/gemini/GeminiConfig');
jest.mock('../../../../src/utils/timeoutUtils');
jest.mock('../../../../src/utils/logger');

describe('GeminiAPIClient', () => {
  let geminiAPIClient: GeminiAPIClient;
  let mockGracefulDegradation: jest.Mocked<IGracefulDegradationService>;
  let mockMultimodalContentHandler: jest.Mocked<IMultimodalContentHandler>;
  let mockGoogleGenAI: jest.Mocked<GoogleGenerativeAI>;
  let mockGenerativeModel: jest.Mocked<GenerativeModel>;
  let mockGenerateContent: jest.Mock;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Save and setup environment
    originalEnv = { ...process.env };
    process.env.GEMINI_SYSTEM_INSTRUCTION = 'Test system instruction';
    process.env.GROUNDING_THRESHOLD = '0.5';
    process.env.THINKING_BUDGET = '50000';
    process.env.INCLUDE_THOUGHTS = 'true';
    process.env.ENABLE_CODE_EXECUTION = 'true';
    process.env.ENABLE_STRUCTURED_OUTPUT = 'true';
    process.env.FORCE_THINKING_PROMPT = 'false';
    process.env.THINKING_TRIGGER = '';
    process.env.ENABLE_GOOGLE_SEARCH = 'false';
    process.env.UNFILTERED_MODE = 'false';

    // Setup mock graceful degradation
    mockGracefulDegradation = {
      executeWithCircuitBreaker: jest.fn().mockImplementation((fn) => fn())
    } as unknown as jest.Mocked<IGracefulDegradationService>;

    // Setup mock multimodal content handler
    mockMultimodalContentHandler = {
      buildProviderContent: jest.fn().mockReturnValue([{
        role: 'user',
        parts: [{ text: 'Test content' }]
      }])
    } as unknown as jest.Mocked<IMultimodalContentHandler>;

    // Setup mock Google Gen AI
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: {
        candidates: [{
          content: {
            parts: [{ text: 'Generated response' }]
          }
        }]
      }
    });

    mockGenerativeModel = {
      generateContent: mockGenerateContent
    } as unknown as jest.Mocked<GenerativeModel>;

    mockGoogleGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockGenerativeModel)
    } as unknown as jest.Mocked<GoogleGenerativeAI>;

    (GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>).mockImplementation(() => mockGoogleGenAI);

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

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with valid configuration', () => {
      expect(geminiAPIClient).toBeDefined();
      expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-api-key');
      expect(logger.info).toHaveBeenCalledWith('GeminiAPIClient initialized with Gemini API integration');
    });

    it('should log configuration on initialization', () => {
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Google Search grounding configured with threshold: 0.5')
      );
    });

    it('should log Google search when enabled', () => {
      process.env.ENABLE_GOOGLE_SEARCH = 'true';
      process.env.GROUNDING_THRESHOLD = '0.7';

      new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);

      expect(logger.info).toHaveBeenCalledWith(
        'Google Search grounding enabled with threshold: 0.7'
      );
    });

    it('should warn when unfiltered mode is enabled', () => {
      process.env.UNFILTERED_MODE = 'true';

      new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('UNFILTERED MODE ENABLED')
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
        stopSequences: ['STOP']
      };

      const config = geminiAPIClient.buildGenerationConfig('LEGACY', options);

      expect(config).toEqual(expect.objectContaining({
        temperature: 0.9,
        topK: 50,
        maxOutputTokens: 4096,
        stopSequences: ['STOP']
      }));
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
          }));
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
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Generated response' }]
            }
          }]
        }
      });
    });

    it('should execute multimodal call with images', async () => {
        const imageAttachments = [{
            url: 'http://example.com/image.jpg',
            mimeType: 'image/jpeg',
            base64Data: 'base64data'
          }];
    
          await geminiAPIClient.executeAPICall('Test prompt', imageAttachments);
    
          expect(mockMultimodalContentHandler.buildProviderContent).toHaveBeenCalledWith(
            'Test prompt',
            imageAttachments,
            'gemini'
          );
          expect(mockGenerateContent).toHaveBeenCalled();
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
        'text-only Gemini API call failed',
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
  });

  describe('Tools Configuration', () => {
    it('should add Google search tool when enabled', async () => {
        process.env.ENABLE_GOOGLE_SEARCH = 'true';
        process.env.GROUNDING_THRESHOLD = '0.7';
        process.env.ENABLE_CODE_EXECUTION = 'false';

        const client = new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);
        await client.executeAPICall('Test prompt');

        expect(mockGoogleGenAI.getGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
            tools: expect.arrayContaining([
                {
                    googleSearch: {}
                }
            ])
        }));
    });
  });

  describe('Safety Settings', () => {
    it('should add safety settings for unfiltered mode', async () => {
        process.env.UNFILTERED_MODE = 'true';

        const client = new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);
        await client.executeAPICall('Test prompt');

        expect(mockGoogleGenAI.getGenerativeModel).toHaveBeenCalledWith(
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
        process.env.ENABLE_GOOGLE_SEARCH = 'true';

        const client = new GeminiAPIClient('test-api-key', mockGracefulDegradation, mockMultimodalContentHandler);
        await client.executeAPICall('Test prompt');

        expect(mockGoogleGenAI.getGenerativeModel).toHaveBeenCalledWith(
          expect.objectContaining({
            safetySettings: expect.arrayContaining([
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
            ])
          })
        );
    });

    it('should not add safety settings by default', async () => {
        await geminiAPIClient.executeAPICall('Test prompt');

        expect(mockGoogleGenAI.getGenerativeModel).toHaveBeenCalledWith(
            expect.objectContaining({
              safetySettings: undefined
            })
        );
    });
  });

  describe('Response Debug Logging', () => {
    it('should log response debug info', async () => {
        await geminiAPIClient.executeAPICall('Test prompt');

        expect(logger.info).toHaveBeenCalledWith('=== GEMINI API RESPONSE DEBUG (text-only) ===');
        expect(logger.info).toHaveBeenCalledWith('Response type:', 'object');
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
          'multimodal Gemini API call failed',
          expect.objectContaining({
            error: 'API error'
          })
        );
    });
  });
});