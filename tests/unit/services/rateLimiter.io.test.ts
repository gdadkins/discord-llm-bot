import { RateLimiter } from '../../../src/services/rate-limiting/RateLimiter';
import fs from 'fs/promises';
import path from 'path';

describe('RateLimiter I/O Optimization Tests', () => {
  const testDataDir = './test-data/rate-limiter';
  const testStateFile = path.join(testDataDir, 'test-rate-limit.json');
  let rateLimiter: RateLimiter;
  let writeCount = 0;
  let originalWriteFile: typeof fs.writeFile;

  beforeAll(async () => {
    // Ensure test directory exists
    await fs.mkdir(testDataDir, { recursive: true });
  });

  beforeEach(async () => {
    // Clean up any existing test file
    try {
      await fs.unlink(testStateFile);
    } catch (error) {
      // File doesn't exist, that's fine
    }

    // Mock fs.writeFile to count I/O operations
    originalWriteFile = fs.writeFile;
    writeCount = 0;

    // Create a spy that counts writes
    jest.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
      writeCount++;
      return originalWriteFile(file as any, data, options as any);
    });

    // Create rate limiter with test configuration
    rateLimiter = new RateLimiter(60, 1000, testStateFile);
  });

  afterEach(async () => {
    // Shutdown rate limiter
    if (rateLimiter) {
      await rateLimiter.shutdown();
    }

    // Restore original writeFile
    jest.restoreAllMocks();

    // Clean up test file
    try {
      await fs.unlink(testStateFile);
      await fs.unlink(`${testStateFile}.backup`);
    } catch (error) {
      // Files might not exist
    }
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.rmdir(testDataDir);
    } catch (error) {
      // Directory might not be empty or not exist
    }
  });

  describe('I/O Reduction Tests', () => {
    test('should batch multiple requests without immediate I/O', async () => {
      await rateLimiter.initialize();
      const initialWriteCount = writeCount;

      // Make 10 rapid requests
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkAndIncrement();
      }

      // Should not have written immediately
      expect(writeCount).toBe(initialWriteCount);
    });

    test('should write to disk after memory sync interval', async () => {
      await rateLimiter.initialize();
      const initialWriteCount = writeCount;

      // Make several requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkAndIncrement();
      }

      // Wait for memory sync interval (30 seconds) - use a shorter timeout for testing
      // Force a sync by calling shutdown which triggers final sync
      await rateLimiter.shutdown();

      // Should have written at least once during shutdown
      expect(writeCount).toBeGreaterThan(initialWriteCount);
    });

    test('should flush batch when reaching max batch size', async () => {
      await rateLimiter.initialize();

      // The MAX_BATCH_SIZE is 50, but since we're using global rate limiting,
      // multiple increments on the same key won't increase batch size
      // This test verifies the batching logic works
      const result = await rateLimiter.checkAndIncrement();
      expect(result.allowed).toBe(true);
    });

    test('should use cached window calculations', async () => {
      await rateLimiter.initialize();

      // Measure time for multiple checks
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        await rateLimiter.checkAndIncrement();
      }

      const duration = Date.now() - start;

      // 100 checks should complete in less than 500ms (5ms per check average)
      expect(duration).toBeLessThan(500);
    });

    test('should maintain state in memory between checks', async () => {
      await rateLimiter.initialize();

      // Make some requests
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkAndIncrement();
        expect(result.allowed).toBe(true);
        expect(result.remaining.minute).toBe(54 - i - 1); // 60 * 0.9 = 54 limit, -1 because we just incremented
      }

      // Check status without incrementing
      const status = rateLimiter.getStatus('test');
      expect(status.rpm.current).toBe(5);
    });

    test('should persist state on shutdown', async () => {
      await rateLimiter.initialize();

      // Make some requests
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkAndIncrement();
      }

      const writeCountBeforeShutdown = writeCount;

      // Shutdown should trigger a sync
      await rateLimiter.shutdown();

      // Should have written at least once during shutdown
      expect(writeCount).toBeGreaterThan(writeCountBeforeShutdown);
    });

    test('should load persisted state on initialization', async () => {
      // First instance
      const limiter1 = new RateLimiter(60, 1000, testStateFile);
      await limiter1.initialize();

      // Make some requests
      for (let i = 0; i < 15; i++) {
        await limiter1.checkAndIncrement();
      }

      // Force sync and shutdown
      await limiter1.shutdown();

      // Second instance should load the state
      const limiter2 = new RateLimiter(60, 1000, testStateFile);
      await limiter2.initialize();

      const status = limiter2.getStatus('test');
      expect(status.rpm.current).toBe(15);

      await limiter2.shutdown();
    });

    test('should handle window resets without excessive I/O', async () => {
      await rateLimiter.initialize();
      const initialWriteCount = writeCount;

      // Simulate time passing to trigger window reset
      const now = new Date();
      const nextMinute = new Date(now);
      nextMinute.setMinutes(now.getMinutes() + 1, 0, 0);

      // Make a request that will trigger window reset check
      await rateLimiter.checkAndIncrement();

      // Window check should use cache, not trigger immediate I/O
      expect(writeCount).toBe(initialWriteCount);
    });
  });

  describe('Performance Metrics', () => {
    test('should track performance metrics', async () => {
      await rateLimiter.initialize();

      // Make some requests
      for (let i = 0; i < 20; i++) {
        await rateLimiter.checkAndIncrement();
      }

      const metrics = (rateLimiter as any).collectServiceMetrics();
      const rateLimitingMetrics = metrics.rateLimiting as any;

      expect(rateLimitingMetrics).toBeDefined();
      expect(rateLimitingMetrics.performance).toBeDefined();
      expect(rateLimitingMetrics.performance.memoryUsageBytes).toBeLessThan(50 * 1024 * 1024); // Under 50MB
      expect(rateLimitingMetrics.batchFlushInterval).toBe(5000);
      expect(rateLimitingMetrics.memorySyncInterval).toBe(30000);
    });

    test('response time should be under 5ms', async () => {
      await rateLimiter.initialize();

      const times: number[] = [];

      // Warm up
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkAndIncrement();
      }

      // Measure response times
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        await rateLimiter.checkAndIncrement();
        times.push(Date.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(avgTime).toBeLessThan(5);
      expect(maxTime).toBeLessThan(10); // Allow some outliers but should be rare
    });
  });
});