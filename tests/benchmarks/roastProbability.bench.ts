import { BenchmarkSuite, MemoryProfiler } from './base';
import { GeminiService } from '../../src/services/gemini';
import { ContextManager } from '../../src/services/context/ContextManager';
import { RateLimiter } from '../../src/services/rate-limiting/RateLimiter';

export async function runRoastProbabilityBenchmarks() {
  const suite = new BenchmarkSuite();
  
  // Setup test environment
  const testApiKey = 'test-key-for-benchmarking';
  
  // Mock GeminiService to avoid actual API calls
  class BenchmarkGeminiService extends GeminiService {
    constructor() {
      super(testApiKey);
    }
    
    // Override shouldRoast to make it public for benchmarking
    public testShouldRoast(userId: string, message: string = '', serverId?: string): boolean {
      return (this as any).shouldRoast(userId, message, serverId);
    }
    
    // Override helper methods for testing
    public testGetConsecutiveBonus(questionCount: number): number {
      return (this as any).getConsecutiveBonus(questionCount);
    }
    
    public testCalculateComplexityModifier(message: string): number {
      return (this as any).calculateComplexityModifier(message);
    }
    
    public testGetTimeBasedModifier(): number {
      return (this as any).getTimeBasedModifier();
    }
    
    public testGetMoodModifier(questionCount: number): number {
      return (this as any).getMoodModifier(questionCount);
    }
    
    public testUpdateRoastDebt(userId: string, serverId?: string): number {
      return (this as any).updateRoastDebt(userId, serverId);
    }
    
    public testGetServerInfluenceModifier(serverId?: string): number {
      return (this as any).getServerInfluenceModifier(serverId);
    }
    
    // Reset state for benchmarking
    public resetRoastingState(): void {
      (this as any).roastingState = {
        baseChance: 0.5,
        botMood: 'normal',
        moodStartTime: Date.now(),
        chaosMode: { active: false, multiplier: 1, lastEventTime: 0 },
        roastDebt: new Map(),
        serverRoastHistory: new Map()
      };
      (this as any).userQuestionCounts = new Map();
    }
  }

  const geminiService = new BenchmarkGeminiService();

  // Test message generation
  const generateMessage = (complexity: 'simple' | 'medium' | 'complex'): string => {
    switch (complexity) {
      case 'simple':
        return 'Hello how are you?';
      case 'medium':
        return 'I need help with understanding how to implement a function that calculates fibonacci numbers efficiently.';
      case 'complex':
        return 'Can you explain the differences between synchronous and asynchronous programming paradigms, particularly in the context of JavaScript event loops, Promise resolution, and how they impact memory management and performance optimization strategies?';
      default:
        return 'Test message';
    }
  };

  // Benchmark 1: Basic shouldRoast calculation
  suite.add('RoastProbability - basic shouldRoast calculation', () => {
    geminiService.resetRoastingState();
    geminiService.testShouldRoast('user1', 'Hello world');
  }, { iterations: 50000 });

  // Benchmark 2: Consecutive bonus calculations
  suite.add('RoastProbability - consecutive bonus (low count)', () => {
    geminiService.testGetConsecutiveBonus(3);
  }, { iterations: 100000 });

  suite.add('RoastProbability - consecutive bonus (high count)', () => {
    geminiService.testGetConsecutiveBonus(15);
  }, { iterations: 100000 });

  // Benchmark 3: Complexity modifier calculations
  suite.add('RoastProbability - complexity modifier simple', () => {
    geminiService.testCalculateComplexityModifier(generateMessage('simple'));
  }, { iterations: 50000 });

  suite.add('RoastProbability - complexity modifier complex', () => {
    geminiService.testCalculateComplexityModifier(generateMessage('complex'));
  }, { iterations: 20000 });

  // Benchmark 4: Time-based modifiers
  suite.add('RoastProbability - time-based modifier', () => {
    geminiService.testGetTimeBasedModifier();
  }, { iterations: 100000 });

  // Benchmark 5: Mood modifiers (various moods)
  const moods = ['sleepy', 'caffeinated', 'chaotic', 'reverse_psychology', 'bloodthirsty'];
  
  moods.forEach(mood => {
    suite.add(`RoastProbability - mood modifier (${mood})`, () => {
      // Set specific mood for testing
      (geminiService as any).roastingState.botMood = mood;
      geminiService.testGetMoodModifier(5);
    }, { iterations: 20000 });
  });

  // Benchmark 6: Roast debt calculations
  suite.add('RoastProbability - roast debt update', () => {
    geminiService.testUpdateRoastDebt('user1', 'server1');
  }, { iterations: 50000 });

  // Benchmark 7: Server influence calculations
  suite.add('RoastProbability - server influence modifier', () => {
    geminiService.testGetServerInfluenceModifier('server1');
  }, { iterations: 50000 });

  // Benchmark 8: Full probability calculation simulation
  suite.add('RoastProbability - full calculation sequence', () => {
    geminiService.resetRoastingState();
    const userId = 'user1';
    const serverId = 'server1';
    const message = generateMessage('medium');
    
    // Simulate the full calculation sequence
    geminiService.testShouldRoast(userId, message, serverId);
  }, { iterations: 10000 });

  // Benchmark 9: Chaos mode performance
  suite.add('RoastProbability - chaos mode active', () => {
    geminiService.resetRoastingState();
    // Enable chaos mode
    (geminiService as any).roastingState.chaosMode = {
      active: true,
      multiplier: 1.5,
      lastEventTime: Date.now()
    };
    
    geminiService.testShouldRoast('user1', 'test message', 'server1');
  }, { iterations: 10000 });

  // Benchmark 10: High-frequency decision making
  const memoryProfiler = new MemoryProfiler();
  
  suite.add('RoastProbability - sustained decision making', () => {
    geminiService.resetRoastingState();
    memoryProfiler.reset();
    memoryProfiler.start(100);
    
    // Simulate rapid decision making for multiple users
    for (let i = 0; i < 50; i++) {
      const userId = `user${i % 10}`;
      const serverId = 'benchmark-server';
      const message = generateMessage(['simple', 'medium', 'complex'][i % 3] as any);
      
      geminiService.testShouldRoast(userId, message, serverId);
    }
    
    memoryProfiler.stop();
  }, { iterations: 1000, warmup: 10 });

  // Benchmark 11: Cache performance under load
  suite.add('RoastProbability - cache performance', () => {
    // Test cached calculations vs non-cached
    const hour = new Date().getHours();
    
    // First call should calculate and cache
    geminiService.testGetTimeBasedModifier();
    
    // Subsequent calls should use cache
    for (let i = 0; i < 10; i++) {
      geminiService.testGetTimeBasedModifier();
    }
  }, { iterations: 10000 });

  // Benchmark 12: Memory usage patterns
  suite.add('RoastProbability - memory usage tracking', () => {
    geminiService.resetRoastingState();
    
    // Build up various state maps
    for (let i = 0; i < 100; i++) {
      const userId = `user${i}`;
      const serverId = `server${i % 5}`;
      
      // This will populate various maps and caches
      geminiService.testShouldRoast(userId, `message ${i}`, serverId);
      geminiService.testUpdateRoastDebt(userId, serverId);
    }
    
    // Cleanup test
    geminiService.resetRoastingState();
  }, { iterations: 500, warmup: 10 });

  // Benchmark 13: Edge case handling
  suite.add('RoastProbability - edge case handling', () => {
    geminiService.resetRoastingState();
    
    // Test various edge cases
    geminiService.testShouldRoast('', ''); // Empty values
    geminiService.testShouldRoast('user1', ''); // Empty message
    geminiService.testShouldRoast('user1', 'x'.repeat(5000)); // Very long message
    geminiService.testCalculateComplexityModifier(''); // Empty complexity
    geminiService.testGetConsecutiveBonus(0); // Zero count
    geminiService.testGetConsecutiveBonus(100); // Very high count
  }, { iterations: 20000 });

  // Run benchmarks
  const results = await suite.run();
  
  // Analysis of results
  console.log('\nRoast Probability Performance Analysis:');
  console.log('======================================');
  
  const basicResult = results.find(r => r.name.includes('basic shouldRoast'));
  const fullResult = results.find(r => r.name.includes('full calculation sequence'));
  const chaosResult = results.find(r => r.name.includes('chaos mode'));
  
  if (basicResult && fullResult) {
    const overhead = (fullResult.avgTimePerOp - basicResult.avgTimePerOp) / basicResult.avgTimePerOp * 100;
    console.log(`Full calculation overhead: ${overhead.toFixed(2)}%`);
    console.log(`Basic calculation: ${basicResult.opsPerSecond.toFixed(2)} ops/sec`);
    console.log(`Full calculation: ${fullResult.opsPerSecond.toFixed(2)} ops/sec`);
  }
  
  if (chaosResult) {
    console.log(`Chaos mode performance: ${chaosResult.opsPerSecond.toFixed(2)} ops/sec`);
  }

  // Cache efficiency analysis
  const timeModifierResults = results.filter(r => r.name.includes('time-based modifier'));
  if (timeModifierResults.length > 0) {
    console.log(`Time modifier calculation: ${timeModifierResults[0].opsPerSecond.toFixed(2)} ops/sec`);
  }

  // Memory profiling report
  console.log('\nSustained Decision Making Memory Profile:');
  console.log(JSON.stringify(memoryProfiler.getReport(), null, 2));

  return results;
}

// If running directly
if (require.main === module) {
  runRoastProbabilityBenchmarks().then(() => {
    console.log('Roast Probability benchmarks completed');
  });
}