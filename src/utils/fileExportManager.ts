import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * File Export Manager for handling large responses
 * Manages temporary file creation and cleanup for Discord file attachments
 */
export class FileExportManager {
  private static instance: FileExportManager;
  private exportDir: string;
  private fileCleanupTimeout: number = 300000; // 5 minutes

  private constructor() {
    this.exportDir = path.join(process.cwd(), 'exports');
  }

  static getInstance(): FileExportManager {
    if (!FileExportManager.instance) {
      FileExportManager.instance = new FileExportManager();
    }
    return FileExportManager.instance;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.exportDir, { recursive: true });
      logger.info(`File export directory initialized at: ${this.exportDir}`);
    } catch (error) {
      logger.error('Failed to initialize export directory:', error);
      throw error;
    }
  }

  /**
   * Save content to a temporary file for Discord export
   * @param content The content to save
   * @param filename Optional filename (will generate UUID if not provided)
   * @param format File format (txt, json, md)
   * @returns Path to the created file
   */
  async saveToFile(
    content: string,
    filename?: string,
    format: 'txt' | 'json' | 'md' = 'txt'
  ): Promise<string> {
    const fileName = filename || `export-${uuidv4()}.${format}`;
    const filePath = path.join(this.exportDir, fileName);

    try {
      await fs.writeFile(filePath, content, 'utf-8');
      logger.info(`Exported content to file: ${fileName} (${content.length} chars)`);

      // Schedule automatic cleanup
      this.scheduleCleanup(filePath);

      return filePath;
    } catch (error) {
      logger.error('Failed to save export file:', error);
      throw error;
    }
  }

  /**
   * Generate a summary file for user message analysis
   */
  async createUserAnalysisFile(
    username: string,
    messages: string[],
    analysis: {
      mainTopics: string[];
      communicationStyle: string;
      keyInterests: string[];
      notablePatterns: string[];
      overallSummary: string;
      messageCount: number;
      timeRange?: { start: Date; end: Date };
    }
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const content = `# User Analysis Report: ${username}
Generated: ${timestamp}

## Overview
- **Total Messages Analyzed**: ${analysis.messageCount}
- **Time Range**: ${analysis.timeRange ? `${analysis.timeRange.start.toLocaleString()} - ${analysis.timeRange.end.toLocaleString()}` : 'Recent messages'}

## Main Topics
${analysis.mainTopics.map(topic => `- ${topic}`).join('\n')}

## Communication Style
${analysis.communicationStyle}

## Key Interests
${analysis.keyInterests.map(interest => `- ${interest}`).join('\n')}

## Notable Patterns
${analysis.notablePatterns.map(pattern => `- ${pattern}`).join('\n')}

## Overall Summary
${analysis.overallSummary}

---

## Message History
${messages.map((msg, idx) => `${idx + 1}. ${msg}`).join('\n\n')}
`;

    const filename = `${username}-analysis-${Date.now()}.md`;
    return await this.saveToFile(content, filename, 'md');
  }

  /**
   * Create a concise summary for Discord display
   */
  generateConciseSummary(
    username: string,
    analysis: {
      mainTopics: string[];
      communicationStyle: string;
      keyInterests: string[];
      overallSummary: string;
      messageCount: number;
    }
  ): string {
    return `**Analysis of ${username}'s messages** (${analysis.messageCount} messages analyzed)

**Main Topics**: ${analysis.mainTopics.slice(0, 3).join(', ')}
**Style**: ${analysis.communicationStyle.split('.')[0]}
**Interests**: ${analysis.keyInterests.slice(0, 3).join(', ')}

${analysis.overallSummary.split('.').slice(0, 2).join('.')}

*Full detailed analysis attached as file*`;
  }

  /**
   * Schedule automatic cleanup of temporary files
   */
  private scheduleCleanup(filePath: string): void {
    setTimeout(async () => {
      try {
        await fs.unlink(filePath);
        logger.info(`Cleaned up temporary file: ${path.basename(filePath)}`);
      } catch (error) {
        logger.warn(`Failed to cleanup file ${filePath}:`, error);
      }
    }, this.fileCleanupTimeout);
  }

  /**
   * Clean up all export files (for shutdown)
   */
  async cleanupAll(): Promise<void> {
    try {
      const files = await fs.readdir(this.exportDir);
      for (const file of files) {
        const filePath = path.join(this.exportDir, file);
        await fs.unlink(filePath);
      }
      logger.info('Cleaned up all export files');
    } catch (error) {
      logger.warn('Error during export cleanup:', error);
    }
  }
}