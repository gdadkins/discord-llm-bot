/**
 * Type definitions for Discord extensions
 */

import { Client } from 'discord.js';
import { IContextManager } from '../services/interfaces';

export interface DiscordStorageStats {
  estimatedSizeMB: number;
  cacheEntries: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  serverBreakdown: Map<string, number>;
}

export interface ExtendedClient extends Client {
  contextManager?: IContextManager & {
    getDiscordDataStorageStats: () => Promise<DiscordStorageStats>;
  };
}