import { logger } from '../../utils/logger';
import {
    ICacheManager,
    IRateLimiter,
    IRetryHandler,
    StructuredOutputOptions,
    GeminiGenerationOptions,
    GeminiConfig
} from '../interfaces';
import { MessageContext } from '../../commands';
import { GeminiAPIClient } from './GeminiAPIClient';
import { GeminiContextProcessor } from './GeminiContextProcessor';
import { GeminiResponseHandler } from './GeminiResponseHandler';

export class GeminiStructuredOutputHandler {
    constructor(
        private apiClient: GeminiAPIClient,
        private contextProcessor: GeminiContextProcessor,
        private responseHandler: GeminiResponseHandler,
        private cacheManager: ICacheManager,
        private retryHandler: IRetryHandler,
        private rateLimiter: IRateLimiter
    ) { }

    /**
     * Parses and validates structured JSON responses
     */
    async parseStructuredResponse(
        response: string,
        options: StructuredOutputOptions
    ): Promise<unknown> {
        return await this.responseHandler.parseStructuredResponse(response, options);
    }

    /**
     * Generates a structured response using JSON mode
     */
    async generateStructuredResponse<T = unknown>(
        prompt: string,
        structuredOutput: StructuredOutputOptions,
        userId: string,
        serverId?: string,
        messageContext?: MessageContext,
        degradationCheck?: (userId: string, prompt: string, respond?: any, serverId?: string) => Promise<string | null>,
        cacheLookup?: (prompt: string, userId: string, serverId?: string) => Promise<{ response: string | null; bypassCache: boolean }>
    ): Promise<T> {
        // Build generation options with structured output
        const generationOptions: GeminiGenerationOptions = {
            structuredOutput,
            includeReasoning: true
        };

        // Check for degraded state if check function provided
        if (degradationCheck) {
            const degradationResponse = await degradationCheck(userId, prompt, undefined, serverId);
            if (degradationResponse !== null) {
                // For degraded state, return a simple error structure
                return {
                    error: 'Service temporarily unavailable',
                    message: degradationResponse
                } as unknown as T;
            }
        }

        // Check cache (structured responses can be cached too)
        let bypassCache = false;
        if (cacheLookup) {
            const cacheResult = await cacheLookup(prompt, userId, serverId);
            bypassCache = cacheResult.bypassCache;
            if (cacheResult.response) {
                try {
                    return JSON.parse(cacheResult.response) as T;
                } catch {
                    logger.warn('Failed to parse cached structured response, regenerating');
                }
            }
        } else {
            // Fallback manual cache check if no lookup provided
            bypassCache = this.cacheManager.shouldBypassCache(prompt);
            if (!bypassCache) {
                const cachedResponse = await this.cacheManager.get(prompt, userId, serverId);
                if (cachedResponse) {
                    try {
                        return JSON.parse(cachedResponse) as T;
                    } catch {
                        // ignore
                    }
                }
            }
        }

        // Validate input and rate limits
        await this.validateInputAndRateLimits(prompt);

        try {
            // Perform generation with structured output
            const result = await this.retryHandler.executeWithRetry(
                async () => this.performStructuredGeneration(prompt, generationOptions, userId, serverId, messageContext),
                { maxRetries: 3, retryDelay: 1000, retryMultiplier: 2.0 }
            );

            // Cache the stringified result
            if (!bypassCache) {
                await this.cacheManager.set(prompt, userId, JSON.stringify(result), serverId);
            }

            return result as T;
        } catch (error) {
            logger.error('Structured generation failed', { error });
            throw new Error(`Failed to generate structured response: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Performs structured AI generation with JSON mode
     */
    private async performStructuredGeneration(
        prompt: string,
        options: GeminiGenerationOptions,
        userId: string,
        serverId?: string,
        messageContext?: MessageContext
    ): Promise<unknown> {
        // Determine if roasting should apply (usually not for structured outputs)
        const shouldRoastNow = false; // Structured outputs should be neutral

        // Build context sources
        const contextSources = this.contextProcessor.assembleContext(
            userId, serverId, messageContext
        );

        // Build prompt with instruction for structured output
        const structuredPrompt = `You are a helpful assistant that provides structured JSON responses according to the specified schema. Analyze the user's request and provide a response that exactly matches the required JSON structure.
    
    User Request: ${prompt}
    
    Required JSON Schema:
    ${JSON.stringify(options.structuredOutput?.schema, null, 2)}
    
    Response format: Return ONLY the valid JSON object. Do not include markdown formatting like \`\`\`json.`;

        const fullPrompt = await this.contextProcessor.buildSystemContext(shouldRoastNow, contextSources, structuredPrompt);

        const budget = this.contextProcessor.calculateThinkingBudget(prompt, 'low');

        // Execute API call through API client
        // Note: imageAttachments are not typically used in structured output yet in this codebase context, passing undefined
        const response = await this.apiClient.executeAPICall(
            fullPrompt, undefined, budget
        );

        // Process response through response handler
        const extractedText = await this.responseHandler.extractResponseText(
            response, false, undefined, budget
        );

        // Parse the JSON result
        try {
            const jsonStart = extractedText.indexOf('{');
            const jsonEnd = extractedText.lastIndexOf('}') + 1;
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                const jsonStr = extractedText.substring(jsonStart, jsonEnd);
                return JSON.parse(jsonStr);
            }
            return JSON.parse(extractedText);
        } catch (e) {
            throw new Error('Failed to parse JSON from response: ' + extractedText);
        }
    }

    private async validateInputAndRateLimits(prompt: string): Promise<void> {
        const rateLimitCheck = await this.rateLimiter.checkAndIncrement();

        if (!rateLimitCheck.allowed) {
            logger.warn(`Rate limit hit: ${rateLimitCheck.reason}`);
            throw new Error('Rate limit exceeded. Please wait a few moments before sending another message.');
        }

        if (!prompt || prompt.trim().length === 0) {
            throw new Error('Please provide a valid message.');
        }
    }
}
