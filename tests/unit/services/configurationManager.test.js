"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const configurationManager_1 = require("../../../src/services/configurationManager");
const test_utils_1 = require("../../test-utils");
const path = __importStar(require("path"));
// Mock dependencies
const mockFs = {
    ensureDir: globals_1.jest.fn().mockResolvedValue(undefined),
    writeJSON: globals_1.jest.fn().mockResolvedValue(undefined),
    readJSON: globals_1.jest.fn().mockResolvedValue({}),
    pathExists: globals_1.jest.fn().mockResolvedValue(false),
    readdir: globals_1.jest.fn().mockResolvedValue([]),
    remove: globals_1.jest.fn().mockResolvedValue(undefined),
    readFile: globals_1.jest.fn().mockResolvedValue(''),
    appendFile: globals_1.jest.fn().mockResolvedValue(undefined),
};
globals_1.jest.mock('fs-extra', () => mockFs);
const mockChokidar = {
    watch: globals_1.jest.fn().mockReturnValue({
        on: globals_1.jest.fn(),
        close: globals_1.jest.fn().mockResolvedValue(undefined),
    }),
};
globals_1.jest.mock('chokidar', () => mockChokidar);
const mockDotenv = {
    config: globals_1.jest.fn(),
};
globals_1.jest.mock('dotenv', () => mockDotenv);
(0, globals_1.describe)('ConfigurationManager', () => {
    let configManager;
    let testEnv;
    let testConfigPath;
    let testVersionsPath;
    let testAuditPath;
    (0, globals_1.beforeEach)(() => {
        testEnv = (0, test_utils_1.createTestEnvironment)();
        testConfigPath = path.join(global.TEST_CONFIG_DIR, 'test-config.json');
        testVersionsPath = path.join(global.TEST_CONFIG_DIR, 'versions');
        testAuditPath = path.join(global.TEST_CONFIG_DIR, 'audit.log');
        configManager = new configurationManager_1.ConfigurationManager(testConfigPath, testVersionsPath, testAuditPath);
        // Reset all mocks
        globals_1.jest.clearAllMocks();
        mockFs.pathExists.mockResolvedValue(false);
        mockFs.readJSON.mockResolvedValue({});
        // Clear environment variables
        delete process.env.GEMINI_RATE_LIMIT_RPM;
        delete process.env.ROAST_BASE_CHANCE;
        delete process.env.ENABLE_CODE_EXECUTION;
    });
    (0, globals_1.afterEach)(async () => {
        await configManager.shutdown();
        testEnv.cleanup();
    });
    (0, globals_1.describe)('initialization', () => {
        (0, globals_1.it)('should initialize with default configuration when no file exists', async () => {
            mockFs.pathExists.mockResolvedValue(false);
            await configManager.initialize();
            (0, globals_1.expect)(mockFs.ensureDir).toHaveBeenCalledTimes(3); // config, versions, audit dirs
            (0, globals_1.expect)(mockFs.writeJSON).toHaveBeenCalledWith(testConfigPath, globals_1.expect.objectContaining({
                version: globals_1.expect.any(String),
                discord: globals_1.expect.any(Object),
                gemini: globals_1.expect.any(Object),
                rateLimiting: globals_1.expect.any(Object),
                features: globals_1.expect.any(Object),
            }), { spaces: 2 });
            const config = configManager.getConfiguration();
            (0, globals_1.expect)(config.version).toBeDefined();
            (0, globals_1.expect)(config.discord.intents).toContain('Guilds');
            (0, globals_1.expect)(config.gemini.model).toBe('gemini-2.5-flash-preview-05-20');
        });
        (0, globals_1.it)('should load existing configuration from file', async () => {
            const mockConfig = (0, test_utils_1.createMockConfiguration)();
            mockFs.pathExists.mockResolvedValue(true);
            mockFs.readJSON.mockResolvedValue(mockConfig);
            await configManager.initialize();
            (0, globals_1.expect)(mockFs.readJSON).toHaveBeenCalledWith(testConfigPath);
            const config = configManager.getConfiguration();
            (0, globals_1.expect)(config.version).toBe(mockConfig.version);
            (0, globals_1.expect)(config.gemini.model).toBe(mockConfig.gemini.model);
        });
        (0, globals_1.it)('should apply environment overrides during initialization', async () => {
            process.env.GEMINI_RATE_LIMIT_RPM = '15';
            process.env.ROAST_BASE_CHANCE = '0.8';
            process.env.ENABLE_CODE_EXECUTION = 'true';
            await configManager.initialize();
            const config = configManager.getConfiguration();
            (0, globals_1.expect)(config.rateLimiting.rpm).toBe(15);
            (0, globals_1.expect)(config.features.roasting.baseChance).toBe(0.8);
            (0, globals_1.expect)(config.features.codeExecution).toBe(true);
            // Cleanup
            delete process.env.GEMINI_RATE_LIMIT_RPM;
            delete process.env.ROAST_BASE_CHANCE;
            delete process.env.ENABLE_CODE_EXECUTION;
        });
        (0, globals_1.it)('should start file watching after initialization', async () => {
            await configManager.initialize();
            (0, globals_1.expect)(mockChokidar.watch).toHaveBeenCalledWith(testConfigPath, globals_1.expect.objectContaining({
                persistent: true,
                ignoreInitial: true,
            }));
        });
        (0, globals_1.it)('should throw error for invalid configuration', async () => {
            const invalidConfig = { version: '1.0.0' }; // Missing required fields
            mockFs.pathExists.mockResolvedValue(true);
            mockFs.readJSON.mockResolvedValue(invalidConfig);
            await (0, globals_1.expect)(configManager.initialize()).rejects.toThrow('Configuration validation failed');
        });
        (0, globals_1.it)('should not initialize twice', async () => {
            await configManager.initialize();
            // Second initialization should not throw but should warn
            await (0, globals_1.expect)(configManager.initialize()).resolves.not.toThrow();
        });
    });
    (0, globals_1.describe)('configuration validation', () => {
        (0, globals_1.beforeEach)(async () => {
            await configManager.initialize();
        });
        (0, globals_1.it)('should validate correct configuration', () => {
            const validConfig = (0, test_utils_1.createMockConfiguration)();
            const result = configManager.validateConfiguration(validConfig);
            (0, globals_1.expect)(result.valid).toBe(true);
            (0, globals_1.expect)(result.errors).toBeUndefined();
        });
        (0, globals_1.it)('should reject configuration with missing required fields', () => {
            const invalidConfig = {
                version: '1.0.0',
                // Missing other required fields
            };
            const result = configManager.validateConfiguration(invalidConfig);
            (0, globals_1.expect)(result.valid).toBe(false);
            (0, globals_1.expect)(result.errors).toBeDefined();
            (0, globals_1.expect)(result.errors.length).toBeGreaterThan(0);
        });
        (0, globals_1.it)('should validate business logic rules', () => {
            const invalidConfig = (0, test_utils_1.createMockConfiguration)();
            invalidConfig.features.roasting.baseChance = 0.9;
            invalidConfig.features.roasting.maxChance = 0.8; // Base > max
            const result = configManager.validateConfiguration(invalidConfig);
            (0, globals_1.expect)(result.valid).toBe(false);
            (0, globals_1.expect)(result.errors).toContain('Roasting baseChance cannot be greater than maxChance');
        });
        (0, globals_1.it)('should validate rate limiting rules', () => {
            const invalidConfig = (0, test_utils_1.createMockConfiguration)();
            invalidConfig.rateLimiting.rpm = 100;
            invalidConfig.rateLimiting.daily = 100; // RPM > daily/24
            const result = configManager.validateConfiguration(invalidConfig);
            (0, globals_1.expect)(result.valid).toBe(false);
            (0, globals_1.expect)(result.errors).toContain('RPM limit cannot exceed daily limit divided by 24 hours');
        });
        (0, globals_1.it)('should validate chaos events configuration', () => {
            const invalidConfig = (0, test_utils_1.createMockConfiguration)();
            invalidConfig.features.roasting.moodSystem.chaosEvents.durationRange = [1800000, 300000]; // Min > max
            const result = configManager.validateConfiguration(invalidConfig);
            (0, globals_1.expect)(result.valid).toBe(false);
            (0, globals_1.expect)(result.errors).toContain('Chaos events duration range minimum cannot be greater than maximum');
        });
    });
    (0, globals_1.describe)('configuration updates', () => {
        (0, globals_1.beforeEach)(async () => {
            await configManager.initialize();
        });
        (0, globals_1.it)('should update configuration successfully', async () => {
            const updates = {
                features: {
                    ...configManager.getFeatureConfig(),
                    codeExecution: true,
                },
            };
            await configManager.updateConfiguration(updates, 'test-user', 'Enable code execution');
            const config = configManager.getConfiguration();
            (0, globals_1.expect)(config.features.codeExecution).toBe(true);
            (0, globals_1.expect)(mockFs.writeJSON).toHaveBeenCalledWith(testConfigPath, globals_1.expect.objectContaining({
                features: globals_1.expect.objectContaining({
                    codeExecution: true,
                }),
            }), { spaces: 2 });
        });
        (0, globals_1.it)('should update configuration section successfully', async () => {
            const updates = {
                rpm: 20,
                daily: 1000,
            };
            await configManager.updateConfigurationSection('rateLimiting', updates, 'test-user', 'Increase rate limits');
            const config = configManager.getRateLimitingConfig();
            (0, globals_1.expect)(config.rpm).toBe(20);
            (0, globals_1.expect)(config.daily).toBe(1000);
        });
        (0, globals_1.it)('should reject invalid configuration updates', async () => {
            const invalidUpdates = {
                features: {
                    roasting: {
                        baseChance: 0.9,
                        maxChance: 0.8, // Invalid: base > max
                    },
                },
            };
            await (0, globals_1.expect)(configManager.updateConfiguration(invalidUpdates, 'test-user', 'Invalid update')).rejects.toThrow('Configuration validation failed');
        });
        (0, globals_1.it)('should generate new version on update', async () => {
            const originalVersion = configManager.getConfiguration().version;
            await configManager.updateConfiguration({ features: { codeExecution: true } }, 'test-user', 'Enable code execution');
            const newVersion = configManager.getConfiguration().version;
            (0, globals_1.expect)(newVersion).not.toBe(originalVersion);
            (0, globals_1.expect)(newVersion).toMatch(/^v\d{4}-\d{2}-\d{2}T/);
        });
    });
    (0, globals_1.describe)('version management', () => {
        (0, globals_1.beforeEach)(async () => {
            await configManager.initialize();
        });
        (0, globals_1.it)('should save version history on configuration changes', async () => {
            await configManager.updateConfiguration({ features: { codeExecution: true } }, 'test-user', 'Enable code execution');
            const versionPath = path.join(testVersionsPath, globals_1.expect.stringMatching(/^v.*\.json$/));
            (0, globals_1.expect)(mockFs.writeJSON).toHaveBeenCalledWith(globals_1.expect.stringContaining(testVersionsPath), globals_1.expect.objectContaining({
                version: globals_1.expect.any(String),
                timestamp: globals_1.expect.any(String),
                configuration: globals_1.expect.any(Object),
                hash: globals_1.expect.any(String),
            }), { spaces: 2 });
        });
        (0, globals_1.it)('should retrieve version history', async () => {
            const mockVersionFiles = ['v2024-01-01T10-00-00.json', 'v2024-01-02T10-00-00.json'];
            const mockVersionData = {
                version: 'v2024-01-01T10-00-00',
                timestamp: '2024-01-01T10:00:00.000Z',
                configuration: (0, test_utils_1.createMockConfiguration)(),
                hash: 'mock-hash',
            };
            mockFs.readdir.mockResolvedValue(mockVersionFiles);
            mockFs.readJSON.mockResolvedValue(mockVersionData);
            const versions = await configManager.getVersionHistory();
            (0, globals_1.expect)(versions).toHaveLength(2);
            (0, globals_1.expect)(versions[0].version).toBe(mockVersionData.version);
        });
        (0, globals_1.it)('should rollback to previous version', async () => {
            const targetVersion = 'v2024-01-01T10-00-00';
            const mockVersionData = {
                version: targetVersion,
                timestamp: '2024-01-01T10:00:00.000Z',
                configuration: (0, test_utils_1.createMockConfiguration)(),
                hash: 'mock-hash',
            };
            mockFs.pathExists.mockResolvedValue(true);
            mockFs.readJSON.mockResolvedValue(mockVersionData);
            const originalVersion = configManager.getConfiguration().version;
            await configManager.rollbackToVersion(targetVersion, 'test-user', 'Rollback test');
            const config = configManager.getConfiguration();
            (0, globals_1.expect)(config.version).toBe(targetVersion);
            (0, globals_1.expect)(config.modifiedBy).toBe('test-user');
            (0, globals_1.expect)(mockFs.writeJSON).toHaveBeenCalledWith(testConfigPath, globals_1.expect.objectContaining({ version: targetVersion }), { spaces: 2 });
        });
        (0, globals_1.it)('should throw error when rolling back to non-existent version', async () => {
            mockFs.pathExists.mockResolvedValue(false);
            await (0, globals_1.expect)(configManager.rollbackToVersion('non-existent-version', 'test-user', 'Test')).rejects.toThrow('Version non-existent-version not found');
        });
        (0, globals_1.it)('should clean up old versions when limit exceeded', async () => {
            // Mock 60 version files (over the 50 limit)
            const mockVersionFiles = Array.from({ length: 60 }, (_, i) => `v2024-01-${String(i + 1).padStart(2, '0')}T10-00-00.json`);
            mockFs.readdir.mockResolvedValue(mockVersionFiles);
            await configManager.updateConfiguration({ features: { codeExecution: true } }, 'test-user', 'Trigger cleanup');
            // Should remove 10 oldest versions
            (0, globals_1.expect)(mockFs.remove).toHaveBeenCalledTimes(10);
        });
    });
    (0, globals_1.describe)('audit logging', () => {
        (0, globals_1.beforeEach)(async () => {
            await configManager.initialize();
        });
        (0, globals_1.it)('should log configuration changes', async () => {
            await configManager.updateConfiguration({ features: { codeExecution: true } }, 'test-user', 'Enable code execution');
            (0, globals_1.expect)(mockFs.appendFile).toHaveBeenCalledWith(testAuditPath, globals_1.expect.stringContaining('"changeType":"update"'));
        });
        (0, globals_1.it)('should retrieve audit log entries', async () => {
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
            (0, globals_1.expect)(auditLog).toHaveLength(2);
            (0, globals_1.expect)(auditLog[0].changeType).toBe('rollback'); // Newest first
            (0, globals_1.expect)(auditLog[1].changeType).toBe('update');
        });
        (0, globals_1.it)('should handle missing audit log file', async () => {
            mockFs.pathExists.mockResolvedValue(false);
            const auditLog = await configManager.getAuditLog();
            (0, globals_1.expect)(auditLog).toEqual([]);
        });
        (0, globals_1.it)('should handle corrupted audit log entries', async () => {
            const corruptedLog = 'valid json\n{invalid json\nmore valid json';
            mockFs.pathExists.mockResolvedValue(true);
            mockFs.readFile.mockResolvedValue(corruptedLog);
            const auditLog = await configManager.getAuditLog();
            // Should skip corrupted entries and continue
            (0, globals_1.expect)(auditLog).toEqual([]);
        });
    });
    (0, globals_1.describe)('environment overrides', () => {
        (0, globals_1.it)('should parse environment values correctly', () => {
            process.env.TEST_BOOLEAN_TRUE = 'true';
            process.env.TEST_BOOLEAN_FALSE = 'false';
            process.env.TEST_NUMBER = '42';
            process.env.TEST_FLOAT = '3.14';
            process.env.TEST_STRING = 'hello world';
            const configManager = new configurationManager_1.ConfigurationManager();
            const parseValue = configManager.parseEnvironmentValue.bind(configManager);
            (0, globals_1.expect)(parseValue('true')).toBe(true);
            (0, globals_1.expect)(parseValue('false')).toBe(false);
            (0, globals_1.expect)(parseValue('42')).toBe(42);
            (0, globals_1.expect)(parseValue('3.14')).toBe(3.14);
            (0, globals_1.expect)(parseValue('hello world')).toBe('hello world');
            // Cleanup
            delete process.env.TEST_BOOLEAN_TRUE;
            delete process.env.TEST_BOOLEAN_FALSE;
            delete process.env.TEST_NUMBER;
            delete process.env.TEST_FLOAT;
            delete process.env.TEST_STRING;
        });
        (0, globals_1.it)('should apply nested environment overrides', async () => {
            process.env.GEMINI_RATE_LIMIT_RPM = '25';
            process.env.ROAST_BASE_CHANCE = '0.7';
            await configManager.initialize();
            const config = configManager.getConfiguration();
            (0, globals_1.expect)(config.rateLimiting.rpm).toBe(25);
            (0, globals_1.expect)(config.features.roasting.baseChance).toBe(0.7);
            // Cleanup
            delete process.env.GEMINI_RATE_LIMIT_RPM;
            delete process.env.ROAST_BASE_CHANCE;
        });
    });
    (0, globals_1.describe)('configuration getters', () => {
        (0, globals_1.beforeEach)(async () => {
            await configManager.initialize();
        });
        (0, globals_1.it)('should provide section-specific getters', () => {
            const discordConfig = configManager.getDiscordConfig();
            (0, globals_1.expect)(discordConfig).toHaveProperty('intents');
            (0, globals_1.expect)(discordConfig).toHaveProperty('permissions');
            (0, globals_1.expect)(discordConfig).toHaveProperty('commands');
            const geminiConfig = configManager.getGeminiConfig();
            (0, globals_1.expect)(geminiConfig).toHaveProperty('model');
            (0, globals_1.expect)(geminiConfig).toHaveProperty('temperature');
            const rateLimitingConfig = configManager.getRateLimitingConfig();
            (0, globals_1.expect)(rateLimitingConfig).toHaveProperty('rpm');
            (0, globals_1.expect)(rateLimitingConfig).toHaveProperty('daily');
            const featureConfig = configManager.getFeatureConfig();
            (0, globals_1.expect)(featureConfig).toHaveProperty('roasting');
            (0, globals_1.expect)(featureConfig).toHaveProperty('codeExecution');
            const roastingConfig = configManager.getRoastingConfig();
            (0, globals_1.expect)(roastingConfig).toHaveProperty('baseChance');
            (0, globals_1.expect)(roastingConfig).toHaveProperty('consecutiveBonus');
            const monitoringConfig = configManager.getMonitoringConfig();
            (0, globals_1.expect)(monitoringConfig).toHaveProperty('healthMetrics');
            (0, globals_1.expect)(monitoringConfig).toHaveProperty('alerts');
        });
        (0, globals_1.it)('should return copies of configuration objects', () => {
            const config1 = configManager.getConfiguration();
            const config2 = configManager.getConfiguration();
            (0, globals_1.expect)(config1).toEqual(config2);
            (0, globals_1.expect)(config1).not.toBe(config2); // Different objects
            // Modifying one shouldn't affect the other
            config1.version = 'modified';
            (0, globals_1.expect)(config2.version).not.toBe('modified');
        });
    });
    (0, globals_1.describe)('import/export functionality', () => {
        (0, globals_1.beforeEach)(async () => {
            await configManager.initialize();
        });
        (0, globals_1.it)('should export configuration as JSON', async () => {
            const exported = await configManager.exportConfiguration('json');
            (0, globals_1.expect)(exported).toBeDefined();
            (0, globals_1.expect)(typeof exported).toBe('string');
            const parsed = JSON.parse(exported);
            (0, globals_1.expect)(parsed).toHaveProperty('version');
            (0, globals_1.expect)(parsed).toHaveProperty('discord');
            (0, globals_1.expect)(parsed).toHaveProperty('gemini');
        });
        (0, globals_1.it)('should throw error for unsupported export format', async () => {
            await (0, globals_1.expect)(configManager.exportConfiguration('yaml')).rejects.toThrow('YAML export not implemented');
        });
        (0, globals_1.it)('should import valid JSON configuration', async () => {
            const mockConfig = (0, test_utils_1.createMockConfiguration)();
            mockConfig.features.codeExecution = true;
            const configJson = JSON.stringify(mockConfig);
            await configManager.importConfiguration(configJson, 'json', 'test-user', 'Import test');
            const config = configManager.getConfiguration();
            (0, globals_1.expect)(config.features.codeExecution).toBe(true);
        });
        (0, globals_1.it)('should reject invalid JSON during import', async () => {
            const invalidJson = '{ invalid json }';
            await (0, globals_1.expect)(configManager.importConfiguration(invalidJson, 'json', 'test-user', 'Test')).rejects.toThrow('Failed to parse configuration');
        });
        (0, globals_1.it)('should validate imported configuration', async () => {
            const invalidConfig = { version: '1.0.0' }; // Missing required fields
            const configJson = JSON.stringify(invalidConfig);
            await (0, globals_1.expect)(configManager.importConfiguration(configJson, 'json', 'test-user', 'Test')).rejects.toThrow('Configuration validation failed');
        });
    });
    (0, globals_1.describe)('file watching and reloading', () => {
        (0, globals_1.beforeEach)(async () => {
            await configManager.initialize();
        });
        (0, globals_1.it)('should reload configuration on file change', async () => {
            const updatedConfig = (0, test_utils_1.createMockConfiguration)();
            updatedConfig.features.codeExecution = true;
            mockFs.readJSON.mockResolvedValue(updatedConfig);
            await configManager.reloadConfiguration('file-watcher', 'File changed');
            const config = configManager.getConfiguration();
            (0, globals_1.expect)(config.features.codeExecution).toBe(true);
        });
        (0, globals_1.it)('should detect and log configuration changes', async () => {
            const originalConfig = configManager.getConfiguration();
            const updatedConfig = { ...originalConfig };
            updatedConfig.features.codeExecution = true;
            mockFs.readJSON.mockResolvedValue(updatedConfig);
            await configManager.reloadConfiguration('command', 'Manual reload');
            (0, globals_1.expect)(mockFs.appendFile).toHaveBeenCalledWith(testAuditPath, globals_1.expect.stringContaining('"changeType":"update"'));
        });
        (0, globals_1.it)('should handle file watcher errors gracefully', async () => {
            const mockWatcher = {
                on: globals_1.jest.fn(),
                close: globals_1.jest.fn().mockResolvedValue(undefined),
            };
            mockChokidar.watch.mockReturnValue(mockWatcher);
            await configManager.initialize();
            // Simulate file watcher error
            const errorHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'error')?.[1];
            if (errorHandler) {
                (0, globals_1.expect)(() => errorHandler(new Error('Watcher error'))).not.toThrow();
            }
        });
    });
    (0, globals_1.describe)('health status', () => {
        (0, globals_1.it)('should return healthy status when properly initialized', async () => {
            await configManager.initialize();
            const health = configManager.getHealthStatus();
            (0, globals_1.expect)(health.healthy).toBe(true);
            (0, globals_1.expect)(health.errors).toEqual([]);
        });
        (0, globals_1.it)('should return unhealthy status when not initialized', () => {
            const health = configManager.getHealthStatus();
            (0, globals_1.expect)(health.healthy).toBe(false);
            (0, globals_1.expect)(health.errors).toContain('ConfigurationManager not initialized');
        });
        (0, globals_1.it)('should detect configuration validation errors in health check', async () => {
            await configManager.initialize();
            // Manually corrupt the configuration
            const corruptConfig = configManager.getConfiguration();
            delete corruptConfig.version;
            configManager.currentConfig = corruptConfig;
            const health = configManager.getHealthStatus();
            (0, globals_1.expect)(health.healthy).toBe(false);
            (0, globals_1.expect)(health.errors.length).toBeGreaterThan(0);
        });
    });
    (0, globals_1.describe)('shutdown and cleanup', () => {
        (0, globals_1.it)('should close file watcher on shutdown', async () => {
            const mockWatcher = {
                on: globals_1.jest.fn(),
                close: globals_1.jest.fn().mockResolvedValue(undefined),
            };
            mockChokidar.watch.mockReturnValue(mockWatcher);
            await configManager.initialize();
            await configManager.shutdown();
            (0, globals_1.expect)(mockWatcher.close).toHaveBeenCalled();
        });
        (0, globals_1.it)('should remove all event listeners on shutdown', async () => {
            await configManager.initialize();
            const removeAllListenersSpy = globals_1.jest.spyOn(configManager, 'removeAllListeners');
            await configManager.shutdown();
            (0, globals_1.expect)(removeAllListenersSpy).toHaveBeenCalled();
        });
        (0, globals_1.it)('should handle shutdown gracefully when not initialized', async () => {
            await (0, globals_1.expect)(configManager.shutdown()).resolves.not.toThrow();
        });
    });
    (0, globals_1.describe)('event emission', () => {
        (0, globals_1.beforeEach)(async () => {
            await configManager.initialize();
        });
        (0, globals_1.it)('should emit config:changed event on configuration updates', async () => {
            const changeHandler = globals_1.jest.fn();
            configManager.on('config:changed', changeHandler);
            await configManager.updateConfiguration({ features: { codeExecution: true } }, 'test-user', 'Enable code execution');
            (0, globals_1.expect)(changeHandler).toHaveBeenCalledWith(globals_1.expect.arrayContaining([
                globals_1.expect.objectContaining({
                    changeType: 'update',
                    path: globals_1.expect.arrayContaining(['features', 'codeExecution']),
                    newValue: true,
                }),
            ]));
        });
        (0, globals_1.it)('should emit config:validated event after validation', async () => {
            const validationHandler = globals_1.jest.fn();
            configManager.on('config:validated', validationHandler);
            await configManager.reloadConfiguration('command', 'Test reload');
            (0, globals_1.expect)(validationHandler).toHaveBeenCalledWith(true);
        });
        (0, globals_1.it)('should emit config:error event on errors', async () => {
            const errorHandler = globals_1.jest.fn();
            configManager.on('config:error', errorHandler);
            mockFs.readJSON.mockRejectedValue(new Error('Read error'));
            try {
                await configManager.reloadConfiguration('command', 'Test reload');
            }
            catch (error) {
                // Expected to fail
            }
            (0, globals_1.expect)(errorHandler).toHaveBeenCalledWith(globals_1.expect.any(Error));
        });
        (0, globals_1.it)('should emit config:rollback event on rollbacks', async () => {
            const rollbackHandler = globals_1.jest.fn();
            configManager.on('config:rollback', rollbackHandler);
            const targetVersion = 'v2024-01-01T10-00-00';
            const mockVersionData = {
                version: targetVersion,
                timestamp: '2024-01-01T10:00:00.000Z',
                configuration: (0, test_utils_1.createMockConfiguration)(),
                hash: 'mock-hash',
            };
            mockFs.pathExists.mockResolvedValue(true);
            mockFs.readJSON.mockResolvedValue(mockVersionData);
            const originalVersion = configManager.getConfiguration().version;
            await configManager.rollbackToVersion(targetVersion, 'test-user', 'Test rollback');
            (0, globals_1.expect)(rollbackHandler).toHaveBeenCalledWith(originalVersion, targetVersion);
        });
    });
});
//# sourceMappingURL=configurationManager.test.js.map