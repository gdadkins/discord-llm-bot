/**
 * GeminiService Unit Tests
 * Comprehensive test suite for the main Gemini service orchestrator
 * Target coverage: 80%+
 */

import { GeminiService } from '../../../../src/services/gemini/GeminiService';
import { GeminiAPIClient } from '../../../../src/services/gemini/GeminiAPIClient';
import { GeminiContextProcessor } from '../../../../src/services/gemini/GeminiContextProcessor';
import { GeminiResponseHandler } from '../../../../src/services/gemini/GeminiResponseHandler';
import { largeContextHandler } from '../../../../src/utils/largeContextHandler';
import { globalPools } from '../../../../src/utils/PromisePool';
import { globalCoalescers } from '../../../../src/utils/RequestCoalescer';
import { logger } from '../../../../src/utils/logger';
import type { 
  IRateLimiter, 
  IContextManager, 
  IPersonalityManager, 
  ICacheManager, 
  IGracefulDegradationService,
  IRoastingEngine,
  IResponseProcessingService,
  IMultimodalContentHandler,
  IHealthMonitor,
  ServiceHealthStatus,
  DegradationStatus,
  CacheStats,
  CachePerformance,
  StructuredOutputOptions,
  BotConfiguration
} from '../../../../src/services/interfaces';
import type { IConversationManager } from '../../../../src/services/conversationManager';
import type { IRetryHandler } from '../../../../src/services/retryHandler';
import type { ISystemContextBuilder } from '../../../../src/services/systemContextBuilder';
import type { Client, Guild, GuildMember } from 'discord.js';
import type { MessageContext } from '../../../../src/commands';

// Mock all external modules
jest.mock('../../../../src/services/gemini/GeminiAPIClient');
jest.mock('../../../../src/services/gemini/GeminiContextProcessor');
jest.mock('../../../../src/services/gemini/GeminiResponseHandler');
jest.mock('../../../../src/utils/largeContextHandler');
jest.mock('../../../../src/utils/PromisePool');
jest.mock('../../../../src/utils/RequestCoalescer');
jest.mock('../../../../src/utils/logger');

describe('GeminiService', () => {
  let geminiService: GeminiService;
  let mockDependencies: any;
  let mockApiClient: jest.Mocked<GeminiAPIClient>;
  let mockContextProcessor: jest.Mocked<GeminiContextProcessor>;
  let mockResponseHandler: jest.Mocked<GeminiResponseHandler>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock dependencies
    mockDependencies = {
      rateLimiter: {
        checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true }),
        getRemainingQuota: jest.fn().mockReturnValue({ minute: 60, daily: 1000 })
      } as unknown as IRateLimiter,
      contextManager: {
        addEmbarrassingMoment: jest.fn(),
        addRunningGag: jest.fn()
      } as unknown as IContextManager,
      personalityManager: {} as IPersonalityManager,
      cacheManager: {
        shouldBypassCache: jest.fn().mockReturnValue(false),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        clearCache: jest.fn(),
        getStats: jest.fn().mockReturnValue({ hits: 100, misses: 50, size: 1000 }),
        getCachePerformance: jest.fn().mockReturnValue({ hitRate: 0.667, avgRetrievalTime: 5 })
      } as unknown as ICacheManager,
      gracefulDegradation: {
        shouldDegrade: jest.fn().mockResolvedValue({ shouldDegrade: false }),
        queueMessage: jest.fn().mockResolvedValue(undefined),
        generateFallbackResponse: jest.fn().mockResolvedValue('Fallback response'),
        triggerRecovery: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockReturnValue({ isSystemDegraded: false, degradedServices: [] }),
        setHealthMonitor: jest.fn()
      } as unknown as IGracefulDegradationService,
      roastingEngine: {
        shouldRoast: jest.fn().mockReturnValue(false)
      } as unknown as IRoastingEngine,
      conversationManager: {
        addToConversation: jest.fn(),
        clearUserConversation: jest.fn().mockReturnValue(true),
        getConversationStats: jest.fn().mockReturnValue({ activeUsers: 10, totalMessages: 100, totalContextSize: 5000 }),
        buildConversationContext: jest.fn().mockReturnValue('Previous conversation context')
      } as unknown as IConversationManager,
      retryHandler: {
        executeWithRetry: jest.fn().mockImplementation(async (fn) => fn()),
        getUserFriendlyErrorMessage: jest.fn().mockReturnValue('User friendly error message')
      } as unknown as IRetryHandler,
      systemContextBuilder: {
        setDiscordClient: jest.fn()
      } as unknown as ISystemContextBuilder,
      responseProcessingService: {} as IResponseProcessingService,
      multimodalContentHandler: {} as IMultimodalContentHandler
    };

    // Setup mocked class instances
    mockApiClient = new GeminiAPIClient('test-key', mockDependencies.gracefulDegradation, mockDependencies.multimodalContentHandler) as jest.Mocked<GeminiAPIClient>;
    mockContextProcessor = new GeminiContextProcessor(
      mockDependencies.contextManager,
      mockDependencies.personalityManager,
      mockDependencies.conversationManager,
      mockDependencies.systemContextBuilder,
      mockDependencies.rateLimiter,
      mockDependencies.gracefulDegradation,
      {} as any
    ) as jest.Mocked<GeminiContextProcessor>;
    mockResponseHandler = new GeminiResponseHandler(mockDependencies.responseProcessingService, {} as any) as jest.Mocked<GeminiResponseHandler>;

    // Setup mock implementations
    (mockApiClient.getConfig as jest.Mock).mockReturnValue({
      groundingThreshold: 0.5,
      thinkingBudget: 50000,
      includeThoughts: true,
      enableCodeExecution: true,
      enableStructuredOutput: true,
      enableGoogleSearch: true,
      unfilteredMode: false,
      systemInstruction: 'Test instruction',
      forceThinkingPrompt: false,
      thinkingTrigger: ''
    });
    (mockApiClient.getAI as jest.Mock).mockReturnValue({});
    (mockApiClient.executeAPICall as jest.Mock).mockResolvedValue({ text: 'Test response' });

    (mockContextProcessor.assembleContext as jest.Mock).mockReturnValue({
      dateContext: 'Date context',
      timeContext: 'Time context',
      superContext: null
    });
    (mockContextProcessor.buildSystemContext as jest.Mock).mockResolvedValue('Full system context');
    (mockContextProcessor.calculateThinkingBudget as jest.Mock).mockReturnValue(50000);

    (mockResponseHandler.extractResponseText as jest.Mock).mockResolvedValue('Processed response');
    (mockResponseHandler.parseStructuredResponse as jest.Mock).mockResolvedValue({ result: 'structured' });

    // Setup global mocks
    (globalCoalescers as any).geminiGeneration = {
      execute: jest.fn().mockImplementation(async (key, fn) => fn())
    };
    (globalPools as any).context = {
      execute: jest.fn().mockImplementation(async (fn) => fn())
    };
    (largeContextHandler.initialize as jest.Mock).mockResolvedValue(undefined);
    (largeContextHandler.cleanupAll as jest.Mock).mockResolvedValue(undefined);

    // Create service instance
    geminiService = new GeminiService('test-api-key', mockDependencies);
  });

  describe('Constructor and Initialization', () => {
    it('should construct with valid dependencies', () => {
      expect(geminiService).toBeDefined();
      expect(GeminiAPIClient).toHaveBeenCalledWith('test-api-key', mockDependencies.gracefulDegradation, mockDependencies.multimodalContentHandler);
      expect(GeminiContextProcessor).toHaveBeenCalled();
      expect(GeminiResponseHandler).toHaveBeenCalled();
    });

    it('should throw error when dependencies are missing', () => {
      expect(() => new GeminiService('test-key', null as any)).toThrow('GeminiService requires all dependencies to be provided');
    });

    it('should initialize successfully', async () => {
      await geminiService.initialize();
      
      expect(largeContextHandler.initialize).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Large context handler initialized for conversation summarization');
      expect(logger.info).toHaveBeenCalledWith('GeminiService initialized with Gemini API integration');
    });

    it('should log unfiltered mode warning when enabled', async () => {
      (mockApiClient.getConfig as jest.Mock).mockReturnValue({ unfilteredMode: true });
      
      await geminiService.initialize();
      
      expect(logger.warn).toHaveBeenCalledWith('⚠️  UNFILTERED MODE ENABLED - Bot will provide unrestricted responses to all requests');
    });

    it('should shutdown properly', async () => {
      await geminiService.shutdown();
      
      expect(largeContextHandler.cleanupAll).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Large context handler cleanup complete');
      expect(logger.info).toHaveBeenCalledWith('GeminiService shutdown complete');
    });
  });

  describe('Health Monitoring', () => {
    it('should set health monitor', () => {
      const mockHealthMonitor = {} as IHealthMonitor;
      geminiService.setHealthMonitor(mockHealthMonitor);
      
      expect(mockDependencies.gracefulDegradation.setHealthMonitor).toHaveBeenCalledWith(mockHealthMonitor);
    });

    it('should set discord client', () => {
      const mockClient = {} as Client;
      geminiService.setDiscordClient(mockClient);
      
      expect(mockDependencies.systemContextBuilder.setDiscordClient).toHaveBeenCalledWith(mockClient);
    });

    it('should return health status', () => {
      const status = geminiService.getHealthStatus();
      
      expect(status).toEqual({
        healthy: true,
        name: 'GeminiService',
        errors: [],
        metrics: {
          hasApiKey: true,
          groundingThreshold: 0.5,
          thinkingBudget: 50000,
          includeThoughts: true,
          enableCodeExecution: true,
          enableStructuredOutput: true
        }
      });
    });
  });

  describe('generateResponse', () => {
    const defaultParams = {
      prompt: 'Test prompt',
      userId: 'user123',
      serverId: 'server456'
    };

    it('should generate response successfully', async () => {
      const response = await geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      );

      expect(response).toBe('Processed response');
      expect(mockDependencies.rateLimiter.checkAndIncrement).toHaveBeenCalled();
      expect(mockApiClient.executeAPICall).toHaveBeenCalled();
      expect(mockResponseHandler.extractResponseText).toHaveBeenCalled();
      expect(mockDependencies.conversationManager.addToConversation).toHaveBeenCalledWith(
        defaultParams.userId,
        defaultParams.prompt,
        'Processed response'
      );
    });

    it('should handle cache hit', async () => {
      mockDependencies.cacheManager.get.mockResolvedValue('Cached response');

      const response = await geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      );

      expect(response).toBe('Cached response');
      expect(mockApiClient.executeAPICall).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Cache hit - returning cached response');
    });

    it('should handle rate limit exceeded', async () => {
      mockDependencies.rateLimiter.checkAndIncrement.mockResolvedValue({
        allowed: false,
        reason: 'Daily limit exceeded'
      });

      await expect(geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      )).rejects.toThrow('You\'ve reached your daily message limit');
    });

    it('should handle degradation with high severity', async () => {
      const mockRespond = jest.fn();
      mockDependencies.gracefulDegradation.shouldDegrade.mockResolvedValue({
        shouldDegrade: true,
        reason: 'High load',
        severity: 'high'
      });

      const response = await geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId,
        mockRespond
      );

      expect(response).toBe('');
      expect(mockDependencies.gracefulDegradation.queueMessage).toHaveBeenCalled();
    });

    it('should handle degradation with medium severity', async () => {
      mockDependencies.gracefulDegradation.shouldDegrade.mockResolvedValue({
        shouldDegrade: true,
        reason: 'Medium load',
        severity: 'medium'
      });

      const response = await geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      );

      expect(response).toBe('Fallback response');
      expect(mockDependencies.gracefulDegradation.generateFallbackResponse).toHaveBeenCalled();
    });

    it('should handle empty prompt', async () => {
      await expect(geminiService.generateResponse(
        '',
        defaultParams.userId,
        defaultParams.serverId
      )).rejects.toThrow('Please provide a valid message.');
    });

    it('should handle very long prompt', async () => {
      const longPrompt = 'a'.repeat(100001);
      
      await expect(geminiService.generateResponse(
        longPrompt,
        defaultParams.userId,
        defaultParams.serverId
      )).rejects.toThrow('Your message is too long');
    });

    it('should handle image attachments', async () => {
      const imageAttachments = [{
        url: 'http://example.com/image.jpg',
        mimeType: 'image/jpeg',
        base64Data: 'base64data',
        filename: 'image.jpg',
        size: 1000
      }];

      await geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId,
        undefined,
        undefined,
        undefined,
        undefined,
        imageAttachments
      );

      expect(mockApiClient.executeAPICall).toHaveBeenCalledWith(
        expect.any(String),
        imageAttachments,
        expect.any(Number)
      );
    });

    it('should handle roasting mode', async () => {
      mockDependencies.roastingEngine.shouldRoast.mockReturnValue(true);

      await geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      );

      expect(mockDependencies.roastingEngine.shouldRoast).toHaveBeenCalledWith(
        defaultParams.userId,
        defaultParams.prompt,
        defaultParams.serverId
      );
    });

    it('should handle API errors with specific messages', async () => {
      mockDependencies.retryHandler.executeWithRetry.mockRejectedValue(new Error('API key invalid'));

      await expect(geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      )).rejects.toThrow('There\'s an issue with my AI service configuration');
    });

    it('should handle safety blocking errors', async () => {
      mockDependencies.retryHandler.executeWithRetry.mockRejectedValue(new Error('Response blocked by safety filters'));

      await expect(geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      )).rejects.toThrow('Your message was blocked by content filters');
    });

    it('should handle quota exceeded errors', async () => {
      mockDependencies.retryHandler.executeWithRetry.mockRejectedValue(new Error('Quota exceeded'));

      await expect(geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      )).rejects.toThrow('The AI service quota has been exceeded');
    });

    it('should handle circuit breaker errors with fallback', async () => {
      mockDependencies.retryHandler.executeWithRetry.mockRejectedValue(new Error('Circuit breaker is OPEN'));

      const response = await geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      );

      expect(response).toBe('Fallback response');
      expect(mockDependencies.gracefulDegradation.generateFallbackResponse).toHaveBeenCalled();
    });

    it('should use request coalescing for identical requests', async () => {
      // Make two identical requests simultaneously
      const promise1 = geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      );
      const promise2 = geminiService.generateResponse(
        defaultParams.prompt,
        defaultParams.userId,
        defaultParams.serverId
      );

      const [response1, response2] = await Promise.all([promise1, promise2]);

      expect(response1).toBe('Processed response');
      expect(response2).toBe('Processed response');
      expect(globalCoalescers.geminiGeneration.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', async () => {
      const newConfig = {
        model: 'gemini-pro',
        temperature: 0.8,
        topK: 50,
        topP: 0.9,
        maxTokens: 2048,
        safetySettings: {},
        systemInstructions: 'New instructions',
        grounding: { threshold: 0.7, enabled: true },
        thinking: { budget: 100000, includeInResponse: false },
        enableCodeExecution: false,
        enableStructuredOutput: false
      };

      await geminiService.updateConfiguration(newConfig);

      expect(mockDependencies.cacheManager.clearCache).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('GeminiService configuration update completed');
    });

    it('should validate valid configuration', async () => {
      const config: BotConfiguration = {
        gemini: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxTokens: 2048
        },
        rateLimiting: {
          rpm: 60,
          daily: 10000,
          testUserId: 'test',
          testMode: false
        },
        features: {
          contextMemory: {
            enabled: true,
            maxMessages: 100,
            timeoutMinutes: 60,
            maxContextChars: 50000
          },
          roasting: {
            enabled: true,
            baseChance: 0.1,
            maxChance: 0.5
          }
        }
      };

      const result = await geminiService.validateConfiguration(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate invalid configuration', async () => {
      const config: BotConfiguration = {
        gemini: {
          temperature: 3, // Invalid: > 2
          topK: 150, // Invalid: > 100
          topP: 1.5, // Invalid: > 1
          maxTokens: 50000 // Invalid: > 32768
        }
      };

      const result = await geminiService.validateConfiguration(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Gemini temperature must be between 0 and 2');
      expect(result.errors).toContain('Gemini topK must be between 1 and 100');
      expect(result.errors).toContain('Gemini topP must be between 0 and 1');
      expect(result.errors).toContain('Gemini maxTokens must be between 1 and 32768');
    });

    it('should handle configuration validation errors', async () => {
      const config = null as any;

      const result = await geminiService.validateConfiguration(config);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Configuration validation error');
    });
  });

  describe('Structured Response Generation', () => {
    const structuredOptions: StructuredOutputOptions = {
      schema: {
        type: 'object',
        properties: {
          result: { type: 'string' }
        }
      },
      name: 'TestResponse',
      description: 'Test structured response'
    };

    it('should generate structured response', async () => {
      const response = await geminiService.generateStructuredResponse(
        'Test prompt',
        structuredOptions,
        'user123',
        'server456'
      );

      expect(response).toEqual({ result: 'structured' });
      expect(mockResponseHandler.parseStructuredResponse).toHaveBeenCalled();
    });

    it('should handle degraded state for structured response', async () => {
      mockDependencies.gracefulDegradation.shouldDegrade.mockResolvedValue({
        shouldDegrade: true,
        reason: 'High load',
        severity: 'medium'
      });

      const response = await geminiService.generateStructuredResponse(
        'Test prompt',
        structuredOptions,
        'user123',
        'server456'
      );

      expect(response).toEqual({
        error: 'Service temporarily unavailable',
        message: 'Fallback response'
      });
    });

    it('should use cached structured response', async () => {
      mockDependencies.cacheManager.get.mockResolvedValue('{"result": "cached"}');

      const response = await geminiService.generateStructuredResponse(
        'Test prompt',
        structuredOptions,
        'user123',
        'server456'
      );

      expect(response).toEqual({ result: 'cached' });
      expect(mockApiClient.executeAPICall).not.toHaveBeenCalled();
    });

    it('should handle invalid cached structured response', async () => {
      mockDependencies.cacheManager.get.mockResolvedValue('invalid json');

      await geminiService.generateStructuredResponse(
        'Test prompt',
        structuredOptions,
        'user123',
        'server456'
      );

      expect(logger.warn).toHaveBeenCalledWith('Failed to parse cached structured response, regenerating');
      expect(mockApiClient.executeAPICall).toHaveBeenCalled();
    });

    it('should parse structured response', async () => {
      const response = await geminiService.parseStructuredResponse(
        '{"result": "test"}',
        structuredOptions
      );

      expect(response).toEqual({ result: 'structured' });
      expect(mockResponseHandler.parseStructuredResponse).toHaveBeenCalledWith(
        '{"result": "test"}',
        structuredOptions
      );
    });
  });

  describe('Delegated Methods', () => {
    it('should get remaining quota', () => {
      const quota = geminiService.getRemainingQuota();
      
      expect(quota).toEqual({
        minuteRemaining: 60,
        dailyRemaining: 1000
      });
      expect(mockDependencies.rateLimiter.getRemainingQuota).toHaveBeenCalled();
    });

    it('should clear user conversation', () => {
      const result = geminiService.clearUserConversation('user123');
      
      expect(result).toBe(true);
      expect(mockDependencies.conversationManager.clearUserConversation).toHaveBeenCalledWith('user123');
    });

    it('should get conversation stats', () => {
      const stats = geminiService.getConversationStats();
      
      expect(stats).toEqual({
        activeUsers: 10,
        totalMessages: 100,
        totalContextSize: 5000
      });
    });

    it('should build conversation context', () => {
      const context = geminiService.buildConversationContext('user123', 50);
      
      expect(context).toBe('Previous conversation context');
      expect(mockDependencies.conversationManager.buildConversationContext).toHaveBeenCalledWith('user123', 50);
    });

    it('should get service managers', () => {
      expect(geminiService.getPersonalityManager()).toBe(mockDependencies.personalityManager);
      expect(geminiService.getRateLimiter()).toBe(mockDependencies.rateLimiter);
      expect(geminiService.getContextManager()).toBe(mockDependencies.contextManager);
      expect(geminiService.getRoastingEngine()).toBe(mockDependencies.roastingEngine);
      expect(geminiService.getConversationManager()).toBe(mockDependencies.conversationManager);
    });

    it('should add embarrassing moment', () => {
      geminiService.addEmbarrassingMoment('server123', 'user456', 'Embarrassing moment');
      
      expect(mockDependencies.contextManager.addEmbarrassingMoment).toHaveBeenCalledWith(
        'server123',
        'user456',
        'Embarrassing moment'
      );
    });

    it('should add running gag', () => {
      geminiService.addRunningGag('server123', 'Running gag');
      
      expect(mockDependencies.contextManager.addRunningGag).toHaveBeenCalledWith(
        'server123',
        'Running gag'
      );
    });

    it('should get cache stats', () => {
      const stats = geminiService.getCacheStats();
      
      expect(stats).toEqual({
        hits: 100,
        misses: 50,
        size: 1000
      });
    });

    it('should get cache performance', () => {
      const performance = geminiService.getCachePerformance();
      
      expect(performance).toEqual({
        hitRate: 0.667,
        avgRetrievalTime: 5
      });
    });

    it('should clear cache', () => {
      geminiService.clearCache();
      
      expect(mockDependencies.cacheManager.clearCache).toHaveBeenCalled();
    });

    it('should get degradation status', () => {
      const status = geminiService.getDegradationStatus();
      
      expect(status).toEqual({
        isSystemDegraded: false,
        degradedServices: []
      });
    });

    it('should trigger recovery', async () => {
      await geminiService.triggerRecovery('gemini');
      
      expect(mockDependencies.gracefulDegradation.triggerRecovery).toHaveBeenCalledWith('gemini');
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle model not found error', async () => {
      mockDependencies.retryHandler.executeWithRetry.mockRejectedValue(new Error('model not found'));

      await expect(geminiService.generateResponse(
        'Test prompt',
        'user123'
      )).rejects.toThrow('The AI model is temporarily unavailable');
    });

    it('should handle context length error', async () => {
      mockDependencies.retryHandler.executeWithRetry.mockRejectedValue(new Error('context length exceeded'));

      await expect(geminiService.generateResponse(
        'Test prompt',
        'user123'
      )).rejects.toThrow('Your conversation history is too long');
    });

    it('should handle generic error with retry handler message', async () => {
      mockDependencies.retryHandler.executeWithRetry.mockRejectedValue(new Error('Unknown error'));

      await expect(geminiService.generateResponse(
        'Test prompt',
        'user123'
      )).rejects.toThrow('User friendly error message');
    });

    it('should handle circuit breaker fallback failure', async () => {
      mockDependencies.retryHandler.executeWithRetry.mockRejectedValue(new Error('Circuit breaker is OPEN'));
      mockDependencies.gracefulDegradation.generateFallbackResponse.mockRejectedValue(new Error('Fallback failed'));

      const response = await geminiService.generateResponse(
        'Test prompt',
        'user123'
      );

      expect(response).toBe('I\'m experiencing high load right now. Your message has been queued and I\'ll respond as soon as possible. Thanks for your patience!');
    });

    it('should handle post-generation async errors gracefully', async () => {
      mockDependencies.cacheManager.set.mockRejectedValue(new Error('Cache error'));

      // Should not throw
      const response = await geminiService.generateResponse(
        'Test prompt',
        'user123',
        'server456'
      );

      expect(response).toBe('Processed response');
      expect(logger.error).toHaveBeenCalledWith('Post-generation task failed', expect.any(Object));
    });
  });

  describe('Message Context and Guild Support', () => {
    it('should handle full message context', async () => {
      const messageContext = { channelId: 'channel123' } as MessageContext;
      const member = { id: 'member123' } as GuildMember;
      const guild = { id: 'guild123' } as Guild;

      await geminiService.generateResponse(
        'Test prompt',
        'user123',
        'server456',
        undefined,
        messageContext,
        member,
        guild
      );

      expect(mockContextProcessor.assembleContext).toHaveBeenCalledWith(
        'user123',
        'server456',
        messageContext,
        member,
        guild,
        'Test prompt',
        false
      );
    });
  });

  describe('Rate Limiting Scenarios', () => {
    it('should handle minute rate limit', async () => {
      mockDependencies.rateLimiter.checkAndIncrement.mockResolvedValue({
        allowed: false,
        reason: 'Per-minute rate limit exceeded'
      });

      await expect(geminiService.generateResponse(
        'Test prompt',
        'user123'
      )).rejects.toThrow('You\'re sending messages too quickly');
    });

    it('should handle generic rate limit', async () => {
      mockDependencies.rateLimiter.checkAndIncrement.mockResolvedValue({
        allowed: false,
        reason: 'Rate limit exceeded'
      });

      await expect(geminiService.generateResponse(
        'Test prompt',
        'user123'
      )).rejects.toThrow('Rate limit exceeded. Please wait a few moments');
    });
  });
});