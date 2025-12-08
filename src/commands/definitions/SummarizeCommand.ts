import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';
import { logger } from '../../utils/logger';

export const SummarizeCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('summarize')
        .setDescription('Manually trigger context summarization for this server'),

    options: {
        timeout: 60000,
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
            await interaction.reply({ content: 'Only administrators can trigger manual summarization!', ephemeral: true });
            return;
        }

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

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
};
