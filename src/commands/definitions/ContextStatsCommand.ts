import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';
import { logger } from '../../utils/logger';

export const ContextStatsCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('contextstats')
        .setDescription('View context memory statistics'),

    options: {
        timeout: 30000,
        requiresDefer: true
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;

        if (!interaction.guildId) {
            await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
            return;
        }

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        try {
            const contextManager = geminiService.getContextManager();

            // OPTIMIZATION: Fetch both stats in parallel
            const [stats, serverStats] = await Promise.all([
                Promise.resolve(contextManager.getMemoryStats()),
                Promise.resolve(contextManager.getServerCompressionStats(interaction.guildId))
            ]);

            const embed = {
                title: '📊 Advanced Context Statistics',
                color: 0x00ff00,
                fields: [
                    {
                        name: '🌐 Global Statistics',
                        value: `**Servers:** ${stats.totalServers}\n**Total Memory:** ${(stats.totalMemoryUsage / 1024).toFixed(2)}KB\n**Average Server Size:** ${(stats.averageServerSize / 1024).toFixed(2)}KB\n**Largest Server:** ${(stats.largestServerSize / 1024).toFixed(2)}KB`,
                        inline: true
                    },
                    {
                        name: '📈 Item Counts',
                        value: `**Embarrassing Moments:** ${stats.itemCounts.embarrassingMoments}\n**Code Snippets:** ${stats.itemCounts.codeSnippets}\n**Running Gags:** ${stats.itemCounts.runningGags}\n**Summarized Facts:** ${stats.itemCounts.summarizedFacts}`,
                        inline: true
                    },
                    {
                        name: '🗜️ Compression Stats',
                        value: `**Avg Compression:** ${(stats.compressionStats.averageCompressionRatio * 100).toFixed(1)}%\n**Memory Saved:** ${(stats.compressionStats.totalMemorySaved / 1024).toFixed(2)}KB\n**Duplicates Removed:** ${stats.compressionStats.duplicatesRemoved}`,
                        inline: true
                    }
                ],
                footer: { text: 'Memory optimization saves space while preserving conversation quality' }
            };

            if (serverStats) {
                embed.fields.push({
                    name: '🏠 This Server',
                    value: `**Compression Ratio:** ${(serverStats.compressionRatio * 100).toFixed(1)}%\n**Memory Saved:** ${(serverStats.memorySaved / 1024).toFixed(2)}KB`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error getting context stats:', error);
            await interaction.editReply('Sorry, I encountered an error while retrieving context statistics.');
        }
    }
};
