# Phase 5: Configuration System Enhancement Plan

## Overview
This phase focuses on fixing configuration validation gaps, consolidating configuration management, and implementing advanced configuration features for production readiness.

## Timeline: 3-4 Days
- Day 1: Fix validation gaps and consolidation (Agents 1-2)
- Day 2: Implement advanced features (Agents 3-4)
- Day 3-4: Testing and migration (Agent 5)

## Critical Issues Identified
1. **Missing Validation**: Video configuration variables not in ENV_VAR_SCHEMAS
2. **Configuration Duplication**: Multiple sources of truth for Gemini config
3. **Direct ENV Access**: Bypassing validation in multiple files
4. **No Hot Reload**: Configuration changes require restart
5. **No Secrets Management**: API keys in plain environment variables
6. **Limited Type Safety**: Some configs use raw process.env

## Agent Task Assignments

### Agent 1: Configuration Validation Fixes
**Priority**: CRITICAL
**Target**: 100% configuration validation coverage
**Files**: src/utils/ConfigurationValidator.ts, src/config/*

**Task Details**:

1. **Add Missing Video Configuration Schemas**:
```typescript
// Update src/utils/ConfigurationValidator.ts
const ENV_VAR_SCHEMAS: Record<string, EnvironmentVariableSchema> = {
  // ... existing schemas
  
  // Video Support Configuration
  VIDEO_SUPPORT_ENABLED: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable video processing capabilities',
    category: 'features'
  },
  
  MAX_VIDEO_DURATION_SECONDS: {
    type: 'integer',
    defaultValue: 83,
    minValue: 1,
    maxValue: 300,
    description: 'Maximum video duration for processing (seconds)',
    category: 'limits',
    businessRules: [{
      validate: (value, allVars) => {
        if (allVars.VIDEO_SUPPORT_ENABLED && value > 120) {
          return 'Video duration above 120s requires YOUTUBE_URL_SUPPORT_ENABLED';
        }
        return true;
      }
    }]
  },
  
  VIDEO_TOKEN_WARNING_THRESHOLD: {
    type: 'integer',
    defaultValue: 25000,
    minValue: 1000,
    maxValue: 100000,
    description: 'Token threshold for video processing warnings',
    category: 'limits'
  },
  
  YOUTUBE_URL_SUPPORT_ENABLED: {
    type: 'boolean',
    defaultValue: true,
    description: 'Enable processing of YouTube URLs',
    category: 'features',
    businessRules: [{
      validate: (value, allVars) => {
        if (value && !allVars.VIDEO_SUPPORT_ENABLED) {
          return 'YouTube support requires VIDEO_SUPPORT_ENABLED=true';
        }
        return true;
      }
    }]
  },
  
  VIDEO_FILE_SIZE_LIMIT_MB: {
    type: 'integer',
    defaultValue: 20,
    minValue: 1,
    maxValue: 100,
    description: 'Maximum video file size in MB',
    category: 'limits'
  },
  
  REQUIRE_VIDEO_CONFIRMATION: {
    type: 'boolean',
    defaultValue: false,
    description: 'Require user confirmation before processing videos',
    category: 'features'
  },
  
  // Partial Video Processing
  PARTIAL_VIDEO_PROCESSING_ENABLED: {
    type: 'boolean',
    defaultValue: true,
    description: 'Enable partial video processing for long videos',
    category: 'features'
  },
  
  PARTIAL_VIDEO_MAX_SECONDS: {
    type: 'integer',
    defaultValue: 83,
    minValue: 10,
    maxValue: 300,
    description: 'Maximum seconds to process from long videos',
    category: 'limits'
  },
  
  // Missing Gemini Configuration
  ENABLE_GOOGLE_SEARCH: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable Google Search grounding for responses',
    category: 'features',
    experimental: true
  },
  
  GROUNDING_THRESHOLD: {
    type: 'float',
    defaultValue: 0.7,
    minValue: 0.0,
    maxValue: 1.0,
    description: 'Confidence threshold for search grounding',
    category: 'ai'
  },
  
  ENABLE_CODE_EXECUTION: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable code execution in Gemini responses',
    category: 'features',
    experimental: true
  },
  
  ENABLE_STRUCTURED_OUTPUT: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable JSON/structured output mode',
    category: 'features'
  },
  
  // Thinking Mode Configuration
  THINKING_ENABLED: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable thinking mode for complex queries',
    category: 'features'
  },
  
  THINKING_BUDGET: {
    type: 'integer',
    defaultValue: 20000,
    minValue: 5000,
    maxValue: 50000,
    description: 'Maximum thinking tokens per request',
    category: 'limits'
  },
  
  // Audio Support (Future)
  AUDIO_SUPPORT_ENABLED: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable audio processing (when available)',
    category: 'features',
    experimental: true
  }
};
```

2. **Update Configuration Files to Use Validator**:
```typescript
// Update src/config/videoConfig.ts
import { 
  getConfigValue,
  parseBooleanWithDefault,
  parseIntWithDefault,
  ConfigurationValidator
} from '../utils/ConfigurationValidator';

export interface VideoConfiguration {
  videoSupportEnabled: boolean;
  maxVideoDurationSeconds: number;
  tokenWarningThreshold: number;
  youtubeUrlSupportEnabled: boolean;
  videoFileSizeLimitMB: number;
  requireVideoConfirmation: boolean;
  partialProcessing: {
    enabled: boolean;
    maxSeconds: number;
  };
}

export function getVideoConfiguration(): VideoConfiguration {
  // Use validator for all values
  return {
    videoSupportEnabled: getConfigValue<boolean>('VIDEO_SUPPORT_ENABLED')!,
    maxVideoDurationSeconds: getConfigValue<number>('MAX_VIDEO_DURATION_SECONDS')!,
    tokenWarningThreshold: getConfigValue<number>('VIDEO_TOKEN_WARNING_THRESHOLD')!,
    youtubeUrlSupportEnabled: getConfigValue<boolean>('YOUTUBE_URL_SUPPORT_ENABLED')!,
    videoFileSizeLimitMB: getConfigValue<number>('VIDEO_FILE_SIZE_LIMIT_MB')!,
    requireVideoConfirmation: getConfigValue<boolean>('REQUIRE_VIDEO_CONFIRMATION')!,
    partialProcessing: {
      enabled: getConfigValue<boolean>('PARTIAL_VIDEO_PROCESSING_ENABLED')!,
      maxSeconds: getConfigValue<number>('PARTIAL_VIDEO_MAX_SECONDS')!
    }
  };
}

// Validate on module load
const validator = ConfigurationValidator.getInstance();
validator.validateEnvironment(); // Will throw if invalid
```

3. **Fix Gemini Configuration Duplication**:
```typescript
// Update src/config/geminiConfig.ts
import { 
  getConfigValue,
  getStringWithDefault,
  parseFloatWithDefault,
  parseIntWithDefault
} from '../utils/ConfigurationValidator';

export interface GeminiConfiguration {
  apiKey: string;
  model: string;
  temperature: number;
  topK: number;
  topP: number;
  maxOutputTokens: number;
  features: {
    googleSearchEnabled: boolean;
    groundingThreshold: number;
    codeExecutionEnabled: boolean;
    structuredOutputEnabled: boolean;
    thinkingEnabled: boolean;
    thinkingBudget: number;
  };
  safety: {
    blockThreshold: string;
    categories: string[];
  };
}

export function getGeminiConfiguration(profileName?: string): GeminiConfiguration {
  // Get API key with proper deprecation handling
  const apiKey = getConfigValue<string>('GOOGLE_API_KEY') || 
                 getConfigValue<string>('GEMINI_API_KEY');
  
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY must be set');
  }
  
  // Get profile configuration
  const envProfile = getStringWithDefault('GEMINI_VISION_PROFILE', 'HIGH_ACCURACY_VISION');
  const selectedProfile = profileName || envProfile;
  const profile = GEMINI_CONFIG_PROFILES[selectedProfile] || GEMINI_CONFIG_PROFILES.HIGH_ACCURACY_VISION;
  
  return {
    apiKey,
    model: getStringWithDefault('GEMINI_MODEL', profile.config.model),
    temperature: parseFloatWithDefault('GEMINI_TEMPERATURE', profile.config.temperature, 0.0, 2.0),
    topK: parseIntWithDefault('GEMINI_TOP_K', profile.config.topK, 1, 100),
    topP: parseFloatWithDefault('GEMINI_TOP_P', profile.config.topP, 0.0, 1.0),
    maxOutputTokens: parseIntWithDefault('GEMINI_MAX_OUTPUT_TOKENS', profile.config.maxOutputTokens, 1, 32768),
    features: {
      googleSearchEnabled: getConfigValue<boolean>('ENABLE_GOOGLE_SEARCH')!,
      groundingThreshold: getConfigValue<number>('GROUNDING_THRESHOLD')!,
      codeExecutionEnabled: getConfigValue<boolean>('ENABLE_CODE_EXECUTION')!,
      structuredOutputEnabled: getConfigValue<boolean>('ENABLE_STRUCTURED_OUTPUT')!,
      thinkingEnabled: getConfigValue<boolean>('THINKING_ENABLED')!,
      thinkingBudget: getConfigValue<number>('THINKING_BUDGET')!
    },
    safety: {
      blockThreshold: getStringWithDefault('GEMINI_BLOCK_THRESHOLD', 'BLOCK_MEDIUM_AND_ABOVE'),
      categories: getConfigValue<string[]>('GEMINI_SAFETY_CATEGORIES') || [
        'HARM_CATEGORY_HATE_SPEECH',
        'HARM_CATEGORY_DANGEROUS_CONTENT',
        'HARM_CATEGORY_HARASSMENT',
        'HARM_CATEGORY_SEXUALLY_EXPLICIT'
      ]
    }
  };
}

// Remove createGeminiServiceConfig from ConfigurationFactory
```

**Success Criteria**:
- All environment variables validated
- No direct process.env access
- Business rules enforced
- Type safety guaranteed

### Agent 2: Configuration Consolidation
**Priority**: HIGH
**Target**: Single source of truth for all configuration
**Files**: src/config/ConfigurationManager.ts (new), src/config/*

**Task Details**:

1. **Create Unified Configuration Manager**:
```typescript
// src/config/ConfigurationManager.ts
import { EventEmitter } from 'events';
import { ConfigurationValidator } from '../utils/ConfigurationValidator';
import { logger } from '../utils/logger';
import type { BotConfiguration } from './interfaces';

export interface ConfigurationChangeEvent {
  key: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
}

export class ConfigurationManager extends EventEmitter {
  private static instance: ConfigurationManager;
  private configuration: Map<string, any> = new Map();
  private configCache: Map<string, { value: any; expires: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute
  
  private constructor() {
    super();
    this.initialize();
  }
  
  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }
  
  private initialize(): void {
    // Validate environment
    const validator = ConfigurationValidator.getInstance();
    validator.validateEnvironment();
    
    // Load all configurations
    this.loadConfigurations();
    
    // Set up file watchers for .env files in development
    if (process.env.NODE_ENV === 'development') {
      this.setupFileWatchers();
    }
  }
  
  private loadConfigurations(): void {
    logger.info('Loading configurations...');
    
    // Bot Configuration
    this.configuration.set('bot', {
      token: this.getSecret('DISCORD_TOKEN'),
      clientId: process.env.CLIENT_ID,
      developerMode: process.env.DEVELOPER_MODE === 'true',
      adminUsers: process.env.ADMIN_USERS?.split(',').map(u => u.trim()) || []
    });
    
    // Gemini Configuration
    this.configuration.set('gemini', getGeminiConfiguration());
    
    // Video Configuration
    this.configuration.set('video', getVideoConfiguration());
    
    // Rate Limiting Configuration
    this.configuration.set('rateLimit', {
      rpm: getConfigValue<number>('RATE_LIMIT_RPM'),
      daily: getConfigValue<number>('RATE_LIMIT_DAILY'),
      commandCooldown: getConfigValue<number>('COMMAND_COOLDOWN_SECONDS')
    });
    
    // Cache Configuration
    this.configuration.set('cache', {
      enabled: getConfigValue<boolean>('CACHE_ENABLED'),
      ttl: getConfigValue<number>('CACHE_TTL'),
      maxSize: getConfigValue<number>('CACHE_MAX_SIZE')
    });
    
    // Feature Flags
    this.configuration.set('features', {
      roasting: getConfigValue<boolean>('ENABLE_ROASTING'),
      analytics: getConfigValue<boolean>('ENABLE_ANALYTICS'),
      helpSystem: getConfigValue<boolean>('ENABLE_HELP_SYSTEM'),
      contextMemory: getConfigValue<boolean>('ENABLE_CONTEXT_MEMORY')
    });
    
    logger.info('Configurations loaded successfully');
  }
  
  get<T>(path: string): T {
    // Check cache first
    const cached = this.configCache.get(path);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    
    // Navigate path
    const parts = path.split('.');
    let value: any = this.configuration.get(parts[0]);
    
    for (let i = 1; i < parts.length; i++) {
      if (value && typeof value === 'object') {
        value = value[parts[i]];
      } else {
        return undefined as any;
      }
    }
    
    // Cache the result
    this.configCache.set(path, {
      value,
      expires: Date.now() + this.CACHE_TTL
    });
    
    return value;
  }
  
  set(path: string, value: any): void {
    const parts = path.split('.');
    const oldValue = this.get(path);
    
    if (parts.length === 1) {
      this.configuration.set(parts[0], value);
    } else {
      // Navigate to parent and set value
      let current = this.configuration.get(parts[0]);
      if (!current || typeof current !== 'object') {
        current = {};
        this.configuration.set(parts[0], current);
      }
      
      for (let i = 1; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = value;
    }
    
    // Clear cache
    this.configCache.delete(path);
    
    // Emit change event
    this.emit('configChange', {
      key: path,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    } as ConfigurationChangeEvent);
    
    logger.info('Configuration updated', { path, oldValue, newValue: value });
  }
  
  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of this.configuration) {
      result[key] = value;
    }
    return result;
  }
  
  async reload(): Promise<void> {
    logger.info('Reloading configuration...');
    
    // Clear caches
    this.configCache.clear();
    ConfigurationValidator.getInstance().clearCache();
    
    // Reload configurations
    this.loadConfigurations();
    
    // Emit reload event
    this.emit('reload');
    
    logger.info('Configuration reloaded successfully');
  }
  
  private getSecret(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required secret ${key} not found`);
    }
    return value;
  }
  
  private setupFileWatchers(): void {
    // Watch .env files for changes
    const fs = require('fs');
    const path = require('path');
    
    const envFiles = ['.env', '.env.local', '.env.development'];
    
    envFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        fs.watch(filePath, (eventType: string) => {
          if (eventType === 'change') {
            logger.info(`Configuration file ${file} changed, reloading...`);
            // Debounce reloads
            clearTimeout(this.reloadTimeout);
            this.reloadTimeout = setTimeout(() => {
              this.reload().catch(err => 
                logger.error('Failed to reload configuration', err)
              );
            }, 1000);
          }
        });
      }
    });
  }
  
  private reloadTimeout?: NodeJS.Timeout;
  
  // Health check for configuration
  getHealthStatus(): {
    healthy: boolean;
    missingRequired: string[];
    invalidValues: string[];
  } {
    const validator = ConfigurationValidator.getInstance();
    const validation = validator.validateEnvironment();
    
    return {
      healthy: validation.missing.length === 0 && validation.invalid.length === 0,
      missingRequired: validation.missing,
      invalidValues: validation.invalid.map(i => i.variable)
    };
  }
}

// Export singleton instance
export const configManager = ConfigurationManager.getInstance();
```

2. **Update Services to Use ConfigurationManager**:
```typescript
// Example: Update GeminiService
import { configManager } from '../config/ConfigurationManager';

export class GeminiService {
  private config: GeminiConfiguration;
  
  constructor() {
    this.config = configManager.get<GeminiConfiguration>('gemini');
    
    // Listen for configuration changes
    configManager.on('configChange', (event: ConfigurationChangeEvent) => {
      if (event.key.startsWith('gemini.')) {
        this.handleConfigChange(event);
      }
    });
  }
  
  private handleConfigChange(event: ConfigurationChangeEvent): void {
    logger.info('Gemini configuration changed', {
      key: event.key,
      oldValue: event.oldValue,
      newValue: event.newValue
    });
    
    // Update local config
    this.config = configManager.get<GeminiConfiguration>('gemini');
    
    // Reinitialize if needed
    if (event.key === 'gemini.model') {
      this.reinitializeModel();
    }
  }
}
```

3. **Remove Configuration Factory Duplication**:
```typescript
// Update ConfigurationFactory.ts
import { configManager } from './ConfigurationManager';

export class ConfigurationFactory {
  /**
   * @deprecated Use configManager.get('bot') instead
   */
  static createBotConfiguration(): BotConfiguration {
    console.warn('ConfigurationFactory.createBotConfiguration is deprecated. Use configManager.get("bot") instead');
    return configManager.get<BotConfiguration>('bot');
  }
  
  /**
   * @deprecated Use configManager.get('gemini') instead
   */
  static createGeminiServiceConfig(): any {
    console.warn('ConfigurationFactory.createGeminiServiceConfig is deprecated. Use configManager.get("gemini") instead');
    return configManager.get('gemini');
  }
}
```

**Success Criteria**:
- Single configuration source
- Hot reload capability
- Change notifications
- No duplication

### Agent 3: Advanced Configuration Features
**Priority**: MEDIUM
**Target**: Production-ready configuration system
**Files**: src/config/features/*, src/config/SecretManager.ts

**Task Details**:

1. **Implement Secrets Management**:
```typescript
// src/config/SecretManager.ts
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

export interface SecretStore {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  listSecrets(): Promise<string[]>;
}

export class SecretManager {
  private static instance: SecretManager;
  private secrets = new Map<string, string>();
  private encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';
  
  private constructor(private store?: SecretStore) {
    // Derive encryption key from master secret
    const masterSecret = process.env.MASTER_SECRET || 'default-dev-secret';
    this.encryptionKey = crypto.scryptSync(masterSecret, 'salt', 32);
    
    // Clear sensitive env vars after loading
    this.loadSecretsFromEnv();
  }
  
  static getInstance(store?: SecretStore): SecretManager {
    if (!SecretManager.instance) {
      SecretManager.instance = new SecretManager(store);
    }
    return SecretManager.instance;
  }
  
  private loadSecretsFromEnv(): void {
    const sensitiveKeys = [
      'DISCORD_TOKEN',
      'GOOGLE_API_KEY',
      'GEMINI_API_KEY',
      'DATABASE_PASSWORD',
      'REDIS_PASSWORD'
    ];
    
    for (const key of sensitiveKeys) {
      const value = process.env[key];
      if (value) {
        this.secrets.set(key, this.encrypt(value));
        // Clear from process.env
        delete process.env[key];
      }
    }
    
    logger.info(`Loaded ${this.secrets.size} secrets into secure storage`);
  }
  
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }
  
  private decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  async getSecret(key: string): Promise<string | null> {
    // Check in-memory first
    const encrypted = this.secrets.get(key);
    if (encrypted) {
      return this.decrypt(encrypted);
    }
    
    // Check external store if available
    if (this.store) {
      const value = await this.store.getSecret(key);
      if (value) {
        // Cache in memory
        this.secrets.set(key, this.encrypt(value));
        return value;
      }
    }
    
    return null;
  }
  
  async setSecret(key: string, value: string): Promise<void> {
    // Store encrypted in memory
    this.secrets.set(key, this.encrypt(value));
    
    // Store in external store if available
    if (this.store) {
      await this.store.setSecret(key, value);
    }
  }
  
  async deleteSecret(key: string): Promise<void> {
    this.secrets.delete(key);
    
    if (this.store) {
      await this.store.deleteSecret(key);
    }
  }
  
  async rotateSecret(key: string, newValue: string): Promise<void> {
    const oldValue = await this.getSecret(key);
    
    // Store new value
    await this.setSecret(key, newValue);
    
    // Emit rotation event for services to handle
    process.emit('secretRotated', { key, oldValue, newValue });
    
    logger.info(`Secret rotated: ${key}`);
  }
  
  // Secure comparison to prevent timing attacks
  async compareSecret(key: string, value: string): Promise<boolean> {
    const storedValue = await this.getSecret(key);
    if (!storedValue) return false;
    
    return crypto.timingSafeEqual(
      Buffer.from(storedValue),
      Buffer.from(value)
    );
  }
}

// Integration with ConfigurationManager
export function integrateSecretManager(configManager: ConfigurationManager): void {
  const secretManager = SecretManager.getInstance();
  
  // Override getSecret method
  configManager.getSecret = async (key: string) => {
    const value = await secretManager.getSecret(key);
    if (!value) {
      throw new Error(`Secret ${key} not found`);
    }
    return value;
  };
}
```

2. **Implement Configuration Profiles**:
```typescript
// src/config/features/ConfigurationProfiles.ts
export interface ConfigurationProfile {
  name: string;
  description: string;
  environment: 'development' | 'staging' | 'production';
  overrides: Record<string, any>;
}

export class ConfigurationProfileManager {
  private profiles = new Map<string, ConfigurationProfile>();
  private activeProfile?: string;
  
  constructor(private configManager: ConfigurationManager) {
    this.loadDefaultProfiles();
    this.detectAndActivateProfile();
  }
  
  private loadDefaultProfiles(): void {
    // Development profile
    this.addProfile({
      name: 'development',
      description: 'Development environment with verbose logging',
      environment: 'development',
      overrides: {
        'bot.developerMode': true,
        'gemini.temperature': 0.9,
        'cache.enabled': false,
        'features.analytics': false,
        'logging.level': 'debug'
      }
    });
    
    // Staging profile
    this.addProfile({
      name: 'staging',
      description: 'Staging environment with production-like settings',
      environment: 'staging',
      overrides: {
        'bot.developerMode': false,
        'gemini.temperature': 0.7,
        'cache.enabled': true,
        'features.analytics': true,
        'logging.level': 'info'
      }
    });
    
    // Production profile
    this.addProfile({
      name: 'production',
      description: 'Production environment with optimal settings',
      environment: 'production',
      overrides: {
        'bot.developerMode': false,
        'gemini.temperature': 0.5,
        'cache.enabled': true,
        'features.analytics': true,
        'logging.level': 'warn',
        'rateLimit.rpm': 10,
        'rateLimit.daily': 1000
      }
    });
  }
  
  private detectAndActivateProfile(): void {
    const env = process.env.NODE_ENV || 'development';
    const profileName = process.env.CONFIG_PROFILE || env;
    
    if (this.profiles.has(profileName)) {
      this.activateProfile(profileName);
    } else {
      logger.warn(`Profile ${profileName} not found, using development`);
      this.activateProfile('development');
    }
  }
  
  addProfile(profile: ConfigurationProfile): void {
    this.profiles.set(profile.name, profile);
  }
  
  activateProfile(name: string): void {
    const profile = this.profiles.get(name);
    if (!profile) {
      throw new Error(`Profile ${name} not found`);
    }
    
    logger.info(`Activating configuration profile: ${name}`);
    
    // Apply overrides
    for (const [path, value] of Object.entries(profile.overrides)) {
      this.configManager.set(path, value);
    }
    
    this.activeProfile = name;
    
    // Emit profile change event
    this.configManager.emit('profileChange', {
      oldProfile: this.activeProfile,
      newProfile: name,
      profile
    });
  }
  
  getActiveProfile(): ConfigurationProfile | undefined {
    return this.activeProfile ? this.profiles.get(this.activeProfile) : undefined;
  }
  
  listProfiles(): ConfigurationProfile[] {
    return Array.from(this.profiles.values());
  }
}
```

3. **Implement Feature Flags System**:
```typescript
// src/config/features/FeatureFlags.ts
export interface FeatureFlag {
  key: string;
  description: string;
  defaultValue: boolean;
  environments: Array<'development' | 'staging' | 'production'>;
  rolloutPercentage?: number;
  userWhitelist?: string[];
  userBlacklist?: string[];
  enabledDate?: Date;
  disabledDate?: Date;
  metadata?: Record<string, any>;
}

export class FeatureFlagManager {
  private flags = new Map<string, FeatureFlag>();
  private userHashes = new Map<string, number>();
  
  constructor(private configManager: ConfigurationManager) {
    this.loadFeatureFlags();
  }
  
  private loadFeatureFlags(): void {
    // Define feature flags
    this.registerFlag({
      key: 'gemini.googleSearch',
      description: 'Enable Google Search grounding',
      defaultValue: false,
      environments: ['development', 'staging'],
      rolloutPercentage: 10
    });
    
    this.registerFlag({
      key: 'gemini.codeExecution',
      description: 'Enable code execution in responses',
      defaultValue: false,
      environments: ['development'],
      userWhitelist: process.env.CODE_EXECUTION_WHITELIST?.split(',') || []
    });
    
    this.registerFlag({
      key: 'gemini.structuredOutput',
      description: 'Enable structured JSON output',
      defaultValue: false,
      environments: ['development', 'staging', 'production'],
      rolloutPercentage: 50
    });
    
    this.registerFlag({
      key: 'video.partialProcessing',
      description: 'Enable partial video processing',
      defaultValue: true,
      environments: ['development', 'staging', 'production']
    });
    
    this.registerFlag({
      key: 'advanced.audioSupport',
      description: 'Enable audio processing (experimental)',
      defaultValue: false,
      environments: ['development'],
      enabledDate: new Date('2024-02-01')
    });
  }
  
  registerFlag(flag: FeatureFlag): void {
    this.flags.set(flag.key, flag);
  }
  
  isEnabled(key: string, userId?: string): boolean {
    const flag = this.flags.get(key);
    if (!flag) {
      logger.warn(`Feature flag ${key} not found`);
      return false;
    }
    
    // Check environment
    const currentEnv = process.env.NODE_ENV || 'development';
    if (!flag.environments.includes(currentEnv as any)) {
      return false;
    }
    
    // Check dates
    const now = new Date();
    if (flag.enabledDate && now < flag.enabledDate) {
      return false;
    }
    if (flag.disabledDate && now > flag.disabledDate) {
      return false;
    }
    
    // Check user whitelist/blacklist
    if (userId) {
      if (flag.userBlacklist?.includes(userId)) {
        return false;
      }
      if (flag.userWhitelist?.includes(userId)) {
        return true;
      }
    }
    
    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined && userId) {
      const userHash = this.getUserHash(userId);
      return (userHash % 100) < flag.rolloutPercentage;
    }
    
    // Check configuration override
    const configValue = this.configManager.get<boolean>(`features.${key}`);
    if (configValue !== undefined) {
      return configValue;
    }
    
    return flag.defaultValue;
  }
  
  private getUserHash(userId: string): number {
    if (!this.userHashes.has(userId)) {
      // Simple hash function for consistent user bucketing
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash) + userId.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
      }
      this.userHashes.set(userId, Math.abs(hash));
    }
    return this.userHashes.get(userId)!;
  }
  
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }
  
  getFlagStatus(key: string, userId?: string): {
    enabled: boolean;
    reason: string;
    flag: FeatureFlag | null;
  } {
    const flag = this.flags.get(key);
    if (!flag) {
      return { enabled: false, reason: 'Flag not found', flag: null };
    }
    
    const enabled = this.isEnabled(key, userId);
    let reason = 'Default value';
    
    if (!enabled) {
      const currentEnv = process.env.NODE_ENV || 'development';
      if (!flag.environments.includes(currentEnv as any)) {
        reason = `Not enabled for environment: ${currentEnv}`;
      } else if (userId && flag.userBlacklist?.includes(userId)) {
        reason = 'User is blacklisted';
      } else if (flag.enabledDate && new Date() < flag.enabledDate) {
        reason = `Not enabled until ${flag.enabledDate.toISOString()}`;
      } else if (flag.rolloutPercentage !== undefined && userId) {
        reason = 'User not in rollout percentage';
      }
    } else {
      if (userId && flag.userWhitelist?.includes(userId)) {
        reason = 'User is whitelisted';
      } else if (flag.rolloutPercentage !== undefined && userId) {
        reason = 'User in rollout percentage';
      }
    }
    
    return { enabled, reason, flag };
  }
}
```

**Success Criteria**:
- Secure secrets management
- Configuration profiles working
- Feature flags with rollout
- A/B testing capability

### Agent 4: Configuration Health and Monitoring
**Priority**: MEDIUM
**Target**: Production monitoring and validation
**Files**: src/config/monitoring/*, src/config/health/*

**Task Details**:

1. **Configuration Health Monitoring**:
```typescript
// src/config/monitoring/ConfigurationMonitor.ts
export interface ConfigurationHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: ConfigHealthCheck[];
  timestamp: Date;
  recommendations: string[];
}

export interface ConfigHealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

export class ConfigurationMonitor {
  private checks: Array<() => Promise<ConfigHealthCheck>> = [];
  private monitoringInterval?: NodeJS.Timeout;
  private lastHealth?: ConfigurationHealth;
  
  constructor(
    private configManager: ConfigurationManager,
    private secretManager: SecretManager
  ) {
    this.registerDefaultChecks();
  }
  
  private registerDefaultChecks(): void {
    // API Key validation
    this.addCheck(async () => {
      const apiKey = await this.secretManager.getSecret('GOOGLE_API_KEY');
      if (!apiKey) {
        return {
          name: 'API Key',
          status: 'fail',
          message: 'Google API key not found'
        };
      }
      
      if (apiKey.length < 30) {
        return {
          name: 'API Key',
          status: 'warn',
          message: 'API key seems invalid (too short)'
        };
      }
      
      return {
        name: 'API Key',
        status: 'pass',
        message: 'API key configured'
      };
    });
    
    // Discord Token validation
    this.addCheck(async () => {
      const token = await this.secretManager.getSecret('DISCORD_TOKEN');
      if (!token) {
        return {
          name: 'Discord Token',
          status: 'fail',
          message: 'Discord token not found'
        };
      }
      
      // Basic token format validation
      if (!token.match(/^[A-Za-z0-9._-]+$/)) {
        return {
          name: 'Discord Token',
          status: 'warn',
          message: 'Discord token format seems invalid'
        };
      }
      
      return {
        name: 'Discord Token',
        status: 'pass',
        message: 'Discord token configured'
      };
    });
    
    // Rate limit configuration
    this.addCheck(async () => {
      const rpm = this.configManager.get<number>('rateLimit.rpm');
      const daily = this.configManager.get<number>('rateLimit.daily');
      
      if (!rpm || !daily) {
        return {
          name: 'Rate Limits',
          status: 'fail',
          message: 'Rate limits not configured'
        };
      }
      
      if (rpm > 60 || daily > 10000) {
        return {
          name: 'Rate Limits',
          status: 'warn',
          message: 'Rate limits exceed recommended values',
          details: { rpm, daily, recommended: { rpm: 60, daily: 10000 } }
        };
      }
      
      return {
        name: 'Rate Limits',
        status: 'pass',
        message: 'Rate limits properly configured',
        details: { rpm, daily }
      };
    });
    
    // Feature compatibility
    this.addCheck(async () => {
      const videoEnabled = this.configManager.get<boolean>('video.videoSupportEnabled');
      const youtubeEnabled = this.configManager.get<boolean>('video.youtubeUrlSupportEnabled');
      
      if (youtubeEnabled && !videoEnabled) {
        return {
          name: 'Feature Compatibility',
          status: 'fail',
          message: 'YouTube support requires video support to be enabled'
        };
      }
      
      const searchEnabled = this.configManager.get<boolean>('gemini.features.googleSearchEnabled');
      const model = this.configManager.get<string>('gemini.model');
      
      if (searchEnabled && !model.includes('preview')) {
        return {
          name: 'Feature Compatibility',
          status: 'warn',
          message: 'Google Search may require preview model',
          details: { currentModel: model }
        };
      }
      
      return {
        name: 'Feature Compatibility',
        status: 'pass',
        message: 'All features compatible'
      };
    });
    
    // Memory limits
    this.addCheck(async () => {
      const cacheSize = this.configManager.get<number>('cache.maxSize');
      const contextMemory = this.configManager.get<boolean>('features.contextMemory');
      
      if (contextMemory && (!cacheSize || cacheSize < 100)) {
        return {
          name: 'Memory Configuration',
          status: 'warn',
          message: 'Context memory enabled but cache size is small',
          details: { cacheSize, recommended: 500 }
        };
      }
      
      return {
        name: 'Memory Configuration',
        status: 'pass',
        message: 'Memory limits properly configured'
      };
    });
  }
  
  addCheck(check: () => Promise<ConfigHealthCheck>): void {
    this.checks.push(check);
  }
  
  async runHealthCheck(): Promise<ConfigurationHealth> {
    const checks = await Promise.all(
      this.checks.map(check => 
        check().catch(err => ({
          name: 'Unknown Check',
          status: 'fail' as const,
          message: `Check failed: ${err.message}`
        }))
      )
    );
    
    // Determine overall status
    const failedChecks = checks.filter(c => c.status === 'fail');
    const warnChecks = checks.filter(c => c.status === 'warn');
    
    let status: ConfigurationHealth['status'] = 'healthy';
    if (failedChecks.length > 0) {
      status = 'unhealthy';
    } else if (warnChecks.length > 0) {
      status = 'degraded';
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (failedChecks.length > 0) {
      recommendations.push('Fix critical configuration issues immediately');
      failedChecks.forEach(check => {
        recommendations.push(`- ${check.name}: ${check.message}`);
      });
    }
    
    if (warnChecks.length > 0) {
      recommendations.push('Review configuration warnings');
      warnChecks.forEach(check => {
        recommendations.push(`- ${check.name}: ${check.message}`);
      });
    }
    
    this.lastHealth = {
      status,
      checks,
      timestamp: new Date(),
      recommendations
    };
    
    return this.lastHealth;
  }
  
  startMonitoring(intervalMs: number = 300000): void { // 5 minutes
    this.stopMonitoring();
    
    // Run initial check
    this.runHealthCheck().then(health => {
      logger.info('Configuration health check completed', {
        status: health.status,
        passed: health.checks.filter(c => c.status === 'pass').length,
        warnings: health.checks.filter(c => c.status === 'warn').length,
        failed: health.checks.filter(c => c.status === 'fail').length
      });
    });
    
    this.monitoringInterval = setInterval(async () => {
      const health = await this.runHealthCheck();
      
      // Alert on status change
      if (this.lastHealth && health.status !== this.lastHealth.status) {
        logger.warn('Configuration health status changed', {
          from: this.lastHealth.status,
          to: health.status
        });
        
        // Emit health change event
        this.configManager.emit('healthChange', health);
      }
    }, intervalMs);
  }
  
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }
  
  getLastHealth(): ConfigurationHealth | undefined {
    return this.lastHealth;
  }
}
```

2. **Configuration Audit Logging**:
```typescript
// src/config/monitoring/ConfigurationAudit.ts
export interface ConfigurationAuditEntry {
  timestamp: Date;
  action: 'set' | 'delete' | 'reload' | 'profile_change';
  path?: string;
  oldValue?: any;
  newValue?: any;
  userId?: string;
  source: 'env' | 'api' | 'file' | 'runtime';
  metadata?: Record<string, any>;
}

export class ConfigurationAuditor {
  private auditLog: ConfigurationAuditEntry[] = [];
  private readonly MAX_ENTRIES = 1000;
  
  constructor(private configManager: ConfigurationManager) {
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    // Listen to configuration changes
    this.configManager.on('configChange', (event: ConfigurationChangeEvent) => {
      this.addEntry({
        timestamp: new Date(event.timestamp),
        action: 'set',
        path: event.key,
        oldValue: event.oldValue,
        newValue: event.newValue,
        source: 'runtime'
      });
    });
    
    // Listen to reloads
    this.configManager.on('reload', () => {
      this.addEntry({
        timestamp: new Date(),
        action: 'reload',
        source: 'runtime'
      });
    });
    
    // Listen to profile changes
    this.configManager.on('profileChange', (event: any) => {
      this.addEntry({
        timestamp: new Date(),
        action: 'profile_change',
        oldValue: event.oldProfile,
        newValue: event.newProfile,
        source: 'runtime',
        metadata: { profile: event.profile }
      });
    });
  }
  
  addEntry(entry: ConfigurationAuditEntry): void {
    this.auditLog.push(entry);
    
    // Trim old entries
    if (this.auditLog.length > this.MAX_ENTRIES) {
      this.auditLog = this.auditLog.slice(-this.MAX_ENTRIES);
    }
    
    // Log significant changes
    if (entry.action === 'set' && this.isSignificantChange(entry.path!)) {
      logger.info('Significant configuration change', {
        path: entry.path,
        oldValue: entry.oldValue,
        newValue: entry.newValue
      });
    }
  }
  
  private isSignificantChange(path: string): boolean {
    const significantPaths = [
      'gemini.model',
      'gemini.features',
      'rateLimit',
      'features',
      'bot.developerMode'
    ];
    
    return significantPaths.some(p => path.startsWith(p));
  }
  
  getAuditLog(
    filter?: {
      startDate?: Date;
      endDate?: Date;
      action?: ConfigurationAuditEntry['action'];
      path?: string;
    }
  ): ConfigurationAuditEntry[] {
    let entries = [...this.auditLog];
    
    if (filter) {
      if (filter.startDate) {
        entries = entries.filter(e => e.timestamp >= filter.startDate!);
      }
      if (filter.endDate) {
        entries = entries.filter(e => e.timestamp <= filter.endDate!);
      }
      if (filter.action) {
        entries = entries.filter(e => e.action === filter.action);
      }
      if (filter.path) {
        entries = entries.filter(e => e.path?.startsWith(filter.path!));
      }
    }
    
    return entries;
  }
  
  generateAuditReport(): {
    totalChanges: number;
    changesByAction: Record<string, number>;
    mostChangedPaths: Array<{ path: string; count: number }>;
    recentChanges: ConfigurationAuditEntry[];
  } {
    const changesByAction: Record<string, number> = {};
    const pathCounts = new Map<string, number>();
    
    for (const entry of this.auditLog) {
      // Count by action
      changesByAction[entry.action] = (changesByAction[entry.action] || 0) + 1;
      
      // Count by path
      if (entry.path) {
        pathCounts.set(entry.path, (pathCounts.get(entry.path) || 0) + 1);
      }
    }
    
    // Get most changed paths
    const mostChangedPaths = Array.from(pathCounts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      totalChanges: this.auditLog.length,
      changesByAction,
      mostChangedPaths,
      recentChanges: this.auditLog.slice(-20)
    };
  }
}
```

**Success Criteria**:
- Health monitoring active
- Audit trail complete
- Alerts on issues
- Compliance ready

### Agent 5: Migration and Testing
**Priority**: HIGH
**Target**: Smooth migration to new configuration system
**Files**: scripts/migrate-config.ts, tests/config/*

**Task Details**:

1. **Configuration Migration Script**:
```typescript
// scripts/migrate-config.ts
import { ConfigurationManager } from '../src/config/ConfigurationManager';
import { ConfigurationValidator } from '../src/utils/ConfigurationValidator';
import { SecretManager } from '../src/config/SecretManager';
import * as fs from 'fs/promises';
import * as path from 'path';

interface MigrationResult {
  success: boolean;
  migratedKeys: string[];
  errors: Array<{ key: string; error: string }>;
  warnings: Array<{ key: string; message: string }>;
}

export class ConfigurationMigrator {
  private validator = ConfigurationValidator.getInstance();
  private configManager = ConfigurationManager.getInstance();
  private secretManager = SecretManager.getInstance();
  
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migratedKeys: [],
      errors: [],
      warnings: []
    };
    
    console.log('Starting configuration migration...');
    
    // Step 1: Validate current environment
    const validation = this.validator.validateEnvironment();
    if (validation.missing.length > 0) {
      console.error('Missing required variables:', validation.missing);
      result.success = false;
      validation.missing.forEach(key => {
        result.errors.push({ key, error: 'Required variable missing' });
      });
    }
    
    // Step 2: Migrate secrets
    console.log('Migrating secrets...');
    await this.migrateSecrets(result);
    
    // Step 3: Create configuration backup
    console.log('Creating configuration backup...');
    await this.createBackup();
    
    // Step 4: Migrate deprecated variables
    console.log('Migrating deprecated variables...');
    await this.migrateDeprecated(result);
    
    // Step 5: Apply new defaults
    console.log('Applying new configuration defaults...');
    await this.applyNewDefaults(result);
    
    // Step 6: Validate final configuration
    console.log('Validating final configuration...');
    const finalValidation = await this.validateFinalConfig();
    if (!finalValidation.valid) {
      result.success = false;
      result.errors.push(...finalValidation.errors);
    }
    
    // Step 7: Generate migration report
    await this.generateReport(result);
    
    return result;
  }
  
  private async migrateSecrets(result: MigrationResult): Promise<void> {
    const secrets = [
      { old: 'GEMINI_API_KEY', new: 'GOOGLE_API_KEY' },
      { old: 'BOT_TOKEN', new: 'DISCORD_TOKEN' }
    ];
    
    for (const { old, new: newKey } of secrets) {
      const value = process.env[old];
      if (value && !process.env[newKey]) {
        await this.secretManager.setSecret(newKey, value);
        result.migratedKeys.push(`${old} -> ${newKey}`);
        result.warnings.push({
          key: old,
          message: `Deprecated key migrated to ${newKey}`
        });
      }
    }
  }
  
  private async createBackup(): Promise<void> {
    const backupDir = path.join(process.cwd(), 'config-backup');
    await fs.mkdir(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `config-${timestamp}.json`);
    
    const currentConfig = this.configManager.getAll();
    await fs.writeFile(
      backupFile,
      JSON.stringify(currentConfig, null, 2)
    );
    
    console.log(`Configuration backed up to: ${backupFile}`);
  }
  
  private async migrateDeprecated(result: MigrationResult): Promise<void> {
    const deprecatedMappings = {
      'ENABLE_MEMORY': 'ENABLE_CONTEXT_MEMORY',
      'MAX_CONTEXT_LENGTH': 'CONTEXT_MAX_LENGTH',
      'GEMINI_SAFETY': 'GEMINI_BLOCK_THRESHOLD'
    };
    
    for (const [old, newKey] of Object.entries(deprecatedMappings)) {
      const value = process.env[old];
      if (value && !process.env[newKey]) {
        process.env[newKey] = value;
        result.migratedKeys.push(`${old} -> ${newKey}`);
      }
    }
  }
  
  private async applyNewDefaults(result: MigrationResult): Promise<void> {
    const newDefaults = {
      'ENABLE_GOOGLE_SEARCH': 'false',
      'ENABLE_CODE_EXECUTION': 'false',
      'ENABLE_STRUCTURED_OUTPUT': 'false',
      'VIDEO_SUPPORT_ENABLED': 'true',
      'THINKING_ENABLED': 'false'
    };
    
    for (const [key, defaultValue] of Object.entries(newDefaults)) {
      if (process.env[key] === undefined) {
        process.env[key] = defaultValue;
        result.migratedKeys.push(`${key} (new default: ${defaultValue})`);
      }
    }
  }
  
  private async validateFinalConfig(): Promise<{
    valid: boolean;
    errors: Array<{ key: string; error: string }>;
  }> {
    const errors: Array<{ key: string; error: string }> = [];
    
    // Check critical configurations
    const critical = [
      'DISCORD_TOKEN',
      'GOOGLE_API_KEY',
      'CLIENT_ID'
    ];
    
    for (const key of critical) {
      const value = await this.secretManager.getSecret(key) || process.env[key];
      if (!value) {
        errors.push({ key, error: 'Critical configuration missing' });
      }
    }
    
    // Validate configuration consistency
    const config = this.configManager.getAll();
    if (config.video?.youtubeUrlSupportEnabled && !config.video?.videoSupportEnabled) {
      errors.push({
        key: 'video.youtubeUrlSupportEnabled',
        error: 'YouTube support requires video support enabled'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  private async generateReport(result: MigrationResult): Promise<void> {
    const reportPath = path.join(process.cwd(), 'config-migration-report.json');
    
    const report = {
      timestamp: new Date().toISOString(),
      ...result,
      recommendations: this.generateRecommendations(result)
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\nMigration Report:');
    console.log(`- Success: ${result.success}`);
    console.log(`- Migrated Keys: ${result.migratedKeys.length}`);
    console.log(`- Errors: ${result.errors.length}`);
    console.log(`- Warnings: ${result.warnings.length}`);
    console.log(`\nFull report saved to: ${reportPath}`);
  }
  
  private generateRecommendations(result: MigrationResult): string[] {
    const recommendations: string[] = [];
    
    if (result.warnings.some(w => w.key.includes('API_KEY'))) {
      recommendations.push('Update your deployment scripts to use GOOGLE_API_KEY instead of GEMINI_API_KEY');
    }
    
    if (!process.env.MASTER_SECRET) {
      recommendations.push('Set MASTER_SECRET for production secret encryption');
    }
    
    if (process.env.NODE_ENV === 'production' && !process.env.CONFIG_PROFILE) {
      recommendations.push('Set CONFIG_PROFILE=production for optimal production settings');
    }
    
    return recommendations;
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new ConfigurationMigrator();
  migrator.migrate()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
```

2. **Configuration System Tests**:
```typescript
// tests/config/ConfigurationSystem.test.ts
describe('Configuration System', () => {
  let configManager: ConfigurationManager;
  let secretManager: SecretManager;
  let monitor: ConfigurationMonitor;
  
  beforeEach(() => {
    // Reset singletons
    ConfigurationManager['instance'] = undefined;
    SecretManager['instance'] = undefined;
    
    configManager = ConfigurationManager.getInstance();
    secretManager = SecretManager.getInstance();
    monitor = new ConfigurationMonitor(configManager, secretManager);
  });
  
  describe('Configuration Validation', () => {
    test('validates all required variables', () => {
      const validator = ConfigurationValidator.getInstance();
      const result = validator.validateEnvironment();
      
      expect(result.missing).toEqual([]);
      expect(result.invalid).toEqual([]);
    });
    
    test('enforces business rules', () => {
      process.env.YOUTUBE_URL_SUPPORT_ENABLED = 'true';
      process.env.VIDEO_SUPPORT_ENABLED = 'false';
      
      const validator = ConfigurationValidator.getInstance();
      const result = validator.validateEnvironment();
      
      expect(result.invalid).toContainEqual(
        expect.objectContaining({
          variable: 'YOUTUBE_URL_SUPPORT_ENABLED',
          reason: expect.stringContaining('requires VIDEO_SUPPORT_ENABLED')
        })
      );
    });
  });
  
  describe('Configuration Manager', () => {
    test('provides type-safe configuration access', () => {
      const geminiConfig = configManager.get<GeminiConfiguration>('gemini');
      
      expect(geminiConfig).toHaveProperty('model');
      expect(geminiConfig).toHaveProperty('temperature');
      expect(typeof geminiConfig.temperature).toBe('number');
    });
    
    test('supports nested path access', () => {
      const searchEnabled = configManager.get<boolean>('gemini.features.googleSearchEnabled');
      expect(typeof searchEnabled).toBe('boolean');
    });
    
    test('emits change events', (done) => {
      configManager.on('configChange', (event: ConfigurationChangeEvent) => {
        expect(event.key).toBe('test.value');
        expect(event.oldValue).toBeUndefined();
        expect(event.newValue).toBe('test');
        done();
      });
      
      configManager.set('test.value', 'test');
    });
  });
  
  describe('Secret Management', () => {
    test('encrypts and decrypts secrets', async () => {
      const secretKey = 'TEST_SECRET';
      const secretValue = 'super-secret-value';
      
      await secretManager.setSecret(secretKey, secretValue);
      const retrieved = await secretManager.getSecret(secretKey);
      
      expect(retrieved).toBe(secretValue);
    });
    
    test('provides timing-safe comparison', async () => {
      const key = 'COMPARISON_TEST';
      const value = 'test-value';
      
      await secretManager.setSecret(key, value);
      
      const match = await secretManager.compareSecret(key, value);
      const noMatch = await secretManager.compareSecret(key, 'wrong-value');
      
      expect(match).toBe(true);
      expect(noMatch).toBe(false);
    });
  });
  
  describe('Feature Flags', () => {
    test('respects environment restrictions', () => {
      const flagManager = new FeatureFlagManager(configManager);
      
      process.env.NODE_ENV = 'production';
      const devOnlyFlag = flagManager.isEnabled('gemini.codeExecution');
      expect(devOnlyFlag).toBe(false);
      
      process.env.NODE_ENV = 'development';
      const devFlag = flagManager.isEnabled('gemini.codeExecution');
      expect(devFlag).toBe(false); // Default is false
    });
    
    test('handles rollout percentages consistently', () => {
      const flagManager = new FeatureFlagManager(configManager);
      const userId = 'test-user-123';
      
      // Same user should always get same result
      const result1 = flagManager.isEnabled('gemini.structuredOutput', userId);
      const result2 = flagManager.isEnabled('gemini.structuredOutput', userId);
      
      expect(result1).toBe(result2);
    });
  });
  
  describe('Configuration Health', () => {
    test('detects missing secrets', async () => {
      // Remove a required secret
      await secretManager.deleteSecret('GOOGLE_API_KEY');
      
      const health = await monitor.runHealthCheck();
      
      expect(health.status).toBe('unhealthy');
      expect(health.checks).toContainEqual(
        expect.objectContaining({
          name: 'API Key',
          status: 'fail'
        })
      );
    });
    
    test('warns on suboptimal configurations', async () => {
      configManager.set('rateLimit.rpm', 100); // Too high
      
      const health = await monitor.runHealthCheck();
      
      expect(health.checks).toContainEqual(
        expect.objectContaining({
          name: 'Rate Limits',
          status: 'warn'
        })
      );
    });
  });
  
  describe('Configuration Profiles', () => {
    test('applies profile overrides', () => {
      const profileManager = new ConfigurationProfileManager(configManager);
      
      profileManager.activateProfile('production');
      
      expect(configManager.get('bot.developerMode')).toBe(false);
      expect(configManager.get('gemini.temperature')).toBe(0.5);
      expect(configManager.get('logging.level')).toBe('warn');
    });
  });
  
  describe('Audit Logging', () => {
    test('tracks configuration changes', () => {
      const auditor = new ConfigurationAuditor(configManager);
      
      configManager.set('test.audit', 'value1');
      configManager.set('test.audit', 'value2');
      
      const log = auditor.getAuditLog({ path: 'test.audit' });
      
      expect(log).toHaveLength(2);
      expect(log[0].oldValue).toBeUndefined();
      expect(log[0].newValue).toBe('value1');
      expect(log[1].oldValue).toBe('value1');
      expect(log[1].newValue).toBe('value2');
    });
  });
});
```

3. **Integration Test Suite**:
```typescript
// tests/integration/ConfigurationIntegration.test.ts
describe('Configuration System Integration', () => {
  test('full configuration lifecycle', async () => {
    // Initialize system
    const configManager = ConfigurationManager.getInstance();
    const secretManager = SecretManager.getInstance();
    const monitor = new ConfigurationMonitor(configManager, secretManager);
    const profileManager = new ConfigurationProfileManager(configManager);
    const flagManager = new FeatureFlagManager(configManager);
    const auditor = new ConfigurationAuditor(configManager);
    
    // Start monitoring
    monitor.startMonitoring(1000);
    
    // Simulate configuration changes
    profileManager.activateProfile('development');
    
    // Check feature flags
    const searchEnabled = flagManager.isEnabled('gemini.googleSearch', 'test-user');
    expect(typeof searchEnabled).toBe('boolean');
    
    // Verify health
    const health = await monitor.runHealthCheck();
    expect(health.status).not.toBe('unhealthy');
    
    // Check audit trail
    const audit = auditor.generateAuditReport();
    expect(audit.totalChanges).toBeGreaterThan(0);
    
    // Hot reload
    await configManager.reload();
    
    // Verify configuration persisted
    const profile = profileManager.getActiveProfile();
    expect(profile?.name).toBe('development');
    
    // Cleanup
    monitor.stopMonitoring();
  });
  
  test('handles configuration errors gracefully', async () => {
    const configManager = ConfigurationManager.getInstance();
    
    // Try to get non-existent config
    const missing = configManager.get('non.existent.path');
    expect(missing).toBeUndefined();
    
    // Set invalid configuration
    expect(() => {
      configManager.set('rateLimit.rpm', -1);
    }).toThrow();
  });
});
```

**Success Criteria**:
- Migration script works
- All tests passing
- No breaking changes
- Smooth deployment

## Coordination and Rollout

### Implementation Order
1. Agent 1: Fix validation gaps (Day 1)
2. Agent 2: Consolidate configuration (Day 1)
3. Agents 3-4: Advanced features (Day 2)
4. Agent 5: Migration and testing (Day 3-4)

### Rollout Strategy
1. Run migration script in development
2. Test all services with new system
3. Deploy to staging with monitoring
4. Production deployment with rollback plan

### Success Metrics
- **Validation Coverage**: 100% of env vars
- **Configuration Errors**: Zero in production
- **Hot Reload Success**: < 1s reload time
- **Audit Compliance**: Full trail available
- **Migration Success**: Zero data loss