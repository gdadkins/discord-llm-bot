import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { 
  ChatInputCommandInteraction, 
  ChannelType, 
  GuildMember,
  User,
  Collection,
  PermissionsBitField
} from 'discord.js';
import * as commandHandlers from '../../../src/handlers/commandHandlers';
import { GeminiService } from '../../../src/services/gemini';
import { logger } from '../../../src/utils/logger';
import { splitMessage } from '../../../src/utils/messageSplitter';
import { extractRecentEmojis } from '../../../src/commands';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/messageSplitter');
jest.mock('../../../src/commands');

describe('CommandHandlers', () => {
  let mockInteraction: jest.Mocked<ChatInputCommandInteraction>;
  let mockGeminiService: jest.Mocked<GeminiService>;
  let mockUser: jest.Mocked<User>;
  let mockMember: jest.Mocked<GuildMember>;
  let mockChannel: any;

  beforeEach(() => {
    // Setup mock user
    mockUser = {
      id: 'user123',
      username: 'TestUser',
      bot: false,
    } as any;

    // Setup mock member with permissions
    mockMember = {
      permissions: new PermissionsBitField(['SendMessages']),
      user: mockUser,
    } as any;

    // Setup mock channel
    mockChannel = {
      id: 'channel123',
      type: ChannelType.GuildText,
      name: 'test-channel',
      messages: {
        fetchPinned: jest.fn().mockResolvedValue(new Collection()),
      },
    };

    // Setup mock interaction
    mockInteraction = {
      user: mockUser,
      member: mockMember,
      guild: { id: 'guild123' },
      guildId: 'guild123',
      channel: mockChannel,
      options: {
        getString: jest.fn(),
        getUser: jest.fn(),
        getBoolean: jest.fn(),
      },
      reply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      deferReply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined),
      memberPermissions: mockMember.permissions,
    } as any;

    // Setup mock Gemini service
    mockGeminiService = {
      generateResponse: jest.fn().mockResolvedValue('Test response'),
      getRemainingQuota: jest.fn().mockReturnValue({ minuteRemaining: 10, dailyRemaining: 1000 }),
      getConversationStats: jest.fn().mockReturnValue({ activeUsers: 5, totalMessages: 100, totalContextSize: 1024 }),
      getCacheStats: jest.fn().mockReturnValue({ totalHits: 50, totalMisses: 10 }),
      getCachePerformance: jest.fn().mockReturnValue({ reduction: 80, avgLookupTime: 2 }),
      clearUserConversation: jest.fn().mockReturnValue(true),
      clearCache: jest.fn(),
      addEmbarrassingMoment: jest.fn(),
      addRunningGag: jest.fn(),
      getPersonalityManager: jest.fn().mockReturnValue({
        addPersonalityDescription: jest.fn().mockResolvedValue({ success: true, message: 'Added' }),
        getPersonality: jest.fn().mockReturnValue({ descriptions: ['Test personality'], lastUpdated: Date.now() }),
        removePersonalityDescription: jest.fn().mockResolvedValue({ success: true, message: 'Removed' }),
        clearPersonality: jest.fn().mockResolvedValue({ success: true, message: 'Cleared' }),
      }),
      getContextManager: jest.fn().mockReturnValue({
        getMemoryStats: jest.fn().mockReturnValue({
          totalServers: 5,
          totalMemoryUsage: 5120,
          averageServerSize: 1024,
          largestServerSize: 2048,
          itemCounts: { embarrassingMoments: 10, codeSnippets: 5, runningGags: 3, summarizedFacts: 20 },
          compressionStats: { averageCompressionRatio: 0.5, totalMemorySaved: 2560, duplicatesRemoved: 15 },
        }),
        getServerCompressionStats: jest.fn().mockReturnValue({ compressionRatio: 0.6, memorySaved: 512 }),
        summarizeServerContextNow: jest.fn().mockReturnValue(true),
        deduplicateServerContext: jest.fn().mockReturnValue(5),
        enableCrossServerContext: jest.fn(),
      }),
    } as any;

    // Mock splitMessage
    (splitMessage as jest.Mock).mockImplementation((text: string) => [text]);

    // Mock extractRecentEmojis
    (extractRecentEmojis as jest.Mock).mockResolvedValue([]);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('handleChatCommand', () => {
    it('should handle chat command successfully', async () => {
      mockInteraction.options.getString.mockReturnValue('Hello bot');

      await commandHandlers.handleChatCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockGeminiService.generateResponse).toHaveBeenCalledWith(
        'Hello bot',
        'user123',
        'guild123',
        undefined,
        expect.objectContaining({
          channelName: 'test-channel',
          channelType: 'text',
        }),
        mockMember
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith('Test response');
    });

    it('should reply with error message when no prompt provided', async () => {
      mockInteraction.options.getString.mockReturnValue(null);

      await commandHandlers.handleChatCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.reply).toHaveBeenCalledWith('Please provide a message!');
      expect(mockInteraction.deferReply).not.toHaveBeenCalled();
    });

    it('should handle multi-chunk responses', async () => {
      mockInteraction.options.getString.mockReturnValue('Hello');
      (splitMessage as jest.Mock).mockReturnValue(['Part 1', 'Part 2', 'Part 3']);

      await commandHandlers.handleChatCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.editReply).toHaveBeenCalledWith('Part 1');
      expect(mockInteraction.followUp).toHaveBeenCalledTimes(2);
      expect(mockInteraction.followUp).toHaveBeenNthCalledWith(1, 'Part 2');
      expect(mockInteraction.followUp).toHaveBeenNthCalledWith(2, 'Part 3');
    });

    it('should handle DM channels', async () => {
      mockInteraction.options.getString.mockReturnValue('Hello');
      mockInteraction.channel = {
        id: 'dm123',
        type: ChannelType.DM,
      } as any;

      await commandHandlers.handleChatCommand(mockInteraction, mockGeminiService);

      expect(mockGeminiService.generateResponse).toHaveBeenCalledWith(
        'Hello',
        'user123',
        'guild123',
        undefined,
        expect.objectContaining({
          channelName: 'DM',
          channelType: 'dm',
        }),
        mockMember
      );
    });

    it('should handle thread channels', async () => {
      mockInteraction.options.getString.mockReturnValue('Hello');
      mockInteraction.channel = {
        id: 'thread123',
        type: ChannelType.PublicThread,
        name: 'test-thread',
      } as any;

      await commandHandlers.handleChatCommand(mockInteraction, mockGeminiService);

      expect(mockGeminiService.generateResponse).toHaveBeenCalledWith(
        'Hello',
        'user123',
        'guild123',
        undefined,
        expect.objectContaining({
          channelType: 'thread',
          isThread: true,
          threadName: 'test-thread',
        }),
        mockMember
      );
    });

    it('should handle errors gracefully', async () => {
      mockInteraction.options.getString.mockReturnValue('Hello');
      mockGeminiService.generateResponse.mockRejectedValue(new Error('Generation failed'));

      await commandHandlers.handleChatCommand(mockInteraction, mockGeminiService);

      expect(logger.error).toHaveBeenCalledWith('Error generating response:', expect.any(Error));
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        'Sorry, I encountered an error while generating a response. Please try again later.'
      );
    });
  });

  describe('handleStatusCommand', () => {
    it('should display bot status correctly', async () => {
      await commandHandlers.handleStatusCommand(mockInteraction, mockGeminiService);

      expect(mockGeminiService.getRemainingQuota).toHaveBeenCalled();
      expect(mockGeminiService.getConversationStats).toHaveBeenCalled();
      expect(mockGeminiService.getCacheStats).toHaveBeenCalled();
      expect(mockGeminiService.getCachePerformance).toHaveBeenCalled();
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Bot Status'),
        ephemeral: true,
      });
    });

    it('should handle errors in status command', async () => {
      mockGeminiService.getRemainingQuota.mockImplementation(() => {
        throw new Error('Status error');
      });

      await commandHandlers.handleStatusCommand(mockInteraction, mockGeminiService);

      expect(logger.error).toHaveBeenCalledWith('Error in status command:', expect.any(Error));
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Error retrieving status information. Check logs for details.',
        ephemeral: true,
      });
    });
  });

  describe('handleClearCommand', () => {
    it('should clear conversation history and cache', async () => {
      mockGeminiService.clearUserConversation.mockReturnValue(true);

      await commandHandlers.handleClearCommand(mockInteraction, mockGeminiService);

      expect(mockGeminiService.clearUserConversation).toHaveBeenCalledWith('user123');
      expect(mockGeminiService.clearCache).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Your conversation history and cache have been cleared. Starting fresh!',
        ephemeral: true,
      });
    });

    it('should handle when no history exists', async () => {
      mockGeminiService.clearUserConversation.mockReturnValue(false);

      await commandHandlers.handleClearCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'You don\'t have any conversation history to clear. Cache has been cleared.',
        ephemeral: true,
      });
    });
  });

  describe('handleRememberCommand', () => {
    it('should add embarrassing moment', async () => {
      const targetUser = { id: 'target123', username: 'TargetUser' } as User;
      mockInteraction.options.getUser.mockReturnValue(targetUser);
      mockInteraction.options.getString.mockReturnValue('tripped on stage');

      await commandHandlers.handleRememberCommand(mockInteraction, mockGeminiService);

      expect(mockGeminiService.addEmbarrassingMoment).toHaveBeenCalledWith('guild123', 'target123', 'tripped on stage');
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'I\'ll remember that TargetUser tripped on stage. This will come up later...',
        ephemeral: false,
      });
    });

    it('should reject in DMs', async () => {
      mockInteraction.guildId = null;

      await commandHandlers.handleRememberCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'This command only works in servers!',
        ephemeral: true,
      });
    });
  });

  describe('handleSetPersonalityCommand', () => {
    it('should set personality for admin users', async () => {
      mockMember.permissions = new PermissionsBitField(['Administrator']);
      const targetUser = { id: 'target123', username: 'TargetUser' } as User;
      mockInteraction.options.getUser.mockReturnValue(targetUser);
      mockInteraction.options.getString.mockReturnValue('Always cheerful');

      await commandHandlers.handleSetPersonalityCommand(mockInteraction, mockGeminiService);

      const personalityManager = mockGeminiService.getPersonalityManager();
      expect(personalityManager.addPersonalityDescription).toHaveBeenCalledWith(
        'target123',
        'Always cheerful',
        'user123'
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '✅ Added',
        ephemeral: true,
      });
    });

    it('should reject non-admin users', async () => {
      mockMember.permissions = new PermissionsBitField(['SendMessages']);

      await commandHandlers.handleSetPersonalityCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'You need Administrator or Manage Server permissions to use this command!',
        ephemeral: true,
      });
    });

    it('should accept ManageGuild permission', async () => {
      mockMember.permissions = new PermissionsBitField(['ManageGuild']);
      const targetUser = { id: 'target123', username: 'TargetUser' } as User;
      mockInteraction.options.getUser.mockReturnValue(targetUser);
      mockInteraction.options.getString.mockReturnValue('Always cheerful');

      await commandHandlers.handleSetPersonalityCommand(mockInteraction, mockGeminiService);

      const personalityManager = mockGeminiService.getPersonalityManager();
      expect(personalityManager.addPersonalityDescription).toHaveBeenCalled();
    });
  });

  describe('handleExecuteCommand', () => {
    beforeEach(() => {
      process.env.ENABLE_CODE_EXECUTION = 'true';
    });

    it('should execute code when enabled', async () => {
      mockInteraction.options.getString.mockReturnValue('print(2+2)');

      await commandHandlers.handleExecuteCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockGeminiService.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('print(2+2)'),
        'user123',
        'guild123',
        undefined,
        undefined,
        mockMember
      );
    });

    it('should reject when code execution is disabled', async () => {
      process.env.ENABLE_CODE_EXECUTION = 'false';
      mockInteraction.options.getString.mockReturnValue('print(2+2)');

      await commandHandlers.handleExecuteCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Code execution is not enabled. Set ENABLE_CODE_EXECUTION=true in your .env file to use this feature.',
        ephemeral: true,
      });
    });
  });

  describe('handleContextStatsCommand', () => {
    it('should display context statistics', async () => {
      await commandHandlers.handleContextStatsCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      const contextManager = mockGeminiService.getContextManager();
      expect(contextManager.getMemoryStats).toHaveBeenCalled();
      expect(contextManager.getServerCompressionStats).toHaveBeenCalledWith('guild123');
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: '📊 Advanced Context Statistics',
          fields: expect.any(Array),
        })],
      });
    });

    it('should reject in DMs', async () => {
      mockInteraction.guildId = null;

      await commandHandlers.handleContextStatsCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server!',
        ephemeral: true,
      });
    });
  });

  describe('handleCrossServerCommand', () => {
    it('should enable cross-server context for admins', async () => {
      mockMember.permissions = new PermissionsBitField(['Administrator']);
      mockInteraction.options.getBoolean.mockReturnValue(true);

      await commandHandlers.handleCrossServerCommand(mockInteraction, mockGeminiService);

      const contextManager = mockGeminiService.getContextManager();
      expect(contextManager.enableCrossServerContext).toHaveBeenCalledWith('user123', 'guild123', true);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Cross-server context sharing enabled'),
        ephemeral: true,
      });
    });

    it('should disable cross-server context', async () => {
      mockMember.permissions = new PermissionsBitField(['Administrator']);
      mockInteraction.options.getBoolean.mockReturnValue(false);

      await commandHandlers.handleCrossServerCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Cross-server context sharing disabled'),
        ephemeral: true,
      });
    });
  });

  describe('handleAsciiCommand', () => {
    it('should generate ASCII art', async () => {
      mockInteraction.options.getString.mockReturnValue('cat');

      await commandHandlers.handleAsciiCommand(mockInteraction, mockGeminiService);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockGeminiService.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('Create ASCII art of "cat"'),
        'user123',
        'guild123',
        undefined,
        undefined,
        mockMember
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('Here\'s your ASCII art of **cat**')
      );
    });
  });
});