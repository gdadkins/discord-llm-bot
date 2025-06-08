/**
 * Event Handlers Module
 * Handles Discord client events and message processing
 */

import { 
  Client, 
  Events, 
  Message, 
  ChannelType,
  Interaction,
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser
} from 'discord.js';
import type { IAIService } from '../services/interfaces';
import { logger } from '../utils/logger';
import { splitMessage } from '../utils/messageSplitter';
import { extractRecentEmojis, MessageContext } from '../commands';
import { RaceConditionManager } from '../utils/raceConditionManager';
import * as commandHandlers from './commandHandlers';

/**
 * Setup all Discord event handlers
 */
export function setupEventHandlers(
  client: Client,
  geminiService: IAIService,
  raceConditionManager: RaceConditionManager
): void {
  // Client ready event
  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
  });

  // Interaction create event (slash commands)
  client.on(Events.InteractionCreate, async (interaction) => {
    await handleInteractionCreate(interaction, geminiService, raceConditionManager);
  });

  // Message reaction add event
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    await handleMessageReactionAdd(reaction, user, client);
  });

  // Message create event (mentions)
  client.on(Events.MessageCreate, async (message) => {
    await handleMessageCreate(message, client, geminiService, raceConditionManager);
  });
}

/**
 * Handle interaction create events
 */
async function handleInteractionCreate(
  interaction: Interaction,
  geminiService: IAIService,
  raceConditionManager: RaceConditionManager
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  
  // Prevent concurrent command execution by same user
  const userMutex = raceConditionManager.getUserMutex(interaction.user.id);
  const release = await userMutex.acquire();
  
  try {
    switch (commandName) {
    case 'chat':
      await commandHandlers.handleChatCommand(interaction, geminiService);
      break;
    case 'status':
      await commandHandlers.handleStatusCommand(interaction, geminiService);
      break;
    case 'clear':
      await commandHandlers.handleClearCommand(interaction, geminiService);
      break;
    case 'remember':
      await commandHandlers.handleRememberCommand(interaction, geminiService);
      break;
    case 'addgag':
      await commandHandlers.handleAddGagCommand(interaction, geminiService);
      break;
    case 'setpersonality':
      await commandHandlers.handleSetPersonalityCommand(interaction, geminiService);
      break;
    case 'mypersonality':
      await commandHandlers.handleMyPersonalityCommand(interaction, geminiService);
      break;
    case 'getpersonality':
      await commandHandlers.handleGetPersonalityCommand(interaction, geminiService);
      break;
    case 'removepersonality':
      await commandHandlers.handleRemovePersonalityCommand(interaction, geminiService);
      break;
    case 'clearpersonality':
      await commandHandlers.handleClearPersonalityCommand(interaction, geminiService);
      break;
    case 'execute':
      await commandHandlers.handleExecuteCommand(interaction, geminiService);
      break;
    case 'contextstats':
      await commandHandlers.handleContextStatsCommand(interaction, geminiService);
      break;
    case 'summarize':
      await commandHandlers.handleSummarizeCommand(interaction, geminiService);
      break;
    case 'deduplicate':
      await commandHandlers.handleDeduplicateCommand(interaction, geminiService);
      break;
    case 'crossserver':
      await commandHandlers.handleCrossServerCommand(interaction, geminiService);
      break;
    case 'ascii':
      await commandHandlers.handleAsciiCommand(interaction, geminiService);
      break;
    default:
      await interaction.reply('Unknown command!');
    }
  } catch (error) {
    logger.error('Error handling interaction:', error);
    
    const errorMessage = 'There was an error while executing this command!';
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  } finally {
    release();
  }
}

/**
 * Handle message reaction add events
 */
async function handleMessageReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  client: Client
): Promise<void> {
  if (user.bot) return;
  
  // Check if this is a reaction to one of the bot's messages
  if (reaction.message.author?.id === client.user?.id) {
    const emoji = reaction.emoji.name;
    
    // Track particularly good roasts (looking for common reaction names)
    if (emoji === 'joy' || emoji === 'skull' || emoji === 'fire' || emoji === 'rofl' || emoji === '100') {
      logger.info(`Good roast detected! Emoji: ${emoji}, Message: ${reaction.message.content?.substring(0, 100)}...`);
    }
  }
}

/**
 * Handle message create events
 */
async function handleMessageCreate(
  message: Message,
  client: Client,
  geminiService: IAIService,
  raceConditionManager: RaceConditionManager
): Promise<void> {
  if (message.author.bot) return;
  
  if (message.mentions.users.has(client.user!.id)) {
    const messageKey = `${message.id}-${message.author.id}`;
    const channelKey = message.channel.id;
    const userKey = message.author.id;
    
    // Prevent duplicate processing
    if (raceConditionManager.hasProcessedMessage(messageKey)) {
      logger.debug(`Skipping duplicate message processing: ${messageKey}`);
      return;
    }
    
    raceConditionManager.markMessageProcessed(messageKey);
    
    // Ensure user has processing mutex
    const userMutex = raceConditionManager.getUserMutex(userKey);
    const release = await userMutex.acquire();
    
    try {
      const prompt = message.content.replace(`<@${client.user!.id}>`, '').trim();
      
      if (!prompt) {
        await message.reply('Hi! Please include a message after mentioning me.');
        return;
      }

      // Safe typing indicator management
      const startTyping = () => {
        // Type-safe typing indicator
        const typingChannel = message.channel as { sendTyping(): Promise<void> };
        raceConditionManager.startTyping(channelKey, typingChannel);
      };
      
      const stopTyping = () => {
        raceConditionManager.stopTyping(channelKey);
      };
      
      try {
        startTyping();
        
        // Build message context for enhanced awareness
        let messageContext: MessageContext | undefined;
        try {
          const channel = message.channel;
          let channelType = 'other';
          if (channel.type === ChannelType.GuildText) channelType = 'text';
          else if (channel.type === ChannelType.GuildVoice) channelType = 'voice';
          else if (channel.type === ChannelType.PublicThread) channelType = 'thread';
          else if (channel.type === ChannelType.PrivateThread) channelType = 'thread';
          else if (channel.type === ChannelType.DM) channelType = 'dm';
          
          messageContext = {
            channelName: 'name' in channel && channel.name ? String(channel.name) : 'DM',
            channelType: channelType,
            isThread: channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread,
            threadName: (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) && 'name' in channel && channel.name ? String(channel.name) : undefined,
            lastActivity: 'lastMessageAt' in channel && channel.lastMessageAt instanceof Date ? channel.lastMessageAt : new Date(),
            pinnedCount: 0, // Will be populated below
            attachments: message.attachments.map(a => a.contentType || 'unknown'),
            recentEmojis: await extractRecentEmojis(channel)
          };
          
          // Fetch pinned messages count if in a guild channel
          if ('messages' in channel && typeof channel.messages.fetchPinned === 'function') {
            try {
              const pins = await channel.messages.fetchPinned();
              if (messageContext) {
                messageContext.pinnedCount = pins.size;
              }
            } catch (err) {
              logger.debug('Failed to fetch pinned messages:', err);
            }
          }
        } catch (contextError) {
          logger.debug('Failed to build complete message context:', contextError);
        }
        
        // Create response callback for graceful degradation
        const respondCallback = async (responseText: string) => {
          if (responseText) {
            const chunks = splitMessage(responseText, 2000);
            
            // Send first chunk as reply
            await message.reply(chunks[0]);
            
            // Send remaining chunks as follow-ups
            for (let i = 1; i < chunks.length; i++) {
              // Type-safe channel send
              const sendableChannel = message.channel as { send(content: string): Promise<Message> };
              await sendableChannel.send(chunks[i]);
            }
          }
        };
        
        const response = await geminiService.generateResponse(
          prompt, 
          message.author.id, 
          message.guild?.id, 
          respondCallback, 
          messageContext, 
          message.member || undefined
        );
        
        stopTyping();
        
        // Only send response if it's not empty (empty means it was queued)
        if (response) {
          await respondCallback(response);
        }
      } catch (error) {
        stopTyping();
        logger.error('Error generating response for mention:', error);
        
        try {
          await message.reply('Sorry, I encountered an error while generating a response. Please try again later.');
        } catch (replyError) {
          logger.error('Failed to send error reply:', replyError);
        }
      }
    } catch (error) {
      logger.error('Error handling mention:', error);
    } finally {
      release();
    }
  }
}