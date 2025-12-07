/**
 * @file ConversationMemoryService.test.ts - Unit tests for ConversationMemoryService
 * @module tests/unit/services/context
 */

import { ConversationMemoryService } from '../../../../src/services/context/ConversationMemoryService';
import { RichContext, ContextItem } from '../../../../src/services/context/types';

describe('ConversationMemoryService', () => {
  let service: ConversationMemoryService;
  let mockContext: RichContext;

  beforeEach(() => {
    service = new ConversationMemoryService();
    mockContext = createMockContext();
  });

  describe('addEmbarrassingMoment', () => {
    it('should add an embarrassing moment to the context', () => {
      const result = service.addEmbarrassingMoment(
        mockContext,
        'user123',
        'Spilled coffee on laptop',
        'hash123'
      );

      expect(result).toBe(true);
      expect(mockContext.embarrassingMoments).toHaveLength(1);
      expect(mockContext.embarrassingMoments[0].content).toBe('user123: Spilled coffee on laptop');
      expect(mockContext.embarrassingMoments[0].semanticHash).toBe('hash123');
      expect(mockContext.embarrassingMoments[0].accessCount).toBe(0);
      expect(mockContext.embarrassingMoments[0].timestamp).toBeDefined();
    });

    it('should calculate relevance and importance scores', () => {
      service.addEmbarrassingMoment(
        mockContext,
        'user123',
        'I accidentally deleted the production database',
        'hash456'
      );

      const moment = mockContext.embarrassingMoments[0];
      // Content will be "user123: I accidentally deleted the production database"
      expect(moment.relevanceScore).toBeGreaterThanOrEqual(0.5); // Base relevance
      expect(moment.importanceScore).toBe(0.5); // Base 0.3 + delete pattern 0.2
    });
  });

  describe('addCodeSnippet', () => {
    it('should add a code snippet to user collection', () => {
      const result = service.addCodeSnippet(
        mockContext,
        'user456',
        'const x = null; x.length;',
        'Null pointer error',
        'hash789'
      );

      expect(result).toBe(true);
      expect(mockContext.codeSnippets.has('user456')).toBe(true);
      expect(mockContext.codeSnippets.get('user456')).toHaveLength(1);
      
      const snippet = mockContext.codeSnippets.get('user456')![0];
      expect(snippet.content).toContain('Null pointer error');
      expect(snippet.content).toContain('const x = null');
      expect(snippet.semanticHash).toBe('hash789');
    });

    it('should create user collection if not exists', () => {
      expect(mockContext.codeSnippets.has('newUser')).toBe(false);
      
      service.addCodeSnippet(
        mockContext,
        'newUser',
        'code',
        'description',
        'hashNew'
      );

      expect(mockContext.codeSnippets.has('newUser')).toBe(true);
    });
  });

  describe('addRunningGag', () => {
    it('should add a running gag to the context', () => {
      const result = service.addRunningGag(
        mockContext,
        'Always forgets semicolons',
        'hashGag'
      );

      expect(result).toBe(true);
      expect(mockContext.runningGags).toHaveLength(1);
      expect(mockContext.runningGags[0].content).toBe('Always forgets semicolons');
      expect(mockContext.runningGags[0].semanticHash).toBe('hashGag');
    });
  });

  describe('selectRelevantItems', () => {
    it('should return all items when less than maxItems', () => {
      const items: ContextItem[] = [
        createMockContextItem('Item 1'),
        createMockContextItem('Item 2'),
      ];

      const result = service.selectRelevantItems(items, 'user123', 5);
      expect(result).toHaveLength(2);
    });

    it('should prioritize user-specific content', () => {
      const items: ContextItem[] = [
        createMockContextItem('Generic item', 0.5, 0.3, 1),
        createMockContextItem('user123 specific item', 0.5, 0.3, 1),
        createMockContextItem('Another generic item', 0.5, 0.3, 1),
      ];

      const result = service.selectRelevantItems(items, 'user123', 2);
      expect(result[0].content).toContain('user123');
    });

    it('should consider LRU score, relevance, and importance', () => {
      const now = Date.now();
      const items: ContextItem[] = [
        createMockContextItem('Old item', 0.3, 0.3, 0, now - 86400000), // 1 day old
        createMockContextItem('Recent important item', 0.8, 0.9, 5, now - 3600000), // 1 hour old
        createMockContextItem('Recent unimportant item', 0.3, 0.2, 0, now - 3600000),
      ];

      const result = service.selectRelevantItems(items, 'user123', 2);
      expect(result[0].content).toBe('Recent important item');
    });
  });

  describe('getMemoryLimits', () => {
    it('should return configured memory limits', () => {
      const limits = service.getMemoryLimits();
      
      expect(limits).toEqual({
        maxEmbarrassingMoments: 60,
        maxCodeSnippetsPerUser: 12,
        maxRunningGags: 30,
      });
    });
  });

  describe('calculateLRUScore', () => {
    it('should calculate higher score for older, less accessed items', () => {
      const now = Date.now();
      const oldItem = createMockContextItem('Old', 0.5, 0.5, 0, now - 7 * 86400000); // 7 days old
      const recentItem = createMockContextItem('Recent', 0.5, 0.5, 10, now - 3600000); // 1 hour old
      
      const oldScore = service.calculateLRUScore(oldItem);
      const recentScore = service.calculateLRUScore(recentItem);
      
      expect(oldScore).toBeGreaterThan(recentScore);
    });

    it('should consider access count in score calculation', () => {
      const now = Date.now();
      const lessAccessed = createMockContextItem('Less', 0.5, 0.5, 1, now - 86400000);
      const moreAccessed = createMockContextItem('More', 0.5, 0.5, 10, now - 86400000);
      
      const lessScore = service.calculateLRUScore(lessAccessed);
      const moreScore = service.calculateLRUScore(moreAccessed);
      
      expect(lessScore).toBeGreaterThan(moreScore);
    });
  });

  describe('countItems', () => {
    it('should count all items correctly', () => {
      // Add some items
      service.addEmbarrassingMoment(mockContext, 'user1', 'moment1', 'h1');
      service.addEmbarrassingMoment(mockContext, 'user2', 'moment2', 'h2');
      service.addCodeSnippet(mockContext, 'user1', 'code1', 'desc1', 'h3');
      service.addCodeSnippet(mockContext, 'user1', 'code2', 'desc2', 'h4');
      service.addCodeSnippet(mockContext, 'user2', 'code3', 'desc3', 'h5');
      service.addRunningGag(mockContext, 'gag1', 'h6');
      mockContext.summarizedFacts = [createMockContextItem('fact1'), createMockContextItem('fact2')];

      const counts = service.countItems(mockContext);
      
      expect(counts).toEqual({
        embarrassingMoments: 2,
        codeSnippets: 3,
        runningGags: 1,
        summarizedFacts: 2,
      });
    });

    it('should handle empty context', () => {
      const counts = service.countItems(mockContext);
      
      expect(counts).toEqual({
        embarrassingMoments: 0,
        codeSnippets: 0,
        runningGags: 0,
        summarizedFacts: 0,
      });
    });
  });

  describe('relevance and importance scoring', () => {
    it('should give higher relevance to code content', () => {
      service.addEmbarrassingMoment(
        mockContext,
        'user123',
        'function myBrokenFunction() { return null; }',
        'hash1'
      );

      const moment = mockContext.embarrassingMoments[0];
      expect(moment.relevanceScore).toBeGreaterThan(0.6);
    });

    it('should give higher importance to error indicators', () => {
      service.addEmbarrassingMoment(
        mockContext,
        'user123',
        'I always make the same mistake with passwords',
        'hash2'
      );

      const moment = mockContext.embarrassingMoments[0];
      expect(moment.importanceScore).toBeGreaterThan(0.5);
    });

    it('should give bonus relevance for user mentions', () => {
      service.addEmbarrassingMoment(
        mockContext,
        'user123',
        '<@456789> told me about the error',
        'hash3'
      );

      const moment = mockContext.embarrassingMoments[0];
      expect(moment.relevanceScore).toBeGreaterThan(0.5);
    });
  });
});

// Helper functions
function createMockContext(): RichContext {
  return {
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
}

function createMockContextItem(
  content: string,
  relevanceScore: number = 0.5,
  importanceScore: number = 0.3,
  accessCount: number = 0,
  timestamp: number = Date.now()
): ContextItem {
  return {
    content,
    timestamp,
    accessCount,
    lastAccessed: timestamp,
    relevanceScore,
    importanceScore,
    semanticHash: `hash_${content}`,
  };
}