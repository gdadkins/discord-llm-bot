import { logger } from '../utils/logger';

interface ContextItem {
  content: string;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

interface RichContext {
  conversations: Map<string, string[]>;
  codeSnippets: Map<string, ContextItem[]>;
  embarrassingMoments: ContextItem[];
  runningGags: ContextItem[];
  lastRoasted: Map<string, Date>;
  approximateSize: number; // Cached size estimate
  lastSizeUpdate: number;
}

interface MemoryStats {
  totalServers: number;
  totalMemoryUsage: number;
  averageServerSize: number;
  largestServerSize: number;
  itemCounts: {
    embarrassingMoments: number;
    codeSnippets: number;
    runningGags: number;
  };
}

export class ContextManager {
  private serverContext: Map<string, RichContext> = new Map();
  private readonly MAX_CONTEXT_SIZE = 500000; // characters, not tokens
  private readonly MAX_EMBARRASSING_MOMENTS = 100;
  private readonly MAX_CODE_SNIPPETS_PER_USER = 20;
  private readonly MAX_RUNNING_GAGS = 50;
  private readonly SIZE_UPDATE_INTERVAL = 60000; // 1 minute
  private readonly MEMORY_CHECK_INTERVAL = 300000; // 5 minutes
  private memoryCheckTimer: NodeJS.Timeout | null = null;

  addEmbarrassingMoment(
    serverId: string,
    userId: string,
    moment: string,
  ): void {
    const context = this.getOrCreateContext(serverId);
    const now = Date.now();
    const momentItem: ContextItem = {
      content: `${userId}: ${moment}`,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
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
    const snippetItem: ContextItem = {
      content: snippetContent,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
    };
    
    context.codeSnippets.get(userId)!.push(snippetItem);
    this.incrementSize(context, snippetContent.length);
    this.intelligentTrim(context);
  }

  buildSuperContext(serverId: string, userId: string): string {
    const context = this.serverContext.get(serverId);
    if (!context) return '';

    const parts: string[] = ['DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n'];

    // Add embarrassing moments (update access stats)
    if (context.embarrassingMoments.length > 0) {
      parts.push('HALL OF SHAME:\n');
      const now = Date.now();
      context.embarrassingMoments.forEach((momentItem) => {
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
      const now = Date.now();
      userCode.forEach((snippetItem) => {
        snippetItem.accessCount++;
        snippetItem.lastAccessed = now;
        parts.push(`${snippetItem.content}\n---\n`);
      });
    }

    // Add running gags (update access stats)
    if (context.runningGags.length > 0) {
      parts.push('RUNNING GAGS TO REFERENCE:\n');
      const now = Date.now();
      context.runningGags.forEach((gagItem) => {
        gagItem.accessCount++;
        gagItem.lastAccessed = now;
        parts.push(`- ${gagItem.content}\n`);
      });
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
      };
      this.serverContext.set(serverId, newContext);
      
      // Initialize size cache for new context
      this.refreshApproximateSize(newContext);
      
      // Start memory monitoring if this is the first server
      if (this.serverContext.size === 1 && !this.memoryCheckTimer) {
        this.startMemoryMonitoring();
      }
    }
    return this.serverContext.get(serverId)!;
  }

  addRunningGag(serverId: string, gag: string): void {
    const context = this.getOrCreateContext(serverId);
    const now = Date.now();
    const gagItem: ContextItem = {
      content: gag,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
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
    
    // Add overhead estimate for Map and array structures
    totalSize += (context.codeSnippets.size * 100); // Map overhead
    totalSize += (context.lastRoasted.size * 50); // Date objects
    
    context.approximateSize = totalSize;
    context.lastSizeUpdate = now;
  }

  private startMemoryMonitoring(): void {
    this.memoryCheckTimer = setInterval(() => {
      this.performMemoryMaintenance();
    }, this.MEMORY_CHECK_INTERVAL);
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
           context.lastRoasted.size === 0;
  }

  public getMemoryStats(): MemoryStats {
    let totalMemoryUsage = 0;
    let largestServerSize = 0;
    let totalEmbarrassingMoments = 0;
    let totalCodeSnippets = 0;
    let totalRunningGags = 0;
    
    for (const context of this.serverContext.values()) {
      // Use cached approximateSize instead of recalculating
      totalMemoryUsage += context.approximateSize;
      largestServerSize = Math.max(largestServerSize, context.approximateSize);
      
      totalEmbarrassingMoments += context.embarrassingMoments.length;
      totalRunningGags += context.runningGags.length;
      
      for (const snippets of context.codeSnippets.values()) {
        totalCodeSnippets += snippets.length;
      }
    }
    
    return {
      totalServers: this.serverContext.size,
      totalMemoryUsage,
      averageServerSize: this.serverContext.size > 0 ? totalMemoryUsage / this.serverContext.size : 0,
      largestServerSize,
      itemCounts: {
        embarrassingMoments: totalEmbarrassingMoments,
        codeSnippets: totalCodeSnippets,
        runningGags: totalRunningGags
      }
    };
  }

  public cleanup(): void {
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
    this.serverContext.clear();
    logger.info('ContextManager cleanup completed');
  }
}
