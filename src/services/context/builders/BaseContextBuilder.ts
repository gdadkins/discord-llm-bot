/**
 * @file BaseContextBuilder - Base class for all context builders
 * @module services/context/builders/BaseContextBuilder
 */

import { ContextItem, RichContext } from '../types';
import { ConversationMemoryService } from '../ConversationMemoryService';

/**
 * Abstract base class providing common functionality for all context builders.
 * Implements shared logic for LRU cache management and relevance-based selection.
 */
export abstract class BaseContextBuilder {
  protected parts: string[] = [];
  protected context: RichContext;
  protected userId: string;
  protected serverId: string;
  protected conversationMemoryService: ConversationMemoryService;
  protected now: number;

  constructor(
    context: RichContext,
    userId: string,
    serverId: string,
    conversationMemoryService: ConversationMemoryService
  ) {
    this.context = context;
    this.userId = userId;
    this.serverId = serverId;
    this.conversationMemoryService = conversationMemoryService;
    this.now = Date.now();
  }

  /**
   * Updates LRU access patterns for the given items
   */
  protected updateLRUPatterns(items: ContextItem[]): void {
    items.forEach(item => {
      item.accessCount++;
      item.lastAccessed = this.now;
    });
  }

  /**
   * Selects relevant items using the conversation memory service
   */
  protected selectRelevantItems(
    items: ContextItem[],
    limit: number
  ): ContextItem[] {
    return this.conversationMemoryService.selectRelevantItems(
      items,
      this.userId,
      limit
    );
  }

  /**
   * Adds a section header to the context
   */
  protected addHeader(header: string): void {
    this.parts.push(header);
  }

  /**
   * Adds formatted items to the context
   */
  protected addItems(items: ContextItem[], prefix: string = '- '): void {
    items.forEach(item => {
      this.parts.push(`${prefix}${item.content}\n`);
    });
  }

  /**
   * Adds a separator for readability
   */
  protected addSeparator(): void {
    this.parts.push('\n');
  }

  /**
   * Returns the accumulated context parts
   */
  public getParts(): string[] {
    return this.parts;
  }

  /**
   * Abstract method that each builder must implement
   */
  public abstract build(): string;
}