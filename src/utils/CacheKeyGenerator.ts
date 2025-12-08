/**
 * @file CacheKeyGenerator - Standardized cache key generation utility
 * @module utils/CacheKeyGenerator
 * 
 * Provides consistent cache key generation across all caching services.
 * Supports both simple string keys and hash-based keys with proper validation.
 */

import { createHash } from 'crypto';
import { logger } from './logger';

/**
 * Cache key generation options
 */
export interface CacheKeyOptions {
  /** Whether to use hashing for the key (default: false) */
  useHash?: boolean;
  /** Hash algorithm to use (default: 'sha256') */
  hashAlgorithm?: 'sha256' | 'sha1' | 'md5';
  /** Key prefix for namespacing (optional) */
  prefix?: string;
  /** Key suffix for additional context (optional) */
  suffix?: string;
  /** Whether to include timestamp in key (default: false) */
  includeTimestamp?: boolean;
}

/**
 * Cache key types for different services
 */
export type CacheKeyType = 
  | 'user' 
  | 'server' 
  | 'conversation' 
  | 'cache_response' 
  | 'context' 
  | 'behavior' 
  | 'social_graph'
  | 'channel_context'
  | 'memory_optimization'
  | 'health_monitor'
  | 'rate_limit'
  | 'custom';

/**
 * Standardized cache key generator utility
 * 
 * This utility provides consistent cache key generation across all caching services
 * in the Discord bot. It addresses the inconsistencies found in current cache key
 * generation patterns and provides a centralized, type-safe approach.
 * 
 * Key Features:
 * - Type-safe cache key generation with TypeScript support
 * - Consistent formatting and validation across all services
 * - Hash-based keys for sensitive data (prompts, responses)
 * - Simple string keys for basic identifiers (userId, serverId)
 * - Configurable options for different use cases
 * - Proper error handling and validation
 * - Support for namespacing and prefixes
 */
export class CacheKeyGenerator {
  private static readonly DEFAULT_HASH_ALGORITHM = 'sha256';
  private static readonly KEY_SEPARATOR = ':';
  private static readonly MAX_KEY_LENGTH = 250; // Redis key length limit
  
  /**
   * Generate a user-specific cache key
   * 
   * @param userId - Discord user ID
   * @param options - Optional generation options
   * @returns Standardized user cache key
   */
  static generateUserKey(userId: string, options: CacheKeyOptions = {}): string {
    this.validateInput('userId', userId);
    
    const baseKey = this.buildKey(['user', userId], options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Generate a server-specific cache key
   * 
   * @param serverId - Discord server/guild ID
   * @param options - Optional generation options
   * @returns Standardized server cache key
   */
  static generateServerKey(serverId: string, options: CacheKeyOptions = {}): string {
    this.validateInput('serverId', serverId);
    
    const baseKey = this.buildKey(['server', serverId], options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Generate a conversation-specific cache key
   * 
   * @param userId - Discord user ID
   * @param options - Optional generation options
   * @returns Standardized conversation cache key
   */
  static generateConversationKey(userId: string, options: CacheKeyOptions = {}): string {
    this.validateInput('userId', userId);
    
    const baseKey = this.buildKey(['conversation', userId], options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Generate a cache response key (for CacheManager)
   * 
   * @param prompt - User prompt/message
   * @param userId - Discord user ID
   * @param serverId - Discord server ID (optional)
   * @param options - Optional generation options
   * @returns Standardized cache response key
   */
  static generateCacheKey(
    prompt: string, 
    userId: string, 
    serverId?: string, 
    options: CacheKeyOptions = {}
  ): string {
    this.validateInput('prompt', prompt);
    this.validateInput('userId', userId);
    
    if (serverId) {
      this.validateInput('serverId', serverId);
    }
    
    // For cache responses, always use hashing to handle variable prompt content
    const components = [prompt, userId, serverId || 'dm'];
    const input = components.join(this.KEY_SEPARATOR);
    
    // Force hashing for cache responses to handle long prompts
    const finalOptions = { ...options, useHash: true };
    return this.finalizeKey(input, finalOptions);
  }

  /**
   * Generate a context-specific cache key
   * 
   * @param serverId - Discord server ID
   * @param userId - Discord user ID
   * @param contextType - Type of context (optional)
   * @param options - Optional generation options
   * @returns Standardized context cache key
   */
  static generateContextKey(
    serverId: string, 
    userId: string, 
    contextType?: string,
    options: CacheKeyOptions = {}
  ): string {
    this.validateInput('serverId', serverId);
    this.validateInput('userId', userId);
    
    const components = ['context', serverId, userId];
    if (contextType) {
      this.validateInput('contextType', contextType);
      components.push(contextType);
    }
    
    const baseKey = this.buildKey(components, options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Generate a behavior pattern cache key
   * 
   * @param userId - Discord user ID
   * @param options - Optional generation options
   * @returns Standardized behavior cache key
   */
  static generateBehaviorKey(userId: string, options: CacheKeyOptions = {}): string {
    this.validateInput('userId', userId);
    
    const baseKey = this.buildKey(['behavior', userId], options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Generate a social graph cache key
   * 
   * @param serverId - Discord server ID
   * @param userId - Discord user ID (optional)
   * @param options - Optional generation options
   * @returns Standardized social graph cache key
   */
  static generateSocialGraphKey(
    serverId: string, 
    userId?: string, 
    options: CacheKeyOptions = {}
  ): string {
    this.validateInput('serverId', serverId);
    
    const components = ['social', serverId];
    if (userId) {
      this.validateInput('userId', userId);
      components.push(userId);
    }
    
    const baseKey = this.buildKey(components, options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Generate a channel context cache key
   * 
   * @param channelId - Discord channel ID
   * @param contextType - Type of channel context (optional)
   * @param options - Optional generation options
   * @returns Standardized channel context cache key
   */
  static generateChannelContextKey(
    channelId: string, 
    contextType?: string,
    options: CacheKeyOptions = {}
  ): string {
    this.validateInput('channelId', channelId);
    
    const components = ['channel', channelId];
    if (contextType) {
      this.validateInput('contextType', contextType);
      components.push(contextType);
    }
    
    const baseKey = this.buildKey(components, options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Generate a rate limiting cache key
   * 
   * @param identifier - Rate limit identifier (userId, IP, etc.)
   * @param limitType - Type of rate limit
   * @param options - Optional generation options
   * @returns Standardized rate limit cache key
   */
  static generateRateLimitKey(
    identifier: string, 
    limitType: string,
    options: CacheKeyOptions = {}
  ): string {
    this.validateInput('identifier', identifier);
    this.validateInput('limitType', limitType);
    
    const baseKey = this.buildKey(['ratelimit', limitType, identifier], options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Generate a health monitoring cache key
   * 
   * @param serviceName - Name of the service
   * @param metricType - Type of metric
   * @param options - Optional generation options
   * @returns Standardized health monitoring cache key
   */
  static generateHealthKey(
    serviceName: string, 
    metricType: string,
    options: CacheKeyOptions = {}
  ): string {
    this.validateInput('serviceName', serviceName);
    this.validateInput('metricType', metricType);
    
    const baseKey = this.buildKey(['health', serviceName, metricType], options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Generate a custom cache key with flexible components
   * 
   * @param keyType - Type of cache key
   * @param components - Array of key components
   * @param options - Optional generation options
   * @returns Standardized custom cache key
   */
  static generateCustomKey(
    keyType: CacheKeyType, 
    components: string[], 
    options: CacheKeyOptions = {}
  ): string {
    this.validateInput('keyType', keyType);
    
    if (!Array.isArray(components) || components.length === 0) {
      throw new Error('Components must be a non-empty array');
    }
    
    // Validate all components
    components.forEach((component, index) => {
      this.validateInput(`component[${index}]`, component);
    });
    
    const fullComponents = [keyType, ...components];
    const baseKey = this.buildKey(fullComponents, options);
    return this.finalizeKey(baseKey, options);
  }

  /**
   * Parse a cache key to extract its components
   * 
   * @param key - Cache key to parse
   * @returns Object containing key components and metadata
   */
  static parseKey(key: string): {
    isHashed: boolean;
    hasPrefix: boolean;
    hasSuffix: boolean;
    estimatedComponents: number;
  } {
    this.validateInput('key', key);
    
    // Check if key looks like a hash
    const isHashed = /^[a-f0-9]{32,64}$/i.test(key.replace(/^[^:]*:|:[^:]*$/g, ''));
    
    // Check for prefix/suffix patterns
    const parts = key.split(this.KEY_SEPARATOR);
    const hasPrefix = parts.length > 1 && parts[0].length > 0;
    const hasSuffix = parts.length > 1 && /^\d+$/.test(parts[parts.length - 1]);
    
    return {
      isHashed,
      hasPrefix,
      hasSuffix,
      estimatedComponents: parts.length
    };
  }

  /**
   * Validate cache key format and length
   * 
   * @param key - Cache key to validate
   * @returns True if valid, throws error if invalid
   */
  static validateKey(key: string): boolean {
    this.validateInput('key', key);
    
    if (key.length > this.MAX_KEY_LENGTH) {
      throw new Error(`Cache key exceeds maximum length of ${this.MAX_KEY_LENGTH} characters`);
    }
    
    // Check for invalid characters
    if (!/^[a-zA-Z0-9:_-]+$/.test(key)) {
      throw new Error('Cache key contains invalid characters. Only alphanumeric, colons, underscores, and hyphens are allowed');
    }
    
    return true;
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Build base key from components
   */
  private static buildKey(components: string[], options: CacheKeyOptions): string {
    let key = components.join(this.KEY_SEPARATOR);
    
    // Add timestamp if requested
    if (options.includeTimestamp) {
      key += this.KEY_SEPARATOR + Date.now().toString();
    }
    
    return key;
  }

  /**
   * Finalize key with options (hashing, prefix, suffix)
   */
  private static finalizeKey(baseKey: string, options: CacheKeyOptions): string {
    let finalKey = baseKey;
    
    // Apply hashing if requested
    if (options.useHash) {
      const algorithm = options.hashAlgorithm || this.DEFAULT_HASH_ALGORITHM;
      finalKey = this.generateHash(baseKey, algorithm);
    }
    
    // Add prefix if specified
    if (options.prefix) {
      this.validateInput('prefix', options.prefix);
      finalKey = options.prefix + this.KEY_SEPARATOR + finalKey;
    }
    
    // Add suffix if specified
    if (options.suffix) {
      this.validateInput('suffix', options.suffix);
      finalKey = finalKey + this.KEY_SEPARATOR + options.suffix;
    }
    
    // Validate final key
    this.validateKey(finalKey);
    
    return finalKey;
  }

  /**
   * Generate hash from input string
   */
  private static generateHash(input: string, algorithm: string): string {
    try {
      return createHash(algorithm).update(input).digest('hex');
    } catch (error) {
      logger.error('Failed to generate hash for cache key', { algorithm, error });
      throw new Error(`Failed to generate hash using algorithm: ${algorithm}`);
    }
  }

  /**
   * Validate input parameters
   */
  private static validateInput(paramName: string, value: string): void {
    if (typeof value !== 'string') {
      throw new Error(`${paramName} must be a string`);
    }
    
    if (value.trim().length === 0) {
      throw new Error(`${paramName} cannot be empty or whitespace`);
    }
    
    // Only restrict colons for final key components (IDs, not content like prompts)
    // Prompts can contain URLs with colons and will be hashed anyway
    const isContentParameter = paramName === 'prompt' || paramName === 'key';
    const isIdParameter = paramName.includes('Id') || paramName.includes('Type') || paramName.includes('Name');
    
    if (value.includes(this.KEY_SEPARATOR) && !isContentParameter && isIdParameter) {
      throw new Error(`${paramName} cannot contain the key separator character (:)`);
    }
  }
}

/**
 * Convenience functions for backward compatibility and ease of use
 */

/**
 * Generate a simple user cache key (backward compatible)
 */
export function generateUserCacheKey(userId: string): string {
  return CacheKeyGenerator.generateUserKey(userId);
}

/**
 * Generate a simple server cache key (backward compatible)
 */
export function generateServerCacheKey(serverId: string): string {
  return CacheKeyGenerator.generateServerKey(serverId);
}

/**
 * Generate a conversation cache key (backward compatible)
 */
export function generateConversationCacheKey(userId: string): string {
  return CacheKeyGenerator.generateConversationKey(userId);
}

/**
 * Generate a hashed cache key for responses (backward compatible with CacheManager)
 */
export function generateHashedCacheKey(prompt: string, userId: string, serverId?: string): string {
  return CacheKeyGenerator.generateCacheKey(prompt, userId, serverId);
}