/**
 * @file ConversationMemoryService - Manages conversation history and memory items
 * @module services/context/ConversationMemoryService
 */

import { ContextItem, RichContext } from './types';

export class ConversationMemoryService {
  private readonly MAX_EMBARRASSING_MOMENTS = 60;
  private readonly MAX_CODE_SNIPPETS_PER_USER = 12;
  private readonly MAX_RUNNING_GAGS = 30;

  /**
   * Add an embarrassing moment to server context
   */
  public addEmbarrassingMoment(
    context: RichContext,
    userId: string,
    moment: string,
    semanticHash: string
  ): boolean {
    const now = Date.now();
    const content = `${userId}: ${moment}`;
    
    const momentItem: ContextItem = {
      content,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      relevanceScore: this.calculateRelevanceScore(content),
      importanceScore: this.calculateImportanceScore(content),
      semanticHash,
    };
    
    context.embarrassingMoments.push(momentItem);
    return true;
  }

  /**
   * Add a code snippet to user's collection
   */
  public addCodeSnippet(
    context: RichContext,
    userId: string,
    code: string,
    description: string,
    semanticHash: string
  ): boolean {
    if (!context.codeSnippets.has(userId)) {
      context.codeSnippets.set(userId, []);
    }
    
    const now = Date.now();
    const snippetContent = `${description}:\n${code}`;
    
    const snippetItem: ContextItem = {
      content: snippetContent,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      relevanceScore: this.calculateRelevanceScore(snippetContent),
      importanceScore: this.calculateImportanceScore(snippetContent),
      semanticHash,
    };
    
    const userSnippets = context.codeSnippets.get(userId)!;
    userSnippets.push(snippetItem);
    return true;
  }

  /**
   * Add a running gag to the context
   */
  public addRunningGag(
    context: RichContext,
    gag: string,
    semanticHash: string
  ): boolean {
    const now = Date.now();
    
    const gagItem: ContextItem = {
      content: gag,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      relevanceScore: this.calculateRelevanceScore(gag),
      importanceScore: this.calculateImportanceScore(gag),
      semanticHash,
    };
    
    context.runningGags.push(gagItem);
    return true;
  }

  /**
   * Add a summarized fact to the context
   */
  public addSummarizedFact(
    context: RichContext,
    fact: string,
    importance: number,
    semanticHash: string
  ): boolean {
    const now = Date.now();
    
    const factItem: ContextItem = {
      content: fact,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      relevanceScore: this.calculateRelevanceScore(fact),
      importanceScore: Math.max(importance / 10, this.calculateImportanceScore(fact)), // Normalize importance to 0-1 scale
      semanticHash,
    };
    
    context.summarizedFacts.push(factItem);
    return true;
  }

  /**
   * Select most relevant items for a user
   */
  public selectRelevantItems(
    items: ContextItem[],
    userId: string,
    maxItems: number
  ): ContextItem[] {
    if (items.length <= maxItems) {
      return items;
    }
    
    const scoredItems = items.map(item => {
      const lruScore = this.calculateLRUScore(item);
      const relevanceScore = item.relevanceScore || 0.5;
      const importanceScore = item.importanceScore || 0.3;
      
      // User-specific content gets bonus
      const userBonus = item.content.includes(userId) ? 0.2 : 0;
      
      // Combined score (lower is better for LRU, higher is better for relevance/importance)
      const combinedScore = (relevanceScore + importanceScore + userBonus) - (lruScore * 0.1);
      
      return { item, score: combinedScore };
    });
    
    // Sort by combined score (highest first) and take top items
    return scoredItems
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map(scored => scored.item);
  }

  /**
   * Get memory limits
   */
  public getMemoryLimits() {
    return {
      maxEmbarrassingMoments: this.MAX_EMBARRASSING_MOMENTS,
      maxCodeSnippetsPerUser: this.MAX_CODE_SNIPPETS_PER_USER,
      maxRunningGags: this.MAX_RUNNING_GAGS,
    };
  }

  /**
   * Calculate LRU score for trimming
   */
  public calculateLRUScore(item: ContextItem): number {
    const now = Date.now();
    const ageScore = (now - item.timestamp) / (1000 * 60 * 60 * 24); // Days old
    const accessScore = Math.max(0, 10 - item.accessCount); // Higher access count = lower score
    const recencyScore = (now - item.lastAccessed) / (1000 * 60 * 60); // Hours since last access
    
    // Lower score = more likely to be removed
    return ageScore + accessScore + (recencyScore * 0.1);
  }

  /**
   * Calculate relevance score for context items
   */
  private calculateRelevanceScore(content: string): number {
    let score = 0.5; // Base relevance
    
    // Length bonus (longer content often more relevant)
    if (content.length > 100) score += 0.1;
    if (content.length > 300) score += 0.1;
    
    // Code-related content gets higher relevance
    if (/\b(function|class|const|let|var|if|for|while)\b/i.test(content)) {
      score += 0.2;
    }
    
    // Error/problem mentions get higher relevance
    if (/\b(error|bug|issue|problem|fail|crash|break)\b/i.test(content)) {
      score += 0.15;
    }
    
    // User mention patterns get higher relevance
    if (/<@\d+>/.test(content)) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Calculate importance score for preserving key facts
   */
  private calculateImportanceScore(content: string): number {
    let score = 0.3; // Base importance
    
    // High importance indicators
    const highImportancePatterns = [
      /\b(always|never|every time|constantly|repeatedly)\b/i,
      /\b(mistake|error|wrong|incorrect|bad|terrible)\b/i,
      /\b(delet|remov|lost|crash|broken)/i,
      /\b(password|secret|private|confidential)\b/i,
    ];
    
    for (const pattern of highImportancePatterns) {
      if (pattern.test(content)) {
        score += 0.2;
      }
    }
    
    // Medium importance indicators
    const mediumImportancePatterns = [
      /\b(code|function|class|method|variable)\b/i,
      /\b(project|work|team|manager|boss)\b/i,
      /\b(said|told|mentioned|explained)\b/i,
    ];
    
    for (const pattern of mediumImportancePatterns) {
      if (pattern.test(content)) {
        score += 0.1;
      }
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Count items in context
   */
  public countItems(context: RichContext): {
    embarrassingMoments: number;
    codeSnippets: number;
    runningGags: number;
    summarizedFacts: number;
  } {
    let codeSnippetCount = 0;
    for (const snippets of context.codeSnippets.values()) {
      codeSnippetCount += snippets.length;
    }
    
    return {
      embarrassingMoments: context.embarrassingMoments.length,
      codeSnippets: codeSnippetCount,
      runningGags: context.runningGags.length,
      summarizedFacts: context.summarizedFacts.length,
    };
  }
}