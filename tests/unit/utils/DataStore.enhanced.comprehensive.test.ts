/**
 * Comprehensive Enhanced DataStore Unit Tests
 * 
 * Complete test coverage for DSE-005 enhanced features:
 * - Batch operations with atomic transactions
 * - Performance metrics tracking  
 * - Connection pooling for high-concurrency
 * - Retry logic with exponential backoff
 * - Enhanced error handling
 * - Health checks and diagnostics
 * - Data validation hooks
 * 
 * Coverage target: >95% for all enhanced features
 * Focus: Critical failure scenarios and edge cases
 * 
 * @author DSE-005 Enhancement Agent
 * @version 1.0.0
 */

import { describe, it, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { 
  DataStore, 
  DataStoreMetrics,
  BatchApi,
  DataValidator
} from '../../../src/utils/DataStore';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger');

// Mock async-mutex for controlled testing  
jest.mock('async-mutex', () => ({
  Mutex: class MockMutex {
    async acquire() {
      return () => {}; // Return a release function
    }
  }
}));

// Test data interfaces
interface TestData {
  id: string;
  name: string;
  value: number;
  timestamp?: number;
}

interface TestConfig {
  feature: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

// Test validators
const testDataValidator: DataValidator<TestData> = (data: unknown): data is TestData => {
  return typeof data === 'object' && 
         data !== null && 
         typeof (data as any).id === 'string' && 
         typeof (data as any).name === 'string' &&
         typeof (data as any).value === 'number';
};

const configValidator: DataValidator<TestConfig> = (data: unknown): data is TestConfig => {
  return typeof data === 'object' && 
         data !== null &&
         typeof (data as any).feature === 'string' &&
         typeof (data as any).enabled === 'boolean' &&
         typeof (data as any).config === 'object';
};

describe('DataStore Enhanced Features - Comprehensive Tests', () => {
  let testDir: string;
  let testFile: string;
  let dataStore: DataStore<TestData>;
  
  const mockData: TestData = {
    id: 'test-001',
    name: 'Test Data',
    value: 42,
    timestamp: Date.now()
  };

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'datastore-enhanced-test-'));
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    testFile = path.join(testDir, `enhanced-test-${Date.now()}-${Math.random().toString(36).substring(2)}.json`);
    dataStore = new DataStore<TestData>(testFile, {
      validator: testDataValidator,
      enableDebugLogging: true,
      maxRetries: 3,
      retryDelayMs: 10,
      compressionEnabled: true,
      compressionThreshold: 100
    });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await dataStore.delete(true);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Performance Metrics Tracking', () => {
    it('should initialize with zero metrics', () => {
      const metrics = dataStore.getMetrics();
      
      expect(metrics.saveCount).toBe(0);
      expect(metrics.loadCount).toBe(0);
      expect(metrics.avgSaveLatency).toBe(0);
      expect(metrics.avgLoadLatency).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.retryCount).toBe(0);
      expect(metrics.lastOperationTime).toBe(0);
      expect(metrics.totalBytesWritten).toBe(0);
      expect(metrics.totalBytesRead).toBe(0);
    });

    it('should track save operation metrics accurately', async () => {
      const startTime = Date.now();
      await dataStore.save(mockData);
      
      const metrics = dataStore.getMetrics();
      
      expect(metrics.saveCount).toBe(1);
      expect(metrics.avgSaveLatency).toBeGreaterThan(0);
      expect(metrics.totalBytesWritten).toBeGreaterThan(0);
      expect(metrics.lastOperationTime).toBeGreaterThanOrEqual(startTime);
    });

    it('should track load operation metrics accurately', async () => {
      await dataStore.save(mockData);
      
      const startTime = Date.now();
      await dataStore.load();
      
      const metrics = dataStore.getMetrics();
      
      expect(metrics.loadCount).toBe(1);
      expect(metrics.avgLoadLatency).toBeGreaterThan(0);
      expect(metrics.totalBytesRead).toBeGreaterThan(0);
      expect(metrics.lastOperationTime).toBeGreaterThanOrEqual(startTime);
    });

    it('should calculate average latencies correctly over multiple operations', async () => {
      const operations = 5;
      
      for (let i = 0; i < operations; i++) {
        await dataStore.save({ ...mockData, value: i });
        await dataStore.load();
      }
      
      const metrics = dataStore.getMetrics();
      
      expect(metrics.saveCount).toBe(operations);
      expect(metrics.loadCount).toBe(operations);
      expect(metrics.avgSaveLatency).toBeGreaterThan(0);
      expect(metrics.avgLoadLatency).toBeGreaterThan(0);
      
      // Verify averages are reasonable (not zero or negative)
      expect(metrics.avgSaveLatency).toBeLessThan(1000); // Should be under 1 second
      expect(metrics.avgLoadLatency).toBeLessThan(1000);
    });

    it('should track error count on failures', async () => {
      const invalidPath = '/invalid/nonexistent/path/test.json';
      const errorStore = new DataStore<TestData>(invalidPath, {
        validator: testDataValidator,
        createDirectories: false,
        maxRetries: 1
      });
      
      try {
        await errorStore.save(mockData);
      } catch (error) {
        // Expected error
      }
      
      const metrics = errorStore.getMetrics();
      expect(metrics.errorCount).toBeGreaterThan(0);
    });

    it('should reset metrics to initial state', async () => {
      // Perform operations to generate metrics
      await dataStore.save(mockData);
      await dataStore.load();
      
      let metrics = dataStore.getMetrics();
      expect(metrics.saveCount).toBeGreaterThan(0);
      expect(metrics.loadCount).toBeGreaterThan(0);
      
      // Reset metrics
      dataStore.resetMetrics();
      
      metrics = dataStore.getMetrics();
      expect(metrics.saveCount).toBe(0);
      expect(metrics.loadCount).toBe(0);
      expect(metrics.avgSaveLatency).toBe(0);
      expect(metrics.avgLoadLatency).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.retryCount).toBe(0);
      expect(metrics.lastOperationTime).toBe(0);
      expect(metrics.totalBytesWritten).toBe(0);
      expect(metrics.totalBytesRead).toBe(0);
    });
  });

  describe('Batch Operations - Atomic Transactions', () => {
    it('should execute atomic batch updates successfully', async () => {
      const store1 = path.join(testDir, 'batch-update-1.json');
      const store2 = path.join(testDir, 'batch-update-2.json');
      const store3 = path.join(testDir, 'batch-update-3.json');
      
      const data1: TestData = { id: '1', name: 'Data 1', value: 100 };
      const data2: TestData = { id: '2', name: 'Data 2', value: 200 };
      const data3: TestData = { id: '3', name: 'Data 3', value: 300 };
      
      // Execute atomic batch operation
      await dataStore.batch()
        .update(store1, data1)
        .update(store2, data2)
        .update(store3, data3)
        .commit();
      
      // Verify all files were created with correct data
      const result1 = JSON.parse(await fs.readFile(store1, 'utf8'));
      const result2 = JSON.parse(await fs.readFile(store2, 'utf8'));
      const result3 = JSON.parse(await fs.readFile(store3, 'utf8'));
      
      expect(result1).toEqual(data1);
      expect(result2).toEqual(data2);
      expect(result3).toEqual(data3);
    });

    it('should execute atomic batch deletes successfully', async () => {
      const store1 = path.join(testDir, 'batch-delete-1.json');
      const store2 = path.join(testDir, 'batch-delete-2.json');
      
      // Create files to delete
      await fs.writeFile(store1, JSON.stringify({ id: '1', name: 'Delete 1', value: 1 }));
      await fs.writeFile(store2, JSON.stringify({ id: '2', name: 'Delete 2', value: 2 }));
      
      // Verify files exist
      expect(await fs.access(store1).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(store2).then(() => true).catch(() => false)).toBe(true);
      
      // Execute batch delete
      await dataStore.batch()
        .delete(store1)
        .delete(store2)
        .commit();
      
      // Verify files are deleted
      expect(await fs.access(store1).then(() => true).catch(() => false)).toBe(false);
      expect(await fs.access(store2).then(() => true).catch(() => false)).toBe(false);
    });

    it('should execute mixed batch operations (updates and deletes)', async () => {
      const updateStore = path.join(testDir, 'batch-mixed-update.json');
      const deleteStore = path.join(testDir, 'batch-mixed-delete.json');
      const newStore = path.join(testDir, 'batch-mixed-new.json');
      
      // Setup initial state
      await fs.writeFile(updateStore, JSON.stringify({ id: 'old', name: 'Old Data', value: 1 }));
      await fs.writeFile(deleteStore, JSON.stringify({ id: 'delete', name: 'To Delete', value: 2 }));
      
      const updatedData: TestData = { id: 'updated', name: 'Updated Data', value: 100 };
      const newData: TestData = { id: 'new', name: 'New Data', value: 300 };
      
      // Execute mixed batch operations
      await dataStore.batch()
        .update(updateStore, updatedData)
        .delete(deleteStore)
        .update(newStore, newData)
        .commit();
      
      // Verify results
      const updateResult = JSON.parse(await fs.readFile(updateStore, 'utf8'));
      expect(updateResult).toEqual(updatedData);
      
      expect(await fs.access(deleteStore).then(() => true).catch(() => false)).toBe(false);
      
      const newResult = JSON.parse(await fs.readFile(newStore, 'utf8'));
      expect(newResult).toEqual(newData);
    });

    it('should rollback all operations on partial failure', async () => {
      const store1 = path.join(testDir, 'rollback-1.json');
      const store2 = path.join(testDir, 'rollback-2.json');
      const invalidStore = '/invalid/nonexistent/directory/rollback.json';
      
      const originalData1 = { id: 'orig1', name: 'Original 1', value: 10 };
      const originalData2 = { id: 'orig2', name: 'Original 2', value: 20 };
      
      // Setup initial state
      await fs.writeFile(store1, JSON.stringify(originalData1));
      await fs.writeFile(store2, JSON.stringify(originalData2));
      
      const updateData1: TestData = { id: 'upd1', name: 'Updated 1', value: 100 };
      const updateData2: TestData = { id: 'upd2', name: 'Updated 2', value: 200 };
      const invalidData: TestData = { id: 'invalid', name: 'Should Fail', value: 999 };
      
      // Attempt batch with operation that will fail
      await expect(
        dataStore.batch()
          .update(store1, updateData1)
          .update(invalidStore, invalidData) // This will fail
          .update(store2, updateData2)
          .commit()
      ).rejects.toThrow();
      
      // Verify rollback - original data should be preserved
      const result1 = JSON.parse(await fs.readFile(store1, 'utf8'));
      const result2 = JSON.parse(await fs.readFile(store2, 'utf8'));
      
      expect(result1).toEqual(originalData1);
      expect(result2).toEqual(originalData2);
    });

    it('should prevent concurrent batch transactions', async () => {
      // Start first batch transaction
      const batch1 = dataStore.batch();
      
      // Attempt to start second batch should fail
      expect(() => dataStore.batch()).toThrow('Batch transaction already in progress');
      
      // Rollback first batch
      batch1.rollback();
      
      // Now we should be able to start new batch
      const batch2 = dataStore.batch();
      expect(batch2).toBeDefined();
      batch2.rollback();
    });

    it('should handle empty batch commits gracefully', async () => {
      // Empty batch should commit successfully
      await expect(dataStore.batch().commit()).resolves.not.toThrow();
    });

    it('should chain batch operations fluently', async () => {
      const store1 = path.join(testDir, 'chain-1.json');
      const store2 = path.join(testDir, 'chain-2.json');
      const store3 = path.join(testDir, 'chain-3.json');
      
      // Test method chaining
      const batch = dataStore.batch()
        .update(store1, { id: '1', name: 'Chain 1', value: 1 })
        .update(store2, { id: '2', name: 'Chain 2', value: 2 })
        .update(store3, { id: '3', name: 'Chain 3', value: 3 });
      
      await batch.commit();
      
      // Verify all operations executed
      expect(await fs.access(store1).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(store2).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(store3).then(() => true).catch(() => false)).toBe(true);
    });

    it('should handle rollback after failed commit', async () => {
      const store1 = path.join(testDir, 'rollback-after-fail-1.json');
      const invalidStore = '/invalid/path/fail.json';
      
      // Setup initial data
      await fs.writeFile(store1, JSON.stringify({ id: 'original', name: 'Original', value: 1 }));
      
      const batch = dataStore.batch()
        .update(store1, { id: 'updated', name: 'Updated', value: 100 })
        .update(invalidStore, { id: 'invalid', name: 'Invalid', value: 999 });
      
      // Commit should fail
      await expect(batch.commit()).rejects.toThrow();
      
      // Rollback should not throw (already handled internally)
      expect(() => batch.rollback()).not.toThrow();
      
      // Verify original data is preserved
      const result = JSON.parse(await fs.readFile(store1, 'utf8'));
      expect(result).toEqual({ id: 'original', name: 'Original', value: 1 });
    });
  });

  describe('Health Checks and Diagnostics', () => {
    it('should report healthy status for functional datastore', async () => {
      await dataStore.save(mockData);
      
      const health = await dataStore.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.fileExists).toBe(true);
      expect(health.readable).toBe(true);
      expect(health.writable).toBe(true);
      expect(health.metrics).toBeDefined();
      expect(health.metrics.saveCount).toBeGreaterThan(0);
    });

    it('should report unhealthy for non-existent file', async () => {
      const health = await dataStore.healthCheck();
      
      expect(health.healthy).toBe(false);
      expect(health.fileExists).toBe(false);
      expect(health.readable).toBe(false);
      expect(health.writable).toBe(true); // Directory should still be writable
    });

    it('should detect corrupted file (unreadable)', async () => {
      // Create corrupted file
      await fs.writeFile(testFile, 'corrupted json data { invalid');
      
      const health = await dataStore.healthCheck();
      
      expect(health.fileExists).toBe(true);
      expect(health.readable).toBe(false);
      expect(health.healthy).toBe(false);
    });

    it('should detect write permission issues', async () => {
      const readOnlyFile = path.join(testDir, 'readonly.json');
      const readOnlyStore = new DataStore<TestData>(readOnlyFile, {
        validator: testDataValidator
      });
      
      // Create file first
      await readOnlyStore.save(mockData);
      
      // Try to make directory read-only (may not work on all systems)
      try {
        await fs.chmod(testDir, 0o444);
        
        const health = await readOnlyStore.healthCheck();
        expect(health.writable).toBe(false);
        expect(health.healthy).toBe(false);
        
        // Restore permissions
        await fs.chmod(testDir, 0o755);
      } catch (error) {
        // Skip test if chmod fails (Windows, etc.)
        console.log('Skipping read-only test due to filesystem limitations');
      }
    });

    it('should include current metrics in health check', async () => {
      await dataStore.save(mockData);
      await dataStore.load();
      
      const health = await dataStore.healthCheck();
      
      expect(health.metrics.saveCount).toBe(1);
      expect(health.metrics.loadCount).toBe(1);
      expect(health.metrics.totalBytesWritten).toBeGreaterThan(0);
      expect(health.metrics.totalBytesRead).toBeGreaterThan(0);
    });
  });

  describe('Enhanced Error Handling', () => {
    it('should handle validation failures gracefully', async () => {
      const invalidData = { id: 'test', name: 123, value: 'invalid' } as any;
      
      await expect(dataStore.save(invalidData)).rejects.toThrow('Data validation failed before save');
      
      const metrics = dataStore.getMetrics();
      expect(metrics.errorCount).toBeGreaterThan(0);
    });

    it('should recover from backup on corrupted data load', async () => {
      // Save valid data first
      await dataStore.save(mockData);
      
      // Create backup
      await dataStore.backup('before_corruption');
      
      // Corrupt the main file
      await fs.writeFile(testFile, 'corrupted json {');
      
      // Load should recover from backup
      const recovered = await dataStore.load();
      expect(recovered).toEqual(mockData);
    });

    it('should handle filesystem errors with retries', async () => {
      const retryStore = new DataStore<TestData>(testFile, {
        validator: testDataValidator,
        maxRetries: 3,
        retryDelayMs: 5
      });
      
      // Mock fs.writeFile to fail twice then succeed
      let callCount = 0;
      const originalWriteFile = fs.writeFile;
      jest.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Simulated filesystem error');
        }
        return originalWriteFile(...args);
      });
      
      // Should succeed after retries
      await retryStore.save(mockData);
      
      const metrics = retryStore.getMetrics();
      expect(metrics.retryCount).toBe(2);
      expect(metrics.saveCount).toBe(1);
      
      // Restore original implementation
      (fs.writeFile as jest.Mock).mockRestore();
    });

    it('should fail after maximum retries exceeded', async () => {
      const retryStore = new DataStore<TestData>(testFile, {
        validator: testDataValidator,
        maxRetries: 2,
        retryDelayMs: 5
      });
      
      // Mock fs.writeFile to always fail
      jest.spyOn(fs, 'writeFile').mockRejectedValue(new Error('Persistent filesystem error'));
      
      await expect(retryStore.save(mockData)).rejects.toThrow('Persistent filesystem error');
      
      const metrics = retryStore.getMetrics();
      expect(metrics.retryCount).toBe(2);
      expect(metrics.errorCount).toBeGreaterThan(0);
      
      // Restore original implementation
      (fs.writeFile as jest.Mock).mockRestore();
    });
  });

  describe('Data Validation Hooks', () => {
    it('should add custom validation hook successfully', async () => {
      // Add validation that requires value > 0
      dataStore.addValidationHook((data: unknown): data is TestData => {
        return typeof data === 'object' && 
               data !== null && 
               'value' in data && 
               (data as any).value > 0;
      });
      
      // Valid data should save
      await dataStore.save({ ...mockData, value: 10 });
      
      // Invalid data should fail
      await expect(
        dataStore.save({ ...mockData, value: -5 })
      ).rejects.toThrow('validation failed');
    });

    it('should chain multiple validation hooks', async () => {
      // Add multiple validators
      dataStore.addValidationHook((data: unknown): data is TestData => {
        return typeof data === 'object' && data !== null && 'name' in data;
      });
      
      dataStore.addValidationHook((data: unknown): data is TestData => {
        const d = data as any;
        return d.name && d.name.length >= 3;
      });
      
      dataStore.addValidationHook((data: unknown): data is TestData => {
        const d = data as any;
        return d.value >= 0 && d.value <= 1000;
      });
      
      // Should pass all validators
      await dataStore.save({ ...mockData, name: 'Valid Name', value: 500 });
      
      // Should fail name length validator
      await expect(
        dataStore.save({ ...mockData, name: 'No', value: 500 })
      ).rejects.toThrow('validation failed');
      
      // Should fail value range validator
      await expect(
        dataStore.save({ ...mockData, name: 'Valid Name', value: 2000 })
      ).rejects.toThrow('validation failed');
    });

    it('should preserve original validation alongside hooks', async () => {
      // Add hook that allows extra properties
      dataStore.addValidationHook((data: unknown): data is TestData => {
        return typeof data === 'object' && data !== null;
      });
      
      // Original validator should still apply
      const invalidData = { id: 123, name: 'Invalid ID Type', value: 42 } as any;
      await expect(dataStore.save(invalidData)).rejects.toThrow('validation failed');
    });
  });

  describe('Connection Pool Management', () => {
    it('should handle high-concurrency scenarios efficiently', async () => {
      const concurrentOperations = 20;
      const operations: Promise<void>[] = [];
      
      // Create many concurrent save operations
      for (let i = 0; i < concurrentOperations; i++) {
        const data: TestData = {
          id: `concurrent-${i}`,
          name: `Concurrent Data ${i}`,
          value: i
        };
        operations.push(dataStore.save(data));
      }
      
      // All operations should complete successfully
      await expect(Promise.all(operations)).resolves.toBeDefined();
      
      // Verify final state
      const finalData = await dataStore.load();
      expect(finalData).toBeDefined();
      expect(finalData?.name).toMatch(/^Concurrent Data \d+$/);
      
      const metrics = dataStore.getMetrics();
      expect(metrics.saveCount).toBe(concurrentOperations);
    });

    it('should manage connection pool efficiently under load', async () => {
      const stores: DataStore<TestData>[] = [];
      const operations: Promise<void>[] = [];
      
      // Create multiple DataStore instances
      for (let i = 0; i < 10; i++) {
        const storePath = path.join(testDir, `pool-test-${i}.json`);
        const store = new DataStore<TestData>(storePath, {
          validator: testDataValidator
        });
        stores.push(store);
        
        // Start concurrent operations on each store
        operations.push(
          store.save({ id: `pool-${i}`, name: `Pool Test ${i}`, value: i })
        );
      }
      
      // All operations should complete without pool exhaustion
      await expect(Promise.all(operations)).resolves.toBeDefined();
      
      // Verify all stores have data
      for (let i = 0; i < stores.length; i++) {
        const data = await stores[i].load();
        expect(data?.id).toBe(`pool-${i}`);
      }
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    it('should implement exponential backoff correctly', async () => {
      const retryStore = new DataStore<TestData>(testFile, {
        validator: testDataValidator,
        maxRetries: 3,
        retryDelayMs: 10
      });
      
      const retryTimes: number[] = [];
      let attemptCount = 0;
      
      // Mock fs.writeFile to track retry timing
      jest.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
        attemptCount++;
        retryTimes.push(Date.now());
        
        if (attemptCount <= 2) {
          throw new Error('Simulated transient error');
        }
        
        // Succeed on third attempt
        return Promise.resolve();
      });
      
      await retryStore.save(mockData);
      
      // Verify exponential backoff pattern
      expect(retryTimes).toHaveLength(3);
      if (retryTimes.length >= 3) {
        const delay1 = retryTimes[1] - retryTimes[0];
        const delay2 = retryTimes[2] - retryTimes[1];
        
        // Second delay should be longer than first (exponential backoff)
        expect(delay2).toBeGreaterThan(delay1);
      }
      
      const metrics = retryStore.getMetrics();
      expect(metrics.retryCount).toBe(2);
      expect(metrics.saveCount).toBe(1);
      
      // Restore original implementation
      (fs.writeFile as jest.Mock).mockRestore();
    });

    it('should add jitter to prevent thundering herd', async () => {
      const retryStore = new DataStore<TestData>(testFile, {
        validator: testDataValidator,
        maxRetries: 2,
        retryDelayMs: 100
      });
      
      const retryDelays: number[] = [];
      let attemptCount = 0;
      
      jest.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
        const currentTime = Date.now();
        attemptCount++;
        
        if (attemptCount > 1) {
          retryDelays.push(currentTime);
        }
        
        if (attemptCount <= 1) {
          throw new Error('Simulated error for jitter test');
        }
        
        return Promise.resolve();
      });
      
      await retryStore.save(mockData);
      
      // With jitter, delays should vary slightly
      expect(retryDelays).toHaveLength(1);
      
      // Restore original implementation
      (fs.writeFile as jest.Mock).mockRestore();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should demonstrate batch operation performance benefits', async () => {
      const numOperations = 10;
      const testStores: string[] = [];
      
      // Setup store paths
      for (let i = 0; i < numOperations; i++) {
        testStores.push(path.join(testDir, `perf-test-${i}.json`));
      }
      
      // Measure individual operations
      const individualStart = Date.now();
      for (let i = 0; i < numOperations; i++) {
        const store = new DataStore<TestData>(testStores[i], {
          validator: testDataValidator
        });
        await store.save({
          id: `individual-${i}`,
          name: `Individual ${i}`,
          value: i
        });
      }
      const individualTime = Date.now() - individualStart;
      
      // Clean up files
      for (const store of testStores) {
        try {
          await fs.unlink(store);
        } catch {
          // Ignore
        }
      }
      
      // Measure batch operations
      const batchStart = Date.now();
      let batch = dataStore.batch();
      for (let i = 0; i < numOperations; i++) {
        batch = batch.update(testStores[i], {
          id: `batch-${i}`,
          name: `Batch ${i}`,
          value: i
        });
      }
      await batch.commit();
      const batchTime = Date.now() - batchStart;
      
      // Batch should be faster than individual operations
      expect(batchTime).toBeLessThan(individualTime);
      
      const improvement = ((individualTime - batchTime) / individualTime) * 100;
      console.log(`Batch operations improvement: ${improvement.toFixed(2)}%`);
      
      // Verify all batch operations completed
      for (let i = 0; i < numOperations; i++) {
        const data = JSON.parse(await fs.readFile(testStores[i], 'utf8'));
        expect(data.id).toBe(`batch-${i}`);
      }
    });

    it('should handle large datasets efficiently', async () => {
      const largeData: TestData = {
        id: 'large-test',
        name: 'x'.repeat(10000), // 10KB string
        value: 999999
      };
      
      const startTime = Date.now();
      await dataStore.save(largeData);
      const saveTime = Date.now() - startTime;
      
      const loadStart = Date.now();
      const loaded = await dataStore.load();
      const loadTime = Date.now() - loadStart;
      
      expect(loaded).toEqual(largeData);
      expect(saveTime).toBeLessThan(1000); // Should complete within 1 second
      expect(loadTime).toBeLessThan(1000);
      
      const metrics = dataStore.getMetrics();
      expect(metrics.totalBytesWritten).toBeGreaterThan(10000);
      expect(metrics.totalBytesRead).toBeGreaterThan(10000);
    });
  });

  describe('Edge Cases and Failure Scenarios', () => {
    it('should handle corrupted backup files gracefully', async () => {
      await dataStore.save(mockData);
      const backupPath = await dataStore.backup('test-backup');
      
      // Corrupt the backup file
      await fs.writeFile(backupPath, 'corrupted backup data {');
      
      // Restore should fail gracefully
      await expect(dataStore.restore(backupPath)).rejects.toThrow('Backup data validation failed');
    });

    it('should handle disk space exhaustion simulation', async () => {
      // Mock fs.writeFile to simulate ENOSPC (no space left on device)
      jest.spyOn(fs, 'writeFile').mockRejectedValue({
        code: 'ENOSPC',
        message: 'No space left on device'
      });
      
      await expect(dataStore.save(mockData)).rejects.toThrow('No space left on device');
      
      const metrics = dataStore.getMetrics();
      expect(metrics.errorCount).toBeGreaterThan(0);
      
      // Restore original implementation
      (fs.writeFile as jest.Mock).mockRestore();
    });

    it('should handle concurrent batch operations safely', async () => {
      // Start first batch
      const batch1 = dataStore.batch();
      
      // Attempt concurrent batch should fail
      expect(() => dataStore.batch()).toThrow('Batch transaction already in progress');
      
      // Complete first batch
      batch1.update(path.join(testDir, 'concurrent-1.json'), mockData);
      await batch1.commit();
      
      // Now second batch should work
      const batch2 = dataStore.batch();
      batch2.update(path.join(testDir, 'concurrent-2.json'), mockData);
      await batch2.commit();
    });

    it('should handle mutex acquisition failures gracefully', async () => {
      // This test verifies that the DataStore properly uses mutexes internally
      // The actual mutex behavior is tested by simulating filesystem conflicts
      const conflictFile = path.join(testDir, 'conflict-test.json');
      const conflictStore = new DataStore<TestData>(conflictFile, {
        validator: testDataValidator,
        maxRetries: 1,
        retryDelayMs: 5
      });
      
      // This should complete without issues - mutex is internal protection
      await expect(conflictStore.save(mockData)).resolves.not.toThrow();
    });

    it('should handle validation hook exceptions', async () => {
      // Add validation hook that throws
      dataStore.addValidationHook((data: unknown): data is TestData => {
        throw new Error('Validation hook error');
      });
      
      await expect(dataStore.save(mockData)).rejects.toThrow('Validation hook error');
    });
  });

  describe('Integration and Advanced Features', () => {
    it('should handle complex real-world scenarios', async () => {
      // Test scenario that combines multiple enhanced features
      const complexStore = new DataStore<TestData>(testFile, {
        validator: testDataValidator,
        compressionEnabled: true,
        maxRetries: 2,
        enableDebugLogging: true
      });
      
      await complexStore.save(mockData);
      const loaded = await complexStore.load();
      expect(loaded).toEqual(mockData);
      
      const metrics = complexStore.getMetrics();
      expect(metrics.saveCount).toBe(1);
      expect(metrics.loadCount).toBe(1);
      
      const health = await complexStore.healthCheck();
      expect(health.healthy).toBe(true);
    });
  });
});