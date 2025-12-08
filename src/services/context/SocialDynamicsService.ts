/**
 * @file SocialDynamicsService - Manages social graphs and user interactions
 * @module services/context/SocialDynamicsService
 */

import { logger } from '../../utils/logger';
import { SocialGraph, RichContext } from './types';

export class SocialDynamicsService {
  /**
   * Update social graph with an interaction between users
   */
  public updateSocialGraph(
    context: RichContext,
    userId: string,
    targetUserId: string,
    interactionType: 'mention' | 'reply' | 'roast'
  ): void {
    // Get or create social graph for the user
    if (!context.socialGraph.has(userId)) {
      context.socialGraph.set(userId, {
        interactions: new Map(),
        mentions: new Map(),
        roasts: new Map(),
        lastInteraction: new Map(),
      });
    }
    
    const userGraph = context.socialGraph.get(userId)!;
    const now = new Date();
    
    // Update interaction count
    userGraph.interactions.set(
      targetUserId,
      (userGraph.interactions.get(targetUserId) || 0) + 1
    );
    
    // Update specific interaction type
    switch (interactionType) {
    case 'mention':
      userGraph.mentions.set(
        targetUserId,
        (userGraph.mentions.get(targetUserId) || 0) + 1
      );
      break;
    case 'roast':
      userGraph.roasts.set(
        targetUserId,
        (userGraph.roasts.get(targetUserId) || 0) + 1
      );
      break;
    }
    
    // Update last interaction time
    userGraph.lastInteraction.set(targetUserId, now);
    
    logger.info(`Updated social graph: ${userId} ${interactionType} ${targetUserId}`);
  }

  /**
   * Get top interactions for a user
   */
  public getTopInteractions(
    context: RichContext,
    userId: string,
    limit: number = 5
  ): Array<{ userId: string; count: number; type: string }> {
    if (!context.socialGraph.has(userId)) {
      return [];
    }
    
    const userGraph = context.socialGraph.get(userId)!;
    const interactions: Array<{ userId: string; count: number; type: string }> = [];
    
    // Collect all interactions with types
    for (const [targetUserId, count] of userGraph.interactions.entries()) {
      const mentionCount = userGraph.mentions.get(targetUserId) || 0;
      const roastCount = userGraph.roasts.get(targetUserId) || 0;
      
      let primaryType = 'interaction';
      if (roastCount > mentionCount) {
        primaryType = 'roast target';
      } else if (mentionCount > 0) {
        primaryType = 'frequent mention';
      }
      
      interactions.push({
        userId: targetUserId,
        count,
        type: primaryType
      });
    }
    
    // Sort by count and return top N
    return interactions
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get recent interactions for including in context
   */
  public getRecentInteractions(
    context: RichContext,
    userId: string,
    hoursAgo: number = 24
  ): string[] {
    if (!context.socialGraph.has(userId)) {
      return [];
    }
    
    const userGraph = context.socialGraph.get(userId)!;
    const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
    const recentInteractions: string[] = [];
    
    for (const [targetUserId, lastInteraction] of userGraph.lastInteraction.entries()) {
      if (lastInteraction.getTime() > cutoffTime) {
        const mentionCount = userGraph.mentions.get(targetUserId) || 0;
        const roastCount = userGraph.roasts.get(targetUserId) || 0;
        
        if (mentionCount > 0 || roastCount > 0) {
          recentInteractions.push(`Recently interacted with <@${targetUserId}> (${mentionCount} mentions, ${roastCount} roasts)`);
        }
      }
    }
    
    return recentInteractions;
  }

  /**
   * Get social graph for a user
   */
  public getSocialGraph(context: RichContext, userId: string): SocialGraph | null {
    return context.socialGraph.get(userId) || null;
  }

  /**
   * Calculate social graph storage size
   */
  public calculateSocialGraphSize(context: RichContext): number {
    let totalSize = 0;
    
    for (const [, userGraph] of context.socialGraph) {
      const graphSize = JSON.stringify({
        interactions: Array.from(userGraph.interactions.entries()),
        mentions: Array.from(userGraph.mentions.entries()),
        roasts: Array.from(userGraph.roasts.entries()),
        lastInteraction: Array.from(userGraph.lastInteraction.entries()),
      }).length;
      totalSize += graphSize;
    }
    
    return totalSize;
  }

  /**
   * Build social dynamics context string
   */
  public buildSocialDynamicsContext(
    context: RichContext,
    userId: string
  ): string {
    const parts: string[] = [];
    
    const topInteractions = this.getTopInteractions(context, userId, 5);
    if (topInteractions.length > 0) {
      parts.push('SOCIAL DYNAMICS:\n');
      topInteractions.forEach(({ userId: targetId, count, type }) => {
        parts.push(`- Frequently interacts with <@${targetId}> (${count} times, ${type})\n`);
      });
      
      // Add recent interactions
      const recentInteractions = this.getRecentInteractions(context, userId, 24);
      if (recentInteractions.length > 0) {
        parts.push('\nRECENT ACTIVITY (last 24h):\n');
        recentInteractions.forEach(interaction => {
          parts.push(`- ${interaction}\n`);
        });
      }
    }
    
    return parts.join('');
  }

  /**
   * Clear social graph for a server
   */
  public clearSocialGraph(context: RichContext): void {
    context.socialGraph.clear();
    logger.info('Social graph cleared');
  }

  /**
   * Get social graph statistics
   */
  public getSocialGraphStats(context: RichContext): {
    totalUsers: number;
    totalInteractions: number;
    averageInteractionsPerUser: number;
  } {
    let totalInteractions = 0;
    
    for (const [, userGraph] of context.socialGraph) {
      for (const count of userGraph.interactions.values()) {
        totalInteractions += count;
      }
    }
    
    const totalUsers = context.socialGraph.size;
    
    return {
      totalUsers,
      totalInteractions,
      averageInteractionsPerUser: totalUsers > 0 ? totalInteractions / totalUsers : 0,
    };
  }
}