/**
 * @file MemoryOptimizationService - Handles memory optimization, compression, and deduplication
 * @module services/context/MemoryOptimizationService
 */

import { logger } from '../../utils/logger';
import { ContextItem, RichContext } from './types';
import { ConversationMemoryService } from './ConversationMemoryService';

export class MemoryOptimizationService {
  private readonly MAX_CONTEXT_SIZE = 300000;
  private readonly MAX_SUMMARIZED_FACTS = 50;
  private readonly SIMILARITY_THRESHOLD = 0.8;
  private readonly SIZE_UPDATE_INTERVAL = 60000; // 1 minute
  private readonly SUMMARIZATION_INTERVAL = 1800000; // 30 minutes
  
  private conversationMemoryService: ConversationMemoryService;

  constructor(conversationMemoryService: ConversationMemoryService) {
    this.conversationMemoryService = conversationMemoryService;
  }

  /**
   * Generate semantic hash for duplicate detection
   */
  public generateSemanticHash(content: string): string {
    // Simple content-based hash using length and key words
    const normalized = content.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const words = normalized.split(/\s+/).filter(w => w.length > 3);
    const keyWords = words.slice(0, 5).sort().join('');
    return `${normalized.length}_${keyWords}`;
  }

  /**
   * Find similar messages based on semantic similarity
   */
  public findSimilarMessages(
    items: ContextItem[],
    content: string,
    threshold: number = this.SIMILARITY_THRESHOLD
  ): ContextItem[] {
    const targetHash = this.generateSemanticHash(content);
    const targetWords = content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    return items.filter(item => {
      if (item.semanticHash === targetHash) {
        return true; // Exact semantic match
      }
      
      // Check word overlap for similarity
      const itemWords = item.content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const overlap = targetWords.filter(word => itemWords.includes(word)).length;
      const similarity = overlap / Math.max(targetWords.length, itemWords.length);
      
      return similarity >= threshold;
    });
  }

  /**
   * Intelligent trimming of context based on size
   */
  public intelligentTrim(context: RichContext): void {
    // Use cached size instead of recalculating
    if (context.approximateSize <= this.MAX_CONTEXT_SIZE) {
      return;
    }

    logger.info(`Context size ${context.approximateSize} exceeds limit, performing intelligent trim`);
    
    const sizeBefore = context.approximateSize;
    const limits = this.conversationMemoryService.getMemoryLimits();
    
    // 1. Trim embarrassing moments using LRU
    if (context.embarrassingMoments.length > limits.maxEmbarrassingMoments) {
      this.trimEmbarrassingMomentsLRU(context, limits.maxEmbarrassingMoments);
    }

    // 2. Trim code snippets per user using LRU
    for (const [userId, snippets] of context.codeSnippets.entries()) {
      if (snippets.length > limits.maxCodeSnippetsPerUser) {
        this.trimCodeSnippetsLRU(context, userId, limits.maxCodeSnippetsPerUser);
      }
    }

    // 3. Trim running gags using LRU
    if (context.runningGags.length > limits.maxRunningGags) {
      this.trimRunningGagsLRU(context, limits.maxRunningGags);
    }

    // 4. If still too large, aggressive trimming
    if (context.approximateSize > this.MAX_CONTEXT_SIZE) {
      this.aggressiveTrim(context, limits);
    }

    logger.info(`Trim complete: ${sizeBefore} -> ${context.approximateSize} characters`);
  }

  /**
   * Trim embarrassing moments using LRU algorithm
   */
  private trimEmbarrassingMomentsLRU(context: RichContext, maxItems: number): void {
    // Sort by combined score: age and access frequency
    context.embarrassingMoments.sort((a, b) => {
      const scoreA = this.conversationMemoryService.calculateLRUScore(a);
      const scoreB = this.conversationMemoryService.calculateLRUScore(b);
      return scoreA - scoreB; // Lower score = more likely to be removed
    });
    
    const toRemove = context.embarrassingMoments.length - maxItems;
    for (let i = 0; i < toRemove; i++) {
      const removed = context.embarrassingMoments.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
  }

  /**
   * Trim code snippets using LRU algorithm
   */
  private trimCodeSnippetsLRU(context: RichContext, userId: string, maxItems: number): void {
    const snippets = context.codeSnippets.get(userId);
    if (!snippets) return;
    
    snippets.sort((a, b) => {
      const scoreA = this.conversationMemoryService.calculateLRUScore(a);
      const scoreB = this.conversationMemoryService.calculateLRUScore(b);
      return scoreA - scoreB;
    });
    
    const toRemove = snippets.length - maxItems;
    for (let i = 0; i < toRemove; i++) {
      const removed = snippets.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
    
    // Clean up empty entries
    if (snippets.length === 0) {
      context.codeSnippets.delete(userId);
    }
  }

  /**
   * Trim running gags using LRU algorithm
   */
  private trimRunningGagsLRU(context: RichContext, maxItems: number): void {
    context.runningGags.sort((a, b) => {
      const scoreA = this.conversationMemoryService.calculateLRUScore(a);
      const scoreB = this.conversationMemoryService.calculateLRUScore(b);
      return scoreA - scoreB;
    });
    
    const toRemove = context.runningGags.length - maxItems;
    for (let i = 0; i < toRemove; i++) {
      const removed = context.runningGags.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
  }

  /**
   * Aggressive trimming when normal trimming isn't enough
   */
  private aggressiveTrim(context: RichContext, limits: {
    maxEmbarrassingMoments: number;
    maxCodeSnippetsPerUser: number;
    maxRunningGags: number;
  }): void {
    logger.warn('Performing aggressive context trimming due to size limit');
    
    // Reduce to 75% of limits to provide breathing room
    const targetEmbarrassingMoments = Math.floor(limits.maxEmbarrassingMoments * 0.75);
    const targetCodeSnippets = Math.floor(limits.maxCodeSnippetsPerUser * 0.75);
    const targetRunningGags = Math.floor(limits.maxRunningGags * 0.75);
    
    // Trim embarrassing moments
    while (context.embarrassingMoments.length > targetEmbarrassingMoments) {
      const removed = context.embarrassingMoments.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
    
    // Trim code snippets more aggressively
    for (const [userId, snippets] of context.codeSnippets.entries()) {
      while (snippets.length > targetCodeSnippets) {
        const removed = snippets.shift();
        if (removed) {
          this.decrementSize(context, removed.content.length);
        }
      }
      if (snippets.length === 0) {
        context.codeSnippets.delete(userId);
      }
    }
    
    // Trim running gags
    while (context.runningGags.length > targetRunningGags) {
      const removed = context.runningGags.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
  }

  /**
   * Summarize server context to compress memory
   */
  public summarizeServerContext(context: RichContext): void {
    const originalSize = context.approximateSize;
    
    // Summarize old embarrassing moments
    if (context.embarrassingMoments.length > this.conversationMemoryService.getMemoryLimits().maxEmbarrassingMoments * 0.75) {
      const oldMoments = context.embarrassingMoments
        .filter(item => Date.now() - item.timestamp > 24 * 60 * 60 * 1000) // Older than 1 day
        .slice(0, Math.floor(context.embarrassingMoments.length * 0.3)); // Take 30% of oldest
      
      if (oldMoments.length > 5) {
        const summary = this.summarizeConversation(oldMoments, 300);
        if (summary) {
          const summaryItem: ContextItem = {
            content: `SUMMARIZED: ${summary}`,
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: Date.now(),
            relevanceScore: 0.8,
            importanceScore: 0.7,
            semanticHash: this.generateSemanticHash(summary),
          };
          
          context.summarizedFacts.push(summaryItem);
          
          // Remove original items
          oldMoments.forEach(item => {
            const index = context.embarrassingMoments.indexOf(item);
            if (index !== -1) {
              context.embarrassingMoments.splice(index, 1);
              this.decrementSize(context, item.content.length);
            }
          });
          
          this.incrementSize(context, summaryItem.content.length);
        }
      }
    }
    
    // Trim summarized facts if too many
    if (context.summarizedFacts.length > this.MAX_SUMMARIZED_FACTS) {
      context.summarizedFacts.sort((a, b) => this.conversationMemoryService.calculateLRUScore(a) - this.conversationMemoryService.calculateLRUScore(b));
      const toRemove = context.summarizedFacts.length - this.MAX_SUMMARIZED_FACTS;
      for (let i = 0; i < toRemove; i++) {
        const removed = context.summarizedFacts.shift();
        if (removed) {
          this.decrementSize(context, removed.content.length);
        }
      }
    }
    
    // Update compression ratio
    const newSize = context.approximateSize;
    context.compressionRatio = newSize / Math.max(originalSize, 1);
    
    logger.info(`Summarization complete: ${originalSize} -> ${newSize} characters (${(context.compressionRatio * 100).toFixed(1)}% ratio)`);
  }

  /**
   * Summarize conversation content into key facts
   */
  private summarizeConversation(items: ContextItem[], targetLength: number): string {
    if (items.length === 0) return '';
    
    // Group items by user patterns
    const userPatterns = new Map<string, string[]>();
    const generalFacts: string[] = [];
    
    items.forEach(item => {
      const userMatch = item.content.match(/^([^:]+):/);
      if (userMatch) {
        const user = userMatch[1];
        if (!userPatterns.has(user)) {
          userPatterns.set(user, []);
        }
        userPatterns.get(user)!.push(item.content.substring(user.length + 1).trim());
      } else {
        generalFacts.push(item.content);
      }
    });
    
    const summaryParts: string[] = [];
    
    // Summarize per-user patterns
    for (const [user, facts] of userPatterns.entries()) {
      if (facts.length > 2) {
        const commonThemes = this.extractCommonThemes(facts);
        summaryParts.push(`${user}: ${commonThemes.slice(0, 2).join(', ')}`);
      } else {
        facts.forEach(fact => summaryParts.push(`${user}: ${fact}`));
      }
    }
    
    // Add general facts
    generalFacts.forEach(fact => summaryParts.push(fact));
    
    let summary = summaryParts.join('; ');
    
    // Truncate if too long
    if (summary.length > targetLength) {
      summary = summary.substring(0, targetLength - 3) + '...';
    }
    
    return summary;
  }

  /**
   * Extract common themes from a list of facts
   */
  private extractCommonThemes(facts: string[]): string[] {
    const wordCounts = new Map<string, number>();
    const themes: string[] = [];
    
    // Count significant words
    facts.forEach(fact => {
      const words = fact.toLowerCase().match(/\b\w{4,}\b/g) || [];
      words.forEach(word => {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      });
    });
    
    // Find words that appear in multiple facts
    for (const [word, count] of wordCounts.entries()) {
      if (count >= 2 && themes.length < 5) {
        themes.push(`often ${word}`);
      }
    }
    
    // If no common themes, take most important facts
    if (themes.length === 0) {
      return facts.slice(0, 3);
    }
    
    return themes;
  }

  /**
   * Manual deduplication of a server's context
   */
  public deduplicateServerContext(context: RichContext): number {
    let removedCount = 0;
    
    // Deduplicate embarrassing moments
    removedCount += this.deduplicateArray(context.embarrassingMoments, context);
    
    // Deduplicate running gags
    removedCount += this.deduplicateArray(context.runningGags, context);
    
    // Deduplicate code snippets
    for (const snippets of context.codeSnippets.values()) {
      removedCount += this.deduplicateArray(snippets, context);
    }
    
    logger.info(`Removed ${removedCount} duplicate items`);
    return removedCount;
  }

  /**
   * Helper method to deduplicate an array of context items
   */
  private deduplicateArray(items: ContextItem[], context: RichContext): number {
    const seen = new Set<string>();
    let removedCount = 0;
    
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const hash = item.semanticHash || this.generateSemanticHash(item.content);
      
      if (seen.has(hash)) {
        items.splice(i, 1);
        this.decrementSize(context, item.content.length);
        removedCount++;
      } else {
        seen.add(hash);
        if (!item.semanticHash) {
          item.semanticHash = hash;
        }
      }
    }
    
    return removedCount;
  }

  /**
   * Update context size
   */
  public incrementSize(context: RichContext, addedLength: number): void {
    context.approximateSize += addedLength;
    context.lastSizeUpdate = Date.now();
  }

  public decrementSize(context: RichContext, removedLength: number): void {
    context.approximateSize = Math.max(0, context.approximateSize - removedLength);
    context.lastSizeUpdate = Date.now();
  }

  /**
   * Refresh approximate size calculation
   */
  public refreshApproximateSize(context: RichContext): void {
    const now = Date.now();
    
    // Only recalculate if cache is invalid (for emergency use only)
    if (now - context.lastSizeUpdate < this.SIZE_UPDATE_INTERVAL && context.approximateSize > 0) {
      return;
    }
    
    // Full recalculation for cache initialization or validation
    let totalSize = 0;
    
    // Calculate embarrassing moments
    context.embarrassingMoments.forEach(item => {
      totalSize += item.content.length;
    });
    
    // Calculate code snippets
    for (const snippets of context.codeSnippets.values()) {
      snippets.forEach(item => {
        totalSize += item.content.length;
      });
    }
    
    // Calculate running gags
    context.runningGags.forEach(item => {
      totalSize += item.content.length;
    });
    
    // Calculate summarized facts
    if (context.summarizedFacts) {
      context.summarizedFacts.forEach(item => {
        totalSize += item.content.length;
      });
    }
    
    // Add overhead estimate for Map and array structures
    totalSize += (context.codeSnippets.size * 100); // Map overhead
    totalSize += (context.lastRoasted.size * 50); // Date objects
    
    // Add social graph overhead
    totalSize += (context.socialGraph.size * 200); // Social graph maps overhead
    
    context.approximateSize = totalSize;
    context.lastSizeUpdate = now;
  }

  /**
   * Check if context should be summarized
   */
  public shouldSummarize(context: RichContext): boolean {
    const now = Date.now();
    return now - context.lastSummarization >= this.SUMMARIZATION_INTERVAL;
  }

  /**
   * Get compression statistics for a context
   */
  public getCompressionStats(context: RichContext): { 
    compressionRatio: number; 
    memorySaved: number 
  } {
    const originalSize = context.approximateSize / context.compressionRatio;
    const memorySaved = originalSize - context.approximateSize;
    
    return {
      compressionRatio: context.compressionRatio,
      memorySaved
    };
  }
}