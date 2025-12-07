/**
 * @file ContextManager - Orchestrates context building and management
 * @module services/contextManager
 */

import { logger } from '../../utils/logger';
import { BaseService } from '../base/BaseService';
import { GuildMember, Guild } from 'discord.js';
import { BehaviorAnalyzer, UserBehaviorPattern } from '../analytics/behavior';
import { globalPools } from '../../utils/PromisePool';
import { 
  ContextItem, 
  RichContext, 
  MemoryStats, 
  SocialGraph, 
  ServerCulture 
} from './types';
import { 
  ServerContext, 
  CrossServerInsights, 
  SummarizedFact, 
  CodeSnippet 
} from '../interfaces/ContextManagementInterfaces';
import { IContextManager } from '../interfaces/ContextManagementInterfaces';
import { ConversationMemoryService } from './ConversationMemoryService';
import { ChannelContextService } from './ChannelContextService';
import { SocialDynamicsService } from './SocialDynamicsService';
import { MemoryOptimizationService } from './MemoryOptimizationService';
import { CompositeContextBuilder } from './builders/CompositeContextBuilder';
import { ConversationContextBuilder, ConversationContextOptions } from './ConversationContextBuilder';
import { ServerContextBuilder, ServerContextOptions } from './ServerContextBuilder';
import { UserContextBuilder, UserContextOptions } from './UserContextBuilder';
import { ContextCacheManager } from './ContextCacheManager';

// Re-export types for backward compatibility
export { 
  ContextItem, 
  RichContext, 
  MemoryStats, 
  SocialGraph, 
  ServerCulture 
};

// ========== CONTEXT BUILDER PATTERN ==========
// The builder pattern implementation has been refactored into specialized builder classes
// located in the ./context/builders directory. This provides better separation of concerns
// and makes the code more maintainable and testable.

export class ContextManager extends BaseService implements IContextManager {
  // Global context enablement state
  private globalContextEnabled: boolean = false;
  private serverContext: Map<string, RichContext> = new Map();
  
  // Core services
  private behaviorAnalyzer: BehaviorAnalyzer = new BehaviorAnalyzer();
  private conversationMemoryService: ConversationMemoryService;
  private channelContextService: ChannelContextService;
  private socialDynamicsService: SocialDynamicsService;
  private memoryOptimizationService: MemoryOptimizationService;
  
  // Specialized builders
  private conversationContextBuilder: ConversationContextBuilder;
  private serverContextBuilder: ServerContextBuilder;
  private userContextBuilder: UserContextBuilder;
  private contextCacheManager: ContextCacheManager;
  
  // Memory management - Weak references for user-specific data
  private userDataWeakMap: WeakMap<object, unknown> = new WeakMap();
  
  // Timers
  private readonly MEMORY_CHECK_INTERVAL = 300000; // 5 minutes
  private readonly SUMMARIZATION_INTERVAL = 1800000; // 30 minutes
  private readonly STALE_DATA_CLEANUP_INTERVAL = 3600000; // 1 hour
  private readonly MEMORY_MONITOR_INTERVAL = 30000; // 30 seconds
  
  // Memory thresholds
  private readonly MEMORY_WARNING_THRESHOLD_MB = 400;
  private readonly MEMORY_CRITICAL_THRESHOLD_MB = 500;
  private readonly STALE_DATA_DAYS = 30;
  
  // Context cache configuration
  private readonly CONTEXT_CACHE_TTL = 300000; // 5 minutes
  private readonly CONTEXT_CACHE_MAX_ENTRIES = 1000;
  private contextCache: Map<string, { content: string; hash: string; timestamp: number }> = new Map();
  
  constructor() {
    super();
    
    // Initialize domain services
    this.conversationMemoryService = new ConversationMemoryService();
    this.channelContextService = new ChannelContextService();
    this.socialDynamicsService = new SocialDynamicsService();
    this.memoryOptimizationService = new MemoryOptimizationService(this.conversationMemoryService);
    
    // Initialize specialized builders
    this.conversationContextBuilder = new ConversationContextBuilder(
      this.conversationMemoryService,
      this.memoryOptimizationService
    );
    
    this.serverContextBuilder = new ServerContextBuilder(
      this.channelContextService,
      this.conversationMemoryService
    );
    
    this.userContextBuilder = new UserContextBuilder(
      this.behaviorAnalyzer,
      this.socialDynamicsService
    );
    
    this.contextCacheManager = new ContextCacheManager();
  }

  protected getServiceName(): string {
    return 'ContextManager';
  }

  protected async performInitialization(): Promise<void> {
    // Start memory monitoring
    this.createInterval('memoryMonitoring', () => {
      this.performMemoryMaintenance();
    }, this.MEMORY_CHECK_INTERVAL);

    // Start summarization scheduler
    this.createInterval('summarization', () => {
      this.performScheduledSummarization();
    }, this.SUMMARIZATION_INTERVAL);
    
    // Start stale data cleanup
    this.createInterval('staleDataCleanup', () => {
      this.performStaleDataCleanup();
    }, this.STALE_DATA_CLEANUP_INTERVAL);
    
    // Start memory usage monitoring
    this.createInterval('memoryUsageMonitor', () => {
      this.monitorMemoryUsage();
    }, this.MEMORY_MONITOR_INTERVAL);

    logger.info('ContextManager initialized with memory monitoring, summarization, and stale data cleanup');
  }

  protected async performShutdown(): Promise<void> {
    // BaseService automatically clears all timers
    
    // Clean up behavioral analyzer
    this.behaviorAnalyzer.cleanup();
    
    // Clean up domain services
    this.channelContextService.cleanup();
    
    // Clean up cache manager
    this.contextCacheManager.shutdown();
    
    // Clear context builders caches
    this.userContextBuilder.clearAllCaches();
    this.serverContextBuilder.clearAllCaches();
    
    // Clear all caches
    this.serverContext.clear();
    this.contextCache.clear();
    logger.info('ContextManager shutdown complete');
  }

  addEmbarrassingMoment(
    serverId: string,
    userId: string,
    moment: string,
  ): void {
    const context = this.getOrCreateContext(serverId);
    const content = `${userId}: ${moment}`;
    
    // Check for semantic duplicates before adding
    const semanticHash = this.memoryOptimizationService.generateSemanticHash(content);
    const isDuplicate = this.memoryOptimizationService.findSimilarMessages(
      context.embarrassingMoments, 
      content
    ).length > 0;
    
    if (isDuplicate) {
      logger.info(`Skipping duplicate embarrassing moment for ${userId}`);
      return;
    }
    
    // Add the moment using the memory service
    this.conversationMemoryService.addEmbarrassingMoment(context, userId, moment, semanticHash);
    this.memoryOptimizationService.incrementSize(context, content.length);
    this.memoryOptimizationService.intelligentTrim(context);
  }

  addCodeSnippet(
    serverId: string,
    userId: string,
    userMessage: string,
    code: string,
  ): void {
    const context = this.getOrCreateContext(serverId);
    const snippetContent = `${userMessage}:\n${code}`;
    
    // Check for semantic duplicates in user's code snippets
    const userSnippets = context.codeSnippets.get(userId) || [];
    const semanticHash = this.memoryOptimizationService.generateSemanticHash(snippetContent);
    const isDuplicate = this.memoryOptimizationService.findSimilarMessages(
      userSnippets, 
      snippetContent
    ).length > 0;
    
    if (isDuplicate) {
      logger.info(`Skipping duplicate code snippet for ${userId}`);
      return;
    }
    
    // Add the snippet using the memory service
    this.conversationMemoryService.addCodeSnippet(context, userId, code, userMessage, semanticHash);
    this.memoryOptimizationService.incrementSize(context, snippetContent.length);
    this.memoryOptimizationService.intelligentTrim(context);
  }

  /**
   * Builds comprehensive context using the new modular builder architecture
   * 
   * This method orchestrates multiple specialized builders to create rich context:
   * - Uses caching for improved performance
   * - Delegates to specialized builders for different context types
   * - Maintains backward compatibility with existing API
   * 
   * @param serverId - Discord server ID for context scope
   * @param userId - Target user ID for personalized context
   * @param maxLength - Maximum context length (optional)
   * @returns Formatted context string for AI consumption
   */
  buildSuperContext(serverId: string, userId: string, maxLength?: number): string {
    const context = this.serverContext.get(serverId);
    if (!context) return '';

    // OPTIMIZATION: Check cache first
    const cacheKey = `super_context_${serverId}_${userId}`;
    const cached = this.contextCacheManager.getString(cacheKey);
    if (cached) {
      return cached;
    }

    // Build context using specialized builders
    const contextParts: string[] = [];
    
    // Add header
    contextParts.push('DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n');
    
    // Use conversation builder for message history and code context
    const conversationOptions: ConversationContextOptions = {
      maxMessages: 10,
      includeCodeContext: true,
      timeWindow: 24
    };
    const conversationContext = this.conversationContextBuilder.buildConversationContext(
      context, 
      userId, 
      conversationOptions
    );
    if (conversationContext) {
      contextParts.push(conversationContext);
    }
    
    // Use user builder for personality and behavior
    const userOptions: UserContextOptions = {
      includeBehavior: true,
      includePersonality: true,
      includeEmbarrassingMoments: true,
      maxItems: 5
    };
    const userContext = this.userContextBuilder.buildUserContext(
      userId,
      context,
      undefined,
      userOptions
    );
    if (userContext) {
      contextParts.push(userContext);
    }
    
    // Use legacy composite builder for backward compatibility
    const legacyBuilder = new CompositeContextBuilder(
      context,
      userId,
      serverId,
      this.conversationMemoryService,
      this.behaviorAnalyzer,
      this.socialDynamicsService,
      this.serverContext
    );

    // Add remaining context types through legacy builder
    const legacyContext = legacyBuilder
      .addFacts()
      .addCrossServerContext()
      .addRunningGags()
      .addSocialDynamics()
      .build();
    
    if (legacyContext) {
      contextParts.push(legacyContext);
    }
    
    // Combine all context parts
    const result = contextParts.join('');
    
    // Apply length limit if specified
    const finalResult = maxLength && result.length > maxLength 
      ? result.substring(0, maxLength) + '...' 
      : result;
    
    // Store in enhanced cache with hash validation
    const contextHash = this.generateContextHash(context, userId);
    const now = Date.now();
    this.contextCache.set(cacheKey, {
      content: finalResult,
      hash: contextHash,
      timestamp: now
    });
    
    // Evict old cache entries if cache is too large
    this.evictOldCacheEntries();
    
    return finalResult;
  }



  private getOrCreateContext(serverId: string): RichContext {
    // Check if context already exists (O(1) Map lookup)
    if (!this.serverContext.has(serverId)) {
      const now = Date.now();
      
      // Initialize new RichContext with default values for all tracking categories
      const newContext: RichContext = {
        // Core conversation and content storage
        conversations: new Map(), // User conversation history by user ID
        codeSnippets: new Map(), // Code submissions organized by user ID
        embarrassingMoments: [], // Server-wide embarrassing moments for roasting
        runningGags: [], // Recurring jokes and memes specific to this server
        lastRoasted: new Map(), // Track last roast time per user for cooldown logic
        
        // Memory management and optimization tracking
        approximateSize: 0, // Cached size estimate to avoid expensive recalculation
        lastSizeUpdate: now, // Timestamp of last size cache refresh
        
        // Enhanced context features for advanced functionality
        summarizedFacts: [], // Compressed/summarized older context data
        crossServerEnabled: false, // Privacy flag for cross-server context sharing
        compressionRatio: 1.0, // Tracks memory efficiency (1.0 = no compression)
        lastSummarization: now, // Timestamp of last background summarization
        
        // Social dynamics tracking for interaction patterns
        socialGraph: new Map(), // User interaction relationships and frequencies
      };
      
      // Store the new context in server-specific storage
      this.serverContext.set(serverId, newContext);
      
      // Initialize size cache for new context (prevents expensive first calculation)
      this.memoryOptimizationService.refreshApproximateSize(newContext);
      
      // Timer management is now handled by BaseService during initialization
    }
    
    // Safe non-null assertion since we guarantee context exists above
    return this.serverContext.get(serverId)!;
  }

  addRunningGag(serverId: string, gag: string): void {
    const context = this.getOrCreateContext(serverId);
    
    // Check for semantic duplicates before adding
    const semanticHash = this.memoryOptimizationService.generateSemanticHash(gag);
    const isDuplicate = this.memoryOptimizationService.findSimilarMessages(
      context.runningGags, 
      gag
    ).length > 0;
    
    if (isDuplicate) {
      logger.info('Skipping duplicate running gag');
      return;
    }
    
    // Add the gag using the memory service
    this.conversationMemoryService.addRunningGag(context, gag, semanticHash);
    this.memoryOptimizationService.incrementSize(context, gag.length);
    
    // Intelligent trimming based on LRU
    const limits = this.conversationMemoryService.getMemoryLimits();
    if (context.runningGags.length > limits.maxRunningGags) {
      this.memoryOptimizationService.intelligentTrim(context);
    }
  }


  private performMemoryMaintenance(): void {
    const stats = this.getMemoryStats();
    
    logger.info('Memory maintenance check', {
      totalServers: stats.totalServers,
      totalMemoryUsage: stats.totalMemoryUsage,
      averageServerSize: stats.averageServerSize,
      largestServerSize: stats.largestServerSize
    });
    
    // Clean up empty servers
    for (const [serverId, context] of this.serverContext.entries()) {
      if (this.isContextEmpty(context)) {
        this.serverContext.delete(serverId);
        logger.info(`Removed empty context for server ${serverId}`);
      }
    }
    
    // Timer cleanup is now handled by BaseService automatically
  }

  private isContextEmpty(context: RichContext): boolean {
    return context.embarrassingMoments.length === 0 &&
           context.runningGags.length === 0 &&
           context.codeSnippets.size === 0 &&
           context.lastRoasted.size === 0 &&
           (context.summarizedFacts?.length || 0) === 0 &&
           context.socialGraph.size === 0;
  }

  public getMemoryStats(): MemoryStats {
    let totalMemoryUsage = 0;
    let largestServerSize = 0;
    let totalEmbarrassingMoments = 0;
    let totalCodeSnippets = 0;
    let totalRunningGags = 0;
    let totalSummarizedFacts = 0;
    let totalCompressionRatio = 0;
    const duplicatesRemoved = 0;
    
    for (const context of this.serverContext.values()) {
      // Use cached approximateSize instead of recalculating
      totalMemoryUsage += context.approximateSize;
      largestServerSize = Math.max(largestServerSize, context.approximateSize);
      
      const counts = this.conversationMemoryService.countItems(context);
      totalEmbarrassingMoments += counts.embarrassingMoments;
      totalCodeSnippets += counts.codeSnippets;
      totalRunningGags += counts.runningGags;
      totalSummarizedFacts += counts.summarizedFacts;
      totalCompressionRatio += context.compressionRatio;
    }
    
    const avgCompressionRatio = this.serverContext.size > 0 ? totalCompressionRatio / this.serverContext.size : 1.0;
    const memorySaved = totalMemoryUsage * (1 - avgCompressionRatio);
    
    return {
      totalServers: this.serverContext.size,
      totalMemoryUsage,
      averageServerSize: this.serverContext.size > 0 ? totalMemoryUsage / this.serverContext.size : 0,
      largestServerSize,
      itemCounts: {
        embarrassingMoments: totalEmbarrassingMoments,
        codeSnippets: totalCodeSnippets,
        runningGags: totalRunningGags,
        summarizedFacts: totalSummarizedFacts
      },
      compressionStats: {
        averageCompressionRatio: avgCompressionRatio,
        totalMemorySaved: memorySaved,
        duplicatesRemoved
      }
    };
  }

  // ========== BEHAVIORAL ANALYSIS INTEGRATION ==========

  /**
   * Analyze a message for behavioral patterns
   * OPTIMIZED: Fire-and-forget with promise pool
   */
  public async analyzeMessageBehavior(userId: string, message: string): Promise<void> {
    // Use promise pool for non-critical background analysis
    globalPools.context.execute(async () => {
      await this.behaviorAnalyzer.analyzeMessage(userId, message);
    }).catch(error => {
      logger.error('Failed to analyze message behavior', { error, userId });
    });
  }

  /**
   * Get behavioral pattern for a user
   */
  public getBehaviorPattern(userId: string): UserBehaviorPattern | null {
    return this.behaviorAnalyzer.getBehaviorPattern(userId);
  }

  /**
   * Get behavioral analysis statistics
   */
  public getBehaviorStats(): {
    totalUsers: number;
    activePatterns: number;
    stalePatterns: number;
    averageComplexity: number;
    averageFrequency: number;
    } {
    return this.behaviorAnalyzer.getStats();
  }


  /**
   * Performs scheduled background summarization of aging context data
   * 
   * Memory Optimization Strategy:
   * This method implements an automated content lifecycle management system
   * that compresses older context data to maintain performance while preserving
   * essential information. The summarization process:
   * 
   * 1. Identifies contexts that haven't been summarized recently (30min+ threshold)
   * 2. Delegates to MemoryOptimizationService for intelligent compression
   * 3. Updates lastSummarization timestamp to prevent frequent re-processing
   * 4. Logs summarization activity for monitoring and debugging
   * 
   * Compression Techniques:
   * - Semantic clustering of similar content items
   * - Frequency-based importance scoring
   * - Time-decay weighting for aging content
   * - Pattern extraction from repetitive data
   * 
   * Performance Benefits:
   * - Reduces memory footprint by 30-70% (tracked via compressionRatio)
   * - Maintains response speed by limiting context size
   * - Preserves essential information through intelligent summarization
   * - Prevents memory leaks in long-running bot instances
   * 
   * Scheduling Characteristics:
   * - Runs every 30 minutes via timer (SUMMARIZATION_INTERVAL)
   * - Processes all servers in sequence to avoid resource spikes
   * - Skips recently processed contexts to prevent over-compression
   * - Operates in background without blocking user interactions
   */
  private performScheduledSummarization(): void {
    const now = Date.now(); // Capture current timestamp for batch processing
    
    // Process all server contexts sequentially to avoid resource spikes
    // Sequential processing prevents memory/CPU contention during compression
    for (const [serverId, context] of this.serverContext.entries()) {
      // Skip if recently summarized to prevent over-compression and resource waste
      // The shouldSummarize method checks if 30+ minutes have passed since last summarization
      if (!this.memoryOptimizationService.shouldSummarize(context)) {
        continue; // Early termination for performance optimization
      }
      
      // Log summarization activity for monitoring and debugging purposes
      logger.info(`Performing scheduled summarization for server ${serverId}`);
      
      // Delegate to specialized service for intelligent compression algorithms
      // This service implements sophisticated content analysis and compression:
      // - Semantic clustering of similar embarrassing moments
      // - Frequency analysis for popular running gags
      // - Time-decay weighting for aging code snippets
      // - Pattern extraction from repetitive conversation data
      this.memoryOptimizationService.summarizeServerContext(context);
      
      // Update timestamp to prevent re-processing this context for 30 minutes
      // This ensures the algorithm respects the SUMMARIZATION_INTERVAL timing
      context.lastSummarization = now;
    }
  }

  /**
   * Builds cross-server context by aggregating user data across multiple Discord servers
   * @deprecated Use CrossServerContextBuilder instead
   * 
   * Cross-Server Context Sharing Architecture:
   * This method implements a privacy-conscious approach to sharing user context
   * across multiple Discord servers where the bot operates. The system:
   * 
   * Privacy & Security Features:
   * - Only includes data from servers with crossServerEnabled = true
   * - Excludes current server to prevent redundant context
   * - Limits content exposure (2 moments, 1 code snippet per server)
   * - Truncates code snippets to 100 characters to prevent sensitive data leaks
   * - Uses server ID prefixes for context source identification
   * 
   * Data Aggregation Strategy:
   * - Filters embarrassing moments by user ID presence in content
   * - Sorts code snippets by timestamp (most recent first)
   * - Sanitizes output format for consistent presentation
   * - Prevents context overload through strict item limits
   * 
   * Use Cases:
   * - Enhanced roasting capabilities across user's server participation
   * - Consistent personality recognition across communities
   * - Better context for users active in multiple related servers
   * - Improved humor continuity and relationship awareness
   * 
   * Performance Considerations:
   * - O(s * c) complexity where s = servers, c = context items per server
   * - Early termination when limits reached
   * - Minimal memory allocation through efficient filtering
   * - Non-blocking operation suitable for real-time responses
   * 
   * @param userId - Target user ID for cross-server context lookup
   * @param excludeServerId - Current server ID to exclude from results
   * @returns Formatted cross-server context string or empty string if none available
   */
  private buildCrossServerContext(userId: string, excludeServerId: string): string {
    const crossServerFacts: string[] = []; // Accumulator for cross-server context data
    
    // Iterate through all server contexts to find user-specific data
    // Time complexity: O(s * c) where s = number of servers, c = context items per server
    for (const [serverId, context] of this.serverContext.entries()) {
      // Privacy and relevance filters: skip current server and non-consenting servers
      // This prevents redundant context and respects user privacy preferences
      if (serverId === excludeServerId || !context.crossServerEnabled) {
        continue; // Early termination for performance optimization
      }
      
      // Find user-specific embarrassing moments from other servers (privacy-limited)
      // Uses simple string matching for user ID detection (performance over precision)
      const userMoments = context.embarrassingMoments
        .filter(item => item.content.includes(userId)) // O(n) filter operation
        .slice(0, 2); // Strict limit: maximum 2 moments per server to prevent context overload
      
      // Add each moment with server identification for context source tracking
      userMoments.forEach(moment => {
        crossServerFacts.push(`[Server ${serverId}] ${moment.content}`);
      });
      
      // Find user-specific code snippets (most recent only for relevance)
      const userCode = context.codeSnippets.get(userId); // O(1) Map lookup
      if (userCode && userCode.length > 0) {
        // Sort by timestamp (most recent first) for temporal relevance
        // Only include single most recent code snippet per server to limit context size
        const recentCode = userCode
          .sort((a, b) => b.timestamp - a.timestamp) // O(n log n) sort by timestamp
          .slice(0, 1); // Take only the most recent code snippet
        
        recentCode.forEach(code => {
          // Truncate code content to prevent sensitive information exposure
          // 100 character limit balances context value with privacy protection
          crossServerFacts.push(`[Server ${serverId}] Code: ${code.content.substring(0, 100)}...`);
        });
      }
    }
    
    // Return formatted context string or empty string if no cross-server data found
    // Add newline separator for proper context formatting if data exists
    return crossServerFacts.length > 0 ? crossServerFacts.join('\n') + '\n' : '';
  }

  // ========== PUBLIC API METHODS ==========

  /**
   * Enable cross-server context sharing for a user
   */
  public enableCrossServerContext(userId: string, serverId: string, enabled: boolean): void {
    const context = this.getOrCreateContext(serverId);
    context.crossServerEnabled = enabled;
    logger.info(`Cross-server context ${enabled ? 'enabled' : 'disabled'} for server ${serverId}`);
  }

  /**
   * Force summarization of a server's context
   */
  public summarizeServerContextNow(serverId: string): boolean {
    const context = this.serverContext.get(serverId);
    if (!context) return false;
    
    this.memoryOptimizationService.summarizeServerContext(context);
    return true;
  }

  /**
   * Get compression statistics for a server
   */
  public getServerCompressionStats(serverId: string): { compressionRatio: number; memorySaved: number } | null {
    const context = this.serverContext.get(serverId);
    if (!context) return null;
    
    return this.memoryOptimizationService.getCompressionStats(context);
  }

  /**
   * Manual deduplication of a server's context
   */
  public deduplicateServerContext(serverId: string): { removed: number; duplicates: string[] } {
    const context = this.serverContext.get(serverId);
    if (!context) return { removed: 0, duplicates: [] };
    
    const removedCount = this.memoryOptimizationService.deduplicateServerContext(context);
    return { removed: removedCount, duplicates: [] };
  }

  // ========== SOCIAL DYNAMICS TRACKING ==========

  /**
   * Update social graph with an interaction between users
   */
  public updateSocialGraph(
    serverId: string,
    userId: string,
    targetUserId: string,
    interactionType: 'mention' | 'reply' | 'roast'
  ): void {
    const context = this.getOrCreateContext(serverId);
    this.socialDynamicsService.updateSocialGraph(context, userId, targetUserId, interactionType);
  }

  /**
   * Get top interactions for a user
   */
  public getTopInteractions(
    serverId: string,
    userId: string,
    limit: number = 5
  ): Array<{ userId: string; count: number; type: string }> {
    const context = this.serverContext.get(serverId);
    if (!context) return [];
    
    return this.socialDynamicsService.getTopInteractions(context, userId, limit);
  }

  /**
   * Get recent interactions for including in context
   */
  public getRecentInteractions(
    serverId: string,
    userId: string,
    hoursAgo: number = 24
  ): string[] {
    const context = this.serverContext.get(serverId);
    if (!context) return [];
    
    return this.socialDynamicsService.getRecentInteractions(context, userId, hoursAgo);
  }
  
  /**
   * Calculate Discord data storage size
   */
  public getDiscordDataStorageStats(): {
    cacheEntries: number;
    estimatedSizeBytes: number;
    estimatedSizeMB: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    serverBreakdown: Map<string, number>;
    } {
    const serverBreakdown = new Map<string, number>();
    let totalSize = 0;
    let oldestEntry: Date | null = null;
    let newestEntry: Date | null = null;
    let cacheEntries = 0;
    
    // Calculate social graph data size for each server
    this.serverContext.forEach((context, serverId) => {
      const socialGraphSize = this.socialDynamicsService.calculateSocialGraphSize(context);
      serverBreakdown.set(serverId, socialGraphSize);
      totalSize += socialGraphSize;
      cacheEntries += 1;
      
      // Track oldest/newest entries based on context items
      context.embarrassingMoments.forEach(item => {
        if (!oldestEntry || item.timestamp < oldestEntry.getTime()) {
          oldestEntry = new Date(item.timestamp);
        }
        if (!newestEntry || item.timestamp > newestEntry.getTime()) {
          newestEntry = new Date(item.timestamp);
        }
      });
    });
    
    return {
      cacheEntries,
      estimatedSizeBytes: totalSize,
      estimatedSizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
      oldestEntry,
      newestEntry,
      serverBreakdown,
    };
  }
  
  /**
   * Clean up old Discord cache entries
   * @deprecated User context has been removed
   */
  public cleanupDiscordCache(_maxAge?: number): number {
    // User context functionality has been removed
    return 0;
  }
  
  /**
   * Build Discord user context from a GuildMember
   * @deprecated User context has been removed
   */
  public buildDiscordUserContext(_member: GuildMember, _includeServerData: boolean = false): string {
    // User context functionality has been removed
    return '';
  }

  // ========== SERVER CULTURE CONTEXT METHODS ==========

  /**
   * Build server culture context from a Guild using the new server builder
   */
  public buildServerCultureContext(guild: Guild): string {
    const context = this.getOrCreateContext(guild.id);
    
    const serverOptions: ServerContextOptions = {
      includeChannels: true,
      includeRoles: true,
      includeCulture: true,
      includeRunningGags: true,
      maxItems: 10
    };
    
    return this.serverContextBuilder.buildServerContext(guild, context, serverOptions);
  }

  /**
   * Get server culture data from cache or build new
   */
  public getServerCulture(guildId: string): ServerCulture | null {
    return this.channelContextService.getServerCulture(guildId);
  }

  /**
   * Save server culture data to cache
   */
  public saveServerCulture(guildId: string, culture: ServerCulture): void {
    this.channelContextService.saveServerCulture(guildId, culture);
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    logger.info('ContextManager initialized successfully');
  }

  /**
   * Shutdown the service and clean up resources
   */
  // ========== MISSING INTERFACE METHODS ==========

  /**
   * Initializes context storage for a server
   */
  initializeServerContext(serverId: string): void {
    this.getOrCreateContext(serverId);
    logger.info(`Initialized context for server ${serverId}`);
  }

  /**
   * Retrieves server context data
   */
  getServerContext(serverId: string): ServerContext | undefined {
    const context = this.serverContext.get(serverId);
    if (!context) return undefined;

    // Convert RichContext to ServerContext format
    const embarrassingMomentsMap = new Map<string, string[]>();
    const codeSnippetsMap = new Map<string, CodeSnippet[]>();

    // Group embarrassing moments by user
    context.embarrassingMoments.forEach(moment => {
      const userId = moment.content.split(':')[0]; // Extract user ID from content
      if (!embarrassingMomentsMap.has(userId)) {
        embarrassingMomentsMap.set(userId, []);
      }
      embarrassingMomentsMap.get(userId)!.push(moment.content);
    });

    // Convert code snippets to interface format
    context.codeSnippets.forEach((snippets, userId) => {
      const convertedSnippets: CodeSnippet[] = snippets.map(snippet => ({
        timestamp: snippet.timestamp,
        userMessage: snippet.content.split('\n')[0] || '',
        code: snippet.content.split('\n').slice(1).join('\n')
      }));
      codeSnippetsMap.set(userId, convertedSnippets);
    });

    // Convert summarized facts to interface format
    const summarizedFacts: SummarizedFact[] = context.summarizedFacts.map(fact => ({
      fact: fact.content,
      timestamp: fact.timestamp,
      importance: 5, // Default importance
      userIds: [] // Default empty array
    }));

    return {
      serverId,
      embarrassingMoments: embarrassingMomentsMap,
      codeSnippets: codeSnippetsMap,
      runningGags: context.runningGags.map(gag => gag.content),
      summarizedFacts,
      lastSummarized: context.lastSummarization,
      compressionStats: {
        originalSize: context.approximateSize,
        compressedSize: Math.floor(context.approximateSize * context.compressionRatio),
        compressionRatio: context.compressionRatio
      }
    };
  }

  /**
   * Stores summarized fact with importance weighting
   */
  addSummarizedFact(serverId: string, fact: string, importance: number = 5): void {
    const context = this.getOrCreateContext(serverId);
    
    // Check for semantic duplicates
    const semanticHash = this.memoryOptimizationService.generateSemanticHash(fact);
    const isDuplicate = this.memoryOptimizationService.findSimilarMessages(
      context.summarizedFacts,
      fact
    ).length > 0;
    
    if (isDuplicate) {
      logger.info('Skipping duplicate summarized fact');
      return;
    }
    
    // Add the fact using the memory service
    this.conversationMemoryService.addSummarizedFact(context, fact, importance, semanticHash);
    this.memoryOptimizationService.incrementSize(context, fact.length);
    this.memoryOptimizationService.intelligentTrim(context);
  }

  /**
   * Bulk operations - summarize and compress context
   */
  async summarizeAndCompress(serverId: string): Promise<{ removed: number; kept: number }> {
    const context = this.serverContext.get(serverId);
    if (!context) return { removed: 0, kept: 0 };
    
    // const initialSize = context.approximateSize; // For future use in logging
    const initialItemCount = this.conversationMemoryService.countItems(context);
    const totalInitialItems = initialItemCount.embarrassingMoments + 
                             initialItemCount.codeSnippets + 
                             initialItemCount.runningGags + 
                             initialItemCount.summarizedFacts;
    
    // Perform summarization
    this.memoryOptimizationService.summarizeServerContext(context);
    
    const finalItemCount = this.conversationMemoryService.countItems(context);
    const totalFinalItems = finalItemCount.embarrassingMoments + 
                           finalItemCount.codeSnippets + 
                           finalItemCount.runningGags + 
                           finalItemCount.summarizedFacts;
    
    const removed = totalInitialItems - totalFinalItems;
    const kept = totalFinalItems;
    
    logger.info(`Summarization completed for server ${serverId}`, {
      removed,
      kept,
      compressionRatio: context.compressionRatio
    });
    
    return { removed, kept };
  }

  /**
   * Builds smart context using AI-powered relevance scoring
   */
  buildSmartContext(serverId: string, userId: string, currentMessage: string): string {
    const context = this.serverContext.get(serverId);
    if (!context) return '';

    const contextParts: string[] = [];
    const now = Date.now();

    // Analyze current message for keywords and topics
    const messageKeywords = currentMessage.toLowerCase().split(/\s+/);
    const relevantKeywords = ['code', 'error', 'bug', 'help', 'problem', 'issue', 'javascript', 'python', 'react'];
    const hasCodeContext = messageKeywords.some(word => relevantKeywords.includes(word));

    contextParts.push('SMART CONTEXT ANALYSIS:\n\n');

    // Prioritize relevant facts based on current message
    if (context.summarizedFacts.length > 0) {
      const relevantFacts = context.summarizedFacts
        .filter(fact => {
          const factContent = fact.content.toLowerCase();
          return messageKeywords.some(keyword => factContent.includes(keyword));
        })
        .slice(0, 5);
      
      if (relevantFacts.length > 0) {
        contextParts.push('RELEVANT FACTS:\n');
        relevantFacts.forEach(fact => {
          fact.accessCount++;
          fact.lastAccessed = now;
          contextParts.push(`- ${fact.content}\n`);
        });
        contextParts.push('\n');
      }
    }

    // Include code context if relevant
    if (hasCodeContext) {
      const userCode = context.codeSnippets.get(userId);
      if (userCode && userCode.length > 0) {
        contextParts.push('RELEVANT CODE HISTORY:\n');
        const recentCode = userCode
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 3);
        
        recentCode.forEach(snippet => {
          snippet.accessCount++;
          snippet.lastAccessed = now;
          contextParts.push(`${snippet.content}\n---\n`);
        });
      }
    }

    // Add recent social dynamics if relevant
    const socialContext = this.socialDynamicsService.buildSocialDynamicsContext(context, userId);
    if (socialContext) {
      contextParts.push(socialContext);
    }

    return contextParts.join('');
  }

  /**
   * Check if global context is enabled
   */
  isGlobalContextEnabled(): boolean {
    return this.globalContextEnabled;
  }

  /**
   * Enable global context sharing
   */
  enableGlobalContext(): void {
    this.globalContextEnabled = true;
    logger.info('Global context sharing enabled');
  }

  /**
   * Disable global context sharing
   */
  disableGlobalContext(): void {
    this.globalContextEnabled = false;
    logger.info('Global context sharing disabled');
  }

  /**
   * Get cross-server insights for a user
   */
  /**
   * Generate a hash of the context for cache validation
   */
  private generateContextHash(context: RichContext, userId: string): string {
    // Simple hash based on key data points
    const factors = [
      context.embarrassingMoments.length,
      context.runningGags.length,
      context.codeSnippets.get(userId)?.length || 0,
      context.lastSummarization,
      context.approximateSize
    ];
    return factors.join('-');
  }
  
  /**
   * Evict old cache entries when cache grows too large
   */
  private evictOldCacheEntries(): void {
    if (this.contextCache.size <= this.CONTEXT_CACHE_MAX_ENTRIES) {
      return;
    }
    
    // Sort entries by timestamp and remove oldest
    const entries = Array.from(this.contextCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, entries.length - this.CONTEXT_CACHE_MAX_ENTRIES);
    toRemove.forEach(([key]) => this.contextCache.delete(key));
    
    logger.info(`Evicted ${toRemove.length} old cache entries`);
  }
  
  /**
   * Perform stale data cleanup - removes data older than 30 days
   */
  private performStaleDataCleanup(): void {
    const now = Date.now();
    const staleThreshold = now - (this.STALE_DATA_DAYS * 24 * 60 * 60 * 1000);
    let cleanedServers = 0;
    let totalItemsRemoved = 0;
    
    for (const [, context] of this.serverContext.entries()) {
      let itemsRemoved = 0;
      
      // Clean up embarrassing moments
      const freshMoments = context.embarrassingMoments.filter(item => item.timestamp > staleThreshold);
      itemsRemoved += context.embarrassingMoments.length - freshMoments.length;
      context.embarrassingMoments = freshMoments;
      
      // Clean up running gags
      const freshGags = context.runningGags.filter(item => item.timestamp > staleThreshold);
      itemsRemoved += context.runningGags.length - freshGags.length;
      context.runningGags = freshGags;
      
      // Clean up code snippets
      for (const [userId, snippets] of context.codeSnippets.entries()) {
        const freshSnippets = snippets.filter(item => item.timestamp > staleThreshold);
        if (freshSnippets.length === 0) {
          context.codeSnippets.delete(userId);
          itemsRemoved += snippets.length;
        } else if (freshSnippets.length < snippets.length) {
          context.codeSnippets.set(userId, freshSnippets);
          itemsRemoved += snippets.length - freshSnippets.length;
        }
      }
      
      // Clean up summarized facts
      const freshFacts = context.summarizedFacts.filter(item => item.timestamp > staleThreshold);
      itemsRemoved += context.summarizedFacts.length - freshFacts.length;
      context.summarizedFacts = freshFacts;
      
      // Clean up social graph entries
      for (const [userId, graph] of context.socialGraph.entries()) {
        let hasRecentInteraction = false;
        for (const [, lastInteraction] of graph.lastInteraction.entries()) {
          if (lastInteraction.getTime() > staleThreshold) {
            hasRecentInteraction = true;
            break;
          }
        }
        if (!hasRecentInteraction) {
          context.socialGraph.delete(userId);
          itemsRemoved++;
        }
      }
      
      if (itemsRemoved > 0) {
        cleanedServers++;
        totalItemsRemoved += itemsRemoved;
        // Refresh size after cleanup
        this.memoryOptimizationService.refreshApproximateSize(context);
      }
    }
    
    if (totalItemsRemoved > 0) {
      logger.info('Stale data cleanup completed', {
        serversCleanedUp: cleanedServers,
        totalItemsRemoved,
        staleThresholdDays: this.STALE_DATA_DAYS
      });
    }
  }
  
  /**
   * Monitor heap memory usage and trigger aggressive cleanup if needed
   */
  private monitorMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const externalMB = Math.round(memoryUsage.external / 1024 / 1024);
    
    // Log memory stats periodically
    logger.info('Memory usage stats', {
      heapUsedMB,
      heapTotalMB,
      externalMB,
      serverCount: this.serverContext.size,
      cacheEntries: this.contextCache.size
    });
    
    // Warning threshold
    if (heapUsedMB > this.MEMORY_WARNING_THRESHOLD_MB) {
      logger.warn(`Memory usage warning: ${heapUsedMB}MB used (threshold: ${this.MEMORY_WARNING_THRESHOLD_MB}MB)`);
    }
    
    // Critical threshold - trigger aggressive cleanup
    if (heapUsedMB > this.MEMORY_CRITICAL_THRESHOLD_MB) {
      logger.error(`Memory usage critical: ${heapUsedMB}MB used (threshold: ${this.MEMORY_CRITICAL_THRESHOLD_MB}MB)`);
      this.performAggressiveCleanup();
    }
  }
  
  /**
   * Perform aggressive memory cleanup when memory usage is critical
   */
  private performAggressiveCleanup(): void {
    logger.warn('Starting aggressive memory cleanup');
    
    // Clear all caches
    this.contextCache.clear();
    this.contextCacheManager.clear();
    
    // Force summarization on all contexts
    for (const [, context] of this.serverContext.entries()) {
      this.memoryOptimizationService.summarizeServerContext(context);
    }
    
    // Clear builder caches
    this.userContextBuilder.clearAllCaches();
    this.serverContextBuilder.clearAllCaches();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      logger.info('Forced garbage collection');
    }
    
    logger.info('Aggressive memory cleanup completed');
  }
  
  getCrossServerInsights(userId: string): CrossServerInsights {
    const globalPatterns: string[] = [];
    let totalInteractions = 0;
    let mostActiveServer = '';
    let maxInteractions = 0;

    for (const [serverId, context] of this.serverContext.entries()) {
      // Count user interactions in this server
      let serverInteractions = 0;
      
      // Count embarrassing moments
      const userMoments = context.embarrassingMoments.filter(moment => 
        moment.content.includes(userId)
      );
      serverInteractions += userMoments.length;
      
      // Count code snippets
      const userCode = context.codeSnippets.get(userId);
      if (userCode) {
        serverInteractions += userCode.length;
      }
      
      // Track most active server
      if (serverInteractions > maxInteractions) {
        maxInteractions = serverInteractions;
        mostActiveServer = serverId;
      }
      
      totalInteractions += serverInteractions;
      
      // Extract patterns from user behavior
      if (userMoments.length > 0) {
        globalPatterns.push(`Active in server ${serverId} with ${userMoments.length} memorable moments`);
      }
      if (userCode && userCode.length > 0) {
        globalPatterns.push(`Shared ${userCode.length} code snippets in server ${serverId}`);
      }
    }

    return {
      userId,
      globalPatterns,
      serverCount: this.serverContext.size,
      mostActiveServer: mostActiveServer || undefined,
      totalInteractions
    };
  }

  /**
   * Get the size of a server's context in bytes
   */
  getServerContextSize(serverId: string): number {
    const context = this.serverContext.get(serverId);
    if (!context) return 0;
    
    return context.approximateSize;
  }

  /**
   * Get importance threshold for a server (stub implementation)
   */
  getImportanceThreshold(_serverId: string): number {
    // Default importance threshold
    return 5;
  }

  /**
   * Get health status of the ContextManager service
   */
  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();

    try {
      // Check domain services health
      if (!this.conversationMemoryService) {
        errors.push('ConversationMemoryService not initialized');
      }

      if (!this.channelContextService) {
        errors.push('ChannelContextService not initialized');
      }

      if (!this.socialDynamicsService) {
        errors.push('SocialDynamicsService not initialized');
      }

      if (!this.memoryOptimizationService) {
        errors.push('MemoryOptimizationService not initialized');
      }

      if (!this.behaviorAnalyzer) {
        errors.push('BehaviorAnalyzer not initialized');
      }

    } catch (error) {
      errors.push(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return errors;
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    const stats = this.getMemoryStats();
    const cacheStats = this.contextCacheManager.getStats();

    return {
      context: {
        totalServers: stats.totalServers,
        totalMemoryUsage: stats.totalMemoryUsage,
        averageServerSize: stats.averageServerSize,
        globalContextEnabled: this.globalContextEnabled,
        itemCounts: stats.itemCounts,
        compressionStats: stats.compressionStats
      },
      cache: {
        hitRate: cacheStats.hitRate,
        missRate: cacheStats.missRate,
        entryCount: cacheStats.entryCount,
        totalSize: cacheStats.totalSize
      }
    };
  }

  // ========== NEW BUILDER ACCESS METHODS ==========

  /**
   * Get the conversation context builder for advanced usage
   */
  public getConversationBuilder(): ConversationContextBuilder {
    return this.conversationContextBuilder;
  }

  /**
   * Get the server context builder for advanced usage
   */
  public getServerBuilder(): ServerContextBuilder {
    return this.serverContextBuilder;
  }

  /**
   * Get the user context builder for advanced usage
   */
  public getUserBuilder(): UserContextBuilder {
    return this.userContextBuilder;
  }

  /**
   * Get the cache manager for advanced cache operations
   */
  public getCacheManager(): ContextCacheManager {
    return this.contextCacheManager;
  }

  /**
   * Build enhanced conversation context
   */
  public buildConversationContext(
    serverId: string,
    userId: string,
    options?: ConversationContextOptions
  ): string {
    const context = this.serverContext.get(serverId);
    if (!context) return '';
    
    return this.conversationContextBuilder.buildConversationContext(context, userId, options);
  }

  /**
   * Build enhanced user context with personality mapping
   */
  public buildUserContext(
    serverId: string,
    userId: string,
    member?: GuildMember,
    options?: UserContextOptions
  ): string {
    const context = this.serverContext.get(serverId);
    if (!context) return '';
    
    return this.userContextBuilder.buildUserContext(userId, context, member, options);
  }
}