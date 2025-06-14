/**
 * GeminiAPIClient - Handles direct Gemini API interactions
 * 
 * This module is responsible for:
 * - API client initialization and configuration
 * - Building generation configurations
 * - Executing API calls with retry and circuit breaker protection
 * - Managing API-specific settings (grounding, thinking, code execution)
 */

import { GoogleGenAI, Content } from '@google/genai';
import { logger } from '../../utils/logger';
import { getGeminiConfig } from '../../config/geminiConfig';
import { ConfigurationFactory } from '../../config/ConfigurationFactory';
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
  private ai: GoogleGenAI;
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
    this.ai = new GoogleGenAI({ apiKey });
    
    // Load configuration using ConfigurationFactory
    const geminiConfig = ConfigurationFactory.createGeminiServiceConfig();
    
    this.config = {
      systemInstruction: geminiConfig.systemInstruction,
      groundingThreshold: geminiConfig.groundingThreshold,
      thinkingBudget: geminiConfig.thinkingBudget,
      includeThoughts: geminiConfig.includeThoughts,
      enableCodeExecution: geminiConfig.enableCodeExecution,
      enableStructuredOutput: geminiConfig.enableStructuredOutput,
      forceThinkingPrompt: geminiConfig.forceThinkingPrompt,
      thinkingTrigger: geminiConfig.thinkingTrigger,
      enableGoogleSearch: geminiConfig.enableGoogleSearch || false,
      unfilteredMode: geminiConfig.unfilteredMode || false
    };

    this.logConfiguration();
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

  getAI(): GoogleGenAI {
    return this.ai;
  }

  getConfig() {
    return { ...this.config };
  }

  buildGenerationConfig(
    profile: string,
    optionsOrBudget?: GeminiGenerationOptions | number
  ): any {
    const geminiConfig = getGeminiConfig(profile);
    
    // Handle overloaded parameter
    let options: GeminiGenerationOptions | undefined;
    let dynamicThinkingBudget: number | undefined;
    
    if (typeof optionsOrBudget === 'number') {
      dynamicThinkingBudget = optionsOrBudget;
    } else {
      options = optionsOrBudget;
    }
    
    const thinkingBudget = dynamicThinkingBudget !== undefined ? dynamicThinkingBudget : this.config.thinkingBudget;
    
    const config: Record<string, unknown> = {
      temperature: options?.temperature ?? geminiConfig.temperature,
      topK: options?.topK ?? geminiConfig.topK,
      topP: options?.topP ?? geminiConfig.topP,
      maxOutputTokens: options?.maxOutputTokens ?? geminiConfig.maxOutputTokens
    };
    
    // Add optional parameters
    if (geminiConfig.presencePenalty !== undefined || options?.presencePenalty !== undefined) {
      config.presencePenalty = options?.presencePenalty ?? geminiConfig.presencePenalty;
    }
    
    if (geminiConfig.frequencyPenalty !== undefined || options?.frequencyPenalty !== undefined) {
      config.frequencyPenalty = options?.frequencyPenalty ?? geminiConfig.frequencyPenalty;
    }
    
    if (options?.stopSequences) {
      config.stopSequences = options.stopSequences;
    }
    
    // Enable thinking mode
    if (this.config.includeThoughts && thinkingBudget > 0) {
      config.thinkingConfig = {
        includeThoughts: true
      };
    }
    
    // Enable structured output
    if (this.config.enableStructuredOutput && options?.structuredOutput) {
      this.configureStructuredOutput(config, options.structuredOutput, options.includeReasoning);
    }
    
    return config;
  }

  private configureStructuredOutput(
    config: Record<string, unknown>,
    structuredOutput: StructuredOutputOptions,
    includeReasoning?: boolean
  ): void {
    logger.info('Enabling structured output with JSON mode', {
      schemaName: structuredOutput.schemaName || 'custom',
      validateResponse: structuredOutput.validateResponse ?? true
    });
    
    config.responseMimeType = 'application/json';
    config.responseSchema = structuredOutput.schema;
    
    if (includeReasoning && config.responseSchema) {
      const schemaWithReasoning = JSON.parse(JSON.stringify(config.responseSchema));
      
      if (schemaWithReasoning.type === 'object' && schemaWithReasoning.properties) {
        schemaWithReasoning.properties.reasoning = {
          type: 'string',
          description: 'Step-by-step reasoning that led to this response'
        };
        
        if (schemaWithReasoning.required && !schemaWithReasoning.required.includes('reasoning')) {
          schemaWithReasoning.required.push('reasoning');
        }
      }
      
      config.responseSchema = schemaWithReasoning;
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
    
    const geminiConfig = getGeminiConfig(profile);
    
    return await this.gracefulDegradation.executeWithCircuitBreaker(
      async () => {
        if (imageAttachments && imageAttachments.length > 0) {
          return await this.executeMultimodalCall(fullPrompt, imageAttachments, geminiConfig, dynamicThinkingBudget);
        } else {
          return await this.executeTextOnlyCall(fullPrompt, geminiConfig, dynamicThinkingBudget);
        }
      },
      'gemini'
    );
  }

  private async executeMultimodalCall(
    fullPrompt: string,
    imageAttachments: ImageAttachment[],
    geminiConfig: any,
    dynamicThinkingBudget?: number
  ): Promise<unknown> {
    const multimodalContent = this.multimodalContentHandler.buildProviderContent(
      fullPrompt,
      imageAttachments,
      'gemini'
    ) as Content;
    
    if (geminiConfig.systemInstruction && multimodalContent.parts) {
      multimodalContent.parts.unshift({
        text: geminiConfig.systemInstruction
      });
    }
    
    const effectiveBudget = dynamicThinkingBudget !== undefined ? dynamicThinkingBudget : this.config.thinkingBudget;
    
    logger.info(`Executing multimodal Gemini API call with ${imageAttachments.length} image(s) using model: ${geminiConfig.model}, thinking enabled: ${this.config.includeThoughts}, thinking budget: ${effectiveBudget} tokens`);
    
    const tools = this.buildTools();
    const safetySettings = this.buildSafetySettings();
    
    const response = await this.ai.models.generateContent({
      model: geminiConfig.model,
      contents: [multimodalContent],
      config: this.buildGenerationConfig(geminiConfig.model, dynamicThinkingBudget),
      ...(tools.length > 0 && { tools }),
      ...(safetySettings && { safetySettings })
    });
    
    this.logResponseDebug(response, 'multimodal');
    return response;
  }

  private async executeTextOnlyCall(
    fullPrompt: string,
    geminiConfig: any,
    dynamicThinkingBudget?: number
  ): Promise<unknown> {
    const effectiveBudget = dynamicThinkingBudget !== undefined ? dynamicThinkingBudget : this.config.thinkingBudget;
    
    logger.info(`Executing text-only Gemini API call using model: ${geminiConfig.model}, thinking enabled: ${this.config.includeThoughts}, thinking budget: ${effectiveBudget} tokens`);
    
    if (this.config.includeThoughts && effectiveBudget > 0) {
      logger.info('Including thinkingConfig in API request: { includeThoughts: true }');
    }
    
    const tools = this.buildTools();
    const safetySettings = this.buildSafetySettings();
    
    const response = await this.ai.models.generateContent({
      model: geminiConfig.model,
      contents: fullPrompt,
      config: {
        temperature: geminiConfig.temperature,
        topK: geminiConfig.topK,
        topP: geminiConfig.topP,
        maxOutputTokens: geminiConfig.maxOutputTokens,
        ...(geminiConfig.presencePenalty !== undefined && { presencePenalty: geminiConfig.presencePenalty }),
        ...(geminiConfig.frequencyPenalty !== undefined && { frequencyPenalty: geminiConfig.frequencyPenalty }),
        ...(this.config.includeThoughts && effectiveBudget > 0 && {
          thinkingConfig: {
            includeThoughts: true
          }
        })
      },
      ...(tools.length > 0 && { tools }),
      ...(safetySettings && { safetySettings })
    });
    
    this.logResponseDebug(response, 'text-only');
    return response;
  }

  private buildTools(): any[] {
    const tools: any[] = [];
    
    if (this.config.enableCodeExecution) {
      tools.push({ codeExecution: {} });
      logger.info('Adding code execution tool to API request');
    }
    
    if (this.config.enableGoogleSearch) {
      tools.push({
        googleSearch: {
          dynamicRetrievalConfig: {
            mode: 'MODE_DYNAMIC',
            dynamicThreshold: this.config.groundingThreshold
          }
        }
      });
      logger.info(`Adding Google Search grounding with threshold: ${this.config.groundingThreshold}`);
    }
    
    return tools;
  }

  private buildSafetySettings(): any[] | undefined {
    if (this.config.unfilteredMode || this.config.enableGoogleSearch) {
      return [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ];
    }
    return undefined;
  }

  private logResponseDebug(response: unknown, type: string): void {
    logger.info(`=== GEMINI API RESPONSE DEBUG (${type}) ===`);
    logger.info('Response type:', typeof response);
    logger.info('Response keys:', Object.keys(response as any));
    
    if (response && typeof response === 'object' && 'candidates' in response) {
      const res = response as unknown as { candidates: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      if (res.candidates && res.candidates[0]) {
        logger.info('First candidate keys:', Object.keys(res.candidates[0]));
        if (res.candidates[0].content && res.candidates[0].content.parts) {
          logger.info('Content parts count:', res.candidates[0].content.parts.length);
          res.candidates[0].content.parts.forEach((part, idx) => {
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