/**
 * ConfigurationProfiles - Environment-Based Configuration Management
 * 
 * Provides profile-based configuration with:
 * - Development, staging, and production profiles
 * - Profile-based configuration overrides
 * - Automatic environment detection
 * - Profile change event emission
 * - Optimized settings per environment
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { ConfigurationManager } from '../ConfigurationManager';
import type { 
  BotConfiguration, 
  GeminiConfig, 
  RateLimitingConfig,
  MonitoringConfig,
  FeatureConfig
} from '../../services/interfaces/ConfigurationInterfaces';
import type { IService, ServiceHealthStatus } from '../../services/interfaces/CoreServiceInterfaces';

// ============================================================================
// Types and Interfaces
// ============================================================================

export type EnvironmentProfile = 'development' | 'staging' | 'production' | 'test';

export interface ProfileOverride {
  path: string;
  value: unknown;
  description?: string;
}

export interface ConfigurationProfile {
  name: EnvironmentProfile;
  description: string;
  baseProfile?: EnvironmentProfile;
  overrides: ProfileOverride[];
  features: {
    enabledByDefault: string[];
    disabledByDefault: string[];
  };
  performance: {
    cacheEnabled: boolean;
    cacheTTL: number;
    compressionEnabled: boolean;
    rateLimitMultiplier: number;
  };
  security: {
    strictMode: boolean;
    auditingEnabled: boolean;
    encryptionRequired: boolean;
  };
}

export interface ProfileValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  appliedOverrides: number;
}

// ============================================================================
// Default Profiles
// ============================================================================

const DEFAULT_PROFILES: Record<EnvironmentProfile, ConfigurationProfile> = {
  development: {
    name: 'development',
    description: 'Development environment with relaxed limits and enhanced debugging',
    overrides: [
      {
        path: 'gemini.temperature',
        value: 0.9,
        description: 'Higher creativity for testing diverse responses'
      },
      {
        path: 'rateLimiting.rpm',
        value: 30,
        description: 'Higher rate limit for rapid testing'
      },
      {
        path: 'rateLimiting.daily',
        value: 5000,
        description: 'Higher daily limit for development'
      },
      {
        path: 'features.monitoring.healthMetrics.collectionInterval',
        value: 10000,
        description: 'More frequent health checks in dev'
      },
      {
        path: 'features.caching.ttlMinutes',
        value: 1,
        description: 'Short cache TTL for testing changes'
      }
    ],
    features: {
      enabledByDefault: [
        'codeExecution',
        'structuredOutput',
        'googleSearch',
        'thinking',
        'debugging',
        'verboseLogging'
      ],
      disabledByDefault: [
        'productionSafety',
        'rateLimitEnforcement'
      ]
    },
    performance: {
      cacheEnabled: true,
      cacheTTL: 60, // 1 minute
      compressionEnabled: false,
      rateLimitMultiplier: 2.0
    },
    security: {
      strictMode: false,
      auditingEnabled: false,
      encryptionRequired: false
    }
  },

  staging: {
    name: 'staging',
    description: 'Staging environment with production-like settings',
    baseProfile: 'production',
    overrides: [
      {
        path: 'rateLimiting.rpm',
        value: 20,
        description: 'Slightly higher rate limit for testing'
      },
      {
        path: 'features.monitoring.alerts.enabled',
        value: true,
        description: 'Enable alerts for staging monitoring'
      },
      {
        path: 'features.monitoring.alerts.webhookUrl',
        value: process.env.STAGING_WEBHOOK_URL,
        description: 'Staging-specific webhook for alerts'
      }
    ],
    features: {
      enabledByDefault: [
        'monitoring',
        'alerting',
        'performanceProfiling'
      ],
      disabledByDefault: [
        'experimentalFeatures'
      ]
    },
    performance: {
      cacheEnabled: true,
      cacheTTL: 300, // 5 minutes
      compressionEnabled: true,
      rateLimitMultiplier: 1.2
    },
    security: {
      strictMode: true,
      auditingEnabled: true,
      encryptionRequired: false
    }
  },

  production: {
    name: 'production',
    description: 'Production environment with strict limits and maximum safety',
    overrides: [
      {
        path: 'gemini.temperature',
        value: 0.7,
        description: 'More consistent responses in production'
      },
      {
        path: 'gemini.safetySettings.harassment',
        value: 'block_medium_and_above',
        description: 'Stricter safety settings'
      },
      {
        path: 'gemini.safetySettings.hateSpeech',
        value: 'block_medium_and_above',
        description: 'Stricter safety settings'
      },
      {
        path: 'rateLimiting.rpm',
        value: 15,
        description: 'Conservative rate limit'
      },
      {
        path: 'rateLimiting.safetyMargin',
        value: 0.2,
        description: 'Higher safety margin for production'
      },
      {
        path: 'features.monitoring.healthMetrics.retentionDays',
        value: 30,
        description: 'Longer metric retention in production'
      },
      {
        path: 'features.gracefulDegradation.enabled',
        value: true,
        description: 'Enable graceful degradation'
      }
    ],
    features: {
      enabledByDefault: [
        'monitoring',
        'alerting',
        'gracefulDegradation',
        'circuitBreaker',
        'rateLimiting',
        'caching',
        'compression'
      ],
      disabledByDefault: [
        'debugging',
        'verboseLogging',
        'experimentalFeatures',
        'codeExecution'
      ]
    },
    performance: {
      cacheEnabled: true,
      cacheTTL: 600, // 10 minutes
      compressionEnabled: true,
      rateLimitMultiplier: 1.0
    },
    security: {
      strictMode: true,
      auditingEnabled: true,
      encryptionRequired: true
    }
  },

  test: {
    name: 'test',
    description: 'Test environment for automated testing',
    baseProfile: 'development',
    overrides: [
      {
        path: 'rateLimiting.rpm',
        value: 1000,
        description: 'No rate limiting in tests'
      },
      {
        path: 'rateLimiting.daily',
        value: 100000,
        description: 'No daily limit in tests'
      },
      {
        path: 'features.caching.enabled',
        value: false,
        description: 'Disable caching for predictable tests'
      }
    ],
    features: {
      enabledByDefault: [
        'testing',
        'mocking',
        'deterministicResponses'
      ],
      disabledByDefault: [
        'externalServices',
        'rateLimiting',
        'caching'
      ]
    },
    performance: {
      cacheEnabled: false,
      cacheTTL: 0,
      compressionEnabled: false,
      rateLimitMultiplier: 0
    },
    security: {
      strictMode: false,
      auditingEnabled: false,
      encryptionRequired: false
    }
  }
};

// ============================================================================
// ConfigurationProfileManager Implementation
// ============================================================================

export class ConfigurationProfileManager extends EventEmitter implements IService {
  private static instance: ConfigurationProfileManager | null = null;
  private currentProfile: EnvironmentProfile;
  private customProfiles: Map<string, ConfigurationProfile> = new Map();
  private profileOverrides: Map<string, ProfileOverride[]> = new Map();
  private isInitialized: boolean = false;
  private lastError: Error | null = null;
  
  // Service metadata
  private static readonly SERVICE_NAME = 'ConfigurationProfileManager';
  private static readonly SERVICE_VERSION = '1.0.0';

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    super();
    this.currentProfile = this.detectEnvironment();
    this.setMaxListeners(50);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ConfigurationProfileManager {
    if (!ConfigurationProfileManager.instance) {
      ConfigurationProfileManager.instance = new ConfigurationProfileManager();
    }
    return ConfigurationProfileManager.instance;
  }

  // ============================================================================
  // IService Implementation
  // ============================================================================

  public getName(): string {
    return ConfigurationProfileManager.SERVICE_NAME;
  }

  public getVersion(): string {
    return ConfigurationProfileManager.SERVICE_VERSION;
  }

  public getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.isInitialized && !this.lastError,
      name: this.getName(),
      errors: this.lastError ? [this.lastError.message] : [],
      metrics: this.getMetrics()
    };
  }

  public getLastError(): Error | null {
    return this.lastError;
  }

  public getMetrics(): Record<string, unknown> {
    return {
      isInitialized: this.isInitialized,
      currentProfile: this.currentProfile,
      customProfilesCount: this.customProfiles.size,
      activeOverrides: this.profileOverrides.get(this.currentProfile)?.length || 0
    };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the profile manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Detect and set initial profile
      this.currentProfile = this.detectEnvironment();
      
      // Load any custom profiles from configuration
      await this.loadCustomProfiles();
      
      // Apply initial profile
      await this.applyProfile(this.currentProfile);
      
      this.isInitialized = true;
      this.lastError = null;
      
      logger.info(`ConfigurationProfileManager initialized with profile: ${this.currentProfile}`);
      this.emit('initialized', this.currentProfile);
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to initialize ConfigurationProfileManager:', error);
      throw error;
    }
  }

  /**
   * Shutdown the profile manager
   */
  public async shutdown(): Promise<void> {
    this.customProfiles.clear();
    this.profileOverrides.clear();
    this.isInitialized = false;
    
    logger.info('ConfigurationProfileManager shutdown completed');
    this.emit('shutdown');
  }

  // ============================================================================
  // Profile Management
  // ============================================================================

  /**
   * Get current profile
   */
  public getCurrentProfile(): EnvironmentProfile {
    return this.currentProfile;
  }

  /**
   * Get profile configuration
   */
  public getProfile(name: EnvironmentProfile | string): ConfigurationProfile | null {
    // Check default profiles first
    if (name in DEFAULT_PROFILES) {
      return DEFAULT_PROFILES[name as EnvironmentProfile];
    }
    
    // Check custom profiles
    return this.customProfiles.get(name) || null;
  }

  /**
   * Get all available profiles
   */
  public getAvailableProfiles(): string[] {
    return [
      ...Object.keys(DEFAULT_PROFILES),
      ...Array.from(this.customProfiles.keys())
    ];
  }

  /**
   * Switch to a different profile
   */
  public async switchProfile(profileName: EnvironmentProfile | string): Promise<ProfileValidationResult> {
    if (!this.isInitialized) {
      throw new Error('ConfigurationProfileManager not initialized');
    }

    try {
      const profile = this.getProfile(profileName);
      if (!profile) {
        throw new Error(`Profile not found: ${profileName}`);
      }

      const previousProfile = this.currentProfile;
      this.currentProfile = profileName as EnvironmentProfile;
      
      // Apply the new profile
      const result = await this.applyProfile(profileName);
      
      logger.info(`Switched from profile ${previousProfile} to ${profileName}`);
      this.emit('profile:changed', previousProfile, profileName, result);
      
      return result;
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to switch to profile ${profileName}:`, error);
      throw error;
    }
  }

  /**
   * Register a custom profile
   */
  public registerProfile(name: string, profile: ConfigurationProfile): void {
    if (name in DEFAULT_PROFILES) {
      throw new Error(`Cannot override default profile: ${name}`);
    }

    this.customProfiles.set(name, profile);
    logger.info(`Custom profile registered: ${name}`);
    this.emit('profile:registered', name, profile);
  }

  /**
   * Apply profile-specific overrides
   */
  public async applyProfileOverrides(overrides: ProfileOverride[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ConfigurationProfileManager not initialized');
    }

    try {
      // Store overrides for current profile
      const currentOverrides = this.profileOverrides.get(this.currentProfile) || [];
      this.profileOverrides.set(this.currentProfile, [...currentOverrides, ...overrides]);
      
      // Apply overrides
      await this.applyProfile(this.currentProfile);
      
      logger.info(`Applied ${overrides.length} profile overrides`);
      this.emit('overrides:applied', this.currentProfile, overrides);
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to apply profile overrides:', error);
      throw error;
    }
  }

  /**
   * Get effective configuration for current profile
   */
  public getEffectiveConfiguration(): Partial<BotConfiguration> {
    const profile = this.getProfile(this.currentProfile);
    if (!profile) {
      return {};
    }

    // Build effective configuration from profile overrides
    const config: Record<string, unknown> = {};
    
    // Apply base profile overrides if specified
    if (profile.baseProfile) {
      const baseProfile = this.getProfile(profile.baseProfile);
      if (baseProfile) {
        this.applyOverridesToConfig(config, baseProfile.overrides);
      }
    }
    
    // Apply current profile overrides
    this.applyOverridesToConfig(config, profile.overrides);
    
    // Apply any additional overrides for this profile
    const additionalOverrides = this.profileOverrides.get(this.currentProfile);
    if (additionalOverrides) {
      this.applyOverridesToConfig(config, additionalOverrides);
    }
    
    return config as Partial<BotConfiguration>;
  }

  /**
   * Validate profile configuration
   */
  public validateProfile(profileName: string): ProfileValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const profile = this.getProfile(profileName);
    if (!profile) {
      return {
        valid: false,
        errors: [`Profile not found: ${profileName}`],
        appliedOverrides: 0
      };
    }

    // Validate override paths
    for (const override of profile.overrides) {
      if (!this.isValidPath(override.path)) {
        errors.push(`Invalid override path: ${override.path}`);
      }
    }

    // Validate feature lists
    const allFeatures = [...profile.features.enabledByDefault, ...profile.features.disabledByDefault];
    const duplicates = allFeatures.filter((f, i) => allFeatures.indexOf(f) !== i);
    if (duplicates.length > 0) {
      errors.push(`Duplicate features in enabled/disabled lists: ${duplicates.join(', ')}`);
    }

    // Validate performance settings
    if (profile.performance.cacheTTL < 0) {
      errors.push('Cache TTL cannot be negative');
    }
    if (profile.performance.rateLimitMultiplier < 0) {
      errors.push('Rate limit multiplier cannot be negative');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      appliedOverrides: profile.overrides.length
    };
  }

  // ============================================================================
  // Environment Detection
  // ============================================================================

  /**
   * Detect current environment
   */
  private detectEnvironment(): EnvironmentProfile {
    const env = process.env.NODE_ENV?.toLowerCase();
    
    switch (env) {
    case 'production':
    case 'prod':
      return 'production';
    case 'staging':
    case 'stage':
      return 'staging';
    case 'test':
    case 'testing':
      return 'test';
    case 'development':
    case 'dev':
    default:
      return 'development';
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Apply a profile to the configuration
   */
  private async applyProfile(profileName: string): Promise<ProfileValidationResult> {
    const profile = this.getProfile(profileName);
    if (!profile) {
      throw new Error(`Profile not found: ${profileName}`);
    }

    // Validate profile first
    const validation = this.validateProfile(profileName);
    if (!validation.valid) {
      return validation;
    }

    try {
      // Get ConfigurationManager instance
      const configManager = ConfigurationManager.getInstance();
      
      // Apply profile settings through configuration events
      // In a real implementation, this would modify the configuration
      // For now, we emit events that the ConfigurationManager can listen to
      this.emit('profile:applying', profileName, profile);
      
      logger.info(`Applied profile: ${profileName} with ${profile.overrides.length} overrides`);
      
      return {
        valid: true,
        appliedOverrides: profile.overrides.length
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        appliedOverrides: 0
      };
    }
  }

  /**
   * Load custom profiles from configuration
   */
  private async loadCustomProfiles(): Promise<void> {
    // In a real implementation, this would load profiles from a configuration file
    // or database. For now, we just log that we're ready for custom profiles.
    logger.debug('Ready to load custom profiles');
  }

  /**
   * Apply overrides to configuration object
   */
  private applyOverridesToConfig(config: Record<string, unknown>, overrides: ProfileOverride[]): void {
    for (const override of overrides) {
      this.setNestedValue(config, override.path, override.value);
    }
  }

  /**
   * Set a nested value in an object using dot notation
   */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Validate configuration path
   */
  private isValidPath(path: string): boolean {
    // Simple validation - check for valid dot notation
    return /^[a-zA-Z][a-zA-Z0-9_.]*$/.test(path);
  }

  // ============================================================================
  // Feature Flag Integration
  // ============================================================================

  /**
   * Check if a feature is enabled for current profile
   */
  public isFeatureEnabled(featureName: string): boolean {
    const profile = this.getProfile(this.currentProfile);
    if (!profile) {
      return false;
    }

    // Check if explicitly enabled
    if (profile.features.enabledByDefault.includes(featureName)) {
      return true;
    }

    // Check if explicitly disabled
    if (profile.features.disabledByDefault.includes(featureName)) {
      return false;
    }

    // Default to disabled for unknown features in production
    return this.currentProfile !== 'production';
  }

  /**
   * Get all enabled features for current profile
   */
  public getEnabledFeatures(): string[] {
    const profile = this.getProfile(this.currentProfile);
    return profile?.features.enabledByDefault || [];
  }

  /**
   * Get profile-specific performance settings
   */
  public getPerformanceSettings(): ConfigurationProfile['performance'] | null {
    const profile = this.getProfile(this.currentProfile);
    return profile?.performance || null;
  }

  /**
   * Get profile-specific security settings
   */
  public getSecuritySettings(): ConfigurationProfile['security'] | null {
    const profile = this.getProfile(this.currentProfile);
    return profile?.security || null;
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const profileManager = ConfigurationProfileManager.getInstance();