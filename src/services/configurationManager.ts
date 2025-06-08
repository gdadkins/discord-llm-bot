import { Mutex } from 'async-mutex';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as chokidar from 'chokidar';
import Ajv from 'ajv';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { config } from 'dotenv';

// Configuration interfaces
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

export interface BotConfiguration {
  version: string;
  lastModified: string;
  modifiedBy: string;
  discord: DiscordConfig;
  gemini: GeminiConfig;
  rateLimiting: RateLimitingConfig;
  features: FeatureConfig;
}

// Audit log interfaces
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

class ConfigurationManager extends EventEmitter {
  private mutex = new Mutex();
  private ajv: Ajv;
  private fileWatcher?: chokidar.FSWatcher;
  private currentConfig: BotConfiguration;
  private configPath: string;
  private versionsPath: string;
  private auditLogPath: string;
  private environmentOverrides: EnvironmentOverrides = {};
  private initialized = false;
  private isReloading = false;
  private configSchemas: Map<string, object> = new Map();

  // Default configuration
  private readonly defaultConfig: BotConfiguration = {
    version: '1.0.0',
    lastModified: new Date().toISOString(),
    modifiedBy: 'system',
    discord: {
      intents: [
        'Guilds',
        'GuildMessages', 
        'MessageContent',
        'GuildMessageReactions'
      ],
      permissions: {},
      commands: {
        chat: { enabled: true, permissions: 'all', cooldown: 2000 },
        status: { enabled: true, permissions: 'all', cooldown: 5000 },
        health: { enabled: true, permissions: 'admin', cooldown: 10000 },
        clear: { enabled: true, permissions: 'all', cooldown: 3000 },
        remember: { enabled: true, permissions: 'all', cooldown: 5000 },
        addgag: { enabled: true, permissions: 'all', cooldown: 5000 },
        setpersonality: { enabled: true, permissions: 'admin', cooldown: 0 },
        mypersonality: { enabled: true, permissions: 'all', cooldown: 5000 },
        getpersonality: { enabled: true, permissions: 'all', cooldown: 2000 },
        removepersonality: { enabled: true, permissions: 'all', cooldown: 5000 },
        clearpersonality: { enabled: true, permissions: 'all', cooldown: 5000 },
        execute: { enabled: false, permissions: 'admin', cooldown: 10000 },
        contextstats: { enabled: true, permissions: 'all', cooldown: 10000 },
        summarize: { enabled: true, permissions: 'admin', cooldown: 30000 },
        deduplicate: { enabled: true, permissions: 'admin', cooldown: 30000 },
        crossserver: { enabled: true, permissions: 'admin', cooldown: 0 },
        config: { enabled: true, permissions: 'admin', cooldown: 0 },
        reload: { enabled: true, permissions: 'admin', cooldown: 0 },
        validate: { enabled: true, permissions: 'admin', cooldown: 5000 }
      }
    },
    gemini: {
      model: 'gemini-2.5-flash-preview-05-20',
      temperature: 0.9,
      topK: 40,
      topP: 0.8,
      maxTokens: 8192,
      safetySettings: {
        harassment: 'block_none',
        hateSpeech: 'block_none', 
        sexuallyExplicit: 'block_none',
        dangerousContent: 'block_none'
      },
      systemInstructions: {
        roasting: process.env.GEMINI_SYSTEM_INSTRUCTION || 'You are a witty AI assistant with a talent for clever roasting.',
        helpful: process.env.HELPFUL_INSTRUCTION || 'You are a helpful AI assistant.'
      },
      grounding: {
        threshold: 0.3,
        enabled: true
      },
      thinking: {
        budget: 1024,
        includeInResponse: false
      }
    },
    rateLimiting: {
      rpm: 10,
      daily: 500,
      burstSize: 5,
      safetyMargin: 0.9,
      retryOptions: {
        maxRetries: 3,
        retryDelay: 1000,
        retryMultiplier: 2
      }
    },
    features: {
      roasting: {
        baseChance: 0.5,
        consecutiveBonus: 0.25,
        maxChance: 0.9,
        cooldownEnabled: true,
        moodSystem: {
          enabled: true,
          moodDuration: 3600000,
          chaosEvents: {
            enabled: true,
            triggerChance: 0.05,
            durationRange: [300000, 1800000],
            multiplierRange: [0.5, 2.5]
          }
        },
        psychologicalWarfare: {
          roastDebt: true,
          mercyKills: true,
          cooldownBreaking: true
        }
      },
      codeExecution: false,
      structuredOutput: false,
      monitoring: {
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
      },
      contextMemory: {
        enabled: true,
        maxMessages: 100,
        timeoutMinutes: 30,
        maxContextChars: 50000,
        compressionEnabled: true,
        crossServerEnabled: false
      },
      caching: {
        enabled: true,
        maxSize: 100,
        ttlMinutes: 5,
        compressionEnabled: true
      }
    }
  };

  constructor(
    configPath = './data/bot-config.json',
    versionsPath = './data/config-versions',
    auditLogPath = './data/config-audit.log'
  ) {
    super();
    this.configPath = configPath;
    this.versionsPath = versionsPath;
    this.auditLogPath = auditLogPath;
    this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));
    this.ajv = new Ajv({ 
      allErrors: true, 
      verbose: true,
      strict: false 
    });
    this.initializeSchemas();
  }

  private initializeSchemas(): void {
    // Simplified configuration schema for basic validation
    const configSchema = {
      type: 'object',
      properties: {
        version: { type: 'string' },
        lastModified: { type: 'string' },
        modifiedBy: { type: 'string' },
        discord: { type: 'object' },
        gemini: { type: 'object' },
        rateLimiting: { type: 'object' },
        features: { type: 'object' }
      },
      required: ['version', 'lastModified', 'modifiedBy', 'discord', 'gemini', 'rateLimiting', 'features'],
      additionalProperties: false
    };

    this.configSchemas.set('main', configSchema);
    this.ajv.addSchema(configSchema, 'main');
  }

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
      await this.loadEnvironmentOverrides();

      // Load or create configuration
      await this.loadConfiguration();

      // Start file watching - temporarily disabled for debugging
      // await this.startFileWatching();

      this.initialized = true;
      logger.info('ConfigurationManager initialized successfully');
    } finally {
      release();
    }
  }

  private async loadEnvironmentOverrides(): Promise<void> {
    // Load .env file
    config();

    // Map environment variables to configuration paths
    const envMappings: { [key: string]: string[] } = {
      'GEMINI_RATE_LIMIT_RPM': ['rateLimiting', 'rpm'],
      'GEMINI_RATE_LIMIT_DAILY': ['rateLimiting', 'daily'],
      'ROAST_BASE_CHANCE': ['features', 'roasting', 'baseChance'],
      'ROAST_CONSECUTIVE_BONUS': ['features', 'roasting', 'consecutiveBonus'],
      'ROAST_MAX_CHANCE': ['features', 'roasting', 'maxChance'],
      'ROAST_COOLDOWN': ['features', 'roasting', 'cooldownEnabled'],
      'CONVERSATION_TIMEOUT_MINUTES': ['features', 'contextMemory', 'timeoutMinutes'],
      'MAX_CONVERSATION_MESSAGES': ['features', 'contextMemory', 'maxMessages'],
      'MAX_CONTEXT_CHARS': ['features', 'contextMemory', 'maxContextChars'],
      'GROUNDING_THRESHOLD': ['gemini', 'grounding', 'threshold'],
      'THINKING_BUDGET': ['gemini', 'thinking', 'budget'],
      'INCLUDE_THOUGHTS': ['gemini', 'thinking', 'includeInResponse'],
      'ENABLE_CODE_EXECUTION': ['features', 'codeExecution'],
      'ENABLE_STRUCTURED_OUTPUT': ['features', 'structuredOutput'],
      'LOG_LEVEL': ['features', 'monitoring', 'logLevel']
    };

    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        this.environmentOverrides[configPath.join('.')] = this.parseEnvironmentValue(envValue);
      }
    }

    logger.info(`Loaded ${Object.keys(this.environmentOverrides).length} environment overrides`);
  }

  private parseEnvironmentValue(value: string): string | number | boolean {
    // Try boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Try number
    const num = Number(value);
    if (!isNaN(num) && isFinite(num)) return num;

    // Return as string
    return value;
  }

  private async loadConfiguration(): Promise<void> {
    try {
      logger.info('Starting loadConfiguration method');
      logger.info(`Checking if config file exists at: ${this.configPath}`);
      
      if (await fs.pathExists(this.configPath)) {
        logger.info('Config file exists, reading...');
        const configData = await fs.readJSON(this.configPath);
        logger.info('Config file read successfully');
        
        const mergedConfig = this.applyEnvironmentOverrides(configData);
        logger.info('Environment overrides applied');
        
        const validation = this.validateConfiguration(mergedConfig);
        if (!validation.valid) {
          logger.error('Configuration validation failed:', validation.errors);
          throw new Error(`Configuration validation failed: ${validation.errors?.join(', ')}`);
        }
        logger.info('Configuration validation passed');

        this.currentConfig = mergedConfig;
        logger.info(`Configuration loaded from ${this.configPath}`);
      } else {
        logger.info('Config file does not exist, creating default...');
        // Apply environment overrides to default config
        this.currentConfig = this.applyEnvironmentOverrides(this.defaultConfig);
        logger.info('Environment overrides applied to default config');
        
        logger.info('Saving default configuration...');
        await this.saveConfigurationInternal('system', 'Initial configuration creation');
        logger.info('Created default configuration file');
      }

      logger.info('Emitting config:validated event...');
      // Emit validation event
      this.emit('config:validated', true);
      logger.info('loadConfiguration method completed successfully');
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      this.emit('config:error', error as Error);
      throw error;
    }
  }

  private applyEnvironmentOverrides(config: BotConfiguration): BotConfiguration {
    const mergedConfig = JSON.parse(JSON.stringify(config));

    for (const [path, value] of Object.entries(this.environmentOverrides)) {
      const pathParts = path.split('.');
      let current: Record<string, unknown> = mergedConfig;

      // Navigate to the parent object
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (current[pathParts[i]] === undefined) {
          current[pathParts[i]] = {};
        }
        current = current[pathParts[i]] as Record<string, unknown>;
      }

      // Set the value
      const lastKey = pathParts[pathParts.length - 1];
      const oldValue = current[lastKey];
      current[lastKey] = value;

      logger.debug(`Environment override applied: ${path} = ${value} (was: ${oldValue})`);
    }

    return mergedConfig;
  }

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

  validateConfiguration(config: BotConfiguration): { valid: boolean; errors?: string[] } {
    const validate = this.ajv.getSchema('main');
    if (!validate) {
      return { valid: false, errors: ['Schema not found'] };
    }

    const valid = validate(config);
    if (!valid && validate.errors) {
      const errors = validate.errors.map(err => {
        return `${err.instancePath || '/'}: ${err.message}`;
      });
      return { valid: false, errors };
    }

    // Additional business logic validation
    const businessErrors: string[] = [];

    // Validate roasting configuration
    if (config.features.roasting.baseChance > config.features.roasting.maxChance) {
      businessErrors.push('Roasting baseChance cannot be greater than maxChance');
    }

    // Validate rate limiting
    if (config.rateLimiting.rpm > config.rateLimiting.daily / 24) {
      businessErrors.push('RPM limit cannot exceed daily limit divided by 24 hours');
    }

    // Validate chaos events
    const chaosEvents = config.features.roasting.moodSystem.chaosEvents;
    if (chaosEvents.durationRange[0] > chaosEvents.durationRange[1]) {
      businessErrors.push('Chaos events duration range minimum cannot be greater than maximum');
    }
    if (chaosEvents.multiplierRange[0] > chaosEvents.multiplierRange[1]) {
      businessErrors.push('Chaos events multiplier range minimum cannot be greater than maximum');
    }

    if (businessErrors.length > 0) {
      return { valid: false, errors: businessErrors };
    }

    return { valid: true };
  }

  async reloadConfiguration(source: 'file-watcher' | 'command' | 'api' = 'command', reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.isReloading = true;
      const oldConfig = JSON.parse(JSON.stringify(this.currentConfig));

      await this.loadConfiguration();
      
      const changes = this.detectChanges(oldConfig, this.currentConfig);
      if (changes.length > 0) {
        await this.logConfigurationChanges(changes, source, reason);
        this.emit('config:changed', changes);
      }

      this.emit('config:reloaded', this.currentConfig.version);
      logger.info(`Configuration reloaded from ${source}, ${changes.length} changes detected`);
    } finally {
      this.isReloading = false;
      release();
    }
  }

  private detectChanges(oldConfig: BotConfiguration, newConfig: BotConfiguration): ConfigurationChange[] {
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

  async saveConfiguration(modifiedBy: string, reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.saveConfigurationInternal(modifiedBy, reason);
    } finally {
      release();
    }
  }

  private async saveConfigurationInternal(modifiedBy: string, reason?: string): Promise<void> {
    // Update metadata
    this.currentConfig.lastModified = new Date().toISOString();
    this.currentConfig.modifiedBy = modifiedBy;
    this.currentConfig.version = this.generateVersion();

    // Validate before saving
    const validation = this.validateConfiguration(this.currentConfig);
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors?.join(', ')}`);
    }

    // Save current configuration
    await fs.writeJSON(this.configPath, this.currentConfig, { spaces: 2 });

    // Save version history
    await this.saveVersionHistory();

    // Log the save action
    await this.logConfigurationChange({
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
  }

  private generateVersion(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `v${timestamp}`;
  }

  private async saveVersionHistory(): Promise<void> {
    const version: ConfigurationVersion = {
      version: this.currentConfig.version,
      timestamp: this.currentConfig.lastModified,
      configuration: JSON.parse(JSON.stringify(this.currentConfig)),
      hash: this.generateConfigHash(this.currentConfig)
    };

    const versionFile = path.join(this.versionsPath, `${this.currentConfig.version}.json`);
    await fs.writeJSON(versionFile, version, { spaces: 2 });

    // Clean up old versions (keep last 50)
    const versions = await this.getVersionHistory();
    if (versions.length > 50) {
      const versionsToDelete = versions.slice(50);
      for (const version of versionsToDelete) {
        const versionFile = path.join(this.versionsPath, `${version.version}.json`);
        await fs.remove(versionFile).catch(() => {}); // Ignore errors
      }
    }
  }

  private generateConfigHash(config: BotConfiguration): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const configString = JSON.stringify(config);
    return crypto.createHash('sha256').update(configString).digest('hex');
  }

  async getVersionHistory(): Promise<ConfigurationVersion[]> {
    try {
      const files = await fs.readdir(this.versionsPath);
      const versions: ConfigurationVersion[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const versionData = await fs.readJSON(path.join(this.versionsPath, file));
            versions.push(versionData);
          } catch (error) {
            logger.warn(`Failed to read version file ${file}:`, error);
          }
        }
      }

      // Sort by timestamp (newest first)
      return versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      logger.error('Failed to get version history:', error);
      return [];
    }
  }

  async rollbackToVersion(version: string, modifiedBy: string, reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const versionFile = path.join(this.versionsPath, `${version}.json`);
      
      if (!await fs.pathExists(versionFile)) {
        throw new Error(`Version ${version} not found`);
      }

      const versionData: ConfigurationVersion = await fs.readJSON(versionFile);
      const oldVersion = this.currentConfig.version;
      
      // Apply the rollback
      this.currentConfig = versionData.configuration;
      this.currentConfig.lastModified = new Date().toISOString();
      this.currentConfig.modifiedBy = modifiedBy;

      // Save the rolled back configuration
      await fs.writeJSON(this.configPath, this.currentConfig, { spaces: 2 });

      // Log the rollback
      await this.logConfigurationChange({
        timestamp: this.currentConfig.lastModified,
        version: this.currentConfig.version,
        modifiedBy,
        changeType: 'rollback',
        path: [],
        oldValue: oldVersion,
        newValue: this.currentConfig.version,
        reason,
        source: 'command'
      });

      this.emit('config:rollback', oldVersion, this.currentConfig.version);
      logger.info(`Configuration rolled back from ${oldVersion} to ${version} by ${modifiedBy}`);
    } finally {
      release();
    }
  }

  private async logConfigurationChange(change: ConfigurationChange): Promise<void> {
    const logEntry = JSON.stringify(change) + '\n';
    await fs.appendFile(this.auditLogPath, logEntry);
  }

  private async logConfigurationChanges(changes: ConfigurationChange[], source: string, reason?: string): Promise<void> {
    for (const change of changes) {
      change.source = source as 'file' | 'command' | 'environment' | 'api';
      change.reason = reason;
      await this.logConfigurationChange(change);
    }
  }

  async getAuditLog(limit = 100): Promise<ConfigurationChange[]> {
    try {
      if (!await fs.pathExists(this.auditLogPath)) {
        return [];
      }

      const logContent = await fs.readFile(this.auditLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');
      const changes: ConfigurationChange[] = [];

      // Parse the last N lines
      const startIndex = Math.max(0, lines.length - limit);
      for (let i = startIndex; i < lines.length; i++) {
        try {
          const change = JSON.parse(lines[i]);
          changes.push(change);
        } catch (error) {
          logger.warn(`Failed to parse audit log line ${i}:`, error);
        }
      }

      return changes.reverse(); // Newest first
    } catch (error) {
      logger.error('Failed to read audit log:', error);
      return [];
    }
  }

  // Getters for current configuration sections
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

  // Configuration setters with validation
  async updateConfiguration(updates: Partial<BotConfiguration>, modifiedBy: string, reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const newConfig = { ...this.currentConfig, ...updates };
      
      const validation = this.validateConfiguration(newConfig);
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

  async updateConfigurationSection(section: keyof BotConfiguration, updates: Record<string, unknown>, modifiedBy: string, reason?: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const newConfig = JSON.parse(JSON.stringify(this.currentConfig));
      newConfig[section] = { ...newConfig[section], ...updates };
      
      const validation = this.validateConfiguration(newConfig);
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

  async exportConfiguration(format: 'json' | 'yaml' = 'json'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify(this.currentConfig, null, 2);
    } else {
      // Would need js-yaml dependency for YAML support
      throw new Error('YAML export not implemented');
    }
  }

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

    const validation = this.validateConfiguration(parsedConfig);
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors?.join(', ')}`);
    }

    await this.updateConfiguration(parsedConfig, modifiedBy, reason);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down ConfigurationManager...');
    
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = undefined;
    }

    this.removeAllListeners();
    logger.info('ConfigurationManager shutdown completed');
  }

  // Health check method
  getHealthStatus(): { healthy: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.initialized) {
      errors.push('ConfigurationManager not initialized');
    }

    if (!this.currentConfig) {
      errors.push('No current configuration loaded');
    }

    const validation = this.validateConfiguration(this.currentConfig);
    if (!validation.valid) {
      errors.push(`Configuration validation failed: ${validation.errors?.join(', ')}`);
    }

    return {
      healthy: errors.length === 0,
      errors
    };
  }
}

export { ConfigurationManager };