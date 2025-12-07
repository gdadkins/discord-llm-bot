import { BenchmarkSuite, MemoryProfiler } from './base';
import { ContextManager } from '../../src/services/contextManager';

export async function runContextManagerBenchmarks() {
  const suite = new BenchmarkSuite();
  
  // Test data generation
  const generateContext = (size: number) => {
    const contexts: Array<{ serverId: string; userId: string; moment: string }> = [];
    for (let i = 0; i < size; i++) {
      contexts.push({
        serverId: `server_${Math.floor(i / 10)}`,
        userId: `user_${i}`,
        moment: `This is a test embarrassing moment ${i}. `.repeat(5)
      });
    }
    return contexts;
  };

  const generateServerContext = (items: number) => {
    const context: any = {
      embarrassingMoments: [],
      runningGags: [],
      codeSnippets: []
    };

    for (let i = 0; i < items; i++) {
      context.embarrassingMoments.push({
        userId: `user_${i % 10}`,
        moment: `Embarrassing moment ${i}`,
        timestamp: Date.now() - i * 1000
      });
      
      if (i % 2 === 0) {
        context.runningGags.push(`Running gag number ${i}`);
      }
      
      if (i % 3 === 0) {
        context.codeSnippets.push({
          userId: `user_${i % 10}`,
          language: 'typescript',
          code: `console.log("Test code ${i}");`.repeat(5)
        });
      }
    }

    return context;
  };

  // Benchmark 1: JSON.stringify performance with various context sizes
  suite.add('ContextManager - JSON.stringify small (10 items)', () => {
    const manager = new ContextManager();
    const contexts = generateContext(10);
    contexts.forEach(c => manager.addEmbarrassingMoment(c.serverId, c.userId, c.moment));
    
    const context = manager.buildSuperContext('server_0', 'user_5');
    JSON.stringify(context);
  }, { iterations: 10000 });

  suite.add('ContextManager - JSON.stringify medium (100 items)', () => {
    const manager = new ContextManager();
    const contexts = generateContext(100);
    contexts.forEach(c => manager.addEmbarrassingMoment(c.serverId, c.userId, c.moment));
    
    const context = manager.buildSuperContext('server_5', 'user_50');
    JSON.stringify(context);
  }, { iterations: 5000 });

  suite.add('ContextManager - JSON.stringify large (1000 items)', () => {
    const manager = new ContextManager();
    const contexts = generateContext(1000);
    contexts.forEach(c => manager.addEmbarrassingMoment(c.serverId, c.userId, c.moment));
    
    const context = manager.buildSuperContext('server_50', 'user_500');
    JSON.stringify(context);
  }, { iterations: 1000 });

  // Benchmark 2: Context trimming performance
  suite.add('ContextManager - trimContext performance', () => {
    const manager = new ContextManager();
    const longMoment = 'x'.repeat(6000); // Create large embarrassing moment
    
    // Add many moments to trigger trimming
    for (let i = 0; i < 20; i++) {
      manager.addEmbarrassingMoment('testServer', `testUser${i}`, longMoment);
    }
  }, { iterations: 5000 });

  // Benchmark 3: Server context operations
  suite.add('ContextManager - buildSuperContext small', () => {
    const manager = new ContextManager();
    const serverContext = generateServerContext(10);
    
    // Set server contexts
    serverContext.embarrassingMoments.forEach((m: any) => 
      manager.addEmbarrassingMoment('testServer', m.userId, m.moment)
    );
    serverContext.runningGags.forEach((g: string) => 
      manager.addRunningGag('testServer', g)
    );
    
    manager.buildSuperContext('testServer', 'user_1');
  }, { iterations: 10000 });

  suite.add('ContextManager - buildSuperContext large', () => {
    const manager = new ContextManager();
    const serverContext = generateServerContext(100);
    
    // Set server contexts
    serverContext.embarrassingMoments.forEach((m: any) => 
      manager.addEmbarrassingMoment('testServer', m.userId, m.moment)
    );
    serverContext.runningGags.forEach((g: string) => 
      manager.addRunningGag('testServer', g)
    );
    
    manager.buildSuperContext('testServer', 'user_50');
  }, { iterations: 1000 });

  // Benchmark 4: Memory stats operations
  suite.add('ContextManager - getMemoryStats', () => {
    const manager = new ContextManager();
    const contexts = generateContext(50);
    
    // Add contexts
    contexts.forEach(c => {
      manager.addEmbarrassingMoment(c.serverId, c.userId, c.moment);
      manager.addRunningGag(c.serverId, `Gag for ${c.userId}`);
    });
    
    manager.getMemoryStats();
  }, { iterations: 5000 });

  // Benchmark 5: Memory profiling for long-running operations
  const memoryProfiler = new MemoryProfiler();
  
  suite.add('ContextManager - memory growth simulation', () => {
    const manager = new ContextManager();
    memoryProfiler.reset();
    memoryProfiler.start(50);
    
    // Simulate typical usage pattern
    for (let i = 0; i < 100; i++) {
      const serverId = `server_${i % 5}`;
      const userId = `user_${i % 20}`;
      
      manager.addEmbarrassingMoment(serverId, userId, `Moment ${i}: `.repeat(10));
      
      if (i % 10 === 0) {
        manager.addRunningGag(serverId, `Gag ${i}`);
      }
      
      if (i % 20 === 0) {
        manager.getMemoryStats();
        memoryProfiler.snapshot('memory_check');
      }
    }
    
    memoryProfiler.stop();
  }, { iterations: 100, warmup: 10 });

  // Run benchmarks
  const results = await suite.run();
  
  // Save memory profile report
  console.log('\nMemory Profile Report:');
  console.log(JSON.stringify(memoryProfiler.getReport(), null, 2));
  
  return results;
}

// If running directly
if (require.main === module) {
  runContextManagerBenchmarks().then(() => {
    console.log('Context Manager benchmarks completed');
  });
}