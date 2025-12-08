/**
 * @file SocialDynamicsService.test.ts - Unit tests for SocialDynamicsService
 * @module tests/unit/services/context
 */

import { SocialDynamicsService } from '../../../../src/services/context/SocialDynamicsService';
import { RichContext, SocialGraph } from '../../../../src/services/context/types';
import { logger } from '../../../../src/utils/logger';

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('SocialDynamicsService', () => {
  let service: SocialDynamicsService;
  let mockContext: RichContext;

  beforeEach(() => {
    service = new SocialDynamicsService();
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  describe('updateSocialGraph', () => {
    it('should create social graph for new user', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');

      expect(mockContext.socialGraph.has('user123')).toBe(true);
      const userGraph = mockContext.socialGraph.get('user123')!;
      expect(userGraph.interactions.get('user456')).toBe(1);
      expect(userGraph.mentions.get('user456')).toBe(1);
      expect(userGraph.lastInteraction.has('user456')).toBe(true);
    });

    it('should increment existing interactions', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');

      const userGraph = mockContext.socialGraph.get('user123')!;
      expect(userGraph.interactions.get('user456')).toBe(3);
      expect(userGraph.mentions.get('user456')).toBe(2);
      expect(userGraph.roasts.get('user456')).toBe(1);
    });

    it('should handle different interaction types', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user789', 'roast');
      service.updateSocialGraph(mockContext, 'user123', 'user999', 'reply');

      const userGraph = mockContext.socialGraph.get('user123')!;
      expect(userGraph.mentions.get('user456')).toBe(1);
      expect(userGraph.roasts.get('user789')).toBe(1);
      expect(userGraph.interactions.get('user999')).toBe(1);
      expect(userGraph.mentions.has('user999')).toBe(false); // reply doesn't count as mention
    });

    it('should update last interaction time', () => {
      const timeBefore = Date.now();
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      const timeAfter = Date.now();

      const userGraph = mockContext.socialGraph.get('user123')!;
      const lastInteraction = userGraph.lastInteraction.get('user456')!;
      
      expect(lastInteraction.getTime()).toBeGreaterThanOrEqual(timeBefore);
      expect(lastInteraction.getTime()).toBeLessThanOrEqual(timeAfter);
    });

    it('should log interactions', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');

      expect(logger.info).toHaveBeenCalledWith('Updated social graph: user123 roast user456');
    });
  });

  describe('getTopInteractions', () => {
    it('should return empty array for user without interactions', () => {
      const result = service.getTopInteractions(mockContext, 'unknownUser');

      expect(result).toEqual([]);
    });

    it('should return top interactions sorted by count', () => {
      // Create some interactions
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user789', 'roast');
      service.updateSocialGraph(mockContext, 'user123', 'user789', 'roast');
      service.updateSocialGraph(mockContext, 'user123', 'user999', 'reply');

      const result = service.getTopInteractions(mockContext, 'user123', 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        userId: 'user456',
        count: 3,
        type: 'frequent mention',
      });
      expect(result[1]).toEqual({
        userId: 'user789',
        count: 2,
        type: 'roast target',
      });
      expect(result[2]).toEqual({
        userId: 'user999',
        count: 1,
        type: 'interaction',
      });
    });

    it('should correctly identify primary interaction type', () => {
      // More roasts than mentions
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');

      const result = service.getTopInteractions(mockContext, 'user123');

      expect(result[0].type).toBe('roast target');
    });

    it('should respect limit parameter', () => {
      // Create many interactions
      for (let i = 0; i < 10; i++) {
        service.updateSocialGraph(mockContext, 'user123', `user${i}`, 'mention');
      }

      const result = service.getTopInteractions(mockContext, 'user123', 3);

      expect(result).toHaveLength(3);
    });

    it('should use default limit of 5', () => {
      // Create many interactions
      for (let i = 0; i < 10; i++) {
        service.updateSocialGraph(mockContext, 'user123', `user${i}`, 'mention');
      }

      const result = service.getTopInteractions(mockContext, 'user123');

      expect(result).toHaveLength(5);
    });
  });

  describe('getRecentInteractions', () => {
    it('should return empty array for user without interactions', () => {
      const result = service.getRecentInteractions(mockContext, 'unknownUser');

      expect(result).toEqual([]);
    });

    it('should return recent interactions within time window', () => {
      const now = Date.now();
      
      // Add recent interaction
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');
      
      // Add old interaction (manually set to 48 hours ago)
      service.updateSocialGraph(mockContext, 'user123', 'user789', 'mention');
      const userGraph = mockContext.socialGraph.get('user123')!;
      userGraph.lastInteraction.set('user789', new Date(now - 48 * 60 * 60 * 1000));

      const result = service.getRecentInteractions(mockContext, 'user123', 24);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('user456');
      expect(result[0]).toContain('1 mentions, 1 roasts');
    });

    it('should filter out interactions without mentions or roasts', () => {
      // Create a reply interaction (no mention or roast)
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'reply');

      const result = service.getRecentInteractions(mockContext, 'user123');

      expect(result).toHaveLength(0);
    });

    it('should use custom time window', () => {
      const now = Date.now();
      
      // Add interaction 2 hours ago
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      const userGraph = mockContext.socialGraph.get('user123')!;
      userGraph.lastInteraction.set('user456', new Date(now - 2 * 60 * 60 * 1000));

      // Should not be included with 1 hour window
      const result1 = service.getRecentInteractions(mockContext, 'user123', 1);
      expect(result1).toHaveLength(0);

      // Should be included with 3 hour window
      const result2 = service.getRecentInteractions(mockContext, 'user123', 3);
      expect(result2).toHaveLength(1);
    });

    it('should format interaction strings correctly', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');

      const result = service.getRecentInteractions(mockContext, 'user123');

      expect(result[0]).toBe('Recently interacted with <@user456> (2 mentions, 3 roasts)');
    });
  });

  describe('getSocialGraph', () => {
    it('should return social graph for user', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');

      const graph = service.getSocialGraph(mockContext, 'user123');

      expect(graph).toBeDefined();
      expect(graph?.interactions.get('user456')).toBe(1);
    });

    it('should return null for user without graph', () => {
      const graph = service.getSocialGraph(mockContext, 'unknownUser');

      expect(graph).toBeNull();
    });
  });

  describe('calculateSocialGraphSize', () => {
    it('should calculate size for empty social graph', () => {
      const size = service.calculateSocialGraphSize(mockContext);

      expect(size).toBe(0);
    });

    it('should calculate size for populated social graph', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user789', 'roast');
      service.updateSocialGraph(mockContext, 'user456', 'user123', 'reply');

      const size = service.calculateSocialGraphSize(mockContext);

      expect(size).toBeGreaterThan(0);
    });

    it('should increase with more interactions', () => {
      const size1 = service.calculateSocialGraphSize(mockContext);
      
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      const size2 = service.calculateSocialGraphSize(mockContext);
      
      service.updateSocialGraph(mockContext, 'user123', 'user789', 'roast');
      const size3 = service.calculateSocialGraphSize(mockContext);

      expect(size2).toBeGreaterThan(size1);
      expect(size3).toBeGreaterThan(size2);
    });
  });

  describe('buildSocialDynamicsContext', () => {
    it('should return empty string for user without interactions', () => {
      const result = service.buildSocialDynamicsContext(mockContext, 'unknownUser');

      expect(result).toBe('');
    });

    it('should build context with top interactions', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user789', 'roast');

      const result = service.buildSocialDynamicsContext(mockContext, 'user123');

      expect(result).toContain('SOCIAL DYNAMICS:');
      expect(result).toContain('Frequently interacts with <@user456> (2 times, frequent mention)');
      expect(result).toContain('Frequently interacts with <@user789> (1 times, roast target)');
    });

    it('should include recent activity section', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');

      const result = service.buildSocialDynamicsContext(mockContext, 'user123');

      expect(result).toContain('RECENT ACTIVITY (last 24h):');
      expect(result).toContain('Recently interacted with <@user456>');
    });

    it('should not include recent activity if none exists', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'reply');

      const result = service.buildSocialDynamicsContext(mockContext, 'user123');

      expect(result).not.toContain('RECENT ACTIVITY');
    });
  });

  describe('clearSocialGraph', () => {
    it('should clear all social graph data', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user789', 'user999', 'roast');

      expect(mockContext.socialGraph.size).toBe(2);

      service.clearSocialGraph(mockContext);

      expect(mockContext.socialGraph.size).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Social graph cleared');
    });
  });

  describe('getSocialGraphStats', () => {
    it('should return zero stats for empty graph', () => {
      const stats = service.getSocialGraphStats(mockContext);

      expect(stats).toEqual({
        totalUsers: 0,
        totalInteractions: 0,
        averageInteractionsPerUser: 0,
      });
    });

    it('should calculate stats correctly', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user789', 'roast');
      service.updateSocialGraph(mockContext, 'user456', 'user123', 'reply');
      service.updateSocialGraph(mockContext, 'user456', 'user789', 'mention');

      const stats = service.getSocialGraphStats(mockContext);

      expect(stats.totalUsers).toBe(2);
      expect(stats.totalInteractions).toBe(5);
      expect(stats.averageInteractionsPerUser).toBe(2.5);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple interaction types for same user pair', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'roast');
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'reply');

      const userGraph = mockContext.socialGraph.get('user123')!;
      expect(userGraph.interactions.get('user456')).toBe(3);
      expect(userGraph.mentions.get('user456')).toBe(1);
      expect(userGraph.roasts.get('user456')).toBe(1);
    });

    it('should handle bidirectional interactions', () => {
      service.updateSocialGraph(mockContext, 'user123', 'user456', 'mention');
      service.updateSocialGraph(mockContext, 'user456', 'user123', 'mention');

      expect(mockContext.socialGraph.has('user123')).toBe(true);
      expect(mockContext.socialGraph.has('user456')).toBe(true);
      
      const graph1 = mockContext.socialGraph.get('user123')!;
      const graph2 = mockContext.socialGraph.get('user456')!;
      
      expect(graph1.interactions.get('user456')).toBe(1);
      expect(graph2.interactions.get('user123')).toBe(1);
    });
  });
});

// Helper function
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