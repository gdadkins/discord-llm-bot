/**
 * Roast Personalizer Module
 * 
 * Handles user profiling, personalization logic, intensity scaling, and mood-based
 * roast modifications. This module ensures roasts are tailored to individual users
 * and server contexts.
 */

import { logger } from '../../utils/logger';
import { ROASTING_CONSTANTS, TIME_CONSTANTS, CACHE_CONSTANTS } from '../../config/constants';
import type {
  MoodCalculatorParams,
  TimeCalculatorParams,
  DebtCalculatorParams,
  ServerCalculatorParams,
  ModifierCalculator,
  MoodCache
} from './types';

// ============================================================================
// Time-Based Personalizer
// ============================================================================

/**
 * Calculates roast modifiers based on time of day
 */
export class TimeCalculator implements ModifierCalculator {
  private cache: { value: number; hour: number } = { value: 0, hour: -1 };

  calculate(params: TimeCalculatorParams): number {
    const hour = params.hour ?? new Date().getHours();
    
    if (this.cache.hour === hour) {
      return this.cache.value;
    }
    
    let modifier: number;
    
    if (hour >= 23 || hour <= 3) {
      modifier = ROASTING_CONSTANTS.NIGHT_OWL_BONUS;
    } else if (hour >= 5 && hour <= 8) {
      modifier = ROASTING_CONSTANTS.EARLY_BIRD_PENALTY;
    } else if (hour >= 19 && hour <= 23) {
      modifier = ROASTING_CONSTANTS.PEAK_HOURS_BONUS;
    } else if (hour >= 13 && hour <= 17) {
      modifier = ROASTING_CONSTANTS.AFTERNOON_BONUS;
    } else {
      modifier = 0;
    }
    
    this.cache = { value: modifier, hour };
    return modifier;
  }
}

// ============================================================================
// Mood-Based Personalizer
// ============================================================================

/**
 * Calculates roast modifiers based on bot mood
 */
export class MoodCalculator implements ModifierCalculator {
  private cache: MoodCache | null = null;

  calculate(params: MoodCalculatorParams): number {
    const { mood, questionCount } = params;
    
    if (this.cache && this.cache.mood === mood) {
      const cached = this.cache.modifiersByCount.get(questionCount);
      if (cached !== undefined) {
        return cached;
      }
    } else {
      this.cache = {
        mood: mood as ('sleepy' | 'caffeinated' | 'chaotic' | 'reverse_psychology' | 'bloodthirsty'),
        modifiersByCount: new Map(),
        timestamp: Date.now()
      };
    }
    
    let modifier: number;
    
    switch (mood) {
    case 'sleepy':
      modifier = ROASTING_CONSTANTS.SLEEPY_BASE_MODIFIER + questionCount * ROASTING_CONSTANTS.SLEEPY_ESCALATION;
      break;
    case 'caffeinated':
      modifier = ROASTING_CONSTANTS.CAFFEINATED_BASE_MODIFIER + questionCount * ROASTING_CONSTANTS.CAFFEINATED_ESCALATION;
      break;
    case 'chaotic':
      modifier = Math.random() * ROASTING_CONSTANTS.CHAOTIC_RANDOM_RANGE - ROASTING_CONSTANTS.CHAOTIC_RANDOM_OFFSET;
      return modifier; // Don't cache random values
    case 'reverse_psychology':
      modifier = questionCount > ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_THRESHOLD ? 
        ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_PENALTY : 
        ROASTING_CONSTANTS.REVERSE_PSYCHOLOGY_BONUS;
      break;
    case 'bloodthirsty':
      modifier = ROASTING_CONSTANTS.BLOODTHIRSTY_BASE_MODIFIER + questionCount * ROASTING_CONSTANTS.BLOODTHIRSTY_ESCALATION;
      break;
    default:
      modifier = 0;
    }
    
    if (this.cache.modifiersByCount.size < ROASTING_CONSTANTS.MAX_MOOD_CACHE_SIZE) {
      this.cache.modifiersByCount.set(questionCount, modifier);
    }
    
    return modifier;
  }

  clearCache(): void {
    this.cache = null;
  }
}

// ============================================================================
// Debt-Based Personalizer
// ============================================================================

/**
 * Tracks and calculates roast debt for users
 */
export class DebtCalculator implements ModifierCalculator {
  constructor(private roastDebt: Map<string, number>) {}

  calculate(params: DebtCalculatorParams): number {
    const { userId, serverId } = params;
    if (!serverId) return 0;

    const debt = this.roastDebt.get(userId) || 0;
    this.roastDebt.set(userId, debt + ROASTING_CONSTANTS.DEBT_GROWTH_RATE);

    if (debt > ROASTING_CONSTANTS.SIGNIFICANT_DEBT_THRESHOLD) {
      logger.info(
        `User ${userId} has accumulated significant roast debt: ${debt.toFixed(2)}`,
      );
      return Math.min(debt * ROASTING_CONSTANTS.DEBT_BONUS_MULTIPLIER, ROASTING_CONSTANTS.MAX_DEBT_BONUS);
    }

    return debt * ROASTING_CONSTANTS.SMALL_DEBT_MULTIPLIER;
  }

  clearDebt(userId: string): void {
    this.roastDebt.delete(userId);
  }

  getDebt(userId: string): number {
    return this.roastDebt.get(userId) || 0;
  }
}

// ============================================================================
// Server-Based Personalizer
// ============================================================================

/**
 * Calculates roast modifiers based on server activity
 */
export class ServerCalculator implements ModifierCalculator {
  private cache: Map<string, { value: number; timestamp: number }> = new Map();

  calculate(params: ServerCalculatorParams & { serverHistory?: { recent: number; lastRoastTime: number } }): number {
    const { serverId, serverHistory } = params;
    if (!serverId || !serverHistory) return 0;

    const cached = this.cache.get(serverId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_CONSTANTS.SERVER_INFLUENCE_CACHE_DURATION_MS) {
      return cached.value;
    }

    const timeSinceLastRoast = Date.now() - serverHistory.lastRoastTime;
    const hoursSinceRoast = timeSinceLastRoast / TIME_CONSTANTS.ONE_HOUR_MS;

    let modifier: number;
    
    if (hoursSinceRoast < ROASTING_CONSTANTS.HOT_SERVER_TIME_HOURS && 
        serverHistory.recent > ROASTING_CONSTANTS.HOT_SERVER_RECENT_THRESHOLD) {
      modifier = ROASTING_CONSTANTS.HOT_SERVER_BONUS;
    } else if (hoursSinceRoast > ROASTING_CONSTANTS.COLD_SERVER_TIME_HOURS) {
      modifier = Math.min(
        hoursSinceRoast * ROASTING_CONSTANTS.COLD_SERVER_BONUS_PER_HOUR, 
        ROASTING_CONSTANTS.MAX_COLD_SERVER_BONUS
      );
    } else {
      modifier = 0;
    }
    
    this.cache.set(serverId, { value: modifier, timestamp: Date.now() });
    
    if (this.cache.size > ROASTING_CONSTANTS.MAX_SERVER_CACHE_SIZE) {
      let oldestKey: string | undefined;
      let oldestTime = Date.now();
      
      for (const [key, value] of this.cache.entries()) {
        if (value.timestamp < oldestTime) {
          oldestTime = value.timestamp;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    return modifier;
  }
}

// ============================================================================
// Main Personalizer Class
// ============================================================================

/**
 * Orchestrates all personalization aspects of roasting
 */
export class RoastPersonalizer {
  private timeCalculator: TimeCalculator;
  private moodCalculator: MoodCalculator;
  private debtCalculator: DebtCalculator;
  private serverCalculator: ServerCalculator;
  private userProfiles: Map<string, UserProfile> = new Map();

  constructor(roastDebt: Map<string, number>) {
    this.timeCalculator = new TimeCalculator();
    this.moodCalculator = new MoodCalculator();
    this.debtCalculator = new DebtCalculator(roastDebt);
    this.serverCalculator = new ServerCalculator();
  }

  /**
   * Calculate time-based modifier
   */
  calculateTimeModifier(hour?: number): number {
    return this.timeCalculator.calculate({ hour });
  }

  /**
   * Calculate mood-based modifier
   */
  calculateMoodModifier(mood: string, questionCount: number): number {
    return this.moodCalculator.calculate({ mood, questionCount });
  }

  /**
   * Calculate debt-based modifier
   */
  calculateDebtModifier(userId: string, serverId?: string): number {
    return this.debtCalculator.calculate({ userId, serverId });
  }

  /**
   * Calculate server-based modifier
   */
  calculateServerModifier(
    serverId?: string, 
    serverHistory?: { recent: number; lastRoastTime: number }
  ): number {
    return this.serverCalculator.calculate({ serverId, serverHistory });
  }

  /**
   * Clear mood cache when mood changes
   */
  clearMoodCache(): void {
    this.moodCalculator.clearCache();
  }

  /**
   * Clear user debt
   */
  clearUserDebt(userId: string): void {
    this.debtCalculator.clearDebt(userId);
  }

  /**
   * Get user profile for personalization
   */
  getUserProfile(userId: string): UserProfile {
    let profile = this.userProfiles.get(userId);
    if (!profile) {
      profile = this.createDefaultProfile(userId);
      this.userProfiles.set(userId, profile);
    }
    return profile;
  }

  /**
   * Update user profile based on interaction
   */
  updateUserProfile(userId: string, wasRoasted: boolean, questionCount: number): void {
    const profile = this.getUserProfile(userId);
    
    if (wasRoasted) {
      profile.totalRoasts++;
      profile.lastRoastedAt = Date.now();
      profile.averageQuestionsBeforeRoast = 
        (profile.averageQuestionsBeforeRoast * (profile.totalRoasts - 1) + questionCount) / profile.totalRoasts;
    }
    
    profile.lastInteraction = Date.now();
    profile.totalInteractions++;
  }

  /**
   * Get personalized roast intensity
   */
  getPersonalizedIntensity(userId: string): number {
    const profile = this.getUserProfile(userId);
    const debt = this.debtCalculator.getDebt(userId);
    
    // Base intensity on user's roast history
    let intensity = 0.5; // Default medium intensity
    
    // Increase intensity for users who haven't been roasted in a while
    const ONE_DAY_MS = 24 * TIME_CONSTANTS.ONE_HOUR_MS;
    if (profile.lastRoastedAt && Date.now() - profile.lastRoastedAt > ONE_DAY_MS) {
      intensity += 0.1;
    }
    
    // Increase intensity based on debt
    if (debt > ROASTING_CONSTANTS.SIGNIFICANT_DEBT_THRESHOLD) {
      intensity += 0.2;
    }
    
    // Adjust based on average questions before roast
    if (profile.averageQuestionsBeforeRoast > 5) {
      intensity += 0.1; // User tends to avoid roasts, increase intensity
    }
    
    return Math.min(1.0, Math.max(0.1, intensity));
  }

  /**
   * Create default user profile
   */
  private createDefaultProfile(userId: string): UserProfile {
    return {
      userId,
      totalRoasts: 0,
      lastRoastedAt: null,
      averageQuestionsBeforeRoast: 0,
      totalInteractions: 0,
      lastInteraction: Date.now()
    };
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

interface UserProfile {
  userId: string;
  totalRoasts: number;
  lastRoastedAt: number | null;
  averageQuestionsBeforeRoast: number;
  totalInteractions: number;
  lastInteraction: number;
}