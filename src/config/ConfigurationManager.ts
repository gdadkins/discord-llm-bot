/**
 * Configuration Manager - Single Source of Truth for All Configuration
 * 
 * Provides unified configuration management with:
 * - Singleton pattern for global access
 * - Event-driven configuration changes
 * - Configuration caching with TTL
 * - Hot reload capability with file watchers
 * - Nested path access support
 * - Health status monitoring
 * - Backward compatibility with existing services
 */

import { EventEmitter } from 'events';
import { existsSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import type { 
  IConfigurationService,
  BotConfiguration,
  DiscordConfig,
  GeminiConfig,
  RateLimitingConfig,
  RoastingConfig,
  MonitoringConfig,
  FeatureConfig,
  ConfigurationChange,
  ConfigurationVersion,
  EnvironmentOverrides
} from '../services/interfaces/ConfigurationInterfaces';
import type { ServiceHealthStatus } from '../services/interfaces/CoreServiceInterfaces';
import { ConfigurationFactory } from './ConfigurationFactory';
import { createVideoConfiguration, type VideoConfiguration } from './videoConfig';
import { getGeminiConfig, type GeminiModelConfig } from './geminiConfig';
import { logger } from '../utils/logger';

/**
 * Configuration cache entry with TTL
 */
interface ConfigurationCacheEntry {
  value: BotConfiguration;
  timestamp: number;
  ttl: number;
}

/**
 * File watcher entry
 */
interface FileWatcherEntry {
  filePath: string;
  callback: () => void;
}

/**
 * Configuration Manager - Singleton class for unified configuration management
 * @deprecated Use src/services/config/ConfigurationManager.ts instead.
 */
export class ConfigurationManager extends EventEmitter implements IConfigurationService {
  private static instance: ConfigurationManager | null = null;
  private configurationCache: ConfigurationCacheEntry | null = null;
  private fileWatchers: Map<string, FileWatcherEntry> = new Map();
  private environmentOverrides: EnvironmentOverrides = {};
  private isInitialized: boolean = false;
  private healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  private lastError: Error | null = null;
  
  // Configuration constants
  private static readonly CACHE_TTL_MS = 60 * 1000; // 1 minute
  private static readonly ENV_FILES_TO_WATCH = ['.env', '.env.local', '.env.development'];
  private static readonly CONFIG_VERSION = '1.0.0';

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    super();
    this.setMaxListeners(50); // Increase limit for multiple service subscriptions
    console.warn('WARNING: Using deprecated ConfigurationManager (src/config/ConfigurationManager). Please migrate to src/services/config/ConfigurationManager.');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Initialize configuration manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load initial configuration
      await this.loadConfiguration();
      
      // Setup file watchers for hot reload in development
      if (process.env.NODE_ENV === 'development') {
        this.setupFileWatchers();
      }
      
      this.isInitialized = true;
      this.healthStatus = 'healthy';
      this.lastError = null;
      
      logger.info('ConfigurationManager initialized successfully');
    } catch (error) {
      this.healthStatus = 'unhealthy';
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to initialize ConfigurationManager:', error);
      throw error;
    }
  }

  /**
   * Shutdown configuration manager
   */
  public async shutdown(): Promise<void> {
    // Clean up file watchers
    this.cleanupFileWatchers();
    
    // Clear cache
    this.configurationCache = null;
    
    // Remove all listeners
    this.removeAllListeners();
    
    this.isInitialized = false;
    logger.info('ConfigurationManager shutdown completed');
  }

  // ============================================================================
  // IConfigurationService Implementation
  // ============================================================================

  /**
   * Get service name
   */
  public getName(): string {
    return 'ConfigurationManager';
  }

  /**
   * Get service version
   */
  public getVersion(): string {
    return ConfigurationManager.CONFIG_VERSION;
  }

  /**
   * Get service health status
   */
  public getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.healthStatus === 'healthy',
      name: this.getName(),
      errors: this.lastError ? [this.lastError.message] : [],
      metrics: this.getMetrics()
    };
  }

  /**
   * Get last error
   */
  public getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Get service metrics
   */
  public getMetrics(): Record<string, unknown> {
    return {
      cacheHits: this.configurationCache ? 1 : 0,
      watchedFiles: this.fileWatchers.size,
      isInitialized: this.isInitialized,
      healthStatus: this.healthStatus,
      environmentOverrides: Object.keys(this.environmentOverrides).length
    };
  }

  /**
   * Validate configuration
   */
  public validateConfiguration(config: BotConfiguration): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    try {
      // Basic structure validation
      if (!config.version) errors.push('Missing configuration version');
      if (!config.discord) errors.push('Missing Discord configuration');
      if (!config.gemini) errors.push('Missing Gemini configuration');
      if (!config.rateLimiting) errors.push('Missing rate limiting configuration');
      if (!config.features) errors.push('Missing features configuration');

      // Validate Discord config
      if (config.discord && !Array.isArray(config.discord.intents)) {
        errors.push('Discord intents must be an array');
      }

      // Validate Gemini config
      if (config.gemini) {
        if (!config.gemini.model) errors.push('Missing Gemini model');
        if (typeof config.gemini.temperature !== 'number') errors.push('Gemini temperature must be a number');
        if (config.gemini.temperature < 0 || config.gemini.temperature > 2) {
          errors.push('Gemini temperature must be between 0 and 2');
        }
      }

      // Validate rate limiting config
      if (config.rateLimiting) {
        if (typeof config.rateLimiting.rpm !== 'number' || config.rateLimiting.rpm < 1) {
          errors.push('Rate limiting RPM must be a positive number');
        }
        if (typeof config.rateLimiting.daily !== 'number' || config.rateLimiting.daily < 1) {
          errors.push('Rate limiting daily limit must be a positive number');
        }
      }

      const isValid = errors.length === 0;
      this.emit('config:validated', isValid, errors.length > 0 ? errors : undefined);
      
      return { valid: isValid, errors: errors.length > 0 ? errors : undefined };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Validation error: ${errorMessage}`);
      this.emit('config:validated', false, errors);
      return { valid: false, errors };
    }
  }

  /**
   * Reload configuration
   */
  public async reloadConfiguration(source: 'file-watcher' | 'command' | 'api' = 'command', reason?: string): Promise<void> {
    try {
      logger.info(`Reloading configuration from ${source}${reason ? ': ' + reason : ''}`);
      
      // Clear cache to force reload
      this.configurationCache = null;
      
      // Load fresh configuration
      await this.loadConfiguration();
      
      // Emit reload event
      this.emit('config:reloaded', this.getConfiguration().version);
      
      logger.info('Configuration reloaded successfully');
    } catch (error) {
      this.healthStatus = 'degraded';
      this.lastError = error instanceof Error ? error : new Error(String(error));
      this.emit('config:error', this.lastError);
      logger.error('Failed to reload configuration:', error);
      throw error;
    }
  }

  /**
   * Save configuration (placeholder - currently read-only)
   */
  public async saveConfiguration(_modifiedBy: string, _reason?: string): Promise<void> {
    // Currently read-only configuration from environment variables
    // Future implementation could save to file
    logger.warn('Configuration saving not implemented - configuration is read-only from environment');
  }

  /**
   * Get version history (placeholder)
   */
  public async getVersionHistory(): Promise<ConfigurationVersion[]> {
    // Future implementation could track version history
    return [];
  }

  /**
   * Rollback to version (placeholder)
   */
  public async rollbackToVersion(_version: string, _modifiedBy: string, _reason?: string): Promise<void> {
    // Future implementation could support rollback
    throw new Error('Configuration rollback not implemented');
  }

  /**
   * Get audit log (placeholder)
   */
  public async getAuditLog(_limit?: number): Promise<ConfigurationChange[]> {
    // Future implementation could track changes
    return [];
  }

  // ============================================================================
  // Configuration Getters
  // ============================================================================

  /**
   * Get complete configuration
   */
  public getConfiguration(): BotConfiguration {
    if (!this.isInitialized) {
      throw new Error('ConfigurationManager not initialized');
    }

    // Check cache first
    if (this.configurationCache) {
      const now = Date.now();
      if (now - this.configurationCache.timestamp < this.configurationCache.ttl) {
        return this.configurationCache.value;
      }
    }

    // Load fresh configuration
    const config = this.loadConfigurationSync();
    
    // Cache the configuration
    this.configurationCache = {
      value: config,
      timestamp: Date.now(),
      ttl: ConfigurationManager.CACHE_TTL_MS
    };

    return config;
  }

  /**
   * Get Discord configuration
   */
  public getDiscordConfig(): DiscordConfig {
    return this.getConfiguration().discord;
  }

  /**
   * Get Gemini configuration
   */
  public getGeminiConfig(): GeminiConfig {
    return this.getConfiguration().gemini;
  }

  /**
   * Get rate limiting configuration
   */
  public getRateLimitingConfig(): RateLimitingConfig {
    return this.getConfiguration().rateLimiting;
  }

  /**
   * Get roasting configuration
   */
  public getRoastingConfig(): RoastingConfig {
    return this.getConfiguration().features.roasting;
  }

  /**
   * Get monitoring configuration
   */
  public getMonitoringConfig(): MonitoringConfig {
    return this.getConfiguration().features.monitoring;
  }

  /**
   * Get feature configuration
   */
  public getFeatureConfig(): FeatureConfig {
    return this.getConfiguration().features;
  }

  // ============================================================================
  // Additional Configuration Access Methods
  // ============================================================================

  /**
   * Get video configuration
   */
  public getVideoConfig(): VideoConfiguration {
    return createVideoConfiguration();
  }

  /**
   * Get enhanced Gemini configuration with profiles
   */
  public getGeminiModelConfig(profileName?: string): GeminiModelConfig {
    return getGeminiConfig(profileName);
  }

  /**
   * Get configuration value by nested path (e.g., 'gemini.features.googleSearchEnabled')
   */
  public getConfigValue<T = unknown>(path: string, defaultValue?: T): T {
    const config = this.getConfiguration();
    const pathArray = path.split('.');
    
    let current: unknown = config;
    for (const segment of pathArray) {
      if (current && typeof current === 'object' && segment in current) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return defaultValue as T;
      }
    }
    
    return current as T;
  }

  /**
   * Check if configuration has a specific path
   */
  public hasConfigPath(path: string): boolean {
    try {
      const value = this.getConfigValue(path, Symbol('not-found'));
      return value !== Symbol('not-found');
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Configuration Updates (Placeholder)
  // ============================================================================

  /**
   * Update configuration (placeholder)
   */
  public async updateConfiguration(_updates: Partial<BotConfiguration>, _modifiedBy: string, _reason?: string): Promise<void> {
    // Future implementation could support configuration updates
    throw new Error('Configuration updates not implemented - configuration is read-only from environment');
  }

  /**
   * Update configuration section (placeholder)
   */
  public async updateConfigurationSection(
    _section: keyof BotConfiguration,
    _updates: Record<string, unknown>,
    _modifiedBy: string,
    _reason?: string
  ): Promise<void> {
    // Future implementation could support section updates
    throw new Error('Configuration section updates not implemented - configuration is read-only from environment');
  }

  // ============================================================================
  // Import/Export (Placeholder)
  // ============================================================================

  /**
   * Export configuration
   */
  public async exportConfiguration(format: 'json' | 'yaml' = 'json'): Promise<string> {
    const config = this.getConfiguration();
    
    if (format === 'json') {
      return JSON.stringify(config, null, 2);
    } else {
      // Future implementation could support YAML export
      throw new Error('YAML export not implemented');
    }
  }

  /**
   * Import configuration (placeholder)
   */
  public async importConfiguration(_configData: string, _format: 'json' | 'yaml' = 'json', _modifiedBy?: string, _reason?: string): Promise<void> {
    // Future implementation could support configuration import
    throw new Error('Configuration import not implemented');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Load configuration asynchronously
   */
  private async loadConfiguration(): Promise<BotConfiguration> {
    return this.loadConfigurationSync();
  }

  /**
   * Load configuration synchronously
   */
  private loadConfigurationSync(): BotConfiguration {
    try {
      // Load environment overrides first
      this.loadEnvironmentOverrides();
      
      // Create configuration using existing factory
      const config = ConfigurationFactory.createBotConfiguration();
      
      // Apply environment overrides
      const finalConfig = this.applyEnvironmentOverrides(config);
      
      // Validate configuration
      const validation = this.validateConfiguration(finalConfig);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors?.join(', ')}`);
      }
      
      return finalConfig;
    } catch (error) {
      this.healthStatus = 'unhealthy';
      this.lastError = error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }

  /**
   * Load environment overrides
   */
  private loadEnvironmentOverrides(): void {
    this.environmentOverrides = {};
    
    // Load from process.env
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        this.environmentOverrides[key] = value;
      }
    }
  }

  /**
   * Apply environment overrides to configuration
   */
  private applyEnvironmentOverrides(config: BotConfiguration): BotConfiguration {
    // Currently, environment overrides are handled by ConfigurationFactory
    // Future implementation could support more sophisticated override logic
    return config;
  }

  /**
   * Setup file watchers for hot reload
   */
  private setupFileWatchers(): void {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const projectRoot = process.cwd();
    
    for (const envFile of ConfigurationManager.ENV_FILES_TO_WATCH) {
      const filePath = join(projectRoot, envFile);
      
      if (existsSync(filePath)) {
        const callback = () => {
          logger.info(`Environment file changed: ${envFile}`);
          this.reloadConfiguration('file-watcher', `${envFile} changed`);
        };
        
        watchFile(filePath, { interval: 1000 }, callback);
        this.fileWatchers.set(envFile, { filePath, callback });
        
        logger.debug(`Watching environment file: ${filePath}`);
      }
    }
  }

  /**
   * Cleanup file watchers
   */
  private cleanupFileWatchers(): void {
    for (const watcher of this.fileWatchers.values()) {
      unwatchFile(watcher.filePath);
      logger.debug(`Stopped watching file: ${watcher.filePath}`);
    }
    this.fileWatchers.clear();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get configuration summary for debugging
   */
  public getConfigurationSummary(): Record<string, unknown> {
    const config = this.getConfiguration();
    
    return {
      version: config.version,
      lastModified: config.lastModified,
      modifiedBy: config.modifiedBy,
      cacheStatus: this.configurationCache ? 'cached' : 'not-cached',
      healthStatus: this.healthStatus,
      watchedFiles: Array.from(this.fileWatchers.keys()),
      environmentOverrides: Object.keys(this.environmentOverrides).length
    };
  }

  /**
   * Clear configuration cache
   */
  public clearCache(): void {
    this.configurationCache = null;
    logger.debug('Configuration cache cleared');
  }

  /**
   * Check if configuration is cached
   */
  public isCached(): boolean {
    if (!this.configurationCache) return false;
    
    const now = Date.now();
    return now - this.configurationCache.timestamp < this.configurationCache.ttl;
  }
}

// ============================================================================
// Global Configuration Manager Instance
// ============================================================================

/**
 * Global configuration manager instance
 * Use this for accessing configuration throughout the application
 */
export const configurationManager = ConfigurationManager.getInstance();

// ============================================================================
// Type Exports
// ============================================================================

export type {
  BotConfiguration,
  DiscordConfig,
  GeminiConfig,
  RateLimitingConfig,
  RoastingConfig,
  MonitoringConfig,
  FeatureConfig,
  VideoConfiguration,
  GeminiModelConfig
};