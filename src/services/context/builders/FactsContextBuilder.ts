/**
 * @file FactsContextBuilder - Builder for facts and relationships context
 * @module services/context/builders/FactsContextBuilder
 */

import { BaseContextBuilder } from './BaseContextBuilder';

/**
 * Specialized builder for constructing facts and relationships context.
 * Handles summarized facts with relevance scoring and LRU cache management.
 */
export class FactsContextBuilder extends BaseContextBuilder {
  /**
   * Add summarized facts with intelligent relevance scoring
   */
  public addFacts(): this {
    if (this.context.summarizedFacts.length > 0) {
      this.addHeader('KEY FACTS & RELATIONSHIPS:\n');
      
      const relevantFacts = this.selectRelevantItems(
        this.context.summarizedFacts,
        10
      );
      
      this.updateLRUPatterns(relevantFacts);
      this.addItems(relevantFacts);
      this.addSeparator();
    }
    return this;
  }

  /**
   * Builds and returns the facts context
   */
  public build(): string {
    this.addFacts();
    return this.parts.join('');
  }
}