/**
 * @file Unit tests for ContextManager with builder pattern
 * @module tests/unit/services/contextManager
 */

import { ContextManager } from '../../../src/services/contextManager';
import { BehaviorAnalyzer } from '../../../src/services/behaviorAnalyzer';
import { ConversationMemoryService } from '../../../src/services/context/ConversationMemoryService';
import { UserContextService } from '../../../src/services/context/UserContextService';
import { ChannelContextService } from '../../../src/services/context/ChannelContextService';
import { SocialDynamicsService } from '../../../src/services/context/SocialDynamicsService';
import { MemoryOptimizationService } from '../../../src/services/context/MemoryOptimizationService';
import { RichContext, ContextItem } from '../../../src/services/context/types';
import { GuildMember, Guild } from 'discord.js';

// Mock all dependencies
jest.mock('../../../src/services/behaviorAnalyzer');
jest.mock('../../../src/services/context/ConversationMemoryService');
jest.mock('../../../src/services/context/UserContextService');
jest.mock('../../../src/services/context/ChannelContextService');
jest.mock('../../../src/services/context/SocialDynamicsService');
jest.mock('../../../src/services/context/MemoryOptimizationService');
jest.mock('../../../src/utils/logger');

describe('ContextManager', () => {
  let contextManager: ContextManager;
  let mockBehaviorAnalyzer: jest.Mocked<BehaviorAnalyzer>;
  let mockConversationMemoryService: jest.Mocked<ConversationMemoryService>;
  let mockSocialDynamicsService: jest.Mocked<SocialDynamicsService>;
  let mockMemoryOptimizationService: jest.Mocked<MemoryOptimizationService>;

  const mockServerId = 'server123';
  const mockUserId = 'user456';

  beforeEach(() => {
    jest.clearAllMocks();
    contextManager = new ContextManager();

    // Get mocked instances
    mockBehaviorAnalyzer = (contextManager as any).behaviorAnalyzer;
    mockConversationMemoryService = (contextManager as any).conversationMemoryService;
    mockSocialDynamicsService = (contextManager as any).socialDynamicsService;
    mockMemoryOptimizationService = (contextManager as any).memoryOptimizationService;
  });

  describe('buildSuperContext with Builder Pattern', () => {
    let mockContext: RichContext;

    beforeEach(() => {
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

      // Mock the serverContext
      (contextManager as any).serverContext.set(mockServerId, mockContext);
    });

    it('should return empty string when context not found', () => {
      const result = contextManager.buildSuperContext('nonexistent', mockUserId);
      expect(result).toBe('');
    });

    it('should build context with basic header when no data available', () => {
      const result = contextManager.buildSuperContext(mockServerId, mockUserId);
      expect(result).toBe('DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n');
    });

    describe('FactsContextBuilder', () => {
      it('should include summarized facts when available', () => {
        const mockFacts: ContextItem[] = [
          {
            content: 'User likes coffee',
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: 0,
          },
          {
            content: 'User is afraid of spiders',
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: 0,
          },
        ];

        mockContext.summarizedFacts = mockFacts;
        mockConversationMemoryService.selectRelevantItems.mockReturnValue(mockFacts);

        const result = contextManager.buildSuperContext(mockServerId, mockUserId);

        expect(result).toContain('KEY FACTS & RELATIONSHIPS:');
        expect(result).toContain('- User likes coffee');
        expect(result).toContain('- User is afraid of spiders');
        expect(mockConversationMemoryService.selectRelevantItems).toHaveBeenCalledWith(
          mockFacts,
          mockUserId,
          10
        );
        
        // Verify access stats were updated
        expect(mockFacts[0].accessCount).toBe(1);
        expect(mockFacts[1].accessCount).toBe(1);
        expect(mockFacts[0].lastAccessed).toBeGreaterThan(0);
        expect(mockFacts[1].lastAccessed).toBeGreaterThan(0);
      });

      it('should not include facts section when no facts available', () => {
        mockContext.summarizedFacts = [];
        const result = contextManager.buildSuperContext(mockServerId, mockUserId);
        expect(result).not.toContain('KEY FACTS & RELATIONSHIPS:');
      });
    });

    describe('Cross-Server Context', () => {
      it('should include cross-server context when enabled', () => {
        mockContext.crossServerEnabled = true;
        const mockCrossServerContent = 'User failed at coding in Server ABC';
        (contextManager as any).buildCrossServerContext = jest.fn().mockReturnValue(mockCrossServerContent);

        const result = contextManager.buildSuperContext(mockServerId, mockUserId);

        expect(result).toContain('CROSS-SERVER INTELLIGENCE:');
        expect(result).toContain(mockCrossServerContent);
        expect((contextManager as any).buildCrossServerContext).toHaveBeenCalledWith(mockUserId, mockServerId);
      });

      it('should not include cross-server context when disabled', () => {
        mockContext.crossServerEnabled = false;
        const result = contextManager.buildSuperContext(mockServerId, mockUserId);
        expect(result).not.toContain('CROSS-SERVER INTELLIGENCE:');
      });
    });

    describe('BehaviorContextBuilder', () => {
      it('should include behavior context when available', () => {
        const mockBehaviorContext = 'BEHAVIORAL PATTERNS:\n- User is consistently late\n- User overuses emojis';
        mockBehaviorAnalyzer.getBehaviorContext.mockReturnValue(mockBehaviorContext);

        const result = contextManager.buildSuperContext(mockServerId, mockUserId);

        expect(result).toContain(mockBehaviorContext);
        expect(mockBehaviorAnalyzer.getBehaviorContext).toHaveBeenCalledWith(mockUserId);
      });

      it('should not include behavior context when not available', () => {
        mockBehaviorAnalyzer.getBehaviorContext.mockReturnValue(null as any);
        const result = contextManager.buildSuperContext(mockServerId, mockUserId);
        expect(result).not.toContain('BEHAVIORAL PATTERNS:');
      });
    });

    describe('EmbarrassingMomentsContextBuilder', () => {
      it('should include embarrassing moments when available', () => {
        const mockMoments: ContextItem[] = [
          {
            content: 'user456: Tried to divide by zero',
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: 0,
          },
          {
            content: 'user456: Called useState inside a for loop',
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: 0,
          },
        ];

        mockContext.embarrassingMoments = mockMoments;
        mockConversationMemoryService.selectRelevantItems.mockReturnValue(mockMoments);

        const result = contextManager.buildSuperContext(mockServerId, mockUserId);

        expect(result).toContain('HALL OF SHAME:');
        expect(result).toContain('- user456: Tried to divide by zero');
        expect(result).toContain('- user456: Called useState inside a for loop');
        expect(mockConversationMemoryService.selectRelevantItems).toHaveBeenCalledWith(
          mockMoments,
          mockUserId,
          15
        );
        
        // Verify access stats were updated
        expect(mockMoments[0].accessCount).toBe(1);
        expect(mockMoments[1].accessCount).toBe(1);
      });

      it('should not include embarrassing moments section when none available', () => {
        mockContext.embarrassingMoments = [];
        const result = contextManager.buildSuperContext(mockServerId, mockUserId);
        expect(result).not.toContain('HALL OF SHAME:');
      });
    });

    describe('CodeSnippetsContextBuilder', () => {
      it('should include code snippets for the user when available', () => {
        const mockCodeSnippets: ContextItem[] = [
          {
            content: 'Python disaster:\n```python\nwhile True: pass\n```',
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: 0,
          },
        ];

        mockContext.codeSnippets.set(mockUserId, mockCodeSnippets);
        mockConversationMemoryService.selectRelevantItems.mockReturnValue(mockCodeSnippets);

        const result = contextManager.buildSuperContext(mockServerId, mockUserId);

        expect(result).toContain(`${mockUserId}'S TERRIBLE CODE HISTORY:`);
        expect(result).toContain('Python disaster:');
        expect(result).toContain('while True: pass');
        expect(mockConversationMemoryService.selectRelevantItems).toHaveBeenCalledWith(
          mockCodeSnippets,
          mockUserId,
          10
        );
        
        // Verify access stats were updated
        expect(mockCodeSnippets[0].accessCount).toBe(1);
      });

      it('should not include code snippets section when none available for user', () => {
        mockContext.codeSnippets.set('otherUser', []);
        const result = contextManager.buildSuperContext(mockServerId, mockUserId);
        expect(result).not.toContain(`${mockUserId}'S TERRIBLE CODE HISTORY:`);
      });
    });

    describe('Running Gags', () => {
      it('should include running gags when available', () => {
        const mockGags: ContextItem[] = [
          {
            content: 'User thinks tabs are better than spaces',
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: 0,
          },
        ];

        mockContext.runningGags = mockGags;
        mockConversationMemoryService.selectRelevantItems.mockReturnValue(mockGags);

        const result = contextManager.buildSuperContext(mockServerId, mockUserId);

        expect(result).toContain('RUNNING GAGS TO REFERENCE:');
        expect(result).toContain('- User thinks tabs are better than spaces');
        expect(mockConversationMemoryService.selectRelevantItems).toHaveBeenCalledWith(
          mockGags,
          mockUserId,
          8
        );
        
        // Verify access stats were updated
        expect(mockGags[0].accessCount).toBe(1);
      });

      it('should not include running gags section when none available', () => {
        mockContext.runningGags = [];
        const result = contextManager.buildSuperContext(mockServerId, mockUserId);
        expect(result).not.toContain('RUNNING GAGS TO REFERENCE:');
      });
    });

    describe('SocialDynamicsContextBuilder', () => {
      it('should include social dynamics context when available', () => {
        const mockSocialContext = 'SOCIAL DYNAMICS:\n- Most roasted by: user789\n- Frequently interacts with: user101';
        mockSocialDynamicsService.buildSocialDynamicsContext.mockReturnValue(mockSocialContext);

        const result = contextManager.buildSuperContext(mockServerId, mockUserId);

        expect(result).toContain(mockSocialContext);
        expect(mockSocialDynamicsService.buildSocialDynamicsContext).toHaveBeenCalledWith(
          mockContext,
          mockUserId
        );
      });

      it('should not include social dynamics when not available', () => {
        mockSocialDynamicsService.buildSocialDynamicsContext.mockReturnValue('');
        const result = contextManager.buildSuperContext(mockServerId, mockUserId);
        expect(result).not.toContain('SOCIAL DYNAMICS:');
      });
    });

    describe('Full context integration', () => {
      it('should build complete context with all sections in correct order', () => {
        // Setup all mock data
        const mockFacts: ContextItem[] = [{
          content: 'Fact about user',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        }];
        const mockMoments: ContextItem[] = [{
          content: 'user456: Embarrassing moment',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        }];
        const mockCode: ContextItem[] = [{
          content: 'Bad code example',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        }];
        const mockGags: ContextItem[] = [{
          content: 'Running gag',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        }];

        mockContext.summarizedFacts = mockFacts;
        mockContext.embarrassingMoments = mockMoments;
        mockContext.codeSnippets.set(mockUserId, mockCode);
        mockContext.runningGags = mockGags;
        mockContext.crossServerEnabled = true;

        mockConversationMemoryService.selectRelevantItems.mockImplementation((items) => items);
        mockBehaviorAnalyzer.getBehaviorContext.mockReturnValue('BEHAVIORAL CONTEXT');
        mockSocialDynamicsService.buildSocialDynamicsContext.mockReturnValue('SOCIAL CONTEXT');
        (contextManager as any).buildCrossServerContext = jest.fn().mockReturnValue('CROSS-SERVER DATA');

        const result = contextManager.buildSuperContext(mockServerId, mockUserId);

        // Verify order of sections
        const headerIndex = result.indexOf('DEEP CONTEXT FOR MAXIMUM ROASTING:');
        const factsIndex = result.indexOf('KEY FACTS & RELATIONSHIPS:');
        const crossServerIndex = result.indexOf('CROSS-SERVER INTELLIGENCE:');
        const behaviorIndex = result.indexOf('BEHAVIORAL CONTEXT');
        const momentsIndex = result.indexOf('HALL OF SHAME:');
        const codeIndex = result.indexOf(`${mockUserId}'S TERRIBLE CODE HISTORY:`);
        const gagsIndex = result.indexOf('RUNNING GAGS TO REFERENCE:');
        const socialIndex = result.indexOf('SOCIAL CONTEXT');

        expect(headerIndex).toBeLessThan(factsIndex);
        expect(factsIndex).toBeLessThan(crossServerIndex);
        expect(crossServerIndex).toBeLessThan(behaviorIndex);
        expect(behaviorIndex).toBeLessThan(momentsIndex);
        expect(momentsIndex).toBeLessThan(codeIndex);
        expect(codeIndex).toBeLessThan(gagsIndex);
        expect(gagsIndex).toBeLessThan(socialIndex);

        // Verify all content is present
        expect(result).toContain('Fact about user');
        expect(result).toContain('CROSS-SERVER DATA');
        expect(result).toContain('Embarrassing moment');
        expect(result).toContain('Bad code example');
        expect(result).toContain('Running gag');
      });

      it('should maintain exact output format as original implementation', () => {
        // This test ensures byte-for-byte compatibility
        const mockFact: ContextItem = {
          content: 'Test fact',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        };

        mockContext.summarizedFacts = [mockFact];
        mockConversationMemoryService.selectRelevantItems.mockReturnValue([mockFact]);

        const result = contextManager.buildSuperContext(mockServerId, mockUserId);

        // Check exact formatting
        expect(result).toMatch(/^DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n/);
        expect(result).toMatch(/KEY FACTS & RELATIONSHIPS:\n- Test fact\n\n/);
      });
    });
  });

  describe('Cleanup', () => {
    it('should properly cleanup resources', () => {
      contextManager.cleanup();
      
      expect(mockBehaviorAnalyzer.cleanup).toHaveBeenCalled();
      expect((contextManager as any).userContextService.cleanup).toHaveBeenCalled();
      expect((contextManager as any).channelContextService.cleanup).toHaveBeenCalled();
    });
  });
});