/**
 * @file CacheKeyGenerator.test.ts - Unit tests for CacheKeyGenerator utility
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CacheKeyGenerator, type CacheKeyOptions } from '../../../src/utils/CacheKeyGenerator';

describe('CacheKeyGenerator', () => {
  const TEST_USER_ID = '123456789012345678';
  const TEST_SERVER_ID = '987654321098765432';
  const TEST_PROMPT = 'What is the meaning of life?';
  const TEST_CHANNEL_ID = '111222333444555666';

  beforeEach(() => {
    // Reset any state if needed
  });

  describe('generateUserKey', () => {
    it('should generate a consistent user key', () => {
      const key1 = CacheKeyGenerator.generateUserKey(TEST_USER_ID);
      const key2 = CacheKeyGenerator.generateUserKey(TEST_USER_ID);
      
      expect(key1).toBe(key2);
      expect(key1).toContain('user');
      expect(key1).toContain(TEST_USER_ID);
    });

    it('should include prefix when specified', () => {
      const options: CacheKeyOptions = { prefix: 'bot' };
      const key = CacheKeyGenerator.generateUserKey(TEST_USER_ID, options);
      
      expect(key.startsWith('bot:')).toBe(true);
    });

    it('should use hash when requested', () => {
      const options: CacheKeyOptions = { useHash: true };
      const key = CacheKeyGenerator.generateUserKey(TEST_USER_ID, options);
      
      // Hashed keys should be hex strings
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should throw error for empty userId', () => {
      expect(() => {
        CacheKeyGenerator.generateUserKey('');
      }).toThrow('userId cannot be empty');
    });

    it('should throw error for invalid userId type', () => {
      expect(() => {
        CacheKeyGenerator.generateUserKey(null as any);
      }).toThrow('userId must be a string');
    });

    it('should throw error for userId containing colons', () => {
      expect(() => {
        CacheKeyGenerator.generateUserKey('invalid:user:id');
      }).toThrow('userId cannot contain the key separator character (:)');
    });
  });

  describe('generateServerKey', () => {
    it('should generate a consistent server key', () => {
      const key1 = CacheKeyGenerator.generateServerKey(TEST_SERVER_ID);
      const key2 = CacheKeyGenerator.generateServerKey(TEST_SERVER_ID);
      
      expect(key1).toBe(key2);
      expect(key1).toContain('server');
      expect(key1).toContain(TEST_SERVER_ID);
    });

    it('should include suffix when specified', () => {
      const options: CacheKeyOptions = { suffix: '123' };
      const key = CacheKeyGenerator.generateServerKey(TEST_SERVER_ID, options);
      
      expect(key.endsWith(':123')).toBe(true);
    });

    it('should throw error for serverId containing colons', () => {
      expect(() => {
        CacheKeyGenerator.generateServerKey('invalid:server:id');
      }).toThrow('serverId cannot contain the key separator character (:)');
    });
  });

  describe('generateConversationKey', () => {
    it('should generate a consistent conversation key', () => {
      const key1 = CacheKeyGenerator.generateConversationKey(TEST_USER_ID);
      const key2 = CacheKeyGenerator.generateConversationKey(TEST_USER_ID);
      
      expect(key1).toBe(key2);
      expect(key1).toContain('conversation');
      expect(key1).toContain(TEST_USER_ID);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate hashed cache key for responses', () => {
      const key = CacheKeyGenerator.generateCacheKey(TEST_PROMPT, TEST_USER_ID, TEST_SERVER_ID);
      
      // Should be a hash since cache keys are always hashed
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different keys for different prompts', () => {
      const key1 = CacheKeyGenerator.generateCacheKey('Hello', TEST_USER_ID, TEST_SERVER_ID);
      const key2 = CacheKeyGenerator.generateCacheKey('Goodbye', TEST_USER_ID, TEST_SERVER_ID);
      
      expect(key1).not.toBe(key2);
    });

    it('should generate same key for same inputs', () => {
      const key1 = CacheKeyGenerator.generateCacheKey(TEST_PROMPT, TEST_USER_ID, TEST_SERVER_ID);
      const key2 = CacheKeyGenerator.generateCacheKey(TEST_PROMPT, TEST_USER_ID, TEST_SERVER_ID);
      
      expect(key1).toBe(key2);
    });

    it('should handle undefined serverId', () => {
      const key = CacheKeyGenerator.generateCacheKey(TEST_PROMPT, TEST_USER_ID);
      
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should throw error for empty prompt', () => {
      expect(() => {
        CacheKeyGenerator.generateCacheKey('', TEST_USER_ID, TEST_SERVER_ID);
      }).toThrow('prompt cannot be empty');
    });

    it('should handle prompts with URLs containing colons', () => {
      const promptWithUrl = 'Check out this link: https://example.com:8080/path?param=value';
      const key = CacheKeyGenerator.generateCacheKey(promptWithUrl, TEST_USER_ID, TEST_SERVER_ID);
      
      // Should generate a valid hash without throwing errors
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle prompts with multiple URLs', () => {
      const promptWithMultipleUrls = 'Compare these: https://site1.com and http://site2.org:3000';
      const key = CacheKeyGenerator.generateCacheKey(promptWithMultipleUrls, TEST_USER_ID, TEST_SERVER_ID);
      
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different keys for prompts with different URLs', () => {
      const prompt1 = 'Visit https://example.com';
      const prompt2 = 'Visit https://different.com';
      
      const key1 = CacheKeyGenerator.generateCacheKey(prompt1, TEST_USER_ID, TEST_SERVER_ID);
      const key2 = CacheKeyGenerator.generateCacheKey(prompt2, TEST_USER_ID, TEST_SERVER_ID);
      
      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/);
      expect(key2).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateContextKey', () => {
    it('should generate a consistent context key', () => {
      const key1 = CacheKeyGenerator.generateContextKey(TEST_SERVER_ID, TEST_USER_ID);
      const key2 = CacheKeyGenerator.generateContextKey(TEST_SERVER_ID, TEST_USER_ID);
      
      expect(key1).toBe(key2);
      expect(key1).toContain('context');
      expect(key1).toContain(TEST_SERVER_ID);
      expect(key1).toContain(TEST_USER_ID);
    });

    it('should include context type when specified', () => {
      const key = CacheKeyGenerator.generateContextKey(TEST_SERVER_ID, TEST_USER_ID, 'social');
      
      expect(key).toContain('social');
    });
  });

  describe('generateBehaviorKey', () => {
    it('should generate a consistent behavior key', () => {
      const key1 = CacheKeyGenerator.generateBehaviorKey(TEST_USER_ID);
      const key2 = CacheKeyGenerator.generateBehaviorKey(TEST_USER_ID);
      
      expect(key1).toBe(key2);
      expect(key1).toContain('behavior');
      expect(key1).toContain(TEST_USER_ID);
    });
  });

  describe('generateSocialGraphKey', () => {
    it('should generate server-wide social graph key', () => {
      const key = CacheKeyGenerator.generateSocialGraphKey(TEST_SERVER_ID);
      
      expect(key).toContain('social');
      expect(key).toContain(TEST_SERVER_ID);
    });

    it('should generate user-specific social graph key', () => {
      const key = CacheKeyGenerator.generateSocialGraphKey(TEST_SERVER_ID, TEST_USER_ID);
      
      expect(key).toContain('social');
      expect(key).toContain(TEST_SERVER_ID);
      expect(key).toContain(TEST_USER_ID);
    });
  });

  describe('generateChannelContextKey', () => {
    it('should generate a consistent channel context key', () => {
      const key1 = CacheKeyGenerator.generateChannelContextKey(TEST_CHANNEL_ID);
      const key2 = CacheKeyGenerator.generateChannelContextKey(TEST_CHANNEL_ID);
      
      expect(key1).toBe(key2);
      expect(key1).toContain('channel');
      expect(key1).toContain(TEST_CHANNEL_ID);
    });

    it('should include context type when specified', () => {
      const key = CacheKeyGenerator.generateChannelContextKey(TEST_CHANNEL_ID, 'culture');
      
      expect(key).toContain('culture');
    });
  });

  describe('generateRateLimitKey', () => {
    it('should generate a consistent rate limit key', () => {
      const key = CacheKeyGenerator.generateRateLimitKey(TEST_USER_ID, 'message');
      
      expect(key).toContain('ratelimit');
      expect(key).toContain('message');
      expect(key).toContain(TEST_USER_ID);
    });
  });

  describe('generateHealthKey', () => {
    it('should generate a consistent health monitoring key', () => {
      const key = CacheKeyGenerator.generateHealthKey('CacheManager', 'memory');
      
      expect(key).toContain('health');
      expect(key).toContain('CacheManager');
      expect(key).toContain('memory');
    });
  });

  describe('generateCustomKey', () => {
    it('should generate custom key with components', () => {
      const components = ['test', 'data', '123'];
      const key = CacheKeyGenerator.generateCustomKey('custom', components);
      
      expect(key).toContain('custom');
      expect(key).toContain('test');
      expect(key).toContain('data');
      expect(key).toContain('123');
    });

    it('should throw error for empty components', () => {
      expect(() => {
        CacheKeyGenerator.generateCustomKey('custom', []);
      }).toThrow('Components must be a non-empty array');
    });

    it('should throw error for invalid component', () => {
      expect(() => {
        CacheKeyGenerator.generateCustomKey('custom', ['valid', '', 'valid']);
      }).toThrow('component[1] cannot be empty');
    });
  });

  describe('parseKey', () => {
    it('should identify hashed keys', () => {
      const hashedKey = CacheKeyGenerator.generateCacheKey(TEST_PROMPT, TEST_USER_ID);
      const parsed = CacheKeyGenerator.parseKey(hashedKey);
      
      expect(parsed.isHashed).toBe(true);
    });

    it('should identify non-hashed keys', () => {
      const normalKey = CacheKeyGenerator.generateUserKey(TEST_USER_ID);
      const parsed = CacheKeyGenerator.parseKey(normalKey);
      
      expect(parsed.isHashed).toBe(false);
    });

    it('should identify prefixed keys', () => {
      const prefixedKey = CacheKeyGenerator.generateUserKey(TEST_USER_ID, { prefix: 'bot' });
      const parsed = CacheKeyGenerator.parseKey(prefixedKey);
      
      expect(parsed.hasPrefix).toBe(true);
    });
  });

  describe('validateKey', () => {
    it('should validate good keys', () => {
      const key = CacheKeyGenerator.generateUserKey(TEST_USER_ID);
      
      expect(CacheKeyGenerator.validateKey(key)).toBe(true);
    });

    it('should reject keys with invalid characters', () => {
      expect(() => {
        CacheKeyGenerator.validateKey('invalid key with spaces');
      }).toThrow('Cache key contains invalid characters');
    });

    it('should reject overly long keys', () => {
      const longKey = 'a'.repeat(300);
      
      expect(() => {
        CacheKeyGenerator.validateKey(longKey);
      }).toThrow('Cache key exceeds maximum length');
    });
  });

  describe('timestamp inclusion', () => {
    it('should include timestamp when requested', async () => {
      const options: CacheKeyOptions = { includeTimestamp: true };
      const key1 = CacheKeyGenerator.generateUserKey(TEST_USER_ID, options);
      
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      const key2 = CacheKeyGenerator.generateUserKey(TEST_USER_ID, options);
      
      // Keys should be different due to timestamp
      expect(key1).not.toBe(key2);
    });
  });

  describe('hash algorithms', () => {
    it('should support different hash algorithms', () => {
      const sha256Key = CacheKeyGenerator.generateUserKey(TEST_USER_ID, { 
        useHash: true, 
        hashAlgorithm: 'sha256' 
      });
      const sha1Key = CacheKeyGenerator.generateUserKey(TEST_USER_ID, { 
        useHash: true, 
        hashAlgorithm: 'sha1' 
      });
      
      expect(sha256Key).not.toBe(sha1Key);
      expect(sha256Key).toMatch(/^[a-f0-9]{64}$/); // SHA256 = 64 chars
      expect(sha1Key).toMatch(/^[a-f0-9]{40}$/);   // SHA1 = 40 chars
    });
  });

  describe('convenience functions', () => {
    it('should export convenience functions that work correctly', () => {
      const { 
        generateUserCacheKey, 
        generateServerCacheKey, 
        generateConversationCacheKey, 
        generateHashedCacheKey 
      } = require('../../../src/utils/CacheKeyGenerator');
      
      expect(generateUserCacheKey(TEST_USER_ID)).toContain('user');
      expect(generateServerCacheKey(TEST_SERVER_ID)).toContain('server');
      expect(generateConversationCacheKey(TEST_USER_ID)).toContain('conversation');
      expect(generateHashedCacheKey(TEST_PROMPT, TEST_USER_ID)).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});