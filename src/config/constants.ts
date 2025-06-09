/**
 * Application-wide constants organized by domain
 * All magic numbers should be defined here for better maintainability
 */

// ============= TIME CONSTANTS =============
/**
 * Time-related constants in milliseconds
 */
export const TIME_CONSTANTS = {
  /** One second in milliseconds */
  ONE_SECOND_MS: 1000,
  /** One minute in milliseconds (60 seconds) */
  ONE_MINUTE_MS: 60 * 1000,
  /** Five minutes in milliseconds */
  FIVE_MINUTES_MS: 5 * 60 * 1000,
  /** Thirty minutes in milliseconds */
  THIRTY_MINUTES_MS: 30 * 60 * 1000,
  /** One hour in milliseconds */
  ONE_HOUR_MS: 60 * 60 * 1000,
  /** Ninety minutes in milliseconds */
  NINETY_MINUTES_MS: 90 * 60 * 1000,
} as const;

// ============= ROASTING ENGINE CONSTANTS =============
/**
 * Constants for the roasting engine behavior and calculations
 */
export const ROASTING_CONSTANTS = {
  /** Default base roasting chance */
  DEFAULT_BASE_CHANCE: 0.5,
  /** Minimum base roasting chance (20%) */
  MIN_BASE_CHANCE: 0.2,
  /** Maximum base roasting chance (70%) */
  MAX_BASE_CHANCE: 0.7,
  /** Default maximum roasting chance (90%) */
  DEFAULT_MAX_CHANCE: 0.9,
  
  // Mood durations
  /** Minimum mood duration in minutes */
  MIN_MOOD_DURATION_MINUTES: 30,
  /** Maximum mood duration in minutes */
  MAX_MOOD_DURATION_MINUTES: 120,
  
  // Chaos mode
  /** Chance to trigger chaos mode (5%) */
  CHAOS_MODE_TRIGGER_CHANCE: 0.05,
  /** Minimum chaos mode duration in minutes */
  MIN_CHAOS_DURATION_MINUTES: 5,
  /** Maximum chaos mode duration in minutes */
  MAX_CHAOS_DURATION_MINUTES: 30,
  /** Minimum chaos mode multiplier */
  MIN_CHAOS_MULTIPLIER: 0.5,
  /** Maximum chaos mode multiplier */
  MAX_CHAOS_MULTIPLIER: 2.5,
  /** Chaos override chance (30%) */
  CHAOS_OVERRIDE_CHANCE: 0.3,
  /** Chaos decision roast chance (70%) */
  CHAOS_DECISION_ROAST_CHANCE: 0.7,
  
  // Complexity modifiers
  /** Maximum message length modifier (30%) */
  MAX_LENGTH_MODIFIER: 0.3,
  /** Message length divisor for complexity calculation */
  MESSAGE_LENGTH_DIVISOR: 100,
  /** Code presence bonus (20%) */
  CODE_PRESENCE_BONUS: 0.2,
  /** Programming keyword bonus (15%) */
  PROGRAMMING_KEYWORD_BONUS: 0.15,
  /** Technical keyword bonus (10%) */
  TECHNICAL_KEYWORD_BONUS: 0.1,
  /** Question mark bonus (5%) */
  QUESTION_MARK_BONUS: 0.05,
  /** Multiple questions bonus (10%) */
  MULTIPLE_QUESTIONS_BONUS: 0.1,
  /** Maximum complexity bonus (50%) */
  MAX_COMPLEXITY_BONUS: 0.5,
  
  // Time-based modifiers
  /** Night owl bonus (11PM-3AM) (30%) */
  NIGHT_OWL_BONUS: 0.3,
  /** Early bird penalty (5AM-8AM) (-10%) */
  EARLY_BIRD_PENALTY: -0.1,
  /** Peak hours bonus (7PM-11PM) (20%) */
  PEAK_HOURS_BONUS: 0.2,
  /** Afternoon bonus (1PM-5PM) (10%) */
  AFTERNOON_BONUS: 0.1,
  
  // Mood modifiers
  /** Sleepy mood base modifier (-20%) */
  SLEEPY_BASE_MODIFIER: -0.2,
  /** Sleepy mood escalation per question (5%) */
  SLEEPY_ESCALATION: 0.05,
  /** Caffeinated mood base modifier (10%) */
  CAFFEINATED_BASE_MODIFIER: 0.1,
  /** Caffeinated mood escalation per question (10%) */
  CAFFEINATED_ESCALATION: 0.1,
  /** Reverse psychology threshold question count */
  REVERSE_PSYCHOLOGY_THRESHOLD: 3,
  /** Reverse psychology high count penalty (-40%) */
  REVERSE_PSYCHOLOGY_PENALTY: -0.4,
  /** Reverse psychology low count bonus (20%) */
  REVERSE_PSYCHOLOGY_BONUS: 0.2,
  /** Bloodthirsty mood base modifier (20%) */
  BLOODTHIRSTY_BASE_MODIFIER: 0.2,
  /** Bloodthirsty mood escalation per question (15%) */
  BLOODTHIRSTY_ESCALATION: 0.15,
  /** Chaotic mood random range (±30%) */
  CHAOTIC_RANDOM_RANGE: 0.6,
  /** Chaotic mood random offset (30%) */
  CHAOTIC_RANDOM_OFFSET: 0.3,
  
  // Consecutive bonuses
  /** Early questions multiplier (10% per question) */
  EARLY_QUESTIONS_MULTIPLIER: 0.1,
  /** Mid streak multiplier (25% per question) */
  MID_STREAK_MULTIPLIER: 0.25,
  /** Late streak multiplier (35% per question) */
  LATE_STREAK_MULTIPLIER: 0.35,
  /** Early questions threshold */
  EARLY_QUESTIONS_THRESHOLD: 2,
  /** Mid streak threshold */
  MID_STREAK_THRESHOLD: 5,
  /** Bonus bomb chance for high streaks (10%) */
  BONUS_BOMB_CHANCE: 0.1,
  /** Maximum bonus bomb value (50%) */
  MAX_BONUS_BOMB: 0.5,
  /** Mid streak variance (10%) */
  MID_STREAK_VARIANCE: 0.1,
  /** Late streak variance (15%) */
  LATE_STREAK_VARIANCE: 0.15,
  
  // Roast debt
  /** Debt growth rate per check */
  DEBT_GROWTH_RATE: 0.05,
  /** Significant debt threshold */
  SIGNIFICANT_DEBT_THRESHOLD: 1.0,
  /** Maximum debt bonus (70%) */
  MAX_DEBT_BONUS: 0.7,
  /** Debt bonus multiplier (30%) */
  DEBT_BONUS_MULTIPLIER: 0.3,
  /** Small debt bonus multiplier (10%) */
  SMALL_DEBT_MULTIPLIER: 0.1,
  /** Debt increment on roast */
  DEBT_INCREMENT: 0.1,
  
  // Server influence
  /** Hot server recent threshold */
  HOT_SERVER_RECENT_THRESHOLD: 2,
  /** Hot server time window (1 hour) */
  HOT_SERVER_TIME_HOURS: 1,
  /** Hot server bonus (20%) */
  HOT_SERVER_BONUS: 0.2,
  /** Cold server time threshold (6 hours) */
  COLD_SERVER_TIME_HOURS: 6,
  /** Cold server bonus multiplier (2% per hour) */
  COLD_SERVER_BONUS_PER_HOUR: 0.02,
  /** Maximum cold server bonus (30%) */
  MAX_COLD_SERVER_BONUS: 0.3,
  
  // Mercy and cooldown
  /** Mercy kill question threshold */
  MERCY_KILL_THRESHOLD: 6,
  /** Mercy kill chance (20%) */
  MERCY_KILL_CHANCE: 0.2,
  /** Cooldown break chance (15%) */
  COOLDOWN_BREAK_CHANCE: 0.15,
  
  // Cache limits
  /** Maximum complexity cache size */
  MAX_COMPLEXITY_CACHE_SIZE: 100,
  /** Maximum mood cache size */
  MAX_MOOD_CACHE_SIZE: 20,
  /** Maximum consecutive bonus cache size */
  MAX_CONSECUTIVE_CACHE_SIZE: 20,
  /** Maximum server influence cache size */
  MAX_SERVER_CACHE_SIZE: 50,
  
  // Strategy specific
  /** Reverse psychology override threshold */
  REVERSE_PSYCHOLOGY_OVERRIDE_THRESHOLD: 5,
  /** Reverse psychology override chance (40%) */
  REVERSE_PSYCHOLOGY_OVERRIDE_CHANCE: 0.4,
} as const;

// ============= GRACEFUL DEGRADATION CONSTANTS =============
/**
 * Constants for graceful degradation and circuit breaker behavior
 */
export const DEGRADATION_CONSTANTS = {
  // Circuit breaker defaults
  /** Default maximum failures before opening circuit */
  DEFAULT_MAX_FAILURES: 5,
  /** Default circuit reset timeout (1 minute) */
  DEFAULT_RESET_TIMEOUT_MS: 60000,
  /** Default half-open state max retries */
  DEFAULT_HALF_OPEN_RETRIES: 3,
  
  // Health thresholds
  /** Default memory threshold in MB */
  DEFAULT_MEMORY_THRESHOLD_MB: 400,
  /** Default error rate threshold percentage */
  DEFAULT_ERROR_RATE_THRESHOLD: 10.0,
  /** Default response time threshold (10 seconds) */
  DEFAULT_RESPONSE_TIME_THRESHOLD_MS: 10000,
  
  // Queue management
  /** Default maximum queue size */
  DEFAULT_MAX_QUEUE_SIZE: 100,
  /** Default maximum queue time (5 minutes) */
  DEFAULT_MAX_QUEUE_TIME_MS: 300000,
  /** Default retry interval (30 seconds) */
  DEFAULT_RETRY_INTERVAL_MS: 30000,
  /** Default maximum retries */
  DEFAULT_MAX_RETRIES: 3,
  
  // Processing limits
  /** Maximum messages to process per batch */
  MAX_BATCH_PROCESS_SIZE: 5,
  /** Queue pressure threshold (80%) */
  QUEUE_PRESSURE_THRESHOLD: 0.8,
  /** Average message processing time in seconds */
  AVERAGE_PROCESSING_TIME_SECONDS: 30,
  
  // Time conversions for display
  /** Seconds per minute */
  SECONDS_PER_MINUTE: 60,
  /** Seconds per hour */
  SECONDS_PER_HOUR: 3600,
  
  // Health check
  /** Health check delay in milliseconds */
  HEALTH_CHECK_DELAY_MS: 1000,
  /** Health check success rate (50%) */
  HEALTH_CHECK_SUCCESS_RATE: 0.5,
} as const;

// ============= CACHE CONSTANTS =============
/**
 * Constants for various caching mechanisms
 */
export const CACHE_CONSTANTS = {
  /** Server influence cache duration (5 minutes) */
  SERVER_INFLUENCE_CACHE_DURATION_MS: 5 * 60 * 1000,
  /** Default cache TTL (1 hour) */
  DEFAULT_CACHE_TTL_MS: 60 * 60 * 1000,
} as const;

// ============= RATE LIMITER CONSTANTS =============
/**
 * Constants for rate limiting service
 */
export const RATE_LIMITER_CONSTANTS = {
  /** Batch writes interval (10 seconds) */
  FLUSH_INTERVAL_MS: 10000,
  /** Cache window calculations duration (1 second) */
  WINDOW_CACHE_MS: 1000,
  /** Safety margin for rate limits (90%) */
  SAFETY_MARGIN: 0.9,
} as const;

// ============= HEALTH MONITOR CONSTANTS =============
/**
 * Constants for health monitoring service
 */
export const HEALTH_MONITOR_CONSTANTS = {
  /** Metrics collection interval (30 seconds) */
  COLLECTION_INTERVAL_MS: 30000,
  /** Metrics retention period in days */
  RETENTION_DAYS: 7,
  /** Cleanup interval (5 minutes) */
  CLEANUP_INTERVAL_MS: 300000,
  /** Maximum performance buffer size */
  MAX_PERFORMANCE_BUFFER: 1000,
  /** Default memory threshold in MB */
  DEFAULT_MEMORY_THRESHOLD_MB: 500,
  /** Default error rate threshold percentage */
  DEFAULT_ERROR_RATE_THRESHOLD: 5.0,
  /** Default response time threshold (5 seconds) */
  DEFAULT_RESPONSE_TIME_THRESHOLD_MS: 5000,
  /** Default disk space threshold percentage */
  DEFAULT_DISK_SPACE_THRESHOLD: 85.0,
} as const;

// ============= GENERAL CONSTANTS =============
/**
 * General application constants
 */
export const GENERAL_CONSTANTS = {
  /** Memory size conversion (bytes to MB) */
  BYTES_TO_MB: 1024 * 1024,
  /** Percentage conversion factor */
  PERCENTAGE_FACTOR: 100,
  /** Random variance range */
  RANDOM_VARIANCE_RANGE: 0.05,
  /** Half value for calculations */
  HALF_VALUE: 0.5,
} as const;

// Type exports for better type safety
export type TimeConstants = typeof TIME_CONSTANTS;
export type RoastingConstants = typeof ROASTING_CONSTANTS;
export type DegradationConstants = typeof DEGRADATION_CONSTANTS;
export type CacheConstants = typeof CACHE_CONSTANTS;
export type RateLimiterConstants = typeof RATE_LIMITER_CONSTANTS;
export type HealthMonitorConstants = typeof HEALTH_MONITOR_CONSTANTS;
export type GeneralConstants = typeof GENERAL_CONSTANTS;