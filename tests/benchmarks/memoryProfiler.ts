import { performance } from 'perf_hooks';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface MemorySnapshot {
  timestamp: number;
  memory: NodeJS.MemoryUsage;
  label?: string;
  gcInfo?: {
    type?: string;
    duration?: number;
  };
}

export interface HeapAnalysis {
  peakUsage: number;
  averageUsage: number;
  growthRate: number;
  leakIndicators: Array<{
    timestamp: number;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
  recommendations: string[];
}

export interface ProfileSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  snapshots: MemorySnapshot[];
  analysis?: HeapAnalysis;
  metadata: {
    operation: string;
    parameters?: any;
  };
}

export class AdvancedMemoryProfiler {
  private sessions: Map<string, ProfileSession> = new Map();
  private activeSession: string | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private gcObserver: any = null;
  private snapshots: MemorySnapshot[] = [];
  private readonly maxSnapshots: number = 10000;

  constructor(private options: {
    autoSample?: boolean;
    sampleInterval?: number;
    maxSessions?: number;
  } = {}) {
    this.options.autoSample = this.options.autoSample ?? false;
    this.options.sampleInterval = this.options.sampleInterval ?? 100;
    this.options.maxSessions = this.options.maxSessions ?? 100;

    // Enable garbage collection events if available
    this.setupGCObserver();
  }

  private setupGCObserver(): void {
    try {
      if (typeof global.gc === 'function') {
        // Enable GC tracking through performance observers if available
        if (performance.eventLoopUtilization && (performance as any).PerformanceObserver) {
          const PerformanceObserver = (performance as any).PerformanceObserver;
          this.gcObserver = new PerformanceObserver((list: any) => {
            for (const entry of list.getEntries()) {
              if (entry.entryType === 'gc') {
                this.recordGCEvent(entry);
              }
            }
          });
          
          try {
            this.gcObserver.observe({ type: 'gc' });
          } catch (error) {
            // GC observation not supported in this Node.js version
            this.gcObserver = null;
          }
        }
      }
    } catch (error) {
      // GC observation not available
    }
  }

  private recordGCEvent(entry: any): void {
    if (this.activeSession) {
      const session = this.sessions.get(this.activeSession);
      if (session && session.snapshots.length > 0) {
        const lastSnapshot = session.snapshots[session.snapshots.length - 1];
        lastSnapshot.gcInfo = {
          type: entry.detail?.kind || 'unknown',
          duration: entry.duration || 0
        };
      }
    }
  }

  startSession(operation: string, parameters?: any): string {
    const sessionId = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ProfileSession = {
      sessionId,
      startTime: Date.now(),
      snapshots: [],
      metadata: { operation, parameters }
    };

    this.sessions.set(sessionId, session);
    this.activeSession = sessionId;

    // Take initial snapshot
    this.snapshot('session_start');

    // Start auto-sampling if enabled
    if (this.options.autoSample) {
      this.startAutoSampling();
    }

    // Cleanup old sessions if we exceed the limit
    if (this.sessions.size > this.options.maxSessions!) {
      const oldestSession = Array.from(this.sessions.keys())[0];
      this.sessions.delete(oldestSession);
    }

    return sessionId;
  }

  endSession(sessionId?: string): ProfileSession | null {
    const targetSession = sessionId || this.activeSession;
    if (!targetSession) return null;

    const session = this.sessions.get(targetSession);
    if (!session) return null;

    // Take final snapshot
    this.snapshot('session_end');

    // Stop auto-sampling
    this.stopAutoSampling();

    // Complete session
    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;

    // Run analysis
    session.analysis = this.analyzeSession(session);

    // Clear active session if it was the current one
    if (this.activeSession === targetSession) {
      this.activeSession = null;
    }

    return session;
  }

  snapshot(label?: string): MemorySnapshot {
    const timestamp = Date.now();
    const memory = process.memoryUsage();
    
    const snapshot: MemorySnapshot = {
      timestamp,
      memory,
      label
    };

    // Add to active session if available
    if (this.activeSession) {
      const session = this.sessions.get(this.activeSession);
      if (session) {
        session.snapshots.push(snapshot);
      }
    }

    // Add to global snapshots with size limit
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots * 0.8); // Keep 80% of max
    }

    return snapshot;
  }

  private startAutoSampling(): void {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this.snapshot('auto_sample');
    }, this.options.sampleInterval);
  }

  private stopAutoSampling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private analyzeSession(session: ProfileSession): HeapAnalysis {
    const snapshots = session.snapshots;
    if (snapshots.length < 2) {
      return {
        peakUsage: snapshots[0]?.memory.heapUsed || 0,
        averageUsage: snapshots[0]?.memory.heapUsed || 0,
        growthRate: 0,
        leakIndicators: [],
        recommendations: ['Insufficient data for analysis']
      };
    }

    const heapValues = snapshots.map(s => s.memory.heapUsed);
    const peakUsage = Math.max(...heapValues);
    const averageUsage = heapValues.reduce((a, b) => a + b, 0) / heapValues.length;
    
    // Calculate growth rate (bytes per second)
    const startHeap = heapValues[0];
    const endHeap = heapValues[heapValues.length - 1];
    const durationSeconds = (session.duration || 1) / 1000;
    const growthRate = (endHeap - startHeap) / durationSeconds;

    // Detect memory leaks and issues
    const leakIndicators = this.detectMemoryLeaks(snapshots);
    const recommendations = this.generateRecommendations(snapshots, growthRate, peakUsage);

    return {
      peakUsage,
      averageUsage,
      growthRate,
      leakIndicators,
      recommendations
    };
  }

  private detectMemoryLeaks(snapshots: MemorySnapshot[]): Array<{
    timestamp: number;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }> {
    const indicators = [];
    const heapValues = snapshots.map(s => s.memory.heapUsed);
    
    // Check for consistent growth without cleanup
    for (let i = 10; i < snapshots.length; i++) {
      const recentValues = heapValues.slice(i - 10, i);
      const trend = this.calculateTrend(recentValues);
      
      if (trend > 0.8) { // Strong upward trend
        const growthRate = (recentValues[recentValues.length - 1] - recentValues[0]) / 10;
        const severity = growthRate > 1024 * 1024 ? 'high' : growthRate > 512 * 1024 ? 'medium' : 'low';
        
        indicators.push({
          timestamp: snapshots[i].timestamp,
          severity,
          description: `Consistent memory growth detected: ${(growthRate / 1024).toFixed(2)}KB per sample`
        });
      }
    }

    // Check for memory spikes
    for (let i = 1; i < snapshots.length; i++) {
      const current = heapValues[i];
      const previous = heapValues[i - 1];
      const spike = current - previous;
      
      if (spike > 10 * 1024 * 1024) { // 10MB spike
        indicators.push({
          timestamp: snapshots[i].timestamp,
          severity: 'high',
          description: `Large memory spike detected: ${(spike / 1024 / 1024).toFixed(2)}MB`
        });
      }
    }

    return indicators;
  }

  private calculateTrend(values: number[]): number {
    // Simple linear regression to calculate trend
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const correlation = slope > 0 ? 1 : slope < 0 ? -1 : 0;
    
    return correlation;
  }

  private generateRecommendations(snapshots: MemorySnapshot[], growthRate: number, peakUsage: number): string[] {
    const recommendations = [];
    
    if (growthRate > 1024 * 1024) { // > 1MB/sec growth
      recommendations.push('High memory growth rate detected. Check for memory leaks in event listeners, timers, or closure retention.');
    }
    
    if (peakUsage > 100 * 1024 * 1024) { // > 100MB peak
      recommendations.push('High peak memory usage. Consider implementing memory pooling or chunked processing.');
    }
    
    const gcCount = snapshots.filter(s => s.gcInfo).length;
    if (gcCount > snapshots.length * 0.1) { // > 10% GC events
      recommendations.push('Frequent garbage collection detected. Consider optimizing object allocation patterns.');
    }
    
    const heapValues = snapshots.map(s => s.memory.heapUsed);
    const variance = this.calculateVariance(heapValues);
    if (variance > Math.pow(10 * 1024 * 1024, 2)) { // High variance
      recommendations.push('Highly variable memory usage. Consider implementing caching or batching strategies.');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Memory usage appears normal. Continue monitoring for long-term trends.');
    }
    
    return recommendations;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  getSessionReport(sessionId: string): ProfileSession | null {
    return this.sessions.get(sessionId) || null;
  }

  getAllSessions(): ProfileSession[] {
    return Array.from(this.sessions.values());
  }

  exportReport(outputPath?: string): string {
    const reportDir = outputPath || './memory-reports';
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
    const reportPath = join(reportDir, `memory-profile-${timestamp}.json`);

    const report = {
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        totalMemory: require('os').totalmem(),
        freeMemory: require('os').freemem()
      },
      sessions: Array.from(this.sessions.values()),
      globalSnapshots: this.snapshots.slice(-100), // Last 100 snapshots
      summary: this.generateGlobalSummary()
    };

    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
  }

  private generateGlobalSummary(): any {
    const allSnapshots = this.snapshots;
    if (allSnapshots.length === 0) return {};

    const heapValues = allSnapshots.map(s => s.memory.heapUsed);
    const rssValues = allSnapshots.map(s => s.memory.rss);
    
    return {
      totalSnapshots: allSnapshots.length,
      duration: allSnapshots.length > 1 ? 
        allSnapshots[allSnapshots.length - 1].timestamp - allSnapshots[0].timestamp : 0,
      heap: {
        peak: Math.max(...heapValues),
        average: heapValues.reduce((a, b) => a + b, 0) / heapValues.length,
        current: heapValues[heapValues.length - 1]
      },
      rss: {
        peak: Math.max(...rssValues),
        average: rssValues.reduce((a, b) => a + b, 0) / rssValues.length,
        current: rssValues[rssValues.length - 1]
      }
    };
  }

  cleanup(): void {
    this.stopAutoSampling();
    if (this.gcObserver) {
      this.gcObserver.disconnect();
    }
    this.sessions.clear();
    this.snapshots = [];
    this.activeSession = null;
  }

  // Utility methods for integration with benchmarks
  static profileFunction<T>(fn: () => T | Promise<T>, label: string): Promise<{ result: T; profile: ProfileSession }> {
    const profiler = new AdvancedMemoryProfiler({ autoSample: true, sampleInterval: 10 });
    
    return new Promise(async (resolve, reject) => {
      try {
        const sessionId = profiler.startSession(`function_${label}`);
        const result = await fn();
        const profile = profiler.endSession(sessionId)!;
        profiler.cleanup();
        
        resolve({ result, profile });
      } catch (error) {
        profiler.cleanup();
        reject(error);
      }
    });
  }

  static async profileBenchmark<T>(
    benchmarkFn: () => T | Promise<T>, 
    iterations: number,
    label: string
  ): Promise<{ results: T[]; profile: ProfileSession; metrics: any }> {
    const profiler = new AdvancedMemoryProfiler({ autoSample: true, sampleInterval: 25 });
    const sessionId = profiler.startSession(`benchmark_${label}`, { iterations });
    
    const results: T[] = [];
    const timings: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      if (i % Math.floor(iterations / 10) === 0) {
        profiler.snapshot(`iteration_${i}`);
      }
      
      const start = performance.now();
      results.push(await benchmarkFn());
      const end = performance.now();
      timings.push(end - start);
    }
    
    const profile = profiler.endSession(sessionId)!;
    profiler.cleanup();
    
    const metrics = {
      avgTime: timings.reduce((a, b) => a + b, 0) / timings.length,
      minTime: Math.min(...timings),
      maxTime: Math.max(...timings),
      totalTime: timings.reduce((a, b) => a + b, 0),
      opsPerSecond: 1000 / (timings.reduce((a, b) => a + b, 0) / timings.length)
    };
    
    return { results, profile, metrics };
  }
}