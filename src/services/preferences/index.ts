/**
 * User Preferences Module
 * 
 * Exports all preference-related components
 */

export { UserPreferenceManager } from './UserPreferenceManager';
export { PreferenceStore } from './PreferenceStore';
export { PreferenceValidator } from './PreferenceValidator';
export type {
  UserPreferences,
  CommandHistoryEntry,
  ScheduledCommand,
  BulkOperation,
  UserPreferenceStorage
} from './types';
export type { 
  IPreferenceStore,
  PreferenceStoreStats 
} from './PreferenceStore';
export type {
  IPreferenceValidator,
  ValidationResult,
  PreferenceConstraints
} from './PreferenceValidator';