/**
 * Type definitions for Gemini API responses and related structures
 */

export interface GeminiConfig extends Record<string, unknown> {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  safetySettings?: SafetySetting[];
  systemInstruction?: string;
  tools?: GeminiTool[];
  toolConfig?: ToolConfig;
  cachedContent?: CachedContent;
  responseMimeType?: string;
  responseSchema?: unknown;
}

export enum HarmCategory {
  HARM_CATEGORY_UNSPECIFIED = 'HARM_CATEGORY_UNSPECIFIED',
  HARM_CATEGORY_HATE_SPEECH = 'HARM_CATEGORY_HATE_SPEECH',
  HARM_CATEGORY_DANGEROUS_CONTENT = 'HARM_CATEGORY_DANGEROUS_CONTENT',
  HARM_CATEGORY_HARASSMENT = 'HARM_CATEGORY_HARASSMENT',
  HARM_CATEGORY_SEXUALLY_EXPLICIT = 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
}

export enum HarmBlockThreshold {
  HARM_BLOCK_THRESHOLD_UNSPECIFIED = 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
  BLOCK_LOW_AND_ABOVE = 'BLOCK_LOW_AND_ABOVE',
  BLOCK_MEDIUM_AND_ABOVE = 'BLOCK_MEDIUM_AND_ABOVE',
  BLOCK_ONLY_HIGH = 'BLOCK_ONLY_HIGH',
  BLOCK_NONE = 'BLOCK_NONE'
}

export enum HarmBlockMethod {
  HARM_BLOCK_METHOD_UNSPECIFIED = 'HARM_BLOCK_METHOD_UNSPECIFIED',
  SEVERITY = 'SEVERITY',
  PROBABILITY = 'PROBABILITY'
}

export interface SafetySetting {
  category?: HarmCategory;
  threshold?: HarmBlockThreshold;
  method?: HarmBlockMethod;
}

export interface GeminiTool {
  functionDeclarations?: FunctionDeclaration[];
  codeExecution?: CodeExecution;
  googleSearchRetrieval?: GoogleSearchRetrieval;
}

export interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface CodeExecution {
  enabled: boolean;
}

export interface GoogleSearchRetrieval {
  dynamicRetrievalConfig?: {
    mode: string;
    dynamicThreshold?: number;
  };
}

export interface ToolConfig {
  functionCallingConfig?: {
    mode: string;
    allowedFunctionNames?: string[];
  };
}

export interface CachedContent {
  name: string;
  displayName?: string;
  model?: string;
  systemInstruction?: string;
  contents?: unknown[];
  tools?: GeminiTool[];
  toolConfig?: ToolConfig;
  createTime?: string;
  updateTime?: string;
  usageMetadata?: UsageMetadata;
}

export interface UsageMetadata {
  totalTokenCount?: number;
}

export interface GroundingChunk {
  web?: {
    title?: string;
    uri?: string;
  };
  retrievedContent?: {
    content?: string;
  };
}

export interface GroundingMetadata {
  groundingChunks: GroundingChunk[];
  webSearchQueries?: string[];
  searchEntryPoint?: {
    renderedContent?: string;
  };
  groundingSupports?: Array<{
    segment?: {
      text?: string;
    };
    groundingChunkIndices?: number[];
    confidenceScores?: number[];
  }>;
}

export interface GroundingSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface ProcessedResponse {
  content: string;
  text: string;
  thinking?: string;
  hasThinking: boolean;
  thinkingLength: number;
  wasTruncated: boolean;
  warnings: string[];
  isMultimodal?: boolean;
  imageContext?: string;
  groundingMetadata?: GroundingMetadata;
  error?: Error;
}

export interface TraceSummary {
  totalSpans: number;
  totalDuration: number;
  rootSpan?: string;
  serviceBreakdown: Record<string, number>;
  errorCount: number;
}

export interface TracePerformance {
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
}

export interface TraceError {
  service: string;
  operation: string;
  error: string;
  timestamp: number;
}