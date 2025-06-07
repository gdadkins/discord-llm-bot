// Context Manager Configuration
// Adjust these values based on your server's needs and storage constraints

export const contextConfig = {
  // Memory Limits (per server)
  limits: {
    embarrassingMoments: 60,      // Memorable user moments
    codeSnippetsPerUser: 12,      // Code examples per user
    runningGags: 30,              // Server-wide jokes/memes
    summarizedFacts: 50,          // Compressed knowledge
    socialInteractionsPerUser: 100, // Social graph entries
  },

  // Retention Policies (in milliseconds)
  retention: {
    discordProfileCache: 365 * 24 * 60 * 60 * 1000,  // 1 year (with small user base, storage is negligible)
    conversationHistory: 30 * 24 * 60 * 60 * 1000,   // 30 days
    socialDynamics: 365 * 24 * 60 * 60 * 1000,       // 1 year (tracks who talks to whom)
    embarrassingMoments: 365 * 24 * 60 * 60 * 1000,  // 1 year (truly never forget!)
    serverCulture: 365 * 24 * 60 * 60 * 1000,        // 1 year (server culture evolves slowly)
    behavioralPatterns: 365 * 24 * 60 * 60 * 1000,   // 1 year (behavioral insights are valuable long-term)
  },

  // Performance Tuning
  performance: {
    memoryCheckInterval: 5 * 60 * 1000,      // Check every 5 minutes
    summarizationInterval: 30 * 60 * 1000,   // Summarize every 30 minutes
    compressionTargetRatio: 0.6,             // Compress to 60% of original
    similarityThreshold: 0.8,                // Dedup threshold (0-1)
  },

  // Feature Toggles
  features: {
    enableCrossServerMemory: false,  // Share context across servers
    enableAutoSummarization: true,   // Compress old memories
    enableSemanticDedup: true,       // Remove similar content
    enableSocialTracking: true,      // Track user interactions
    persistToDisk: false,            // Save to disk (future feature)
  },

  // Advanced Settings
  advanced: {
    // Scoring weights for relevance calculation
    relevanceWeights: {
      recency: 0.3,      // How recent the memory is
      frequency: 0.2,    // How often it's accessed
      userSpecific: 0.3, // Contains user mentions
      keywords: 0.2,     // Contains important terms
    },
    
    // Keywords that increase importance score
    highImportanceKeywords: [
      'error', 'bug', 'crash', 'delete', 'password',
      'important', 'remember', 'never forget', 'always'
    ],
    
    // Maximum token budget for context
    maxContextTokens: 100000, // Adjust based on Gemini limits
  }
};

// Usage example:
// import { contextConfig } from './config/contextConfig';
// this.MAX_EMBARRASSING_MOMENTS = contextConfig.limits.embarrassingMoments;