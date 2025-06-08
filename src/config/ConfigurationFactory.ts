/**
 * Configuration Factory Module
 * Provides type-safe factory methods for creating bot configuration with validation
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

/**
 * Configuration factory for creating and validating bot configuration
 */
export class ConfigurationFactory {
  /**
   * Creates complete bot configuration from environment variables
   */
  static createBotConfiguration(): BotConfiguration {
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
   */
  static createDiscordConfig(): DiscordConfig {
    const intents = ['guilds', 'guildMessages', 'messageContent', 'guildMessageReactions'];
    
    return {
      intents,
      permissions: {},
      commands: {}
    };
  }

  /**
   * Creates Gemini AI configuration with validation
   */
  static createGeminiConfig(): GeminiConfig {
    const config: GeminiConfig = {
      model: this.getEnvOrDefault('GEMINI_MODEL', 'gemini-2.0-flash-exp'),
      temperature: this.parseFloatWithDefault('GEMINI_TEMPERATURE', 0.9, 0.0, 2.0),
      topK: this.parseIntWithDefault('GEMINI_TOP_K', 40, 1, 100),
      topP: this.parseFloatWithDefault('GEMINI_TOP_P', 0.95, 0.0, 1.0),
      maxTokens: this.parseIntWithDefault('GEMINI_MAX_OUTPUT_TOKENS', 8192, 1, 32768),
      safetySettings: {
        harassment: 'block_none',
        hateSpeech: 'block_none',
        sexuallyExplicit: 'block_none',
        dangerousContent: 'block_none'
      },
      systemInstructions: {
        roasting: this.getEnvOrDefault(
          'GEMINI_ROASTING_INSTRUCTION',
          'You are a sarcastic AI that enjoys roasting users in a playful way.'
        ),
        helpful: this.getEnvOrDefault(
          'GEMINI_HELPFUL_INSTRUCTION',
          'You are a helpful AI assistant.'
        )
      },
      grounding: {
        threshold: this.parseFloatWithDefault('GEMINI_GOOGLE_SEARCH_THRESHOLD', 0.3, 0.0, 1.0),
        enabled: this.parseBooleanWithDefault('GEMINI_ENABLE_GOOGLE_SEARCH', false)
      },
      thinking: {
        budget: this.parseIntWithDefault('GEMINI_THINKING_BUDGET', 20000, 0, 100000),
        includeInResponse: this.parseBooleanWithDefault('GEMINI_INCLUDE_THOUGHTS', false)
      }
    };

    // Only validate for critical errors, not range issues (those are clamped)
    this.validateGeminiConfig(config);
    return config;
  }

  /**
   * Creates rate limiting configuration with validation
   */
  static createRateLimitingConfig(): RateLimitingConfig {
    const config: RateLimitingConfig = {
      rpm: this.parseIntWithDefault('RATE_LIMIT_RPM', 15, 1, 60),
      daily: this.parseIntWithDefault('RATE_LIMIT_DAILY', 500, 1, 10000),
      burstSize: this.parseIntWithDefault('RATE_LIMIT_BURST', 5, 1, 20),
      safetyMargin: 0.1,
      retryOptions: {
        maxRetries: this.parseIntWithDefault('GEMINI_MAX_RETRIES', 3, 0, 10),
        retryDelay: this.parseIntWithDefault('GEMINI_RETRY_DELAY_MS', 500, 100, 10000),
        retryMultiplier: this.parseFloatWithDefault('GEMINI_RETRY_MULTIPLIER', 2.0, 1.0, 5.0)
      }
    };

    // Validate configuration for warnings only
    this.validateRateLimitingConfig(config);
    return config;
  }

  /**
   * Creates feature configuration with all sub-configs
   */
  static createFeatureConfig(): FeatureConfig {
    return {
      roasting: this.createRoastingConfig(),
      codeExecution: this.parseBooleanWithDefault('GEMINI_ENABLE_CODE_EXECUTION', false),
      structuredOutput: this.parseBooleanWithDefault('GEMINI_ENABLE_STRUCTURED_OUTPUT', false),
      monitoring: this.createMonitoringConfig(),
      contextMemory: {
        enabled: true,
        timeoutMinutes: this.parseIntWithDefault('CONTEXT_TIMEOUT_MINUTES', 60, 1, 1440),
        maxMessages: this.parseIntWithDefault('CONTEXT_MAX_MESSAGES', 100, 1, 1000),
        maxContextChars: this.parseIntWithDefault('CONTEXT_MAX_CHARS', 75000, 1000, 1000000),
        compressionEnabled: true,
        crossServerEnabled: this.parseBooleanWithDefault('CONTEXT_CROSS_SERVER_ENABLED', false)
      },
      caching: {
        enabled: true,
        maxSize: this.parseIntWithDefault('CACHE_MAX_SIZE', 1000, 10, 10000),
        ttlMinutes: this.parseIntWithDefault('CACHE_TTL_MINUTES', 5, 1, 60),
        compressionEnabled: true
      }
    };
  }

  /**
   * Creates roasting configuration
   */
  private static createRoastingConfig(): RoastingConfig {
    return {
      baseChance: this.parseFloatWithDefault('ROAST_BASE_CHANCE', 0.3, 0.0, 1.0),
      consecutiveBonus: 0.1,
      maxChance: this.parseFloatWithDefault('ROAST_MAX_CHANCE', 0.8, 0.0, 1.0),
      cooldownEnabled: true,
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
        collectionInterval: this.parseIntWithDefault('HEALTH_CHECK_INTERVAL_MS', 30000, 5000, 300000),
        retentionDays: this.parseIntWithDefault('METRICS_RETENTION_HOURS', 24, 1, 168) / 24
      },
      alerts: {
        enabled: true,
        memoryThreshold: this.parseFloatWithDefault('ALERT_MEMORY_USAGE', 0.8, 0.1, 0.95),
        errorRateThreshold: this.parseFloatWithDefault('ALERT_ERROR_RATE', 0.1, 0.01, 0.5),
        responseTimeThreshold: this.parseIntWithDefault('ALERT_RESPONSE_TIME_MS', 5000, 1000, 30000)
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
   * Environment variable helpers with validation
   */
  private static getEnvOrDefault(key: string, defaultValue: string): string {
    const value = process.env[key];
    if (value === undefined || value === '') {
      logger.debug(`Using default value for ${key}: ${defaultValue}`);
      return defaultValue;
    }
    return value;
  }

  private static parseIntWithDefault(key: string, defaultValue: number, min?: number, max?: number): number {
    const value = process.env[key];
    if (!value) {
      logger.debug(`Using default value for ${key}: ${defaultValue}`);
      return defaultValue;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      logger.warn(`Invalid integer value for ${key}: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }

    if (min !== undefined && parsed < min) {
      logger.warn(`Value for ${key} (${parsed}) is below minimum (${min}), using minimum`);
      return min;
    }

    if (max !== undefined && parsed > max) {
      logger.warn(`Value for ${key} (${parsed}) is above maximum (${max}), using maximum`);
      return max;
    }

    return parsed;
  }

  private static parseFloatWithDefault(key: string, defaultValue: number, min?: number, max?: number): number {
    const value = process.env[key];
    if (!value) {
      logger.debug(`Using default value for ${key}: ${defaultValue}`);
      return defaultValue;
    }

    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      logger.warn(`Invalid float value for ${key}: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }

    if (min !== undefined && parsed < min) {
      logger.warn(`Value for ${key} (${parsed}) is below minimum (${min}), using minimum`);
      return min;
    }

    if (max !== undefined && parsed > max) {
      logger.warn(`Value for ${key} (${parsed}) is above maximum (${max}), using maximum`);
      return max;
    }

    return parsed;
  }

  private static parseBooleanWithDefault(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (!value) {
      logger.debug(`Using default value for ${key}: ${defaultValue}`);
      return defaultValue;
    }

    const lowercaseValue = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lowercaseValue)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(lowercaseValue)) {
      return false;
    }

    logger.warn(`Invalid boolean value for ${key}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }

  /**
   * Configuration validation methods
   */
  private static validateGeminiConfig(config: GeminiConfig): void {
    const errors: string[] = [];

    if (!config.model) {
      errors.push('Gemini model is required');
    }

    // Only validate critical issues that can't be handled by clamping
    // For example, if critical fields are missing or have invalid types
    // Range validation is handled by parseFloatWithDefault/parseIntWithDefault

    if (errors.length > 0) {
      const errorMessage = `Gemini configuration validation failed: ${errors.join(', ')}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  private static validateRateLimitingConfig(config: RateLimitingConfig): void {
    const errors: string[] = [];

    // Only validate critical issues
    // Range validation is handled by parseIntWithDefault
    // We might want to validate that certain combinations make sense
    if (config.burstSize > config.rpm) {
      logger.warn('Burst size is greater than RPM limit, this may cause unexpected behavior');
    }

    if (errors.length > 0) {
      const errorMessage = `Rate limiting configuration validation failed: ${errors.join(', ')}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Validates API key availability
   */
  static validateApiKey(): string {
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
   */
  static getConfigurationWithApiKey(): { config: BotConfiguration; apiKey: string } {
    const apiKey = this.validateApiKey();
    const config = this.createBotConfiguration();
    return { config, apiKey };
  }
}