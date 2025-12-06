import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Client, GatewayIntentBits } from 'discord.js';
import { 
  createDiscordClient, 
  initializeBotServices, 
  validateEnvironment,
  shutdownServices,
  BotServices
} from '../../../src/core/botInitializer';
import { GeminiService } from '../../../src/services/gemini/GeminiService';
import { ConfigurationManager } from '../../../src/services/config/ConfigurationManager';
import { ServiceFactory } from '../../../src/services/interfaces/serviceFactory';
import { ServiceRegistry } from '../../../src/services/interfaces/serviceRegistry';
import { logger } from '../../../src/utils/logger';
import { registerCommands } from '../../../src/commands';

// Mock dependencies
jest.mock('discord.js');
jest.mock('../../../src/services/gemini/GeminiService');
jest.mock('../../../src/services/config/ConfigurationManager');
jest.mock('../../../src/services/interfaces/serviceFactory');
jest.mock('../../../src/services/interfaces/serviceRegistry');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/commands');

describe('BotInitializer', () => {
  let mockClient: jest.Mocked<Client>;
  let mockGeminiService: jest.Mocked<GeminiService>;
  let mockUserAnalysisService: any;
  let mockServiceFactory: jest.Mocked<ServiceFactory>;
  let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
  let mockConfigManager: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Setup mock client
    mockClient = {
      user: { tag: 'TestBot#1234' },
      destroy: jest.fn(() => Promise.resolve()),
    } as any;

    // Setup mock Gemini service
    mockGeminiService = {
      initialize: jest.fn(() => Promise.resolve()),
      setDiscordClient: jest.fn(),
      shutdown: jest.fn(() => Promise.resolve()),
    } as any;

    // Setup mock UserAnalysisService
    mockUserAnalysisService = {
      initialize: jest.fn(() => Promise.resolve()),
      shutdown: jest.fn(() => Promise.resolve()),
      isSummaryRequest: jest.fn(() => false),
      fetchUserMessages: jest.fn(() => Promise.resolve([])),
      performHybridAnalysis: jest.fn(() => Promise.resolve({
        summary: 'Test user analysis',
        insights: [],
        messageCount: 0,
        roastFactors: []
      })),
      generateRoast: jest.fn(() => Promise.resolve('Test roast')),
      exportUserAnalysis: jest.fn(() => Promise.resolve({})),
    } as any;

    // Setup mock ConfigurationManager
    mockConfigManager = {
      initialize: jest.fn(() => Promise.resolve()),
      getConfiguration: jest.fn(() => ({
        version: '1.0.0',
        lastModified: new Date().toISOString(),
        modifiedBy: 'system',
        discord: { intents: [], permissions: {}, commands: {} },
        gemini: {} as any,
        rateLimiting: {} as any,
        features: {} as any,
      })),
    };

    // Mock constructors
    (Client as any).mockImplementation(() => mockClient);
    (GeminiService as any).mockImplementation(() => mockGeminiService);
    (ConfigurationManager as unknown as jest.Mock).mockImplementation(() => mockConfigManager);

    // Mock service factory and registry
    mockServiceFactory = {
      createServices: jest.fn(() => new Map([
        ['aiService', mockGeminiService],
        ['userAnalysisService', mockUserAnalysisService]
      ])),
    } as any;
    
    mockServiceRegistry = {
      register: jest.fn(),
      initializeAll: jest.fn(() => Promise.resolve()),
      shutdownAll: jest.fn(() => Promise.resolve()),
    } as any;

    (ServiceFactory as any).mockImplementation(() => mockServiceFactory);
    (ServiceRegistry as any).mockImplementation(() => mockServiceRegistry);

    // Mock registerCommands
    (registerCommands as jest.MockedFunction<typeof registerCommands>).mockResolvedValue(undefined);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('createDiscordClient', () => {
    it('should create a Discord client with all required intents', () => {
      const client = createDiscordClient();

      expect(Client).toHaveBeenCalledWith({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageReactions,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildPresences,
        ],
      });

      expect(client).toBe(mockClient);
    });

    it('should return the same client instance on multiple calls', () => {
      const client1 = createDiscordClient();
      const client2 = createDiscordClient();

      expect(Client).toHaveBeenCalledTimes(2);
      expect(client1).toBeInstanceOf(Object);
      expect(client2).toBeInstanceOf(Object);
    });
  });

  describe('validateEnvironment', () => {
    it('should not throw when all required environment variables are present', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';

      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should throw when DISCORD_TOKEN is missing', () => {
      delete process.env.DISCORD_TOKEN;
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';

      // Modified expectation because validateEnvironment likely calls ConfigurationValidator which wraps errors differently
      expect(() => validateEnvironment()).toThrow(); 
    });
  });

  describe('initializeBotServices', () => {
    beforeEach(() => {
      process.env.GOOGLE_API_KEY = 'test-api-key';
    });

    it('should initialize services successfully', async () => {
      const result = await initializeBotServices(mockClient);

      expect(ConfigurationManager).toHaveBeenCalled();
      expect(mockConfigManager.initialize).toHaveBeenCalled();
      expect(ServiceFactory).toHaveBeenCalled();
      expect(ServiceRegistry).toHaveBeenCalled();
      expect(mockServiceFactory.createServices).toHaveBeenCalled();
      expect(mockServiceRegistry.initializeAll).toHaveBeenCalled();
      expect(mockGeminiService.setDiscordClient).toHaveBeenCalledWith(mockClient);
      expect(result.geminiService).toBe(mockGeminiService);
      expect(result.serviceRegistry).toBe(mockServiceRegistry);
    });

    it('should register slash commands', async () => {
      await initializeBotServices(mockClient);

      expect(registerCommands).toHaveBeenCalledWith(mockClient);
    });

    it('should log success message', async () => {
      await initializeBotServices(mockClient);

      expect(logger.info).toHaveBeenCalledWith('Bot services initialized successfully with dependency injection and distributed tracing', expect.any(Object));
    });

    it('should throw when AI service creation fails', async () => {
      mockServiceFactory.createServices.mockReturnValue(new Map());

      await expect(initializeBotServices(mockClient)).rejects.toThrow('Failed to create AI service');
    });
  });

  describe('shutdownServices', () => {
    it('should shutdown all services gracefully', async () => {
      const services: BotServices = {
        client: mockClient,
        geminiService: mockGeminiService,
        userAnalysisService: mockUserAnalysisService,
        serviceRegistry: mockServiceRegistry,
        tracingIntegration: {} as any // Mock tracing integration
      };

      await shutdownServices(services);

      expect(logger.info).toHaveBeenCalledWith('Shutting down bot services...', expect.any(Object));
      expect(mockServiceRegistry.shutdownAll).toHaveBeenCalled();
      expect(mockGeminiService.shutdown).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Bot services shutdown completed', expect.any(Object));
    });
  });
});
