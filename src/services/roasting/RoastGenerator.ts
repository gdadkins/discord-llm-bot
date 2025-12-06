/**
 * Roast Generator Module
 * 
 * Handles roast template management, generation algorithms, and creativity logic.
 * This module is responsible for the actual creation of roasts based on various
 * factors including user behavior, mood states, and complexity patterns.
 */

import { logger } from '../../utils/logger';
import { ROASTING_CONSTANTS, GENERAL_CONSTANTS } from '../../utils/constants';
import type { 
  RoastingContext, 
  OverrideResult, 
  RoastingStrategy,
  ComplexityCalculatorParams,
  ConsecutiveCalculatorParams,
  ModifierCalculator
} from './types';

// ============================================================================
// Modifier Calculator Implementations
// ============================================================================

/**
 * Calculates complexity bonus based on message content
 */
export class ComplexityCalculator implements ModifierCalculator {
  private cache: Map<string, { value: number; hash: string }> = new Map();
  private static readonly COMPLEXITY_PATTERNS = {
    code: /```|`/,
    programming: /\b(function|class|import|const|let|var|if|else|for|while)\b/i,
    technical: /\b(api|database|server|client|bug|error|exception|deploy|build)\b/i
  };

  calculate(params: ComplexityCalculatorParams): number {
    const { message } = params;
    const hash = `${message.length}-${message.includes('?')}-${message.includes('`')}`;
    
    const cached = this.cache.get(hash);
    if (cached && cached.hash === hash) {
      return cached.value;
    }
    
    let complexity = 0;
    complexity += Math.min(message.length / ROASTING_CONSTANTS.MESSAGE_LENGTH_DIVISOR, ROASTING_CONSTANTS.MAX_LENGTH_MODIFIER);
    
    if (ComplexityCalculator.COMPLEXITY_PATTERNS.code.test(message)) complexity += ROASTING_CONSTANTS.CODE_PRESENCE_BONUS;
    if (ComplexityCalculator.COMPLEXITY_PATTERNS.programming.test(message)) complexity += ROASTING_CONSTANTS.PROGRAMMING_KEYWORD_BONUS;
    if (ComplexityCalculator.COMPLEXITY_PATTERNS.technical.test(message)) complexity += ROASTING_CONSTANTS.TECHNICAL_KEYWORD_BONUS;
    
    if (message.includes('?')) complexity += ROASTING_CONSTANTS.QUESTION_MARK_BONUS;
    if (message.split('?').length > 2) complexity += ROASTING_CONSTANTS.MULTIPLE_QUESTIONS_BONUS;
    
    const result = Math.min(complexity, ROASTING_CONSTANTS.MAX_COMPLEXITY_BONUS);
    
    if (this.cache.size > ROASTING_CONSTANTS.MAX_COMPLEXITY_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    
    this.cache.set(hash, { value: result, hash });
    return result;
  }
}

/**
 * Calculates modifier based on consecutive questions
 */
export class ConsecutiveCalculator implements ModifierCalculator {
  private cache: Map<number, number> = new Map();

  calculate(params: ConsecutiveCalculatorParams): number {
    const { questionCount } = params;
    
    const cached = this.cache.get(questionCount);
    if (cached !== undefined) {
      return cached + (Math.random() * GENERAL_CONSTANTS.RANDOM_VARIANCE_RANGE - GENERAL_CONSTANTS.RANDOM_VARIANCE_RANGE / 2);
    }
    
    if (questionCount === 0) {
      this.cache.set(0, 0);
      return 0;
    }
    
    let baseValue: number;
    
    if (questionCount <= 2) {
      baseValue = questionCount * ROASTING_CONSTANTS.EARLY_QUESTIONS_MULTIPLIER;
    } else if (questionCount <= 5) {
      baseValue = questionCount * ROASTING_CONSTANTS.MID_STREAK_MULTIPLIER;
    } else {
      baseValue = questionCount * ROASTING_CONSTANTS.LATE_STREAK_MULTIPLIER;
    }
    
    if (this.cache.size < ROASTING_CONSTANTS.MAX_CONSECUTIVE_CACHE_SIZE) {
      this.cache.set(questionCount, baseValue);
    }
    
    const variance = questionCount <= ROASTING_CONSTANTS.EARLY_QUESTIONS_THRESHOLD ? GENERAL_CONSTANTS.RANDOM_VARIANCE_RANGE : 
      questionCount <= ROASTING_CONSTANTS.MID_STREAK_THRESHOLD ? ROASTING_CONSTANTS.MID_STREAK_VARIANCE : 
        ROASTING_CONSTANTS.LATE_STREAK_VARIANCE;
    const randomBonus = Math.random() * variance * questionCount;
    
    const bonusBomb = (questionCount > ROASTING_CONSTANTS.MID_STREAK_THRESHOLD && Math.random() < ROASTING_CONSTANTS.BONUS_BOMB_CHANCE) ? 
      Math.random() * ROASTING_CONSTANTS.MAX_BONUS_BOMB : 0;
    
    return baseValue + randomBonus + bonusBomb;
  }
}

// ============================================================================
// Roasting Strategy Implementations
// ============================================================================

/**
 * Base strategy for roasting calculations
 */
abstract class BaseRoastingStrategy implements RoastingStrategy {
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

export class SleepyStrategy extends BaseRoastingStrategy {}

export class CaffeinatedStrategy extends BaseRoastingStrategy {}

export class ChaoticStrategy extends BaseRoastingStrategy {}

export class ReversePhychologyStrategy extends BaseRoastingStrategy {
  shouldOverride(context: RoastingContext): OverrideResult | null {
    if (context.userStats.count > ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_OVERRIDE_THRESHOLD && 
        Math.random() < ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_OVERRIDE_CHANCE) {
      return {
        shouldRoast: false,
        reason: `Reverse psychology mercy for user ${context.userId} (expected roast but got mercy)`
      };
    }
    return null;
  }
}

export class BloodthirstyStrategy extends BaseRoastingStrategy {}

export class DefaultStrategy extends BaseRoastingStrategy {}

// ============================================================================
// Roast Generation Engine
// ============================================================================

/**
 * Main roast generation engine that creates and manages roasts
 */
export class RoastGenerator {
  private complexityCalculator: ComplexityCalculator;
  private consecutiveCalculator: ConsecutiveCalculator;
  private strategies: Map<string, RoastingStrategy>;

  constructor() {
    this.complexityCalculator = new ComplexityCalculator();
    this.consecutiveCalculator = new ConsecutiveCalculator();
    
    // Initialize strategies
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
   * Get strategy for a specific mood
   */
  getStrategy(mood: string): RoastingStrategy {
    return this.strategies.get(mood) || this.strategies.get('default')!;
  }

  /**
   * Calculate complexity modifier for a message
   */
  calculateComplexity(message: string): number {
    return this.complexityCalculator.calculate({ message });
  }

  /**
   * Calculate consecutive question modifier
   */
  calculateConsecutive(questionCount: number): number {
    return this.consecutiveCalculator.calculate({ questionCount });
  }

  /**
   * Generate roast decision metadata
   */
  generateRoastMetadata(context: RoastingContext, roastChance: number, decision: boolean): {
    userId: string;
    decision: boolean;
    chance: number;
    mood: string;
    questionCount: number;
    modifiers: {
      consecutive: number;
      complexity: number;
      time: number;
      mood: number;
      debt: number;
      server: number;
    };
  } {
    return {
      userId: context.userId,
      decision,
      chance: roastChance,
      mood: context.roastingState.botMood,
      questionCount: context.userStats.count,
      modifiers: {
        consecutive: context.calculators.consecutive(),
        complexity: context.calculators.complexity(),
        time: context.calculators.time(),
        mood: context.calculators.mood(),
        debt: context.calculators.debt(),
        server: context.calculators.server()
      }
    };
  }

  /**
   * Log roast decision for debugging
   */
  logRoastDecision(metadata: ReturnType<RoastGenerator['generateRoastMetadata']>, chaosActive: boolean, chaosMultiplier?: number): void {
    const { userId, decision, chance, mood, questionCount, modifiers } = metadata;
    
    logger.info(
      `Roast decision for user ${userId}: ${decision ? 'ROAST' : 'PASS'} | ` +
      `Final chance: ${(chance * 100).toFixed(1)}% | ` +
      `Base: ${((chance - Object.values(modifiers).reduce((a, b) => a + b, 0)) * 100).toFixed(1)}% | ` +
      `Consecutive: +${(modifiers.consecutive * 100).toFixed(1)}% | ` +
      `Complexity: +${(modifiers.complexity * 100).toFixed(1)}% | ` +
      `Time: ${modifiers.time >= 0 ? '+' : ''}${(modifiers.time * 100).toFixed(1)}% | ` +
      `Mood (${mood}): ${modifiers.mood >= 0 ? '+' : ''}${(modifiers.mood * 100).toFixed(1)}% | ` +
      `Debt: +${(modifiers.debt * 100).toFixed(1)}% | ` +
      `Server: +${(modifiers.server * 100).toFixed(1)}% | ` +
      `Questions: ${questionCount} | ` +
      `Chaos: ${chaosActive ? `${chaosMultiplier?.toFixed(1)}x` : 'OFF'}`
    );
  }
}