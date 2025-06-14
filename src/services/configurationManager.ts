/**
 * Legacy ConfigurationManager - Forwarding to new modular implementation
 * 
 * This file maintains backward compatibility by re-exporting the new
 * modular ConfigurationManager implementation.
 */

// Import and re-export the new modular implementation
import { ConfigurationManager as ModularConfigurationManager } from './config/ConfigurationManager';

// Re-export all interfaces for backward compatibility
export type {
  DiscordConfig,
  GeminiConfig,
  RateLimitingConfig,
  RoastingConfig,
  MonitoringConfig,
  FeatureConfig,
  BotConfiguration,
  ConfigurationChange,
  ConfigurationVersion,
  EnvironmentOverrides,
  ConfigurationEvents
} from './interfaces/ConfigurationInterfaces';

// Export the ConfigurationManager class
export { ModularConfigurationManager as ConfigurationManager };

// The entire implementation has been moved to the new modular structure
// All functionality is maintained through the new ConfigurationManager
// which is re-exported above for backward compatibility.