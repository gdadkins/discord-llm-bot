/**
 * Test utilities for mocking and test data management
 */
export declare class MockTimers {
    private timers;
    setInterval(callback: () => void, delay: number): NodeJS.Timeout;
    setTimeout(callback: () => void, delay: number): NodeJS.Timeout;
    clearAll(): void;
}
export declare class MockFileSystem {
    private files;
    writeFile(filePath: string, content: string): Promise<void>;
    writeJSON(filePath: string, content: any): Promise<void>;
    readFile(filePath: string): Promise<string>;
    readJSON(filePath: string): Promise<any>;
    pathExists(filePath: string): Promise<boolean>;
    remove(filePath: string): Promise<void>;
    clear(): void;
    getFiles(): Map<string, any>;
}
export declare class MockEventEmitter {
    private listeners;
    on(event: string, listener: Function): this;
    emit(event: string, ...args: any[]): boolean;
    removeAllListeners(event?: string): this;
    getListeners(event: string): Function[];
}
export declare function createMockMetrics(): {
    memoryUsage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
        arrayBuffers: number;
    };
    activeConversations: number;
    rateLimitStatus: {
        minuteRemaining: number;
        dailyRemaining: number;
        requestsThisMinute: number;
        requestsToday: number;
    };
    uptime: number;
    errorRate: number;
    responseTime: {
        p50: number;
        p95: number;
        p99: number;
    };
    apiHealth: {
        gemini: boolean;
        discord: boolean;
    };
    cacheMetrics: {
        hitRate: number;
        memoryUsage: number;
        size: number;
    };
    contextMetrics: {
        totalServers: number;
        totalMemoryUsage: number;
        averageServerSize: number;
        largestServerSize: number;
        itemCounts: {
            embarrassingMoments: number;
            codeSnippets: number;
            runningGags: number;
            summarizedFacts: number;
        };
        compressionStats: {
            averageCompressionRatio: number;
            totalMemorySaved: number;
            duplicatesRemoved: number;
        };
    };
};
export declare function createMockConfiguration(): {
    version: string;
    lastModified: string;
    modifiedBy: string;
    discord: {
        intents: string[];
        permissions: {};
        commands: {
            chat: {
                enabled: boolean;
                permissions: string;
                cooldown: number;
            };
            status: {
                enabled: boolean;
                permissions: string;
                cooldown: number;
            };
        };
    };
    gemini: {
        model: string;
        temperature: number;
        topK: number;
        topP: number;
        maxTokens: number;
        safetySettings: {
            harassment: string;
            hateSpeech: string;
            sexuallyExplicit: string;
            dangerousContent: string;
        };
        systemInstructions: {
            roasting: string;
            helpful: string;
        };
        grounding: {
            threshold: number;
            enabled: boolean;
        };
        thinking: {
            budget: number;
            includeInResponse: boolean;
        };
    };
    rateLimiting: {
        rpm: number;
        daily: number;
        burstSize: number;
        safetyMargin: number;
        retryOptions: {
            maxRetries: number;
            retryDelay: number;
            retryMultiplier: number;
        };
    };
    features: {
        roasting: {
            baseChance: number;
            consecutiveBonus: number;
            maxChance: number;
            cooldownEnabled: boolean;
            moodSystem: {
                enabled: boolean;
                moodDuration: number;
                chaosEvents: {
                    enabled: boolean;
                    triggerChance: number;
                    durationRange: number[];
                    multiplierRange: number[];
                };
            };
            psychologicalWarfare: {
                roastDebt: boolean;
                mercyKills: boolean;
                cooldownBreaking: boolean;
            };
        };
        codeExecution: boolean;
        structuredOutput: boolean;
        monitoring: {
            healthMetrics: {
                enabled: boolean;
                collectionInterval: number;
                retentionDays: number;
            };
            alerts: {
                enabled: boolean;
                memoryThreshold: number;
                errorRateThreshold: number;
                responseTimeThreshold: number;
            };
            gracefulDegradation: {
                enabled: boolean;
                circuitBreaker: {
                    failureThreshold: number;
                    timeout: number;
                    resetTimeout: number;
                };
                queueing: {
                    maxSize: number;
                    maxAge: number;
                };
            };
        };
        contextMemory: {
            enabled: boolean;
            maxMessages: number;
            timeoutMinutes: number;
            maxContextChars: number;
            compressionEnabled: boolean;
            crossServerEnabled: boolean;
        };
        caching: {
            enabled: boolean;
            maxSize: number;
            ttlMinutes: number;
            compressionEnabled: boolean;
        };
    };
};
export declare function createMockUserPreferences(): {
    userId: string;
    serverId: string;
    preferences: {
        defaultPersonality: string;
        preferredResponseStyle: string;
        enableCodeExecution: boolean;
        enableStructuredOutput: boolean;
        timezone: string;
        commandHistory: boolean;
        autocompleteEnabled: boolean;
        preferredLanguage: string;
        maxHistorySize: number;
        enableNotifications: boolean;
    };
    commandAliases: {
        s: string;
        h: string;
        c: string;
    };
    commandHistory: {
        id: string;
        command: string;
        timestamp: number;
        serverId: string;
    }[];
    scheduledCommands: never[];
    bulkOperations: never[];
};
export declare function createMockAnalyticsData(): {
    commands: {
        chat: {
            count: number;
            avgResponseTime: number;
            errorCount: number;
        };
        status: {
            count: number;
            avgResponseTime: number;
            errorCount: number;
        };
        health: {
            count: number;
            avgResponseTime: number;
            errorCount: number;
        };
    };
    errors: {
        timestamp: number;
        type: string;
        category: string;
        message: string;
        userId: string;
        serverId: string;
    }[];
    performance: {
        responseTime: {
            p50: number;
            p95: number;
            p99: number;
            samples: number;
        };
        throughput: {
            requestsPerSecond: number;
            peakRps: number;
        };
        systemMetrics: {
            memoryUsage: number;
            cpuUsage: number;
        };
    };
    users: {
        totalUsers: number;
        activeUsers24h: number;
        newUsers24h: number;
    };
    servers: {
        totalServers: number;
        activeServers24h: number;
    };
};
export declare function waitForAsync(ms?: number): Promise<void>;
export declare function spyOnConsole(): {
    logs: string[];
    errors: string[];
    warnings: string[];
    restore: () => void;
};
export declare function createTestEnvironment(): {
    mockFs: MockFileSystem;
    mockTimers: MockTimers;
    mockEventEmitter: MockEventEmitter;
    cleanup: () => void;
};
//# sourceMappingURL=test-utils.d.ts.map