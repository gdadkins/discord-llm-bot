/**
 * User Analysis Service Interface Definitions
 * 
 * Interfaces for analyzing Discord user messages, behavior patterns, and generating insights.
 * Used primarily for user summary/analysis commands.
 */

import type { User, Client, Message } from 'discord.js';
import type { IService } from './CoreServiceInterfaces';
import type { IAIService } from './AIServiceInterfaces';
import type { LocalAnalysisResult } from '../../utils/localUserAnalyzer';

// ============================================================================
// User Analysis Service Interfaces
// ============================================================================

/**
 * User Analysis Service Interface
 * 
 * Provides comprehensive user behavior analysis capabilities including:
 * - Summary request detection and processing
 * - Hybrid local + API analysis workflows
 * - Message fetching and filtering
 * - Roast generation based on user patterns
 * 
 * ## Contract Guarantees
 * - Optimizes API usage through local-first analysis
 * - Handles graceful degradation when API analysis fails
 * - Provides meaningful insights from minimal data
 * - Maintains user privacy and appropriate content boundaries
 */
export interface IUserAnalysisService extends IService {
  /**
   * Detects if a message is requesting user analysis/summary
   * 
   * @param messageContent The message content to analyze
   * @param mentionedUserIds Array of user IDs mentioned in the message
   * @returns True if this appears to be a user analysis request
   */
  isSummaryRequest(messageContent: string, mentionedUserIds: string[]): boolean;

  /**
   * Fetches recent messages from a user in a specific channel
   * 
   * @param client Discord client for API access
   * @param channel The channel to fetch messages from
   * @param targetUserId The user whose messages to fetch
   * @param limit Maximum number of messages to fetch (default: 100)
   * @returns Array of formatted message strings with timestamps
   */
  fetchUserMessages(
    client: Client,
    channel: any,
    targetUserId: string,
    limit?: number
  ): Promise<string[]>;

  /**
   * Performs hybrid analysis (local + API) on user messages
   * 
   * @param userMessages Array of user message strings
   * @param targetUser The Discord user being analyzed
   * @param aiService AI service for deep analysis
   * @param requestingUserId User ID of the person requesting analysis
   * @param guildId Optional guild ID for context
   * @param member Optional member object for context
   * @param guild Optional guild object for context
   * @returns Complete user analysis result
   */
  analyzeUserBehavior(
    userMessages: string[],
    targetUser: User,
    aiService: IAIService,
    requestingUserId: string,
    guildId?: string,
    member?: any,
    guild?: any
  ): Promise<UserAnalysisResult>;

  /**
   * Generates a roast-style summary based on analysis results
   * 
   * @param analysisResult The analysis result to base the roast on
   * @param targetUser The user being analyzed
   * @param isLocalOnly Whether this analysis used only local data
   * @returns Formatted roast string ready for Discord
   */
  generateRoastSummary(
    analysisResult: UserAnalysisResult,
    targetUser: User,
    isLocalOnly: boolean
  ): string;
}

// ============================================================================
// User Analysis Data Types
// ============================================================================

/**
 * Complete user analysis result combining local and API insights
 */
export interface UserAnalysisResult {
  /** Local analysis results */
  localAnalysis: LocalAnalysisResult;
  
  /** API-based analysis results (optional) */
  apiAnalysis?: ApiAnalysisResult;
  
  /** Whether API analysis was performed */
  usedApiAnalysis: boolean;
  
  /** Reasons why API analysis was or wasn't used */
  analysisReasons: string[];
  
  /** Performance metrics for the analysis */
  metrics: AnalysisMetrics;
}

/**
 * Results from API-based deep analysis
 */
export interface ApiAnalysisResult {
  /** Main topics discussed by the user */
  topics: string[];
  
  /** Communication style description */
  communicationStyle: string;
  
  /** User interests identified */
  interests: string[];
  
  /** Behavioral patterns detected */
  patterns: string[];
  
  /** Number of message batches processed */
  batchesProcessed: number;
  
  /** Success rate of batch processing */
  batchSuccessRate: number;
}

/**
 * Performance and optimization metrics for analysis
 */
export interface AnalysisMetrics {
  /** Total messages analyzed */
  totalMessages: number;
  
  /** Messages that required API analysis */
  interestingMessages: number;
  
  /** Percentage reduction in API calls */
  apiReductionPercent: number;
  
  /** Number of API calls saved */
  apiCallsSaved: number;
  
  /** Time taken for analysis (milliseconds) */
  analysisTimeMs: number;
  
  /** Whether analysis completed successfully */
  success: boolean;
  
  /** Any errors encountered during analysis */
  errors: string[];
}

/**
 * Configuration for user analysis behavior
 */
export interface UserAnalysisConfig {
  /** Maximum number of messages to fetch per request */
  maxMessagesPerRequest: number;
  
  /** Minimum messages required for API analysis */
  minMessagesForApiAnalysis: number;
  
  /** Maximum characters per API batch */
  maxCharsPerBatch: number;
  
  /** Summary keywords for request detection */
  summaryKeywords: string[];
  
  /** Whether to enable roast generation */
  enableRoasting: boolean;
  
  /** Maximum time to spend on analysis (seconds) */
  maxAnalysisTimeSeconds: number;
}

/**
 * Error types specific to user analysis
 */
export class UserAnalysisError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(`User analysis error: ${message}`);
    this.name = 'UserAnalysisError';
  }
}

export class MessageFetchError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(`Message fetch error: ${message}`);
    this.name = 'MessageFetchError';
  }
}

export class AnalysisTimeoutError extends Error {
  constructor(timeoutSeconds: number) {
    super(`User analysis timed out after ${timeoutSeconds} seconds`);
    this.name = 'AnalysisTimeoutError';
  }
}