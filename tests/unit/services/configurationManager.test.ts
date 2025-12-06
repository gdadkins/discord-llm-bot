import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs-extra';
import { ConfigurationManager } from '../../../src/services/config/ConfigurationManager';
import { BotConfiguration } from '../../../src/services/interfaces/ConfigurationInterfaces';

const mockFs = fs as jest.Mocked<typeof fs>;

jest.mock('fs-extra', () => ({
  ensureDir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  writeJSON: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  readJSON: jest.fn<() => Promise<any>>().mockResolvedValue({}),
  pathExists: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
  readdir: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
  remove: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  readFile: jest.fn<() => Promise<string>>().mockResolvedValue(''),
  appendFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock('chokidar', () => ({
  watch: jest.fn().mockReturnValue({
    on: jest.fn().mockReturnThis(),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }),
}));

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager;
  const testConfigPath = path.join(process.cwd(), 'data', 'config', 'bot-config.json');
  const testVersionsPath = path.join(process.cwd(), 'data', 'config', 'versions');
  
  beforeEach(() => {
    jest.clearAllMocks();
    configManager = new ConfigurationManager();
  });

  afterEach(async () => {
    await configManager.shutdown();
  });

  describe('initialization', () => {
    it('should initialize with default configuration when file does not exist', async () => {
      await configManager.initialize();

      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.dirname(testConfigPath));
      expect(mockFs.ensureDir).toHaveBeenCalledWith(testVersionsPath);
      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        testConfigPath,
        expect.objectContaining({
          version: expect.any(String),
          lastModified: expect.any(String),
          modifiedBy: 'system',
        }),
        { spaces: 2 }
      );
    });

    it('should load existing configuration', async () => {
      mockFs.pathExists.mockResolvedValue(false);
      mockFs.readJSON.mockResolvedValue({});
      
      await configManager.initialize();
      
      const config = configManager.getConfiguration();
      expect(config).toBeDefined();
      expect(config.discord).toBeDefined();
      expect(config.gemini).toBeDefined();
      expect(config.rateLimiting).toBeDefined();
      expect(config.features).toBeDefined();
    });

    it('should setup file watcher after initialization', async () => {
      await configManager.initialize();
      
      const chokidar = require('chokidar');
      expect(chokidar.watch).toHaveBeenCalledWith(testConfigPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100,
        },
      });
    });
  });

  describe('configuration validation', () => {
    const createValidConfig = (): BotConfiguration => ({
      version: 'v2024-01-01T00:00:00.000Z',
      lastModified: new Date().toISOString(),
      modifiedBy: 'test',
      discord: {
        intents: ['Guilds', 'GuildMessages', 'MessageContent'],
        permissions: {},
        commands: {
          chat: {
            enabled: true,
            permissions: 'all' as const,
            cooldown: 0,
          },
          status: {
            enabled: true,
            permissions: 'all' as const,
            cooldown: 30,
          },
        },
      },
      gemini: {
        apiKey: 'test-key',
        model: 'gemini-pro',
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 2048,
        safetySettings: [],
        systemInstruction: '',
      },
      rateLimiting: {
        rpm: 15,
        daily: 1000,
        burst: 5,
      },
      features: {
        roasting: {
          enabled: true,
          baseChance: 0.1,
          maxChance: 0.5,
          cooldownMinutes: 5,
          moods: ['witty', 'sarcastic', 'brutal', 'dad-joke', 'philosophical'],
        },
        codeExecution: false,
        structuredOutput: true,
        monitoring: {
          enableHealthCheck: true,
          enableAnalytics: true,
          enableLogging: true,
        },
        contextMemory: {
          enabled: true,
          maxMessages: 50,
          timeoutMinutes: 30,
          maxContextChars: 100000,
          compressionEnabled: true,
        },
        caching: {
          enabled: true,
          ttlMinutes: 60,
          maxSize: 100,
        },
      },
    });

    it('should validate valid configuration', () => {
      const validConfig = createValidConfig();
      const result = configManager.validateConfiguration(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject configuration with missing required fields', () => {
      const invalidConfig = { version: 'v1.0.0' } as BotConfiguration;
      const result = configManager.validateConfiguration(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject configuration with invalid temperature', () => {
      const invalidConfig = createValidConfig();
      invalidConfig.gemini.temperature = 2.5; // Out of range
      const result = configManager.validateConfiguration(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Gemini temperature must be between 0 and 2');
    });

    it('should reject configuration with invalid roasting configuration', () => {
      const invalidConfig = createValidConfig();
      invalidConfig.features.roasting.baseChance = 0.9;
      invalidConfig.features.roasting.maxChance = 0.8; // Base > max
      const result = configManager.validateConfiguration(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Roasting baseChance must be less than or equal to maxChance');
    });

    it('should reject configuration with invalid rate limiting', () => {
      const invalidConfig = createValidConfig();
      invalidConfig.rateLimiting.burst = 20;
      invalidConfig.rateLimiting.rpm = 10; // Burst > RPM
      const result = configManager.validateConfiguration(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Rate limiting burst must be less than or equal to RPM');
    });
  });

  describe('configuration getters', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should get discord configuration', () => {
      const discordConfig = configManager.getDiscordConfig();
      expect(discordConfig).toBeDefined();
      expect(discordConfig.intents).toContain('Guilds');
      expect(discordConfig.intents).toContain('GuildMessages');
    });

    it('should get gemini configuration', () => {
      const geminiConfig = configManager.getGeminiConfig();
      expect(geminiConfig).toBeDefined();
      expect(geminiConfig.model).toBe('gemini-pro');
      expect(geminiConfig.temperature).toBe(0.7);
    });

    it('should get rate limiting configuration', () => {
      const rateLimitConfig = configManager.getRateLimitingConfig();
      expect(rateLimitConfig).toBeDefined();
      expect(rateLimitConfig.rpm).toBe(15);
      expect(rateLimitConfig.daily).toBe(1000);
    });

    it('should get feature configuration', () => {
      const featureConfig = configManager.getFeatureConfig();
      expect(featureConfig).toBeDefined();
      expect(featureConfig.roasting.enabled).toBe(true);
      expect(featureConfig.structuredOutput).toBe(true);
    });
  });

  describe('configuration updates', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should update specific configuration fields', async () => {
      const updates = {
        rateLimiting: {
          rpm: 20,
          daily: 1200,
          burst: 8,
        },
      };

      await configManager.updateConfiguration(updates, 'test-user', 'Increase rate limits');

      const config = configManager.getRateLimitingConfig();
      expect(config.rpm).toBe(20);
      expect(config.daily).toBe(1200);
      expect(config.burst).toBe(8);
    });

    it('should update feature flags using section update', async () => {
      await configManager.updateConfigurationSection(
        'features',
        { codeExecution: true },
        'test-user',
        'Enable code execution'
      );

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
      
      await configManager.updateConfigurationSection(
        'features',
        { codeExecution: true },
        'test-user',
        'Enable code execution'
      );

      const newVersion = configManager.getConfiguration().version;
      expect(newVersion).not.toBe(originalVersion);
      expect(newVersion).toMatch(/^v\d{4}-\d{2}-\d{2}T/);
    });

    it('should save configuration history', async () => {
      const mockVersionFiles: string[] = [];
      mockFs.readdir.mockResolvedValue(mockVersionFiles);

      await configManager.updateConfigurationSection(
        'features',
        { codeExecution: true },
        'test-user',
        'Enable code execution'
      );

      // Check version file was saved
      const versionPath = path.join(testVersionsPath, expect.stringMatching(/^v.*\.json$/));
      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        expect.stringContaining(testVersionsPath),
        expect.objectContaining({
          version: expect.any(String),
          timestamp: expect.any(String),
          modifiedBy: 'test-user',
          reason: 'Enable code execution',
        }),
        { spaces: 2 }
      );
    });

    it('should maintain version history limit', async () => {
      // Create mock version files exceeding limit
      const mockVersionFiles = Array(25).fill(null).map((_, i) => 
        `v2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z.json`
      );
      mockFs.readdir.mockResolvedValue(mockVersionFiles);

      const mockVersionData = {
        version: 'v2024-01-01T00:00:00.000Z',
        timestamp: new Date().toISOString(),
        configuration: createValidConfig(),
      };
      mockFs.readJSON.mockResolvedValue(mockVersionData);

      // Trigger version cleanup
      await configManager.cleanupVersionHistory();

      // Should remove oldest versions (keeping 20)
      expect(mockFs.remove).toHaveBeenCalledTimes(5);
    });
  });

  describe('configuration history', () => {
    it('should get version history', async () => {
      const mockVersionFiles = ['v2024-01-01T00:00:00.000Z.json', 'v2024-01-02T00:00:00.000Z.json'];
      mockFs.readdir.mockResolvedValue(mockVersionFiles);
      mockFs.readJSON.mockResolvedValue({
        version: 'v2024-01-01T00:00:00.000Z',
        timestamp: new Date().toISOString(),
        configuration: createValidConfig(),
      });

      await configManager.initialize();
      const history = await configManager.getVersionHistory();

      expect(history).toHaveLength(2);
      expect(history[0].version).toBe('v2024-01-02T00:00:00.000Z'); // Latest first
    });

    it('should restore configuration from version', async () => {
      const targetVersion = 'v2024-01-01T00:00:00.000Z';
      const mockVersionData = {
        version: targetVersion,
        timestamp: new Date().toISOString(),
        configuration: createValidConfig(),
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJSON.mockResolvedValue(mockVersionData);

      await configManager.initialize();
      await configManager.restoreVersion(targetVersion, 'admin-user', 'Rollback to previous version');

      const config = configManager.getConfiguration();
      expect(config.modifiedBy).toBe('admin-user');
      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        testConfigPath,
        expect.objectContaining({
          version: expect.any(String), // New version generated
          modifiedBy: 'admin-user',
        }),
        { spaces: 2 }
      );
    });

    it('should handle missing version file', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      await configManager.initialize();
      await expect(
        configManager.restoreVersion('v2024-01-01T00:00:00.000Z', 'admin-user')
      ).rejects.toThrow('Version not found');
    });

    it('should track configuration history', async () => {
      mockFs.readdir.mockResolvedValue([]);
      
      // Make first update
      await configManager.updateConfigurationSection(
        'features',
        { codeExecution: true },
        'test-user',
        'First update'
      );

      // Check version was saved
      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        expect.stringContaining('versions'),
        expect.objectContaining({
          modifiedBy: 'test-user',
          reason: 'First update',
        }),
        { spaces: 2 }
      );

      // Make second update  
      await configManager.updateConfigurationSection(
        'features',
        { codeExecution: true },
        'admin-user',
        'Second update'
      );

      // Should have created two version files
      const writeJSONCalls = mockFs.writeJSON.mock.calls.filter(
        call => call[0].includes('versions')
      );
      expect(writeJSONCalls).toHaveLength(2);
    });
  });

  describe('configuration audit', () => {
    const testAuditPath = path.join(process.cwd(), 'data', 'config', 'audit.log');

    it('should log configuration changes', async () => {
      await configManager.initialize();
      await configManager.updateConfigurationSection(
        'features',
        { codeExecution: true },
        'test-user',
        'Enable feature'
      );

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        testAuditPath,
        expect.stringContaining(JSON.stringify({
          timestamp: expect.any(String),
          action: 'update',
          modifiedBy: 'test-user',
          reason: 'Enable feature',
          changes: [{
            path: expect.arrayContaining(['features', 'codeExecution']),
            oldValue: false,
            newValue: true,
          }],
        })),
        'utf8'
      );
    });

    it('should read audit log', async () => {
      const mockAuditEntries = JSON.stringify({
        timestamp: new Date().toISOString(),
        action: 'update',
        modifiedBy: 'test-user',
        changes: [],
      }) + '\n';

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(mockAuditEntries);

      await configManager.initialize();
      const audit = await configManager.getAuditLog();

      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe('update');
      expect(audit[0].modifiedBy).toBe('test-user');
    });

    it('should handle missing audit log', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      await configManager.initialize();
      const audit = await configManager.getAuditLog();

      expect(audit).toEqual([]);
    });

    it('should handle corrupted audit log entries', async () => {
      const corruptedLog = 'valid json\n{invalid json\nmore valid json';
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(corruptedLog);

      await configManager.initialize();
      const audit = await configManager.getAuditLog();

      // Should only parse valid entries
      expect(audit.length).toBeLessThan(3);
    });
  });

  describe('configuration comparison', () => {
    it('should identify changes between configurations', () => {
      const oldConfig = createValidConfig();
      const newConfig = createValidConfig();
      newConfig.features.codeExecution = true;
      newConfig.rateLimiting.rpm = 20;

      const changes = configManager.compareConfigurations(oldConfig, newConfig);

      expect(changes).toHaveLength(2);
      expect(changes).toContainEqual({
        path: ['features', 'codeExecution'],
        oldValue: false,
        newValue: true,
      });
      expect(changes).toContainEqual({
        path: ['rateLimiting', 'rpm'],
        oldValue: 15,
        newValue: 20,
      });
    });

    it('should handle nested object changes', () => {
      const oldConfig = createValidConfig();
      const newConfig = createValidConfig();
      newConfig.features.roasting.baseChance = 0.2;

      const changes = configManager.compareConfigurations(oldConfig, newConfig);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        path: ['features', 'roasting', 'baseChance'],
        oldValue: 0.1,
        newValue: 0.2,
      });
    });

    it('should handle array changes', () => {
      const oldConfig = createValidConfig();
      const newConfig = createValidConfig();
      newConfig.discord.intents.push('GuildVoiceStates');

      const changes = configManager.compareConfigurations(oldConfig, newConfig);

      expect(changes).toHaveLength(1);
      expect(changes[0].path).toEqual(['discord', 'intents']);
    });
  });

  describe('configuration migration', () => {
    it('should migrate configuration from old format', async () => {
      const oldConfig = {
        version: '1.0.0',
        discord: {
          intents: ['Guilds', 'GuildMessages'],
        },
        gemini: {
          apiKey: 'test-key',
          model: 'gemini-pro',
        },
        // Missing new fields
      };

      mockFs.readJSON.mockResolvedValue(oldConfig);
      await configManager.initialize();

      const config = configManager.getConfiguration();
      // Should have all required fields with defaults
      expect(config.features).toBeDefined();
      expect(config.rateLimiting).toBeDefined();
      expect(config.lastModified).toBeDefined();
    });
  });

  describe('real-time updates', () => {
    it('should handle external configuration changes', async () => {
      await configManager.initialize();
      
      // Simulate external change
      const updatedConfig = createValidConfig();
      updatedConfig.features.codeExecution = true;
      mockFs.readJSON.mockResolvedValue(updatedConfig);
      
      // Trigger file watcher
      const watchInstance = require('chokidar').watch.mock.results[0].value;
      const changeHandler = watchInstance.on.mock.calls.find(call => call[0] === 'change')[1];
      await changeHandler(testConfigPath);
      
      // Configuration should be reloaded
      const config = configManager.getConfiguration();
      expect(config.features.codeExecution).toBe(true);
    });

    it('should validate external changes', async () => {
      await configManager.initialize();
      
      // Simulate invalid external change
      const invalidConfig = createValidConfig();
      invalidConfig.gemini.temperature = 5; // Invalid
      mockFs.readJSON.mockResolvedValue(invalidConfig);
      
      // Trigger file watcher
      const watchInstance = require('chokidar').watch.mock.results[0].value;
      const changeHandler = watchInstance.on.mock.calls.find(call => call[0] === 'change')[1];
      await changeHandler(testConfigPath);
      
      // Should reject invalid configuration
      const config = configManager.getConfiguration();
      expect(config.gemini.temperature).not.toBe(5);
    });

    it('should handle file watcher errors', async () => {
      await configManager.initialize();
      
      const watchInstance = require('chokidar').watch.mock.results[0].value;
      const errorHandler = watchInstance.on.mock.calls.find(call => call[0] === 'error')?.[1];
      
      if (errorHandler) {
        // Should not throw
        expect(() => errorHandler(new Error('Watcher error'))).not.toThrow();
      }
    });

    it('should debounce rapid file changes', async () => {
      jest.useFakeTimers();
      await configManager.initialize();
      
      const watchInstance = require('chokidar').watch.mock.results[0].value;
      const changeHandler = watchInstance.on.mock.calls.find(call => call[0] === 'change')[1];
      
      // Trigger multiple rapid changes
      for (let i = 0; i < 5; i++) {
        await changeHandler(testConfigPath);
      }
      
      jest.runAllTimers();
      
      // Should only reload once
      expect(mockFs.readJSON).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });
  });

  describe('shutdown', () => {
    it('should cleanup resources on shutdown', async () => {
      await configManager.initialize();
      
      const watchInstance = require('chokidar').watch.mock.results[0].value;
      await configManager.shutdown();
      
      expect(watchInstance.close).toHaveBeenCalled();
    });

    it('should handle watcher close errors gracefully', async () => {
      await configManager.initialize();
      
      const watchInstance = require('chokidar').watch.mock.results[0].value;
      watchInstance.close.mockRejectedValue(new Error('Close failed'));
      
      // Should not throw
      await expect(configManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('concurrency', () => {
    it('should handle concurrent updates safely', async () => {
      await configManager.initialize();
      
      // Perform concurrent updates
      const updates = Array(10).fill(null).map((_, i) => 
        configManager.updateConfigurationSection(
          'rateLimiting',
          { rpm: 10 + i },
          `user-${i}`,
          `Update ${i}`
        )
      );
      
      await Promise.all(updates);
      
      // Should have applied all updates in order
      const config = configManager.getRateLimitingConfig();
      expect(config.rpm).toBe(19); // Last update
    });
  });

  describe('error handling', () => {
    it('should handle file system errors during initialization', async () => {
      mockFs.ensureDir.mockRejectedValue(new Error('FS error'));
      
      await expect(configManager.initialize()).rejects.toThrow('FS error');
    });

    it('should handle JSON parse errors', async () => {
      mockFs.readJSON.mockRejectedValue(new Error('Invalid JSON'));
      
      // Should use defaults on parse error
      await configManager.initialize();
      
      const config = configManager.getConfiguration();
      expect(config).toBeDefined();
    });

    it('should handle file write errors during update', async () => {
      await configManager.initialize();
      mockFs.writeJSON.mockRejectedValue(new Error('Write failed'));
      
      await expect(
        configManager.updateConfigurationSection(
          'features',
          { codeExecution: true },
          'test-user',
          'Update'
        )
      ).rejects.toThrow('Write failed');
    });
  });

  describe('configuration export/import', () => {
    it('should export configuration', async () => {
      await configManager.initialize();
      
      const exported = configManager.exportConfiguration();
      
      expect(exported).toBeDefined();
      expect(exported.version).toBeDefined();
      expect(exported.discord).toBeDefined();
      expect(exported.gemini).toBeDefined();
      expect(exported.features).toBeDefined();
    });

    it('should import valid configuration', async () => {
      await configManager.initialize();
      
      const configToImport = createValidConfig();
      configToImport.features.codeExecution = true;
      
      await configManager.importConfiguration(configToImport, 'admin-user', 'Import from backup');
      
      const config = configManager.getConfiguration();
      expect(config.features.codeExecution).toBe(true);
      expect(config.modifiedBy).toBe('admin-user');
    });

    it('should reject invalid import', async () => {
      await configManager.initialize();
      
      const invalidConfig = { version: 'invalid' } as BotConfiguration;
      
      await expect(
        configManager.importConfiguration(invalidConfig, 'admin-user')
      ).rejects.toThrow('Invalid configuration');
    });
  });

  describe('configuration backup', () => {
    it('should create configuration backup', async () => {
      const mockConfig = createValidConfig();
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJSON.mockResolvedValue(mockConfig);
      
      await configManager.initialize();
      const backupPath = await configManager.createBackup('Pre-update backup');
      
      expect(backupPath).toContain('backup');
      expect(mockFs.writeJSON).toHaveBeenCalledWith(
        expect.stringContaining('backup'),
        expect.objectContaining({
          version: expect.any(String),
          timestamp: expect.any(String),
          reason: 'Pre-update backup',
          configuration: expect.any(Object),
        }),
        { spaces: 2 }
      );
    });
  });
});

function createValidConfig(): BotConfiguration {
  return {
    version: 'v2024-01-01T00:00:00.000Z',
    lastModified: new Date().toISOString(),
    modifiedBy: 'test',
    discord: {
      intents: ['Guilds', 'GuildMessages', 'MessageContent'],
      permissions: {},
      commands: {
        chat: {
          enabled: true,
          permissions: 'all' as const,
          cooldown: 0,
        },
        status: {
          enabled: true,
          permissions: 'all' as const,
          cooldown: 30,
        },
      },
    },
    gemini: {
      apiKey: 'test-key',
      model: 'gemini-pro',
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 2048,
      safetySettings: [],
      systemInstruction: '',
    },
    rateLimiting: {
      rpm: 15,
      daily: 1000,
      burst: 5,
    },
    features: {
      roasting: {
        enabled: true,
        baseChance: 0.1,
        maxChance: 0.5,
        cooldownMinutes: 5,
        moods: ['witty', 'sarcastic', 'brutal', 'dad-joke', 'philosophical'],
      },
      codeExecution: false,
      structuredOutput: true,
      monitoring: {
        enableHealthCheck: true,
        enableAnalytics: true,
        enableLogging: true,
      },
      contextMemory: {
        enabled: true,
        maxMessages: 50,
        timeoutMinutes: 30,
        maxContextChars: 100000,
        compressionEnabled: true,
      },
      caching: {
        enabled: true,
        ttlMinutes: 60,
        maxSize: 100,
      },
    },
  };
}