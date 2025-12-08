import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';
import { logger } from '../../utils/logger';
import { splitMessage } from '../../utils/messageSplitter';

export const AsciiCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('ascii')
        .setDescription('Generate ASCII art using AI')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('What you want to see in ASCII art')
                .setRequired(true)
        ),

    options: {
        timeout: 60000,
        requiresDefer: true
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const prompt = interaction.options.getString('prompt', true);
        const { geminiService } = services;

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        try {
            const asciiPrompt = `Create ASCII art of "${prompt}". Make it detailed and recognizable. Use only standard ASCII characters. Make it medium-sized (not too small, not too large). Focus on creating clear, recognizable shapes and patterns that represent "${prompt}".`;

            const response = await geminiService.generateResponse(
                asciiPrompt,
                interaction.user.id,
                interaction.guildId || undefined,
                undefined,
                undefined,
                interaction.member as GuildMember | undefined
            );

            // Wrap in code block to preserve ASCII formatting
            const formattedResponse = `Here's your ASCII art of **${prompt}**:\n\`\`\`\n${response}\n\`\`\``;

            const chunks = splitMessage(formattedResponse, 2000);

            // Send first chunk as initial reply
            await interaction.editReply(chunks[0]);

            // Send remaining chunks as follow-ups
            for (let i = 1; i < chunks.length; i++) {
                await interaction.followUp(chunks[i]);
            }
        } catch (error) {
            logger.error('Error generating ASCII art:', error);
            await interaction.editReply('Sorry, I encountered an error while generating ASCII art. Please try again later.');
        }
    }
};
