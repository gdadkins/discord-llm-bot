/**
 * User Analytics Module Exports
 * 
 * Provides the public API for user analysis functionality:
 * - UserAnalysisService: Main orchestrator service
 * - UserMetricsCollector: Data collection and aggregation
 * - UserInsightGenerator: Analysis and insight generation
 */

export { UserAnalysisService } from './UserAnalysisService';
export { UserMetricsCollector } from './UserMetricsCollector';
export { UserInsightGenerator } from './UserInsightGenerator';

// Export types if needed by external consumers
export type { MessageBatch, CollectionMetrics } from './UserMetricsCollector';
export type { BatchAnalysis, InsightConfig } from './UserInsightGenerator';

// Export roast dictionaries for potential reuse
export { topicRoasts, styleRoasts, interestRoasts } from './roastDictionaries';