/**
 * Configuration System Integration Tests
 * End-to-end tests for configuration system components working together
 */

import { ConfigurationManager } from '../../src/config/ConfigurationManager';
import { SecretManager } from '../../src/services/security/SecretManager';
import { ConfigurationFactory } from '../../src/config/ConfigurationFactory';
import { ConfigurationMigrator } from '../../scripts/migrate-config';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../src/utils/logger';

// Mock logger to reduce noise
jest.mock('../../src/utils/logger');

describe('Configuration System Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  const tempDir = path.join(__dirname, 'temp-integration-test');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env = {
      NODE_ENV: 'test',
      DISCORD_TOKEN: 'test-discord-token',
      DISCORD_CLIENT_ID: 'test-client-id',
      GOOGLE_API_KEY: 'test-google-api-key',
      GEMINI_MODEL: 'gemini-2.0-flash-exp',
      RATE_LIMIT_RPM: '15',
      RATE_LIMIT_DAILY: '1500',
      GEMINI_TEMPERATURE: '0.9',
      VIDEO_SUPPORT_ENABLED: 'true',
      AUDIO_SUPPORT_ENABLED: 'false',
      HEALTH_CHECK_INTERVAL_MS: '30000'
    };

    // Reset singletons
    (ConfigurationManager as any).instance = null;
    (SecretManager as any).instance = null;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Complete System Initialization', () => {
    it('should initialize all components successfully', async () => {
      // Initialize ConfigurationManager
      const configManager = ConfigurationManager.getInstance();
      await configManager.initialize();
      expect(configManager.isHealthy()).toBe(true);

      // Initialize SecretManager
      const secretManager = SecretManager.getInstance();
      await secretManager.initialize();
      expect(secretManager.isInitialized()).toBe(true);

      // Verify configuration is accessible
      const config = configManager.getConfiguration();
      expect(config.gemini.model).toBe('gemini-2.0-flash-exp');
      expect(config.rateLimiting.rpm).toBe(15);

      // Verify secrets can be stored
      await secretManager.setSecret('api.key', 'secret-value');
      const retrieved = await secretManager.getSecret('api.key');
      expect(retrieved).toBe('secret-value');
    });
  });

  describe('Configuration Migration Workflow', () => {
    it('should migrate legacy configuration to new format', async () => {
      // Create legacy .env file
      const envPath = path.join(tempDir, '.env.migration');
      const legacyContent = `
DISCORD_TOKEN=old-token
DISCORD_CLIENT_ID=old-client
GEMINI_API_KEY=old-gemini-key
THINKING_BUDGET=10000
INCLUDE_THOUGHTS=true
ENABLE_CODE_EXECUTION=false
VIDEO_SUPPORT_ENABLED=true
`;
      fs.writeFileSync(envPath, legacyContent);

      // Run migration
      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      expect(result.migratedVariables).toContain('GEMINI_API_KEY -> GOOGLE_API_KEY');
      expect(result.migratedVariables).toContain('THINKING_BUDGET -> GEMINI_THINKING_BUDGET');

      // Verify migrated file
      const migratedContent = fs.readFileSync(envPath, 'utf8');
      expect(migratedContent).toContain('GOOGLE_API_KEY=old-gemini-key');
      expect(migratedContent).toContain('GEMINI_THINKING_BUDGET=10000');
      expect(migratedContent).toContain('GEMINI_INCLUDE_THOUGHTS=true');
      expect(migratedContent).toContain('GEMINI_ENABLE_CODE_EXECUTION=false');

      // Verify new defaults were added
      expect(migratedContent).toContain('FEATURE_FLAGS_ENABLED=true');
      expect(migratedContent).toContain('CONFIG_AUDIT_ENABLED=true');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with ConfigurationFactory', async () => {
      // Get configuration using old factory method
      const factoryConfig = ConfigurationFactory.createBotConfiguration();
      
      // Get configuration using new manager
      const configManager = ConfigurationManager.getInstance();
      await configManager.initialize();
      const managerConfig = configManager.getConfiguration();

      // Compare core structures
      expect(factoryConfig.gemini.model).toBe(managerConfig.gemini.model);
      expect(factoryConfig.rateLimiting.rpm).toBe(managerConfig.rateLimiting.rpm);
      expect(factoryConfig.features.monitoring.healthMetrics.enabled).toBe(
        managerConfig.features.monitoring.healthMetrics.enabled
      );
    });

    it('should handle both GOOGLE_API_KEY and GEMINI_API_KEY', async () => {
      // Test with GEMINI_API_KEY
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'gemini-key';
      
      (ConfigurationManager as any).instance = null;
      const manager1 = ConfigurationManager.getInstance();
      await manager1.initialize();
      expect(manager1.isHealthy()).toBe(true);

      // Test with GOOGLE_API_KEY
      delete process.env.GEMINI_API_KEY;
      process.env.GOOGLE_API_KEY = 'google-key';
      
      (ConfigurationManager as any).instance = null;
      const manager2 = ConfigurationManager.getInstance();
      await manager2.initialize();
      expect(manager2.isHealthy()).toBe(true);
    });
  });

  describe('Secret Management Integration', () => {
    it('should securely manage sensitive configuration', async () => {
      const configManager = ConfigurationManager.getInstance();
      await configManager.initialize();

      const secretManager = SecretManager.getInstance();
      await secretManager.initialize();

      // Store sensitive configuration
      const secrets = {
        'discord.token': process.env.DISCORD_TOKEN!,
        'google.apiKey': process.env.GOOGLE_API_KEY!,
        'database.password': 'super-secret-password'
      };

      for (const [key, value] of Object.entries(secrets)) {
        await secretManager.setSecret(key, value);
      }

      // Verify encryption
      const storedSecrets = (secretManager as any).secrets;
      for (const [key, encryptedValue] of storedSecrets) {
        expect(encryptedValue).not.toBe(secrets[key as keyof typeof secrets]);
        expect(encryptedValue.iv).toBeDefined();
        expect(encryptedValue.data).toBeDefined();
      }

      // Verify decryption
      for (const [key, value] of Object.entries(secrets)) {
        const decrypted = await secretManager.getSecret(key);
        expect(decrypted).toBe(value);
      }

      // Test key rotation
      await secretManager.rotateKey();
      
      // Verify secrets still accessible after rotation
      for (const [key, value] of Object.entries(secrets)) {
        const decrypted = await secretManager.getSecret(key);
        expect(decrypted).toBe(value);
      }
    });
  });

  describe('Configuration Validation and Health', () => {
    it('should validate configuration across all components', async () => {
      const configManager = ConfigurationManager.getInstance();
      await configManager.initialize();

      // Validate configuration
      const validation = await configManager.validateConfiguration();
      expect(validation.valid).toBe(true);

      // Check health status
      const health = await configManager.getHealthStatus();
      expect(health.status).toBe('healthy');
      expect(health.components).toMatchObject({
        configuration: 'healthy',
        validation: 'healthy'
      });
    });

    it('should handle invalid configuration gracefully', async () => {
      // Set invalid configuration
      process.env.GEMINI_TEMPERATURE = '3.0'; // Out of range
      process.env.RATE_LIMIT_RPM = '0'; // Too low
      
      (ConfigurationManager as any).instance = null;
      const configManager = ConfigurationManager.getInstance();
      
      // Should fail to initialize
      await expect(configManager.initialize()).rejects.toThrow();
      
      // Health should reflect the failure
      expect(configManager.isHealthy()).toBe(false);
      const health = await configManager.getHealthStatus();
      expect(health.status).toBe('unhealthy');
    });
  });

  describe('Event System Integration', () => {
    it('should emit events across configuration lifecycle', async () => {
      const events: { type: string; data: any }[] = [];
      
      const configManager = ConfigurationManager.getInstance();
      
      // Set up event listeners
      configManager.on('config:loaded', (version) => {
        events.push({ type: 'loaded', data: version });
      });
      
      configManager.on('config:validated', (valid, errors) => {
        events.push({ type: 'validated', data: { valid, errors } });
      });
      
      configManager.on('config:reloaded', (version) => {
        events.push({ type: 'reloaded', data: version });
      });

      // Initialize
      await configManager.initialize();
      
      // Reload configuration
      await configManager.reloadConfiguration('test');

      // Verify events
      expect(events.some(e => e.type === 'loaded')).toBe(true);
      expect(events.some(e => e.type === 'validated' && e.data.valid)).toBe(true);
      expect(events.some(e => e.type === 'reloaded')).toBe(true);
    });
  });

  describe('Performance and Caching', () => {
    it('should efficiently handle repeated configuration access', async () => {
      const configManager = ConfigurationManager.getInstance();
      await configManager.initialize();

      const iterations = 1000;
      const startTime = Date.now();

      // Repeated access should use cache
      for (let i = 0; i < iterations; i++) {
        configManager.getConfigValue('gemini.model');
        configManager.getConfigValue('rateLimiting.rpm');
        configManager.getConfigValue('features.monitoring.healthMetrics.enabled');
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should be very fast due to caching (< 0.1ms per access)
      expect(avgTime).toBeLessThan(0.1);
    });
  });

  describe('Production Readiness', () => {
    it('should handle production configuration requirements', async () => {
      process.env.NODE_ENV = 'production';
      process.env.CONFIG_AUDIT_ENABLED = 'true';
      process.env.MONITORING_EVENTS_ENABLED = 'true';

      (ConfigurationManager as any).instance = null;
      const configManager = ConfigurationManager.getInstance();
      await configManager.initialize();

      const config = configManager.getConfiguration();
      
      // Production requirements
      expect(config.features.monitoring.healthMetrics.enabled).toBe(true);
      expect(config.features.monitoring.gracefulDegradation.enabled).toBe(true);
      
      // Verify audit is enabled
      expect(process.env.CONFIG_AUDIT_ENABLED).toBe('true');
    });
  });

  describe('Error Recovery', () => {
    it('should recover from configuration reload errors', async () => {
      const configManager = ConfigurationManager.getInstance();
      await configManager.initialize();

      // Force a reload error
      jest.spyOn(configManager as any, 'loadConfiguration')
        .mockRejectedValueOnce(new Error('Reload failed'));

      // Reload should fail
      await expect(configManager.reloadConfiguration()).rejects.toThrow();

      // But configuration should still be accessible (cached)
      const config = configManager.getConfiguration();
      expect(config).toBeDefined();
      expect(config.gemini.model).toBe('gemini-2.0-flash-exp');
    });
  });

  describe('Complete Integration Scenario', () => {
    it('should handle real-world configuration workflow', async () => {
      // 1. Start with legacy configuration
      const envPath = path.join(tempDir, '.env.integration');
      const legacyContent = `
DISCORD_TOKEN=integration-token
DISCORD_CLIENT_ID=integration-client
GEMINI_API_KEY=integration-api-key
THINKING_BUDGET=15000
VIDEO_SUPPORT_ENABLED=true
UNFILTERED_MODE=false
`;
      fs.writeFileSync(envPath, legacyContent);

      // 2. Migrate configuration
      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const migrationResult = await migrator.migrate();
      expect(migrationResult.success).toBe(true);

      // 3. Load migrated configuration
      const migratedContent = fs.readFileSync(envPath, 'utf8');
      const migratedVars = migratedContent.split('\n')
        .filter(line => line.includes('='))
        .reduce((acc, line) => {
          const [key, value] = line.split('=');
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>);

      // Apply migrated variables to environment
      Object.assign(process.env, migratedVars);

      // 4. Initialize configuration system
      (ConfigurationManager as any).instance = null;
      const configManager = ConfigurationManager.getInstance();
      await configManager.initialize();

      // 5. Initialize secret management
      const secretManager = SecretManager.getInstance();
      await secretManager.initialize();

      // 6. Store secrets
      await secretManager.setSecret('discord.token', 'integration-token');
      await secretManager.setSecret('google.apiKey', migratedVars.GOOGLE_API_KEY);

      // 7. Verify complete system
      expect(configManager.isHealthy()).toBe(true);
      expect(secretManager.isInitialized()).toBe(true);
      
      const config = configManager.getConfiguration();
      expect(config.gemini.thinking.budget).toBe(15000);
      expect(configManager.getConfigValue('features.videoSupport', false)).toBe(false); // Should use video config

      // 8. Generate health report
      const health = await configManager.getHealthStatus();
      expect(health.status).toBe('healthy');
      
      // 9. Generate migration report
      const report = migrator.generateReport(migrationResult);
      expect(report).toContain('Status: SUCCESS');
      expect(report).toContain('GEMINI_API_KEY -> GOOGLE_API_KEY');
    });
  });
});