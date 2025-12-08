import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { BotServices } from '../../core/botInitializer';

export interface CommandOptions {
    timeout?: number;
    requiresDefer?: boolean;
    adminRequired?: boolean;
}

export interface Command {
    /**
     * Discord Slash Command Builder definition
     */
    data:
    | SlashCommandBuilder
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;

    /**
     * Command execution options
     */
    options?: CommandOptions;

    /**
     * Execution logic for the command
     */
    execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void>;

    /**
     * Optional autocomplete handler
     */
    autocomplete?(interaction: AutocompleteInteraction, services: BotServices): Promise<void>;
}
