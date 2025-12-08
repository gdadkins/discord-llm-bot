/**
 * ConfigurationValidator Unit Tests
 * Comprehensive test suite for environment variable validation
 * Target coverage: 80%+
 */

import { 
  ConfigurationValidator, 
  ENV_VAR_SCHEMAS,
  validateEnvironment,
  getConfigValue,
  getConfigValueWithDefault,
  parseIntWithDefault,
  parseFloatWithDefault,
  parseBooleanWithDefault,
  getStringWithDefault,
  type ValidationResult,
  type ValidationError
} from '../../../src/utils/ConfigurationValidator';
import { logger } from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('ConfigurationValidator', () => {
  let validator: ConfigurationValidator;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment for tests
    process.env = {};
    
    // Get fresh validator instance and clear cache
    validator = ConfigurationValidator.getInstance();
    validator.clearCache();
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ConfigurationValidator.getInstance();
      const instance2 = ConfigurationValidator.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Environment Validation', () => {
    it('should fail validation when required variables are missing', () => {
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'DISCORD_TOKEN',
            message: expect.stringContaining('Required')
          }),
          expect.objectContaining({
            field: 'DISCORD_CLIENT_ID',
            message: expect.stringContaining('Required')
          }),
          expect.objectContaining({
            field: 'GOOGLE_API_KEY',
            message: expect.stringContaining('Required')
          })
        ])
      );
    });

    it('should pass validation with all required variables', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle deprecated variables with warnings', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.GEMINI_API_KEY = 'deprecated-key';
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        expect.stringContaining('GEMINI_API_KEY is deprecated')
      );
    });

    it('should validate type conversions', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.RATE_LIMIT_RPM = '30';
      process.env.GEMINI_TEMPERATURE = '0.7';
      process.env.ENABLE_CODE_EXECUTION = 'true';
      
      const result = validator.validateEnvironment();
      const config = validator.getParsedConfig();
      
      expect(result.isValid).toBe(true);
      expect(config.RATE_LIMIT_RPM).toBe(30);
      expect(config.GEMINI_TEMPERATURE).toBe(0.7);
      expect(config.ENABLE_CODE_EXECUTION).toBe(true);
    });

    it('should validate number ranges', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.GEMINI_TEMPERATURE = '3.0'; // Too high
      process.env.RATE_LIMIT_RPM = '100'; // Too high
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'GEMINI_TEMPERATURE',
            message: expect.stringContaining('above maximum 2')
          }),
          expect.objectContaining({
            field: 'RATE_LIMIT_RPM',
            message: expect.stringContaining('above maximum 60')
          })
        ])
      );
    });

    it('should validate string patterns', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.GEMINI_MODEL = 'invalid-model'; // Should start with 'gemini-'
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'GEMINI_MODEL',
            message: expect.stringContaining('does not match required pattern')
          })
        ])
      );
    });

    it('should validate allowed values', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.NODE_ENV = 'staging'; // Not in allowed values
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'NODE_ENV',
            message: expect.stringContaining('not in allowed list')
          })
        ])
      );
    });

    it('should use default values when not specified', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      
      const config = validator.getParsedConfig();
      
      expect(config.NODE_ENV).toBe('development');
      expect(config.RATE_LIMIT_RPM).toBe(15);
      expect(config.GEMINI_TEMPERATURE).toBe(0.9);
    });
  });

  describe('Business Logic Validation', () => {
    it('should validate roasting configuration', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.ROAST_BASE_CHANCE = '0.9';
      process.env.ROAST_MAX_CHANCE = '0.5'; // Base > Max
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'ROAST_BASE_CHANCE',
            message: expect.stringContaining('cannot be greater than maximum')
          })
        ])
      );
    });

    it('should warn about rate limit configuration', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.RATE_LIMIT_RPM = '50';
      process.env.RATE_LIMIT_DAILY = '100'; // RPM > Daily/24
      process.env.RATE_LIMIT_BURST = '60'; // Burst > RPM
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('RPM limit'),
          expect.stringContaining('Burst size')
        ])
      );
    });

    it('should validate video processing dependencies', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.VIDEO_SUPPORT_ENABLED = 'false';
      process.env.YOUTUBE_URL_SUPPORT_ENABLED = 'true';
      process.env.PARTIAL_VIDEO_PROCESSING_ENABLED = 'true';
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'YOUTUBE_URL_SUPPORT_ENABLED',
            message: expect.stringContaining('requires video support')
          }),
          expect.objectContaining({
            field: 'PARTIAL_VIDEO_PROCESSING_ENABLED',
            message: expect.stringContaining('requires video support')
          })
        ])
      );
    });

    it('should warn about high context limits', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.CONTEXT_MAX_MESSAGES = '2000';
      process.env.CONTEXT_MAX_CHARS = '600000';
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Very high context limits')
        ])
      );
    });

    it('should warn about advanced features without proper API keys', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.GEMINI_ENABLE_GOOGLE_SEARCH = 'true';
      process.env.GEMINI_ENABLE_CODE_EXECUTION = 'true';
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Advanced AI features')
        ])
      );
    });
  });

  describe('Single Variable Validation', () => {
    it('should validate a single existing variable', () => {
      process.env.RATE_LIMIT_RPM = '25';
      
      const result = validator.validateVariable('RATE_LIMIT_RPM');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for unknown variable', () => {
      const result = validator.validateVariable('UNKNOWN_VAR');
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Unknown environment variable');
    });

    it('should fail validation for missing required variable', () => {
      const result = validator.validateVariable('DISCORD_TOKEN');
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Required');
    });

    it('should pass validation for missing optional variable', () => {
      const result = validator.validateVariable('CACHE_MAX_SIZE');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Type Parsing', () => {
    it('should parse boolean values correctly', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      
      // Test various boolean representations
      const booleanTests = [
        { value: 'true', expected: true },
        { value: 'false', expected: false },
        { value: '1', expected: true },
        { value: '0', expected: false },
        { value: 'yes', expected: true },
        { value: 'no', expected: false },
        { value: 'on', expected: true },
        { value: 'off', expected: false },
        { value: 'TRUE', expected: true },
        { value: 'FALSE', expected: false }
      ];
      
      for (const test of booleanTests) {
        process.env.ENABLE_CODE_EXECUTION = test.value;
        validator.clearCache();
        const config = validator.getParsedConfig();
        expect(config.ENABLE_CODE_EXECUTION).toBe(test.expected);
      }
    });

    it('should fail to parse invalid boolean', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.ENABLE_CODE_EXECUTION = 'maybe';
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'ENABLE_CODE_EXECUTION',
            message: expect.stringContaining('Failed to parse as boolean')
          })
        ])
      );
    });

    it('should parse integer values correctly', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.RATE_LIMIT_RPM = '42';
      
      const config = validator.getParsedConfig();
      expect(config.RATE_LIMIT_RPM).toBe(42);
      expect(Number.isInteger(config.RATE_LIMIT_RPM)).toBe(true);
    });

    it('should fail to parse invalid integer', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.RATE_LIMIT_RPM = '42.5'; // Not an integer
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Failed to parse as integer');
    });

    it('should parse float values correctly', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.GEMINI_TEMPERATURE = '0.75';
      
      const config = validator.getParsedConfig();
      expect(config.GEMINI_TEMPERATURE).toBe(0.75);
    });

    it('should fail to parse invalid number', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.GEMINI_TEMPERATURE = 'not-a-number';
      
      const result = validator.validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Failed to parse as number');
    });
  });

  describe('Configuration Getters', () => {
    it('should get specific config value', () => {
      process.env.NODE_ENV = 'production';
      
      const value = validator.getConfigValue<string>('NODE_ENV');
      expect(value).toBe('production');
    });

    it('should return undefined for missing value', () => {
      const value = validator.getConfigValue('MISSING_VAR');
      expect(value).toBeUndefined();
    });

    it('should get config value with default', () => {
      const value = validator.getConfigValueWithDefault('MISSING_VAR', 'default');
      expect(value).toBe('default');
    });

    it('should use existing value over default', () => {
      process.env.NODE_ENV = 'test';
      
      const value = validator.getConfigValueWithDefault('NODE_ENV', 'default');
      expect(value).toBe('test');
    });
  });

  describe('Available Variables', () => {
    it('should list all available variables', () => {
      const variables = validator.getAvailableVariables();
      
      expect(variables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'DISCORD_TOKEN',
            required: true,
            deprecated: false
          }),
          expect.objectContaining({
            name: 'GEMINI_API_KEY',
            required: false,
            deprecated: true
          })
        ])
      );
      
      // Check that all schema entries are included
      expect(variables).toHaveLength(Object.keys(ENV_VAR_SCHEMAS).length);
    });
  });

  describe('Cache Management', () => {
    it('should cache validation results', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      
      // First call
      const result1 = validator.validateEnvironment();
      
      // Change environment (but cache should still be used)
      process.env.NEW_VAR = 'value';
      
      // Second call should use cache
      const result2 = validator.validateEnvironment();
      
      expect(result1).toBe(result2);
    });

    it('should clear cache properly', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.CACHE_MAX_SIZE = '100';
      
      const config1 = validator.getParsedConfig();
      expect(config1.CACHE_MAX_SIZE).toBe(100);
      
      // Change environment and clear cache
      process.env.CACHE_MAX_SIZE = '200';
      validator.clearCache();
      
      const config2 = validator.getParsedConfig();
      expect(config2.CACHE_MAX_SIZE).toBe(200);
    });
  });

  describe('Error Formatting', () => {
    it('should format validation errors properly', () => {
      const result: ValidationResult = {
        isValid: false,
        errors: [
          {
            field: 'TEST_VAR',
            value: 'bad',
            message: 'Invalid value',
            expected: 'Valid value'
          }
        ],
        warnings: ['Test warning']
      };
      
      const formatted = validator.formatValidationErrors(result);
      
      expect(formatted).toContain('Environment validation failed');
      expect(formatted).toContain('TEST_VAR: Invalid value');
      expect(formatted).toContain('Expected: Valid value');
      expect(formatted).toContain('Warnings:');
      expect(formatted).toContain('⚠ Test warning');
    });

    it('should format successful validation', () => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
      };
      
      const formatted = validator.formatValidationErrors(result);
      expect(formatted).toBe('All environment variables are valid.');
    });
  });

  describe('Fallback to Default on Parse Error', () => {
    it('should use default value when parsing fails', () => {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.RATE_LIMIT_RPM = 'invalid-number';
      
      const config = validator.getParsedConfig();
      
      expect(config.RATE_LIMIT_RPM).toBe(15); // Default value
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse RATE_LIMIT_RPM'),
        expect.any(Error)
      );
    });
  });
});

describe('Helper Functions', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env = {};
    ConfigurationValidator.getInstance().clearCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateEnvironment function', () => {
    it('should handle development mode with missing API keys', () => {
      process.env.NODE_ENV = 'development';
      
      const result = validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('DEVELOPMENT MODE: Missing required environment variables')
      );
    });

    it('should throw in production mode with missing API keys', () => {
      process.env.NODE_ENV = 'production';
      
      expect(() => validateEnvironment()).toThrow();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should throw for non-API-key errors in development mode', () => {
      process.env.NODE_ENV = 'development';
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_API_KEY = 'test-api-key';
      process.env.GEMINI_TEMPERATURE = '5.0'; // Invalid range
      
      expect(() => validateEnvironment()).toThrow();
    });
  });

  describe('getConfigValue function', () => {
    it('should get config value', () => {
      process.env.LOG_LEVEL = 'debug';
      
      const value = getConfigValue<string>('LOG_LEVEL');
      expect(value).toBe('debug');
    });
  });

  describe('getConfigValueWithDefault function', () => {
    it('should get config value with default', () => {
      const value = getConfigValueWithDefault('MISSING', 'fallback');
      expect(value).toBe('fallback');
    });
  });

  describe('parseIntWithDefault function', () => {
    it('should parse integer with default', () => {
      process.env.RATE_LIMIT_RPM = '25';
      
      const value = parseIntWithDefault('RATE_LIMIT_RPM', 15);
      expect(value).toBe(25);
    });

    it('should use default when missing', () => {
      const value = parseIntWithDefault('MISSING_INT', 42);
      expect(value).toBe(42);
    });

    it('should enforce minimum value', () => {
      process.env.TEST_INT = '5';
      
      const value = parseIntWithDefault('TEST_INT', 20, 10, 100);
      expect(value).toBe(10);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('below minimum')
      );
    });

    it('should enforce maximum value', () => {
      process.env.TEST_INT = '150';
      
      const value = parseIntWithDefault('TEST_INT', 20, 10, 100);
      expect(value).toBe(100);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('above maximum')
      );
    });
  });

  describe('parseFloatWithDefault function', () => {
    it('should parse float with default', () => {
      process.env.GEMINI_TEMPERATURE = '0.75';
      
      const value = parseFloatWithDefault('GEMINI_TEMPERATURE', 0.9);
      expect(value).toBe(0.75);
    });

    it('should enforce range for floats', () => {
      process.env.TEST_FLOAT = '1.5';
      
      const value = parseFloatWithDefault('TEST_FLOAT', 0.5, 0.0, 1.0);
      expect(value).toBe(1.0);
    });
  });

  describe('parseBooleanWithDefault function', () => {
    it('should parse boolean with default', () => {
      process.env.ENABLE_CODE_EXECUTION = 'true';
      
      const value = parseBooleanWithDefault('ENABLE_CODE_EXECUTION', false);
      expect(value).toBe(true);
    });

    it('should use default when missing', () => {
      const value = parseBooleanWithDefault('MISSING_BOOL', true);
      expect(value).toBe(true);
    });
  });

  describe('getStringWithDefault function', () => {
    it('should get string with default', () => {
      process.env.NODE_ENV = 'test';
      
      const value = getStringWithDefault('NODE_ENV', 'development');
      expect(value).toBe('test');
    });

    it('should use default when missing', () => {
      const value = getStringWithDefault('MISSING_STRING', 'default');
      expect(value).toBe('default');
    });
  });
});