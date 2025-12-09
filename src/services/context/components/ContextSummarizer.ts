
import { logger } from '../../../utils/logger';
import { MemoryOptimizationService } from '../MemoryOptimizationService';
import { ConversationMemoryService } from '../ConversationMemoryService';
import { ContextStorageService } from './ContextStorageService';

export class ContextSummarizer {
    constructor(
        private memoryOptimizationService: MemoryOptimizationService,
        private conversationMemoryService: ConversationMemoryService,
        private contextStorageService: ContextStorageService
    ) { }

    public performScheduledSummarization(): void {
        const now = Date.now();
        const contexts = this.contextStorageService.getAllContexts();

        for (const [serverId, context] of contexts.entries()) {
            if (!this.memoryOptimizationService.shouldSummarize(context)) {
                continue;
            }

            logger.info(`Performing scheduled summarization for server ${serverId}`);
            this.memoryOptimizationService.summarizeServerContext(context);
            context.lastSummarization = now;
        }
    }

    public async summarizeAndCompress(serverId: string): Promise<{ removed: number; kept: number }> {
        const context = this.contextStorageService.getContext(serverId);
        if (!context) return { removed: 0, kept: 0 };

        const initialItemCount = this.conversationMemoryService.countItems(context);
        const totalInitialItems = initialItemCount.embarrassingMoments +
            initialItemCount.codeSnippets +
            initialItemCount.runningGags +
            initialItemCount.summarizedFacts;

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
}
