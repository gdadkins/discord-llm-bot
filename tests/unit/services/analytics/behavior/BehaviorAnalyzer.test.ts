/**
 * @file BehaviorAnalyzer Tests
 * Tests for the refactored modular behavior analyzer
 */

import { BehaviorAnalyzer } from '../../../../../src/services/analytics/behavior/BehaviorAnalyzer';
import type { MessageContext } from '../../../../../src/commands';

describe('BehaviorAnalyzer', () => {
  let analyzer: BehaviorAnalyzer;
  let mockContext: MessageContext;

  beforeEach(() => {
    analyzer = new BehaviorAnalyzer();
    mockContext = {
      channelName: 'test-channel',
      channelType: 'text',
      isThread: false,
      lastActivity: new Date(),
      pinnedCount: 0,
      attachments: [],
      recentEmojis: [],
      imageAttachments: []
    };
  });

  afterEach(async () => {
    await analyzer.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(analyzer.initialize()).resolves.not.toThrow();
    });

    it('should have healthy status after initialization', async () => {
      await analyzer.initialize();
      const health = analyzer.getHealthStatus();
      expect(health.healthy).toBe(true);
      expect(health.name).toBe('BehaviorAnalyzer');
    });
  });

  describe('message analysis', () => {
    it('should analyze message without errors', async () => {
      const userId = 'test-user';
      const message = 'Hello world! This is a test message.';

      await expect(analyzer.analyzeMessage(userId, message)).resolves.not.toThrow();
    });

    it('should create behavior pattern for new user', async () => {
      const userId = 'new-user';
      const message = 'First message from new user';

      await analyzer.analyzeMessage(userId, message);
      const pattern = analyzer.getBehaviorPattern(userId);

      expect(pattern).toBeDefined();
      expect(pattern?.userId).toBe(userId);
      expect(pattern?.messageFrequency).toBeGreaterThanOrEqual(0);
    });

    it('should update existing behavior pattern', async () => {
      const userId = 'existing-user';
      const message1 = 'First message';
      const message2 = 'Second message with programming content';

      await analyzer.analyzeMessage(userId, message1);
      const pattern1 = analyzer.getBehaviorPattern(userId);

      await analyzer.analyzeMessage(userId, message2);
      const pattern2 = analyzer.getBehaviorPattern(userId);

      expect(pattern2?.messageTimestamps.length).toBe(2);
      expect(pattern1?.messageTimestamps.length).toBe(1);
    });
  });

  describe('behavior analysis', () => {
    it('should analyze user behavior with context', async () => {
      const userId = 'test-user';
      const message = 'I need help with JavaScript functions';

      const analysis = await analyzer.analyzeUserBehavior(userId, message, mockContext);

      expect(analysis).toBeDefined();
      expect(analysis.userId).toBe(userId);
      expect(analysis.messageLength).toBe(message.length);
      expect(analysis.sentiment).toMatch(/positive|neutral|negative/);
      expect(Array.isArray(analysis.topics)).toBe(true);
      expect(analysis.engagement).toBeGreaterThanOrEqual(0);
      expect(analysis.engagement).toBeLessThanOrEqual(1);
    });
  });

  describe('pattern detection', () => {
    it('should detect patterns for user', async () => {
      const userId = 'test-user';
      
      // First create some data for the user
      await analyzer.analyzeMessage(userId, 'Test message with some content');
      
      const patterns = analyzer.detectPatterns(userId);

      expect(patterns).toBeDefined();
      expect(patterns.userId).toBe(userId);
      expect(patterns.activityPatterns).toBeDefined();
      expect(patterns.communicationPatterns).toBeDefined();
      expect(patterns.socialPatterns).toBeDefined();
    });
  });

  describe('anomaly detection', () => {
    it('should detect anomalies', async () => {
      const userId = 'test-user';
      const message = 'Short message';

      const analysis = await analyzer.analyzeUserBehavior(userId, message, mockContext);
      const anomalies = analyzer.detectAnomalies(userId, analysis);

      expect(Array.isArray(anomalies)).toBe(true);
    });
  });

  describe('action prediction', () => {
    it('should predict next actions', () => {
      const userId = 'test-user';
      const predictions = analyzer.predictNextAction(userId);

      expect(Array.isArray(predictions)).toBe(true);
      expect(predictions.length).toBeGreaterThan(0);
      
      predictions.forEach(prediction => {
        expect(prediction.action).toBeDefined();
        expect(prediction.probability).toBeGreaterThan(0);
        expect(prediction.probability).toBeLessThanOrEqual(1);
        expect(prediction.timeframe).toBeDefined();
      });
    });
  });

  describe('intent prediction', () => {
    it('should predict intent from message', () => {
      const message = 'How do I fix this JavaScript error?';
      const intent = analyzer.predictUserIntent(message, mockContext);

      expect(intent).toBeDefined();
      expect(intent.intent).toBe('ask_question');
      expect(intent.confidence).toBeGreaterThan(0);
      expect(intent.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect greeting intent', () => {
      const message = 'Hello everyone!';
      const intent = analyzer.predictUserIntent(message, mockContext);

      expect(intent.intent).toBe('greeting');
      expect(intent.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('statistics', () => {
    it('should provide behavior statistics', () => {
      const stats = analyzer.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalUsers).toBe('number');
      expect(typeof stats.activePatterns).toBe('number');
      expect(typeof stats.stalePatterns).toBe('number');
      expect(typeof stats.averageComplexity).toBe('number');
      expect(typeof stats.averageFrequency).toBe('number');
    });
  });

  describe('cleanup', () => {
    it('should clean up expired patterns', () => {
      expect(() => analyzer.cleanup()).not.toThrow();
    });
  });
});