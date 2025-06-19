/**
 * Configuration Module Index
 * Central export point for all configuration-related modules
 */

// Core configuration
export * from './ConfigurationManager';
export * from './ConfigurationFactory';
export * from './SecretManager';

// Configuration features
export * from './features';

// Configuration utilities
export * from './constants';
export * from './geminiConfig';
export * from './videoConfig';
export * from './botCapabilities';

// Singleton instances
export { configurationManager } from './ConfigurationManager';
export { secretManager } from './SecretManager';
export { profileManager } from './features/ConfigurationProfiles';
export { featureFlagManager } from './features/FeatureFlags';