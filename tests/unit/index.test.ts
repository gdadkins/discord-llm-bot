import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Client } from 'discord.js';
import { logger } from '../../src/utils/logger';

// Mock all dependencies before importing
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../../src/utils/logger');
jest.mock('../../src/core/botInitializer');
jest.mock('../../src/handlers/eventHandlers');
jest.mock('../../src/utils/raceConditionManager');

// Import after mocks are set up
import { config } from 'dotenv';
import { 
  createDiscordClient, 
  initializeBotServices, 
  validateEnvironment,
  shutdownServices,
  BotServices
} from '../../src/core/botInitializer';
import { setupEventHandlers } from '../../src/handlers/eventHandlers';
import { RaceConditionManager } from '../../src/utils/raceConditionManager';

describe('Bot Main Entry Point', () => {
  let mockClient: jest.Mocked<Client>;
  let mockGeminiService: any;
  let mockRaceConditionManager: jest.Mocked<RaceConditionManager>;
  let originalEnv: NodeJS.ProcessEnv;
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let mockReadyCallback: (client: Client) => void;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    process.env.DISCORD_TOKEN = 'test-token';

    // Setup mock client
    mockClient = {
      once: jest.fn((event, callback) => {
        if (event === 'ready') {
          mockReadyCallback = callback;
        }
      }),
      login: jest.fn().mockResolvedValue('test-token'),
    } as any;

    // Setup mock services
    mockGeminiService = { mock: 'geminiService' };
    mockRaceConditionManager = {
      cleanup: jest.fn(),
    } as any;

    // Mock constructor implementations
    (createDiscordClient as jest.Mock).mockReturnValue(mockClient);
    (initializeBotServices as jest.Mock).mockResolvedValue(mockGeminiService);
    (RaceConditionManager as any).mockImplementation(() => mockRaceConditionManager);

    // Spy on process.exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('Process exit');
    }) as any);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    processExitSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('successful initialization', () => {
    it('should initialize bot successfully', async () => {
      // Clear module cache
      jest.resetModules();
      
      // Import and run main
      await import('../../src/index');
      
      // Wait for async operations
      await new Promise(resolve => setImmediate(resolve));

      expect(config).toHaveBeenCalled();
      expect(validateEnvironment).toHaveBeenCalled();
      expect(createDiscordClient).toHaveBeenCalled();
      expect(mockClient.login).toHaveBeenCalledWith('test-token');
    });

    it('should setup services when client is ready', async () => {
      jest.resetModules();
      await import('../../src/index');
      await new Promise(resolve => setImmediate(resolve));

      // Trigger ready event
      const readyClient = { ...mockClient, user: { tag: 'TestBot#1234' } };
      await mockReadyCallback(readyClient);

      expect(initializeBotServices).toHaveBeenCalledWith(readyClient);
      expect(setupEventHandlers).toHaveBeenCalledWith(
        mockClient,
        mockGeminiService,
        mockRaceConditionManager
      );
      expect(logger.info).toHaveBeenCalledWith('Bot initialization complete');
    });
  });

  describe('error handling during startup', () => {
    it('should exit when environment validation fails', async () => {
      (validateEnvironment as jest.Mock).mockImplementation(() => {
        throw new Error('Missing env vars');
      });

      try {
        jest.resetModules();
        await import('../../src/index');
        await new Promise(resolve => setImmediate(resolve));
      } catch (error) {
        expect(error).toEqual(new Error('Process exit'));
      }

      expect(logger.error).toHaveBeenCalledWith('Failed to start bot:', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when Discord login fails', async () => {
      mockClient.login.mockRejectedValue(new Error('Invalid token'));

      try {
        jest.resetModules();
        await import('../../src/index');
        await new Promise(resolve => setImmediate(resolve));
      } catch (error) {
        expect(error).toEqual(new Error('Process exit'));
      }

      expect(logger.error).toHaveBeenCalledWith('Failed to start bot:', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when bot initialization fails', async () => {
      (initializeBotServices as jest.Mock).mockRejectedValue(new Error('Init failed'));

      jest.resetModules();
      await import('../../src/index');
      await new Promise(resolve => setImmediate(resolve));

      // Trigger ready event
      const readyClient = { ...mockClient, user: { tag: 'TestBot#1234' } };
      
      try {
        await mockReadyCallback(readyClient);
      } catch (error) {
        expect(error).toEqual(new Error('Process exit'));
      }

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize bot:', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('global error handlers', () => {
    let originalListeners: { [key: string]: ((...args: any[]) => void)[] };

    beforeEach(() => {
      // Save original listeners
      originalListeners = {
        unhandledRejection: process.listeners('unhandledRejection'),
        uncaughtException: process.listeners('uncaughtException'),
      };
      
      // Remove original listeners
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
    });

    afterEach(() => {
      // Restore original listeners
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
      
      originalListeners.unhandledRejection.forEach(listener => {
        process.on('unhandledRejection', listener as any);
      });
      originalListeners.uncaughtException.forEach(listener => {
        process.on('uncaughtException', listener as any);
      });
    });

    it('should handle unhandled promise rejections', async () => {
      jest.resetModules();
      await import('../../src/index');
      
      const testError = new Error('Unhandled rejection');
      process.emit('unhandledRejection' as any, testError);

      expect(logger.error).toHaveBeenCalledWith('Unhandled promise rejection:', testError);
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle uncaught exceptions', async () => {
      jest.resetModules();
      await import('../../src/index');
      
      const testError = new Error('Uncaught exception');
      
      try {
        process.emit('uncaughtException' as any, testError);
      } catch (error) {
        expect(error).toEqual(new Error('Process exit'));
      }

      expect(logger.error).toHaveBeenCalledWith('Uncaught exception:', testError);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('graceful shutdown', () => {
    let originalListeners: { [key: string]: ((...args: any[]) => void)[] };
    let botServices: BotServices;

    beforeEach(async () => {
      // Save original listeners
      originalListeners = {
        SIGINT: process.listeners('SIGINT'),
        SIGTERM: process.listeners('SIGTERM'),
      };
      
      // Remove original listeners
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');

      // Setup bot services
      botServices = {
        client: mockClient,
        geminiService: mockGeminiService,
      };

      // Import main and let it initialize
      jest.resetModules();
      await import('../../src/index');
      await new Promise(resolve => setImmediate(resolve));
      
      // Trigger ready event to set up services
      const readyClient = { ...mockClient, user: { tag: 'TestBot#1234' } };
      await mockReadyCallback(readyClient);
    });

    afterEach(() => {
      // Restore original listeners
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      
      originalListeners.SIGINT.forEach(listener => {
        process.on('SIGINT', listener as any);
      });
      originalListeners.SIGTERM.forEach(listener => {
        process.on('SIGTERM', listener as any);
      });
    });

    it('should handle SIGINT gracefully', async () => {
      try {
        process.emit('SIGINT');
      } catch (error) {
        expect(error).toEqual(new Error('Process exit'));
      }

      expect(logger.info).toHaveBeenCalledWith('Received SIGINT, shutting down gracefully...');
      expect(mockRaceConditionManager.cleanup).toHaveBeenCalled();
      expect(shutdownServices).toHaveBeenCalledWith(expect.objectContaining({
        client: mockClient,
        geminiService: mockGeminiService,
      }));
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle SIGTERM gracefully', async () => {
      try {
        process.emit('SIGTERM');
      } catch (error) {
        expect(error).toEqual(new Error('Process exit'));
      }

      expect(logger.info).toHaveBeenCalledWith('Received SIGTERM, shutting down gracefully...');
      expect(mockRaceConditionManager.cleanup).toHaveBeenCalled();
      expect(shutdownServices).toHaveBeenCalledWith(expect.objectContaining({
        client: mockClient,
        geminiService: mockGeminiService,
      }));
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle shutdown without initialized services', async () => {
      // Create a new instance without services initialized
      jest.resetModules();
      
      // Re-mock dependencies
      jest.mock('dotenv', () => ({ config: jest.fn() }));
      jest.mock('../../src/utils/logger');
      jest.mock('../../src/core/botInitializer');
      jest.mock('../../src/handlers/eventHandlers');
      jest.mock('../../src/utils/raceConditionManager');
      
      const { createDiscordClient } = require('../../src/core/botInitializer');
      createDiscordClient.mockReturnValue(mockClient);
      
      // Import fresh module
      await import('../../src/index');
      await new Promise(resolve => setImmediate(resolve));
      
      // Emit shutdown before services are initialized
      try {
        process.emit('SIGINT');
      } catch (error) {
        expect(error).toEqual(new Error('Process exit'));
      }

      expect(logger.info).toHaveBeenCalledWith('Received SIGINT, shutting down gracefully...');
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('edge cases', () => {
    it('should handle missing Discord token', async () => {
      delete process.env.DISCORD_TOKEN;

      try {
        jest.resetModules();
        await import('../../src/index');
        await new Promise(resolve => setImmediate(resolve));
      } catch (error) {
        expect(error).toEqual(new Error('Process exit'));
      }

      expect(logger.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle race condition manager initialization failure', async () => {
      (RaceConditionManager as any).mockImplementation(() => {
        throw new Error('RaceConditionManager init failed');
      });

      try {
        jest.resetModules();
        await import('../../src/index');
        await new Promise(resolve => setImmediate(resolve));
      } catch (error) {
        expect(error).toEqual(new Error('Process exit'));
      }

      expect(logger.error).toHaveBeenCalledWith('Failed to start bot:', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});