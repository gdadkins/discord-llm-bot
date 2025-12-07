import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { RateLimiter } from '../../../src/services/rateLimiter';
import { DataStore } from '../../../src/utils/DataStore';

// Mock the DataStore
jest.mock('../../../src/utils/DataStore', () => {
  const mockDataStore = {
    load: jest.fn(),
    save: jest.fn(),
    backup: jest.fn(),
    restore: jest.fn(),
    exists: jest.fn(),
    delete: jest.fn(),
    getBackups: jest.fn(),
  };

  return {
    DataStore: jest.fn().mockImplementation(() => mockDataStore),
    createJsonDataStore: jest.fn().mockImplementation(() => mockDataStore),
    JsonSerializationStrategy: jest.fn(),
  };
});

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('RateLimiter DataStore Integration', () => {
  let rateLimiter: RateLimiter;
  let mockDataStore: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Get the mock instance
    const DataStoreMock = require('../../../src/utils/DataStore');
    mockDataStore = DataStoreMock.createJsonDataStore();
    
    // Setup default mock behaviors
    mockDataStore.load.mockResolvedValue(null);
    mockDataStore.save.mockResolvedValue(undefined);
    mockDataStore.exists.mockResolvedValue(false);
    
    rateLimiter = new RateLimiter(60, 1000); // 60 RPM, 1000 daily
  });

  afterEach(async () => {
    await rateLimiter.shutdown();
    jest.useRealTimers();
  });

  describe('DataStore initialization', () => {
    it('should create DataStore with proper configuration', () => {
      const DataStoreMock = require('../../../src/utils/DataStore');
      
      expect(DataStoreMock.createJsonDataStore).toHaveBeenCalledWith(
        './data/rate-limit.json',
        expect.any(Function), // validator function
        {
          maxBackups: 3,
          createDirectories: true,
          enableDebugLogging: false,
        }
      );
    });

    it('should use DataStore validator for state validation', () => {
      const DataStoreMock = require('../../../src/utils/DataStore');
      const validatorCall = DataStoreMock.createJsonDataStore.mock.calls[0];
      const validator = validatorCall[1];
      
      // Test valid state
      const validState = {
        requestsThisMinute: 10,
        requestsToday: 100,
        minuteWindowStart: Date.now(),
        dayWindowStart: Date.now(),
      };
      expect(validator(validState)).toBe(true);
      
      // Test invalid states
      expect(validator({})).toBe(false);
      expect(validator(null)).toBe(false);
      expect(validator({ requestsThisMinute: 'invalid' })).toBe(false);
      expect(validator({
        requestsThisMinute: 10,
        requestsToday: 100,
        // Missing window fields
      })).toBe(false);
    });
  });

  describe('State loading with DataStore', () => {
    it('should load state from DataStore on initialization', async () => {
      const savedState = {
        requestsThisMinute: 25,
        requestsToday: 500,
        minuteWindowStart: Date.now() - 30000, // 30 seconds ago
        dayWindowStart: Date.now() - 3600000, // 1 hour ago
      };
      
      mockDataStore.load.mockResolvedValue(savedState);
      
      await rateLimiter.initialize();
      
      expect(mockDataStore.load).toHaveBeenCalled();
      
      // Check rate limit reflects loaded state
      const result = await rateLimiter.checkAndIncrement();
      expect(result.remaining.minute).toBe(54 - 25 - 1); // 90% of 60 - loaded - increment
      expect(result.remaining.daily).toBe(900 - 500 - 1); // 90% of 1000 - loaded - increment
    });

    it('should start fresh when DataStore returns null', async () => {
      mockDataStore.load.mockResolvedValue(null);
      
      await rateLimiter.initialize();
      
      expect(mockDataStore.load).toHaveBeenCalled();
      
      // Should start with zero counts
      const result = await rateLimiter.checkAndIncrement();
      expect(result.remaining.minute).toBe(54 - 1); // 90% of 60 - 1
      expect(result.remaining.daily).toBe(900 - 1); // 90% of 1000 - 1
    });

    it('should handle DataStore load errors gracefully', async () => {
      mockDataStore.load.mockRejectedValue(new Error('DataStore read error'));
      
      // Should log error but continue with fresh state
      await rateLimiter.initialize();
      
      const logger = require('../../../src/utils/logger').logger;
      expect(logger.info).toHaveBeenCalledWith(
        'No persisted rate limit state found, starting fresh'
      );
    });
  });

  describe('State saving with DataStore', () => {
    beforeEach(async () => {
      mockDataStore.load.mockResolvedValue(null);
      await rateLimiter.initialize();
    });

    it('should save state using DataStore atomic write', async () => {
      // Make some requests
      await rateLimiter.checkAndIncrement();
      await rateLimiter.checkAndIncrement();
      await rateLimiter.checkAndIncrement();
      
      // Force flush
      await rateLimiter.shutdown();
      
      expect(mockDataStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestsThisMinute: 3,
          requestsToday: 3,
          minuteWindowStart: expect.any(Number),
          dayWindowStart: expect.any(Number),
        })
      );
    });

    it('should batch saves for performance', async () => {
      // Make multiple rapid requests
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkAndIncrement();
      }
      
      // Should not save immediately
      expect(mockDataStore.save).not.toHaveBeenCalled();
      
      // Advance timer to trigger flush
      jest.advanceTimersByTime(10000); // 10 second flush interval
      
      // Should save after flush interval
      expect(mockDataStore.save).toHaveBeenCalledTimes(1);
      expect(mockDataStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestsThisMinute: 10,
          requestsToday: 10,
        })
      );
    });

    it('should handle DataStore save errors', async () => {
      mockDataStore.save.mockRejectedValue(new Error('DataStore write error'));
      
      await rateLimiter.checkAndIncrement();
      
      // Force flush
      jest.advanceTimersByTime(10000);
      
      // Should log error but not crash
      const logger = require('../../../src/utils/logger').logger;
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to save rate limit state:',
        expect.any(Error)
      );
    });
  });

  describe('Time window management with DataStore', () => {
    it('should reset minute window and persist to DataStore', async () => {
      const oneMinuteAgo = Date.now() - 61000;
      const savedState = {
        requestsThisMinute: 50,
        requestsToday: 500,
        minuteWindowStart: oneMinuteAgo,
        dayWindowStart: Date.now() - 3600000,
      };
      
      mockDataStore.load.mockResolvedValue(savedState);
      await rateLimiter.initialize();
      
      // Make a request - should reset minute window
      await rateLimiter.checkAndIncrement();
      
      // Force flush
      await rateLimiter.shutdown();
      
      expect(mockDataStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestsThisMinute: 1, // Reset
          requestsToday: 501, // Continued from saved state
          minuteWindowStart: expect.not.objectContaining(oneMinuteAgo),
        })
      );
    });

    it('should reset daily window and persist to DataStore', async () => {
      const oneDayAgo = Date.now() - 86400001; // Just over 24 hours
      const savedState = {
        requestsThisMinute: 5,
        requestsToday: 999,
        minuteWindowStart: Date.now() - 30000,
        dayWindowStart: oneDayAgo,
      };
      
      mockDataStore.load.mockResolvedValue(savedState);
      await rateLimiter.initialize();
      
      // Make a request - should reset daily window
      await rateLimiter.checkAndIncrement();
      
      // Force flush
      await rateLimiter.shutdown();
      
      expect(mockDataStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestsThisMinute: 6, // Continued
          requestsToday: 1, // Reset
          dayWindowStart: expect.not.objectContaining(oneDayAgo),
        })
      );
    });
  });

  describe('Concurrent operations with DataStore', () => {
    it('should handle concurrent requests with atomic DataStore saves', async () => {
      mockDataStore.load.mockResolvedValue(null);
      await rateLimiter.initialize();
      
      // Make concurrent requests
      const requests = Array(20).fill(null).map(() => 
        rateLimiter.checkAndIncrement()
      );
      
      const results = await Promise.all(requests);
      
      // All requests should be counted
      const allowedCount = results.filter(r => r.allowed).length;
      expect(allowedCount).toBe(20);
      
      // Force flush
      await rateLimiter.shutdown();
      
      // DataStore should save final state with all requests
      expect(mockDataStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestsThisMinute: 20,
          requestsToday: 20,
        })
      );
    });
  });

  describe('Configuration updates with DataStore', () => {
    it('should maintain state across configuration updates', async () => {
      const savedState = {
        requestsThisMinute: 10,
        requestsToday: 100,
        minuteWindowStart: Date.now() - 30000,
        dayWindowStart: Date.now() - 3600000,
      };
      
      mockDataStore.load.mockResolvedValue(savedState);
      await rateLimiter.initialize();
      
      // Update configuration
      await rateLimiter.updateConfiguration({
        rpmLimit: 100, // Increase from 60
        dailyLimit: 2000, // Increase from 1000
      });
      
      // State should be preserved
      const result = await rateLimiter.checkAndIncrement();
      expect(result.remaining.minute).toBe(90 - 10 - 1); // 90% of 100 - existing - increment
      expect(result.remaining.daily).toBe(1800 - 100 - 1); // 90% of 2000 - existing - increment
    });
  });

  describe('Shutdown behavior with DataStore', () => {
    it('should force final save on shutdown', async () => {
      mockDataStore.load.mockResolvedValue(null);
      await rateLimiter.initialize();
      
      // Make some requests
      await rateLimiter.checkAndIncrement();
      await rateLimiter.checkAndIncrement();
      
      // Shutdown should force save even if flush interval hasn't passed
      await rateLimiter.shutdown();
      
      expect(mockDataStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestsThisMinute: 2,
          requestsToday: 2,
        })
      );
    });

    it('should clear flush timer on shutdown', async () => {
      mockDataStore.load.mockResolvedValue(null);
      await rateLimiter.initialize();
      
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      
      await rateLimiter.shutdown();
      
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('Recovery scenarios with DataStore', () => {
    it('should handle corrupted state by starting fresh', async () => {
      // DataStore validator will reject this, causing load to fail
      mockDataStore.load.mockRejectedValue(new Error('Invalid state data'));
      
      await rateLimiter.initialize();
      
      // Should start with fresh state
      const result = await rateLimiter.checkAndIncrement();
      expect(result.allowed).toBe(true);
      expect(result.remaining.minute).toBe(53); // 90% of 60 - 1
    });

    it('should preserve state across restarts', async () => {
      // First instance
      mockDataStore.load.mockResolvedValue(null);
      const rateLimiter1 = new RateLimiter(60, 1000);
      await rateLimiter1.initialize();
      
      await rateLimiter1.checkAndIncrement();
      await rateLimiter1.checkAndIncrement();
      await rateLimiter1.shutdown();
      
      // Capture saved state
      const savedState = mockDataStore.save.mock.calls[0][0];
      
      // Second instance loads saved state
      mockDataStore.load.mockResolvedValue(savedState);
      const rateLimiter2 = new RateLimiter(60, 1000);
      await rateLimiter2.initialize();
      
      const result = await rateLimiter2.checkAndIncrement();
      expect(result.remaining.minute).toBe(54 - 2 - 1); // Previous requests counted
      
      await rateLimiter2.shutdown();
    });
  });
});