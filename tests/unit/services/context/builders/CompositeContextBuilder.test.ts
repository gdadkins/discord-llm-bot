/**
 * @file Unit tests for CompositeContextBuilder
 * @module tests/unit/services/context/builders/CompositeContextBuilder
 */

import { CompositeContextBuilder } from '../../../../../src/services/context/builders/CompositeContextBuilder';
import { ConversationMemoryService } from '../../../../../src/services/context/ConversationMemoryService';
import { BehaviorAnalyzer } from '../../../../../src/services/behaviorAnalyzer';
import { SocialDynamicsService } from '../../../../../src/services/context/SocialDynamicsService';
import { RichContext, ContextItem } from '../../../../../src/services/context/types';

// Mock dependencies
jest.mock('../../../../../src/services/context/ConversationMemoryService');
jest.mock('../../../../../src/services/behaviorAnalyzer');
jest.mock('../../../../../src/services/context/SocialDynamicsService');

describe('CompositeContextBuilder', () => {
  let builder: CompositeContextBuilder;
  let mockContext: RichContext;
  let mockConversationMemoryService: jest.Mocked<ConversationMemoryService>;
  let mockBehaviorAnalyzer: jest.Mocked<BehaviorAnalyzer>;
  let mockSocialDynamicsService: jest.Mocked<SocialDynamicsService>;
  let mockServerContext: Map<string, RichContext>;
  
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

    mockServerContext = new Map();
    mockServerContext.set(mockServerId, mockContext);

    mockConversationMemoryService = new ConversationMemoryService() as jest.Mocked<ConversationMemoryService>;
    mockBehaviorAnalyzer = new BehaviorAnalyzer() as jest.Mocked<BehaviorAnalyzer>;
    mockSocialDynamicsService = new SocialDynamicsService() as jest.Mocked<SocialDynamicsService>;
    
    // Default mock implementations
    mockConversationMemoryService.selectRelevantItems.mockImplementation((items) => items);
    mockBehaviorAnalyzer.getBehaviorContext.mockReturnValue('');
    mockSocialDynamicsService.buildSocialDynamicsContext.mockReturnValue('');
    
    builder = new CompositeContextBuilder(
      mockContext,
      mockUserId,
      mockServerId,
      mockConversationMemoryService,
      mockBehaviorAnalyzer,
      mockSocialDynamicsService,
      mockServerContext
    );
  });

  describe('initialization', () => {
    it('should initialize with header', () => {
      const result = builder.build();
      expect(result).toBe('DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n');
    });
  });

  describe('addFacts', () => {
    it('should add facts when available', () => {
      const mockFacts: ContextItem[] = [
        {
          content: 'Fact 1',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        },
      ];

      mockContext.summarizedFacts = mockFacts;
      mockConversationMemoryService.selectRelevantItems.mockReturnValue(mockFacts);

      builder.addFacts();
      const result = builder.build();

      expect(result).toContain('KEY FACTS & RELATIONSHIPS:\n');
      expect(result).toContain('- Fact 1\n');
    });
  });

  describe('addBehavior', () => {
    it('should add behavior context when available', () => {
      const behaviorContext = 'BEHAVIOR PATTERNS:\nUser is active';
      mockBehaviorAnalyzer.getBehaviorContext.mockReturnValue(behaviorContext);

      builder.addBehavior();
      const result = builder.build();

      expect(result).toContain(behaviorContext);
    });
  });

  describe('addEmbarrassingMoments', () => {
    it('should add embarrassing moments when available', () => {
      const mockMoments: ContextItem[] = [
        {
          content: 'user123: Failed moment',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        },
      ];

      mockContext.embarrassingMoments = mockMoments;
      mockConversationMemoryService.selectRelevantItems.mockReturnValue(mockMoments);

      builder.addEmbarrassingMoments();
      const result = builder.build();

      expect(result).toContain('HALL OF SHAME:\n');
      expect(result).toContain('- user123: Failed moment\n');
    });
  });

  describe('addCodeSnippets', () => {
    it('should add code snippets for user when available', () => {
      const mockCode: ContextItem[] = [
        {
          content: 'Bad code example',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        },
      ];

      mockContext.codeSnippets.set(mockUserId, mockCode);
      mockConversationMemoryService.selectRelevantItems.mockReturnValue(mockCode);

      builder.addCodeSnippets();
      const result = builder.build();

      expect(result).toContain(`${mockUserId}'S TERRIBLE CODE HISTORY:\n`);
      expect(result).toContain('Bad code example\n---\n');
    });
  });

  describe('addRunningGags', () => {
    it('should add running gags when available', () => {
      const mockGags: ContextItem[] = [
        {
          content: 'Running gag',
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: 0,
        },
      ];

      mockContext.runningGags = mockGags;
      mockConversationMemoryService.selectRelevantItems.mockReturnValue(mockGags);

      builder.addRunningGags();
      const result = builder.build();

      expect(result).toContain('RUNNING GAGS TO REFERENCE:\n');
      expect(result).toContain('- Running gag\n');
    });
  });

  describe('addSocialDynamics', () => {
    it('should add social dynamics when available', () => {
      const socialContext = 'SOCIAL DYNAMICS:\nUser interactions';
      mockSocialDynamicsService.buildSocialDynamicsContext.mockReturnValue(socialContext);

      builder.addSocialDynamics();
      const result = builder.build();

      expect(result).toContain(socialContext);
    });
  });

  describe('addCrossServerContext', () => {
    it('should add cross-server context when enabled', () => {
      mockContext.crossServerEnabled = true;
      
      // Add another server with cross-server enabled
      const otherServerContext: RichContext = {
        ...mockContext,
        crossServerEnabled: true,
        embarrassingMoments: [
          {
            content: 'user123: Cross-server fail',
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: 0,
          },
        ],
      };
      
      mockServerContext.set('otherServer', otherServerContext);

      builder.addCrossServerContext();
      const result = builder.build();

      expect(result).toContain('CROSS-SERVER INTELLIGENCE:\n');
      expect(result).toContain('[Server otherServer] user123: Cross-server fail');
    });

    it('should not add cross-server context when disabled', () => {
      mockContext.crossServerEnabled = false;

      builder.addCrossServerContext();
      const result = builder.build();

      expect(result).not.toContain('CROSS-SERVER INTELLIGENCE:\n');
    });
  });

  describe('fluent API', () => {
    it('should support method chaining', () => {
      const result = builder
        .addFacts()
        .addBehavior()
        .addEmbarrassingMoments()
        .addCodeSnippets()
        .addRunningGags()
        .addSocialDynamics()
        .addCrossServerContext()
        .build();

      expect(typeof result).toBe('string');
    });
  });

  describe('full integration', () => {
    it('should build complete context in correct order', () => {
      // Setup all data
      mockContext.summarizedFacts = [{
        content: 'Fact',
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: 0,
      }];
      
      mockContext.embarrassingMoments = [{
        content: 'Moment',
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: 0,
      }];
      
      mockContext.codeSnippets.set(mockUserId, [{
        content: 'Code',
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: 0,
      }]);
      
      mockContext.runningGags = [{
        content: 'Gag',
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: 0,
      }];
      
      mockContext.crossServerEnabled = true;
      
      mockBehaviorAnalyzer.getBehaviorContext.mockReturnValue('BEHAVIOR');
      mockSocialDynamicsService.buildSocialDynamicsContext.mockReturnValue('SOCIAL');

      const result = builder
        .addFacts()
        .addCrossServerContext()
        .addBehavior()
        .addEmbarrassingMoments()
        .addCodeSnippets()
        .addRunningGags()
        .addSocialDynamics()
        .build();

      // Verify order
      const headerIndex = result.indexOf('DEEP CONTEXT');
      const factsIndex = result.indexOf('KEY FACTS');
      const crossServerIndex = result.indexOf('CROSS-SERVER');
      const behaviorIndex = result.indexOf('BEHAVIOR');
      const momentsIndex = result.indexOf('HALL OF SHAME');
      const codeIndex = result.indexOf('TERRIBLE CODE');
      const gagsIndex = result.indexOf('RUNNING GAGS');
      const socialIndex = result.indexOf('SOCIAL');

      expect(headerIndex).toBeLessThan(factsIndex);
      expect(factsIndex).toBeLessThan(behaviorIndex);
      expect(behaviorIndex).toBeLessThan(momentsIndex);
      expect(momentsIndex).toBeLessThan(codeIndex);
      expect(codeIndex).toBeLessThan(gagsIndex);
      expect(gagsIndex).toBeLessThan(socialIndex);
    });
  });
});