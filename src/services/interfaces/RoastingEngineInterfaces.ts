/**
 * Roasting Engine Service Interface Definitions
 * 
 * Interfaces for roasting logic, mood system, and psychological warfare features.
 */

import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Roasting Engine Service Interfaces
// ============================================================================

export interface IRoastingEngine extends IService {
  /**
   * Roasting logic
   */
  shouldRoast(userId: string, message: string, serverId?: string): boolean;
  isUserOnCooldown(userId: string): boolean;
  getConsecutiveRoasts(userId: string): number;
  
  /**
   * Psychological warfare features
   */
  addToRoastDebt(userId: string): void;
  checkForMercyKill(userId: string): boolean;
  checkForCooldownBreaking(userId: string, message: string): boolean;
  
  /**
   * Mood system
   */
  isInMood(): boolean;
  triggerMood(reason: string): void;
  checkForChaosEvent(): void;
  getCurrentMoodInfo(): MoodInfo | null;
  
  /**
   * Statistics
   */
  getUserRoastStats(userId: string): UserRoastStats;
  getRoastingStats(): RoastingStats;
}

export interface MoodInfo {
  active: boolean;
  reason: string;
  multiplier: number;
  endTime: number;
}

export interface UserRoastStats {
  consecutiveRoasts: number;
  lastRoasted: number | null;
  totalRoasts: number;
  roastDebt: number;
  mercyKills: number;
}

export interface RoastingStats {
  totalRoasts: number;
  totalUsers: number;
  moodTriggered: number;
  chaosEvents: number;
  mercyKills: number;
  cooldownBreaks: number;
}