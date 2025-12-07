/**
 * Shared Types for User Preference Management
 * 
 * Common interfaces and types used across preference modules
 */

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

export interface UserPreferenceStorage {
  [userServerId: string]: UserPreferences;
}