/**
 * ConfigurationValidator - Centralized Configuration and Environment Variable Validation
 * 
 * Enhanced version that provides:
 * - Environment variable validation
 * - Configuration object validation
 * - Business rule validation
 * - Schema evolution support
 * - Migration validation
 */

import { logger } from './logger';

// =============================================================================
// Core Interfaces and Types
// =============================================================================

export interface ValidationError {
  field: string;
  value: string | undefined;
  message: string;
  expected?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface EnvVarSchema {
  type: 'string' | 'number' | 'boolean' | 'integer';
  required?: boolean;
  defaultValue?: unknown;
  minValue?: number;
  maxValue?: number;
  pattern?: RegExp;
  allowedValues?: readonly string[];
  description?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
}

export interface ParsedConfig {
  [key: string]: string | number | boolean | undefined;
}

// =============================================================================
// Environment Variable Schema Definitions
// =============================================================================

export const ENV_VAR_SCHEMAS: Record<string, EnvVarSchema> = {
  // Required Core Configuration
  DISCORD_TOKEN: {
    type: 'string',
    required: true,
    description: 'Discord bot token for authentication'
  },
  DISCORD_CLIENT_ID: {
    type: 'string',
    required: true,
    description: 'Discord application client ID'
  },
  GOOGLE_API_KEY: {
    type: 'string',
    required: true,
    description: 'Google AI API key for Gemini service'
  },
  GEMINI_API_KEY: {
    type: 'string',
    required: false,
    description: 'Alternative API key name (deprecated, use GOOGLE_API_KEY)',
    deprecated: true,
    deprecationMessage: 'Use GOOGLE_API_KEY instead'
  },

  // Basic Configuration
  NODE_ENV: {
    type: 'string',
    defaultValue: 'development',
    allowedValues: ['development', 'production', 'test'],
    description: 'Application environment'
  },
  LOG_LEVEL: {
    type: 'string',
    defaultValue: 'info',
    allowedValues: ['error', 'warn', 'info', 'debug', 'verbose'],
    description: 'Logging level for Winston logger'
  },

  // Rate Limiting Configuration
  RATE_LIMIT_RPM: {
    type: 'integer',
    defaultValue: 15,
    minValue: 1,
    maxValue: 60,
    description: 'Requests per minute limit for Gemini API'
  },
  RATE_LIMIT_DAILY: {
    type: 'integer',
    defaultValue: 1500,
    minValue: 1,
    maxValue: 10000,
    description: 'Daily request limit for Gemini API'
  },
  RATE_LIMIT_BURST: {
    type: 'integer',
    defaultValue: 5,
    minValue: 1,
    maxValue: 20,
    description: 'Burst size for rate limiting'
  },

  // Gemini Model Configuration
  GEMINI_MODEL: {
    type: 'string',
    defaultValue: 'gemini-2.0-flash-exp',
    pattern: /^gemini-/,
    description: 'Gemini AI model to use'
  },
  GEMINI_TEMPERATURE: {
    type: 'number',
    defaultValue: 0.9,
    minValue: 0.0,
    maxValue: 2.0,
    description: 'Temperature for AI response creativity (0.1=focused, 0.9=creative)'
  },
  GEMINI_TOP_K: {
    type: 'integer',
    defaultValue: 40,
    minValue: 1,
    maxValue: 100,
    description: 'Top-K parameter for token selection diversity'
  },
  GEMINI_TOP_P: {
    type: 'number',
    defaultValue: 0.95,
    minValue: 0.0,
    maxValue: 1.0,
    description: 'Top-P parameter for response variety control'
  },
  GEMINI_MAX_OUTPUT_TOKENS: {
    type: 'integer',
    defaultValue: 8192,
    minValue: 1,
    maxValue: 32768,
    description: 'Maximum tokens in AI response'
  },

  // Vision and Image Processing
  GEMINI_VISION_PROFILE: {
    type: 'string',
    defaultValue: 'HIGH_ACCURACY_VISION',
    allowedValues: ['HIGH_ACCURACY_VISION', 'BALANCED_VISION', 'FAST_VISION', 'CREATIVE_VISION', 'LEGACY', 'SNL_EXPERT'],
    description: 'Vision processing profile for image recognition'
  },

  // AI Behavior Configuration
  GEMINI_ROASTING_INSTRUCTION: {
    type: 'string',
    defaultValue: 'You are a sarcastic AI that enjoys roasting users in a playful way.',
    description: 'Custom personality instruction for roasting mode'
  },
  GEMINI_HELPFUL_INSTRUCTION: {
    type: 'string',
    defaultValue: 'You are a helpful AI assistant.',
    description: 'Custom personality instruction for helpful mode'
  },
  GEMINI_SYSTEM_INSTRUCTION: {
    type: 'string',
    defaultValue: 'You are a helpful Discord bot assistant. Provide clear and concise responses to user queries.',
    description: 'Base system instruction for Gemini service'
  },

  // Advanced AI Features
  GEMINI_ENABLE_GOOGLE_SEARCH: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable web search for current information (experimental)'
  },
  GEMINI_GOOGLE_SEARCH_THRESHOLD: {
    type: 'number',
    defaultValue: 0.3,
    minValue: 0.0,
    maxValue: 1.0,
    description: 'Threshold for triggering Google search'
  },
  GEMINI_THINKING_BUDGET: {
    type: 'integer',
    defaultValue: 20000,
    minValue: 0,
    maxValue: 100000,
    description: 'Token budget for thinking mode'
  },
  GEMINI_INCLUDE_THOUGHTS: {
    type: 'boolean',
    defaultValue: false,
    description: 'Include AI reasoning process in responses'
  },
  GEMINI_ENABLE_CODE_EXECUTION: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable Python code execution (experimental)'
  },
  GEMINI_ENABLE_STRUCTURED_OUTPUT: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable JSON structured responses (experimental)'
  },
  FORCE_THINKING_PROMPT: {
    type: 'boolean',
    defaultValue: false,
    description: 'Force thinking mode for all requests'
  },
  THINKING_TRIGGER: {
    type: 'string',
    defaultValue: 'Please think step-by-step before answering.',
    description: 'Trigger phrase for thinking mode'
  },

  // Retry and Error Handling
  GEMINI_MAX_RETRIES: {
    type: 'integer',
    defaultValue: 3,
    minValue: 0,
    maxValue: 10,
    description: 'Maximum retry attempts for failed requests'
  },
  GEMINI_RETRY_DELAY_MS: {
    type: 'integer',
    defaultValue: 1000,
    minValue: 100,
    maxValue: 10000,
    description: 'Base delay between retries in milliseconds'
  },
  GEMINI_RETRY_MULTIPLIER: {
    type: 'number',
    defaultValue: 2.0,
    minValue: 1.0,
    maxValue: 5.0,
    description: 'Exponential backoff multiplier for retries'
  },

  // Context Memory Settings
  CONTEXT_TIMEOUT_MINUTES: {
    type: 'integer',
    defaultValue: 60,
    minValue: 1,
    maxValue: 1440,
    description: 'How long to remember conversations (minutes)'
  },
  CONTEXT_MAX_MESSAGES: {
    type: 'integer',
    defaultValue: 100,
    minValue: 1,
    maxValue: 1000,
    description: 'Maximum messages to keep per user'
  },
  CONTEXT_MAX_CHARS: {
    type: 'integer',
    defaultValue: 75000,
    minValue: 1000,
    maxValue: 1000000,
    description: 'Maximum total characters of context'
  },
  CONTEXT_CROSS_SERVER_ENABLED: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable cross-server context sharing'
  },

  // Roasting Behavior Configuration
  ROAST_BASE_CHANCE: {
    type: 'number',
    defaultValue: 0.3,
    minValue: 0.0,
    maxValue: 1.0,
    description: 'Base probability of roasting behavior (30%)'
  },
  ROAST_MAX_CHANCE: {
    type: 'number',
    defaultValue: 0.8,
    minValue: 0.0,
    maxValue: 1.0,
    description: 'Maximum probability of roasting behavior (80%)'
  },
  ROAST_CONSECUTIVE_BONUS: {
    type: 'number',
    defaultValue: 0.1,
    minValue: 0.0,
    maxValue: 1.0,
    description: 'Probability bonus for consecutive roasts'
  },
  ROAST_COOLDOWN: {
    type: 'boolean',
    defaultValue: true,
    description: 'Enable roasting cooldown system'
  },

  // Performance & Caching
  CACHE_MAX_SIZE: {
    type: 'integer',
    defaultValue: 1000,
    minValue: 10,
    maxValue: 10000,
    description: 'Maximum number of cached responses'
  },
  CACHE_TTL_MINUTES: {
    type: 'integer',
    defaultValue: 5,
    minValue: 1,
    maxValue: 60,
    description: 'Cache expiration time in minutes'
  },

  // Monitoring & Health
  HEALTH_CHECK_INTERVAL_MS: {
    type: 'integer',
    defaultValue: 30000,
    minValue: 5000,
    maxValue: 300000,
    description: 'Health check frequency in milliseconds'
  },
  METRICS_RETENTION_HOURS: {
    type: 'integer',
    defaultValue: 24,
    minValue: 1,
    maxValue: 168,
    description: 'Metrics storage duration in hours'
  },
  ALERT_MEMORY_USAGE: {
    type: 'number',
    defaultValue: 0.8,
    minValue: 0.1,
    maxValue: 0.95,
    description: 'Memory usage threshold for alerts'
  },
  ALERT_ERROR_RATE: {
    type: 'number',
    defaultValue: 0.1,
    minValue: 0.01,
    maxValue: 0.5,
    description: 'Error rate threshold for alerts'
  },
  ALERT_RESPONSE_TIME_MS: {
    type: 'integer',
    defaultValue: 5000,
    minValue: 1000,
    maxValue: 30000,
    description: 'Response time threshold for alerts in milliseconds'
  },

  // Legacy Environment Variables (for backward compatibility)
  GEMINI_RATE_LIMIT_RPM: {
    type: 'integer',
    deprecated: true,
    deprecationMessage: 'Use RATE_LIMIT_RPM instead',
    description: 'Legacy RPM limit (deprecated)'
  },
  GEMINI_RATE_LIMIT_DAILY: {
    type: 'integer',
    deprecated: true,
    deprecationMessage: 'Use RATE_LIMIT_DAILY instead',
    description: 'Legacy daily limit (deprecated)'
  },
  CONVERSATION_TIMEOUT_MINUTES: {
    type: 'integer',
    deprecated: true,
    deprecationMessage: 'Use CONTEXT_TIMEOUT_MINUTES instead',
    description: 'Legacy conversation timeout (deprecated)'
  },
  MAX_CONVERSATION_MESSAGES: {
    type: 'integer',
    deprecated: true,
    deprecationMessage: 'Use CONTEXT_MAX_MESSAGES instead',
    description: 'Legacy max messages (deprecated)'
  },
  MAX_CONTEXT_CHARS: {
    type: 'integer',
    deprecated: true,
    deprecationMessage: 'Use CONTEXT_MAX_CHARS instead',
    description: 'Legacy max context chars (deprecated)'
  },
  GROUNDING_THRESHOLD: {
    type: 'number',
    deprecated: true,
    deprecationMessage: 'Use GEMINI_GOOGLE_SEARCH_THRESHOLD instead',
    description: 'Legacy grounding threshold (deprecated)'
  },
  THINKING_BUDGET: {
    type: 'integer',
    deprecated: true,
    deprecationMessage: 'Use GEMINI_THINKING_BUDGET instead',
    description: 'Legacy thinking budget (deprecated)'
  },
  INCLUDE_THOUGHTS: {
    type: 'boolean',
    deprecated: true,
    deprecationMessage: 'Use GEMINI_INCLUDE_THOUGHTS instead',
    description: 'Legacy include thoughts (deprecated)'
  },
  ENABLE_CODE_EXECUTION: {
    type: 'boolean',
    deprecated: true,
    deprecationMessage: 'Use GEMINI_ENABLE_CODE_EXECUTION instead',
    description: 'Legacy code execution (deprecated)'
  },
  ENABLE_STRUCTURED_OUTPUT: {
    type: 'boolean',
    deprecated: true,
    deprecationMessage: 'Use GEMINI_ENABLE_STRUCTURED_OUTPUT instead',
    description: 'Legacy structured output (deprecated)'
  }
};

// =============================================================================
// ConfigurationValidator Class
// =============================================================================

export class ConfigurationValidator {
  private static instance: ConfigurationValidator;
  private validationCache = new Map<string, ValidationResult>();
  private parsedConfigCache: ParsedConfig | null = null;

  /**
   * Singleton instance getter
   */
  static getInstance(): ConfigurationValidator {
    if (!ConfigurationValidator.instance) {
      ConfigurationValidator.instance = new ConfigurationValidator();
    }
    return ConfigurationValidator.instance;
  }

  /**
   * Validates all environment variables according to their schemas
   */
  validateEnvironment(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Check required variables first
    const requiredVars = Object.entries(ENV_VAR_SCHEMAS)
      .filter(([, schema]) => schema.required && !schema.deprecated);

    for (const [envVar, schema] of requiredVars) {
      const value = process.env[envVar];
      if (!value) {
        errors.push({
          field: envVar,
          value,
          message: `Required environment variable ${envVar} is missing`,
          expected: schema.description || 'Valid value required'
        });
      }
    }

    // Validate all defined environment variables
    for (const [envVar, schema] of Object.entries(ENV_VAR_SCHEMAS)) {
      const value = process.env[envVar];
      
      // Skip validation if not defined and not required
      if (!value && !schema.required) {
        continue;
      }

      // Handle deprecated variables
      if (schema.deprecated && value) {
        warnings.push(
          `Environment variable ${envVar} is deprecated. ${schema.deprecationMessage || 'Please update your configuration.'}`
        );
      }

      // Validate the value if present
      if (value) {
        const validation = this.validateSingleValue(envVar, value, schema);
        errors.push(...validation.errors);
        warnings.push(...validation.warnings);
      }
    }

    // Check for business logic violations
    const businessValidation = this.validateBusinessLogic();
    errors.push(...businessValidation.errors);
    warnings.push(...businessValidation.warnings);

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings
    };

    // Cache the result
    this.validationCache.set('full_validation', result);
    
    return result;
  }

  /**
   * Validates a single environment variable value
   */
  private validateSingleValue(envVar: string, value: string, schema: EnvVarSchema): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    try {
      // Type validation
      const parsedValue = this.parseValue(value, schema.type);
      
      // Range validation for numbers
      if (schema.type === 'number' || schema.type === 'integer') {
        const numValue = parsedValue as number;
        
        if (schema.minValue !== undefined && numValue < schema.minValue) {
          errors.push({
            field: envVar,
            value,
            message: `Value ${numValue} is below minimum ${schema.minValue}`,
            expected: `Minimum: ${schema.minValue}`
          });
        }
        
        if (schema.maxValue !== undefined && numValue > schema.maxValue) {
          errors.push({
            field: envVar,
            value,
            message: `Value ${numValue} is above maximum ${schema.maxValue}`,
            expected: `Maximum: ${schema.maxValue}`
          });
        }
      }

      // Pattern validation for strings
      if (schema.type === 'string' && schema.pattern) {
        if (!schema.pattern.test(value)) {
          errors.push({
            field: envVar,
            value,
            message: 'Value does not match required pattern',
            expected: `Pattern: ${schema.pattern.toString()}`
          });
        }
      }

      // Allowed values validation
      if (schema.allowedValues && !schema.allowedValues.includes(value)) {
        errors.push({
          field: envVar,
          value,
          message: 'Value is not in allowed list',
          expected: `Allowed: ${schema.allowedValues.join(', ')}`
        });
      }

    } catch (error) {
      errors.push({
        field: envVar,
        value,
        message: `Failed to parse as ${schema.type}: ${error}`,
        expected: `Valid ${schema.type} value`
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates business logic rules across multiple environment variables
   */
  private validateBusinessLogic(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    try {
      const config = this.getParsedConfig();

      // Validate roasting configuration
      const roastBase = config.ROAST_BASE_CHANCE as number || 0.3;
      const roastMax = config.ROAST_MAX_CHANCE as number || 0.8;
      
      if (roastBase > roastMax) {
        errors.push({
          field: 'ROAST_BASE_CHANCE',
          value: String(roastBase),
          message: 'Base roasting chance cannot be greater than maximum chance',
          expected: `Value <= ${roastMax}`
        });
      }

      // Validate rate limiting logic
      const rpm = config.RATE_LIMIT_RPM as number || 15;
      const daily = config.RATE_LIMIT_DAILY as number || 1500;
      const burstSize = config.RATE_LIMIT_BURST as number || 5;
      
      if (rpm > daily / 24) {
        warnings.push(
          `RPM limit (${rpm}) may exceed daily limit divided by 24 hours (${Math.floor(daily / 24)}). This may cause unexpected behavior.`
        );
      }
      
      if (burstSize > rpm) {
        warnings.push(
          `Burst size (${burstSize}) is greater than RPM limit (${rpm}). This may cause unexpected behavior.`
        );
      }

      // Validate context memory settings
      const maxMessages = config.CONTEXT_MAX_MESSAGES as number || 100;
      const maxChars = config.CONTEXT_MAX_CHARS as number || 75000;
      
      if (maxMessages > 1000 && maxChars > 500000) {
        warnings.push(
          'Very high context limits may impact performance and memory usage'
        );
      }

    } catch (error) {
      // Don't fail validation if business logic check fails
      logger.warn('Business logic validation failed:', error);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Parses a string value according to the specified type
   */
  private parseValue(value: string, type: EnvVarSchema['type']): string | number | boolean {
    switch (type) {
    case 'string':
      return value;
        
    case 'number': {
      const num = parseFloat(value);
      if (isNaN(num)) {
        throw new Error(`Cannot parse "${value}" as number`);
      }
      return num;
    }
        
    case 'integer': {
      const int = parseInt(value, 10);
      if (isNaN(int) || !Number.isInteger(int)) {
        throw new Error(`Cannot parse "${value}" as integer`);
      }
      return int;
    }
        
    case 'boolean': {
      const lower = value.toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(lower)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(lower)) {
        return false;
      }
      throw new Error(`Cannot parse "${value}" as boolean`);
    }
    default:
      throw new Error(`Unknown type: ${type}`);
    }
  }

  /**
   * Gets a parsed configuration object with proper types and defaults
   */
  getParsedConfig(): ParsedConfig {
    if (this.parsedConfigCache) {
      return this.parsedConfigCache;
    }

    const config: ParsedConfig = {};

    for (const [envVar, schema] of Object.entries(ENV_VAR_SCHEMAS)) {
      const value = process.env[envVar];
      
      if (value) {
        try {
          config[envVar] = this.parseValue(value, schema.type);
        } catch (error) {
          // Use default value if parsing fails
          config[envVar] = schema.defaultValue as string | number | boolean | undefined;
          logger.warn(`Failed to parse ${envVar}, using default:`, error);
        }
      } else if (schema.defaultValue !== undefined) {
        config[envVar] = schema.defaultValue as string | number | boolean | undefined;
      }
    }

    this.parsedConfigCache = config;
    return config;
  }

  /**
   * Gets a specific configuration value with proper type and default
   */
  getConfigValue<T = unknown>(envVar: string): T | undefined {
    const config = this.getParsedConfig();
    return config[envVar] as T;
  }

  /**
   * Gets a configuration value with guaranteed fallback to default
   */
  getConfigValueWithDefault<T>(envVar: string, fallback: T): T {
    const value = this.getConfigValue<T>(envVar);
    return value !== undefined ? value : fallback;
  }

  /**
   * Validates a specific environment variable by name
   */
  validateVariable(envVar: string): ValidationResult {
    const schema = ENV_VAR_SCHEMAS[envVar];
    if (!schema) {
      return {
        isValid: false,
        errors: [{
          field: envVar,
          value: process.env[envVar],
          message: `Unknown environment variable ${envVar}`,
          expected: 'Valid environment variable name'
        }],
        warnings: []
      };
    }

    const value = process.env[envVar];
    
    if (!value && schema.required) {
      return {
        isValid: false,
        errors: [{
          field: envVar,
          value,
          message: `Required environment variable ${envVar} is missing`,
          expected: schema.description || 'Valid value required'
        }],
        warnings: []
      };
    }

    if (!value) {
      return { isValid: true, errors: [], warnings: [] };
    }

    return this.validateSingleValue(envVar, value, schema);
  }

  /**
   * Gets a list of all available environment variables with their descriptions
   */
  getAvailableVariables(): Array<{ name: string; description: string; required: boolean; deprecated: boolean }> {
    return Object.entries(ENV_VAR_SCHEMAS).map(([name, schema]) => ({
      name,
      description: schema.description || 'No description available',
      required: schema.required || false,
      deprecated: schema.deprecated || false
    }));
  }

  /**
   * Clears internal caches (useful for testing or configuration reloading)
   */
  clearCache(): void {
    this.validationCache.clear();
    this.parsedConfigCache = null;
  }

  /**
   * Gets validation errors in a human-readable format
   */
  formatValidationErrors(result: ValidationResult): string {
    if (result.isValid) {
      return 'All environment variables are valid.';
    }

    const messages: string[] = ['Environment validation failed:'];
    
    for (const error of result.errors) {
      messages.push(`  • ${error.field}: ${error.message}`);
      if (error.expected) {
        messages.push(`    Expected: ${error.expected}`);
      }
    }

    if (result.warnings.length > 0) {
      messages.push('', 'Warnings:');
      for (const warning of result.warnings) {
        messages.push(`  ⚠ ${warning}`);
      }
    }

    return messages.join('\n');
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Validates the current environment and throws on critical errors
 */
export function validateEnvironment(): ValidationResult {
  const validator = ConfigurationValidator.getInstance();
  const result = validator.validateEnvironment();
  
  if (!result.isValid) {
    const errorMessage = validator.formatValidationErrors(result);
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      logger.warn(warning);
    }
  }

  return result;
}

/**
 * Gets a configuration value with type safety and defaults
 */
export function getConfigValue<T = unknown>(envVar: string): T | undefined {
  return ConfigurationValidator.getInstance().getConfigValue<T>(envVar);
}

/**
 * Gets a configuration value with guaranteed fallback
 */
export function getConfigValueWithDefault<T>(envVar: string, fallback: T): T {
  return ConfigurationValidator.getInstance().getConfigValueWithDefault(envVar, fallback);
}

/**
 * Parses a string value as an integer with range validation
 */
export function parseIntWithDefault(envVar: string, defaultValue: number, min?: number, max?: number): number {
  const value = getConfigValue<number>(envVar);
  
  if (value === undefined) {
    return defaultValue;
  }

  if (min !== undefined && value < min) {
    logger.warn(`${envVar} value ${value} is below minimum ${min}, using minimum`);
    return min;
  }

  if (max !== undefined && value > max) {
    logger.warn(`${envVar} value ${value} is above maximum ${max}, using maximum`);
    return max;
  }

  return value;
}

/**
 * Parses a string value as a float with range validation
 */
export function parseFloatWithDefault(envVar: string, defaultValue: number, min?: number, max?: number): number {
  const value = getConfigValue<number>(envVar);
  
  if (value === undefined) {
    return defaultValue;
  }

  if (min !== undefined && value < min) {
    logger.warn(`${envVar} value ${value} is below minimum ${min}, using minimum`);
    return min;
  }

  if (max !== undefined && value > max) {
    logger.warn(`${envVar} value ${value} is above maximum ${max}, using maximum`);
    return max;
  }

  return value;
}

/**
 * Parses a string value as a boolean with default
 */
export function parseBooleanWithDefault(envVar: string, defaultValue: boolean): boolean {
  const value = getConfigValue<boolean>(envVar);
  return value !== undefined ? value : defaultValue;
}

/**
 * Gets a string value with default
 */
export function getStringWithDefault(envVar: string, defaultValue: string): string {
  const value = getConfigValue<string>(envVar);
  return value !== undefined ? value : defaultValue;
}