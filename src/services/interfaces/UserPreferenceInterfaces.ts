/**
 * User Preference Service Interface Definitions
 * 
 * Interfaces for managing user preferences and settings.
 */

import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// User Preference Service Interfaces
// ============================================================================

export interface IUserPreferenceService extends IService {
  /**
   * Preference management
   */
  getUserPreferences(userId: string): UserPreferences;
  updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<void>;
  
  /**
   * Bulk operations
   */
  exportUserPreferences(userId: string): Promise<string>;
  importUserPreferences(userId: string, data: string): Promise<void>;
  deleteUserPreferences(userId: string): Promise<void>;
}

export interface UserPreferences {
  userId: string;
  language: string;
  timezone: string;
  notifications: {
    mentions: boolean;
    updates: boolean;
    reminders: boolean;
  };
  privacy: {
    shareData: boolean;
    publicProfile: boolean;
  };
  features: {
    roasting: boolean;
    contextMemory: boolean;
    personalityPersistence: boolean;
  };
  lastUpdated: number;
}