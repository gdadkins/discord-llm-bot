/**
 * UserPreferenceManager Module
 * 
 * Main preference management API that coordinates between storage and validation.
 * Provides a simplified interface for preference operations while maintaining
 * backward compatibility with the existing system.
 * 
 * @module UserPreferenceManager
 */

import { logger } from '../../utils/logger';
import { MutexManager, createMutexManager } from '../../utils/MutexManager';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import type { UserPreferences as IUserPreferences, IUserPreferenceService } from '../interfaces/UserPreferenceInterfaces';
import { PreferenceStore } from './PreferenceStore';
import { PreferenceValidator } from './PreferenceValidator';
import type {
  UserPreferences,
  CommandHistoryEntry,
  ScheduledCommand,
  BulkOperation
} from './types';

export class UserPreferenceManager implements IUserPreferenceService {
  private mutexManager: MutexManager;
  private store: PreferenceStore;
  private validator: PreferenceValidator;
  private scheduledCommandTimers = new Map<string, NodeJS.Timeout>();
  private bulkOperations = new Map<string, BulkOperation>();
  private readonly maxBulkOperations = 10;

  constructor(storageFile = './data/user-preferences.json') {
    // Initialize mutex manager with monitoring
    this.mutexManager = createMutexManager('UserPreferenceManager', {
      enableDeadlockDetection: true,
      enableStatistics: true
    });
    
    // Initialize storage and validator
    this.store = new PreferenceStore(storageFile);
    this.validator = new PreferenceValidator();
  }

  async initialize(): Promise<void> {
    try {
      await this.store.initialize();
      this.scheduleAllCommands();
      logger.info('UserPreferenceManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize UserPreferenceManager:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Clear all scheduled command timers
    for (const [id, timer] of this.scheduledCommandTimers) {
      clearTimeout(timer);
      logger.debug(`Cleared scheduled command timer: ${id}`);
    }
    this.scheduledCommandTimers.clear();
    
    // Cancel all running bulk operations
    for (const [, operation] of this.bulkOperations) {
      if (operation.status === 'running') {
        operation.status = 'failed';
        operation.results.push({ success: false, error: 'System shutdown' });
      }
    }
    this.bulkOperations.clear();
    
    await this.store.save();
    logger.info('UserPreferenceManager shutdown completed');
  }

  // User Preference Management
  async getUserPreferencesForServer(userId: string, serverId: string): Promise<UserPreferences> {
    const existing = this.store.get(userId, serverId);
    
    if (existing) {
      return { ...existing };
    }

    // Create default preferences
    const defaultPrefs = PreferenceStore.createDefaultPreferences(userId, serverId);
    await this.setUserPreferencesForServer(userId, serverId, defaultPrefs);
    return defaultPrefs;
  }

  async setUserPreferencesForServer(userId: string, serverId: string, preferences: Partial<UserPreferences>): Promise<void> {
    return this.mutexManager.withMutex(async () => {
      const existing = this.store.get(userId, serverId) || 
                      await this.getUserPreferencesForServer(userId, serverId);
      
      // Merge and validate preferences
      const merged = {
        ...existing,
        ...preferences,
        userId,
        serverId,
        lastUpdated: Date.now(),
      };
      
      const validation = this.validator.validatePreferences(merged);
      if (!validation.valid) {
        throw new Error(`Invalid preferences: ${validation.errors.join(', ')}`);
      }
      
      if (validation.warnings.length > 0) {
        logger.warn(`Preference warnings: ${validation.warnings.join(', ')}`);
      }
      
      this.store.set(userId, serverId, merged);
      await this.store.save();
      logger.info(`Updated preferences for user ${userId} in server ${serverId}`);
    }, { operationName: 'setUserPreferences', timeout: 15000 });
  }

  async updatePreference(userId: string, serverId: string, key: keyof UserPreferences['preferences'], value: unknown): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const existing = this.store.get(userId, serverId) || 
                      await this.getUserPreferencesForServer(userId, serverId);
      
      if (key in existing.preferences) {
        (existing.preferences as Record<string, unknown>)[key] = value;
        existing.lastUpdated = Date.now();
        
        const validation = this.validator.validatePreferences(existing);
        if (!validation.valid) {
          logger.error(`Invalid preference update: ${validation.errors.join(', ')}`);
          return false;
        }
        
        this.store.set(userId, serverId, existing);
        await this.store.save();
        return true;
      }
      return false;
    }, { operationName: 'updatePreference', timeout: 15000 });
  }

  // Command Alias Management
  async setCommandAlias(userId: string, serverId: string, alias: string, command: string): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const existing = this.store.get(userId, serverId) || 
                      await this.getUserPreferencesForServer(userId, serverId);
      
      // Validate alias
      const validation = this.validator.validateAlias(alias, command);
      if (!validation.valid) {
        logger.error(`Invalid alias: ${validation.errors.join(', ')}`);
        return false;
      }
      
      if (!this.validator.canAddAlias(existing, alias)) {
        return false;
      }

      existing.commandAliases[alias] = command;
      existing.lastUpdated = Date.now();
      this.store.set(userId, serverId, existing);
      await this.store.save();
      
      logger.info(`Set alias '${alias}' -> '${command}' for user ${userId} in server ${serverId}`);
      return true;
    }, { operationName: 'setCommandAlias', timeout: 15000 });
  }

  async removeCommandAlias(userId: string, serverId: string, alias: string): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const existing = this.store.get(userId, serverId);
      
      if (!existing || !existing.commandAliases[alias]) {
        return false;
      }

      delete existing.commandAliases[alias];
      existing.lastUpdated = Date.now();
      this.store.set(userId, serverId, existing);
      await this.store.save();
      
      logger.info(`Removed alias '${alias}' for user ${userId} in server ${serverId}`);
      return true;
    }, { operationName: 'removeCommandAlias', timeout: 15000 });
  }

  resolveCommandAlias(userId: string, serverId: string, input: string): string {
    const preferences = this.store.get(userId, serverId);
    
    if (!preferences) {
      return input;
    }

    const parts = input.split(' ');
    const firstPart = parts[0];
    
    if (preferences.commandAliases[firstPart]) {
      parts[0] = preferences.commandAliases[firstPart];
      return parts.join(' ');
    }
    
    return input;
  }

  // Command History Management
  async addToCommandHistory(userId: string, serverId: string, entry: Omit<CommandHistoryEntry, 'id'>): Promise<void> {
    const preferences = this.store.get(userId, serverId);
    if (!preferences?.preferences.commandHistory) {
      return;
    }

    return this.mutexManager.withMutex(async () => {
      const historyEntry: CommandHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...entry,
      };
      
      const validation = this.validator.validateHistoryEntry(historyEntry);
      if (!validation.valid) {
        logger.error(`Invalid history entry: ${validation.errors.join(', ')}`);
        return;
      }

      this.store.addToHistory(userId, serverId, historyEntry);
      
      // Trim history to max size
      const prefs = this.store.get(userId, serverId);
      if (prefs) {
        const maxSize = prefs.preferences.maxHistorySize;
        this.store.trimHistory(userId, serverId, maxSize);
      }

      await this.store.save();
    }, { operationName: 'addToCommandHistory', timeout: 15000 });
  }

  async getCommandHistory(userId: string, serverId: string, limit?: number): Promise<CommandHistoryEntry[]> {
    const preferences = this.store.get(userId, serverId);
    
    if (!preferences || !preferences.preferences.commandHistory) {
      return [];
    }

    const history = preferences.commandHistory || [];
    return limit ? history.slice(0, limit) : history;
  }

  async clearCommandHistory(userId: string, serverId: string): Promise<void> {
    return this.mutexManager.withMutex(async () => {
      this.store.clearHistory(userId, serverId);
      await this.store.save();
    }, { operationName: 'clearCommandHistory', timeout: 15000 });
  }

  // Scheduled Command Management
  async scheduleCommand(userId: string, serverId: string, command: ScheduledCommand): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const existing = this.store.get(userId, serverId) || 
                      await this.getUserPreferencesForServer(userId, serverId);
      
      if (!this.validator.canAddScheduledCommand(existing)) {
        return false;
      }
      
      const validation = this.validator.validateScheduledCommand(command);
      if (!validation.valid) {
        logger.error(`Invalid scheduled command: ${validation.errors.join(', ')}`);
        return false;
      }

      this.store.addScheduledCommand(userId, serverId, command);
      await this.store.save();
      
      this.scheduleCommandExecution(command);
      logger.info(`Scheduled command '${command.command}' for user ${userId} in server ${serverId}`);
      return true;
    }, { operationName: 'scheduleCommand', timeout: 15000 });
  }

  async removeScheduledCommand(userId: string, serverId: string, commandId: string): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const removed = this.store.removeScheduledCommand(userId, serverId, commandId);
      
      if (removed) {
        await this.store.save();
        
        // Clear the timer if it exists
        const timer = this.scheduledCommandTimers.get(commandId);
        if (timer) {
          clearTimeout(timer);
          this.scheduledCommandTimers.delete(commandId);
        }
        
        logger.info(`Removed scheduled command ${commandId} for user ${userId} in server ${serverId}`);
      }
      
      return removed;
    }, { operationName: 'removeScheduledCommand', timeout: 15000 });
  }

  getScheduledCommands(userId: string, serverId: string): ScheduledCommand[] {
    const preferences = this.store.get(userId, serverId);
    return preferences?.scheduledCommands || [];
  }

  // Bulk Operations Management
  async createBulkOperation(userId: string, serverId: string, commands: Array<{command: string, arguments: Record<string, unknown>}>): Promise<string> {
    if (this.bulkOperations.size >= this.maxBulkOperations) {
      throw new Error('Maximum bulk operations limit reached');
    }

    const operationId = `bulk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const bulkOp: BulkOperation = {
      id: operationId,
      commands,
      status: 'pending',
      createdAt: Date.now(),
      results: [],
    };
    
    const validation = this.validator.validateBulkOperation(bulkOp);
    if (!validation.valid) {
      throw new Error(`Invalid bulk operation: ${validation.errors.join(', ')}`);
    }

    this.bulkOperations.set(operationId, bulkOp);
    logger.info(`Created bulk operation ${operationId} with ${commands.length} commands for user ${userId}`);
    
    return operationId;
  }

  getBulkOperation(operationId: string): BulkOperation | undefined {
    return this.bulkOperations.get(operationId);
  }

  async executeBulkOperation(operationId: string, executor: (command: string, args: Record<string, unknown>) => Promise<unknown>): Promise<void> {
    const operation = this.bulkOperations.get(operationId);
    if (!operation || operation.status !== 'pending') {
      return;
    }

    operation.status = 'running';
    operation.startedAt = Date.now();
    operation.results = [];

    try {
      for (let i = 0; i < operation.commands.length; i++) {
        const { command, arguments: args } = operation.commands[i];
        
        try {
          const result = await executor(command, args);
          operation.results.push({ success: true, result });
        } catch (error) {
          operation.results.push({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }

        // Update progress
        if (operation.progressCallback) {
          operation.progressCallback(i + 1, operation.commands.length);
        }
      }

      operation.status = 'completed';
      operation.completedAt = Date.now();
      logger.info(`Bulk operation ${operationId} completed successfully`);
    } catch (error) {
      operation.status = 'failed';
      operation.completedAt = Date.now();
      logger.error(`Bulk operation ${operationId} failed:`, error);
    }
  }

  removeBulkOperation(operationId: string): void {
    this.bulkOperations.delete(operationId);
  }

  // Autocomplete Support
  getCommandSuggestions(userId: string, serverId: string, input: string, availableCommands: string[]): string[] {
    const preferences = this.store.get(userId, serverId);
    
    if (!preferences?.preferences.autocompleteEnabled) {
      return [];
    }

    const suggestions: string[] = [];
    const lowercaseInput = input.toLowerCase();

    // Add command aliases that match
    Object.keys(preferences.commandAliases).forEach(alias => {
      if (alias.toLowerCase().startsWith(lowercaseInput)) {
        suggestions.push(alias);
      }
    });

    // Add recent commands from history
    const recentCommands = preferences.commandHistory
      .slice(0, 10)
      .map(entry => entry.command)
      .filter(cmd => cmd.toLowerCase().startsWith(lowercaseInput));
    
    suggestions.push(...recentCommands);

    // Add available commands
    const matchingCommands = availableCommands
      .filter(cmd => cmd.toLowerCase().startsWith(lowercaseInput));
    
    suggestions.push(...matchingCommands);

    // Remove duplicates and limit results
    return Array.from(new Set(suggestions)).slice(0, 10);
  }

  // Utility Methods
  private scheduleCommandExecution(command: ScheduledCommand): void {
    if (!command.enabled || command.nextExecution <= Date.now()) {
      return;
    }

    const delay = command.nextExecution - Date.now();
    const timer = setTimeout(() => {
      this.executeScheduledCommand(command);
    }, delay);

    this.scheduledCommandTimers.set(command.id, timer);
  }

  private scheduleAllCommands(): void {
    const allPreferences = this.store.getAll();
    Object.values(allPreferences).forEach(userPrefs => {
      userPrefs.scheduledCommands.forEach(cmd => {
        if (cmd.enabled && cmd.nextExecution > Date.now()) {
          this.scheduleCommandExecution(cmd);
        }
      });
    });
  }

  private async executeScheduledCommand(command: ScheduledCommand): Promise<void> {
    // This would need to be implemented with a callback to the main bot
    logger.info(`Executing scheduled command: ${command.command}`);
    
    // Update last executed time
    command.lastExecuted = Date.now();
    
    // Schedule next execution if recurring
    if (command.recurring) {
      command.nextExecution = this.calculateNextExecution(command);
      this.scheduleCommandExecution(command);
    } else {
      command.enabled = false;
    }

    await this.store.save();
  }

  private calculateNextExecution(command: ScheduledCommand): number {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY; // Approximate

    switch (command.recurring) {
    case 'daily':
      return now + DAY;
    case 'weekly':
      return now + WEEK;
    case 'monthly':
      return now + MONTH;
    default:
      return now;
    }
  }

  // Interface Compliance Methods for IUserPreferenceService
  
  /**
   * Interface-compliant getUserPreferences (without serverId parameter)
   */
  getUserPreferences(userId: string): IUserPreferences {
    // Find any existing preference for this user across all servers
    const userPrefs = this.store.getAllForUser(userId);
    const userKeys = Object.keys(userPrefs);
    
    if (userKeys.length > 0) {
      const existing = userPrefs[userKeys[0]];
      // Convert internal format to interface format
      return {
        userId: existing.userId,
        language: existing.preferences.preferredLanguage,
        timezone: existing.preferences.timezone,
        notifications: {
          mentions: existing.preferences.enableNotifications,
          updates: existing.preferences.enableNotifications,
          reminders: existing.preferences.enableNotifications
        },
        privacy: {
          shareData: false, // Default to private
          publicProfile: false
        },
        features: {
          roasting: existing.preferences.defaultPersonality === 'roasting',
          contextMemory: existing.preferences.commandHistory,
          personalityPersistence: true
        },
        lastUpdated: existing.lastUpdated
      };
    }
    
    // Return default preferences
    return {
      userId,
      language: 'en',
      timezone: 'UTC',
      notifications: {
        mentions: true,
        updates: true,
        reminders: true
      },
      privacy: {
        shareData: false,
        publicProfile: false
      },
      features: {
        roasting: false,
        contextMemory: true,
        personalityPersistence: true
      },
      lastUpdated: Date.now()
    };
  }

  /**
   * Interface-compliant updateUserPreferences
   */
  async updateUserPreferences(userId: string, preferences: Partial<IUserPreferences>): Promise<void> {
    // Find existing preference entry for this user (any server)
    const userPrefs = this.store.getAllForUser(userId);
    const userKeys = Object.keys(userPrefs);
    const serverId = userKeys.length > 0 ? userKeys[0].split('-')[1] : 'default';
    
    return this.mutexManager.withMutex(async () => {
      const existing = this.store.get(userId, serverId) || 
                      await this.getUserPreferencesForServer(userId, serverId);
      
      // Convert interface format to internal format
      const updatedPrefs: Partial<UserPreferences> = {
        userId,
        serverId,
        lastUpdated: Date.now()
      };
      
      if (preferences.language) {
        updatedPrefs.preferences = { 
          ...existing.preferences, 
          preferredLanguage: preferences.language 
        };
      }
      
      if (preferences.timezone) {
        updatedPrefs.preferences = { 
          ...updatedPrefs.preferences || existing.preferences, 
          timezone: preferences.timezone 
        };
      }
      
      if (preferences.notifications) {
        updatedPrefs.preferences = { 
          ...updatedPrefs.preferences || existing.preferences, 
          enableNotifications: preferences.notifications.mentions 
        };
      }
      
      if (preferences.features) {
        updatedPrefs.preferences = { 
          ...updatedPrefs.preferences || existing.preferences,
          defaultPersonality: preferences.features.roasting ? 'roasting' : 'helpful',
          commandHistory: preferences.features.contextMemory ?? existing.preferences.commandHistory
        };
      }
      
      const merged = {
        ...existing,
        ...updatedPrefs
      };
      
      this.store.set(userId, serverId, merged);
      await this.store.save();
    }, { operationName: 'updateUserPreferences', timeout: 15000 });
  }

  /**
   * Export user preferences as JSON string
   */
  async exportUserPreferences(userId: string): Promise<string> {
    const userPrefs = this.store.getAllForUser(userId);
    
    return JSON.stringify({
      userId,
      exportedAt: new Date().toISOString(),
      version: '1.0',
      data: userPrefs
    }, null, 2);
  }

  /**
   * Import user preferences from JSON string
   */
  async importUserPreferences(userId: string, data: string): Promise<void> {
    try {
      const importData = JSON.parse(data);
      
      if (!importData.data || typeof importData.data !== 'object') {
        throw new Error('Invalid import data format');
      }
      
      return this.mutexManager.withMutex(async () => {
        // Validate that all imported data belongs to the specified user
        for (const [key, prefs] of Object.entries(importData.data)) {
          const prefData = prefs as UserPreferences;
          if (prefData.userId !== userId) {
            throw new Error(`Import data contains preferences for different user: ${prefData.userId}`);
          }
          
          // Validate preferences before importing
          const validation = this.validator.validatePreferences(prefData);
          if (!validation.valid) {
            throw new Error(`Invalid preferences in import: ${validation.errors.join(', ')}`);
          }
          
          const [uid, sid] = key.split('-');
          this.store.set(uid, sid, prefData);
        }
        
        await this.store.save();
        logger.info(`Imported preferences for user ${userId} from backup`);
      }, { operationName: 'importUserPreferences', timeout: 15000 });
    } catch (error) {
      logger.error(`Failed to import preferences for user ${userId}:`, error);
      throw new Error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete all preferences for a user
   */
  async deleteUserPreferences(userId: string): Promise<void> {
    return this.mutexManager.withMutex(async () => {
      const userPrefs = this.store.getAllForUser(userId);
      
      Object.keys(userPrefs).forEach(key => {
        const [uid, sid] = key.split('-');
        this.store.delete(uid, sid);
      });
      
      await this.store.save();
      logger.info(`Deleted all preferences for user ${userId}`);
    }, { operationName: 'deleteUserPreferences', timeout: 15000 });
  }

  /**
   * Interface compliance - IService.getHealthStatus()
   */
  getHealthStatus(): ServiceHealthStatus {
    const errors: string[] = [];
    const metrics: Record<string, unknown> = {};
    
    // Check if store is initialized
    if (!this.store) {
      errors.push('PreferenceStore not initialized');
    }
    
    // Check if validator is initialized
    if (!this.validator) {
      errors.push('PreferenceValidator not initialized');
    }
    
    // Check if mutex manager is working
    if (!this.mutexManager) {
      errors.push('MutexManager not initialized');
    }
    
    // Check bulk operations
    if (this.bulkOperations.size >= this.maxBulkOperations) {
      errors.push(`Bulk operations at capacity: ${this.bulkOperations.size}/${this.maxBulkOperations}`);
    }
    
    // Add metrics
    const stats = this.store.getStats();
    metrics.userCount = stats.totalUsers;
    metrics.preferenceCount = stats.totalPreferences;
    metrics.aliasCount = stats.totalAliases;
    metrics.scheduledCommandCount = stats.totalScheduledCommands;
    metrics.historyEntryCount = stats.totalHistoryEntries;
    metrics.storageSize = stats.storageSize;
    metrics.bulkOperations = this.bulkOperations.size;
    metrics.maxBulkOperations = this.maxBulkOperations;
    metrics.activeScheduledCommands = this.scheduledCommandTimers.size;
    
    return {
      healthy: errors.length === 0,
      name: 'UserPreferenceManager',
      errors,
      metrics
    };
  }
}