/**
 * Gemini Service Interface Definitions
 * 
 * Specific interfaces for Google Gemini AI service integration
 * including structured output, JSON mode, and schema validation.
 */

// Schema type for JSON mode configuration
// Using 'any' type since @google/genai doesn't export Schema type directly
type Schema = any;

// ============================================================================
// Structured Output Configuration
// ============================================================================

/**
 * Configuration options for structured output generation
 * Enables JSON mode with schema validation for predictable responses
 */
export interface StructuredOutputOptions {
  /**
   * JSON schema for response validation
   * Must be a valid JSON schema that Gemini can conform to
   */
  schema: Schema;
  
  /**
   * Optional schema name for better error messages
   */
  schemaName?: string;
  
  /**
   * Whether to validate the response against the schema
   * Default: true
   */
  validateResponse?: boolean;
  
  /**
   * Fallback behavior when schema validation fails
   * Default: 'error'
   */
  fallbackBehavior?: 'error' | 'raw' | 'retry';
}

// ============================================================================
// Common Response Schemas
// ============================================================================

/**
 * Schema for command parsing responses
 * Used to interpret user commands and extract parameters
 */
export const CommandSchema: Schema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'The identified command name',
      enum: ['help', 'clear', 'settings', 'stats', 'roast', 'praise', 'analyze', 'unknown']
    },
    parameters: {
      type: 'object',
      description: 'Extracted command parameters',
      additionalProperties: true
    },
    confidence: {
      type: 'number',
      description: 'Confidence level of command identification (0-1)',
      minimum: 0,
      maximum: 1
    },
    userIntent: {
      type: 'string',
      description: 'Natural language description of what the user wants'
    }
  },
  required: ['command', 'confidence', 'userIntent']
};

/**
 * Schema for content analysis responses
 * Used for analyzing message content, sentiment, and context
 */
export const AnalysisSchema: Schema = {
  type: 'object',
  properties: {
    sentiment: {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          description: 'Sentiment score (-1 to 1)',
          minimum: -1,
          maximum: 1
        },
        magnitude: {
          type: 'number',
          description: 'Sentiment magnitude (0 to infinity)',
          minimum: 0
        },
        label: {
          type: 'string',
          enum: ['positive', 'negative', 'neutral', 'mixed']
        }
      },
      required: ['score', 'magnitude', 'label']
    },
    topics: {
      type: 'array',
      description: 'Identified topics in the content',
      items: {
        type: 'string'
      }
    },
    entities: {
      type: 'array',
      description: 'Named entities found in the content',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { 
            type: 'string',
            enum: ['person', 'location', 'organization', 'event', 'product', 'other']
          },
          salience: { 
            type: 'number',
            minimum: 0,
            maximum: 1
          }
        },
        required: ['name', 'type']
      }
    },
    summary: {
      type: 'string',
      description: 'Brief summary of the content'
    }
  },
  required: ['sentiment', 'topics', 'summary']
};

/**
 * Schema for decision-making responses
 * Used for yes/no questions or multi-choice decisions
 */
export const DecisionSchema: Schema = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      description: 'The decision made'
    },
    reasoning: {
      type: 'string',
      description: 'Explanation for the decision'
    },
    confidence: {
      type: 'number',
      description: 'Confidence level (0-1)',
      minimum: 0,
      maximum: 1
    },
    alternatives: {
      type: 'array',
      description: 'Alternative options considered',
      items: {
        type: 'object',
        properties: {
          option: { type: 'string' },
          score: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    }
  },
  required: ['decision', 'reasoning', 'confidence']
};

/**
 * Schema for structured data extraction
 * Used to extract specific information from unstructured text
 */
export const DataExtractionSchema: Schema = {
  type: 'object',
  properties: {
    extractedData: {
      type: 'object',
      description: 'The extracted structured data',
      additionalProperties: true
    },
    metadata: {
      type: 'object',
      properties: {
        sourceLength: { type: 'number' },
        extractionQuality: {
          type: 'string',
          enum: ['high', 'medium', 'low']
        },
        missingFields: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  },
  required: ['extractedData', 'metadata']
};

// ============================================================================
// Response Parsing Types
// ============================================================================

/**
 * Parsed command response matching CommandSchema
 */
export interface ParsedCommand {
  command: 'help' | 'clear' | 'settings' | 'stats' | 'roast' | 'praise' | 'analyze' | 'unknown';
  parameters?: Record<string, unknown>;
  confidence: number;
  userIntent: string;
}

/**
 * Parsed analysis response matching AnalysisSchema
 */
export interface ParsedAnalysis {
  sentiment: {
    score: number;
    magnitude: number;
    label: 'positive' | 'negative' | 'neutral' | 'mixed';
  };
  topics: string[];
  entities: Array<{
    name: string;
    type: 'person' | 'location' | 'organization' | 'event' | 'product' | 'other';
    salience?: number;
  }>;
  summary: string;
}

/**
 * Parsed decision response matching DecisionSchema
 */
export interface ParsedDecision {
  decision: string;
  reasoning: string;
  confidence: number;
  alternatives?: Array<{
    option: string;
    score: number;
  }>;
}

/**
 * Parsed data extraction response matching DataExtractionSchema
 */
export interface ParsedDataExtraction {
  extractedData: Record<string, unknown>;
  metadata: {
    sourceLength?: number;
    extractionQuality?: 'high' | 'medium' | 'low';
    missingFields?: string[];
  };
}

// ============================================================================
// Generation Configuration Extensions
// ============================================================================

/**
 * Extended generation options with structured output support
 */
export interface GeminiGenerationOptions {
  /**
   * Standard generation parameters
   */
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  
  /**
   * Structured output configuration
   * When provided, enables JSON mode with schema validation
   */
  structuredOutput?: StructuredOutputOptions;
  
  /**
   * Whether to include thinking/reasoning in structured outputs
   * Only applies when structuredOutput is enabled
   */
  includeReasoning?: boolean;
}

// ============================================================================
// Schema Registry
// ============================================================================

/**
 * Registry of available schemas for easy access
 */
export const SchemaRegistry = {
  command: CommandSchema,
  analysis: AnalysisSchema,
  decision: DecisionSchema,
  dataExtraction: DataExtractionSchema
} as const;

/**
 * Type helper for schema names
 */
export type SchemaName = keyof typeof SchemaRegistry;