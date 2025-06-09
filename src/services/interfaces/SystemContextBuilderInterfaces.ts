/**
 * System Context Builder Service Interface Definitions
 * 
 * Interfaces for building system context and message context.
 */

import type { Guild, GuildMember, Client } from 'discord.js';
import type { MessageContext } from '../../commands';
import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// System Context Builder Service Interfaces
// ============================================================================

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
  /**
   * Sets the Discord client for context awareness
   */
  setDiscordClient(client: Client): void;
  
  /**
   * Builds server culture context
   */
  buildServerCultureContext(guild: Guild): string;
  
  /**
   * Builds Discord user context
   */
  buildDiscordUserContext(member: GuildMember): string;
  
  /**
   * Builds message context
   */
  buildMessageContext(messageContext: MessageContext): string;
  
  /**
   * Builds system context
   */
  buildSystemContext(
    systemContext: SystemContextData,
    includeWhenUnderLoad?: boolean
  ): string;
  
  /**
   * Builds date context
   */
  buildDateContext(): string;
}