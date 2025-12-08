import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';
import { logger } from '../../utils/logger';

export const CrossServerCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('crossserver')
        .setDescription('Toggle cross-server context sharing')
        .addBooleanOption(option =>
            option.setName('enabled')
                .setDescription('Enable or disable cross-server context sharing')
                .setRequired(true)
        ),

    options: {
        timeout: 10000,
        requiresDefer: false,
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
};
