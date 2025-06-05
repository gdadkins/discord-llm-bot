import { config } from 'dotenv';
import { Client, GatewayIntentBits, Events, ChatInputCommandInteraction } from 'discord.js';
import { GeminiService } from './services/gemini';
import { logger } from './utils/logger';
import { registerCommands } from './commands';
import { splitMessage } from './utils/messageSplitter';

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let geminiService: GeminiService;

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
  
  // Initialize Gemini service
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error('GOOGLE_API_KEY not found in environment variables');
    process.exit(1);
  }
  
  geminiService = new GeminiService(apiKey);
  await geminiService.initialize();
  
  // Register slash commands
  await registerCommands(readyClient);
  
  logger.info('Bot is ready and commands are registered');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'chat':
        await handleChatCommand(interaction);
        break;
      case 'status':
        await handleStatusCommand(interaction);
        break;
      case 'clear':
        await handleClearCommand(interaction);
        break;
      case 'remember':
        await handleRememberCommand(interaction);
        break;
      case 'addgag':
        await handleAddGagCommand(interaction);
        break;
      case 'setpersonality':
        await handleSetPersonalityCommand(interaction);
        break;
      case 'mypersonality':
        await handleMyPersonalityCommand(interaction);
        break;
      case 'getpersonality':
        await handleGetPersonalityCommand(interaction);
        break;
      case 'removepersonality':
        await handleRemovePersonalityCommand(interaction);
        break;
      case 'clearpersonality':
        await handleClearPersonalityCommand(interaction);
        break;
      case 'execute':
        await handleExecuteCommand(interaction);
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
      // Could store this for future reference
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  
  if (message.mentions.users.has(client.user!.id)) {
    try {
      const prompt = message.content.replace(`<@${client.user!.id}>`, '').trim();
      
      if (!prompt) {
        await message.reply('Hi! Please include a message after mentioning me.');
        return;
      }

      let typingInterval: NodeJS.Timeout | null = null;
      
      try {
        typingInterval = setInterval(() => {
          message.channel.sendTyping();
        }, 5000);

        await message.channel.sendTyping();
        const response = await geminiService.generateResponse(prompt, message.author.id, message.guild?.id);
        
        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }
        
        const chunks = splitMessage(response, 2000);
        
        // Send first chunk as reply
        await message.reply(chunks[0]);
        
        // Send remaining chunks as follow-ups
        for (let i = 1; i < chunks.length; i++) {
          await message.channel.send(chunks[i]);
        }
      } catch (error) {
        if (typingInterval) {
          clearInterval(typingInterval);
        }
        logger.error('Error generating response for mention:', error);
        await message.reply('Sorry, I encountered an error while generating a response. Please try again later.');
      }
    } catch (error) {
      logger.error('Error handling mention:', error);
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
    const response = await geminiService.generateResponse(prompt, interaction.user.id, interaction.guildId || undefined);
    
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
  const quota = geminiService.getRemainingQuota();
  const conversationStats = geminiService.getConversationStats();
  
  // Calculate usage from remaining quotas
  const rpmLimit = Math.floor((parseInt(process.env.GEMINI_RATE_LIMIT_RPM || '10')) * 0.9);
  const dailyLimit = Math.floor((parseInt(process.env.GEMINI_RATE_LIMIT_DAILY || '500')) * 0.9);
  const usedThisMinute = rpmLimit - quota.minuteRemaining;
  const usedToday = dailyLimit - quota.dailyRemaining;
  
  // Get current time and next reset times
  const now = new Date();
  const nextMinuteReset = new Date(now);
  nextMinuteReset.setMinutes(now.getMinutes() + 1, 0, 0);
  const nextDayReset = new Date(now);
  nextDayReset.setDate(now.getDate() + 1);
  nextDayReset.setHours(0, 0, 0, 0);
  
  const statusMessage = `**Bot Status**\n` +
    `Bot: Online\n` +
    `Current time: ${now.toLocaleString()}\n` +
    `\n**API Usage:**\n` +
    `  - This minute: ${usedThisMinute}/${rpmLimit} (${quota.minuteRemaining} remaining)\n` +
    `  - Today: ${usedToday}/${dailyLimit} (${quota.dailyRemaining} remaining)\n` +
    `  - Minute resets: ${nextMinuteReset.toLocaleTimeString()}\n` +
    `  - Daily resets: ${nextDayReset.toLocaleString()}\n` +
    `\n**Conversation Memory:**\n` +
    `  - Active users: ${conversationStats.activeUsers}\n` +
    `  - Total messages: ${conversationStats.totalMessages}\n` +
    `  - Context size: ${(conversationStats.totalContextSize / 1024).toFixed(1)} KB\n` +
    `  - Session timeout: ${parseInt(process.env.CONVERSATION_TIMEOUT_MINUTES || '30')} minutes\n` +
    `  - Max messages: ${process.env.MAX_CONVERSATION_MESSAGES || '100'} per user`;
    
  await interaction.reply({ content: statusMessage, ephemeral: true });
}

async function handleClearCommand(interaction: ChatInputCommandInteraction) {
  const cleared = geminiService.clearUserConversation(interaction.user.id);
  
  if (cleared) {
    await interaction.reply({ 
      content: 'Your conversation history has been cleared. Starting fresh!', 
      ephemeral: true 
    });
  } else {
    await interaction.reply({ 
      content: 'You don\'t have any conversation history to clear.', 
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
    
    const response = await geminiService.generateResponse(prompt, interaction.user.id, interaction.guildId || undefined);
    
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


// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Graceful shutdown handler
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  if (geminiService) {
    geminiService.shutdown();
  }
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  if (geminiService) {
    geminiService.shutdown();
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