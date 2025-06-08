import { jest } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Minimize logging during tests
process.env.DISCORD_TOKEN = 'test-token';
process.env.DISCORD_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_API_KEY = 'test-api-key';

// Mock file system operations by default
jest.mock('fs-extra');

// Mock winston logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Discord.js
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    once: jest.fn(),
    login: jest.fn().mockImplementation(() => Promise.resolve('test')),
    user: { id: 'test-bot-id' },
    destroy: jest.fn().mockImplementation(() => Promise.resolve()),
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    GuildMessageReactions: 8,
  },
  REST: jest.fn().mockImplementation(() => ({
    setToken: jest.fn().mockReturnThis(),
    put: jest.fn().mockImplementation(() => Promise.resolve([])),
  })),
  Routes: {
    applicationCommands: jest.fn().mockReturnValue('test-route'),
  },
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis(),
    addUserOption: jest.fn().mockReturnThis(),
    addBooleanOption: jest.fn().mockReturnThis(),
    addIntegerOption: jest.fn().mockReturnThis(),
    addSubcommand: jest.fn().mockReturnThis(),
    toJSON: jest.fn().mockReturnValue({}),
  })),
  PermissionsBitField: jest.fn().mockImplementation(() => ({
    has: jest.fn().mockReturnValue(true),
    toArray: jest.fn().mockReturnValue(['Administrator', 'ManageMessages']),
    serialize: jest.fn().mockReturnValue({ Administrator: true, ManageMessages: true }),
  })),
  Collection: jest.fn().mockImplementation(() => {
    class MockCollection extends Map {
      filter(fn: any) {
        const filtered = new MockCollection();
        for (const [key, value] of this) {
          if (fn(value, key, this)) {
            filtered.set(key, value);
          }
        }
        return filtered;
      }
      
      map(fn: any) {
        const result = [];
        for (const [key, value] of this) {
          result.push(fn(value, key, this));
        }
        return result;
      }
      
      find(fn: any) {
        for (const [key, value] of this) {
          if (fn(value, key, this)) {
            return value;
          }
        }
        return undefined;
      }
      
      toArray() {
        return Array.from(this.values());
      }
    }
    
    return new MockCollection();
  }),
}));

// Mock Google AI
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockImplementation(() => Promise.resolve({
      response: {
        text: () => 'Mock AI response',
        candidates: [{
          content: { parts: [{ text: 'Mock AI response' }] },
          finishReason: 'STOP',
          safetyRatings: [],
        }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      },
      })),
    }),
  })),
}));

// Mock chokidar file watcher
jest.mock('chokidar', () => ({
  watch: jest.fn().mockReturnValue({
    on: jest.fn(),
    close: jest.fn().mockImplementation(() => Promise.resolve()),
  }),
}));

// Mock better-sqlite3
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => ({
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn().mockReturnValue([]),
    }),
    exec: jest.fn(),
    close: jest.fn(),
  }));
});

// Mock crypto-js
jest.mock('crypto-js', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mock-hash'),
  }),
}));

// Global test utilities
global.createMockFile = async (filePath: string, content: any) => {
  const dir = path.dirname(filePath);
  await fs.ensureDir(dir);
  if (typeof content === 'object') {
    await fs.writeJSON(filePath, content);
  } else {
    await fs.writeFile(filePath, content);
  }
};

global.cleanupTestFiles = async (testDir: string) => {
  try {
    await fs.remove(testDir);
  } catch (error) {
    // Ignore cleanup errors
  }
};

// Test data directories
global.TEST_DATA_DIR = path.join(__dirname, 'test-data');
global.TEST_CONFIG_DIR = path.join(global.TEST_DATA_DIR, 'config');
global.TEST_HEALTH_DIR = path.join(global.TEST_DATA_DIR, 'health');
global.TEST_ANALYTICS_DIR = path.join(global.TEST_DATA_DIR, 'analytics');

// Clean up test directories before each test suite
beforeAll(async () => {
  await fs.ensureDir(global.TEST_DATA_DIR);
  await fs.ensureDir(global.TEST_CONFIG_DIR);
  await fs.ensureDir(global.TEST_HEALTH_DIR);
  await fs.ensureDir(global.TEST_ANALYTICS_DIR);
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

// Global teardown
afterAll(async () => {
  // Clean up test files
  await global.cleanupTestFiles(global.TEST_DATA_DIR);
  
  // Clear all timers
  jest.clearAllTimers();
  jest.useRealTimers();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});