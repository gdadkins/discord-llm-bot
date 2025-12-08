/**
 * Help Command Builder
 * Creates embeds and interactive components for help system
 */

import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { logger } from '../../utils/logger';
import type { 
  IHelpCommandBuilder 
} from '../interfaces/HelpSystemInterfaces';
import type { 
  HelpTopic, 
  CommandHelp, 
  HelpContentManager 
} from './HelpContentManager';

export class HelpCommandBuilder implements IHelpCommandBuilder {
  constructor(private contentManager: HelpContentManager) {}

  createTopicEmbed(topic: HelpTopic): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(topic.title)
      .setDescription(topic.description)
      .setColor(0x00AE86)
      .setTimestamp();

    // Add sections as fields
    topic.sections.forEach((section, index) => {
      let fieldValue = section.content;
      if (section.code) {
        fieldValue += `\n\`\`\`\n${section.code}\n\`\`\``;
      }
      
      // Discord field value limit is 1024 characters
      if (fieldValue.length > 1024) {
        fieldValue = fieldValue.substring(0, 1021) + '...';
      }

      embed.addFields({
        name: `${index + 1}. ${section.title}`,
        value: fieldValue,
        inline: false
      });
    });

    // Add related commands if available
    if (topic.relatedCommands && topic.relatedCommands.length > 0) {
      embed.addFields({
        name: '🔗 Related Commands',
        value: topic.relatedCommands.map(cmd => `\`/${cmd}\``).join(', '),
        inline: false
      });
    }

    // Add examples if available
    if (topic.examples && topic.examples.length > 0) {
      embed.addFields({
        name: '💡 Quick Examples',
        value: topic.examples.join('\n'),
        inline: false
      });
    }

    embed.setFooter({ text: 'Use /help command:<name> for detailed command help' });

    return embed;
  }

  createCommandEmbed(command: CommandHelp): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`📖 Command: /${command.name}`)
      .setDescription(command.description)
      .setColor(0x0099FF)
      .setTimestamp();

    // Usage
    embed.addFields({
      name: '📝 Usage',
      value: `\`${command.usage}\``,
      inline: false
    });

    // Parameters
    if (command.parameters && command.parameters.length > 0) {
      const paramText = command.parameters.map(param => {
        const required = param.required ? '**Required**' : '*Optional*';
        const choices = param.choices ? ` (choices: ${param.choices.join(', ')})` : '';
        return `• **${param.name}** (${param.type}${choices}) - ${required}\n  ${param.description}`;
      }).join('\n\n');

      embed.addFields({
        name: '⚙️ Parameters',
        value: paramText.length > 1024 ? paramText.substring(0, 1021) + '...' : paramText,
        inline: false
      });
    }

    // Examples
    if (command.examples && command.examples.length > 0) {
      embed.addFields({
        name: '💡 Examples',
        value: command.examples.map(ex => `\`${ex}\``).join('\n'),
        inline: false
      });
    }

    // Permissions
    if (command.permissions) {
      embed.addFields({
        name: '🔒 Permissions Required',
        value: command.permissions,
        inline: true
      });
    }

    // Aliases
    if (command.aliases && command.aliases.length > 0) {
      embed.addFields({
        name: '⚡ Aliases',
        value: command.aliases.map(alias => `\`${alias}\``).join(', '),
        inline: true
      });
    }

    // Related commands
    if (command.relatedCommands && command.relatedCommands.length > 0) {
      embed.addFields({
        name: '🔗 Related Commands',
        value: command.relatedCommands.map(cmd => `\`/${cmd}\``).join(', '),
        inline: false
      });
    }

    embed.setFooter({ text: 'Use /help topic:<name> for broader help topics' });

    return embed;
  }

  createGeneralHelpEmbed(): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('🤖 TroutLLM Bot Help Center')
      .setDescription('Welcome to TroutLLM! Here\'s how to get started and make the most of the bot\'s features.')
      .setColor(0x00AE86)
      .setTimestamp();

    embed.addFields({
      name: '🚀 Quick Start',
      value: 'Use `/chat message:Hello!` to start chatting or `/help topic:getting-started` for a complete guide.',
      inline: false
    });

    embed.addFields({
      name: '📚 Help Topics',
      value: [
        '`/help topic:getting-started` - Learn the basics',
        '`/help topic:personality` - Dual personality system',
        '`/help topic:aliases` - Command shortcuts',
        '`/help topic:scheduling` - Scheduled commands',
        '`/help topic:bulk` - Batch operations',
        '`/help topic:preferences` - User settings',
        '`/help topic:context` - Memory system',
        '`/help topic:code` - Code execution',
        '`/help topic:video` - Video processing'
      ].join('\n'),
      inline: false
    });

    embed.addFields({
      name: '⭐ Popular Commands',
      value: [
        '`/chat` - Have a conversation',
        '`/preferences` - Customize your experience',
        '`/alias` - Create command shortcuts',
        '`/history` - View command history',
        '`/status` - Check bot status',
        '`/help command:<name>` - Get detailed command help'
      ].join('\n'),
      inline: false
    });

    embed.addFields({
      name: '🎭 Personality Features',
      value: 'TroutLLM has dual personalities (roasting/helpful) and remembers user traits. Use `/mypersonality` to set your traits!',
      inline: false
    });

    embed.setFooter({ text: 'Tip: Most commands support autocomplete - just start typing!' });

    return embed;
  }

  createNavigationButtons(currentContext: 'general' | 'topic' | 'command', identifier?: string): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    if (currentContext === 'topic' || currentContext === 'command') {
      const backRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('help-back')
            .setLabel('← Back to Help Center')
            .setStyle(ButtonStyle.Secondary)
        );
      rows.push(backRow);
    }

    if (currentContext === 'general') {
      const topicRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('help-topic-getting-started')
            .setLabel('🚀 Getting Started')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('help-topic-personality')
            .setLabel('🎭 Personality')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('help-topic-aliases')
            .setLabel('⚡ Aliases')
            .setStyle(ButtonStyle.Primary)
        );
      
      const topicRow2 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('help-topic-preferences')
            .setLabel('⚙️ Preferences')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('help-topic-context')
            .setLabel('🧠 Context')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('help-topic-code')
            .setLabel('💻 Code')
            .setStyle(ButtonStyle.Primary)
        );
      
      const topicRow3 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('help-topic-video')
            .setLabel('🎥 Video')
            .setStyle(ButtonStyle.Primary)
        );

      rows.push(topicRow, topicRow2, topicRow3);
    }

    return rows;
  }

  /**
   * Generate text-based help content for a command
   */
  generateTextHelp(commandName?: string, userRole: 'user' | 'moderator' | 'admin' = 'user'): string {
    if (commandName) {
      const commandInfo = this.contentManager.getCommandHelp(commandName);
      if (!commandInfo) {
        return `No help available for command: ${commandName}`;
      }
      
      // Check permissions
      if (commandInfo.permissions !== 'all' && commandInfo.permissions !== userRole && userRole !== 'admin') {
        return 'You don\'t have permission to access help for this command.';
      }
      
      let help = `**/${commandInfo.name}** - ${commandInfo.description}\n\n`;
      help += `**Usage:** \`${commandInfo.usage}\`\n\n`;
      
      if (commandInfo.examples && commandInfo.examples.length > 0) {
        help += `**Examples:**\n${commandInfo.examples.map(ex => `\`${ex}\``).join('\n')}\n\n`;
      }
      
      if (commandInfo.aliases && commandInfo.aliases.length > 0) {
        help += `**Aliases:** ${commandInfo.aliases.join(', ')}\n\n`;
      }
      
      return help;
    }
    
    // General help
    const availableCommands = this.getCommandList(userRole);
    let help = '**Available Commands:**\n\n';
    
    availableCommands.forEach(cmd => {
      help += `\`/${cmd.name}\` - ${cmd.description}\n`;
    });
    
    help += '\nUse `/help command:<name>` for detailed help on a specific command.';
    return help;
  }

  /**
   * Get filtered command list based on user role
   */
  private getCommandList(userRole: 'user' | 'moderator' | 'admin' = 'user'): Array<{name: string, description: string}> {
    const commands: Array<{name: string, description: string}> = [];
    const allCommands = this.contentManager.getAllCommands();
    
    allCommands.forEach(commandName => {
      const commandInfo = this.contentManager.getCommandHelp(commandName);
      if (!commandInfo) return;
      
      // Filter by permissions
      if (commandInfo.permissions === 'all' || 
          commandInfo.permissions === userRole || 
          userRole === 'admin') {
        commands.push({
          name: commandInfo.name,
          description: commandInfo.description
        });
      }
    });
    
    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Create search results embed
   */
  createSearchResultsEmbed(query: string, results: Array<{type: 'topic' | 'command', name: string, relevance: number}>): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`🔍 Search Results for "${query}"`)
      .setColor(0x00AE86)
      .setTimestamp();

    if (results.length === 0) {
      embed.setDescription('No results found. Try different keywords or browse topics from the main help menu.');
      return embed;
    }

    const topicResults = results.filter(r => r.type === 'topic');
    const commandResults = results.filter(r => r.type === 'command');

    if (topicResults.length > 0) {
      embed.addFields({
        name: '📚 Topics',
        value: topicResults.map(r => `• \`/help topic:${r.name}\``).join('\n'),
        inline: false
      });
    }

    if (commandResults.length > 0) {
      embed.addFields({
        name: '⚡ Commands',
        value: commandResults.map(r => `• \`/help command:${r.name}\``).join('\n'),
        inline: false
      });
    }

    embed.setFooter({ text: `Found ${results.length} result${results.length === 1 ? '' : 's'}` });

    return embed;
  }
}