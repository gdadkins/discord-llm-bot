
import { RichContext, MemoryStats, ContextItem } from '../types';
import { logger } from '../../../utils/logger';
import { MemoryOptimizationService } from '../MemoryOptimizationService';
import { ConversationMemoryService } from '../ConversationMemoryService';

export class ContextStorageService {
    private serverContext: Map<string, RichContext> = new Map();
    private readonly MEMORY_WARNING_THRESHOLD_MB = 400;
    private readonly MEMORY_CRITICAL_THRESHOLD_MB = 500;
    private readonly STALE_DATA_DAYS = 30;

    constructor(
        private memoryOptimizationService: MemoryOptimizationService,
        private conversationMemoryService: ConversationMemoryService
    ) { }

    public getOrCreateContext(serverId: string): RichContext {
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
                summarizedFacts: [],
                crossServerEnabled: false,
                compressionRatio: 1.0,
                lastSummarization: now,
                socialGraph: new Map(),
            };

            this.serverContext.set(serverId, newContext);
            this.memoryOptimizationService.refreshApproximateSize(newContext);
        }
        return this.serverContext.get(serverId)!;
    }

    public getContext(serverId: string): RichContext | undefined {
        return this.serverContext.get(serverId);
    }

    public getAllContexts(): Map<string, RichContext> {
        return this.serverContext;
    }

    public deleteContext(serverId: string): boolean {
        return this.serverContext.delete(serverId);
    }

    public clearAll(): void {
        this.serverContext.clear();
    }

    public performMemoryMaintenance(): void {
        const stats = this.getMemoryStats();

        logger.info('Memory maintenance check', {
            totalServers: stats.totalServers,
            totalMemoryUsage: stats.totalMemoryUsage,
            averageServerSize: stats.averageServerSize,
            largestServerSize: stats.largestServerSize
        });

        for (const [serverId, context] of this.serverContext.entries()) {
            if (this.isContextEmpty(context)) {
                this.serverContext.delete(serverId);
                logger.info(`Removed empty context for server ${serverId}`);
            }
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

    public performStaleDataCleanup(): void {
        const now = Date.now();
        const staleThreshold = now - (this.STALE_DATA_DAYS * 24 * 60 * 60 * 1000);
        let cleanedServers = 0;
        let totalItemsRemoved = 0;

        for (const [, context] of this.serverContext.entries()) {
            let itemsRemoved = 0;

            const freshMoments = context.embarrassingMoments.filter(item => item.timestamp > staleThreshold);
            itemsRemoved += context.embarrassingMoments.length - freshMoments.length;
            context.embarrassingMoments = freshMoments;

            const freshGags = context.runningGags.filter(item => item.timestamp > staleThreshold);
            itemsRemoved += context.runningGags.length - freshGags.length;
            context.runningGags = freshGags;

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

            const freshFacts = context.summarizedFacts.filter(item => item.timestamp > staleThreshold);
            itemsRemoved += context.summarizedFacts.length - freshFacts.length;
            context.summarizedFacts = freshFacts;

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

    public monitorMemoryUsage(callback?: () => void): void {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

        logger.info('Memory usage stats', {
            heapUsedMB,
            heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            externalMB: Math.round(memoryUsage.external / 1024 / 1024),
            serverCount: this.serverContext.size
        });

        if (heapUsedMB > this.MEMORY_WARNING_THRESHOLD_MB) {
            logger.warn(`Memory usage warning: ${heapUsedMB}MB used (threshold: ${this.MEMORY_WARNING_THRESHOLD_MB}MB)`);
        }

        if (heapUsedMB > this.MEMORY_CRITICAL_THRESHOLD_MB) {
            logger.error(`Memory usage critical: ${heapUsedMB}MB used (threshold: ${this.MEMORY_CRITICAL_THRESHOLD_MB}MB)`);
            if (callback) callback();
        }
    }
}
