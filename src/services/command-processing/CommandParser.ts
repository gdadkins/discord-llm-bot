/**
 * Command Parser Service
 * 
 * Uses Gemini's structured output mode to intelligently parse
 * and interpret user commands from natural language input.
 */

import { logger } from '../../utils/logger';
import type { GeminiService } from '../gemini/GeminiService';
import type { 
  ParsedCommand,
  StructuredOutputOptions 
} from '../interfaces/GeminiInterfaces';
import { CommandSchema } from '../interfaces/GeminiInterfaces';

/**
 * Service for parsing commands using structured AI output
 * 
 * This service leverages Gemini's JSON mode to extract:
 * - Command names from natural language
 * - Command parameters and arguments
 * - User intent and context
 * - Confidence levels for command identification
 */
export class CommandParserService {
  private geminiService: GeminiService;
  
  constructor(geminiService: GeminiService) {
    this.geminiService = geminiService;
  }
  
  /**
   * Parses a command from natural language input
   * 
   * @param input - User's natural language input
   * @param userId - User ID for context
   * @param serverId - Optional server ID for context
   * @returns Parsed command structure
   * 
   * @example
   * ```typescript
   * const parsed = await commandParser.parseCommand(
   *   "Can you roast @john really hard?",
   *   userId
   * );
   * // Returns: { command: 'roast', parameters: { target: '@john', intensity: 'hard' }, confidence: 0.95, userIntent: 'User wants bot to roast john with high intensity' }
   * ```
   */
  async parseCommand(
    input: string,
    userId: string,
    serverId?: string
  ): Promise<ParsedCommand> {
    try {
      // Build structured output options
      const structuredOptions: StructuredOutputOptions = {
        schema: CommandSchema,
        schemaName: 'command',
        validateResponse: true,
        fallbackBehavior: 'error'
      };
      
      // Create prompt for command parsing
      const prompt = `Parse the following user input to identify the command and extract any parameters:

"${input}"

Identify:
1. The main command being requested (help, clear, settings, stats, roast, praise, analyze, or unknown)
2. Any parameters or arguments provided
3. The user's intent in natural language
4. Your confidence level (0-1) in the command identification

If the input doesn't match any known command, use 'unknown' as the command.`;
      
      // Use structured generation
      const result = await this.geminiService.generateStructuredResponse<ParsedCommand>(
        prompt,
        structuredOptions,
        userId,
        serverId
      );
      
      // Log successful parsing
      logger.info('Successfully parsed command', {
        input: input.substring(0, 100),
        command: result.command,
        confidence: result.confidence,
        hasParameters: !!result.parameters && Object.keys(result.parameters).length > 0
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to parse command', { error, input });
      
      // Return unknown command as fallback
      return {
        command: 'unknown',
        confidence: 0,
        userIntent: 'Failed to parse user input',
        parameters: { originalInput: input }
      };
    }
  }
  
  /**
   * Checks if input is likely a command (vs regular conversation)
   * 
   * @param input - User input to check
   * @returns Whether input appears to be a command
   */
  isLikelyCommand(input: string): boolean {
    const trimmed = input.trim().toLowerCase();
    
    // Check for common command prefixes
    if (trimmed.startsWith('!') || trimmed.startsWith('/')) {
      return true;
    }
    
    // Check for command keywords at start
    const commandKeywords = [
      'help', 'clear', 'settings', 'stats', 'roast', 'praise', 
      'analyze', 'show', 'list', 'enable', 'disable', 'set'
    ];
    
    return commandKeywords.some(keyword => 
      trimmed.startsWith(keyword + ' ') || trimmed === keyword
    );
  }
  
  /**
   * Extracts mentions from command parameters
   * 
   * @param parameters - Command parameters object
   * @returns Array of mentioned user IDs
   */
  extractMentions(parameters: Record<string, unknown> | undefined): string[] {
    if (!parameters) return [];
    
    const mentions: string[] = [];
    
    // Look for mention patterns in parameter values
    Object.values(parameters).forEach(value => {
      if (typeof value === 'string') {
        // Discord mention pattern: <@123456789012345678> or <@!123456789012345678>
        const mentionMatches = value.match(/<@!?(\d{17,19})>/g);
        if (mentionMatches) {
          mentions.push(...mentionMatches.map(m => m.replace(/<@!?|>/g, '')));
        }
      }
    });
    
    return [...new Set(mentions)]; // Remove duplicates
  }
  
  /**
   * Validates command parameters against expected schema
   * 
   * @param command - Command name
   * @param parameters - Parameters to validate
   * @returns Validation result with any errors
   */
  validateCommandParameters(
    command: ParsedCommand['command'],
    parameters: Record<string, unknown> | undefined
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    switch (command) {
    case 'roast':
      if (!parameters?.target) {
        errors.push('Roast command requires a target user');
      }
      break;
        
    case 'praise':
      if (!parameters?.target) {
        errors.push('Praise command requires a target user');
      }
      break;
        
    case 'analyze':
      if (!parameters?.target && !parameters?.topic) {
        errors.push('Analyze command requires either a target user or topic');
      }
      break;
        
    case 'settings':
      if (parameters?.action && !['view', 'update', 'reset'].includes(parameters.action as string)) {
        errors.push('Settings action must be: view, update, or reset');
      }
      break;
        
    case 'help':
    case 'clear':
    case 'stats':
      // These commands don't require parameters
      break;
        
    case 'unknown':
      // Unknown commands can't be validated
      break;
        
    default:
      errors.push(`Unknown command: ${command}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Standalone function for parsing commands without service instance
 * 
 * @param geminiService - Gemini service instance
 * @param input - User input to parse
 * @param userId - User ID for context
 * @param serverId - Optional server ID
 * @returns Parsed command
 */
export async function parseCommand(
  geminiService: GeminiService,
  input: string,
  userId: string,
  serverId?: string
): Promise<ParsedCommand> {
  const parser = new CommandParserService(geminiService);
  return parser.parseCommand(input, userId, serverId);
}