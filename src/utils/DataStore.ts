/**
 * Generic DataStore Utility Class
 * 
 * Provides type-safe data persistence with atomic operations, backup/restore,
 * configurable serialization, and migration support. Abstracts common file I/O
 * patterns used throughout the Discord bot codebase.
 * 
 * Features:
 * - Generic type safety for any data structure
 * - Atomic write operations with backup/restore
 * - Configurable serialization strategies (JSON, extensible)
 * - Data validation and migration support
 * - Comprehensive error handling with retry logic
 * - Race condition protection with mutex
 * 
 * @author Claude Code
 * @version 1.0.0
 */

import { Mutex } from 'async-mutex';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { logger } from './logger';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Serialization strategy interface for data persistence
 */
export interface SerializationStrategy {
  /**
   * Serialize data to string format
   * @param data - Data to serialize
   * @returns Serialized string
   */
  serialize(data: unknown): string;

  /**
   * Deserialize string data back to object
   * @param content - String content to deserialize
   * @returns Deserialized data
   */
  deserialize(content: string): unknown;

  /**
   * File extension for this serialization format
   */
  fileExtension: string;
}

/**
 * JSON serialization strategy (default)
 */
export class JsonSerializationStrategy implements SerializationStrategy {
  fileExtension = '.json';

  serialize(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  deserialize(content: string): unknown {
    return JSON.parse(content);
  }
}

/**
 * Data validation function type
 */
export type DataValidator<T> = (data: unknown) => data is T;

/**
 * Migration function type for data format changes
 */
export type MigrationFunction<T> = (data: unknown) => T;

/**
 * Configuration options for DataStore
 */
export interface DataStoreConfig<T> {
  /**
   * Serialization strategy (defaults to JSON)
   */
  serialization?: SerializationStrategy;

  /**
   * Data validation function
   */
  validator?: DataValidator<T>;

  /**
   * Maximum number of backup files to keep
   */
  maxBackups?: number;

  /**
   * Number of retry attempts for file operations
   */
  maxRetries?: number;

  /**
   * Base delay for exponential backoff (ms)
   */
  retryDelayMs?: number;

  /**
   * Whether to create intermediate directories
   */
  createDirectories?: boolean;

  /**
   * File permissions for created files (octal)
   */
  fileMode?: number;

  /**
   * Enable detailed debug logging
   */
  enableDebugLogging?: boolean;

  /**
   * Enable compression for stored data
   */
  compressionEnabled?: boolean;

  /**
   * Minimum size threshold for compression (bytes)
   */
  compressionThreshold?: number;

  /**
   * Time-to-live for data (milliseconds)
   */
  ttl?: number;

  /**
   * Enable automatic cleanup of expired data
   */
  autoCleanup?: boolean;

  /**
   * Maximum number of entries (for LRU eviction)
   */
  maxEntries?: number;
}

/**
 * Backup metadata information
 */
export interface BackupInfo {
  /**
   * Full path to the backup file
   */
  path: string;

  /**
   * Timestamp when backup was created
   */
  timestamp: number;

  /**
   * Size of backup file in bytes
   */
  size: number;

  /**
   * Reason for backup creation
   */
  reason: string;
}

/**
 * Performance metrics for DataStore operations
 */
export interface DataStoreMetrics {
  /**
   * Total number of save operations
   */
  saveCount: number;

  /**
   * Total number of load operations
   */
  loadCount: number;

  /**
   * Average save latency in milliseconds
   */
  avgSaveLatency: number;

  /**
   * Average load latency in milliseconds
   */
  avgLoadLatency: number;

  /**
   * Total number of errors
   */
  errorCount: number;

  /**
   * Total number of retries
   */
  retryCount: number;

  /**
   * Last operation timestamp
   */
  lastOperationTime: number;

  /**
   * Total bytes written
   */
  totalBytesWritten: number;

  /**
   * Total bytes read
   */
  totalBytesRead: number;
}

/**
 * Batch operation interface
 */
export interface BatchOperation<T> {
  type: 'update' | 'delete';
  storePath: string;
  data?: T;
}

/**
 * Batch transaction interface
 */
export interface BatchTransaction<T> {
  operations: BatchOperation<T>[];
  committed: boolean;
}

/**
 * Batch API interface
 */
export interface BatchApi<T> {
  update: (storePath: string, data: T) => BatchApi<T>;
  delete: (storePath: string) => BatchApi<T>;
  commit: () => Promise<void>;
  rollback: () => void;
}

/**
 * Connection pool entry
 */
interface PoolEntry {
  busy: boolean;
  lastUsed: number;
}

/**
 * Generic DataStore class for type-safe data persistence
 */
export class DataStore<T> {
  private readonly mutex = new Mutex();
  private readonly filePath: string;
  private readonly config: Required<DataStoreConfig<T>>;
  private readonly backupDir: string;
  
  // Performance metrics tracking
  private metrics: DataStoreMetrics = {
    saveCount: 0,
    loadCount: 0,
    avgSaveLatency: 0,
    avgLoadLatency: 0,
    errorCount: 0,
    retryCount: 0,
    lastOperationTime: 0,
    totalBytesWritten: 0,
    totalBytesRead: 0
  };
  
  // Connection pool for high-concurrency scenarios
  private connectionPool: Map<string, PoolEntry> = new Map();
  private readonly maxConnections = 10;
  
  // Batch transaction support
  private currentBatch: BatchTransaction<T> | null = null;
  private batchMutex = new Mutex();
  
  // Monitoring and analytics integration
  private monitoringHooks: Array<(event: string, latency: number, bytes: number, error?: string) => void> = [];

  /**
   * Create a new DataStore instance
   * @param filePath - Path to the data file
   * @param config - Configuration options
   */
  constructor(filePath: string, config: DataStoreConfig<T> = {}) {
    this.filePath = path.resolve(filePath);
    this.backupDir = path.join(path.dirname(this.filePath), 'backups');
    
    // Apply default configuration
    this.config = {
      serialization: config.serialization || new JsonSerializationStrategy(),
      validator: config.validator || ((data: unknown): data is T => true),
      maxBackups: config.maxBackups ?? 10,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 100,
      createDirectories: config.createDirectories ?? true,
      fileMode: config.fileMode ?? 0o644,
      enableDebugLogging: config.enableDebugLogging ?? false,
      compressionEnabled: config.compressionEnabled ?? false,
      compressionThreshold: config.compressionThreshold ?? 10240, // 10KB default
      ttl: config.ttl ?? 0, // 0 means no expiration
      autoCleanup: config.autoCleanup ?? false,
      maxEntries: config.maxEntries ?? 0, // 0 means no limit
    };

    this.debugLog(`DataStore initialized for: ${this.filePath}`);
  }

  /**
   * Load data from the file
   * @returns Promise resolving to data or null if file doesn't exist
   */
  async load(): Promise<T | null> {
    const release = await this.mutex.acquire();
    const startTime = Date.now();
    
    try {
      return await this.performWithRetry(async () => {
        try {
          let content: string;
          const isCompressed = await this.isFileCompressed();
          
          if (isCompressed) {
            const compressedData = await fs.readFile(this.filePath);
            const decompressed = await gunzip(compressedData);
            content = decompressed.toString('utf8');
          } else {
            content = await fs.readFile(this.filePath, 'utf8');
          }
          
          const data = this.config.serialization.deserialize(content);

          if (!this.config.validator(data)) {
            throw new Error('Data validation failed during load');
          }

          // Update metrics
          const loadTime = Date.now() - startTime;
          this.updateLoadMetrics(loadTime, content.length);

          // Emit monitoring event for analytics collection
          this.emitMonitoringEvent('load', loadTime, content.length);

          this.debugLog(`Successfully loaded data from: ${this.filePath}`);
          return data as T;
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            this.debugLog(`File not found: ${this.filePath}`);
            return null;
          }

          // Try to recover from backup if main file is corrupted
          if (error instanceof SyntaxError || 
              (error instanceof Error && error.message.includes('validation failed'))) {
            logger.warn(`Data file corrupted, attempting backup recovery: ${this.filePath}`);
            return await this.recoverFromBackup();
          }

          this.metrics.errorCount++;
          // Emit error event for monitoring
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.emitMonitoringEvent('error', Date.now() - startTime, 0, errorMessage);
          throw error;
        }
      });
    } finally {
      release();
    }
  }

  /**
   * Save data to the file atomically
   * @param data - Data to save
   */
  async save(data: T): Promise<void> {
    const release = await this.mutex.acquire();
    const startTime = Date.now();
    
    try {
      await this.performWithRetry(async () => {
        // Validate data before saving
        if (!this.config.validator(data)) {
          throw new Error('Data validation failed before save');
        }

        // Create backup if file exists
        if (await this.fileExists(this.filePath)) {
          await this.backup('before_save');
        }

        // Ensure directories exist
        if (this.config.createDirectories) {
          await this.ensureDirectories();
        }

        // Atomic write: write to temp file then rename
        const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2)}`;
        const content = this.config.serialization.serialize(data);
        
        // Check if compression should be applied
        const shouldCompress = this.config.compressionEnabled && 
                             Buffer.byteLength(content, 'utf8') >= this.config.compressionThreshold;
        
        try {
          if (shouldCompress) {
            const compressed = await gzip(Buffer.from(content, 'utf8'));
            await fs.writeFile(tempPath, compressed, { mode: this.config.fileMode });
            this.debugLog(`Compressed data from ${Buffer.byteLength(content, 'utf8')} to ${compressed.length} bytes`);
          } else {
            await fs.writeFile(tempPath, content, { 
              mode: this.config.fileMode,
              encoding: 'utf8'
            });
          }

          // Atomic rename
          await fs.rename(tempPath, this.filePath);
          
          // Update metrics
          const saveTime = Date.now() - startTime;
          this.updateSaveMetrics(saveTime, content.length);
          
          // Emit monitoring event for analytics collection
          this.emitMonitoringEvent('save', saveTime, content.length);
          
          this.debugLog(`Successfully saved data to: ${this.filePath}`);
        } catch (error) {
          // Clean up temp file if it exists
          try {
            await fs.unlink(tempPath);
          } catch {
            // Ignore cleanup errors
          }
          this.metrics.errorCount++;
          // Emit error event for monitoring
          this.emitMonitoringEvent('error', Date.now() - startTime, 0, error instanceof Error ? error.message : String(error));
          throw error;
        }

        // Clean up old backups
        await this.cleanupOldBackups();
      });
    } finally {
      release();
    }
  }

  /**
   * Create a backup of the current data file
   * @param reason - Reason for creating backup
   * @returns Promise resolving to backup file path
   */
  async backup(reason = 'manual'): Promise<string> {
    const release = await this.mutex.acquire();
    try {
      return await this.performWithRetry(async () => {
        if (!(await this.fileExists(this.filePath))) {
          throw new Error('Cannot backup: source file does not exist');
        }

        await this.ensureBackupDirectory();

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = path.basename(this.filePath, path.extname(this.filePath));
        const extension = path.extname(this.filePath);
        const backupPath = path.join(this.backupDir, `${fileName}_${timestamp}_${reason}${extension}`);

        await fs.copyFile(this.filePath, backupPath);
        
        logger.info(`Backup created: ${backupPath} (reason: ${reason})`);
        return backupPath;
      });
    } finally {
      release();
    }
  }

  /**
   * Restore data from a backup file
   * @param backupPath - Path to backup file to restore from
   */
  async restore(backupPath: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.performWithRetry(async () => {
        if (!(await this.fileExists(backupPath))) {
          throw new Error(`Backup file does not exist: ${backupPath}`);
        }

        // Validate backup data before restore
        const backupContent = await fs.readFile(backupPath, 'utf8');
        const backupData = this.config.serialization.deserialize(backupContent);
        
        if (!this.config.validator(backupData)) {
          throw new Error('Backup data validation failed');
        }

        // Create backup of current state before restore
        if (await this.fileExists(this.filePath)) {
          await this.backup('before_restore');
        }

        // Copy backup to main file
        await fs.copyFile(backupPath, this.filePath);
        
        logger.info(`Data restored from backup: ${backupPath}`);
      });
    } finally {
      release();
    }
  }

  /**
   * Apply a migration function to the data
   * @param migrationFn - Function to transform the data
   */
  async migrate(migrationFn: MigrationFunction<T>): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.performWithRetry(async () => {
        // Load current data (raw, without validation)
        let currentData: unknown = null;
        if (await this.fileExists(this.filePath)) {
          const content = await fs.readFile(this.filePath, 'utf8');
          currentData = this.config.serialization.deserialize(content);
        }

        // Create backup before migration
        if (currentData !== null) {
          await this.backup('before_migration');
        }

        // Apply migration
        const migratedData = migrationFn(currentData);

        // Validate migrated data
        if (!this.config.validator(migratedData)) {
          throw new Error('Migrated data validation failed');
        }

        // Save migrated data
        await this.saveDirectly(migratedData);
        
        logger.info(`Data migration completed for: ${this.filePath}`);
      });
    } finally {
      release();
    }
  }

  /**
   * Validate data structure
   * @param data - Data to validate
   * @returns True if data is valid
   */
  validate(data: unknown): data is T {
    return this.config.validator(data);
  }

  /**
   * Get list of available backups
   * @returns Promise resolving to array of backup information
   */
  async getBackups(): Promise<BackupInfo[]> {
    try {
      if (!(await this.fileExists(this.backupDir))) {
        return [];
      }

      const files = await fs.readdir(this.backupDir);
      const fileName = path.basename(this.filePath, path.extname(this.filePath));
      const backupFiles = files.filter(file => file.startsWith(fileName));

      const backups: BackupInfo[] = [];
      for (const file of backupFiles) {
        const backupPath = path.join(this.backupDir, file);
        try {
          const stats = await fs.stat(backupPath);
          const parts = file.split('_');
          const reason = parts.length > 2 ? parts.slice(2).join('_').replace(path.extname(file), '') : 'unknown';
          
          backups.push({
            path: backupPath,
            timestamp: stats.mtime.getTime(),
            size: stats.size,
            reason,
          });
        } catch (error) {
          this.debugLog(`Failed to get stats for backup file: ${file}`);
        }
      }

      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('Failed to get backup list:', error);
      return [];
    }
  }

  /**
   * Check if the data file exists
   * @returns Promise resolving to true if file exists
   */
  async exists(): Promise<boolean> {
    return await this.fileExists(this.filePath);
  }

  /**
   * Delete the data file and all backups
   * @param includeBackups - Whether to delete backups as well
   */
  async delete(includeBackups = false): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.performWithRetry(async () => {
        // Delete main file
        if (await this.fileExists(this.filePath)) {
          await fs.unlink(this.filePath);
          logger.info(`Deleted data file: ${this.filePath}`);
        }

        // Delete backups if requested
        if (includeBackups) {
          const backups = await this.getBackups();
          for (const backup of backups) {
            try {
              await fs.unlink(backup.path);
              this.debugLog(`Deleted backup: ${backup.path}`);
            } catch (error) {
              logger.warn(`Failed to delete backup ${backup.path}:`, error);
            }
          }
        }
      });
    } finally {
      release();
    }
  }

  /**
   * Get file statistics
   * @returns Promise resolving to file stats or null if file doesn't exist
   */
  async getStats(): Promise<{ size: number; lastModified: Date; created: Date } | null> {
    try {
      if (!(await this.fileExists(this.filePath))) {
        return null;
      }

      const stats = await fs.stat(this.filePath);
      return {
        size: stats.size,
        lastModified: stats.mtime,
        created: stats.birthtime,
      };
    } catch (error) {
      logger.error('Failed to get file stats:', error);
      return null;
    }
  }

  /**
   * Get performance metrics
   * @returns Current performance metrics
   */
  getMetrics(): DataStoreMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      saveCount: 0,
      loadCount: 0,
      avgSaveLatency: 0,
      avgLoadLatency: 0,
      errorCount: 0,
      retryCount: 0,
      lastOperationTime: 0,
      totalBytesWritten: 0,
      totalBytesRead: 0
    };
  }

  /**
   * Start a batch transaction
   * @returns Batch transaction builder
   */
  batch(): BatchApi<T> {
    if (this.currentBatch) {
      throw new Error('Batch transaction already in progress');
    }

    this.currentBatch = {
      operations: [],
      committed: false
    };

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const dataStore = this;
    
    const batchApi: BatchApi<T> = {
      update(storePath: string, data: T) {
        if (!dataStore.currentBatch) {
          throw new Error('No batch transaction in progress');
        }
        dataStore.currentBatch.operations.push({ type: 'update', storePath, data });
        return batchApi;
      },
      
      delete(storePath: string) {
        if (!dataStore.currentBatch) {
          throw new Error('No batch transaction in progress');
        }
        dataStore.currentBatch.operations.push({ type: 'delete', storePath });
        return batchApi;
      },
      
      async commit() {
        if (!dataStore.currentBatch) {
          throw new Error('No batch transaction in progress');
        }
        await dataStore.commitBatch();
      },
      
      rollback() {
        if (!dataStore.currentBatch) {
          throw new Error('No batch transaction in progress');
        }
        dataStore.currentBatch = null;
      }
    };

    return batchApi;
  }

  /**
   * Execute health check
   * @returns Health check result
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    fileExists: boolean;
    readable: boolean;
    writable: boolean;
    metrics: DataStoreMetrics;
  }> {
    const fileExists = await this.exists();
    let readable = false;
    let writable = false;

    if (fileExists) {
      try {
        await this.load();
        readable = true;
      } catch {
        // Not readable
      }
    }

    try {
      // Test write with a minimal operation
      const testPath = `${this.filePath}.health.${Date.now()}`;
      await fs.writeFile(testPath, '{}', 'utf8');
      await fs.unlink(testPath);
      writable = true;
    } catch {
      // Not writable
    }

    return {
      healthy: fileExists && readable && writable,
      fileExists,
      readable,
      writable,
      metrics: this.getMetrics()
    };
  }

  /**
   * Add custom validation hook
   * @param validator - Additional validation function
   */
  addValidationHook(validator: DataValidator<T>): void {
    const originalValidator = this.config.validator;
    this.config.validator = (data: unknown): data is T => {
      return originalValidator(data) && validator(data);
    };
  }

  // Private helper methods

  /**
   * Perform operation with retry logic
   */
  private async performWithRetry<R>(operation: () => Promise<R>): Promise<R> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.config.maxRetries) {
          throw lastError;
        }

        // Track retry metrics
        this.metrics.retryCount++;

        // Exponential backoff with jitter
        const baseDelay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.3 * baseDelay; // Add 0-30% jitter
        const delay = Math.min(baseDelay + jitter, 10000); // Cap at 10 seconds
        
        this.debugLog(`Retry ${attempt}/${this.config.maxRetries} after ${delay}ms delay: ${lastError.message}`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Recover data from the most recent backup
   */
  private async recoverFromBackup(): Promise<T | null> {
    try {
      const backups = await this.getBackups();
      if (backups.length === 0) {
        logger.warn('No backups available for recovery');
        return null;
      }

      const latestBackup = backups[0];
      logger.info(`Attempting recovery from backup: ${latestBackup.path}`);

      const content = await fs.readFile(latestBackup.path, 'utf8');
      const data = this.config.serialization.deserialize(content);

      if (!this.config.validator(data)) {
        throw new Error('Backup data validation failed');
      }

      // Restore the backup to main file
      await fs.copyFile(latestBackup.path, this.filePath);
      logger.info('Successfully recovered from backup');

      return data as T;
    } catch (error) {
      logger.error('Backup recovery failed:', error);
      return null;
    }
  }

  /**
   * Save data directly without backup or atomic operations
   */
  private async saveDirectly(data: T): Promise<void> {
    const content = this.config.serialization.serialize(data);
    await fs.writeFile(this.filePath, content, { 
      mode: this.config.fileMode,
      encoding: 'utf8'
    });
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDirectory(): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  /**
   * Clean up old backup files
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.getBackups();
      if (backups.length <= this.config.maxBackups) {
        return;
      }

      const toDelete = backups.slice(this.config.maxBackups);
      for (const backup of toDelete) {
        try {
          await fs.unlink(backup.path);
          this.debugLog(`Cleaned up old backup: ${backup.path}`);
        } catch (error) {
          logger.warn(`Failed to cleanup backup ${backup.path}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Debug logging helper
   */
  private debugLog(message: string): void {
    if (this.config.enableDebugLogging) {
      logger.debug(`[DataStore] ${message}`);
    }
  }

  /**
   * Check if file is compressed by attempting to read its header
   */
  private async isFileCompressed(): Promise<boolean> {
    try {
      const fd = await fs.open(this.filePath, 'r');
      const buffer = Buffer.alloc(2);
      await fd.read(buffer, 0, 2, 0);
      await fd.close();
      
      // Check for gzip magic number
      return buffer[0] === 0x1f && buffer[1] === 0x8b;
    } catch {
      return false;
    }
  }

  /**
   * Update load metrics
   */
  private updateLoadMetrics(latency: number, bytesRead: number): void {
    this.metrics.loadCount++;
    this.metrics.totalBytesRead += bytesRead;
    this.metrics.avgLoadLatency = 
      (this.metrics.avgLoadLatency * (this.metrics.loadCount - 1) + latency) / this.metrics.loadCount;
    this.metrics.lastOperationTime = Date.now();
  }

  /**
   * Update save metrics
   */
  private updateSaveMetrics(latency: number, bytesWritten: number): void {
    this.metrics.saveCount++;
    this.metrics.totalBytesWritten += bytesWritten;
    this.metrics.avgSaveLatency = 
      (this.metrics.avgSaveLatency * (this.metrics.saveCount - 1) + latency) / this.metrics.saveCount;
    this.metrics.lastOperationTime = Date.now();
  }

  /**
   * Commit batch operations
   */
  private async commitBatch(): Promise<void> {
    if (!this.currentBatch || this.currentBatch.committed) {
      throw new Error('No pending batch operations to commit');
    }

    const batchRelease = await this.batchMutex.acquire();
    const backupPaths: string[] = [];

    try {
      // Create backups of all affected files
      for (const op of this.currentBatch.operations) {
        if (op.type === 'update' && await this.fileExists(op.storePath)) {
          const backupPath = await this.backupFile(op.storePath, 'batch_commit');
          backupPaths.push(backupPath);
        }
      }

      // Execute all operations
      for (const op of this.currentBatch.operations) {
        try {
          if (op.type === 'update' && op.data) {
            const store = new DataStore<T>(op.storePath, this.config);
            await store.save(op.data);
          } else if (op.type === 'delete') {
            if (await this.fileExists(op.storePath)) {
              await fs.unlink(op.storePath);
            }
          }
        } catch (error) {
          // Rollback on failure
          logger.error(`Batch operation failed, rolling back: ${error}`);
          await this.rollbackBatch(backupPaths);
          throw error;
        }
      }

      this.currentBatch.committed = true;
      this.currentBatch = null;
      
      // Clean up backup files after successful commit
      for (const backupPath of backupPaths) {
        try {
          await fs.unlink(backupPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    } finally {
      batchRelease();
    }
  }

  /**
   * Rollback batch operations
   */
  private async rollbackBatch(backupPaths: string[]): Promise<void> {
    for (const backupPath of backupPaths) {
      try {
        const originalPath = backupPath.replace(/\.batch_commit_\d+.*$/, '');
        await fs.copyFile(backupPath, originalPath);
      } catch (error) {
        logger.error(`Failed to rollback file from ${backupPath}:`, error);
      }
    }
    this.currentBatch = null;
  }

  /**
   * Create backup of any file (used for batch operations)
   */
  private async backupFile(filePath: string, reason: string): Promise<string> {
    const timestamp = Date.now();
    const backupPath = `${filePath}.${reason}_${timestamp}.bak`;
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }

  /**
   * Get connection from pool
   */
  private async getConnection(): Promise<PoolEntry> {
    // Clean up stale connections
    const now = Date.now();
    for (const [connId, entry] of this.connectionPool) {
      if (!entry.busy && now - entry.lastUsed > 60000) { // 1 minute timeout
        this.connectionPool.delete(connId);
      }
    }

    // Find available connection
    for (const [, entry] of this.connectionPool) {
      if (!entry.busy) {
        entry.busy = true;
        entry.lastUsed = now;
        return entry;
      }
    }

    // Create new connection if under limit
    if (this.connectionPool.size < this.maxConnections) {
      const id = `conn_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const entry: PoolEntry = { busy: true, lastUsed: now };
      this.connectionPool.set(id, entry);
      return entry;
    }

    // Wait for available connection
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.getConnection();
  }

  /**
   * Release connection back to pool
   */
  private releaseConnection(entry: PoolEntry): void {
    entry.busy = false;
    entry.lastUsed = Date.now();
  }

  /**
   * Add monitoring hook for analytics collection
   */
  addMonitoringHook(hook: (event: string, latency: number, bytes: number, error?: string) => void): void {
    this.monitoringHooks.push(hook);
  }

  /**
   * Remove monitoring hook
   */
  removeMonitoringHook(hook: (event: string, latency: number, bytes: number, error?: string) => void): void {
    const index = this.monitoringHooks.indexOf(hook);
    if (index > -1) {
      this.monitoringHooks.splice(index, 1);
    }
  }

  /**
   * Emit monitoring event to all registered hooks
   */
  private emitMonitoringEvent(event: string, latency: number, bytes: number, error?: string): void {
    for (const hook of this.monitoringHooks) {
      try {
        hook(event, latency, bytes, error);
      } catch (hookError) {
        // Don't let monitoring hooks break the main operation
        this.debugLog(`Monitoring hook error: ${hookError}`);
      }
    }
  }
}

/**
 * Factory function to create a DataStore with common configurations
 */
export function createDataStore<T>(
  filePath: string,
  config: DataStoreConfig<T> = {}
): DataStore<T> {
  return new DataStore<T>(filePath, config);
}

/**
 * Factory function to create a DataStore with JSON serialization and validation
 */
export function createJsonDataStore<T>(
  filePath: string,
  validator: DataValidator<T>,
  config: Omit<DataStoreConfig<T>, 'validator' | 'serialization'> = {}
): DataStore<T> {
  return new DataStore<T>(filePath, {
    ...config,
    validator,
    serialization: new JsonSerializationStrategy(),
  });
}