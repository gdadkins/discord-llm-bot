/**
 * @file ContextManager - Orchestrates context building and management
 * @module services/contextManager
 */

import { logger } from '../../utils/logger';
import { BaseService } from '../base/BaseService';
import { GuildMember, Guild } from 'discord.js';
import { UserBehaviorPattern } from '../analytics/behavior';
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
import { BehaviorAnalysisService } from './components/BehaviorAnalysisService';
import { ContextStorageService } from './components/ContextStorageService';
import { ContextSummarizer } from './components/ContextSummarizer';

// Re-export types for backward compatibility
export {
  ContextItem,
  RichContext,
  MemoryStats,
  SocialGraph,
  ServerCulture
};

export class ContextManager extends BaseService implements IContextManager {
  // Global context enablement state
  private globalContextEnabled: boolean = false;

  // specialized builders
  private conversationContextBuilder: ConversationContextBuilder;
  private serverContextBuilder: ServerContextBuilder;
  private userContextBuilder: UserContextBuilder;
  private contextCacheManager: ContextCacheManager;

  // Timers
  private readonly MEMORY_CHECK_INTERVAL = 300000; // 5 minutes
  private readonly SUMMARIZATION_INTERVAL = 1800000; // 30 minutes
  private readonly STALE_DATA_CLEANUP_INTERVAL = 3600000; // 1 hour
  private readonly MEMORY_MONITOR_INTERVAL = 30000; // 30 seconds

  // Context cache configuration
  private readonly CONTEXT_CACHE_MAX_ENTRIES = 1000;
  private contextCache: Map<string, { content: string; hash: string; timestamp: number }> = new Map();

  constructor(
    private behaviorAnalysisService: BehaviorAnalysisService,
    private contextStorageService: ContextStorageService,
    private contextSummarizer: ContextSummarizer,
    private conversationMemoryService: ConversationMemoryService,
    private channelContextService: ChannelContextService,
    private socialDynamicsService: SocialDynamicsService,
    private memoryOptimizationService: MemoryOptimizationService
  ) {
    super();

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
      // We need to access the internal analyzer for the builder until we refactor the builder too
      // Ideally BehaviorAnalysisService exposes what is needed or we mock/proxy
      // For now, let's assume BehaviorAnalysisService wraps everything needed
      // Actually UserContextBuilder expects BehaviorAnalyzer. 
      // We should probably update UserContextBuilder to take the service or the analyzer from the service.
      (this.behaviorAnalysisService as any).behaviorAnalyzer,
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
      this.contextStorageService.performMemoryMaintenance();
    }, this.MEMORY_CHECK_INTERVAL);

    // Start summarization scheduler
    this.createInterval('summarization', () => {
      this.contextSummarizer.performScheduledSummarization();
    }, this.SUMMARIZATION_INTERVAL);

    // Start stale data cleanup
    this.createInterval('staleDataCleanup', () => {
      this.contextStorageService.performStaleDataCleanup();
    }, this.STALE_DATA_CLEANUP_INTERVAL);

    // Start memory usage monitoring
    this.createInterval('memoryUsageMonitor', () => {
      this.contextStorageService.monitorMemoryUsage(() => this.performAggressiveCleanup());
    }, this.MEMORY_MONITOR_INTERVAL);

    logger.info('ContextManager initialized with memory monitoring, summarization, and stale data cleanup');
  }

  protected async performShutdown(): Promise<void> {
    // BaseService automatically clears all timers

    this.behaviorAnalysisService.cleanup();
    this.channelContextService.cleanup();
    this.contextCacheManager.shutdown();

    this.userContextBuilder.clearAllCaches();
    this.serverContextBuilder.clearAllCaches();

    this.contextStorageService.clearAll();
    this.contextCache.clear();
    logger.info('ContextManager shutdown complete');
  }

  addEmbarrassingMoment(
    serverId: string,
    userId: string,
    moment: string,
  ): void {
    const context = this.contextStorageService.getOrCreateContext(serverId);
    const content = `${userId}: ${moment}`;

    const semanticHash = this.memoryOptimizationService.generateSemanticHash(content);
    const isDuplicate = this.memoryOptimizationService.findSimilarMessages(
      context.embarrassingMoments,
      content
    ).length > 0;

    if (isDuplicate) {
      logger.info(`Skipping duplicate embarrassing moment for ${userId}`);
      return;
    }

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
    const context = this.contextStorageService.getOrCreateContext(serverId);
    const snippetContent = `${userMessage}:\n${code}`;

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

    this.conversationMemoryService.addCodeSnippet(context, userId, code, userMessage, semanticHash);
    this.memoryOptimizationService.incrementSize(context, snippetContent.length);
    this.memoryOptimizationService.intelligentTrim(context);
  }

  buildSuperContext(serverId: string, userId: string, maxLength?: number): string {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return '';

    const cacheKey = `super_context_${serverId}_${userId}`;
    const cached = this.contextCacheManager.getString(cacheKey);
    if (cached) {
      return cached;
    }

    const contextParts: string[] = [];
    contextParts.push('DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n');

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

    const legacyBuilder = new CompositeContextBuilder(
      context,
      userId,
      serverId,
      this.conversationMemoryService,
      (this.behaviorAnalysisService as any).behaviorAnalyzer,
      this.socialDynamicsService,
      this.contextStorageService.getAllContexts()
    );

    const legacyContext = legacyBuilder
      .addFacts()
      .addCrossServerContext()
      .addRunningGags()
      .addSocialDynamics()
      .build();

    if (legacyContext) {
      contextParts.push(legacyContext);
    }

    const result = contextParts.join('');

    const finalResult = maxLength && result.length > maxLength
      ? result.substring(0, maxLength) + '...'
      : result;

    const contextHash = this.generateContextHash(context, userId);
    const now = Date.now();
    this.contextCache.set(cacheKey, {
      content: finalResult,
      hash: contextHash,
      timestamp: now
    });

    this.evictOldCacheEntries();

    return finalResult;
  }

  addRunningGag(serverId: string, gag: string): void {
    const context = this.contextStorageService.getOrCreateContext(serverId);

    const semanticHash = this.memoryOptimizationService.generateSemanticHash(gag);
    const isDuplicate = this.memoryOptimizationService.findSimilarMessages(
      context.runningGags,
      gag
    ).length > 0;

    if (isDuplicate) {
      logger.info('Skipping duplicate running gag');
      return;
    }

    this.conversationMemoryService.addRunningGag(context, gag, semanticHash);
    this.memoryOptimizationService.incrementSize(context, gag.length);

    const limits = this.conversationMemoryService.getMemoryLimits();
    if (context.runningGags.length > limits.maxRunningGags) {
      this.memoryOptimizationService.intelligentTrim(context);
    }
  }

  public getMemoryStats(): MemoryStats {
    return this.contextStorageService.getMemoryStats();
  }

  // ========== BEHAVIORAL ANALYSIS INTEGRATION ==========

  public async analyzeMessageBehavior(userId: string, message: string): Promise<void> {
    await this.behaviorAnalysisService.analyzeMessageBehavior(userId, message);
  }

  public getBehaviorPattern(userId: string): UserBehaviorPattern | null {
    return this.behaviorAnalysisService.getBehaviorPattern(userId);
  }

  public getBehaviorStats() {
    return this.behaviorAnalysisService.getBehaviorStats();
  }

  // ========== PUBLIC API METHODS ==========

  public enableCrossServerContext(userId: string, serverId: string, enabled: boolean): void {
    const context = this.contextStorageService.getOrCreateContext(serverId);
    context.crossServerEnabled = enabled;
    logger.info(`Cross-server context ${enabled ? 'enabled' : 'disabled'} for server ${serverId}`);
  }

  public summarizeServerContextNow(serverId: string): boolean {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return false;

    this.memoryOptimizationService.summarizeServerContext(context);
    return true;
  }

  public getServerCompressionStats(serverId: string): { compressionRatio: number; memorySaved: number } | null {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return null;

    return this.memoryOptimizationService.getCompressionStats(context);
  }

  public deduplicateServerContext(serverId: string): { removed: number; duplicates: string[] } {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return { removed: 0, duplicates: [] };

    const removedCount = this.memoryOptimizationService.deduplicateServerContext(context);
    return { removed: removedCount, duplicates: [] };
  }

  // ========== SOCIAL DYNAMICS TRACKING ==========

  public updateSocialGraph(
    serverId: string,
    userId: string,
    targetUserId: string,
    interactionType: 'mention' | 'reply' | 'roast'
  ): void {
    const context = this.contextStorageService.getOrCreateContext(serverId);
    this.socialDynamicsService.updateSocialGraph(context, userId, targetUserId, interactionType);
  }

  public getTopInteractions(
    serverId: string,
    userId: string,
    limit: number = 5
  ): Array<{ userId: string; count: number; type: string }> {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return [];

    return this.socialDynamicsService.getTopInteractions(context, userId, limit);
  }

  public getRecentInteractions(
    serverId: string,
    userId: string,
    hoursAgo: number = 24
  ): string[] {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return [];

    return this.socialDynamicsService.getRecentInteractions(context, userId, hoursAgo);
  }

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

    this.contextStorageService.getAllContexts().forEach((context, serverId) => {
      const socialGraphSize = this.socialDynamicsService.calculateSocialGraphSize(context);
      serverBreakdown.set(serverId, socialGraphSize);
      totalSize += socialGraphSize;
      cacheEntries += 1;

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

  public cleanupDiscordCache(_maxAge?: number): number {
    return 0;
  }

  public buildDiscordUserContext(_member: GuildMember, _includeServerData: boolean = false): string {
    return '';
  }

  public buildServerCultureContext(guild: Guild): string {
    const context = this.contextStorageService.getOrCreateContext(guild.id);

    const serverOptions: ServerContextOptions = {
      includeChannels: true,
      includeRoles: true,
      includeCulture: true,
      includeRunningGags: true,
      maxItems: 10
    };

    return this.serverContextBuilder.buildServerContext(guild, context, serverOptions);
  }

  public getServerCulture(guildId: string): ServerCulture | null {
    return this.channelContextService.getServerCulture(guildId);
  }

  public saveServerCulture(guildId: string, culture: ServerCulture): void {
    this.channelContextService.saveServerCulture(guildId, culture);
  }

  async initialize(): Promise<void> {
    logger.info('ContextManager initialized successfully');
  }

  initializeServerContext(serverId: string): void {
    this.contextStorageService.getOrCreateContext(serverId);
    logger.info(`Initialized context for server ${serverId}`);
  }

  getServerContext(serverId: string): ServerContext | undefined {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return undefined;

    const embarrassingMomentsMap = new Map<string, string[]>();
    const codeSnippetsMap = new Map<string, CodeSnippet[]>();

    context.embarrassingMoments.forEach(moment => {
      const userId = moment.content.split(':')[0];
      if (!embarrassingMomentsMap.has(userId)) {
        embarrassingMomentsMap.set(userId, []);
      }
      embarrassingMomentsMap.get(userId)!.push(moment.content);
    });

    context.codeSnippets.forEach((snippets, userId) => {
      const convertedSnippets: CodeSnippet[] = snippets.map(snippet => ({
        timestamp: snippet.timestamp,
        userMessage: snippet.content.split('\n')[0] || '',
        code: snippet.content.split('\n').slice(1).join('\n')
      }));
      codeSnippetsMap.set(userId, convertedSnippets);
    });

    const summarizedFacts: SummarizedFact[] = context.summarizedFacts.map(fact => ({
      fact: fact.content,
      timestamp: fact.timestamp,
      importance: 5,
      userIds: []
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

  addSummarizedFact(serverId: string, fact: string, importance: number = 5): void {
    const context = this.contextStorageService.getOrCreateContext(serverId);

    const semanticHash = this.memoryOptimizationService.generateSemanticHash(fact);
    const isDuplicate = this.memoryOptimizationService.findSimilarMessages(
      context.summarizedFacts,
      fact
    ).length > 0;

    if (isDuplicate) {
      logger.info('Skipping duplicate summarized fact');
      return;
    }

    this.conversationMemoryService.addSummarizedFact(context, fact, importance, semanticHash);
    this.memoryOptimizationService.incrementSize(context, fact.length);
    this.memoryOptimizationService.intelligentTrim(context);
  }

  async summarizeAndCompress(serverId: string): Promise<{ removed: number; kept: number }> {
    return this.contextSummarizer.summarizeAndCompress(serverId);
  }

  buildSmartContext(serverId: string, userId: string, currentMessage: string): string {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return '';

    const contextParts: string[] = [];
    const now = Date.now();

    const messageKeywords = currentMessage.toLowerCase().split(/\s+/);
    const relevantKeywords = ['code', 'error', 'bug', 'help', 'problem', 'issue', 'javascript', 'python', 'react'];
    const hasCodeContext = messageKeywords.some(word => relevantKeywords.includes(word));

    contextParts.push('SMART CONTEXT ANALYSIS:\n\n');

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

    const socialContext = this.socialDynamicsService.buildSocialDynamicsContext(context, userId);
    if (socialContext) {
      contextParts.push(socialContext);
    }

    return contextParts.join('');
  }

  isGlobalContextEnabled(): boolean {
    return this.globalContextEnabled;
  }

  enableGlobalContext(): void {
    this.globalContextEnabled = true;
    logger.info('Global context sharing enabled');
  }

  disableGlobalContext(): void {
    this.globalContextEnabled = false;
    logger.info('Global context sharing disabled');
  }

  private generateContextHash(context: RichContext, userId: string): string {
    const factors = [
      context.embarrassingMoments.length,
      context.runningGags.length,
      context.codeSnippets.get(userId)?.length || 0,
      context.lastSummarization,
      context.approximateSize
    ];
    return factors.join('-');
  }

  private evictOldCacheEntries(): void {
    if (this.contextCache.size <= this.CONTEXT_CACHE_MAX_ENTRIES) {
      return;
    }

    const entries = Array.from(this.contextCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(0, entries.length - this.CONTEXT_CACHE_MAX_ENTRIES);
    toRemove.forEach(([key]) => this.contextCache.delete(key));

    logger.info(`Evicted ${toRemove.length} old cache entries`);
  }

  private monitorMemoryUsage(): void {
    // Delegated to storage service
    this.contextStorageService.monitorMemoryUsage(() => this.performAggressiveCleanup());
  }

  private performAggressiveCleanup(): void {
    logger.warn('Starting aggressive memory cleanup');

    this.contextCache.clear();
    this.contextCacheManager.clear();

    // Force summarization on all contexts
    const contexts = this.contextStorageService.getAllContexts();
    for (const [, context] of contexts.entries()) {
      this.memoryOptimizationService.summarizeServerContext(context);
    }

    this.userContextBuilder.clearAllCaches();
    this.serverContextBuilder.clearAllCaches();

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

    this.contextStorageService.getAllContexts().forEach((context, serverId) => {
      let serverInteractions = 0;

      const userMoments = context.embarrassingMoments.filter(moment =>
        moment.content.includes(userId)
      );
      serverInteractions += userMoments.length;

      const userCode = context.codeSnippets.get(userId);
      if (userCode) {
        serverInteractions += userCode.length;
      }

      if (serverInteractions > maxInteractions) {
        maxInteractions = serverInteractions;
        mostActiveServer = serverId;
      }

      totalInteractions += serverInteractions;

      if (userMoments.length > 0) {
        globalPatterns.push(`Active in server ${serverId} with ${userMoments.length} memorable moments`);
      }
      if (userCode && userCode.length > 0) {
        globalPatterns.push(`Shared ${userCode.length} code snippets in server ${serverId}`);
      }
    });

    return {
      userId,
      globalPatterns,
      serverCount: this.contextStorageService.getAllContexts().size,
      mostActiveServer: mostActiveServer || undefined,
      totalInteractions
    };
  }

  getServerContextSize(serverId: string): number {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return 0;

    return context.approximateSize;
  }

  getImportanceThreshold(_serverId: string): number {
    return 5;
  }

  protected getHealthErrors(): string[] {
    const errors = super.getHealthErrors();

    try {
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

      if (!this.behaviorAnalysisService) {
        errors.push('BehaviorAnalysisService not initialized');
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

  public getConversationBuilder(): ConversationContextBuilder {
    return this.conversationContextBuilder;
  }

  public getServerBuilder(): ServerContextBuilder {
    return this.serverContextBuilder;
  }

  public getUserBuilder(): UserContextBuilder {
    return this.userContextBuilder;
  }

  public getCacheManager(): ContextCacheManager {
    return this.contextCacheManager;
  }

  public buildConversationContext(
    serverId: string,
    userId: string,
    options?: ConversationContextOptions
  ): string {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return '';

    return this.conversationContextBuilder.buildConversationContext(context, userId, options);
  }

  public buildUserContext(
    serverId: string,
    userId: string,
    member?: GuildMember,
    options?: UserContextOptions
  ): string {
    const context = this.contextStorageService.getContext(serverId);
    if (!context) return '';

    return this.userContextBuilder.buildUserContext(userId, context, member, options);
  }
}