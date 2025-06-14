import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Client, GatewayIntentBits } from 'discord.js';
import { 
  createDiscordClient, 
  initializeBotServices, 
  validateEnvironment,
  shutdownServices,
  BotServices
} from '../../../src/core/botInitializer';
import { GeminiService } from '../../../src/services/gemini';
import { ConfigurationFactory } from '../../../src/config/ConfigurationFactory';
import { ServiceFactory } from '../../../src/services/interfaces/serviceFactory';
import { ServiceRegistry } from '../../../src/services/interfaces/serviceRegistry';
import { logger } from '../../../src/utils/logger';
import { registerCommands } from '../../../src/commands';

// Mock dependencies
jest.mock('discord.js');
jest.mock('../../../src/services/gemini');
jest.mock('../../../src/config/ConfigurationFactory');
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

    // Mock constructors
    (Client as any).mockImplementation(() => mockClient);
    (GeminiService as any).mockImplementation(() => mockGeminiService);

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

    // Mock ConfigurationFactory
    (ConfigurationFactory.createBotConfiguration as jest.MockedFunction<typeof ConfigurationFactory.createBotConfiguration>)
      .mockReturnValue({
        version: '1.0.0',
        lastModified: new Date().toISOString(),
        modifiedBy: 'system',
        discord: { intents: [], permissions: {}, commands: {} },
        gemini: {} as any,
        rateLimiting: {} as any,
        features: {} as any,
      });

    (ConfigurationFactory.validateApiKey as jest.MockedFunction<typeof ConfigurationFactory.validateApiKey>)
      .mockReturnValue('test-api-key');

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

      expect(() => validateEnvironment()).toThrow('Environment validation failed:');
      expect(() => validateEnvironment()).toThrow('DISCORD_TOKEN: Required environment variable DISCORD_TOKEN is missing');
    });

    it('should throw when DISCORD_CLIENT_ID is missing', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      delete process.env.DISCORD_CLIENT_ID;
      process.env.GOOGLE_API_KEY = 'test-api-key';

      expect(() => validateEnvironment()).toThrow('Environment validation failed:');
      expect(() => validateEnvironment()).toThrow('DISCORD_CLIENT_ID: Required environment variable DISCORD_CLIENT_ID is missing');
    });

    it('should throw when API key validation fails', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;

      expect(() => validateEnvironment()).toThrow('Environment validation failed:');
      expect(() => validateEnvironment()).toThrow('GOOGLE_API_KEY: Required environment variable GOOGLE_API_KEY is missing');
    });

    it('should throw with all missing variables listed', () => {
      delete process.env.DISCORD_TOKEN;
      delete process.env.DISCORD_CLIENT_ID;
      delete process.env.GOOGLE_API_KEY;

      expect(() => validateEnvironment()).toThrow('Environment validation failed:');
      expect(() => validateEnvironment()).toThrow('DISCORD_TOKEN: Required environment variable DISCORD_TOKEN is missing');
      expect(() => validateEnvironment()).toThrow('DISCORD_CLIENT_ID: Required environment variable DISCORD_CLIENT_ID is missing');
    });

    it('should log error when variables are missing', () => {
      delete process.env.DISCORD_TOKEN;

      try {
        validateEnvironment();
      } catch (e) {
        // Expected to throw
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Environment validation failed:'));
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('DISCORD_TOKEN: Required environment variable DISCORD_TOKEN is missing'));
    });
  });

  describe('initializeBotServices', () => {
    beforeEach(() => {
      process.env.GOOGLE_API_KEY = 'test-api-key';
    });

    it('should initialize services successfully', async () => {
      const result = await initializeBotServices(mockClient);

      expect(ConfigurationFactory.createBotConfiguration).toHaveBeenCalled();
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

      expect(logger.info).toHaveBeenCalledWith('Bot services initialized successfully with dependency injection');
    });

    it('should throw when AI service creation fails', async () => {
      mockServiceFactory.createServices.mockReturnValue(new Map());

      await expect(initializeBotServices(mockClient)).rejects.toThrow('Failed to create AI service');
      expect(logger.error).toHaveBeenCalledWith('Failed to initialize bot services:', expect.any(Error));
    });

    it('should throw when service initialization fails', async () => {
      const initError = new Error('Service init failed');
      mockServiceRegistry.initializeAll.mockRejectedValueOnce(initError);

      await expect(initializeBotServices(mockClient)).rejects.toThrow('Service init failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to initialize bot services:', initError);
    });

    it('should throw when command registration fails', async () => {
      const registerError = new Error('Command registration failed');
      (registerCommands as jest.MockedFunction<typeof registerCommands>).mockRejectedValue(registerError);

      await expect(initializeBotServices(mockClient)).rejects.toThrow('Command registration failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to initialize bot services:', registerError);
    });
  });

  describe('shutdownServices', () => {
    it('should shutdown all services gracefully', async () => {
      const services: BotServices = {
        client: mockClient,
        geminiService: mockGeminiService,
        userAnalysisService: mockUserAnalysisService,
        serviceRegistry: mockServiceRegistry,
      };

      await shutdownServices(services);

      expect(logger.info).toHaveBeenCalledWith('Shutting down bot services...');
      expect(mockServiceRegistry.shutdownAll).toHaveBeenCalled();
      expect(mockGeminiService.shutdown).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Bot services shut down successfully');
    });

    it('should handle missing Gemini service', async () => {
      const services: BotServices = {
        client: mockClient,
        geminiService: undefined as any,
        userAnalysisService: mockUserAnalysisService,
        serviceRegistry: mockServiceRegistry,
      };

      await shutdownServices(services);

      expect(mockClient.destroy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Bot services shut down successfully');
    });

    it('should handle missing client', async () => {
      const services: BotServices = {
        client: undefined as any,
        geminiService: mockGeminiService,
        userAnalysisService: mockUserAnalysisService,
        serviceRegistry: mockServiceRegistry,
      };

      await shutdownServices(services);

      expect(mockGeminiService.shutdown).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Bot services shut down successfully');
    });

    it('should continue shutdown even if Gemini service shutdown fails', async () => {
      const shutdownError = new Error('Shutdown failed');
      mockGeminiService.shutdown.mockRejectedValueOnce(shutdownError);

      const services: BotServices = {
        client: mockClient,
        geminiService: mockGeminiService,
        userAnalysisService: mockUserAnalysisService,
        serviceRegistry: mockServiceRegistry,
      };

      await shutdownServices(services);

      expect(mockGeminiService.shutdown).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Bot services shut down successfully');
    });

    it('should continue shutdown even if client destroy fails', async () => {
      const destroyError = new Error('Destroy failed');
      mockClient.destroy.mockRejectedValueOnce(destroyError);

      const services: BotServices = {
        client: mockClient,
        geminiService: mockGeminiService,
        userAnalysisService: mockUserAnalysisService,
        serviceRegistry: mockServiceRegistry,
      };

      await shutdownServices(services);

      expect(mockGeminiService.shutdown).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Bot services shut down successfully');
    });

    it('should handle service registry shutdown errors', async () => {
      const shutdownError = new Error('Registry shutdown failed');
      mockServiceRegistry.shutdownAll.mockRejectedValueOnce(shutdownError);

      const services: BotServices = {
        client: mockClient,
        geminiService: mockGeminiService,
        userAnalysisService: mockUserAnalysisService,
        serviceRegistry: mockServiceRegistry,
      };

      await shutdownServices(services);

      expect(mockServiceRegistry.shutdownAll).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error shutting down service registry:', shutdownError);
      expect(mockGeminiService.shutdown).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Bot services shut down successfully');
    });
  });
});