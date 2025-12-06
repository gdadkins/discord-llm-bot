
import { 
  GoogleGenerativeAI, 
  Content,
  GenerationConfig,
  SafetySetting,
  Tool,
  GenerateContentRequest,
  HarmCategory,
  HarmBlockThreshold
} from '@google/generative-ai';
import { logger } from '../../utils/logger';
import { getGeminiConfig, GEMINI_MODELS } from '../../services/gemini/GeminiConfig';

import { AdaptiveTimeout, wrapExternalAPIOperation } from '../../utils/timeoutUtils';
import { GeminiConfig } from '../../types';
import { ErrorCategory, enrichError } from '../../utils/ErrorHandlingUtils';
import type { 
  IGeminiAPIClient,
  ImageAttachment
} from './interfaces';
import type {
  GeminiGenerationOptions,
  StructuredOutputOptions,
  IGracefulDegradationService,
  IMultimodalContentHandler
} from '../interfaces';

export class GeminiAPIClient implements IGeminiAPIClient {
  private ai: GoogleGenerativeAI;
  private readonly apiTimeout = new AdaptiveTimeout(30000, {
    minTimeout: 10000,
    maxTimeout: 60000,
    percentile: 0.95
  });
  private readonly config: {
    systemInstruction: string;
    groundingThreshold: number;
    thinkingBudget: number;
    includeThoughts: boolean;
    enableCodeExecution: boolean;
    enableStructuredOutput: boolean;
    forceThinkingPrompt: boolean;
    thinkingTrigger: string;
    enableGoogleSearch: boolean;
    unfilteredMode: boolean;
  };

  constructor(
    apiKey: string,
    private gracefulDegradation: IGracefulDegradationService,
    private multimodalContentHandler: IMultimodalContentHandler
  ) {
    this.ai = new GoogleGenerativeAI(apiKey);
    
    // Load configuration from environment
    this.config = this.loadConfigFromEnv();

    this.logConfiguration();
  }

  private loadConfigFromEnv() {
    return {
      systemInstruction: process.env.GEMINI_SYSTEM_INSTRUCTION || 'You are a helpful AI assistant.',
      groundingThreshold: parseFloat(process.env.GROUNDING_THRESHOLD || '0.3'),
      thinkingBudget: parseInt(process.env.THINKING_BUDGET || '1024'),
      includeThoughts: process.env.INCLUDE_THOUGHTS === 'true',
      enableCodeExecution: process.env.ENABLE_CODE_EXECUTION === 'true',
      enableStructuredOutput: process.env.ENABLE_STRUCTURED_OUTPUT === 'true',
      forceThinkingPrompt: process.env.FORCE_THINKING_PROMPT === 'true',
      thinkingTrigger: process.env.THINKING_TRIGGER || 'THINK',
      enableGoogleSearch: process.env.ENABLE_GOOGLE_SEARCH === 'true',
      unfilteredMode: process.env.UNFILTERED_MODE === 'true'
    };
  }

  private logConfiguration(): void {
    logger.info('GeminiAPIClient initialized with Gemini API integration');
    logger.info(
      `Google Search grounding configured with threshold: ${this.config.groundingThreshold} (awaiting @google/genai package support)`
    );
    logger.info(
      `Thinking mode configured with budget: ${this.config.thinkingBudget} tokens, include thoughts: ${this.config.includeThoughts} (enabled by default in Gemini 2.5)`
    );
    if (this.config.forceThinkingPrompt) {
      logger.info(`Force thinking prompt enabled with trigger: "${this.config.thinkingTrigger}"`);
    }
    logger.info(
      `Additional features: Code execution: ${this.config.enableCodeExecution}, Structured output: ${this.config.enableStructuredOutput}, Google Search: ${this.config.enableGoogleSearch}`
    );
    if (this.config.enableCodeExecution) {
      logger.info('Code execution enabled - Python code blocks in responses will be executed automatically');
    }
    if (this.config.enableGoogleSearch) {
      logger.info(`Google Search grounding enabled with threshold: ${this.config.groundingThreshold}`);
    }
    if (this.config.unfilteredMode) {
      logger.warn('⚠️  UNFILTERED MODE ENABLED - Bot will provide unrestricted responses to all requests');
    }
  }

  getAI(): GoogleGenerativeAI {
    return this.ai;
  }

  getConfig() {
    return { ...this.config };
  }

  buildGenerationConfig(
    profile: string,
    optionsOrBudget?: GeminiGenerationOptions | number
  ): Record<string, unknown> {
    const geminiConfig = getGeminiConfig(profile);
    
    // Handle overloaded parameter
    let options: GeminiGenerationOptions | undefined;
    
    if (typeof optionsOrBudget === 'number') {
      // dynamicThinkingBudget is not used in the new API
    } else {
      options = optionsOrBudget;
    }
    
    const config: GenerationConfig = {
      temperature: options?.temperature ?? geminiConfig.temperature,
      topK: options?.topK ?? geminiConfig.topK,
      topP: options?.topP ?? geminiConfig.topP,
      maxOutputTokens: options?.maxOutputTokens ?? geminiConfig.maxOutputTokens
    };
        
    if (options?.stopSequences) {
      config.stopSequences = options.stopSequences;
    }
    
    // Enable structured output
    if (this.config.enableStructuredOutput && options?.structuredOutput) {
      this.configureStructuredOutput(config, options.structuredOutput, options.includeReasoning);
    }
    
    return config as unknown as Record<string, unknown>;
  }

  private configureStructuredOutput(
    config: GenerationConfig,
    structuredOutput: StructuredOutputOptions,
    includeReasoning?: boolean
  ): void {
    logger.info('Enabling structured output with JSON mode', {
      schemaName: structuredOutput.schemaName || 'custom',
      validateResponse: structuredOutput.validateResponse ?? true
    });
    
    config.responseMimeType = 'application/json';
    
    if (includeReasoning && structuredOutput.schema) {
      const schemaWithReasoning = JSON.parse(JSON.stringify(structuredOutput.schema));
      
      if (schemaWithReasoning.type === 'object' && schemaWithReasoning.properties) {
        schemaWithReasoning.properties.reasoning = {
          type: 'string',
          description: 'Step-by-step reasoning that led to this response'
        };
        
        if (schemaWithReasoning.required && !schemaWithReasoning.required.includes('reasoning')) {
          schemaWithReasoning.required.push('reasoning');
        }
      }
      
    }
  }

  async executeAPICall(
    fullPrompt: string,
    imageAttachments?: ImageAttachment[],
    dynamicThinkingBudget?: number
  ): Promise<unknown> {
    const profile = imageAttachments && imageAttachments.length > 0 ? 
      process.env.GEMINI_VISION_PROFILE || 'HIGH_ACCURACY_VISION' : 
      'LEGACY';
    
    const geminiConfig = getGeminiConfig(profile) as GeminiConfig;
    
    return await this.gracefulDegradation.executeWithCircuitBreaker(
      async () => {
        const modelParams = {
          model: geminiConfig.model || GEMINI_MODELS.FLASH_PREVIEW,
          generationConfig: this.buildGenerationConfig(profile, dynamicThinkingBudget),
          safetySettings: this.buildSafetySettings(),
          tools: this.buildTools(),
          systemInstruction: this.config.systemInstruction,
        };

        const model = this.ai.getGenerativeModel(modelParams);

        if (imageAttachments && imageAttachments.length > 0) {
          const multimodalContent = this.multimodalContentHandler.buildProviderContent(
            fullPrompt,
            imageAttachments,
            'gemini'
          ) as Content[];
          const request: GenerateContentRequest = {
            contents: multimodalContent,
          };
          return await this.executeRequest(request, model, 'multimodal');

        } else {
          const request: GenerateContentRequest = {
            contents: [{role: 'user', parts: [{text: fullPrompt}]}],
          };
          return await this.executeRequest(request, model, 'text-only');
        }
      },
      'gemini'
    );
  }

  private async executeRequest(request: GenerateContentRequest, model: any, type: 'text-only' | 'multimodal'): Promise<unknown> {
    const timeout = this.apiTimeout.getTimeout();
    const startTime = Date.now();
    
    logger.info(`Executing ${type} Gemini API call with model: ${model.model}, timeout: ${timeout}ms`);
    
    try {
      const result = await wrapExternalAPIOperation(
        () => model.generateContent(request),
        `${type}-generateContent`,
        'gemini',
        timeout
      );
      
      const duration = Date.now() - startTime;
      this.apiTimeout.recordDuration(duration);
      
      this.logResponseDebug(result, type);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const stats = this.apiTimeout.getStats();

      const enrichedError = enrichError(error as Error, {
        operation: `GeminiAPIClient.executeRequest.${type}`,
        model: model.model,
        timeout,
        duration,
        adaptiveTimeoutStats: stats,
        category: ErrorCategory.NETWORK
      });

      logger.error(`${type} Gemini API call failed`, {
        error: enrichedError
      });

      throw enrichedError;
    }
  }

  private buildTools(): Tool[] {
    const tools: Tool[] = [];
    
    if (this.config.enableCodeExecution) {
      // Code execution is not a tool in the new API
    }
    
    if (this.config.enableGoogleSearch) {
      tools.push({
        googleSearch: {}
      });
      logger.info(`Adding Google Search grounding`);
    }
    
    return tools;
  }

  private buildSafetySettings(): SafetySetting[] | undefined {
    if (this.config.unfilteredMode || this.config.enableGoogleSearch) {
      return [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ];
    }
    return undefined;
  }

  private logResponseDebug(response: unknown, type: string): void {
    logger.info(`=== GEMINI API RESPONSE DEBUG (${type}) ===`);
    logger.info('Response type:', typeof response);
    
    if (response && typeof response === 'object' && 'response' in response) {
      const res = response as { response: { candidates: Array<{ content?: { parts?: Array<{ text?: string }> } }> } };
      if (res.response.candidates && res.response.candidates[0]) {
        logger.info('First candidate keys:', Object.keys(res.response.candidates[0]));
        if (res.response.candidates[0].content && res.response.candidates[0].content.parts) {
          logger.info('Content parts count:', res.response.candidates[0].content.parts.length);
          res.response.candidates[0].content.parts.forEach((part, idx) => {
            logger.info(`Part ${idx} keys:`, Object.keys(part));
            if (part.text) {
              logger.info(`Part ${idx} text preview:`, part.text.substring(0, 100) + '...');
            }
          });
        }
      }
    }
  }
}