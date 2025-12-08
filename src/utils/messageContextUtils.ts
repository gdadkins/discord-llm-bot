import { logger } from './logger';

// Extract recent emojis from channel messages for context awareness
// Using a more flexible type to accommodate different channel types
export async function extractRecentEmojis(channel: unknown): Promise<string[]> {
    try {
        // Type guard to check if channel has messages property
        const ch = channel as { messages?: { fetch?: (options: { limit: number }) => Promise<Map<string, unknown>> } };

        if (!ch.messages || !ch.messages.fetch) {
            return [];
        }

        const messages = await ch.messages.fetch({ limit: 50 });
        const emojis: string[] = [];

        // Unicode emoji regex pattern
        const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E0}-\u{1F1FF}]/gu;

        // Custom Discord emoji pattern
        const customEmojiRegex = /<a?:[\w]+:\d+>/g;

        messages.forEach((msg) => {
            const message = msg as { content?: string; reactions?: { cache?: Map<string, unknown> } };
            if (!message.content) return;
            // Extract unicode emojis
            const unicodeEmojis = message.content.match(emojiRegex);
            if (unicodeEmojis) {
                emojis.push(...unicodeEmojis);
            }

            // Extract custom Discord emojis
            const customEmojis = message.content.match(customEmojiRegex);
            if (customEmojis) {
                emojis.push(...customEmojis);
            }

            // Check reactions
            if (message.reactions && message.reactions.cache) {
                message.reactions.cache.forEach((reaction) => {
                    const r = reaction as { emoji?: { id?: string; name?: string } };
                    if (!r.emoji) return;

                    const emoji = r.emoji;
                    if (emoji.id) {
                        // Custom emoji
                        emojis.push(`<:${emoji.name}:${emoji.id}>`);
                    } else if (emoji.name) {
                        // Unicode emoji
                        emojis.push(emoji.name);
                    }
                });
            }
        });

        // Return unique emojis, limited to 20 most recent
        const uniqueEmojis = [...new Set(emojis)];
        return uniqueEmojis.slice(0, 20);
    } catch (error) {
        logger.debug('Failed to extract recent emojis:', error);
        return [];
    }
}
