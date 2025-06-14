/**
 * @file EmbarrassingMomentsContextBuilder - Builder for embarrassing moments context
 * @module services/context/builders/EmbarrassingMomentsContextBuilder
 */

import { BaseContextBuilder } from './BaseContextBuilder';

/**
 * Specialized builder for constructing embarrassing moments context.
 * Provides user-specific moments for the bot's roasting capabilities.
 */
export class EmbarrassingMomentsContextBuilder extends BaseContextBuilder {
  /**
   * Add user-specific embarrassing moments with relevance filtering
   */
  public addEmbarrassingMoments(): this {
    if (this.context.embarrassingMoments.length > 0) {
      this.addHeader('HALL OF SHAME:\n');
      
      const relevantMoments = this.selectRelevantItems(
        this.context.embarrassingMoments,
        15
      );
      
      this.updateLRUPatterns(relevantMoments);
      this.addItems(relevantMoments);
      this.addSeparator();
    }
    return this;
  }

  /**
   * Builds and returns the embarrassing moments context
   */
  public build(): string {
    this.addEmbarrassingMoments();
    return this.parts.join('');
  }
}