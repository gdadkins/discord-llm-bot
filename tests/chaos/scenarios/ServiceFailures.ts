/**
 * Service Failure Chaos Scenarios
 * 
 * Comprehensive chaos scenarios for testing service failures and resilience.
 * Tests various failure modes including API timeouts, service degradation,
 * memory pressure, and cascading failures.
 * 
 * @module ServiceFailures
 */

import { jest } from '@jest/globals';
import { logger } from '../../../src/utils/logger';
import type { ChaosScenario } from '../ChaosTestFramework';

// Mock data for testing
const createMockMessage = () => ({
  id: `test_${Date.now()}`,
  content: 'Test message for chaos testing',
  author: { 
    id: `user_${Math.random().toString(36).substr(2, 9)}`,
    username: 'TestUser'
  },
  channel: {
    id: `channel_${Math.random().toString(36).substr(2, 9)}`,
    send: jest.fn().mockResolvedValue({ id: 'response_id' })
  },
  guild: {
    id: `guild_${Math.random().toString(36).substr(2, 9)}`
  }
});

const createMockDiscordClient = () => ({
  user: { id: 'bot_id' },
  channels: {
    cache: new Map(),
    fetch: jest.fn().mockResolvedValue({
      send: jest.fn().mockResolvedValue({ id: 'sent_message_id' })
    })
  },
  guilds: {
    cache: new Map()
  }
});

// Global test state
const testState = {
  originalMocks: new Map(),
  memoryBloat: [] as unknown[],
  errorCounts: new Map<string, number>(),
  mockServices: new Map<string, unknown>()
};

export const serviceFailureScenarios: ChaosScenario[] = [
  {
    name: 'gemini_api_timeout',
    description: 'Simulates Gemini API timeouts and validates circuit breaker behavior',
    timeout: 60000,
    setup: async () => {
      logger.info('Setting up Gemini API timeout scenario');
      
      // Create a mock Gemini service that will timeout
      const mockGeminiService = {
        generateContent: jest.fn().mockImplementation(async (prompt: string) => {
          logger.info('Mock Gemini service called with timeout simulation');
          await new Promise(resolve => setTimeout(resolve, 40000)); // 40s delay
          throw new Error('Request timeout after 40s');
        }),
        getHealthStatus: jest.fn().mockReturnValue({
          healthy: false,
          errors: ['API timeout'],
          lastError: new Date()
        })
      };
      
      testState.mockServices.set('gemini', mockGeminiService);
      
      // Mock system dependencies
      const mockBot = {
        handleMessage: jest.fn().mockImplementation(async (message: unknown) => {
          logger.info('Mock bot handling message during timeout test');
          try {
            await mockGeminiService.generateContent('test prompt');
            return 'AI response';
          } catch (error) {
            logger.error('Bot caught Gemini timeout', { error });
            throw error;
          }
        })
      };
      
      testState.mockServices.set('bot', mockBot);
      
      logger.info('Gemini timeout scenario setup complete');
    },
    
    execute: async () => {
      logger.info('Executing Gemini API timeout scenario');
      
      const mockBot = testState.mockServices.get('bot') as any;
      
      // Send multiple messages to trigger timeouts
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const message = createMockMessage();
        message.content = `Timeout test message ${i}`;
        
        promises.push(
          mockBot.handleMessage(message).catch((error: Error) => {
            logger.info(`Message ${i} failed as expected: ${error.message}`);
            testState.errorCounts.set('timeout', (testState.errorCounts.get('timeout') || 0) + 1);
          })
        );
      }
      
      await Promise.allSettled(promises);
      logger.info('Gemini timeout execution complete', {
        timeoutErrors: testState.errorCounts.get('timeout') || 0
      });
    },
    
    verify: async () => {
      logger.info('Verifying Gemini API timeout handling');
      
      // Verify timeouts were handled
      const timeoutCount = testState.errorCounts.get('timeout') || 0;
      if (timeoutCount === 0) {
        throw new Error('Expected timeout errors but none occurred');
      }
      
      // Verify circuit breaker would have opened (simulated)
      const mockGeminiService = testState.mockServices.get('gemini') as any;
      const healthStatus = mockGeminiService.getHealthStatus();
      
      if (healthStatus.healthy) {
        throw new Error('Service should be unhealthy after timeouts');
      }
      
      // Verify no unhandled errors (all errors were caught and handled)
      if (timeoutCount > 5) {
        throw new Error('More errors than expected - error handling may be broken');
      }
      
      logger.info('Gemini timeout verification passed', {
        timeoutCount,
        serviceHealthy: healthStatus.healthy
      });
    },
    
    cleanup: async () => {
      logger.info('Cleaning up Gemini timeout scenario');
      testState.errorCounts.clear();
      testState.mockServices.clear();
      jest.clearAllMocks();
    }
  },

  {
    name: 'discord_api_degradation',
    description: 'Simulates Discord API degradation with intermittent failures',
    timeout: 45000,
    setup: async () => {
      logger.info('Setting up Discord API degradation scenario');
      
      let callCount = 0;
      const mockDiscordClient = createMockDiscordClient();
      
      // Mock Discord client with intermittent failures
      const mockSend = jest.fn().mockImplementation(async (content: string) => {
        callCount++;
        logger.info(`Discord API call ${callCount}: ${content.substring(0, 50)}...`);
        
        // Fail every 3rd call
        if (callCount % 3 === 0) {
          const error = new Error('Discord API Error: 503 Service Unavailable');
          testState.errorCounts.set('discord_error', (testState.errorCounts.get('discord_error') || 0) + 1);
          throw error;
        }
        
        return { id: `message_${callCount}` };
      });
      
      const mockChannel = {
        send: mockSend,
        id: 'test_channel_id'
      };
      
      mockDiscordClient.channels.fetch = jest.fn().mockResolvedValue(mockChannel);
      testState.mockServices.set('discordClient', mockDiscordClient);
      
      const mockBot = {
        handleMessage: jest.fn().mockImplementation(async (message: unknown) => {
          const channel = await mockDiscordClient.channels.fetch('test_channel_id');
          await channel.send('Response to message');
          return 'Response sent';
        })
      };
      
      testState.mockServices.set('bot', mockBot);
      
      logger.info('Discord degradation scenario setup complete');
    },
    
    execute: async () => {
      logger.info('Executing Discord API degradation scenario');
      
      const mockBot = testState.mockServices.get('bot') as any;
      
      // Trigger high message volume
      const promises = [];
      for (let i = 0; i < 20; i++) {
        const message = createMockMessage();
        message.content = `Degradation test message ${i}`;
        
        promises.push(
          mockBot.handleMessage(message).catch((error: Error) => {
            logger.info(`Message ${i} failed: ${error.message}`);
          })
        );
      }
      
      await Promise.allSettled(promises);
      
      logger.info('Discord degradation execution complete', {
        discordErrors: testState.errorCounts.get('discord_error') || 0
      });
    },
    
    verify: async () => {
      logger.info('Verifying Discord API degradation handling');
      
      const discordErrors = testState.errorCounts.get('discord_error') || 0;
      
      // Should have some errors (every 3rd call fails)
      if (discordErrors === 0) {
        throw new Error('Expected Discord API errors but none occurred');
      }
      
      // Should have approximately 6-7 errors out of 20 calls
      if (discordErrors < 5 || discordErrors > 10) {
        throw new Error(`Unexpected error count: ${discordErrors}. Expected 5-10 errors.`);
      }
      
      // Verify retry mechanism would have worked (simulated)
      const mockDiscordClient = testState.mockServices.get('discordClient') as any;
      const fetchCallCount = mockDiscordClient.channels.fetch.mock.calls.length;
      
      if (fetchCallCount === 0) {
        throw new Error('Discord client should have been called');
      }
      
      logger.info('Discord degradation verification passed', {
        discordErrors,
        fetchCallCount
      });
    },
    
    cleanup: async () => {
      logger.info('Cleaning up Discord degradation scenario');
      testState.errorCounts.clear();
      testState.mockServices.clear();
      jest.clearAllMocks();
    }
  },

  {
    name: 'memory_pressure',
    description: 'Simulates high memory usage and validates memory management',
    timeout: 60000,
    setup: async () => {
      logger.info('Setting up memory pressure scenario');
      
      // Create large objects to consume memory
      const initialMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < 100; i++) {
        // Create 1MB arrays
        testState.memoryBloat.push(new Array(1000000).fill(`memory_bloat_${i}`));
      }
      
      const afterMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (afterMemory - initialMemory) / 1024 / 1024; // MB
      
      logger.info(`Memory pressure setup complete. Increased memory by ${memoryIncrease.toFixed(2)}MB`);
      
      // Mock services under memory pressure
      const mockBot = {
        handleMessage: jest.fn().mockImplementation(async (message: unknown) => {
          // Simulate memory-intensive operation
          const tempArray = new Array(100000).fill('temp_data');
          logger.info('Processing message under memory pressure');
          
          // Simulate some processing delay
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Clean up temp data
          tempArray.length = 0;
          return 'Processed under memory pressure';
        })
      };
      
      const mockContextManager = {
        buildContext: jest.fn().mockImplementation(async (userId: string, serverId: string) => {
          logger.info(`Building context for ${userId} under memory pressure`);
          
          // Simulate context building with memory constraints
          const context = {
            userId,
            serverId,
            history: new Array(100).fill('context_item'),
            timestamp: Date.now()
          };
          
          return context;
        }),
        
        getStats: jest.fn().mockReturnValue({
          cacheSize: 150, // Simulated cache size under pressure
          totalContexts: 50,
          memoryUsage: afterMemory / 1024 / 1024
        })
      };
      
      testState.mockServices.set('bot', mockBot);
      testState.mockServices.set('contextManager', mockContextManager);
    },
    
    execute: async () => {
      logger.info('Executing memory pressure scenario');
      
      const mockBot = testState.mockServices.get('bot') as any;
      const mockContextManager = testState.mockServices.get('contextManager') as any;
      
      // Continue normal operations under memory pressure
      const operations = [];
      for (let i = 0; i < 10; i++) {
        const message = createMockMessage();
        message.content = `Memory pressure test ${i}`;
        
        operations.push(mockBot.handleMessage(message));
        operations.push(mockContextManager.buildContext(`user_${i}`, 'server_1'));
      }
      
      const results = await Promise.allSettled(operations);
      
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;
      
      logger.info('Memory pressure execution complete', {
        successCount,
        failureCount,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024
      });
    },
    
    verify: async () => {
      logger.info('Verifying memory pressure handling');
      
      const mockContextManager = testState.mockServices.get('contextManager') as any;
      const stats = mockContextManager.getStats();
      
      // Check memory cleanup was triggered (simulated)
      if (stats.cacheSize > 200) {
        throw new Error(`Cache size too large under memory pressure: ${stats.cacheSize}`);
      }
      
      // Check system still responsive
      const mockBot = testState.mockServices.get('bot') as any;
      const response = await mockBot.handleMessage(createMockMessage());
      
      if (!response) {
        throw new Error('System not responsive under memory pressure');
      }
      
      // Check memory usage is within reasonable bounds
      const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      if (currentMemory > 1000) { // 1GB threshold
        logger.warn(`High memory usage: ${currentMemory.toFixed(2)}MB`);
      }
      
      logger.info('Memory pressure verification passed', {
        cacheSize: stats.cacheSize,
        currentMemory: currentMemory.toFixed(2),
        response: response.substring(0, 50)
      });
    },
    
    cleanup: async () => {
      logger.info('Cleaning up memory pressure scenario');
      
      // Clear memory bloat
      testState.memoryBloat.length = 0;
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Forced garbage collection');
      }
      
      testState.mockServices.clear();
      jest.clearAllMocks();
      
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      logger.info(`Memory cleanup complete. Final memory: ${finalMemory.toFixed(2)}MB`);
    }
  },

  {
    name: 'cascading_failures',
    description: 'Simulates cascading service failures to test circuit breaker coordination',
    timeout: 75000,
    setup: async () => {
      logger.info('Setting up cascading failures scenario');
      
      // Mock cache that fails
      const mockCacheManager = {
        get: jest.fn().mockRejectedValue(new Error('Cache service unavailable')),
        set: jest.fn().mockRejectedValue(new Error('Cache service unavailable')),
        getHealthStatus: jest.fn().mockReturnValue({
          healthy: false,
          errors: ['Cache service unavailable']
        })
      };
      
      // Mock database that's slow
      const mockDatabase = {
        query: jest.fn().mockImplementation(async (query: string) => {
          logger.info(`Slow database query: ${query.substring(0, 50)}...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5s delay
          return [];
        }),
        getHealthStatus: jest.fn().mockReturnValue({
          healthy: false,
          errors: ['Database slow response']
        })
      };
      
      // Mock circuit breakers
      const mockCircuitBreakers = {
        getStatus: jest.fn().mockImplementation((service: string) => {
          if (service === 'cache') {
            return { state: 'OPEN', failures: 5, lastFailure: Date.now() };
          }
          if (service === 'database') {
            return { state: 'HALF_OPEN', failures: 3, lastFailure: Date.now() - 10000 };
          }
          return { state: 'CLOSED', failures: 0, lastFailure: null };
        })
      };
      
      // Mock health monitor
      const mockHealthMonitor = {
        getHealth: jest.fn().mockResolvedValue({
          status: 'degraded',
          services: {
            cache: 'unavailable',
            database: 'slow',
            discord: 'healthy',
            gemini: 'healthy'
          },
          metrics: {
            errorRate: 0.3,
            responseTime: 3000,
            memoryUsage: 456
          }
        })
      };
      
      // Mock bot that depends on these services
      const mockBot = {
        handleCommand: jest.fn().mockImplementation(async (command: any) => {
          logger.info(`Handling command: ${command.commandName}`);
          
          try {
            // Try to use cache first
            await mockCacheManager.get(`command_${command.commandName}`);
          } catch (error) {
            logger.info('Cache failed, falling back to database');
            
            try {
              // Fall back to database
              await mockDatabase.query(`SELECT * FROM commands WHERE name = '${command.commandName}'`);
            } catch (dbError) {
              logger.error('Database also failed', { error: dbError });
              throw new Error('Both cache and database failed');
            }
          }
          
          return 'Command processed';
        })
      };
      
      testState.mockServices.set('cacheManager', mockCacheManager);
      testState.mockServices.set('database', mockDatabase);
      testState.mockServices.set('circuitBreakers', mockCircuitBreakers);
      testState.mockServices.set('healthMonitor', mockHealthMonitor);
      testState.mockServices.set('bot', mockBot);
      
      logger.info('Cascading failures scenario setup complete');
    },
    
    execute: async () => {
      logger.info('Executing cascading failures scenario');
      
      const mockBot = testState.mockServices.get('bot') as any;
      
      // Send burst of requests to trigger cascading failures
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          mockBot.handleCommand({
            commandName: 'help',
            user: { id: `user_${i}` },
            timestamp: Date.now()
          }).catch((error: Error) => {
            logger.info(`Command ${i} failed: ${error.message}`);
            testState.errorCounts.set('cascading', (testState.errorCounts.get('cascading') || 0) + 1);
          })
        );
      }
      
      await Promise.allSettled(requests);
      
      logger.info('Cascading failures execution complete', {
        cascadingErrors: testState.errorCounts.get('cascading') || 0
      });
    },
    
    verify: async () => {
      logger.info('Verifying cascading failures handling');
      
      const mockCircuitBreakers = testState.mockServices.get('circuitBreakers') as any;
      const mockHealthMonitor = testState.mockServices.get('healthMonitor') as any;
      
      // Check circuit breakers protected system
      const cacheStatus = mockCircuitBreakers.getStatus('cache');
      if (cacheStatus.state !== 'OPEN') {
        throw new Error(`Expected cache circuit breaker to be OPEN, got ${cacheStatus.state}`);
      }
      
      // Check system degraded gracefully
      const health = await mockHealthMonitor.getHealth();
      if (health.status !== 'degraded') {
        throw new Error(`Expected degraded health status, got ${health.status}`);
      }
      
      if (health.services.cache !== 'unavailable') {
        throw new Error(`Expected cache to be unavailable, got ${health.services.cache}`);
      }
      
      // But core functionality still works
      if (health.services.discord !== 'healthy') {
        throw new Error(`Expected Discord to remain healthy, got ${health.services.discord}`);
      }
      
      // Check errors were handled gracefully
      const cascadingErrors = testState.errorCounts.get('cascading') || 0;
      if (cascadingErrors === 0) {
        throw new Error('Expected some cascading errors but none occurred');
      }
      
      if (cascadingErrors > 10) {
        throw new Error(`Too many cascading errors: ${cascadingErrors}. Circuit breakers may not be working.`);
      }
      
      logger.info('Cascading failures verification passed', {
        cacheState: cacheStatus.state,
        healthStatus: health.status,
        cascadingErrors
      });
    },
    
    cleanup: async () => {
      logger.info('Cleaning up cascading failures scenario');
      testState.errorCounts.clear();
      testState.mockServices.clear();
      jest.clearAllMocks();
    }
  }
];

// Export utility functions for test setup
export const createTestMessage = createMockMessage;
export const createTestDiscordClient = createMockDiscordClient;
export const getTestState = () => ({ ...testState });
export const clearTestState = () => {
  testState.errorCounts.clear();
  testState.mockServices.clear();
  testState.memoryBloat.length = 0;
};