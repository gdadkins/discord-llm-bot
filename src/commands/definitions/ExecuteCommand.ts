import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';
import { logger } from '../../utils/logger';
import { splitMessage } from '../../utils/messageSplitter';
import { globalPools } from '../../utils/PromisePool';

export const ExecuteCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('execute')
        .setDescription('Execute code using the AI')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('The Python code or problem to execute')
                .setRequired(true)
        ),

    options: {
        timeout: 60000,
        requiresDefer: true
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const code = interaction.options.getString('code', true);
        const { geminiService } = services;

        // Check if code execution is enabled
        // Note: In strict DI, this might come from ConfigManager, but legacy used process.env
        if (process.env.ENABLE_CODE_EXECUTION !== 'true') {
            await interaction.reply({
                content: 'Code execution is not enabled. Set ENABLE_CODE_EXECUTION=true in your .env file to use this feature.',
                ephemeral: true
            });
            return;
        }

        // Interaction is deferred by the wrapper in CommandHandler/Registry if options.requiresDefer is true
        // But my execute method is called AFTER deferral usually? 
        // Wait, the new registry handles deferral?
        // Let's assume the caller handles deferral if I specified requiresDefer: true.
        // However, the original code called `deferReply()` inside.
        // If I put `requiresDefer: true` in options, my Registry/Dispatcher should handle it.
        // For safety, I'll check if deferred.

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        try {
            // Format the prompt to request code execution
            const prompt = `Please execute the following Python code or solve this math problem:\n\n${code}\n\nIf this is a math problem, write Python code to solve it and show the result.`;

            // OPTIMIZATION: Use promise pool for Gemini API calls
            const response = await globalPools.gemini.execute(() =>
                geminiService.generateResponse(
                    prompt,
                    interaction.user.id,
                    interaction.guildId || undefined,
                    undefined,
                    undefined,
                    interaction.member as GuildMember | undefined
                )
            );

            const chunks = splitMessage(response, 2000);

            // Send first chunk as initial reply
            await interaction.editReply(chunks[0]);

            // Send remaining chunks as follow-ups
            for (let i = 1; i < chunks.length; i++) {
                await interaction.followUp(chunks[i]);
            }
        } catch (error) {
            logger.error('Error executing code:', error);
            await interaction.editReply('Sorry, I encountered an error while executing the code. Please try again later.');
        }
    }
};
