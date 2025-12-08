/**
 * @file CodeSnippetsContextBuilder - Builder for code snippets context
 * @module services/context/builders/CodeSnippetsContextBuilder
 */

import { BaseContextBuilder } from './BaseContextBuilder';

/**
 * Specialized builder for constructing code snippets context.
 * Handles user-specific code submissions with quality assessment.
 */
export class CodeSnippetsContextBuilder extends BaseContextBuilder {
  /**
   * Add user-specific code snippets with quality assessment
   */
  public addCodeSnippets(): this {
    const userCode = this.context.codeSnippets.get(this.userId);
    
    if (userCode && userCode.length > 0) {
      this.addHeader(`${this.userId}'S TERRIBLE CODE HISTORY:\n`);
      
      const relevantCode = this.selectRelevantItems(
        userCode,
        10
      );
      
      this.updateLRUPatterns(relevantCode);
      
      relevantCode.forEach(snippetItem => {
        this.parts.push(`${snippetItem.content}\n---\n`);
      });
    }
    return this;
  }

  /**
   * Builds and returns the code snippets context
   */
  public build(): string {
    this.addCodeSnippets();
    return this.parts.join('');
  }
}