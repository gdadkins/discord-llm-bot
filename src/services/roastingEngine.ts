import { logger } from '../utils/logger';
import { BaseService } from './base/BaseService';
import type { IRoastingEngine, MoodInfo, UserRoastStats, RoastingStats } from './interfaces';
import { ROASTING_CONSTANTS, TIME_CONSTANTS, CACHE_CONSTANTS, GENERAL_CONSTANTS } from '../config/constants';

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
    baseChance: ROASTING_CONSTANTS.DEFAULT_BASE_CHANCE,
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

  /**
   * Primary decision algorithm for determining whether to roast a user.
   * 
   * This is the main entry point that orchestrates the entire roasting decision process.
   * It follows a multi-layered approach:
   * 1. Updates dynamic state (base chance, mood, chaos mode)
   * 2. Loads configuration parameters
   * 3. Delegates to RoastingDecisionEngine with calculator functions
   * 4. Updates tracking based on final decision
   * 
   * The decision engine evaluates:
   * - Cooldown logic and psychology warfare (breaking expected patterns)
   * - Mercy kill mechanisms (compassionate roasting after long streaks)
   * - Mood-based strategy selection (sleepy, caffeinated, chaotic, etc.)
   * - Multi-factor probability calculation with 6 primary modifiers
   * - Chaos mode overrides for unpredictable behavior
   * 
   * @param userId - Discord user ID for tracking consecutive questions
   * @param message - User's message content for complexity analysis
   * @param serverId - Discord server ID for server-specific influence tracking
   * @returns boolean - true if user should be roasted, false otherwise
   */
  shouldRoast(userId: string, message: string = '', serverId?: string): boolean {
    // Update all time-dependent state variables
    this.updateDynamicRoastingState();
    
    // Load runtime configuration from environment
    const roastConfig: RoastConfig = {
      maxChance: parseFloat(process.env.ROAST_MAX_CHANCE || String(ROASTING_CONSTANTS.DEFAULT_MAX_CHANCE)),
      cooldownAfterRoast: process.env.ROAST_COOLDOWN === 'true',
    };
    
    // Get or initialize user statistics
    const userStats = this.getOrCreateUserStats(userId);
    
    // Create decision engine with current state and configuration
    const decisionEngine = new RoastingDecisionEngine(this.roastingState, roastConfig);
    
    // Execute decision with calculator functions and update callback
    return decisionEngine.makeDecision({
      userId,
      message,
      serverId,
      userStats,
      // Calculator functions for probability modifiers (called lazily for performance)
      calculators: {
        consecutive: () => this.getConsecutiveBonus(userStats.count),
        complexity: () => this.calculateComplexityModifier(message),
        time: () => this.getTimeBasedModifier(),
        mood: () => this.getMoodModifier(userStats.count),
        debt: () => this.updateRoastDebt(userId, serverId),
        server: () => this.getServerInfluenceModifier(serverId)
      },
      // Update tracking function (called after final decision)
      updateTracking: (shouldRoastResult: boolean) => {
        if (shouldRoastResult) {
          // Reset user streak and mark as recently roasted
          userStats.count = 0;
          userStats.lastRoasted = true;
          this.updateServerHistory(serverId, true);
          this.roastingState.roastDebt.set(userId, 0);
        } else {
          // Increment consecutive question count
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
    const hourInMs = TIME_CONSTANTS.ONE_HOUR_MS;

    // Update base chance every hour with random variance
    if (now - this.roastingState.lastBaseChanceUpdate > hourInMs) {
      this.roastingState.baseChance = ROASTING_CONSTANTS.MIN_BASE_CHANCE + Math.random() * GENERAL_CONSTANTS.HALF_VALUE; // 20-70%
      this.roastingState.lastBaseChanceUpdate = now;
      logger.info(
        `Base roast chance updated to ${(this.roastingState.baseChance * 100).toFixed(1)}%`,
      );
    }

    // Update bot mood every 30 minutes to 2 hours (random)
    const moodDuration = (ROASTING_CONSTANTS.MIN_MOOD_DURATION_MINUTES + Math.random() * (ROASTING_CONSTANTS.MAX_MOOD_DURATION_MINUTES - ROASTING_CONSTANTS.MIN_MOOD_DURATION_MINUTES)) * TIME_CONSTANTS.ONE_MINUTE_MS;
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
    if (!this.roastingState.chaosMode.active && Math.random() < ROASTING_CONSTANTS.CHAOS_MODE_TRIGGER_CHANCE) {
      this.roastingState.chaosMode = {
        active: true,
        endTime: now + (ROASTING_CONSTANTS.MIN_CHAOS_DURATION_MINUTES + Math.random() * (ROASTING_CONSTANTS.MAX_CHAOS_DURATION_MINUTES - ROASTING_CONSTANTS.MIN_CHAOS_DURATION_MINUTES)) * TIME_CONSTANTS.ONE_MINUTE_MS, // 5-30 minutes
        multiplier: ROASTING_CONSTANTS.MIN_CHAOS_MULTIPLIER + Math.random() * (ROASTING_CONSTANTS.MAX_CHAOS_MULTIPLIER - ROASTING_CONSTANTS.MIN_CHAOS_MULTIPLIER), // 0.5x to 2.5x multiplier
      };
      logger.info(
        `Chaos mode activated for ${((this.roastingState.chaosMode.endTime - now) / 60000).toFixed(0)} minutes with ${this.roastingState.chaosMode.multiplier.toFixed(1)}x multiplier`,
      );
    }
  }

  /**
   * Calculates complexity-based roasting probability modifier based on message content.
   * 
   * This algorithm analyzes message characteristics to determine how "roast-worthy" the content is.
   * Higher complexity generally indicates more sophisticated questions that deserve more roasting.
   * 
   * Algorithm Components:
   * 1. Message Length Analysis: Longer messages get higher complexity scores
   *    - Formula: min(message.length / 100, 0.3) = up to 30% bonus for 300+ char messages
   * 
   * 2. Content Pattern Matching (uses pre-compiled regex for performance):
   *    - Code blocks (``` or `) = +20% bonus
   *    - Programming keywords (function, class, etc.) = +15% bonus  
   *    - Technical terms (API, database, etc.) = +10% bonus
   * 
   * 3. Question Complexity:
   *    - Single question mark = +5% bonus
   *    - Multiple questions = +10% additional bonus
   * 
   * 4. Performance Optimizations:
   *    - Simple hash-based caching (length + question + code indicators)
   *    - LRU cache eviction when limit exceeded
   *    - Pre-compiled regex patterns for fast matching
   * 
   * @param message - User's message content to analyze
   * @returns number - Probability modifier (0.0 to 0.5 representing 0% to 50% bonus)
   */
  private calculateComplexityModifier(message: string): number {
    // Generate a simple hash for cache key (avoid expensive string hashing)
    // Using basic indicators to create cache key: length + has questions + has code blocks
    const hash = `${message.length}-${message.includes('?')}-${message.includes('`')}`;
    
    // Check cache first for performance optimization (O(1) lookup)
    const cached = this.calculationCache.complexity.get(hash);
    if (cached && cached.hash === hash) {
      return cached.value;
    }
    
    let complexity = 0;

    // Length modifier: Longer messages indicate more complex questions
    // Formula: min(length / 100, 0.3) gives 30% bonus at 300+ characters
    // Rationale: Longer questions typically require more thought and deserve more roasting
    complexity += Math.min(message.length / ROASTING_CONSTANTS.MESSAGE_LENGTH_DIVISOR, ROASTING_CONSTANTS.MAX_LENGTH_MODIFIER);

    // Code presence analysis using pre-compiled patterns for performance
    // These patterns identify technical content that warrants increased roasting probability
    if (RoastingEngine.COMPLEXITY_PATTERNS.code.test(message)) complexity += ROASTING_CONSTANTS.CODE_PRESENCE_BONUS; // 20% bonus for code blocks
    if (RoastingEngine.COMPLEXITY_PATTERNS.programming.test(message)) complexity += ROASTING_CONSTANTS.PROGRAMMING_KEYWORD_BONUS; // 15% bonus for programming terms
    if (RoastingEngine.COMPLEXITY_PATTERNS.technical.test(message)) complexity += ROASTING_CONSTANTS.TECHNICAL_KEYWORD_BONUS; // 10% bonus for technical jargon

    // Question complexity indicators - questions deserve special attention
    if (message.includes('?')) complexity += ROASTING_CONSTANTS.QUESTION_MARK_BONUS; // 5% bonus for any question
    if (message.split('?').length > 2) complexity += ROASTING_CONSTANTS.MULTIPLE_QUESTIONS_BONUS; // Additional 10% for multiple questions

    // Cap the final result to prevent excessive bonuses (50% maximum)
    // This prevents edge cases from breaking the probability distribution
    const result = Math.min(complexity, ROASTING_CONSTANTS.MAX_COMPLEXITY_BONUS);
    
    // Cache management: LRU eviction to prevent memory bloat
    // When cache exceeds 100 entries, remove oldest to maintain memory efficiency
    if (this.calculationCache.complexity.size > ROASTING_CONSTANTS.MAX_COMPLEXITY_CACHE_SIZE) {
      // Remove oldest entry (simple LRU implementation using Map insertion order)
      const firstKey = this.calculationCache.complexity.keys().next().value;
      if (firstKey) {
        this.calculationCache.complexity.delete(firstKey);
      }
    }
    // Store result with hash verification to prevent cache corruption
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
      modifier = ROASTING_CONSTANTS.NIGHT_OWL_BONUS;
    }
    // Early birds get some mercy (5AM - 8AM)
    else if (hour >= 5 && hour <= 8) {
      modifier = ROASTING_CONSTANTS.EARLY_BIRD_PENALTY;
    }
    // Peak roasting hours (7PM - 11PM)
    else if (hour >= 19 && hour <= 23) {
      modifier = ROASTING_CONSTANTS.PEAK_HOURS_BONUS;
    }
    // Afternoon energy (1PM - 5PM)
    else if (hour >= 13 && hour <= 17) {
      modifier = ROASTING_CONSTANTS.AFTERNOON_BONUS;
    }
    else {
      modifier = 0; // Normal hours
    }
    
    // Cache the result
    this.calculationCache.timeModifier = { value: modifier, hour };
    
    return modifier;
  }

  /**
   * Calculates mood-based roasting probability modifier using psychological behavior patterns.
   * 
   * The bot's mood system implements different personality strategies that change over time:
   * 
   * MOOD ALGORITHMS:
   * 
   * 1. SLEEPY MODE: Gradual awakening pattern
   *    - Formula: -20% + (questionCount * 5%)
   *    - Starts reluctant but becomes more active with user persistence
   *    - Example: Q1: -15%, Q2: -10%, Q3: -5%, Q4: 0%, Q5: +5%
   * 
   * 2. CAFFEINATED MODE: High energy escalation
   *    - Formula: +10% + (questionCount * 10%)  
   *    - Eager to roast from start, becomes hyperactive
   *    - Example: Q1: +20%, Q2: +30%, Q3: +40%
   * 
   * 3. CHAOTIC MODE: Pure randomness (not cached)
   *    - Formula: random(-30%, +30%)
   *    - Completely unpredictable for psychological disruption
   *    - No pattern recognition possible for users
   * 
   * 4. REVERSE PSYCHOLOGY MODE: Subverts expectations
   *    - Formula: questionCount > 3 ? -40% : +20%
   *    - Shows mercy when users expect punishment
   *    - Strategy overrides in decision engine for additional surprise
   * 
   * 5. BLOODTHIRSTY MODE: Aggressive escalation
   *    - Formula: +20% + (questionCount * 15%)
   *    - Most aggressive escalation pattern
   *    - Example: Q1: +35%, Q2: +50%, Q3: +65%
   * 
   * Performance optimizations:
   * - Cache results by mood and question count
   * - Cache invalidation on mood changes
   * - Random values not cached to maintain unpredictability
   * 
   * @param questionCount - Number of consecutive questions from user
   * @returns number - Probability modifier (-0.4 to +0.8 representing -40% to +80%)
   */
  private getMoodModifier(questionCount: number): number {
    // Validate mood cache and check for cached result
    // Cache is valid if mood and timestamp match (prevents stale data after mood changes)
    if (this.moodCache && 
        this.moodCache.mood === this.roastingState.botMood &&
        this.moodCache.timestamp === this.roastingState.moodStartTime) {
      
      // Return cached value if available (O(1) lookup for performance)
      const cached = this.moodCache.modifiersByCount.get(questionCount);
      if (cached !== undefined) {
        return cached;
      }
    } else {
      // Initialize new cache on mood change to prevent stale calculations
      this.moodCache = {
        mood: this.roastingState.botMood,
        modifiersByCount: new Map(),
        timestamp: this.roastingState.moodStartTime
      };
    }
    
    let modifier: number;
    
    // Apply mood-specific behavioral algorithms for psychological warfare
    switch (this.roastingState.botMood) {
    case 'sleepy':
      // Gradual awakening: starts reluctant (-20%) but wakes up (+5% per question)
      // Simulates a sleepy bot that becomes more active with user persistence
      modifier = ROASTING_CONSTANTS.SLEEPY_BASE_MODIFIER + questionCount * ROASTING_CONSTANTS.SLEEPY_ESCALATION;
      break;
    case 'caffeinated':
      // High energy: eager start (+10%) with hyperactive escalation (+10% per question)
      // Represents an over-caffeinated bot eager to roast and getting more excited
      modifier = ROASTING_CONSTANTS.CAFFEINATED_BASE_MODIFIER + questionCount * ROASTING_CONSTANTS.CAFFEINATED_ESCALATION;
      break;
    case 'chaotic':
      // Pure randomness: -30% to +30% random modifier for psychological disruption
      // Completely unpredictable behavior to prevent users from gaming the system
      modifier = Math.random() * ROASTING_CONSTANTS.CHAOTIC_RANDOM_RANGE - ROASTING_CONSTANTS.CHAOTIC_RANDOM_OFFSET;
      // Don't cache random values to maintain unpredictability - return immediately
      return modifier;
    case 'reverse_psychology':
      // Subvert expectations: mercy when users expect punishment (after 3+ questions)
      // Shows compassion when users expect aggression, creating psychological surprise
      modifier = questionCount > ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_THRESHOLD ? ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_PENALTY : ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_BONUS;
      break;
    case 'bloodthirsty':
      // Aggressive escalation: high start (+20%) with maximum escalation (+15% per question)
      // Most aggressive mood with rapid escalation for maximum roasting intensity
      modifier = ROASTING_CONSTANTS.BLOODTHIRSTY_BASE_MODIFIER + questionCount * ROASTING_CONSTANTS.BLOODTHIRSTY_ESCALATION;
      break;
    default:
      // Fallback for any undefined moods (should never happen)
      modifier = 0;
    }
    
    // Cache the result with size limit for memory management
    // Limit cache to 20 entries to prevent memory bloat while maintaining performance
    if (this.moodCache.modifiersByCount.size < ROASTING_CONSTANTS.MAX_MOOD_CACHE_SIZE) {
      this.moodCache.modifiersByCount.set(questionCount, modifier);
    }
    
    return modifier;
  }

  private updateRoastDebt(userId: string, serverId?: string): number {
    if (!serverId) return 0;

    const debt = this.roastingState.roastDebt.get(userId) || 0;
    this.roastingState.roastDebt.set(userId, debt + ROASTING_CONSTANTS.DEBT_GROWTH_RATE); // Debt grows over time

    // Massive debt bonus for users who haven't been roasted in a while
    if (debt > ROASTING_CONSTANTS.SIGNIFICANT_DEBT_THRESHOLD) {
      logger.info(
        `User ${userId} has accumulated significant roast debt: ${debt.toFixed(2)}`,
      );
      return Math.min(debt * ROASTING_CONSTANTS.DEBT_BONUS_MULTIPLIER, ROASTING_CONSTANTS.MAX_DEBT_BONUS); // Up to 70% bonus from debt
    }

    return debt * ROASTING_CONSTANTS.SMALL_DEBT_MULTIPLIER; // Small debt bonus
  }

  private getServerInfluenceModifier(serverId?: string): number {
    if (!serverId) return 0;

    // Check cache (cache for 5 minutes)
    const cached = this.calculationCache.serverInfluence.get(serverId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_CONSTANTS.SERVER_INFLUENCE_CACHE_DURATION_MS) {
      return cached.value;
    }

    const serverHistory = this.roastingState.serverRoastHistory.get(serverId);
    if (!serverHistory) return 0;

    const timeSinceLastRoast = Date.now() - serverHistory.lastRoastTime;
    const hoursSinceRoast = timeSinceLastRoast / TIME_CONSTANTS.ONE_HOUR_MS;

    let modifier: number;
    
    // If server was recently active with roasts, increase chance
    if (hoursSinceRoast < ROASTING_CONSTANTS.HOT_SERVER_TIME_HOURS && serverHistory.recent > ROASTING_CONSTANTS.HOT_SERVER_RECENT_THRESHOLD) {
      modifier = ROASTING_CONSTANTS.HOT_SERVER_BONUS; // Hot server bonus
    }
    // If server hasn't seen roasts in a while, increase chance
    else if (hoursSinceRoast > ROASTING_CONSTANTS.COLD_SERVER_TIME_HOURS) {
      modifier = Math.min(hoursSinceRoast * ROASTING_CONSTANTS.COLD_SERVER_BONUS_PER_HOUR, ROASTING_CONSTANTS.MAX_COLD_SERVER_BONUS); // Up to 30% bonus
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
    if (this.calculationCache.serverInfluence.size > ROASTING_CONSTANTS.MAX_SERVER_CACHE_SIZE) {
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

  /**
   * Calculates consecutive question bonus with tiered escalation and random variance.
   * 
   * This is the most complex probability modifier, implementing a sophisticated
   * escalation system with multiple psychological pressure points:
   * 
   * TIERED ESCALATION ALGORITHM:
   * 
   * 1. EARLY PHASE (Questions 1-2): Gentle escalation
   *    - Base formula: questionCount * 10%
   *    - Q1: 10%, Q2: 20%
   *    - Small random variance (±2.5%) to prevent predictability
   * 
   * 2. MID PHASE (Questions 3-5): Moderate pressure
   *    - Base formula: questionCount * 25%  
   *    - Q3: 75%, Q4: 100%, Q5: 125%
   *    - Medium random variance (±10% per question) for unpredictability
   * 
   * 3. LATE PHASE (Questions 6+): High pressure
   *    - Base formula: questionCount * 35%
   *    - Q6: 210%, Q7: 245%, Q8: 280%
   *    - High random variance (±15% per question)
   *    - 10% chance of "bonus bomb": additional random 0-50% bonus
   * 
   * PERFORMANCE STRATEGY:
   * - Cache deterministic base values
   * - Add random variance on each call to prevent gaming
   * - Bonus bomb system creates unpredictable spikes
   * 
   * PSYCHOLOGICAL DESIGN:
   * - Exponential growth creates mounting pressure
   * - Random variance prevents pattern recognition
   * - Bonus bombs create memorable "punishment events"
   * 
   * @param questionCount - Number of consecutive questions from user
   * @returns number - Probability modifier (0.0 to ~3.5 representing 0% to 350%+ bonus)
   */
  private getConsecutiveBonus(questionCount: number): number {
    // Check cache for deterministic base values (O(1) lookup)
    const cached = this.calculationCache.consecutiveBonus.get(questionCount);
    if (cached !== undefined) {
      // Add small random variance to cached values to maintain unpredictability
      // This prevents users from learning exact patterns while keeping performance high
      return cached + (Math.random() * GENERAL_CONSTANTS.RANDOM_VARIANCE_RANGE - GENERAL_CONSTANTS.RANDOM_VARIANCE_RANGE / 2);
    }
    
    // No bonus for first interaction (prevents immediate roasting on user's first question)
    if (questionCount === 0) {
      this.calculationCache.consecutiveBonus.set(0, 0);
      return 0;
    }
    
    let baseValue: number;
    
    // TIERED ESCALATION SYSTEM - psychological pressure increases with persistence
    if (questionCount <= 2) {
      // Early questions: gentle 10% per question escalation
      // Allows users to ask initial questions without overwhelming roasting pressure
      baseValue = questionCount * ROASTING_CONSTANTS.EARLY_QUESTIONS_MULTIPLIER;
    } else if (questionCount <= 5) {
      // Mid streak: moderate 25% per question escalation
      // Applies noticeable pressure to encourage resolution of questions
      baseValue = questionCount * ROASTING_CONSTANTS.MID_STREAK_MULTIPLIER;
    } else {
      // Late streak: aggressive 35% per question escalation
      // Heavily penalizes excessive questioning to maintain engagement balance
      baseValue = questionCount * ROASTING_CONSTANTS.LATE_STREAK_MULTIPLIER;
    }
    
    // Cache base value with size limit for memory management (20 entry limit)
    if (this.calculationCache.consecutiveBonus.size < ROASTING_CONSTANTS.MAX_CONSECUTIVE_CACHE_SIZE) {
      this.calculationCache.consecutiveBonus.set(questionCount, baseValue);
    }
    
    // Add random variance based on phase (more variance in later phases for unpredictability)
    // Early phase: ±2.5%, Mid phase: ±10% per question, Late phase: ±15% per question
    const variance = questionCount <= ROASTING_CONSTANTS.EARLY_QUESTIONS_THRESHOLD ? GENERAL_CONSTANTS.RANDOM_VARIANCE_RANGE : 
      questionCount <= ROASTING_CONSTANTS.MID_STREAK_THRESHOLD ? ROASTING_CONSTANTS.MID_STREAK_VARIANCE : 
        ROASTING_CONSTANTS.LATE_STREAK_VARIANCE;
    const randomBonus = Math.random() * variance * questionCount;
    
    // BONUS BOMB SYSTEM: 10% chance of massive bonus for high streaks (psychological warfare)
    // Creates memorable "punishment events" that users remember and discuss
    const bonusBomb = (questionCount > ROASTING_CONSTANTS.MID_STREAK_THRESHOLD && Math.random() < ROASTING_CONSTANTS.BONUS_BOMB_CHANCE) ? 
      Math.random() * ROASTING_CONSTANTS.MAX_BONUS_BOMB : 0;
    
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
        TIME_CONSTANTS.ONE_HOUR_MS,
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
    this.roastingState.roastDebt.set(userId, currentDebt + ROASTING_CONSTANTS.DEBT_INCREMENT);
  }

  checkForMercyKill(userId: string): boolean {
    const userStats = this.userQuestionCounts.get(userId);
    if (!userStats) return false;
    return userStats.count >= ROASTING_CONSTANTS.MERCY_KILL_THRESHOLD && Math.random() < ROASTING_CONSTANTS.MERCY_KILL_CHANCE;
  }

  checkForCooldownBreaking(userId: string, _message: string): boolean {
    const userStats = this.userQuestionCounts.get(userId);
    if (!userStats?.lastRoasted) return false;
    return Math.random() < ROASTING_CONSTANTS.COOLDOWN_BREAK_CHANCE; // 15% chance to break cooldown
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
    if (!this.roastingState.chaosMode.active && Math.random() < ROASTING_CONSTANTS.CHAOS_MODE_TRIGGER_CHANCE) {
      const now = Date.now();
      this.roastingState.chaosMode = {
        active: true,
        endTime: now + (5 + Math.random() * 25) * 60 * 1000,
        multiplier: ROASTING_CONSTANTS.MIN_CHAOS_MULTIPLIER + Math.random() * (ROASTING_CONSTANTS.MAX_CHAOS_MULTIPLIER - ROASTING_CONSTANTS.MIN_CHAOS_MULTIPLIER)
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

  /**
   * Core decision algorithm orchestrating the complete roasting decision process.
   * 
   * This method implements a hierarchical decision tree with multiple override layers
   * and psychological warfare strategies:
   * 
   * DECISION FLOW (in priority order):
   * 
   * 1. CHAOS MODE OVERRIDE (30% trigger chance when active)
   *    - Completely random 70/30 roast/mercy decision
   *    - Bypasses all other logic for maximum unpredictability
   *    - Used for psychological disruption and pattern breaking
   * 
   * 2. COOLDOWN PSYCHOLOGICAL WARFARE
   *    - Standard: Respect cooldown after recent roast (if enabled)
   *    - Warfare: 15% chance to ignore cooldown for surprise factor
   *    - Creates uncertainty about "safe periods"
   * 
   * 3. MERCY KILL SYSTEM
   *    - Triggers after 6+ consecutive questions
   *    - 20% chance to force roast regardless of other factors
   *    - Prevents infinite question streaks, maintains engagement
   * 
   * 4. STRATEGY-SPECIFIC OVERRIDES
   *    - Reverse psychology: Surprise mercy after 5+ questions (40% chance)
   *    - Other strategies can implement custom logic
   * 
   * 5. STANDARD PROBABILITY CALCULATION
   *    - Base chance (20-70%, updated hourly)
   *    - Six modifier calculations (consecutive, complexity, time, mood, debt, server)
   *    - Chaos multiplier applied if active (0.5x to 2.5x)
   *    - Final chance capped at configured maximum (default 90%)
   * 
   * 6. FINAL RANDOM ROLL
   *    - Simple random check against calculated probability
   *    - Comprehensive logging for debugging and analysis
   * 
   * @param input - Decision input containing user context and calculator functions
   * @returns boolean - Final roasting decision
   */
  makeDecision(input: DecisionInput): boolean {
    // Build context object for decision processing
    const context: RoastingContext = {
      userId: input.userId,
      message: input.message,
      serverId: input.serverId,
      userStats: input.userStats,
      baseChance: this.roastingState.baseChance,
      roastingState: this.roastingState,
      calculators: input.calculators
    };

    // PRIORITY 1: Chaos mode override (maximum unpredictability)
    if (this.roastingState.chaosMode.active) {
      const chaosOverride = this.checkChaosOverride(context);
      if (chaosOverride) {
        input.updateTracking(chaosOverride.shouldRoast);
        logger.info(`Chaos mode override: ${chaosOverride.reason}`);
        return chaosOverride.shouldRoast;
      }
    }

    // PRIORITY 2: Cooldown logic with psychological warfare
    if (this.config.cooldownAfterRoast && context.userStats.lastRoasted) {
      const ignoreCooldown = Math.random() < ROASTING_CONSTANTS.COOLDOWN_BREAK_CHANCE;
      if (!ignoreCooldown) {
        // Respect cooldown and reset tracking
        context.userStats.lastRoasted = false;
        context.userStats.count = 0;
        logger.info(`Cooldown respected for user ${context.userId}`);
        return false;
      } else {
        // Psychological warfare: ignore expected cooldown
        logger.info(`Cooldown IGNORED for user ${context.userId} (psychological warfare)`);
      }
    }

    // PRIORITY 3: Mercy kill system (compassionate roasting)
    if (context.userStats.count >= ROASTING_CONSTANTS.MERCY_KILL_THRESHOLD && Math.random() < ROASTING_CONSTANTS.MERCY_KILL_CHANCE) {
      input.updateTracking(true);
      logger.info(`Mercy kill activated for user ${context.userId} after ${context.userStats.count} questions`);
      return true;
    }

    // PRIORITY 4: Strategy selection and overrides
    const strategy = this.strategies.get(this.roastingState.botMood) || this.strategies.get('default')!;

    // Check for mood-specific strategy overrides
    const override = strategy.shouldOverride(context);
    if (override) {
      input.updateTracking(override.shouldRoast);
      logger.info(`Strategy override: ${override.reason}`);
      return override.shouldRoast;
    }

    // PRIORITY 5: Standard probability calculation
    let roastChance = strategy.calculateRoastChance(context);

    // Apply chaos multiplier if active (0.5x to 2.5x modification)
    if (this.roastingState.chaosMode.active) {
      roastChance *= this.roastingState.chaosMode.multiplier;
    }

    // Ensure probability stays within valid bounds
    roastChance = Math.max(0, Math.min(roastChance, this.config.maxChance));

    // PRIORITY 6: Final random decision
    const shouldRoast = Math.random() < roastChance;

    // Log comprehensive decision analysis
    this.logDecision(context, roastChance, shouldRoast);

    // Update user and server tracking
    input.updateTracking(shouldRoast);

    return shouldRoast;
  }

  private checkChaosOverride(_context: RoastingContext): OverrideResult | null {
    const chaosRoll = Math.random();
    
    if (chaosRoll < ROASTING_CONSTANTS.CHAOS_OVERRIDE_CHANCE) {
      const chaosDecision = Math.random() < ROASTING_CONSTANTS.CHAOS_DECISION_ROAST_CHANCE;
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
    if (context.userStats.count > ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_OVERRIDE_THRESHOLD && Math.random() < ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_OVERRIDE_CHANCE) {
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