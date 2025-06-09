import { logger } from '../utils/logger';
import { DataStore, DataValidator } from '../utils/DataStore';
import { dataStoreFactory } from '../utils/DataStoreFactory';
import { MutexManager, createMutexManager } from '../utils/MutexManager';

export interface UserPreferences {
  userId: string;
  serverId: string;
  preferences: {
    defaultPersonality: 'roasting' | 'helpful';
    preferredResponseStyle: 'concise' | 'detailed' | 'technical';
    enableCodeExecution: boolean;
    enableStructuredOutput: boolean;
    timezone: string;
    commandHistory: boolean;
    autocompleteEnabled: boolean;
    preferredLanguage: string;
    maxHistorySize: number;
    enableNotifications: boolean;
  };
  commandAliases: { [alias: string]: string };
  commandHistory: CommandHistoryEntry[];
  scheduledCommands: ScheduledCommand[];
  lastUpdated: number;
  createdAt: number;
}

export interface CommandHistoryEntry {
  id: string;
  command: string;
  arguments: { [key: string]: unknown };
  timestamp: number;
  successful: boolean;
  duration: number;
  errorMessage?: string;
}

export interface ScheduledCommand {
  id: string;
  command: string;
  arguments: { [key: string]: unknown };
  scheduledTime: number;
  recurring?: 'daily' | 'weekly' | 'monthly';
  enabled: boolean;
  createdAt: number;
  lastExecuted?: number;
  nextExecution: number;
}

export interface BulkOperation {
  id: string;
  commands: Array<{
    command: string;
    arguments: { [key: string]: unknown };
  }>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  results: Array<{
    success: boolean;
    result?: unknown;
    error?: string;
  }>;
  progressCallback?: (progress: number, total: number) => void;
}

interface UserPreferenceStorage {
  [userServerId: string]: UserPreferences;
}

export class UserPreferenceManager {
  private mutexManager: MutexManager;
  private preferences: UserPreferenceStorage = {};
  private scheduledCommandTimers = new Map<string, NodeJS.Timeout>();
  private bulkOperations = new Map<string, BulkOperation>();
  private readonly dataStore: DataStore<UserPreferenceStorage>;
  private readonly maxHistorySize = 100;
  private readonly maxScheduledCommands = 50;
  private readonly maxBulkOperations = 10;

  constructor(storageFile = './data/user-preferences.json') {
    // Initialize mutex manager with monitoring
    this.mutexManager = createMutexManager('UserPreferenceManager', {
      enableDeadlockDetection: true,
      enableStatistics: true
    });
    
    // Create validator for user preference storage
    const userPreferenceValidator: DataValidator<UserPreferenceStorage> = (data: unknown): data is UserPreferenceStorage => {
      return this.validateUserPreferenceStorage(data);
    };
    
    // Use factory to create state store optimized for user preferences
    this.dataStore = dataStoreFactory.createStateStore<UserPreferenceStorage>(
      storageFile,
      userPreferenceValidator
    );
  }

  async initialize(): Promise<void> {
    try {
      await this.loadPreferences();
      this.scheduleAllCommands();
      logger.info('UserPreferenceManager initialized with existing data');
    } catch (error) {
      logger.info('No existing preference data found, starting fresh');
      this.preferences = {};
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
    
    await this.savePreferences();
    logger.info('UserPreferenceManager shutdown completed');
  }

  // User Preference Management
  async getUserPreferences(userId: string, serverId: string): Promise<UserPreferences> {
    const key = `${userId}-${serverId}`;
    const existing = this.preferences[key];
    
    if (existing) {
      return { ...existing };
    }

    // Create default preferences
    const defaultPrefs: UserPreferences = {
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

    await this.setUserPreferences(userId, serverId, defaultPrefs);
    return defaultPrefs;
  }

  async setUserPreferences(userId: string, serverId: string, preferences: Partial<UserPreferences>): Promise<void> {
    return this.mutexManager.withMutex(async () => {
      const key = `${userId}-${serverId}`;
      const existing = this.preferences[key] || await this.getUserPreferences(userId, serverId);
      
      this.preferences[key] = {
        ...existing,
        ...preferences,
        userId,
        serverId,
        lastUpdated: Date.now(),
      };

      await this.savePreferences();
      logger.info(`Updated preferences for user ${userId} in server ${serverId}`);
    }, { operationName: 'setUserPreferences', timeout: 15000 });
  }

  async updatePreference(userId: string, serverId: string, key: keyof UserPreferences['preferences'], value: unknown): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const userKey = `${userId}-${serverId}`;
      const existing = this.preferences[userKey] || await this.getUserPreferences(userId, serverId);
      
      if (key in existing.preferences) {
        (existing.preferences as Record<string, unknown>)[key] = value;
        existing.lastUpdated = Date.now();
        this.preferences[userKey] = existing;
        await this.savePreferences();
        return true;
      }
      return false;
    }, { operationName: 'updatePreference', timeout: 15000 });
  }

  // Command Alias Management
  async setCommandAlias(userId: string, serverId: string, alias: string, command: string): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const key = `${userId}-${serverId}`;
      const existing = this.preferences[key] || await this.getUserPreferences(userId, serverId);
      
      // Validate alias doesn't conflict with existing commands
      if (this.isReservedCommand(alias)) {
        return false;
      }

      existing.commandAliases[alias] = command;
      existing.lastUpdated = Date.now();
      this.preferences[key] = existing;
      await this.savePreferences();
      
      logger.info(`Set alias '${alias}' -> '${command}' for user ${userId} in server ${serverId}`);
      return true;
    }, { operationName: 'setCommandAlias', timeout: 15000 });
  }

  async removeCommandAlias(userId: string, serverId: string, alias: string): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const key = `${userId}-${serverId}`;
      const existing = this.preferences[key];
      
      if (!existing || !existing.commandAliases[alias]) {
        return false;
      }

      delete existing.commandAliases[alias];
      existing.lastUpdated = Date.now();
      await this.savePreferences();
      
      logger.info(`Removed alias '${alias}' for user ${userId} in server ${serverId}`);
      return true;
    }, { operationName: 'removeCommandAlias', timeout: 15000 });
  }

  resolveCommandAlias(userId: string, serverId: string, input: string): string {
    const key = `${userId}-${serverId}`;
    const preferences = this.preferences[key];
    
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
    if (!await this.isHistoryEnabled(userId, serverId)) {
      return;
    }

    return this.mutexManager.withMutex(async () => {
      const key = `${userId}-${serverId}`;
      const existing = this.preferences[key] || await this.getUserPreferences(userId, serverId);
      
      const historyEntry: CommandHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...entry,
      };

      existing.commandHistory.unshift(historyEntry);
      
      // Trim history to max size
      const maxSize = existing.preferences.maxHistorySize || this.maxHistorySize;
      if (existing.commandHistory.length > maxSize) {
        existing.commandHistory = existing.commandHistory.slice(0, maxSize);
      }

      existing.lastUpdated = Date.now();
      this.preferences[key] = existing;
      await this.savePreferences();
    }, { operationName: 'addToCommandHistory', timeout: 15000 });
  }

  async getCommandHistory(userId: string, serverId: string, limit?: number): Promise<CommandHistoryEntry[]> {
    const key = `${userId}-${serverId}`;
    const preferences = this.preferences[key];
    
    if (!preferences || !preferences.preferences.commandHistory) {
      return [];
    }

    const history = preferences.commandHistory || [];
    return limit ? history.slice(0, limit) : history;
  }

  async clearCommandHistory(userId: string, serverId: string): Promise<void> {
    return this.mutexManager.withMutex(async () => {
      const key = `${userId}-${serverId}`;
      const existing = this.preferences[key];
      
      if (existing) {
        existing.commandHistory = [];
        existing.lastUpdated = Date.now();
        await this.savePreferences();
      }
    }, { operationName: 'clearCommandHistory', timeout: 15000 });
  }

  // Scheduled Command Management
  async scheduleCommand(userId: string, serverId: string, command: ScheduledCommand): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const key = `${userId}-${serverId}`;
      const existing = this.preferences[key] || await this.getUserPreferences(userId, serverId);
      
      if (existing.scheduledCommands.length >= this.maxScheduledCommands) {
        return false;
      }

      existing.scheduledCommands.push(command);
      existing.lastUpdated = Date.now();
      this.preferences[key] = existing;
      await this.savePreferences();
      
      this.scheduleCommandExecution(command);
      logger.info(`Scheduled command '${command.command}' for user ${userId} in server ${serverId}`);
      return true;
    }, { operationName: 'scheduleCommand', timeout: 15000 });
  }

  async removeScheduledCommand(userId: string, serverId: string, commandId: string): Promise<boolean> {
    return this.mutexManager.withMutex(async () => {
      const key = `${userId}-${serverId}`;
      const existing = this.preferences[key];
      
      if (!existing) {
        return false;
      }

      const index = existing.scheduledCommands.findIndex(cmd => cmd.id === commandId);
      if (index === -1) {
        return false;
      }

      existing.scheduledCommands.splice(index, 1);
      existing.lastUpdated = Date.now();
      await this.savePreferences();
      
      // Clear the timer if it exists
      const timer = this.scheduledCommandTimers.get(commandId);
      if (timer) {
        clearTimeout(timer);
        this.scheduledCommandTimers.delete(commandId);
      }
      
      logger.info(`Removed scheduled command ${commandId} for user ${userId} in server ${serverId}`);
      return true;
    }, { operationName: 'removeScheduledCommand', timeout: 15000 });
  }

  getScheduledCommands(userId: string, serverId: string): ScheduledCommand[] {
    const key = `${userId}-${serverId}`;
    const preferences = this.preferences[key];
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
    const key = `${userId}-${serverId}`;
    const preferences = this.preferences[key];
    
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
  private async isHistoryEnabled(userId: string, serverId: string): Promise<boolean> {
    const preferences = await this.getUserPreferences(userId, serverId);
    return preferences.preferences.commandHistory;
  }

  private isReservedCommand(command: string): boolean {
    const reservedCommands = [
      'chat', 'status', 'health', 'clear', 'remember', 'addgag',
      'setpersonality', 'mypersonality', 'getpersonality', 'removepersonality',
      'clearpersonality', 'execute', 'recover', 'contextstats', 'summarize',
      'deduplicate', 'crossserver', 'config', 'reload', 'validate',
      'preferences', 'alias', 'history', 'schedule', 'bulk', 'help'
    ];
    return reservedCommands.includes(command.toLowerCase());
  }

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
    Object.values(this.preferences).forEach(userPrefs => {
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

    await this.savePreferences();
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

  // Storage Methods
  private async savePreferences(): Promise<void> {
    try {
      await this.dataStore.save(this.preferences);
    } catch (error) {
      logger.error('Failed to save user preference data:', error);
      throw error;
    }
  }

  private async loadPreferences(): Promise<void> {
    try {
      const loadedData = await this.dataStore.load();
      
      if (loadedData !== null) {
        this.preferences = loadedData;
      } else {
        this.preferences = {};
      }
    } catch (error) {
      throw new Error(`Failed to load user preference data: ${error}`);
    }
  }

  /**
   * Validate user preference storage structure
   * @param data - Data to validate
   * @returns true if data is valid UserPreferenceStorage
   */
  private validateUserPreferenceStorage(data: unknown): data is UserPreferenceStorage {
    if (typeof data !== 'object' || data === null) {
      return false;
    }
    
    // Basic validation - could be extended for more thorough checks
    const storage = data as Record<string, unknown>;
    
    // Check that all values are UserPreferences objects
    for (const value of Object.values(storage)) {
      if (typeof value !== 'object' || value === null) {
        return false;
      }
      
      const prefs = value as Record<string, unknown>;
      if (typeof prefs.userId !== 'string' || 
          typeof prefs.serverId !== 'string' ||
          typeof prefs.preferences !== 'object' ||
          !Array.isArray(prefs.commandHistory) ||
          !Array.isArray(prefs.scheduledCommands)) {
        return false;
      }
    }
    
    return true;
  }

  // Statistics
  getPreferenceStats(): {
    totalUsers: number;
    totalAliases: number;
    totalScheduledCommands: number;
    historyEnabledUsers: number;
    autocompleteEnabledUsers: number;
    } {
    const users = Object.values(this.preferences);
    
    return {
      totalUsers: users.length,
      totalAliases: users.reduce((sum, user) => sum + Object.keys(user.commandAliases).length, 0),
      totalScheduledCommands: users.reduce((sum, user) => sum + user.scheduledCommands.length, 0),
      historyEnabledUsers: users.filter(user => user.preferences.commandHistory).length,
      autocompleteEnabledUsers: users.filter(user => user.preferences.autocompleteEnabled).length,
    };
  }
}