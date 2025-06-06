import { REST, Routes, SlashCommandBuilder, Client } from 'discord.js';
import { logger } from '../utils/logger';

const commands = [
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
];

export async function registerCommands(_client: Client) {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

  try {
    logger.info('Started refreshing application (/) commands.');

    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
      throw new Error('DISCORD_CLIENT_ID not found in environment variables');
    }

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map((command) => command.toJSON()),
    });

    logger.info('Successfully reloaded application (/) commands.');
  } catch (error) {
    logger.error('Error registering commands:', error);
  }
}
