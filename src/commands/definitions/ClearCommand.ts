import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const ClearCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear your conversation history with the bot'),

    options: {
        timeout: 10000,
        requiresDefer: false
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;
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
};
