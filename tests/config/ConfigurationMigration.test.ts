/**
 * Configuration Migration Tests
 * Tests for the configuration migration script
 */

import { ConfigurationMigrator } from '../../scripts/migrate-config';
import * as fs from 'fs';
import * as path from 'path';

describe('Configuration Migration', () => {
  const tempDir = path.join(__dirname, 'temp-migration-test');
  
  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('ConfigurationMigrator', () => {
    it('should migrate deprecated API key variable', async () => {
      const envPath = path.join(tempDir, '.env.test1');
      const envContent = `
DISCORD_TOKEN=test-token
DISCORD_CLIENT_ID=test-client
GEMINI_API_KEY=old-api-key
GEMINI_MODEL=gemini-pro
`;
      fs.writeFileSync(envPath, envContent);

      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      expect(result.migratedVariables).toContain('GEMINI_API_KEY -> GOOGLE_API_KEY');
      
      const migratedContent = fs.readFileSync(envPath, 'utf8');
      expect(migratedContent).toContain('GOOGLE_API_KEY=old-api-key');
      expect(migratedContent).not.toContain('GEMINI_API_KEY=');
    });

    it('should migrate thinking mode variables', async () => {
      const envPath = path.join(tempDir, '.env.test2');
      const envContent = `
DISCORD_TOKEN=test-token
DISCORD_CLIENT_ID=test-client
GOOGLE_API_KEY=api-key
THINKING_BUDGET=10000
INCLUDE_THOUGHTS=true
FORCE_THINKING_PROMPT=false
`;
      fs.writeFileSync(envPath, envContent);

      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      expect(result.migratedVariables).toContain('THINKING_BUDGET -> GEMINI_THINKING_BUDGET');
      expect(result.migratedVariables).toContain('INCLUDE_THOUGHTS -> GEMINI_INCLUDE_THOUGHTS');
      
      const migratedContent = fs.readFileSync(envPath, 'utf8');
      expect(migratedContent).toContain('GEMINI_THINKING_BUDGET=10000');
      expect(migratedContent).toContain('GEMINI_INCLUDE_THOUGHTS=true');
    });

    it('should handle conflicts appropriately', async () => {
      const envPath = path.join(tempDir, '.env.test3');
      const envContent = `
DISCORD_TOKEN=test-token
GEMINI_API_KEY=old-key
GOOGLE_API_KEY=new-key
`;
      fs.writeFileSync(envPath, envContent);

      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Conflict');
      
      const migratedContent = fs.readFileSync(envPath, 'utf8');
      expect(migratedContent).toContain('GOOGLE_API_KEY=new-key');
      expect(migratedContent).not.toContain('GEMINI_API_KEY');
    });

    it('should apply new defaults', async () => {
      const envPath = path.join(tempDir, '.env.test4');
      const envContent = `
DISCORD_TOKEN=test-token
DISCORD_CLIENT_ID=test-client
GOOGLE_API_KEY=api-key
`;
      fs.writeFileSync(envPath, envContent);

      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      
      const migratedContent = fs.readFileSync(envPath, 'utf8');
      expect(migratedContent).toContain('FEATURE_FLAGS_ENABLED=true');
      expect(migratedContent).toContain('CONFIG_AUDIT_ENABLED=true');
      expect(migratedContent).toContain('MULTIMODAL_BATCH_SIZE=5');
    });

    it('should create backup before migration', async () => {
      const envPath = path.join(tempDir, '.env.test5');
      fs.writeFileSync(envPath, 'ORIGINAL_CONTENT=true');

      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath!)).toBe(true);
      
      const backupContent = fs.readFileSync(result.backupPath!, 'utf8');
      expect(backupContent).toBe('ORIGINAL_CONTENT=true');
    });

    it('should validate configuration after migration', async () => {
      const envPath = path.join(tempDir, '.env.test6');
      const envContent = `
DISCORD_TOKEN=test-token
DISCORD_CLIENT_ID=test-client
GOOGLE_API_KEY=api-key
RATE_LIMIT_RPM=invalid
`;
      fs.writeFileSync(envPath, envContent);

      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('RATE_LIMIT_RPM');
    });

    it('should generate comprehensive report', async () => {
      const envPath = path.join(tempDir, '.env.test7');
      const envContent = `
DISCORD_TOKEN=test-token
DISCORD_CLIENT_ID=test-client
GEMINI_API_KEY=old-key
THINKING_BUDGET=5000
`;
      fs.writeFileSync(envPath, envContent);

      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();
      const report = migrator.generateReport(result);

      expect(report).toContain('Configuration Migration Report');
      expect(report).toContain('Status: SUCCESS');
      expect(report).toContain('Migrated Variables');
      expect(report).toContain('GEMINI_API_KEY -> GOOGLE_API_KEY');
      expect(report).toContain('Recommendations');
    });

    it('should transform hours to days for retention', async () => {
      const envPath = path.join(tempDir, '.env.test8');
      const envContent = `
DISCORD_TOKEN=test-token
DISCORD_CLIENT_ID=test-client
GOOGLE_API_KEY=api-key
METRICS_RETENTION_HOURS=48
`;
      fs.writeFileSync(envPath, envContent);

      const migrator = new ConfigurationMigrator(envPath, tempDir);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      
      const migratedContent = fs.readFileSync(envPath, 'utf8');
      expect(migratedContent).toContain('METRICS_RETENTION_DAYS=2');
      expect(migratedContent).not.toContain('METRICS_RETENTION_HOURS');
    });
  });
});