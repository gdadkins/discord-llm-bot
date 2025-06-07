import { config } from 'dotenv';
import { Client, GatewayIntentBits, Events, ChatInputCommandInteraction, ChannelType, GuildMember } from 'discord.js';
import { Mutex } from 'async-mutex';
import { GeminiService } from './services/gemini';
import { logger } from './utils/logger';
import { registerCommands, extractRecentEmojis, MessageContext } from './commands';
import { splitMessage } from './utils/messageSplitter';

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

let geminiService: GeminiService;

// Race condition protection
const messageMutex = new Mutex();
const interactionMutex = new Mutex();
const typingIntervals = new Map<string, NodeJS.Timeout>();
const processedMessages = new Set<string>();
const userProcessingLocks = new Map<string, Mutex>();

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
  
  try {
    // Initialize Gemini service
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      logger.error('GOOGLE_API_KEY not found in environment variables');
      process.exit(1);
    }
    
    geminiService = new GeminiService(apiKey);
    await geminiService.initialize();
    
    // Set Discord client for system context awareness
    geminiService.setDiscordClient(readyClient);
    
    // Register slash commands
    await registerCommands(readyClient);
    
    logger.info('Bot is ready and commands are registered');
  } catch (error) {
    logger.error('Failed to initialize bot services:', error);
    process.exit(1);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const userKey = `${interaction.user.id}-${commandName}`;
  
  // Prevent concurrent command execution by same user
  if (!userProcessingLocks.has(interaction.user.id)) {
    userProcessingLocks.set(interaction.user.id, new Mutex());
  }
  
  const userMutex = userProcessingLocks.get(interaction.user.id)!;
  const release = await userMutex.acquire();
  
  const startTime = Date.now();
  let commandSuccessful = false;
  let commandError: string | undefined;
  
  try {
    switch (commandName) {
      case 'chat':
        await handleChatCommand(interaction);
        commandSuccessful = true;
        break;
      case 'status':
        await handleStatusCommand(interaction);
        commandSuccessful = true;
        break;
      case 'clear':
        await handleClearCommand(interaction);
        commandSuccessful = true;
        break;
      case 'remember':
        await handleRememberCommand(interaction);
        commandSuccessful = true;
        break;
      case 'addgag':
        await handleAddGagCommand(interaction);
        commandSuccessful = true;
        break;
      case 'setpersonality':
        await handleSetPersonalityCommand(interaction);
        commandSuccessful = true;
        break;
      case 'mypersonality':
        await handleMyPersonalityCommand(interaction);
        commandSuccessful = true;
        break;
      case 'getpersonality':
        await handleGetPersonalityCommand(interaction);
        commandSuccessful = true;
        break;
      case 'removepersonality':
        await handleRemovePersonalityCommand(interaction);
        commandSuccessful = true;
        break;
      case 'clearpersonality':
        await handleClearPersonalityCommand(interaction);
        commandSuccessful = true;
        break;
      case 'execute':
        await handleExecuteCommand(interaction);
        commandSuccessful = true;
        break;
      case 'contextstats':
        await handleContextStatsCommand(interaction);
        commandSuccessful = true;
        break;
      case 'summarize':
        await handleSummarizeCommand(interaction);
        commandSuccessful = true;
        break;
      case 'deduplicate':
        await handleDeduplicateCommand(interaction);
        commandSuccessful = true;
        break;
      case 'crossserver':
        await handleCrossServerCommand(interaction);
        commandSuccessful = true;
        break;
      case 'ascii':
        await handleAsciiCommand(interaction);
        commandSuccessful = true;
        break;
      default:
        await interaction.reply('Unknown command!');
        commandSuccessful = false;
        commandError = `Unknown command: ${commandName}`;
    }
  } catch (error) {
    commandSuccessful = false;
    commandError = error instanceof Error ? error.message : String(error);
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
});

// Track message reactions for learning
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  
  // Check if this is a reaction to one of the bot's messages
  if (reaction.message.author?.id === client.user?.id) {
    const emoji = reaction.emoji.name;
    
    // Track particularly good roasts (looking for common reaction names)
    if (emoji === 'joy' || emoji === 'skull' || emoji === 'fire' || emoji === 'rofl' || emoji === '100') {
      logger.info(`Good roast detected! Emoji: ${emoji}, Message: ${reaction.message.content?.substring(0, 100)}...`);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  
  if (message.mentions.users.has(client.user!.id)) {
    const messageKey = `${message.id}-${message.author.id}`;
    const channelKey = message.channel.id;
    const userKey = message.author.id;
    
    // Prevent duplicate processing
    if (processedMessages.has(messageKey)) {
      logger.debug(`Skipping duplicate message processing: ${messageKey}`);
      return;
    }
    
    processedMessages.add(messageKey);
    
    // Clean up old processed messages (keep last 1000)
    if (processedMessages.size > 1000) {
      const entries = Array.from(processedMessages);
      for (let i = 0; i < 500; i++) {
        processedMessages.delete(entries[i]);
      }
    }
    
    // Ensure user has processing mutex
    if (!userProcessingLocks.has(userKey)) {
      userProcessingLocks.set(userKey, new Mutex());
    }
    
    const userMutex = userProcessingLocks.get(userKey)!;
    const release = await userMutex.acquire();
    
    try {
      const prompt = message.content.replace(`<@${client.user!.id}>`, '').trim();
      
      if (!prompt) {
        await message.reply('Hi! Please include a message after mentioning me.');
        return;
      }

      // Safe typing indicator management
      const startTyping = () => {
        // Clear any existing typing for this channel
        const existingInterval = typingIntervals.get(channelKey);
        if (existingInterval) {
          clearInterval(existingInterval);
        }
        
        // Start typing immediately
        message.channel.sendTyping().catch(err => 
          logger.debug('Failed to send initial typing indicator:', err)
        );
        
        // Set up recurring typing
        const interval = setInterval(() => {
          message.channel.sendTyping().catch(err => 
            logger.debug('Failed to send typing indicator:', err)
          );
        }, 5000);
        
        typingIntervals.set(channelKey, interval);
        return interval;
      };
      
      const stopTyping = () => {
        const interval = typingIntervals.get(channelKey);
        if (interval) {
          clearInterval(interval);
          typingIntervals.delete(channelKey);
        }
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
              await message.channel.send(chunks[i]);
            }
          }
        };
        
        const response = await geminiService.generateResponse(prompt, message.author.id, message.guild?.id, respondCallback, messageContext, message.member || undefined);
        
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
});

async function handleChatCommand(interaction: ChatInputCommandInteraction) {
  const prompt = interaction.options.getString('message');
  
  if (!prompt) {
    await interaction.reply('Please provide a message!');
    return;
  }

  await interaction.deferReply();

  try {
    // Build message context for slash commands
    let messageContext: MessageContext | undefined;
    try {
      if (interaction.channel) {
        const channel = interaction.channel;
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
          pinnedCount: 0,
          attachments: [], // Slash commands don't have attachments in the same way
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
      }
    } catch (contextError) {
      logger.debug('Failed to build message context for slash command:', contextError);
    }
    
    const response = await geminiService.generateResponse(prompt, interaction.user.id, interaction.guildId || undefined, undefined, messageContext, interaction.member as GuildMember | undefined);
    
    const chunks = splitMessage(response, 2000);
    
    // Send first chunk as initial reply
    await interaction.editReply(chunks[0]);
    
    // Send remaining chunks as follow-ups
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp(chunks[i]);
    }
  } catch (error) {
    logger.error('Error generating response:', error);
    await interaction.editReply('Sorry, I encountered an error while generating a response. Please try again later.');
  }
}

async function handleStatusCommand(interaction: ChatInputCommandInteraction) {
  try {
    // Legacy stats for backward compatibility
    const quota = geminiService.getRemainingQuota();
    const conversationStats = geminiService.getConversationStats();
    const cacheStats = geminiService.getCacheStats();
    const cachePerformance = geminiService.getCachePerformance();
    
    // Get current time and next reset times
    const now = new Date();
    const nextMinuteReset = new Date(now);
    nextMinuteReset.setMinutes(now.getMinutes() + 1, 0, 0);
    const nextDayReset = new Date(now);
    nextDayReset.setDate(now.getDate() + 1);
    nextDayReset.setHours(0, 0, 0, 0);
    
    const statusMessage = `**🤖 Bot Status**\n` +
      `📈 **API Usage:**\n` +
      `  - Minute remaining: ${quota.minuteRemaining}\n` +
      `  - Daily remaining: ${quota.dailyRemaining}\n` +
      `  - Minute resets: ${nextMinuteReset.toLocaleTimeString()}\n` +
      `  - Daily resets: ${nextDayReset.toLocaleString()}\n` +
      `\n💾 **Response Cache:**\n` +
      `  - API reduction: ${cachePerformance.reduction}%\n` +
      `  - Total hits: ${cacheStats.totalHits}\n` +
      `  - Total misses: ${cacheStats.totalMisses}\n` +
      `  - Avg lookup: ${cachePerformance.avgLookupTime}ms\n` +
      `\n🧠 **Conversation Memory:**\n` +
      `  - Active users: ${conversationStats.activeUsers}\n` +
      `  - Total messages: ${conversationStats.totalMessages}\n` +
      `  - Context size: ${(conversationStats.totalContextSize / 1024).toFixed(1)} KB\n` +
      `  - Session timeout: ${parseInt(process.env.CONVERSATION_TIMEOUT_MINUTES || '30')} minutes`;
      
    await interaction.reply({ content: statusMessage, ephemeral: true });
  } catch (error) {
    logger.error('Error in status command:', error);
    await interaction.reply({ 
      content: 'Error retrieving status information. Check logs for details.', 
      ephemeral: true 
    });
  }
}


async function handleClearCommand(interaction: ChatInputCommandInteraction) {
  const cleared = geminiService.clearUserConversation(interaction.user.id);
  
  // Also clear the cache when clearing conversation
  geminiService.clearCache();
  
  if (cleared) {
    await interaction.reply({ 
      content: 'Your conversation history and cache have been cleared. Starting fresh!', 
      ephemeral: true 
    });
  } else {
    await interaction.reply({ 
      content: 'You don\'t have any conversation history to clear. Cache has been cleared.', 
      ephemeral: true 
    });
  }
}

async function handleRememberCommand(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser('user', true);
  const moment = interaction.options.getString('moment', true);
  
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command only works in servers!', ephemeral: true });
    return;
  }
  
  geminiService.addEmbarrassingMoment(interaction.guildId, targetUser.id, moment);
  
  await interaction.reply({ 
    content: `I'll remember that ${targetUser.username} ${moment}. This will come up later...`, 
    ephemeral: false 
  });
}


async function handleAddGagCommand(interaction: ChatInputCommandInteraction) {
  const gag = interaction.options.getString('gag', true);
  
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command only works in servers!', ephemeral: true });
    return;
  }
  
  geminiService.addRunningGag(interaction.guildId, gag);
  
  await interaction.reply({ 
    content: `Added to the server's running gags: "${gag}"`, 
    ephemeral: false 
  });
}

function hasAdminPermissions(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.guild || !interaction.member) return false;
  
  // Check if user has Administrator permission or Manage Server permission
  const member = interaction.member;
  if (typeof member.permissions === 'string') return false;
  
  return member.permissions.has('Administrator') || member.permissions.has('ManageGuild');
}

async function handleSetPersonalityCommand(interaction: ChatInputCommandInteraction) {
  // Admin-only command
  if (!hasAdminPermissions(interaction)) {
    await interaction.reply({ 
      content: 'You need Administrator or Manage Server permissions to use this command!', 
      ephemeral: true 
    });
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  const description = interaction.options.getString('description', true);

  const personalityManager = geminiService.getPersonalityManager();
  const result = await personalityManager.addPersonalityDescription(
    targetUser.id,
    description,
    interaction.user.id
  );

  await interaction.reply({ 
    content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`, 
    ephemeral: true 
  });
}

async function handleMyPersonalityCommand(interaction: ChatInputCommandInteraction) {
  const description = interaction.options.getString('description', true);

  const personalityManager = geminiService.getPersonalityManager();
  const result = await personalityManager.addPersonalityDescription(
    interaction.user.id,
    description,
    interaction.user.id
  );

  await interaction.reply({ 
    content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`, 
    ephemeral: true 
  });
}

async function handleGetPersonalityCommand(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  
  const personalityManager = geminiService.getPersonalityManager();
  const personality = personalityManager.getPersonality(targetUser.id);

  if (!personality || personality.descriptions.length === 0) {
    await interaction.reply({ 
      content: `${targetUser.id === interaction.user.id ? 'You have' : `${targetUser.username} has`} no personality descriptions set.`, 
      ephemeral: true 
    });
    return;
  }

  let message = `**Personality Profile for ${targetUser.username}:**\n\n`;
  
  personality.descriptions.forEach((description, index) => {
    message += `${index + 1}. ${description}\n`;
  });

  message += `\n*Last updated: ${new Date(personality.lastUpdated).toLocaleString()}*`;
  message += `\n*Total descriptions: ${personality.descriptions.length}*`;

  await interaction.reply({ content: message, ephemeral: true });
}

async function handleRemovePersonalityCommand(interaction: ChatInputCommandInteraction) {
  const description = interaction.options.getString('description', true);
  const targetUser = interaction.options.getUser('user') || interaction.user;

  // Check permissions if trying to modify someone else
  if (targetUser.id !== interaction.user.id && !hasAdminPermissions(interaction)) {
    await interaction.reply({ 
      content: 'You can only remove descriptions from your own personality profile!', 
      ephemeral: true 
    });
    return;
  }

  const personalityManager = geminiService.getPersonalityManager();
  const result = await personalityManager.removePersonalityDescription(
    targetUser.id,
    description,
    interaction.user.id
  );

  await interaction.reply({ 
    content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`, 
    ephemeral: true 
  });
}

async function handleClearPersonalityCommand(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;

  // Check permissions if trying to modify someone else
  if (targetUser.id !== interaction.user.id && !hasAdminPermissions(interaction)) {
    await interaction.reply({ 
      content: 'You can only clear your own personality profile!', 
      ephemeral: true 
    });
    return;
  }

  const personalityManager = geminiService.getPersonalityManager();
  const result = await personalityManager.clearPersonality(
    targetUser.id,
    interaction.user.id
  );

  await interaction.reply({ 
    content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`, 
    ephemeral: true 
  });
}

async function handleExecuteCommand(interaction: ChatInputCommandInteraction) {
  const code = interaction.options.getString('code', true);
  
  // Check if code execution is enabled
  if (process.env.ENABLE_CODE_EXECUTION !== 'true') {
    await interaction.reply({ 
      content: 'Code execution is not enabled. Set ENABLE_CODE_EXECUTION=true in your .env file to use this feature.', 
      ephemeral: true 
    });
    return;
  }

  await interaction.deferReply();

  try {
    // Format the prompt to request code execution
    const prompt = `Please execute the following Python code or solve this math problem:\n\n${code}\n\nIf this is a math problem, write Python code to solve it and show the result.`;
    
    const response = await geminiService.generateResponse(prompt, interaction.user.id, interaction.guildId || undefined, undefined, undefined, interaction.member as GuildMember | undefined);
    
    const chunks = splitMessage(response, 2000);
    
    // Send first chunk as initial reply
    await interaction.editReply(chunks[0]);
    
    // Send remaining chunks as follow-ups
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp(chunks[i]);
    }
  } catch (error) {
    logger.error('Error executing code:', error);
    await interaction.editReply('Sorry, I encountered an error while executing the code. Please try again later.');
  }
}

async function handleContextStatsCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const contextManager = geminiService.getContextManager();
    const stats = contextManager.getMemoryStats();
    const serverStats = contextManager.getServerCompressionStats(interaction.guildId);
    
    const embed = {
      title: '📊 Advanced Context Statistics',
      color: 0x00ff00,
      fields: [
        {
          name: '🌐 Global Statistics',
          value: `**Servers:** ${stats.totalServers}\n**Total Memory:** ${(stats.totalMemoryUsage / 1024).toFixed(2)}KB\n**Average Server Size:** ${(stats.averageServerSize / 1024).toFixed(2)}KB\n**Largest Server:** ${(stats.largestServerSize / 1024).toFixed(2)}KB`,
          inline: true
        },
        {
          name: '📈 Item Counts',
          value: `**Embarrassing Moments:** ${stats.itemCounts.embarrassingMoments}\n**Code Snippets:** ${stats.itemCounts.codeSnippets}\n**Running Gags:** ${stats.itemCounts.runningGags}\n**Summarized Facts:** ${stats.itemCounts.summarizedFacts}`,
          inline: true
        },
        {
          name: '🗜️ Compression Stats',
          value: `**Avg Compression:** ${(stats.compressionStats.averageCompressionRatio * 100).toFixed(1)}%\n**Memory Saved:** ${(stats.compressionStats.totalMemorySaved / 1024).toFixed(2)}KB\n**Duplicates Removed:** ${stats.compressionStats.duplicatesRemoved}`,
          inline: true
        }
      ],
      footer: { text: 'Memory optimization saves space while preserving conversation quality' }
    };

    if (serverStats) {
      embed.fields.push({
        name: '🏠 This Server',
        value: `**Compression Ratio:** ${(serverStats.compressionRatio * 100).toFixed(1)}%\n**Memory Saved:** ${(serverStats.memorySaved / 1024).toFixed(2)}KB`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error getting context stats:', error);
    await interaction.editReply('Sorry, I encountered an error while retrieving context statistics.');
  }
}

async function handleSummarizeCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
    return;
  }

  // Check if user has administrator permissions
  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.reply({ content: 'Only administrators can trigger manual summarization!', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const contextManager = geminiService.getContextManager();
    const success = contextManager.summarizeServerContextNow(interaction.guildId);
    
    if (success) {
      const stats = contextManager.getServerCompressionStats(interaction.guildId);
      const message = stats 
        ? `✅ Context summarization completed!\n**Compression ratio:** ${(stats.compressionRatio * 100).toFixed(1)}%\n**Memory saved:** ${(stats.memorySaved / 1024).toFixed(2)}KB`
        : '✅ Context summarization completed!';
      
      await interaction.editReply(message);
    } else {
      await interaction.editReply('❌ No context found for this server or summarization not needed.');
    }
  } catch (error) {
    logger.error('Error summarizing context:', error);
    await interaction.editReply('❌ An error occurred during summarization. Please try again later.');
  }
}

async function handleDeduplicateCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
    return;
  }

  // Check if user has administrator permissions
  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.reply({ content: 'Only administrators can trigger deduplication!', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const contextManager = geminiService.getContextManager();
    const removedCount = contextManager.deduplicateServerContext(interaction.guildId);
    
    if (removedCount > 0) {
      await interaction.editReply(`✅ Deduplication completed! Removed ${removedCount} duplicate entries.`);
    } else {
      await interaction.editReply('✅ No duplicate entries found. Context is already clean!');
    }
  } catch (error) {
    logger.error('Error deduplicating context:', error);
    await interaction.editReply('❌ An error occurred during deduplication. Please try again later.');
  }
}

async function handleCrossServerCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
    return;
  }

  // Check if user has administrator permissions
  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.reply({ content: 'Only administrators can manage cross-server context!', ephemeral: true });
    return;
  }

  const enabled = interaction.options.getBoolean('enabled', true);

  try {
    const contextManager = geminiService.getContextManager();
    contextManager.enableCrossServerContext(interaction.user.id, interaction.guildId, enabled);
    
    const status = enabled ? 'enabled' : 'disabled';
    const description = enabled 
      ? 'The bot can now reference your embarrassing moments and code from other servers! 😈'
      : 'Cross-server context sharing has been disabled for privacy.';
      
    await interaction.reply({
      content: `✅ Cross-server context sharing ${status}!\n${description}`,
      ephemeral: true
    });
  } catch (error) {
    logger.error('Error setting cross-server context:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while updating cross-server settings. Please try again later.',
      ephemeral: true 
    });
  }
}

async function handleAsciiCommand(interaction: ChatInputCommandInteraction) {
  const prompt = interaction.options.getString('prompt', true);
  
  await interaction.deferReply();

  try {
    const asciiPrompt = `Create ASCII art of "${prompt}". Make it detailed and recognizable. Use only standard ASCII characters. Make it medium-sized (not too small, not too large). Focus on creating clear, recognizable shapes and patterns that represent "${prompt}".`;
    
    const response = await geminiService.generateResponse(asciiPrompt, interaction.user.id, interaction.guildId || undefined, undefined, undefined, interaction.member as GuildMember | undefined);
    
    // Wrap in code block to preserve ASCII formatting
    const formattedResponse = `Here's your ASCII art of **${prompt}**:\n\`\`\`\n${response}\n\`\`\``;
    
    const chunks = splitMessage(formattedResponse, 2000);
    
    // Send first chunk as initial reply
    await interaction.editReply(chunks[0]);
    
    // Send remaining chunks as follow-ups
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp(chunks[i]);
    }
  } catch (error) {
    logger.error('Error generating ASCII art:', error);
    await interaction.editReply('Sorry, I encountered an error while generating ASCII art. Please try again later.');
  }
}


// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Cleanup function for race condition resources
function cleanupRaceConditionResources() {
  // Clear all typing intervals
  for (const [channelId, interval] of typingIntervals) {
    clearInterval(interval);
    logger.debug(`Cleared typing interval for channel: ${channelId}`);
  }
  typingIntervals.clear();
  
  // Clear processed messages cache
  processedMessages.clear();
  
  // Clear user processing locks
  userProcessingLocks.clear();
  
  logger.info('Race condition resources cleaned up');
}

// Graceful shutdown handler
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  cleanupRaceConditionResources();
  if (geminiService) {
    await geminiService.shutdown();
  }
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  cleanupRaceConditionResources();
  if (geminiService) {
    await geminiService.shutdown();
  }
  await client.destroy();
  process.exit(0);
});

// Login to Discord
const token = process.env.DISCORD_TOKEN;
if (!token) {
  logger.error('DISCORD_TOKEN not found in environment variables');
  process.exit(1);
}

client.login(token);