// Core dependencies (fs and path not used directly but may be needed for future extensions)
import { config } from 'dotenv';
import { logger } from '../../utils/logger';
import { DataStore, DataValidator } from '../../utils/DataStore';
import { dataStoreFactory } from '../../utils/DataStoreFactory';
import { 
  BotConfiguration, 
  EnvironmentOverrides,
  IConfigurationLoader
} from '../interfaces/ConfigurationInterfaces';

/**
 * ConfigurationLoader - Handles loading configuration from various sources
 * 
 * Responsibilities:
 * - Loading configuration from files
 * - Loading environment variables
 * - Applying environment overrides
 * - Managing default configurations
 */
export class ConfigurationLoader implements IConfigurationLoader {
  private configDataStore: DataStore<BotConfiguration>;
  private environmentOverrides: EnvironmentOverrides = {};
  
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
      model: 'gemini-2.5-flash',
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
        roasting: process.env.GEMINI_ROASTING_INSTRUCTION || 'You are a witty AI assistant with a talent for clever roasting.',
        helpful: process.env.GEMINI_HELPFUL_INSTRUCTION || process.env.HELPFUL_INSTRUCTION || 'You are a helpful AI assistant.'
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
    private configPath: string,
    private configValidator: DataValidator<BotConfiguration>
  ) {
    // Initialize DataStore with configuration validation using factory
    this.configDataStore = dataStoreFactory.createConfigStore<BotConfiguration>(
      this.configPath,
      this.configValidator,
      {
        maxRetries: 5,
        retryDelayMs: 200,
        compressionThreshold: 2048 // Compress main config if larger than 2KB
      }
    );
  }

  /**
   * Load environment overrides from process.env
   */
  async loadEnvironmentOverrides(): Promise<void> {
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

  /**
   * Parse environment variable value to appropriate type
   */
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

  /**
   * Load configuration from file or create default
   */
  async loadConfiguration(): Promise<BotConfiguration> {
    logger.info('Starting loadConfiguration method');
    logger.info(`Checking if config file exists at: ${this.configPath}`);
    
    const configData = await this.configDataStore.load();
    
    if (configData) {
      logger.info('Config file loaded successfully via DataStore');
      
      const mergedConfig = this.applyEnvironmentOverrides(configData);
      logger.info('Environment overrides applied');
      
      return mergedConfig;
    } else {
      logger.info('Config file does not exist, creating default...');
      // Apply environment overrides to default config
      const mergedConfig = this.applyEnvironmentOverrides(this.defaultConfig);
      logger.info('Environment overrides applied to default config');
      
      // Save the default configuration
      await this.configDataStore.save(mergedConfig);
      logger.info('Created default configuration file');
      
      return mergedConfig;
    }
  }

  /**
   * Apply environment overrides to configuration
   */
  applyEnvironmentOverrides(config: BotConfiguration): BotConfiguration {
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

  /**
   * Get default configuration
   */
  getDefaultConfiguration(): BotConfiguration {
    return JSON.parse(JSON.stringify(this.defaultConfig));
  }

  /**
   * Get environment overrides
   */
  getEnvironmentOverrides(): EnvironmentOverrides {
    return { ...this.environmentOverrides };
  }

  /**
   * Save configuration to file
   */
  async saveConfiguration(config: BotConfiguration): Promise<void> {
    await this.configDataStore.save(config);
  }
}