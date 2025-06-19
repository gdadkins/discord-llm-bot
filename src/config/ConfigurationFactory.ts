/**
 * Configuration Factory Module
 * Provides type-safe factory methods for creating bot configuration with validation
 * 
 * @deprecated This factory is being phased out in favor of ConfigurationManager.
 * Please use ConfigurationManager.getInstance() for new implementations.
 * This factory is maintained for backward compatibility during the transition period.
 */

import type { 
  BotConfiguration, 
  DiscordConfig, 
  GeminiConfig, 
  RateLimitingConfig, 
  RoastingConfig,
  MonitoringConfig,
  FeatureConfig 
} from '../services/interfaces';
import { logger } from '../utils/logger';
import { 
  parseIntWithDefault, 
  parseFloatWithDefault, 
  parseBooleanWithDefault, 
  getStringWithDefault,
  validateEnvironment
} from '../utils/ConfigurationValidator';

/**
 * Schema type definitions for type safety
 */
interface SchemaProperty {
  type?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
}

interface Schema extends SchemaProperty {
  type: string;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
}

/**
 * JSON Schema definitions for configuration validation
 */
const GEMINI_CONFIG_SCHEMA: Schema = {
  type: 'object',
  required: ['model'],
  properties: {
    model: { type: 'string', pattern: '^gemini-' },
    temperature: { type: 'number', minimum: 0.0, maximum: 2.0 },
    topK: { type: 'integer', minimum: 1, maximum: 100 },
    topP: { type: 'number', minimum: 0.0, maximum: 1.0 },
    maxTokens: { type: 'integer', minimum: 1, maximum: 32768 },
    safetySettings: { type: 'object' },
    systemInstructions: { type: 'object' },
    grounding: {
      type: 'object',
      properties: {
        threshold: { type: 'number', minimum: 0.0, maximum: 1.0 },
        enabled: { type: 'boolean' }
      }
    },
    thinking: {
      type: 'object',
      properties: {
        budget: { type: 'integer', minimum: 0, maximum: 100000 },
        includeInResponse: { type: 'boolean' }
      }
    }
  }
};

const RATE_LIMITING_CONFIG_SCHEMA: Schema = {
  type: 'object',
  required: ['rpm', 'daily', 'burstSize'],
  properties: {
    rpm: { type: 'integer', minimum: 1, maximum: 60 },
    daily: { type: 'integer', minimum: 1, maximum: 10000 },
    burstSize: { type: 'integer', minimum: 1, maximum: 20 },
    safetyMargin: { type: 'number', minimum: 0.0, maximum: 1.0 },
    retryOptions: {
      type: 'object',
      properties: {
        maxRetries: { type: 'integer', minimum: 0, maximum: 10 },
        retryDelay: { type: 'integer', minimum: 100, maximum: 10000 },
        retryMultiplier: { type: 'number', minimum: 1.0, maximum: 5.0 }
      }
    }
  }
};

/**
 * Configuration factory for creating and validating bot configuration
 * @deprecated Use ConfigurationManager.getInstance() instead
 */
export class ConfigurationFactory {
  private static hasWarnedDeprecation = false;

  /**
   * Creates complete bot configuration from environment variables
   * @deprecated Use ConfigurationManager.getInstance().getConfiguration() instead
   */
  static createBotConfiguration(): BotConfiguration {
    this.warnDeprecation('createBotConfiguration', 'ConfigurationManager.getInstance().getConfiguration()');
    
    // Validate environment variables first
    validateEnvironment();
    
    return {
      version: '1.0.0',
      lastModified: new Date().toISOString(),
      modifiedBy: 'system',
      discord: this.createDiscordConfig(),
      gemini: this.createGeminiConfig(),
      rateLimiting: this.createRateLimitingConfig(),
      features: this.createFeatureConfig()
    };
  }

  /**
   * Creates Discord configuration with validation
   * @deprecated Use ConfigurationManager.getInstance().getDiscordConfig() instead
   */
  static createDiscordConfig(): DiscordConfig {
    this.warnDeprecation('createDiscordConfig', 'ConfigurationManager.getInstance().getDiscordConfig()');
    
    const intents = ['guilds', 'guildMessages', 'messageContent', 'guildMessageReactions'];
    
    return {
      intents,
      permissions: {},
      commands: {}
    };
  }

  /**
   * Creates Gemini AI configuration with validation
   * @deprecated Use ConfigurationManager.getInstance().getGeminiConfig() instead
   */
  static createGeminiConfig(): GeminiConfig {
    this.warnDeprecation('createGeminiConfig', 'ConfigurationManager.getInstance().getGeminiConfig()');
    
    const config: GeminiConfig = {
      model: getStringWithDefault('GEMINI_MODEL', 'gemini-2.0-flash-exp'),
      temperature: parseFloatWithDefault('GEMINI_TEMPERATURE', 0.9, 0.0, 2.0),
      topK: parseIntWithDefault('GEMINI_TOP_K', 40, 1, 100),
      topP: parseFloatWithDefault('GEMINI_TOP_P', 0.95, 0.0, 1.0),
      maxTokens: parseIntWithDefault('GEMINI_MAX_OUTPUT_TOKENS', 8192, 1, 32768),
      safetySettings: {
        harassment: 'block_none',
        hateSpeech: 'block_none',
        sexuallyExplicit: 'block_none',
        dangerousContent: 'block_none'
      },
      systemInstructions: {
        roasting: getStringWithDefault(
          'GEMINI_ROASTING_INSTRUCTION',
          'You are a sarcastic AI that enjoys roasting users in a playful way.'
        ),
        helpful: getStringWithDefault(
          'GEMINI_HELPFUL_INSTRUCTION',
          'You are a helpful AI assistant.'
        )
      },
      grounding: {
        threshold: parseFloatWithDefault('GEMINI_GOOGLE_SEARCH_THRESHOLD', 0.3, 0.0, 1.0),
        enabled: parseBooleanWithDefault('GEMINI_ENABLE_GOOGLE_SEARCH', false)
      },
      thinking: {
        budget: parseIntWithDefault('GEMINI_THINKING_BUDGET', 20000, 0, 100000),
        includeInResponse: parseBooleanWithDefault('GEMINI_INCLUDE_THOUGHTS', false)
      }
    };

    // Validate configuration against JSON schema
    this.validateConfigWithSchema(config, GEMINI_CONFIG_SCHEMA, 'Gemini');
    return config;
  }

  /**
   * Creates rate limiting configuration with validation
   * @deprecated Use ConfigurationManager.getInstance().getRateLimitingConfig() instead
   */
  static createRateLimitingConfig(): RateLimitingConfig {
    this.warnDeprecation('createRateLimitingConfig', 'ConfigurationManager.getInstance().getRateLimitingConfig()');
    
    const config: RateLimitingConfig = {
      rpm: parseIntWithDefault('RATE_LIMIT_RPM', 15, 1, 60),
      daily: parseIntWithDefault('RATE_LIMIT_DAILY', 1000, 1, 10000),
      burstSize: parseIntWithDefault('RATE_LIMIT_BURST', 5, 1, 20),
      safetyMargin: 0.1,
      retryOptions: {
        maxRetries: parseIntWithDefault('GEMINI_MAX_RETRIES', 3, 0, 10),
        retryDelay: parseIntWithDefault('GEMINI_RETRY_DELAY_MS', 1000, 100, 10000),
        retryMultiplier: parseFloatWithDefault('GEMINI_RETRY_MULTIPLIER', 2.0, 1.0, 5.0)
      }
    };

    // Validate configuration against JSON schema
    this.validateConfigWithSchema(config, RATE_LIMITING_CONFIG_SCHEMA, 'RateLimiting');
    
    // Additional logical validation
    if (config.burstSize > config.rpm) {
      logger.warn('Burst size is greater than RPM limit, this may cause unexpected behavior');
    }
    
    return config;
  }

  /**
   * Creates feature configuration with all sub-configs
   * @deprecated Use ConfigurationManager.getInstance().getFeatureConfig() instead
   */
  static createFeatureConfig(): FeatureConfig {
    this.warnDeprecation('createFeatureConfig', 'ConfigurationManager.getInstance().getFeatureConfig()');
    
    return {
      roasting: this.createRoastingConfig(),
      codeExecution: parseBooleanWithDefault('GEMINI_ENABLE_CODE_EXECUTION', false),
      structuredOutput: parseBooleanWithDefault('GEMINI_ENABLE_STRUCTURED_OUTPUT', false),
      monitoring: this.createMonitoringConfig(),
      contextMemory: {
        enabled: true,
        timeoutMinutes: parseIntWithDefault('CONTEXT_TIMEOUT_MINUTES', 60, 1, 1440),
        maxMessages: parseIntWithDefault('CONTEXT_MAX_MESSAGES', 100, 1, 1000),
        maxContextChars: parseIntWithDefault('CONTEXT_MAX_CHARS', 75000, 1000, 1000000),
        compressionEnabled: true,
        crossServerEnabled: parseBooleanWithDefault('CONTEXT_CROSS_SERVER_ENABLED', false)
      },
      caching: {
        enabled: true,
        maxSize: parseIntWithDefault('CACHE_MAX_SIZE', 1000, 10, 10000),
        ttlMinutes: parseIntWithDefault('CACHE_TTL_MINUTES', 5, 1, 60),
        compressionEnabled: true
      }
    };
  }

  /**
   * Creates roasting configuration
   */
  private static createRoastingConfig(): RoastingConfig {
    return {
      baseChance: parseFloatWithDefault('ROAST_BASE_CHANCE', 0.3, 0.0, 1.0),
      consecutiveBonus: parseFloatWithDefault('ROAST_CONSECUTIVE_BONUS', 0.1, 0.0, 1.0),
      maxChance: parseFloatWithDefault('ROAST_MAX_CHANCE', 0.8, 0.0, 1.0),
      cooldownEnabled: parseBooleanWithDefault('ROAST_COOLDOWN', true),
      moodSystem: {
        enabled: true,
        moodDuration: 30000,
        chaosEvents: {
          enabled: true,
          triggerChance: 0.1,
          durationRange: [10000, 60000],
          multiplierRange: [1.5, 3.0]
        }
      },
      psychologicalWarfare: {
        roastDebt: true,
        mercyKills: true,
        cooldownBreaking: false
      }
    };
  }

  /**
   * Creates monitoring configuration
   */
  private static createMonitoringConfig(): MonitoringConfig {
    return {
      healthMetrics: {
        enabled: true,
        collectionInterval: parseIntWithDefault('HEALTH_CHECK_INTERVAL_MS', 30000, 5000, 300000),
        retentionDays: parseIntWithDefault('METRICS_RETENTION_HOURS', 24, 1, 168) / 24
      },
      alerts: {
        enabled: true,
        memoryThreshold: parseFloatWithDefault('ALERT_MEMORY_USAGE', 0.8, 0.1, 0.95),
        errorRateThreshold: parseFloatWithDefault('ALERT_ERROR_RATE', 0.1, 0.01, 0.5),
        responseTimeThreshold: parseIntWithDefault('ALERT_RESPONSE_TIME_MS', 5000, 1000, 30000)
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


  /**
   * Configuration validation methods
   */
  private static validateConfigWithSchema(config: unknown, schema: Schema, configName: string): void {
    const errors = this.validateSchema(config, schema, configName);
    
    if (errors.length > 0) {
      const errorMessage = `${configName} configuration validation failed:\n${errors.join('\n')}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Simple JSON schema validator (basic implementation)
   */
  private static validateSchema(data: unknown, schema: Schema | SchemaProperty, path: string = ''): string[] {
    const errors: string[] = [];

    // Check type
    if (schema.type) {
      const actualType = Array.isArray(data) ? 'array' : typeof data;
      // Special handling for integer type (JavaScript only has number)
      if (schema.type === 'integer' && actualType === 'number') {
        // Check if it's an integer
        if (!Number.isInteger(data)) {
          errors.push(`${path}: Expected integer, got decimal number ${data}`);
        }
      } else if (actualType !== schema.type && !(schema.type === 'integer' && actualType === 'number')) {
        errors.push(`${path}: Expected type ${schema.type}, got ${actualType}`);
        return errors;
      }
    }

    // Type guards for better TypeScript inference
    const isObject = (val: unknown): val is Record<string, unknown> => {
      return typeof val === 'object' && val !== null && !Array.isArray(val);
    };

    // Check required fields
    if ('required' in schema && schema.required && Array.isArray(schema.required) && isObject(data)) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`${path}: Missing required field '${field}'`);
        }
      }
    }

    // Validate properties
    if (schema.properties && isObject(data)) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const propPath = path ? `${path}.${key}` : key;
          errors.push(...this.validateSchema(data[key], propSchema, propPath));
        }
      }
    }

    // Validate numeric constraints
    if (typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`${path}: Value ${data} is below minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`${path}: Value ${data} is above maximum ${schema.maximum}`);
      }
    }

    // Validate pattern
    if (schema.pattern && typeof data === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        errors.push(`${path}: Value '${data}' does not match pattern ${schema.pattern}`);
      }
    }

    return errors;
  }

  /**
   * Validates API key availability using ConfigurationValidator
   * @deprecated Use ConfigurationManager.getInstance().getConfigValue('gemini.apiKey') instead
   */
  static validateApiKey(): string {
    this.warnDeprecation('validateApiKey', 'ConfigurationManager.getInstance().getConfigValue()');
    
    // The validateEnvironment call will already check for required vars
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const error = 'Missing required API key: either GOOGLE_API_KEY or GEMINI_API_KEY must be set';
      logger.error(error);
      throw new Error(error);
    }
    return apiKey;
  }

  /**
   * Gets complete configuration with API key
   * @deprecated Use ConfigurationManager.getInstance() methods instead
   */
  static getConfigurationWithApiKey(): { config: BotConfiguration; apiKey: string } {
    this.warnDeprecation('getConfigurationWithApiKey', 'ConfigurationManager.getInstance().getConfiguration()');
    
    const apiKey = this.validateApiKey();
    const config = this.createBotConfiguration();
    return { config, apiKey };
  }

  /**
   * Creates additional Gemini-specific configuration not in main config
   * This is for backward compatibility with services that need these values
   * @deprecated Use ConfigurationManager.getInstance().getGeminiModelConfig() instead
   */
  static createGeminiServiceConfig(): {
    systemInstruction: string;
    groundingThreshold: number;
    thinkingBudget: number;
    includeThoughts: boolean;
    enableCodeExecution: boolean;
    enableStructuredOutput: boolean;
    forceThinkingPrompt: boolean;
    thinkingTrigger: string;
    enableGoogleSearch: boolean;
    unfilteredMode: boolean;
    } {
    this.warnDeprecation('createGeminiServiceConfig', 'ConfigurationManager.getInstance().getGeminiModelConfig()');
    
    return {
      systemInstruction: getStringWithDefault(
        'GEMINI_SYSTEM_INSTRUCTION',
        'You are a helpful Discord bot assistant. Provide clear and concise responses to user queries.'
      ),
      groundingThreshold: parseFloatWithDefault('GEMINI_GOOGLE_SEARCH_THRESHOLD', 0.3, 0.0, 1.0),
      thinkingBudget: parseIntWithDefault('THINKING_BUDGET', 1024, 0, 100000),
      includeThoughts: parseBooleanWithDefault('INCLUDE_THOUGHTS', false),
      enableCodeExecution: parseBooleanWithDefault('ENABLE_CODE_EXECUTION', false),
      enableStructuredOutput: parseBooleanWithDefault('ENABLE_STRUCTURED_OUTPUT', false),
      forceThinkingPrompt: parseBooleanWithDefault('FORCE_THINKING_PROMPT', false),
      thinkingTrigger: getStringWithDefault('THINKING_TRIGGER', 'Please think step-by-step before answering.'),
      enableGoogleSearch: parseBooleanWithDefault('GEMINI_ENABLE_GOOGLE_SEARCH', false),
      unfilteredMode: parseBooleanWithDefault('UNFILTERED_MODE', false)
    };
  }

  /**
   * Helper method to emit deprecation warnings
   */
  private static warnDeprecation(methodName: string, replacement: string): void {
    if (!this.hasWarnedDeprecation) {
      console.warn(
        `\n⚠️  DEPRECATION WARNING: ConfigurationFactory.${methodName}() is deprecated.\n` +
        `📋 Please migrate to: ${replacement}\n` +
        '🔧 ConfigurationFactory will be removed in a future version.\n' +
        '📖 See ConfigurationManager documentation for migration guide.\n'
      );
      this.hasWarnedDeprecation = true;
    }
  }
}