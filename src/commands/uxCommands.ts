import { ChatInputCommandInteraction, EmbedBuilder, ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger';
import { UserPreferenceManager, ScheduledCommand } from '../services/preferences';
import { HelpSystem } from '../services/help/HelpSystem';
import { splitMessage } from '../utils/messageSplitter';
import { VideoConfiguration, VideoProcessingEstimator, VideoUXHelper } from '../services/multimodal/processors/VideoUtils';

export class UXCommandHandlers {
  constructor(
    private userPreferenceManager: UserPreferenceManager,
    private helpSystem: HelpSystem,
    private videoConfig?: VideoConfiguration
  ) {}

  // Preferences Commands
  async handlePreferencesCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const serverId = interaction.guildId || 'dm';

    switch (subcommand) {
    case 'view':
      await this.handlePreferencesView(interaction, userId, serverId);
      break;
    case 'set':
      await this.handlePreferencesSet(interaction, userId, serverId);
      break;
    case 'reset':
      await this.handlePreferencesReset(interaction, userId, serverId);
      break;
    }
  }

  private async handlePreferencesView(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const preferences = await this.userPreferenceManager.getUserPreferencesForServer(userId, serverId);
      
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Your Preferences')
        .setColor(0x0099FF)
        .setTimestamp();

      const prefs = preferences.preferences;
      embed.addFields(
        { name: '🎭 Default Personality', value: prefs.defaultPersonality, inline: true },
        { name: '📝 Response Style', value: prefs.preferredResponseStyle, inline: true },
        { name: '💻 Code Execution', value: prefs.enableCodeExecution ? 'Enabled' : 'Disabled', inline: true },
        { name: '📋 Structured Output', value: prefs.enableStructuredOutput ? 'Enabled' : 'Disabled', inline: true },
        { name: '🌍 Timezone', value: prefs.timezone, inline: true },
        { name: '📚 Command History', value: prefs.commandHistory ? 'Enabled' : 'Disabled', inline: true },
        { name: '✨ Autocomplete', value: prefs.autocompleteEnabled ? 'Enabled' : 'Disabled', inline: true },
        { name: '🌐 Language', value: prefs.preferredLanguage, inline: true },
        { name: '📊 Max History Size', value: prefs.maxHistorySize.toString(), inline: true }
      );

      embed.addFields(
        { name: '📅 Created', value: new Date(preferences.createdAt).toLocaleString(), inline: true },
        { name: '🔄 Last Updated', value: new Date(preferences.lastUpdated).toLocaleString(), inline: true }
      );

      embed.setFooter({ text: 'Use /preferences set to modify these settings' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error('Error in preferences view:', error);
      await interaction.reply({ content: 'Error retrieving preferences.', ephemeral: true });
    }
  }

  private async handlePreferencesSet(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const key = interaction.options.getString('key', true);
      const value = interaction.options.getString('value', true);

      // Convert string values to appropriate types
      let convertedValue: string | number | boolean = value;
      if (value === 'true') convertedValue = true;
      else if (value === 'false') convertedValue = false;
      else if (!isNaN(Number(value))) convertedValue = Number(value);

      const success = await this.userPreferenceManager.updatePreference(
        userId, 
        serverId, 
        key as 'defaultPersonality' | 'preferredResponseStyle' | 'enableCodeExecution' | 'enableStructuredOutput' | 'timezone' | 'commandHistory' | 'autocompleteEnabled' | 'preferredLanguage' | 'maxHistorySize' | 'enableNotifications', 
        convertedValue
      );

      if (success) {
        await interaction.reply({ 
          content: `✅ Updated **${key}** to **${value}**`, 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: `❌ Invalid preference key: **${key}**`, 
          ephemeral: true 
        });
      }
    } catch (error) {
      logger.error('Error in preferences set:', error);
      await interaction.reply({ content: 'Error updating preference.', ephemeral: true });
    }
  }

  private async handlePreferencesReset(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      // Create new default preferences by setting userId and serverId
      await this.userPreferenceManager.setUserPreferencesForServer(userId, serverId, {
        preferences: {
          defaultPersonality: 'helpful' as const,
          preferredResponseStyle: 'detailed' as const,
          enableCodeExecution: false,
          enableStructuredOutput: false,
          timezone: 'UTC',
          commandHistory: true,
          autocompleteEnabled: true,
          preferredLanguage: 'en',
          maxHistorySize: 50,
          enableNotifications: true,
        }
      });

      await interaction.reply({ 
        content: '✅ All preferences have been reset to defaults.', 
        ephemeral: true 
      });
    } catch (error) {
      logger.error('Error in preferences reset:', error);
      await interaction.reply({ content: 'Error resetting preferences.', ephemeral: true });
    }
  }

  // Alias Commands
  async handleAliasCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const serverId = interaction.guildId || 'dm';

    switch (subcommand) {
    case 'list':
      await this.handleAliasList(interaction, userId, serverId);
      break;
    case 'add':
      await this.handleAliasAdd(interaction, userId, serverId);
      break;
    case 'remove':
      await this.handleAliasRemove(interaction, userId, serverId);
      break;
    }
  }

  private async handleAliasList(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const preferences = await this.userPreferenceManager.getUserPreferencesForServer(userId, serverId);
      const aliases = preferences.commandAliases;

      if (Object.keys(aliases).length === 0) {
        await interaction.reply({ 
          content: 'You don\'t have any command aliases set. Use `/alias add` to create some!', 
          ephemeral: true 
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('⚡ Your Command Aliases')
        .setColor(0x00AE86)
        .setTimestamp();

      const aliasText = Object.entries(aliases)
        .map(([alias, command]) => `**${alias}** → \`${command}\``)
        .join('\n');

      embed.setDescription(aliasText);
      embed.setFooter({ text: `Total aliases: ${Object.keys(aliases).length}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error('Error in alias list:', error);
      await interaction.reply({ content: 'Error retrieving aliases.', ephemeral: true });
    }
  }

  private async handleAliasAdd(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const alias = interaction.options.getString('alias', true);
      const command = interaction.options.getString('command', true);

      // Validate alias name
      if (alias.includes(' ') || alias.length < 1 || alias.length > 20) {
        await interaction.reply({ 
          content: '❌ Alias must be 1-20 characters with no spaces.', 
          ephemeral: true 
        });
        return;
      }

      const success = await this.userPreferenceManager.setCommandAlias(userId, serverId, alias, command);

      if (success) {
        await interaction.reply({ 
          content: `✅ Created alias **${alias}** → \`${command}\``, 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: `❌ Cannot create alias **${alias}** - it conflicts with an existing command.`, 
          ephemeral: true 
        });
      }
    } catch (error) {
      logger.error('Error in alias add:', error);
      await interaction.reply({ content: 'Error creating alias.', ephemeral: true });
    }
  }

  private async handleAliasRemove(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const alias = interaction.options.getString('alias', true);

      const success = await this.userPreferenceManager.removeCommandAlias(userId, serverId, alias);

      if (success) {
        await interaction.reply({ 
          content: `✅ Removed alias **${alias}**`, 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: `❌ Alias **${alias}** not found.`, 
          ephemeral: true 
        });
      }
    } catch (error) {
      logger.error('Error in alias remove:', error);
      await interaction.reply({ content: 'Error removing alias.', ephemeral: true });
    }
  }

  // History Commands
  async handleHistoryCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const serverId = interaction.guildId || 'dm';

    switch (subcommand) {
    case 'view':
      await this.handleHistoryView(interaction, userId, serverId);
      break;
    case 'replay':
      await this.handleHistoryReplay(interaction, userId, serverId);
      break;
    case 'clear':
      await this.handleHistoryClear(interaction, userId, serverId);
      break;
    }
  }

  private async handleHistoryView(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const limit = interaction.options.getInteger('limit') || 10;
      const history = await this.userPreferenceManager.getCommandHistory(userId, serverId, limit);

      if (history.length === 0) {
        await interaction.reply({ 
          content: 'No command history found. History tracking might be disabled in your preferences.', 
          ephemeral: true 
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📚 Command History')
        .setColor(0x9932CC)
        .setTimestamp();

      const historyText = history
        .slice(0, limit)
        .map((entry, index) => {
          const timestamp = new Date(entry.timestamp).toLocaleString();
          const status = entry.successful ? '✅' : '❌';
          const duration = `${entry.duration}ms`;
          return `**${index + 1}.** ${status} \`${entry.command}\` (${duration})\n    *${timestamp}* - ID: \`${entry.id.slice(-8)}\``;
        })
        .join('\n\n');

      // Handle Discord field limit
      if (historyText.length > 4000) {
        const chunks = splitMessage(historyText, 4000);
        embed.setDescription(chunks[0]);
        
        if (chunks.length > 1) {
          embed.setFooter({ text: `Showing first ${Math.floor(limit / 2)} entries due to length limits` });
        }
      } else {
        embed.setDescription(historyText);
      }

      embed.setFooter({ text: `Showing ${Math.min(limit, history.length)} of ${history.length} commands` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error('Error in history view:', error);
      await interaction.reply({ content: 'Error retrieving command history.', ephemeral: true });
    }
  }

  private async handleHistoryReplay(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const commandId = interaction.options.getString('command_id', true);
      const history = await this.userPreferenceManager.getCommandHistory(userId, serverId);
      
      const entry = history.find(h => h.id.includes(commandId) || h.id === commandId);
      
      if (!entry) {
        await interaction.reply({ 
          content: `❌ Command with ID **${commandId}** not found in your history.`, 
          ephemeral: true 
        });
        return;
      }

      // For now, just show what would be replayed
      // In a full implementation, this would actually execute the command
      const embed = new EmbedBuilder()
        .setTitle('🔄 Command Replay')
        .setColor(0xFF6B6B)
        .setDescription(`Would replay: \`${entry.command}\``)
        .addFields(
          { name: 'Original Timestamp', value: new Date(entry.timestamp).toLocaleString(), inline: true },
          { name: 'Command ID', value: entry.id, inline: true },
          { name: 'Previous Result', value: entry.successful ? 'Success' : 'Failed', inline: true }
        );

      if (entry.errorMessage) {
        embed.addFields({ name: 'Previous Error', value: entry.errorMessage, inline: false });
      }

      embed.setFooter({ text: 'Note: Command replay is not yet fully implemented' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error('Error in history replay:', error);
      await interaction.reply({ content: 'Error replaying command.', ephemeral: true });
    }
  }

  private async handleHistoryClear(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      await this.userPreferenceManager.clearCommandHistory(userId, serverId);
      await interaction.reply({ 
        content: '✅ Command history cleared.', 
        ephemeral: true 
      });
    } catch (error) {
      logger.error('Error in history clear:', error);
      await interaction.reply({ content: 'Error clearing command history.', ephemeral: true });
    }
  }

  // Schedule Commands
  async handleScheduleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const serverId = interaction.guildId || 'dm';

    switch (subcommand) {
    case 'add':
      await this.handleScheduleAdd(interaction, userId, serverId);
      break;
    case 'list':
      await this.handleScheduleList(interaction, userId, serverId);
      break;
    case 'remove':
      await this.handleScheduleRemove(interaction, userId, serverId);
      break;
    }
  }

  private async handleScheduleAdd(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const command = interaction.options.getString('command', true);
      const timeStr = interaction.options.getString('time', true);
      const recurring = interaction.options.getString('recurring') || 'none';

      // Parse time string (basic implementation)
      const scheduledTime = this.parseTimeString(timeStr);
      if (!scheduledTime) {
        await interaction.reply({ 
          content: '❌ Invalid time format. Use formats like "2h", "30m", "tomorrow 9am"', 
          ephemeral: true 
        });
        return;
      }

      const scheduledCommand: ScheduledCommand = {
        id: `sched-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        command,
        arguments: {},
        scheduledTime,
        recurring: recurring === 'none' ? undefined : recurring as 'daily' | 'weekly' | 'monthly',
        enabled: true,
        createdAt: Date.now(),
        nextExecution: scheduledTime,
      };

      const success = await this.userPreferenceManager.scheduleCommand(userId, serverId, scheduledCommand);

      if (success) {
        const timeDisplay = new Date(scheduledTime).toLocaleString();
        await interaction.reply({ 
          content: `✅ Scheduled command \`${command}\` for ${timeDisplay}${recurring !== 'none' ? ` (${recurring})` : ''}`, 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: '❌ Failed to schedule command. You may have reached the maximum limit.', 
          ephemeral: true 
        });
      }
    } catch (error) {
      logger.error('Error in schedule add:', error);
      await interaction.reply({ content: 'Error scheduling command.', ephemeral: true });
    }
  }

  private async handleScheduleList(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const scheduled = this.userPreferenceManager.getScheduledCommands(userId, serverId);

      if (scheduled.length === 0) {
        await interaction.reply({ 
          content: 'No scheduled commands found. Use `/schedule add` to create some!', 
          ephemeral: true 
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('⏰ Scheduled Commands')
        .setColor(0xFFB347)
        .setTimestamp();

      const scheduledText = scheduled
        .map((cmd, index) => {
          const nextExec = new Date(cmd.nextExecution).toLocaleString();
          const status = cmd.enabled ? '🟢' : '🔴';
          const recurring = cmd.recurring ? ` (${cmd.recurring})` : '';
          return `**${index + 1}.** ${status} \`${cmd.command}\`${recurring}\n    Next: ${nextExec}\n    ID: \`${cmd.id.slice(-8)}\``;
        })
        .join('\n\n');

      embed.setDescription(scheduledText);
      embed.setFooter({ text: `Total scheduled: ${scheduled.length}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error('Error in schedule list:', error);
      await interaction.reply({ content: 'Error retrieving scheduled commands.', ephemeral: true });
    }
  }

  private async handleScheduleRemove(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const commandId = interaction.options.getString('command_id', true);

      const success = await this.userPreferenceManager.removeScheduledCommand(userId, serverId, commandId);

      if (success) {
        await interaction.reply({ 
          content: `✅ Removed scheduled command **${commandId}**`, 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: `❌ Scheduled command **${commandId}** not found.`, 
          ephemeral: true 
        });
      }
    } catch (error) {
      logger.error('Error in schedule remove:', error);
      await interaction.reply({ content: 'Error removing scheduled command.', ephemeral: true });
    }
  }

  // Bulk Commands
  async handleBulkCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const serverId = interaction.guildId || 'dm';

    switch (subcommand) {
    case 'create':
      await this.handleBulkCreate(interaction, userId, serverId);
      break;
    case 'status':
      await this.handleBulkStatus(interaction, userId, serverId);
      break;
    case 'cancel':
      await this.handleBulkCancel(interaction, userId, serverId);
      break;
    }
  }

  private async handleBulkCreate(interaction: ChatInputCommandInteraction, userId: string, serverId: string): Promise<void> {
    try {
      const commandsJson = interaction.options.getString('commands', true);
      
      let commands;
      try {
        commands = JSON.parse(commandsJson);
      } catch {
        await interaction.reply({ 
          content: '❌ Invalid JSON format. Example: `[{"command":"status","arguments":{}}]`', 
          ephemeral: true 
        });
        return;
      }

      if (!Array.isArray(commands) || commands.length === 0) {
        await interaction.reply({ 
          content: '❌ Commands must be a non-empty array.', 
          ephemeral: true 
        });
        return;
      }

      if (commands.length > 20) {
        await interaction.reply({ 
          content: '❌ Maximum 20 commands per bulk operation.', 
          ephemeral: true 
        });
        return;
      }

      const operationId = await this.userPreferenceManager.createBulkOperation(userId, serverId, commands);

      await interaction.reply({ 
        content: `✅ Created bulk operation **${operationId}** with ${commands.length} commands.\nUse \`/bulk status operation_id:${operationId}\` to check progress.`, 
        ephemeral: true 
      });

      // Start executing the bulk operation in the background
      // This would need to be integrated with the main command execution system
      this.executeBulkOperationAsync(operationId);
    } catch (error) {
      logger.error('Error in bulk create:', error);
      await interaction.reply({ content: 'Error creating bulk operation.', ephemeral: true });
    }
  }

  private async handleBulkStatus(interaction: ChatInputCommandInteraction, _userId: string, _serverId: string): Promise<void> {
    try {
      const operationId = interaction.options.getString('operation_id', true);
      const operation = this.userPreferenceManager.getBulkOperation(operationId);

      if (!operation) {
        await interaction.reply({ 
          content: `❌ Bulk operation **${operationId}** not found.`, 
          ephemeral: true 
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📦 Bulk Operation Status')
        .setColor(operation.status === 'completed' ? 0x00FF00 : operation.status === 'failed' ? 0xFF0000 : 0xFFB347)
        .addFields(
          { name: 'Operation ID', value: operation.id, inline: true },
          { name: 'Status', value: operation.status.toUpperCase(), inline: true },
          { name: 'Commands', value: operation.commands.length.toString(), inline: true }
        );

      if (operation.status === 'running' || operation.status === 'completed') {
        const completed = operation.results.length;
        const successful = operation.results.filter(r => r.success).length;
        
        embed.addFields(
          { name: 'Progress', value: `${completed}/${operation.commands.length}`, inline: true },
          { name: 'Successful', value: successful.toString(), inline: true },
          { name: 'Failed', value: (completed - successful).toString(), inline: true }
        );
      }

      if (operation.startedAt) {
        embed.addFields({ name: 'Started', value: new Date(operation.startedAt).toLocaleString(), inline: true });
      }

      if (operation.completedAt) {
        embed.addFields({ name: 'Completed', value: new Date(operation.completedAt).toLocaleString(), inline: true });
        const duration = operation.completedAt - (operation.startedAt || operation.createdAt);
        embed.addFields({ name: 'Duration', value: `${Math.round(duration / 1000)}s`, inline: true });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error('Error in bulk status:', error);
      await interaction.reply({ content: 'Error retrieving bulk operation status.', ephemeral: true });
    }
  }

  private async handleBulkCancel(interaction: ChatInputCommandInteraction, _userId: string, _serverId: string): Promise<void> {
    try {
      const operationId = interaction.options.getString('operation_id', true);
      
      // This is a placeholder - full implementation would need integration with execution system
      await interaction.reply({ 
        content: `⚠️ Bulk operation cancellation not yet fully implemented for **${operationId}**`, 
        ephemeral: true 
      });
    } catch (error) {
      logger.error('Error in bulk cancel:', error);
      await interaction.reply({ content: 'Error canceling bulk operation.', ephemeral: true });
    }
  }

  // Help Commands
  async handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const command = interaction.options.getString('command');
      const topic = interaction.options.getString('topic');

      if (command) {
        await this.handleCommandHelp(interaction, command);
      } else if (topic) {
        await this.handleTopicHelp(interaction, topic);
      } else {
        await this.handleGeneralHelp(interaction);
      }
    } catch (error) {
      logger.error('Error in help command:', error);
      await interaction.reply({ content: 'Error retrieving help information.', ephemeral: true });
    }
  }

  private async handleCommandHelp(interaction: ChatInputCommandInteraction, commandName: string): Promise<void> {
    const commandHelp = this.helpSystem.getCommandHelp(commandName);
    
    if (!commandHelp) {
      await interaction.reply({ 
        content: `❌ No help found for command **${commandName}**. Use \`/help\` to see all available commands.`, 
        ephemeral: true 
      });
      return;
    }

    const embed = this.helpSystem.createCommandEmbed(commandName);
    const components = this.helpSystem.createNavigationButtons('command', commandName);

    if (!embed) {
      await interaction.reply({ 
        content: `❌ Could not create help embed for command **${commandName}**.`, 
        ephemeral: true 
      });
      return;
    }

    await interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  private async handleTopicHelp(interaction: ChatInputCommandInteraction, topicId: string): Promise<void> {
    const topic = this.helpSystem.getHelpTopic(topicId);
    
    if (!topic) {
      await interaction.reply({ 
        content: `❌ No help found for topic **${topicId}**. Use \`/help\` to see all available topics.`, 
        ephemeral: true 
      });
      return;
    }

    const embed = this.helpSystem.createTopicEmbed(topicId);
    const components = this.helpSystem.createNavigationButtons('topic', topicId);

    if (!embed) {
      await interaction.reply({ 
        content: `❌ Could not create help embed for topic **${topicId}**.`, 
        ephemeral: true 
      });
      return;
    }

    await interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  private async handleGeneralHelp(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = this.helpSystem.createGeneralHelpEmbed();
    const components = this.helpSystem.createNavigationButtons('general');

    await interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  // Handle button interactions for help navigation
  async handleHelpButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    try {
      const customId = interaction.customId;

      if (customId === 'help-back') {
        const embed = this.helpSystem.createGeneralHelpEmbed();
        const components = this.helpSystem.createNavigationButtons('general');
        await interaction.update({ embeds: [embed], components });
      } else if (customId.startsWith('help-topic-')) {
        const topicId = customId.replace('help-topic-', '');
        const topic = this.helpSystem.getHelpTopic(topicId);
        
        if (topic) {
          const embed = this.helpSystem.createTopicEmbed(topicId);
          const components = this.helpSystem.createNavigationButtons('topic', topicId);
          if (embed) {
            await interaction.update({ embeds: [embed], components });
          }
        }
      }
    } catch (error) {
      logger.error('Error in help button interaction:', error);
      await interaction.reply({ content: 'Error updating help display.', ephemeral: true });
    }
  }

  // Helper Methods
  private parseTimeString(timeStr: string): number | null {
    const now = Date.now();
    
    // Handle relative time formats like "2h", "30m"
    const relativeMatch = timeStr.match(/^(\d+)([hm])$/);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2];
      
      if (unit === 'h') {
        return now + (amount * 60 * 60 * 1000);
      } else if (unit === 'm') {
        return now + (amount * 60 * 1000);
      }
    }

    // For more complex time parsing, you would use a library like chrono-node
    // For now, return null for unsupported formats
    return null;
  }

  private async executeBulkOperationAsync(operationId: string): Promise<void> {
    // This is a placeholder - full implementation would need integration with main command system
    logger.info(`Starting bulk operation execution: ${operationId}`);
    
    // Simulate execution delay
    setTimeout(() => {
      logger.info(`Bulk operation ${operationId} execution completed (simulated)`);
    }, 5000);
  }

  // Video Processing Commands
  async handleVideoConfirmation(
    interaction: ChatInputCommandInteraction,
    videoFile: { name: string; size: number },
    estimatedDuration: number
  ): Promise<void> {
    try {
      if (!this.videoConfig?.videoSupportEnabled) {
        await interaction.reply({ 
          content: '❌ Video processing is currently disabled on this server.', 
          ephemeral: true 
        });
        return;
      }

      // Validate video file
      if (!VideoProcessingEstimator.isSupportedFormat(videoFile.name, this.videoConfig)) {
        const errorMessage = VideoUXHelper.generateUnsupportedFormatMessage(videoFile.name, this.videoConfig);
        await interaction.reply({ content: errorMessage, ephemeral: true });
        return;
      }

      if (!VideoProcessingEstimator.isValidFileSize(videoFile.size, this.videoConfig)) {
        const fileSizeMB = videoFile.size / (1024 * 1024);
        const errorMessage = VideoUXHelper.generateFileTooLargeMessage(fileSizeMB, this.videoConfig);
        await interaction.reply({ content: errorMessage, ephemeral: true });
        return;
      }

      if (!VideoProcessingEstimator.isValidDuration(estimatedDuration, this.videoConfig)) {
        const errorMessage = VideoUXHelper.generateVideoTooLongMessage(estimatedDuration, this.videoConfig);
        await interaction.reply({ content: errorMessage, ephemeral: true });
        return;
      }

      // Calculate cost estimates
      const estimatedTokens = VideoProcessingEstimator.estimateTokenCost(estimatedDuration);
      const estimatedProcessingTime = VideoProcessingEstimator.estimateProcessingTime(estimatedDuration);
      
      // Check if confirmation is required
      if (!this.videoConfig.requireVideoConfirmation || 
          estimatedTokens < this.videoConfig.videoTokenWarningThreshold) {
        // Process directly if no confirmation needed
        await this.startVideoProcessing(interaction, videoFile, estimatedDuration);
        return;
      }

      // Create confirmation embed and buttons
      const confirmationMessage = VideoUXHelper.generateConfirmationMessage(
        estimatedDuration, 
        estimatedTokens, 
        estimatedProcessingTime
      );

      const embed = new EmbedBuilder()
        .setTitle('🎥 Video Processing Confirmation')
        .setDescription(confirmationMessage)
        .setColor(0xFFB347)
        .setTimestamp();

      const confirmRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`video-confirm-${interaction.id}`)
            .setLabel('✅ Process Video')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`video-cancel-${interaction.id}`)
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.reply({ 
        embeds: [embed], 
        components: [confirmRow], 
        ephemeral: true 
      });

      // Store video processing request for later confirmation
      this.storeVideoProcessingRequest(interaction.id, videoFile, estimatedDuration);

    } catch (error) {
      logger.error('Error in video confirmation:', error);
      await interaction.reply({ content: 'Error preparing video for processing.', ephemeral: true });
    }
  }

  async handleVideoButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    try {
      const customId = interaction.customId;
      
      if (customId.startsWith('video-confirm-')) {
        const requestId = customId.replace('video-confirm-', '');
        const videoRequest = this.getVideoProcessingRequest(requestId);
        
        if (!videoRequest) {
          await interaction.reply({ 
            content: '❌ Video processing request has expired. Please try again.', 
            ephemeral: true 
          });
          return;
        }

        await this.startVideoProcessing(interaction, videoRequest.videoFile, videoRequest.estimatedDuration);
        this.removeVideoProcessingRequest(requestId);
        
      } else if (customId.startsWith('video-cancel-')) {
        const requestId = customId.replace('video-cancel-', '');
        this.removeVideoProcessingRequest(requestId);
        
        await interaction.update({ 
          content: '❌ Video processing cancelled.', 
          embeds: [], 
          components: [] 
        });
      }
    } catch (error) {
      logger.error('Error in video button interaction:', error);
      await interaction.reply({ content: 'Error processing video request.', ephemeral: true });
    }
  }

  private async startVideoProcessing(
    interaction: ChatInputCommandInteraction | ButtonInteraction, 
    videoFile: { name: string; size: number }, 
    estimatedDuration: number
  ): Promise<void> {
    try {
      const processingMessage = VideoUXHelper.generateProcessingMessage(estimatedDuration);
      
      const embed = new EmbedBuilder()
        .setTitle('🎬 Processing Video')
        .setDescription(processingMessage)
        .setColor(0x00AE86)
        .setTimestamp()
        .addFields(
          { name: 'File', value: videoFile.name, inline: true },
          { name: 'Size', value: `${(videoFile.size / (1024 * 1024)).toFixed(1)}MB`, inline: true },
          { name: 'Duration', value: VideoProcessingEstimator.formatDuration(estimatedDuration), inline: true }
        );

      if (interaction instanceof ChatInputCommandInteraction) {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.update({ embeds: [embed], components: [] });
      }

      // In a real implementation, this would trigger the actual video processing
      logger.info(`Started video processing for file: ${videoFile.name}, duration: ${estimatedDuration}s`);
      
    } catch (error) {
      logger.error('Error starting video processing:', error);
      const errorMessage = 'Error starting video processing. Please try again.';
      
      if (interaction instanceof ChatInputCommandInteraction) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.update({ content: errorMessage, embeds: [], components: [] });
      }
    }
  }

  // Video processing request storage (in production, this would use a proper cache/database)
  private videoProcessingRequests = new Map<string, { 
    videoFile: { name: string; size: number }; 
    estimatedDuration: number; 
    timestamp: number 
  }>();

  private storeVideoProcessingRequest(
    requestId: string, 
    videoFile: { name: string; size: number }, 
    estimatedDuration: number
  ): void {
    this.videoProcessingRequests.set(requestId, {
      videoFile,
      estimatedDuration,
      timestamp: Date.now()
    });

    // Auto-cleanup after 5 minutes
    setTimeout(() => {
      this.videoProcessingRequests.delete(requestId);
    }, 5 * 60 * 1000);
  }

  private getVideoProcessingRequest(requestId: string): { 
    videoFile: { name: string; size: number }; 
    estimatedDuration: number 
  } | null {
    const request = this.videoProcessingRequests.get(requestId);
    if (!request) return null;

    // Check if request is still valid (5 minutes)
    if (Date.now() - request.timestamp > 5 * 60 * 1000) {
      this.videoProcessingRequests.delete(requestId);
      return null;
    }

    return {
      videoFile: request.videoFile,
      estimatedDuration: request.estimatedDuration
    };
  }

  private removeVideoProcessingRequest(requestId: string): void {
    this.videoProcessingRequests.delete(requestId);
  }

  // Track command execution for history
  async trackCommandExecution(
    userId: string, 
    serverId: string, 
    command: string, 
    args: Record<string, unknown>, 
    successful: boolean, 
    duration: number, 
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.userPreferenceManager.addToCommandHistory(userId, serverId, {
        command,
        arguments: args,
        timestamp: Date.now(),
        successful,
        duration,
        errorMessage
      });
    } catch (error) {
      logger.error('Error tracking command execution:', error);
    }
  }
}