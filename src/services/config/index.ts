/**
 * Configuration Module Index
 * 
 * Exports all configuration management components
 */

export { ConfigurationManager } from './ConfigurationManager';
export { ConfigurationLoader } from './ConfigurationLoader';
export { ConfigurationValidator } from './ConfigurationValidator';
export { ConfigurationMigrator } from './ConfigurationMigrator';
export { ConfigurationAuditor } from './ConfigurationAuditor';

// Re-export interfaces for convenience
export type {
  BotConfiguration,
  DiscordConfig,
  GeminiConfig,
  RateLimitingConfig,
  FeatureConfig,
  RoastingConfig,
  MonitoringConfig,
  ConfigurationChange,
  ConfigurationVersion,
  EnvironmentOverrides,
  ConfigurationEvents,
  IConfigurationLoader,
  IConfigurationValidator,
  IConfigurationMigrator,
  IConfigurationAuditor,
  IConfigurationService
} from '../interfaces/ConfigurationInterfaces';