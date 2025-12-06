/**
 * Configuration Service Interface Definitions
 * 
 * Interfaces for configuration management, validation, and versioning.
 */

import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Configuration Service Interfaces
// ============================================================================

export interface IConfigurationService extends IService {
  /**
   * Configuration validation
   */
  validateConfiguration(config: BotConfiguration): { valid: boolean; errors?: string[] };
  
  /**
   * Configuration management
   */
  reloadConfiguration(source?: 'file-watcher' | 'command' | 'api', reason?: string): Promise<void>;
  saveConfiguration(modifiedBy: string, reason?: string): Promise<void>;
  
  /**
   * Version management
   */
  getVersionHistory(): Promise<ConfigurationVersion[]>;
  rollbackToVersion(version: string, modifiedBy: string, reason?: string): Promise<void>;
  
  /**
   * Audit logging
   */
  getAuditLog(limit?: number): Promise<ConfigurationChange[]>;
  
  /**
   * Configuration getters
   */
  getDiscordConfig(): DiscordConfig;
  getGeminiConfig(): GeminiConfig;
  getRateLimitingConfig(): RateLimitingConfig;
  getFeatureConfig(): FeatureConfig;
  getRoastingConfig(): RoastingConfig;
  getMonitoringConfig(): MonitoringConfig;
  getConfiguration(): BotConfiguration;
  
  /**
   * Configuration updates
   */
  updateConfiguration(updates: Partial<BotConfiguration>, modifiedBy: string, reason?: string): Promise<void>;
  updateConfigurationSection(
    section: keyof BotConfiguration,
    updates: Record<string, unknown>,
    modifiedBy: string,
    reason?: string
  ): Promise<void>;
  
  /**
   * Import/Export
   */
  exportConfiguration(format?: 'json' | 'yaml'): Promise<string>;
  importConfiguration(configData: string, format?: 'json' | 'yaml', modifiedBy?: string, reason?: string): Promise<void>;
  
  /**
   * Event handling
   */
  on(event: 'config:changed', listener: (changes: ConfigurationChange[]) => void): this;
  on(event: 'config:validated', listener: (valid: boolean, errors?: string[]) => void): this;
  on(event: 'config:reloaded', listener: (version: string) => void): this;
  on(event: 'config:error', listener: (error: Error) => void): this;
  on(event: 'config:rollback', listener: (fromVersion: string, toVersion: string) => void): this;
  on(event: string | symbol, listener: (...args: unknown[]) => void): this;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface BotConfiguration {
  version: string;
  lastModified: string;
  modifiedBy: string;
  discord: DiscordConfig;
  gemini: GeminiConfig;
  rateLimiting: RateLimitingConfig;
  features: FeatureConfig;
}

// Video configuration interface
export interface VideoConfiguration {
  videoSupportEnabled: boolean;
  maxVideoDurationSeconds: number;
  videoTokenWarningThreshold: number;
  youtubeUrlSupportEnabled: boolean;
  videoFileSizeLimitMB: number;
  requireVideoConfirmation: boolean;
  videoProcessingTimeoutSeconds: number;
  supportedVideoFormats: readonly string[];
}

export interface DiscordConfig {
  intents: string[];
  permissions: {
    [guildId: string]: {
      adminRoles: string[];
      moderatorRoles: string[];
      allowedChannels?: string[];
    };
  };
  commands: {
    [commandName: string]: {
      enabled: boolean;
      permissions: 'all' | 'admin' | 'moderator';
      cooldown?: number;
      usage?: string;
    };
  };
}

export interface GeminiConfig {
  model: string;
  temperature: number;
  topK: number;
  topP: number;
  maxTokens: number;
  safetySettings: {
    harassment: 'block_none' | 'block_low_and_above' | 'block_medium_and_above' | 'block_high';
    hateSpeech: 'block_none' | 'block_low_and_above' | 'block_medium_and_above' | 'block_high';
    sexuallyExplicit: 'block_none' | 'block_low_and_above' | 'block_medium_and_above' | 'block_high';
    dangerousContent: 'block_none' | 'block_low_and_above' | 'block_medium_and_above' | 'block_high';
  };
  systemInstructions: {
    roasting: string;
    helpful: string;
  };
  grounding: {
    threshold: number;
    enabled: boolean;
  };
  thinking: {
    budget: number;
    includeInResponse: boolean;
  };
}

export interface RateLimitingConfig {
  rpm: number;
  daily: number;
  burstSize: number;
  safetyMargin: number;
  retryOptions: {
    maxRetries: number;
    retryDelay: number;
    retryMultiplier: number;
  };
}

export interface RoastingConfig {
  baseChance: number;
  consecutiveBonus: number;
  maxChance: number;
  cooldownEnabled: boolean;
  moodSystem: {
    enabled: boolean;
    moodDuration: number;
    chaosEvents: {
      enabled: boolean;
      triggerChance: number;
      durationRange: [number, number];
      multiplierRange: [number, number];
    };
  };
  psychologicalWarfare: {
    roastDebt: boolean;
    mercyKills: boolean;
    cooldownBreaking: boolean;
  };
}

export interface MonitoringConfig {
  healthMetrics: {
    enabled: boolean;
    collectionInterval: number;
    retentionDays: number;
  };
  alerts: {
    enabled: boolean;
    memoryThreshold: number;
    errorRateThreshold: number;
    responseTimeThreshold: number;
    webhookUrl?: string;
  };
  gracefulDegradation: {
    enabled: boolean;
    circuitBreaker: {
      failureThreshold: number;
      timeout: number;
      resetTimeout: number;
    };
    queueing: {
      maxSize: number;
      maxAge: number;
    };
  };
}

export interface FeatureConfig {
  roasting: RoastingConfig;
  video: VideoConfiguration;
  codeExecution: boolean;
  structuredOutput: boolean;
  monitoring: MonitoringConfig;
  contextMemory: {
    enabled: boolean;
    maxMessages: number;
    timeoutMinutes: number;
    maxContextChars: number;
    compressionEnabled: boolean;
    crossServerEnabled: boolean;
  };
  caching: {
    enabled: boolean;
    maxSize: number;
    ttlMinutes: number;
    compressionEnabled: boolean;
  };
}

export interface ConfigurationChange {
  timestamp: string;
  version: string;
  modifiedBy: string;
  changeType: 'create' | 'update' | 'reload' | 'rollback';
  path: string[];
  oldValue: unknown;
  newValue: unknown;
  reason?: string;
  source: 'file' | 'command' | 'environment' | 'api';
}

export interface ConfigurationVersion {
  version: string;
  timestamp: string;
  configuration: BotConfiguration;
  hash: string;
}

export interface ConfigurationPaths {
  configPath?: string;
  versionsPath?: string;
  auditLogPath?: string;
}

// Environment override configuration
export interface EnvironmentOverrides {
  [key: string]: string | number | boolean;
}

// Events
export interface ConfigurationEvents {
  'config:changed': (changes: ConfigurationChange[]) => void;
  'config:validated': (valid: boolean, errors?: string[]) => void;
  'config:reloaded': (version: string) => void;
  'config:error': (error: Error) => void;
  'config:rollback': (fromVersion: string, toVersion: string) => void;
}

// ============================================================================
// Component Interfaces
// ============================================================================

export interface IConfigurationLoader {
  loadEnvironmentOverrides(): Promise<void>;
  loadConfiguration(): Promise<BotConfiguration>;
  applyEnvironmentOverrides(config: BotConfiguration): BotConfiguration;
  getDefaultConfiguration(): BotConfiguration;
  getEnvironmentOverrides(): EnvironmentOverrides;
  saveConfiguration(config: BotConfiguration): Promise<void>;
}

export interface IConfigurationValidator {
  validateConfiguration(config: BotConfiguration): { valid: boolean; errors?: string[] };
  validateEnvironment(): { isValid: boolean; errors: unknown[]; warnings: string[] };
  validateSchemaEvolution(oldSchema: object, newSchema: object): { isValid: boolean; errors: unknown[]; warnings: string[] };
  validateMigration(fromConfig: BotConfiguration, toConfig: BotConfiguration): { isValid: boolean; errors: unknown[]; warnings: string[] };
  clearCache(): void;
}

export interface IConfigurationMigrator {
  generateVersion(): string;
  generateConfigHash(config: BotConfiguration): string;
  saveVersionHistory(config: BotConfiguration): Promise<void>;
  getVersionHistory(): Promise<ConfigurationVersion[]>;
  rollbackToVersion(version: string): Promise<ConfigurationVersion>;
  migrateConfiguration(fromVersion: string, toVersion: string, migrationFn?: (config: BotConfiguration) => BotConfiguration): Promise<BotConfiguration>;
  getMigrationStrategies(): Map<string, (config: BotConfiguration) => BotConfiguration>;
  isVersionCompatible(version: string, targetVersion: string): boolean;
  getCachedVersionCount(): number;
}

export interface IConfigurationAuditor {
  logConfigurationChange(change: ConfigurationChange): Promise<void>;
  logConfigurationChanges(changes: ConfigurationChange[], source: string, reason?: string): Promise<void>;
  detectChanges(oldConfig: BotConfiguration, newConfig: BotConfiguration): ConfigurationChange[];
  getAuditLog(limit?: number): Promise<ConfigurationChange[]>;
  generateComplianceReport(startDate?: Date, endDate?: Date): Promise<{
    totalChanges: number;
    changesByType: Record<string, number>;
    changesByUser: Record<string, number>;
    changesBySource: Record<string, number>;
    criticalChanges: ConfigurationChange[];
    timeline: { date: string; count: number }[];
  }>;
  validateCompliance(config: BotConfiguration): Promise<{
    compliant: boolean;
    violations: string[];
    warnings: string[];
  }>;
  getAuditStatistics(): Promise<{
    totalEntries: number;
    oldestEntry?: Date;
    newestEntry?: Date;
    averageChangesPerDay: number;
    mostActiveUser?: string;
    mostCommonChangeType?: string;
  }>;
}