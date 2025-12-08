import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';
import { DataStore, DataValidator } from '../../utils/DataStore';
import { dataStoreFactory } from '../../utils/DataStoreFactory';
import { 
  BotConfiguration, 
  ConfigurationVersion,
  IConfigurationMigrator
} from '../interfaces/ConfigurationInterfaces';

/**
 * ConfigurationMigrator - Handles version management and migration
 * 
 * Responsibilities:
 * - Managing configuration versions
 * - Implementing migration strategies
 * - Handling rollback operations
 * - Version history management
 */
export class ConfigurationMigrator implements IConfigurationMigrator {
  private versionDataStores: Map<string, DataStore<ConfigurationVersion>> = new Map();

  constructor(
    private versionsPath: string
  ) {}

  /**
   * Generate a unique version identifier
   */
  generateVersion(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `v${timestamp}`;
  }

  /**
   * Generate SHA256 hash of configuration
   */
  generateConfigHash(config: BotConfiguration): string {
    const configString = JSON.stringify(config);
    return crypto.createHash('sha256').update(configString).digest('hex');
  }

  /**
   * Save a configuration version to history
   */
  async saveVersionHistory(config: BotConfiguration): Promise<void> {
    const version: ConfigurationVersion = {
      version: config.version,
      timestamp: config.lastModified,
      configuration: JSON.parse(JSON.stringify(config)),
      hash: this.generateConfigHash(config)
    };

    const versionFile = path.join(this.versionsPath, `${config.version}.json`);
    
    // Create or get DataStore for this version file with compression enabled
    const versionDataStore = this.createVersionDataStore(versionFile);
    
    await versionDataStore.save(version);
    this.versionDataStores.set(version.version, versionDataStore);

    // Optimized cleanup using cached DataStore instances
    await this.cleanupOldVersions();
  }

  /**
   * Create a standardized DataStore for version files
   */
  private createVersionDataStore(versionFile: string): DataStore<ConfigurationVersion> {
    const versionValidator: DataValidator<ConfigurationVersion> = (data: unknown): data is ConfigurationVersion => {
      if (typeof data !== 'object' || !data) return false;
      const v = data as ConfigurationVersion;
      return !!v.version && !!v.timestamp && !!v.configuration && !!v.hash;
    };
    
    return dataStoreFactory.createCustomStore<ConfigurationVersion>(
      versionFile,
      {
        validator: versionValidator,
        maxBackups: 2,
        compressionEnabled: true,
        compressionThreshold: 1024, // Compress files larger than 1KB
        maxRetries: 3,
        createDirectories: true
      }
    );
  }

  /**
   * Get version history sorted by timestamp (newest first)
   */
  async getVersionHistory(): Promise<ConfigurationVersion[]> {
    try {
      const versions: ConfigurationVersion[] = [];
      
      // First, try to load versions from cached DataStore instances
      for (const versionName of Array.from(this.versionDataStores.keys())) {
        const dataStore = this.versionDataStores.get(versionName);
        if (!dataStore) continue;
        try {
          const versionData = await dataStore.load();
          if (versionData) {
            versions.push(versionData);
          }
        } catch (error) {
          logger.warn(`Failed to read cached version ${versionName}:`, error);
          // Remove invalid cached store
          this.versionDataStores.delete(versionName);
        }
      }
      
      // Discover additional version files not in cache using directory scan
      try {
        const files = await fs.readdir(this.versionsPath);
        const uncachedFiles = files.filter(file => {
          if (!file.endsWith('.json')) return false;
          const versionName = path.basename(file, '.json');
          return !this.versionDataStores.has(versionName);
        });
        
        // Process uncached files with efficient DataStore creation
        for (const file of uncachedFiles) {
          try {
            const versionFile = path.join(this.versionsPath, file);
            const versionName = path.basename(file, '.json');
            
            // Create DataStore for uncached version file
            const versionDataStore = this.createVersionDataStore(versionFile);
            const versionData = await versionDataStore.load();
            
            if (versionData) {
              versions.push(versionData);
              // Cache the DataStore for future use
              this.versionDataStores.set(versionName, versionDataStore);
            }
          } catch (error) {
            logger.warn(`Failed to read version file ${file}:`, error);
          }
        }
      } catch (dirError) {
        logger.warn('Failed to scan versions directory:', dirError);
      }

      // Sort by timestamp (newest first)
      return versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      logger.error('Failed to get version history:', error);
      return [];
    }
  }

  /**
   * Rollback to a specific version
   */
  async rollbackToVersion(version: string): Promise<ConfigurationVersion> {
    // Optimized version loading using cached store or standardized creation
    let versionData: ConfigurationVersion | null = null;
    const cachedStore = this.versionDataStores.get(version);
    
    if (cachedStore) {
      versionData = await cachedStore.load();
    } else {
      // Create DataStore using standardized helper
      const versionFile = path.join(this.versionsPath, `${version}.json`);
      const tempStore = this.createVersionDataStore(versionFile);
      versionData = await tempStore.load();
      
      // Cache the DataStore for future use
      if (versionData) {
        this.versionDataStores.set(version, tempStore);
      }
    }
    
    if (!versionData) {
      throw new Error(`Version ${version} not found or corrupted`);
    }

    // Validate version data integrity
    const expectedHash = this.generateConfigHash(versionData.configuration);
    if (versionData.hash !== expectedHash) {
      throw new Error(`Version ${version} has invalid hash. Data may be corrupted.`);
    }

    return versionData;
  }

  /**
   * Cleanup old version files keeping only the most recent ones
   */
  private async cleanupOldVersions(): Promise<void> {
    try {
      const versions = await this.getVersionHistory();
      const maxVersions = 50;
      
      if (versions.length <= maxVersions) {
        return;
      }
      
      const versionsToDelete = versions.slice(maxVersions);
      logger.info(`Cleaning up ${versionsToDelete.length} old version files`);
      
      // Use batch operations for efficient cleanup
      const cleanupPromises = versionsToDelete.map(async (versionToDelete) => {
        try {
          const cachedStore = this.versionDataStores.get(versionToDelete.version);
          
          if (cachedStore) {
            // Use cached DataStore for deletion
            await cachedStore.delete(true); // Include backups
            this.versionDataStores.delete(versionToDelete.version);
            logger.debug(`Deleted cached version: ${versionToDelete.version}`);
          } else {
            // Create temporary DataStore for deletion
            const versionFilePath = path.join(this.versionsPath, `${versionToDelete.version}.json`);
            const tempDataStore = this.createVersionDataStore(versionFilePath);
            await tempDataStore.delete(true); // Include backups
            logger.debug(`Deleted uncached version: ${versionToDelete.version}`);
          }
        } catch (error) {
          logger.warn(`Failed to delete version ${versionToDelete.version}:`, error);
        }
      });
      
      // Execute cleanup operations in parallel with concurrency limit
      const BATCH_SIZE = 5;
      for (let i = 0; i < cleanupPromises.length; i += BATCH_SIZE) {
        const batch = cleanupPromises.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(batch);
      }
      
      logger.info(`Version cleanup completed. Kept ${maxVersions} most recent versions`);
    } catch (error) {
      logger.error('Failed to cleanup old versions:', error);
    }
  }

  /**
   * Migrate configuration between versions
   */
  async migrateConfiguration(
    fromVersion: string, 
    toVersion: string, 
    migrationFn?: (config: BotConfiguration) => BotConfiguration
  ): Promise<BotConfiguration> {
    const sourceVersion = await this.rollbackToVersion(fromVersion);
    let targetConfig = sourceVersion.configuration;

    // Apply migration function if provided
    if (migrationFn) {
      targetConfig = migrationFn(targetConfig);
    }

    // Update version information
    targetConfig.version = toVersion;
    targetConfig.lastModified = new Date().toISOString();

    return targetConfig;
  }

  /**
   * Get migration strategies for different version transitions
   */
  getMigrationStrategies(): Map<string, (config: BotConfiguration) => BotConfiguration> {
    const strategies = new Map<string, (config: BotConfiguration) => BotConfiguration>();

    // Example migration strategies
    strategies.set('1.0.0->2.0.0', (config) => {
      // Example: Add new fields introduced in v2.0.0
      if (!config.features.monitoring) {
        config.features.monitoring = {
          healthMetrics: {
            enabled: true,
            collectionInterval: 30000,
            retentionDays: 7
          },
          alerts: {
            enabled: true,
            memoryThreshold: 512,
            errorRateThreshold: 5,
            responseTimeThreshold: 5000
          },
          gracefulDegradation: {
            enabled: true,
            circuitBreaker: {
              failureThreshold: 5,
              timeout: 30000,
              resetTimeout: 60000
            },
            queueing: {
              maxSize: 100,
              maxAge: 300000
            }
          }
        };
      }
      return config;
    });

    return strategies;
  }

  /**
   * Validate version compatibility
   */
  isVersionCompatible(version: string, targetVersion: string): boolean {
    // Simple version comparison - can be made more sophisticated
    const parseVersion = (v: string) => {
      const match = v.match(/(\d+)\.(\d+)\.(\d+)/);
      if (!match) return { major: 0, minor: 0, patch: 0 };
      return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10)
      };
    };

    const source = parseVersion(version);
    const target = parseVersion(targetVersion);

    // Major version changes are incompatible
    if (source.major !== target.major) {
      return false;
    }

    // Minor version changes are compatible if target is newer
    if (source.minor > target.minor) {
      return false;
    }

    return true;
  }

  /**
   * Get cached version count for monitoring
   */
  getCachedVersionCount(): number {
    return this.versionDataStores.size;
  }
}