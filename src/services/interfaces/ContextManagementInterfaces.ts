/**
 * Context Management Service Interface Definitions
 * 
 * Interfaces for managing conversation context, memory, and server-specific data.
 */

import type { Guild, GuildMember } from 'discord.js';
import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Context Management Service Interfaces
// ============================================================================

/**
 * Context management service for conversation memory and server-specific data
 * 
 * ## Contract Guarantees
 * - Thread-safe context operations with automatic locking
 * - Automatic memory compression and deduplication
 * - Privacy-compliant data storage with configurable retention
 * - Cross-server insights with user consent
 * 
 * ## Memory Management
 * - Automatic compression when context size exceeds thresholds
 * - Deduplication of similar facts and moments
 * - LRU eviction for least-used server contexts
 * - Configurable retention periods for different data types
 * 
 * ## Privacy Compliance
 * - User data is anonymized where possible
 * - Cross-server features require explicit consent
 * - Data export and deletion capabilities
 * - Audit trail for all context modifications
 * 
 * @example
 * ```typescript
 * // Add context data
 * contextManager.addEmbarrassingMoment(
 *   'server123',
 *   'user456',
 *   'Asked how to exit vim for the 10th time'
 * );
 * 
 * // Build contextual prompt
 * const context = contextManager.buildSmartContext(
 *   'server123',
 *   'user456',
 *   'current message content'
 * );
 * ```
 */
export interface IContextManager extends IService {
  /**
   * Initializes context storage for a server
   * 
   * ## Contract
   * - MUST be idempotent (safe to call multiple times)
   * - SHOULD create empty context structure if not exists
   * - MUST apply server-specific retention policies
   * 
   * @param serverId Discord server identifier
   */
  initializeServerContext(serverId: string): void;
  
  /**
   * Retrieves server context data
   * 
   * ## Contract
   * - MUST return undefined for uninitialized servers
   * - SHOULD apply automatic compression if needed
   * - MUST respect user privacy settings
   * 
   * @param serverId Discord server identifier
   * @returns Server context or undefined if not initialized
   */
  getServerContext(serverId: string): ServerContext | undefined;
  
  /**
   * Adds an embarrassing moment for comedy context
   * 
   * ## Contract
   * - MUST validate input for appropriate content
   * - SHOULD deduplicate similar moments
   * - MUST respect user privacy settings
   * - SHOULD limit storage per user to prevent abuse
   * 
   * ## Privacy Considerations
   * - Moments are stored with user consent
   * - Can be deleted via user preference commands
   * - Subject to retention policy limits
   * 
   * @param serverId Discord server identifier
   * @param userId Discord user identifier
   * @param moment Description of the embarrassing moment
   */
  addEmbarrassingMoment(serverId: string, userId: string, moment: string): void;
  
  /**
   * Stores code snippet for future reference
   * 
   * ## Contract
   * - MUST sanitize code for security
   * - SHOULD detect programming language
   * - MUST limit snippet size and count per user
   * - SHOULD provide search capabilities
   * 
   * @param serverId Discord server identifier
   * @param userId Discord user identifier
   * @param userMessage Original user message context
   * @param code Code snippet content
   */
  addCodeSnippet(serverId: string, userId: string, userMessage: string, code: string): void;
  
  /**
   * Adds a running gag for server culture
   * 
   * ## Contract
   * - MUST validate for appropriate content
   * - SHOULD prevent duplicate gags
   * - MUST limit total gags per server
   * - SHOULD provide moderation capabilities
   * 
   * @param serverId Discord server identifier
   * @param gag Description of the running gag
   */
  addRunningGag(serverId: string, gag: string): void;
  
  /**
   * Stores summarized fact with importance weighting
   * 
   * ## Contract
   * - MUST validate fact content and length
   * - SHOULD merge similar facts automatically
   * - MUST apply importance-based retention
   * - SHOULD track fact usage for relevance
   * 
   * @param serverId Discord server identifier
   * @param fact Summarized factual information
   * @param importance Optional importance score (0-10, default: 5)
   */
  addSummarizedFact(serverId: string, fact: string, importance?: number): void;
  
  /**
   * Bulk operations
   */
  summarizeAndCompress(serverId: string): Promise<{ removed: number; kept: number }>;
  deduplicateServerContext(serverId: string): { removed: number; duplicates: string[] };
  
  /**
   * Builds comprehensive context from all available data
   * 
   * ## Contract
   * - MUST prioritize recent and important information
   * - SHOULD balance user-specific and server-wide context
   * - MUST respect maxLength parameter strictly
   * - SHOULD include relevance scoring
   * 
   * ## Context Prioritization
   * 1. Recent embarrassing moments and interactions
   * 2. Relevant code snippets and technical discussions
   * 3. Server running gags and culture
   * 4. Important summarized facts
   * 5. Cross-server insights (if enabled)
   * 
   * @param serverId Discord server identifier
   * @param userId Discord user identifier
   * @param maxLength Maximum context length in characters (default: 4000)
   * @returns Formatted context string for AI prompt
   */
  buildSuperContext(serverId: string, userId: string, maxLength?: number): string;
  
  /**
   * Builds server culture context from Discord metadata
   * 
   * ## Contract
   * - MUST extract server name, description, and rules
   * - SHOULD include channel structure and topics
   * - MUST respect privacy settings for member data
   * - SHOULD cache results for performance
   * 
   * @param guild Discord guild object
   * @returns Server culture context string
   */
  buildServerCultureContext(guild: Guild): string;
  
  /**
   * Builds user context from Discord member information
   * 
   * ## Contract
   * - MUST include roles and permissions
   * - SHOULD include join date and activity level
   * - MUST respect user privacy preferences
   * - SHOULD include nickname and display preferences
   * 
   * @param member Discord guild member object
   * @returns User context string
   */
  buildDiscordUserContext(member: GuildMember): string;
  
  /**
   * Builds smart context using AI-powered relevance scoring
   * 
   * ## Contract
   * - MUST analyze current message for context relevance
   * - SHOULD prioritize contextually relevant information
   * - MUST maintain performance (< 100ms typical)
   * - SHOULD adapt context based on conversation flow
   * 
   * ## Smart Context Features
   * - Topic-based context selection
   * - Conversation flow analysis
   * - User behavior pattern recognition
   * - Dynamic importance weighting
   * 
   * @param serverId Discord server identifier
   * @param userId Discord user identifier  
   * @param currentMessage Current user message for relevance analysis
   * @returns Contextually relevant information string
   */
  buildSmartContext(serverId: string, userId: string, currentMessage: string): string;
  
  /**
   * Cross-server operations
   */
  isGlobalContextEnabled(): boolean;
  enableGlobalContext(): void;
  disableGlobalContext(): void;
  getCrossServerInsights(userId: string): CrossServerInsights;
  
  /**
   * Memory statistics
   */
  getMemoryStats(): MemoryStats;
  getServerContextSize(serverId: string): number;
  getImportanceThreshold(serverId: string): number;
  getServerCompressionStats(serverId: string): { compressionRatio: number; memorySaved: number } | null;
  
  /**
   * Advanced operations
   */
  summarizeServerContextNow(serverId: string): boolean;
  deduplicateServerContext(serverId: string): { removed: number; duplicates: string[] };
  enableCrossServerContext(userId: string, serverId: string, enabled: boolean): void;
}

export interface ServerContext {
  serverId: string;
  embarrassingMoments: Map<string, string[]>;
  codeSnippets: Map<string, CodeSnippet[]>;
  runningGags: string[];
  summarizedFacts: SummarizedFact[];
  lastSummarized: number;
  compressionStats: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
}

export interface CodeSnippet {
  timestamp: number;
  userMessage: string;
  code: string;
}

export interface SummarizedFact {
  fact: string;
  timestamp: number;
  importance: number;
  userIds: string[];
}

export interface CrossServerInsights {
  userId: string;
  globalPatterns: string[];
  serverCount: number;
  mostActiveServer?: string;
  totalInteractions: number;
}

export interface MemoryStats {
  totalServers: number;
  totalMemoryUsage: number;
  averageServerSize: number;
  largestServerSize: number;
  itemCounts: {
    embarrassingMoments: number;
    codeSnippets: number;
    runningGags: number;
    summarizedFacts: number;
  };
  compressionStats: {
    averageCompressionRatio: number;
    totalMemorySaved: number;
    duplicatesRemoved: number;
  };
}