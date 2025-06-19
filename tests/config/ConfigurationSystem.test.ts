/**
 * Configuration System Unit Tests
 * Tests for ConfigurationManager, SecretManager, ConfigurationValidator, and FeatureFlags
 */

import { ConfigurationManager } from '../../src/config/ConfigurationManager';
import { SecretManager } from '../../src/config/SecretManager';
import * as ConfigurationValidator from '../../src/utils/ConfigurationValidator';
import { EventEmitter } from 'events';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('fs');
jest.mock('crypto');

describe('ConfigurationSystem', () => {
  let configManager: ConfigurationManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Reset environment for tests
    process.env = {
      NODE_ENV: 'test',
      DISCORD_TOKEN: 'test-token',
      DISCORD_CLIENT_ID: 'test-client-id',
      GOOGLE_API_KEY: 'test-api-key',
      RATE_LIMIT_RPM: '15',
      RATE_LIMIT_DAILY: '1500',
      GEMINI_MODEL: 'gemini-2.0-flash-exp',
      GEMINI_TEMPERATURE: '0.9',
      FEATURE_FLAGS_ENABLED: 'true'
    };

    // Clear any existing instance
    (ConfigurationManager as any).instance = null;
    configManager = ConfigurationManager.getInstance();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('ConfigurationManager', () => {
    describe('Initialization', () => {
      it('should create singleton instance', () => {
        const instance1 = ConfigurationManager.getInstance();
        const instance2 = ConfigurationManager.getInstance();
        expect(instance1).toBe(instance2);
      });

      it('should load configuration on initialization', () => {
        const config = configManager.getConfiguration();
        expect(config).toBeDefined();
        expect(config.discord).toBeDefined();
        expect(config.gemini).toBeDefined();
        expect(config.rateLimiting).toBeDefined();
      });

      it('should validate configuration on load', () => {
        // Remove required field
        delete process.env.GOOGLE_API_KEY;
        
        // Reset instance
        (ConfigurationManager as any).instance = null;
        
        expect(() => {
          ConfigurationManager.getInstance();
        }).toThrow();
      });
    });

    describe('Configuration Access', () => {
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

      it('should get specific configuration values', () => {
        const model = configManager.getConfigValue('gemini.model');
        expect(model).toBe('gemini-2.0-flash-exp');

        const rpm = configManager.getConfigValue('rateLimiting.rpm');
        expect(rpm).toBe(15);

        const nested = configManager.getConfigValue('gemini.thinking.budget');
        expect(nested).toBeDefined();
      });

      it('should return undefined for non-existent paths', () => {
        const value = configManager.getConfigValue('non.existent.path');
        expect(value).toBeUndefined();
      });

      it('should get configuration with defaults', () => {
        const value = configManager.getConfigValue('non.existent', 'default');
        expect(value).toBe('default');
      });
    });

    describe('Configuration Updates', () => {
      it('should update configuration values', () => {
        configManager.updateConfig('gemini.temperature', 0.5);
        const temp = configManager.getConfigValue('gemini.temperature');
        expect(temp).toBe(0.5);
      });

      it('should emit change events on update', (done) => {
        configManager.on('configChange', (change) => {
          expect(change.path).toBe('gemini.temperature');
          expect(change.oldValue).toBe(0.9);
          expect(change.newValue).toBe(0.7);
          done();
        });

        configManager.updateConfig('gemini.temperature', 0.7);
      });

      it('should validate updates before applying', () => {
        expect(() => {
          configManager.updateConfig('gemini.temperature', 3.0); // Out of range
        }).toThrow();
      });

      it('should support batch updates', () => {
        const updates = {
          'gemini.temperature': 0.8,
          'gemini.topK': 50,
          'rateLimiting.rpm': 20
        };

        configManager.batchUpdate(updates);

        expect(configManager.getConfigValue('gemini.temperature')).toBe(0.8);
        expect(configManager.getConfigValue('gemini.topK')).toBe(50);
        expect(configManager.getConfigValue('rateLimiting.rpm')).toBe(20);
      });
    });

    describe('Configuration Profiles', () => {
      it('should load development profile', () => {
        process.env.CONFIG_PROFILE = 'development';
        configManager.loadProfile('development');

        const config = configManager.getConfiguration();
        expect(config.environment).toBe('development');
        expect(logger.level).toBe('debug');
      });

      it('should load production profile', () => {
        process.env.CONFIG_PROFILE = 'production';
        configManager.loadProfile('production');

        const config = configManager.getConfiguration();
        expect(config.environment).toBe('production');
        expect(config.features.monitoring.healthMetrics.enabled).toBe(true);
      });

      it('should apply profile overrides', () => {
        const overrides = {
          'gemini.temperature': 0.3,
          'features.roasting.baseChance': 0.1
        };

        configManager.loadProfile('production', overrides);
        
        expect(configManager.getConfigValue('gemini.temperature')).toBe(0.3);
        expect(configManager.getConfigValue('features.roasting.baseChance')).toBe(0.1);
      });
    });

    describe('Hot Reload', () => {
      it('should enable hot reload when configured', () => {
        process.env.CONFIG_HOT_RELOAD_ENABLED = 'true';
        
        const enableSpy = jest.spyOn(configManager as any, 'enableHotReload');
        configManager.initialize();
        
        expect(enableSpy).toHaveBeenCalled();
      });

      it('should reload configuration on file change', (done) => {
        configManager.on('configReload', () => {
          done();
        });

        // Simulate file change
        (configManager as any).handleFileChange();
      });

      it('should handle reload errors gracefully', () => {
        const mockError = new Error('Reload failed');
        jest.spyOn(configManager as any, 'loadConfiguration').mockImplementationOnce(() => {
          throw mockError;
        });

        expect(() => {
          (configManager as any).handleFileChange();
        }).not.toThrow();

        expect(logger.error).toHaveBeenCalledWith('Failed to reload configuration', mockError);
      });
    });
  });

  describe('SecretManager', () => {
    let secretManager: SecretManager;

    beforeEach(() => {
      secretManager = new SecretManager();
    });

    describe('Secret Storage', () => {
      it('should encrypt and store secrets', () => {
        secretManager.setSecret('api.key', 'super-secret-key');
        const encrypted = (secretManager as any).secrets.get('api.key');
        
        expect(encrypted).toBeDefined();
        expect(encrypted).not.toBe('super-secret-key');
      });

      it('should decrypt and retrieve secrets', () => {
        secretManager.setSecret('api.key', 'super-secret-key');
        const decrypted = secretManager.getSecret('api.key');
        
        expect(decrypted).toBe('super-secret-key');
      });

      it('should return null for non-existent secrets', () => {
        const secret = secretManager.getSecret('non.existent');
        expect(secret).toBeNull();
      });

      it('should delete secrets', () => {
        secretManager.setSecret('api.key', 'super-secret-key');
        secretManager.deleteSecret('api.key');
        
        expect(secretManager.getSecret('api.key')).toBeNull();
      });

      it('should check if secret exists', () => {
        secretManager.setSecret('api.key', 'super-secret-key');
        
        expect(secretManager.hasSecret('api.key')).toBe(true);
        expect(secretManager.hasSecret('non.existent')).toBe(false);
      });
    });

    describe('Batch Operations', () => {
      it('should set multiple secrets', () => {
        const secrets = {
          'api.key1': 'secret1',
          'api.key2': 'secret2',
          'api.key3': 'secret3'
        };

        secretManager.setSecrets(secrets);

        expect(secretManager.getSecret('api.key1')).toBe('secret1');
        expect(secretManager.getSecret('api.key2')).toBe('secret2');
        expect(secretManager.getSecret('api.key3')).toBe('secret3');
      });

      it('should get multiple secrets', () => {
        secretManager.setSecret('api.key1', 'secret1');
        secretManager.setSecret('api.key2', 'secret2');

        const secrets = secretManager.getSecrets(['api.key1', 'api.key2', 'api.key3']);
        
        expect(secrets).toEqual({
          'api.key1': 'secret1',
          'api.key2': 'secret2',
          'api.key3': null
        });
      });
    });

    describe('Secret Rotation', () => {
      it('should rotate encryption key', () => {
        secretManager.setSecret('api.key', 'secret-value');
        const oldEncrypted = (secretManager as any).secrets.get('api.key');

        secretManager.rotateKey();
        
        const newEncrypted = (secretManager as any).secrets.get('api.key');
        expect(newEncrypted).not.toBe(oldEncrypted);
        expect(secretManager.getSecret('api.key')).toBe('secret-value');
      });

      it('should maintain secrets after rotation', () => {
        const secrets = {
          'key1': 'value1',
          'key2': 'value2',
          'key3': 'value3'
        };

        secretManager.setSecrets(secrets);
        secretManager.rotateKey();

        for (const [key, value] of Object.entries(secrets)) {
          expect(secretManager.getSecret(key)).toBe(value);
        }
      });
    });

    describe('Integration with ConfigurationManager', () => {
      it('should integrate with configuration manager', () => {
        configManager.setSecretManager(secretManager);
        
        // Store API key as secret
        secretManager.setSecret('google.apiKey', process.env.GOOGLE_API_KEY!);
        
        // Access through configuration manager
        const apiKey = configManager.getSecret('google.apiKey');
        expect(apiKey).toBe(process.env.GOOGLE_API_KEY);
      });
    });
  });

  describe('Feature Flags', () => {
    describe('Flag Management', () => {
      it('should check if feature is enabled', () => {
        process.env.FEATURE_VIDEO_PROCESSING = 'true';
        expect(configManager.isFeatureEnabled('video-processing')).toBe(true);
        
        process.env.FEATURE_AUDIO_PROCESSING = 'false';
        expect(configManager.isFeatureEnabled('audio-processing')).toBe(false);
      });

      it('should handle rollout percentages', () => {
        process.env.FEATURE_NEW_UI = 'true';
        process.env.FEATURE_NEW_UI_ROLLOUT = '50';

        // Mock Math.random for consistent testing
        const mockRandom = jest.spyOn(Math, 'random');
        
        // User in rollout (random < 0.5)
        mockRandom.mockReturnValue(0.3);
        expect(configManager.isFeatureEnabled('new-ui', 'user123')).toBe(true);
        
        // User not in rollout (random >= 0.5)
        mockRandom.mockReturnValue(0.7);
        expect(configManager.isFeatureEnabled('new-ui', 'user456')).toBe(false);
        
        mockRandom.mockRestore();
      });

      it('should use consistent user bucketing', () => {
        process.env.FEATURE_NEW_FEATURE = 'true';
        process.env.FEATURE_NEW_FEATURE_ROLLOUT = '50';

        const userId = 'consistent-user';
        
        // Check multiple times - should get same result
        const results = [];
        for (let i = 0; i < 10; i++) {
          results.push(configManager.isFeatureEnabled('new-feature', userId));
        }
        
        // All results should be the same
        expect(new Set(results).size).toBe(1);
      });

      it('should support feature flag allowlists', () => {
        process.env.FEATURE_BETA_FEATURE = 'true';
        process.env.FEATURE_BETA_FEATURE_ALLOWLIST = 'user1,user2,user3';
        
        expect(configManager.isFeatureEnabled('beta-feature', 'user1')).toBe(true);
        expect(configManager.isFeatureEnabled('beta-feature', 'user2')).toBe(true);
        expect(configManager.isFeatureEnabled('beta-feature', 'user4')).toBe(false);
      });

      it('should support feature flag denylists', () => {
        process.env.FEATURE_RESTRICTED_FEATURE = 'true';
        process.env.FEATURE_RESTRICTED_FEATURE_DENYLIST = 'banned1,banned2';
        
        expect(configManager.isFeatureEnabled('restricted-feature', 'normalUser')).toBe(true);
        expect(configManager.isFeatureEnabled('restricted-feature', 'banned1')).toBe(false);
        expect(configManager.isFeatureEnabled('restricted-feature', 'banned2')).toBe(false);
      });
    });

    describe('Feature Flag Metadata', () => {
      it('should get feature flag metadata', () => {
        process.env.FEATURE_VIDEO_PROCESSING = 'true';
        process.env.FEATURE_VIDEO_PROCESSING_DESCRIPTION = 'Enable video processing capabilities';
        process.env.FEATURE_VIDEO_PROCESSING_ROLLOUT = '75';
        
        const metadata = configManager.getFeatureFlagMetadata('video-processing');
        
        expect(metadata).toEqual({
          enabled: true,
          description: 'Enable video processing capabilities',
          rolloutPercentage: 75,
          allowlist: [],
          denylist: []
        });
      });

      it('should list all feature flags', () => {
        process.env.FEATURE_FLAG1 = 'true';
        process.env.FEATURE_FLAG2 = 'false';
        process.env.FEATURE_FLAG3 = 'true';
        
        const flags = configManager.getAllFeatureFlags();
        
        expect(flags).toContain('flag1');
        expect(flags).toContain('flag2');
        expect(flags).toContain('flag3');
      });
    });
  });

  describe('Health Monitoring', () => {
    describe('Health Checks', () => {
      it('should report healthy status', async () => {
        const health = await configManager.getHealthStatus();
        
        expect(health).toMatchObject({
          status: 'healthy',
          configuration: {
            loaded: true,
            validated: true,
            lastReload: expect.any(String)
          },
          secrets: {
            initialized: true,
            count: expect.any(Number)
          },
          featureFlags: {
            enabled: true,
            count: expect.any(Number)
          }
        });
      });

      it('should report unhealthy on validation errors', async () => {
        // Force validation error
        (configManager as any).configuration = null;
        
        const health = await configManager.getHealthStatus();
        
        expect(health.status).toBe('unhealthy');
        expect(health.configuration.loaded).toBe(false);
      });

      it('should include performance metrics', async () => {
        const health = await configManager.getHealthStatus();
        
        expect(health.performance).toMatchObject({
          configLoadTime: expect.any(Number),
          averageGetTime: expect.any(Number),
          cacheHitRate: expect.any(Number)
        });
      });
    });

    describe('Monitoring Events', () => {
      it('should emit monitoring events', (done) => {
        configManager.on('health', (status) => {
          expect(status).toMatchObject({
            status: expect.any(String),
            timestamp: expect.any(String)
          });
          done();
        });

        configManager.emitHealthStatus();
      });

      it('should track configuration access patterns', () => {
        // Access various configuration values
        configManager.getConfigValue('gemini.model');
        configManager.getConfigValue('gemini.model'); // Cached
        configManager.getConfigValue('rateLimiting.rpm');
        
        const metrics = configManager.getAccessMetrics();
        
        expect(metrics['gemini.model']).toBe(2);
        expect(metrics['rateLimiting.rpm']).toBe(1);
      });
    });
  });

  describe('Audit Logging', () => {
    it('should log configuration changes', () => {
      process.env.CONFIG_AUDIT_ENABLED = 'true';
      
      const auditSpy = jest.spyOn(configManager as any, 'auditLog');
      
      configManager.updateConfig('gemini.temperature', 0.7, 'test-user');
      
      expect(auditSpy).toHaveBeenCalledWith({
        action: 'update',
        path: 'gemini.temperature',
        oldValue: 0.9,
        newValue: 0.7,
        user: 'test-user',
        timestamp: expect.any(String)
      });
    });

    it('should retrieve audit logs', () => {
      process.env.CONFIG_AUDIT_ENABLED = 'true';
      
      configManager.updateConfig('gemini.temperature', 0.7, 'user1');
      configManager.updateConfig('gemini.topK', 50, 'user2');
      
      const logs = configManager.getAuditLogs();
      
      expect(logs).toHaveLength(2);
      expect(logs[0].path).toBe('gemini.temperature');
      expect(logs[1].path).toBe('gemini.topK');
    });

    it('should filter audit logs by criteria', () => {
      process.env.CONFIG_AUDIT_ENABLED = 'true';
      
      configManager.updateConfig('gemini.temperature', 0.7, 'user1');
      configManager.updateConfig('gemini.topK', 50, 'user2');
      configManager.updateConfig('rateLimiting.rpm', 20, 'user1');
      
      const userLogs = configManager.getAuditLogs({ user: 'user1' });
      expect(userLogs).toHaveLength(2);
      
      const pathLogs = configManager.getAuditLogs({ path: /^gemini\./ });
      expect(pathLogs).toHaveLength(2);
    });
  });

  describe('ConfigurationValidator', () => {
    describe('Type Validation', () => {
      it('should validate string values', () => {
        expect(ConfigurationValidator.validateString('test', 'field')).toBe('test');
        expect(() => ConfigurationValidator.validateString(123 as any, 'field')).toThrow();
      });

      it('should validate number values', () => {
        expect(ConfigurationValidator.validateNumber(42, 'field')).toBe(42);
        expect(ConfigurationValidator.validateNumber('42' as any, 'field')).toBe(42);
        expect(() => ConfigurationValidator.validateNumber('abc' as any, 'field')).toThrow();
      });

      it('should validate boolean values', () => {
        expect(ConfigurationValidator.validateBoolean(true, 'field')).toBe(true);
        expect(ConfigurationValidator.validateBoolean('true' as any, 'field')).toBe(true);
        expect(ConfigurationValidator.validateBoolean('false' as any, 'field')).toBe(false);
        expect(() => ConfigurationValidator.validateBoolean('maybe' as any, 'field')).toThrow();
      });
    });

    describe('Range Validation', () => {
      it('should validate numeric ranges', () => {
        expect(ConfigurationValidator.validateRange(5, 'field', 1, 10)).toBe(5);
        expect(() => ConfigurationValidator.validateRange(0, 'field', 1, 10)).toThrow();
        expect(() => ConfigurationValidator.validateRange(11, 'field', 1, 10)).toThrow();
      });

      it('should validate enum values', () => {
        const options = ['dev', 'test', 'prod'];
        expect(ConfigurationValidator.validateEnum('dev', 'field', options)).toBe('dev');
        expect(() => ConfigurationValidator.validateEnum('staging', 'field', options)).toThrow();
      });
    });

    describe('Business Rule Validation', () => {
      it('should validate rate limiting rules', () => {
        const config = {
          rpm: 15,
          daily: 1500,
          burstSize: 20 // Invalid: burst > rpm
        };

        const errors = ConfigurationValidator.validateRateLimiting(config);
        expect(errors).toContain('Burst size cannot exceed RPM limit');
      });

      it('should validate Gemini configuration', () => {
        const config = {
          model: 'invalid-model', // Should start with 'gemini-'
          temperature: 2.5, // Out of range
          topP: 1.5 // Out of range
        };

        const errors = ConfigurationValidator.validateGeminiConfig(config);
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('Schema Validation', () => {
      it('should validate against JSON schema', () => {
        const schema = {
          type: 'object',
          required: ['name', 'age'],
          properties: {
            name: { type: 'string' },
            age: { type: 'number', minimum: 0 }
          }
        };

        const validData = { name: 'John', age: 30 };
        expect(() => ConfigurationValidator.validateSchema(validData, schema)).not.toThrow();

        const invalidData = { name: 'John' }; // Missing age
        expect(() => ConfigurationValidator.validateSchema(invalidData, schema)).toThrow();
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle corrupted configuration gracefully', () => {
      // Simulate corrupted config
      jest.spyOn(configManager as any, 'loadConfiguration').mockImplementationOnce(() => {
        throw new Error('Invalid JSON');
      });

      expect(() => {
        configManager.reload();
      }).not.toThrow();

      // Should fall back to defaults
      const config = configManager.getConfiguration();
      expect(config).toBeDefined();
    });

    it('should recover from secret manager failures', () => {
      const secretManager = new SecretManager();
      configManager.setSecretManager(secretManager);

      // Simulate encryption failure
      jest.spyOn(secretManager as any, 'encrypt').mockImplementationOnce(() => {
        throw new Error('Encryption failed');
      });

      expect(() => {
        secretManager.setSecret('test', 'value');
      }).toThrow();

      // Should still be able to use configuration
      const config = configManager.getConfiguration();
      expect(config).toBeDefined();
    });
  });
});