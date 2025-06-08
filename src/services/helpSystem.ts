import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger';

export interface HelpTopic {
  title: string;
  description: string;
  sections: HelpSection[];
  relatedCommands?: string[];
  examples?: string[];
}

export interface HelpSection {
  title: string;
  content: string;
  code?: string;
}

export interface CommandHelp {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  parameters?: ParameterHelp[];
  permissions?: string;
  aliases?: string[];
  relatedCommands?: string[];
}

export interface ParameterHelp {
  name: string;
  description: string;
  type: string;
  required: boolean;
  choices?: string[];
  example?: string;
}

export class HelpSystem {
  private helpTopics: Map<string, HelpTopic> = new Map();
  private commandHelp: Map<string, CommandHelp> = new Map();

  constructor() {
    this.initializeHelpTopics();
    this.initializeCommandHelp();
  }

  private initializeHelpTopics(): void {
    // Getting Started Topic
    this.helpTopics.set('getting-started', {
      title: '🚀 Getting Started with TroutLLM Bot',
      description: 'Learn the basics of using TroutLLM and its features',
      sections: [
        {
          title: 'Basic Chat',
          content: 'Start chatting with the bot using `/chat` command or by mentioning the bot directly.',
          code: '/chat message:Hello, how are you today?'
        },
        {
          title: 'Setting Personality',
          content: 'The bot has dual personalities: roasting and helpful. You can set your preference.',
          code: '/preferences set key:defaultPersonality value:helpful'
        },
        {
          title: 'Command History',
          content: 'The bot tracks your command history for easy replay and reference.',
          code: '/history view limit:10'
        },
        {
          title: 'Getting Help',
          content: 'Use the help command to get information about specific commands or topics.',
          code: '/help command:preferences'
        }
      ],
      relatedCommands: ['chat', 'preferences', 'help', 'status'],
      examples: [
        'Try: `/chat message:Tell me a joke`',
        'Set up: `/preferences set key:commandHistory value:true`',
        'Explore: `/help topic:personality`'
      ]
    });

    // Personality System Topic
    this.helpTopics.set('personality', {
      title: '🎭 Personality System',
      description: 'Understanding dual personalities and roasting behavior',
      sections: [
        {
          title: 'Dual Personalities',
          content: 'TroutLLM has two personalities: **Roasting** (sarcastic, witty) and **Helpful** (supportive, informative). The bot dynamically switches between them based on probability and context.'
        },
        {
          title: 'Roasting Behavior',
          content: 'The roasting system uses sophisticated algorithms including chaos mode, psychological warfare, and contextual intelligence to create entertaining interactions.'
        },
        {
          title: 'User Personality Profiles',
          content: 'You can set personality traits about yourself or others that the bot will remember and reference.',
          code: '/mypersonality description:Loves coffee and coding'
        },
        {
          title: 'Managing Personalities',
          content: 'View, add, or remove personality descriptions for yourself or others (admin permissions required for others).',
          code: '/getpersonality user:@username'
        }
      ],
      relatedCommands: ['setpersonality', 'mypersonality', 'getpersonality', 'removepersonality', 'clearpersonality'],
      examples: [
        'Add trait: `/mypersonality description:Terrible at math but great at debugging`',
        'View profile: `/getpersonality`',
        'Remove trait: `/removepersonality description:Terrible at math but great at debugging`'
      ]
    });

    // Command Aliases Topic
    this.helpTopics.set('aliases', {
      title: '⚡ Command Aliases',
      description: 'Create shortcuts for frequently used commands',
      sections: [
        {
          title: 'What are Aliases?',
          content: 'Aliases are custom shortcuts for commands. Instead of typing `/chat message:Hello`, you could create an alias `hi` that does the same thing.'
        },
        {
          title: 'Creating Aliases',
          content: 'Use the alias command to create shortcuts for any command.',
          code: '/alias add alias:hi command:chat message:Hello there!'
        },
        {
          title: 'Using Aliases',
          content: 'Once created, aliases work just like regular commands. They support autocomplete and appear in your command suggestions.'
        },
        {
          title: 'Managing Aliases',
          content: 'View all your aliases or remove ones you no longer need.',
          code: '/alias list'
        }
      ],
      relatedCommands: ['alias'],
      examples: [
        'Quick chat: `/alias add alias:q command:chat`',
        'Status check: `/alias add alias:s command:status`',
        'View aliases: `/alias list`',
        'Remove alias: `/alias remove alias:q`'
      ]
    });

    // Scheduled Commands Topic
    this.helpTopics.set('scheduling', {
      title: '⏰ Scheduled Commands',
      description: 'Execute commands at specific times or on recurring schedules',
      sections: [
        {
          title: 'Scheduling Commands',
          content: 'Schedule any command to execute in the future. Supports relative time (2h, 30m) and recurring schedules.',
          code: '/schedule add command:status time:2h recurring:daily'
        },
        {
          title: 'Time Formats',
          content: 'Supported formats: "2h" (2 hours), "30m" (30 minutes), "tomorrow 9am", "next Friday"'
        },
        {
          title: 'Recurring Schedules',
          content: 'Set commands to repeat daily, weekly, or monthly. Perfect for regular status checks or reminders.'
        },
        {
          title: 'Managing Scheduled Commands',
          content: 'View all your scheduled commands and remove ones you no longer need.',
          code: '/schedule list'
        }
      ],
      relatedCommands: ['schedule'],
      examples: [
        'Daily status: `/schedule add command:status time:9am recurring:daily`',
        'Weekly health check: `/schedule add command:health time:"Monday 10am" recurring:weekly`',
        'One-time reminder: `/schedule add command:chat message:"Remember the meeting!" time:1h`'
      ]
    });

    // Bulk Operations Topic
    this.helpTopics.set('bulk', {
      title: '📦 Bulk Operations',
      description: 'Execute multiple commands efficiently in batch',
      sections: [
        {
          title: 'What are Bulk Operations?',
          content: 'Bulk operations allow you to execute multiple commands in sequence, with progress tracking and error handling.'
        },
        {
          title: 'Creating Bulk Operations',
          content: 'Provide a JSON array of commands to execute. Each command runs independently.',
          code: '/bulk create commands:[{"command":"status","arguments":{}},{"command":"health","arguments":{"timeframe":"1h"}}]'
        },
        {
          title: 'Monitoring Progress',
          content: 'Check the status of your bulk operations to see progress and results.',
          code: '/bulk status operation_id:bulk-1234567890'
        },
        {
          title: 'Best Practices',
          content: 'Keep bulk operations reasonable in size (under 20 commands). Commands run sequentially to avoid rate limits.'
        }
      ],
      relatedCommands: ['bulk'],
      examples: [
        'Multiple status checks: `[{"command":"status"},{"command":"health"},{"command":"contextstats"}]`',
        'Personality cleanup: `[{"command":"clearpersonality"},{"command":"clear"}]`'
      ]
    });

    // User Preferences Topic
    this.helpTopics.set('preferences', {
      title: '⚙️ User Preferences',
      description: 'Customize your bot experience with personal settings',
      sections: [
        {
          title: 'Available Preferences',
          content: 'Customize personality, response style, features, timezone, and more.'
        },
        {
          title: 'Setting Preferences',
          content: 'Use the preferences command to modify your settings.',
          code: '/preferences set key:preferredResponseStyle value:technical'
        },
        {
          title: 'Privacy Controls',
          content: 'Control command history tracking, notifications, and data retention.',
          code: '/preferences set key:commandHistory value:false'
        },
        {
          title: 'Viewing Settings',
          content: 'See all your current preferences and when they were last updated.',
          code: '/preferences view'
        }
      ],
      relatedCommands: ['preferences'],
      examples: [
        'Enable code execution: `/preferences set key:enableCodeExecution value:true`',
        'Set timezone: `/preferences set key:timezone value:America/New_York`',
        'Response style: `/preferences set key:preferredResponseStyle value:concise`'
      ]
    });

    // Context Memory Topic
    this.helpTopics.set('context', {
      title: '🧠 Context Memory',
      description: 'Understanding how the bot remembers conversations and context',
      sections: [
        {
          title: 'Conversation Memory',
          content: 'The bot maintains conversation history per user, with configurable retention and automatic cleanup.'
        },
        {
          title: 'Server Context',
          content: 'Server-wide memory includes embarrassing moments, running gags, and shared context between users.'
        },
        {
          title: 'Memory Management',
          content: 'Context is automatically compressed and optimized to maintain performance while preserving important information.'
        },
        {
          title: 'Privacy & Control',
          content: 'You can clear your conversation history, disable memory features, or manage server context (admin only).',
          code: '/clear'
        }
      ],
      relatedCommands: ['clear', 'remember', 'addgag', 'contextstats', 'summarize', 'deduplicate'],
      examples: [
        'Clear history: `/clear`',
        'Add embarrassing moment: `/remember user:@someone moment:Forgot their own birthday`',
        'Add running gag: `/addgag gag:Always mentions cats in technical discussions`',
        'View stats: `/contextstats`'
      ]
    });

    // Code Execution Topic
    this.helpTopics.set('code', {
      title: '💻 Code Execution',
      description: 'Running Python code and solving math problems',
      sections: [
        {
          title: 'Code Execution Feature',
          content: 'When enabled, the bot can execute Python code and solve mathematical problems safely.'
        },
        {
          title: 'Enabling Code Execution',
          content: 'Enable this feature in your preferences or through environment configuration.',
          code: '/preferences set key:enableCodeExecution value:true'
        },
        {
          title: 'Using Code Execution',
          content: 'Use the execute command to run Python code or solve math problems.',
          code: '/execute code:print("Hello, World!")'
        },
        {
          title: 'Safety & Limitations',
          content: 'Code execution runs in a sandboxed environment with time and resource limits for security.'
        }
      ],
      relatedCommands: ['execute', 'preferences'],
      examples: [
        'Math problem: `/execute code:import math; print(math.sqrt(144))`',
        'Data analysis: `/execute code:data = [1,2,3,4,5]; print(f"Average: {sum(data)/len(data)}")`',
        'Algorithm: `/execute code:def fibonacci(n): return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2); print(fibonacci(10))`'
      ]
    });
  }

  private initializeCommandHelp(): void {
    // Core Commands
    this.commandHelp.set('chat', {
      name: 'chat',
      description: 'Have a conversation with TroutLLM',
      usage: '/chat message:<your message>',
      examples: [
        '/chat message:What\'s the weather like today?',
        '/chat message:Explain quantum computing in simple terms',
        '/chat message:Tell me a programming joke'
      ],
      parameters: [
        {
          name: 'message',
          description: 'Your message to the AI',
          type: 'string',
          required: true,
          example: 'Hello, how are you?'
        }
      ],
      relatedCommands: ['preferences', 'status', 'clear']
    });

    this.commandHelp.set('preferences', {
      name: 'preferences',
      description: 'Manage your personal settings and preferences',
      usage: '/preferences <view|set|reset>',
      examples: [
        '/preferences view',
        '/preferences set key:defaultPersonality value:helpful',
        '/preferences reset'
      ],
      parameters: [
        {
          name: 'key',
          description: 'The preference to modify',
          type: 'choice',
          required: true,
          choices: ['defaultPersonality', 'preferredResponseStyle', 'enableCodeExecution', 'timezone'],
          example: 'defaultPersonality'
        },
        {
          name: 'value',
          description: 'The value to set',
          type: 'string',
          required: true,
          example: 'helpful'
        }
      ],
      relatedCommands: ['chat', 'alias', 'history']
    });

    this.commandHelp.set('alias', {
      name: 'alias',
      description: 'Create and manage command shortcuts',
      usage: '/alias <list|add|remove>',
      examples: [
        '/alias list',
        '/alias add alias:hi command:chat message:Hello!',
        '/alias remove alias:hi'
      ],
      parameters: [
        {
          name: 'alias',
          description: 'The shortcut name',
          type: 'string',
          required: true,
          example: 'hi'
        },
        {
          name: 'command',
          description: 'The full command to execute',
          type: 'string',
          required: true,
          example: 'chat message:Hello there!'
        }
      ],
      relatedCommands: ['preferences', 'help']
    });

    this.commandHelp.set('history', {
      name: 'history',
      description: 'View and manage your command history',
      usage: '/history <view|replay|clear>',
      examples: [
        '/history view limit:10',
        '/history replay command_id:cmd-1234567890',
        '/history clear'
      ],
      parameters: [
        {
          name: 'limit',
          description: 'Number of commands to show',
          type: 'integer',
          required: false,
          example: '10'
        },
        {
          name: 'command_id',
          description: 'ID of command to replay',
          type: 'string',
          required: true,
          example: 'cmd-1234567890'
        }
      ],
      relatedCommands: ['preferences', 'alias']
    });

    this.commandHelp.set('schedule', {
      name: 'schedule',
      description: 'Schedule commands for future execution',
      usage: '/schedule <add|list|remove>',
      examples: [
        '/schedule add command:status time:2h',
        '/schedule add command:health time:"tomorrow 9am" recurring:daily',
        '/schedule list'
      ],
      parameters: [
        {
          name: 'command',
          description: 'Command to schedule',
          type: 'string',
          required: true,
          example: 'status'
        },
        {
          name: 'time',
          description: 'When to execute',
          type: 'string',
          required: true,
          example: '2h'
        },
        {
          name: 'recurring',
          description: 'Repeat schedule',
          type: 'choice',
          required: false,
          choices: ['none', 'daily', 'weekly', 'monthly'],
          example: 'daily'
        }
      ],
      relatedCommands: ['preferences', 'bulk']
    });

    this.commandHelp.set('bulk', {
      name: 'bulk',
      description: 'Execute multiple commands in batch',
      usage: '/bulk <create|status|cancel>',
      examples: [
        '/bulk create commands:[{"command":"status"},{"command":"health"}]',
        '/bulk status operation_id:bulk-1234567890'
      ],
      parameters: [
        {
          name: 'commands',
          description: 'JSON array of commands to execute',
          type: 'string',
          required: true,
          example: '[{"command":"status","arguments":{}}]'
        },
        {
          name: 'operation_id',
          description: 'ID of bulk operation',
          type: 'string',
          required: true,
          example: 'bulk-1234567890'
        }
      ],
      relatedCommands: ['schedule', 'history']
    });

    this.commandHelp.set('help', {
      name: 'help',
      description: 'Get help and usage examples',
      usage: '/help [command] [topic]',
      examples: [
        '/help',
        '/help command:preferences',
        '/help topic:getting-started'
      ],
      parameters: [
        {
          name: 'command',
          description: 'Get help for specific command',
          type: 'string',
          required: false,
          example: 'preferences'
        },
        {
          name: 'topic',
          description: 'Get help on specific topic',
          type: 'choice',
          required: false,
          choices: ['getting-started', 'personality', 'aliases', 'scheduling', 'bulk', 'preferences', 'context', 'code'],
          example: 'getting-started'
        }
      ],
      relatedCommands: ['preferences', 'alias', 'history']
    });
  }

  getHelpTopic(topicId: string): HelpTopic | null {
    return this.helpTopics.get(topicId) || null;
  }

  getCommandHelp(commandName: string): CommandHelp | null {
    return this.commandHelp.get(commandName) || null;
  }

  getAllTopics(): string[] {
    return Array.from(this.helpTopics.keys());
  }

  getAllCommands(): string[] {
    return Array.from(this.commandHelp.keys());
  }

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
        '`/help topic:code` - Code execution'
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

  createNavigationButtons(currentContext: 'general' | 'topic' | 'command', _identifier?: string): ActionRowBuilder<ButtonBuilder>[] {
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

      rows.push(topicRow, topicRow2);
    }

    return rows;
  }

  searchHelp(query: string): Array<{type: 'topic' | 'command', name: string, relevance: number}> {
    const results: Array<{type: 'topic' | 'command', name: string, relevance: number}> = [];
    const lowercaseQuery = query.toLowerCase();

    // Search topics
    for (const [topicId, topic] of this.helpTopics) {
      let relevance = 0;
      
      if (topic.title.toLowerCase().includes(lowercaseQuery)) relevance += 10;
      if (topic.description.toLowerCase().includes(lowercaseQuery)) relevance += 5;
      
      topic.sections.forEach(section => {
        if (section.title.toLowerCase().includes(lowercaseQuery)) relevance += 3;
        if (section.content.toLowerCase().includes(lowercaseQuery)) relevance += 1;
      });

      if (relevance > 0) {
        results.push({ type: 'topic', name: topicId, relevance });
      }
    }

    // Search commands
    for (const [commandName, command] of this.commandHelp) {
      let relevance = 0;
      
      if (command.name.toLowerCase().includes(lowercaseQuery)) relevance += 15;
      if (command.description.toLowerCase().includes(lowercaseQuery)) relevance += 5;
      
      command.examples.forEach(example => {
        if (example.toLowerCase().includes(lowercaseQuery)) relevance += 2;
      });

      if (relevance > 0) {
        results.push({ type: 'command', name: commandName, relevance });
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 10);
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    logger.info('HelpSystem initialized successfully');
  }

  /**
   * Shutdown the service and clean up resources
   */
  async shutdown(): Promise<void> {
    this.helpTopics.clear();
    this.commandHelp.clear();
    logger.info('HelpSystem shutdown completed');
  }
}