/**
 * @file BehaviorContextBuilder - Builder for user behavior context
 * @module services/context/builders/BehaviorContextBuilder
 */

import { BaseContextBuilder } from './BaseContextBuilder';
import { BehaviorAnalyzer } from '../../analytics/behavior/BehaviorAnalyzer';
import { RichContext } from '../types';
import { ConversationMemoryService } from '../ConversationMemoryService';

/**
 * Specialized builder for constructing user behavior pattern context.
 * Integrates with BehaviorAnalyzer service for pattern analysis.
 */
export class BehaviorContextBuilder extends BaseContextBuilder {
  private behaviorAnalyzer: BehaviorAnalyzer;

  constructor(
    context: RichContext,
    userId: string,
    serverId: string,
    conversationMemoryService: ConversationMemoryService,
    behaviorAnalyzer: BehaviorAnalyzer
  ) {
    super(context, userId, serverId, conversationMemoryService);
    this.behaviorAnalyzer = behaviorAnalyzer;
  }

  /**
   * Add user behavior patterns and analysis
   */
  public addBehavior(): this {
    const behaviorContext = this.behaviorAnalyzer.getBehaviorContext(this.userId);
    
    if (behaviorContext) {
      this.parts.push(behaviorContext);
      this.addSeparator();
    }
    
    return this;
  }

  /**
   * Builds and returns the behavior context
   */
  public build(): string {
    this.addBehavior();
    return this.parts.join('');
  }
}