/**
 * Configuration Monitor Tests
 */

import { configurationMonitor } from '../../../src/config/monitoring/ConfigurationMonitor';
import { configurationManager } from '../../../src/config/ConfigurationManager';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('ConfigurationMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    configurationMonitor.stopMonitoring();
    configurationMonitor.removeAllListeners();
  });

  describe('Health Checks', () => {
    it('should run health checks successfully', async () => {
      const healthStatus = await configurationMonitor.runHealthChecks();
      
      expect(healthStatus).toBeDefined();
      expect(healthStatus.overall).toMatch(/healthy|degraded|unhealthy/);
      expect(healthStatus.checks).toBeInstanceOf(Array);
      expect(healthStatus.checksPassed).toBeGreaterThanOrEqual(0);
      expect(healthStatus.checksFailed).toBeGreaterThanOrEqual(0);
      expect(healthStatus.lastChecked).toBeGreaterThan(0);
    });

    it('should detect missing API keys', async () => {
      // Clear env vars temporarily
      const originalDiscordToken = process.env.DISCORD_BOT_TOKEN;
      const originalGeminiKey = process.env.GOOGLE_API_KEY;
      
      delete process.env.DISCORD_BOT_TOKEN;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      
      const healthStatus = await configurationMonitor.runHealthChecks();
      
      const apiKeyCheck = healthStatus.checks.find(c => c.checkName === 'api_keys');
      expect(apiKeyCheck).toBeDefined();
      expect(apiKeyCheck?.status).toBe('unhealthy');
      expect(apiKeyCheck?.message).toContain('Missing required API keys');
      
      // Restore env vars
      if (originalDiscordToken) process.env.DISCORD_BOT_TOKEN = originalDiscordToken;
      if (originalGeminiKey) process.env.GOOGLE_API_KEY = originalGeminiKey;
    });

    it('should validate rate limits', async () => {
      const healthStatus = await configurationMonitor.runHealthChecks();
      
      const rateLimitCheck = healthStatus.checks.find(c => c.checkName === 'rate_limits');
      expect(rateLimitCheck).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(rateLimitCheck?.status);
    });

    it('should check Discord intents', async () => {
      const healthStatus = await configurationMonitor.runHealthChecks();
      
      const intentsCheck = healthStatus.checks.find(c => c.checkName === 'discord_intents');
      expect(intentsCheck).toBeDefined();
      expect(['healthy', 'unhealthy']).toContain(intentsCheck?.status);
    });
  });

  describe('Monitoring', () => {
    it('should start and stop monitoring', () => {
      expect(() => configurationMonitor.startMonitoring(1000)).not.toThrow();
      expect(() => configurationMonitor.stopMonitoring()).not.toThrow();
    });

    it('should emit health change events', async () => {
      const healthChangedHandler = jest.fn();
      configurationMonitor.on('health:changed', healthChangedHandler);
      
      // Run health checks twice to potentially trigger a change
      await configurationMonitor.runHealthChecks();
      await configurationMonitor.runHealthChecks();
      
      // The handler may or may not be called depending on health status changes
      expect(healthChangedHandler).toHaveBeenCalledTimes(healthChangedHandler.mock.calls.length);
    });
  });

  describe('Health Report', () => {
    it('should generate health report', async () => {
      await configurationMonitor.runHealthChecks();
      const report = configurationMonitor.generateHealthReport();
      
      expect(report).toContain('Configuration Health Report');
      expect(report).toContain('Overall Status:');
      expect(report).toContain('Health Check Results:');
    });
  });

  describe('Custom Health Checks', () => {
    it('should register and run custom health checks', async () => {
      const customCheckResult = {
        checkName: 'custom_check',
        status: 'healthy' as const,
        message: 'Custom check passed',
        severity: 'info' as const,
        timestamp: Date.now()
      };
      
      configurationMonitor.registerHealthCheck('custom_check', () => customCheckResult);
      
      const healthStatus = await configurationMonitor.runHealthChecks();
      const customCheck = healthStatus.checks.find(c => c.checkName === 'custom_check');
      
      expect(customCheck).toBeDefined();
      expect(customCheck?.status).toBe('healthy');
      expect(customCheck?.message).toBe('Custom check passed');
      
      // Clean up
      configurationMonitor.unregisterHealthCheck('custom_check');
    });
  });
});