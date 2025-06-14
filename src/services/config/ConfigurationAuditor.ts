import * as fs from 'fs-extra';
import { logger } from '../../utils/logger';
import { DataStore, DataValidator } from '../../utils/DataStore';
import { dataStoreFactory } from '../../utils/DataStoreFactory';
import { 
  BotConfiguration, 
  ConfigurationChange,
  IConfigurationAuditor
} from '../interfaces/ConfigurationInterfaces';

/**
 * ConfigurationAuditor - Handles audit logging and compliance
 * 
 * Responsibilities:
 * - Audit logging of configuration changes
 * - Change tracking and history
 * - Compliance checks and reporting
 * - Change detection and analysis
 */
export class ConfigurationAuditor implements IConfigurationAuditor {
  private auditLogDataStore: DataStore<ConfigurationChange[]>;

  constructor(
    private auditLogPath: string
  ) {
    // Initialize audit log DataStore with configuration change validation
    const auditLogValidator: DataValidator<ConfigurationChange[]> = (data: unknown): data is ConfigurationChange[] => {
      if (!Array.isArray(data)) {
        return false;
      }
      
      return data.every(change => 
        typeof change === 'object' &&
        change !== null &&
        typeof change.timestamp === 'string' &&
        typeof change.version === 'string' &&
        typeof change.modifiedBy === 'string' &&
        ['create', 'update', 'reload', 'rollback'].includes(change.changeType) &&
        Array.isArray(change.path) &&
        ['file', 'command', 'environment', 'api'].includes(change.source)
      );
    };
    
    this.auditLogDataStore = dataStoreFactory.createCustomStore<ConfigurationChange[]>(
      this.auditLogPath.replace('.log', '.json'),
      {
        validator: auditLogValidator,
        maxBackups: 10,
        maxRetries: 5,
        retryDelayMs: 200,
        createDirectories: true,
        fileMode: 0o644,
        enableDebugLogging: false,
        compressionEnabled: true,
        compressionThreshold: 4096 // Compress audit log if larger than 4KB
      }
    );
  }

  /**
   * Log a configuration change
   */
  async logConfigurationChange(change: ConfigurationChange): Promise<void> {
    try {
      // Load existing audit log or initialize empty array
      const existingLog = await this.auditLogDataStore.load() || [];
      
      // Add new change to the log
      const updatedLog = [...existingLog, change];
      
      // Save updated log with atomic write operation
      await this.auditLogDataStore.save(updatedLog);
      
      logger.debug(`Logged configuration change: ${change.changeType} at ${change.path.join('.')}`);
    } catch (error) {
      logger.error('Failed to log configuration change:', error);
      // Fallback to original fs method for backward compatibility
      try {
        const logEntry = JSON.stringify(change) + '\n';
        await fs.appendFile(this.auditLogPath, logEntry);
        logger.warn('Used fallback file logging for configuration change');
      } catch (fallbackError) {
        logger.error('Fallback logging also failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Log multiple configuration changes
   */
  async logConfigurationChanges(changes: ConfigurationChange[], source: string, reason?: string): Promise<void> {
    for (const change of changes) {
      change.source = source as 'file' | 'command' | 'environment' | 'api';
      change.reason = reason;
      await this.logConfigurationChange(change);
    }
  }

  /**
   * Detect changes between two configurations
   */
  detectChanges(oldConfig: BotConfiguration, newConfig: BotConfiguration): ConfigurationChange[] {
    const changes: ConfigurationChange[] = [];
    const timestamp = new Date().toISOString();

    const compareObjects = (old: unknown, current: Record<string, unknown>, path: string[] = []): void => {
      for (const key in current) {
        const currentPath = [...path, key];
        const oldValue = (old as Record<string, unknown>)?.[key];
        const newValue = current[key];

        if (typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue)) {
          compareObjects(oldValue, newValue as Record<string, unknown>, currentPath);
        } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push({
            timestamp,
            version: newConfig.version,
            modifiedBy: newConfig.modifiedBy,
            changeType: 'update',
            path: currentPath,
            oldValue,
            newValue,
            source: 'file'
          });
        }
      }
    };

    compareObjects(oldConfig as unknown, newConfig as unknown as Record<string, unknown>);
    return changes;
  }

  /**
   * Get audit log entries
   */
  async getAuditLog(limit = 100): Promise<ConfigurationChange[]> {
    try {
      // Try to load from DataStore first
      const auditLog = await this.auditLogDataStore.load();
      
      if (auditLog && Array.isArray(auditLog)) {
        // Return the last N entries, newest first
        const limitedLog = auditLog.slice(-limit).reverse();
        logger.debug(`Retrieved ${limitedLog.length} audit log entries from DataStore`);
        return limitedLog;
      }
      
      // Fallback to legacy file format for backward compatibility
      logger.info('DataStore audit log empty, attempting legacy file format migration');
      return await this.migrateLegacyAuditLog(limit);
      
    } catch (error) {
      logger.error('Failed to read audit log from DataStore:', error);
      
      // Fallback to legacy file format
      try {
        logger.warn('Falling back to legacy audit log format');
        return await this.migrateLegacyAuditLog(limit);
      } catch (fallbackError) {
        logger.error('Legacy audit log fallback also failed:', fallbackError);
        return [];
      }
    }
  }

  /**
   * Migrate legacy audit log format to DataStore format
   */
  private async migrateLegacyAuditLog(limit = 100): Promise<ConfigurationChange[]> {
    try {
      if (!await fs.pathExists(this.auditLogPath)) {
        return [];
      }

      const logContent = await fs.readFile(this.auditLogPath, 'utf-8');
      const lines = logContent.trim().split('\n').filter(line => line.trim());
      const changes: ConfigurationChange[] = [];

      // Parse all lines
      for (let i = 0; i < lines.length; i++) {
        try {
          const change = JSON.parse(lines[i]);
          changes.push(change);
        } catch (error) {
          logger.warn(`Failed to parse legacy audit log line ${i}:`, error);
        }
      }

      // Save migrated data to DataStore
      if (changes.length > 0) {
        try {
          await this.auditLogDataStore.save(changes);
          logger.info(`Successfully migrated ${changes.length} audit log entries to DataStore`);
        } catch (saveError) {
          logger.warn('Failed to save migrated audit log to DataStore:', saveError);
        }
      }

      // Return the last N entries, newest first
      const limitedChanges = changes.slice(-limit).reverse();
      logger.debug(`Retrieved ${limitedChanges.length} audit log entries from legacy format`);
      return limitedChanges;
      
    } catch (error) {
      logger.error('Failed to migrate legacy audit log:', error);
      return [];
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate?: Date, endDate?: Date): Promise<{
    totalChanges: number;
    changesByType: Record<string, number>;
    changesByUser: Record<string, number>;
    changesBySource: Record<string, number>;
    criticalChanges: ConfigurationChange[];
    timeline: { date: string; count: number }[];
  }> {
    const auditLog = await this.getAuditLog(10000); // Get more entries for reporting
    
    // Filter by date range if provided
    const filteredLog = auditLog.filter(change => {
      const changeDate = new Date(change.timestamp);
      if (startDate && changeDate < startDate) return false;
      if (endDate && changeDate > endDate) return false;
      return true;
    });

    // Analyze changes
    const changesByType: Record<string, number> = {};
    const changesByUser: Record<string, number> = {};
    const changesBySource: Record<string, number> = {};
    const criticalChanges: ConfigurationChange[] = [];
    const dailyCounts: Record<string, number> = {};

    for (const change of filteredLog) {
      // Count by type
      changesByType[change.changeType] = (changesByType[change.changeType] || 0) + 1;
      
      // Count by user
      changesByUser[change.modifiedBy] = (changesByUser[change.modifiedBy] || 0) + 1;
      
      // Count by source
      changesBySource[change.source] = (changesBySource[change.source] || 0) + 1;

      // Identify critical changes
      if (this.isCriticalChange(change)) {
        criticalChanges.push(change);
      }

      // Count by day for timeline
      const changeDate = new Date(change.timestamp).toISOString().split('T')[0];
      dailyCounts[changeDate] = (dailyCounts[changeDate] || 0) + 1;
    }

    // Create timeline
    const timeline = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalChanges: filteredLog.length,
      changesByType,
      changesByUser,
      changesBySource,
      criticalChanges,
      timeline
    };
  }

  /**
   * Check if a change is critical
   */
  private isCriticalChange(change: ConfigurationChange): boolean {
    const criticalPaths = [
      ['discord', 'permissions'],
      ['gemini', 'safetySettings'],
      ['rateLimiting'],
      ['features', 'monitoring', 'alerts'],
      ['features', 'roasting', 'psychologicalWarfare']
    ];

    return criticalPaths.some(criticalPath => {
      return change.path.length >= criticalPath.length &&
        criticalPath.every((segment, index) => change.path[index] === segment);
    });
  }

  /**
   * Validate configuration compliance
   */
  async validateCompliance(config: BotConfiguration): Promise<{
    compliant: boolean;
    violations: string[];
    warnings: string[];
  }> {
    const violations: string[] = [];
    const warnings: string[] = [];

    // Check rate limiting compliance
    if (config.rateLimiting.rpm > 60) {
      violations.push('Rate limit RPM exceeds maximum allowed value of 60');
    }

    if (config.rateLimiting.daily > 10000) {
      warnings.push('Daily rate limit is unusually high');
    }

    // Check safety settings compliance
    const unsafeSafetySettings = Object.entries(config.gemini.safetySettings)
      .filter(([, value]) => value === 'block_none');
    
    if (unsafeSafetySettings.length > 0) {
      warnings.push(`Safety settings are disabled for: ${unsafeSafetySettings.map(([key]) => key).join(', ')}`);
    }

    // Check monitoring compliance
    if (!config.features.monitoring.healthMetrics.enabled) {
      warnings.push('Health metrics collection is disabled');
    }

    if (!config.features.monitoring.alerts.enabled) {
      warnings.push('Alert system is disabled');
    }

    // Check data retention compliance
    if (config.features.monitoring.healthMetrics.retentionDays > 90) {
      violations.push('Health metrics retention exceeds 90 days data retention policy');
    }

    // Check memory limits
    if (config.features.contextMemory.maxContextChars > 100000) {
      warnings.push('Context memory limit exceeds recommended maximum');
    }

    return {
      compliant: violations.length === 0,
      violations,
      warnings
    };
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(): Promise<{
    totalEntries: number;
    oldestEntry?: Date;
    newestEntry?: Date;
    averageChangesPerDay: number;
    mostActiveUser?: string;
    mostCommonChangeType?: string;
  }> {
    const auditLog = await this.getAuditLog(10000);
    
    if (auditLog.length === 0) {
      return {
        totalEntries: 0,
        averageChangesPerDay: 0
      };
    }

    // Sort by timestamp
    const sortedLog = [...auditLog].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const oldestEntry = new Date(sortedLog[0].timestamp);
    const newestEntry = new Date(sortedLog[sortedLog.length - 1].timestamp);
    
    // Calculate average changes per day
    const daysDiff = Math.max(1, (newestEntry.getTime() - oldestEntry.getTime()) / (1000 * 60 * 60 * 24));
    const averageChangesPerDay = auditLog.length / daysDiff;

    // Find most active user
    const userCounts: Record<string, number> = {};
    for (const change of auditLog) {
      userCounts[change.modifiedBy] = (userCounts[change.modifiedBy] || 0) + 1;
    }
    const mostActiveUser = Object.entries(userCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    // Find most common change type
    const typeCounts: Record<string, number> = {};
    for (const change of auditLog) {
      typeCounts[change.changeType] = (typeCounts[change.changeType] || 0) + 1;
    }
    const mostCommonChangeType = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    return {
      totalEntries: auditLog.length,
      oldestEntry,
      newestEntry,
      averageChangesPerDay,
      mostActiveUser,
      mostCommonChangeType
    };
  }
}