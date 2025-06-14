import type { Client, Guild } from 'discord.js';
import type { MessageContext } from '../commands';
import type { IService, ServiceHealthStatus } from './interfaces';
import { logger } from '../utils/logger';

export interface SystemContextData {
  queuePosition: number;
  apiQuota: {
    remaining: number;
    limit: number;
  };
  botLatency: number;
  memoryUsage: {
    totalMemoryUsage: number;
  };
  activeConversations: number;
  rateLimitStatus: {
    rpm: {
      current: number;
      limit: number;
      resetsAt: number;
    };
    daily: {
      current: number;
      limit: number;
      resetsAt: number;
    };
  };
}

export interface ISystemContextBuilder extends IService {
  buildSystemContext(
    systemContext: SystemContextData,
    includeWhenUnderLoad?: boolean
  ): string;
  
  buildMessageContext(messageContext: MessageContext): string;
  
  buildServerCultureContext(guild: Guild): string;
  
  buildDateContext(): string;
  
  setDiscordClient(client: Client): void;
}

export class SystemContextBuilder implements ISystemContextBuilder {
  private discordClient?: Client;

  async initialize(): Promise<void> {
    logger.info('SystemContextBuilder initialized');
  }

  async shutdown(): Promise<void> {
    this.discordClient = undefined;
    logger.info('SystemContextBuilder shutdown complete');
  }

  getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: true,
      name: 'SystemContextBuilder',
      errors: [],
      metrics: {
        hasDiscordClient: !!this.discordClient
      }
    };
  }

  setDiscordClient(client: Client): void {
    this.discordClient = client;
    logger.info('Discord client set for system context awareness');
  }

  buildSystemContext(
    systemContext: SystemContextData,
    includeWhenUnderLoad: boolean = true
  ): string {
    // Include system context in prompt when system is under load or when requested
    if (!includeWhenUnderLoad || 
        (systemContext.queuePosition <= 5 && systemContext.apiQuota.remaining >= 100)) {
      return '';
    }

    const contextParts: string[] = ['\n\nSystem Status:'];
    
    contextParts.push(`- Currently handling ${systemContext.queuePosition} requests`);
    contextParts.push(`- API quota: ${systemContext.apiQuota.remaining}/${systemContext.apiQuota.limit} remaining`);
    
    if (systemContext.botLatency > 0) {
      contextParts.push(`- Bot latency: ${systemContext.botLatency}ms`);
    }
    
    contextParts.push(`- Active conversations: ${systemContext.activeConversations}`);
    contextParts.push(
      `- Memory usage: ${(systemContext.memoryUsage.totalMemoryUsage / 1024 / 1024).toFixed(1)}MB`
    );

    return contextParts.join('\n');
  }

  buildMessageContext(messageContext: MessageContext): string {
    const contextParts: string[] = ['\n\nChannel context:'];
    
    contextParts.push(`- Channel: ${messageContext.channelName} (${messageContext.channelType})`);
    
    if (messageContext.isThread) {
      contextParts.push(`- This is a thread: ${messageContext.threadName}`);
    }
    
    contextParts.push(`- Last activity: ${messageContext.lastActivity.toLocaleString()}`);
    
    if (messageContext.pinnedCount > 0) {
      contextParts.push(`- Pinned messages: ${messageContext.pinnedCount}`);
    }
    
    if (messageContext.attachments.length > 0) {
      contextParts.push(`- User attached: ${messageContext.attachments.join(', ')}`);
    }
    
    if (messageContext.recentEmojis.length > 0) {
      contextParts.push(
        `- Recent emojis used: ${messageContext.recentEmojis.slice(0, 10).join(' ')}`
      );
    }

    return contextParts.join('\n');
  }


  buildServerCultureContext(guild: Guild): string {
    const contextParts: string[] = [];
    
    contextParts.push('\n\nServer Context:');
    contextParts.push(`- Server: ${guild.name}`);
    contextParts.push(`- Member count: ${guild.memberCount}`);
    
    // Server age
    const serverAge = Date.now() - guild.createdTimestamp;
    const serverDays = Math.floor(serverAge / (1000 * 60 * 60 * 24));
    contextParts.push(`- Server age: ${serverDays} days`);
    
    // Boost info
    if (guild.premiumSubscriptionCount && guild.premiumSubscriptionCount > 0) {
      contextParts.push(
        `- Boost level: ${guild.premiumTier} (${guild.premiumSubscriptionCount} boosts)`
      );
    }
    
    // Features
    const notableFeatures = guild.features.filter(feature => 
      ['COMMUNITY', 'VERIFIED', 'PARTNERED', 'DISCOVERABLE'].includes(feature)
    );
    
    if (notableFeatures.length > 0) {
      contextParts.push(`- Features: ${notableFeatures.join(', ')}`);
    }
    
    // Channel count (rough estimate)
    const channelCount = guild.channels.cache.size;
    if (channelCount > 0) {
      contextParts.push(`- Channels: ${channelCount}`);
    }

    return contextParts.join('\n');
  }

  buildDateContext(): string {
    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long',
      day: 'numeric'
    });
    
    return `\n\nCurrent date: ${currentDate}`;
  }
}