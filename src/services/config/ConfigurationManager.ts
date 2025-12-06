import { Mutex } from 'async-mutex';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { logger } from '../../utils/logger';
import { EventEmitter } from 'events';
import { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import { 
  BotConfiguration, 
  DiscordConfig,
  GeminiConfig,
  RateLimitingConfig,
  FeatureConfig,
  RoastingConfig,
  MonitoringConfig,
  IConfigurationService,
  ConfigurationVersion,
  ConfigurationChange
} from '../interfaces/ConfigurationInterfaces';
import { ConfigurationLoader } from './ConfigurationLoader';
import { ConfigurationValidator } from './ConfigurationValidator';
import { ConfigurationMigrator } from './ConfigurationMigrator';
import { ConfigurationAuditor } from './ConfigurationAuditor';
import { DataValidator } from '../../utils/DataStore';

/**
 * ConfigurationManager - Main orchestrator for configuration management
 * 
 * Responsibilities:
 * - Coordinating between loader, validator, migrator, and auditor
 * - Managing file watching and hot reload
 * - Providing unified API for configuration access
 * - Event emission and error handling
 */
class ConfigurationManager extends EventEmitter implements IConfigurationService {
  private mutex = new Mutex();
  private fileWatcher?: chokidar.FSWatcher;
  private currentConfig: BotConfiguration;
  private initialized = false;
  private isReloading = false;

  // Component instances
  private loader: ConfigurationLoader;
  private validator: ConfigurationValidator;
  private migrator: ConfigurationMigrator;
  private auditor: ConfigurationAuditor;

  constructor(
    private configPath = './data/bot-config.json',
    private versionsPath = './data/config-versions',
    private auditLogPath = './data/config-audit.log'
  ) {
    super();
    
    // Initialize validator first as it's needed by other components
    this.validator = ConfigurationValidator.getInstance();
    
    // Create configuration validator function
    const configValidator: DataValidator<BotConfiguration> = (data: unknown): data is BotConfiguration => {
      return this.validator.validateConfiguration(data as BotConfiguration).valid;
    };
    
    // Initialize components first
    this.loader = new ConfigurationLoader(this.configPath, configValidator);
    this.migrator = new ConfigurationMigrator(this.versionsPath);
    this.auditor = new ConfigurationAuditor(this.auditLogPath);
    
    // Now we can safely get the default configuration
    this.currentConfig = this.getDefaultConfiguration();
  }

  /**
   * Initialize the configuration manager
   */
  async initialize(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (this.initialized) {
        logger.warn('ConfigurationManager already initialized');
        return;
      }

      // Ensure directories exist
      await fs.ensureDir(path.dirname(this.configPath));
      await fs.ensureDir(this.versionsPath);
      await fs.ensureDir(path.dirname(this.auditLogPath));

      // Load environment overrides
      await this.loader.loadEnvironmentOverrides();

      // Load or create configuration
      await this.loadConfiguration();

      // Start file watching
      await this.startFileWatching();

      this.initialized = true;
      logger.info('ConfigurationManager initialized successfully');
    } finally {
      release();
    }
  }

  /**
   * Load configuration using the loader component
   */
  private async loadConfiguration(): Promise<void> {
    try {
      logger.info('Starting loadConfiguration method');
      
      const configData = await this.loader.loadConfiguration();
      
      const validation = this.validator.validateConfiguration(configData);
      if (!validation.valid) {
        logger.error('Configuration validation failed:', validation.errors);
        throw new Error(`Configuration validation failed: ${validation.errors?.join(', ')}`);
      }
      logger.info('Configuration validation passed');

      this.currentConfig = configData;
      logger.info(`Configuration loaded from ${this.configPath}`);

      // Emit validation event
      this.emit('config:validated', true);
      logger.info('loadConfiguration method completed successfully');
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      this.emit('config:error', error as Error);
      throw error;
    }
  }

  /**
   * Start file watching for hot reload
   */
  private async startFileWatching(): Promise<void> {
    if (this.fileWatcher) {
      await this.fileWatcher.close();
    }

    this.fileWatcher = chokidar.watch(this.configPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    });

    this.fileWatcher.on('change', async () => {
      if (this.isReloading) {
        logger.debug('Ignoring file change during reload');
        return;
      }

      logger.info('Configuration file changed, reloading...');
      try {
        await this.reloadConfiguration('file-watcher');
      } catch (error) {
        logger.error('Failed to reload configuration from file change:', error);
        this.emit('config:error', error as Error);
      }
    });

    this.fileWatcher.on('error', (error) => {
      logger.error('File watcher error:', error);
      this.emit('config:error', error);
    });

    logger.info('Configuration file watching started');
  }

  /**
   * Reload configuration
   */
  async reloadConfiguration(source: 'file-watcher' | 'command' | 'api' = 'command', reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.isReloading = true;
      const oldConfig = JSON.parse(JSON.stringify(this.currentConfig));

      await this.loadConfiguration();
      
      const changes = this.auditor.detectChanges(oldConfig, this.currentConfig);
      if (changes.length > 0) {
        await this.auditor.logConfigurationChanges(changes, source, reason);
        this.emit('config:changed', changes);
      }

      this.emit('config:reloaded', this.currentConfig.version);
      logger.info(`Configuration reloaded from ${source}, ${changes.length} changes detected`);
    } finally {
      this.isReloading = false;
      release();
    }
  }

  /**
   * Save configuration
   */
  async saveConfiguration(modifiedBy: string, reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      // Update metadata
      this.currentConfig.lastModified = new Date().toISOString();
      this.currentConfig.modifiedBy = modifiedBy;
      this.currentConfig.version = this.migrator.generateVersion();

      // Validate before saving
      const validation = this.validator.validateConfiguration(this.currentConfig);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors?.join(', ')}`);
      }

      // Save current configuration
      await this.loader.saveConfiguration(this.currentConfig);

      // Save version history
      await this.migrator.saveVersionHistory(this.currentConfig);

      // Log the save action
      await this.auditor.logConfigurationChange({
        timestamp: this.currentConfig.lastModified,
        version: this.currentConfig.version,
        modifiedBy,
        changeType: 'update',
        path: [],
        oldValue: null,
        newValue: this.currentConfig,
        reason,
        source: 'command'
      });

      logger.info(`Configuration saved by ${modifiedBy}: ${reason || 'No reason provided'}`);
    } finally {
      release();
    }
  }

  /**
   * Rollback to a specific version
   */
  async rollbackToVersion(version: string, modifiedBy: string, reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const versionData = await this.migrator.rollbackToVersion(version);
      const oldVersion = this.currentConfig.version;
      
      // Apply the rollback with new version identifier
      this.currentConfig = { ...versionData.configuration };
      this.currentConfig.lastModified = new Date().toISOString();
      this.currentConfig.modifiedBy = modifiedBy;
      this.currentConfig.version = this.migrator.generateVersion();

      // Save the rolled back configuration
      await this.loader.saveConfiguration(this.currentConfig);

      // Create version history entry for the rollback
      await this.migrator.saveVersionHistory(this.currentConfig);

      // Log the rollback operation
      await this.auditor.logConfigurationChange({
        timestamp: this.currentConfig.lastModified,
        version: this.currentConfig.version,
        modifiedBy,
        changeType: 'rollback',
        path: [],
        oldValue: oldVersion,
        newValue: version,
        reason: reason || `Rolled back to version ${version}`,
        source: 'command'
      });

      this.emit('config:rollback', oldVersion, this.currentConfig.version);
      logger.info(`Configuration rolled back from ${oldVersion} to ${version} by ${modifiedBy}. New version: ${this.currentConfig.version}`);
    } finally {
      release();
    }
  }

  // Configuration getter methods
  getDiscordConfig(): DiscordConfig {
    return this.currentConfig.discord;
  }

  getGeminiConfig(): GeminiConfig {
    return this.currentConfig.gemini;
  }

  getRateLimitingConfig(): RateLimitingConfig {
    return this.currentConfig.rateLimiting;
  }

  getFeatureConfig(): FeatureConfig {
    return this.currentConfig.features;
  }

  getRoastingConfig(): RoastingConfig {
    return this.currentConfig.features.roasting;
  }

  getMonitoringConfig(): MonitoringConfig {
    return this.currentConfig.features.monitoring;
  }

  getConfiguration(): BotConfiguration {
    return JSON.parse(JSON.stringify(this.currentConfig));
  }

  /**
   * Get default configuration
   */
  private getDefaultConfiguration(): BotConfiguration {
    return this.loader.getDefaultConfiguration();
  }

  /**
   * Update configuration with validation
   */
  async updateConfiguration(updates: Partial<BotConfiguration>, modifiedBy: string, reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const newConfig = { ...this.currentConfig, ...updates };
      
      const validation = this.validator.validateConfiguration(newConfig);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors?.join(', ')}`);
      }

      this.currentConfig = newConfig;
      await this.saveConfiguration(modifiedBy, reason);

      logger.info(`Configuration updated by ${modifiedBy}: ${reason || 'No reason provided'}`);
    } finally {
      release();
    }
  }

  /**
   * Update specific configuration section
   */
  async updateConfigurationSection(section: keyof BotConfiguration, updates: Record<string, unknown>, modifiedBy: string, reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const newConfig = JSON.parse(JSON.stringify(this.currentConfig));
      newConfig[section] = { ...newConfig[section], ...updates };
      
      const validation = this.validator.validateConfiguration(newConfig);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors?.join(', ')}`);
      }

      this.currentConfig = newConfig;
      await this.saveConfiguration(modifiedBy, reason);

      logger.info(`Configuration section '${section}' updated by ${modifiedBy}: ${reason || 'No reason provided'}`);
    } finally {
      release();
    }
  }

  /**
   * Export configuration
   */
  async exportConfiguration(format: 'json' | 'yaml' = 'json'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify(this.currentConfig, null, 2);
    } else {
      throw new Error('YAML export not implemented');
    }
  }

  /**
   * Import configuration
   */
  async importConfiguration(configData: string, format: 'json' | 'yaml' = 'json', modifiedBy: string, reason?: string): Promise<void> {
    let parsedConfig: BotConfiguration;

    try {
      if (format === 'json') {
        parsedConfig = JSON.parse(configData);
      } else {
        throw new Error('YAML import not implemented');
      }
    } catch (error) {
      throw new Error(`Failed to parse configuration: ${error}`);
    }

    const validation = this.validator.validateConfiguration(parsedConfig);
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors?.join(', ')}`);
    }

    await this.updateConfiguration(parsedConfig, modifiedBy, reason);
  }

  /**
   * Get version history
   */
  async getVersionHistory() {
    return this.migrator.getVersionHistory();
  }

  /**
   * Get audit log
   */
  async getAuditLog(limit = 100) {
    return this.auditor.getAuditLog(limit);
  }

  /**
   * Validate current configuration
   */
  validateConfiguration(config?: BotConfiguration) {
    return this.validator.validateConfiguration(config || this.currentConfig);
  }

  /**
   * Shutdown the configuration manager
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down ConfigurationManager...');
    
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = undefined;
    }

    this.removeAllListeners();
    logger.info('ConfigurationManager shutdown completed');
  }

  /**
   * Get service name
   */
  getName(): string {
    return 'ConfigurationManager';
  }

  /**
   * Get service version
   */
  getVersion(): string {
    return this.currentConfig?.version || '0.0.0';
  }

  /**
   * Get health status
   */
  getHealthStatus(): ServiceHealthStatus {
    const errors: string[] = [];

    if (!this.initialized) {
      errors.push('ConfigurationManager not initialized');
    }

    if (!this.currentConfig) {
      errors.push('No current configuration loaded');
    }

    const validation = this.validator.validateConfiguration(this.currentConfig);
    if (!validation.valid) {
      errors.push(`Configuration validation failed: ${validation.errors?.join(', ')}`);
    }

    return {
      name: 'ConfigurationManager',
      healthy: errors.length === 0,
      errors,
      metrics: {
        initialized: this.initialized,
        currentVersion: this.currentConfig?.version || 'unknown',
        lastModified: this.currentConfig?.lastModified || 'unknown',
        environmentOverrides: Object.keys(this.loader.getEnvironmentOverrides()).length,
        fileWatcherActive: !!this.fileWatcher,
        versionDataStoreCount: this.migrator.getCachedVersionCount()
      }
    };
  }
}

export { ConfigurationManager };