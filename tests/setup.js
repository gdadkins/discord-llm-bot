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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Minimize logging during tests
process.env.DISCORD_TOKEN = 'test-token';
process.env.DISCORD_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_API_KEY = 'test-api-key';
// Mock file system operations by default
globals_1.jest.mock('fs-extra');
// Mock winston logger
globals_1.jest.mock('../src/utils/logger', () => ({
    logger: {
        info: globals_1.jest.fn(),
        warn: globals_1.jest.fn(),
        error: globals_1.jest.fn(),
        debug: globals_1.jest.fn(),
    },
}));
// Mock Discord.js
globals_1.jest.mock('discord.js', () => ({
    Client: globals_1.jest.fn().mockImplementation(() => ({
        on: globals_1.jest.fn(),
        once: globals_1.jest.fn(),
        login: globals_1.jest.fn().mockResolvedValue('test'),
        user: { id: 'test-bot-id' },
        destroy: globals_1.jest.fn().mockResolvedValue(undefined),
    })),
    GatewayIntentBits: {
        Guilds: 1,
        GuildMessages: 2,
        MessageContent: 4,
        GuildMessageReactions: 8,
    },
    REST: globals_1.jest.fn().mockImplementation(() => ({
        setToken: globals_1.jest.fn().mockReturnThis(),
        put: globals_1.jest.fn().mockResolvedValue(undefined),
    })),
    Routes: {
        applicationCommands: globals_1.jest.fn().mockReturnValue('test-route'),
    },
    SlashCommandBuilder: globals_1.jest.fn().mockImplementation(() => ({
        setName: globals_1.jest.fn().mockReturnThis(),
        setDescription: globals_1.jest.fn().mockReturnThis(),
        addStringOption: globals_1.jest.fn().mockReturnThis(),
        addUserOption: globals_1.jest.fn().mockReturnThis(),
        addBooleanOption: globals_1.jest.fn().mockReturnThis(),
        addIntegerOption: globals_1.jest.fn().mockReturnThis(),
        addSubcommand: globals_1.jest.fn().mockReturnThis(),
        toJSON: globals_1.jest.fn().mockReturnValue({}),
    })),
}));
// Mock Google AI
globals_1.jest.mock('@google/genai', () => ({
    GoogleGenAI: globals_1.jest.fn().mockImplementation(() => ({
        generateContent: globals_1.jest.fn().mockResolvedValue({
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
        }),
    })),
}));
// Mock chokidar file watcher
globals_1.jest.mock('chokidar', () => ({
    watch: globals_1.jest.fn().mockReturnValue({
        on: globals_1.jest.fn(),
        close: globals_1.jest.fn().mockResolvedValue(undefined),
    }),
}));
// Mock better-sqlite3
globals_1.jest.mock('better-sqlite3', () => {
    return globals_1.jest.fn().mockImplementation(() => ({
        prepare: globals_1.jest.fn().mockReturnValue({
            run: globals_1.jest.fn(),
            get: globals_1.jest.fn(),
            all: globals_1.jest.fn().mockReturnValue([]),
        }),
        exec: globals_1.jest.fn(),
        close: globals_1.jest.fn(),
    }));
});
// Mock crypto-js
globals_1.jest.mock('crypto-js', () => ({
    createHash: globals_1.jest.fn().mockReturnValue({
        update: globals_1.jest.fn().mockReturnThis(),
        digest: globals_1.jest.fn().mockReturnValue('mock-hash'),
    }),
}));
// Global test utilities
global.createMockFile = async (filePath, content) => {
    const dir = path.dirname(filePath);
    await fs.ensureDir(dir);
    if (typeof content === 'object') {
        await fs.writeJSON(filePath, content);
    }
    else {
        await fs.writeFile(filePath, content);
    }
};
global.cleanupTestFiles = async (testDir) => {
    try {
        await fs.remove(testDir);
    }
    catch (error) {
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
    globals_1.jest.clearAllMocks();
});
// Global teardown
afterAll(async () => {
    await global.cleanupTestFiles(global.TEST_DATA_DIR);
});
//# sourceMappingURL=setup.js.map