import { REST, Routes, SlashCommandBuilder, Client, AutocompleteInteraction } from 'discord.js';
import { logger } from '../utils/logger';
import { UserPreferenceManager } from '../services/preferences';

// Message context interface for enhanced channel awareness
export interface MessageContext {
  channelName: string;
  channelType: string;
  isThread: boolean;
  threadName?: string;
  lastActivity: Date;
  pinnedCount: number;
  attachments: string[];
  recentEmojis: string[];
  // Image attachment data for multimodal processing
  imageAttachments?: Array<{
    url: string;
    mimeType: string;
    base64Data: string;
    filename?: string;
    size?: number;
  }>;
}

export const commands = [
  new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with the AI')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Your message to the AI')
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check bot status and remaining API quota'),

  new SlashCommandBuilder()
    .setName('health')
    .setDescription('Check detailed bot health metrics and performance')
    .addStringOption((option) =>
      option
        .setName('timeframe')
        .setDescription('Time frame for metrics (1h, 6h, 24h)')
        .setRequired(false)
        .addChoices(
          { name: 'Last 1 hour', value: '1h' },
          { name: 'Last 6 hours', value: '6h' },
          { name: 'Last 24 hours', value: '24h' }
        ),
    ),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear your conversation history with the bot'),

  new SlashCommandBuilder()
    .setName('remember')
    .setDescription('Remember an embarrassing moment about someone')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to remember something about')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('moment')
        .setDescription('The embarrassing moment to remember')
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('addgag')
    .setDescription('Add a running gag for the server')
    .addStringOption((option) =>
      option
        .setName('gag')
        .setDescription('The running gag to remember')
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('setpersonality')
    .setDescription('Add a personality description for a user (admin only)')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to add personality for')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Personality description (e.g., "likes big fat cats")')
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('mypersonality')
    .setDescription('Add a personality description for yourself')
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription(
          'Personality description (e.g., "loves coffee and coding")',
        )
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('getpersonality')
    .setDescription('View personality information for a user')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription(
          'The user to view personality for (optional, defaults to yourself)',
        )
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('removepersonality')
    .setDescription('Remove a personality description')
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('The exact personality description to remove')
        .setRequired(true),
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription(
          'The user to remove description from (optional, defaults to yourself)',
        )
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('clearpersonality')
    .setDescription('Clear all personality data')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription(
          'The user to clear data for (optional, defaults to yourself)',
        )
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('execute')
    .setDescription('Execute Python code (when enabled)')
    .addStringOption((option) =>
      option
        .setName('code')
        .setDescription('Python code to execute or math problem to solve')
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('recover')
    .setDescription('Manually trigger service recovery (admin only)')
    .addStringOption((option) =>
      option
        .setName('service')
        .setDescription('Service to recover (optional)')
        .setRequired(false)
        .addChoices(
          { name: 'Gemini API', value: 'gemini' },
          { name: 'Discord API', value: 'discord' },
          { name: 'All Services', value: 'all' }
        ),
    ),

  new SlashCommandBuilder()
    .setName('contextstats')
    .setDescription('View advanced context compression and memory statistics'),

  new SlashCommandBuilder()
    .setName('summarize')
    .setDescription('Manually trigger context summarization for this server (admin only)'),

  new SlashCommandBuilder()
    .setName('deduplicate')
    .setDescription('Remove duplicate entries from server context (admin only)'),


  new SlashCommandBuilder()
    .setName('crossserver')
    .setDescription('Enable/disable cross-server context sharing (admin only)')
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setDescription('Enable or disable cross-server context')
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Manage bot configuration (admin only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current configuration')
        .addStringOption(option =>
          option
            .setName('section')
            .setDescription('Configuration section to view')
            .addChoices(
              { name: 'Discord', value: 'discord' },
              { name: 'Gemini', value: 'gemini' },
              { name: 'Rate Limiting', value: 'rateLimiting' },
              { name: 'Features', value: 'features' },
              { name: 'All', value: 'all' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('versions')
        .setDescription('View configuration version history')
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Number of versions to show (default: 10)')
            .setMinValue(1)
            .setMaxValue(50)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('rollback')
        .setDescription('Rollback to a previous configuration version')
        .addStringOption(option =>
          option
            .setName('version')
            .setDescription('Version to rollback to')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for rollback')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('export')
        .setDescription('Export current configuration')
        .addStringOption(option =>
          option
            .setName('format')
            .setDescription('Export format')
            .addChoices(
              { name: 'JSON', value: 'json' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('audit')
        .setDescription('View configuration audit log')
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Number of entries to show (default: 20)')
            .setMinValue(1)
            .setMaxValue(100)
        )
    ),

  new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Reload bot configuration from file (admin only)')
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for reloading configuration')
    ),

  new SlashCommandBuilder()
    .setName('validate')
    .setDescription('Validate current configuration and service states (admin only)')
    .addStringOption(option =>
      option
        .setName('service')
        .setDescription('Specific service to validate (optional)')
        .addChoices(
          { name: 'Configuration Manager', value: 'configManager' },
          { name: 'Gemini Service', value: 'gemini' },
          { name: 'Rate Limiter', value: 'rateLimiter' },
          { name: 'Context Manager', value: 'contextManager' },
          { name: 'Health Monitor', value: 'healthMonitor' },
          { name: 'All Services', value: 'all' }
        )
    ),

  // User Experience Enhancement Commands
  new SlashCommandBuilder()
    .setName('preferences')
    .setDescription('Manage your user preferences')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your current preferences')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set a preference value')
        .addStringOption(option =>
          option
            .setName('key')
            .setDescription('Preference to set')
            .setRequired(true)
            .addChoices(
              { name: 'Default Personality', value: 'defaultPersonality' },
              { name: 'Response Style', value: 'preferredResponseStyle' },
              { name: 'Code Execution', value: 'enableCodeExecution' },
              { name: 'Structured Output', value: 'enableStructuredOutput' },
              { name: 'Timezone', value: 'timezone' },
              { name: 'Command History', value: 'commandHistory' },
              { name: 'Autocomplete', value: 'autocompleteEnabled' },
              { name: 'Language', value: 'preferredLanguage' },
              { name: 'Max History Size', value: 'maxHistorySize' },
              { name: 'Notifications', value: 'enableNotifications' }
            )
        )
        .addStringOption(option =>
          option
            .setName('value')
            .setDescription('Value to set')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset all preferences to defaults')
    ),

  new SlashCommandBuilder()
    .setName('alias')
    .setDescription('Manage command aliases')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List your command aliases')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a command alias')
        .addStringOption(option =>
          option
            .setName('alias')
            .setDescription('Short alias name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('command')
            .setDescription('Command to alias')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a command alias')
        .addStringOption(option =>
          option
            .setName('alias')
            .setDescription('Alias to remove')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  new SlashCommandBuilder()
    .setName('history')
    .setDescription('View and manage your command history')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View recent command history')
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Number of commands to show (default: 10)')
            .setMinValue(1)
            .setMaxValue(50)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('replay')
        .setDescription('Replay a command from history')
        .addStringOption(option =>
          option
            .setName('command_id')
            .setDescription('ID of command to replay')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear your command history')
    ),

  new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule commands for future execution')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Schedule a command')
        .addStringOption(option =>
          option
            .setName('command')
            .setDescription('Command to schedule')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('time')
            .setDescription('When to execute (e.g., "2h", "30m", "tomorrow 9am")')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('recurring')
            .setDescription('Recurring schedule')
            .addChoices(
              { name: 'Once', value: 'none' },
              { name: 'Daily', value: 'daily' },
              { name: 'Weekly', value: 'weekly' },
              { name: 'Monthly', value: 'monthly' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List your scheduled commands')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a scheduled command')
        .addStringOption(option =>
          option
            .setName('command_id')
            .setDescription('ID of scheduled command to remove')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  new SlashCommandBuilder()
    .setName('bulk')
    .setDescription('Execute multiple commands in batch')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a bulk operation')
        .addStringOption(option =>
          option
            .setName('commands')
            .setDescription('Commands to execute (JSON format)')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check bulk operation status')
        .addStringOption(option =>
          option
            .setName('operation_id')
            .setDescription('Bulk operation ID')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel a bulk operation')
        .addStringOption(option =>
          option
            .setName('operation_id')
            .setDescription('Bulk operation ID to cancel')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get interactive help and usage examples')
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('Get help for a specific command')
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('topic')
        .setDescription('Get help on a specific topic')
        .addChoices(
          { name: 'Getting Started', value: 'getting-started' },
          { name: 'Personality System', value: 'personality' },
          { name: 'Command Aliases', value: 'aliases' },
          { name: 'Scheduled Commands', value: 'scheduling' },
          { name: 'Bulk Operations', value: 'bulk' },
          { name: 'User Preferences', value: 'preferences' },
          { name: 'Context Memory', value: 'context' },
          { name: 'Code Execution', value: 'code' }
        )
    ),

  // Analytics and Reporting Commands
  new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('View analytics and usage statistics (admin only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View current analytics statistics')
        .addStringOption(option =>
          option
            .setName('timeframe')
            .setDescription('Time frame for statistics')
            .addChoices(
              { name: 'Last 24 hours', value: '24h' },
              { name: 'Last 7 days', value: '7d' },
              { name: 'Last 30 days', value: '30d' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('commands')
        .setDescription('View command usage analytics')
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('Analysis period')
            .addChoices(
              { name: 'Daily', value: 'daily' },
              { name: 'Weekly', value: 'weekly' },
              { name: 'Monthly', value: 'monthly' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('errors')
        .setDescription('View error pattern analysis')
        .addStringOption(option =>
          option
            .setName('category')
            .setDescription('Error category to analyze')
            .addChoices(
              { name: 'All Errors', value: 'all' },
              { name: 'API Errors', value: 'api' },
              { name: 'Network Errors', value: 'network' },
              { name: 'Validation Errors', value: 'validation' },
              { name: 'System Errors', value: 'system' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('performance')
        .setDescription('View performance trends and metrics')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('system')
        .setDescription('View analytics system information')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('discord-storage')
        .setDescription('View Discord data storage usage and statistics')
    ),

  new SlashCommandBuilder()
    .setName('reports')
    .setDescription('Generate and manage analytics reports (admin only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('generate')
        .setDescription('Generate an analytics report')
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('Report period')
            .setRequired(true)
            .addChoices(
              { name: 'Daily Report', value: 'daily' },
              { name: 'Weekly Report', value: 'weekly' },
              { name: 'Monthly Report', value: 'monthly' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('schedule')
        .setDescription('Configure automated report generation')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable automated reports')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('frequency')
            .setDescription('Report frequency')
            .addChoices(
              { name: 'Daily', value: 'daily' },
              { name: 'Weekly', value: 'weekly' },
              { name: 'Monthly', value: 'monthly' }
            )
        )
    ),

  new SlashCommandBuilder()
    .setName('privacy')
    .setDescription('Manage your privacy settings and data')
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View your current privacy settings')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('optout')
        .setDescription('Opt out of analytics data collection')
        .addBooleanOption(option =>
          option
            .setName('confirm')
            .setDescription('Confirm you want to opt out')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('optin')
        .setDescription('Opt back into analytics data collection')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('export')
        .setDescription('Export your stored data')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete all your stored data')
        .addBooleanOption(option =>
          option
            .setName('confirm')
            .setDescription('Confirm you want to delete all your data')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('retention')
        .setDescription('Set your data retention period')
        .addIntegerOption(option =>
          option
            .setName('days')
            .setDescription('Number of days to retain your data (7-365)')
            .setRequired(true)
            .setMinValue(7)
            .setMaxValue(365)
        )
    ),

  new SlashCommandBuilder()
    .setName('ascii')
    .setDescription('Generate ASCII art based on your prompt')
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setDescription('What you want as ASCII art (e.g., "starfish", "dragon", "coffee cup")')
        .setRequired(true),
    ),
];

export async function registerCommands(_client: Client) {
  const startTime = Date.now();
  const requestId = `register_commands_${Date.now()}`;
  
  const { enrichError, createTimeoutPromise, handleAsyncOperation } = await import('../utils/ErrorHandlingUtils');
  
  const result = await handleAsyncOperation(
    async () => {
      logger.info('Started refreshing application (/) commands.', { requestId });

      const clientId = process.env.DISCORD_CLIENT_ID;
      if (!clientId) {
        throw enrichError(new Error('DISCORD_CLIENT_ID not found in environment variables'), {
          category: 'VALIDATION' as const,
          operation: 'validateClientId',
          requestId
        });
      }

      const discordToken = process.env.DISCORD_TOKEN;
      if (!discordToken) {
        throw enrichError(new Error('DISCORD_TOKEN not found in environment variables'), {
          category: 'VALIDATION' as const,
          operation: 'validateDiscordToken',
          requestId
        });
      }

      const rest = new REST().setToken(discordToken);

      // Validate commands before registering
      const commandsData = commands.map((command, index) => {
        try {
          return command.toJSON();
        } catch (error) {
          throw enrichError(new Error(`Failed to serialize command at index ${index}`), {
            operation: 'command.toJSON',
            commandIndex: index,
            commandName: command.name,
            requestId
          });
        }
      });

      logger.info(`Registering ${commandsData.length} commands with Discord API`, {
        requestId,
        commandCount: commandsData.length
      });

      // Register commands with timeout protection
      await Promise.race([
        rest.put(Routes.applicationCommands(clientId), {
          body: commandsData,
        }),
        createTimeoutPromise(30000).then(() => {
          throw enrichError(new Error('Command registration timeout'), {
            operation: 'rest.put',
            timeout: 30000,
            requestId
          });
        })
      ]);

      const duration = Date.now() - startTime;
      logger.info('Successfully reloaded application (/) commands.', {
        duration,
        requestId,
        commandCount: commandsData.length
      });
    },
    {
      maxRetries: 2, // Retry command registration up to 2 times
      retryDelay: 5000,
      retryMultiplier: 2.0,
      timeout: 45000
    },
    undefined,
    { operation: 'registerCommands', requestId }
  );

  if (!result.success) {
    const error = result.error!;
    logger.error('Failed to register commands after retries', {
      error,
      retryCount: result.retryCount,
      duration: Date.now() - startTime,
      requestId
    });
    throw error;
  }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction, userPreferenceManager: UserPreferenceManager) {
  const startTime = Date.now();
  const requestId = `autocomplete_${interaction.id}_${Date.now()}`;
  const { commandName, options } = interaction;
  const focusedOption = options.getFocused(true);
  const userId = interaction.user.id;
  const serverId = interaction.guildId || 'dm';

  let choices: string[] = [];

  const { enrichError, createTimeoutPromise } = await import('../utils/ErrorHandlingUtils');

  try {
    // Wrap autocomplete logic with timeout protection
    await Promise.race([
      (async () => {
        switch (commandName) {
        case 'preferences':
          if (focusedOption.name === 'value') {
            const key = options.getString('key');
            choices = getPreferenceValueSuggestions(key, focusedOption.value);
          }
          break;

        case 'alias':
          if (focusedOption.name === 'command') {
            const availableCommands = getAllCommandNames();
            choices = userPreferenceManager.getCommandSuggestions(
              userId, 
              serverId, 
              focusedOption.value, 
              availableCommands
            );
          } else if (focusedOption.name === 'alias') {
            const userPrefs = await userPreferenceManager.getUserPreferencesForServer(userId, serverId);
            choices = Object.keys(userPrefs.commandAliases).filter(alias =>
              alias.toLowerCase().includes(focusedOption.value.toLowerCase())
            );
          }
          break;

        case 'history':
          if (focusedOption.name === 'command_id') {
            const history = await userPreferenceManager.getCommandHistory(userId, serverId, 20);
            choices = history
              .filter(entry => entry.id.includes(focusedOption.value) || 
                           entry.command.toLowerCase().includes(focusedOption.value.toLowerCase()))
              .map(entry => `${entry.id} - ${entry.command}`)
              .slice(0, 10);
          }
          break;

        case 'schedule':
          if (focusedOption.name === 'command') {
            const availableCommands = getAllCommandNames();
            choices = userPreferenceManager.getCommandSuggestions(
              userId, 
              serverId, 
              focusedOption.value, 
              availableCommands
            );
          } else if (focusedOption.name === 'command_id') {
            const scheduled = userPreferenceManager.getScheduledCommands(userId, serverId);
            choices = scheduled
              .filter(cmd => cmd.id.includes(focusedOption.value) || 
                          cmd.command.toLowerCase().includes(focusedOption.value.toLowerCase()))
              .map(cmd => `${cmd.id} - ${cmd.command}`)
              .slice(0, 10);
          }
          break;

        case 'bulk':
          if (focusedOption.name === 'operation_id') {
            // This would need access to bulk operations
            choices = ['No active operations'];
          }
          break;

        case 'help':
          if (focusedOption.name === 'command') {
            const availableCommands = getAllCommandNames();
            choices = availableCommands.filter(cmd =>
              cmd.toLowerCase().includes(focusedOption.value.toLowerCase())
            );
          }
          break;
        }

        // Limit choices to Discord's maximum of 25
        const limitedChoices = choices.slice(0, 25).map(choice => ({
          name: choice.length > 100 ? choice.substring(0, 97) + '...' : choice,
          value: choice.length > 100 ? choice.substring(0, 100) : choice,
        }));

        await interaction.respond(limitedChoices);
      })(),
      createTimeoutPromise(5000).then(() => {
        throw enrichError(new Error('Autocomplete processing timeout'), {
          operation: 'autocomplete.process',
          commandName,
          timeout: 5000,
          requestId
        });
      })
    ]);

    const duration = Date.now() - startTime;
    logger.debug('Autocomplete processed successfully', {
      commandName,
      duration,
      choicesCount: choices.length,
      requestId
    });

  } catch (error) {
    const enrichedError = enrichError(error as Error, {
      commandName,
      userId,
      serverId,
      focusedOption: focusedOption.name,
      requestId,
      duration: Date.now() - startTime
    });

    logger.error('Error in autocomplete handler', {
      error: enrichedError,
      errorCategory: enrichedError.category
    });

    try {
      await interaction.respond([]);
    } catch (responseError) {
      logger.error('Failed to send empty autocomplete response', {
        error: responseError,
        originalError: enrichedError,
        requestId
      });
    }
  }
}

function getAllCommandNames(): string[] {
  return [
    'chat', 'status', 'health', 'clear', 'remember', 'addgag',
    'setpersonality', 'mypersonality', 'getpersonality', 'removepersonality',
    'clearpersonality', 'execute', 'recover', 'contextstats', 'summarize',
    'deduplicate', 'crossserver', 'config', 'reload', 'validate',
    'preferences', 'alias', 'history', 'schedule', 'bulk', 'help',
    'analytics', 'reports', 'privacy', 'ascii'
  ];
}

function getPreferenceValueSuggestions(key: string | null, currentValue: string): string[] {
  if (!key) return [];

  const suggestions: { [key: string]: string[] } = {
    defaultPersonality: ['roasting', 'helpful'],
    preferredResponseStyle: ['concise', 'detailed', 'technical'],
    enableCodeExecution: ['true', 'false'],
    enableStructuredOutput: ['true', 'false'],
    commandHistory: ['true', 'false'],
    autocompleteEnabled: ['true', 'false'],
    enableNotifications: ['true', 'false'],
    preferredLanguage: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
    timezone: [
      'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo',
      'Asia/Shanghai', 'Australia/Sydney'
    ],
    maxHistorySize: ['10', '25', '50', '75', '100']
  };

  const keyValues = suggestions[key] || [];
  return keyValues.filter(value => 
    value.toLowerCase().includes(currentValue.toLowerCase())
  );
}

// Extract recent emojis from channel messages for context awareness
// Extract recent emojis from channel messages for context awareness
// Using a more flexible type to accommodate different channel types
export async function extractRecentEmojis(channel: unknown): Promise<string[]> {
  try {
    // Type guard to check if channel has messages property
    const ch = channel as { messages?: { fetch?: (options: { limit: number }) => Promise<Map<string, unknown>> } };
    
    if (!ch.messages || !ch.messages.fetch) {
      return [];
    }
    
    const messages = await ch.messages.fetch({ limit: 50 });
    const emojis: string[] = [];
    
    // Unicode emoji regex pattern
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E0}-\u{1F1FF}]/gu;
    
    // Custom Discord emoji pattern
    const customEmojiRegex = /<a?:[\w]+:\d+>/g;
    
    messages.forEach((msg) => {
      const message = msg as { content?: string; reactions?: { cache?: Map<string, unknown> } };
      if (!message.content) return;
      // Extract unicode emojis
      const unicodeEmojis = message.content.match(emojiRegex);
      if (unicodeEmojis) {
        emojis.push(...unicodeEmojis);
      }
      
      // Extract custom Discord emojis
      const customEmojis = message.content.match(customEmojiRegex);
      if (customEmojis) {
        emojis.push(...customEmojis);
      }
      
      // Check reactions
      if (message.reactions && message.reactions.cache) {
        message.reactions.cache.forEach((reaction) => {
          const r = reaction as { emoji?: { id?: string; name?: string } };
          if (!r.emoji) return;
          
          const emoji = r.emoji;
          if (emoji.id) {
            // Custom emoji
            emojis.push(`<:${emoji.name}:${emoji.id}>`);
          } else if (emoji.name) {
            // Unicode emoji
            emojis.push(emoji.name);
          }
        });
      }
    });
    
    // Return unique emojis, limited to 20 most recent
    const uniqueEmojis = [...new Set(emojis)];
    return uniqueEmojis.slice(0, 20);
  } catch (error) {
    logger.debug('Failed to extract recent emojis:', error);
    return [];
  }
}
