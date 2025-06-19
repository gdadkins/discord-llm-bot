/**
 * Analytics Services Export
 * 
 * Central export for all analytics services.
 * Part of the refactored analytics system (REF005).
 * 
 * @module AnalyticsServices
 */

export { UserBehaviorAnalytics } from './UserBehaviorAnalytics';
export type { IUserBehaviorAnalytics } from './UserBehaviorAnalytics';

export { EventTrackingService } from './EventTrackingService';
export type { IEventTrackingService } from './EventTrackingService';

export { EventBatchingService } from './EventBatchingService';
export type { 
  IEventBatchingService, 
  BatchableEvent, 
  EventType, 
  EventPriority, 
  BatchConfig, 
  BatchMetrics,
  DataStoreEvent 
} from './EventBatchingService';

export { EventAggregatorService } from './EventAggregatorService';
export type {
  IAggregatorService,
  AggregationWindow,
  AggregationConfig,
  AggregationResult,
  PatternMatch
} from './EventAggregatorService';

export { MetricsCollectionService } from './MetricsCollectionService';
export type { IMetricsCollectionService, DailyAggregate } from './MetricsCollectionService';

export { ReportGenerationService } from './ReportGenerationService';
export type { IReportGenerationService, DataStoreDashboard } from './ReportGenerationService';

// Behavior Analytics Module
export * from './behavior';

// User Analytics Module
export * from './user';