import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const GetPersonalityCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('getpersonality')
        .setDescription('View personality profile for a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to view (defaults to yourself)')
                .setRequired(false)
        ),

    options: {
        timeout: 30000,
        requiresDefer: false
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;
        const targetUser = interaction.options.getUser('user') || interaction.user;

        const personalityManager = geminiService.getPersonalityManager();
        const personality = personalityManager.getPersonality(targetUser.id);

        if (!personality || personality.descriptions.length === 0) {
            await interaction.reply({
                content: `${targetUser.id === interaction.user.id ? 'You have' : `${targetUser.username} has`} no personality descriptions set.`,
                ephemeral: true
            });
            return;
        }

        let message = `**Personality Profile for ${targetUser.username}:**\n\n`;

        personality.descriptions.forEach((description, index) => {
            message += `${index + 1}. ${description}\n`;
        });

        message += `\n*Last updated: ${new Date(personality.lastUpdated).toLocaleString()}*`;
        message += `\n*Total descriptions: ${personality.descriptions.length}*`;

        await interaction.reply({ content: message, ephemeral: true });
    }
};
