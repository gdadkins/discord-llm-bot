import { BenchmarkSuite, MemoryProfiler } from './base';
import { ContextManager } from '../../src/services/context/ContextManager';

export async function runEnhancedContextBenchmarks() {
  const suite = new BenchmarkSuite();
  
  // Test data generation
  const generateLargeContext = (items: number) => {
    const contexts: Array<{ serverId: string; userId: string; moment: string; code?: string; gag?: string }> = [];
    for (let i = 0; i < items; i++) {
      const serverId = `server_${Math.floor(i / 50)}`;
      const userId = `user_${Math.floor(i / 10)}`;
      
      contexts.push({
        serverId,
        userId,
        moment: `This is embarrassing moment ${i}. They tried to deploy on Friday and it broke everything. The database crashed and they had to rollback. It was a complete disaster that took 3 hours to fix. Everyone was working late because of this mistake.`.repeat(2),
        code: i % 3 === 0 ? `function badCode${i}() {\n  // This is terrible code\n  console.log("broken");\n  return null;\n}\nbadCode${i}();` : undefined,
        gag: i % 5 === 0 ? `Running gag ${i}: This person always forgets semicolons and breaks the build` : undefined
      });
    }
    return contexts;
  };

  // Benchmark 1: Memory optimization comparison (Original vs Enhanced)
  suite.add('ContextManager - Original memory usage (1000 items)', () => {
    const manager = new ContextManager();
    const contexts = generateLargeContext(1000);
    
    contexts.forEach(c => {
      manager.addEmbarrassingMoment(c.serverId, c.userId, c.moment);
      if (c.code) {
        manager.addCodeSnippet(c.serverId, c.userId, c.code, 'Bad code example');
      }
      if (c.gag) {
        manager.addRunningGag(c.serverId, c.gag);
      }
    });
    
    const stats = manager.getMemoryStats();
    return stats.totalMemoryUsage;
  }, { iterations: 100, warmup: 10 });

  // Benchmark 2: Compression effectiveness
  suite.add('ContextManager - Compression after summarization', () => {
    const manager = new ContextManager();
    const contexts = generateLargeContext(500);
    
    // Add lots of similar content to test deduplication
    contexts.forEach(c => {
      manager.addEmbarrassingMoment(c.serverId, c.userId, c.moment);
      // Add duplicates intentionally
      if (Math.random() < 0.3) {
        manager.addEmbarrassingMoment(c.serverId, c.userId, c.moment);
      }
      if (c.code) {
        manager.addCodeSnippet(c.serverId, c.userId, c.code, 'Bad code example');
      }
      if (c.gag) {
        manager.addRunningGag(c.serverId, c.gag);
      }
    });
    
    const statsBefore = manager.getMemoryStats();
    
    // Test manual deduplication
    const serverId = 'server_0';
    const duplicatesRemoved = manager.deduplicateServerContext(serverId);
    
    // Test manual summarization
    const summarized = manager.summarizeServerContextNow(serverId);
    
    const statsAfter = manager.getMemoryStats();
    const compressionRatio = statsAfter.totalMemoryUsage / statsBefore.totalMemoryUsage;
    
    return { 
      before: statsBefore.totalMemoryUsage, 
      after: statsAfter.totalMemoryUsage,
      ratio: compressionRatio,
      duplicatesRemoved,
      summarized
    };
  }, { iterations: 50, warmup: 5 });

  // Benchmark 3: Cross-server context performance
  suite.add('ContextManager - Cross-server context building', () => {
    const manager = new ContextManager();
    const userId = 'test_user';
    
    // Add data to multiple servers
    for (let i = 0; i < 5; i++) {
      const serverId = `server_${i}`;
      manager.enableCrossServerContext(userId, serverId, true);
      
      for (let j = 0; j < 20; j++) {
        manager.addEmbarrassingMoment(serverId, userId, `Cross-server moment ${i}-${j}: They messed up deployment again`);
        if (j % 3 === 0) {
          manager.addCodeSnippet(serverId, userId, `console.log("bad code ${i}-${j}");`, 'Cross-server bad code');
        }
      }
    }
    
    // Build context for one server, should include cross-server data
    const context = manager.buildSuperContext('server_0', userId);
    return context.length;
  }, { iterations: 200, warmup: 20 });

  // Benchmark 4: Relevance scoring performance
  suite.add('ContextManager - Relevance-based context selection', () => {
    const manager = new ContextManager();
    const serverId = 'test_server';
    const userId = 'test_user';
    
    // Add items with varying relevance
    const highRelevanceItems = [
      'They deleted the production database by mistake',
      'Always forgets to handle errors in their API calls',
      'Constantly pushes broken code to main branch'
    ];
    
    const lowRelevanceItems = [
      'Said hello in the meeting',
      'Asked about the weather',
      'Mentioned they like coffee'
    ];
    
    // Add high relevance items
    highRelevanceItems.forEach((item, i) => {
      manager.addEmbarrassingMoment(serverId, userId, item);
    });
    
    // Add many low relevance items
    lowRelevanceItems.forEach((item, i) => {
      for (let j = 0; j < 20; j++) {
        manager.addEmbarrassingMoment(serverId, `user_${j}`, `${item} ${j}`);
      }
    });
    
    // Build context - should prioritize high relevance items
    const context = manager.buildSuperContext(serverId, userId);
    
    // Check if high relevance items are preserved
    const highRelevancePreserved = highRelevanceItems.every(item => 
      context.includes(item.substring(0, 20))
    );
    
    return { contextLength: context.length, highRelevancePreserved };
  }, { iterations: 100, warmup: 10 });

  // Benchmark 5: Memory growth simulation with automatic optimization
  const memoryProfiler = new MemoryProfiler();
  
  suite.add('ContextManager - Long-term memory optimization', () => {
    const manager = new ContextManager();
    memoryProfiler.reset();
    memoryProfiler.start(100);
    
    let totalMemoryBefore = 0;
    let totalMemoryAfter = 0;
    
    // Simulate 1 hour of heavy usage
    for (let minute = 0; minute < 60; minute++) {
      const serverId = `server_${minute % 3}`;
      
      // Add data each minute
      for (let item = 0; item < 10; item++) {
        const userId = `user_${(minute * 10 + item) % 20}`;
        manager.addEmbarrassingMoment(serverId, userId, `Minute ${minute} moment ${item}: They made another deployment mistake`);
        
        if (item % 2 === 0) {
          manager.addCodeSnippet(serverId, userId, `// Minute ${minute} bad code\nconsole.log("broken");`, 'Time-based bad code');
        }
        
        if (item % 5 === 0) {
          manager.addRunningGag(serverId, `Minute ${minute} gag: Always breaks things`);
        }
      }
      
      // Snapshot memory every 10 minutes
      if (minute % 10 === 0) {
        const stats = manager.getMemoryStats();
        if (minute === 0) totalMemoryBefore = stats.totalMemoryUsage;
        memoryProfiler.snapshot(`minute_${minute}`);
      }
      
      // Trigger summarization every 30 minutes
      if (minute % 30 === 0 && minute > 0) {
        manager.summarizeServerContextNow(`server_${minute % 3}`);
      }
    }
    
    const finalStats = manager.getMemoryStats();
    totalMemoryAfter = finalStats.totalMemoryUsage;
    
    memoryProfiler.stop();
    
    const memoryGrowthRatio = totalMemoryAfter / totalMemoryBefore;
    const avgCompressionRatio = finalStats.compressionStats.averageCompressionRatio;
    
    return {
      memoryGrowthRatio,
      avgCompressionRatio,
      finalMemoryKB: totalMemoryAfter / 1024,
      memorySavedKB: finalStats.compressionStats.totalMemorySaved / 1024
    };
  }, { iterations: 10, warmup: 2 });

  // Run benchmarks
  const results = await suite.run();
  
  // Analyze results for 40% memory reduction validation
  console.log('\n=== ENHANCED CONTEXT MANAGEMENT PERFORMANCE ANALYSIS ===');
  console.log('Target: 40% memory reduction while maintaining functionality\n');
  
  results.forEach((result, index) => {
    console.log(`Benchmark ${index + 1}: ${result.name}`);
    console.log(`  Operations/sec: ${result.opsPerSec.toFixed(2)}`);
    console.log(`  Average time: ${result.averageTime.toFixed(2)}ms`);
    console.log(`  Memory impact: ${result.memoryImpact.toFixed(2)}MB`);
    
    if (result.customData) {
      console.log(`  Custom metrics:`, result.customData);
    }
    console.log('');
  });
  
  // Memory profile report
  console.log('Memory Profile Report:');
  console.log(JSON.stringify(memoryProfiler.getReport(), null, 2));
  
  // Validation report
  console.log('\n=== MEMORY OPTIMIZATION VALIDATION ===');
  const longTermResult = results[results.length - 1];
  if (longTermResult.customData && longTermResult.customData.avgCompressionRatio) {
    const compressionRatio = longTermResult.customData.avgCompressionRatio;
    const memoryReduction = (1 - compressionRatio) * 100;
    
    console.log(`Achieved compression ratio: ${(compressionRatio * 100).toFixed(1)}%`);
    console.log(`Memory reduction achieved: ${memoryReduction.toFixed(1)}%`);
    console.log(`Target achievement: ${memoryReduction >= 40 ? '✅ SUCCESS' : '❌ NEEDS IMPROVEMENT'}`);
    console.log(`Memory saved: ${longTermResult.customData.memorySavedKB?.toFixed(2)}KB`);
  }
  
  return results;
}

// If running directly
if (require.main === module) {
  runEnhancedContextBenchmarks().then(() => {
    console.log('Enhanced Context Manager benchmarks completed');
  });
}