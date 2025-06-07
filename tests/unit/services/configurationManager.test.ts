import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConfigurationManager } from '../../../src/services/configurationManager';
import { createMockConfiguration, MockFileSystem, createTestEnvironment } from '../../test-utils';
import * as path from 'path';

// Mock dependencies
const mockFs = {
  ensureDir: jest.fn().mockResolvedValue(undefined),
  writeJSON: jest.fn().mockResolvedValue(undefined),
  readJSON: jest.fn().mockResolvedValue({}),
  pathExists: jest.fn().mockResolvedValue(false),
  readdir: jest.fn().mockResolvedValue([]),
  remove: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(''),
  appendFile: jest.fn().mockResolvedValue(undefined),
};

jest.mock('fs-extra', () => mockFs);

const mockChokidar = {
  watch: jest.fn().mockReturnValue({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock('chokidar', () => mockChokidar);

const mockDotenv = {
  config: jest.fn(),
};

jest.mock('dotenv', () => mockDotenv);

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager;
  let testEnv: ReturnType<typeof createTestEnvironment>;
  let testConfigPath: string;
  let testVersionsPath: string;
  let testAuditPath: string;

  beforeEach(() => {
    testEnv = createTestEnvironment();
    testConfigPath = path.join(global.TEST_CONFIG_DIR, 'test-config.json');
    testVersionsPath = path.join(global.TEST_CONFIG_DIR, 'versions');
    testAuditPath = path.join(global.TEST_CONFIG_DIR, 'audit.log');
    
    configManager = new ConfigurationManager(
      testConfigPath,
      testVersionsPath,
      testAuditPath
    );
    
    // Reset all mocks
    jest.clearAllMocks();
    mockFs.pathExists.mockResolvedValue(false);
    mockFs.readJSON.mockResolvedValue({});

    // Clear environment variables
    delete process.env.GEMINI_RATE_LIMIT_RPM;
    delete process.env.ROAST_BASE_CHANCE;
    delete process.env.ENABLE_CODE_EXECUTION;
  });

  afterEach(async () => {
    await configManager.shutdown();
    testEnv.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default configuration when no file exists', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      await configManager.initialize();

      expect(mockFs.ensureDir).toHaveBeenCalledTimes(3); // config, versions, audit dirs
      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        testConfigPath,
        expect.objectContaining({
          version: expect.any(String),
          discord: expect.any(Object),
          gemini: expect.any(Object),
          rateLimiting: expect.any(Object),
          features: expect.any(Object),
        }),
        { spaces: 2 }
      );

      const config = configManager.getConfiguration();
      expect(config.version).toBeDefined();
      expect(config.discord.intents).toContain('Guilds');
      expect(config.gemini.model).toBe('gemini-2.5-flash-preview-05-20');
    });

    it('should load existing configuration from file', async () => {
      const mockConfig = createMockConfiguration();
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJSON.mockResolvedValue(mockConfig);

      await configManager.initialize();

      expect(mockFs.readJSON).toHaveBeenCalledWith(testConfigPath);
      
      const config = configManager.getConfiguration();
      expect(config.version).toBe(mockConfig.version);
      expect(config.gemini.model).toBe(mockConfig.gemini.model);
    });

    it('should apply environment overrides during initialization', async () => {
      process.env.GEMINI_RATE_LIMIT_RPM = '15';
      process.env.ROAST_BASE_CHANCE = '0.8';
      process.env.ENABLE_CODE_EXECUTION = 'true';

      await configManager.initialize();

      const config = configManager.getConfiguration();
      expect(config.rateLimiting.rpm).toBe(15);
      expect(config.features.roasting.baseChance).toBe(0.8);
      expect(config.features.codeExecution).toBe(true);

      // Cleanup
      delete process.env.GEMINI_RATE_LIMIT_RPM;
      delete process.env.ROAST_BASE_CHANCE;
      delete process.env.ENABLE_CODE_EXECUTION;
    });

    it('should start file watching after initialization', async () => {
      await configManager.initialize();

      expect(mockChokidar.watch).toHaveBeenCalledWith(
        testConfigPath,
        expect.objectContaining({
          persistent: true,
          ignoreInitial: true,
        })
      );
    });

    it('should throw error for invalid configuration', async () => {
      const invalidConfig = { version: '1.0.0' }; // Missing required fields
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJSON.mockResolvedValue(invalidConfig);

      await expect(configManager.initialize()).rejects.toThrow(
        'Configuration validation failed'
      );
    });

    it('should not initialize twice', async () => {
      await configManager.initialize();
      
      // Second initialization should not throw but should warn
      await expect(configManager.initialize()).resolves.not.toThrow();
    });
  });

  describe('configuration validation', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should validate correct configuration', () => {
      const validConfig = createMockConfiguration();
      const result = configManager.validateConfiguration(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject configuration with missing required fields', () => {
      const invalidConfig = {
        version: '1.0.0',
        // Missing other required fields
      } as any;

      const result = configManager.validateConfiguration(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should validate business logic rules', () => {
      const invalidConfig = createMockConfiguration();
      invalidConfig.features.roasting.baseChance = 0.9;
      invalidConfig.features.roasting.maxChance = 0.8; // Base > max

      const result = configManager.validateConfiguration(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Roasting baseChance cannot be greater than maxChance'
      );
    });

    it('should validate rate limiting rules', () => {
      const invalidConfig = createMockConfiguration();
      invalidConfig.rateLimiting.rpm = 100;
      invalidConfig.rateLimiting.daily = 100; // RPM > daily/24

      const result = configManager.validateConfiguration(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'RPM limit cannot exceed daily limit divided by 24 hours'
      );
    });

    it('should validate chaos events configuration', () => {
      const invalidConfig = createMockConfiguration();
      invalidConfig.features.roasting.moodSystem.chaosEvents.durationRange = [1800000, 300000]; // Min > max

      const result = configManager.validateConfiguration(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Chaos events duration range minimum cannot be greater than maximum'
      );
    });
  });

  describe('configuration updates', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should update configuration successfully', async () => {
      const updates = {
        features: {
          ...configManager.getFeatureConfig(),
          codeExecution: true,
        },
      };

      await configManager.updateConfiguration(updates, 'test-user', 'Enable code execution');

      const config = configManager.getConfiguration();
      expect(config.features.codeExecution).toBe(true);
      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        testConfigPath,
        expect.objectContaining({
          features: expect.objectContaining({
            codeExecution: true,
          }),
        }),
        { spaces: 2 }
      );
    });

    it('should update configuration section successfully', async () => {
      const updates = {
        rpm: 20,
        daily: 1000,
      };

      await configManager.updateConfigurationSection(
        'rateLimiting',
        updates,
        'test-user',
        'Increase rate limits'
      );

      const config = configManager.getRateLimitingConfig();
      expect(config.rpm).toBe(20);
      expect(config.daily).toBe(1000);
    });

    it('should reject invalid configuration updates', async () => {
      const invalidUpdates = {
        features: {
          roasting: {
            baseChance: 0.9,
            maxChance: 0.8, // Invalid: base > max
          },
        },
      };

      await expect(
        configManager.updateConfiguration(invalidUpdates, 'test-user', 'Invalid update')
      ).rejects.toThrow('Configuration validation failed');
    });

    it('should generate new version on update', async () => {
      const originalVersion = configManager.getConfiguration().version;
      
      await configManager.updateConfiguration(
        { features: { codeExecution: true } },
        'test-user',
        'Enable code execution'
      );

      const newVersion = configManager.getConfiguration().version;
      expect(newVersion).not.toBe(originalVersion);
      expect(newVersion).toMatch(/^v\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('version management', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should save version history on configuration changes', async () => {
      await configManager.updateConfiguration(
        { features: { codeExecution: true } },
        'test-user',
        'Enable code execution'
      );

      const versionPath = path.join(testVersionsPath, expect.stringMatching(/^v.*\.json$/));
      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        expect.stringContaining(testVersionsPath),
        expect.objectContaining({
          version: expect.any(String),
          timestamp: expect.any(String),
          configuration: expect.any(Object),
          hash: expect.any(String),
        }),
        { spaces: 2 }
      );
    });

    it('should retrieve version history', async () => {
      const mockVersionFiles = ['v2024-01-01T10-00-00.json', 'v2024-01-02T10-00-00.json'];
      const mockVersionData = {
        version: 'v2024-01-01T10-00-00',
        timestamp: '2024-01-01T10:00:00.000Z',
        configuration: createMockConfiguration(),
        hash: 'mock-hash',
      };

      mockFs.readdir.mockResolvedValue(mockVersionFiles);
      mockFs.readJSON.mockResolvedValue(mockVersionData);

      const versions = await configManager.getVersionHistory();

      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(mockVersionData.version);
    });

    it('should rollback to previous version', async () => {
      const targetVersion = 'v2024-01-01T10-00-00';
      const mockVersionData = {
        version: targetVersion,
        timestamp: '2024-01-01T10:00:00.000Z',
        configuration: createMockConfiguration(),
        hash: 'mock-hash',
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJSON.mockResolvedValue(mockVersionData);

      const originalVersion = configManager.getConfiguration().version;
      
      await configManager.rollbackToVersion(targetVersion, 'test-user', 'Rollback test');

      const config = configManager.getConfiguration();
      expect(config.version).toBe(targetVersion);
      expect(config.modifiedBy).toBe('test-user');

      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        testConfigPath,
        expect.objectContaining({ version: targetVersion }),
        { spaces: 2 }
      );
    });

    it('should throw error when rolling back to non-existent version', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      await expect(
        configManager.rollbackToVersion('non-existent-version', 'test-user', 'Test')
      ).rejects.toThrow('Version non-existent-version not found');
    });

    it('should clean up old versions when limit exceeded', async () => {
      // Mock 60 version files (over the 50 limit)
      const mockVersionFiles = Array.from({ length: 60 }, (_, i) => 
        `v2024-01-${String(i + 1).padStart(2, '0')}T10-00-00.json`
      );
      
      mockFs.readdir.mockResolvedValue(mockVersionFiles);

      await configManager.updateConfiguration(
        { features: { codeExecution: true } },
        'test-user',
        'Trigger cleanup'
      );

      // Should remove 10 oldest versions
      expect(mockFs.remove).toHaveBeenCalledTimes(10);
    });
  });

  describe('audit logging', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should log configuration changes', async () => {
      await configManager.updateConfiguration(
        { features: { codeExecution: true } },
        'test-user',
        'Enable code execution'
      );

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        testAuditPath,
        expect.stringContaining('"changeType":"update"')
      );
    });

    it('should retrieve audit log entries', async () => {
      const mockAuditEntries = [
        JSON.stringify({
          timestamp: '2024-01-01T10:00:00.000Z',
          version: 'v2024-01-01T10-00-00',
          modifiedBy: 'user1',
          changeType: 'update',
          path: ['features', 'codeExecution'],
          oldValue: false,
          newValue: true,
        }),
        JSON.stringify({
          timestamp: '2024-01-01T11:00:00.000Z',
          version: 'v2024-01-01T11-00-00',
          modifiedBy: 'user2',
          changeType: 'rollback',
          path: [],
          oldValue: 'v2024-01-01T10-00-00',
          newValue: 'v2024-01-01T09-00-00',
        }),
      ].join('\n');

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(mockAuditEntries);

      const auditLog = await configManager.getAuditLog(10);

      expect(auditLog).toHaveLength(2);
      expect(auditLog[0].changeType).toBe('rollback'); // Newest first
      expect(auditLog[1].changeType).toBe('update');
    });

    it('should handle missing audit log file', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const auditLog = await configManager.getAuditLog();

      expect(auditLog).toEqual([]);
    });

    it('should handle corrupted audit log entries', async () => {
      const corruptedLog = 'valid json\n{invalid json\nmore valid json';
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(corruptedLog);

      const auditLog = await configManager.getAuditLog();

      // Should skip corrupted entries and continue
      expect(auditLog).toEqual([]);
    });
  });

  describe('environment overrides', () => {
    it('should parse environment values correctly', () => {
      process.env.TEST_BOOLEAN_TRUE = 'true';
      process.env.TEST_BOOLEAN_FALSE = 'false';
      process.env.TEST_NUMBER = '42';
      process.env.TEST_FLOAT = '3.14';
      process.env.TEST_STRING = 'hello world';

      const configManager = new ConfigurationManager();
      
      const parseValue = (configManager as any).parseEnvironmentValue.bind(configManager);
      
      expect(parseValue('true')).toBe(true);
      expect(parseValue('false')).toBe(false);
      expect(parseValue('42')).toBe(42);
      expect(parseValue('3.14')).toBe(3.14);
      expect(parseValue('hello world')).toBe('hello world');

      // Cleanup
      delete process.env.TEST_BOOLEAN_TRUE;
      delete process.env.TEST_BOOLEAN_FALSE;
      delete process.env.TEST_NUMBER;
      delete process.env.TEST_FLOAT;
      delete process.env.TEST_STRING;
    });

    it('should apply nested environment overrides', async () => {
      process.env.GEMINI_RATE_LIMIT_RPM = '25';
      process.env.ROAST_BASE_CHANCE = '0.7';

      await configManager.initialize();

      const config = configManager.getConfiguration();
      expect(config.rateLimiting.rpm).toBe(25);
      expect(config.features.roasting.baseChance).toBe(0.7);

      // Cleanup
      delete process.env.GEMINI_RATE_LIMIT_RPM;
      delete process.env.ROAST_BASE_CHANCE;
    });
  });

  describe('configuration getters', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should provide section-specific getters', () => {
      const discordConfig = configManager.getDiscordConfig();
      expect(discordConfig).toHaveProperty('intents');
      expect(discordConfig).toHaveProperty('permissions');
      expect(discordConfig).toHaveProperty('commands');

      const geminiConfig = configManager.getGeminiConfig();
      expect(geminiConfig).toHaveProperty('model');
      expect(geminiConfig).toHaveProperty('temperature');

      const rateLimitingConfig = configManager.getRateLimitingConfig();
      expect(rateLimitingConfig).toHaveProperty('rpm');
      expect(rateLimitingConfig).toHaveProperty('daily');

      const featureConfig = configManager.getFeatureConfig();
      expect(featureConfig).toHaveProperty('roasting');
      expect(featureConfig).toHaveProperty('codeExecution');

      const roastingConfig = configManager.getRoastingConfig();
      expect(roastingConfig).toHaveProperty('baseChance');
      expect(roastingConfig).toHaveProperty('consecutiveBonus');

      const monitoringConfig = configManager.getMonitoringConfig();
      expect(monitoringConfig).toHaveProperty('healthMetrics');
      expect(monitoringConfig).toHaveProperty('alerts');
    });

    it('should return copies of configuration objects', () => {
      const config1 = configManager.getConfiguration();
      const config2 = configManager.getConfiguration();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects

      // Modifying one shouldn't affect the other
      config1.version = 'modified';
      expect(config2.version).not.toBe('modified');
    });
  });

  describe('import/export functionality', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should export configuration as JSON', async () => {
      const exported = await configManager.exportConfiguration('json');

      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
      
      const parsed = JSON.parse(exported);
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('discord');
      expect(parsed).toHaveProperty('gemini');
    });

    it('should throw error for unsupported export format', async () => {
      await expect(
        configManager.exportConfiguration('yaml' as any)
      ).rejects.toThrow('YAML export not implemented');
    });

    it('should import valid JSON configuration', async () => {
      const mockConfig = createMockConfiguration();
      mockConfig.features.codeExecution = true;
      const configJson = JSON.stringify(mockConfig);

      await configManager.importConfiguration(
        configJson,
        'json',
        'test-user',
        'Import test'
      );

      const config = configManager.getConfiguration();
      expect(config.features.codeExecution).toBe(true);
    });

    it('should reject invalid JSON during import', async () => {
      const invalidJson = '{ invalid json }';

      await expect(
        configManager.importConfiguration(invalidJson, 'json', 'test-user', 'Test')
      ).rejects.toThrow('Failed to parse configuration');
    });

    it('should validate imported configuration', async () => {
      const invalidConfig = { version: '1.0.0' }; // Missing required fields
      const configJson = JSON.stringify(invalidConfig);

      await expect(
        configManager.importConfiguration(configJson, 'json', 'test-user', 'Test')
      ).rejects.toThrow('Configuration validation failed');
    });
  });

  describe('file watching and reloading', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should reload configuration on file change', async () => {
      const updatedConfig = createMockConfiguration();
      updatedConfig.features.codeExecution = true;

      mockFs.readJSON.mockResolvedValue(updatedConfig);

      await configManager.reloadConfiguration('file-watcher', 'File changed');

      const config = configManager.getConfiguration();
      expect(config.features.codeExecution).toBe(true);
    });

    it('should detect and log configuration changes', async () => {
      const originalConfig = configManager.getConfiguration();
      const updatedConfig = { ...originalConfig };
      updatedConfig.features.codeExecution = true;

      mockFs.readJSON.mockResolvedValue(updatedConfig);

      await configManager.reloadConfiguration('command', 'Manual reload');

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        testAuditPath,
        expect.stringContaining('"changeType":"update"')
      );
    });

    it('should handle file watcher errors gracefully', async () => {
      const mockWatcher = {
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      };

      mockChokidar.watch.mockReturnValue(mockWatcher);

      await configManager.initialize();

      // Simulate file watcher error
      const errorHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'error')?.[1];
      if (errorHandler) {
        expect(() => errorHandler(new Error('Watcher error'))).not.toThrow();
      }
    });
  });

  describe('health status', () => {
    it('should return healthy status when properly initialized', async () => {
      await configManager.initialize();

      const health = configManager.getHealthStatus();

      expect(health.healthy).toBe(true);
      expect(health.errors).toEqual([]);
    });

    it('should return unhealthy status when not initialized', () => {
      const health = configManager.getHealthStatus();

      expect(health.healthy).toBe(false);
      expect(health.errors).toContain('ConfigurationManager not initialized');
    });

    it('should detect configuration validation errors in health check', async () => {
      await configManager.initialize();

      // Manually corrupt the configuration
      const corruptConfig = configManager.getConfiguration();
      delete (corruptConfig as any).version;

      (configManager as any).currentConfig = corruptConfig;

      const health = configManager.getHealthStatus();

      expect(health.healthy).toBe(false);
      expect(health.errors.length).toBeGreaterThan(0);
    });
  });

  describe('shutdown and cleanup', () => {
    it('should close file watcher on shutdown', async () => {
      const mockWatcher = {
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      };

      mockChokidar.watch.mockReturnValue(mockWatcher);

      await configManager.initialize();
      await configManager.shutdown();

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should remove all event listeners on shutdown', async () => {
      await configManager.initialize();

      const removeAllListenersSpy = jest.spyOn(configManager, 'removeAllListeners');
      
      await configManager.shutdown();

      expect(removeAllListenersSpy).toHaveBeenCalled();
    });

    it('should handle shutdown gracefully when not initialized', async () => {
      await expect(configManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('event emission', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should emit config:changed event on configuration updates', async () => {
      const changeHandler = jest.fn();
      configManager.on('config:changed', changeHandler);

      await configManager.updateConfiguration(
        { features: { codeExecution: true } },
        'test-user',
        'Enable code execution'
      );

      expect(changeHandler).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            changeType: 'update',
            path: expect.arrayContaining(['features', 'codeExecution']),
            newValue: true,
          }),
        ])
      );
    });

    it('should emit config:validated event after validation', async () => {
      const validationHandler = jest.fn();
      configManager.on('config:validated', validationHandler);

      await configManager.reloadConfiguration('command', 'Test reload');

      expect(validationHandler).toHaveBeenCalledWith(true);
    });

    it('should emit config:error event on errors', async () => {
      const errorHandler = jest.fn();
      configManager.on('config:error', errorHandler);

      mockFs.readJSON.mockRejectedValue(new Error('Read error'));

      try {
        await configManager.reloadConfiguration('command', 'Test reload');
      } catch (error) {
        // Expected to fail
      }

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should emit config:rollback event on rollbacks', async () => {
      const rollbackHandler = jest.fn();
      configManager.on('config:rollback', rollbackHandler);

      const targetVersion = 'v2024-01-01T10-00-00';
      const mockVersionData = {
        version: targetVersion,
        timestamp: '2024-01-01T10:00:00.000Z',
        configuration: createMockConfiguration(),
        hash: 'mock-hash',
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJSON.mockResolvedValue(mockVersionData);

      const originalVersion = configManager.getConfiguration().version;

      await configManager.rollbackToVersion(targetVersion, 'test-user', 'Test rollback');

      expect(rollbackHandler).toHaveBeenCalledWith(originalVersion, targetVersion);
    });
  });
});