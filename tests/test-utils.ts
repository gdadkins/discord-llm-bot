import { jest } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Test utilities for mocking and test data management
 */

export class MockTimers {
  private timers: Set<NodeJS.Timeout> = new Set();

  setInterval(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setInterval(callback, delay);
    this.timers.add(timer);
    return timer;
  }

  setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setTimeout(callback, delay);
    this.timers.add(timer);
    return timer;
  }

  clearAll(): void {
    this.timers.forEach(timer => {
      clearInterval(timer);
      clearTimeout(timer);
    });
    this.timers.clear();
  }
}

export class MockFileSystem {
  private files: Map<string, any> = new Map();

  writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content);
    return Promise.resolve();
  }

  writeJSON(filePath: string, content: any): Promise<void> {
    this.files.set(filePath, JSON.stringify(content, null, 2));
    return Promise.resolve();
  }

  readFile(filePath: string): Promise<string> {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`File not found: ${filePath}`);
    }
    return Promise.resolve(content);
  }

  readJSON(filePath: string): Promise<any> {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`File not found: ${filePath}`);
    }
    return Promise.resolve(JSON.parse(content));
  }

  pathExists(filePath: string): Promise<boolean> {
    return Promise.resolve(this.files.has(filePath));
  }

  remove(filePath: string): Promise<void> {
    this.files.delete(filePath);
    return Promise.resolve();
  }

  clear(): void {
    this.files.clear();
  }

  getFiles(): Map<string, any> {
    return new Map(this.files);
  }
}

export class MockEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  getListeners(event: string): Function[] {
    return this.listeners.get(event) || [];
  }
}

export function createMockMetrics() {
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

export function createMockConfiguration() {
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

export function createMockUserPreferences() {
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

export function createMockAnalyticsData() {
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

export async function waitForAsync(ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function spyOnConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const logs: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log = jest.fn((...args) => {
    logs.push(args.join(' '));
  });

  console.error = jest.fn((...args) => {
    errors.push(args.join(' '));
  });

  console.warn = jest.fn((...args) => {
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

export function createTestEnvironment() {
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