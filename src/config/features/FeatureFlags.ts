/**
 * FeatureFlags - Advanced Feature Flag Management
 * 
 * Provides feature flag capabilities with:
 * - Rollout percentages and user targeting
 * - Environment-based feature restrictions
 * - Date-based feature enablement/disabling
 * - User whitelist/blacklist support
 * - Consistent user bucketing for A/B testing
 * - Detailed flag status reporting
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';
import { profileManager } from './ConfigurationProfiles';
import type { IService, ServiceHealthStatus } from '../../services/interfaces/CoreServiceInterfaces';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface FeatureFlagDefinition {
  name: string;
  description: string;
  defaultEnabled: boolean;
  rolloutPercentage: number; // 0-100
  environments: string[]; // Which environments this flag is available in
  startDate?: Date;
  endDate?: Date;
  userWhitelist?: string[];
  userBlacklist?: string[];
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface FeatureFlagStatus {
  name: string;
  enabled: boolean;
  reason: string;
  rolloutGroup?: 'control' | 'treatment';
  metadata?: Record<string, unknown>;
}

export interface FeatureFlagEvaluation {
  userId: string;
  flagName: string;
  enabled: boolean;
  reason: string;
  evaluatedAt: Date;
  environment: string;
  rolloutGroup?: 'control' | 'treatment';
}

export interface ABTestResult {
  flagName: string;
  controlGroup: number;
  treatmentGroup: number;
  conversionRate?: {
    control: number;
    treatment: number;
  };
  statisticalSignificance?: number;
}

export type FeatureFlagEventType = 
  | 'flag:created'
  | 'flag:updated'
  | 'flag:deleted'
  | 'flag:evaluated'
  | 'flag:rollout:changed'
  | 'experiment:started'
  | 'experiment:ended';

// ============================================================================
// Default Feature Flags
// ============================================================================

const DEFAULT_FLAGS: FeatureFlagDefinition[] = [
  {
    name: 'gemini-2.0-flash',
    description: 'Enable Gemini 2.0 Flash model',
    defaultEnabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production']
  },
  {
    name: 'google-search-grounding',
    description: 'Enable Google Search for fact grounding',
    defaultEnabled: false,
    rolloutPercentage: 50,
    environments: ['development', 'staging', 'production'],
    tags: ['experimental', 'ai']
  },
  {
    name: 'code-execution',
    description: 'Enable Python code execution in responses',
    defaultEnabled: false,
    rolloutPercentage: 0,
    environments: ['development'],
    tags: ['experimental', 'security-sensitive']
  },
  {
    name: 'structured-output',
    description: 'Enable JSON structured output mode',
    defaultEnabled: false,
    rolloutPercentage: 25,
    environments: ['development', 'staging'],
    tags: ['experimental', 'ai']
  },
  {
    name: 'thinking-mode',
    description: 'Enable AI thinking mode for complex reasoning',
    defaultEnabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
    tags: ['ai', 'performance']
  },
  {
    name: 'video-processing',
    description: 'Enable video upload and processing',
    defaultEnabled: false,
    rolloutPercentage: 10,
    environments: ['development', 'staging'],
    tags: ['experimental', 'resource-intensive']
  },
  {
    name: 'audio-processing',
    description: 'Enable audio upload and transcription',
    defaultEnabled: false,
    rolloutPercentage: 0,
    environments: ['development'],
    tags: ['experimental', 'resource-intensive']
  },
  {
    name: 'enhanced-roasting',
    description: 'Enable enhanced roasting engine with psychological warfare',
    defaultEnabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
    tags: ['personality']
  },
  {
    name: 'cross-server-memory',
    description: 'Enable memory sharing across Discord servers',
    defaultEnabled: false,
    rolloutPercentage: 0,
    environments: ['development'],
    tags: ['experimental', 'privacy-sensitive']
  },
  {
    name: 'advanced-caching',
    description: 'Enable advanced caching with compression',
    defaultEnabled: true,
    rolloutPercentage: 100,
    environments: ['staging', 'production'],
    tags: ['performance']
  }
];

// ============================================================================
// FeatureFlagManager Implementation
// ============================================================================

export class FeatureFlagManager extends EventEmitter implements IService {
  private static instance: FeatureFlagManager | null = null;
  private flags: Map<string, FeatureFlagDefinition> = new Map();
  private evaluationCache: Map<string, FeatureFlagEvaluation> = new Map();
  private experiments: Map<string, ABTestResult> = new Map();
  private isInitialized: boolean = false;
  private lastError: Error | null = null;
  
  // Configuration
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly BUCKET_COUNT = 100; // For percentage rollouts
  
  // Service metadata
  private static readonly SERVICE_NAME = 'FeatureFlagManager';
  private static readonly SERVICE_VERSION = '1.0.0';

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): FeatureFlagManager {
    if (!FeatureFlagManager.instance) {
      FeatureFlagManager.instance = new FeatureFlagManager();
    }
    return FeatureFlagManager.instance;
  }

  // ============================================================================
  // IService Implementation
  // ============================================================================

  public getName(): string {
    return FeatureFlagManager.SERVICE_NAME;
  }

  public getVersion(): string {
    return FeatureFlagManager.SERVICE_VERSION;
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
    const enabledFlags = Array.from(this.flags.values())
      .filter(flag => this.isEnvironmentAllowed(flag))
      .length;

    return {
      isInitialized: this.isInitialized,
      totalFlags: this.flags.size,
      enabledFlags,
      cachedEvaluations: this.evaluationCache.size,
      activeExperiments: this.experiments.size,
      currentEnvironment: profileManager.getCurrentProfile()
    };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the feature flag manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load default flags
      for (const flag of DEFAULT_FLAGS) {
        this.flags.set(flag.name, flag);
      }

      // Load custom flags from configuration
      await this.loadCustomFlags();

      // Start cache cleanup timer
      this.startCacheCleanup();

      this.isInitialized = true;
      this.lastError = null;
      
      logger.info(`FeatureFlagManager initialized with ${this.flags.size} flags`);
      this.emit('initialized', this.flags.size);
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to initialize FeatureFlagManager:', error);
      throw error;
    }
  }

  /**
   * Shutdown the feature flag manager
   */
  public async shutdown(): Promise<void> {
    this.flags.clear();
    this.evaluationCache.clear();
    this.experiments.clear();
    this.isInitialized = false;
    
    logger.info('FeatureFlagManager shutdown completed');
    this.emit('shutdown');
  }

  // ============================================================================
  // Feature Flag Evaluation
  // ============================================================================

  /**
   * Check if a feature is enabled for a user
   */
  public isEnabled(flagName: string, userId: string): boolean {
    const status = this.getFeatureStatus(flagName, userId);
    return status.enabled;
  }

  /**
   * Get detailed feature status for a user
   */
  public getFeatureStatus(flagName: string, userId: string): FeatureFlagStatus {
    if (!this.isInitialized) {
      return {
        name: flagName,
        enabled: false,
        reason: 'FeatureFlagManager not initialized'
      };
    }

    try {
      // Check cache first
      const cached = this.getCachedEvaluation(flagName, userId);
      if (cached) {
        return {
          name: flagName,
          enabled: cached.enabled,
          reason: cached.reason,
          rolloutGroup: cached.rolloutGroup
        };
      }

      // Get flag definition
      const flag = this.flags.get(flagName);
      if (!flag) {
        return {
          name: flagName,
          enabled: false,
          reason: 'Flag not found'
        };
      }

      // Evaluate the flag
      const evaluation = this.evaluateFlag(flag, userId);
      
      // Cache the result
      this.cacheEvaluation(evaluation);
      
      // Emit evaluation event
      this.emit('flag:evaluated', evaluation);
      
      return {
        name: flagName,
        enabled: evaluation.enabled,
        reason: evaluation.reason,
        rolloutGroup: evaluation.rolloutGroup,
        metadata: flag.metadata
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error evaluating flag ${flagName}:`, error);
      return {
        name: flagName,
        enabled: false,
        reason: `Evaluation error: ${error}`
      };
    }
  }

  /**
   * Get all enabled features for a user
   */
  public getEnabledFeatures(userId: string): string[] {
    const enabled: string[] = [];
    
    for (const flagName of this.flags.keys()) {
      if (this.isEnabled(flagName, userId)) {
        enabled.push(flagName);
      }
    }
    
    return enabled;
  }

  /**
   * Get all feature statuses for a user
   */
  public getAllFeatureStatuses(userId: string): FeatureFlagStatus[] {
    const statuses: FeatureFlagStatus[] = [];
    
    for (const flagName of this.flags.keys()) {
      statuses.push(this.getFeatureStatus(flagName, userId));
    }
    
    return statuses;
  }

  // ============================================================================
  // Flag Management
  // ============================================================================

  /**
   * Create or update a feature flag
   */
  public setFlag(flag: FeatureFlagDefinition): void {
    const existing = this.flags.has(flag.name);
    this.flags.set(flag.name, flag);
    
    // Clear evaluation cache for this flag
    this.clearFlagCache(flag.name);
    
    const eventType = existing ? 'flag:updated' : 'flag:created';
    logger.info(`Feature flag ${eventType}: ${flag.name}`);
    this.emit(eventType, flag);
  }

  /**
   * Delete a feature flag
   */
  public deleteFlag(flagName: string): void {
    const deleted = this.flags.delete(flagName);
    
    if (deleted) {
      this.clearFlagCache(flagName);
      logger.info(`Feature flag deleted: ${flagName}`);
      this.emit('flag:deleted', flagName);
    }
  }

  /**
   * Get flag definition
   */
  public getFlag(flagName: string): FeatureFlagDefinition | null {
    return this.flags.get(flagName) || null;
  }

  /**
   * Get all flags
   */
  public getAllFlags(): FeatureFlagDefinition[] {
    return Array.from(this.flags.values());
  }

  /**
   * Update rollout percentage
   */
  public updateRollout(flagName: string, percentage: number): void {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Rollout percentage must be between 0 and 100');
    }

    const flag = this.flags.get(flagName);
    if (!flag) {
      throw new Error(`Flag not found: ${flagName}`);
    }

    flag.rolloutPercentage = percentage;
    this.clearFlagCache(flagName);
    
    logger.info(`Updated rollout for ${flagName} to ${percentage}%`);
    this.emit('flag:rollout:changed', flagName, percentage);
  }

  // ============================================================================
  // A/B Testing
  // ============================================================================

  /**
   * Start an A/B test experiment
   */
  public startExperiment(flagName: string): void {
    if (!this.flags.has(flagName)) {
      throw new Error(`Flag not found: ${flagName}`);
    }

    this.experiments.set(flagName, {
      flagName,
      controlGroup: 0,
      treatmentGroup: 0
    });

    logger.info(`Started experiment for flag: ${flagName}`);
    this.emit('experiment:started', flagName);
  }

  /**
   * End an A/B test experiment
   */
  public endExperiment(flagName: string): ABTestResult | null {
    const result = this.experiments.get(flagName);
    if (!result) {
      return null;
    }

    this.experiments.delete(flagName);
    
    // Calculate conversion rates if we have the data
    const total = result.controlGroup + result.treatmentGroup;
    if (total > 0) {
      result.conversionRate = {
        control: result.controlGroup / total,
        treatment: result.treatmentGroup / total
      };
    }

    logger.info(`Ended experiment for flag: ${flagName}`);
    this.emit('experiment:ended', flagName, result);
    
    return result;
  }

  /**
   * Record conversion for A/B test
   */
  public recordConversion(flagName: string, userId: string, converted: boolean): void {
    const experiment = this.experiments.get(flagName);
    if (!experiment) {
      return;
    }

    const status = this.getFeatureStatus(flagName, userId);
    if (status.rolloutGroup === 'treatment' && converted) {
      experiment.treatmentGroup++;
    } else if (status.rolloutGroup === 'control' && converted) {
      experiment.controlGroup++;
    }
  }

  /**
   * Get experiment results
   */
  public getExperimentResults(flagName: string): ABTestResult | null {
    return this.experiments.get(flagName) || null;
  }

  // ============================================================================
  // User Targeting
  // ============================================================================

  /**
   * Add user to whitelist
   */
  public addToWhitelist(flagName: string, userId: string): void {
    const flag = this.flags.get(flagName);
    if (!flag) {
      throw new Error(`Flag not found: ${flagName}`);
    }

    if (!flag.userWhitelist) {
      flag.userWhitelist = [];
    }

    if (!flag.userWhitelist.includes(userId)) {
      flag.userWhitelist.push(userId);
      this.clearUserCache(userId);
      logger.info(`Added user ${userId} to whitelist for flag ${flagName}`);
    }
  }

  /**
   * Add user to blacklist
   */
  public addToBlacklist(flagName: string, userId: string): void {
    const flag = this.flags.get(flagName);
    if (!flag) {
      throw new Error(`Flag not found: ${flagName}`);
    }

    if (!flag.userBlacklist) {
      flag.userBlacklist = [];
    }

    if (!flag.userBlacklist.includes(userId)) {
      flag.userBlacklist.push(userId);
      this.clearUserCache(userId);
      logger.info(`Added user ${userId} to blacklist for flag ${flagName}`);
    }
  }

  /**
   * Remove user from whitelist
   */
  public removeFromWhitelist(flagName: string, userId: string): void {
    const flag = this.flags.get(flagName);
    if (!flag || !flag.userWhitelist) {
      return;
    }

    const index = flag.userWhitelist.indexOf(userId);
    if (index > -1) {
      flag.userWhitelist.splice(index, 1);
      this.clearUserCache(userId);
      logger.info(`Removed user ${userId} from whitelist for flag ${flagName}`);
    }
  }

  /**
   * Remove user from blacklist
   */
  public removeFromBlacklist(flagName: string, userId: string): void {
    const flag = this.flags.get(flagName);
    if (!flag || !flag.userBlacklist) {
      return;
    }

    const index = flag.userBlacklist.indexOf(userId);
    if (index > -1) {
      flag.userBlacklist.splice(index, 1);
      this.clearUserCache(userId);
      logger.info(`Removed user ${userId} from blacklist for flag ${flagName}`);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Evaluate a feature flag for a user
   */
  private evaluateFlag(flag: FeatureFlagDefinition, userId: string): FeatureFlagEvaluation {
    const evaluation: FeatureFlagEvaluation = {
      userId,
      flagName: flag.name,
      enabled: false,
      reason: '',
      evaluatedAt: new Date(),
      environment: profileManager.getCurrentProfile()
    };

    // Check environment restrictions
    if (!this.isEnvironmentAllowed(flag)) {
      evaluation.reason = `Not available in environment: ${evaluation.environment}`;
      return evaluation;
    }

    // Check date restrictions
    const now = new Date();
    if (flag.startDate && now < flag.startDate) {
      evaluation.reason = `Not yet active (starts ${flag.startDate.toISOString()})`;
      return evaluation;
    }
    if (flag.endDate && now > flag.endDate) {
      evaluation.reason = `No longer active (ended ${flag.endDate.toISOString()})`;
      return evaluation;
    }

    // Check blacklist
    if (flag.userBlacklist?.includes(userId)) {
      evaluation.reason = 'User is blacklisted';
      return evaluation;
    }

    // Check whitelist
    if (flag.userWhitelist?.includes(userId)) {
      evaluation.enabled = true;
      evaluation.reason = 'User is whitelisted';
      evaluation.rolloutGroup = 'treatment';
      return evaluation;
    }

    // Check default enabled state
    if (!flag.defaultEnabled) {
      evaluation.reason = 'Flag is disabled by default';
      return evaluation;
    }

    // Check rollout percentage
    const bucket = this.getUserBucket(userId, flag.name);
    if (bucket < flag.rolloutPercentage) {
      evaluation.enabled = true;
      evaluation.reason = `In rollout group (${flag.rolloutPercentage}%)`;
      evaluation.rolloutGroup = 'treatment';
    } else {
      evaluation.reason = `Not in rollout group (${flag.rolloutPercentage}%)`;
      evaluation.rolloutGroup = 'control';
    }

    return evaluation;
  }

  /**
   * Get consistent bucket for user
   */
  private getUserBucket(userId: string, flagName: string): number {
    // Create deterministic hash for consistent bucketing
    const hash = crypto
      .createHash('md5')
      .update(`${userId}-${flagName}`)
      .digest();
    
    // Convert first 4 bytes to number and map to 0-99
    const num = hash.readUInt32BE(0);
    return num % FeatureFlagManager.BUCKET_COUNT;
  }

  /**
   * Check if flag is allowed in current environment
   */
  private isEnvironmentAllowed(flag: FeatureFlagDefinition): boolean {
    const currentEnv = profileManager.getCurrentProfile();
    return flag.environments.includes(currentEnv);
  }

  /**
   * Get cached evaluation
   */
  private getCachedEvaluation(flagName: string, userId: string): FeatureFlagEvaluation | null {
    const key = `${userId}-${flagName}`;
    const cached = this.evaluationCache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is expired
    const age = Date.now() - cached.evaluatedAt.getTime();
    if (age > FeatureFlagManager.CACHE_TTL_MS) {
      this.evaluationCache.delete(key);
      return null;
    }
    
    return cached;
  }

  /**
   * Cache evaluation result
   */
  private cacheEvaluation(evaluation: FeatureFlagEvaluation): void {
    const key = `${evaluation.userId}-${evaluation.flagName}`;
    this.evaluationCache.set(key, evaluation);
  }

  /**
   * Clear cache for a specific flag
   */
  private clearFlagCache(flagName: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key, evaluation] of this.evaluationCache) {
      if (evaluation.flagName === flagName) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.evaluationCache.delete(key);
    }
  }

  /**
   * Clear cache for a specific user
   */
  private clearUserCache(userId: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key, evaluation] of this.evaluationCache) {
      if (evaluation.userId === userId) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.evaluationCache.delete(key);
    }
  }

  /**
   * Start cache cleanup timer
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];
      
      for (const [key, evaluation] of this.evaluationCache) {
        const age = now - evaluation.evaluatedAt.getTime();
        if (age > FeatureFlagManager.CACHE_TTL_MS) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        this.evaluationCache.delete(key);
      }
      
      if (keysToDelete.length > 0) {
        logger.debug(`Cleaned up ${keysToDelete.length} expired evaluations`);
      }
    }, FeatureFlagManager.CACHE_TTL_MS);
  }

  /**
   * Load custom flags from configuration
   */
  private async loadCustomFlags(): Promise<void> {
    // In a real implementation, this would load flags from a configuration file,
    // database, or external service. For now, we just log readiness.
    logger.debug('Ready to load custom feature flags');
  }

  // ============================================================================
  // Integration Helpers
  // ============================================================================

  /**
   * Get flag status for ConfigurationManager integration
   */
  public getFlagForConfig(flagName: string, userId: string = 'system'): boolean {
    return this.isEnabled(flagName, userId);
  }

  /**
   * Bulk evaluate flags for a user
   */
  public bulkEvaluate(userId: string, flagNames: string[]): Record<string, boolean> {
    const results: Record<string, boolean> = {};
    
    for (const flagName of flagNames) {
      results[flagName] = this.isEnabled(flagName, userId);
    }
    
    return results;
  }

  /**
   * Export flag configuration
   */
  public exportConfiguration(): Record<string, FeatureFlagDefinition> {
    const config: Record<string, FeatureFlagDefinition> = {};
    
    for (const [name, flag] of this.flags) {
      config[name] = { ...flag };
    }
    
    return config;
  }

  /**
   * Import flag configuration
   */
  public importConfiguration(config: Record<string, FeatureFlagDefinition>): void {
    for (const [name, flag] of Object.entries(config)) {
      this.setFlag(flag);
    }
    
    logger.info(`Imported ${Object.keys(config).length} feature flags`);
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const featureFlagManager = FeatureFlagManager.getInstance();