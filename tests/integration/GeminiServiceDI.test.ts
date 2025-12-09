

import { jest } from '@jest/globals';

// Mock RequestCoalescer to prevent timeouts
jest.mock('../../src/utils/RequestCoalescer', () => ({
    globalCoalescers: {
        geminiGeneration: {
            execute: jest.fn().mockImplementation(async (key, fn: any) => fn())
        }
    }
}));

import { Container } from '../../src/di/Container';
import { TYPES } from '../../src/di/tokens';
import { GeminiService } from '../../src/services/gemini/GeminiService';
import { GeminiAPIClient } from '../../src/services/gemini/GeminiAPIClient';
import { GeminiContextProcessor } from '../../src/services/gemini/GeminiContextProcessor';
import { GeminiResponseHandler } from '../../src/services/gemini/GeminiResponseHandler';
import { GeminiConfigurationHandler } from '../../src/services/gemini/GeminiConfiguration';
import { GeminiStructuredOutputHandler } from '../../src/services/gemini/GeminiStructuredOutput';
import type { IAIService } from '../../src/services/interfaces';

describe('GeminiService DI Integration', () => {
    let container: Container;

    beforeEach(() => {
        container = new Container();

        // 1. Bind Config Mock
        const mockConfig = {
            gemini: {
                apiKey: 'test-key',
                thinkingBudget: 100,
                includeThoughts: true,
                enableCodeExecution: true,
                enableGoogleSearch: false,
                systemInstructions: {
                    roasting: 'roast',
                    helpful: 'help'
                }
            },
            rateLimiting: { rpm: 60, daily: 1000 },
            features: {
                contextMemory: { timeoutMinutes: 30, maxMessages: 100, maxContextChars: 50000 }
            }
        };
        container.bind(TYPES.Config).toConstantValue(mockConfig);

        // 2. Bind Core Dependency Mocks
        container.bind(TYPES.DiscordClient).toConstantValue({} as any);
        container.bind(TYPES.TracingIntegration).toConstantValue({} as any);
        container.bind(TYPES.CacheManager).toConstantValue({ get: jest.fn(), set: jest.fn() } as any);
        container.bind(TYPES.RateLimiter).toConstantValue({ checkLimit: jest.fn(), increment: jest.fn() } as any);
        container.bind(TYPES.HealthMonitor).toConstantValue({ setGeminiService: jest.fn() } as any);
        container.bind(TYPES.RetryHandler).toConstantValue({ executeWithRetry: jest.fn((fn: any) => fn()) } as any);
        container.bind(TYPES.GracefulDegradation).toConstantValue({
            shouldDegrade: jest.fn().mockReturnValue({ shouldDegrade: false }),
            setHealthMonitor: jest.fn()
        } as any);
        container.bind(TYPES.ContextManager).toConstantValue({} as any);
        container.bind(TYPES.PersonalityManager).toConstantValue({} as any);
        container.bind(TYPES.ConversationManager).toConstantValue({} as any);
        container.bind(TYPES.SystemContextBuilder).toConstantValue({} as any);
        container.bind(TYPES.RoastingEngine).toConstantValue({} as any);
        container.bind(TYPES.ResponseProcessingService).toConstantValue({} as any);
        container.bind(TYPES.MultimodalContentHandler).toConstantValue({} as any);

        // 3. Bind Gemini Components (Real Bindings to test wiring)
        container.bind<GeminiConfigurationHandler>(TYPES.GeminiConfigurationHandler).toDynamicValue(c => {
            return new GeminiConfigurationHandler(c.resolve(TYPES.CacheManager));
        });

        container.bind(TYPES.GeminiAPIClient).toDynamicValue(c => {
            // Mock API Key env
            process.env.GOOGLE_API_KEY = 'test-key';
            return new GeminiAPIClient(
                'test-key',
                mockConfig.gemini as any,
                c.resolve(TYPES.GracefulDegradation),
                c.resolve(TYPES.MultimodalContentHandler)
            );
        });

        container.bind(TYPES.GeminiContextProcessor).toDynamicValue(c => {
            return new GeminiContextProcessor(
                c.resolve(TYPES.ContextManager),
                c.resolve(TYPES.PersonalityManager),
                c.resolve(TYPES.ConversationManager),
                c.resolve(TYPES.SystemContextBuilder),
                c.resolve(TYPES.RateLimiter),
                c.resolve(TYPES.GracefulDegradation),
                {
                    systemInstruction: 'test',
                    helpfulInstruction: 'test',
                    unfilteredMode: false,
                    forceThinkingPrompt: false,
                    thinkingTrigger: '',
                    thinkingBudget: 0,
                    includeThoughts: false
                }
            );
        });

        container.bind(TYPES.GeminiResponseHandler).toDynamicValue(c => {
            return new GeminiResponseHandler(
                c.resolve(TYPES.ResponseProcessingService),
                {
                    includeThoughts: false,
                    thinkingBudget: 0,
                    enableCodeExecution: false,
                    enableGoogleSearch: false
                }
            );
        });

        container.bind(TYPES.GeminiStructuredOutputHandler).toDynamicValue(c => {
            return new GeminiStructuredOutputHandler(
                c.resolve(TYPES.GeminiAPIClient),
                c.resolve(TYPES.GeminiContextProcessor),
                c.resolve(TYPES.GeminiResponseHandler),
                c.resolve(TYPES.CacheManager),
                c.resolve(TYPES.RetryHandler),
                c.resolve(TYPES.RateLimiter)
            );
        });

        // 4. Bind Main Service
        container.bind<IAIService>(TYPES.GeminiService).toDynamicValue(c => {
            const deps = {
                rateLimiter: c.resolve(TYPES.RateLimiter),
                contextManager: c.resolve(TYPES.ContextManager),
                personalityManager: c.resolve(TYPES.PersonalityManager),
                cacheManager: c.resolve(TYPES.CacheManager),
                gracefulDegradation: c.resolve(TYPES.GracefulDegradation),
                roastingEngine: c.resolve(TYPES.RoastingEngine),
                conversationManager: c.resolve(TYPES.ConversationManager),
                retryHandler: c.resolve(TYPES.RetryHandler),
                systemContextBuilder: c.resolve(TYPES.SystemContextBuilder),
                responseProcessingService: c.resolve(TYPES.ResponseProcessingService),
                multimodalContentHandler: c.resolve(TYPES.MultimodalContentHandler)
            };

            const components = {
                apiClient: c.resolve(TYPES.GeminiAPIClient),
                contextProcessor: c.resolve(TYPES.GeminiContextProcessor),
                responseHandler: c.resolve(TYPES.GeminiResponseHandler),
                configHandler: c.resolve(TYPES.GeminiConfigurationHandler),
                structuredOutputHandler: c.resolve(TYPES.GeminiStructuredOutputHandler)
            };

            const service = new GeminiService(
                'test-key',
                mockConfig.gemini as any,
                deps as any,
                components as any
            );

            const healthMonitor = c.resolve(TYPES.HealthMonitor); // Mock
            service.setHealthMonitor(healthMonitor as any);

            return service;
        });
    });

    it('should resolve GeminiService with all dependencies', () => {
        const geminiService = container.resolve<GeminiService>(TYPES.GeminiService);
        expect(geminiService).toBeDefined();
        expect(geminiService).toBeInstanceOf(GeminiService);
    });
});
