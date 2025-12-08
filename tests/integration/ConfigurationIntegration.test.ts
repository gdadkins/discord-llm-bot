/**
 * Configuration System Integration Tests
 * End-to-end tests for the complete configuration system
 */

import { ConfigurationManager } from '../../src/config/ConfigurationManager';
import { SecretManager } from '../../src/config/SecretManager';
import { ConfigurationFactory } from '../../src/config/ConfigurationFactory';
import { ConfigurationMigrator } from '../../scripts/migrate-config';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../src/utils/logger';

// Mock logger to reduce noise in tests
jest.mock('../../src/utils/logger');

describe('Configuration System Integration', () => {
  let configManager: ConfigurationManager;
  let secretManager: SecretManager;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Create temporary directory for test files
    tempDir = path.join(__dirname, 'temp-config-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  beforeEach(() => {
    // Save and set up test environment
    originalEnv = { ...process.env };
    process.env = {
      NODE_ENV: 'test',
      DISCORD_TOKEN: 'test-discord-token',
      DISCORD_CLIENT_ID: 'test-client-id',
      GOOGLE_API_KEY: 'test-google-api-key',
      GEMINI_MODEL: 'gemini-2.0-flash-exp',
      RATE_LIMIT_RPM: '15',
      RATE_LIMIT_DAILY: '1500',
      FEATURE_FLAGS_ENABLED: 'true',
      CONFIG_AUDIT_ENABLED: 'true',
      CONFIG_HOT_RELOAD_ENABLED: 'false'
    };

    // Reset singletons
    (ConfigurationManager as any).instance = null;
    configManager = ConfigurationManager.getInstance();
    secretManager = new SecretManager();
    configManager.setSecretManager(secretManager);
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Complete Configuration Lifecycle', () => {
    it('should handle full configuration lifecycle', async () => {
      // 1. Initialize configuration
      const config = configManager.getConfiguration();
      expect(config).toBeDefined();
      expect(config.gemini.model).toBe('gemini-2.0-flash-exp');

      // 2. Store secrets
      secretManager.setSecret('discord.token', process.env.DISCORD_TOKEN!);
      secretManager.setSecret('google.apiKey', process.env.GOOGLE_API_KEY!);

      // 3. Update configuration
      configManager.updateConfig('gemini.temperature', 0.7);
      expect(configManager.getConfigValue('gemini.temperature')).toBe(0.7);

      // 4. Check feature flags
      process.env.FEATURE_VIDEO_PROCESSING = 'true';
      expect(configManager.isFeatureEnabled('video-processing')).toBe(true);

      // 5. Get health status
      const health = await configManager.getHealthStatus();
      expect(health.status).toBe('healthy');

      // 6. Verify audit logs
      const logs = configManager.getAuditLogs();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].path).toBe('gemini.temperature');
    });

    it('should maintain consistency across configuration changes', async () => {
      const changeEvents: any[] = [];
      
      configManager.on('configChange', (change) => {
        changeEvents.push(change);
      });

      // Batch update
      const updates = {
        'gemini.temperature': 0.5,
        'gemini.topK': 30,
        'rateLimiting.rpm': 20,
        'features.roasting.baseChance': 0.4
      };

      configManager.batchUpdate(updates);

      // Verify all changes were applied
      expect(configManager.getConfigValue('gemini.temperature')).toBe(0.5);
      expect(configManager.getConfigValue('gemini.topK')).toBe(30);
      expect(configManager.getConfigValue('rateLimiting.rpm')).toBe(20);
      expect(configManager.getConfigValue('features.roasting.baseChance')).toBe(0.4);

      // Verify events were emitted
      expect(changeEvents).toHaveLength(4);
    });
  });

  describe('Configuration Migration', () => {
    it('should migrate deprecated configuration successfully', async () => {
      // Create test .env file with deprecated variables
      const envPath = path.join(tempDir, '.env.test');
      const envContent = `
# Old configuration
DISCORD_TOKEN=old-discord-token
DISCORD_CLIENT_ID=old-client-id
GEMINI_API_KEY=old-gemini-key
THINKING_BUDGET=10000
INCLUDE_THOUGHTS=true
FORCE_THINKING_PROMPT=true
ENABLE_CODE_EXECUTION=true
METRICS_RETENTION_HOURS=48
`;
      fs.writeFileSync(envPath, envContent);

      // Run migration
      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      expect(result.migratedVariables).toContain('GEMINI_API_KEY -> GOOGLE_API_KEY');
      expect(result.migratedVariables).toContain('THINKING_BUDGET -> GEMINI_THINKING_BUDGET');
      expect(result.backupPath).toBeDefined();

      // Verify migrated file
      const migratedContent = fs.readFileSync(envPath, 'utf8');
      expect(migratedContent).toContain('GOOGLE_API_KEY=old-gemini-key');
      expect(migratedContent).toContain('GEMINI_THINKING_BUDGET=10000');
      expect(migratedContent).not.toContain('GEMINI_API_KEY=');
    });

    it('should handle migration conflicts appropriately', async () => {
      const envPath = path.join(tempDir, '.env.conflict');
      const envContent = `
DISCORD_TOKEN=token
GEMINI_API_KEY=old-key
GOOGLE_API_KEY=new-key
`;
      fs.writeFileSync(envPath, envContent);

      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Conflict');

      // Should keep the new value
      const migratedContent = fs.readFileSync(envPath, 'utf8');
      expect(migratedContent).toContain('GOOGLE_API_KEY=new-key');
      expect(migratedContent).not.toContain('GEMINI_API_KEY');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle configuration errors gracefully', async () => {
      // Simulate various error conditions
      const errorScenarios = [
        // Missing required configuration
        () => {
          delete process.env.GOOGLE_API_KEY;
          configManager.reload();
        },
        // Invalid configuration value
        () => {
          process.env.GEMINI_TEMPERATURE = 'invalid';
          configManager.reload();
        },
        // Circular dependency in configuration
        () => {
          configManager.updateConfig('a.b', '${a.b}');
        }
      ];

      for (const scenario of errorScenarios) {
        expect(() => scenario()).toThrow();
        
        // System should still be functional
        const health = await configManager.getHealthStatus();
        expect(health).toBeDefined();
      }
    });

    it('should recover from hot reload failures', (done) => {
      process.env.CONFIG_HOT_RELOAD_ENABLED = 'true';
      
      let reloadAttempts = 0;
      configManager.on('configReloadError', (error) => {
        reloadAttempts++;
        expect(error).toBeDefined();
        
        if (reloadAttempts === 2) {
          // Should still have valid configuration
          const config = configManager.getConfiguration();
          expect(config).toBeDefined();
          done();
        }
      });

      // Simulate failed reloads
      jest.spyOn(configManager as any, 'loadConfiguration')
        .mockImplementationOnce(() => { throw new Error('Parse error'); })
        .mockImplementationOnce(() => { throw new Error('Validation error'); });

      // Trigger reloads
      (configManager as any).handleFileChange();
      setTimeout(() => (configManager as any).handleFileChange(), 100);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-frequency configuration access efficiently', () => {
      const iterations = 10000;
      const paths = [
        'gemini.model',
        'gemini.temperature',
        'rateLimiting.rpm',
        'features.roasting.baseChance',
        'discord.intents'
      ];

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const path = paths[i % paths.length];
        configManager.getConfigValue(path);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should complete in reasonable time (< 1ms per access on average)
      expect(avgTime).toBeLessThan(1);

      // Check cache effectiveness
      const metrics = configManager.getAccessMetrics();
      for (const path of paths) {
        expect(metrics[path]).toBeGreaterThan(1);
      }
    });

    it('should handle large configuration updates efficiently', () => {
      const updates: Record<string, any> = {};
      
      // Generate large batch update
      for (let i = 0; i < 100; i++) {
        updates[`features.test.property${i}`] = i;
      }

      const startTime = Date.now();
      configManager.batchUpdate(updates);
      const endTime = Date.now();

      // Should complete quickly (< 100ms for 100 updates)
      expect(endTime - startTime).toBeLessThan(100);

      // Verify all updates were applied
      for (let i = 0; i < 100; i++) {
        expect(configManager.getConfigValue(`features.test.property${i}`)).toBe(i);
      }
    });
  });

  describe('Hot Reload Functionality', () => {
    it('should reload configuration without downtime', async () => {
      const configPath = path.join(tempDir, '.env.hotreload');
      fs.writeFileSync(configPath, 'GEMINI_TEMPERATURE=0.9\n');

      // Mock file watching
      const mockWatcher = new EventEmitter();
      jest.spyOn(fs, 'watch').mockReturnValue(mockWatcher as any);

      // Enable hot reload
      process.env.CONFIG_HOT_RELOAD_ENABLED = 'true';
      process.env.CONFIG_PATH = configPath;

      const reloadPromise = new Promise((resolve) => {
        configManager.on('configReload', resolve);
      });

      // Simulate file change
      fs.writeFileSync(configPath, 'GEMINI_TEMPERATURE=0.7\n');
      mockWatcher.emit('change', 'change', configPath);

      await reloadPromise;

      // Configuration should be updated
      expect(configManager.getConfigValue('gemini.temperature')).toBe(0.7);
    });
  });

  describe('Event System Integration', () => {
    it('should emit correct events throughout lifecycle', async () => {
      const events: { type: string; data: any }[] = [];

      const eventTypes = ['configChange', 'configReload', 'health', 'error'];
      eventTypes.forEach(type => {
        configManager.on(type, (data) => {
          events.push({ type, data });
        });
      });

      // Trigger various events
      configManager.updateConfig('gemini.temperature', 0.8);
      configManager.reload();
      await configManager.getHealthStatus();

      // Verify events were emitted
      expect(events.some(e => e.type === 'configChange')).toBe(true);
      expect(events.some(e => e.type === 'health')).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with ConfigurationFactory', () => {
      // Old way using ConfigurationFactory
      const factoryConfig = ConfigurationFactory.createBotConfiguration();
      
      // New way using ConfigurationManager
      const managerConfig = configManager.getConfiguration();

      // Core structures should match
      expect(factoryConfig.discord).toBeDefined();
      expect(managerConfig.discord).toBeDefined();
      
      expect(factoryConfig.gemini.model).toBe(managerConfig.gemini.model);
      expect(factoryConfig.rateLimiting.rpm).toBe(managerConfig.rateLimiting.rpm);
    });

    it('should support legacy service initialization', () => {
      // Simulate legacy service expecting old configuration structure
      const legacyService = {
        initialize(config: any) {
          expect(config.gemini).toBeDefined();
          expect(config.gemini.model).toBe('gemini-2.0-flash-exp');
          expect(config.rateLimiting).toBeDefined();
          expect(config.features).toBeDefined();
        }
      };

      const config = configManager.getConfiguration();
      legacyService.initialize(config);
    });
  });

  describe('Production Readiness', () => {
    it('should validate production configuration requirements', () => {
      process.env.NODE_ENV = 'production';
      process.env.CONFIG_PROFILE = 'production';

      configManager.loadProfile('production');
      const config = configManager.getConfiguration();

      // Production requirements
      expect(config.features.monitoring.healthMetrics.enabled).toBe(true);
      expect(config.features.monitoring.alerts.enabled).toBe(true);
      expect(config.features.monitoring.gracefulDegradation.enabled).toBe(true);
      
      // Audit should be enabled in production
      const auditEnabled = process.env.CONFIG_AUDIT_ENABLED === 'true';
      expect(auditEnabled).toBe(true);
    });

    it('should handle production-level load', async () => {
      // Simulate production load patterns
      const tasks: Promise<any>[] = [];

      // Concurrent configuration reads
      for (let i = 0; i < 100; i++) {
        tasks.push(
          Promise.resolve(configManager.getConfigValue('gemini.model'))
        );
      }

      // Concurrent feature flag checks
      for (let i = 0; i < 100; i++) {
        tasks.push(
          Promise.resolve(configManager.isFeatureEnabled('test-feature', `user${i}`))
        );
      }

      // Concurrent health checks
      for (let i = 0; i < 10; i++) {
        tasks.push(configManager.getHealthStatus());
      }

      const startTime = Date.now();
      await Promise.all(tasks);
      const endTime = Date.now();

      // Should handle concurrent operations efficiently
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should provide comprehensive health monitoring', async () => {
      const health = await configManager.getHealthStatus();

      // Should include all critical components
      expect(health).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        configuration: {
          loaded: expect.any(Boolean),
          validated: expect.any(Boolean),
          lastReload: expect.any(String),
          profile: expect.any(String)
        },
        secrets: {
          initialized: expect.any(Boolean),
          count: expect.any(Number),
          lastRotation: expect.any(String)
        },
        featureFlags: {
          enabled: expect.any(Boolean),
          count: expect.any(Number),
          activeExperiments: expect.any(Array)
        },
        performance: {
          configLoadTime: expect.any(Number),
          averageGetTime: expect.any(Number),
          cacheHitRate: expect.any(Number),
          memoryUsage: expect.any(Number)
        },
        errors: expect.any(Array)
      });
    });
  });

  describe('Security Integration', () => {
    it('should handle secrets securely throughout lifecycle', () => {
      // Store sensitive data
      const secrets = {
        'api.discord.token': process.env.DISCORD_TOKEN!,
        'api.google.key': process.env.GOOGLE_API_KEY!,
        'api.thirdparty.secret': 'super-secret-value'
      };

      for (const [key, value] of Object.entries(secrets)) {
        secretManager.setSecret(key, value);
      }

      // Verify encryption
      const internalSecrets = (secretManager as any).secrets;
      for (const [key, encryptedValue] of internalSecrets) {
        expect(encryptedValue).not.toBe(secrets[key as keyof typeof secrets]);
      }

      // Verify decryption
      for (const [key, value] of Object.entries(secrets)) {
        expect(secretManager.getSecret(key)).toBe(value);
      }

      // Test key rotation
      secretManager.rotateKey();
      
      // Should still decrypt after rotation
      for (const [key, value] of Object.entries(secrets)) {
        expect(secretManager.getSecret(key)).toBe(value);
      }
    });

    it('should audit sensitive configuration changes', () => {
      process.env.CONFIG_AUDIT_ENABLED = 'true';

      // Make sensitive changes
      configManager.updateConfig('discord.token', 'new-token', 'admin-user');
      secretManager.setSecret('api.key', 'new-secret');

      const logs = configManager.getAuditLogs();
      const tokenLog = logs.find(l => l.path === 'discord.token');
      
      expect(tokenLog).toBeDefined();
      expect(tokenLog!.user).toBe('admin-user');
      expect(tokenLog!.newValue).toBe('new-token');
    });
  });

  describe('Complete System Integration', () => {
    it('should integrate all components successfully', async () => {
      // 1. Initialize system
      const config = configManager.getConfiguration();
      expect(config).toBeDefined();

      // 2. Set up secrets
      secretManager.setSecret('discord.token', process.env.DISCORD_TOKEN!);
      configManager.setSecretManager(secretManager);

      // 3. Configure feature flags
      process.env.FEATURE_VIDEO_PROCESSING = 'true';
      process.env.FEATURE_VIDEO_PROCESSING_ROLLOUT = '50';
      process.env.FEATURE_AUDIO_PROCESSING = 'true';
      process.env.FEATURE_THINKING_MODE = 'true';

      // 4. Test user scenarios
      const user1Enabled = configManager.isFeatureEnabled('video-processing', 'user1');
      const user2Enabled = configManager.isFeatureEnabled('video-processing', 'user2');
      
      // 5. Update configuration
      configManager.batchUpdate({
        'gemini.temperature': 0.7,
        'gemini.thinking.budget': 30000,
        'features.roasting.baseChance': 0.5
      });

      // 6. Verify health
      const health = await configManager.getHealthStatus();
      expect(health.status).toBe('healthy');

      // 7. Check audit trail
      const auditLogs = configManager.getAuditLogs();
      expect(auditLogs.length).toBeGreaterThan(0);

      // 8. Test configuration export
      const exportedConfig = {
        version: config.version,
        environment: process.env.NODE_ENV,
        features: configManager.getAllFeatureFlags(),
        health: health.status
      };

      expect(exportedConfig.features).toContain('video-processing');
      expect(exportedConfig.features).toContain('audio-processing');
      expect(exportedConfig.features).toContain('thinking-mode');
    });
  });
});