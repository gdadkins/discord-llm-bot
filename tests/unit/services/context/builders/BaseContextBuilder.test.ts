/**
 * @file Unit tests for BaseContextBuilder
 * @module tests/unit/services/context/builders/BaseContextBuilder
 */

import { BaseContextBuilder } from '../../../../../src/services/context/builders/BaseContextBuilder';
import { ConversationMemoryService } from '../../../../../src/services/context/ConversationMemoryService';
import { RichContext, ContextItem } from '../../../../../src/services/context/types';

// Mock ConversationMemoryService
jest.mock('../../../../../src/services/context/ConversationMemoryService');

// Test implementation of BaseContextBuilder
class TestContextBuilder extends BaseContextBuilder {
  public build(): string {
    return this.parts.join('');
  }

  // Expose protected methods for testing
  public testUpdateLRUPatterns(items: ContextItem[]): void {
    this.updateLRUPatterns(items);
  }

  public testSelectRelevantItems(items: ContextItem[], limit: number): ContextItem[] {
    return this.selectRelevantItems(items, limit);
  }

  public testAddHeader(header: string): void {
    this.addHeader(header);
  }

  public testAddItems(items: ContextItem[], prefix?: string): void {
    this.addItems(items, prefix);
  }

  public testAddSeparator(): void {
    this.addSeparator();
  }
}

describe('BaseContextBuilder', () => {
  let builder: TestContextBuilder;
  let mockContext: RichContext;
  let mockConversationMemoryService: jest.Mocked<ConversationMemoryService>;
  const mockUserId = 'user123';
  const mockServerId = 'server456';

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      conversations: new Map(),
      codeSnippets: new Map(),
      embarrassingMoments: [],
      runningGags: [],
      lastRoasted: new Map(),
      approximateSize: 0,
      lastSizeUpdate: Date.now(),
      summarizedFacts: [],
      crossServerEnabled: false,
      compressionRatio: 1.0,
      lastSummarization: Date.now(),
      socialGraph: new Map(),
    };

    mockConversationMemoryService = new ConversationMemoryService() as jest.Mocked<ConversationMemoryService>;
    
    builder = new TestContextBuilder(
      mockContext,
      mockUserId,
      mockServerId,
      mockConversationMemoryService
    );
  });

  describe('updateLRUPatterns', () => {
    it('should update access count and last accessed time for items', () => {
      const items: ContextItem[] = [
        {
          content: 'Item 1',
          timestamp: Date.now() - 1000,
          accessCount: 5,
          lastAccessed: Date.now() - 500,
        },
        {
          content: 'Item 2',
          timestamp: Date.now() - 2000,
          accessCount: 3,
          lastAccessed: Date.now() - 1000,
        },
      ];

      const beforeAccessCounts = items.map(item => item.accessCount);
      const beforeLastAccessed = items.map(item => item.lastAccessed);

      builder.testUpdateLRUPatterns(items);

      // Check access counts were incremented
      expect(items[0].accessCount).toBe(beforeAccessCounts[0] + 1);
      expect(items[1].accessCount).toBe(beforeAccessCounts[1] + 1);

      // Check last accessed times were updated
      expect(items[0].lastAccessed).toBeGreaterThan(beforeLastAccessed[0]);
      expect(items[1].lastAccessed).toBeGreaterThan(beforeLastAccessed[1]);
      expect(items[0].lastAccessed).toBe(items[1].lastAccessed); // Same timestamp
    });
  });

  describe('selectRelevantItems', () => {
    it('should delegate to ConversationMemoryService', () => {
      const items: ContextItem[] = [
        {
          content: 'Item 1',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        },
      ];

      const expectedResult = items.slice(0, 1);
      mockConversationMemoryService.selectRelevantItems.mockReturnValue(expectedResult);

      const result = builder.testSelectRelevantItems(items, 5);

      expect(mockConversationMemoryService.selectRelevantItems).toHaveBeenCalledWith(
        items,
        mockUserId,
        5
      );
      expect(result).toBe(expectedResult);
    });
  });

  describe('addHeader', () => {
    it('should add header to parts', () => {
      builder.testAddHeader('TEST HEADER:\n');
      expect(builder.getParts()).toContain('TEST HEADER:\n');
    });
  });

  describe('addItems', () => {
    it('should add items with default prefix', () => {
      const items: ContextItem[] = [
        {
          content: 'Item 1',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        },
        {
          content: 'Item 2',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        },
      ];

      builder.testAddItems(items);
      
      const parts = builder.getParts();
      expect(parts).toContain('- Item 1\n');
      expect(parts).toContain('- Item 2\n');
    });

    it('should add items with custom prefix', () => {
      const items: ContextItem[] = [
        {
          content: 'Item 1',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        },
      ];

      builder.testAddItems(items, '* ');
      
      const parts = builder.getParts();
      expect(parts).toContain('* Item 1\n');
    });
  });

  describe('addSeparator', () => {
    it('should add newline separator', () => {
      builder.testAddSeparator();
      expect(builder.getParts()).toContain('\n');
    });
  });

  describe('getParts', () => {
    it('should return accumulated parts', () => {
      builder.testAddHeader('Header\n');
      builder.testAddSeparator();
      
      const parts = builder.getParts();
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('Header\n');
      expect(parts[1]).toBe('\n');
    });
  });

  describe('build', () => {
    it('should concatenate all parts', () => {
      builder.testAddHeader('Header\n');
      builder.testAddItems([
        {
          content: 'Item',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        },
      ]);
      builder.testAddSeparator();

      const result = builder.build();
      expect(result).toBe('Header\n- Item\n\n');
    });
  });
});