/**
 * Main Roasting Engine
 * 
 * Orchestrates roast selection, probability system, and delivery logic.
 * This is the main entry point for the roasting system, coordinating
 * between the generator and personalizer modules.
 */

import { logger } from '../../utils/logger';
import { BaseService } from '../base/BaseService';
import { RoastGenerator } from './RoastGenerator';
import { RoastPersonalizer } from './RoastPersonalizer';
import { ChaosEventManager } from './ChaosEventManager';
import { RoastingDecisionEngine } from './RoastingDecisionEngine';
import { ROASTING_CONSTANTS, TIME_CONSTANTS, GENERAL_CONSTANTS } from '../../utils/constants';
import type { IRoastingEngine, MoodInfo, UserRoastStats, RoastingStats } from '../interfaces';
import type { UserQuestionStats, RoastingState, RoastingContext } from './types';

// ============================================================================
// Main Roasting Engine Implementation
// ============================================================================

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

  // Core components
  private chaosEventManager: ChaosEventManager;
  private decisionEngine: RoastingDecisionEngine;
  private roastGenerator: RoastGenerator;
  private roastPersonalizer: RoastPersonalizer;

  constructor() {
    super();
    
    // Initialize components
    this.chaosEventManager = new ChaosEventManager();
    this.roastGenerator = new RoastGenerator();
    this.roastPersonalizer = new RoastPersonalizer(this.roastingState.roastDebt);
    this.decisionEngine = new RoastingDecisionEngine(this.roastGenerator);
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
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    return {
      roasting: {
        activeUsers: this.userQuestionCounts.size,
        botMood: this.roastingState.botMood,
        chaosMode: this.chaosEventManager.isActive(),
        baseChance: this.roastingState.baseChance,
        activeTimers: this.activeTimers.size
      }
    };
  }

  /**
   * Primary decision algorithm for determining whether to roast a user.
   * Delegates to the RoastingDecisionEngine for simplified decision making.
   */
  shouldRoast(userId: string, message: string = '', serverId?: string): boolean {
    // Update dynamic state
    this.updateDynamicRoastingState();
    
    // Get user stats
    const userStats = this.getOrCreateUserStats(userId);
    
    // Create context with calculator functions
    const context: RoastingContext = {
      userId,
      message,
      serverId,
      userStats,
      baseChance: this.roastingState.baseChance,
      roastingState: this.roastingState,
      calculators: {
        consecutive: () => this.roastGenerator.calculateConsecutive(userStats.count),
        complexity: () => this.roastGenerator.calculateComplexity(message),
        time: () => this.roastPersonalizer.calculateTimeModifier(),
        mood: () => this.roastPersonalizer.calculateMoodModifier(this.roastingState.botMood, userStats.count),
        debt: () => this.roastPersonalizer.calculateDebtModifier(userId, serverId),
        server: () => this.roastPersonalizer.calculateServerModifier(
          serverId, 
          serverId ? this.roastingState.serverRoastHistory.get(serverId) : undefined
        )
      }
    };
    
    // Delegate to decision engine
    const shouldRoastResult = this.decisionEngine.makeDecision(context, this.chaosEventManager);
    
    // Update tracking
    if (shouldRoastResult) {
      userStats.count = 0;
      userStats.lastRoasted = true;
      this.updateServerHistory(serverId, true);
      this.roastPersonalizer.clearUserDebt(userId);
      this.roastPersonalizer.updateUserProfile(userId, true, userStats.count);
    } else {
      userStats.count++;
      userStats.lastRoasted = false;
      this.roastPersonalizer.updateUserProfile(userId, false, userStats.count);
    }
    
    return shouldRoastResult;
  }

  private getOrCreateUserStats(userId: string): UserQuestionStats {
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
      this.roastingState.baseChance = ROASTING_CONSTANTS.MIN_BASE_CHANCE + Math.random() * GENERAL_CONSTANTS.HALF_VALUE;
      this.roastingState.lastBaseChanceUpdate = now;
      logger.info(
        `Base roast chance updated to ${(this.roastingState.baseChance * 100).toFixed(1)}%`,
      );
    }

    // Update bot mood every 30 minutes to 2 hours (random)
    const moodDuration = (ROASTING_CONSTANTS.MIN_MOOD_DURATION_MINUTES + 
      Math.random() * (ROASTING_CONSTANTS.MAX_MOOD_DURATION_MINUTES - ROASTING_CONSTANTS.MIN_MOOD_DURATION_MINUTES)) * 
      TIME_CONSTANTS.ONE_MINUTE_MS;
    
    if (now - this.roastingState.moodStartTime > moodDuration) {
      const moods: Array<typeof this.roastingState.botMood> = [
        'sleepy',
        'caffeinated',
        'chaotic',
        'reverse_psychology',
        'bloodthirsty',
      ];
      this.roastingState.botMood = moods[Math.floor(Math.random() * moods.length)];
      this.roastingState.moodStartTime = now;
      
      // Clear mood cache on mood change
      this.roastPersonalizer.clearMoodCache();
      
      logger.info(`Bot mood changed to: ${this.roastingState.botMood}`);
    }

    // Update chaos mode state
    this.chaosEventManager.updateChaosMode();
    
    // Sync chaos mode state with roasting state for backward compatibility
    const chaosInfo = this.chaosEventManager.getInfo();
    this.roastingState.chaosMode = chaosInfo;
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
      );
      
      // Track the timer for proper cleanup
      this.activeTimers.add(timer);
    }
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  getRoastingState(): {
    baseChance: number;
    botMood: string;
    chaosMode: boolean;
    chaosMultiplier?: number;
    activeUsers: number;
    } {
    const chaosInfo = this.chaosEventManager.getInfo();
    return {
      baseChance: this.roastingState.baseChance,
      botMood: this.roastingState.botMood,
      chaosMode: chaosInfo.active,
      chaosMultiplier: chaosInfo.active ? chaosInfo.multiplier : undefined,
      activeUsers: this.userQuestionCounts.size
    };
  }

  clearUserStats(userId: string): boolean {
    const hasStats = this.userQuestionCounts.has(userId);
    this.userQuestionCounts.delete(userId);
    this.roastPersonalizer.clearUserDebt(userId);
    return hasStats;
  }

  getUserStats(userId: string): UserQuestionStats | undefined {
    return this.userQuestionCounts.get(userId);
  }

  // ============================================================================
  // IRoastingEngine Implementation
  // ============================================================================

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
    return userStats.count >= ROASTING_CONSTANTS.MERCY_KILL_THRESHOLD && 
           Math.random() < ROASTING_CONSTANTS.MERCY_KILL_CHANCE;
  }

  checkForCooldownBreaking(userId: string, _message: string): boolean {
    const userStats = this.userQuestionCounts.get(userId);
    if (!userStats?.lastRoasted) return false;
    return Math.random() < ROASTING_CONSTANTS.COOLDOWN_BREAK_CHANCE;
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
    this.roastPersonalizer.clearMoodCache();
    logger.info(`Mood triggered: ${this.roastingState.botMood} (${reason})`);
  }

  checkForChaosEvent(): void {
    this.chaosEventManager.triggerEvent();
  }

  getCurrentMoodInfo(): MoodInfo | null {
    const chaosInfo = this.chaosEventManager.getInfo();
    if (!chaosInfo.active) return null;
    return {
      active: chaosInfo.active,
      reason: 'chaos_mode',
      multiplier: chaosInfo.multiplier,
      endTime: chaosInfo.endTime
    };
  }

  getUserRoastStats(userId: string): UserRoastStats {
    const userStats = this.userQuestionCounts.get(userId);
    const debt = this.roastingState.roastDebt.get(userId) || 0;
    const profile = this.roastPersonalizer.getUserProfile(userId);
    
    return {
      consecutiveRoasts: userStats?.count || 0,
      lastRoasted: profile.lastRoastedAt,
      totalRoasts: profile.totalRoasts,
      roastDebt: debt,
      mercyKills: 0 // TODO: Track mercy kills in future enhancement
    };
  }

  getRoastingStats(): RoastingStats {
    let totalRoasts = 0;
    this.userQuestionCounts.forEach((_, userId) => {
      const profile = this.roastPersonalizer.getUserProfile(userId);
      totalRoasts += profile.totalRoasts;
    });

    return {
      totalRoasts,
      totalUsers: this.userQuestionCounts.size,
      moodTriggered: 0, // TODO: Track mood triggers in future enhancement
      chaosEvents: 0, // TODO: Track chaos events in future enhancement
      mercyKills: 0, // TODO: Track mercy kills in future enhancement
      cooldownBreaks: 0 // TODO: Track cooldown breaks in future enhancement
    };
  }

  /**
   * Get personalized roast intensity for a user
   */
  getPersonalizedIntensity(userId: string): number {
    return this.roastPersonalizer.getPersonalizedIntensity(userId);
  }
}