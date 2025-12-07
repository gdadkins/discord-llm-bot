import { RoastingEngine } from '../../../src/services/roastingEngine';
import { logger } from '../../../src/utils/logger';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('RoastingEngine', () => {
  let roastingEngine: RoastingEngine;
  const mockUserId = 'user123';
  const mockServerId = 'server456';

  // Helper function to extract values from roast decision log
  const getDecisionValue = (pattern: RegExp): number => {
    const decisionLog = (logger.info as jest.Mock).mock.calls
      .find(call => call[0].includes('Roast decision'));
    if (!decisionLog) return 0;
    const match = decisionLog[0].match(pattern);
    return match ? parseFloat(match[1]) : 0;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Reset environment variables
    process.env.ROAST_MAX_CHANCE = '0.9';
    process.env.ROAST_COOLDOWN = 'true';
    
    roastingEngine = new RoastingEngine();
  });

  afterEach(async () => {
    await roastingEngine.shutdown();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('initialization and shutdown', () => {
    it('should initialize successfully', async () => {
      await roastingEngine.initialize();
      expect(logger.info).toHaveBeenCalledWith('Initializing RoastingEngine...');
      expect(logger.info).toHaveBeenCalledWith('RoastingEngine initialized successfully');
    });

    it('should shutdown cleanly', async () => {
      await roastingEngine.initialize();
      jest.clearAllMocks();
      await roastingEngine.shutdown();
      expect(logger.info).toHaveBeenCalledWith('Shutting down RoastingEngine...');
      expect(logger.info).toHaveBeenCalledWith('RoastingEngine shutdown complete');
    });
  });

  describe('shouldRoast basic functionality', () => {
    it('should track user questions and reset on roast', () => {
      // Mock random to control roasting decision
      const mockRandom = jest.spyOn(Math, 'random');
      
      // First few calls should not roast (low probability)
      mockRandom.mockReturnValue(0.9);
      expect(roastingEngine.shouldRoast(mockUserId, 'test message', mockServerId)).toBe(false);
      
      // Verify user stats are tracking
      const stats = roastingEngine.getUserStats(mockUserId);
      expect(stats).toBeDefined();
      expect(stats?.count).toBe(1);
      expect(stats?.lastRoasted).toBe(false);
      
      // Make it roast on next call
      mockRandom.mockReturnValue(0.1);
      expect(roastingEngine.shouldRoast(mockUserId, 'another message', mockServerId)).toBe(true);
      
      // Stats should reset after roasting
      const statsAfterRoast = roastingEngine.getUserStats(mockUserId);
      expect(statsAfterRoast?.count).toBe(0);
      expect(statsAfterRoast?.lastRoasted).toBe(true);
      
      mockRandom.mockRestore();
    });

    it('should respect cooldown after roasting', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Force a roast
      mockRandom.mockReturnValue(0.1);
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      // Next call should respect cooldown (85% of the time)
      mockRandom.mockReturnValue(0.5); // Not in the 15% ignore range
      expect(roastingEngine.shouldRoast(mockUserId, 'test2', mockServerId)).toBe(false);
      
      // Verify cooldown was logged
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Cooldown respected'));
      
      mockRandom.mockRestore();
    });

    it('should occasionally ignore cooldown for psychological warfare', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Force a roast
      mockRandom.mockReturnValue(0.1);
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      // Set random to be in the 15% ignore cooldown range
      mockRandom.mockReturnValue(0.1); // < 0.15 to ignore cooldown
      roastingEngine.shouldRoast(mockUserId, 'test2', mockServerId);
      
      // Verify cooldown was ignored
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Cooldown IGNORED'));
      
      mockRandom.mockRestore();
    });

    it('should handle disabled cooldown', () => {
      process.env.ROAST_COOLDOWN = 'false';
      const engine = new RoastingEngine();
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Force a roast
      mockRandom.mockReturnValue(0.1);
      engine.shouldRoast(mockUserId, 'test', mockServerId);
      
      // Next call should not check cooldown
      mockRandom.mockReturnValue(0.5);
      engine.shouldRoast(mockUserId, 'test2', mockServerId);
      
      // Should not log cooldown message
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Cooldown'));
      
      mockRandom.mockRestore();
      engine.shutdown();
    });
  });

  describe('complexity modifier', () => {
    it('should increase chance based on message length', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.7); // Fixed value to isolate complexity effect
      
      const shortMessage = 'Hi';
      const longMessage = 'a'.repeat(50); // 50 chars
      const veryLongMessage = 'a'.repeat(200); // 200 chars
      
      // Extract complexity from decision log line
      const getComplexity = () => {
        const calls = (logger.info as jest.Mock).mock.calls;
        for (const call of calls) {
          if (call[0].includes('Roast decision')) {
            const match = call[0].match(/Complexity: \+(\d+(?:\.\d+)?)%/);
            return match ? parseFloat(match[1]) : 0;
          }
        }
        return 0;
      };
      
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, shortMessage, mockServerId);
      const shortComplexity = getComplexity();
      
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, longMessage, mockServerId);
      const longComplexity = getComplexity();
      
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, veryLongMessage, mockServerId);
      const veryLongComplexity = getComplexity();
      
      // For very short messages, complexity might be 0
      expect(shortComplexity).toBeGreaterThanOrEqual(0);
      expect(longComplexity).toBeGreaterThanOrEqual(shortComplexity);
      expect(veryLongComplexity).toBeGreaterThan(longComplexity);
      expect(veryLongComplexity).toBeLessThanOrEqual(50); // Capped at 50%
      
      mockRandom.mockRestore();
    });

    it('should detect code patterns', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.7);
      
      const regularMessage = 'How do I do this?';
      const codeMessage = 'How do I use ```const x = 5;```?';
      const programmingMessage = 'Can you help me with this function and class import?';
      const technicalMessage = 'My API server has a database error exception';
      
      // Test each message type
      const messages = [
        regularMessage,
        codeMessage,
        programmingMessage,
        technicalMessage
      ];
      
      const complexities: number[] = [];
      
      // Helper to extract complexity from logs
      const getComplexity = () => {
        const calls = (logger.info as jest.Mock).mock.calls;
        for (const call of calls) {
          if (call[0].includes('Roast decision')) {
            const match = call[0].match(/Complexity: \+(\d+(?:\.\d+)?)%/);
            return match ? parseFloat(match[1]) : 0;
          }
        }
        return 0;
      };
      
      messages.forEach(msg => {
        jest.clearAllMocks();
        roastingEngine.shouldRoast(mockUserId, msg, mockServerId);
        complexities.push(getComplexity());
      });
      
      // Code message should have higher complexity than regular
      expect(complexities[1]).toBeGreaterThanOrEqual(complexities[0]);
      // Programming keywords should increase complexity
      expect(complexities[2]).toBeGreaterThanOrEqual(complexities[0]);
      // Technical terms should increase complexity
      expect(complexities[3]).toBeGreaterThanOrEqual(complexities[0]);
      
      // At least one should be higher
      const hasHigherComplexity = complexities.slice(1).some(c => c > complexities[0]);
      expect(hasHigherComplexity).toBe(true);
      
      mockRandom.mockRestore();
    });

    it('should detect questions and multiple questions', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.7);
      
      const statement = 'I need help with this';
      const singleQuestion = 'Can you help me with this?';
      const multipleQuestions = 'What is this? How does it work? Can you explain?';
      
      const messages = [statement, singleQuestion, multipleQuestions];
      const complexities: number[] = [];
      
      // Helper to extract complexity from logs
      const getComplexity = () => {
        const calls = (logger.info as jest.Mock).mock.calls;
        for (const call of calls) {
          if (call[0].includes('Roast decision')) {
            const match = call[0].match(/Complexity: \+(\d+(?:\.\d+)?)%/);
            return match ? parseFloat(match[1]) : 0;
          }
        }
        return 0;
      };
      
      messages.forEach(msg => {
        jest.clearAllMocks();
        roastingEngine.shouldRoast(mockUserId, msg, mockServerId);
        complexities.push(getComplexity());
      });
      
      // Questions should have higher complexity
      expect(complexities[1]).toBeGreaterThanOrEqual(complexities[0]);
      // Multiple questions should have even higher complexity
      expect(complexities[2]).toBeGreaterThanOrEqual(complexities[1]);
      
      // Multiple questions should definitely be higher than statements
      expect(complexities[2]).toBeGreaterThan(complexities[0]);
      
      mockRandom.mockRestore();
    });
  });

  describe('time-based modifier', () => {
    it('should apply night owl bonus (11PM - 3AM)', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      // Mock late night hour
      const mockDate = jest.spyOn(Date.prototype, 'getHours');
      mockDate.mockReturnValue(1); // 1 AM
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      const timeBonus = getDecisionValue(/Time: \+(\d+\.\d+)%/);
      
      expect(timeBonus).toBe(30);
      
      mockDate.mockRestore();
      mockRandom.mockRestore();
    });

    it('should apply early bird mercy (5AM - 8AM)', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      const mockDate = jest.spyOn(Date.prototype, 'getHours');
      mockDate.mockReturnValue(6); // 6 AM
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      const timeBonus = getDecisionValue(/Time: (-?\d+\.\d+)%/);
      
      expect(timeBonus).toBe(-10);
      
      mockDate.mockRestore();
      mockRandom.mockRestore();
    });

    it('should apply peak roasting hours bonus (7PM - 11PM)', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      const mockDate = jest.spyOn(Date.prototype, 'getHours');
      mockDate.mockReturnValue(20); // 8 PM
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      const timeBonus = getDecisionValue(/Time: \+(\d+\.\d+)%/);
      
      expect(timeBonus).toBe(20);
      
      mockDate.mockRestore();
      mockRandom.mockRestore();
    });

    it('should cache time modifier for same hour', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      const mockDate = jest.spyOn(Date.prototype, 'getHours');
      mockDate.mockReturnValue(14); // 2 PM
      
      // First call
      roastingEngine.shouldRoast(mockUserId, 'test1', mockServerId);
      // Second call same hour
      roastingEngine.shouldRoast(mockUserId + '2', 'test2', mockServerId);
      
      // Should use cached value, so getHours should only be called once for the check
      // Plus one more for the initial call
      expect(mockDate).toHaveBeenCalledTimes(2);
      
      mockDate.mockRestore();
      mockRandom.mockRestore();
    });
  });

  describe('mood modifiers', () => {
    beforeEach(() => {
      // Access private property for testing
      (roastingEngine as any).roastingState.botMood = 'sleepy';
      (roastingEngine as any).roastingState.moodStartTime = Date.now();
    });

    it('should apply sleepy mood modifier', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      (roastingEngine as any).roastingState.botMood = 'sleepy';
      
      // First question - sleepy gives negative modifier
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match = decisionLog ? decisionLog[0].match(/Mood \(sleepy\): (-?\d+\.\d+)%/) : null;
      let moodBonus = match ? parseFloat(match[1]) : 0;
      expect(moodBonus).toBe(-20);
      
      // Build up questions - sleepy wakes up
      for (let i = 0; i < 4; i++) {
        roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      }
      
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog2 = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match2 = decisionLog2 ? decisionLog2[0].match(/Mood \(sleepy\): (-?\d+\.\d+)%/) : null;
      moodBonus = match2 ? parseFloat(match2[1]) : 0;
      
      expect(moodBonus).toBeGreaterThanOrEqual(-20);
      
      mockRandom.mockRestore();
    });

    it('should apply caffeinated mood modifier', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      (roastingEngine as any).roastingState.botMood = 'caffeinated';
      
      // Caffeinated starts positive and escalates
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match = decisionLog ? decisionLog[0].match(/Mood \(caffeinated\): \+(\d+\.\d+)%/) : null;
      const firstBonus = match ? parseFloat(match[1]) : 0;
      
      // Build up more questions
      for (let i = 0; i < 3; i++) {
        roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      }
      
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog2 = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match2 = decisionLog2 ? decisionLog2[0].match(/Mood \(caffeinated\): \+(\d+\.\d+)%/) : null;
      const laterBonus = match2 ? parseFloat(match2[1]) : 0;
      
      expect(laterBonus).toBeGreaterThanOrEqual(firstBonus);
      
      mockRandom.mockRestore();
    });

    it('should apply chaotic mood with random modifier', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      (roastingEngine as any).roastingState.botMood = 'chaotic';
      
      const modifiers: number[] = [];
      
      // Test multiple times to see randomness
      for (let i = 0; i < 5; i++) {
        mockRandom.mockReturnValueOnce(0.5); // For shouldRoast decision
        mockRandom.mockReturnValueOnce(Math.random()); // For mood modifier
        
        jest.clearAllMocks();
        roastingEngine.shouldRoast(mockUserId + i, 'test', mockServerId);
        
        const decisionLog = (logger.info as jest.Mock).mock.calls
          .find(call => call[0].includes('Roast decision'));
        if (decisionLog) {
          const match = decisionLog[0].match(/Mood \(chaotic\): (-?\d+\.\d+)%/);
          if (match) {
            modifiers.push(parseFloat(match[1]));
          }
        }
      }
      
      // Should have different values (randomness)
      const uniqueModifiers = new Set(modifiers);
      expect(uniqueModifiers.size).toBeGreaterThan(1);
      
      // All should be between -30% and +30%
      modifiers.forEach(mod => {
        expect(mod).toBeGreaterThanOrEqual(-30);
        expect(mod).toBeLessThanOrEqual(30);
      });
      
      mockRandom.mockRestore();
    });

    it('should apply reverse psychology mood', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      (roastingEngine as any).roastingState.botMood = 'reverse_psychology';
      
      // Low question count - positive modifier
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match = decisionLog ? decisionLog[0].match(/Mood \(reverse_psychology\): \+(\d+\.\d+)%/) : null;
      let moodBonus = match ? parseFloat(match[1]) : 0;
      expect(moodBonus).toBe(20);
      
      // Build up questions
      for (let i = 0; i < 4; i++) {
        roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      }
      
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog2 = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match2 = decisionLog2 ? decisionLog2[0].match(/Mood \(reverse_psychology\): (-?\d+\.\d+)%/) : null;
      moodBonus = match2 ? parseFloat(match2[1]) : 0;
      
      // High question count - negative modifier (reverse!)
      expect(moodBonus).toBe(-40);
      
      mockRandom.mockRestore();
    });

    it('should apply bloodthirsty mood modifier', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      (roastingEngine as any).roastingState.botMood = 'bloodthirsty';
      
      // Bloodthirsty has aggressive escalation
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match = decisionLog ? decisionLog[0].match(/Mood \(bloodthirsty\): \+(\d+\.\d+)%/) : null;
      const firstBonus = match ? parseFloat(match[1]) : 0;
      
      // Build up questions
      for (let i = 0; i < 3; i++) {
        roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      }
      
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog2 = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match2 = decisionLog2 ? decisionLog2[0].match(/Mood \(bloodthirsty\): \+(\d+\.\d+)%/) : null;
      const laterBonus = match2 ? parseFloat(match2[1]) : 0;
      
      expect(laterBonus).toBeGreaterThanOrEqual(firstBonus);
      expect(laterBonus).toBeGreaterThanOrEqual(20); // Aggressive escalation
      
      mockRandom.mockRestore();
    });
  });

  describe('roast debt tracking', () => {
    it('should accumulate roast debt over time', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.9); // Don't roast
      
      // First call - no debt
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match = decisionLog ? decisionLog[0].match(/Debt: \+(\d+\.\d+)%/) : null;
      let debtBonus = match ? parseFloat(match[1]) : 0;
      expect(debtBonus).toBe(0);
      
      // Second call - debt accumulates
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog2 = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match2 = decisionLog2 ? decisionLog2[0].match(/Debt: \+(\d+\.\d+)%/) : null;
      debtBonus = match2 ? parseFloat(match2[1]) : 0;
      expect(debtBonus).toBeGreaterThan(0);
      
      mockRandom.mockRestore();
    });

    it('should provide massive bonus for high debt', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.9); // Don't roast
      
      // Manually set high debt
      (roastingEngine as any).roastingState.roastDebt.set(mockUserId, 2.0);
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const decisionLog = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match = decisionLog ? decisionLog[0].match(/Debt: \+(\d+\.\d+)%/) : null;
      const debtBonus = match ? parseFloat(match[1]) : 0;
      
      expect(debtBonus).toBeGreaterThan(50);
      expect(debtBonus).toBeLessThanOrEqual(70); // Capped at 70%
      
      // Should log significant debt
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('significant roast debt'));
      
      mockRandom.mockRestore();
    });

    it('should clear debt after roasting', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Build up debt
      mockRandom.mockReturnValue(0.9);
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      // Force a roast
      mockRandom.mockReturnValue(0.1);
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      // Check debt is cleared
      mockRandom.mockReturnValue(0.9);
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      const decisionLog = (logger.info as jest.Mock).mock.calls
        .find(call => call[0].includes('Roast decision'));
      const match = decisionLog ? decisionLog[0].match(/Debt: \+(\d+\.\d+)%/) : null;
      const debtBonus = match ? parseFloat(match[1]) : 0;
      
      expect(debtBonus).toBe(0);
      
      mockRandom.mockRestore();
    });
  });

  describe('server influence', () => {
    it('should apply hot server bonus', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      // Set up recent server activity
      const serverHistory = {
        recent: 3,
        lastRoastTime: Date.now() - 30 * 60 * 1000 // 30 minutes ago
      };
      (roastingEngine as any).roastingState.serverRoastHistory.set(mockServerId, serverHistory);
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      const serverBonus = getDecisionValue(/Server: \+(\d+\.\d+)%/);
      
      expect(serverBonus).toBe(20);
      
      mockRandom.mockRestore();
    });

    it('should apply dormant server bonus', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      // Set up old server activity
      const serverHistory = {
        recent: 0,
        lastRoastTime: Date.now() - 8 * 60 * 60 * 1000 // 8 hours ago
      };
      (roastingEngine as any).roastingState.serverRoastHistory.set(mockServerId, serverHistory);
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      const serverBonus = getDecisionValue(/Server: \+(\d+\.\d+)%/);
      
      expect(serverBonus).toBeGreaterThan(0);
      expect(serverBonus).toBeLessThanOrEqual(30);
      
      mockRandom.mockRestore();
    });

    it('should cache server influence calculations', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      // Multiple calls should use cache
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      roastingEngine.shouldRoast(mockUserId + '2', 'test', mockServerId);
      
      // Check that calculation was cached (would be complex to verify directly,
      // so we just ensure consistent results)
      const cache = (roastingEngine as any).calculationCache.serverInfluence;
      expect(cache.has(mockServerId)).toBe(true);
      
      mockRandom.mockRestore();
    });
  });

  describe('chaos mode', () => {
    it('should randomly activate chaos mode', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Reset chaos mode first
      (roastingEngine as any).roastingState.chaosMode = {
        active: false,
        endTime: 0,
        multiplier: 1
      };
      
      // Force chaos mode activation
      mockRandom.mockReturnValueOnce(0.04); // < 0.05 to trigger chaos
      mockRandom.mockReturnValueOnce(0.5); // For duration/multiplier
      mockRandom.mockReturnValueOnce(0.5); // For roast decision
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      // Check if chaos mode was mentioned in logs or state was updated
      const chaosLogFound = (logger.info as jest.Mock).mock.calls.some(call => 
        call[0].includes('Chaos mode activated') || call[0].includes('Chaos: '));
      
      const state = roastingEngine.getRoastingState();
      
      // Either log was found or state shows chaos mode
      expect(chaosLogFound || state.chaosMode).toBe(true);
      
      mockRandom.mockRestore();
    });

    it('should apply chaos multiplier to roast chance', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Manually activate chaos mode with known multiplier
      (roastingEngine as any).roastingState.chaosMode = {
        active: true,
        endTime: Date.now() + 60000,
        multiplier: 2.0
      };
      
      mockRandom.mockReturnValue(0.4); // Would normally not roast
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      // Check that chaos multiplier was logged
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Chaos: 2.0x'));
      
      mockRandom.mockRestore();
    });

    it('should have chaos override behavior', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Activate chaos mode
      (roastingEngine as any).roastingState.chaosMode = {
        active: true,
        endTime: Date.now() + 60000,
        multiplier: 1.5
      };
      
      // Test multiple times to ensure we trigger both roast and mercy
      let foundRoast = false;
      let foundMercy = false;
      
      for (let i = 0; i < 20; i++) {
        jest.clearAllMocks();
        
        // Trigger chaos override (30% chance)
        mockRandom.mockReturnValueOnce(0.25); // < 0.3 for chaos override
        
        if (!foundRoast) {
          mockRandom.mockReturnValueOnce(0.5); // < 0.7 for roast decision in chaos
        } else {
          mockRandom.mockReturnValueOnce(0.8); // > 0.7 for mercy in chaos
        }
        
        const result = roastingEngine.shouldRoast(mockUserId + i, 'test', mockServerId);
        
        if ((logger.info as jest.Mock).mock.calls.some(call => 
          call[0].includes('Chaos mode override: ROASTING'))) {
          foundRoast = true;
          expect(result).toBe(true);
        }
        
        if ((logger.info as jest.Mock).mock.calls.some(call => 
          call[0].includes('Chaos mode override: MERCY'))) {
          foundMercy = true;
          expect(result).toBe(false);
        }
        
        if (foundRoast && foundMercy) break;
      }
      
      expect(foundRoast).toBe(true);
      expect(foundMercy).toBe(true);
      
      mockRandom.mockRestore();
    });

    it('should expire chaos mode', () => {
      // Set expired chaos mode
      (roastingEngine as any).roastingState.chaosMode = {
        active: true,
        endTime: Date.now() - 1000, // Already expired
        multiplier: 2.0
      };
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      expect(logger.info).toHaveBeenCalledWith('Chaos mode ended');
      expect((roastingEngine as any).roastingState.chaosMode.active).toBe(false);
    });
  });

  describe('consecutive bonus', () => {
    it('should increase bonus with consecutive questions', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.9); // Don't roast
      
      const bonuses: number[] = [];
      
      for (let i = 0; i < 7; i++) {
        jest.clearAllMocks();
        roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
        
        const bonus = getDecisionValue(/Consecutive: \+(\d+\.\d+)%/);
        bonuses.push(bonus);
      }
      
      // Bonuses should increase
      for (let i = 1; i < bonuses.length; i++) {
        expect(bonuses[i]).toBeGreaterThan(bonuses[i - 1]);
      }
      
      // Different rates for different ranges
      expect(bonuses[1]).toBeLessThanOrEqual(20); // Early: up to 20%
      expect(bonuses[4]).toBeGreaterThan(bonuses[1] * 2); // Mid: accelerates
      expect(bonuses[6]).toBeGreaterThan(bonuses[4] * 1.5); // Late: aggressive
      
      mockRandom.mockRestore();
    });

    it('should have 10% chance of bonus bomb for high streaks', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Build up streak to 6+ questions
      mockRandom.mockReturnValue(0.9);
      for (let i = 0; i < 6; i++) {
        roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      }
      
      // Get bonus for 7th question
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      const highStreakBonus = getDecisionValue(/Consecutive: \+(\d+\.\d+)%/);
      
      // For 7 questions, base bonus should be significant (7 * 0.35 = 245%)
      // Plus random variance and potential bonus bomb
      expect(highStreakBonus).toBeGreaterThan(200);
      
      // Verify streak mechanism is working
      const stats = roastingEngine.getUserStats(mockUserId);
      expect(stats?.count).toBeGreaterThanOrEqual(7);
      
      mockRandom.mockRestore();
    });
  });

  describe('special behaviors', () => {
    it('should trigger mercy kill after 6+ questions', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Try multiple times since mercy kill only has 20% chance
      let mercyKillTriggered = false;
      
      for (let attempt = 0; attempt < 10 && !mercyKillTriggered; attempt++) {
        // Reset user stats for each attempt
        roastingEngine.clearUserStats(mockUserId);
        
        // Build up questions
        mockRandom.mockReturnValue(0.9);
        for (let i = 0; i < 6; i++) {
          roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
        }
        
        // Check current question count
        const statsBeforeMercy = roastingEngine.getUserStats(mockUserId);
        expect(statsBeforeMercy?.count).toBeGreaterThanOrEqual(6);
        
        // Trigger mercy kill check
        jest.clearAllMocks();
        mockRandom.mockReturnValueOnce(0.15); // < 0.2 for mercy kill
        
        const result = roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
        
        if ((logger.info as jest.Mock).mock.calls.some(call => 
          call[0].includes('Mercy kill activated'))) {
          mercyKillTriggered = true;
          expect(result).toBe(true);
          
          // Stats should be reset
          const stats = roastingEngine.getUserStats(mockUserId);
          expect(stats?.count).toBe(0);
          expect(stats?.lastRoasted).toBe(true);
        }
      }
      
      expect(mercyKillTriggered).toBe(true);
      
      mockRandom.mockRestore();
    });

    it('should apply reverse psychology mercy', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Set reverse psychology mood
      (roastingEngine as any).roastingState.botMood = 'reverse_psychology';
      
      // Try multiple times since reverse psychology mercy has 40% chance
      let mercyTriggered = false;
      
      for (let attempt = 0; attempt < 5 && !mercyTriggered; attempt++) {
        // Reset user stats
        roastingEngine.clearUserStats(mockUserId);
        
        // Build up questions (need > 5 for reverse psychology mercy)
        mockRandom.mockReturnValue(0.9);
        for (let i = 0; i < 6; i++) {
          roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
        }
        
        // Trigger reverse psychology mercy check
        jest.clearAllMocks();
        mockRandom.mockReturnValueOnce(0.35); // < 0.4 for mercy
        
        const result = roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
        
        if ((logger.info as jest.Mock).mock.calls.some(call => 
          call[0].includes('Reverse psychology mercy'))) {
          mercyTriggered = true;
          expect(result).toBe(false);
        }
      }
      
      expect(mercyTriggered).toBe(true);
      
      mockRandom.mockRestore();
    });
  });

  describe('dynamic state updates', () => {
    it('should update base chance every hour', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      const mockDate = jest.spyOn(Date, 'now');
      
      const initialTime = Date.now();
      mockDate.mockReturnValue(initialTime);
      
      // First call sets initial state
      mockRandom.mockReturnValue(0.5);
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      // Advance time by 1 hour
      mockDate.mockReturnValue(initialTime + 60 * 60 * 1000 + 1);
      mockRandom.mockReturnValue(0.3); // New base chance value
      
      jest.clearAllMocks();
      roastingEngine.shouldRoast(mockUserId, 'test2', mockServerId);
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Base roast chance updated to')
      );
      
      mockDate.mockRestore();
      mockRandom.mockRestore();
    });

    it('should change mood periodically', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      const mockDate = jest.spyOn(Date, 'now');
      
      const initialTime = Date.now();
      mockDate.mockReturnValue(initialTime);
      
      // Get initial mood
      const initialMood = (roastingEngine as any).roastingState.botMood;
      
      // Set mood start time to make it eligible for change
      (roastingEngine as any).roastingState.moodStartTime = initialTime - 40 * 60 * 1000; // 40 minutes ago
      
      // Now advance current time
      mockDate.mockReturnValue(initialTime);
      
      // Try multiple times to trigger mood change (has random duration)
      let moodChanged = false;
      for (let i = 0; i < 10 && !moodChanged; i++) {
        jest.clearAllMocks();
        mockRandom.mockReturnValue(0.5);
        
        roastingEngine.shouldRoast(mockUserId + i, 'test', mockServerId);
        
        if ((logger.info as jest.Mock).mock.calls.some(call => 
          call[0].includes('Bot mood changed to:'))) {
          moodChanged = true;
          
          const newMood = (roastingEngine as any).roastingState.botMood;
          expect(newMood).not.toBe(initialMood);
        }
      }
      
      expect(moodChanged).toBe(true);
      
      mockDate.mockRestore();
      mockRandom.mockRestore();
    });
  });

  describe('admin functions', () => {
    it('should get roasting state', () => {
      const state = roastingEngine.getRoastingState();
      
      expect(state).toHaveProperty('baseChance');
      expect(state).toHaveProperty('botMood');
      expect(state).toHaveProperty('chaosMode');
      expect(state).toHaveProperty('activeUsers');
      expect(state.activeUsers).toBe(0);
    });

    it('should clear user stats', () => {
      // Create some stats
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      expect(roastingEngine.getUserStats(mockUserId)).toBeDefined();
      
      const result = roastingEngine.clearUserStats(mockUserId);
      expect(result).toBe(true);
      expect(roastingEngine.getUserStats(mockUserId)).toBeUndefined();
      
      // Clear non-existent user
      const result2 = roastingEngine.clearUserStats('nonexistent');
      expect(result2).toBe(false);
    });

    it('should get user stats', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // No stats initially
      expect(roastingEngine.getUserStats(mockUserId)).toBeUndefined();
      
      // Create stats - ensure we don't roast
      mockRandom.mockReturnValue(0.9);
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      const stats = roastingEngine.getUserStats(mockUserId);
      expect(stats).toBeDefined();
      expect(stats?.count).toBe(1);
      expect(stats?.lastRoasted).toBe(false);
      
      mockRandom.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle empty message', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      expect(() => {
        roastingEngine.shouldRoast(mockUserId, '', mockServerId);
      }).not.toThrow();
      
      mockRandom.mockRestore();
    });

    it('should handle missing serverId', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      expect(() => {
        roastingEngine.shouldRoast(mockUserId, 'test');
      }).not.toThrow();
      
      // Should not apply server-based modifiers
      const serverBonus = getDecisionValue(/Server: \+(\d+\.\d+)%/);
      
      expect(serverBonus).toBe(0);
      
      mockRandom.mockRestore();
    });

    it('should cap total roast chance at configured maximum', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Set up extreme conditions to push chance over max
      (roastingEngine as any).roastingState.baseChance = 0.7;
      (roastingEngine as any).roastingState.botMood = 'bloodthirsty';
      (roastingEngine as any).roastingState.roastDebt.set(mockUserId, 3.0);
      
      // Build up high consecutive count
      mockRandom.mockReturnValue(0.95);
      for (let i = 0; i < 8; i++) {
        roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      }
      
      jest.clearAllMocks();
      mockRandom.mockReturnValue(0.85); // High enough to potentially exceed max
      roastingEngine.shouldRoast(mockUserId, 'very long technical message with code ```const x = 5``` and multiple questions? how does this work?', mockServerId);
      
      // Extract final chance from logs
      const finalChance = getDecisionValue(/Final chance: (\d+\.\d+)%/);
      
      expect(finalChance).toBeLessThanOrEqual(90); // Default max is 90%
      
      mockRandom.mockRestore();
    });

    it('should handle very large message without performance issues', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      const hugeMessage = 'a'.repeat(10000);
      const startTime = Date.now();
      
      roastingEngine.shouldRoast(mockUserId, hugeMessage, mockServerId);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should complete quickly
      
      mockRandom.mockRestore();
    });
  });

  describe('cache management', () => {
    it('should limit complexity cache size', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      // Generate more than 100 unique messages
      for (let i = 0; i < 120; i++) {
        roastingEngine.shouldRoast(mockUserId, `unique message ${i}`, mockServerId);
      }
      
      const cache = (roastingEngine as any).calculationCache.complexity;
      expect(cache.size).toBeLessThanOrEqual(100);
      
      mockRandom.mockRestore();
    });

    it('should limit server influence cache size', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5);
      
      // Generate more than 50 unique servers
      for (let i = 0; i < 60; i++) {
        roastingEngine.shouldRoast(mockUserId, 'test', `server${i}`);
      }
      
      const cache = (roastingEngine as any).calculationCache.serverInfluence;
      expect(cache.size).toBeLessThanOrEqual(50);
      
      mockRandom.mockRestore();
    });

    it('should invalidate mood cache on mood change', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      const mockDate = jest.spyOn(Date, 'now');
      
      mockRandom.mockReturnValue(0.5);
      
      // Initial call to populate mood cache
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      expect((roastingEngine as any).moodCache).toBeDefined();
      
      // Force mood change
      const initialTime = Date.now();
      mockDate.mockReturnValue(initialTime + 40 * 60 * 1000); // 40 minutes later
      
      roastingEngine.shouldRoast(mockUserId, 'test', mockServerId);
      
      // Mood cache should be reset
      const moodCache = (roastingEngine as any).moodCache;
      expect(moodCache.modifiersByCount.size).toBeLessThanOrEqual(1);
      
      mockDate.mockRestore();
      mockRandom.mockRestore();
    });
  });

  describe('integration scenarios', () => {
    it('should handle rapid consecutive calls from same user', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      // Simulate rapid fire questions
      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        mockRandom.mockReturnValue(Math.random()); // Varying probabilities
        results.push(roastingEngine.shouldRoast(mockUserId, `rapid question ${i}`, mockServerId));
      }
      
      // Should have at least one roast in 10 attempts (statistically very likely)
      expect(results.some(r => r)).toBe(true);
      
      // User stats should be properly tracked
      const stats = roastingEngine.getUserStats(mockUserId);
      expect(stats).toBeDefined();
      
      mockRandom.mockRestore();
    });

    it('should handle multiple users in same server', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      
      const users = ['user1', 'user2', 'user3'];
      const results: Record<string, boolean[]> = {};
      
      // Each user asks questions - ensure no roasting initially
      users.forEach(user => {
        results[user] = [];
        for (let i = 0; i < 5; i++) {
          mockRandom.mockReturnValue(0.9); // High value to avoid roasting
          results[user].push(roastingEngine.shouldRoast(user, 'question', mockServerId));
        }
      });
      
      // Each user should have independent tracking
      users.forEach(user => {
        const stats = roastingEngine.getUserStats(user);
        expect(stats).toBeDefined();
        expect(stats?.count).toBeGreaterThanOrEqual(1);
      });
      
      // Force a roast to create server history
      mockRandom.mockReturnValue(0.1);
      roastingEngine.shouldRoast('user1', 'question', mockServerId);
      
      // Server history should now exist
      const serverHistory = (roastingEngine as any).roastingState.serverRoastHistory.get(mockServerId);
      expect(serverHistory).toBeDefined();
      
      mockRandom.mockRestore();
    });

    it('should maintain performance with many active users', () => {
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.7);
      
      const startTime = Date.now();
      
      // Simulate 100 users each asking 5 questions
      for (let user = 0; user < 100; user++) {
        for (let q = 0; q < 5; q++) {
          roastingEngine.shouldRoast(`user${user}`, 'question', mockServerId);
        }
      }
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      
      const state = roastingEngine.getRoastingState();
      expect(state.activeUsers).toBe(100);
      
      mockRandom.mockRestore();
    });
  });
});