import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { RaceConditionManager } from '../../../src/utils/raceConditionManager';
import { Mutex } from 'async-mutex';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger');

describe('RaceConditionManager', () => {
  let manager: RaceConditionManager;
  let mockChannel: { sendTyping: () => Promise<void> };

  beforeEach(() => {
    manager = new RaceConditionManager();
    mockChannel = {
      sendTyping: jest.fn(() => Promise.resolve()),
    };
    
    // Reset timers
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    manager.cleanup();
    jest.useRealTimers();
  });

  describe('getUserMutex', () => {
    it('should create a new mutex for a new user', () => {
      const mutex1 = manager.getUserMutex('user1');
      expect(mutex1).toBeInstanceOf(Mutex);
    });

    it('should return the same mutex for the same user', () => {
      const mutex1 = manager.getUserMutex('user1');
      const mutex2 = manager.getUserMutex('user1');
      expect(mutex1).toBe(mutex2);
    });

    it('should create different mutexes for different users', () => {
      const mutex1 = manager.getUserMutex('user1');
      const mutex2 = manager.getUserMutex('user2');
      expect(mutex1).not.toBe(mutex2);
    });

    it('should handle concurrent access correctly', async () => {
      const userId = 'testUser';
      const results: number[] = [];
      let counter = 0;

      const mutex = manager.getUserMutex(userId);

      // Create multiple concurrent operations
      const operations = Array(5).fill(0).map(async (_, index) => {
        const release = await mutex.acquire();
        try {
          // Simulate some work
          counter++;
          results.push(counter);
        } finally {
          release();
        }
      });

      await Promise.all(operations);

      // Results should be sequential, not concurrent
      expect(results).toEqual([1, 2, 3, 4, 5]);
    }, 10000);
  });

  describe('message processing tracking', () => {
    it('should track processed messages', () => {
      const messageKey = 'msg123-user456';
      
      expect(manager.hasProcessedMessage(messageKey)).toBe(false);
      
      manager.markMessageProcessed(messageKey);
      
      expect(manager.hasProcessedMessage(messageKey)).toBe(true);
    });

    it('should handle multiple messages', () => {
      const keys = ['msg1', 'msg2', 'msg3'];
      
      keys.forEach(key => {
        manager.markMessageProcessed(key);
      });
      
      keys.forEach(key => {
        expect(manager.hasProcessedMessage(key)).toBe(true);
      });
      
      expect(manager.hasProcessedMessage('msg4')).toBe(false);
    });

    it('should cleanup old messages when limit is exceeded', () => {
      // Add more than 1000 messages
      for (let i = 0; i < 1500; i++) {
        manager.markMessageProcessed(`msg${i}`);
      }
      
      // First 500 should be removed
      for (let i = 0; i < 500; i++) {
        expect(manager.hasProcessedMessage(`msg${i}`)).toBe(false);
      }
      
      // Last 1000 should still be there
      for (let i = 500; i < 1500; i++) {
        expect(manager.hasProcessedMessage(`msg${i}`)).toBe(true);
      }
    });
  });

  describe('typing indicators', () => {
    it('should start typing immediately', () => {
      manager.startTyping('channel1', mockChannel);
      
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(1);
    });

    it('should send typing indicator periodically', () => {
      manager.startTyping('channel1', mockChannel);
      
      // Initial call
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(1);
      
      // Advance timer by 5 seconds
      jest.advanceTimersByTime(5000);
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(2);
      
      // Advance again
      jest.advanceTimersByTime(5000);
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(3);
    });

    it('should stop typing when requested', () => {
      manager.startTyping('channel1', mockChannel);
      
      // Advance timer
      jest.advanceTimersByTime(5000);
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(2);
      
      // Stop typing
      manager.stopTyping('channel1');
      
      // Advance timer again - should not call sendTyping
      jest.advanceTimersByTime(5000);
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple channels independently', () => {
      const mockChannel2 = { sendTyping: jest.fn(() => Promise.resolve()) };
      
      manager.startTyping('channel1', mockChannel);
      manager.startTyping('channel2', mockChannel2);
      
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(1);
      expect(mockChannel2.sendTyping).toHaveBeenCalledTimes(1);
      
      manager.stopTyping('channel1');
      
      jest.advanceTimersByTime(5000);
      
      // Channel1 should not receive more calls
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(1);
      // Channel2 should continue
      expect(mockChannel2.sendTyping).toHaveBeenCalledTimes(2);
    });

    it('should clear existing interval when starting typing again', () => {
      manager.startTyping('channel1', mockChannel);
      
      jest.advanceTimersByTime(3000);
      
      // Start typing again on same channel
      manager.startTyping('channel1', mockChannel);
      
      // Should have 2 calls total (initial + restart)
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(2);
      
      // Advance to check interval was properly reset
      jest.advanceTimersByTime(5000);
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(3);
    });

    it('should handle sendTyping errors gracefully', async () => {
      const errorChannel = {
        sendTyping: jest.fn(() => Promise.reject(new Error('Typing failed'))),
      };
      
      manager.startTyping('channel1', errorChannel);
      
      // Wait for promise to resolve
      await Promise.resolve();
      
      expect(logger.debug).toHaveBeenCalledWith(
        'Failed to send initial typing indicator:',
        expect.any(Error)
      );
      
      // Should still set up interval
      jest.advanceTimersByTime(5000);
      
      // Wait for promise to resolve
      await Promise.resolve();
      
      expect(logger.debug).toHaveBeenCalledWith(
        'Failed to send typing indicator:',
        expect.any(Error)
      );
    });
  });

  describe('cleanup', () => {
    it('should clear all resources', () => {
      // Add some data
      manager.markMessageProcessed('msg1');
      manager.markMessageProcessed('msg2');
      manager.getUserMutex('user1');
      manager.getUserMutex('user2');
      manager.startTyping('channel1', mockChannel);
      manager.startTyping('channel2', mockChannel);
      
      // Cleanup
      manager.cleanup();
      
      // Check messages are cleared
      expect(manager.hasProcessedMessage('msg1')).toBe(false);
      expect(manager.hasProcessedMessage('msg2')).toBe(false);
      
      // Check typing is stopped
      jest.advanceTimersByTime(5000);
      expect(mockChannel.sendTyping).toHaveBeenCalledTimes(2); // Only initial calls
      
      // Check logging
      expect(logger.info).toHaveBeenCalledWith('Race condition resources cleaned up');
      expect(logger.debug).toHaveBeenCalledWith('Cleared typing interval for channel: channel1');
      expect(logger.debug).toHaveBeenCalledWith('Cleared typing interval for channel: channel2');
    });

    it('should handle cleanup with no resources', () => {
      manager.cleanup();
      
      expect(logger.info).toHaveBeenCalledWith('Race condition resources cleaned up');
    });
  });

  describe('getMessageMutex', () => {
    it('should return a mutex instance', () => {
      const mutex = manager.getMessageMutex();
      expect(mutex).toBeInstanceOf(Mutex);
    });

    it('should return the same mutex on multiple calls', () => {
      const mutex1 = manager.getMessageMutex();
      const mutex2 = manager.getMessageMutex();
      expect(mutex1).toBe(mutex2);
    });
  });

  describe('getInteractionMutex', () => {
    it('should return a mutex instance', () => {
      const mutex = manager.getInteractionMutex();
      expect(mutex).toBeInstanceOf(Mutex);
    });

    it('should return the same mutex on multiple calls', () => {
      const mutex1 = manager.getInteractionMutex();
      const mutex2 = manager.getInteractionMutex();
      expect(mutex1).toBe(mutex2);
    });

    it('should return different mutex than message mutex', () => {
      const messageMutex = manager.getMessageMutex();
      const interactionMutex = manager.getInteractionMutex();
      expect(messageMutex).not.toBe(interactionMutex);
    });
  });

  describe('edge cases', () => {
    it('should handle stopping typing for non-existent channel', () => {
      // Should not throw
      expect(() => manager.stopTyping('nonexistent')).not.toThrow();
    });

    it('should handle very long message keys', () => {
      const longKey = 'msg'.repeat(1000);
      
      manager.markMessageProcessed(longKey);
      expect(manager.hasProcessedMessage(longKey)).toBe(true);
    });

    it('should handle concurrent typing operations', () => {
      const channels = Array(10).fill(0).map((_, i) => ({
        id: `channel${i}`,
        channel: { sendTyping: jest.fn(() => Promise.resolve()) },
      }));
      
      // Start typing on all channels
      channels.forEach(({ id, channel }) => {
        manager.startTyping(id, channel);
      });
      
      // All should have initial typing
      channels.forEach(({ channel }) => {
        expect(channel.sendTyping).toHaveBeenCalledTimes(1);
      });
      
      // Stop half of them
      channels.slice(0, 5).forEach(({ id }) => {
        manager.stopTyping(id);
      });
      
      // Advance timer
      jest.advanceTimersByTime(5000);
      
      // First half should still have 1 call
      channels.slice(0, 5).forEach(({ channel }) => {
        expect(channel.sendTyping).toHaveBeenCalledTimes(1);
      });
      
      // Second half should have 2 calls
      channels.slice(5).forEach(({ channel }) => {
        expect(channel.sendTyping).toHaveBeenCalledTimes(2);
      });
    });
  });
});