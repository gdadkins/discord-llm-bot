import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';

export const StatusCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot status and remaining API quota'),

    options: {
        timeout: 15000,
        requiresDefer: false
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;

        // OPTIMIZATION: Fetch all stats in parallel
        const [quota, conversationStats, cacheStats, cachePerformance] = await Promise.all([
            Promise.resolve(geminiService.getRemainingQuota()),
            Promise.resolve(geminiService.getConversationStats()),
            Promise.resolve(geminiService.getCacheStats()),
            Promise.resolve(geminiService.getCachePerformance())
        ]);

        // Get current time and next reset times
        const now = new Date();
        const nextMinuteReset = new Date(now);
        nextMinuteReset.setMinutes(now.getMinutes() + 1, 0, 0);
        const nextDayReset = new Date(now);
        nextDayReset.setDate(now.getDate() + 1);
        nextDayReset.setHours(0, 0, 0, 0);

        const statusMessage = '**🤖 Bot Status**\n' +
            '📈 **API Usage:**\n' +
            `  - Minute remaining: ${quota.minuteRemaining}\n` +
            `  - Daily remaining: ${quota.dailyRemaining}\n` +
            `  - Minute resets: ${nextMinuteReset.toLocaleTimeString()}\n` +
            `  - Daily resets: ${nextDayReset.toLocaleString()}\n` +
            '\n💾 **Response Cache:**\n' +
            `  - API reduction: ${cachePerformance.reduction}%\n` +
            `  - Total hits: ${cacheStats.totalHits}\n` +
            `  - Total misses: ${cacheStats.totalMisses}\n` +
            `  - Avg lookup: ${cachePerformance.avgLookupTime}ms\n` +
            '\n🧠 **Conversation Memory:**\n' +
            `  - Active users: ${conversationStats.activeUsers}\n` +
            `  - Total messages: ${conversationStats.totalMessages}\n` +
            `  - Context size: ${(conversationStats.totalContextSize / 1024).toFixed(1)} KB\n` +
            `  - Session timeout: ${parseInt(process.env.CONVERSATION_TIMEOUT_MINUTES || '30')} minutes`;

        await interaction.reply({ content: statusMessage, flags: 64 }); // 64 = ephemeral flag
    }
};
