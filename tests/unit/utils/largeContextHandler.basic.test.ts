/**
 * Basic Tests for Large Context Handler Utility
 * Focuses on core functionality without complex dependencies
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { LargeContextHandler } from '../../../src/utils/largeContextHandler';

// Mock logger to avoid console output during tests
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('LargeContextHandler - Basic Tests', () => {
  let handler: LargeContextHandler;
  const testTempDir = path.join(process.cwd(), 'temp', 'test-basic');

  beforeEach(async () => {
    handler = new LargeContextHandler({
      tempDir: testTempDir,
      maxChunkSize: 50, // Small size for testing
      cleanupDelay: 50 // Short delay for testing
    });
    await handler.initialize();
  });

  afterEach(async () => {
    await handler.cleanupAll();
    try {
      await fs.rm(testTempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create temp directory', async () => {
      const customHandler = new LargeContextHandler({
        tempDir: path.join(testTempDir, 'custom')
      });
      
      await customHandler.initialize();
      
      // Check if directory exists
      try {
        await fs.access(path.join(testTempDir, 'custom'));
        expect(true).toBe(true); // Directory exists
      } catch (error) {
        fail('Directory should exist');
      }
    });
  });

  describe('processLargeContext', () => {
    it('should process string context in chunks', async () => {
      const context = 'A'.repeat(150); // 150 chars, should create 3 chunks with maxChunkSize=50
      const processedChunks: string[] = [];
      
      const results = await handler.processLargeContext(
        context,
        async (chunk, index, total) => {
          processedChunks.push(chunk);
          return `Chunk ${index + 1}/${total}`;
        }
      );
      
      expect(processedChunks.length).toBe(3);
      expect(results).toEqual([
        'Chunk 1/3',
        'Chunk 2/3',
        'Chunk 3/3'
      ]);
    });

    it('should handle object context', async () => {
      const context = { message: 'test data', data: 'A'.repeat(100) };
      
      const results = await handler.processLargeContext(
        context,
        async (chunk) => {
          expect(chunk).toContain('"message"');
          return 'processed';
        }
      );
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toBe('processed');
    });

    it('should handle empty context', async () => {
      const results = await handler.processLargeContext(
        '',
        async () => 'empty'
      );
      
      expect(results).toEqual([]); // Empty context produces no chunks
    });
  });

  describe('file cleanup', () => {
    it('should clean up files after processing', async () => {
      await handler.processLargeContext(
        'test content',
        async () => 'done'
      );
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that temp directory is empty or doesn't exist
      try {
        const files = await fs.readdir(testTempDir);
        expect(files.length).toBe(0);
      } catch (error) {
        // Directory might not exist, which is fine
        expect(true).toBe(true);
      }
    });
  });

  describe('getStats', () => {
    it('should return valid stats', async () => {
      const stats = await handler.getStats();
      
      expect(stats).toHaveProperty('activeFiles');
      expect(stats).toHaveProperty('tempDirSize');
      expect(stats).toHaveProperty('oldestFile');
      expect(typeof stats.activeFiles).toBe('number');
      expect(typeof stats.tempDirSize).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should handle processor errors gracefully', async () => {
      const results = await handler.processLargeContext(
        'test context',
        async (chunk, index) => {
          if (index === 0) {
            throw new Error('Test error');
          }
          return 'success';
        }
      );
      
      expect(results[0]).toBe(''); // Failed chunk returns empty
    });
  });
});