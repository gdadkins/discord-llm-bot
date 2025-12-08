import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const SetPersonalityCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('setpersonality')
        .setDescription('Set personality for a user (Admin only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to set personality for')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('The personality description')
                .setRequired(true)
        ),

    options: {
        timeout: 30000,
        requiresDefer: false,
        adminRequired: true
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;
        const targetUser = interaction.options.getUser('user', true);
        const description = interaction.options.getString('description', true);

        // Permissions check is handled by wrapper/registry based on adminRequired, 
        // but legacy handler checked it manually. Registry should handle it.

        const personalityManager = geminiService.getPersonalityManager();
        const result = await personalityManager.addPersonalityDescription(
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
