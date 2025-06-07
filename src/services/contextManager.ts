import { logger } from '../utils/logger';
import { GuildMember, Guild } from 'discord.js';
import { BehaviorAnalyzer, UserBehaviorPattern } from './behaviorAnalyzer';

export interface ContextItem {
  content: string;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  relevanceScore?: number;
  importanceScore?: number;
  semanticHash?: string;
}

export interface RichContext {
  conversations: Map<string, string[]>;
  codeSnippets: Map<string, ContextItem[]>;
  embarrassingMoments: ContextItem[];
  runningGags: ContextItem[];
  lastRoasted: Map<string, Date>;
  approximateSize: number; // Cached size estimate
  lastSizeUpdate: number;
  // Enhanced context features
  summarizedFacts: ContextItem[];
  crossServerEnabled: boolean;
  compressionRatio: number;
  lastSummarization: number;
  // Social dynamics tracking
  socialGraph: Map<string, SocialGraph>; // userId -> their social graph
}

export interface MemoryStats {
  totalServers: number;
  totalMemoryUsage: number;
  averageServerSize: number;
  largestServerSize: number;
  itemCounts: {
    embarrassingMoments: number;
    codeSnippets: number;
    runningGags: number;
    summarizedFacts: number;
  };
  compressionStats: {
    averageCompressionRatio: number;
    totalMemorySaved: number;
    duplicatesRemoved: number;
  };
}

interface DiscordUserContext {
  username: string;
  displayName: string;
  joinedAt: Date;
  accountAge: Date;
  roles: string[];
  nitroStatus: boolean;
  presence?: {
    status: string;
    activities: string[];
  };
  permissions: {
    isAdmin: boolean;
    isModerator: boolean;
    canManageMessages: boolean;
  };
  // Cached data
  cachedAt: number;
  ttl: number; // 5 minutes in milliseconds
}

export interface SocialGraph {
  interactions: Map<string, number>; // user -> interaction count
  mentions: Map<string, number>; // user -> mention count
  roasts: Map<string, number>; // user -> roast count
  lastInteraction: Map<string, Date>; // user -> last interaction time
}

export interface ServerCulture {
  guildId: string;
  popularEmojis: Array<{emoji: string, count: number}>;
  activeVoiceChannels: string[];
  recentEvents: Array<{name: string, date: Date}>;
  boostLevel: number;
  topChannels: Array<{name: string, messageCount: number}>;
  preferredLocale: string;
  cachedAt: number;
  ttl: number; // 5 minutes in milliseconds
}

export class ContextManager {
  private serverContext: Map<string, RichContext> = new Map();
  private behaviorAnalyzer: BehaviorAnalyzer = new BehaviorAnalyzer();
  private readonly MAX_CONTEXT_SIZE = 300000; // Reduced by 40% for memory optimization
  private readonly MAX_EMBARRASSING_MOMENTS = 60; // Reduced by 40%
  private readonly MAX_CODE_SNIPPETS_PER_USER = 12; // Reduced by 40%
  private readonly MAX_RUNNING_GAGS = 30; // Reduced by 40%
  private readonly MAX_SUMMARIZED_FACTS = 50;
  private readonly SIZE_UPDATE_INTERVAL = 60000; // 1 minute
  private readonly MEMORY_CHECK_INTERVAL = 300000; // 5 minutes
  private readonly SUMMARIZATION_INTERVAL = 1800000; // 30 minutes
  private readonly SIMILARITY_THRESHOLD = 0.8; // For semantic deduplication
  private readonly COMPRESSION_TARGET_RATIO = 0.6; // Target 40% reduction
  private memoryCheckTimer: NodeJS.Timeout | null = null;
  private summarizationTimer: NodeJS.Timeout | null = null;
  
  // Discord user context cache
  private discordUserContextCache: Map<string, DiscordUserContext> = new Map();
  private readonly DISCORD_CONTEXT_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year (with ~10 users, storage is negligible)
  private readonly MAX_DISCORD_CACHE_ENTRIES = 10000; // Prevent unbounded growth (but unlikely to hit with small user base)
  
  // Server culture context cache
  private serverCultureCache: Map<string, ServerCulture> = new Map();
  private readonly SERVER_CULTURE_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year (server culture evolves slowly, ~10 servers = negligible storage)
  private readonly MAX_SERVER_CULTURE_CACHE_ENTRIES = 100; // Reasonable limit for server count

  addEmbarrassingMoment(
    serverId: string,
    userId: string,
    moment: string,
  ): void {
    const context = this.getOrCreateContext(serverId);
    const now = Date.now();
    const content = `${userId}: ${moment}`;
    
    // Check for semantic duplicates before adding
    const semanticHash = this.generateSemanticHash(content);
    const isDuplicate = this.findSimilarMessages(context.embarrassingMoments, content, this.SIMILARITY_THRESHOLD).length > 0;
    
    if (isDuplicate) {
      logger.info(`Skipping duplicate embarrassing moment for ${userId}`);
      return;
    }
    
    const momentItem: ContextItem = {
      content,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      relevanceScore: this.calculateRelevanceScore(content, context),
      importanceScore: this.calculateImportanceScore(content),
      semanticHash,
    };
    
    context.embarrassingMoments.push(momentItem);
    this.incrementSize(context, momentItem.content.length);
    this.intelligentTrim(context);
  }

  addCodeSnippet(
    serverId: string,
    userId: string,
    code: string,
    description: string,
  ): void {
    const context = this.getOrCreateContext(serverId);
    if (!context.codeSnippets.has(userId)) {
      context.codeSnippets.set(userId, []);
    }
    
    const now = Date.now();
    const snippetContent = `${description}:\n${code}`;
    
    // Check for semantic duplicates in user's code snippets
    const userSnippets = context.codeSnippets.get(userId)!;
    const semanticHash = this.generateSemanticHash(snippetContent);
    const isDuplicate = this.findSimilarMessages(userSnippets, snippetContent, this.SIMILARITY_THRESHOLD).length > 0;
    
    if (isDuplicate) {
      logger.info(`Skipping duplicate code snippet for ${userId}`);
      return;
    }
    
    const snippetItem: ContextItem = {
      content: snippetContent,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      relevanceScore: this.calculateRelevanceScore(snippetContent, context),
      importanceScore: this.calculateImportanceScore(snippetContent),
      semanticHash,
    };
    
    userSnippets.push(snippetItem);
    this.incrementSize(context, snippetContent.length);
    this.intelligentTrim(context);
  }

  buildSuperContext(serverId: string, userId: string): string {
    const context = this.serverContext.get(serverId);
    if (!context) return '';

    const parts: string[] = ['DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n'];
    const now = Date.now();

    // Add summarized facts first (most compressed, high-level context)
    if (context.summarizedFacts.length > 0) {
      parts.push('KEY FACTS & RELATIONSHIPS:\n');
      const relevantFacts = this.selectRelevantItems(context.summarizedFacts, userId, 10);
      relevantFacts.forEach((factItem) => {
        factItem.accessCount++;
        factItem.lastAccessed = now;
        parts.push(`- ${factItem.content}\n`);
      });
      parts.push('\n');
    }

    // Add cross-server context if enabled
    if (context.crossServerEnabled) {
      const crossServerContext = this.buildCrossServerContext(userId, serverId);
      if (crossServerContext) {
        parts.push('CROSS-SERVER INTELLIGENCE:\n');
        parts.push(crossServerContext);
        parts.push('\n');
      }
    }

    // Add behavioral analysis
    const behaviorContext = this.behaviorAnalyzer.getBehaviorContext(userId);
    if (behaviorContext) {
      parts.push(behaviorContext);
      parts.push('\n');
    }

    // Add most relevant embarrassing moments (update access stats)
    if (context.embarrassingMoments.length > 0) {
      parts.push('HALL OF SHAME:\n');
      const relevantMoments = this.selectRelevantItems(context.embarrassingMoments, userId, 15);
      relevantMoments.forEach((momentItem) => {
        momentItem.accessCount++;
        momentItem.lastAccessed = now;
        parts.push(`- ${momentItem.content}\n`);
      });
      parts.push('\n');
    }

    // Add their bad code (update access stats)
    const userCode = context.codeSnippets.get(userId);
    if (userCode && userCode.length > 0) {
      parts.push(`${userId}'S TERRIBLE CODE HISTORY:\n`);
      const relevantCode = this.selectRelevantItems(userCode, userId, 10);
      relevantCode.forEach((snippetItem) => {
        snippetItem.accessCount++;
        snippetItem.lastAccessed = now;
        parts.push(`${snippetItem.content}\n---\n`);
      });
    }

    // Add running gags (update access stats)
    if (context.runningGags.length > 0) {
      parts.push('RUNNING GAGS TO REFERENCE:\n');
      const relevantGags = this.selectRelevantItems(context.runningGags, userId, 8);
      relevantGags.forEach((gagItem) => {
        gagItem.accessCount++;
        gagItem.lastAccessed = now;
        parts.push(`- ${gagItem.content}\n`);
      });
      parts.push('\n');
    }

    // Add social dynamics information
    const topInteractions = this.getTopInteractions(serverId, userId, 5);
    if (topInteractions.length > 0) {
      parts.push('SOCIAL DYNAMICS:\n');
      topInteractions.forEach(({ userId: targetId, count, type }) => {
        parts.push(`- Frequently interacts with <@${targetId}> (${count} times, ${type})\n`);
      });
      
      // Add recent interactions
      const recentInteractions = this.getRecentInteractions(serverId, userId, 24);
      if (recentInteractions.length > 0) {
        parts.push('\nRECENT ACTIVITY (last 24h):\n');
        recentInteractions.forEach(interaction => {
          parts.push(`- ${interaction}\n`);
        });
      }
    }

    return parts.join('');
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
      this.refreshApproximateSize(newContext);
      
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
    const now = Date.now();
    
    // Check for semantic duplicates before adding
    const semanticHash = this.generateSemanticHash(gag);
    const isDuplicate = this.findSimilarMessages(context.runningGags, gag, this.SIMILARITY_THRESHOLD).length > 0;
    
    if (isDuplicate) {
      logger.info('Skipping duplicate running gag');
      return;
    }
    
    const gagItem: ContextItem = {
      content: gag,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      relevanceScore: this.calculateRelevanceScore(gag, context),
      importanceScore: this.calculateImportanceScore(gag),
      semanticHash,
    };
    
    context.runningGags.push(gagItem);
    this.incrementSize(context, gag.length);
    
    // Intelligent trimming based on LRU
    if (context.runningGags.length > this.MAX_RUNNING_GAGS) {
      this.trimRunningGagsLRU(context);
    }
  }

  private intelligentTrim(context: RichContext): void {
    // Use cached size instead of recalculating
    if (context.approximateSize <= this.MAX_CONTEXT_SIZE) {
      return;
    }

    logger.info(`Context size ${context.approximateSize} exceeds limit, performing intelligent trim`);
    
    const sizeBefore = context.approximateSize;
    
    // 1. Trim embarrassing moments using LRU
    if (context.embarrassingMoments.length > this.MAX_EMBARRASSING_MOMENTS) {
      this.trimEmbarrassingMomentsLRU(context);
    }

    // 2. Trim code snippets per user using LRU
    for (const [userId, snippets] of context.codeSnippets.entries()) {
      if (snippets.length > this.MAX_CODE_SNIPPETS_PER_USER) {
        this.trimCodeSnippetsLRU(context, userId);
      }
    }

    // 3. Trim running gags using LRU
    if (context.runningGags.length > this.MAX_RUNNING_GAGS) {
      this.trimRunningGagsLRU(context);
    }

    // 4. If still too large, aggressive trimming
    if (context.approximateSize > this.MAX_CONTEXT_SIZE) {
      this.aggressiveTrim(context);
    }

    logger.info(`Trim complete: ${sizeBefore} -> ${context.approximateSize} characters`);
  }

  private trimEmbarrassingMomentsLRU(context: RichContext): void {
    // Sort by combined score: age and access frequency
    context.embarrassingMoments.sort((a, b) => {
      const scoreA = this.calculateLRUScore(a);
      const scoreB = this.calculateLRUScore(b);
      return scoreA - scoreB; // Lower score = more likely to be removed
    });
    
    const toRemove = context.embarrassingMoments.length - this.MAX_EMBARRASSING_MOMENTS;
    for (let i = 0; i < toRemove; i++) {
      const removed = context.embarrassingMoments.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
  }

  private trimCodeSnippetsLRU(context: RichContext, userId: string): void {
    const snippets = context.codeSnippets.get(userId);
    if (!snippets) return;
    
    snippets.sort((a, b) => {
      const scoreA = this.calculateLRUScore(a);
      const scoreB = this.calculateLRUScore(b);
      return scoreA - scoreB;
    });
    
    const toRemove = snippets.length - this.MAX_CODE_SNIPPETS_PER_USER;
    for (let i = 0; i < toRemove; i++) {
      const removed = snippets.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
    
    // Clean up empty entries
    if (snippets.length === 0) {
      context.codeSnippets.delete(userId);
    }
  }

  private trimRunningGagsLRU(context: RichContext): void {
    context.runningGags.sort((a, b) => {
      const scoreA = this.calculateLRUScore(a);
      const scoreB = this.calculateLRUScore(b);
      return scoreA - scoreB;
    });
    
    const toRemove = context.runningGags.length - this.MAX_RUNNING_GAGS;
    for (let i = 0; i < toRemove; i++) {
      const removed = context.runningGags.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
  }

  private calculateLRUScore(item: ContextItem): number {
    const now = Date.now();
    const ageScore = (now - item.timestamp) / (1000 * 60 * 60 * 24); // Days old
    const accessScore = Math.max(0, 10 - item.accessCount); // Higher access count = lower score
    const recencyScore = (now - item.lastAccessed) / (1000 * 60 * 60); // Hours since last access
    
    // Lower score = more likely to be removed
    return ageScore + accessScore + (recencyScore * 0.1);
  }

  private aggressiveTrim(context: RichContext): void {
    logger.warn('Performing aggressive context trimming due to size limit');
    
    // Reduce to 75% of limits to provide breathing room
    const targetEmbarrassingMoments = Math.floor(this.MAX_EMBARRASSING_MOMENTS * 0.75);
    const targetCodeSnippets = Math.floor(this.MAX_CODE_SNIPPETS_PER_USER * 0.75);
    const targetRunningGags = Math.floor(this.MAX_RUNNING_GAGS * 0.75);
    
    // Trim embarrassing moments
    while (context.embarrassingMoments.length > targetEmbarrassingMoments) {
      const removed = context.embarrassingMoments.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
    
    // Trim code snippets more aggressively
    for (const [userId, snippets] of context.codeSnippets.entries()) {
      while (snippets.length > targetCodeSnippets) {
        const removed = snippets.shift();
        if (removed) {
          this.decrementSize(context, removed.content.length);
        }
      }
      if (snippets.length === 0) {
        context.codeSnippets.delete(userId);
      }
    }
    
    // Trim running gags
    while (context.runningGags.length > targetRunningGags) {
      const removed = context.runningGags.shift();
      if (removed) {
        this.decrementSize(context, removed.content.length);
      }
    }
  }

  private incrementSize(context: RichContext, addedLength: number): void {
    context.approximateSize += addedLength;
    context.lastSizeUpdate = Date.now();
  }

  private decrementSize(context: RichContext, removedLength: number): void {
    context.approximateSize = Math.max(0, context.approximateSize - removedLength);
    context.lastSizeUpdate = Date.now();
  }

  private refreshApproximateSize(context: RichContext): void {
    const now = Date.now();
    
    // Only recalculate if cache is invalid (for emergency use only)
    if (now - context.lastSizeUpdate < this.SIZE_UPDATE_INTERVAL && context.approximateSize > 0) {
      return;
    }
    
    // Full recalculation for cache initialization or validation
    let totalSize = 0;
    
    // Calculate embarrassing moments
    context.embarrassingMoments.forEach(item => {
      totalSize += item.content.length;
    });
    
    // Calculate code snippets
    for (const snippets of context.codeSnippets.values()) {
      snippets.forEach(item => {
        totalSize += item.content.length;
      });
    }
    
    // Calculate running gags
    context.runningGags.forEach(item => {
      totalSize += item.content.length;
    });
    
    // Calculate summarized facts
    if (context.summarizedFacts) {
      context.summarizedFacts.forEach(item => {
        totalSize += item.content.length;
      });
    }
    
    // Add overhead estimate for Map and array structures
    totalSize += (context.codeSnippets.size * 100); // Map overhead
    totalSize += (context.lastRoasted.size * 50); // Date objects
    
    // Add social graph overhead
    totalSize += (context.socialGraph.size * 200); // Social graph maps overhead
    for (const [, userGraph] of context.socialGraph) {
      totalSize += (userGraph.interactions.size * 20); // Interaction counts
      totalSize += (userGraph.mentions.size * 20); // Mention counts
      totalSize += (userGraph.roasts.size * 20); // Roast counts
      totalSize += (userGraph.lastInteraction.size * 50); // Date objects
    }
    
    context.approximateSize = totalSize;
    context.lastSizeUpdate = now;
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
      
      totalEmbarrassingMoments += context.embarrassingMoments.length;
      totalRunningGags += context.runningGags.length;
      totalSummarizedFacts += context.summarizedFacts.length;
      totalCompressionRatio += context.compressionRatio;
      
      for (const snippets of context.codeSnippets.values()) {
        totalCodeSnippets += snippets.length;
      }
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
    
    this.serverContext.clear();
    logger.info('ContextManager cleanup completed');
  }

  // ========== ENHANCED CONTEXT MANAGEMENT METHODS ==========

  /**
   * Generate semantic hash for duplicate detection
   */
  private generateSemanticHash(content: string): string {
    // Simple content-based hash using length and key words
    const normalized = content.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const words = normalized.split(/\s+/).filter(w => w.length > 3);
    const keyWords = words.slice(0, 5).sort().join('');
    return `${normalized.length}_${keyWords}`;
  }

  /**
   * Find similar messages based on semantic similarity
   */
  private findSimilarMessages(items: ContextItem[], content: string, threshold: number): ContextItem[] {
    const targetHash = this.generateSemanticHash(content);
    const targetWords = content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    return items.filter(item => {
      if (item.semanticHash === targetHash) {
        return true; // Exact semantic match
      }
      
      // Check word overlap for similarity
      const itemWords = item.content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const overlap = targetWords.filter(word => itemWords.includes(word)).length;
      const similarity = overlap / Math.max(targetWords.length, itemWords.length);
      
      return similarity >= threshold;
    });
  }

  /**
   * Calculate relevance score for context items
   */
  private calculateRelevanceScore(content: string, _context: RichContext): number {
    let score = 0.5; // Base relevance
    
    // Length bonus (longer content often more relevant)
    if (content.length > 100) score += 0.1;
    if (content.length > 300) score += 0.1;
    
    // Code-related content gets higher relevance
    if (/\b(function|class|const|let|var|if|for|while)\b/i.test(content)) {
      score += 0.2;
    }
    
    // Error/problem mentions get higher relevance
    if (/\b(error|bug|issue|problem|fail|crash|break)\b/i.test(content)) {
      score += 0.15;
    }
    
    // User mention patterns get higher relevance
    if (/<@\d+>/.test(content)) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Calculate importance score for preserving key facts
   */
  private calculateImportanceScore(content: string): number {
    let score = 0.3; // Base importance
    
    // High importance indicators
    const highImportancePatterns = [
      /\b(always|never|every time|constantly|repeatedly)\b/i,
      /\b(mistake|error|wrong|incorrect|bad|terrible)\b/i,
      /\b(delete|remove|lost|crash|broken)\b/i,
      /\b(password|secret|private|confidential)\b/i,
    ];
    
    for (const pattern of highImportancePatterns) {
      if (pattern.test(content)) {
        score += 0.2;
      }
    }
    
    // Medium importance indicators
    const mediumImportancePatterns = [
      /\b(code|function|class|method|variable)\b/i,
      /\b(project|work|team|manager|boss)\b/i,
      /\b(said|told|mentioned|explained)\b/i,
    ];
    
    for (const pattern of mediumImportancePatterns) {
      if (pattern.test(content)) {
        score += 0.1;
      }
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Select most relevant items based on multiple factors
   */
  private selectRelevantItems(items: ContextItem[], userId: string, maxItems: number): ContextItem[] {
    if (items.length <= maxItems) {
      return items;
    }
    
    // Calculate combined relevance score
    const scoredItems = items.map(item => {
      const lruScore = this.calculateLRUScore(item);
      const relevanceScore = item.relevanceScore || 0.5;
      const importanceScore = item.importanceScore || 0.3;
      
      // User-specific content gets bonus
      const userBonus = item.content.includes(userId) ? 0.2 : 0;
      
      // Combined score (lower is better for LRU, higher is better for relevance/importance)
      const combinedScore = (relevanceScore + importanceScore + userBonus) - (lruScore * 0.1);
      
      return { item, score: combinedScore };
    });
    
    // Sort by combined score (highest first) and take top items
    return scoredItems
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map(scored => scored.item);
  }

  /**
   * Summarize conversation content into key facts
   */
  private summarizeConversation(items: ContextItem[], targetLength: number): string {
    if (items.length === 0) return '';
    
    // Group items by user patterns
    const userPatterns = new Map<string, string[]>();
    const generalFacts: string[] = [];
    
    items.forEach(item => {
      const userMatch = item.content.match(/^([^:]+):/);
      if (userMatch) {
        const user = userMatch[1];
        if (!userPatterns.has(user)) {
          userPatterns.set(user, []);
        }
        userPatterns.get(user)!.push(item.content.substring(user.length + 1).trim());
      } else {
        generalFacts.push(item.content);
      }
    });
    
    const summaryParts: string[] = [];
    
    // Summarize per-user patterns
    for (const [user, facts] of userPatterns.entries()) {
      if (facts.length > 2) {
        const commonThemes = this.extractCommonThemes(facts);
        summaryParts.push(`${user}: ${commonThemes.slice(0, 2).join(', ')}`);
      } else {
        facts.forEach(fact => summaryParts.push(`${user}: ${fact}`));
      }
    }
    
    // Add general facts
    generalFacts.forEach(fact => summaryParts.push(fact));
    
    let summary = summaryParts.join('; ');
    
    // Truncate if too long
    if (summary.length > targetLength) {
      summary = summary.substring(0, targetLength - 3) + '...';
    }
    
    return summary;
  }

  /**
   * Extract common themes from a list of facts
   */
  private extractCommonThemes(facts: string[]): string[] {
    const wordCounts = new Map<string, number>();
    const themes: string[] = [];
    
    // Count significant words
    facts.forEach(fact => {
      const words = fact.toLowerCase().match(/\b\w{4,}\b/g) || [];
      words.forEach(word => {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      });
    });
    
    // Find words that appear in multiple facts
    for (const [word, count] of wordCounts.entries()) {
      if (count >= 2 && themes.length < 5) {
        themes.push(`often ${word}`);
      }
    }
    
    // If no common themes, take most important facts
    if (themes.length === 0) {
      return facts.slice(0, 3);
    }
    
    return themes;
  }

  /**
   * Perform scheduled summarization of old content
   */
  private performScheduledSummarization(): void {
    const now = Date.now();
    
    for (const [serverId, context] of this.serverContext.entries()) {
      // Skip if recently summarized
      if (now - context.lastSummarization < this.SUMMARIZATION_INTERVAL) {
        continue;
      }
      
      logger.info(`Performing scheduled summarization for server ${serverId}`);
      this.summarizeServerContext(context);
      context.lastSummarization = now;
    }
  }

  /**
   * Summarize server context to compress memory
   */
  private summarizeServerContext(context: RichContext): void {
    const originalSize = context.approximateSize;
    
    // Summarize old embarrassing moments
    if (context.embarrassingMoments.length > this.MAX_EMBARRASSING_MOMENTS * 0.75) {
      const oldMoments = context.embarrassingMoments
        .filter(item => Date.now() - item.timestamp > 24 * 60 * 60 * 1000) // Older than 1 day
        .slice(0, Math.floor(context.embarrassingMoments.length * 0.3)); // Take 30% of oldest
      
      if (oldMoments.length > 5) {
        const summary = this.summarizeConversation(oldMoments, 300);
        if (summary) {
          const summaryItem: ContextItem = {
            content: `SUMMARIZED: ${summary}`,
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: Date.now(),
            relevanceScore: 0.8,
            importanceScore: 0.7,
            semanticHash: this.generateSemanticHash(summary),
          };
          
          context.summarizedFacts.push(summaryItem);
          
          // Remove original items
          oldMoments.forEach(item => {
            const index = context.embarrassingMoments.indexOf(item);
            if (index !== -1) {
              context.embarrassingMoments.splice(index, 1);
              this.decrementSize(context, item.content.length);
            }
          });
          
          this.incrementSize(context, summaryItem.content.length);
        }
      }
    }
    
    // Trim summarized facts if too many
    if (context.summarizedFacts.length > this.MAX_SUMMARIZED_FACTS) {
      context.summarizedFacts.sort((a, b) => this.calculateLRUScore(a) - this.calculateLRUScore(b));
      const toRemove = context.summarizedFacts.length - this.MAX_SUMMARIZED_FACTS;
      for (let i = 0; i < toRemove; i++) {
        const removed = context.summarizedFacts.shift();
        if (removed) {
          this.decrementSize(context, removed.content.length);
        }
      }
    }
    
    // Update compression ratio
    const newSize = context.approximateSize;
    context.compressionRatio = newSize / Math.max(originalSize, 1);
    
    logger.info(`Summarization complete: ${originalSize} -> ${newSize} characters (${(context.compressionRatio * 100).toFixed(1)}% ratio)`);
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
    
    this.summarizeServerContext(context);
    return true;
  }

  /**
   * Get compression statistics for a server
   */
  public getServerCompressionStats(serverId: string): { compressionRatio: number; memorySaved: number } | null {
    const context = this.serverContext.get(serverId);
    if (!context) return null;
    
    const originalSize = context.approximateSize / context.compressionRatio;
    const memorySaved = originalSize - context.approximateSize;
    
    return {
      compressionRatio: context.compressionRatio,
      memorySaved
    };
  }

  /**
   * Manual deduplication of a server's context
   */
  public deduplicateServerContext(serverId: string): number {
    const context = this.serverContext.get(serverId);
    if (!context) return 0;
    
    let removedCount = 0;
    
    // Deduplicate embarrassing moments
    removedCount += this.deduplicateArray(context.embarrassingMoments, context);
    
    // Deduplicate running gags
    removedCount += this.deduplicateArray(context.runningGags, context);
    
    // Deduplicate code snippets
    for (const snippets of context.codeSnippets.values()) {
      removedCount += this.deduplicateArray(snippets, context);
    }
    
    logger.info(`Removed ${removedCount} duplicate items from server ${serverId}`);
    return removedCount;
  }

  /**
   * Helper method to deduplicate an array of context items
   */
  private deduplicateArray(items: ContextItem[], context: RichContext): number {
    const seen = new Set<string>();
    let removedCount = 0;
    
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const hash = item.semanticHash || this.generateSemanticHash(item.content);
      
      if (seen.has(hash)) {
        items.splice(i, 1);
        this.decrementSize(context, item.content.length);
        removedCount++;
      } else {
        seen.add(hash);
        if (!item.semanticHash) {
          item.semanticHash = hash;
        }
      }
    }
    
    return removedCount;
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
    
    // Get or create social graph for the user
    if (!context.socialGraph.has(userId)) {
      context.socialGraph.set(userId, {
        interactions: new Map(),
        mentions: new Map(),
        roasts: new Map(),
        lastInteraction: new Map(),
      });
    }
    
    const userGraph = context.socialGraph.get(userId)!;
    const now = new Date();
    
    // Update interaction count
    userGraph.interactions.set(
      targetUserId,
      (userGraph.interactions.get(targetUserId) || 0) + 1
    );
    
    // Update specific interaction type
    switch (interactionType) {
    case 'mention':
      userGraph.mentions.set(
        targetUserId,
        (userGraph.mentions.get(targetUserId) || 0) + 1
      );
      break;
    case 'roast':
      userGraph.roasts.set(
        targetUserId,
        (userGraph.roasts.get(targetUserId) || 0) + 1
      );
      break;
    }
    
    // Update last interaction time
    userGraph.lastInteraction.set(targetUserId, now);
    
    logger.info(`Updated social graph: ${userId} ${interactionType} ${targetUserId}`);
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
    if (!context || !context.socialGraph.has(userId)) {
      return [];
    }
    
    const userGraph = context.socialGraph.get(userId)!;
    const interactions: Array<{ userId: string; count: number; type: string }> = [];
    
    // Collect all interactions with types
    for (const [targetUserId, count] of userGraph.interactions.entries()) {
      const mentionCount = userGraph.mentions.get(targetUserId) || 0;
      const roastCount = userGraph.roasts.get(targetUserId) || 0;
      
      let primaryType = 'interaction';
      if (roastCount > mentionCount) {
        primaryType = 'roast target';
      } else if (mentionCount > 0) {
        primaryType = 'frequent mention';
      }
      
      interactions.push({
        userId: targetUserId,
        count,
        type: primaryType
      });
    }
    
    // Sort by count and return top N
    return interactions
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get social graph for a user
   */
  private getSocialGraph(serverId: string, userId: string): SocialGraph | null {
    const context = this.serverContext.get(serverId);
    if (!context) return null;
    
    return context.socialGraph.get(userId) || null;
  }

  /**
   * Save social graph data (for persistence)
   */
  private saveSocialGraph(serverId: string): void {
    const context = this.serverContext.get(serverId);
    if (!context) return;
    
    // This method can be extended to save to a database or file
    // For now, it's kept in memory as part of the context
    logger.info(`Social graph saved for server ${serverId} with ${context.socialGraph.size} users`);
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
    if (!context || !context.socialGraph.has(userId)) {
      return [];
    }
    
    const userGraph = context.socialGraph.get(userId)!;
    const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
    const recentInteractions: string[] = [];
    
    for (const [targetUserId, lastInteraction] of userGraph.lastInteraction.entries()) {
      if (lastInteraction.getTime() > cutoffTime) {
        const mentionCount = userGraph.mentions.get(targetUserId) || 0;
        const roastCount = userGraph.roasts.get(targetUserId) || 0;
        
        if (mentionCount > 0 || roastCount > 0) {
          recentInteractions.push(`Recently interacted with <@${targetUserId}> (${mentionCount} mentions, ${roastCount} roasts)`);
        }
      }
    }
    
    return recentInteractions;
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
    let totalSize = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;
    const serverBreakdown = new Map<string, number>();
    
    // Calculate Discord context cache size
    this.discordUserContextCache.forEach((context, key) => {
      // Estimate size of each context object
      const contextSize = JSON.stringify(context).length;
      totalSize += contextSize;
      
      // Track timestamps
      if (context.cachedAt < oldestTimestamp) {
        oldestTimestamp = context.cachedAt;
      }
      if (context.cachedAt > newestTimestamp) {
        newestTimestamp = context.cachedAt;
      }
      
      // Server breakdown
      const serverId = key.split('-')[0];
      serverBreakdown.set(serverId, (serverBreakdown.get(serverId) || 0) + contextSize);
    });
    
    // Add social graph data size
    this.serverContext.forEach((context, serverId) => {
      if (context.socialGraph) {
        context.socialGraph.forEach((graph, _userId) => {
          const graphSize = JSON.stringify({
            interactions: Array.from(graph.interactions.entries()),
            mentions: Array.from(graph.mentions.entries()),
            roasts: Array.from(graph.roasts.entries()),
            lastInteraction: Array.from(graph.lastInteraction.entries()),
          }).length;
          totalSize += graphSize;
          serverBreakdown.set(serverId, (serverBreakdown.get(serverId) || 0) + graphSize);
        });
      }
    });
    
    return {
      cacheEntries: this.discordUserContextCache.size,
      estimatedSizeBytes: totalSize,
      estimatedSizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
      oldestEntry: this.discordUserContextCache.size > 0 ? new Date(oldestTimestamp) : null,
      newestEntry: this.discordUserContextCache.size > 0 ? new Date(newestTimestamp) : null,
      serverBreakdown,
    };
  }
  
  /**
   * Clean up old Discord cache entries
   */
  public cleanupDiscordCache(maxAge: number = this.DISCORD_CONTEXT_TTL): number {
    const now = Date.now();
    let removed = 0;
    
    this.discordUserContextCache.forEach((context, key) => {
      if (now - context.cachedAt > maxAge) {
        this.discordUserContextCache.delete(key);
        removed++;
      }
    });
    
    return removed;
  }
  
  /**
   * Build Discord user context from a GuildMember
   */
  public buildDiscordUserContext(member: GuildMember): string {
    const userId = member.id;
    const cacheKey = `${member.guild.id}-${userId}`;
    
    // Check cache first
    const cached = this.discordUserContextCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < this.DISCORD_CONTEXT_TTL) {
      return this.formatDiscordContextAsString(cached);
    }
    
    // Build new context
    const context: DiscordUserContext = {
      username: member.user.username,
      displayName: member.displayName || member.user.username,
      joinedAt: member.joinedAt || new Date(),
      accountAge: member.user.createdAt,
      roles: member.roles.cache
        .filter(role => role.name !== '@everyone')
        .map(role => role.name)
        .slice(0, 10), // Limit to 10 most important roles
      nitroStatus: member.premiumSince !== null,
      presence: member.presence ? {
        status: member.presence.status,
        activities: member.presence.activities
          .map(activity => `${activity.type}: ${activity.name}`)
          .slice(0, 5) // Limit activities
      } : undefined,
      permissions: {
        isAdmin: member.permissions.has('Administrator'),
        isModerator: member.permissions.has('ManageMessages') || 
                     member.permissions.has('KickMembers') ||
                     member.permissions.has('BanMembers'),
        canManageMessages: member.permissions.has('ManageMessages')
      },
      cachedAt: Date.now(),
      ttl: this.DISCORD_CONTEXT_TTL
    };
    
    // Cache the context
    this.discordUserContextCache.set(cacheKey, context);
    
    // Clean up old cache entries periodically
    if (this.discordUserContextCache.size > 100) {
      this.cleanupDiscordContextCache();
    }
    
    return this.formatDiscordContextAsString(context);
  }
  
  /**
   * Format Discord user context as a human-readable string
   */
  private formatDiscordContextAsString(context: DiscordUserContext): string {
    const parts: string[] = ['DISCORD USER CONTEXT:\n'];
    
    // Basic info
    parts.push(`Username: ${context.username} (Display: ${context.displayName})`);
    
    // Account age
    const accountAgeDays = Math.floor((Date.now() - context.accountAge.getTime()) / (1000 * 60 * 60 * 24));
    const joinedDays = Math.floor((Date.now() - context.joinedAt.getTime()) / (1000 * 60 * 60 * 24));
    parts.push(`Account Age: ${accountAgeDays} days | Server Member: ${joinedDays} days`);
    
    // Nitro status
    if (context.nitroStatus) {
      parts.push('Nitro Subscriber: Yes');
    }
    
    // Roles (important for context)
    if (context.roles.length > 0) {
      parts.push(`Roles: ${context.roles.join(', ')}`);
    }
    
    // Permissions summary
    const perms: string[] = [];
    if (context.permissions.isAdmin) perms.push('Admin');
    if (context.permissions.isModerator) perms.push('Moderator');
    if (perms.length > 0) {
      parts.push(`Permissions: ${perms.join(', ')}`);
    }
    
    // Presence (if available)
    if (context.presence) {
      parts.push(`Status: ${context.presence.status}`);
      if (context.presence.activities.length > 0) {
        parts.push(`Activities: ${context.presence.activities.join(', ')}`);
      }
    }
    
    return parts.join('\n') + '\n';
  }
  
  /**
   * Clean up old Discord context cache entries
   */
  private cleanupDiscordContextCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    
    for (const [key, context] of this.discordUserContextCache.entries()) {
      if (now - context.cachedAt > this.DISCORD_CONTEXT_TTL) {
        entriesToDelete.push(key);
      }
    }
    
    entriesToDelete.forEach(key => this.discordUserContextCache.delete(key));
    
    if (entriesToDelete.length > 0) {
      logger.info(`Cleaned up ${entriesToDelete.length} expired Discord context cache entries`);
    }
  }

  // ========== SERVER CULTURE CONTEXT METHODS ==========

  /**
   * Build server culture context from a Guild
   */
  public buildServerCultureContext(guild: Guild): string {
    const guildId = guild.id;
    
    // Check cache first
    const cached = this.serverCultureCache.get(guildId);
    if (cached && (Date.now() - cached.cachedAt) < this.SERVER_CULTURE_TTL) {
      return this.formatServerCultureAsString(cached);
    }
    
    // Build new server culture context
    const culture = this.buildServerCultureData(guild);
    
    // Cache the culture data
    this.serverCultureCache.set(guildId, culture);
    
    // Clean up old cache entries periodically
    if (this.serverCultureCache.size > this.MAX_SERVER_CULTURE_CACHE_ENTRIES) {
      this.cleanupServerCultureCache();
    }
    
    return this.formatServerCultureAsString(culture);
  }

  /**
   * Get server culture data from cache or build new
   */
  public getServerCulture(guildId: string): ServerCulture | null {
    const cached = this.serverCultureCache.get(guildId);
    if (cached && (Date.now() - cached.cachedAt) < this.SERVER_CULTURE_TTL) {
      return cached;
    }
    return null;
  }

  /**
   * Save server culture data to cache
   */
  public saveServerCulture(guildId: string, culture: ServerCulture): void {
    culture.cachedAt = Date.now();
    culture.ttl = this.SERVER_CULTURE_TTL;
    this.serverCultureCache.set(guildId, culture);
    
    // Clean up periodically
    if (this.serverCultureCache.size > this.MAX_SERVER_CULTURE_CACHE_ENTRIES) {
      this.cleanupServerCultureCache();
    }
  }

  /**
   * Build server culture data from a Discord Guild object
   */
  private buildServerCultureData(guild: Guild): ServerCulture {
    const now = Date.now();
    
    // Extract popular emojis (custom emojis from the guild)
    const popularEmojis = guild.emojis.cache
      .filter(emoji => !emoji.animated) // Focus on static emojis for consistency
      .map(emoji => ({ emoji: emoji.toString(), count: 1 })) // Default count since we don't track usage
      .slice(0, 10); // Limit to 10 most recent
    
    // Extract active voice channels
    const activeVoiceChannels = guild.channels.cache
      .filter(channel => channel.isVoiceBased() && channel.members && channel.members.size > 0)
      .map(channel => channel.name)
      .slice(0, 5); // Limit to 5 active channels
    
    // Extract recent events (server boosts, member milestones)
    const recentEvents: Array<{name: string, date: Date}> = [];
    
    // Add server boost information as an event
    if (guild.premiumSubscriptionCount && guild.premiumSubscriptionCount > 0) {
      recentEvents.push({
        name: `Server boosted to level ${guild.premiumTier || 0}`,
        date: new Date(now - 24 * 60 * 60 * 1000) // Approximate recent boost
      });
    }
    
    // Add member milestone events
    const memberCount = guild.memberCount;
    if (memberCount >= 100) {
      const milestones = [100, 500, 1000, 5000, 10000];
      const reachedMilestone = milestones.filter(m => memberCount >= m).pop();
      if (reachedMilestone) {
        recentEvents.push({
          name: `Reached ${reachedMilestone} members`,
          date: new Date(now - 7 * 24 * 60 * 60 * 1000) // Approximate milestone
        });
      }
    }
    
    // Extract top channels by type and activity
    const topChannels = guild.channels.cache
      .filter(channel => channel.isTextBased() && !channel.isThread())
      .map(channel => ({
        name: channel.name,
        messageCount: 1 // Default since we don't track message counts
      }))
      .slice(0, 5); // Limit to 5 top channels
    
    return {
      guildId: guild.id,
      popularEmojis,
      activeVoiceChannels,
      recentEvents,
      boostLevel: guild.premiumTier || 0,
      topChannels,
      preferredLocale: guild.preferredLocale || 'en-US',
      cachedAt: now,
      ttl: this.SERVER_CULTURE_TTL
    };
  }

  /**
   * Format server culture as a human-readable string
   */
  private formatServerCultureAsString(culture: ServerCulture): string {
    const parts: string[] = ['SERVER CULTURE CONTEXT:\n'];
    
    // Popular emojis
    if (culture.popularEmojis.length > 0) {
      const emojiList = culture.popularEmojis.slice(0, 5).map(e => e.emoji).join(' ');
      parts.push(`Popular Emojis: ${emojiList}`);
    }
    
    // Active voice channels
    if (culture.activeVoiceChannels.length > 0) {
      parts.push(`Active Voice: ${culture.activeVoiceChannels.length} channels (${culture.activeVoiceChannels.slice(0, 3).join(', ')})`);
    } else {
      parts.push('Active Voice: No active voice channels');
    }
    
    // Recent events
    if (culture.recentEvents.length > 0) {
      const eventNames = culture.recentEvents.slice(0, 3).map(e => e.name).join(', ');
      parts.push(`Recent Events: ${eventNames}`);
    }
    
    // Boost level
    parts.push(`Boost Level: ${culture.boostLevel}`);
    
    // Top channels
    if (culture.topChannels.length > 0) {
      const channelNames = culture.topChannels.slice(0, 3).map(c => `#${c.name}`).join(', ');
      parts.push(`Top Channels: ${channelNames}`);
    }
    
    // Language preference
    parts.push(`Language: ${culture.preferredLocale}`);
    
    return parts.join('\n') + '\n';
  }

  /**
   * Clean up old server culture cache entries
   */
  private cleanupServerCultureCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    
    for (const [guildId, culture] of this.serverCultureCache.entries()) {
      if (now - culture.cachedAt > this.SERVER_CULTURE_TTL) {
        entriesToDelete.push(guildId);
      }
    }
    
    entriesToDelete.forEach(guildId => this.serverCultureCache.delete(guildId));
    
    if (entriesToDelete.length > 0) {
      logger.info(`Cleaned up ${entriesToDelete.length} expired server culture cache entries`);
    }
  }
}
