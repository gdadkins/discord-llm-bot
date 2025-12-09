
import { BehaviorAnalyzer, UserBehaviorPattern } from '../../analytics/behavior';
import { globalPools } from '../../../utils/PromisePool';
import { logger } from '../../../utils/logger';

export class BehaviorAnalysisService {
    private behaviorAnalyzer: BehaviorAnalyzer;

    constructor() {
        // If BehaviorAnalyzer needs dependencies, inject them here later
        this.behaviorAnalyzer = new BehaviorAnalyzer();
    }

    /**
     * Analyze a message for behavioral patterns
     * Fire-and-forget with promise pool
     */
    public async analyzeMessageBehavior(userId: string, message: string): Promise<void> {
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

    public getBehaviorContext(userId: string): string | null {
        return this.behaviorAnalyzer.getBehaviorContext(userId);
    }

    /**
     * Get behavioral analysis statistics
     */
    public getBehaviorStats() {
        return this.behaviorAnalyzer.getStats();
    }

    public cleanup(): void {
        this.behaviorAnalyzer.cleanup();
    }
}
