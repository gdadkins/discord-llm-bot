"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BenchmarkRunner = exports.runRoastProbabilityBenchmarks = exports.runRateLimiterBenchmarks = exports.runMessageSplitterBenchmarks = exports.runContextManagerBenchmarks = void 0;
// Main benchmark framework exports
__exportStar(require("./base"), exports);
__exportStar(require("./memoryProfiler"), exports);
__exportStar(require("./reportGenerator"), exports);
__exportStar(require("./runner"), exports);
// Individual benchmark suite exports
var contextManager_bench_1 = require("./contextManager.bench");
Object.defineProperty(exports, "runContextManagerBenchmarks", { enumerable: true, get: function () { return contextManager_bench_1.runContextManagerBenchmarks; } });
var messageSplitter_bench_1 = require("./messageSplitter.bench");
Object.defineProperty(exports, "runMessageSplitterBenchmarks", { enumerable: true, get: function () { return messageSplitter_bench_1.runMessageSplitterBenchmarks; } });
var rateLimiter_bench_1 = require("./rateLimiter.bench");
Object.defineProperty(exports, "runRateLimiterBenchmarks", { enumerable: true, get: function () { return rateLimiter_bench_1.runRateLimiterBenchmarks; } });
var roastProbability_bench_1 = require("./roastProbability.bench");
Object.defineProperty(exports, "runRoastProbabilityBenchmarks", { enumerable: true, get: function () { return roastProbability_bench_1.runRoastProbabilityBenchmarks; } });
// Default export for convenience
var runner_1 = require("./runner");
Object.defineProperty(exports, "BenchmarkRunner", { enumerable: true, get: function () { return runner_1.BenchmarkRunner; } });
//# sourceMappingURL=index.js.map