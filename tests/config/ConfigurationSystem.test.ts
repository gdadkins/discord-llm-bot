/**
 * Configuration System Unit Tests
 * Tests for ConfigurationManager, SecretManager, and ConfigurationValidator
 */

import { ConfigurationManager } from '../../src/config/ConfigurationManager';
import { SecretManager } from '../../src/services/security/SecretManager';
import { ConfigurationValidator, ENV_VAR_SCHEMAS } from '../../src/utils/ConfigurationValidator';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  watchFile: jest.fn(),
  unwatchFile: jest.fn(),
}));
jest.mock('crypto', () => ({
    ...jest.requireActual('crypto'),
    pbkdf2: jest.fn((_password, _salt, _iterations, _keylen, _digest, callback) => {
        callback(null, Buffer.from('derived-key'));
    }),
    randomBytes: jest.fn(() => Buffer.from('random-bytes')),
    createCipheriv: jest.fn(() => ({
        update: jest.fn(() => Buffer.from('encrypted')),
        final: jest.fn(() => Buffer.from('')),
        getAuthTag: jest.fn(() => Buffer.from('auth-tag')),
    })),
    createDecipheriv: jest.fn(() => ({
        setAuthTag: jest.fn(),
        update: jest.fn(() => Buffer.from('decrypted')),
        final: jest.fn(() => Buffer.from('')),
    })),
    timingSafeEqual: jest.fn(() => true),
}));

describe('Configuration System', () => {
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
    };

    // Clear any existing instances
    (ConfigurationManager as any).instance = null;
    (SecretManager as any).instance = null;
    (ConfigurationValidator as any).instance = null;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('ConfigurationManager', () => {
    let configManager: ConfigurationManager;

    beforeEach(async () => {
      configManager = ConfigurationManager.getInstance();
      await configManager.initialize();
    });

    afterEach(async () => {
        await configManager.shutdown();
    });

    it('should create a singleton instance', () => {
      const instance1 = ConfigurationManager.getInstance();
      const instance2 = ConfigurationManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should load configuration on initialization', () => {
      const config = configManager.getConfiguration();
      expect(config).toBeDefined();
      expect(config.discord).toBeDefined();
      expect(config.gemini).toBeDefined();
    });

    it('should get specific configuration sections', () => {
      expect(configManager.getDiscordConfig()).toBeDefined();
      expect(configManager.getGeminiConfig()).toBeDefined();
    });

    it('should get a specific config value', () => {
      process.env.GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';
      const model = configManager.getConfigValue('gemini.model', 'default-model');
      expect(model).toBe('gemini-2.5-flash-preview-05-20');
    });

    it('should return a default value for a non-existent path', () => {
      const value = configManager.getConfigValue('non.existent.path', 'default');
      expect(value).toBe('default');
    });

    it('should report a healthy status', () => {
        const health = configManager.getHealthStatus();
        expect(health.healthy).toBe(true);
        expect(health.name).toBe('ConfigurationManager');
      });
  });

  describe('SecretManager', () => {
    let secretManager: SecretManager;

    beforeEach(async () => {
      secretManager = SecretManager.getInstance();
      await secretManager.initialize('master-key');
    });

    afterEach(async () => {
        await secretManager.shutdown();
    });

    it('should create a singleton instance', () => {
      const instance1 = SecretManager.getInstance();
      const instance2 = SecretManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should encrypt and store a secret', async () => {
        await secretManager.setSecret('api.key', 'super-secret-key');
        const internalSecrets = (secretManager as any).secrets;
        expect(internalSecrets.has('api.key')).toBe(true);
        const encrypted = internalSecrets.get('api.key');
        expect(encrypted.encryptedValue).not.toBe('super-secret-key');
      });

    it('should decrypt and retrieve a secret', async () => {
      await secretManager.setSecret('api.key', 'super-secret-key');
      const decrypted = await secretManager.getSecret('api.key');
      expect(decrypted).toBe('decrypted');
    });

    it('should return null for a non-existent secret', async () => {
        const secret = await secretManager.getSecret('non.existent');
        expect(secret).toBeNull();
      });
  });

  describe('ConfigurationValidator', () => {
    let validator: ConfigurationValidator;

    beforeEach(() => {
        validator = ConfigurationValidator.getInstance();
        validator.clearCache();
    });

    it('should validate a complete and correct environment', () => {
      const result = validator.validateEnvironment();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required environment variables', () => {
        delete process.env.DISCORD_TOKEN;
        const result = validator.validateEnvironment();
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.field === 'DISCORD_TOKEN')).toBe(true);
    });

    it('should detect values outside of allowed range', () => {
        process.env.GEMINI_TEMPERATURE = '3.0';
        const result = validator.validateEnvironment();
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.field === 'GEMINI_TEMPERATURE')).toBe(true);
    });

    it('should detect values not in the allowed list', () => {
        process.env.NODE_ENV = 'staging';
        const result = validator.validateEnvironment();
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.field === 'NODE_ENV')).toBe(true);
    });

    it('should get a parsed config value with the correct type', () => {
        process.env.RATE_LIMIT_RPM = '30';
        const rpm = validator.getConfigValue('RATE_LIMIT_RPM');
        expect(rpm).toBe(30);
    });
  });
});