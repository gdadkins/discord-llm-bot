/**
 * Basic Tests for Chaos Engineering Framework
 * 
 * Validates core functionality of the chaos testing framework.
 * These tests can be run independently to verify the framework works.
 */

import { describe, test, expect, jest } from '@jest/globals';
import { ChaosTestFramework, type ChaosScenario } from './ChaosTestFramework';

describe('ChaosTestFramework', () => {
  let framework: ChaosTestFramework;

  beforeEach(() => {
    framework = new ChaosTestFramework({
      maxConcurrentScenarios: 1,
      recoveryTimeoutMs: 5000
    });
  });

  test('should initialize framework correctly', () => {
    expect(framework).toBeDefined();
  });

  test('should add and retrieve scenarios', () => {
    const testScenario: ChaosScenario = {
      name: 'test_scenario',
      description: 'A test scenario',
      setup: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };

    framework.addScenario(testScenario);
    
    // Framework doesn't expose scenarios publicly, but we can test by running
    expect(() => framework.addScenario(testScenario)).toThrow('already exists');
  });

  test('should run a simple scenario successfully', async () => {
    const mockFunctions = {
      setup: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };

    const testScenario: ChaosScenario = {
      name: 'simple_test',
      description: 'A simple test scenario',
      ...mockFunctions
    };

    framework.addScenario(testScenario);
    
    const result = await framework.runScenario('simple_test');
    
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(4); // setup, execute, verify, cleanup
    expect(result.duration).toBeGreaterThan(0);
    
    // Verify all functions were called
    expect(mockFunctions.setup).toHaveBeenCalledTimes(1);
    expect(mockFunctions.execute).toHaveBeenCalledTimes(1);
    expect(mockFunctions.verify).toHaveBeenCalledTimes(1);
    expect(mockFunctions.cleanup).toHaveBeenCalledTimes(1);
  }, 10000);

  test('should handle scenario failures gracefully', async () => {
    const testScenario: ChaosScenario = {
      name: 'failing_test',
      description: 'A failing test scenario',
      setup: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockRejectedValue(new Error('Test failure')),
      verify: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };

    framework.addScenario(testScenario);
    
    const result = await framework.runScenario('failing_test');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Test failure');
    
    // Cleanup should still be called even on failure
    expect(testScenario.cleanup).toHaveBeenCalledTimes(1);
  }, 10000);

  test('should generate meaningful reports', async () => {
    const successScenario: ChaosScenario = {
      name: 'success_test',
      description: 'A successful test',
      setup: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };

    const failScenario: ChaosScenario = {
      name: 'fail_test',
      description: 'A failing test',
      setup: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockRejectedValue(new Error('Intentional failure')),
      verify: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };

    framework.addScenario(successScenario);
    framework.addScenario(failScenario);
    
    await framework.runScenario('success_test');
    await framework.runScenario('fail_test');
    
    const report = framework.generateReport();
    
    expect(report.totalScenarios).toBe(2);
    expect(report.successfulScenarios).toBe(1);
    expect(report.failedScenarios).toBe(1);
    expect(report.successRate).toBe(0.5);
    expect(report.scenarios).toHaveLength(2);
    expect(report.recommendations).toBeDefined();
  }, 15000);

  test('should track system state during execution', async () => {
    const testScenario: ChaosScenario = {
      name: 'state_tracking_test',
      description: 'Tests system state tracking',
      setup: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockImplementation(async () => {
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 100));
      }),
      verify: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };

    framework.addScenario(testScenario);
    
    const result = await framework.runScenario('state_tracking_test');
    
    expect(result.success).toBe(true);
    expect(result.systemState).toBeDefined();
    expect(result.systemState?.memoryUsage).toBeGreaterThan(0);
    
    // Check if system state history was captured
    const stateHistory = framework.getSystemStateHistory();
    expect(stateHistory.length).toBeGreaterThan(0);
  }, 10000);

  test('should handle concurrent scenario limits', async () => {
    const slowScenario: ChaosScenario = {
      name: 'slow_test',
      description: 'A slow running test',
      setup: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
      }),
      verify: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };

    framework.addScenario(slowScenario);
    
    // Start first scenario (should work)
    const promise1 = framework.runScenario('slow_test');
    
    // Try to start second scenario (should fail due to concurrent limit)
    await expect(framework.runScenario('slow_test')).rejects.toThrow('already running');
    
    // Wait for first to complete
    const result = await promise1;
    expect(result.success).toBe(true);
  }, 15000);
});

describe('ChaosTestFramework Integration', () => {
  test('should demonstrate basic chaos testing workflow', async () => {
    const framework = new ChaosTestFramework();
    
    // Simulate a simple API timeout scenario
    const mockApiTimeoutScenario: ChaosScenario = {
      name: 'mock_api_timeout',
      description: 'Simulates API timeout and validates error handling',
      
      setup: async () => {
        // Mock setup - would normally mock actual services
        console.log('Setting up API timeout simulation');
      },
      
      execute: async () => {
        // Simulate API calls that timeout
        console.log('Executing API timeout scenario');
        // Would normally trigger actual timeouts
      },
      
      verify: async () => {
        // Verify error handling worked
        console.log('Verifying error handling behavior');
        // Would check circuit breakers, fallbacks, etc.
      },
      
      cleanup: async () => {
        // Clean up mocks and state
        console.log('Cleaning up scenario');
      }
    };

    framework.addScenario(mockApiTimeoutScenario);
    
    const result = await framework.runScenario('mock_api_timeout');
    
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(4);
    
    const report = framework.generateReport();
    expect(report.totalScenarios).toBe(1);
    expect(report.successRate).toBe(1.0);
    
    console.log('Chaos test completed successfully');
    console.log('Report:', JSON.stringify(report, null, 2));
  }, 10000);
});