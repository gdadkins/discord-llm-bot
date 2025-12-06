/**
 * Roasting Decision Engine
 * 
 * Core decision-making logic for the roasting system. Orchestrates strategies,
 * applies overrides, and makes final roasting decisions based on all factors.
 */

import { logger } from '../../utils/logger';
import { ROASTING_CONSTANTS } from '../../utils/constants';
import { ChaosEventManager } from './ChaosEventManager';
import { RoastGenerator } from './RoastGenerator';
import type { RoastingContext, RoastConfig } from './types';

// ============================================================================
// Main Decision Engine
// ============================================================================

/**
 * Main decision engine that orchestrates roasting strategies
 */
export class RoastingDecisionEngine {
  private config: RoastConfig;

  constructor(private roastGenerator: RoastGenerator) {
    // Load runtime configuration
    this.config = {
      maxChance: parseFloat(process.env.ROAST_MAX_CHANCE || String(ROASTING_CONSTANTS.DEFAULT_MAX_CHANCE)),
      cooldownAfterRoast: process.env.ROAST_COOLDOWN === 'true'
    };
  }

  /**
   * Core decision algorithm orchestrating the complete roasting decision process.
   */
  makeDecision(context: RoastingContext, chaosEventManager: ChaosEventManager): boolean {
    // PRIORITY 1: Chaos mode override
    const chaosOverride = chaosEventManager.checkOverride();
    if (chaosOverride) {
      logger.info(`Chaos mode override: ${chaosOverride.reason}`);
      return chaosOverride.shouldRoast;
    }

    // PRIORITY 2: Cooldown logic with psychological warfare
    if (this.config.cooldownAfterRoast && context.userStats.lastRoasted) {
      const ignoreCooldown = Math.random() < ROASTING_CONSTANTS.COOLDOWN_BREAK_CHANCE;
      if (!ignoreCooldown) {
        context.userStats.lastRoasted = false;
        context.userStats.count = 0;
        logger.info(`Cooldown respected for user ${context.userId}`);
        return false;
      } else {
        logger.info(`Cooldown IGNORED for user ${context.userId} (psychological warfare)`);
      }
    }

    // PRIORITY 3: Mercy kill system
    if (context.userStats.count >= ROASTING_CONSTANTS.MERCY_KILL_THRESHOLD && 
        Math.random() < ROASTING_CONSTANTS.MERCY_KILL_CHANCE) {
      logger.info(`Mercy kill activated for user ${context.userId} after ${context.userStats.count} questions`);
      return true;
    }

    // PRIORITY 4: Strategy selection and overrides
    const strategy = this.roastGenerator.getStrategy(context.roastingState.botMood);
    const override = strategy.shouldOverride(context);
    if (override) {
      logger.info(`Strategy override: ${override.reason}`);
      return override.shouldRoast;
    }

    // PRIORITY 5: Standard probability calculation
    let roastChance = strategy.calculateRoastChance(context);

    // Apply chaos multiplier if active
    if (chaosEventManager.isActive()) {
      roastChance *= chaosEventManager.getMultiplier();
    }

    // Ensure probability stays within valid bounds
    roastChance = Math.max(0, Math.min(roastChance, this.config.maxChance));

    // PRIORITY 6: Final random decision
    const shouldRoast = Math.random() < roastChance;

    // Generate and log decision metadata
    const metadata = this.roastGenerator.generateRoastMetadata(context, roastChance, shouldRoast);
    this.roastGenerator.logRoastDecision(
      metadata, 
      chaosEventManager.isActive(), 
      chaosEventManager.getMultiplier()
    );

    return shouldRoast;
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(newConfig: Partial<RoastConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info(`Roasting config updated: ${JSON.stringify(this.config)}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): RoastConfig {
    return { ...this.config };
  }

  /**
   * Analyze roasting probability for a given context
   */
  analyzeRoastProbability(context: RoastingContext, chaosEventManager: ChaosEventManager): {
    baseChance: number;
    modifiers: Record<string, number>;
    chaosMultiplier: number;
    finalChance: number;
    overrides: string[];
  } {
    const overrides: string[] = [];

    // Check for overrides
    const chaosOverride = chaosEventManager.checkOverride();
    if (chaosOverride) {
      overrides.push(`Chaos: ${chaosOverride.reason}`);
    }

    const strategy = this.roastGenerator.getStrategy(context.roastingState.botMood);
    const strategyOverride = strategy.shouldOverride(context);
    if (strategyOverride) {
      overrides.push(`Strategy: ${strategyOverride.reason}`);
    }

    // Calculate modifiers
    const modifiers = {
      consecutive: context.calculators.consecutive(),
      complexity: context.calculators.complexity(),
      time: context.calculators.time(),
      mood: context.calculators.mood(),
      debt: context.calculators.debt(),
      server: context.calculators.server()
    };

    // Calculate final chance
    let finalChance = context.baseChance + Object.values(modifiers).reduce((sum, mod) => sum + mod, 0);
    const chaosMultiplier = chaosEventManager.isActive() ? chaosEventManager.getMultiplier() : 1;
    finalChance *= chaosMultiplier;
    finalChance = Math.max(0, Math.min(finalChance, this.config.maxChance));

    return {
      baseChance: context.baseChance,
      modifiers,
      chaosMultiplier,
      finalChance,
      overrides
    };
  }

  /**
   * Simulate roasting decision without side effects
   */
  simulateDecision(context: RoastingContext, chaosEventManager: ChaosEventManager): {
    wouldRoast: boolean;
    probability: number;
    reason: string;
  } {
    // Check overrides first
    const chaosOverride = chaosEventManager.checkOverride();
    if (chaosOverride) {
      return {
        wouldRoast: chaosOverride.shouldRoast,
        probability: chaosOverride.shouldRoast ? 1.0 : 0.0,
        reason: `Chaos override: ${chaosOverride.reason}`
      };
    }

    // Check cooldown
    if (this.config.cooldownAfterRoast && context.userStats.lastRoasted) {
      return {
        wouldRoast: false,
        probability: ROASTING_CONSTANTS.COOLDOWN_BREAK_CHANCE,
        reason: 'User on cooldown'
      };
    }

    // Check mercy kill
    if (context.userStats.count >= ROASTING_CONSTANTS.MERCY_KILL_THRESHOLD) {
      return {
        wouldRoast: true,
        probability: ROASTING_CONSTANTS.MERCY_KILL_CHANCE,
        reason: `Mercy kill threshold reached (${context.userStats.count} questions)`
      };
    }

    // Calculate normal probability
    const analysis = this.analyzeRoastProbability(context, chaosEventManager);
    
    return {
      wouldRoast: Math.random() < analysis.finalChance,
      probability: analysis.finalChance,
      reason: `Standard probability calculation (${(analysis.finalChance * 100).toFixed(1)}%)`
    };
  }
}