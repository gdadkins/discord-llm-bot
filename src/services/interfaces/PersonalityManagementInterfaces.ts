/**
 * Personality Management Service Interface Definitions
 * 
 * Interfaces for managing user personality traits and descriptions.
 */

import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Personality Management Service Interfaces
// ============================================================================

export interface IPersonalityManager extends IService {
  /**
   * Personality operations
   */
  setPersonality(userId: string, trait: string, value: string): void;
  getPersonality(userId: string): UserPersonality | undefined;
  removePersonality(userId: string, trait: string): boolean;
  clearPersonality(userId: string, modifiedBy: string): { success: boolean; message: string };
  
  /**
   * Enhanced personality operations
   */
  addPersonalityDescription(userId: string, description: string, modifiedBy: string): Promise<{ success: boolean; message: string }>;
  removePersonalityDescription(userId: string, description: string, modifiedBy: string): Promise<{ success: boolean; message: string }>;
  
  /**
   * Context building
   */
  buildPersonalityContext(userId: string): string;
  getFormattedTraits(userId: string): string[];
}

export interface UserPersonality {
  userId: string;
  traits: Map<string, string>;
  descriptions: string[];
  lastUpdated: number;
}