#!/usr/bin/env node
/**
 * Configuration Migration Script
 * Migrates from deprecated environment variables to new configuration system
 * Provides automated migration with backup and validation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { logger } from '../src/utils/logger';

interface MigrationResult {
  success: boolean;
  migratedVariables: string[];
  warnings: string[];
  errors: string[];
  backupPath?: string;
  recommendations: string[];
}

interface DeprecatedMapping {
  old: string;
  new: string;
  transform?: (value: string) => string;
  defaultValue?: string;
  notes?: string;
}

/**
 * Configuration Migrator for transitioning to new configuration system
 */
export class ConfigurationMigrator {
  private readonly deprecatedMappings: DeprecatedMapping[] = [
    // API Key migrations
    {
      old: 'GEMINI_API_KEY',
      new: 'GOOGLE_API_KEY',
      notes: 'Unified Google API key for all services'
    },
    
    // Model configuration migrations
    {
      old: 'GEMINI_MODEL',
      new: 'GEMINI_MODEL',
      defaultValue: 'gemini-2.0-flash-exp',
      notes: 'Latest model version with enhanced capabilities'
    },
    
    // Thinking mode migrations
    {
      old: 'THINKING_BUDGET',
      new: 'GEMINI_THINKING_BUDGET',
      defaultValue: '20000',
      notes: 'Moved to GEMINI namespace for consistency'
    },
    {
      old: 'INCLUDE_THOUGHTS',
      new: 'GEMINI_INCLUDE_THOUGHTS',
      defaultValue: 'false',
      notes: 'Moved to GEMINI namespace'
    },
    {
      old: 'FORCE_THINKING_PROMPT',
      new: 'GEMINI_FORCE_THINKING_MODE',
      defaultValue: 'false',
      notes: 'Renamed for clarity'
    },
    {
      old: 'THINKING_TRIGGER',
      new: 'GEMINI_THINKING_TRIGGER',
      defaultValue: 'Please think step-by-step before answering.',
      notes: 'Moved to GEMINI namespace'
    },
    
    // Code execution migrations
    {
      old: 'ENABLE_CODE_EXECUTION',
      new: 'GEMINI_ENABLE_CODE_EXECUTION',
      defaultValue: 'false',
      notes: 'Moved to GEMINI namespace'
    },
    {
      old: 'ENABLE_STRUCTURED_OUTPUT',
      new: 'GEMINI_ENABLE_STRUCTURED_OUTPUT',
      defaultValue: 'false',
      notes: 'Moved to GEMINI namespace'
    },
    
    // Vision profile migrations
    {
      old: 'VISION_PROFILE',
      new: 'GEMINI_VISION_PROFILE',
      defaultValue: 'HIGH_ACCURACY_VISION',
      notes: 'Moved to GEMINI namespace for consistency'
    },
    
    // Video support migrations
    {
      old: 'VIDEO_SUPPORT_ENABLED',
      new: 'VIDEO_SUPPORT_ENABLED',
      defaultValue: 'false',
      notes: 'Video processing feature flag'
    },
    {
      old: 'MAX_VIDEO_DURATION_SECONDS',
      new: 'MAX_VIDEO_DURATION_SECONDS',
      defaultValue: '83',
      notes: 'Maximum 83 seconds to stay within token limits'
    },
    {
      old: 'VIDEO_TOKEN_WARNING_THRESHOLD',
      new: 'VIDEO_TOKEN_WARNING_THRESHOLD',
      defaultValue: '25000',
      notes: 'Token usage warning threshold'
    },
    {
      old: 'YOUTUBE_URL_SUPPORT_ENABLED',
      new: 'YOUTUBE_URL_SUPPORT_ENABLED',
      defaultValue: 'true',
      notes: 'YouTube URL processing support'
    },
    {
      old: 'VIDEO_FILE_SIZE_LIMIT_MB',
      new: 'VIDEO_FILE_SIZE_LIMIT_MB',
      defaultValue: '20',
      notes: 'Maximum video file size in MB'
    },
    {
      old: 'REQUIRE_VIDEO_CONFIRMATION',
      new: 'REQUIRE_VIDEO_CONFIRMATION',
      defaultValue: 'false',
      notes: 'Require user confirmation for video processing'
    },
    
    // Audio support migrations
    {
      old: 'AUDIO_SUPPORT_ENABLED',
      new: 'AUDIO_SUPPORT_ENABLED',
      defaultValue: 'false',
      notes: 'Audio processing feature flag'
    },
    {
      old: 'MAX_AUDIO_DURATION_MINUTES',
      new: 'MAX_AUDIO_DURATION_MINUTES',
      defaultValue: '5',
      notes: 'Maximum audio duration in minutes'
    },
    {
      old: 'AUDIO_FILE_SIZE_LIMIT_MB',
      new: 'AUDIO_FILE_SIZE_LIMIT_MB',
      defaultValue: '10',
      notes: 'Maximum audio file size in MB'
    },
    
    // Health monitoring migrations
    {
      old: 'METRICS_RETENTION_HOURS',
      new: 'METRICS_RETENTION_DAYS',
      transform: (value: string) => String(Math.ceil(parseInt(value) / 24)),
      defaultValue: '1',
      notes: 'Changed from hours to days for clarity'
    }
  ];

  private envPath: string;
  private backupDir: string;

  constructor(envPath: string = '.env', backupDir: string = './backups') {
    this.envPath = envPath;
    this.backupDir = backupDir;
  }

  /**
   * Execute the migration process
   */
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedVariables: [],
      warnings: [],
      errors: [],
      recommendations: []
    };

    try {
      // Step 1: Create backup
      result.backupPath = await this.createBackup();
      logger.info(`Created backup at: ${result.backupPath}`);

      // Step 2: Load current environment
      const envConfig = dotenv.parse(fs.readFileSync(this.envPath, 'utf8'));
      const newConfig: Record<string, string> = { ...envConfig };

      // Step 3: Apply migrations
      for (const mapping of this.deprecatedMappings) {
        const migrated = this.migrateVariable(mapping, envConfig, newConfig, result);
        if (migrated) {
          result.migratedVariables.push(`${mapping.old} -> ${mapping.new}`);
        }
      }

      // Step 4: Apply new defaults for features not previously configured
      this.applyNewDefaults(newConfig, result);

      // Step 5: Validate final configuration
      const validationErrors = this.validateConfiguration(newConfig);
      if (validationErrors.length > 0) {
        result.errors.push(...validationErrors);
        throw new Error('Configuration validation failed');
      }

      // Step 6: Write new configuration
      await this.writeConfiguration(newConfig);

      // Step 7: Generate recommendations
      this.generateRecommendations(newConfig, result);

      result.success = true;
      logger.info('Migration completed successfully');

    } catch (error) {
      result.success = false;
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error('Migration failed', error);
    }

    return result;
  }

  /**
   * Create backup of current configuration
   */
  private async createBackup(): Promise<string> {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `env-backup-${timestamp}.env`);
    
    fs.copyFileSync(this.envPath, backupPath);
    return backupPath;
  }

  /**
   * Migrate a single variable according to mapping
   */
  private migrateVariable(
    mapping: DeprecatedMapping,
    oldConfig: Record<string, string>,
    newConfig: Record<string, string>,
    result: MigrationResult
  ): boolean {
    const oldValue = oldConfig[mapping.old];
    const existingNewValue = oldConfig[mapping.new];

    // Skip if old variable doesn't exist
    if (!oldValue) {
      return false;
    }

    // Handle conflict if new variable already exists
    if (existingNewValue && existingNewValue !== oldValue) {
      result.warnings.push(
        `Conflict: ${mapping.old}="${oldValue}" but ${mapping.new}="${existingNewValue}" already exists. Keeping existing value.`
      );
      if (mapping.notes) {
        result.warnings.push(`  Note: ${mapping.notes}`);
      }
      // Remove the old variable to avoid confusion
      delete newConfig[mapping.old];
      return false;
    }

    // Apply transformation if needed
    let newValue = oldValue;
    if (mapping.transform) {
      newValue = mapping.transform(oldValue);
    }

    // Set the new variable
    newConfig[mapping.new] = newValue;

    // Remove the old variable if it's different from new
    if (mapping.old !== mapping.new) {
      delete newConfig[mapping.old];
    }

    // Add notes if available
    if (mapping.notes) {
      result.recommendations.push(`${mapping.new}: ${mapping.notes}`);
    }

    return true;
  }

  /**
   * Apply new defaults for features not previously configured
   */
  private applyNewDefaults(config: Record<string, string>, result: MigrationResult): void {
    const newDefaults: Record<string, string> = {
      // New feature flags with sensible defaults
      'FEATURE_FLAGS_ENABLED': 'true',
      'FEATURE_ROLLOUT_PERCENTAGE': '100',
      'CONFIG_HOT_RELOAD_ENABLED': 'false',
      'CONFIG_AUDIT_ENABLED': 'true',
      
      // Enhanced monitoring defaults
      'MONITORING_EVENTS_ENABLED': 'true',
      'MONITORING_ALERT_CHANNELS': '',
      
      // Performance optimization defaults
      'CACHE_COMPRESSION_ENABLED': 'true',
      'CONTEXT_COMPRESSION_ENABLED': 'true',
      
      // New multimodal defaults
      'MULTIMODAL_BATCH_SIZE': '5',
      'MULTIMODAL_TIMEOUT_MS': '30000',
      
      // Configuration profiles
      'CONFIG_PROFILE': 'production',
      'CONFIG_VALIDATION_STRICT': 'true'
    };

    for (const [key, value] of Object.entries(newDefaults)) {
      if (!(key in config)) {
        config[key] = value;
        result.recommendations.push(`Added new configuration: ${key}=${value}`);
      }
    }
  }

  /**
   * Validate the final configuration
   */
  private validateConfiguration(config: Record<string, string>): string[] {
    const errors: string[] = [];

    // Required variables
    const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'GOOGLE_API_KEY'];
    for (const key of required) {
      if (!config[key]) {
        errors.push(`Missing required variable: ${key}`);
      }
    }

    // Validate numeric ranges
    const numericValidations = [
      { key: 'RATE_LIMIT_RPM', min: 1, max: 60 },
      { key: 'RATE_LIMIT_DAILY', min: 1, max: 10000 },
      { key: 'GEMINI_TEMPERATURE', min: 0, max: 2, float: true },
      { key: 'GEMINI_TOP_P', min: 0, max: 1, float: true },
      { key: 'GEMINI_TOP_K', min: 1, max: 100 },
      { key: 'GEMINI_THINKING_BUDGET', min: 0, max: 100000 },
      { key: 'MAX_VIDEO_DURATION_SECONDS', min: 1, max: 300 },
      { key: 'VIDEO_FILE_SIZE_LIMIT_MB', min: 1, max: 100 },
      { key: 'CACHE_MAX_SIZE', min: 10, max: 10000 },
      { key: 'CONTEXT_MAX_MESSAGES', min: 1, max: 1000 }
    ];

    for (const validation of numericValidations) {
      const value = config[validation.key];
      if (value) {
        const num = validation.float ? parseFloat(value) : parseInt(value);
        if (isNaN(num) || num < validation.min || num > validation.max) {
          errors.push(
            `${validation.key} must be between ${validation.min} and ${validation.max}, got: ${value}`
          );
        }
      }
    }

    // Validate boolean values
    const booleanKeys = [
      'VIDEO_SUPPORT_ENABLED',
      'AUDIO_SUPPORT_ENABLED',
      'GEMINI_INCLUDE_THOUGHTS',
      'GEMINI_ENABLE_CODE_EXECUTION',
      'GEMINI_ENABLE_STRUCTURED_OUTPUT',
      'GEMINI_ENABLE_GOOGLE_SEARCH',
      'UNFILTERED_MODE',
      'FEATURE_FLAGS_ENABLED',
      'CONFIG_HOT_RELOAD_ENABLED',
      'CONFIG_AUDIT_ENABLED'
    ];

    for (const key of booleanKeys) {
      const value = config[key];
      if (value && !['true', 'false'].includes(value.toLowerCase())) {
        errors.push(`${key} must be 'true' or 'false', got: ${value}`);
      }
    }

    // Business rule validations
    if (config.RATE_LIMIT_BURST && config.RATE_LIMIT_RPM) {
      const burst = parseInt(config.RATE_LIMIT_BURST);
      const rpm = parseInt(config.RATE_LIMIT_RPM);
      if (burst > rpm) {
        errors.push(`RATE_LIMIT_BURST (${burst}) should not exceed RATE_LIMIT_RPM (${rpm})`);
      }
    }

    return errors;
  }

  /**
   * Write the new configuration to file
   */
  private async writeConfiguration(config: Record<string, string>): Promise<void> {
    const lines: string[] = [
      '# ================================',
      '# Configuration migrated by ConfigurationMigrator',
      `# Migration date: ${new Date().toISOString()}`,
      '# ================================',
      ''
    ];

    // Group configurations by category
    const categories: Record<string, string[]> = {
      'REQUIRED': ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'GOOGLE_API_KEY'],
      'BASIC': ['NODE_ENV', 'LOG_LEVEL', 'RATE_LIMIT_RPM', 'RATE_LIMIT_DAILY'],
      'GEMINI': Object.keys(config).filter(k => k.startsWith('GEMINI_')),
      'VIDEO': Object.keys(config).filter(k => k.includes('VIDEO')),
      'AUDIO': Object.keys(config).filter(k => k.includes('AUDIO')),
      'FEATURES': Object.keys(config).filter(k => k.includes('FEATURE') || k.includes('CONFIG')),
      'CONTEXT': Object.keys(config).filter(k => k.startsWith('CONTEXT_')),
      'MONITORING': Object.keys(config).filter(k => k.includes('MONITOR') || k.includes('METRIC') || k.includes('HEALTH')),
      'OTHER': []
    };

    // Collect remaining keys
    const categorizedKeys = new Set(Object.values(categories).flat());
    categories.OTHER = Object.keys(config).filter(k => !categorizedKeys.has(k)) as string[];

    // Write each category
    for (const [category, keys] of Object.entries(categories)) {
      if (keys.length === 0) continue;

      lines.push('', `# ================================`, `# ${category}`, `# ================================`);
      
      for (const key of keys.sort()) {
        const value = config[key];
        if (value !== undefined) {
          lines.push(`${key}=${value}`);
        }
      }
    }

    fs.writeFileSync(this.envPath, lines.join('\n'));
  }

  /**
   * Generate recommendations based on configuration
   */
  private generateRecommendations(config: Record<string, string>, result: MigrationResult): void {
    // Performance recommendations
    if (config.VIDEO_SUPPORT_ENABLED === 'true' && config.AUDIO_SUPPORT_ENABLED === 'true') {
      result.recommendations.push(
        'Consider disabling either video or audio support if not actively used to reduce resource consumption'
      );
    }

    // Security recommendations
    if (config.UNFILTERED_MODE === 'true') {
      result.recommendations.push(
        'WARNING: UNFILTERED_MODE is enabled. Ensure this is intentional and monitor bot responses carefully'
      );
    }

    // Feature recommendations
    if (config.GEMINI_ENABLE_GOOGLE_SEARCH === 'true' && !config.GEMINI_GOOGLE_SEARCH_THRESHOLD) {
      result.recommendations.push(
        'Consider setting GEMINI_GOOGLE_SEARCH_THRESHOLD to control when web search is triggered'
      );
    }

    // Model recommendations
    if (config.GEMINI_MODEL && !config.GEMINI_MODEL.includes('2.0')) {
      result.recommendations.push(
        'Consider upgrading to gemini-2.0-flash-exp for improved performance and capabilities'
      );
    }

    // Monitoring recommendations
    if (config.NODE_ENV === 'production' && config.CONFIG_AUDIT_ENABLED !== 'true') {
      result.recommendations.push(
        'Enable CONFIG_AUDIT_ENABLED in production for configuration change tracking'
      );
    }
  }

  /**
   * Generate migration report
   */
  generateReport(result: MigrationResult): string {
    const report = [
      '# Configuration Migration Report',
      `Date: ${new Date().toISOString()}`,
      `Status: ${result.success ? 'SUCCESS' : 'FAILED'}`,
      ''
    ];

    if (result.backupPath) {
      report.push(`## Backup`, `Configuration backed up to: ${result.backupPath}`, '');
    }

    if (result.migratedVariables.length > 0) {
      report.push('## Migrated Variables', ...result.migratedVariables.map(v => `- ${v}`), '');
    }

    if (result.warnings.length > 0) {
      report.push('## Warnings', ...result.warnings.map(w => `- ${w}`), '');
    }

    if (result.errors.length > 0) {
      report.push('## Errors', ...result.errors.map(e => `- ${e}`), '');
    }

    if (result.recommendations.length > 0) {
      report.push('## Recommendations', ...result.recommendations.map(r => `- ${r}`), '');
    }

    return report.join('\n');
  }
}

// Command-line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const envPath = args[0] || '.env';
  const backupDir = args[1] || './backups';

  console.log('Configuration Migration Tool');
  console.log('===========================');
  console.log(`Environment file: ${envPath}`);
  console.log(`Backup directory: ${backupDir}`);
  console.log('');

  const migrator = new ConfigurationMigrator(envPath, backupDir);
  
  migrator.migrate().then(result => {
    const report = migrator.generateReport(result);
    console.log(report);
    
    if (!result.success) {
      process.exit(1);
    }
  }).catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}