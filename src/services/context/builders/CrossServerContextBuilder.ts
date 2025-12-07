/**
 * @file CrossServerContextBuilder - Builder for cross-server context
 * @module services/context/builders/CrossServerContextBuilder
 */

import { BaseContextBuilder } from './BaseContextBuilder';
import { RichContext } from '../types';
import { ConversationMemoryService } from '../ConversationMemoryService';

/**
 * Specialized builder for constructing cross-server context.
 * Handles privacy controls and content filtering for multi-server data.
 */
export class CrossServerContextBuilder extends BaseContextBuilder {
  private serverContext: Map<string, RichContext>;

  constructor(
    context: RichContext,
    userId: string,
    serverId: string,
    conversationMemoryService: ConversationMemoryService,
    serverContext: Map<string, RichContext>
  ) {
    super(context, userId, serverId, conversationMemoryService);
    this.serverContext = serverContext;
  }

  /**
   * Add cross-server context data with privacy controls
   */
  public addCrossServerContext(): this {
    if (this.context.crossServerEnabled) {
      const crossServerContext = this.buildCrossServerContext(
        this.userId,
        this.serverId
      );
      
      if (crossServerContext) {
        this.addHeader('CROSS-SERVER INTELLIGENCE:\n');
        this.parts.push(crossServerContext);
        this.addSeparator();
      }
    }
    return this;
  }

  /**
   * Builds cross-server context with privacy filters
   */
  private buildCrossServerContext(
    userId: string,
    excludeServerId: string
  ): string {
    const crossServerFacts: string[] = [];

    for (const [serverId, context] of this.serverContext.entries()) {
      if (serverId === excludeServerId || !context.crossServerEnabled) {
        continue;
      }

      const userMoments = context.embarrassingMoments
        .filter(item => item.content.includes(userId))
        .slice(0, 2);

      userMoments.forEach(moment => {
        crossServerFacts.push(`[Server ${serverId}] ${moment.content}`);
      });

      const userCode = context.codeSnippets.get(userId);
      if (userCode && userCode.length > 0) {
        const recentCode = userCode
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 1);

        recentCode.forEach(code => {
          crossServerFacts.push(
            `[Server ${serverId}] Code: ${code.content.substring(0, 100)}...`
          );
        });
      }
    }

    return crossServerFacts.length > 0
      ? crossServerFacts.join('\n') + '\n'
      : '';
  }

  /**
   * Builds and returns the cross-server context
   */
  public build(): string {
    this.addCrossServerContext();
    return this.parts.join('');
  }
}