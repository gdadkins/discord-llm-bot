import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const RememberCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('remember')
        .setDescription('Make the bot remember an embarrassing moment for a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remember something about')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('moment')
                .setDescription('The embarrassing moment to remember')
                .setRequired(true)
        ),

    options: {
        timeout: 30000,
        requiresDefer: false
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;
        const targetUser = interaction.options.getUser('user', true);
        const moment = interaction.options.getString('moment', true);

        if (!interaction.guildId) {
            await interaction.reply({ content: 'This command only works in servers!', ephemeral: true });
            return;
        }

        geminiService.addEmbarrassingMoment(interaction.guildId, targetUser.id, moment);

        await interaction.reply({
            content: `I'll remember that ${targetUser.username} ${moment}. This will come up later...`,
            ephemeral: false
        });
    }
};
