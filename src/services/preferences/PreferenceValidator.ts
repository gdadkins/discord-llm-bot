/**
 * PreferenceValidator Module
 * 
 * Handles validation, constraints, and migration for user preferences:
 * - Input validation and sanitization
 * - Business rule enforcement
 * - Command alias validation
 * - Preference migration between versions
 * - Constraint checking for limits
 * 
 * @module PreferenceValidator
 */

import { logger } from '../../utils/logger';
import type {
  UserPreferences,
  CommandHistoryEntry,
  ScheduledCommand,
  BulkOperation
} from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PreferenceConstraints {
  maxHistorySize: number;
  maxScheduledCommands: number;
  maxBulkOperations: number;
  maxAliasLength: number;
  maxCommandLength: number;
  reservedCommands: string[];
}

export interface IPreferenceValidator {
  // Validation methods
  validatePreferences(preferences: Partial<UserPreferences>): ValidationResult;
  validateAlias(alias: string, command: string): ValidationResult;
  validateScheduledCommand(command: ScheduledCommand): ValidationResult;
  validateBulkOperation(operation: BulkOperation): ValidationResult;
  validateHistoryEntry(entry: CommandHistoryEntry): ValidationResult;
  
  // Constraint checking
  isWithinLimits(preferences: UserPreferences): ValidationResult;
  isReservedCommand(command: string): boolean;
  canAddAlias(preferences: UserPreferences, alias: string): boolean;
  canAddScheduledCommand(preferences: UserPreferences): boolean;
  canAddToHistory(preferences: UserPreferences): boolean;
  
  // Migration
  migratePreferences(preferences: unknown, fromVersion?: string): UserPreferences | null;
  needsMigration(preferences: unknown): boolean;
  
  // Sanitization
  sanitizeAlias(alias: string): string;
  sanitizeCommand(command: string): string;
  sanitizePreferences(preferences: Partial<UserPreferences>): Partial<UserPreferences>;
}

export class PreferenceValidator implements IPreferenceValidator {
  private readonly constraints: PreferenceConstraints = {
    maxHistorySize: 100,
    maxScheduledCommands: 50,
    maxBulkOperations: 10,
    maxAliasLength: 32,
    maxCommandLength: 256,
    reservedCommands: [
      'chat', 'status', 'health', 'clear', 'remember', 'addgag',
      'setpersonality', 'mypersonality', 'getpersonality', 'removepersonality',
      'clearpersonality', 'execute', 'recover', 'contextstats', 'summarize',
      'deduplicate', 'crossserver', 'config', 'reload', 'validate',
      'preferences', 'alias', 'history', 'schedule', 'bulk', 'help'
    ]
  };
  
  constructor(customConstraints?: Partial<PreferenceConstraints>) {
    if (customConstraints) {
      this.constraints = { ...this.constraints, ...customConstraints };
    }
  }
  
  validatePreferences(preferences: Partial<UserPreferences>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate basic structure
    if (preferences.userId && typeof preferences.userId !== 'string') {
      errors.push('userId must be a string');
    }
    
    if (preferences.serverId && typeof preferences.serverId !== 'string') {
      errors.push('serverId must be a string');
    }
    
    // Validate preferences object
    if (preferences.preferences) {
      const prefs = preferences.preferences;
      
      if (prefs.defaultPersonality && !['roasting', 'helpful'].includes(prefs.defaultPersonality)) {
        errors.push('defaultPersonality must be either "roasting" or "helpful"');
      }
      
      if (prefs.preferredResponseStyle && !['concise', 'detailed', 'technical'].includes(prefs.preferredResponseStyle)) {
        errors.push('preferredResponseStyle must be "concise", "detailed", or "technical"');
      }
      
      if (prefs.maxHistorySize !== undefined) {
        if (typeof prefs.maxHistorySize !== 'number' || prefs.maxHistorySize < 0) {
          errors.push('maxHistorySize must be a non-negative number');
        } else if (prefs.maxHistorySize > this.constraints.maxHistorySize) {
          warnings.push(`maxHistorySize exceeds recommended limit of ${this.constraints.maxHistorySize}`);
        }
      }
      
      if (prefs.timezone && !this.isValidTimezone(prefs.timezone)) {
        warnings.push('Invalid timezone specified, defaulting to UTC');
      }
      
      if (prefs.preferredLanguage && !this.isValidLanguageCode(prefs.preferredLanguage)) {
        warnings.push('Invalid language code specified');
      }
    }
    
    // Validate command aliases
    if (preferences.commandAliases) {
      for (const [alias, command] of Object.entries(preferences.commandAliases)) {
        const aliasValidation = this.validateAlias(alias, command);
        errors.push(...aliasValidation.errors);
        warnings.push(...aliasValidation.warnings);
      }
    }
    
    // Validate scheduled commands
    if (preferences.scheduledCommands) {
      if (!Array.isArray(preferences.scheduledCommands)) {
        errors.push('scheduledCommands must be an array');
      } else {
        for (const command of preferences.scheduledCommands) {
          const cmdValidation = this.validateScheduledCommand(command);
          errors.push(...cmdValidation.errors);
          warnings.push(...cmdValidation.warnings);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  validateAlias(alias: string, command: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!alias || typeof alias !== 'string') {
      errors.push('Alias must be a non-empty string');
    } else {
      if (alias.length > this.constraints.maxAliasLength) {
        errors.push(`Alias exceeds maximum length of ${this.constraints.maxAliasLength} characters`);
      }
      
      if (this.isReservedCommand(alias)) {
        errors.push(`"${alias}" is a reserved command and cannot be used as an alias`);
      }
      
      if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
        errors.push('Alias can only contain letters, numbers, underscores, and hyphens');
      }
    }
    
    if (!command || typeof command !== 'string') {
      errors.push('Command must be a non-empty string');
    } else if (command.length > this.constraints.maxCommandLength) {
      warnings.push(`Command exceeds recommended length of ${this.constraints.maxCommandLength} characters`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  validateScheduledCommand(command: ScheduledCommand): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!command.id || typeof command.id !== 'string') {
      errors.push('Scheduled command must have a valid ID');
    }
    
    if (!command.command || typeof command.command !== 'string') {
      errors.push('Scheduled command must have a command string');
    }
    
    if (typeof command.scheduledTime !== 'number' || command.scheduledTime <= 0) {
      errors.push('Scheduled time must be a positive timestamp');
    }
    
    if (command.recurring && !['daily', 'weekly', 'monthly'].includes(command.recurring)) {
      errors.push('Recurring must be "daily", "weekly", or "monthly"');
    }
    
    if (typeof command.enabled !== 'boolean') {
      errors.push('Enabled must be a boolean');
    }
    
    if (command.scheduledTime < Date.now() && command.enabled && !command.recurring) {
      warnings.push('Scheduled time is in the past for non-recurring command');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  validateBulkOperation(operation: BulkOperation): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!operation.id || typeof operation.id !== 'string') {
      errors.push('Bulk operation must have a valid ID');
    }
    
    if (!Array.isArray(operation.commands) || operation.commands.length === 0) {
      errors.push('Bulk operation must have at least one command');
    } else {
      if (operation.commands.length > this.constraints.maxBulkOperations) {
        errors.push(`Bulk operation exceeds maximum of ${this.constraints.maxBulkOperations} commands`);
      }
      
      for (const cmd of operation.commands) {
        if (!cmd.command || typeof cmd.command !== 'string') {
          errors.push('Each bulk command must have a command string');
        }
        if (!cmd.arguments || typeof cmd.arguments !== 'object') {
          errors.push('Each bulk command must have an arguments object');
        }
      }
    }
    
    if (!['pending', 'running', 'completed', 'failed'].includes(operation.status)) {
      errors.push('Invalid operation status');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  validateHistoryEntry(entry: CommandHistoryEntry): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!entry.id || typeof entry.id !== 'string') {
      errors.push('History entry must have a valid ID');
    }
    
    if (!entry.command || typeof entry.command !== 'string') {
      errors.push('History entry must have a command');
    }
    
    if (typeof entry.timestamp !== 'number' || entry.timestamp <= 0) {
      errors.push('History entry must have a valid timestamp');
    }
    
    if (typeof entry.successful !== 'boolean') {
      errors.push('History entry must have a success status');
    }
    
    if (typeof entry.duration !== 'number' || entry.duration < 0) {
      errors.push('History entry must have a non-negative duration');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  isWithinLimits(preferences: UserPreferences): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (preferences.commandHistory.length > this.constraints.maxHistorySize) {
      errors.push(`Command history exceeds maximum size of ${this.constraints.maxHistorySize}`);
    }
    
    if (preferences.scheduledCommands.length > this.constraints.maxScheduledCommands) {
      errors.push(`Scheduled commands exceed maximum of ${this.constraints.maxScheduledCommands}`);
    }
    
    const aliasCount = Object.keys(preferences.commandAliases).length;
    if (aliasCount > 50) {
      warnings.push(`High number of aliases (${aliasCount}) may impact performance`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  isReservedCommand(command: string): boolean {
    return this.constraints.reservedCommands.includes(command.toLowerCase());
  }
  
  canAddAlias(preferences: UserPreferences, alias: string): boolean {
    return !this.isReservedCommand(alias) && !(alias in preferences.commandAliases);
  }
  
  canAddScheduledCommand(preferences: UserPreferences): boolean {
    return preferences.scheduledCommands.length < this.constraints.maxScheduledCommands;
  }
  
  canAddToHistory(preferences: UserPreferences): boolean {
    return preferences.preferences.commandHistory && 
           preferences.commandHistory.length < this.constraints.maxHistorySize;
  }
  
  migratePreferences(preferences: unknown, _fromVersion?: string): UserPreferences | null {
    try {
      // Handle v1 to v2 migration (example)
      if (this.isV1Format(preferences)) {
        return this.migrateFromV1(preferences);
      }
      
      // Current format validation
      if (this.isCurrentFormat(preferences)) {
        return preferences as UserPreferences;
      }
      
      logger.warn('Unknown preference format, cannot migrate');
      return null;
    } catch (error) {
      logger.error('Failed to migrate preferences:', error);
      return null;
    }
  }
  
  needsMigration(preferences: unknown): boolean {
    return !this.isCurrentFormat(preferences);
  }
  
  sanitizeAlias(alias: string): string {
    return alias
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, this.constraints.maxAliasLength);
  }
  
  sanitizeCommand(command: string): string {
    return command
      .trim()
      .substring(0, this.constraints.maxCommandLength);
  }
  
  sanitizePreferences(preferences: Partial<UserPreferences>): Partial<UserPreferences> {
    const sanitized = { ...preferences };
    
    // Sanitize command aliases
    if (sanitized.commandAliases) {
      const cleanAliases: Record<string, string> = {};
      for (const [alias, command] of Object.entries(sanitized.commandAliases)) {
        const cleanAlias = this.sanitizeAlias(alias);
        const cleanCommand = this.sanitizeCommand(command);
        if (cleanAlias && cleanCommand && !this.isReservedCommand(cleanAlias)) {
          cleanAliases[cleanAlias] = cleanCommand;
        }
      }
      sanitized.commandAliases = cleanAliases;
    }
    
    // Ensure arrays are present
    if (sanitized.commandHistory && !Array.isArray(sanitized.commandHistory)) {
      sanitized.commandHistory = [];
    }
    
    if (sanitized.scheduledCommands && !Array.isArray(sanitized.scheduledCommands)) {
      sanitized.scheduledCommands = [];
    }
    
    return sanitized;
  }
  
  private isValidTimezone(timezone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }
  
  private isValidLanguageCode(code: string): boolean {
    return /^[a-z]{2}(-[A-Z]{2})?$/.test(code);
  }
  
  private isV1Format(data: unknown): boolean {
    // Example v1 format check
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    return 'user_id' in obj && 'server_id' in obj && !('userId' in obj);
  }
  
  private isCurrentFormat(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    return (
      'userId' in obj &&
      'serverId' in obj &&
      'preferences' in obj &&
      'commandAliases' in obj &&
      'commandHistory' in obj &&
      'scheduledCommands' in obj
    );
  }
  
  private migrateFromV1(data: unknown): UserPreferences {
    const v1 = data as Record<string, unknown>;
    return {
      userId: String(v1.user_id),
      serverId: String(v1.server_id),
      preferences: {
        defaultPersonality: 'helpful',
        preferredResponseStyle: 'detailed',
        enableCodeExecution: false,
        enableStructuredOutput: false,
        timezone: 'UTC',
        commandHistory: true,
        autocompleteEnabled: true,
        preferredLanguage: 'en',
        maxHistorySize: 50,
        enableNotifications: true,
      },
      commandAliases: {},
      commandHistory: [],
      scheduledCommands: [],
      lastUpdated: Date.now(),
      createdAt: Date.now(),
    };
  }
}