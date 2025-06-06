// Main benchmark framework exports
export * from './base';
export * from './memoryProfiler';
export * from './reportGenerator';
export * from './runner';

// Individual benchmark suite exports
export { runContextManagerBenchmarks } from './contextManager.bench';
export { runMessageSplitterBenchmarks } from './messageSplitter.bench';
export { runRateLimiterBenchmarks } from './rateLimiter.bench';
export { runRoastProbabilityBenchmarks } from './roastProbability.bench';

// Re-export commonly used types
export type {
  BenchmarkResult,
  BenchmarkOptions,
  MemorySnapshot,
  HeapAnalysis,
  ProfileSession,
  ReportData,
  SystemInfo,
  BenchmarkSummary,
  PerformanceAnalysis,
  Recommendation
} from './base';

export type {
  AdvancedMemoryProfiler
} from './memoryProfiler';

export type {
  BenchmarkReportGenerator
} from './reportGenerator';

// Default export for convenience
export { BenchmarkRunner } from './runner';