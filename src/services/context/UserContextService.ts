/**
 * @file UserContextService - Manages Discord user profiles and contexts
 * @module services/context/UserContextService
 */

import { GuildMember } from 'discord.js';
import { logger } from '../../utils/logger';
import { DiscordUserContext } from './types';

export class UserContextService {
  private discordUserContextCache: Map<string, DiscordUserContext> = new Map();
  private readonly DISCORD_CONTEXT_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year
  private readonly MAX_DISCORD_CACHE_ENTRIES = 10000;

  /**
   * Build Discord user context from a GuildMember
   */
  public buildDiscordUserContext(member: GuildMember, includeServerData: boolean = false): string {
    const userId = member.id;
    const cacheKey = `${member.guild.id}-${userId}`;
    
    // Check cache first
    const cached = this.discordUserContextCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < this.DISCORD_CONTEXT_TTL) {
      return this.formatDiscordContextAsString(cached, includeServerData);
    }
    
    // Build new context
    const context: DiscordUserContext = {
      username: member.user.username,
      displayName: member.displayName || member.user.username,
      joinedAt: member.joinedAt || new Date(),
      accountAge: member.user.createdAt,
      roles: member.roles.cache
        .filter(role => role.name !== '@everyone')
        .map(role => role.name)
        .slice(0, 10), // Limit to 10 most important roles
      nitroStatus: member.premiumSince !== null,
      presence: member.presence ? {
        status: member.presence.status,
        activities: member.presence.activities
          .map(activity => `${activity.type}: ${activity.name}`)
          .slice(0, 5) // Limit activities
      } : undefined,
      permissions: {
        isAdmin: member.permissions.has('Administrator'),
        isModerator: member.permissions.has('ManageMessages') || 
                     member.permissions.has('KickMembers') ||
                     member.permissions.has('BanMembers'),
        canManageMessages: member.permissions.has('ManageMessages')
      },
      cachedAt: Date.now(),
      ttl: this.DISCORD_CONTEXT_TTL
    };
    
    // Cache the context
    this.discordUserContextCache.set(cacheKey, context);
    
    // Clean up old cache entries periodically
    if (this.discordUserContextCache.size > 100) {
      this.cleanupDiscordContextCache();
    }
    
    return this.formatDiscordContextAsString(context, includeServerData);
  }

  /**
   * Format Discord user context as a human-readable string
   */
  private formatDiscordContextAsString(context: DiscordUserContext, includeServerData: boolean = false): string {
    const parts: string[] = ['DISCORD USER CONTEXT:\n'];
    
    // Basic info
    parts.push(`Username: ${context.username} (Display: ${context.displayName})`);
    
    // Account age
    const accountAgeDays = Math.floor((Date.now() - context.accountAge.getTime()) / (1000 * 60 * 60 * 24));
    if (includeServerData) {
      const joinedDays = Math.floor((Date.now() - context.joinedAt.getTime()) / (1000 * 60 * 60 * 24));
      parts.push(`Account Age: ${accountAgeDays} days | Server Member: ${joinedDays} days`);
    } else {
      parts.push(`Account Age: ${accountAgeDays} days`);
    }
    
    // Nitro status
    if (context.nitroStatus) {
      parts.push('Nitro Subscriber: Yes');
    }
    
    // Roles (important for context)
    if (context.roles.length > 0) {
      parts.push(`Roles: ${context.roles.join(', ')}`);
    }
    
    // Permissions summary
    const perms: string[] = [];
    if (context.permissions.isAdmin) perms.push('Admin');
    if (context.permissions.isModerator) perms.push('Moderator');
    if (perms.length > 0) {
      parts.push(`Permissions: ${perms.join(', ')}`);
    }
    
    // Presence (if available)
    if (context.presence) {
      parts.push(`Status: ${context.presence.status}`);
      if (context.presence.activities.length > 0) {
        parts.push(`Activities: ${context.presence.activities.join(', ')}`);
      }
    }
    
    return parts.join('\n') + '\n';
  }

  /**
   * Clean up old Discord context cache entries
   */
  private cleanupDiscordContextCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    
    for (const [key, context] of this.discordUserContextCache.entries()) {
      if (now - context.cachedAt > this.DISCORD_CONTEXT_TTL) {
        entriesToDelete.push(key);
      }
    }
    
    entriesToDelete.forEach(key => this.discordUserContextCache.delete(key));
    
    if (entriesToDelete.length > 0) {
      logger.info(`Cleaned up ${entriesToDelete.length} expired Discord context cache entries`);
    }
  }

  /**
   * Get Discord data storage statistics
   */
  public getDiscordDataStorageStats(): {
    cacheEntries: number;
    estimatedSizeBytes: number;
    estimatedSizeMB: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    serverBreakdown: Map<string, number>;
    } {
    let totalSize = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;
    const serverBreakdown = new Map<string, number>();
    
    // Calculate Discord context cache size
    this.discordUserContextCache.forEach((context, key) => {
      // Estimate size of each context object
      const contextSize = JSON.stringify(context).length;
      totalSize += contextSize;
      
      // Track timestamps
      if (context.cachedAt < oldestTimestamp) {
        oldestTimestamp = context.cachedAt;
      }
      if (context.cachedAt > newestTimestamp) {
        newestTimestamp = context.cachedAt;
      }
      
      // Server breakdown
      const serverId = key.split('-')[0];
      serverBreakdown.set(serverId, (serverBreakdown.get(serverId) || 0) + contextSize);
    });
    
    return {
      cacheEntries: this.discordUserContextCache.size,
      estimatedSizeBytes: totalSize,
      estimatedSizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
      oldestEntry: this.discordUserContextCache.size > 0 ? new Date(oldestTimestamp) : null,
      newestEntry: this.discordUserContextCache.size > 0 ? new Date(newestTimestamp) : null,
      serverBreakdown,
    };
  }

  /**
   * Clean up old Discord cache entries
   */
  public cleanupDiscordCache(maxAge: number = this.DISCORD_CONTEXT_TTL): number {
    const now = Date.now();
    let removed = 0;
    
    this.discordUserContextCache.forEach((context, key) => {
      if (now - context.cachedAt > maxAge) {
        this.discordUserContextCache.delete(key);
        removed++;
      }
    });
    
    return removed;
  }

  /**
   * Get cached Discord context for a user
   */
  public getCachedDiscordContext(guildId: string, userId: string): DiscordUserContext | null {
    const cacheKey = `${guildId}-${userId}`;
    const cached = this.discordUserContextCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.cachedAt) < this.DISCORD_CONTEXT_TTL) {
      return cached;
    }
    
    return null;
  }

  /**
   * Clear all caches
   */
  public cleanup(): void {
    this.discordUserContextCache.clear();
    logger.info('UserContextService cleanup completed');
  }
}