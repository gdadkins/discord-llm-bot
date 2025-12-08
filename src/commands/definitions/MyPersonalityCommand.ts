import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const MyPersonalityCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('mypersonality')
        .setDescription('Set your own personality descriptions')
        .addStringOption(option =>
            option.setName('description')
                .setDescription('The personality description about yourself')
                .setRequired(true)
        ),

    options: {
        timeout: 30000,
        requiresDefer: false
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;
        const description = interaction.options.getString('description', true);

        const personalityManager = geminiService.getPersonalityManager();
        const result = await personalityManager.addPersonalityDescription(
            interaction.user.id,
            description,
            interaction.user.id
        );

        await interaction.reply({
            content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
            ephemeral: true
        });
    }
};
