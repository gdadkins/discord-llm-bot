import { logger } from '../utils/logger';
import { BaseService } from './base/BaseService';
import type { IRoastingEngine, MoodInfo, UserRoastStats, RoastingStats } from './interfaces';

export interface UserQuestionStats {
  count: number;
  lastRoasted: boolean;
}

interface RoastingState {
  baseChance: number;
  lastBaseChanceUpdate: number;
  botMood: 'sleepy' | 'caffeinated' | 'chaotic' | 'reverse_psychology' | 'bloodthirsty';
  moodStartTime: number;
  serverRoastHistory: Map<string, { recent: number; lastRoastTime: number }>;
  chaosMode: { active: boolean; endTime: number; multiplier: number };
  roastDebt: Map<string, number>;
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

interface RoastConfig {
  maxChance: number;
  cooldownAfterRoast: boolean;
}

export class RoastingEngine extends BaseService implements IRoastingEngine {
  private userQuestionCounts: Map<string, UserQuestionStats> = new Map();
  private roastingState: RoastingState = {
    baseChance: 0.5,
    lastBaseChanceUpdate: 0,
    botMood: 'caffeinated',
    moodStartTime: Date.now(),
    serverRoastHistory: new Map(),
    chaosMode: { active: false, endTime: 0, multiplier: 1 },
    roastDebt: new Map(),
  };
  
  // Track active timers for proper cleanup
  private activeTimers: Set<NodeJS.Timeout> = new Set();

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

  constructor() {
    super();
  }

  protected getServiceName(): string {
    return 'RoastingEngine';
  }

  protected async performInitialization(): Promise<void> {
    // RoastingEngine doesn't require special initialization
    // All state is initialized in field declarations
  }

  protected async performShutdown(): Promise<void> {
    // Clear all active timers
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
    
    // Clear calculation caches on shutdown
    this.calculationCache.complexity.clear();
    this.calculationCache.serverInfluence.clear();
    this.calculationCache.consecutiveBonus.clear();
    this.moodCache = null;
  }

  protected getHealthMetrics(): Record<string, unknown> {
    return {
      activeUsers: this.userQuestionCounts.size,
      botMood: this.roastingState.botMood,
      chaosMode: this.roastingState.chaosMode.active,
      baseChance: this.roastingState.baseChance,
      activeTimers: this.activeTimers.size,
      cacheSize: {
        complexity: this.calculationCache.complexity.size,
        serverInfluence: this.calculationCache.serverInfluence.size,
        consecutiveBonus: this.calculationCache.consecutiveBonus.size
      }
    };
  }

  shouldRoast(userId: string, message: string = '', serverId?: string): boolean {
    this.updateDynamicRoastingState();
    
    const roastConfig: RoastConfig = {
      maxChance: parseFloat(process.env.ROAST_MAX_CHANCE || '0.9'),
      cooldownAfterRoast: process.env.ROAST_COOLDOWN === 'true',
    };
    
    const userStats = this.getOrCreateUserStats(userId);
    const decisionEngine = new RoastingDecisionEngine(this.roastingState, roastConfig);
    
    return decisionEngine.makeDecision({
      userId,
      message,
      serverId,
      userStats,
      calculators: {
        consecutive: () => this.getConsecutiveBonus(userStats.count),
        complexity: () => this.calculateComplexityModifier(message),
        time: () => this.getTimeBasedModifier(),
        mood: () => this.getMoodModifier(userStats.count),
        debt: () => this.updateRoastDebt(userId, serverId),
        server: () => this.getServerInfluenceModifier(serverId)
      },
      updateTracking: (shouldRoastResult: boolean) => {
        if (shouldRoastResult) {
          userStats.count = 0;
          userStats.lastRoasted = true;
          this.updateServerHistory(serverId, true);
          this.roastingState.roastDebt.set(userId, 0);
        } else {
          userStats.count++;
          userStats.lastRoasted = false;
        }
      }
    });
  }

  private getOrCreateUserStats(userId: string) {
    let userStats = this.userQuestionCounts.get(userId);
    if (!userStats) {
      userStats = { count: 0, lastRoasted: false };
      this.userQuestionCounts.set(userId, userStats);
    }
    return userStats;
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
    if (RoastingEngine.COMPLEXITY_PATTERNS.code.test(message)) complexity += 0.2;
    if (RoastingEngine.COMPLEXITY_PATTERNS.programming.test(message)) complexity += 0.15;
    if (RoastingEngine.COMPLEXITY_PATTERNS.technical.test(message)) complexity += 0.1;

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

  private updateServerHistory(serverId: string | undefined, wasRoasted: boolean): void {
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
      const timer = setTimeout(
        () => {
          // Remove timer from tracking set when it executes
          this.activeTimers.delete(timer);
          
          if (serverHistory && serverHistory.recent > 0) {
            serverHistory.recent--;
          }
        },
        60 * 60 * 1000,
      ); // 1 hour decay
      
      // Track the timer for proper cleanup
      this.activeTimers.add(timer);
    }
  }

  // Get current roasting state for debugging/monitoring
  getRoastingState(): {
    baseChance: number;
    botMood: string;
    chaosMode: boolean;
    chaosMultiplier?: number;
    activeUsers: number;
    } {
    return {
      baseChance: this.roastingState.baseChance,
      botMood: this.roastingState.botMood,
      chaosMode: this.roastingState.chaosMode.active,
      chaosMultiplier: this.roastingState.chaosMode.active ? this.roastingState.chaosMode.multiplier : undefined,
      activeUsers: this.userQuestionCounts.size
    };
  }

  // Clear user stats (for admin commands)
  clearUserStats(userId: string): boolean {
    const hasStats = this.userQuestionCounts.has(userId);
    this.userQuestionCounts.delete(userId);
    this.roastingState.roastDebt.delete(userId);
    return hasStats;
  }

  // Get user roasting stats
  getUserStats(userId: string): UserQuestionStats | undefined {
    return this.userQuestionCounts.get(userId);
  }

  // Interface implementation methods
  isUserOnCooldown(userId: string): boolean {
    const userStats = this.userQuestionCounts.get(userId);
    return userStats?.lastRoasted ?? false;
  }

  getConsecutiveRoasts(userId: string): number {
    const userStats = this.userQuestionCounts.get(userId);
    return userStats?.count ?? 0;
  }

  addToRoastDebt(userId: string): void {
    const currentDebt = this.roastingState.roastDebt.get(userId) || 0;
    this.roastingState.roastDebt.set(userId, currentDebt + 0.1);
  }

  checkForMercyKill(userId: string): boolean {
    const userStats = this.userQuestionCounts.get(userId);
    if (!userStats) return false;
    return userStats.count >= 6 && Math.random() < 0.2;
  }

  checkForCooldownBreaking(userId: string, _message: string): boolean {
    const userStats = this.userQuestionCounts.get(userId);
    if (!userStats?.lastRoasted) return false;
    return Math.random() < 0.15; // 15% chance to break cooldown
  }

  isInMood(): boolean {
    return this.roastingState.botMood !== 'sleepy';
  }

  triggerMood(reason: string): void {
    const moods: Array<typeof this.roastingState.botMood> = [
      'caffeinated', 'chaotic', 'reverse_psychology', 'bloodthirsty'
    ];
    this.roastingState.botMood = moods[Math.floor(Math.random() * moods.length)];
    this.roastingState.moodStartTime = Date.now();
    this.moodCache = null;
    logger.info(`Mood triggered: ${this.roastingState.botMood} (${reason})`);
  }

  checkForChaosEvent(): void {
    if (!this.roastingState.chaosMode.active && Math.random() < 0.05) {
      const now = Date.now();
      this.roastingState.chaosMode = {
        active: true,
        endTime: now + (5 + Math.random() * 25) * 60 * 1000,
        multiplier: 0.5 + Math.random() * 2
      };
      logger.info(`Chaos event triggered! Duration: ${((this.roastingState.chaosMode.endTime - now) / 60000).toFixed(0)}min, Multiplier: ${this.roastingState.chaosMode.multiplier.toFixed(1)}x`);
    }
  }

  getCurrentMoodInfo(): MoodInfo | null {
    if (!this.roastingState.chaosMode.active) return null;
    return {
      active: this.roastingState.chaosMode.active,
      reason: 'chaos_mode',
      multiplier: this.roastingState.chaosMode.multiplier,
      endTime: this.roastingState.chaosMode.endTime
    };
  }

  getUserRoastStats(userId: string): UserRoastStats {
    const userStats = this.userQuestionCounts.get(userId);
    const debt = this.roastingState.roastDebt.get(userId) || 0;
    
    return {
      consecutiveRoasts: userStats?.count || 0,
      lastRoasted: userStats?.lastRoasted ? Date.now() : null,
      totalRoasts: 0, // TODO: Track total roasts in future enhancement
      roastDebt: debt,
      mercyKills: 0 // TODO: Track mercy kills in future enhancement
    };
  }

  getRoastingStats(): RoastingStats {
    return {
      totalRoasts: 0, // TODO: Track total roasts in future enhancement
      totalUsers: this.userQuestionCounts.size,
      moodTriggered: 0, // TODO: Track mood triggers in future enhancement
      chaosEvents: 0, // TODO: Track chaos events in future enhancement
      mercyKills: 0, // TODO: Track mercy kills in future enhancement
      cooldownBreaks: 0 // TODO: Track cooldown breaks in future enhancement
    };
  }
}

/**
 * Calculator function collection
 */
interface CalculatorCollection {
  consecutive: () => number;
  complexity: () => number;
  time: () => number;
  mood: () => number;
  debt: () => number;
  server: () => number;
}

/**
 * Interface for roasting strategy implementations
 */
interface RoastingStrategy {
  calculateRoastChance(context: RoastingContext): number;
  shouldOverride(context: RoastingContext): OverrideResult | null;
}

/**
 * Context object containing all decision-making data
 */
interface RoastingContext {
  userId: string;
  message: string;
  serverId?: string;
  userStats: UserQuestionStats;
  baseChance: number;
  roastingState: RoastingState;
  calculators: {
    consecutive: () => number;
    complexity: () => number;
    time: () => number;
    mood: () => number;
    debt: () => number;
    server: () => number;
  };
}

/**
 * Result of strategy override check
 */
interface OverrideResult {
  shouldRoast: boolean;
  reason: string;
}

/**
 * Decision input parameters
 */
interface DecisionInput {
  userId: string;
  message: string;
  serverId?: string;
  userStats: UserQuestionStats;
  calculators: CalculatorCollection;
  updateTracking: (shouldRoast: boolean) => void;
}

/**
 * Main decision engine that orchestrates roasting strategies
 */
class RoastingDecisionEngine {
  private strategies: Map<string, RoastingStrategy>;

  constructor(private roastingState: RoastingState, private config: RoastConfig) {
    this.strategies = new Map([
      ['sleepy', new SleepyStrategy()],
      ['caffeinated', new CaffeinatedStrategy()],
      ['chaotic', new ChaoticStrategy()],
      ['reverse_psychology', new ReversePhychologyStrategy()],
      ['bloodthirsty', new BloodthirstyStrategy()],
      ['default', new DefaultStrategy()]
    ]);
  }

  makeDecision(input: DecisionInput): boolean {
    const context: RoastingContext = {
      userId: input.userId,
      message: input.message,
      serverId: input.serverId,
      userStats: input.userStats,
      baseChance: this.roastingState.baseChance,
      roastingState: this.roastingState,
      calculators: input.calculators
    };

    // Check for chaos mode override first
    if (this.roastingState.chaosMode.active) {
      const chaosOverride = this.checkChaosOverride(context);
      if (chaosOverride) {
        input.updateTracking(chaosOverride.shouldRoast);
        logger.info(`Chaos mode override: ${chaosOverride.reason}`);
        return chaosOverride.shouldRoast;
      }
    }

    // Check cooldown logic
    if (this.config.cooldownAfterRoast && context.userStats.lastRoasted) {
      const ignoreCooldown = Math.random() < 0.15;
      if (!ignoreCooldown) {
        context.userStats.lastRoasted = false;
        context.userStats.count = 0;
        logger.info(`Cooldown respected for user ${context.userId}`);
        return false;
      } else {
        logger.info(`Cooldown IGNORED for user ${context.userId} (psychological warfare)`);
      }
    }

    // Check for mercy kill
    if (context.userStats.count >= 6 && Math.random() < 0.2) {
      input.updateTracking(true);
      logger.info(`Mercy kill activated for user ${context.userId} after ${context.userStats.count} questions`);
      return true;
    }

    // Get current strategy
    const strategy = this.strategies.get(this.roastingState.botMood) || this.strategies.get('default')!;

    // Check for strategy-specific overrides
    const override = strategy.shouldOverride(context);
    if (override) {
      input.updateTracking(override.shouldRoast);
      logger.info(`Strategy override: ${override.reason}`);
      return override.shouldRoast;
    }

    // Calculate roast chance using strategy
    let roastChance = strategy.calculateRoastChance(context);

    // Apply chaos multiplier if active
    if (this.roastingState.chaosMode.active) {
      roastChance *= this.roastingState.chaosMode.multiplier;
    }

    // Ensure we don't go below 0 or above max
    roastChance = Math.max(0, Math.min(roastChance, this.config.maxChance));

    // Make the final decision
    const shouldRoast = Math.random() < roastChance;

    // Log decision process
    this.logDecision(context, roastChance, shouldRoast);

    // Update tracking
    input.updateTracking(shouldRoast);

    return shouldRoast;
  }

  private checkChaosOverride(_context: RoastingContext): OverrideResult | null {
    const chaosRoll = Math.random();
    
    if (chaosRoll < 0.3) {
      const chaosDecision = Math.random() < 0.7;
      return {
        shouldRoast: chaosDecision,
        reason: `${chaosDecision ? 'ROASTING' : 'MERCY'} (${(chaosRoll * 100).toFixed(0)}% chaos roll)`
      };
    }
    
    return null;
  }

  private logDecision(context: RoastingContext, roastChance: number, shouldRoast: boolean): void {
    const consecutiveBonus = context.calculators.consecutive();
    const complexityBonus = context.calculators.complexity();
    const timeBonus = context.calculators.time();
    const moodBonus = context.calculators.mood();
    const debtBonus = context.calculators.debt();
    const serverBonus = context.calculators.server();

    logger.info(
      `Roast decision for user ${context.userId}: ${shouldRoast ? 'ROAST' : 'PASS'} | ` +
      `Final chance: ${(roastChance * 100).toFixed(1)}% | ` +
      `Base: ${(context.baseChance * 100).toFixed(1)}% | ` +
      `Consecutive: +${(consecutiveBonus * 100).toFixed(1)}% | ` +
      `Complexity: +${(complexityBonus * 100).toFixed(1)}% | ` +
      `Time: ${timeBonus >= 0 ? '+' : ''}${(timeBonus * 100).toFixed(1)}% | ` +
      `Mood (${context.roastingState.botMood}): ${moodBonus >= 0 ? '+' : ''}${(moodBonus * 100).toFixed(1)}% | ` +
      `Debt: +${(debtBonus * 100).toFixed(1)}% | ` +
      `Server: +${(serverBonus * 100).toFixed(1)}% | ` +
      `Questions: ${context.userStats.count} | ` +
      `Chaos: ${context.roastingState.chaosMode.active ? `${context.roastingState.chaosMode.multiplier.toFixed(1)}x` : 'OFF'}`
    );
  }
}

/**
 * Strategy implementations
 */
class SleepyStrategy implements RoastingStrategy {
  calculateRoastChance(context: RoastingContext): number {
    let chance = context.baseChance;
    chance += context.calculators.consecutive();
    chance += context.calculators.complexity();
    chance += context.calculators.time();
    chance += context.calculators.mood();
    chance += context.calculators.debt();
    chance += context.calculators.server();
    return chance;
  }

  shouldOverride(_context: RoastingContext): OverrideResult | null {
    return null;
  }
}

class CaffeinatedStrategy implements RoastingStrategy {
  calculateRoastChance(context: RoastingContext): number {
    let chance = context.baseChance;
    chance += context.calculators.consecutive();
    chance += context.calculators.complexity();
    chance += context.calculators.time();
    chance += context.calculators.mood();
    chance += context.calculators.debt();
    chance += context.calculators.server();
    return chance;
  }

  shouldOverride(_context: RoastingContext): OverrideResult | null {
    return null;
  }
}

class ChaoticStrategy implements RoastingStrategy {
  calculateRoastChance(context: RoastingContext): number {
    let chance = context.baseChance;
    chance += context.calculators.consecutive();
    chance += context.calculators.complexity();
    chance += context.calculators.time();
    chance += context.calculators.mood();
    chance += context.calculators.debt();
    chance += context.calculators.server();
    return chance;
  }

  shouldOverride(_context: RoastingContext): OverrideResult | null {
    return null;
  }
}

class ReversePhychologyStrategy implements RoastingStrategy {
  calculateRoastChance(context: RoastingContext): number {
    let chance = context.baseChance;
    chance += context.calculators.consecutive();
    chance += context.calculators.complexity();
    chance += context.calculators.time();
    chance += context.calculators.mood();
    chance += context.calculators.debt();
    chance += context.calculators.server();
    return chance;
  }

  shouldOverride(context: RoastingContext): OverrideResult | null {
    if (context.userStats.count > 5 && Math.random() < 0.4) {
      return {
        shouldRoast: false,
        reason: `Reverse psychology mercy for user ${context.userId} (expected roast but got mercy)`
      };
    }
    return null;
  }
}

class BloodthirstyStrategy implements RoastingStrategy {
  calculateRoastChance(context: RoastingContext): number {
    let chance = context.baseChance;
    chance += context.calculators.consecutive();
    chance += context.calculators.complexity();
    chance += context.calculators.time();
    chance += context.calculators.mood();
    chance += context.calculators.debt();
    chance += context.calculators.server();
    return chance;
  }

  shouldOverride(_context: RoastingContext): OverrideResult | null {
    return null;
  }
}

class DefaultStrategy implements RoastingStrategy {
  calculateRoastChance(context: RoastingContext): number {
    let chance = context.baseChance;
    chance += context.calculators.consecutive();
    chance += context.calculators.complexity();
    chance += context.calculators.time();
    chance += context.calculators.mood();
    chance += context.calculators.debt();
    chance += context.calculators.server();
    return chance;
  }

  shouldOverride(_context: RoastingContext): OverrideResult | null {
    return null;
  }
}