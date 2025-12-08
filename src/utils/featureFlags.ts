/**
 * @file Feature Flags Configuration
 * @description Feature flags for gradual rollout of refactored components
 * @module config/featureFlags
 * 
 * PURPOSE: Enable safe rollback during Phase 1 refactoring
 * REQUIREMENT: Step 2 of Phase 1, Week 1 foundation & safety fixes
 */

/**
 * Feature flags for gradual migration and rollback safety
 * 
 * These flags allow us to:
 * 1. Deploy new implementations alongside old ones
 * 2. Switch between implementations without code changes
 * 3. Roll back quickly if issues are detected
 * 4. Test new implementations in production safely
 */
export const FEATURE_FLAGS = {
  /**
   * Phase 1 - Foundation & Safety Refactoring Flags
   */
  
  // Context Manager refactoring (Step 5 - Week 2)
  USE_REFACTORED_CONTEXT: false,
  ENABLE_CONTEXT_BUILDER_PATTERN: false,
  USE_NEW_MEMORY_MANAGER: false,
  ENABLE_SOCIAL_DYNAMICS_SERVICE: false,
  
  // Base Service refactoring (Step 4 - Week 2) 
  USE_REFACTORED_BASE_SERVICE: false,
  ENABLE_SERVICE_REGISTRY: false,
  USE_NEW_HEALTH_MONITOR: false,
  ENABLE_SERVICE_LIFECYCLE: false,
  
  // Type Safety improvements (Step 3 - Week 1)
  ENABLE_STRICT_TYPES: false,
  USE_TYPE_GUARDS: true, // Safe to enable immediately
  ENABLE_BRANDED_TYPES: false,
  
  /**
   * Phase 2 - Architecture Refactoring Flags
   */
  
  // Dependency Injection (Weeks 3-4)
  ENABLE_DEPENDENCY_INJECTION: false,
  USE_IOC_CONTAINER: false,
  ENABLE_SERVICE_DISCOVERY: false,
  
  // Event-Driven Communication (Weeks 3-4)
  ENABLE_EVENT_BUS: false,
  USE_ASYNC_MESSAGE_HANDLING: false,
  ENABLE_SERVICE_DECOUPLING: false,
  
  // Configuration Management (Weeks 5-6)
  ENABLE_CENTRALIZED_CONFIG: false,
  USE_CONFIG_HOT_RELOAD: false,
  ENABLE_CONFIG_VALIDATION: true, // Safe to enable
  
  /**
   * Phase 3 - Modernization Flags
   */
  
  // TypeScript Modernization (Weeks 7-9)
  ENABLE_ESM_MODULES: false,
  USE_ADVANCED_TS_PATTERNS: false,
  ENABLE_ASYNC_GENERATORS: false,
  
  // Performance Optimizations (Weeks 7-9)
  ENABLE_MEMORY_OPTIMIZATION: false,
  USE_OBJECT_POOLING: false,
  ENABLE_CONNECTION_POOLING: true, // Already proven stable
  
  /**
   * Testing and Quality Flags
   */
  
  // Testing enhancements
  ENABLE_INTEGRATION_TESTS: true,
  USE_CONTRACT_TESTS: false,
  ENABLE_CHAOS_TESTING: false,
  
  // Quality gates
  ENFORCE_COVERAGE_GATES: false,
  ENABLE_PERFORMANCE_REGRESSION_DETECTION: false,
  USE_AUTOMATED_REFACTORING_VALIDATION: false,
  
  /**
   * Development and Debugging Flags
   */
  
  // Development aids
  ENABLE_VERBOSE_LOGGING: false,
  USE_DEBUG_MODE: false,
  ENABLE_PERFORMANCE_PROFILING: false,
  
  // Monitoring and observability
  ENABLE_HEALTH_MONITORING: true, // Already stable
  USE_METRICS_COLLECTION: true, // Already stable
  ENABLE_TRACING: false,
  
  /**
   * Rollback and Safety Flags
   */
  
  // Emergency rollback switches
  DISABLE_ALL_REFACTORED_FEATURES: false, // Master kill switch
  FORCE_LEGACY_IMPLEMENTATIONS: false, // Emergency fallback
  ENABLE_CANARY_DEPLOYMENTS: false, // Gradual rollout
  
  // Validation and testing
  VALIDATE_BEFORE_SWITCHING: true, // Always validate before switching
  ENABLE_FEATURE_FLAG_MONITORING: true, // Monitor flag usage
  LOG_FEATURE_FLAG_USAGE: true, // Log when flags are checked
} as const;

/**
 * Feature flag validation and utilities
 */
export class FeatureFlagManager {
  /**
   * Check if a feature flag is enabled
   * @param flag - The feature flag to check
   * @returns Boolean indicating if the feature is enabled
   */
  static isEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
    const isEnabled = FEATURE_FLAGS[flag];
    
    // Log feature flag usage if enabled
    if (FEATURE_FLAGS.LOG_FEATURE_FLAG_USAGE) {
      console.log(`[FeatureFlag] ${flag}: ${isEnabled}`);
    }
    
    // Check master kill switch
    if (FEATURE_FLAGS.DISABLE_ALL_REFACTORED_FEATURES && flag !== 'DISABLE_ALL_REFACTORED_FEATURES') {
      // Allow essential flags to remain active
      const essentialFlags = [
        'USE_TYPE_GUARDS',
        'ENABLE_CONFIG_VALIDATION',
        'ENABLE_INTEGRATION_TESTS',
        'ENABLE_HEALTH_MONITORING',
        'USE_METRICS_COLLECTION',
        'VALIDATE_BEFORE_SWITCHING',
        'ENABLE_FEATURE_FLAG_MONITORING',
        'LOG_FEATURE_FLAG_USAGE'
      ];
      
      if (!essentialFlags.includes(flag)) {
        return false;
      }
    }
    
    return isEnabled;
  }

  /**
   * Get all currently enabled flags
   * @returns Array of enabled flag names
   */
  static getEnabledFlags(): string[] {
    return Object.entries(FEATURE_FLAGS)
      .filter(([_, enabled]) => enabled)
      .map(([flag, _]) => flag);
  }

  /**
   * Get feature flag status summary
   * @returns Object with flag categories and their status
   */
  static getStatus() {
    const enabledFlags = this.getEnabledFlags();
    
    return {
      totalFlags: Object.keys(FEATURE_FLAGS).length,
      enabledCount: enabledFlags.length,
      enabledFlags,
      phase1Ready: this.isPhase1Ready(),
      phase2Ready: this.isPhase2Ready(),
      phase3Ready: this.isPhase3Ready(),
      emergencyMode: FEATURE_FLAGS.DISABLE_ALL_REFACTORED_FEATURES,
      legacyMode: FEATURE_FLAGS.FORCE_LEGACY_IMPLEMENTATIONS
    };
  }

  /**
   * Check if Phase 1 refactoring flags are ready
   */
  private static isPhase1Ready(): boolean {
    return (
      this.isEnabled('USE_REFACTORED_CONTEXT') &&
      this.isEnabled('USE_REFACTORED_BASE_SERVICE') &&
      this.isEnabled('ENABLE_STRICT_TYPES')
    );
  }

  /**
   * Check if Phase 2 architecture flags are ready
   */
  private static isPhase2Ready(): boolean {
    return (
      this.isEnabled('ENABLE_DEPENDENCY_INJECTION') &&
      this.isEnabled('ENABLE_EVENT_BUS') &&
      this.isEnabled('ENABLE_CENTRALIZED_CONFIG')
    );
  }

  /**
   * Check if Phase 3 modernization flags are ready
   */
  private static isPhase3Ready(): boolean {
    return (
      this.isEnabled('ENABLE_ESM_MODULES') &&
      this.isEnabled('USE_ADVANCED_TS_PATTERNS') &&
      this.isEnabled('ENABLE_MEMORY_OPTIMIZATION')
    );
  }

  /**
   * Validate feature flag configuration
   * @throws Error if configuration is invalid
   */
  static validateConfiguration(): void {
    // Check for conflicting flags
    if (FEATURE_FLAGS.DISABLE_ALL_REFACTORED_FEATURES && FEATURE_FLAGS.FORCE_LEGACY_IMPLEMENTATIONS) {
      throw new Error('Cannot have both DISABLE_ALL_REFACTORED_FEATURES and FORCE_LEGACY_IMPLEMENTATIONS enabled');
    }

    // Warn about unsafe combinations
    if (FEATURE_FLAGS.USE_REFACTORED_BASE_SERVICE && !FEATURE_FLAGS.ENABLE_INTEGRATION_TESTS) {
      console.warn('[FeatureFlag] WARNING: Refactored BaseService enabled without integration tests');
    }

    if (FEATURE_FLAGS.USE_REFACTORED_CONTEXT && !FEATURE_FLAGS.VALIDATE_BEFORE_SWITCHING) {
      console.warn('[FeatureFlag] WARNING: Refactored Context enabled without validation');
    }
  }
}

/**
 * Helper function for conditional implementation selection
 * @param flag - Feature flag to check
 * @param newImplementation - Function to call if flag is enabled
 * @param legacyImplementation - Function to call if flag is disabled
 * @returns Result of the selected implementation
 */
export function withFeatureFlag<T>(
  flag: keyof typeof FEATURE_FLAGS,
  newImplementation: () => T,
  legacyImplementation: () => T
): T {
  try {
    if (FeatureFlagManager.isEnabled(flag)) {
      // Validate before switching if required
      if (FEATURE_FLAGS.VALIDATE_BEFORE_SWITCHING) {
        // Add validation logic here if needed
      }
      
      return newImplementation();
    } else {
      return legacyImplementation();
    }
  } catch (error) {
    // Fall back to legacy implementation on error
    console.error(`[FeatureFlag] Error with ${flag}, falling back to legacy implementation:`, error);
    return legacyImplementation();
  }
}

// Initialize and validate configuration on module load
try {
  FeatureFlagManager.validateConfiguration();
} catch (error) {
  console.error('[FeatureFlag] Configuration validation failed:', error);
  // Could throw here to prevent startup, or log and continue
}

// Export individual flags for direct access
export const {
  USE_REFACTORED_CONTEXT,
  USE_REFACTORED_BASE_SERVICE,
  ENABLE_STRICT_TYPES,
  ENABLE_DEPENDENCY_INJECTION,
  ENABLE_EVENT_BUS,
  ENABLE_CENTRALIZED_CONFIG,
  ENABLE_ESM_MODULES,
  USE_ADVANCED_TS_PATTERNS,
  ENABLE_MEMORY_OPTIMIZATION,
  DISABLE_ALL_REFACTORED_FEATURES,
  FORCE_LEGACY_IMPLEMENTATIONS
} = FEATURE_FLAGS;