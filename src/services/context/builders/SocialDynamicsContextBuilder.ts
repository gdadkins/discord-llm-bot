/**
 * @file SocialDynamicsContextBuilder - Builder for social dynamics context
 * @module services/context/builders/SocialDynamicsContextBuilder
 */

import { BaseContextBuilder } from './BaseContextBuilder';
import { SocialDynamicsService } from '../SocialDynamicsService';
import { RichContext } from '../types';
import { ConversationMemoryService } from '../ConversationMemoryService';

/**
 * Specialized builder for constructing social interaction context.
 * Integrates with SocialDynamicsService for relationship analysis.
 */
export class SocialDynamicsContextBuilder extends BaseContextBuilder {
  private socialDynamicsService: SocialDynamicsService;

  constructor(
    context: RichContext,
    userId: string,
    serverId: string,
    conversationMemoryService: ConversationMemoryService,
    socialDynamicsService: SocialDynamicsService
  ) {
    super(context, userId, serverId, conversationMemoryService);
    this.socialDynamicsService = socialDynamicsService;
  }

  /**
   * Add social interaction patterns and relationship context
   */
  public addSocialDynamics(): this {
    const socialDynamicsContext = this.socialDynamicsService.buildSocialDynamicsContext(
      this.context,
      this.userId
    );
    
    if (socialDynamicsContext) {
      this.parts.push(socialDynamicsContext);
    }
    
    return this;
  }

  /**
   * Builds and returns the social dynamics context
   */
  public build(): string {
    this.addSocialDynamics();
    return this.parts.join('');
  }
}