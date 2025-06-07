interface RunnerOptions {
    suites?: string[];
    output?: string;
    compare?: string;
    iterations?: number;
    warmup?: number;
    format?: 'json' | 'table' | 'summary';
    filter?: string;
}
export declare class BenchmarkRunner {
    private modules;
    run(options?: RunnerOptions): Promise<void>;
    private calculateSummary;
    private analyzePerformance;
    private getSystemInfo;
    private outputResults;
    private outputTable;
    private outputSummary;
    private compareResults;
    listSuites(): void;
}
export {};
//# sourceMappingURL=runner.d.ts.map