import { Client, REST, Routes, Collection, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { Command } from './interfaces/Command';
import { BotServices } from '../core/botInitializer';
import { logger } from '../utils/logger';
import * as definitions from './definitions';
import { enrichError, getUserFriendlyMessage, createTimeoutPromise, isRetryableError } from '../utils/ErrorHandlingUtils';

export class CommandRegistry {
    private commands = new Collection<string, Command>();

    constructor() {
        this.registerAllDefinitions();
    }

    private registerAllDefinitions() {
        Object.values(definitions).forEach((cmd) => {
            // cmd might be the module export, so we need to check if it matches the Command interface
            // Since we export e.g. "export const ChatCommand: Command = ...", 
            // definitions will be an object with keys like "ChatCommand".
            // The value is the Command object.
            if (this.isCommand(cmd)) {
                this.registerCommand(cmd);
            }
        });
    }

    private isCommand(obj: any): obj is Command {
        return obj && obj.data && typeof obj.execute === 'function';
    }

    public registerCommand(command: Command) {
        this.commands.set(command.data.name, command);
        logger.debug(`Registered command: ${command.data.name}`);
    }

    public getCommand(name: string): Command | undefined {
        return this.commands.get(name);
    }

    public getAllCommands(): Command[] {
        return Array.from(this.commands.values());
    }

    public async registerCommandsWithDiscord(client: Client) {
        if (!client.token || !client.application) {
            logger.error('Client token or application ID missing for command registration');
            return;
        }

        const rest = new REST({ version: '10' }).setToken(client.token);
        const commandData = this.commands.map(cmd => cmd.data.toJSON());

        try {
            logger.info(`Started refreshing ${commandData.length} application (/) commands.`);

            await rest.put(
                Routes.applicationCommands(client.application.id),
                { body: commandData },
            );

            logger.info('Successfully reloaded application (/) commands.');
        } catch (error) {
            logger.error('Failed to reload application (/) commands:', error);
        }
    }

    public async handleCommand(interaction: ChatInputCommandInteraction, services: BotServices) {
        const command = this.commands.get(interaction.commandName);

        if (!command) {
            logger.warn(`No command matching ${interaction.commandName} was found.`);
            await interaction.reply({ content: 'Command not found available.', ephemeral: true });
            return;
        }

        const { timeout = 30000, requiresDefer = false, adminRequired = false } = command.options || {};
        const commandName = command.data.name;
        const requestId = `cmd_${interaction.id}_${Date.now()}`;
        const startTime = Date.now();

        try {
            // Check admin
            if (adminRequired) {
                const member = interaction.member;
                const isAdmin = member && typeof member.permissions !== 'string' &&
                    (member.permissions.has('Administrator') || member.permissions.has('ManageGuild'));

                if (!isAdmin) {
                    await interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
                    return;
                }
            }

            // Defer
            if (requiresDefer && !interaction.deferred && !interaction.replied) {
                await Promise.race([
                    interaction.deferReply(),
                    createTimeoutPromise(3000).then(() => {
                        throw enrichError(new Error('Failed to defer reply'), { operation: 'deferReply', commandName, requestId });
                    })
                ]);
            }

            // Execute
            await Promise.race([
                command.execute(interaction, services),
                createTimeoutPromise(timeout).then(() => {
                    throw enrichError(new Error('Command execution timeout'), { operation: 'command.execute', commandName, timeout, requestId });
                })
            ]);

            // Log success
            logger.info(`Command executed successfully: ${commandName}`, { duration: Date.now() - startTime, userId: interaction.user.id });

        } catch (error) {
            this.handleError(error, interaction, commandName, startTime, requestId);
        }
    }

    public async handleAutocomplete(interaction: AutocompleteInteraction, services: BotServices) {
        const command = this.commands.get(interaction.commandName);
        if (command && command.autocomplete) {
            try {
                await command.autocomplete(interaction, services);
            } catch (error) {
                logger.error(`Autocomplete error in ${interaction.commandName}:`, error);
            }
        }
    }

    private async handleError(error: any, interaction: ChatInputCommandInteraction, commandName: string, startTime: number, requestId: string) {
        const enrichedError = enrichError(error as Error, {
            commandName,
            userId: interaction.user.id,
            duration: Date.now() - startTime,
            requestId
        });

        logger.error('Command execution failed', { error: enrichedError });

        const errorMessage = getUserFriendlyMessage(enrichedError);

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (replyError) {
            logger.error('Failed to send error response', replyError);
        }
    }
}
