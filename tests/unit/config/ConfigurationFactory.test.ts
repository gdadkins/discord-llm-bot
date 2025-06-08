import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConfigurationFactory } from '../../../src/config/ConfigurationFactory';
import { logger } from '../../../src/utils/logger';

// Mock the logger
jest.mock('../../../src/utils/logger');

describe('ConfigurationFactory', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('createBotConfiguration', () => {
    it('should create a complete bot configuration', () => {
      const config = ConfigurationFactory.createBotConfiguration();

      expect(config).toHaveProperty('version', '1.0.0');
      expect(config).toHaveProperty('lastModified');
      expect(config).toHaveProperty('modifiedBy', 'system');
      expect(config).toHaveProperty('discord');
      expect(config).toHaveProperty('gemini');
      expect(config).toHaveProperty('rateLimiting');
      expect(config).toHaveProperty('features');
    });
  });

  describe('createDiscordConfig', () => {
    it('should create Discord configuration with correct intents', () => {
      const config = ConfigurationFactory.createDiscordConfig();

      expect(config.intents).toEqual(['guilds', 'guildMessages', 'messageContent', 'guildMessageReactions']);
      expect(config.permissions).toEqual({});
      expect(config.commands).toEqual({});
    });
  });

  describe('createGeminiConfig', () => {
    it('should create Gemini config with default values', () => {
      const config = ConfigurationFactory.createGeminiConfig();

      expect(config.model).toBe('gemini-2.0-flash-exp');
      expect(config.temperature).toBe(0.9);
      expect(config.topK).toBe(40);
      expect(config.topP).toBe(0.95);
      expect(config.maxTokens).toBe(8192);
      expect(config.safetySettings).toEqual({
        harassment: 'block_none',
        hateSpeech: 'block_none',
        sexuallyExplicit: 'block_none',
        dangerousContent: 'block_none'
      });
    });

    it('should use environment variables when available', () => {
      process.env.GEMINI_MODEL = 'gemini-pro';
      process.env.GEMINI_TEMPERATURE = '0.5';
      process.env.GEMINI_TOP_K = '20';
      process.env.GEMINI_TOP_P = '0.8';
      process.env.GEMINI_MAX_OUTPUT_TOKENS = '4096';

      const config = ConfigurationFactory.createGeminiConfig();

      expect(config.model).toBe('gemini-pro');
      expect(config.temperature).toBe(0.5);
      expect(config.topK).toBe(20);
      expect(config.topP).toBe(0.8);
      expect(config.maxTokens).toBe(4096);
    });

    it('should validate temperature range', () => {
      process.env.GEMINI_TEMPERATURE = '3.0'; // Above max

      const config = ConfigurationFactory.createGeminiConfig();
      expect(config.temperature).toBe(2.0); // Clamped to max
      expect(logger.warn).toHaveBeenCalledWith('Value for GEMINI_TEMPERATURE (3) is above maximum (2), using maximum');
    });

    it('should validate topK range', () => {
      process.env.GEMINI_TOP_K = '0'; // Below min

      const config = ConfigurationFactory.createGeminiConfig();
      expect(config.topK).toBe(1); // Clamped to min
      expect(logger.warn).toHaveBeenCalledWith('Value for GEMINI_TOP_K (0) is below minimum (1), using minimum');
    });

    it('should handle invalid numeric values', () => {
      process.env.GEMINI_TEMPERATURE = 'invalid';
      process.env.GEMINI_TOP_K = 'not-a-number';

      const config = ConfigurationFactory.createGeminiConfig();

      expect(config.temperature).toBe(0.9); // Default
      expect(config.topK).toBe(40); // Default
      expect(logger.warn).toHaveBeenCalledWith('Invalid float value for GEMINI_TEMPERATURE: invalid, using default: 0.9');
      expect(logger.warn).toHaveBeenCalledWith('Invalid integer value for GEMINI_TOP_K: not-a-number, using default: 40');
    });

    it('should handle boolean environment variables', () => {
      process.env.GEMINI_ENABLE_GOOGLE_SEARCH = 'true';
      process.env.GEMINI_INCLUDE_THOUGHTS = 'false';

      const config = ConfigurationFactory.createGeminiConfig();

      expect(config.grounding.enabled).toBe(true);
      expect(config.thinking.includeInResponse).toBe(false);
    });

    it('should clamp invalid configuration values', () => {
      process.env.GEMINI_TEMPERATURE = '-1'; // Below min
      process.env.GEMINI_TOP_P = '2'; // Above max

      const config = ConfigurationFactory.createGeminiConfig();
      
      expect(config.temperature).toBe(0.0); // Clamped to min
      expect(config.topP).toBe(1.0); // Clamped to max
      expect(logger.warn).toHaveBeenCalledWith('Value for GEMINI_TEMPERATURE (-1) is below minimum (0), using minimum');
      expect(logger.warn).toHaveBeenCalledWith('Value for GEMINI_TOP_P (2) is above maximum (1), using maximum');
    });
  });

  describe('createRateLimitingConfig', () => {
    it('should create rate limiting config with defaults', () => {
      const config = ConfigurationFactory.createRateLimitingConfig();

      expect(config.rpm).toBe(15);
      expect(config.daily).toBe(1000);
      expect(config.burstSize).toBe(5);
      expect(config.safetyMargin).toBe(0.1);
      expect(config.retryOptions).toEqual({
        maxRetries: 3,
        retryDelay: 1000,
        retryMultiplier: 2.0
      });
    });

    it('should use environment variables', () => {
      process.env.RATE_LIMIT_RPM = '30';
      process.env.RATE_LIMIT_DAILY = '2000';
      process.env.RATE_LIMIT_BURST = '10';
      process.env.GEMINI_MAX_RETRIES = '5';
      process.env.GEMINI_RETRY_DELAY_MS = '2000';
      process.env.GEMINI_RETRY_MULTIPLIER = '1.5';

      const config = ConfigurationFactory.createRateLimitingConfig();

      expect(config.rpm).toBe(30);
      expect(config.daily).toBe(2000);
      expect(config.burstSize).toBe(10);
      expect(config.retryOptions.maxRetries).toBe(5);
      expect(config.retryOptions.retryDelay).toBe(2000);
      expect(config.retryOptions.retryMultiplier).toBe(1.5);
    });

    it('should validate rate limit ranges', () => {
      process.env.RATE_LIMIT_RPM = '100'; // Above max
      process.env.RATE_LIMIT_BURST = '0'; // Below min

      const config = ConfigurationFactory.createRateLimitingConfig();

      expect(config.rpm).toBe(60); // Clamped to max
      expect(config.burstSize).toBe(1); // Clamped to min
      expect(logger.warn).toHaveBeenCalledWith('Value for RATE_LIMIT_RPM (100) is above maximum (60), using maximum');
      expect(logger.warn).toHaveBeenCalledWith('Value for RATE_LIMIT_BURST (0) is below minimum (1), using minimum');
    });

    it('should handle invalid configuration with clamping', () => {
      process.env.RATE_LIMIT_RPM = '0'; // Below min
      
      const config = ConfigurationFactory.createRateLimitingConfig();
      expect(config.rpm).toBe(1); // Clamped to min
      expect(logger.warn).toHaveBeenCalledWith('Value for RATE_LIMIT_RPM (0) is below minimum (1), using minimum');
    });

    it('should warn when burst size is greater than RPM', () => {
      process.env.RATE_LIMIT_RPM = '10';
      process.env.RATE_LIMIT_BURST = '15';

      const config = ConfigurationFactory.createRateLimitingConfig();
      
      expect(config.rpm).toBe(10);
      expect(config.burstSize).toBe(15);
      expect(logger.warn).toHaveBeenCalledWith('Burst size is greater than RPM limit, this may cause unexpected behavior');
    });
  });

  describe('createFeatureConfig', () => {
    it('should create feature config with all sub-configs', () => {
      const config = ConfigurationFactory.createFeatureConfig();

      expect(config).toHaveProperty('roasting');
      expect(config).toHaveProperty('codeExecution', false);
      expect(config).toHaveProperty('structuredOutput', false);
      expect(config).toHaveProperty('monitoring');
      expect(config).toHaveProperty('contextMemory');
      expect(config).toHaveProperty('caching');
    });

    it('should use environment variables for features', () => {
      process.env.GEMINI_ENABLE_CODE_EXECUTION = 'true';
      process.env.GEMINI_ENABLE_STRUCTURED_OUTPUT = 'true';
      process.env.CONTEXT_TIMEOUT_MINUTES = '120';
      process.env.CONTEXT_MAX_MESSAGES = '200';
      process.env.CACHE_MAX_SIZE = '5000';

      const config = ConfigurationFactory.createFeatureConfig();

      expect(config.codeExecution).toBe(true);
      expect(config.structuredOutput).toBe(true);
      expect(config.contextMemory.timeoutMinutes).toBe(120);
      expect(config.contextMemory.maxMessages).toBe(200);
      expect(config.caching.maxSize).toBe(5000);
    });
  });

  describe('validateApiKey', () => {
    it('should return GOOGLE_API_KEY when set', () => {
      process.env.GOOGLE_API_KEY = 'google-key';
      delete process.env.GEMINI_API_KEY;

      const apiKey = ConfigurationFactory.validateApiKey();
      expect(apiKey).toBe('google-key');
    });

    it('should return GEMINI_API_KEY when GOOGLE_API_KEY is not set', () => {
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'gemini-key';

      const apiKey = ConfigurationFactory.validateApiKey();
      expect(apiKey).toBe('gemini-key');
    });

    it('should throw when no API key is set', () => {
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;

      expect(() => ConfigurationFactory.validateApiKey()).toThrow('Missing required API key: either GOOGLE_API_KEY or GEMINI_API_KEY must be set');
      expect(logger.error).toHaveBeenCalledWith('Missing required API key: either GOOGLE_API_KEY or GEMINI_API_KEY must be set');
    });
  });

  describe('getConfigurationWithApiKey', () => {
    it('should return both config and API key', () => {
      process.env.GOOGLE_API_KEY = 'test-key';

      const result = ConfigurationFactory.getConfigurationWithApiKey();

      expect(result.apiKey).toBe('test-key');
      expect(result.config).toHaveProperty('version', '1.0.0');
    });
  });

  describe('boolean parsing', () => {
    it('should handle various boolean representations', () => {
      // Test 'true' variations
      process.env.GEMINI_ENABLE_CODE_EXECUTION = 'TRUE';
      let config = ConfigurationFactory.createFeatureConfig();
      expect(config.codeExecution).toBe(true);

      process.env.GEMINI_ENABLE_CODE_EXECUTION = '1';
      config = ConfigurationFactory.createFeatureConfig();
      expect(config.codeExecution).toBe(true);

      process.env.GEMINI_ENABLE_CODE_EXECUTION = 'yes';
      config = ConfigurationFactory.createFeatureConfig();
      expect(config.codeExecution).toBe(true);

      process.env.GEMINI_ENABLE_CODE_EXECUTION = 'on';
      config = ConfigurationFactory.createFeatureConfig();
      expect(config.codeExecution).toBe(true);

      // Test 'false' variations
      process.env.GEMINI_ENABLE_CODE_EXECUTION = 'FALSE';
      config = ConfigurationFactory.createFeatureConfig();
      expect(config.codeExecution).toBe(false);

      process.env.GEMINI_ENABLE_CODE_EXECUTION = '0';
      config = ConfigurationFactory.createFeatureConfig();
      expect(config.codeExecution).toBe(false);

      process.env.GEMINI_ENABLE_CODE_EXECUTION = 'no';
      config = ConfigurationFactory.createFeatureConfig();
      expect(config.codeExecution).toBe(false);

      process.env.GEMINI_ENABLE_CODE_EXECUTION = 'off';
      config = ConfigurationFactory.createFeatureConfig();
      expect(config.codeExecution).toBe(false);

      // Test invalid values
      process.env.GEMINI_ENABLE_CODE_EXECUTION = 'invalid';
      config = ConfigurationFactory.createFeatureConfig();
      expect(config.codeExecution).toBe(false); // Default
      expect(logger.warn).toHaveBeenCalledWith('Invalid boolean value for GEMINI_ENABLE_CODE_EXECUTION: invalid, using default: false');
    });
  });
});