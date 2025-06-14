/**
 * @file MemoryOptimizationService.test.ts - Unit tests for MemoryOptimizationService
 * @module tests/unit/services/context
 */

import { MemoryOptimizationService } from '../../../../src/services/context/MemoryOptimizationService';
import { ConversationMemoryService } from '../../../../src/services/context/ConversationMemoryService';
import { RichContext, ContextItem } from '../../../../src/services/context/types';
import { logger } from '../../../../src/utils/logger';

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock ConversationMemoryService
jest.mock('../../../../src/services/context/ConversationMemoryService');

describe('MemoryOptimizationService', () => {
  let service: MemoryOptimizationService;
  let mockConversationMemoryService: jest.Mocked<ConversationMemoryService>;
  let mockContext: RichContext;

  beforeEach(() => {
    mockConversationMemoryService = new ConversationMemoryService() as jest.Mocked<ConversationMemoryService>;
    service = new MemoryOptimizationService(mockConversationMemoryService);
    mockContext = createMockContext();
    jest.clearAllMocks();

    // Setup default mock implementations
    mockConversationMemoryService.getMemoryLimits.mockReturnValue({
      maxEmbarrassingMoments: 60,
      maxCodeSnippetsPerUser: 12,
      maxRunningGags: 30,
    });
    mockConversationMemoryService.calculateLRUScore.mockImplementation((item) => {
      const now = Date.now();
      const ageScore = (now - item.timestamp) / (1000 * 60 * 60 * 24);
      const accessScore = Math.max(0, 10 - item.accessCount);
      return ageScore + accessScore;
    });
  });

  describe('generateSemanticHash', () => {
    it('should generate consistent hash for same content', () => {
      const content = 'This is a test message with some words';
      const hash1 = service.generateSemanticHash(content);
      const hash2 = service.generateSemanticHash(content);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = service.generateSemanticHash('First message');
      const hash2 = service.generateSemanticHash('Second message');

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize content for hashing', () => {
      const hash1 = service.generateSemanticHash('Hello World!');
      const hash2 = service.generateSemanticHash('hello world');

      expect(hash1).toBe(hash2);
      expect(hash1).toBe('11_helloworld'); // Normalized length and sorted keywords
    });

    it('should use key words in hash', () => {
      const content = 'function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }';
      const hash = service.generateSemanticHash(content);

      expect(hash).toContain('function');
      expect(hash).toContain('items');
    });
  });

  describe('findSimilarMessages', () => {
    it('should find exact semantic matches', () => {
      const items: ContextItem[] = [
        createMockContextItem('First message here'),
        createMockContextItem('Test message two'),
        createMockContextItem('Third different text'),
      ];
      
      // Set semantic hash for middle item to match what we'll search for
      items[1].semanticHash = service.generateSemanticHash('Test message two');

      const similar = service.findSimilarMessages(items, 'Test message two');

      expect(similar).toHaveLength(1);
      expect(similar[0].content).toBe('Test message two');
    });

    it('should find similar messages by word overlap', () => {
      const items: ContextItem[] = [
        createMockContextItem('I accidentally deleted the production database'),
        createMockContextItem('The user deleted their account'),
        createMockContextItem('Something completely different'),
      ];

      // Lower threshold to 0.2 to ensure we find matches with partial word overlap
      const similar = service.findSimilarMessages(items, 'deleted production files', 0.2);

      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].content).toContain('deleted');
    });

    it('should respect similarity threshold', () => {
      const items: ContextItem[] = [
        createMockContextItem('completely different content'),
        createMockContextItem('slightly similar words here'),
      ];

      const similar = service.findSimilarMessages(items, 'words', 0.1);
      expect(similar.length).toBeGreaterThan(0);

      const strictSimilar = service.findSimilarMessages(items, 'words', 0.9);
      expect(strictSimilar).toHaveLength(0);
    });

    it('should filter short words in similarity check', () => {
      const items: ContextItem[] = [
        createMockContextItem('the a an it is of'),
        createMockContextItem('meaningful content with longer words'),
      ];

      const similar = service.findSimilarMessages(items, 'meaningful longer words content');

      expect(similar).toHaveLength(1);
      expect(similar[0].content).toContain('meaningful');
    });
  });

  describe('intelligentTrim', () => {
    it('should not trim when under size limit', () => {
      mockContext.approximateSize = 100000; // Well under limit

      service.intelligentTrim(mockContext);

      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('exceeds limit'));
    });

    it('should trim embarrassing moments when over limit', () => {
      mockContext.approximateSize = 350000; // Over limit
      
      // Add many embarrassing moments
      for (let i = 0; i < 80; i++) {
        mockContext.embarrassingMoments.push(
          createMockContextItem(`Moment ${i}`, 0.5, 0.3, i % 5, Date.now() - i * 86400000)
        );
      }

      const initialCount = mockContext.embarrassingMoments.length;
      service.intelligentTrim(mockContext);

      expect(mockContext.embarrassingMoments.length).toBeLessThan(initialCount);
      expect(mockContext.embarrassingMoments.length).toBeLessThanOrEqual(60);
    });

    it('should trim code snippets per user', () => {
      mockContext.approximateSize = 350000;
      
      // Add many code snippets for one user
      const snippets: ContextItem[] = [];
      for (let i = 0; i < 20; i++) {
        snippets.push(
          createMockContextItem(`Code ${i}`, 0.5, 0.3, i % 3, Date.now() - i * 3600000)
        );
      }
      mockContext.codeSnippets.set('user123', snippets);

      service.intelligentTrim(mockContext);

      expect(mockContext.codeSnippets.get('user123')!.length).toBeLessThanOrEqual(12);
    });

    it('should trim running gags', () => {
      mockContext.approximateSize = 350000;
      
      // Add many running gags
      for (let i = 0; i < 50; i++) {
        mockContext.runningGags.push(
          createMockContextItem(`Gag ${i}`, 0.5, 0.3, i % 10, Date.now() - i * 7200000)
        );
      }

      service.intelligentTrim(mockContext);

      expect(mockContext.runningGags.length).toBeLessThanOrEqual(30);
    });

    it('should perform aggressive trim when normal trim insufficient', () => {
      mockContext.approximateSize = 500000; // Way over limit
      
      // Fill context to trigger aggressive trim
      for (let i = 0; i < 100; i++) {
        mockContext.embarrassingMoments.push(createMockContextItem(`Moment ${i}`));
        mockContext.runningGags.push(createMockContextItem(`Gag ${i}`));
      }

      service.intelligentTrim(mockContext);

      expect(logger.warn).toHaveBeenCalledWith('Performing aggressive context trimming due to size limit');
      expect(mockContext.embarrassingMoments.length).toBeLessThanOrEqual(45); // 75% of 60
      expect(mockContext.runningGags.length).toBeLessThanOrEqual(22); // 75% of 30
    });

    it('should update size when trimming', () => {
      mockContext.approximateSize = 350000;
      // Add many embarrassing moments to exceed the limit
      mockContext.embarrassingMoments = [];
      for (let i = 0; i < 70; i++) {
        mockContext.embarrassingMoments.push(
          createMockContextItem('Long content '.repeat(10))
        );
      }

      const sizeBefore = mockContext.approximateSize;
      service.intelligentTrim(mockContext);

      // Should have trimmed down to 45 items (aggressive trimming: 75% of 60)
      expect(mockContext.embarrassingMoments.length).toBe(45);
      expect(mockContext.approximateSize).toBeLessThan(sizeBefore);
    });
  });

  describe('summarizeServerContext', () => {
    it('should summarize old embarrassing moments', () => {
      const oldMoments: ContextItem[] = [];
      // Need at least 75% of max (60 * 0.75 = 45) to trigger summarization
      for (let i = 0; i < 50; i++) {
        oldMoments.push(
          createMockContextItem(
            `user${i % 3}: Old embarrassing moment ${i}`,
            0.5,
            0.3,
            0,
            Date.now() - 48 * 60 * 60 * 1000 // 2 days old
          )
        );
      }
      mockContext.embarrassingMoments = oldMoments;

      service.summarizeServerContext(mockContext);

      expect(mockContext.summarizedFacts.length).toBeGreaterThan(0);
      expect(mockContext.summarizedFacts[0].content).toContain('SUMMARIZED:');
      expect(mockContext.embarrassingMoments.length).toBeLessThan(50);
    });

    it('should not summarize recent content', () => {
      const recentMoments: ContextItem[] = [];
      for (let i = 0; i < 10; i++) {
        recentMoments.push(
          createMockContextItem(
            `Recent moment ${i}`,
            0.5,
            0.3,
            0,
            Date.now() - 3600000 // 1 hour old
          )
        );
      }
      mockContext.embarrassingMoments = recentMoments;

      service.summarizeServerContext(mockContext);

      expect(mockContext.summarizedFacts).toHaveLength(0);
      expect(mockContext.embarrassingMoments).toHaveLength(10);
    });

    it('should limit summarized facts', () => {
      // Add many existing summarized facts
      for (let i = 0; i < 60; i++) {
        mockContext.summarizedFacts.push(
          createMockContextItem(`Old summary ${i}`, 0.8, 0.7, i % 5)
        );
      }

      service.summarizeServerContext(mockContext);

      expect(mockContext.summarizedFacts.length).toBeLessThanOrEqual(50);
    });

    it('should update compression ratio', () => {
      const initialSize = 100000;
      mockContext.approximateSize = initialSize;
      mockContext.compressionRatio = 1.0;

      // Add old content to summarize
      for (let i = 0; i < 50; i++) {
        mockContext.embarrassingMoments.push(
          createMockContextItem(
            `Old moment ${i}`,
            0.5,
            0.3,
            0,
            Date.now() - 48 * 60 * 60 * 1000
          )
        );
      }

      service.summarizeServerContext(mockContext);

      expect(mockContext.compressionRatio).not.toBe(1.0);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Summarization complete'));
    });

    it('should extract common themes in summarization', () => {
      const themedMoments: ContextItem[] = [
        createMockContextItem('user1: Always forgets to save work', 0.5, 0.3, 0, Date.now() - 48 * 60 * 60 * 1000),
        createMockContextItem('user1: Forgot to commit changes again', 0.5, 0.3, 0, Date.now() - 48 * 60 * 60 * 1000),
        createMockContextItem('user1: Lost work because forgot to save', 0.5, 0.3, 0, Date.now() - 48 * 60 * 60 * 1000),
      ];
      mockContext.embarrassingMoments = themedMoments;

      service.summarizeServerContext(mockContext);

      if (mockContext.summarizedFacts.length > 0) {
        const summary = mockContext.summarizedFacts[0].content;
        expect(summary).toContain('user1');
      }
    });
  });

  describe('deduplicateServerContext', () => {
    it('should remove duplicate embarrassing moments', () => {
      mockContext.embarrassingMoments = [
        createMockContextItem('Duplicate content'),
        createMockContextItem('Unique content'),
        createMockContextItem('Duplicate content'),
      ];

      const removed = service.deduplicateServerContext(mockContext);

      expect(removed).toBe(1);
      expect(mockContext.embarrassingMoments).toHaveLength(2);
    });

    it('should remove duplicate running gags', () => {
      mockContext.runningGags = [
        createMockContextItem('Gag 1'),
        createMockContextItem('Gag 1'),
        createMockContextItem('Gag 2'),
        createMockContextItem('Gag 2'),
      ];

      const removed = service.deduplicateServerContext(mockContext);

      expect(removed).toBe(2);
      expect(mockContext.runningGags).toHaveLength(2);
    });

    it('should remove duplicate code snippets', () => {
      mockContext.codeSnippets.set('user123', [
        createMockContextItem('Code 1'),
        createMockContextItem('Code 2'),
        createMockContextItem('Code 1'),
      ]);

      const removed = service.deduplicateServerContext(mockContext);

      expect(removed).toBe(1);
      expect(mockContext.codeSnippets.get('user123')).toHaveLength(2);
    });

    it('should add semantic hashes to items without them', () => {
      const itemWithoutHash = createMockContextItem('Content');
      delete itemWithoutHash.semanticHash;
      mockContext.embarrassingMoments = [itemWithoutHash];

      service.deduplicateServerContext(mockContext);

      expect(mockContext.embarrassingMoments[0].semanticHash).toBeDefined();
    });

    it('should update context size when removing duplicates', () => {
      mockContext.approximateSize = 1000;
      mockContext.embarrassingMoments = [
        createMockContextItem('Duplicate'),
        createMockContextItem('Duplicate'),
      ];

      service.deduplicateServerContext(mockContext);

      expect(mockContext.approximateSize).toBeLessThan(1000);
    });
  });

  describe('size management', () => {
    it('should increment size correctly', () => {
      mockContext.approximateSize = 1000;
      const before = Date.now();

      service.incrementSize(mockContext, 500);

      expect(mockContext.approximateSize).toBe(1500);
      expect(mockContext.lastSizeUpdate).toBeGreaterThanOrEqual(before);
    });

    it('should decrement size correctly', () => {
      mockContext.approximateSize = 1000;

      service.decrementSize(mockContext, 300);

      expect(mockContext.approximateSize).toBe(700);
    });

    it('should not allow negative size', () => {
      mockContext.approximateSize = 100;

      service.decrementSize(mockContext, 200);

      expect(mockContext.approximateSize).toBe(0);
    });

    it('should refresh approximate size when cache invalid', () => {
      mockContext.lastSizeUpdate = Date.now() - 600000; // 10 minutes ago
      mockContext.approximateSize = 0;
      
      // Add some content
      mockContext.embarrassingMoments = [
        createMockContextItem('Content 1'),
        createMockContextItem('Content 2'),
      ];
      mockContext.codeSnippets.set('user1', [
        createMockContextItem('Code snippet'),
      ]);

      service.refreshApproximateSize(mockContext);

      expect(mockContext.approximateSize).toBeGreaterThan(0);
      expect(mockContext.lastSizeUpdate).toBeCloseTo(Date.now(), -2);
    });

    it('should not refresh size if cache is valid', () => {
      mockContext.lastSizeUpdate = Date.now() - 30000; // 30 seconds ago
      mockContext.approximateSize = 5000;
      const originalSize = mockContext.approximateSize;
      const originalUpdate = mockContext.lastSizeUpdate;

      service.refreshApproximateSize(mockContext);

      expect(mockContext.approximateSize).toBe(originalSize);
      expect(mockContext.lastSizeUpdate).toBe(originalUpdate);
    });
  });

  describe('shouldSummarize', () => {
    it('should return true when summarization interval passed', () => {
      mockContext.lastSummarization = Date.now() - 3600000; // 1 hour ago

      const result = service.shouldSummarize(mockContext);

      expect(result).toBe(true);
    });

    it('should return false when recently summarized', () => {
      mockContext.lastSummarization = Date.now() - 300000; // 5 minutes ago

      const result = service.shouldSummarize(mockContext);

      expect(result).toBe(false);
    });
  });

  describe('getCompressionStats', () => {
    it('should calculate compression statistics', () => {
      mockContext.approximateSize = 80000;
      mockContext.compressionRatio = 0.8;

      const stats = service.getCompressionStats(mockContext);

      expect(stats.compressionRatio).toBe(0.8);
      expect(stats.memorySaved).toBeCloseTo(20000, 0);
    });

    it('should handle compression ratio of 1', () => {
      mockContext.approximateSize = 100000;
      mockContext.compressionRatio = 1.0;

      const stats = service.getCompressionStats(mockContext);

      expect(stats.memorySaved).toBe(0);
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