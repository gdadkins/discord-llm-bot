/**
 * GeminiResponseHandler - Handles response extraction and processing
 * 
 * This module is responsible for:
 * - Extracting text from API responses
 * - Processing thinking text and formatting
 * - Handling code execution results
 * - Extracting grounding metadata
 * - Parsing structured JSON responses
 * - Formatting responses for Discord display
 */

import { logger } from '../../utils/logger';
import type { 
  IGeminiResponseHandler,
  ImageAttachment
} from './interfaces';
import type {
  IResponseProcessingService,
  IHealthMonitor,
  StructuredOutputOptions
} from '../interfaces';

export class GeminiResponseHandler implements IGeminiResponseHandler {
  private healthMonitor?: IHealthMonitor;

  constructor(
    private responseProcessingService: IResponseProcessingService,
    private config: {
      includeThoughts: boolean;
      thinkingBudget: number;
      enableCodeExecution: boolean;
      enableGoogleSearch: boolean;
    }
  ) {}

  setHealthMonitor(healthMonitor: IHealthMonitor): void {
    this.healthMonitor = healthMonitor;
  }

  async extractResponseText(
    response: unknown,
    isMultimodal?: boolean,
    processedAttachments?: ImageAttachment[],
    dynamicThinkingBudget?: number
  ): Promise<string> {
    // Check for code execution results first
    if (this.config.enableCodeExecution) {
      const codeExecutionResults = this.parseCodeExecutionResults(response);
      if (codeExecutionResults) {
        return await this.combineCodeExecutionWithRegularResponse(
          response,
          codeExecutionResults,
          isMultimodal,
          processedAttachments,
          dynamicThinkingBudget
        );
      }
    }
    
    // Process regular response
    const processedResponse = await this.processRegularResponse(
      response,
      isMultimodal,
      processedAttachments,
      dynamicThinkingBudget
    );
    
    // Add grounding sources if enabled
    if (this.config.enableGoogleSearch) {
      return this.appendGroundingSources(response, processedResponse);
    }
    
    return processedResponse;
  }

  private async combineCodeExecutionWithRegularResponse(
    response: unknown,
    codeExecutionResults: string,
    isMultimodal?: boolean,
    processedAttachments?: ImageAttachment[],
    dynamicThinkingBudget?: number
  ): Promise<string> {
    logger.info('Processing code execution results from response');
    
    const config = {
      includeThoughts: this.config.includeThoughts,
      maxMessageLength: 2000,
      thinkingBudget: dynamicThinkingBudget !== undefined ? dynamicThinkingBudget : this.config.thinkingBudget,
      isMultimodal: isMultimodal || false,
      processedAttachments: processedAttachments?.map(att => ({
        url: att.url,
        mimeType: att.mimeType,
        base64Data: att.base64Data,
        filename: att.filename,
        size: att.size
      }))
    };

    const processed = await this.responseProcessingService.processAPIResponse(response, config);
    
    let combinedResponse = '';
    
    if (processed.text && processed.text.trim()) {
      if (!processed.text.includes('```python') && !processed.text.includes('**Output:**')) {
        combinedResponse = processed.text + '\n\n' + codeExecutionResults;
      } else {
        combinedResponse = processed.text;
      }
    } else {
      combinedResponse = codeExecutionResults;
    }
    
    // Ensure combined response fits Discord limit
    if (combinedResponse.length > 2000) {
      combinedResponse = this.truncateCombinedResponse(combinedResponse, codeExecutionResults, processed.text);
    }
    
    return combinedResponse;
  }

  private truncateCombinedResponse(
    combinedResponse: string,
    codeExecutionResults: string,
    regularText?: string
  ): string {
    const availableSpace = 1900;
    
    if (codeExecutionResults.length <= availableSpace) {
      const remainingSpace = availableSpace - codeExecutionResults.length - 20;
      if (regularText && remainingSpace > 100) {
        return regularText.substring(0, remainingSpace) + '...\n\n' + codeExecutionResults;
      } else {
        return codeExecutionResults;
      }
    } else {
      return codeExecutionResults.substring(0, 1997) + '...';
    }
  }

  private async processRegularResponse(
    response: unknown,
    isMultimodal?: boolean,
    processedAttachments?: ImageAttachment[],
    dynamicThinkingBudget?: number
  ): Promise<string> {
    const config = {
      includeThoughts: this.config.includeThoughts,
      maxMessageLength: 2000,
      thinkingBudget: dynamicThinkingBudget !== undefined ? dynamicThinkingBudget : this.config.thinkingBudget,
      isMultimodal: isMultimodal || false,
      processedAttachments: processedAttachments?.map(att => ({
        url: att.url,
        mimeType: att.mimeType,
        base64Data: att.base64Data,
        filename: att.filename,
        size: att.size
      }))
    };

    const processed = await this.responseProcessingService.processAPIResponse(response, config);
    
    this.logProcessingResults(processed);
    
    if (processed.hasThinking) {
      await this.trackThinkingAnalytics(processed, config);
    }
    
    return processed.text;
  }

  private logProcessingResults(processed: any): void {
    if (processed.warnings.length > 0) {
      logger.warn('Response processing warnings:', processed.warnings);
    }
    
    if (processed.hasThinking) {
      logger.info(`Response included thinking text (${processed.thinkingLength} chars)`);
    }
    
    if (processed.wasTruncated) {
      logger.warn('Response was truncated to fit Discord message limits');
    }
    
    if (processed.isMultimodal) {
      logger.info('Processed multimodal response with image context');
    }
  }

  private async trackThinkingAnalytics(processed: any, config: any): Promise<void> {
    try {
      if (this.healthMonitor) {
        const analyticsService = (this.healthMonitor as any).getService?.('AnalyticsManager');
        if (analyticsService && typeof analyticsService.trackPerformance === 'function') {
          await analyticsService.trackPerformance(
            'api_latency',
            processed.thinkingLength,
            `thinking_tokens_budget_${config.thinkingBudget}`
          );
          
          const responseLength = processed.text.length || 1;
          const thinkingRatio = processed.thinkingLength / responseLength;
          const effectiveness = Math.min(Math.round(thinkingRatio * 100), 100);
          
          await analyticsService.trackPerformance(
            'cache_hit_rate',
            effectiveness,
            'thinking_effectiveness_ratio'
          );
          
          logger.debug(`Tracked thinking analytics - tokens: ${processed.thinkingLength}, effectiveness: ${effectiveness}%`);
        }
      }
    } catch (error) {
      logger.debug('Failed to track thinking analytics:', error);
    }
  }

  private appendGroundingSources(response: unknown, processedText: string): string {
    const groundingData = this.extractGroundingMetadata(response);
    if (!groundingData || groundingData.sources.length === 0) {
      return processedText;
    }
    
    const urlsNotInResponse = groundingData.sources.filter(source => {
      if (!source.url) return false;
      
      const urlInPlainText = processedText.includes(source.url);
      const urlInMarkdown = processedText.includes(`(${source.url})`);
      
      return !urlInPlainText && !urlInMarkdown;
    });
    
    if (urlsNotInResponse.length === 0) {
      logger.info(`All ${groundingData.sources.length} grounding sources already present in response text`);
      return processedText;
    }
    
    const citations = urlsNotInResponse.map((source, index) => {
      const citation = `[${index + 1}] ${source.title}`;
      if (source.url) {
        return `${citation} - ${source.url}`;
      }
      return citation;
    }).join('\n');
    
    const citationSection = `\n\n**Additional Sources:**\n${citations}`;
    
    if (processedText.length + citationSection.length <= 2000) {
      logger.info(`Added ${urlsNotInResponse.length} additional grounding sources`);
      return processedText + citationSection;
    } else {
      const availableSpace = 2000 - citationSection.length - 10;
      logger.warn('Truncated response to include additional grounding sources');
      return processedText.substring(0, availableSpace) + '...' + citationSection;
    }
  }

  formatResponse(text: string, includeThoughts: boolean): string {
    // Basic formatting - delegate complex formatting to response processing service
    if (!includeThoughts) {
      // Remove any thinking markers if present
      text = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
    }
    
    // Ensure response fits Discord limits
    if (text.length > 2000) {
      text = text.substring(0, 1997) + '...';
    }
    
    return text;
  }

  parseCodeExecutionResults(response: unknown): string | null {
    try {
      const res = response as any;
      if (!res.candidates || !res.candidates[0]) {
        return null;
      }

      const candidate = res.candidates[0];
      
      if (!candidate.content?.parts) {
        return null;
      }

      const codeExecutionResults: string[] = [];

      for (const part of candidate.content.parts) {
        logger.debug(`Part keys in code execution check: ${Object.keys(part).join(', ')}`);
        
        if (!part.executableCode && !part.codeExecutionResult && !part.functionCall?.name?.includes('code')) {
          continue;
        }
        
        if (part.executableCode || part.codeExecutionResult) {
          logger.info('Found code execution part in response');
          let resultText = '';
          
          if (part.executableCode?.code) {
            const code = part.executableCode.code;
            const language = part.executableCode.language || 'python';
            resultText += `\`\`\`${language}\n${code}\n\`\`\`\n`;
          }
          
          if (part.codeExecutionResult?.output) {
            let output = part.codeExecutionResult.output;
            
            if (output.length > 2000) {
              output = output.substring(0, 1997) + '...';
              logger.warn('Code execution output truncated due to length');
            }
            
            output = this.sanitizeCodeOutput(output);
            
            resultText += '**Output:**\n```\n' + output + '\n```';
          } else if (part.codeExecutionResult?.error) {
            const error = part.codeExecutionResult.error;
            resultText += '**Execution Error:**\n```\n' + error + '\n```';
          } else if (part.codeExecutionResult?.timeout) {
            resultText += '**Execution Timeout:** Code execution exceeded the time limit\n';
          }
          
          if (resultText) {
            codeExecutionResults.push(resultText);
          }
        }
      }

      if (codeExecutionResults.length > 0) {
        logger.info(`Found ${codeExecutionResults.length} code execution result(s)`);
        return codeExecutionResults.join('\n\n');
      }

      return null;
    } catch (error) {
      logger.error('Error parsing code execution results', { error });
      return null;
    }
  }

  private sanitizeCodeOutput(output: string): string {
    let sanitized = output
      .replace(/```/g, '\\`\\`\\`')
      .replace(/@everyone/g, '@\u200Beveryone')
      .replace(/@here/g, '@\u200Bhere');
    
    sanitized = sanitized.replace(/\x1b\[[0-9;]*m/g, '');
    
    const lines = sanitized.split('\n');
    const truncatedLines = lines.map(line => 
      line.length > 200 ? line.substring(0, 197) + '...' : line
    );
    
    if (truncatedLines.length > 50) {
      return truncatedLines.slice(0, 47).join('\n') + '\n... (output truncated)';
    }
    
    return truncatedLines.join('\n');
  }

  extractGroundingMetadata(response: unknown): { sources: Array<{ title: string; url: string; snippet?: string }> } | null {
    try {
      const res = response as any;
      
      if (!res.candidates || !res.candidates[0] || !res.candidates[0].groundingMetadata) {
        return null;
      }
      
      const groundingMetadata = res.candidates[0].groundingMetadata;
      
      if (groundingMetadata.searchEntryPoint && groundingMetadata.searchEntryPoint.renderedContent) {
        logger.info('Grounding search query:', groundingMetadata.searchEntryPoint.renderedContent);
      }
      
      if (!groundingMetadata.groundingChunks || groundingMetadata.groundingChunks.length === 0) {
        return null;
      }
      
      const sources = groundingMetadata.groundingChunks.map((chunk: any) => {
        const source: any = {
          title: chunk.web?.title || 'Unknown Source',
          url: chunk.web?.uri || ''
        };
        
        if (chunk.retrievedContent?.content) {
          source.snippet = chunk.retrievedContent.content.substring(0, 200) + '...';
        }
        
        return source;
      });
      
      logger.info(`Extracted ${sources.length} grounding sources from response`);
      return { sources };
      
    } catch (error) {
      logger.error('Failed to extract grounding metadata', { error });
      return null;
    }
  }

  async parseStructuredResponse(
    response: string,
    options: StructuredOutputOptions
  ): Promise<unknown> {
    try {
      const parsed = JSON.parse(response);
      
      logger.info('Successfully parsed structured response', {
        schemaName: options.schemaName || 'custom',
        responseKeys: Object.keys(parsed)
      });
      
      if (options.validateResponse !== false) {
        const schema = options.schema as any;
        if (schema.required && Array.isArray(schema.required)) {
          const missingFields = schema.required.filter((field: string) => !(field in parsed));
          if (missingFields.length > 0) {
            logger.warn('Structured response missing required fields', {
              missingFields,
              schemaName: options.schemaName
            });
            
            if (options.fallbackBehavior === 'error') {
              throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }
          }
        }
      }
      
      return parsed;
    } catch (error) {
      logger.error('Failed to parse structured response', {
        error,
        schemaName: options.schemaName,
        responsePreview: response.substring(0, 200)
      });
      
      switch (options.fallbackBehavior) {
      case 'raw':
        return { raw: response, error: 'Failed to parse as JSON' };
          
      case 'retry':
        logger.warn('Retry not implemented, falling back to error');
        throw error;
          
      case 'error':
      default:
        throw new Error(`Failed to parse structured response: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}