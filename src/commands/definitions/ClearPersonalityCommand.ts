import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const ClearPersonalityCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('clearpersonality')
        .setDescription('Clear all personality descriptions')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to clear (Admin only)')
                .setRequired(false)
        ),

    options: {
        timeout: 30000,
        requiresDefer: false
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;
        const targetUser = interaction.options.getUser('user') || interaction.user;

        // Check permissions if trying to modify someone else
        const isSelf = targetUser.id === interaction.user.id;
        if (!isSelf) {
            const member = interaction.member;
            const isAdmin = member && typeof member.permissions !== 'string' && (member.permissions.has('Administrator') || member.permissions.has('ManageGuild'));

            if (!isAdmin) {
                await interaction.reply({
                    content: 'You can only clear your own personality profile!',
                    ephemeral: true
                });
                return;
            }
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
};
