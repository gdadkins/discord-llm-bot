/**
 * Large Context Handler Usage Examples
 * 
 * Demonstrates practical usage patterns for the large context handler utility.
 */

import { largeContextHandler, contextAnalyzer } from './index';
import { logger } from './logger';

/**
 * Example: Processing large conversation logs for summarization
 */
export async function summarizeLargeConversationLog(conversationLog: string): Promise<string> {
  await largeContextHandler.initialize();
  
  try {
    // Process the large conversation in chunks and summarize each
    const summary = await largeContextHandler.summarizeLargeContext(
      conversationLog,
      async (chunk: string) => {
        // Extract key points from each chunk
        const lines = chunk.split('\n').filter(line => line.trim());
        const messageCount = lines.filter(line => line.includes(': ')).length;
        const userCount = new Set(
          lines
            .map(line => line.match(/^(\w+):/)?.[1])
            .filter(Boolean)
        ).size;
        
        return `Chunk summary: ${messageCount} messages from ${userCount} users. Key topics discussed.`;
      }
    );
    
    logger.info('Large conversation summarized successfully');
    return summary;
  } catch (error) {
    logger.error('Failed to summarize large conversation', { error });
    throw error;
  }
}

/**
 * Example: Extracting user mentions from large chat logs
 */
export async function extractUserMentions(chatLog: string): Promise<string[]> {
  await largeContextHandler.initialize();
  
  try {
    const mentionArrays = await largeContextHandler.extractFromLargeContext(
      chatLog,
      async (chunk: string) => {
        // Extract @mentions from this chunk
        const mentions = chunk.match(/@\w+/g) || [];
        return mentions.map(mention => mention.slice(1)); // Remove @ symbol
      }
    );
    
    // Flatten and deduplicate mentions
    const allMentions = mentionArrays.flat();
    const uniqueMentions = Array.from(new Set(allMentions));
    
    logger.info(`Extracted ${uniqueMentions.length} unique user mentions`);
    return uniqueMentions;
  } catch (error) {
    logger.error('Failed to extract user mentions', { error });
    throw error;
  }
}

/**
 * Example: Processing large JSON data for specific field extraction
 */
export async function extractFieldsFromLargeJSON(
  jsonData: object, 
  fieldName: string
): Promise<unknown[]> {
  await largeContextHandler.initialize();
  
  try {
    const fieldValues = await largeContextHandler.extractFromLargeContext(
      jsonData,
      async (chunk: string) => {
        // Try to parse chunk as JSON and extract field
        try {
          const chunkData = JSON.parse(chunk);
          
          // Recursively find field values
          const values: unknown[] = [];
          const findField = (obj: unknown): void => {
            if (typeof obj === 'object' && obj !== null) {
              if (Array.isArray(obj)) {
                obj.forEach(findField);
              } else {
                const objectRecord = obj as Record<string, unknown>;
                Object.keys(objectRecord).forEach(key => {
                  if (key === fieldName) {
                    values.push(objectRecord[key]);
                  } else if (typeof objectRecord[key] === 'object') {
                    findField(objectRecord[key]);
                  }
                });
              }
            }
          };
          
          findField(chunkData);
          return values;
        } catch (parseError) {
          // Chunk might be partial JSON, return empty array
          return [];
        }
      }
    );
    
    // Flatten results
    const allValues = fieldValues.flat();
    logger.info(`Extracted ${allValues.length} values for field '${fieldName}'`);
    return allValues;
  } catch (error) {
    logger.error('Failed to extract fields from large JSON', { error });
    throw error;
  }
}

/**
 * Example: Analyzing conversation patterns in large chat logs
 */
export async function analyzeConversationPatterns(chatLog: string) {
  await contextAnalyzer.initialize();
  
  try {
    // Get comprehensive analysis
    const analysis = await contextAnalyzer.analyzeConversation(chatLog);
    
    // Find patterns
    const patterns = await contextAnalyzer.findPatterns(chatLog);
    
    // Get theme summary
    const themes = await contextAnalyzer.summarizeThemes(chatLog);
    
    return {
      analysis,
      patterns: patterns.slice(0, 10), // Top 10 patterns
      themes
    };
  } catch (error) {
    logger.error('Failed to analyze conversation patterns', { error });
    throw error;
  }
}

/**
 * Example: Batch processing multiple large contexts with progress tracking
 */
export async function batchProcessLargeContexts(
  contexts: string[],
  processor: (context: string, index: number) => Promise<string>,
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  await largeContextHandler.initialize();
  
  const results: string[] = [];
  
  try {
    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i];
      
      logger.info(`Processing context ${i + 1}/${contexts.length}`);
      
      // Process each context individually
      const result = await largeContextHandler.processLargeContext(
        context,
        async (chunk, chunkIndex, totalChunks) => {
          return await processor(`${chunk}\n[Chunk ${chunkIndex + 1}/${totalChunks}]`, i);
        }
      );
      
      // Combine chunk results
      results.push(result.join('\n\n'));
      
      // Report progress
      if (onProgress) {
        onProgress(i + 1, contexts.length);
      }
    }
    
    logger.info(`Batch processing completed: ${results.length} contexts processed`);
    return results;
  } catch (error) {
    logger.error('Batch processing failed', { error });
    throw error;
  }
}

/**
 * Example: Memory-efficient content search in large datasets
 */
export async function searchInLargeContent(
  content: string,
  searchTerms: string[]
): Promise<{ term: string; occurrences: number; contexts: string[] }[]> {
  await largeContextHandler.initialize();
  
  try {
    const searchResults = await largeContextHandler.extractFromLargeContext(
      content,
      async (chunk: string) => {
        const results: { term: string; occurrences: number; contexts: string[] }[] = [];
        
        searchTerms.forEach(term => {
          const regex = new RegExp(term, 'gi');
          const matches = chunk.match(regex) || [];
          
          if (matches.length > 0) {
            // Get context around matches
            const contexts = matches.map(() => {
              const lines = chunk.split('\n');
              const matchingLines = lines.filter(line => 
                line.toLowerCase().includes(term.toLowerCase())
              );
              return matchingLines.slice(0, 3).join(' '); // First 3 matching lines
            });
            
            results.push({
              term,
              occurrences: matches.length,
              contexts: contexts.slice(0, 5) // Limit contexts per chunk
            });
          }
        });
        
        return results;
      }
    );
    
    // Aggregate results by term
    const aggregated = new Map<string, { occurrences: number; contexts: string[] }>();
    
    searchResults.flat().forEach(result => {
      const existing = aggregated.get(result.term) || { occurrences: 0, contexts: [] };
      existing.occurrences += result.occurrences;
      existing.contexts.push(...result.contexts);
      aggregated.set(result.term, existing);
    });
    
    // Convert to final format
    const finalResults = Array.from(aggregated.entries()).map(([term, data]) => ({
      term,
      occurrences: data.occurrences,
      contexts: data.contexts.slice(0, 10) // Limit to top 10 contexts
    }));
    
    logger.info(`Search completed: found results for ${finalResults.length} terms`);
    return finalResults;
  } catch (error) {
    logger.error('Search in large content failed', { error });
    throw error;
  }
}

/**
 * Cleanup utility - call this when done with context processing
 */
export async function cleanupLargeContextHandlers(): Promise<void> {
  await Promise.all([
    largeContextHandler.cleanupAll(),
    contextAnalyzer.cleanup()
  ]);
  
  logger.info('All large context handlers cleaned up');
}