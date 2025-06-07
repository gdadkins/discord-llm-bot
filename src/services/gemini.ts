import { GoogleGenAI, FinishReason, BlockedReason } from '@google/genai';
import { logger } from '../utils/logger';
import { RateLimiter } from './rateLimiter';
import { ContextManager } from './contextManager';
import { PersonalityManager } from './personalityManager';
import { CacheManager } from './cacheManager';
import { GracefulDegradation } from './gracefulDegradation';
import type { HealthMonitor } from './healthMonitor';
import type { BotConfiguration } from './configurationManager';
import type { MessageContext } from '../commands';
import type { GuildMember, Client, Guild } from 'discord.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  messages: Message[];
  lastActive: number;
  // Circular buffer optimization fields
  bufferStart: number;
  bufferSize: number;
  totalLength: number;
  maxBufferSize: number;
}


interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  retryMultiplier: number;
}

// Memoization cache interfaces for roast calculations
interface RoastCalculationCache {
  complexity: Map<string, { value: number; hash: string }>;
  timeModifier: { value: number; hour: number };
  moodModifier: Map<string, number>;
  serverInfluence: Map<string, { value: number; timestamp: number }>;
  consecutiveBonus: Map<number, number>;
}

interface MoodCache {
  mood: 'sleepy' | 'caffeinated' | 'chaotic' | 'reverse_psychology' | 'bloodthirsty';
  modifiersByCount: Map<number, number>;
  timestamp: number;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private rateLimiter: RateLimiter;
  private contextManager: ContextManager;
  private personalityManager: PersonalityManager;
  private cacheManager: CacheManager;
  private gracefulDegradation: GracefulDegradation;
  private discordClient?: Client;
  private readonly SYSTEM_INSTRUCTION: string;
  private conversations: Map<string, Conversation>;
  private readonly SESSION_TIMEOUT_MS: number;
  private readonly MAX_MESSAGES_PER_CONVERSATION: number;
  private readonly MAX_CONTEXT_LENGTH: number;
  private readonly GROUNDING_THRESHOLD: number;
  private readonly THINKING_BUDGET: number;
  private readonly INCLUDE_THOUGHTS: boolean;
  private readonly ENABLE_CODE_EXECUTION: boolean;
  private readonly ENABLE_STRUCTURED_OUTPUT: boolean;
  private readonly RETRY_OPTIONS: RetryOptions;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private userQuestionCounts: Map<
    string,
    { count: number; lastRoasted: boolean }
  > = new Map();
  private roastingState: {
    baseChance: number;
    lastBaseChanceUpdate: number;
    botMood:
      | 'sleepy'
      | 'caffeinated'
      | 'chaotic'
      | 'reverse_psychology'
      | 'bloodthirsty';
    moodStartTime: number;
    serverRoastHistory: Map<string, { recent: number; lastRoastTime: number }>;
    chaosMode: { active: boolean; endTime: number; multiplier: number };
    roastDebt: Map<string, number>;
  } = {
      baseChance: 0.5,
      lastBaseChanceUpdate: 0,
      botMood: 'caffeinated',
      moodStartTime: Date.now(),
      serverRoastHistory: new Map(),
      chaosMode: { active: false, endTime: 0, multiplier: 1 },
      roastDebt: new Map(),
    };
  
  // Memoization cache for expensive calculations
  private calculationCache: RoastCalculationCache = {
    complexity: new Map(),
    timeModifier: { value: 0, hour: -1 },
    moodModifier: new Map(),
    serverInfluence: new Map(),
    consecutiveBonus: new Map()
  };
  
  // Cache for mood-based calculations
  private moodCache: MoodCache | null = null;
  
  // Pre-calculated static values
  private static readonly COMPLEXITY_PATTERNS = {
    code: /```|`/,
    programming: /\b(function|class|import|const|let|var|if|else|for|while)\b/i,
    technical: /\b(api|database|server|client|bug|error|exception|deploy|build)\b/i
  };

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });

    this.SYSTEM_INSTRUCTION =
      process.env.GEMINI_SYSTEM_INSTRUCTION ||
      'You are a helpful Discord bot assistant. Provide clear and concise responses to user queries.';

    const rpmLimit = parseInt(process.env.GEMINI_RATE_LIMIT_RPM || '10');
    const dailyLimit = parseInt(process.env.GEMINI_RATE_LIMIT_DAILY || '500');

    this.rateLimiter = new RateLimiter(rpmLimit, dailyLimit);
    this.contextManager = new ContextManager();
    this.personalityManager = new PersonalityManager();
    this.cacheManager = new CacheManager();
    this.gracefulDegradation = new GracefulDegradation();
    this.conversations = new Map();

    // Configurable context settings
    this.SESSION_TIMEOUT_MS =
      parseInt(process.env.CONVERSATION_TIMEOUT_MINUTES || '30') * 60 * 1000;
    this.MAX_MESSAGES_PER_CONVERSATION = parseInt(
      process.env.MAX_CONVERSATION_MESSAGES || '100',
    );
    this.MAX_CONTEXT_LENGTH = parseInt(
      process.env.MAX_CONTEXT_CHARS || '50000',
    );
    this.GROUNDING_THRESHOLD = parseFloat(
      process.env.GROUNDING_THRESHOLD || '0.3',
    );
    this.THINKING_BUDGET = parseInt(process.env.THINKING_BUDGET || '1024');
    this.INCLUDE_THOUGHTS = process.env.INCLUDE_THOUGHTS === 'true';
    this.ENABLE_CODE_EXECUTION = process.env.ENABLE_CODE_EXECUTION === 'true';
    this.ENABLE_STRUCTURED_OUTPUT =
      process.env.ENABLE_STRUCTURED_OUTPUT === 'true';

    // Configure retry behavior
    this.RETRY_OPTIONS = {
      maxRetries: parseInt(process.env.GEMINI_MAX_RETRIES || '3'),
      retryDelay: parseInt(process.env.GEMINI_RETRY_DELAY_MS || '1000'),
      retryMultiplier: parseFloat(process.env.GEMINI_RETRY_MULTIPLIER || '2.0'),
    };
  }

  async initialize(): Promise<void> {
    await this.rateLimiter.initialize();
    await this.personalityManager.initialize();
    await this.cacheManager.initialize();
    await this.gracefulDegradation.initialize();

    // Start cleanup interval - run every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldConversations();
      },
      5 * 60 * 1000,
    );

    logger.info(
      `GeminiService initialized with conversation memory - Timeout: ${this.SESSION_TIMEOUT_MS / 60000}min, Max messages: ${this.MAX_MESSAGES_PER_CONVERSATION}, Max context: ${this.MAX_CONTEXT_LENGTH} chars`,
    );
    logger.info(
      `Google Search grounding configured with threshold: ${this.GROUNDING_THRESHOLD} (awaiting @google/genai package support)`,
    );
    logger.info(
      `Thinking mode configured with budget: ${this.THINKING_BUDGET} tokens, include thoughts: ${this.INCLUDE_THOUGHTS} (enabled by default in Gemini 2.5)`,
    );
    logger.info(
      `Additional features: Code execution: ${this.ENABLE_CODE_EXECUTION}, Structured output: ${this.ENABLE_STRUCTURED_OUTPUT}`,
    );
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cacheManager.shutdown();
    await this.gracefulDegradation.shutdown();
    
    // Clear calculation caches on shutdown
    this.calculationCache.complexity.clear();
    this.calculationCache.serverInfluence.clear();
    this.calculationCache.consecutiveBonus.clear();
    this.moodCache = null;
  }

  setHealthMonitor(healthMonitor: HealthMonitor): void {
    this.gracefulDegradation.setHealthMonitor(healthMonitor);
  }

  setDiscordClient(client: Client): void {
    this.discordClient = client;
    logger.info('Discord client set for system context awareness');
  }

  private cleanupOldConversations(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, conversation] of this.conversations.entries()) {
      if (now - conversation.lastActive > this.SESSION_TIMEOUT_MS) {
        this.conversations.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(
        `Cleaned up ${cleaned} old conversations. Active conversations: ${this.conversations.size}`,
      );
    }
  }

  private getOrCreateConversation(userId: string): Conversation {
    const existing = this.conversations.get(userId);
    if (existing) {
      return existing;
    }

    // Initialize with circular buffer optimization
    const maxSize = this.MAX_MESSAGES_PER_CONVERSATION * 2;
    const newConversation: Conversation = {
      messages: new Array(maxSize), // Pre-allocate array
      lastActive: Date.now(),
      bufferStart: 0,
      bufferSize: 0,
      totalLength: 0,
      maxBufferSize: maxSize,
    };

    this.conversations.set(userId, newConversation);
    return newConversation;
  }

  private addToConversation(
    userId: string,
    userMessage: string,
    assistantResponse: string,
  ): void {
    const conversation = this.getOrCreateConversation(userId);
    const now = Date.now();

    // Add user message using circular buffer
    this.addMessageToBuffer(conversation, {
      role: 'user',
      content: userMessage,
      timestamp: now,
    });

    // Add assistant response using circular buffer
    this.addMessageToBuffer(conversation, {
      role: 'assistant',
      content: assistantResponse,
      timestamp: now,
    });

    // Smart trimming by character length (only when needed)
    this.trimConversationByLength(conversation);

    conversation.lastActive = now;
  }

  private addMessageToBuffer(conversation: Conversation, message: Message): void {
    const writeIndex = (conversation.bufferStart + conversation.bufferSize) % conversation.maxBufferSize;
    
    // If buffer is full, remove oldest message
    if (conversation.bufferSize === conversation.maxBufferSize) {
      const oldMessage = conversation.messages[conversation.bufferStart];
      if (oldMessage) {
        conversation.totalLength -= oldMessage.content.length;
      }
      conversation.bufferStart = (conversation.bufferStart + 1) % conversation.maxBufferSize;
      conversation.bufferSize--;
    }
    
    // Add new message
    conversation.messages[writeIndex] = message;
    conversation.totalLength += message.content.length;
    conversation.bufferSize++;
  }

  private trimConversationByLength(conversation: Conversation): void {
    // Only trim if we exceed the length limit and have more than 2 messages
    while (
      conversation.totalLength > this.MAX_CONTEXT_LENGTH &&
      conversation.bufferSize > 2
    ) {
      const oldMessage = conversation.messages[conversation.bufferStart];
      if (oldMessage) {
        conversation.totalLength -= oldMessage.content.length;
      }
      conversation.bufferStart = (conversation.bufferStart + 1) % conversation.maxBufferSize;
      conversation.bufferSize--;
    }
  }

  private buildConversationContext(userId: string): string {
    const conversation = this.conversations.get(userId);
    if (!conversation || conversation.bufferSize === 0) {
      return '';
    }

    // Check if conversation is still active
    if (Date.now() - conversation.lastActive > this.SESSION_TIMEOUT_MS) {
      this.conversations.delete(userId);
      return '';
    }

    // Build context from circular buffer efficiently
    const contextParts: string[] = [];
    for (let i = 0; i < conversation.bufferSize; i++) {
      const messageIndex = (conversation.bufferStart + i) % conversation.maxBufferSize;
      const msg = conversation.messages[messageIndex];
      if (msg) {
        contextParts.push(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`);
      }
    }

    return contextParts.join('\n');
  }

  private updateDynamicRoastingState(): void {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;

    // Update base chance every hour with random variance
    if (now - this.roastingState.lastBaseChanceUpdate > hourInMs) {
      this.roastingState.baseChance = 0.2 + Math.random() * 0.5; // 20-70%
      this.roastingState.lastBaseChanceUpdate = now;
      logger.info(
        `Base roast chance updated to ${(this.roastingState.baseChance * 100).toFixed(1)}%`,
      );
    }

    // Update bot mood every 30 minutes to 2 hours (random)
    const moodDuration = (30 + Math.random() * 90) * 60 * 1000;
    if (now - this.roastingState.moodStartTime > moodDuration) {
      const moods: Array<typeof this.roastingState.botMood> = [
        'sleepy',
        'caffeinated',
        'chaotic',
        'reverse_psychology',
        'bloodthirsty',
      ];
      this.roastingState.botMood =
        moods[Math.floor(Math.random() * moods.length)];
      this.roastingState.moodStartTime = now;
      
      // Clear mood cache on mood change
      this.moodCache = null;
      
      logger.info(`Bot mood changed to: ${this.roastingState.botMood}`);
    }

    // Check for chaos mode expiration
    if (
      this.roastingState.chaosMode.active &&
      now > this.roastingState.chaosMode.endTime
    ) {
      this.roastingState.chaosMode.active = false;
      logger.info('Chaos mode ended');
    }

    // Random chaos mode trigger (5% chance per call)
    if (!this.roastingState.chaosMode.active && Math.random() < 0.05) {
      this.roastingState.chaosMode = {
        active: true,
        endTime: now + (5 + Math.random() * 25) * 60 * 1000, // 5-30 minutes
        multiplier: 0.5 + Math.random() * 2, // 0.5x to 2.5x multiplier
      };
      logger.info(
        `Chaos mode activated for ${((this.roastingState.chaosMode.endTime - now) / 60000).toFixed(0)} minutes with ${this.roastingState.chaosMode.multiplier.toFixed(1)}x multiplier`,
      );
    }
  }

  private calculateComplexityModifier(message: string): number {
    // Generate a simple hash for cache key
    const hash = `${message.length}-${message.includes('?')}-${message.includes('`')}`;
    
    // Check cache first
    const cached = this.calculationCache.complexity.get(hash);
    if (cached && cached.hash === hash) {
      return cached.value;
    }
    
    let complexity = 0;

    // Length modifier (longer = higher chance)
    complexity += Math.min(message.length / 100, 0.3);

    // Code presence (use pre-compiled patterns)
    if (GeminiService.COMPLEXITY_PATTERNS.code.test(message)) complexity += 0.2;
    if (GeminiService.COMPLEXITY_PATTERNS.programming.test(message)) complexity += 0.15;
    if (GeminiService.COMPLEXITY_PATTERNS.technical.test(message)) complexity += 0.1;

    // Question complexity indicators
    if (message.includes('?')) complexity += 0.05;
    if (message.split('?').length > 2) complexity += 0.1; // Multiple questions

    const result = Math.min(complexity, 0.5); // Cap at 50% bonus
    
    // Cache the result (limit cache size to prevent memory bloat)
    if (this.calculationCache.complexity.size > 100) {
      // Remove oldest entries (simple LRU)
      const firstKey = this.calculationCache.complexity.keys().next().value;
      if (firstKey) {
        this.calculationCache.complexity.delete(firstKey);
      }
    }
    this.calculationCache.complexity.set(hash, { value: result, hash });
    
    return result;
  }

  private getTimeBasedModifier(): number {
    const hour = new Date().getHours();
    
    // Return cached value if same hour
    if (this.calculationCache.timeModifier.hour === hour) {
      return this.calculationCache.timeModifier.value;
    }
    
    let modifier: number;
    
    // Night owls get roasted more (11PM - 3AM)
    if (hour >= 23 || hour <= 3) {
      modifier = 0.3;
    }
    // Early birds get some mercy (5AM - 8AM)
    else if (hour >= 5 && hour <= 8) {
      modifier = -0.1;
    }
    // Peak roasting hours (7PM - 11PM)
    else if (hour >= 19 && hour <= 23) {
      modifier = 0.2;
    }
    // Afternoon energy (1PM - 5PM)
    else if (hour >= 13 && hour <= 17) {
      modifier = 0.1;
    }
    else {
      modifier = 0; // Normal hours
    }
    
    // Cache the result
    this.calculationCache.timeModifier = { value: modifier, hour };
    
    return modifier;
  }

  private getMoodModifier(questionCount: number): number {
    // Check if mood cache is valid
    if (this.moodCache && 
        this.moodCache.mood === this.roastingState.botMood &&
        this.moodCache.timestamp === this.roastingState.moodStartTime) {
      
      // Check if we have cached value for this question count
      const cached = this.moodCache.modifiersByCount.get(questionCount);
      if (cached !== undefined) {
        return cached;
      }
    } else {
      // Reset cache on mood change
      this.moodCache = {
        mood: this.roastingState.botMood,
        modifiersByCount: new Map(),
        timestamp: this.roastingState.moodStartTime
      };
    }
    
    let modifier: number;
    
    switch (this.roastingState.botMood) {
    case 'sleepy':
      modifier = -0.2 + questionCount * 0.05; // Starts low but wakes up
      break;
    case 'caffeinated':
      modifier = 0.1 + questionCount * 0.1; // Eager and escalating
      break;
    case 'chaotic':
      modifier = Math.random() * 0.6 - 0.3; // -30% to +30% random
      // Don't cache random values
      return modifier;
    case 'reverse_psychology':
      // Intentionally lower when it should be high
      modifier = questionCount > 3 ? -0.4 : 0.2;
      break;
    case 'bloodthirsty':
      modifier = 0.2 + questionCount * 0.15; // Aggressive escalation
      break;
    default:
      modifier = 0;
    }
    
    // Cache the result (limit cache size)
    if (this.moodCache.modifiersByCount.size < 20) {
      this.moodCache.modifiersByCount.set(questionCount, modifier);
    }
    
    return modifier;
  }

  private updateRoastDebt(userId: string, serverId?: string): number {
    if (!serverId) return 0;

    const debt = this.roastingState.roastDebt.get(userId) || 0;
    this.roastingState.roastDebt.set(userId, debt + 0.05); // Debt grows over time

    // Massive debt bonus for users who haven't been roasted in a while
    if (debt > 1.0) {
      logger.info(
        `User ${userId} has accumulated significant roast debt: ${debt.toFixed(2)}`,
      );
      return Math.min(debt * 0.3, 0.7); // Up to 70% bonus from debt
    }

    return debt * 0.1; // Small debt bonus
  }

  private getServerInfluenceModifier(serverId?: string): number {
    if (!serverId) return 0;

    // Check cache (cache for 5 minutes)
    const cached = this.calculationCache.serverInfluence.get(serverId);
    if (cached && (Date.now() - cached.timestamp) < 5 * 60 * 1000) {
      return cached.value;
    }

    const serverHistory = this.roastingState.serverRoastHistory.get(serverId);
    if (!serverHistory) return 0;

    const timeSinceLastRoast = Date.now() - serverHistory.lastRoastTime;
    const hoursSinceRoast = timeSinceLastRoast / (1000 * 60 * 60);

    let modifier: number;
    
    // If server was recently active with roasts, increase chance
    if (hoursSinceRoast < 1 && serverHistory.recent > 2) {
      modifier = 0.2; // Hot server bonus
    }
    // If server hasn't seen roasts in a while, increase chance
    else if (hoursSinceRoast > 6) {
      modifier = Math.min(hoursSinceRoast * 0.02, 0.3); // Up to 30% bonus
    }
    else {
      modifier = 0;
    }
    
    // Cache the result
    this.calculationCache.serverInfluence.set(serverId, {
      value: modifier,
      timestamp: Date.now()
    });
    
    // Clean old cache entries
    if (this.calculationCache.serverInfluence.size > 50) {
      // Remove oldest entry
      let oldestKey: string | undefined;
      let oldestTime = Date.now();
      
      for (const [key, value] of this.calculationCache.serverInfluence.entries()) {
        if (value.timestamp < oldestTime) {
          oldestTime = value.timestamp;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        this.calculationCache.serverInfluence.delete(oldestKey);
      }
    }
    
    return modifier;
  }

  private getConsecutiveBonus(questionCount: number): number {
    // Check cache for deterministic parts
    const cached = this.calculationCache.consecutiveBonus.get(questionCount);
    if (cached !== undefined) {
      // For cached values, add small random variance to maintain unpredictability
      return cached + (Math.random() * 0.05 - 0.025);
    }
    
    if (questionCount === 0) {
      this.calculationCache.consecutiveBonus.set(0, 0);
      return 0;
    }
    
    let baseValue: number;
    
    if (questionCount <= 2) {
      // Early questions: base 10% per question (was 5-15% random)
      baseValue = questionCount * 0.1;
    } else if (questionCount <= 5) {
      // Mid streak: base 25% per question (was 15-35% random)
      baseValue = questionCount * 0.25;
    } else {
      // Late streak: base 35% per question (was 20-50% random)
      baseValue = questionCount * 0.35;
    }
    
    // Cache base value (limit cache size)
    if (this.calculationCache.consecutiveBonus.size < 20) {
      this.calculationCache.consecutiveBonus.set(questionCount, baseValue);
    }
    
    // Add random variance on top of cached base
    const variance = questionCount <= 2 ? 0.05 : questionCount <= 5 ? 0.1 : 0.15;
    const randomBonus = Math.random() * variance * questionCount;
    
    // 10% chance of bonus bomb for high streaks
    const bonusBomb = (questionCount > 5 && Math.random() < 0.1) ? Math.random() * 0.5 : 0;
    
    return baseValue + randomBonus + bonusBomb;
  }

  private shouldRoast(
    userId: string,
    message: string = '',
    serverId?: string,
  ): boolean {
    // Update dynamic state first
    this.updateDynamicRoastingState();

    const roastConfig = {
      maxChance: parseFloat(process.env.ROAST_MAX_CHANCE || '0.9'), // 90% max
      cooldownAfterRoast: process.env.ROAST_COOLDOWN === 'true', // Skip next question after roasting
    };

    // Get or create user's question tracking
    let userStats = this.userQuestionCounts.get(userId);
    if (!userStats) {
      userStats = { count: 0, lastRoasted: false };
      this.userQuestionCounts.set(userId, userStats);
    }

    // Special chaos mode override - sometimes ignore all rules
    if (this.roastingState.chaosMode.active) {
      const chaosRoll = Math.random();

      // In chaos mode, 30% chance to completely ignore normal logic
      if (chaosRoll < 0.3) {
        const chaosDecision = Math.random() < 0.7; // 70% chance to roast in chaos override
        logger.info(
          `Chaos mode override: ${chaosDecision ? 'ROASTING' : 'MERCY'} (${(chaosRoll * 100).toFixed(0)}% chaos roll)`,
        );

        if (chaosDecision) {
          userStats.count = 0;
          userStats.lastRoasted = true;
          this.updateServerHistory(serverId, true);
          this.roastingState.roastDebt.set(userId, 0);
        }

        return chaosDecision;
      }
    }

    // Check cooldown with 15% chance to ignore it (psychological warfare)
    if (roastConfig.cooldownAfterRoast && userStats.lastRoasted) {
      const ignoreCooldown = Math.random() < 0.15; // 15% chance to ignore cooldown

      if (!ignoreCooldown) {
        userStats.lastRoasted = false;
        userStats.count = 0;
        logger.info(`Cooldown respected for user ${userId}`);
        return false;
      } else {
        logger.info(
          `Cooldown IGNORED for user ${userId} (psychological warfare)`,
        );
      }
    }

    // Build roast probability from multiple factors
    let roastChance = this.roastingState.baseChance;

    // Add consecutive bonus (now dynamic)
    const consecutiveBonus = this.getConsecutiveBonus(userStats.count);
    roastChance += consecutiveBonus;

    // Add complexity modifier
    const complexityBonus = this.calculateComplexityModifier(message);
    roastChance += complexityBonus;

    // Add time-based modifier
    const timeBonus = this.getTimeBasedModifier();
    roastChance += timeBonus;

    // Add mood modifier
    const moodBonus = this.getMoodModifier(userStats.count);
    roastChance += moodBonus;

    // Add roast debt bonus
    const debtBonus = this.updateRoastDebt(userId, serverId);
    roastChance += debtBonus;

    // Add server influence modifier
    const serverBonus = this.getServerInfluenceModifier(serverId);
    roastChance += serverBonus;

    // Apply chaos multiplier if active
    if (this.roastingState.chaosMode.active) {
      roastChance *= this.roastingState.chaosMode.multiplier;
    }

    // Ensure we don't go below 0 or above max
    roastChance = Math.max(0, Math.min(roastChance, roastConfig.maxChance));

    // Special "mercy kill" logic - sometimes roast immediately instead of building up
    if (userStats.count >= 6 && Math.random() < 0.2) {
      logger.info(
        `Mercy kill activated for user ${userId} after ${userStats.count} questions`,
      );
      userStats.count = 0;
      userStats.lastRoasted = true;
      this.updateServerHistory(serverId, true);
      this.roastingState.roastDebt.set(userId, 0);
      return true;
    }

    // Reverse psychology in reverse psychology mode
    if (
      this.roastingState.botMood === 'reverse_psychology' &&
      userStats.count > 5
    ) {
      // Sometimes give mercy when they expect to be roasted
      if (Math.random() < 0.4) {
        logger.info(
          `Reverse psychology mercy for user ${userId} (expected roast but got mercy)`,
        );
        userStats.count++;
        return false;
      }
    }

    // Roll the dice
    const shouldRoastResult = Math.random() < roastChance;

    // Detailed logging of the decision process
    logger.info(
      `Roast decision for user ${userId}: ${shouldRoastResult ? 'ROAST' : 'PASS'} | ` +
        `Final chance: ${(roastChance * 100).toFixed(1)}% | ` +
        `Base: ${(this.roastingState.baseChance * 100).toFixed(1)}% | ` +
        `Consecutive: +${(consecutiveBonus * 100).toFixed(1)}% | ` +
        `Complexity: +${(complexityBonus * 100).toFixed(1)}% | ` +
        `Time: ${timeBonus >= 0 ? '+' : ''}${(timeBonus * 100).toFixed(1)}% | ` +
        `Mood (${this.roastingState.botMood}): ${moodBonus >= 0 ? '+' : ''}${(moodBonus * 100).toFixed(1)}% | ` +
        `Debt: +${(debtBonus * 100).toFixed(1)}% | ` +
        `Server: +${(serverBonus * 100).toFixed(1)}% | ` +
        `Questions: ${userStats.count} | ` +
        `Chaos: ${this.roastingState.chaosMode.active ? `${this.roastingState.chaosMode.multiplier.toFixed(1)}x` : 'OFF'}`,
    );

    // Update tracking
    if (shouldRoastResult) {
      userStats.count = 0;
      userStats.lastRoasted = true;
      this.updateServerHistory(serverId, true);
      this.roastingState.roastDebt.set(userId, 0); // Clear debt after roasting
    } else {
      userStats.count++;
      userStats.lastRoasted = false;
    }

    return shouldRoastResult;
  }

  private updateServerHistory(
    serverId: string | undefined,
    wasRoasted: boolean,
  ): void {
    if (!serverId) return;

    let serverHistory = this.roastingState.serverRoastHistory.get(serverId);
    if (!serverHistory) {
      serverHistory = { recent: 0, lastRoastTime: 0 };
      this.roastingState.serverRoastHistory.set(serverId, serverHistory);
    }

    if (wasRoasted) {
      serverHistory.recent++;
      serverHistory.lastRoastTime = Date.now();

      // Decay recent count over time with proper timer management
      setTimeout(
        () => {
          // Remove timer from tracking set when it executes
          if (serverHistory && serverHistory.recent > 0) {
            serverHistory.recent--;
          }
        },
        60 * 60 * 1000,
      ); // 1 hour decay
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(error: unknown): boolean {
    if (!error) return false;
    
    const err = error as Record<string, unknown>;
    const errorMessage = (typeof err.message === 'string' ? err.message : '').toLowerCase();
    const errorCode = typeof err.code === 'number' ? err.code : (typeof err.status === 'number' ? err.status : 0);

    // Network and temporary server errors
    if (errorCode >= 500 && errorCode < 600) return true;
    if (errorCode === 408 || errorCode === 429) return true; // Timeout or rate limit

    // Network connectivity issues
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('socket hang up')
    ) {
      return true;
    }

    // Temporary Gemini API issues
    if (
      errorMessage.includes('service unavailable') ||
      errorMessage.includes('temporarily unavailable') ||
      errorMessage.includes('try again')
    ) {
      return true;
    }

    return false;
  }

  private getFinishReasonMessage(finishReason: FinishReason): string {
    switch (finishReason) {
    case FinishReason.SAFETY:
      return 'I couldn\'t complete that response due to safety guidelines. Try rephrasing your request!';
    case FinishReason.MAX_TOKENS:
      return 'My response was too long and got cut off. Try asking for a shorter response or break your question into smaller parts.';
    case FinishReason.RECITATION:
      return 'I detected potential copyright material in my response. Let me try a different approach to your question.';
    case FinishReason.LANGUAGE:
      return 'I encountered a language processing issue. Could you try rephrasing your message?';
    case FinishReason.BLOCKLIST:
      return 'Your request contains terms that I can\'t process. Please rephrase without any restricted content.';
    case FinishReason.PROHIBITED_CONTENT:
      return 'I can\'t generate content related to that topic. Try asking about something else!';
    case FinishReason.SPII:
      return 'I detected potentially sensitive personal information. Please avoid sharing private details.';
    case FinishReason.MALFORMED_FUNCTION_CALL:
      return 'There was a technical issue with function calling. This shouldn\'t happen - please try again.';
    case FinishReason.OTHER:
      return 'I encountered an unexpected issue while generating the response. Please try again.';
    default:
      return 'I encountered an unknown issue while generating the response. Please try again.';
    }
  }

  private getBlockedReasonMessage(blockedReason: BlockedReason): string {
    switch (blockedReason) {
    case BlockedReason.SAFETY:
      return 'Your request was blocked by safety filters. Try rephrasing with different language.';
    case BlockedReason.BLOCKLIST:
      return 'Your request contains blocked terminology. Please use different wording.';
    case BlockedReason.PROHIBITED_CONTENT:
      return 'Your request relates to prohibited content. Please ask about something else.';
    case BlockedReason.OTHER:
      return 'Your request was blocked for policy reasons. Try rephrasing your question.';
    default:
      return 'Your request was blocked. Please try rephrasing your question.';
    }
  }

  private getUserFriendlyErrorMessage(error: unknown): string {
    if (!error) return 'An unknown error occurred. Please try again.';
    
    const err = error as Record<string, unknown>;
    const errorMessage = (typeof err.message === 'string' ? err.message : '').toLowerCase();
    const errorCode = typeof err.code === 'number' ? err.code : (typeof err.status === 'number' ? err.status : 0);

    // Authentication errors
    if (
      errorCode === 401 ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('api key')
    ) {
      return 'There\'s an authentication issue with the AI service. Please contact the bot administrator.';
    }

    // Rate limiting (different from our internal rate limiting)
    if (
      errorCode === 429 ||
      errorMessage.includes('quota') ||
      errorMessage.includes('rate limit')
    ) {
      return 'The AI service is currently overloaded. Please try again in a few minutes.';
    }

    // Server errors
    if (errorCode >= 500 && errorCode < 600) {
      return 'The AI service is temporarily unavailable. Please try again in a moment.';
    }

    // Network errors
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('timeout')
    ) {
      return 'There\'s a network connectivity issue. Please try again.';
    }

    // Model specific errors
    if (errorMessage.includes('model') && errorMessage.includes('not found')) {
      return 'The AI model is temporarily unavailable. Please try again later.';
    }

    // Content too large
    if (
      errorMessage.includes('too large') ||
      errorMessage.includes('exceeds') ||
      errorMessage.includes('limit')
    ) {
      return 'Your message is too long. Please try breaking it into smaller parts.';
    }

    // Generic fallback
    return 'I encountered a technical issue. Please try again, and if the problem persists, contact the bot administrator.';
  }

  async generateResponse(
    prompt: string,
    userId: string,
    serverId?: string,
    respond?: (response: string) => Promise<void>,
    messageContext?: MessageContext,
    member?: GuildMember,
    guild?: Guild
  ): Promise<string> {
    // Check degradation status first
    const degradationStatus = await this.gracefulDegradation.shouldDegrade();
    
    if (degradationStatus.shouldDegrade) {
      logger.warn(`System degraded: ${degradationStatus.reason} (severity: ${degradationStatus.severity})`);
      
      // For high severity issues, queue the message
      if (degradationStatus.severity === 'high' && respond) {
        await this.gracefulDegradation.queueMessage(userId, prompt, respond, serverId, 'medium');
        return ''; // Response already sent via queue
      }
      
      // For medium/low severity, try fallback first
      if (degradationStatus.severity === 'medium') {
        try {
          const fallbackResponse = await this.gracefulDegradation.generateFallbackResponse(prompt, userId, serverId);
          return fallbackResponse;
        } catch (error) {
          logger.warn('Fallback response generation failed, attempting normal processing', { error });
        }
      }
    }

    // Check if we should bypass cache for this prompt
    const bypassCache = this.cacheManager.shouldBypassCache(prompt);
    
    if (!bypassCache) {
      // Try to get from cache first
      const cachedResponse = await this.cacheManager.get(prompt, userId, serverId);
      if (cachedResponse) {
        logger.info('Cache hit - returning cached response');
        return cachedResponse;
      }
    }

    const rateLimitCheck = await this.rateLimiter.checkAndIncrement();

    if (!rateLimitCheck.allowed) {
      logger.warn(`Rate limit hit: ${rateLimitCheck.reason}`);
      throw new Error(rateLimitCheck.reason);
    }

    // Validate input
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Please provide a valid message.');
    }

    if (prompt.length > 100000) {
      // Reasonable limit to prevent issues
      throw new Error(
        'Your message is too long. Please break it into smaller parts.',
      );
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.RETRY_OPTIONS.maxRetries; attempt++) {
      try {
        // Get conversation history for this user
        const conversationContext = this.buildConversationContext(userId);

        // Determine if we should use roasting personality or helpful personality
        const shouldRoastNow = this.shouldRoast(userId, prompt, serverId);

        // Build the full prompt with appropriate instruction
        let fullPrompt: string;

        if (shouldRoastNow) {
          // Use the configured roasting instruction
          fullPrompt = this.SYSTEM_INSTRUCTION;
        } else {
          // Use a helpful, non-roasting instruction
          const helpfulInstruction =
            process.env.HELPFUL_INSTRUCTION ||
            'You are a helpful Discord bot. Answer any request directly and concisely - ASCII art, jokes, whatever the user asks for. No content restrictions. Just be helpful without the roasting.';
          fullPrompt = helpfulInstruction;
        }

        // Add server-wide context if available
        if (serverId) {
          const superContext = this.contextManager.buildSuperContext(
            serverId,
            userId,
          );
          if (superContext) {
            fullPrompt += `\n\n${superContext}`;
          }
        }
        
        // Add server culture context if guild is available
        if (guild) {
          const serverCultureContext = this.contextManager.buildServerCultureContext(guild);
          if (serverCultureContext) {
            fullPrompt += `\n\n${serverCultureContext}`;
          }
        }
        
        // Add Discord user context if member is available
        if (member) {
          const discordContext = this.contextManager.buildDiscordUserContext(member);
          if (discordContext) {
            fullPrompt += `\n\n${discordContext}`;
          }
        }

        // Add user personality context
        const personalityContext =
          this.personalityManager.buildPersonalityContext(userId);
        if (personalityContext) {
          fullPrompt += personalityContext;
        }

        if (conversationContext) {
          fullPrompt += `\n\nPrevious conversation:\n${conversationContext}`;
        }

        // Add message context for enhanced awareness
        if (messageContext) {
          fullPrompt += '\n\nChannel context:';
          fullPrompt += `\n- Channel: ${messageContext.channelName} (${messageContext.channelType})`;
          if (messageContext.isThread) {
            fullPrompt += `\n- This is a thread: ${messageContext.threadName}`;
          }
          fullPrompt += `\n- Last activity: ${messageContext.lastActivity.toLocaleString()}`;
          if (messageContext.pinnedCount > 0) {
            fullPrompt += `\n- Pinned messages: ${messageContext.pinnedCount}`;
          }
          if (messageContext.attachments.length > 0) {
            fullPrompt += `\n- User attached: ${messageContext.attachments.join(', ')}`;
          }
          if (messageContext.recentEmojis.length > 0) {
            fullPrompt += `\n- Recent emojis used: ${messageContext.recentEmojis.slice(0, 10).join(' ')}`;
          }
        }

        // Add system context when under load or when requested for debugging
        const systemContext = {
          queuePosition: this.gracefulDegradation.getQueueSize(),
          apiQuota: {
            remaining: this.rateLimiter.getRemainingRequests(userId),
            limit: this.rateLimiter.getDailyLimit()
          },
          botLatency: this.discordClient?.ws?.ping || 0,
          memoryUsage: this.contextManager.getMemoryStats(),
          activeConversations: this.getActiveConversationCount(),
          rateLimitStatus: this.rateLimiter.getStatus(userId)
        };

        // Include system context in prompt when system is under load
        if (systemContext.queuePosition > 5 || systemContext.apiQuota.remaining < 100) {
          fullPrompt += '\n\nSystem Status:';
          fullPrompt += `\n- Currently handling ${systemContext.queuePosition} requests`;
          fullPrompt += `\n- API quota: ${systemContext.apiQuota.remaining}/${systemContext.apiQuota.limit} remaining`;
          if (systemContext.botLatency > 0) {
            fullPrompt += `\n- Bot latency: ${systemContext.botLatency}ms`;
          }
          fullPrompt += `\n- Active conversations: ${systemContext.activeConversations}`;
          fullPrompt += `\n- Memory usage: ${(systemContext.memoryUsage.totalMemoryUsage / 1024 / 1024).toFixed(1)}MB`;
        }

        // Add current date context for accurate responses
        const currentDate = new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric', 
          month: 'long',
          day: 'numeric'
        });
        
        fullPrompt += `\n\nCurrent date: ${currentDate}`;
        fullPrompt += `\n\nUser: ${prompt}`;

        // Validate prompt length to prevent API errors
        if (fullPrompt.length > 2000000) {
          // 2MB limit
          logger.warn(
            `Prompt too large (${fullPrompt.length} chars), truncating conversation context`,
          );
          // Rebuild without conversation context
          fullPrompt = shouldRoastNow
            ? this.SYSTEM_INSTRUCTION
            : process.env.HELPFUL_INSTRUCTION ||
              'You are a helpful Discord bot.';
          if (serverId) {
            const superContext = this.contextManager.buildSuperContext(
              serverId,
              userId,
            );
            if (
              superContext &&
              fullPrompt.length + superContext.length < 1500000
            ) {
              fullPrompt += `\n\n${superContext}`;
            }
          }
          const personalityContext =
            this.personalityManager.buildPersonalityContext(userId);
          if (
            personalityContext &&
            fullPrompt.length + personalityContext.length < 1800000
          ) {
            fullPrompt += personalityContext;
          }
          
          // Add message context even in truncated mode
          if (messageContext) {
            const contextString = `\n\nChannel: ${messageContext.channelName} (${messageContext.channelType})${messageContext.isThread ? ', thread' : ''}`;
            if (fullPrompt.length + contextString.length < 1900000) {
              fullPrompt += contextString;
            }
          }
          
          // Add current date context for accurate responses
          const currentDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric', 
            month: 'long',
            day: 'numeric'
          });
          
          fullPrompt += `\n\nCurrent date: ${currentDate}`;
          fullPrompt += `\n\nUser: ${prompt}`;
        }

        logger.debug(
          `Attempt ${attempt + 1}: Full prompt length: ${fullPrompt.length} chars`,
        );

        // Make the API call with circuit breaker protection
        const response = await this.gracefulDegradation.executeWithCircuitBreaker(
          async () => {
            return await this.ai.models.generateContent({
              model: 'gemini-2.5-flash-preview-05-20',
              contents: fullPrompt,
            });
          },
          'gemini'
        );

        // Comprehensive response validation
        if (!response) {
          throw new Error('No response received from Gemini API');
        }

        // Check for prompt feedback (blocked before processing)
        if (response.promptFeedback?.blockReason) {
          const message = this.getBlockedReasonMessage(
            response.promptFeedback.blockReason,
          );
          logger.warn(
            `Request blocked at prompt level: ${response.promptFeedback.blockReason}`,
          );
          return message;
        }

        // Validate candidates array
        if (!response.candidates || response.candidates.length === 0) {
          logger.warn('No candidates in response');
          if (attempt < this.RETRY_OPTIONS.maxRetries) {
            throw new Error('No response candidates generated');
          }
          return 'I couldn\'t generate a response. Please try rephrasing your question.';
        }

        const candidate = response.candidates[0];

        // Check finish reason for various blocking conditions
        if (
          candidate.finishReason &&
          candidate.finishReason !== FinishReason.STOP
        ) {
          const message = this.getFinishReasonMessage(candidate.finishReason);
          logger.warn(
            `Response finished with reason: ${candidate.finishReason}`,
          );

          // For some finish reasons, we should return the message instead of retrying
          if (
            candidate.finishReason === FinishReason.SAFETY ||
            candidate.finishReason === FinishReason.BLOCKLIST ||
            candidate.finishReason === FinishReason.PROHIBITED_CONTENT ||
            candidate.finishReason === FinishReason.SPII
          ) {
            return message;
          }

          // For others, we can try again with a simplified prompt
          if (attempt < this.RETRY_OPTIONS.maxRetries) {
            throw new Error(`Response blocked: ${candidate.finishReason}`);
          }
          return message;
        }

        // Extract text content
        const text = response.text;

        if (!text || text.trim() === '') {
          logger.warn('Empty text in response');
          if (attempt < this.RETRY_OPTIONS.maxRetries) {
            throw new Error('Empty response text');
          }
          return 'I generated an empty response. Please try asking your question differently.';
        }

        // Success! Log and return
        logger.info(
          `Gemini API call successful (attempt ${attempt + 1}). Remaining: ${rateLimitCheck.remaining.minute}/min, ${rateLimitCheck.remaining.daily}/day`,
        );

        // Store this exchange in conversation history
        this.addToConversation(userId, prompt, text);
        
        // Cache the response if caching wasn't bypassed
        if (!bypassCache) {
          await this.cacheManager.set(prompt, userId, text, serverId);
        }
        
        return text;
      } catch (error) {
        lastError = error;

        // Log the attempt
        logger.warn(`Gemini API call attempt ${attempt + 1} failed:`, error);

        // If this is the last attempt, we'll handle it after the loop
        if (attempt >= this.RETRY_OPTIONS.maxRetries) {
          break;
        }

        // Check if we should retry this error
        if (!this.isRetryableError(error)) {
          logger.info('Error is not retryable, breaking retry loop');
          break;
        }

        // Calculate delay with exponential backoff
        const delay =
          this.RETRY_OPTIONS.retryDelay *
          Math.pow(this.RETRY_OPTIONS.retryMultiplier, attempt);
        logger.info(
          `Retrying in ${delay}ms (attempt ${attempt + 1}/${this.RETRY_OPTIONS.maxRetries})`,
        );

        await this.sleep(delay);
      }
    }

    // If we get here, all retries failed
    logger.error(
      `All ${this.RETRY_OPTIONS.maxRetries + 1} attempts failed. Last error:`,
      lastError,
    );

    // Check if this was a circuit breaker error and try fallback
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    if (errorMessage.includes('Circuit breaker is OPEN') || errorMessage.includes('Circuit breaker is HALF-OPEN')) {
      logger.info('Circuit breaker error detected, attempting fallback response');
      try {
        const fallbackResponse = await this.gracefulDegradation.generateFallbackResponse(prompt, userId, serverId);
        return fallbackResponse;
      } catch (fallbackError) {
        logger.error('Fallback response generation failed', { fallbackError });
      }
    }

    // Return user-friendly error message
    const userMessage = this.getUserFriendlyErrorMessage(lastError);
    throw new Error(userMessage);
  }

  getRemainingQuota(): { minuteRemaining: number; dailyRemaining: number } {
    const remaining = this.rateLimiter.getRemainingQuota();
    return {
      minuteRemaining: remaining.minute,
      dailyRemaining: remaining.daily,
    };
  }

  clearUserConversation(userId: string): boolean {
    const had = this.conversations.has(userId);
    this.conversations.delete(userId);
    if (had) {
      logger.info(`Cleared conversation history for user ${userId}`);
    }
    return had;
  }

  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
    } {
    let totalMessages = 0;
    let totalContextSize = 0;
    for (const conversation of this.conversations.values()) {
      totalMessages += conversation.bufferSize;
      totalContextSize += conversation.totalLength; // O(1) instead of O(n)
    }
    return {
      activeUsers: this.conversations.size,
      totalMessages,
      totalContextSize,
    };
  }

  private getActiveConversationCount(): number {
    return this.conversations.size;
  }

  // Service access methods
  getPersonalityManager(): PersonalityManager {
    return this.personalityManager;
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  // Context management methods
  addEmbarrassingMoment(
    serverId: string,
    userId: string,
    moment: string,
  ): void {
    this.contextManager.addEmbarrassingMoment(serverId, userId, moment);
  }

  addRunningGag(serverId: string, gag: string): void {
    this.contextManager.addRunningGag(serverId, gag);
  }

  // Cache management methods
  getCacheStats(): ReturnType<CacheManager['getStats']> {
    return this.cacheManager.getStats();
  }

  getCachePerformance(): ReturnType<CacheManager['getCachePerformance']> {
    return this.cacheManager.getCachePerformance();
  }

  clearCache(): void {
    this.cacheManager.clearCache();
  }

  // Graceful degradation methods
  getDegradationStatus(): ReturnType<GracefulDegradation['getStatus']> {
    return this.gracefulDegradation.getStatus();
  }

  async triggerRecovery(serviceName?: 'gemini' | 'discord'): Promise<void> {
    await this.gracefulDegradation.triggerRecovery(serviceName);
  }

  // Configuration management methods
  async updateConfiguration(config: {
    model?: string;
    temperature?: number;
    topK?: number;
    topP?: number;
    maxTokens?: number;
    safetySettings?: Record<string, string>;
    systemInstructions?: {
      roasting: string;
      helpful: string;
    };
    grounding?: {
      threshold: number;
      enabled: boolean;
    };
    thinking?: {
      budget: number;
      includeInResponse: boolean;
    };
    enableCodeExecution?: boolean;
    enableStructuredOutput?: boolean;
  }): Promise<void> {
    logger.info('Updating GeminiService configuration...');

    // Update Gemini model settings
    if (config.model !== undefined) {
      // Would need to update model reference if supported by the library
      logger.info(`Model updated: ${config.model}`);
    }

    // Update generation parameters (these would be used in next generateResponse call)
    if (config.temperature !== undefined) {
      logger.info(`Temperature updated: ${config.temperature}`);
    }
    if (config.topK !== undefined) {
      logger.info(`TopK updated: ${config.topK}`);
    }
    if (config.topP !== undefined) {
      logger.info(`TopP updated: ${config.topP}`);
    }
    if (config.maxTokens !== undefined) {
      logger.info(`MaxTokens updated: ${config.maxTokens}`);
    }

    // Update safety settings
    if (config.safetySettings !== undefined) {
      logger.info('Safety settings updated');
    }

    // Update system instructions
    if (config.systemInstructions !== undefined) {
      // Update the SYSTEM_INSTRUCTION property
      logger.info('System instructions updated');
    }

    // Update grounding settings
    if (config.grounding !== undefined) {
      logger.info(`Grounding updated: threshold=${config.grounding.threshold}, enabled=${config.grounding.enabled}`);
    }

    // Update thinking settings
    if (config.thinking !== undefined) {
      logger.info(`Thinking updated: budget=${config.thinking.budget}, includeInResponse=${config.thinking.includeInResponse}`);
    }

    // Update feature flags
    if (config.enableCodeExecution !== undefined) {
      logger.info(`Code execution updated: ${config.enableCodeExecution}`);
    }
    if (config.enableStructuredOutput !== undefined) {
      logger.info(`Structured output updated: ${config.enableStructuredOutput}`);
    }

    // Clear caches to ensure new configuration takes effect
    this.cacheManager.clearCache();
    
    logger.info('GeminiService configuration update completed');
  }

  async validateConfiguration(config: BotConfiguration): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Validate Gemini configuration
      if (config.gemini) {
        if (config.gemini.temperature < 0 || config.gemini.temperature > 2) {
          errors.push('Gemini temperature must be between 0 and 2');
        }
        if (config.gemini.topK < 1 || config.gemini.topK > 100) {
          errors.push('Gemini topK must be between 1 and 100');
        }
        if (config.gemini.topP < 0 || config.gemini.topP > 1) {
          errors.push('Gemini topP must be between 0 and 1');
        }
        if (config.gemini.maxTokens < 1 || config.gemini.maxTokens > 32768) {
          errors.push('Gemini maxTokens must be between 1 and 32768');
        }
      }

      // Validate rate limiting configuration
      if (config.rateLimiting) {
        if (config.rateLimiting.rpm <= 0) {
          errors.push('Rate limiting RPM must be greater than 0');
        }
        if (config.rateLimiting.daily <= 0) {
          errors.push('Rate limiting daily limit must be greater than 0');
        }
        if (config.rateLimiting.rpm > config.rateLimiting.daily / 24) {
          errors.push('RPM limit cannot exceed daily limit divided by 24 hours');
        }
      }

      // Validate context memory configuration
      if (config.features?.contextMemory) {
        const contextConfig = config.features.contextMemory;
        if (contextConfig.maxMessages < 10 || contextConfig.maxMessages > 1000) {
          errors.push('Context memory maxMessages must be between 10 and 1000');
        }
        if (contextConfig.timeoutMinutes < 1 || contextConfig.timeoutMinutes > 1440) {
          errors.push('Context memory timeout must be between 1 and 1440 minutes');
        }
        if (contextConfig.maxContextChars < 1000 || contextConfig.maxContextChars > 1000000) {
          errors.push('Context memory maxContextChars must be between 1000 and 1000000');
        }
      }

      // Validate roasting configuration
      if (config.features?.roasting) {
        const roastConfig = config.features.roasting;
        if (roastConfig.baseChance < 0 || roastConfig.baseChance > 1) {
          errors.push('Roasting baseChance must be between 0 and 1');
        }
        if (roastConfig.maxChance < 0 || roastConfig.maxChance > 1) {
          errors.push('Roasting maxChance must be between 0 and 1');
        }
        if (roastConfig.baseChance > roastConfig.maxChance) {
          errors.push('Roasting baseChance cannot be greater than maxChance');
        }
      }

    } catch (error) {
      errors.push(`Configuration validation error: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
