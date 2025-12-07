/**
 * @file Shared types for context management services
 * @module services/context/types
 */

export interface ContextItem {
  content: string;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  relevanceScore?: number;
  importanceScore?: number;
  semanticHash?: string;
}

export interface RichContext {
  conversations: Map<string, string[]>;
  codeSnippets: Map<string, ContextItem[]>;
  embarrassingMoments: ContextItem[];
  runningGags: ContextItem[];
  lastRoasted: Map<string, Date>;
  approximateSize: number;
  lastSizeUpdate: number;
  // Enhanced context features
  summarizedFacts: ContextItem[];
  crossServerEnabled: boolean;
  compressionRatio: number;
  lastSummarization: number;
  // Social dynamics tracking
  socialGraph: Map<string, SocialGraph>;
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


export interface SocialGraph {
  interactions: Map<string, number>;
  mentions: Map<string, number>;
  roasts: Map<string, number>;
  lastInteraction: Map<string, Date>;
}

export interface ServerCulture {
  guildId: string;
  popularEmojis: Array<{emoji: string, count: number}>;
  activeVoiceChannels: string[];
  recentEvents: Array<{name: string, date: Date}>;
  boostLevel: number;
  topChannels: Array<{name: string, messageCount: number}>;
  preferredLocale: string;
  cachedAt: number;
  ttl: number;
}