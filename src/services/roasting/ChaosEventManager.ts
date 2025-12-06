/**
 * Chaos Event Manager
 * 
 * Manages chaos mode events, multipliers, and special overrides for the roasting system.
 * This module adds unpredictability and excitement to the roasting experience.
 */

import { logger } from '../../utils/logger';
import { ROASTING_CONSTANTS, TIME_CONSTANTS } from '../../utils/constants';
import type { OverrideResult, ChaosInfo } from './types';

// ============================================================================
// Chaos Event Manager Implementation
// ============================================================================

export class ChaosEventManager {
  private chaosMode: ChaosInfo;

  constructor() {
    this.chaosMode = { 
      active: false, 
      endTime: 0, 
      multiplier: 1 
    };
  }

  /**
   * Update chaos mode state and check for activation
   */
  updateChaosMode(): void {
    const now = Date.now();
    
    // Check if chaos mode should end
    if (this.chaosMode.active && now > this.chaosMode.endTime) {
      this.chaosMode.active = false;
      logger.info('Chaos mode ended');
    }

    // Check for random chaos mode activation
    if (!this.chaosMode.active && Math.random() < ROASTING_CONSTANTS.CHAOS_MODE_TRIGGER_CHANCE) {
      this.activateChaosMode();
    }
  }

  /**
   * Activate chaos mode with random duration and multiplier
   */
  private activateChaosMode(): void {
    const now = Date.now();
    const durationMinutes = ROASTING_CONSTANTS.MIN_CHAOS_DURATION_MINUTES + 
      Math.random() * (ROASTING_CONSTANTS.MAX_CHAOS_DURATION_MINUTES - ROASTING_CONSTANTS.MIN_CHAOS_DURATION_MINUTES);
    
    this.chaosMode = {
      active: true,
      endTime: now + durationMinutes * TIME_CONSTANTS.ONE_MINUTE_MS,
      multiplier: ROASTING_CONSTANTS.MIN_CHAOS_MULTIPLIER + 
        Math.random() * (ROASTING_CONSTANTS.MAX_CHAOS_MULTIPLIER - ROASTING_CONSTANTS.MIN_CHAOS_MULTIPLIER)
    };
    
    logger.info(
      `Chaos mode activated for ${durationMinutes.toFixed(0)} minutes ` +
      `with ${this.chaosMode.multiplier.toFixed(1)}x multiplier`
    );
  }

  /**
   * Check if chaos mode is currently active
   */
  isActive(): boolean {
    return this.chaosMode.active;
  }

  /**
   * Get current chaos multiplier
   */
  getMultiplier(): number {
    return this.chaosMode.multiplier;
  }

  /**
   * Check for chaos override decision
   */
  checkOverride(): OverrideResult | null {
    if (!this.chaosMode.active) return null;
    
    const chaosRoll = Math.random();
    if (chaosRoll < ROASTING_CONSTANTS.CHAOS_OVERRIDE_CHANCE) {
      const chaosDecision = Math.random() < ROASTING_CONSTANTS.CHAOS_DECISION_ROAST_CHANCE;
      return {
        shouldRoast: chaosDecision,
        reason: `${chaosDecision ? 'ROASTING' : 'MERCY'} ` +
                `(${(chaosRoll * 100).toFixed(0)}% chaos roll)`
      };
    }
    
    return null;
  }

  /**
   * Get current chaos mode information
   */
  getInfo(): ChaosInfo {
    return { ...this.chaosMode };
  }

  /**
   * Manually trigger a chaos event
   */
  triggerEvent(): void {
    if (!this.chaosMode.active) {
      this.activateChaosMode();
      logger.info('Chaos event manually triggered!');
    }
  }

  /**
   * Force end chaos mode
   */
  endChaosMode(): void {
    if (this.chaosMode.active) {
      this.chaosMode = {
        active: false,
        endTime: 0,
        multiplier: 1
      };
      logger.info('Chaos mode manually ended');
    }
  }

  /**
   * Get time remaining in chaos mode
   */
  getTimeRemaining(): number {
    if (!this.chaosMode.active) return 0;
    return Math.max(0, this.chaosMode.endTime - Date.now());
  }

  /**
   * Get chaos mode status string for display
   */
  getStatusString(): string {
    if (!this.chaosMode.active) {
      return 'Chaos Mode: INACTIVE';
    }

    const remainingMinutes = Math.ceil(this.getTimeRemaining() / TIME_CONSTANTS.ONE_MINUTE_MS);
    return `Chaos Mode: ACTIVE | ${this.chaosMode.multiplier.toFixed(1)}x multiplier | ${remainingMinutes} minutes remaining`;
  }

  /**
   * Check if a special chaos event should occur
   */
  checkSpecialEvent(): { type: string; data: Record<string, unknown> } | null {
    if (!this.chaosMode.active) return null;

    const eventRoll = Math.random();
    
    // Roast storm event - multiple rapid roasts
    if (eventRoll < 0.05) {
      return {
        type: 'roast_storm',
        data: {
          duration: 30000, // 30 seconds
          frequency: 0.8 // 80% roast chance
        }
      };
    }

    // Mercy wave - temporary protection
    if (eventRoll < 0.1) {
      return {
        type: 'mercy_wave',
        data: {
          duration: 60000, // 1 minute
          protection: 0.9 // 90% protection
        }
      };
    }

    // Intensity surge - extreme roast modifiers
    if (eventRoll < 0.15) {
      return {
        type: 'intensity_surge',
        data: {
          duration: 45000, // 45 seconds
          intensityMultiplier: 2.0
        }
      };
    }

    return null;
  }
}