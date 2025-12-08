import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType, GuildMember } from 'discord.js';
import { Command } from '../interfaces/Command';
import { BotServices } from '../../core/botInitializer';
import { logger } from '../../utils/logger';
import { splitMessage } from '../../utils/messageSplitter';
import { extractRecentEmojis } from '../../utils/messageContextUtils';
import { MessageContext } from '../interfaces/MessageContext';

export const ChatCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Chat with the AI')
        .addStringOption((option) =>
            option
                .setName('message')
                .setDescription('Your message to the AI')
                .setRequired(true),
        ),

    options: {
        timeout: 60000,
        requiresDefer: true
    },

    async execute(interaction: ChatInputCommandInteraction, services: BotServices): Promise<void> {
        const { geminiService } = services;
        const prompt = interaction.options.getString('message');

        if (!prompt) {
            throw new Error('No message provided');
        }

        try {
            // OPTIMIZED: Build message context with parallel operations
            let messageContext: MessageContext | undefined;
            try {
                if (interaction.channel) {
                    const channel = interaction.channel;
                    let channelType = 'other';
                    if (channel.type === ChannelType.GuildText) channelType = 'text';
                    else if (channel.type === ChannelType.GuildVoice) channelType = 'voice';
                    else if (channel.type === ChannelType.PublicThread) channelType = 'thread';
                    else if (channel.type === ChannelType.PrivateThread) channelType = 'thread';
                    else if (channel.type === ChannelType.DM) channelType = 'dm';

                    // OPTIMIZATION: Parallel fetch for emojis and pinned messages
                    const contextPromises: Promise<any>[] = [
                        extractRecentEmojis(channel)
                    ];

                    // Add pinned messages fetch if applicable
                    if ('messages' in channel && typeof channel.messages.fetchPins === 'function') {
                        contextPromises.push(
                            channel.messages.fetchPins().catch(err => {
                                logger.debug('Failed to fetch pinned messages:', err);
                                return { size: 0 };
                            })
                        );
                    }

                    const [recentEmojis, pins] = await Promise.all(contextPromises);

                    messageContext = {
                        channelName: 'name' in channel && channel.name ? String(channel.name) : 'DM',
                        channelType: channelType,
                        isThread: channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread,
                        threadName: (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) && 'name' in channel && channel.name ? String(channel.name) : undefined,
                        lastActivity: 'lastMessageAt' in channel && channel.lastMessageAt instanceof Date ? channel.lastMessageAt : new Date(),
                        pinnedCount: pins?.items?.length || 0,
                        attachments: [], // Slash commands don't have attachments in the same way
                        recentEmojis
                    };
                }
            } catch (contextError) {
                logger.debug('Failed to build message context for slash command:', contextError);
            }

            const response = await geminiService.generateResponse(
                prompt,
                interaction.user.id,
                interaction.guildId || undefined,
                undefined,
                messageContext,
                interaction.member as GuildMember | undefined
            );

            const chunks = splitMessage(response, 2000);

            // Send first chunk as initial reply
            // Note: wrapCommandHandler handles the initial deferReply if requiresDefer is true
            // But we need to use editReply because it's deferred
            await interaction.editReply(chunks[0]);

            // Send remaining chunks as follow-ups
            for (let i = 1; i < chunks.length; i++) {
                await interaction.followUp(chunks[i]);
            }
        } catch (contextError) {
            logger.debug('Failed to build complete message context:', contextError);
            // Continue with limited context - this is not a critical failure
            // Re-throw if it wasn't a context error
            if (contextError instanceof Error && contextError.message !== 'No message provided') {
                throw contextError;
            }
        }
    }
};
