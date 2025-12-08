import { BenchmarkResult } from './base';
import { ProfileSession } from './memoryProfiler';
export interface ReportData {
    timestamp: string;
    system: SystemInfo;
    benchmarks: BenchmarkResult[];
    memoryProfiles?: ProfileSession[];
    summary: BenchmarkSummary;
    analysis: PerformanceAnalysis;
    recommendations: Recommendation[];
}
export interface SystemInfo {
    platform: string;
    arch: string;
    nodeVersion: string;
    v8Version: string;
    memory: {
        total: number;
        free: number;
    };
    cpus: number;
    loadavg: number[];
}
export interface BenchmarkSummary {
    totalBenchmarks: number;
    totalOperations: number;
    totalDuration: number;
    averageOpsPerSecond: number;
    averageLatency: {
        p50: number;
        p95: number;
        p99: number;
    };
    memoryUsage: {
        total: number;
        average: number;
        peak: number;
    };
    performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}
export interface PerformanceAnalysis {
    bottlenecks: Array<{
        operation: string;
        issue: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        impact: string;
    }>;
    strengths: Array<{
        operation: string;
        metric: string;
        value: string;
    }>;
    trends: {
        throughputTrend: 'improving' | 'stable' | 'degrading';
        latencyTrend: 'improving' | 'stable' | 'degrading';
        memoryTrend: 'improving' | 'stable' | 'degrading';
    };
    regressionRisk: 'low' | 'medium' | 'high';
}
export interface Recommendation {
    type: 'performance' | 'memory' | 'architecture' | 'monitoring';
    priority: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    implementation: string;
    expectedImpact: string;
    affectedOperations: string[];
}
export declare class BenchmarkReportGenerator {
    private outputDir;
    constructor(outputDir?: string);
    generateReport(benchmarks: BenchmarkResult[], memoryProfiles?: ProfileSession[], previousReport?: string): string;
    private getSystemInfo;
    private generateSummary;
    private calculatePerformanceGrade;
    private performAnalysis;
    private identifyBottlenecks;
    private identifyStrengths;
    private analyzeTrends;
    private assessRegressionRisk;
    private generateRecommendations;
    private generateJSONReport;
    private generateHTMLReport;
    private generateMarkdownReport;
    private generateCSVReport;
    private generateComparison;
    private generateComparisonHTML;
    private generateComparisonMarkdown;
}
//# sourceMappingURL=reportGenerator.d.ts.map