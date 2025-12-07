import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { 
  Client, 
  Events, 
  Message, 
  ChannelType,
  Interaction,
  MessageReaction,
  User,
  ChatInputCommandInteraction,
  Collection
} from 'discord.js';
import { setupEventHandlers } from '../../../src/handlers/eventHandlers';
import { GeminiService } from '../../../src/services/gemini';
import { logger } from '../../../src/utils/logger';
import { splitMessage } from '../../../src/utils/messageSplitter';
import { extractRecentEmojis } from '../../../src/commands';
import { RaceConditionManager } from '../../../src/utils/raceConditionManager';
import * as commandHandlers from '../../../src/handlers/commandHandlers';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/messageSplitter');
jest.mock('../../../src/commands');
jest.mock('../../../src/handlers/commandHandlers');

describe('EventHandlers', () => {
  let mockClient: jest.Mocked<Client>;
  let mockGeminiService: jest.Mocked<GeminiService>;
  let mockRaceConditionManager: jest.Mocked<RaceConditionManager>;
  let eventHandlers: Map<string, Function>;

  beforeEach(() => {
    // Setup event handler tracking
    eventHandlers = new Map();

    // Setup mock client
    mockClient = {
      user: { id: 'bot123', tag: 'TestBot#1234' },
      once: jest.fn((event, handler) => {
        eventHandlers.set(`once:${event}`, handler);
      }),
      on: jest.fn((event, handler) => {
        eventHandlers.set(`on:${event}`, handler);
      }),
    } as any;

    // Setup mock Gemini service
    mockGeminiService = {
      generateResponse: jest.fn().mockResolvedValue('Test response'),
    } as any;

    // Setup mock race condition manager
    mockRaceConditionManager = {
      getUserMutex: jest.fn().mockReturnValue({
        acquire: jest.fn().mockResolvedValue(jest.fn()), // Returns release function
      }),
      hasProcessedMessage: jest.fn().mockReturnValue(false),
      markMessageProcessed: jest.fn(),
      startTyping: jest.fn(),
      stopTyping: jest.fn(),
      cleanup: jest.fn(),
    } as any;

    // Mock splitMessage
    (splitMessage as jest.Mock).mockImplementation((text: string) => [text]);

    // Mock extractRecentEmojis
    (extractRecentEmojis as jest.Mock).mockResolvedValue([]);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('setupEventHandlers', () => {
    it('should register all required event handlers', () => {
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);

      expect(mockClient.once).toHaveBeenCalledWith(Events.ClientReady, expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith(Events.MessageReactionAdd, expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith(Events.MessageCreate, expect.any(Function));
    });
  });

  describe('ClientReady event', () => {
    it('should log ready message', () => {
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const readyHandler = eventHandlers.get('once:ready');
      const mockReadyClient = { user: { tag: 'TestBot#1234' } };
      
      readyHandler!(mockReadyClient);

      expect(logger.info).toHaveBeenCalledWith('Ready! Logged in as TestBot#1234');
    });
  });

  describe('InteractionCreate event', () => {
    let mockInteraction: jest.Mocked<ChatInputCommandInteraction>;

    beforeEach(() => {
      mockInteraction = {
        isChatInputCommand: jest.fn().mockReturnValue(true),
        commandName: 'chat',
        user: { id: 'user123' },
        replied: false,
        deferred: false,
        reply: jest.fn(),
        followUp: jest.fn(),
      } as any;
    });

    it('should handle chat command interaction', async () => {
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const interactionHandler = eventHandlers.get('on:interactionCreate');
      await interactionHandler!(mockInteraction);

      expect(mockRaceConditionManager.getUserMutex).toHaveBeenCalledWith('user123');
      expect(commandHandlers.handleChatCommand).toHaveBeenCalledWith(mockInteraction, mockGeminiService);
    });

    it('should handle status command interaction', async () => {
      mockInteraction.commandName = 'status';
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const interactionHandler = eventHandlers.get('on:interactionCreate');
      await interactionHandler!(mockInteraction);

      expect(commandHandlers.handleStatusCommand).toHaveBeenCalledWith(mockInteraction, mockGeminiService);
    });

    it('should handle unknown command', async () => {
      mockInteraction.commandName = 'unknown';
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const interactionHandler = eventHandlers.get('on:interactionCreate');
      await interactionHandler!(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith('Unknown command!');
    });

    it('should ignore non-chat input interactions', async () => {
      mockInteraction.isChatInputCommand.mockReturnValue(false);
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const interactionHandler = eventHandlers.get('on:interactionCreate');
      await interactionHandler!(mockInteraction);

      expect(mockRaceConditionManager.getUserMutex).not.toHaveBeenCalled();
    });

    it('should handle command errors gracefully', async () => {
      const error = new Error('Command failed');
      (commandHandlers.handleChatCommand as jest.Mock).mockRejectedValue(error);
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const interactionHandler = eventHandlers.get('on:interactionCreate');
      await interactionHandler!(mockInteraction);

      expect(logger.error).toHaveBeenCalledWith('Error handling interaction:', error);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    });

    it('should follow up if already replied', async () => {
      mockInteraction.replied = true;
      const error = new Error('Command failed');
      (commandHandlers.handleChatCommand as jest.Mock).mockRejectedValue(error);
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const interactionHandler = eventHandlers.get('on:interactionCreate');
      await interactionHandler!(mockInteraction);

      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    });

    it('should release mutex after command execution', async () => {
      const releaseFn = jest.fn();
      mockRaceConditionManager.getUserMutex.mockReturnValue({
        acquire: jest.fn().mockResolvedValue(releaseFn),
      } as any);
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const interactionHandler = eventHandlers.get('on:interactionCreate');
      await interactionHandler!(mockInteraction);

      expect(releaseFn).toHaveBeenCalled();
    });
  });

  describe('MessageReactionAdd event', () => {
    let mockReaction: jest.Mocked<MessageReaction>;
    let mockUser: jest.Mocked<User>;

    beforeEach(() => {
      mockUser = {
        id: 'user123',
        bot: false,
      } as any;

      mockReaction = {
        emoji: { name: 'fire' },
        message: {
          author: { id: 'bot123' },
          content: 'This is a roast message',
        },
      } as any;
    });

    it('should track good roast reactions', async () => {
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const reactionHandler = eventHandlers.get('on:messageReactionAdd');
      await reactionHandler!(mockReaction, mockUser);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Good roast detected! Emoji: fire')
      );
    });

    it('should track multiple roast emojis', async () => {
      const roastEmojis = ['joy', 'skull', 'fire', 'rofl', '100'];
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      const reactionHandler = eventHandlers.get('on:messageReactionAdd');

      for (const emoji of roastEmojis) {
        mockReaction.emoji.name = emoji;
        await reactionHandler!(mockReaction, mockUser);
      }

      expect(logger.info).toHaveBeenCalledTimes(5);
    });

    it('should ignore reactions from bots', async () => {
      mockUser.bot = true;
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const reactionHandler = eventHandlers.get('on:messageReactionAdd');
      await reactionHandler!(mockReaction, mockUser);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should ignore reactions on non-bot messages', async () => {
      mockReaction.message.author!.id = 'other123';
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const reactionHandler = eventHandlers.get('on:messageReactionAdd');
      await reactionHandler!(mockReaction, mockUser);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should ignore non-roast reactions', async () => {
      mockReaction.emoji.name = 'thumbsup';
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const reactionHandler = eventHandlers.get('on:messageReactionAdd');
      await reactionHandler!(mockReaction, mockUser);

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('MessageCreate event', () => {
    let mockMessage: jest.Mocked<Message>;
    let mockChannel: any;

    beforeEach(() => {
      mockChannel = {
        id: 'channel123',
        type: ChannelType.GuildText,
        name: 'test-channel',
        sendTyping: jest.fn().mockResolvedValue(undefined),
        send: jest.fn().mockResolvedValue(undefined),
        messages: {
          fetchPinned: jest.fn().mockResolvedValue(new Collection()),
        },
      };

      mockMessage = {
        id: 'msg123',
        author: { id: 'user123', bot: false },
        content: `<@bot123> Hello bot`,
        channel: mockChannel,
        guild: { id: 'guild123' },
        member: { id: 'user123' },
        mentions: {
          users: new Collection([['bot123', { id: 'bot123' }]]),
        },
        attachments: new Collection(),
        reply: jest.fn().mockResolvedValue(undefined),
      } as any;
    });

    it('should process mentioned messages', async () => {
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(mockRaceConditionManager.hasProcessedMessage).toHaveBeenCalledWith('msg123-user123');
      expect(mockRaceConditionManager.markMessageProcessed).toHaveBeenCalledWith('msg123-user123');
      expect(mockRaceConditionManager.getUserMutex).toHaveBeenCalledWith('user123');
      expect(mockGeminiService.generateResponse).toHaveBeenCalledWith(
        'Hello bot',
        'user123',
        'guild123',
        expect.any(Function),
        expect.objectContaining({
          channelName: 'test-channel',
          channelType: 'text',
        }),
        mockMessage.member
      );
    });

    it('should ignore bot messages', async () => {
      mockMessage.author.bot = true;
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(mockGeminiService.generateResponse).not.toHaveBeenCalled();
    });

    it('should ignore messages without bot mention', async () => {
      mockMessage.mentions.users = new Collection();
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(mockGeminiService.generateResponse).not.toHaveBeenCalled();
    });

    it('should skip duplicate messages', async () => {
      mockRaceConditionManager.hasProcessedMessage.mockReturnValue(true);
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(logger.debug).toHaveBeenCalledWith('Skipping duplicate message processing: msg123-user123');
      expect(mockGeminiService.generateResponse).not.toHaveBeenCalled();
    });

    it('should handle empty mentions', async () => {
      mockMessage.content = `<@bot123>`;
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith('Hi! Please include a message after mentioning me.');
    });

    it('should manage typing indicators', async () => {
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(mockRaceConditionManager.startTyping).toHaveBeenCalledWith('channel123', mockChannel);
      expect(mockRaceConditionManager.stopTyping).toHaveBeenCalledWith('channel123');
    });

    it('should handle multi-chunk responses', async () => {
      (splitMessage as jest.Mock).mockReturnValue(['Part 1', 'Part 2']);
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith('Part 1');
      expect(mockChannel.send).toHaveBeenCalledWith('Part 2');
    });

    it('should handle DM channels', async () => {
      mockMessage.channel = {
        id: 'dm123',
        type: ChannelType.DM,
        sendTyping: jest.fn(),
      } as any;
      mockMessage.guild = null as any;
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(mockGeminiService.generateResponse).toHaveBeenCalledWith(
        'Hello bot',
        'user123',
        undefined,
        expect.any(Function),
        expect.objectContaining({
          channelName: 'DM',
          channelType: 'dm',
        }),
        undefined
      );
    });

    it('should handle response generation errors', async () => {
      const error = new Error('Generation failed');
      mockGeminiService.generateResponse.mockRejectedValue(error);
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(logger.error).toHaveBeenCalledWith('Error generating response for mention:', error);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Sorry, I encountered an error while generating a response. Please try again later.'
      );
      expect(mockRaceConditionManager.stopTyping).toHaveBeenCalledWith('channel123');
    });

    it('should handle attachments in message context', async () => {
      mockMessage.attachments = new Collection([
        ['attach1', { id: 'attach1', contentType: 'image/png' }],
        ['attach2', { id: 'attach2', contentType: 'text/plain' }],
      ]) as any;
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(mockGeminiService.generateResponse).toHaveBeenCalledWith(
        'Hello bot',
        'user123',
        'guild123',
        expect.any(Function),
        expect.objectContaining({
          attachments: ['image/png', 'text/plain'],
        }),
        mockMessage.member
      );
    });

    it('should release mutex after processing', async () => {
      const releaseFn = jest.fn();
      mockRaceConditionManager.getUserMutex.mockReturnValue({
        acquire: jest.fn().mockResolvedValue(releaseFn),
      } as any);
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      expect(releaseFn).toHaveBeenCalled();
    });

    it('should handle queued responses', async () => {
      // Empty response means message was queued
      mockGeminiService.generateResponse.mockResolvedValue('');
      
      setupEventHandlers(mockClient, mockGeminiService, mockRaceConditionManager);
      
      const messageHandler = eventHandlers.get('on:messageCreate');
      await messageHandler!(mockMessage);

      // Should not send any reply when response is empty
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });
});