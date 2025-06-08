/**
 * @file ContextManager - Coordinates between domain-specific context services
 * @module services/contextManager
 */

import { logger } from '../utils/logger';
import { GuildMember, Guild } from 'discord.js';
import { BehaviorAnalyzer, UserBehaviorPattern } from './behaviorAnalyzer';
import { 
  ContextItem, 
  RichContext, 
  MemoryStats, 
  SocialGraph, 
  ServerCulture 
} from './context/types';
import { ConversationMemoryService } from './context/ConversationMemoryService';
import { UserContextService } from './context/UserContextService';
import { ChannelContextService } from './context/ChannelContextService';
import { SocialDynamicsService } from './context/SocialDynamicsService';
import { MemoryOptimizationService } from './context/MemoryOptimizationService';

// Re-export types for backward compatibility
export { 
  ContextItem, 
  RichContext, 
  MemoryStats, 
  SocialGraph, 
  ServerCulture 
};

// ========== CONTEXT BUILDER PATTERN ==========

interface ContextBuilder {
  addContext(parts: string[]): this;
  build(): string[];
}

class FactsContextBuilder implements ContextBuilder {
  private context: RichContext;
  private userId: string;
  private conversationMemoryService: ConversationMemoryService;
  private now: number;

  constructor(
    context: RichContext, 
    userId: string, 
    conversationMemoryService: ConversationMemoryService,
    now: number
  ) {
    this.context = context;
    this.userId = userId;
    this.conversationMemoryService = conversationMemoryService;
    this.now = now;
  }

  addContext(parts: string[]): this {
    if (this.context.summarizedFacts.length > 0) {
      parts.push('KEY FACTS & RELATIONSHIPS:\n');
      const relevantFacts = this.conversationMemoryService.selectRelevantItems(
        this.context.summarizedFacts, this.userId, 10
      );
      relevantFacts.forEach((factItem) => {
        factItem.accessCount++;
        factItem.lastAccessed = this.now;
        parts.push(`- ${factItem.content}\n`);
      });
      parts.push('\n');
    }
    return this;
  }

  build(): string[] {
    return [];
  }
}

class BehaviorContextBuilder implements ContextBuilder {
  private behaviorAnalyzer: BehaviorAnalyzer;
  private userId: string;

  constructor(behaviorAnalyzer: BehaviorAnalyzer, userId: string) {
    this.behaviorAnalyzer = behaviorAnalyzer;
    this.userId = userId;
  }

  addContext(parts: string[]): this {
    const behaviorContext = this.behaviorAnalyzer.getBehaviorContext(this.userId);
    if (behaviorContext) {
      parts.push(behaviorContext);
      parts.push('\n');
    }
    return this;
  }

  build(): string[] {
    return [];
  }
}

class EmbarrassingMomentsContextBuilder implements ContextBuilder {
  private context: RichContext;
  private userId: string;
  private conversationMemoryService: ConversationMemoryService;
  private now: number;

  constructor(
    context: RichContext, 
    userId: string, 
    conversationMemoryService: ConversationMemoryService,
    now: number
  ) {
    this.context = context;
    this.userId = userId;
    this.conversationMemoryService = conversationMemoryService;
    this.now = now;
  }

  addContext(parts: string[]): this {
    if (this.context.embarrassingMoments.length > 0) {
      parts.push('HALL OF SHAME:\n');
      const relevantMoments = this.conversationMemoryService.selectRelevantItems(
        this.context.embarrassingMoments, this.userId, 15
      );
      relevantMoments.forEach((momentItem) => {
        momentItem.accessCount++;
        momentItem.lastAccessed = this.now;
        parts.push(`- ${momentItem.content}\n`);
      });
      parts.push('\n');
    }
    return this;
  }

  build(): string[] {
    return [];
  }
}

class CodeSnippetsContextBuilder implements ContextBuilder {
  private context: RichContext;
  private userId: string;
  private conversationMemoryService: ConversationMemoryService;
  private now: number;

  constructor(
    context: RichContext, 
    userId: string, 
    conversationMemoryService: ConversationMemoryService,
    now: number
  ) {
    this.context = context;
    this.userId = userId;
    this.conversationMemoryService = conversationMemoryService;
    this.now = now;
  }

  addContext(parts: string[]): this {
    const userCode = this.context.codeSnippets.get(this.userId);
    if (userCode && userCode.length > 0) {
      parts.push(`${this.userId}'S TERRIBLE CODE HISTORY:\n`);
      const relevantCode = this.conversationMemoryService.selectRelevantItems(
        userCode, this.userId, 10
      );
      relevantCode.forEach((snippetItem) => {
        snippetItem.accessCount++;
        snippetItem.lastAccessed = this.now;
        parts.push(`${snippetItem.content}\n---\n`);
      });
    }
    return this;
  }

  build(): string[] {
    return [];
  }
}

class SocialDynamicsContextBuilder implements ContextBuilder {
  private socialDynamicsService: SocialDynamicsService;
  private context: RichContext;
  private userId: string;

  constructor(
    socialDynamicsService: SocialDynamicsService,
    context: RichContext,
    userId: string
  ) {
    this.socialDynamicsService = socialDynamicsService;
    this.context = context;
    this.userId = userId;
  }

  addContext(parts: string[]): this {
    const socialDynamicsContext = this.socialDynamicsService.buildSocialDynamicsContext(this.context, this.userId);
    if (socialDynamicsContext) {
      parts.push(socialDynamicsContext);
    }
    return this;
  }

  build(): string[] {
    return [];
  }
}

export class ContextManager {
  private serverContext: Map<string, RichContext> = new Map();
  private behaviorAnalyzer: BehaviorAnalyzer = new BehaviorAnalyzer();
  
  // Domain services
  private conversationMemoryService: ConversationMemoryService;
  private userContextService: UserContextService;
  private channelContextService: ChannelContextService;
  private socialDynamicsService: SocialDynamicsService;
  private memoryOptimizationService: MemoryOptimizationService;
  
  // Timers
  private readonly MEMORY_CHECK_INTERVAL = 300000; // 5 minutes
  private readonly SUMMARIZATION_INTERVAL = 1800000; // 30 minutes
  private memoryCheckTimer: NodeJS.Timeout | null = null;
  private summarizationTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    // Initialize domain services
    this.conversationMemoryService = new ConversationMemoryService();
    this.userContextService = new UserContextService();
    this.channelContextService = new ChannelContextService();
    this.socialDynamicsService = new SocialDynamicsService();
    this.memoryOptimizationService = new MemoryOptimizationService(this.conversationMemoryService);
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
    code: string,
    description: string,
  ): void {
    const context = this.getOrCreateContext(serverId);
    const snippetContent = `${description}:\n${code}`;
    
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
    this.conversationMemoryService.addCodeSnippet(context, userId, code, description, semanticHash);
    this.memoryOptimizationService.incrementSize(context, snippetContent.length);
    this.memoryOptimizationService.intelligentTrim(context);
  }

  buildSuperContext(serverId: string, userId: string): string {
    const context = this.serverContext.get(serverId);
    if (!context) return '';

    const parts: string[] = ['DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n'];
    const now = Date.now();

    // Use builder pattern with fluent chaining
    new FactsContextBuilder(context, userId, this.conversationMemoryService, now)
      .addContext(parts);

    this.addCrossServerContext(parts, context, userId, serverId);

    new BehaviorContextBuilder(this.behaviorAnalyzer, userId)
      .addContext(parts);

    new EmbarrassingMomentsContextBuilder(context, userId, this.conversationMemoryService, now)
      .addContext(parts);

    new CodeSnippetsContextBuilder(context, userId, this.conversationMemoryService, now)
      .addContext(parts);

    this.addRunningGags(parts, context, userId, now);

    new SocialDynamicsContextBuilder(this.socialDynamicsService, context, userId)
      .addContext(parts);

    return parts.join('');
  }

  private addCrossServerContext(
    parts: string[], 
    context: RichContext, 
    userId: string, 
    serverId: string
  ): void {
    if (context.crossServerEnabled) {
      const crossServerContext = this.buildCrossServerContext(userId, serverId);
      if (crossServerContext) {
        parts.push('CROSS-SERVER INTELLIGENCE:\n');
        parts.push(crossServerContext);
        parts.push('\n');
      }
    }
  }

  private addRunningGags(
    parts: string[], 
    context: RichContext, 
    userId: string, 
    now: number
  ): void {
    if (context.runningGags.length > 0) {
      parts.push('RUNNING GAGS TO REFERENCE:\n');
      const relevantGags = this.conversationMemoryService.selectRelevantItems(
        context.runningGags, userId, 8
      );
      relevantGags.forEach((gagItem) => {
        gagItem.accessCount++;
        gagItem.lastAccessed = now;
        parts.push(`- ${gagItem.content}\n`);
      });
      parts.push('\n');
    }
  }

  private getOrCreateContext(serverId: string): RichContext {
    if (!this.serverContext.has(serverId)) {
      const now = Date.now();
      const newContext: RichContext = {
        conversations: new Map(),
        codeSnippets: new Map(),
        embarrassingMoments: [],
        runningGags: [],
        lastRoasted: new Map(),
        approximateSize: 0,
        lastSizeUpdate: now,
        // Enhanced context features
        summarizedFacts: [],
        crossServerEnabled: false,
        compressionRatio: 1.0,
        lastSummarization: now,
        // Social dynamics tracking
        socialGraph: new Map(),
      };
      this.serverContext.set(serverId, newContext);
      
      // Initialize size cache for new context
      this.memoryOptimizationService.refreshApproximateSize(newContext);
      
      // Start memory monitoring if this is the first server
      if (this.serverContext.size === 1 && !this.memoryCheckTimer) {
        this.startMemoryMonitoring();
        this.startSummarizationScheduler();
      }
    }
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

  private startMemoryMonitoring(): void {
    this.memoryCheckTimer = setInterval(() => {
      this.performMemoryMaintenance();
    }, this.MEMORY_CHECK_INTERVAL);
  }

  private startSummarizationScheduler(): void {
    this.summarizationTimer = setInterval(() => {
      this.performScheduledSummarization();
    }, this.SUMMARIZATION_INTERVAL);
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
    
    // Stop monitoring if no servers remain
    if (this.serverContext.size === 0 && this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
      logger.info('Stopped memory monitoring - no active servers');
    }
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
   */
  public async analyzeMessageBehavior(userId: string, message: string): Promise<void> {
    await this.behaviorAnalyzer.analyzeMessage(userId, message);
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

  public cleanup(): void {
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
    if (this.summarizationTimer) {
      clearInterval(this.summarizationTimer);
      this.summarizationTimer = null;
    }
    
    // Clean up behavioral analyzer
    this.behaviorAnalyzer.cleanup();
    
    // Clean up domain services
    this.userContextService.cleanup();
    this.channelContextService.cleanup();
    
    this.serverContext.clear();
    logger.info('ContextManager cleanup completed');
  }

  /**
   * Perform scheduled summarization of old content
   */
  private performScheduledSummarization(): void {
    const now = Date.now();
    
    for (const [serverId, context] of this.serverContext.entries()) {
      // Skip if recently summarized
      if (!this.memoryOptimizationService.shouldSummarize(context)) {
        continue;
      }
      
      logger.info(`Performing scheduled summarization for server ${serverId}`);
      this.memoryOptimizationService.summarizeServerContext(context);
      context.lastSummarization = now;
    }
  }

  /**
   * Build cross-server context for a user (if enabled)
   */
  private buildCrossServerContext(userId: string, excludeServerId: string): string {
    const crossServerFacts: string[] = [];
    
    for (const [serverId, context] of this.serverContext.entries()) {
      if (serverId === excludeServerId || !context.crossServerEnabled) {
        continue;
      }
      
      // Find user-specific embarrassing moments from other servers
      const userMoments = context.embarrassingMoments
        .filter(item => item.content.includes(userId))
        .slice(0, 2); // Limit to prevent overload
      
      userMoments.forEach(moment => {
        crossServerFacts.push(`[Server ${serverId}] ${moment.content}`);
      });
      
      // Find user-specific code snippets
      const userCode = context.codeSnippets.get(userId);
      if (userCode && userCode.length > 0) {
        const recentCode = userCode
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 1); // Just the most recent
        
        recentCode.forEach(code => {
          crossServerFacts.push(`[Server ${serverId}] Code: ${code.content.substring(0, 100)}...`);
        });
      }
    }
    
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
  public deduplicateServerContext(serverId: string): number {
    const context = this.serverContext.get(serverId);
    if (!context) return 0;
    
    return this.memoryOptimizationService.deduplicateServerContext(context);
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
    const userStats = this.userContextService.getDiscordDataStorageStats();
    const serverBreakdown = new Map(userStats.serverBreakdown);
    
    // Add social graph data size
    this.serverContext.forEach((context, serverId) => {
      const socialGraphSize = this.socialDynamicsService.calculateSocialGraphSize(context);
      serverBreakdown.set(serverId, (serverBreakdown.get(serverId) || 0) + socialGraphSize);
    });
    
    const totalSize = userStats.estimatedSizeBytes + 
      Array.from(serverBreakdown.values()).reduce((acc, size) => acc + size, 0) - 
      userStats.estimatedSizeBytes;
    
    return {
      cacheEntries: userStats.cacheEntries,
      estimatedSizeBytes: totalSize,
      estimatedSizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
      oldestEntry: userStats.oldestEntry,
      newestEntry: userStats.newestEntry,
      serverBreakdown,
    };
  }
  
  /**
   * Clean up old Discord cache entries
   */
  public cleanupDiscordCache(maxAge?: number): number {
    return this.userContextService.cleanupDiscordCache(maxAge);
  }
  
  /**
   * Build Discord user context from a GuildMember
   */
  public buildDiscordUserContext(member: GuildMember, includeServerData: boolean = false): string {
    return this.userContextService.buildDiscordUserContext(member, includeServerData);
  }

  // ========== SERVER CULTURE CONTEXT METHODS ==========

  /**
   * Build server culture context from a Guild
   */
  public buildServerCultureContext(guild: Guild): string {
    return this.channelContextService.buildServerCultureContext(guild);
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
  async shutdown(): Promise<void> {
    this.cleanup();
  }
}