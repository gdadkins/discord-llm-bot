import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';
import { logger } from '../../utils/logger';

export const DeduplicateCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('deduplicate')
        .setDescription('Remove duplicate entries from server context'),

    options: {
        timeout: 30000,
        requiresDefer: true,
        adminRequired: true
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;

        if (!interaction.guildId) {
            await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
            return;
        }

        // Check if user has administrator permissions
        if (!interaction.memberPermissions?.has('Administrator')) {
            await interaction.reply({ content: 'Only administrators can trigger deduplication!', ephemeral: true });
            return;
        }

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

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
};
