import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const HelpCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with bot commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Specific command to get help for')
                .setAutocomplete(true)
                .setRequired(false)
        ),

    options: {
        timeout: 10000,
        requiresDefer: false
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const commandName = interaction.options.getString('command');

        if (commandName) {
            const command = services.commandRegistry.getCommand(commandName);
            if (command) {
                const embed = new EmbedBuilder()
                    .setTitle(`Help: /${commandName}`)
                    .setDescription(command.data.description)
                    .setColor(0x00ff00);

                if (command.options?.adminRequired) {
                    embed.addFields({ name: 'Permissions', value: 'Requires Administrator', inline: true });
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ content: `Command /${commandName} not found.`, ephemeral: true });
            }
        } else {
            // List all commands
            const commands = services.commandRegistry.getAllCommands();
            const embed = new EmbedBuilder()
                .setTitle('🤖 Bot Commands')
                .setDescription('Here are the available commands:')
                .setColor(0x0099ff);

            const commandList = commands.map(cmd => `**/${cmd.data.name}**: ${cmd.data.description}`).join('\n');

            // Split if too long (simple check, assume it fits for now or user will split)
            if (commandList.length > 2000) {
                embed.setDescription(commandList.slice(0, 2000) + '...');
            } else {
                embed.setDescription(commandList);
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async autocomplete(interaction: AutocompleteInteraction, services: BotServices): Promise<void> {
        const focusedValue = interaction.options.getFocused();
        const commands = services.commandRegistry.getAllCommands();
        const filtered = commands
            .filter(cmd => cmd.data.name.startsWith(focusedValue))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(cmd => ({ name: cmd.data.name, value: cmd.data.name }))
        );
    }
};
