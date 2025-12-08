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
export declare class AdvancedMemoryProfiler {
    private options;
    private sessions;
    private activeSession;
    private intervalId;
    private gcObserver;
    private snapshots;
    private readonly maxSnapshots;
    constructor(options?: {
        autoSample?: boolean;
        sampleInterval?: number;
        maxSessions?: number;
    });
    private setupGCObserver;
    private recordGCEvent;
    startSession(operation: string, parameters?: any): string;
    endSession(sessionId?: string): ProfileSession | null;
    snapshot(label?: string): MemorySnapshot;
    private startAutoSampling;
    private stopAutoSampling;
    private analyzeSession;
    private detectMemoryLeaks;
    private calculateTrend;
    private generateRecommendations;
    private calculateVariance;
    getSessionReport(sessionId: string): ProfileSession | null;
    getAllSessions(): ProfileSession[];
    exportReport(outputPath?: string): string;
    private generateGlobalSummary;
    cleanup(): void;
    static profileFunction<T>(fn: () => T | Promise<T>, label: string): Promise<{
        result: T;
        profile: ProfileSession;
    }>;
    static profileBenchmark<T>(benchmarkFn: () => T | Promise<T>, iterations: number, label: string): Promise<{
        results: T[];
        profile: ProfileSession;
        metrics: any;
    }>;
}
//# sourceMappingURL=memoryProfiler.d.ts.map