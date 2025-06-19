#!/usr/bin/env ts-node

import { RateLimiter } from '../src/services/rateLimiter';
import fs from 'fs/promises';
import path from 'path';

/**
 * Demonstration script showing the I/O optimization improvements in RateLimiter
 */

async function demonstrateOptimization() {
  console.log('🚀 Rate Limiter I/O Optimization Demo\n');
  console.log('=====================================\n');

  const testFile = './demo-rate-limit.json';
  let writeCount = 0;
  let readCount = 0;

  // Track I/O operations
  const originalWriteFile = fs.writeFile;
  const originalReadFile = fs.readFile;
  
  // Mock fs operations to count I/O
  (fs as any).writeFile = async (file: string, data: any, options: any) => {
    writeCount++;
    console.log(`📝 Write #${writeCount} at ${new Date().toISOString()}`);
    return originalWriteFile(file, data, options);
  };
  
  (fs as any).readFile = async (file: string, options: any) => {
    readCount++;
    console.log(`📖 Read #${readCount} at ${new Date().toISOString()}`);
    return originalReadFile(file, options);
  };

  try {
    // Initialize rate limiter
    const rateLimiter = new RateLimiter(100, 1000, testFile);
    await rateLimiter.initialize();

    console.log('✅ Rate limiter initialized\n');
    console.log('📊 Configuration:');
    console.log('   - RPM Limit: 100 (90 with safety margin)');
    console.log('   - Daily Limit: 1000 (900 with safety margin)');
    console.log('   - Batch Flush: Every 5 seconds');
    console.log('   - Memory Sync: Every 30 seconds\n');

    console.log('🔄 Making 50 rapid API requests...\n');

    // Make rapid requests
    const startTime = Date.now();
    for (let i = 0; i < 50; i++) {
      const result = await rateLimiter.checkAndIncrement();
      if (i % 10 === 0) {
        console.log(`   Request ${i + 1}: ${result.allowed ? '✅ Allowed' : '❌ Denied'} - Remaining: ${result.remaining.minute}/min`);
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`\n⏱️  Processed 50 requests in ${elapsed}ms (${(elapsed / 50).toFixed(2)}ms per request)`);
    console.log(`📊 I/O Operations so far: ${writeCount} writes, ${readCount} reads`);

    console.log('\n⏳ Waiting 6 seconds for batch flush...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    console.log(`📊 After batch flush: ${writeCount} writes, ${readCount} reads`);
    
    console.log('\n🔄 Making 30 more requests...');
    for (let i = 0; i < 30; i++) {
      await rateLimiter.checkAndIncrement();
    }
    
    console.log(`📊 After 80 total requests: ${writeCount} writes, ${readCount} reads`);
    
    console.log('\n💾 Shutting down (triggers final sync)...');
    await rateLimiter.shutdown();
    
    console.log(`\n📊 Final I/O count: ${writeCount} writes, ${readCount} reads`);
    
    // Calculate optimization
    const expectedWrites = 80; // Without optimization: 1 write per request
    const actualWrites = writeCount;
    const reduction = ((expectedWrites - actualWrites) / expectedWrites * 100).toFixed(1);
    
    console.log('\n🎯 Optimization Results:');
    console.log('========================');
    console.log(`Without optimization: ${expectedWrites} writes expected`);
    console.log(`With optimization: ${actualWrites} writes performed`);
    console.log(`I/O Reduction: ${reduction}%`);
    console.log(`Average response time: ${(elapsed / 50).toFixed(2)}ms`);
    
    // Show memory efficiency
    const memUsage = process.memoryUsage();
    console.log(`\nMemory usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Restore original functions
    (fs as any).writeFile = originalWriteFile;
    (fs as any).readFile = originalReadFile;
    
    // Cleanup
    try {
      await fs.unlink(testFile);
      await fs.unlink(`${testFile}.backup`);
    } catch (error) {
      // Files might not exist
    }
  }
}

// Run the demo
console.log('Starting Rate Limiter I/O Optimization Demo...\n');
demonstrateOptimization().catch(console.error);