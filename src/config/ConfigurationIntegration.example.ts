/**
 * Configuration Integration Example
 * 
 * This file demonstrates how to use the advanced configuration features together:
 * - SecretManager for secure secrets handling
 * - ConfigurationProfiles for environment-specific settings
 * - FeatureFlags for gradual rollouts and A/B testing
 * 
 * This is an example file showing best practices for production use.
 */

import { configurationManager } from './ConfigurationManager';
import { secretManager } from './SecretManager';
import { profileManager } from './features/ConfigurationProfiles';
import { featureFlagManager } from './features/FeatureFlags';
import { logger } from '../utils/logger';

/**
 * Example: Initialize all configuration services
 */
export async function initializeConfiguration(): Promise<void> {
  try {
    // 1. Initialize SecretManager first (it handles sensitive data)
    await secretManager.initialize();
    
    // Store API keys securely
    await secretManager.setSecret('GOOGLE_API_KEY', process.env.GOOGLE_API_KEY || '', {
      description: 'Google AI API key for Gemini',
      rotationInterval: 90 // Rotate every 90 days
    });
    
    await secretManager.setSecret('DISCORD_TOKEN', process.env.DISCORD_TOKEN || '', {
      description: 'Discord bot token',
      rotationInterval: 30 // Rotate monthly for security
    });
    
    // Set up rotation policies
    secretManager.setRotationPolicy('GOOGLE_API_KEY', {
      rotationIntervalDays: 90,
      notifyBeforeDays: 7,
      autoRotate: false,
      rotationCallback: async (secretName) => {
        // In production, this would fetch a new key from your key management service
        logger.warn(`Secret ${secretName} needs rotation`);
        return 'new-api-key-placeholder';
      }
    });

    // 2. Initialize ProfileManager for environment-specific configs
    await profileManager.initialize();
    
    // Example: Add custom profile overrides for staging
    if (profileManager.getCurrentProfile() === 'staging') {
      await profileManager.applyProfileOverrides([
        {
          path: 'gemini.maxTokens',
          value: 16384,
          description: 'Higher token limit for staging tests'
        }
      ]);
    }

    // 3. Initialize FeatureFlagManager for controlled rollouts
    await featureFlagManager.initialize();
    
    // Example: Create a custom feature flag
    featureFlagManager.setFlag({
      name: 'new-ui-commands',
      description: 'Enable new slash command UI',
      defaultEnabled: true,
      rolloutPercentage: 25, // Start with 25% of users
      environments: ['development', 'staging'],
      startDate: new Date('2024-01-15'),
      tags: ['ui', 'experimental']
    });
    
    // Start an A/B test
    featureFlagManager.startExperiment('enhanced-roasting');

    // 4. Initialize ConfigurationManager (depends on the others)
    await configurationManager.initialize();
    
    // Set up configuration change listeners
    configurationManager.on('config:reloaded', (version) => {
      logger.info(`Configuration reloaded to version ${version}`);
    });
    
    configurationManager.on('config:error', (error) => {
      logger.error('Configuration error:', error);
    });

    logger.info('All configuration services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize configuration:', error);
    throw error;
  }
}

/**
 * Example: Get configuration with secrets and feature flags
 */
export async function getEnhancedConfiguration(userId: string) {
  // Get base configuration
  const config = configurationManager.getConfiguration();
  
  // Get secrets securely
  const apiKey = await secretManager.getSecret('GOOGLE_API_KEY');
  const discordToken = await secretManager.getSecret('DISCORD_TOKEN');
  
  // Check feature flags for the user
  const features = {
    googleSearch: featureFlagManager.isEnabled('google-search-grounding', userId),
    codeExecution: featureFlagManager.isEnabled('code-execution', userId),
    videoProcessing: featureFlagManager.isEnabled('video-processing', userId),
    enhancedRoasting: featureFlagManager.isEnabled('enhanced-roasting', userId),
    thinkingMode: featureFlagManager.isEnabled('thinking-mode', userId)
  };
  
  // Get profile-specific settings
  const profile = profileManager.getCurrentProfile();
  const profileSettings = profileManager.getPerformanceSettings();
  const securitySettings = profileManager.getSecuritySettings();
  
  return {
    config,
    secrets: {
      apiKey: apiKey || undefined,
      discordToken: discordToken || undefined
    },
    features,
    profile: {
      name: profile,
      performance: profileSettings,
      security: securitySettings
    }
  };
}

/**
 * Example: Production deployment with gradual feature rollout
 */
export async function deployNewFeature(featureName: string) {
  // Start with 0% rollout
  featureFlagManager.setFlag({
    name: featureName,
    description: `New feature: ${featureName}`,
    defaultEnabled: true,
    rolloutPercentage: 0,
    environments: ['production'],
    tags: ['new-feature']
  });
  
  // Gradually increase rollout
  const rolloutStages = [5, 10, 25, 50, 75, 100];
  
  for (const percentage of rolloutStages) {
    // Wait for monitoring period (in production, this would be days/weeks)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check metrics (in production, check error rates, performance, etc.)
    const isHealthy = await checkFeatureHealth(featureName);
    
    if (isHealthy) {
      featureFlagManager.updateRollout(featureName, percentage);
      logger.info(`Increased ${featureName} rollout to ${percentage}%`);
    } else {
      logger.error(`Feature ${featureName} showing issues, halting rollout at ${percentage}%`);
      break;
    }
  }
}

/**
 * Example: Handle secret rotation
 */
export function setupSecretRotation() {
  // Listen for rotation events
  secretManager.on('rotation:needed', async (secretName, daysOverdue) => {
    logger.warn(`Secret ${secretName} needs rotation (${daysOverdue} days overdue)`);
    
    // Send notification to ops team
    // await notifyOpsTeam(`Secret rotation needed: ${secretName}`);
  });
  
  secretManager.on('secret:rotated', (secretName) => {
    logger.info(`Secret rotated successfully: ${secretName}`);
    
    // Reload configuration to use new secret
    configurationManager.reloadConfiguration('api', 'Secret rotation');
  });
}

/**
 * Example: Environment-specific configuration
 */
export function getEnvironmentSpecificConfig() {
  const profile = profileManager.getCurrentProfile();
  
  switch (profile) {
  case 'production':
    return {
      aiModel: 'gemini-2.0-flash-exp',
      temperature: 0.7, // More consistent
      rateLimitRPM: 15, // Conservative
      cacheEnabled: true,
      monitoringEnabled: true,
      gracefulDegradation: true
    };
    
  case 'staging':
    return {
      aiModel: 'gemini-2.0-flash-exp',
      temperature: 0.8,
      rateLimitRPM: 20,
      cacheEnabled: true,
      monitoringEnabled: true,
      gracefulDegradation: true
    };
    
  case 'development':
    return {
      aiModel: 'gemini-2.0-flash-exp',
      temperature: 0.9, // More creative
      rateLimitRPM: 30, // Higher for testing
      cacheEnabled: false, // Disabled for fresh responses
      monitoringEnabled: false,
      gracefulDegradation: false
    };
    
  default:
    return {
      aiModel: 'gemini-2.0-flash-exp',
      temperature: 0.9,
      rateLimitRPM: 15,
      cacheEnabled: false,
      monitoringEnabled: false,
      gracefulDegradation: false
    };
  }
}

/**
 * Example: A/B testing with feature flags
 */
export async function trackFeatureUsage(userId: string, featureName: string, success: boolean) {
  // Record conversion for A/B test
  featureFlagManager.recordConversion(featureName, userId, success);
  
  // Get current experiment results
  const results = featureFlagManager.getExperimentResults(featureName);
  if (results) {
    logger.info(`A/B test results for ${featureName}:`, {
      control: results.controlGroup,
      treatment: results.treatmentGroup,
      conversionRate: results.conversionRate
    });
  }
}

/**
 * Example: Secure external service integration
 */
export async function setupExternalServiceIntegration() {
  // Register external secret provider (e.g., AWS Secrets Manager)
  secretManager.registerProvider('aws-secrets', {
    name: 'AWS Secrets Manager',
    async getSecret(key: string) {
      // In production, this would use AWS SDK
      logger.debug(`Fetching secret ${key} from AWS`);
      return null;
    },
    async setSecret(key: string, value: string) {
      logger.debug(`Storing secret ${key} to AWS`);
    },
    async deleteSecret(key: string) {
      logger.debug(`Deleting secret ${key} from AWS`);
    },
    async listSecrets() {
      return [];
    }
  });
}

/**
 * Example: Production readiness checks
 */
export async function performProductionReadinessCheck(): Promise<boolean> {
  const errors: string[] = [];
  
  // Check secrets are properly configured
  const requiredSecrets = ['GOOGLE_API_KEY', 'DISCORD_TOKEN'];
  for (const secretName of requiredSecrets) {
    const value = await secretManager.getSecret(secretName);
    if (!value) {
      errors.push(`Missing required secret: ${secretName}`);
    }
  }
  
  // Check we're in production profile
  if (profileManager.getCurrentProfile() !== 'production') {
    errors.push('Not in production profile');
  }
  
  // Check security settings
  const security = profileManager.getSecuritySettings();
  if (!security?.strictMode) {
    errors.push('Strict mode not enabled');
  }
  if (!security?.encryptionRequired) {
    errors.push('Encryption not required');
  }
  
  // Check critical features
  const criticalFeatures = ['enhanced-roasting', 'advanced-caching'];
  for (const feature of criticalFeatures) {
    if (!featureFlagManager.isEnabled(feature, 'system')) {
      errors.push(`Critical feature not enabled: ${feature}`);
    }
  }
  
  if (errors.length > 0) {
    logger.error('Production readiness check failed:', errors);
    return false;
  }
  
  logger.info('Production readiness check passed');
  return true;
}

// Helper function for health checking
async function checkFeatureHealth(featureName: string): Promise<boolean> {
  // In production, this would check real metrics
  return Math.random() > 0.1; // 90% success rate for demo
}