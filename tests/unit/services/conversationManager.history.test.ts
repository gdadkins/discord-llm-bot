import { ConversationManager } from '../../../src/services/conversationManager';
import { logger } from '../../../src/utils/logger';
import { Collection } from 'discord.js';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ConversationManager - Message History', () => {
  let conversationManager: ConversationManager;
  let mockChannel: any;
  let mockClient: any;
  let mockBotUser: any;

  beforeEach(async () => {
    conversationManager = new ConversationManager(30, 100, 50000);
    await conversationManager.initialize();

    // Create mock bot user
    mockBotUser = {
      id: 'bot-id-123',
    };

    // Create mock client
    mockClient = {
      user: mockBotUser,
    };

    // Create mock channel
    mockChannel = {
      id: 'channel-123',
      messages: {
        fetch: jest.fn(),
      },
    };
  });

  afterEach(async () => {
    await conversationManager.shutdown();
    jest.clearAllMocks();
  });

  describe('fetchChannelHistory', () => {
    it('should fetch messages and convert them to the correct format', async () => {
      // Create mock Discord messages using Collection
      const mockMessages = new Collection();
      
      // Add messages in reverse order (Discord returns newest first)
      mockMessages.set('msg-3', {
        id: 'msg-3',
        content: 'Hello from user',
        author: { id: 'user-123', bot: false },
        createdTimestamp: Date.now() - 1000,
        client: mockClient,
      });
      
      mockMessages.set('msg-2', {
        id: 'msg-2',
        content: 'Response from bot',
        author: { id: 'bot-id-123', bot: true },
        createdTimestamp: Date.now() - 2000,
        client: mockClient,
      });
      
      mockMessages.set('msg-1', {
        id: 'msg-1',
        content: 'First message',
        author: { id: 'user-456', bot: false },
        createdTimestamp: Date.now() - 3000,
        client: mockClient,
      });

      mockChannel.messages.fetch.mockResolvedValueOnce(mockMessages);

      const result = await conversationManager.fetchChannelHistory(mockChannel, 10);

      expect(result).toHaveLength(3);
      
      // Check messages are in chronological order (oldest first)
      expect(result[0].content).toBe('First message');
      expect(result[0].role).toBe('user');
      
      expect(result[1].content).toBe('Response from bot');
      expect(result[1].role).toBe('assistant');
      
      expect(result[2].content).toBe('Hello from user');
      expect(result[2].role).toBe('user');
    });

    it('should handle pagination when fetching more than 100 messages', async () => {
      // First batch of 100 messages
      const firstBatch = new Collection();
      for (let i = 100; i > 0; i--) {
        firstBatch.set(`msg-${i}`, {
          id: `msg-${i}`,
          content: `Message ${i}`,
          author: { id: 'user-123', bot: false },
          createdTimestamp: Date.now() - (i * 1000),
          client: mockClient,
        });
      }

      // Second batch of 50 messages
      const secondBatch = new Collection();
      for (let i = 150; i > 100; i--) {
        secondBatch.set(`msg-${i}`, {
          id: `msg-${i}`,
          content: `Message ${i}`,
          author: { id: 'user-123', bot: false },
          createdTimestamp: Date.now() - (i * 1000),
          client: mockClient,
        });
      }

      mockChannel.messages.fetch
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce(secondBatch);

      const result = await conversationManager.fetchChannelHistory(mockChannel, 150);

      expect(mockChannel.messages.fetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(150);
      
      // Verify correct order
      expect(result[0].content).toBe('Message 150');
      expect(result[149].content).toBe('Message 1');
    });

    it('should skip messages from other bots', async () => {
      const mockMessages = new Collection();
      
      mockMessages.set('msg-1', {
        id: 'msg-1',
        content: 'User message',
        author: { id: 'user-123', bot: false },
        createdTimestamp: Date.now() - 3000,
        client: mockClient,
      });
      
      mockMessages.set('msg-2', {
        id: 'msg-2',
        content: 'Other bot message',
        author: { id: 'other-bot-456', bot: true },
        createdTimestamp: Date.now() - 2000,
        client: mockClient,
      });
      
      mockMessages.set('msg-3', {
        id: 'msg-3',
        content: 'Our bot message',
        author: { id: 'bot-id-123', bot: true },
        createdTimestamp: Date.now() - 1000,
        client: mockClient,
      });

      mockChannel.messages.fetch.mockResolvedValueOnce(mockMessages);

      const result = await conversationManager.fetchChannelHistory(mockChannel);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('User message');
      expect(result[1].content).toBe('Our bot message');
    });

    it('should handle rate limit errors with retry', async () => {
      const mockMessages = new Collection();
      mockMessages.set('msg-1', {
        id: 'msg-1',
        content: 'Test message',
        author: { id: 'user-123', bot: false },
        createdTimestamp: Date.now(),
        client: mockClient,
      });

      // First call throws rate limit error
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).code = 50013;
      (rateLimitError as any).retryAfter = 100;

      mockChannel.messages.fetch
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockMessages);

      const result = await conversationManager.fetchChannelHistory(mockChannel, 10);

      expect(mockChannel.messages.fetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Rate limited'));
    });

    it('should throw non-rate-limit errors immediately', async () => {
      const error = new Error('Permission denied');
      mockChannel.messages.fetch.mockRejectedValueOnce(error);

      await expect(
        conversationManager.fetchChannelHistory(mockChannel)
      ).rejects.toThrow('Permission denied');

      expect(mockChannel.messages.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('importChannelHistory', () => {
    it('should import channel history into user conversation', async () => {
      const mockMessages = new Collection();
      
      for (let i = 1; i <= 5; i++) {
        mockMessages.set(`msg-${i}`, {
          id: `msg-${i}`,
          content: `Message ${i}`,
          author: { id: 'user-123', bot: false },
          createdTimestamp: Date.now() - (i * 1000),
          client: mockClient,
        });
      }

      mockChannel.messages.fetch.mockResolvedValueOnce(mockMessages);

      const importedCount = await conversationManager.importChannelHistory(
        'user-123',
        mockChannel,
        50
      );

      expect(importedCount).toBe(5);

      // Verify messages were imported
      const context = conversationManager.buildConversationContext('user-123');
      expect(context).toContain('Message 5');
      expect(context).toContain('Message 1');
    });

    it('should respect context length limits when importing', async () => {
      const mockMessages = new Collection();
      
      // Create messages that would exceed context limit
      for (let i = 1; i <= 10; i++) {
        mockMessages.set(`msg-${i}`, {
          id: `msg-${i}`,
          content: 'A'.repeat(10000), // Large message
          author: { id: 'user-123', bot: false },
          createdTimestamp: Date.now() - (i * 1000),
          client: mockClient,
        });
      }

      mockChannel.messages.fetch.mockResolvedValueOnce(mockMessages);

      const importedCount = await conversationManager.importChannelHistory(
        'user-123',
        mockChannel,
        50
      );

      // Should stop importing when context limit is reached
      expect(importedCount).toBeLessThan(10);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Stopped importing')
      );
    });

    it('should clear existing messages before importing', async () => {
      // Add some existing messages
      conversationManager.addToConversation(
        'user-123',
        'Old message',
        'Old response'
      );

      const mockMessages = new Collection();
      mockMessages.set('msg-1', {
        id: 'msg-1',
        content: 'New imported message',
        author: { id: 'user-123', bot: false },
        createdTimestamp: Date.now(),
        client: mockClient,
      });

      mockChannel.messages.fetch.mockResolvedValueOnce(mockMessages);

      await conversationManager.importChannelHistory('user-123', mockChannel);

      const context = conversationManager.buildConversationContext('user-123');
      expect(context).toContain('New imported message');
      expect(context).not.toContain('Old message');
    });

    it('should handle empty channel history', async () => {
      mockChannel.messages.fetch.mockResolvedValueOnce(new Collection());

      const importedCount = await conversationManager.importChannelHistory(
        'user-123',
        mockChannel
      );

      expect(importedCount).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No messages to import')
      );
    });

    it('should handle fetch errors gracefully', async () => {
      const error = new Error('Failed to fetch');
      mockChannel.messages.fetch.mockRejectedValueOnce(error);

      await expect(
        conversationManager.importChannelHistory('user-123', mockChannel)
      ).rejects.toThrow('Failed to fetch');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import channel history'),
        error
      );
    });
  });
});