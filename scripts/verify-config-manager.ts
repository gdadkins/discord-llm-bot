
import { ConfigurationManager } from '../src/services/config/ConfigurationManager';

async function verifyConfigManager() {
  console.log('Verifying ConfigurationManager...');

  try {
    const manager = new ConfigurationManager();
    await manager.initialize();
    console.log('Manager initialized.');

    const config = manager.getConfiguration();
    console.log('Configuration retrieved:');
    console.log(JSON.stringify(config, null, 2));

    const requiredKeys = ['discord', 'gemini', 'rateLimiting', 'features'];
    const missingKeys = requiredKeys.filter(key => !(key in config));

    if (missingKeys.length > 0) {
      console.error('Validation FAILED: Missing top-level keys:', missingKeys);
      process.exit(1);
    } else {
      console.log('Validation SUCCESS: All required keys are present.');
    }

  } catch (error) {
    console.error('Verification FAILED with error:', error);
    process.exit(1);
  }
}

verifyConfigManager();
