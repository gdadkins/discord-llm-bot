import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const AddGagCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('addgag')
        .setDescription('Add a running gag to the server context')
        .addStringOption(option =>
            option.setName('gag')
                .setDescription('The running gag or inside joke')
                .setRequired(true)
        ),

    options: {
        timeout: 30000,
        requiresDefer: false
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;
        const gag = interaction.options.getString('gag', true);

        if (!interaction.guildId) {
            await interaction.reply({ content: 'This command only works in servers!', ephemeral: true });
            return;
        }

        geminiService.addRunningGag(interaction.guildId, gag);

        await interaction.reply({
            content: `Added to the server's running gags: "${gag}"`,
            ephemeral: false
        });
    }
};
