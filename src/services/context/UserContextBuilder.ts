/**
 * @file UserContextBuilder - Builds user-specific context
 * @module services/context/UserContextBuilder
 * 
 * Handles the construction of user-specific context including preferences,
 * interaction history, personality mapping, and behavioral patterns.
 */

import { GuildMember } from 'discord.js';
import { logger } from '../../utils/logger';
import { RichContext, ContextItem, SocialGraph } from './types';
import { BehaviorAnalyzer, UserBehaviorPattern } from '../analytics/behavior';
import { SocialDynamicsService } from './SocialDynamicsService';

export interface UserContextOptions {
  includeBehavior?: boolean;
  includeInteractions?: boolean;
  includePersonality?: boolean;
  includeEmbarrassingMoments?: boolean;
  includeCodeHistory?: boolean;
  maxItems?: number;
  timeWindow?: number; // hours
}

export interface UserPersonalityTraits {
  humor: 'dry' | 'sarcastic' | 'wholesome' | 'dark' | 'neutral';
  techLevel: 'beginner' | 'intermediate' | 'expert' | 'unknown';
  activityLevel: 'lurker' | 'occasional' | 'regular' | 'power-user';
  interactionStyle: 'helpful' | 'playful' | 'serious' | 'mixed';
}

/**
 * Specialized builder for user-specific context
 * 
 * This builder is responsible for:
 * - Extracting user preferences and patterns
 * - Building interaction history and social connections
 * - Mapping personality traits from behavior
 * - Managing user-specific embarrassing moments and achievements
 */
export class UserContextBuilder {
  private readonly DEFAULT_MAX_ITEMS = 10;
  private readonly DEFAULT_TIME_WINDOW = 168; // 1 week in hours
  private readonly PERSONALITY_CACHE_TTL = 3600000; // 1 hour
  
  private behaviorAnalyzer: BehaviorAnalyzer;
  private socialDynamicsService: SocialDynamicsService;
  private personalityCache: Map<string, { traits: UserPersonalityTraits; timestamp: number }> = new Map();

  constructor(
    behaviorAnalyzer: BehaviorAnalyzer,
    socialDynamicsService: SocialDynamicsService
  ) {
    this.behaviorAnalyzer = behaviorAnalyzer;
    this.socialDynamicsService = socialDynamicsService;
  }

  /**
   * Build comprehensive user context
   */
  public buildUserContext(
    userId: string,
    context: RichContext,
    member?: GuildMember,
    options: UserContextOptions = {}
  ): string {
    const parts: string[] = [];
    
    // Add user header
    const username = member?.displayName || userId;
    parts.push(`=== User Context: ${username} ===\n\n`);
    
    // Add Discord member info if available
    if (member) {
      const memberInfo = this.buildMemberInfo(member);
      if (memberInfo) {
        parts.push(memberInfo);
      }
    }
    
    // Add personality traits if requested
    if (options.includePersonality !== false) {
      const personality = this.buildPersonalityContext(userId, context);
      if (personality) {
        parts.push(personality);
      }
    }
    
    // Add behavior patterns if requested
    if (options.includeBehavior !== false) {
      const behavior = this.buildBehaviorContext(userId);
      if (behavior) {
        parts.push(behavior);
      }
    }
    
    // Add social interactions if requested
    if (options.includeInteractions !== false) {
      const interactions = this.buildInteractionContext(userId, context);
      if (interactions) {
        parts.push(interactions);
      }
    }
    
    // Add embarrassing moments if requested
    if (options.includeEmbarrassingMoments !== false) {
      const moments = this.buildEmbarrassingMomentsContext(userId, context, options.maxItems);
      if (moments) {
        parts.push(moments);
      }
    }
    
    // Add code history if requested
    if (options.includeCodeHistory !== false) {
      const codeHistory = this.buildCodeHistoryContext(userId, context, options.maxItems);
      if (codeHistory) {
        parts.push(codeHistory);
      }
    }
    
    return parts.join('');
  }

  /**
   * Map user personality from behavior patterns
   */
  public mapUserPersonality(
    userId: string,
    context: RichContext,
    behaviorPattern?: UserBehaviorPattern
  ): UserPersonalityTraits {
    // Check cache first
    const cached = this.personalityCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.PERSONALITY_CACHE_TTL) {
      return cached.traits;
    }
    
    // Analyze patterns to determine traits
    const traits = this.analyzePersonalityTraits(userId, context, behaviorPattern);
    
    // Cache the result
    this.personalityCache.set(userId, {
      traits,
      timestamp: Date.now()
    });
    
    return traits;
  }

  /**
   * Build user interaction history
   */
  public buildInteractionHistory(
    userId: string,
    context: RichContext,
    timeWindow: number = 24
  ): string[] {
    const history: string[] = [];
    const socialGraph = context.socialGraph.get(userId);
    
    if (!socialGraph) {
      return history;
    }
    
    // Get recent interactions
    const cutoffTime = Date.now() - (timeWindow * 60 * 60 * 1000);
    
    // Process different interaction types
    socialGraph.lastInteraction.forEach((timestamp, targetUserId) => {
      if (timestamp.getTime() > cutoffTime) {
        const interactionCount = socialGraph.interactions.get(targetUserId) || 0;
        const mentionCount = socialGraph.mentions.get(targetUserId) || 0;
        const roastCount = socialGraph.roasts.get(targetUserId) || 0;
        
        history.push(
          `Interacted with <@${targetUserId}> ${interactionCount} times ` +
          `(${mentionCount} mentions, ${roastCount} roasts)`
        );
      }
    });
    
    return history;
  }

  /**
   * Extract user preferences from behavior
   */
  public extractUserPreferences(
    userId: string,
    context: RichContext
  ): Map<string, any> {
    const preferences = new Map<string, any>();
    
    // Analyze code language preferences
    const codeSnippets = context.codeSnippets.get(userId);
    if (codeSnippets && codeSnippets.length > 0) {
      const languages = this.detectProgrammingLanguages(codeSnippets);
      preferences.set('programmingLanguages', languages);
    }
    
    // Analyze interaction preferences
    const socialGraph = context.socialGraph.get(userId);
    if (socialGraph) {
      const preferredInteractionStyle = this.analyzeInteractionStyle(socialGraph);
      preferences.set('interactionStyle', preferredInteractionStyle);
    }
    
    // Analyze activity patterns
    const behaviorPattern = this.behaviorAnalyzer.getBehaviorPattern(userId);
    if (behaviorPattern) {
      preferences.set('activeHours', this.extractActiveHours(behaviorPattern));
      preferences.set('responseStyle', 'dynamic'); // Default response style
    }
    
    return preferences;
  }

  // ========== PRIVATE HELPER METHODS ==========

  private buildMemberInfo(member: GuildMember): string {
    const parts: string[] = ['DISCORD PROFILE:\n'];
    
    // Basic info
    parts.push(`- Nickname: ${member.displayName}\n`);
    parts.push(`- Joined: ${member.joinedAt?.toLocaleDateString() || 'Unknown'}\n`);
    
    // Roles
    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .map(role => role.name)
      .slice(0, 5);
    
    if (roles.length > 0) {
      parts.push(`- Roles: ${roles.join(', ')}\n`);
    }
    
    // Status indicators
    if (member.premiumSince) {
      parts.push(`- Server Booster since ${member.premiumSince.toLocaleDateString()}\n`);
    }
    
    parts.push('\n');
    return parts.join('');
  }

  private buildPersonalityContext(userId: string, context: RichContext): string {
    const behaviorPattern = this.behaviorAnalyzer.getBehaviorPattern(userId);
    const personality = this.mapUserPersonality(userId, context, behaviorPattern || undefined);
    
    const parts: string[] = ['PERSONALITY PROFILE:\n'];
    
    parts.push(`- Humor Style: ${personality.humor}\n`);
    parts.push(`- Technical Level: ${personality.techLevel}\n`);
    parts.push(`- Activity Level: ${personality.activityLevel}\n`);
    parts.push(`- Interaction Style: ${personality.interactionStyle}\n`);
    
    parts.push('\n');
    return parts.join('');
  }

  private buildBehaviorContext(userId: string): string {
    const pattern = this.behaviorAnalyzer.getBehaviorPattern(userId);
    if (!pattern) {
      return '';
    }
    
    const parts: string[] = ['BEHAVIOR PATTERNS:\n'];
    
    // Message patterns
    parts.push(`- Message Frequency: ${pattern.messageFrequency} msgs/hour\n`);
    parts.push(`- Complexity Score: ${pattern.complexityScore}/10\n`);
    parts.push(`- Roast Resistance: ${pattern.roastResistance}/10\n`);
    
    // Communication style
    if (pattern.favoriteTopics.length > 0) {
      parts.push(`- Favorite Topics: ${pattern.favoriteTopics.slice(0, 5).join(', ')}\n`);
    }
    
    if (pattern.detectedLanguages.length > 0) {
      parts.push(`- Languages: ${pattern.detectedLanguages.slice(0, 3).join(', ')}\n`);
    }
    
    if (pattern.commonMistakes.length > 0) {
      parts.push(`- Common Mistakes: ${pattern.commonMistakes.slice(0, 3).join(', ')}\n`);
    }
    
    parts.push('\n');
    return parts.join('');
  }

  private buildInteractionContext(userId: string, context: RichContext): string {
    const socialGraph = context.socialGraph.get(userId);
    if (!socialGraph) {
      return '';
    }
    
    const parts: string[] = ['SOCIAL INTERACTIONS:\n'];
    
    // Top interactions
    const topInteractions = this.getTopInteractions(socialGraph, 5);
    topInteractions.forEach(([targetId, count]) => {
      parts.push(`- Frequently interacts with <@${targetId}> (${count} times)\n`);
    });
    
    // Interaction style
    const totalMentions = Array.from(socialGraph.mentions.values()).reduce((a, b) => a + b, 0);
    const totalRoasts = Array.from(socialGraph.roasts.values()).reduce((a, b) => a + b, 0);
    
    if (totalRoasts > totalMentions * 0.3) {
      parts.push('- Known for roasting others\n');
    } else if (totalMentions > 10) {
      parts.push('- Actively engages in conversations\n');
    }
    
    parts.push('\n');
    return parts.join('');
  }

  private buildEmbarrassingMomentsContext(
    userId: string,
    context: RichContext,
    maxItems?: number
  ): string {
    const userMoments = context.embarrassingMoments
      .filter(moment => moment.content.includes(userId))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, maxItems || this.DEFAULT_MAX_ITEMS);
    
    if (userMoments.length === 0) {
      return '';
    }
    
    const parts: string[] = ['EMBARRASSING MOMENTS:\n'];
    
    userMoments.forEach(moment => {
      const content = moment.content.replace(`${userId}:`, '').trim();
      parts.push(`- ${content}\n`);
    });
    
    parts.push('\n');
    return parts.join('');
  }

  private buildCodeHistoryContext(
    userId: string,
    context: RichContext,
    maxItems?: number
  ): string {
    const userCode = context.codeSnippets.get(userId);
    if (!userCode || userCode.length === 0) {
      return '';
    }
    
    const parts: string[] = ['CODE SUBMISSION HISTORY:\n'];
    
    const recentCode = userCode
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, maxItems || 3);
    
    recentCode.forEach(snippet => {
      const date = new Date(snippet.timestamp).toLocaleDateString();
      const preview = snippet.content.split('\n')[0].substring(0, 50);
      parts.push(`- [${date}] ${preview}...\n`);
    });
    
    // Language statistics
    const languages = this.detectProgrammingLanguages(userCode);
    if (languages.length > 0) {
      parts.push(`- Primary Languages: ${languages.slice(0, 3).join(', ')}\n`);
    }
    
    parts.push('\n');
    return parts.join('');
  }

  private analyzePersonalityTraits(
    userId: string,
    context: RichContext,
    behaviorPattern?: UserBehaviorPattern
  ): UserPersonalityTraits {
    // Default traits
    let humor: UserPersonalityTraits['humor'] = 'neutral';
    let techLevel: UserPersonalityTraits['techLevel'] = 'unknown';
    let activityLevel: UserPersonalityTraits['activityLevel'] = 'occasional';
    let interactionStyle: UserPersonalityTraits['interactionStyle'] = 'mixed';
    
    // Analyze humor from embarrassing moments and roasts
    const userMoments = context.embarrassingMoments.filter(m => m.content.includes(userId));
    const roastCount = context.lastRoasted.get(userId) ? 1 : 0;
    
    if (userMoments.length > 10 || roastCount > 0) {
      humor = 'sarcastic';
    } else if (userMoments.length > 5) {
      humor = 'wholesome';
    }
    
    // Analyze tech level from code snippets
    const codeSnippets = context.codeSnippets.get(userId);
    if (codeSnippets) {
      if (codeSnippets.length > 20) {
        techLevel = 'expert';
      } else if (codeSnippets.length > 5) {
        techLevel = 'intermediate';
      } else if (codeSnippets.length > 0) {
        techLevel = 'beginner';
      }
    }
    
    // Analyze activity level from behavior pattern
    if (behaviorPattern) {
      if (behaviorPattern.messageFrequency > 50) {
        activityLevel = 'power-user';
      } else if (behaviorPattern.messageFrequency > 10) {
        activityLevel = 'regular';
      } else if (behaviorPattern.messageFrequency < 1) {
        activityLevel = 'lurker';
      }
      
      // Determine interaction style based on available data
      if (behaviorPattern.favoriteTopics.includes('help')) {
        interactionStyle = 'helpful';
      } else if (behaviorPattern.complexityScore > 7) {
        interactionStyle = 'serious';
      } else if (behaviorPattern.complexityScore < 4) {
        interactionStyle = 'playful';
      }
    }
    
    return { humor, techLevel, activityLevel, interactionStyle };
  }

  private detectProgrammingLanguages(snippets: ContextItem[]): string[] {
    const languageCounts = new Map<string, number>();
    
    snippets.forEach(snippet => {
      const language = this.detectLanguage(snippet.content);
      if (language) {
        languageCounts.set(language, (languageCounts.get(language) || 0) + 1);
      }
    });
    
    return Array.from(languageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang);
  }

  private detectLanguage(code: string): string | null {
    // Simple language detection based on patterns
    if (code.includes('const') || code.includes('let') || code.includes('=>')) {
      return 'JavaScript';
    } else if (code.includes('def ') || code.includes('import ')) {
      return 'Python';
    } else if (code.includes('public class') || code.includes('private ')) {
      return 'Java';
    } else if (code.includes('fn ') || code.includes('mut ')) {
      return 'Rust';
    } else if (code.includes('<?php')) {
      return 'PHP';
    }
    
    return null;
  }

  private analyzeInteractionStyle(socialGraph: SocialGraph): string {
    const totalInteractions = Array.from(socialGraph.interactions.values()).reduce((a, b) => a + b, 0);
    const totalMentions = Array.from(socialGraph.mentions.values()).reduce((a, b) => a + b, 0);
    const totalRoasts = Array.from(socialGraph.roasts.values()).reduce((a, b) => a + b, 0);
    
    if (totalRoasts > totalInteractions * 0.3) {
      return 'roaster';
    } else if (totalMentions > totalInteractions * 0.5) {
      return 'conversationalist';
    } else {
      return 'balanced';
    }
  }

  private extractActiveHours(pattern: UserBehaviorPattern): number[] {
    // This would require timestamp analysis from messages
    // For now, return default peak hours
    return [14, 15, 16, 20, 21, 22]; // 2-4 PM and 8-10 PM
  }

  private getTopInteractions(socialGraph: SocialGraph, limit: number): Array<[string, number]> {
    return Array.from(socialGraph.interactions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  /**
   * Clear personality cache for a specific user
   */
  public clearUserPersonalityCache(userId: string): void {
    this.personalityCache.delete(userId);
  }

  /**
   * Clear all personality caches
   */
  public clearAllCaches(): void {
    this.personalityCache.clear();
  }
}