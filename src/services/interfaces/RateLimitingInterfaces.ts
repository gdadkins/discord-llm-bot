/**
 * Rate Limiting Service Interface Definitions
 * 
 * Interfaces for rate limiting and quota management.
 */

import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Rate Limiting Service Interfaces
// ============================================================================

export interface IRateLimiter extends IService {
  /**
   * Checks if a request can be made and increments counter
   * @returns Whether request is allowed and remaining quota
   */
  checkAndIncrement(userId?: string): Promise<RateLimitCheckResult>;
  
  /**
   * Gets remaining quota without incrementing
   */
  getRemainingQuota(): { minute: number; daily: number };
  
  /**
   * Gets remaining requests for a specific user
   */
  getRemainingRequests(userId?: string): number;
  
  /**
   * Gets daily limit
   */
  getDailyLimit(): number;
  
  /**
   * Gets current rate limit status
   */
  getStatus(userId?: string): RateLimitStatus;
  
  /**
   * Updates rate limiting configuration
   */
  updateLimits(rpm: number, daily: number): void;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason: string;
  remaining: {
    minute: number;
    daily: number;
  };
}

export interface RateLimitStatus {
  rpm: {
    current: number;
    limit: number;
    resetsAt: number;
  };
  daily: {
    current: number;
    limit: number;
    resetsAt: number;
  };
}