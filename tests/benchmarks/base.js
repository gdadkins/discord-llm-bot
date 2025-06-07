"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryProfiler = exports.BenchmarkSuite = exports.Benchmark = void 0;
const perf_hooks_1 = require("perf_hooks");
const fs_1 = require("fs");
const path_1 = require("path");
class Benchmark {
    options;
    results = [];
    memorySnapshots = [];
    gcRuns = 0;
    startHeap = 0;
    startTime = 0;
    constructor(options) {
        this.options = options;
        this.options.iterations = this.options.iterations || 1000;
        this.options.warmup = this.options.warmup || 100;
        this.options.timeout = this.options.timeout || 60000; // 60 seconds default
    }
    async run(fn) {
        console.log(`Running benchmark: ${this.options.name}`);
        // Force garbage collection before starting
        if (typeof global.gc === 'function') {
            global.gc();
        }
        // Warmup phase
        console.log(`  Warmup: ${this.options.warmup} iterations`);
        for (let i = 0; i < this.options.warmup; i++) {
            await fn();
        }
        // Clear results and prepare for actual benchmark
        this.results = [];
        this.memorySnapshots = [];
        this.gcRuns = 0;
        // Take initial memory snapshot
        const initialMemory = process.memoryUsage();
        this.startHeap = initialMemory.heapUsed;
        // Set up GC tracking
        const gcListener = () => this.gcRuns++;
        if (typeof perf_hooks_1.performance.eventLoopUtilization === 'function') {
            process.on('gc', gcListener);
        }
        // Main benchmark loop
        console.log(`  Running: ${this.options.iterations} iterations`);
        const totalStart = perf_hooks_1.performance.now();
        this.startTime = totalStart;
        for (let i = 0; i < this.options.iterations; i++) {
            const start = perf_hooks_1.performance.now();
            await fn();
            const end = perf_hooks_1.performance.now();
            this.results.push(end - start);
            // Periodic memory snapshots (every 10% of iterations)
            if (i % Math.floor(this.options.iterations / 10) === 0) {
                this.memorySnapshots.push(process.memoryUsage());
            }
            // Check timeout
            if (perf_hooks_1.performance.now() - totalStart > this.options.timeout) {
                console.warn(`  Benchmark timed out after ${i + 1} iterations`);
                break;
            }
        }
        const totalEnd = perf_hooks_1.performance.now();
        const totalDuration = totalEnd - totalStart;
        // Clean up GC listener
        if (typeof perf_hooks_1.performance.eventLoopUtilization === 'function') {
            process.off('gc', gcListener);
        }
        // Final memory snapshot
        const finalMemory = process.memoryUsage();
        // Calculate statistics
        return this.calculateResults(totalDuration, finalMemory);
    }
    calculateResults(totalDuration, finalMemory) {
        const sorted = this.results.slice().sort((a, b) => a - b);
        const operations = this.results.length;
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const p50 = this.percentile(sorted, 0.5);
        const p95 = this.percentile(sorted, 0.95);
        const p99 = this.percentile(sorted, 0.99);
        const avgTimePerOp = totalDuration / operations;
        const opsPerSecond = 1000 / avgTimePerOp;
        const memoryUsed = finalMemory.rss - process.memoryUsage().rss;
        const heapUsed = finalMemory.heapUsed - this.startHeap;
        return {
            name: this.options.name,
            operations,
            duration: totalDuration,
            opsPerSecond,
            avgTimePerOp,
            minTime: min,
            maxTime: max,
            p50,
            p95,
            p99,
            memoryUsed,
            heapUsed,
            external: finalMemory.external,
            gcRuns: this.gcRuns
        };
    }
    percentile(sorted, p) {
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
    }
    static formatResult(result) {
        return `
Benchmark: ${result.name}
===========================================
Operations:     ${result.operations.toLocaleString()}
Total Duration: ${result.duration.toFixed(2)}ms
Ops/Second:     ${result.opsPerSecond.toFixed(2)}
Avg Time/Op:    ${result.avgTimePerOp.toFixed(4)}ms

Latency Percentiles:
  Min:          ${result.minTime.toFixed(4)}ms
  P50:          ${result.p50.toFixed(4)}ms
  P95:          ${result.p95.toFixed(4)}ms
  P99:          ${result.p99.toFixed(4)}ms
  Max:          ${result.maxTime.toFixed(4)}ms

Memory Usage:
  Heap Used:    ${(result.heapUsed / 1024 / 1024).toFixed(2)}MB
  External:     ${(result.external / 1024 / 1024).toFixed(2)}MB
  GC Runs:      ${result.gcRuns}
`;
    }
}
exports.Benchmark = Benchmark;
class BenchmarkSuite {
    benchmarks = [];
    results = [];
    add(name, fn, options) {
        const benchmark = new Benchmark({ name, ...options });
        this.benchmarks.push({ benchmark, fn });
    }
    async run() {
        console.log(`Running benchmark suite with ${this.benchmarks.length} benchmarks\n`);
        for (const { benchmark, fn } of this.benchmarks) {
            const result = await benchmark.run(fn);
            this.results.push(result);
            console.log(Benchmark.formatResult(result));
        }
        return this.results;
    }
    saveReport(outputPath) {
        const reportDir = outputPath || (0, path_1.join)(process.cwd(), 'benchmark-reports');
        if (!(0, fs_1.existsSync)(reportDir)) {
            (0, fs_1.mkdirSync)(reportDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
        const reportPath = (0, path_1.join)(reportDir, `benchmark-${timestamp}.json`);
        const report = {
            timestamp: new Date().toISOString(),
            system: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                v8Version: process.versions.v8,
                memory: {
                    total: require('os').totalmem(),
                    free: require('os').freemem()
                },
                cpus: require('os').cpus().length
            },
            results: this.results
        };
        (0, fs_1.writeFileSync)(reportPath, JSON.stringify(report, null, 2));
        console.log(`\nBenchmark report saved to: ${reportPath}`);
    }
    compareWith(previousResults) {
        console.log('\nComparison with Previous Results:');
        console.log('=====================================');
        for (const current of this.results) {
            const previous = previousResults.find(r => r.name === current.name);
            if (!previous)
                continue;
            const opsChange = ((current.opsPerSecond - previous.opsPerSecond) / previous.opsPerSecond) * 100;
            const p95Change = ((current.p95 - previous.p95) / previous.p95) * 100;
            const memChange = ((current.heapUsed - previous.heapUsed) / previous.heapUsed) * 100;
            console.log(`\n${current.name}:`);
            console.log(`  Ops/Second: ${previous.opsPerSecond.toFixed(2)} → ${current.opsPerSecond.toFixed(2)} (${opsChange >= 0 ? '+' : ''}${opsChange.toFixed(2)}%)`);
            console.log(`  P95 Latency: ${previous.p95.toFixed(4)}ms → ${current.p95.toFixed(4)}ms (${p95Change >= 0 ? '+' : ''}${p95Change.toFixed(2)}%)`);
            console.log(`  Memory: ${(previous.heapUsed / 1024 / 1024).toFixed(2)}MB → ${(current.heapUsed / 1024 / 1024).toFixed(2)}MB (${memChange >= 0 ? '+' : ''}${memChange.toFixed(2)}%)`);
        }
    }
}
exports.BenchmarkSuite = BenchmarkSuite;
// Memory profiler utility
class MemoryProfiler {
    snapshots = [];
    startTime;
    interval = null;
    constructor() {
        this.startTime = Date.now();
    }
    start(intervalMs = 100) {
        this.interval = setInterval(() => {
            this.snapshot();
        }, intervalMs);
    }
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
    snapshot(label) {
        this.snapshots.push({
            timestamp: Date.now() - this.startTime,
            memory: process.memoryUsage(),
            label
        });
    }
    getReport() {
        const heapUsedValues = this.snapshots.map(s => s.memory.heapUsed);
        const maxHeap = Math.max(...heapUsedValues);
        const minHeap = Math.min(...heapUsedValues);
        const avgHeap = heapUsedValues.reduce((a, b) => a + b, 0) / heapUsedValues.length;
        return {
            duration: Date.now() - this.startTime,
            snapshots: this.snapshots.length,
            heap: {
                max: maxHeap,
                min: minHeap,
                avg: avgHeap,
                growth: heapUsedValues[heapUsedValues.length - 1] - heapUsedValues[0]
            },
            timeline: this.snapshots.map(s => ({
                time: s.timestamp,
                heap: s.memory.heapUsed,
                external: s.memory.external,
                label: s.label
            }))
        };
    }
    reset() {
        this.snapshots = [];
        this.startTime = Date.now();
    }
}
exports.MemoryProfiler = MemoryProfiler;
//# sourceMappingURL=base.js.map