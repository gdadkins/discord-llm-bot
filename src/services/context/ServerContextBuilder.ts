/**
 * @file ServerContextBuilder - Builds server-specific context
 * @module services/context/ServerContextBuilder
 * 
 * Handles the construction of server-wide context including culture,
 * channel dynamics, roles, and community-specific information.
 */

import { Guild, GuildChannel, Role, GuildBasedChannel, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger';
import { RichContext, ServerCulture, ContextItem } from './types';
import { ChannelContextService } from './ChannelContextService';
import { ConversationMemoryService } from './ConversationMemoryService';

export interface ServerContextOptions {
  includeChannels?: boolean;
  includeRoles?: boolean;
  includeCulture?: boolean;
  includeRunningGags?: boolean;
  maxItems?: number;
}

/**
 * Specialized builder for server-specific context
 * 
 * This builder is responsible for:
 * - Extracting server culture and community dynamics
 * - Building channel-specific context
 * - Analyzing role hierarchies and permissions
 * - Managing server-wide running gags and memes
 */
export class ServerContextBuilder {
  private readonly DEFAULT_MAX_ITEMS = 10;
  private readonly CULTURE_CACHE_TTL = 3600000; // 1 hour
  
  private channelContextService: ChannelContextService;
  private conversationMemoryService: ConversationMemoryService;
  private serverCultureCache: Map<string, { culture: ServerCulture; timestamp: number }> = new Map();

  constructor(
    channelContextService: ChannelContextService,
    conversationMemoryService: ConversationMemoryService
  ) {
    this.channelContextService = channelContextService;
    this.conversationMemoryService = conversationMemoryService;
  }

  /**
   * Build comprehensive server context
   */
  public buildServerContext(
    guild: Guild,
    context: RichContext,
    options: ServerContextOptions = {}
  ): string {
    const parts: string[] = [];
    
    // Add server header
    parts.push(`=== Server Context: ${guild.name} ===\n\n`);
    
    // Add server culture if requested
    if (options.includeCulture !== false) {
      const cultureContext = this.buildServerCultureContext(guild);
      if (cultureContext) {
        parts.push(cultureContext);
      }
    }
    
    // Add channel context if requested
    if (options.includeChannels !== false) {
      const channelContext = this.buildChannelContext(guild, options.maxItems);
      if (channelContext) {
        parts.push(channelContext);
      }
    }
    
    // Add role context if requested
    if (options.includeRoles !== false) {
      const roleContext = this.buildRoleContext(guild);
      if (roleContext) {
        parts.push(roleContext);
      }
    }
    
    // Add running gags if requested
    if (options.includeRunningGags !== false && context) {
      const gagsContext = this.buildRunningGagsContext(context, options.maxItems);
      if (gagsContext) {
        parts.push(gagsContext);
      }
    }
    
    return parts.join('');
  }

  /**
   * Build server culture context with caching
   */
  public buildServerCultureContext(guild: Guild): string {
    // Check cache first
    const cached = this.serverCultureCache.get(guild.id);
    if (cached && Date.now() - cached.timestamp < this.CULTURE_CACHE_TTL) {
      return this.formatServerCulture(cached.culture);
    }
    
    // Build fresh culture context
    const culture = this.extractServerCulture(guild);
    
    // Cache the result
    this.serverCultureCache.set(guild.id, {
      culture,
      timestamp: Date.now()
    });
    
    return this.formatServerCulture(culture);
  }

  /**
   * Build channel-specific context
   */
  public buildChannelContext(guild: Guild, maxChannels: number = 5): string {
    const parts: string[] = ['ACTIVE CHANNELS:\n'];
    
    // Get text channels sorted by activity
    const textChannels = Array.from(guild.channels.cache.values())
      .filter(channel => channel.type === ChannelType.GuildText)
      .sort((a, b) => {
        // Sort by position (lower = higher priority)
        const aPos = 'position' in a ? a.position : 0;
        const bPos = 'position' in b ? b.position : 0;
        return aPos - bPos;
      })
      .slice(0, maxChannels);
    
    textChannels.forEach(channel => {
      const channelInfo = this.analyzeChannel(channel as GuildChannel);
      parts.push(`- #${channel.name}: ${channelInfo}\n`);
    });
    
    parts.push('\n');
    return parts.join('');
  }

  /**
   * Build role hierarchy context
   */
  public buildRoleContext(guild: Guild): string {
    const parts: string[] = ['SERVER ROLES & HIERARCHY:\n'];
    
    // Get roles sorted by position (highest first)
    const roles = Array.from(guild.roles.cache.values())
      .filter(role => !role.managed && role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .slice(0, 10);
    
    roles.forEach(role => {
      const roleInfo = this.analyzeRole(role);
      parts.push(`- ${role.name}: ${roleInfo}\n`);
    });
    
    parts.push('\n');
    return parts.join('');
  }

  /**
   * Build running gags context
   */
  public buildRunningGagsContext(context: RichContext, maxGags?: number): string {
    if (!context.runningGags || context.runningGags.length === 0) {
      return '';
    }
    
    const parts: string[] = ['SERVER RUNNING GAGS & MEMES:\n'];
    const limit = maxGags || this.DEFAULT_MAX_ITEMS;
    
    // Sort by access count and recency
    const topGags = context.runningGags
      .sort((a, b) => {
        const scoreA = a.accessCount + (1 / (Date.now() - a.timestamp));
        const scoreB = b.accessCount + (1 / (Date.now() - b.timestamp));
        return scoreB - scoreA;
      })
      .slice(0, limit);
    
    topGags.forEach(gag => {
      parts.push(`- ${gag.content}\n`);
    });
    
    parts.push('\n');
    return parts.join('');
  }

  /**
   * Extract community patterns and behavior
   */
  public extractCommunityPatterns(
    guild: Guild,
    context: RichContext
  ): string[] {
    const patterns: string[] = [];
    
    // Member count patterns
    const memberCount = guild.memberCount;
    if (memberCount < 100) {
      patterns.push('Small, tight-knit community');
    } else if (memberCount < 1000) {
      patterns.push('Medium-sized active community');
    } else {
      patterns.push('Large, diverse community');
    }
    
    // Boost level indicates engagement
    if (guild.premiumTier > 0) {
      patterns.push(`Highly engaged (Boost Level ${guild.premiumTier})`);
    }
    
    // Activity patterns from context
    if (context.embarrassingMoments.length > 50) {
      patterns.push('High roasting culture');
    }
    
    if (context.codeSnippets.size > 10) {
      patterns.push('Technical/programming focused');
    }
    
    // Channel patterns
    const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
    if (voiceChannels > 5) {
      patterns.push('Voice-chat oriented');
    }
    
    return patterns;
  }

  /**
   * Analyze server events and milestones
   */
  public analyzeServerEvents(guild: Guild): string {
    const events: string[] = [];
    
    // Server age
    const ageInDays = Math.floor((Date.now() - guild.createdTimestamp) / (1000 * 60 * 60 * 24));
    if (ageInDays < 30) {
      events.push('Newly created server');
    } else if (ageInDays < 365) {
      events.push(`Established ${Math.floor(ageInDays / 30)} months ago`);
    } else {
      events.push(`Veteran server (${Math.floor(ageInDays / 365)} years old)`);
    }
    
    // Recent server updates
    if (guild.features.includes('COMMUNITY')) {
      events.push('Community server with discovery features');
    }
    
    if (guild.features.includes('PARTNERED')) {
      events.push('Discord Partner server');
    }
    
    if (guild.verified) {
      events.push('Verified server');
    }
    
    return events.join(', ');
  }

  // ========== PRIVATE HELPER METHODS ==========

  private extractServerCulture(guild: Guild): ServerCulture {
    // Get popular emojis
    const popularEmojis = Array.from(guild.emojis.cache.values())
      .map(emoji => ({
        emoji: emoji.toString(),
        count: 0 // Would need message analysis for actual counts
      }))
      .slice(0, 10);
    
    // Get active voice channels
    const activeVoiceChannels = Array.from(guild.channels.cache.values())
      .filter(channel => channel.type === ChannelType.GuildVoice)
      .map(channel => channel.name)
      .slice(0, 5);
    
    // Get top channels by position
    const topChannels = Array.from(guild.channels.cache.values())
      .filter(channel => channel.type === ChannelType.GuildText)
      .sort((a, b) => {
        const aPos = 'position' in a ? a.position : 0;
        const bPos = 'position' in b ? b.position : 0;
        return aPos - bPos;
      })
      .slice(0, 5)
      .map(channel => ({
        name: channel.name,
        messageCount: 0 // Would need analysis for actual counts
      }));
    
    return {
      guildId: guild.id,
      popularEmojis,
      activeVoiceChannels,
      recentEvents: [], // Would need event tracking
      boostLevel: guild.premiumTier,
      topChannels,
      preferredLocale: guild.preferredLocale,
      cachedAt: Date.now(),
      ttl: this.CULTURE_CACHE_TTL
    };
  }

  private formatServerCulture(culture: ServerCulture): string {
    const parts: string[] = ['SERVER CULTURE:\n'];
    
    // Server characteristics
    parts.push(`- Boost Level: ${culture.boostLevel}\n`);
    parts.push(`- Locale: ${culture.preferredLocale}\n`);
    
    // Popular channels
    if (culture.topChannels.length > 0) {
      parts.push('- Top Channels: ');
      parts.push(culture.topChannels.map(c => `#${c.name}`).join(', '));
      parts.push('\n');
    }
    
    // Voice activity
    if (culture.activeVoiceChannels.length > 0) {
      parts.push('- Voice Channels: ');
      parts.push(culture.activeVoiceChannels.join(', '));
      parts.push('\n');
    }
    
    // Emojis
    if (culture.popularEmojis.length > 0) {
      parts.push('- Popular Emojis: ');
      parts.push(culture.popularEmojis.map(e => e.emoji).slice(0, 5).join(' '));
      parts.push('\n');
    }
    
    parts.push('\n');
    return parts.join('');
  }

  private analyzeChannel(channel: GuildChannel): string {
    const details: string[] = [];
    
    // Channel type and category
    if (channel.parent) {
      details.push(`in ${channel.parent.name}`);
    }
    
    // Topic or description
    if ('topic' in channel && channel.topic && typeof channel.topic === 'string') {
      details.push(`"${channel.topic.substring(0, 50)}..."`);
    }
    
    // Special channel indicators
    if (channel.name.includes('general') || channel.name.includes('chat')) {
      details.push('main chat');
    } else if (channel.name.includes('help') || channel.name.includes('support')) {
      details.push('support channel');
    } else if (channel.name.includes('bot') || channel.name.includes('command')) {
      details.push('bot channel');
    }
    
    return details.join(', ') || 'general discussion';
  }

  private analyzeRole(role: Role): string {
    const permissions: string[] = [];
    
    // Check key permissions
    if (role.permissions.has('Administrator')) {
      permissions.push('Admin');
    } else if (role.permissions.has('ModerateMembers')) {
      permissions.push('Moderator');
    } else if (role.permissions.has('ManageMessages')) {
      permissions.push('Helper');
    }
    
    // Member count
    const memberCount = role.members.size;
    if (memberCount > 0) {
      permissions.push(`${memberCount} members`);
    }
    
    // Color indicator
    if (role.color) {
      permissions.push(`color: ${role.hexColor}`);
    }
    
    return permissions.join(', ') || 'member role';
  }

  /**
   * Clear culture cache for a specific server
   */
  public clearServerCultureCache(guildId: string): void {
    this.serverCultureCache.delete(guildId);
  }

  /**
   * Clear all culture caches
   */
  public clearAllCaches(): void {
    this.serverCultureCache.clear();
  }
}