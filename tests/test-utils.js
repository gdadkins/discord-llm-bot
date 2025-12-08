"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockEventEmitter = exports.MockFileSystem = exports.MockTimers = void 0;
exports.createMockMetrics = createMockMetrics;
exports.createMockConfiguration = createMockConfiguration;
exports.createMockUserPreferences = createMockUserPreferences;
exports.createMockAnalyticsData = createMockAnalyticsData;
exports.waitForAsync = waitForAsync;
exports.spyOnConsole = spyOnConsole;
exports.createTestEnvironment = createTestEnvironment;
const globals_1 = require("@jest/globals");
/**
 * Test utilities for mocking and test data management
 */
class MockTimers {
    timers = new Set();
    setInterval(callback, delay) {
        const timer = setInterval(callback, delay);
        this.timers.add(timer);
        return timer;
    }
    setTimeout(callback, delay) {
        const timer = setTimeout(callback, delay);
        this.timers.add(timer);
        return timer;
    }
    clearAll() {
        this.timers.forEach(timer => {
            clearInterval(timer);
            clearTimeout(timer);
        });
        this.timers.clear();
    }
}
exports.MockTimers = MockTimers;
class MockFileSystem {
    files = new Map();
    writeFile(filePath, content) {
        this.files.set(filePath, content);
        return Promise.resolve();
    }
    writeJSON(filePath, content) {
        this.files.set(filePath, JSON.stringify(content, null, 2));
        return Promise.resolve();
    }
    readFile(filePath) {
        const content = this.files.get(filePath);
        if (content === undefined) {
            throw new Error(`File not found: ${filePath}`);
        }
        return Promise.resolve(content);
    }
    readJSON(filePath) {
        const content = this.files.get(filePath);
        if (content === undefined) {
            throw new Error(`File not found: ${filePath}`);
        }
        return Promise.resolve(JSON.parse(content));
    }
    pathExists(filePath) {
        return Promise.resolve(this.files.has(filePath));
    }
    remove(filePath) {
        this.files.delete(filePath);
        return Promise.resolve();
    }
    clear() {
        this.files.clear();
    }
    getFiles() {
        return new Map(this.files);
    }
}
exports.MockFileSystem = MockFileSystem;
class MockEventEmitter {
    listeners = new Map();
    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(listener);
        return this;
    }
    emit(event, ...args) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(listener => listener(...args));
            return true;
        }
        return false;
    }
    removeAllListeners(event) {
        if (event) {
            this.listeners.delete(event);
        }
        else {
            this.listeners.clear();
        }
        return this;
    }
    getListeners(event) {
        return this.listeners.get(event) || [];
    }
}
exports.MockEventEmitter = MockEventEmitter;
function createMockMetrics() {
    return {
        memoryUsage: {
            rss: 100 * 1024 * 1024, // 100MB
            heapTotal: 80 * 1024 * 1024,
            heapUsed: 60 * 1024 * 1024,
            external: 10 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024,
        },
        activeConversations: 5,
        rateLimitStatus: {
            minuteRemaining: 8,
            dailyRemaining: 450,
            requestsThisMinute: 2,
            requestsToday: 50,
        },
        uptime: 3600000, // 1 hour
        errorRate: 2.5,
        responseTime: { p50: 150, p95: 800, p99: 1200 },
        apiHealth: { gemini: true, discord: true },
        cacheMetrics: {
            hitRate: 0.85,
            memoryUsage: 20 * 1024 * 1024,
            size: 100,
        },
        contextMetrics: {
            totalServers: 10,
            totalMemoryUsage: 50 * 1024 * 1024,
            averageServerSize: 5 * 1024 * 1024,
            largestServerSize: 15 * 1024 * 1024,
            itemCounts: {
                embarrassingMoments: 25,
                codeSnippets: 10,
                runningGags: 8,
                summarizedFacts: 15,
            },
            compressionStats: {
                averageCompressionRatio: 0.7,
                totalMemorySaved: 20 * 1024 * 1024,
                duplicatesRemoved: 5,
            },
        },
    };
}
function createMockConfiguration() {
    return {
        version: '1.0.0',
        lastModified: '2024-01-01T00:00:00.000Z',
        modifiedBy: 'test',
        discord: {
            intents: ['Guilds', 'GuildMessages', 'MessageContent'],
            permissions: {},
            commands: {
                chat: { enabled: true, permissions: 'all', cooldown: 2000 },
                status: { enabled: true, permissions: 'all', cooldown: 5000 },
            },
        },
        gemini: {
            model: 'gemini-2.5-flash-preview-05-20',
            temperature: 0.9,
            topK: 40,
            topP: 0.8,
            maxTokens: 8192,
            safetySettings: {
                harassment: 'block_none',
                hateSpeech: 'block_none',
                sexuallyExplicit: 'block_none',
                dangerousContent: 'block_none',
            },
            systemInstructions: {
                roasting: 'Test roasting instruction',
                helpful: 'Test helpful instruction',
            },
            grounding: {
                threshold: 0.3,
                enabled: true,
            },
            thinking: {
                budget: 1024,
                includeInResponse: false,
            },
        },
        rateLimiting: {
            rpm: 10,
            daily: 500,
            burstSize: 5,
            safetyMargin: 0.9,
            retryOptions: {
                maxRetries: 3,
                retryDelay: 1000,
                retryMultiplier: 2,
            },
        },
        features: {
            roasting: {
                baseChance: 0.5,
                consecutiveBonus: 0.25,
                maxChance: 0.9,
                cooldownEnabled: true,
                moodSystem: {
                    enabled: true,
                    moodDuration: 3600000,
                    chaosEvents: {
                        enabled: true,
                        triggerChance: 0.05,
                        durationRange: [300000, 1800000],
                        multiplierRange: [0.5, 2.5],
                    },
                },
                psychologicalWarfare: {
                    roastDebt: true,
                    mercyKills: true,
                    cooldownBreaking: true,
                },
            },
            codeExecution: false,
            structuredOutput: false,
            monitoring: {
                healthMetrics: {
                    enabled: true,
                    collectionInterval: 30000,
                    retentionDays: 7,
                },
                alerts: {
                    enabled: true,
                    memoryThreshold: 512,
                    errorRateThreshold: 5,
                    responseTimeThreshold: 5000,
                },
                gracefulDegradation: {
                    enabled: true,
                    circuitBreaker: {
                        failureThreshold: 5,
                        timeout: 30000,
                        resetTimeout: 60000,
                    },
                    queueing: {
                        maxSize: 100,
                        maxAge: 300000,
                    },
                },
            },
            contextMemory: {
                enabled: true,
                maxMessages: 100,
                timeoutMinutes: 30,
                maxContextChars: 50000,
                compressionEnabled: true,
                crossServerEnabled: false,
            },
            caching: {
                enabled: true,
                maxSize: 100,
                ttlMinutes: 5,
                compressionEnabled: true,
            },
        },
    };
}
function createMockUserPreferences() {
    return {
        userId: 'test-user-123',
        serverId: 'test-server-456',
        preferences: {
            defaultPersonality: 'helpful',
            preferredResponseStyle: 'detailed',
            enableCodeExecution: false,
            enableStructuredOutput: false,
            timezone: 'UTC',
            commandHistory: true,
            autocompleteEnabled: true,
            preferredLanguage: 'en',
            maxHistorySize: 50,
            enableNotifications: true,
        },
        commandAliases: {
            's': 'status',
            'h': 'health',
            'c': 'chat',
        },
        commandHistory: [
            {
                id: 'cmd-1',
                command: 'status',
                timestamp: Date.now() - 1000,
                serverId: 'test-server-456',
            },
            {
                id: 'cmd-2',
                command: 'chat hello',
                timestamp: Date.now() - 2000,
                serverId: 'test-server-456',
            },
        ],
        scheduledCommands: [],
        bulkOperations: [],
    };
}
function createMockAnalyticsData() {
    return {
        commands: {
            'chat': { count: 150, avgResponseTime: 1200, errorCount: 2 },
            'status': { count: 80, avgResponseTime: 200, errorCount: 0 },
            'health': { count: 25, avgResponseTime: 500, errorCount: 1 },
        },
        errors: [
            {
                timestamp: Date.now() - 3600000,
                type: 'api',
                category: 'network',
                message: 'Connection timeout',
                userId: 'user-1',
                serverId: 'server-1',
            },
            {
                timestamp: Date.now() - 1800000,
                type: 'validation',
                category: 'validation',
                message: 'Invalid parameter',
                userId: 'user-2',
                serverId: 'server-1',
            },
        ],
        performance: {
            responseTime: {
                p50: 150,
                p95: 800,
                p99: 1200,
                samples: 1000,
            },
            throughput: {
                requestsPerSecond: 5.2,
                peakRps: 12.1,
            },
            systemMetrics: {
                memoryUsage: 60,
                cpuUsage: 25,
            },
        },
        users: {
            totalUsers: 150,
            activeUsers24h: 45,
            newUsers24h: 3,
        },
        servers: {
            totalServers: 25,
            activeServers24h: 18,
        },
    };
}
async function waitForAsync(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function spyOnConsole() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const logs = [];
    const errors = [];
    const warnings = [];
    console.log = globals_1.jest.fn((...args) => {
        logs.push(args.join(' '));
    });
    console.error = globals_1.jest.fn((...args) => {
        errors.push(args.join(' '));
    });
    console.warn = globals_1.jest.fn((...args) => {
        warnings.push(args.join(' '));
    });
    return {
        logs,
        errors,
        warnings,
        restore: () => {
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;
        },
    };
}
function createTestEnvironment() {
    const mockFs = new MockFileSystem();
    const mockTimers = new MockTimers();
    const mockEventEmitter = new MockEventEmitter();
    return {
        mockFs,
        mockTimers,
        mockEventEmitter,
        cleanup: () => {
            mockFs.clear();
            mockTimers.clearAll();
            mockEventEmitter.removeAllListeners();
        },
    };
}
//# sourceMappingURL=test-utils.js.map