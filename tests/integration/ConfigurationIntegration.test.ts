
import { ConfigurationManager } from '../../src/services/config/ConfigurationManager';
import { SecretManager } from '../../src/services/security/SecretManager';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger');

describe('Configuration System Integration', () => {
  let configManager: ConfigurationManager;
  let secretManager: SecretManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env = {
      NODE_ENV: 'test',
      DISCORD_TOKEN: 'test-discord-token',
      DISCORD_CLIENT_ID: 'test-client-id',
      GOOGLE_API_KEY: 'test-google-api-key',
    };

    (ConfigurationManager as any).instance = null;
    (SecretManager as any).instance = null;

    configManager = ConfigurationManager.getInstance();
    secretManager = SecretManager.getInstance();
    await secretManager.initialize('master-key');
    await configManager.initialize();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await configManager.shutdown();
    await secretManager.shutdown();
    jest.clearAllMocks();
  });

  describe('Complete Configuration Lifecycle', () => {
    it('should handle full configuration lifecycle', async () => {
      const config = configManager.getConfiguration();
      expect(config).toBeDefined();
      expect(config.gemini.model).toBe('gemini-1.5-flash-latest');

      const health = configManager.getHealthStatus();
      expect(health.healthy).toBe(true);
    });
  });
});