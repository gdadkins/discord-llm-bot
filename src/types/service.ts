/**
 * Type definitions for service methods and event handlers
 */

export type AsyncFunction<T extends unknown[] = unknown[], R = unknown> = (...args: T) => Promise<R>;

export type EventListener<T extends unknown[] = unknown[]> = (...args: T) => void;

export interface ServiceMethodOptions {
  timeout?: number;
  retryable?: boolean;
  fallback?: AsyncFunction;
  enableMetrics?: boolean;
  enableCircuitBreaker?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ServiceLifecycleEvents {
  initialized: () => void;
  started: () => void;
  stopped: () => void;
  error: (error: Error) => void;
  statusChanged: (oldStatus: string, newStatus: string) => void;
}

export type ServiceEventEmitter = {
  [K in keyof ServiceLifecycleEvents]: ServiceLifecycleEvents[K];
};

export interface UserAnalysisData {
  userId: string;
  guildId?: string;
  messageCount: number;
  lastMessageTimestamp: number;
  averageMessageLength: number;
  topKeywords: string[];
  sentiment?: {
    positive: number;
    negative: number;
    neutral: number;
  };
  metadata?: Record<string, unknown>;
}