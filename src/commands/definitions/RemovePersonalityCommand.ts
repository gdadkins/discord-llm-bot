import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const RemovePersonalityCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('removepersonality')
        .setDescription('Remove a personality description')
        .addStringOption(option =>
            option.setName('description')
                .setDescription('The exact description to remove')
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove description from (Admin only)')
                .setRequired(false)
        ),

    options: {
        timeout: 30000,
        requiresDefer: false
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;
        const description = interaction.options.getString('description', true);
        const targetUser = interaction.options.getUser('user') || interaction.user;

        // Check permissions if trying to modify someone else
        // We can't use adminRequired option easily here because it's conditional.
        // So we check manually.
        const isSelf = targetUser.id === interaction.user.id;

        if (!isSelf) {
            // Check admin permissions
            // We need to implement checking. 
            // For now assume if they pass non-self user they must be admin? 
            // Handlers had: if (!hasAdminPermissions) return;
            const member = interaction.member;
            const isAdmin = member && typeof member.permissions !== 'string' && (member.permissions.has('Administrator') || member.permissions.has('ManageGuild'));

            if (!isAdmin) {
                await interaction.reply({
                    content: 'You can only remove descriptions from your own personality profile!',
                    ephemeral: true
                });
                return;
            }
        }

        const personalityManager = geminiService.getPersonalityManager();
        const result = await personalityManager.removePersonalityDescription(
            targetUser.id,
            description,
            interaction.user.id
        );

        await interaction.reply({
            content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
            ephemeral: true
        });
    }
};
