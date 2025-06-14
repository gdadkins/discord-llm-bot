/**
 * Large Context Handler Utility
 * 
 * Manages temporary file storage for large message contexts that exceed
 * AI model context windows. Provides chunking, processing, and cleanup.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger';

export interface ChunkProcessorCallback {
  (chunk: string, chunkIndex: number, totalChunks: number): Promise<string>;
}

export interface LargeContextOptions {
  maxChunkSize?: number; // Maximum size per chunk in characters
  tempDir?: string; // Directory for temporary files
  cleanupDelay?: number; // Delay before cleanup in milliseconds
  compressionEnabled?: boolean; // Enable compression for storage
}

export class LargeContextHandler {
  private readonly maxChunkSize: number;
  private readonly tempDir: string;
  private readonly cleanupDelay: number;
  private readonly compressionEnabled: boolean;
  private activeFiles: Set<string> = new Set();

  constructor(options: LargeContextOptions = {}) {
    this.maxChunkSize = options.maxChunkSize || 15000; // ~15k chars per chunk
    this.tempDir = options.tempDir || path.join(process.cwd(), 'temp', 'context');
    this.cleanupDelay = options.cleanupDelay || 5000; // 5 second cleanup delay
    this.compressionEnabled = options.compressionEnabled || false;
  }

  /**
   * Initializes the handler and ensures temp directory exists
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      logger.info('LargeContextHandler initialized', { tempDir: this.tempDir });
    } catch (error) {
      logger.error('Failed to initialize LargeContextHandler', { error });
      throw error;
    }
  }

  /**
   * Processes large context by writing to temp file and processing in chunks
   * @param context The large context to process
   * @param processor Callback function to process each chunk
   * @returns Array of processed chunk results
   */
  async processLargeContext(
    context: string | object,
    processor: ChunkProcessorCallback
  ): Promise<string[]> {
    const tempFilePath = await this.writeToTempFile(context);
    
    try {
      const chunks = await this.readAndChunkFile(tempFilePath);
      const results: string[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        try {
          const result = await processor(chunks[i], i, chunks.length);
          results.push(result);
        } catch (error) {
          logger.error('Error processing chunk', { 
            chunkIndex: i, 
            totalChunks: chunks.length, 
            error 
          });
          // Continue processing other chunks
          results.push(''); // Empty result for failed chunk
        }
      }
      
      return results;
    } finally {
      // Schedule cleanup
      this.scheduleCleanup(tempFilePath);
    }
  }

  /**
   * Writes context to a temporary file
   * @param context The context to write
   * @returns Path to the temporary file
   */
  private async writeToTempFile(context: string | object): Promise<string> {
    const contextString = typeof context === 'string' 
      ? context 
      : JSON.stringify(context, null, 2);
    
    const fileName = `context_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.tmp`;
    const filePath = path.join(this.tempDir, fileName);
    
    try {
      await fs.writeFile(filePath, contextString, 'utf8');
      this.activeFiles.add(filePath);
      
      logger.debug('Context written to temp file', { 
        filePath, 
        size: contextString.length 
      });
      
      return filePath;
    } catch (error) {
      logger.error('Failed to write context to temp file', { error });
      throw error;
    }
  }

  /**
   * Reads file and splits into chunks
   * @param filePath Path to the file to read
   * @returns Array of chunks
   */
  private async readAndChunkFile(filePath: string): Promise<string[]> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return this.splitIntoChunks(content);
    } catch (error) {
      logger.error('Failed to read and chunk file', { filePath, error });
      throw error;
    }
  }

  /**
   * Splits content into manageable chunks
   * @param content The content to split
   * @returns Array of chunks
   */
  private splitIntoChunks(content: string): string[] {
    if (!content) {
      return [];
    }
    
    const chunks: string[] = [];
    
    // First try to split on natural boundaries (lines, sentences)
    const lines = content.split('\n');
    let currentChunk = '';
    
    for (const line of lines) {
      const potentialLength = currentChunk.length + line.length + (currentChunk ? 1 : 0);
      
      if (potentialLength > this.maxChunkSize && currentChunk) {
        // Current chunk would be too large, save it and start new one
        chunks.push(currentChunk.trim());
        currentChunk = line;
      } else {
        // Add line to current chunk
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
      
      // If even a single line is too large, split it by characters
      if (currentChunk.length > this.maxChunkSize) {
        const oversizedChunks = this.splitOversizedChunk(currentChunk);
        chunks.push(...oversizedChunks.slice(0, -1)); // Add all but last
        currentChunk = oversizedChunks[oversizedChunks.length - 1] || '';
      }
    }
    
    // Add the final chunk if it exists
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    // If we still have no chunks but have content, force split by character count
    if (chunks.length === 0 && content.trim()) {
      return this.splitOversizedChunk(content);
    }
    
    logger.debug('Content split into chunks', { 
      totalSize: content.length, 
      chunkCount: chunks.length,
      avgChunkSize: chunks.length > 0 ? Math.round(content.length / chunks.length) : 0
    });
    
    return chunks;
  }

  /**
   * Splits an oversized chunk by character count
   * @param chunk The oversized chunk to split
   * @returns Array of smaller chunks
   */
  private splitOversizedChunk(chunk: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < chunk.length) {
      const end = Math.min(start + this.maxChunkSize, chunk.length);
      chunks.push(chunk.slice(start, end));
      start = end;
    }
    
    return chunks;
  }

  /**
   * Schedules cleanup of temporary file
   * @param filePath Path to file to clean up
   */
  private scheduleCleanup(filePath: string): void {
    setTimeout(async () => {
      await this.cleanupFile(filePath);
    }, this.cleanupDelay);
  }

  /**
   * Cleans up a temporary file
   * @param filePath Path to file to clean up
   */
  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.activeFiles.delete(filePath);
      logger.debug('Cleaned up temp file', { filePath });
    } catch (error) {
      // File might already be deleted
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to cleanup temp file', { filePath, error });
      }
      this.activeFiles.delete(filePath);
    }
  }

  /**
   * Cleans up all active temporary files
   */
  async cleanupAll(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];
    
    for (const filePath of this.activeFiles) {
      cleanupPromises.push(this.cleanupFile(filePath));
    }
    
    await Promise.all(cleanupPromises);
    logger.info('Cleaned up all temp files', { count: cleanupPromises.length });
  }

  /**
   * Summarizes large context by processing chunks and combining summaries
   * @param context The large context to summarize
   * @param summarizer Function to summarize each chunk
   * @returns Combined summary
   */
  async summarizeLargeContext(
    context: string | object,
    summarizer: (chunk: string) => Promise<string>
  ): Promise<string> {
    const summaries = await this.processLargeContext(context, async (chunk, index, total) => {
      logger.debug(`Summarizing chunk ${index + 1}/${total}`);
      return await summarizer(chunk);
    });
    
    // Combine all summaries
    const combinedSummary = summaries.join('\n\n');
    
    // If combined summary is still too large, recursively summarize
    if (combinedSummary.length > this.maxChunkSize * 2) {
      logger.debug('Combined summary too large, recursively summarizing');
      return await this.summarizeLargeContext(combinedSummary, summarizer);
    }
    
    return combinedSummary;
  }

  /**
   * Extracts key information from large context
   * @param context The large context to process
   * @param extractor Function to extract info from each chunk
   * @returns Array of extracted information
   */
  async extractFromLargeContext<T>(
    context: string | object,
    extractor: (chunk: string) => Promise<T>
  ): Promise<T[]> {
    const results: T[] = [];
    
    await this.processLargeContext(context, async (chunk, index, total) => {
      logger.debug(`Extracting from chunk ${index + 1}/${total}`);
      const extracted = await extractor(chunk);
      results.push(extracted);
      return ''; // Return empty string as we're collecting results separately
    });
    
    return results;
  }

  /**
   * Gets statistics about current temporary file usage
   */
  async getStats(): Promise<{
    activeFiles: number;
    tempDirSize: number;
    oldestFile: Date | null;
  }> {
    const stats = {
      activeFiles: this.activeFiles.size,
      tempDirSize: 0,
      oldestFile: null as Date | null
    };
    
    try {
      const files = await fs.readdir(this.tempDir);
      let oldestTime = Date.now();
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const fileStat = await fs.stat(filePath);
        stats.tempDirSize += fileStat.size;
        
        if (fileStat.birthtimeMs < oldestTime) {
          oldestTime = fileStat.birthtimeMs;
          stats.oldestFile = new Date(oldestTime);
        }
      }
    } catch (error) {
      logger.error('Failed to get stats', { error });
    }
    
    return stats;
  }

  /**
   * Cleans up old temporary files based on age
   * @param maxAgeMs Maximum age in milliseconds
   */
  async cleanupOldFiles(maxAgeMs: number = 3600000): Promise<number> {
    let cleanedCount = 0;
    const now = Date.now();
    
    try {
      const files = await fs.readdir(this.tempDir);
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const fileStat = await fs.stat(filePath);
        
        if (now - fileStat.birthtimeMs > maxAgeMs) {
          await this.cleanupFile(filePath);
          cleanedCount++;
        }
      }
      
      logger.info('Cleaned up old temp files', { cleanedCount, maxAgeMs });
    } catch (error) {
      logger.error('Failed to cleanup old files', { error });
    }
    
    return cleanedCount;
  }
}

// Export singleton instance for convenience
export const largeContextHandler = new LargeContextHandler();