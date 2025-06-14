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
   * Checks if a video processing request can be made considering token cost
   * @param estimatedTokens Estimated token cost for video processing
   * @param userId Optional user ID for per-user limiting
   * @returns Whether request is allowed and remaining quota
   */
  checkVideoProcessing(estimatedTokens: number, userId?: string): Promise<VideoRateLimitResult>;
  
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
  
  /**
   * Gets video-specific rate limiting status
   */
  getVideoStatus(userId?: string): VideoRateLimitStatus;
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

export interface VideoRateLimitResult {
  allowed: boolean;
  reason: string;
  tokenCost: number;
  remaining: {
    tokens: {
      hourly: number;
      daily: number;
    };
    requests: {
      minute: number;
      hourly: number;
    };
  };
}

export interface VideoRateLimitStatus {
  tokens: {
    hourly: {
      current: number;
      limit: number;
      resetsAt: number;
    };
    daily: {
      current: number;
      limit: number;
      resetsAt: number;
    };
  };
  requests: {
    hourly: {
      current: number;
      limit: number;
      resetsAt: number;
    };
    daily: {
      current: number;
      limit: number;
      resetsAt: number;
    };
  };
}