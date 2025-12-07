/**
 * Command Handlers Module
 * Contains all slash command handler implementations with comprehensive error handling
 */

import { ChatInputCommandInteraction, ChannelType, GuildMember } from 'discord.js';
import type { IAIService } from '../services/interfaces';
import { logger } from '../utils/logger';
import { splitMessage } from '../utils/messageSplitter';
import { extractRecentEmojis, MessageContext } from '../commands';
import { globalPools } from '../utils/PromisePool';
import { enrichError, isRetryableError, getUserFriendlyMessage, createTimeoutPromise } from '../utils/ErrorHandlingUtils';

/**
 * Wraps command handlers with comprehensive error handling, timeout protection, and user-friendly error responses
 */
async function wrapCommandHandler(
  handler: (interaction: ChatInputCommandInteraction) => Promise<void>,
  interaction: ChatInputCommandInteraction,
  commandName: string,
  options: {
    timeout?: number;
    requiresDefer?: boolean;
    adminRequired?: boolean;
  } = {}
): Promise<void> {
  const requestId = `cmd_${interaction.id}_${Date.now()}`;
  const startTime = Date.now();
  const { timeout = 30000, requiresDefer = false, adminRequired = false } = options;
  
  try {
    // Check admin permissions if required
    if (adminRequired && !hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'This command requires administrator permissions.',
        ephemeral: true
      });
      return;
    }
    
    // Defer reply if required
    if (requiresDefer && !interaction.deferred && !interaction.replied) {
      await Promise.race([
        interaction.deferReply(),
        createTimeoutPromise(3000).then(() => {
          throw enrichError(new Error('Failed to defer reply'), {
            operation: 'deferReply',
            commandName,
            requestId
          });
        })
      ]);
    }
    
    // Execute handler with timeout protection
    await Promise.race([
      handler(interaction),
      createTimeoutPromise(timeout).then(() => {
        throw enrichError(new Error('Command execution timeout'), {
          operation: 'command.execute',
          commandName,
          timeout,
          requestId
        });
      })
    ]);
    
    // Track success metrics
    const duration = Date.now() - startTime;
    logger.info(`Command executed successfully: ${commandName}`, {
      commandName,
      duration,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      requestId
    });
    
  } catch (error) {
    const enrichedError = enrichError(error as Error, {
      commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      duration: Date.now() - startTime,
      requestId
    });
    
    logger.error('Command execution failed', {
      error: enrichedError,
      errorCategory: enrichedError.category,
      retryable: isRetryableError(enrichedError)
    });
    
    // Send user-friendly error response
    const errorMessage = getUserFriendlyMessage(enrichedError);
    try {
      if (interaction.deferred) {
        await interaction.editReply(errorMessage);
      } else if (!interaction.replied) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      logger.error('Failed to send error response', {
        error: replyError,
        originalError: enrichedError,
        commandName,
        requestId
      });
    }
    
    // Track error metrics
    try {
      logger.debug('Command error tracked', {
        commandName,
        error: enrichedError,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        requestId
      });
    } catch (trackingError) {
      logger.error('Failed to track command error', trackingError);
    }
  }
}

/**
 * Check if user has admin permissions
 */
function hasAdminPermissions(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.guild || !interaction.member) return false;
  
  // Check if user has Administrator permission or Manage Server permission
  const member = interaction.member;
  if (typeof member.permissions === 'string') return false;
  
  return member.permissions.has('Administrator') || member.permissions.has('ManageGuild');
}

/**
 * Handle /chat command - internal implementation
 */
async function handleChatCommandInternal(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
  const prompt = interaction.options.getString('message');
  
  if (!prompt) {
    throw enrichError(new Error('No message provided'), {
      category: 'VALIDATION' as const,
      operation: 'validatePrompt'
    });
  }

  try {
    // OPTIMIZED: Build message context with parallel operations
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
        
        // OPTIMIZATION: Parallel fetch for emojis and pinned messages
        const contextPromises: Promise<any>[] = [
          extractRecentEmojis(channel)
        ];
        
        // Add pinned messages fetch if applicable
        if ('messages' in channel && typeof channel.messages.fetchPinned === 'function') {
          contextPromises.push(
            channel.messages.fetchPinned().catch(err => {
              logger.debug('Failed to fetch pinned messages:', err);
              return { size: 0 };
            })
          );
        }
        
        const [recentEmojis, pins] = await Promise.all(contextPromises);
        
        messageContext = {
          channelName: 'name' in channel && channel.name ? String(channel.name) : 'DM',
          channelType: channelType,
          isThread: channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread,
          threadName: (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) && 'name' in channel && channel.name ? String(channel.name) : undefined,
          lastActivity: 'lastMessageAt' in channel && channel.lastMessageAt instanceof Date ? channel.lastMessageAt : new Date(),
          pinnedCount: pins?.size || 0,
          attachments: [], // Slash commands don't have attachments in the same way
          recentEmojis
        };
      }
    } catch (contextError) {
      logger.debug('Failed to build message context for slash command:', contextError);
    }
    
    const response = await geminiService.generateResponse(
      prompt, 
      interaction.user.id, 
      interaction.guildId || undefined, 
      undefined, 
      messageContext, 
      interaction.member as GuildMember | undefined
    );
    
    const chunks = splitMessage(response, 2000);
    
    // Send first chunk as initial reply
    await interaction.editReply(chunks[0]);
    
    // Send remaining chunks as follow-ups
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp(chunks[i]);
    }
  } catch (contextError) {
    logger.debug('Failed to build complete message context:', contextError);
    // Continue with limited context - this is not a critical failure
  }
}

/**
 * Handle /chat command with comprehensive error handling
 */
export async function handleChatCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
  await wrapCommandHandler(
    async (interaction: ChatInputCommandInteraction) => {
      await handleChatCommandInternal(interaction, geminiService);
    },
    interaction,
    'chat',
    { timeout: 60000, requiresDefer: true }
  );
}

/**
 * Handle /status command - internal implementation
 * OPTIMIZED: Parallel fetching of all statistics
 */
async function handleStatusCommandInternal(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
  // OPTIMIZATION: Fetch all stats in parallel
  const [quota, conversationStats, cacheStats, cachePerformance] = await Promise.all([
    Promise.resolve(geminiService.getRemainingQuota()),
    Promise.resolve(geminiService.getConversationStats()),
    Promise.resolve(geminiService.getCacheStats()),
    Promise.resolve(geminiService.getCachePerformance())
  ]);
    
  // Get current time and next reset times
  const now = new Date();
  const nextMinuteReset = new Date(now);
  nextMinuteReset.setMinutes(now.getMinutes() + 1, 0, 0);
  const nextDayReset = new Date(now);
  nextDayReset.setDate(now.getDate() + 1);
  nextDayReset.setHours(0, 0, 0, 0);
    
  const statusMessage = '**🤖 Bot Status**\n' +
      '📈 **API Usage:**\n' +
      `  - Minute remaining: ${quota.minuteRemaining}\n` +
      `  - Daily remaining: ${quota.dailyRemaining}\n` +
      `  - Minute resets: ${nextMinuteReset.toLocaleTimeString()}\n` +
      `  - Daily resets: ${nextDayReset.toLocaleString()}\n` +
      '\n💾 **Response Cache:**\n' +
      `  - API reduction: ${cachePerformance.reduction}%\n` +
      `  - Total hits: ${cacheStats.totalHits}\n` +
      `  - Total misses: ${cacheStats.totalMisses}\n` +
      `  - Avg lookup: ${cachePerformance.avgLookupTime}ms\n` +
      '\n🧠 **Conversation Memory:**\n' +
      `  - Active users: ${conversationStats.activeUsers}\n` +
      `  - Total messages: ${conversationStats.totalMessages}\n` +
      `  - Context size: ${(conversationStats.totalContextSize / 1024).toFixed(1)} KB\n` +
      `  - Session timeout: ${parseInt(process.env.CONVERSATION_TIMEOUT_MINUTES || '30')} minutes`;
      
  await interaction.reply({ content: statusMessage, flags: 64 }); // 64 = ephemeral flag
}

/**
 * Handle /status command with comprehensive error handling
 */
export async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
  await wrapCommandHandler(
    async (interaction: ChatInputCommandInteraction) => {
      await handleStatusCommandInternal(interaction, geminiService);
    },
    interaction,
    'status',
    { timeout: 15000 }
  );
}

/**
 * Handle /clear command - internal implementation
 */
async function handleClearCommandInternal(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
  const cleared = geminiService.clearUserConversation(interaction.user.id);
  
  // Also clear the cache when clearing conversation
  geminiService.clearCache();
  
  if (cleared) {
    await interaction.reply({ 
      content: 'Your conversation history and cache have been cleared. Starting fresh!', 
      flags: 64 // ephemeral flag
    });
  } else {
    await interaction.reply({ 
      content: 'You don\'t have any conversation history to clear. Cache has been cleared.', 
      flags: 64 // ephemeral flag
    });
  }
}

/**
 * Handle /clear command with comprehensive error handling
 */
export async function handleClearCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
  await wrapCommandHandler(
    async (interaction: ChatInputCommandInteraction) => {
      await handleClearCommandInternal(interaction, geminiService);
    },
    interaction,
    'clear',
    { timeout: 10000 }
  );
}

/**
 * Handle /remember command
 */
export async function handleRememberCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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

/**
 * Handle /addgag command
 */
export async function handleAddGagCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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

/**
 * Handle /setpersonality command
 */
export async function handleSetPersonalityCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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

/**
 * Handle /mypersonality command
 */
export async function handleMyPersonalityCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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

/**
 * Handle /getpersonality command
 */
export async function handleGetPersonalityCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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

/**
 * Handle /removepersonality command
 */
export async function handleRemovePersonalityCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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

/**
 * Handle /clearpersonality command
 */
export async function handleClearPersonalityCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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

/**
 * Handle /execute command
 * OPTIMIZED: Use promise pool for rate limiting
 */
export async function handleExecuteCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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
    
    // OPTIMIZATION: Use promise pool for Gemini API calls
    const response = await globalPools.gemini.execute(() => 
      geminiService.generateResponse(
        prompt, 
        interaction.user.id, 
        interaction.guildId || undefined, 
        undefined, 
        undefined, 
        interaction.member as GuildMember | undefined
      )
    );
    
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

/**
 * Handle /contextstats command
 * OPTIMIZED: Parallel stats fetching
 */
export async function handleContextStatsCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const contextManager = geminiService.getContextManager();
    
    // OPTIMIZATION: Fetch both stats in parallel
    const [stats, serverStats] = await Promise.all([
      Promise.resolve(contextManager.getMemoryStats()),
      Promise.resolve(contextManager.getServerCompressionStats(interaction.guildId))
    ]);
    
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

/**
 * Handle /summarize command
 */
export async function handleSummarizeCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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

/**
 * Handle /deduplicate command
 */
export async function handleDeduplicateCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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
    const result = contextManager.deduplicateServerContext(interaction.guildId);
    
    if (result.removed > 0) {
      await interaction.editReply(`✅ Deduplication completed! Removed ${result.removed} duplicate entries.`);
    } else {
      await interaction.editReply('✅ No duplicate entries found. Context is already clean!');
    }
  } catch (error) {
    logger.error('Error deduplicating context:', error);
    await interaction.editReply('❌ An error occurred during deduplication. Please try again later.');
  }
}

/**
 * Handle /crossserver command
 */
export async function handleCrossServerCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
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

/**
 * Handle /ascii command
 */
export async function handleAsciiCommand(
  interaction: ChatInputCommandInteraction,
  geminiService: IAIService
): Promise<void> {
  const prompt = interaction.options.getString('prompt', true);
  
  await interaction.deferReply();

  try {
    const asciiPrompt = `Create ASCII art of "${prompt}". Make it detailed and recognizable. Use only standard ASCII characters. Make it medium-sized (not too small, not too large). Focus on creating clear, recognizable shapes and patterns that represent "${prompt}".`;
    
    const response = await geminiService.generateResponse(
      asciiPrompt, 
      interaction.user.id, 
      interaction.guildId || undefined, 
      undefined, 
      undefined, 
      interaction.member as GuildMember | undefined
    );
    
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