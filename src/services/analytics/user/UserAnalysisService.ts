/**
 * User Analysis Service - Main Orchestrator
 * 
 * Coordinates user behavior analysis components and maintains the service API.
 * Responsibilities:
 * - Service lifecycle management
 * - Component coordination
 * - Summary request detection
 * - Analysis orchestration
 * - Configuration management
 */

import type { User, Client, Message, GuildMember, Guild } from 'discord.js';
import type { 
  IUserAnalysisService, 
  UserAnalysisResult, 
  UserAnalysisConfig,
  AnalysisMetrics
} from '../../interfaces/UserAnalysisInterfaces';
import { UserAnalysisError } from '../../interfaces/UserAnalysisInterfaces';
import type { ServiceHealthStatus } from '../../interfaces/CoreServiceInterfaces';
import type { IAIService } from '../../interfaces/AIServiceInterfaces';
import type { LocalAnalysisResult } from '../../../utils/localUserAnalyzer';
import { UserMetricsCollector } from './UserMetricsCollector';
import { UserInsightGenerator } from './UserInsightGenerator';
import { logger } from '../../../utils/logger';

/**
 * Main User Analysis Service
 * 
 * Orchestrates the analysis pipeline by coordinating:
 * - Metrics collection via UserMetricsCollector
 * - Insight generation via UserInsightGenerator
 * - Service health monitoring
 * - Configuration management
 */
export class UserAnalysisService implements IUserAnalysisService {
  private metricsCollector: UserMetricsCollector;
  private insightGenerator: UserInsightGenerator;
  private config: UserAnalysisConfig;
  private initialized = false;

  constructor(config?: Partial<UserAnalysisConfig>) {
    this.config = {
      maxMessagesPerRequest: 100,
      minMessagesForApiAnalysis: 10,
      maxCharsPerBatch: 20000,
      summaryKeywords: ['summary', 'summarize', 'messages', 'history', 'conversation', 'what has', 'what did', 'analyze'],
      enableRoasting: true,
      maxAnalysisTimeSeconds: 30,
      ...config
    };

    this.metricsCollector = new UserMetricsCollector(this.config);
    this.insightGenerator = new UserInsightGenerator({
      enableRoasting: this.config.enableRoasting,
      maxTopicsToDisplay: 5,
      maxInterestsToDisplay: 5
    });
  }

  // ============================================================================
  // IService Implementation
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    logger.info('Initializing UserAnalysisService...');
    
    // Validate configuration
    if (this.config.maxMessagesPerRequest <= 0) {
      throw new Error('maxMessagesPerRequest must be positive');
    }
    if (this.config.maxCharsPerBatch <= 0) {
      throw new Error('maxCharsPerBatch must be positive');
    }
    
    this.initialized = true;
    logger.info('UserAnalysisService initialized successfully');
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    
    logger.info('Shutting down UserAnalysisService...');
    this.initialized = false;
    logger.info('UserAnalysisService shut down successfully');
  }

  getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.initialized,
      name: 'UserAnalysisService',
      errors: this.initialized ? [] : ['Service not initialized'],
      metrics: {
        initialized: this.initialized,
        configValid: this.isConfigValid()
      }
    };
  }

  // ============================================================================
  // IUserAnalysisService Implementation
  // ============================================================================

  isSummaryRequest(messageContent: string, mentionedUserIds: string[]): boolean {
    if (!this.initialized) {
      logger.warn('UserAnalysisService not initialized, cannot detect summary requests');
      return false;
    }

    return this.metricsCollector.isSummaryRequest(messageContent, mentionedUserIds);
  }

  async fetchUserMessages(
    client: Client,
    channel: { id: string; messages: { fetch(options: { limit: number }): Promise<Map<string, Message>> } },
    targetUserId: string,
    limit?: number
  ): Promise<string[]> {
    if (!this.initialized) {
      throw new Error('UserAnalysisService not initialized');
    }

    return this.metricsCollector.fetchUserMessages(client, channel, targetUserId, limit);
  }

  async analyzeUserBehavior(
    userMessages: string[],
    targetUser: User,
    aiService: IAIService,
    requestingUserId: string,
    guildId?: string,
    member?: GuildMember,
    guild?: Guild
  ): Promise<UserAnalysisResult> {
    if (!this.initialized) {
      throw new Error('UserAnalysisService not initialized');
    }

    const startTime = Date.now();
    const analysisId = `${targetUser.id}-${Date.now()}`;
    
    logger.info(`Starting user analysis for ${targetUser.username}`, {
      analysisId,
      messageCount: userMessages.length,
      targetUserId: targetUser.id,
      requestingUserId
    });

    try {
      // Step 1: Perform local analysis first (always fast, no API calls)
      const localAnalysis = this.metricsCollector.analyzeLocally(userMessages);
      
      logger.info('Local analysis completed', {
        analysisId,
        messageCount: localAnalysis.messageCount,
        requiresApiAnalysis: localAnalysis.requiresApiAnalysis,
        reasons: localAnalysis.apiAnalysisReasons
      });

      const metrics: AnalysisMetrics = {
        totalMessages: userMessages.length,
        interestingMessages: 0,
        apiReductionPercent: 0,
        apiCallsSaved: 0,
        analysisTimeMs: 0,
        success: false,
        errors: []
      };

      let apiAnalysis;
      let usedApiAnalysis = false;
      const analysisReasons: string[] = [...localAnalysis.apiAnalysisReasons];

      // Step 2: Decide whether to use API analysis
      if (this.shouldPerformApiAnalysis(localAnalysis, userMessages)) {
        try {
          logger.info(`Performing API analysis: ${analysisReasons[0]}`, { analysisId });
          
          // Prepare messages for API analysis
          const { interestingMessages, metrics: prepMetrics } = 
            this.metricsCollector.prepareMessagesForAnalysis(userMessages);
          
          metrics.interestingMessages = interestingMessages.length;
          metrics.apiReductionPercent = prepMetrics.reductionPercent;
          
          // Create batches for API processing
          const batches = this.metricsCollector.createMessageBatches(interestingMessages);
          metrics.apiCallsSaved = Math.ceil(userMessages.length / 20) - batches.length;
          
          // Perform API analysis
          apiAnalysis = await this.insightGenerator.performApiAnalysis(
            batches,
            targetUser,
            aiService,
            requestingUserId,
            guildId,
            member,
            guild,
            analysisId
          );
          
          usedApiAnalysis = true;
          
        } catch (apiError) {
          logger.warn('API analysis failed, using local analysis only', {
            analysisId,
            error: apiError
          });
          metrics.errors.push(`API analysis failed: ${(apiError as Error).message}`);
          analysisReasons.push('API analysis failed - using local analysis only');
        }
      } else {
        logger.info('Using local analysis only - skipping API calls', { analysisId });
        analysisReasons.push('Local analysis sufficient - no API calls needed');
      }

      // Calculate final metrics
      metrics.analysisTimeMs = Date.now() - startTime;
      metrics.success = true;

      const result: UserAnalysisResult = {
        localAnalysis,
        apiAnalysis,
        usedApiAnalysis,
        analysisReasons,
        metrics
      };

      logger.info('User analysis completed successfully', {
        analysisId,
        usedApiAnalysis,
        analysisTimeMs: metrics.analysisTimeMs,
        apiReductionPercent: metrics.apiReductionPercent
      });

      return result;

    } catch (error) {
      const analysisTimeMs = Date.now() - startTime;
      logger.error('User analysis failed', {
        analysisId,
        error,
        analysisTimeMs
      });

      throw new UserAnalysisError('Failed to analyze user behavior', error as Error);
    }
  }

  generateRoastSummary(
    analysisResult: UserAnalysisResult,
    targetUser: User,
    isLocalOnly: boolean
  ): string {
    if (!this.initialized) {
      throw new Error('UserAnalysisService not initialized');
    }

    return this.insightGenerator.generateRoastSummary(
      analysisResult,
      targetUser,
      isLocalOnly
    );
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private isConfigValid(): boolean {
    return this.config.maxMessagesPerRequest > 0 &&
           this.config.maxCharsPerBatch > 0 &&
           this.config.summaryKeywords.length > 0;
  }

  private shouldPerformApiAnalysis(localAnalysis: LocalAnalysisResult, userMessages: string[]): boolean {
    // Not enough messages for meaningful API analysis
    if (!this.metricsCollector.hasEnoughMessagesForAnalysis(userMessages.length)) {
      return false;
    }

    // Local analysis indicates API analysis is needed
    return localAnalysis.requiresApiAnalysis;
  }
}