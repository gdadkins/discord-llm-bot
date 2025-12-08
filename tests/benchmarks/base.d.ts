export interface BenchmarkResult {
    name: string;
    operations: number;
    duration: number;
    opsPerSecond: number;
    avgTimePerOp: number;
    minTime: number;
    maxTime: number;
    p50: number;
    p95: number;
    p99: number;
    memoryUsed: number;
    heapUsed: number;
    external: number;
    gcRuns: number;
}
export interface BenchmarkOptions {
    name: string;
    iterations?: number;
    warmup?: number;
    timeout?: number;
}
export declare class Benchmark {
    private options;
    private results;
    private memorySnapshots;
    private gcRuns;
    private startHeap;
    private startTime;
    constructor(options: BenchmarkOptions);
    run(fn: () => void | Promise<void>): Promise<BenchmarkResult>;
    private calculateResults;
    private percentile;
    static formatResult(result: BenchmarkResult): string;
}
export declare class BenchmarkSuite {
    private benchmarks;
    private results;
    add(name: string, fn: () => void | Promise<void>, options?: Partial<BenchmarkOptions>): void;
    run(): Promise<BenchmarkResult[]>;
    saveReport(outputPath?: string): void;
    compareWith(previousResults: BenchmarkResult[]): void;
}
export declare class MemoryProfiler {
    private snapshots;
    private startTime;
    private interval;
    constructor();
    start(intervalMs?: number): void;
    stop(): void;
    snapshot(label?: string): void;
    getReport(): any;
    reset(): void;
}
//# sourceMappingURL=base.d.ts.map