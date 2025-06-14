/**
 * User Insight Generator Module
 * 
 * Handles analysis algorithms, report generation, and insight creation.
 * Responsible for:
 * - API-based analysis processing
 * - Roast generation with behavioral patterns
 * - Topic, style, and interest extraction
 * - Report formatting and visualization prep
 */

import type { User, GuildMember, Guild } from 'discord.js';
import type { 
  ApiAnalysisResult,
  UserAnalysisResult
} from '../../interfaces/UserAnalysisInterfaces';
import type { IAIService } from '../../interfaces/AIServiceInterfaces';
import type { LocalAnalysisResult } from '../../../utils/localUserAnalyzer';
import type { MessageBatch } from './UserMetricsCollector';
import { logger } from '../../../utils/logger';
import { topicRoasts, styleRoasts, interestRoasts } from './roastDictionaries';

export interface BatchAnalysis {
  topics: string[];
  style: string;
  interests: string[];
  patterns: string[];
}

export interface InsightConfig {
  enableRoasting: boolean;
  maxTopicsToDisplay: number;
  maxInterestsToDisplay: number;
}

/**
 * Generates insights and analysis from user behavior data
 */
export class UserInsightGenerator {
  private config: InsightConfig;

  constructor(config: InsightConfig) {
    this.config = config;
  }

  /**
   * Performs API analysis on message batches
   */
  async performApiAnalysis(
    batches: MessageBatch[],
    targetUser: User,
    aiService: IAIService,
    requestingUserId: string,
    guildId?: string,
    member?: GuildMember,
    guild?: Guild,
    analysisId?: string
  ): Promise<ApiAnalysisResult> {
    const batchAnalyses: BatchAnalysis[] = [];
    let successfulBatches = 0;

    // Process each batch
    for (const batch of batches) {
      const batchPrompt = this.createBatchAnalysisPrompt(targetUser.username, batch.messages);
      
      try {
        const batchResponse = await aiService.generateResponse(
          batchPrompt,
          requestingUserId,
          guildId,
          undefined,
          undefined,
          member,
          guild
        );
        
        const parsedBatch = this.parseBatchResponse(batchResponse, batch.batchNumber);
        if (this.isBatchAnalysisValid(parsedBatch)) {
          batchAnalyses.push(parsedBatch);
          successfulBatches++;
        } else {
          logger.warn(`Batch ${batch.batchNumber} returned invalid data`, { analysisId });
        }
      } catch (batchError) {
        logger.warn(`Failed to analyze batch ${batch.batchNumber}`, { analysisId, error: batchError });
      }
    }

    if (batchAnalyses.length === 0) {
      throw new Error('No batch analyses succeeded');
    }

    // Combine all batch results
    const combinedResult = this.combineBatchAnalyses(batchAnalyses);
    
    return {
      ...combinedResult,
      batchesProcessed: batches.length,
      batchSuccessRate: successfulBatches / batches.length
    };
  }

  /**
   * Generates a roast summary based on analysis results
   */
  generateRoastSummary(
    analysisResult: UserAnalysisResult,
    targetUser: User,
    isLocalOnly: boolean
  ): string {
    if (!this.config.enableRoasting) {
      return this.generateNeutralSummary(analysisResult, targetUser);
    }

    try {
      const { localAnalysis, apiAnalysis } = analysisResult;
      
      if (isLocalOnly || !apiAnalysis) {
        // Generate local-only roast
        return this.generateLocalRoast(localAnalysis, targetUser.username);
      } else {
        // Generate enhanced roast with API insights
        return this.generateEnhancedRoast(analysisResult, targetUser);
      }
    } catch (error) {
      logger.error('Error generating roast summary:', error);
      return `Unable to generate analysis for ${targetUser.username} due to processing error.`;
    }
  }

  /**
   * Creates analysis prompt for a batch of messages
   */
  private createBatchAnalysisPrompt(username: string, messages: string[]): string {
    return `Analyze ${username}'s messages. Extract ONLY:

TOPICS: (list 3-5 main subjects they discuss)
STYLE: (1 line describing how they communicate)
INTERESTS: (list 3-5 things they're interested in)

Messages:
${messages.join('\n')}

Be EXTREMELY concise. Just facts, no fluff.`;
  }

  /**
   * Parses AI response into structured batch analysis
   */
  private parseBatchResponse(batchResponse: string, batchNumber: number): BatchAnalysis {
    const lines = batchResponse.split('\n').filter(line => line.trim());
    const batchAnalysis: BatchAnalysis = {
      topics: [],
      style: '',
      interests: [],
      patterns: []
    };
    
    let currentSection = '';
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Check for section headers
      if (lowerLine.includes('main topic') || lowerLine.includes('topic')) {
        currentSection = 'topics';
        continue;
      } else if (lowerLine.includes('communication style') || lowerLine.includes('style')) {
        currentSection = 'style';
        continue;
      } else if (lowerLine.includes('interest')) {
        currentSection = 'interests';
        continue;
      } else if (lowerLine.includes('pattern')) {
        currentSection = 'patterns';
        continue;
      }
      
      // Extract content - handle various formats
      let cleanLine = line.trim();
      cleanLine = cleanLine.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
      
      // Skip empty lines or section headers
      if (!cleanLine || cleanLine.endsWith(':')) continue;
      
      // Add to appropriate section
      if (currentSection === 'topics' && cleanLine) {
        batchAnalysis.topics.push(cleanLine);
      } else if (currentSection === 'style' && cleanLine && !batchAnalysis.style) {
        batchAnalysis.style = cleanLine;
      } else if (currentSection === 'interests' && cleanLine) {
        batchAnalysis.interests.push(cleanLine);
      } else if (currentSection === 'patterns' && cleanLine) {
        batchAnalysis.patterns.push(cleanLine);
      }
    }
    
    logger.debug(`Batch ${batchNumber} analysis extracted:`, {
      topics: batchAnalysis.topics.length,
      hasStyle: !!batchAnalysis.style,
      interests: batchAnalysis.interests.length
    });
    
    return batchAnalysis;
  }

  /**
   * Validates batch analysis results
   */
  private isBatchAnalysisValid(batchAnalysis: BatchAnalysis): boolean {
    return batchAnalysis.topics.length > 0 || 
           !!batchAnalysis.style || 
           batchAnalysis.interests.length > 0;
  }

  /**
   * Combines multiple batch analyses into a single result
   */
  private combineBatchAnalyses(batchAnalyses: BatchAnalysis[]): {
    topics: string[];
    communicationStyle: string;
    interests: string[];
    patterns: string[];
  } {
    const allTopics = new Map<string, { original: string; count: number }>();
    const allInterests = new Map<string, { original: string; count: number }>();
    const allPatterns = new Set<string>();
    const styleDescriptions: string[] = [];
    
    // Aggregate data from all batches
    for (const batch of batchAnalyses) {
      // Count topic frequency - store original casing
      batch.topics.forEach(topic => {
        const normalizedTopic = topic.toLowerCase().trim();
        if (!allTopics.has(normalizedTopic)) {
          allTopics.set(normalizedTopic, { original: topic, count: 1 });
        } else {
          const existing = allTopics.get(normalizedTopic)!;
          existing.count++;
        }
      });
      
      // Count interest frequency - store original casing
      batch.interests.forEach(interest => {
        const normalizedInterest = interest.toLowerCase().trim();
        if (!allInterests.has(normalizedInterest)) {
          allInterests.set(normalizedInterest, { original: interest, count: 1 });
        } else {
          const existing = allInterests.get(normalizedInterest)!;
          existing.count++;
        }
      });
      
      // Collect unique patterns
      batch.patterns.forEach(pattern => allPatterns.add(pattern));
      
      // Collect style descriptions
      if (batch.style) styleDescriptions.push(batch.style);
    }
    
    // Sort by frequency and get top items - preserve original casing
    const topTopics = Array.from(allTopics.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, this.config.maxTopicsToDisplay)
      .map(([, data]) => data.original);
    
    const topInterests = Array.from(allInterests.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, this.config.maxInterestsToDisplay)
      .map(([, data]) => data.original);
    
    // Synthesize communication style from multiple descriptions
    const communicationStyle = styleDescriptions.length > 0 
      ? styleDescriptions[0] + (styleDescriptions.length > 1 ? ` (varies across ${batchAnalyses.length} batches)` : '')
      : 'Active participant';
    
    return {
      topics: topTopics,
      communicationStyle,
      interests: topInterests,
      patterns: Array.from(allPatterns)
    };
  }

  /**
   * Generates a local-only roast
   */
  private generateLocalRoast(localAnalysis: LocalAnalysisResult, username: string): string {
    // Delegate to local analyzer for consistency
    const localRoast = `Analysis of ${username}: ` +
      `${localAnalysis.messageCount} messages analyzed locally\n` +
      `Peak activity: ${localAnalysis.mostActiveHours[0]?.hour || 'Unknown'}:00\n` +
      `Top words: ${localAnalysis.topWords.slice(0, 5).map(w => w.word).join(', ') || 'None'}\n` +
      `Questions asked: ${localAnalysis.questionCount}\n\n` +
      '*This roast was generated instantly without API calls.*';
    
    return localRoast;
  }

  /**
   * Generates an enhanced roast with API insights
   */
  private generateEnhancedRoast(analysisResult: UserAnalysisResult, targetUser: User): string {
    const { localAnalysis, apiAnalysis, metrics } = analysisResult;
    
    if (!apiAnalysis) {
      throw new Error('Cannot generate enhanced roast without API analysis');
    }

    const roastLines: string[] = [];
    
    // Opening roast
    roastLines.push(`Oh look, it's ${targetUser.username}...`);
    
    // Main topics with integrated roasting
    if (apiAnalysis.topics.length > 0) {
      const roastedTopics = apiAnalysis.topics.slice(0, 5).map(topic => {
        const lowerTopic = topic.toLowerCase();
        for (const [key, roast] of Object.entries(topicRoasts)) {
          if (lowerTopic.includes(key)) {
            return `${topic} ${roast}`;
          }
        }
        return `${topic} seriously?`;
      });
      
      roastLines.push(`**Main Topics:** ${roastedTopics.join(', ')}`);
    } else {
      roastLines.push('**Main Topics:** absolutely nothing of fucking value');
    }
    
    // Style with integrated roasting
    if (apiAnalysis.communicationStyle) {
      let styledRoast = apiAnalysis.communicationStyle;
      const styleWords = apiAnalysis.communicationStyle.toLowerCase().split(' ');
      
      for (const [key, roast] of Object.entries(styleRoasts)) {
        if (styleWords.some(word => word.includes(key))) {
          styledRoast = `${apiAnalysis.communicationStyle} ${roast}`;
          break;
        }
      }
      
      roastLines.push(`**Style:** ${styledRoast}`);
    } else {
      roastLines.push('**Style:** Undefined communication style probably just keyboard mashing');
    }
    
    // Interests with integrated roasting
    if (apiAnalysis.interests.length > 0) {
      const roastedInterests = apiAnalysis.interests.slice(0, 5).map(interest => {
        const lowerInterest = interest.toLowerCase();
        for (const [key, roast] of Object.entries(interestRoasts)) {
          if (lowerInterest.includes(key)) {
            return `${interest} ${roast}`;
          }
        }
        return `${interest} weird flex but ok`;
      });
      
      roastLines.push(`**Interests:** ${roastedInterests.join(', ')}`);
    } else {
      roastLines.push('**Interests:** apparently nothing fucking interesting boring ass person alert');
    }
    
    // Summary roast based on all the data
    const summaryParts = [];
    
    if (localAnalysis.messageCount > 50) {
      summaryParts.push(`${localAnalysis.messageCount} messages of pure fucking spam`);
    } else if (localAnalysis.messageCount < 10) {
      summaryParts.push(`only ${localAnalysis.messageCount} messages even lurkers contribute more`);
    } else {
      summaryParts.push(`${localAnalysis.messageCount} messages`);
    }
    
    if (apiAnalysis.topics.length > 0) {
      summaryParts.push(`mostly about ${apiAnalysis.topics[0].toLowerCase()}`);
    }
    
    if (apiAnalysis.batchesProcessed > 1) {
      summaryParts.push(`had to analyze in ${apiAnalysis.batchesProcessed} batches because there was so much noise`);
    }
    
    roastLines.push(`\nBased on ${summaryParts.join(' ')}: ${targetUser.username} is that person who ${
      apiAnalysis.topics.some(t => t.toLowerCase().includes('question')) 
        ? 'treats Discord like their personal fucking Google' 
        : apiAnalysis.topics.some(t => t.toLowerCase().includes('bot'))
          ? 'has more conversations with bots than humans'
          : apiAnalysis.topics.some(t => t.toLowerCase().includes('help'))
            ? 'needs help with literally every goddamn thing'
            : 'somehow makes every conversation worse'
    }.`);
    
    // Final summary - combine local and API insights
    const roastSummary = roastLines.join('\n') + 
      `\n\n**Deep Analysis of ${targetUser.username}'s messages** (${localAnalysis.messageCount} messages analyzed)\n` +
      `*${metrics.interestingMessages} messages required deeper analysis*\n\n` +
      '*This enhanced roast used hybrid analysis to save API calls.*';
    
    return roastSummary;
  }

  /**
   * Generates a neutral summary without roasting
   */
  private generateNeutralSummary(analysisResult: UserAnalysisResult, targetUser: User): string {
    const { localAnalysis, apiAnalysis } = analysisResult;
    
    const summaryLines: string[] = [];
    summaryLines.push(`**Analysis Summary for ${targetUser.username}**`);
    summaryLines.push(`Messages analyzed: ${localAnalysis.messageCount}`);
    
    if (localAnalysis.mostActiveHours[0]) {
      summaryLines.push(`Most active hour: ${localAnalysis.mostActiveHours[0].hour}:00`);
    }
    
    if (localAnalysis.topWords.length > 0) {
      summaryLines.push(`Top words: ${localAnalysis.topWords.slice(0, 5).map(w => w.word).join(', ')}`);
    }
    
    if (apiAnalysis && apiAnalysis.topics.length > 0) {
      summaryLines.push(`Main topics: ${apiAnalysis.topics.slice(0, 5).join(', ')}`);
    }
    
    if (apiAnalysis && apiAnalysis.communicationStyle) {
      summaryLines.push(`Communication style: ${apiAnalysis.communicationStyle}`);
    }
    
    summaryLines.push(`Questions asked: ${localAnalysis.questionCount}`);
    summaryLines.push(`Average words per message: ${localAnalysis.avgWordsPerMessage}`);
    
    return summaryLines.join('\n');
  }
}
