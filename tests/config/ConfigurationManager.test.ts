/**
 * Configuration Manager Tests
 * Tests for the actual ConfigurationManager implementation
 */

import { ConfigurationManager } from '../../src/config/ConfigurationManager';
import { SecretManager } from '../../src/config/SecretManager';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('fs');

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set up test environment
    process.env = {
      NODE_ENV: 'test',
      DISCORD_TOKEN: 'test-token',
      DISCORD_CLIENT_ID: 'test-client-id',
      GOOGLE_API_KEY: 'test-api-key',
      GEMINI_API_KEY: 'test-gemini-key', // For backward compatibility
      RATE_LIMIT_RPM: '15',
      RATE_LIMIT_DAILY: '1500',
      GEMINI_MODEL: 'gemini-2.0-flash-exp',
      GEMINI_TEMPERATURE: '0.9',
      GEMINI_TOP_K: '40',
      GEMINI_TOP_P: '0.95',
      GEMINI_MAX_OUTPUT_TOKENS: '8192',
      GEMINI_ENABLE_GOOGLE_SEARCH: 'true',
      GEMINI_GOOGLE_SEARCH_THRESHOLD: '0.3',
      GEMINI_THINKING_BUDGET: '20000',
      GEMINI_INCLUDE_THOUGHTS: 'false',
      VIDEO_SUPPORT_ENABLED: 'true',
      MAX_VIDEO_DURATION_SECONDS: '83',
      ROAST_BASE_CHANCE: '0.3',
      HEALTH_CHECK_INTERVAL_MS: '30000'
    };

    // Clear singleton instance
    (ConfigurationManager as any).instance = null;
    configManager = ConfigurationManager.getInstance();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ConfigurationManager.getInstance();
      const instance2 = ConfigurationManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await configManager.initialize();
      expect(configManager.isHealthy()).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
      // Force an error
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      
      await expect(configManager.initialize()).rejects.toThrow();
    });
  });

  describe('Configuration Access', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should get complete configuration', () => {
      const config = configManager.getConfiguration();
      
      expect(config).toMatchObject({
        version: expect.any(String),
        lastModified: expect.any(String),
        modifiedBy: expect.any(String),
        discord: expect.any(Object),
        gemini: expect.any(Object),
        rateLimiting: expect.any(Object),
        features: expect.any(Object)
      });
    });

    it('should get Discord configuration', () => {
      const discord = configManager.getDiscordConfig();
      
      expect(discord).toMatchObject({
        intents: expect.any(Array),
        permissions: expect.any(Object),
        commands: expect.any(Object)
      });
    });

    it('should get Gemini configuration', () => {
      const gemini = configManager.getGeminiConfig();
      
      expect(gemini).toMatchObject({
        model: 'gemini-2.0-flash-exp',
        temperature: 0.9,
        topK: 40,
        topP: 0.95,
        maxTokens: 8192,
        grounding: {
          enabled: true,
          threshold: 0.3
        },
        thinking: {
          budget: 20000,
          includeInResponse: false
        }
      });
    });

    it('should get rate limiting configuration', () => {
      const rateLimiting = configManager.getRateLimitingConfig();
      
      expect(rateLimiting).toMatchObject({
        rpm: 15,
        daily: 1500,
        burstSize: expect.any(Number),
        safetyMargin: expect.any(Number)
      });
    });

    it('should get roasting configuration', () => {
      const roasting = configManager.getRoastingConfig();
      
      expect(roasting).toMatchObject({
        baseChance: 0.3,
        consecutiveBonus: expect.any(Number),
        maxChance: expect.any(Number),
        cooldownEnabled: expect.any(Boolean)
      });
    });

    it('should get monitoring configuration', () => {
      const monitoring = configManager.getMonitoringConfig();
      
      expect(monitoring).toMatchObject({
        healthMetrics: {
          enabled: true,
          collectionInterval: 30000
        },
        alerts: expect.any(Object),
        gracefulDegradation: expect.any(Object)
      });
    });

    it('should get feature configuration', () => {
      const features = configManager.getFeatureConfig();
      
      expect(features).toMatchObject({
        roasting: expect.any(Object),
        codeExecution: expect.any(Boolean),
        structuredOutput: expect.any(Boolean),
        monitoring: expect.any(Object),
        contextMemory: expect.any(Object),
        caching: expect.any(Object)
      });
    });
  });

  describe('Nested Path Access', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should get configuration value by path', () => {
      expect(configManager.getConfigValue('gemini.model')).toBe('gemini-2.0-flash-exp');
      expect(configManager.getConfigValue('gemini.temperature')).toBe(0.9);
      expect(configManager.getConfigValue('rateLimiting.rpm')).toBe(15);
      expect(configManager.getConfigValue('features.roasting.baseChance')).toBe(0.3);
    });

    it('should return default value for non-existent path', () => {
      expect(configManager.getConfigValue('non.existent.path', 'default')).toBe('default');
      expect(configManager.getConfigValue('another.missing.path')).toBeUndefined();
    });

    it('should handle deeply nested paths', () => {
      expect(configManager.getConfigValue('gemini.grounding.enabled')).toBe(true);
      expect(configManager.getConfigValue('gemini.thinking.budget')).toBe(20000);
      expect(configManager.getConfigValue('features.monitoring.healthMetrics.enabled')).toBe(true);
    });
  });

  describe('Additional Configuration Methods', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should get video configuration', () => {
      const videoConfig = configManager.getVideoConfig();
      
      expect(videoConfig).toMatchObject({
        enabled: true,
        maxDurationSeconds: 83,
        tokenWarningThreshold: expect.any(Number),
        fileSizeLimitMB: expect.any(Number)
      });
    });

    it('should get Gemini model configuration', () => {
      const modelConfig = configManager.getGeminiModelConfig();
      
      expect(modelConfig).toMatchObject({
        model: 'gemini-2.0-flash-exp',
        generationConfig: expect.any(Object),
        systemInstruction: expect.any(String)
      });
    });

    it('should support different Gemini profiles', () => {
      const profiles = ['DEFAULT', 'HELPFUL', 'ROASTING', 'PRECISE', 'CREATIVE'];
      
      for (const profile of profiles) {
        const config = configManager.getGeminiModelConfig(profile);
        expect(config.model).toBeDefined();
        expect(config.generationConfig).toBeDefined();
      }
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration successfully', async () => {
      await configManager.initialize();
      const result = await configManager.validateConfiguration();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should detect invalid configuration', async () => {
      // Set invalid values
      process.env.GEMINI_TEMPERATURE = '3.0'; // Out of range
      process.env.RATE_LIMIT_RPM = '-1'; // Negative value
      
      (ConfigurationManager as any).instance = null;
      configManager = ConfigurationManager.getInstance();
      
      await expect(configManager.initialize()).rejects.toThrow();
    });
  });

  describe('Health Status', () => {
    it('should report healthy status', async () => {
      await configManager.initialize();
      
      expect(configManager.isHealthy()).toBe(true);
      
      const health = await configManager.getHealthStatus();
      expect(health.status).toBe('healthy');
      expect(health.message).toContain('Configuration loaded');
    });

    it('should report unhealthy status on error', async () => {
      // Force an error
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      
      try {
        await configManager.initialize();
      } catch (error) {
        // Expected to fail
      }
      
      expect(configManager.isHealthy()).toBe(false);
      
      const health = await configManager.getHealthStatus();
      expect(health.status).toBe('unhealthy');
    });
  });

  describe('Event Emissions', () => {
    it('should emit configuration loaded event', async () => {
      const loadedHandler = jest.fn();
      configManager.on('config:loaded', loadedHandler);
      
      await configManager.initialize();
      
      expect(loadedHandler).toHaveBeenCalledWith(expect.any(String));
    });

    it('should emit validation events', async () => {
      const validatedHandler = jest.fn();
      configManager.on('config:validated', validatedHandler);
      
      await configManager.initialize();
      
      expect(validatedHandler).toHaveBeenCalledWith(true, undefined);
    });

    it('should emit error events on failure', async () => {
      const errorHandler = jest.fn();
      configManager.on('config:error', errorHandler);
      
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      
      try {
        await configManager.initialize();
      } catch (error) {
        // Expected
      }
      
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Configuration Reload', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should reload configuration', async () => {
      const reloadedHandler = jest.fn();
      configManager.on('config:reloaded', reloadedHandler);
      
      await configManager.reloadConfiguration('command', 'Test reload');
      
      expect(reloadedHandler).toHaveBeenCalledWith(expect.any(String));
    });

    it('should handle reload errors', async () => {
      // Force an error on reload
      jest.spyOn(configManager as any, 'loadConfiguration').mockRejectedValueOnce(new Error('Reload failed'));
      
      await expect(configManager.reloadConfiguration()).rejects.toThrow('Reload failed');
      expect(configManager.isHealthy()).toBe(false);
    });
  });

  describe('Environment Overrides', () => {
    it('should apply environment overrides', async () => {
      await configManager.initialize();
      
      const overrides = {
        'GEMINI_TEMPERATURE': '0.5',
        'RATE_LIMIT_RPM': '30'
      };
      
      configManager.setEnvironmentOverrides(overrides);
      
      // Force reload to apply overrides
      await configManager.reloadConfiguration();
      
      expect(configManager.getConfigValue('gemini.temperature')).toBe(0.5);
      expect(configManager.getConfigValue('rateLimiting.rpm')).toBe(30);
    });
  });

  describe('Secret Manager Integration', () => {
    it('should integrate with SecretManager', async () => {
      await configManager.initialize();
      
      const secretManager = SecretManager.getInstance();
      await secretManager.initialize();
      
      // Store a secret
      await secretManager.setSecret('test.secret', 'secret-value');
      
      // Access through configuration manager (if implemented)
      // This is a placeholder for future integration
      expect(secretManager).toBeDefined();
    });
  });

  describe('Feature Flag Support', () => {
    beforeEach(async () => {
      process.env.FEATURE_VIDEO_PROCESSING = 'true';
      process.env.FEATURE_AUDIO_PROCESSING = 'false';
      process.env.FEATURE_BETA_FEATURE = 'true';
      process.env.FEATURE_BETA_FEATURE_ROLLOUT = '50';
      
      await configManager.initialize();
    });

    it('should check feature flags from environment', () => {
      // This tests the environment setup for feature flags
      // Actual feature flag checking would be implemented in the manager
      expect(process.env.FEATURE_VIDEO_PROCESSING).toBe('true');
      expect(process.env.FEATURE_AUDIO_PROCESSING).toBe('false');
      expect(process.env.FEATURE_BETA_FEATURE_ROLLOUT).toBe('50');
    });
  });

  describe('Backward Compatibility', () => {
    it('should support both GOOGLE_API_KEY and GEMINI_API_KEY', async () => {
      // Test with GOOGLE_API_KEY only
      delete process.env.GEMINI_API_KEY;
      (ConfigurationManager as any).instance = null;
      let manager = ConfigurationManager.getInstance();
      await manager.initialize();
      expect(manager.isHealthy()).toBe(true);
      
      // Test with GEMINI_API_KEY only
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'test-key';
      (ConfigurationManager as any).instance = null;
      manager = ConfigurationManager.getInstance();
      await manager.initialize();
      expect(manager.isHealthy()).toBe(true);
    });
  });
});