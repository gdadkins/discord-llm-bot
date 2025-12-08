/**
 * PreferenceStore Module
 * 
 * Handles all storage operations for user preferences including:
 * - Data persistence with DataStore
 * - Caching and retrieval of preferences
 * - Preference initialization and defaults
 * - Storage-level operations
 * 
 * @module PreferenceStore
 */

import { logger } from '../../utils/logger';
import { DataStore, DataValidator } from '../../utils/DataStore';
import { dataStoreFactory } from '../../utils/DataStoreFactory';
import type {
  UserPreferences,
  CommandHistoryEntry,
  ScheduledCommand,
  UserPreferenceStorage
} from './types';

export interface IPreferenceStore {
  // Storage operations
  initialize(): Promise<void>;
  save(): Promise<void>;
  
  // Preference CRUD
  get(userId: string, serverId: string): UserPreferences | undefined;
  set(userId: string, serverId: string, preferences: UserPreferences): void;
  delete(userId: string, serverId: string): void;
  exists(userId: string, serverId: string): boolean;
  
  // Bulk operations
  getAllForUser(userId: string): Record<string, UserPreferences>;
  getAll(): UserPreferenceStorage;
  clear(): void;
  
  // History operations
  addToHistory(userId: string, serverId: string, entry: CommandHistoryEntry): void;
  clearHistory(userId: string, serverId: string): void;
  trimHistory(userId: string, serverId: string, maxSize: number): void;
  
  // Scheduled command operations
  addScheduledCommand(userId: string, serverId: string, command: ScheduledCommand): void;
  removeScheduledCommand(userId: string, serverId: string, commandId: string): boolean;
  updateScheduledCommand(userId: string, serverId: string, commandId: string, updates: Partial<ScheduledCommand>): boolean;
  
  // Statistics
  getStats(): PreferenceStoreStats;
}

export interface PreferenceStoreStats {
  totalUsers: number;
  totalPreferences: number;
  totalAliases: number;
  totalScheduledCommands: number;
  totalHistoryEntries: number;
  storageSize: number;
}

export class PreferenceStore implements IPreferenceStore {
  private preferences: UserPreferenceStorage = {};
  private readonly dataStore: DataStore<UserPreferenceStorage>;
  
  constructor(storageFile = './data/user-preferences.json') {
    // Create validator for user preference storage
    const validator: DataValidator<UserPreferenceStorage> = (data: unknown): data is UserPreferenceStorage => {
      return this.validateStorage(data);
    };
    
    // Use factory to create state store optimized for user preferences
    this.dataStore = dataStoreFactory.createStateStore<UserPreferenceStorage>(
      storageFile,
      validator
    );
  }
  
  async initialize(): Promise<void> {
    try {
      const loadedData = await this.dataStore.load();
      
      if (loadedData !== null) {
        this.preferences = loadedData;
        logger.info(`PreferenceStore initialized with ${Object.keys(this.preferences).length} user preferences`);
      } else {
        this.preferences = {};
        logger.info('PreferenceStore initialized with empty storage');
      }
    } catch (error) {
      logger.error('Failed to initialize PreferenceStore:', error);
      this.preferences = {};
      throw new Error(`Failed to load preference data: ${error}`);
    }
  }
  
  async save(): Promise<void> {
    try {
      await this.dataStore.save(this.preferences);
    } catch (error) {
      logger.error('Failed to save preference data:', error);
      throw error;
    }
  }
  
  get(userId: string, serverId: string): UserPreferences | undefined {
    const key = this.makeKey(userId, serverId);
    return this.preferences[key];
  }
  
  set(userId: string, serverId: string, preferences: UserPreferences): void {
    const key = this.makeKey(userId, serverId);
    this.preferences[key] = {
      ...preferences,
      userId,
      serverId,
      lastUpdated: Date.now()
    };
  }
  
  delete(userId: string, serverId: string): void {
    const key = this.makeKey(userId, serverId);
    delete this.preferences[key];
  }
  
  exists(userId: string, serverId: string): boolean {
    const key = this.makeKey(userId, serverId);
    return key in this.preferences;
  }
  
  getAllForUser(userId: string): Record<string, UserPreferences> {
    const userPrefs: Record<string, UserPreferences> = {};
    
    Object.entries(this.preferences).forEach(([key, prefs]) => {
      if (prefs.userId === userId) {
        userPrefs[key] = prefs;
      }
    });
    
    return userPrefs;
  }
  
  getAll(): UserPreferenceStorage {
    return { ...this.preferences };
  }
  
  clear(): void {
    this.preferences = {};
  }
  
  addToHistory(userId: string, serverId: string, entry: CommandHistoryEntry): void {
    const key = this.makeKey(userId, serverId);
    const prefs = this.preferences[key];
    
    if (!prefs) {
      return;
    }
    
    prefs.commandHistory.unshift(entry);
    prefs.lastUpdated = Date.now();
  }
  
  clearHistory(userId: string, serverId: string): void {
    const key = this.makeKey(userId, serverId);
    const prefs = this.preferences[key];
    
    if (prefs) {
      prefs.commandHistory = [];
      prefs.lastUpdated = Date.now();
    }
  }
  
  trimHistory(userId: string, serverId: string, maxSize: number): void {
    const key = this.makeKey(userId, serverId);
    const prefs = this.preferences[key];
    
    if (prefs && prefs.commandHistory.length > maxSize) {
      prefs.commandHistory = prefs.commandHistory.slice(0, maxSize);
      prefs.lastUpdated = Date.now();
    }
  }
  
  addScheduledCommand(userId: string, serverId: string, command: ScheduledCommand): void {
    const key = this.makeKey(userId, serverId);
    const prefs = this.preferences[key];
    
    if (prefs) {
      prefs.scheduledCommands.push(command);
      prefs.lastUpdated = Date.now();
    }
  }
  
  removeScheduledCommand(userId: string, serverId: string, commandId: string): boolean {
    const key = this.makeKey(userId, serverId);
    const prefs = this.preferences[key];
    
    if (!prefs) {
      return false;
    }
    
    const index = prefs.scheduledCommands.findIndex(cmd => cmd.id === commandId);
    if (index === -1) {
      return false;
    }
    
    prefs.scheduledCommands.splice(index, 1);
    prefs.lastUpdated = Date.now();
    return true;
  }
  
  updateScheduledCommand(userId: string, serverId: string, commandId: string, updates: Partial<ScheduledCommand>): boolean {
    const key = this.makeKey(userId, serverId);
    const prefs = this.preferences[key];
    
    if (!prefs) {
      return false;
    }
    
    const command = prefs.scheduledCommands.find(cmd => cmd.id === commandId);
    if (!command) {
      return false;
    }
    
    Object.assign(command, updates);
    prefs.lastUpdated = Date.now();
    return true;
  }
  
  getStats(): PreferenceStoreStats {
    const users = Object.values(this.preferences);
    
    return {
      totalUsers: new Set(users.map(u => u.userId)).size,
      totalPreferences: users.length,
      totalAliases: users.reduce((sum, user) => sum + Object.keys(user.commandAliases).length, 0),
      totalScheduledCommands: users.reduce((sum, user) => sum + user.scheduledCommands.length, 0),
      totalHistoryEntries: users.reduce((sum, user) => sum + user.commandHistory.length, 0),
      storageSize: JSON.stringify(this.preferences).length
    };
  }
  
  /**
   * Create a composite key for user-server pair
   */
  private makeKey(userId: string, serverId: string): string {
    return `${userId}-${serverId}`;
  }
  
  /**
   * Validate storage structure
   */
  private validateStorage(data: unknown): data is UserPreferenceStorage {
    if (typeof data !== 'object' || data === null) {
      return false;
    }
    
    const storage = data as Record<string, unknown>;
    
    // Check that all values are UserPreferences objects
    for (const value of Object.values(storage)) {
      if (!this.validatePreferences(value)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Validate individual preference object
   */
  private validatePreferences(value: unknown): value is UserPreferences {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    
    const prefs = value as Record<string, unknown>;
    
    return (
      typeof prefs.userId === 'string' &&
      typeof prefs.serverId === 'string' &&
      typeof prefs.preferences === 'object' &&
      prefs.preferences !== null &&
      Array.isArray(prefs.commandHistory) &&
      Array.isArray(prefs.scheduledCommands) &&
      typeof prefs.lastUpdated === 'number' &&
      typeof prefs.createdAt === 'number'
    );
  }
  
  /**
   * Create default preferences
   */
  static createDefaultPreferences(userId: string, serverId: string): UserPreferences {
    return {
      userId,
      serverId,
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