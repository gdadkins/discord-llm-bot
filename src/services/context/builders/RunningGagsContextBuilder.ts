/**
 * @file RunningGagsContextBuilder - Builder for running gags context
 * @module services/context/builders/RunningGagsContextBuilder
 */

import { BaseContextBuilder } from './BaseContextBuilder';

/**
 * Specialized builder for constructing running gags context.
 * Maintains server-specific humor patterns and recurring jokes.
 */
export class RunningGagsContextBuilder extends BaseContextBuilder {
  /**
   * Add server-specific running gags and recurring humor
   */
  public addRunningGags(): this {
    if (this.context.runningGags.length > 0) {
      this.addHeader('RUNNING GAGS TO REFERENCE:\n');
      
      const relevantGags = this.selectRelevantItems(
        this.context.runningGags,
        8
      );
      
      this.updateLRUPatterns(relevantGags);
      this.addItems(relevantGags);
      this.addSeparator();
    }
    return this;
  }

  /**
   * Builds and returns the running gags context
   */
  public build(): string {
    this.addRunningGags();
    return this.parts.join('');
  }
}