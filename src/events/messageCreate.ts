import { Message } from 'discord.js';
import { logger } from '../utils/logger';
import { ContextManager } from '../services/context/ContextManager';

/**
 * Handles message create events for social dynamics tracking
 */
export async function handleMessageCreate(
  message: Message,
  contextManager: ContextManager
): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Ignore DMs
  if (!message.guild) return;
  
  const serverId = message.guild.id;
  const userId = message.author.id;
  
  try {
    // Track mentions
    if (message.mentions.users.size > 0) {
      for (const [mentionedId] of message.mentions.users) {
        // Don't track self-mentions
        if (mentionedId !== userId) {
          contextManager.updateSocialGraph(serverId, userId, mentionedId, 'mention');
        }
      }
    }
    
    // Track replies
    if (message.reference && message.reference.messageId) {
      try {
        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
        if (repliedMessage && repliedMessage.author.id !== userId) {
          contextManager.updateSocialGraph(serverId, userId, repliedMessage.author.id, 'reply');
        }
      } catch (error) {
        logger.error('Failed to fetch replied message:', error);
      }
    }
    
    // Track roasts (this will be called from the main bot logic when a roast is delivered)
    // The main bot will need to call this method when it generates a roast response
    
  } catch (error) {
    logger.error('Error in social dynamics tracking:', error);
  }
}

/**
 * Track a roast interaction (to be called from main bot logic)
 */
export function trackRoast(
  serverId: string,
  botId: string,
  targetUserId: string,
  contextManager: ContextManager
): void {
  try {
    contextManager.updateSocialGraph(serverId, botId, targetUserId, 'roast');
    logger.info(`Tracked roast from bot to ${targetUserId} in server ${serverId}`);
  } catch (error) {
    logger.error('Error tracking roast:', error);
  }
}