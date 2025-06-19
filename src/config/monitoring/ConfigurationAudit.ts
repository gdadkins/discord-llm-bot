/**
 * Configuration Audit - Audit Trail and Change Tracking
 * 
 * Provides comprehensive audit trail for configuration changes with:
 * - Track all configuration changes (set, delete, reload, profile_change)
 * - Audit entry management with configurable retention
 * - Significant change detection and alerting
 * - Audit log querying with filters
 * - Audit report generation with analytics
 * 
 * @module ConfigurationAudit
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { configurationManager } from '../ConfigurationManager';
import type { BotConfiguration } from '../../services/interfaces/ConfigurationInterfaces';
import { AuditReport, AuditReportEntry } from '../../types';

/**
 * Audit action types
 */
export type AuditAction = 'set' | 'delete' | 'reload' | 'profile_change' | 'import' | 'export' | 'rollback' | 'validate';

/**
 * Audit entry interface
 */
export interface AuditEntry {
  id: string;
  timestamp: number;
  action: AuditAction;
  path?: string;
  previousValue?: unknown;
  newValue?: unknown;
  modifiedBy: string;
  reason?: string;
  significant: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Audit query filters
 */
export interface AuditQueryFilters {
  fromDate?: Date;
  toDate?: Date;
  action?: AuditAction | AuditAction[];
  path?: string;
  modifiedBy?: string;
  significant?: boolean;
  limit?: number;
}

/**
 * Audit analytics
 */
export interface AuditAnalytics {
  totalChanges: number;
  changesByAction: Record<AuditAction, number>;
  changesByUser: Record<string, number>;
  significantChanges: number;
  mostChangedPaths: Array<{ path: string; count: number }>;
  changeFrequency: Array<{ date: string; count: number }>;
}

/**
 * Audit report options
 */
export interface AuditReportOptions {
  format: 'json' | 'csv' | 'markdown';
  includeAnalytics: boolean;
  includePreviousValues: boolean;
  filters?: AuditQueryFilters;
}

/**
 * Configuration Auditor Events
 */
export interface ConfigurationAuditorEvents {
  'audit:entry-added': (entry: AuditEntry) => void;
  'audit:significant-change': (entry: AuditEntry) => void;
  'audit:retention-cleanup': (removedCount: number) => void;
  'audit:export': (format: string, entryCount: number) => void;
}

/**
 * Configuration Auditor for audit trail management
 */
export class ConfigurationAuditor extends EventEmitter {
  private auditLog: Map<string, AuditEntry> = new Map();
  private auditFilePath: string;
  private retentionDays: number;
  private maxEntries: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  
  // Constants
  private static readonly DEFAULT_RETENTION_DAYS = 90;
  private static readonly DEFAULT_MAX_ENTRIES = 10000;
  private static readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
  
  constructor(
    auditFilePath: string = './data/config-audit.json',
    retentionDays: number = ConfigurationAuditor.DEFAULT_RETENTION_DAYS,
    maxEntries: number = ConfigurationAuditor.DEFAULT_MAX_ENTRIES
  ) {
    super();
    this.auditFilePath = auditFilePath;
    this.retentionDays = retentionDays;
    this.maxEntries = maxEntries;
  }

  /**
   * Initialize auditor
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    try {
      // Ensure audit directory exists
      const dir = path.dirname(this.auditFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Load existing audit log
      await this.loadAuditLog();
      
      // Setup configuration event listeners
      this.setupConfigurationListeners();
      
      // Start retention cleanup
      this.startRetentionCleanup();
      
      this.isInitialized = true;
      logger.info('ConfigurationAuditor initialized', {
        retentionDays: this.retentionDays,
        maxEntries: this.maxEntries,
        currentEntries: this.auditLog.size
      });
    } catch (error) {
      logger.error('Failed to initialize ConfigurationAuditor:', error);
      throw error;
    }
  }

  /**
   * Shutdown auditor
   */
  public async shutdown(): Promise<void> {
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Save final audit log
    await this.saveAuditLog();
    
    // Remove configuration listeners
    this.removeConfigurationListeners();
    
    // Clear state
    this.auditLog.clear();
    this.isInitialized = false;
    
    logger.info('ConfigurationAuditor shutdown completed');
  }

  /**
   * Add audit entry
   */
  public async addAuditEntry(
    action: AuditAction,
    options: {
      path?: string;
      previousValue?: unknown;
      newValue?: unknown;
      modifiedBy?: string;
      reason?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: this.generateAuditId(),
      timestamp: Date.now(),
      action,
      path: options.path,
      previousValue: options.previousValue,
      newValue: options.newValue,
      modifiedBy: options.modifiedBy || 'system',
      reason: options.reason,
      significant: this.isSignificantChange(action, options),
      metadata: options.metadata
    };
    
    // Add to log
    this.auditLog.set(entry.id, entry);
    
    // Emit events
    this.emit('audit:entry-added', entry);
    if (entry.significant) {
      this.emit('audit:significant-change', entry);
      logger.warn('Significant configuration change detected', {
        action: entry.action,
        path: entry.path,
        modifiedBy: entry.modifiedBy
      });
    }
    
    // Check size limits
    if (this.auditLog.size > this.maxEntries) {
      await this.trimOldestEntries();
    }
    
    // Save asynchronously
    this.saveAuditLog().catch(error => {
      logger.error('Failed to save audit log:', error);
    });
    
    return entry;
  }

  /**
   * Query audit log
   */
  public queryAuditLog(filters: AuditQueryFilters = {}): AuditEntry[] {
    let entries = Array.from(this.auditLog.values());
    
    // Apply filters
    if (filters.fromDate) {
      const fromTime = filters.fromDate.getTime();
      entries = entries.filter(e => e.timestamp >= fromTime);
    }
    
    if (filters.toDate) {
      const toTime = filters.toDate.getTime();
      entries = entries.filter(e => e.timestamp <= toTime);
    }
    
    if (filters.action) {
      const actions = Array.isArray(filters.action) ? filters.action : [filters.action];
      entries = entries.filter(e => actions.includes(e.action));
    }
    
    if (filters.path) {
      const filterPath = filters.path;
      entries = entries.filter(e => e.path && e.path.includes(filterPath));
    }
    
    if (filters.modifiedBy) {
      entries = entries.filter(e => e.modifiedBy === filters.modifiedBy);
    }
    
    if (filters.significant !== undefined) {
      entries = entries.filter(e => e.significant === filters.significant);
    }
    
    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply limit
    if (filters.limit && filters.limit > 0) {
      entries = entries.slice(0, filters.limit);
    }
    
    return entries;
  }

  /**
   * Generate audit analytics
   */
  public generateAnalytics(filters: AuditQueryFilters = {}): AuditAnalytics {
    const entries = this.queryAuditLog(filters);
    
    // Initialize counters
    const changesByAction: Record<AuditAction, number> = {
      set: 0,
      delete: 0,
      reload: 0,
      profile_change: 0,
      import: 0,
      export: 0,
      rollback: 0,
      validate: 0
    };
    
    const changesByUser: Record<string, number> = {};
    const pathChanges: Record<string, number> = {};
    const dailyChanges: Record<string, number> = {};
    
    // Process entries
    for (const entry of entries) {
      // Count by action
      changesByAction[entry.action]++;
      
      // Count by user
      changesByUser[entry.modifiedBy] = (changesByUser[entry.modifiedBy] || 0) + 1;
      
      // Count by path
      if (entry.path) {
        pathChanges[entry.path] = (pathChanges[entry.path] || 0) + 1;
      }
      
      // Count by day
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      dailyChanges[date] = (dailyChanges[date] || 0) + 1;
    }
    
    // Get most changed paths
    const mostChangedPaths = Object.entries(pathChanges)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Get change frequency
    const changeFrequency = Object.entries(dailyChanges)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return {
      totalChanges: entries.length,
      changesByAction,
      changesByUser,
      significantChanges: entries.filter(e => e.significant).length,
      mostChangedPaths,
      changeFrequency
    };
  }

  /**
   * Generate audit report
   */
  public async generateReport(options: AuditReportOptions): Promise<string> {
    const entries = this.queryAuditLog(options.filters);
    const analytics = options.includeAnalytics ? this.generateAnalytics(options.filters) : null;
    
    switch (options.format) {
      case 'json':
        return this.generateJsonReport(entries, analytics, options);
      
      case 'csv':
        return this.generateCsvReport(entries, options);
      
      case 'markdown':
        return this.generateMarkdownReport(entries, analytics, options);
      
      default:
        throw new Error(`Unsupported report format: ${options.format}`);
    }
  }

  /**
   * Export audit log
   */
  public async exportAuditLog(
    filePath: string,
    options: AuditReportOptions
  ): Promise<void> {
    const report = await this.generateReport(options);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write report
    await fs.writeFile(filePath, report, 'utf-8');
    
    this.emit('audit:export', options.format, this.queryAuditLog(options.filters).length);
    logger.info(`Audit log exported to ${filePath}`);
  }

  /**
   * Clear audit log
   */
  public async clearAuditLog(reason: string, clearedBy: string): Promise<void> {
    // Add final entry before clearing
    await this.addAuditEntry('delete', {
      metadata: {
        action: 'audit_log_cleared',
        entriesCleared: this.auditLog.size,
        reason,
        clearedBy
      }
    });
    
    // Clear log
    this.auditLog.clear();
    
    // Save empty log
    await this.saveAuditLog();
    
    logger.warn('Audit log cleared', { reason, clearedBy });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Generate unique audit ID
   */
  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Check if change is significant
   */
  private isSignificantChange(
    action: AuditAction,
    options: {
      path?: string;
      previousValue?: unknown;
      newValue?: unknown;
    }
  ): boolean {
    // All rollbacks are significant
    if (action === 'rollback') return true;
    
    // Imports are significant
    if (action === 'import') return true;
    
    // Critical path changes
    const criticalPaths = [
      'discord.token',
      'gemini.apiKey',
      'rateLimiting',
      'features.monitoring.enabled',
      'features.roasting.enabled'
    ];
    
    if (options.path && criticalPaths.some(cp => options.path?.includes(cp))) {
      return true;
    }
    
    // Large value changes
    if (action === 'set' && options.previousValue !== undefined && options.newValue !== undefined) {
      // Check numeric changes
      if (typeof options.previousValue === 'number' && typeof options.newValue === 'number') {
        const changeRatio = Math.abs(options.newValue - options.previousValue) / options.previousValue;
        if (changeRatio > 0.5) return true; // 50% change
      }
    }
    
    return false;
  }

  /**
   * Setup configuration event listeners
   */
  private setupConfigurationListeners(): void {
    // Listen for configuration changes
    configurationManager.on('config:reloaded', (version) => {
      this.addAuditEntry('reload', {
        metadata: { version },
        modifiedBy: 'system'
      });
    });
    
    configurationManager.on('config:validated', (valid, errors) => {
      this.addAuditEntry('validate', {
        metadata: { valid, errors },
        modifiedBy: 'system'
      });
    });
    
    configurationManager.on('config:error', (error) => {
      this.addAuditEntry('set', {
        metadata: { 
          error: error instanceof Error ? error.message : String(error),
          type: 'error',
          significant: true
        },
        modifiedBy: 'system'
      });
    });
  }

  /**
   * Remove configuration event listeners
   */
  private removeConfigurationListeners(): void {
    configurationManager.removeAllListeners('config:reloaded');
    configurationManager.removeAllListeners('config:validated');
    configurationManager.removeAllListeners('config:error');
  }

  /**
   * Start retention cleanup
   */
  private startRetentionCleanup(): void {
    // Run initial cleanup
    this.performRetentionCleanup();
    
    // Setup interval
    this.cleanupInterval = setInterval(() => {
      this.performRetentionCleanup();
    }, ConfigurationAuditor.CLEANUP_INTERVAL_MS);
  }

  /**
   * Perform retention cleanup
   */
  private performRetentionCleanup(): void {
    const cutoffTime = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    let removedCount = 0;
    
    for (const [id, entry] of this.auditLog) {
      if (entry.timestamp < cutoffTime) {
        this.auditLog.delete(id);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      this.emit('audit:retention-cleanup', removedCount);
      logger.info(`Audit retention cleanup: removed ${removedCount} old entries`);
      
      // Save after cleanup
      this.saveAuditLog().catch(error => {
        logger.error('Failed to save audit log after cleanup:', error);
      });
    }
  }

  /**
   * Trim oldest entries when exceeding max
   */
  private async trimOldestEntries(): Promise<void> {
    const entriesToRemove = this.auditLog.size - this.maxEntries + 100; // Remove 100 extra
    
    if (entriesToRemove > 0) {
      const sortedEntries = Array.from(this.auditLog.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      for (let i = 0; i < entriesToRemove; i++) {
        this.auditLog.delete(sortedEntries[i][0]);
      }
      
      logger.info(`Trimmed ${entriesToRemove} oldest audit entries`);
    }
  }

  /**
   * Load audit log from file
   */
  private async loadAuditLog(): Promise<void> {
    try {
      const data = await fs.readFile(this.auditFilePath, 'utf-8');
      const entries: AuditEntry[] = JSON.parse(data);
      
      this.auditLog.clear();
      for (const entry of entries) {
        this.auditLog.set(entry.id, entry);
      }
      
      logger.info(`Loaded ${entries.length} audit entries from disk`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        logger.info('No existing audit log found, starting fresh');
      } else {
        logger.error('Failed to load audit log:', error);
      }
    }
  }

  /**
   * Save audit log to file
   */
  private async saveAuditLog(): Promise<void> {
    try {
      const entries = Array.from(this.auditLog.values());
      const data = JSON.stringify(entries, null, 2);
      
      // Write to temp file first
      const tempFile = `${this.auditFilePath}.tmp`;
      await fs.writeFile(tempFile, data, 'utf-8');
      
      // Rename to actual file (atomic operation)
      await fs.rename(tempFile, this.auditFilePath);
      
      logger.debug(`Saved ${entries.length} audit entries to disk`);
    } catch (error) {
      logger.error('Failed to save audit log:', error);
      throw error;
    }
  }

  /**
   * Generate JSON report
   */
  private generateJsonReport(
    entries: AuditEntry[],
    analytics: AuditAnalytics | null,
    options: AuditReportOptions
  ): string {
    const report: AuditReport = {
      generated: new Date().toISOString(),
      entryCount: entries.length,
      filters: options.filters,
      entries: []
    };
    
    if (analytics) {
      report.analytics = analytics;
    }
    
    report.entries = entries.map(entry => {
      const reportEntry: AuditReportEntry = {
        id: entry.id,
        timestamp: new Date(entry.timestamp).toISOString(),
        action: entry.action,
        path: entry.path || '',
        modifiedBy: entry.modifiedBy,
        reason: entry.reason,
        significant: entry.significant
      };
      
      if (options.includePreviousValues) {
        reportEntry.previousValue = entry.previousValue;
        reportEntry.newValue = entry.newValue;
      }
      
      if (entry.metadata) {
        reportEntry.metadata = entry.metadata;
      }
      
      return reportEntry;
    });
    
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate CSV report
   */
  private generateCsvReport(
    entries: AuditEntry[],
    options: AuditReportOptions
  ): string {
    const headers = [
      'ID',
      'Timestamp',
      'Action',
      'Path',
      'Modified By',
      'Reason',
      'Significant'
    ];
    
    if (options.includePreviousValues) {
      headers.push('Previous Value', 'New Value');
    }
    
    const rows = [headers.join(',')];
    
    for (const entry of entries) {
      const row = [
        entry.id,
        new Date(entry.timestamp).toISOString(),
        entry.action,
        entry.path || '',
        entry.modifiedBy,
        entry.reason || '',
        entry.significant.toString()
      ];
      
      if (options.includePreviousValues) {
        row.push(
          JSON.stringify(entry.previousValue || ''),
          JSON.stringify(entry.newValue || '')
        );
      }
      
      rows.push(row.map(v => `"${v}"`).join(','));
    }
    
    return rows.join('\n');
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdownReport(
    entries: AuditEntry[],
    analytics: AuditAnalytics | null,
    options: AuditReportOptions
  ): string {
    const lines: string[] = [
      '# Configuration Audit Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Total Entries: ${entries.length}`,
      ''
    ];
    
    if (analytics) {
      lines.push(
        '## Analytics Summary',
        '',
        `- Total Changes: ${analytics.totalChanges}`,
        `- Significant Changes: ${analytics.significantChanges}`,
        '',
        '### Changes by Action',
        ...Object.entries(analytics.changesByAction)
          .filter(([_, count]) => count > 0)
          .map(([action, count]) => `- ${action}: ${count}`),
        '',
        '### Top Users',
        ...Object.entries(analytics.changesByUser)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([user, count]) => `- ${user}: ${count} changes`),
        '',
        '### Most Changed Paths',
        ...analytics.mostChangedPaths
          .slice(0, 5)
          .map(({ path, count }) => `- ${path}: ${count} changes`),
        ''
      );
    }
    
    lines.push(
      '## Audit Entries',
      '',
      '| Timestamp | Action | Path | Modified By | Significant |',
      '|-----------|--------|------|-------------|-------------|'
    );
    
    for (const entry of entries.slice(0, 100)) { // Limit to 100 entries in markdown
      lines.push(
        `| ${new Date(entry.timestamp).toISOString()} | ${entry.action} | ${entry.path || '-'} | ${entry.modifiedBy} | ${entry.significant ? '⚠️' : ''} |`
      );
    }
    
    if (entries.length > 100) {
      lines.push('', `... and ${entries.length - 100} more entries`);
    }
    
    return lines.join('\n');
  }
}

// Export singleton instance
export const configurationAuditor = new ConfigurationAuditor();