/**
 * System Resilience Test Suite
 * 
 * Comprehensive test suite for validating system resilience under various failure conditions.
 * Uses the chaos testing framework to execute scenarios and validate recovery behavior.
 * 
 * @module ResilienceTests
 */

import { describe, test, beforeAll, afterAll, beforeEach, afterEach, expect, jest } from '@jest/globals';
import { ChaosTestFramework, type TestResult } from '../chaos/ChaosTestFramework';
import { serviceFailureScenarios, clearTestState } from '../chaos/scenarios/ServiceFailures';
import { logger } from '../../src/utils/logger';

// Test configuration
const TEST_CONFIG = {
  maxConcurrentScenarios: 1, // Run one at a time for deterministic results
  failureThreshold: 0.1, // 10% failure threshold
  recoveryTimeoutMs: 45000, // 45 seconds
  systemStatePollingInterval: 2000, // 2 seconds
  enableMetricsCollection: true,
  enableSystemStateTracking: true
};

describe('System Resilience', () => {
  let chaosFramework: ChaosTestFramework;
  let testResults: Map<string, TestResult> = new Map();

  beforeAll(async () => {
    logger.info('Initializing resilience test suite');
    
    // Initialize chaos framework
    chaosFramework = new ChaosTestFramework(TEST_CONFIG);
    
    // Load all service failure scenarios
    serviceFailureScenarios.forEach(scenario => {
      chaosFramework.addScenario(scenario);
    });
    
    logger.info(`Loaded ${serviceFailureScenarios.length} chaos scenarios for resilience testing`);
  });

  afterAll(async () => {
    logger.info('Completing resilience test suite');
    
    // Generate comprehensive test report
    const report = chaosFramework.generateReport();
    logger.info('Resilience Test Summary', {
      totalScenarios: report.totalScenarios,
      successfulScenarios: report.successfulScenarios,
      failedScenarios: report.failedScenarios,
      successRate: `${(report.successRate * 100).toFixed(1)}%`,
      averageExecutionTime: `${report.averageExecutionTime.toFixed(0)}ms`,
      averageRecoveryTime: `${report.averageRecoveryTime.toFixed(0)}ms`
    });
    
    // Log recommendations
    if (report.recommendations.length > 0) {
      logger.warn('Resilience Test Recommendations', {
        recommendations: report.recommendations
      });
    }
  });

  beforeEach(() => {
    // Clear any previous test state
    clearTestState();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    clearTestState();
  });

  describe('Service Failures', () => {
    test('handles Gemini API timeouts gracefully', async () => {
      logger.info('Starting Gemini API timeout resilience test');
      
      const result = await chaosFramework.runScenario('gemini_api_timeout');
      testResults.set('gemini_api_timeout', result);
      
      // Validate test execution
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(4); // setup, execute, verify, cleanup
      expect(result.duration).toBeGreaterThan(0);
      
      // Validate all steps completed successfully
      for (const step of result.steps) {
        expect(step.success).toBe(true);
        expect(step.duration).toBeGreaterThan(0);
      }
      
      // Validate recovery time is reasonable
      if (result.recoveryTime !== undefined) {
        expect(result.recoveryTime).toBeLessThan(30000); // Should recover within 30s
      }
      
      // Validate system state was captured
      expect(result.systemState).toBeDefined();
      expect(result.systemState?.memoryUsage).toBeGreaterThan(0);
      
      logger.info('Gemini API timeout resilience test completed successfully', {
        duration: result.duration,
        recoveryTime: result.recoveryTime,
        steps: result.steps.length
      });
    }, 75000); // 75 second timeout

    test('handles Discord API degradation', async () => {
      logger.info('Starting Discord API degradation resilience test');
      
      const result = await chaosFramework.runScenario('discord_api_degradation');
      testResults.set('discord_api_degradation', result);
      
      // Validate test execution
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(4);
      expect(result.duration).toBeGreaterThan(0);
      
      // Validate system handled degradation appropriately
      const verifyStep = result.steps.find(s => s.name === 'verify');
      expect(verifyStep).toBeDefined();
      expect(verifyStep?.success).toBe(true);
      
      // Check that recovery was tracked
      if (result.recoveryTime !== undefined) {
        expect(result.recoveryTime).toBeLessThan(20000); // Should recover quickly
      }
      
      logger.info('Discord API degradation resilience test completed successfully', {
        duration: result.duration,
        recoveryTime: result.recoveryTime
      });
    }, 60000);

    test('validates circuit breaker behavior during failures', async () => {
      logger.info('Testing circuit breaker behavior during API failures');
      
      // Run both Gemini and Discord failure scenarios in sequence
      const results = await chaosFramework.runScenarioSequence([
        'gemini_api_timeout',
        'discord_api_degradation'
      ]);
      
      expect(results).toHaveLength(2);
      
      // Both scenarios should succeed (meaning circuit breakers worked)
      for (const result of results) {
        expect(result.success).toBe(true);
        testResults.set(result.scenario, result);
      }
      
      // Validate that circuit breakers provided isolation
      const geminiResult = results.find(r => r.scenario === 'gemini_api_timeout');
      const discordResult = results.find(r => r.scenario === 'discord_api_degradation');
      
      expect(geminiResult).toBeDefined();
      expect(discordResult).toBeDefined();
      
      // Both should have completed their verification steps
      expect(geminiResult?.steps.find(s => s.name === 'verify')?.success).toBe(true);
      expect(discordResult?.steps.find(s => s.name === 'verify')?.success).toBe(true);
      
      logger.info('Circuit breaker validation completed successfully');
    }, 120000);
  });

  describe('Resource Constraints', () => {
    test('handles memory pressure', async () => {
      logger.info('Starting memory pressure resilience test');
      
      const result = await chaosFramework.runScenario('memory_pressure');
      testResults.set('memory_pressure', result);
      
      // Validate test execution
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(4);
      
      // Validate memory management worked
      const verifyStep = result.steps.find(s => s.name === 'verify');
      expect(verifyStep?.success).toBe(true);
      
      // Check system state after memory pressure
      if (result.systemState) {
        // Memory usage should be reasonable (not infinite growth)
        expect(result.systemState.memoryUsage).toBeLessThan(2000); // Less than 2GB
      }
      
      // Recovery should be relatively quick for memory cleanup
      if (result.recoveryTime !== undefined) {
        expect(result.recoveryTime).toBeLessThan(10000); // 10 seconds
      }
      
      logger.info('Memory pressure resilience test completed successfully', {
        duration: result.duration,
        memoryUsage: result.systemState?.memoryUsage
      });
    }, 75000);

    test('maintains performance under resource constraints', async () => {
      logger.info('Testing performance maintenance under resource constraints');
      
      const startTime = Date.now();
      
      // Run memory pressure scenario
      const result = await chaosFramework.runScenario('memory_pressure');
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should complete within reasonable time even under memory pressure
      expect(totalTime).toBeLessThan(60000); // 60 seconds
      expect(result.success).toBe(true);
      
      // System should remain responsive
      const executeStep = result.steps.find(s => s.name === 'execute');
      expect(executeStep?.success).toBe(true);
      
      if (executeStep?.duration) {
        // Execution time should be reasonable despite memory pressure
        expect(executeStep.duration).toBeLessThan(30000); // 30 seconds
      }
      
      logger.info('Performance maintenance test completed', {
        totalTime,
        executeTime: executeStep?.duration
      });
    }, 90000);
  });

  describe('Cascading Failures', () => {
    test('prevents cascade through circuit breakers', async () => {
      logger.info('Starting cascading failure prevention test');
      
      const result = await chaosFramework.runScenario('cascading_failures');
      testResults.set('cascading_failures', result);
      
      // Validate test execution
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(4);
      
      // Validate cascade was contained
      const verifyStep = result.steps.find(s => s.name === 'verify');
      expect(verifyStep?.success).toBe(true);
      
      // Recovery time should be reasonable despite multiple failures
      if (result.recoveryTime !== undefined) {
        expect(result.recoveryTime).toBeLessThan(45000); // 45 seconds
      }
      
      logger.info('Cascading failure prevention test completed successfully', {
        duration: result.duration,
        recoveryTime: result.recoveryTime
      });
    }, 90000);

    test('maintains core functionality during cascading failures', async () => {
      logger.info('Testing core functionality maintenance during cascades');
      
      // Run cascading failures and verify system degraded gracefully
      const result = await chaosFramework.runScenario('cascading_failures');
      
      expect(result.success).toBe(true);
      
      // Verify step should have validated that core services remained operational
      const verifyStep = result.steps.find(s => s.name === 'verify');
      expect(verifyStep?.success).toBe(true);
      
      // System should have degraded gracefully (not crashed)
      expect(result.error).toBeUndefined();
      
      logger.info('Core functionality maintenance test completed successfully');
    }, 90000);
  });

  describe('Error Recovery', () => {
    test('recovers from transient errors', async () => {
      logger.info('Testing transient error recovery');
      
      // Mock retry handler for testing
      const mockRetryHandler = {
        execute: jest.fn().mockImplementation(async (operation: () => Promise<string>, options: any) => {
          let attempts = 0;
          const maxAttempts = options.maxRetries + 1;
          
          while (attempts < maxAttempts) {
            attempts++;
            try {
              const result = await operation();
              return result;
            } catch (error) {
              if (attempts >= maxAttempts) {
                throw error;
              }
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, options.retryDelay || 100));
            }
          }
        })
      };
      
      // Create operation that fails twice then succeeds
      let callCount = 0;
      const mockOperation = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Transient error');
        }
        return 'Success';
      });
      
      // Test retry behavior
      const result = await mockRetryHandler.execute(mockOperation, {
        maxRetries: 5,
        retryDelay: 100
      });
      
      expect(result).toBe('Success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
      
      logger.info('Transient error recovery test completed successfully', {
        attempts: callCount,
        result
      });
    });

    test('handles permanent failures appropriately', async () => {
      logger.info('Testing permanent failure handling');
      
      // Mock retry handler
      const mockRetryHandler = {
        execute: jest.fn().mockImplementation(async (operation: () => Promise<string>, options: any) => {
          let attempts = 0;
          const maxAttempts = options.maxRetries + 1;
          
          while (attempts < maxAttempts) {
            attempts++;
            try {
              return await operation();
            } catch (error) {
              if (attempts >= maxAttempts) {
                throw error;
              }
              await new Promise(resolve => setTimeout(resolve, options.retryDelay || 100));
            }
          }
        })
      };
      
      // Create operation that always fails
      const mockOperation = jest.fn().mockRejectedValue(new Error('Permanent failure'));
      
      // Test that permanent failures are handled correctly
      await expect(
        mockRetryHandler.execute(mockOperation, {
          maxRetries: 3,
          retryDelay: 100
        })
      ).rejects.toThrow('Permanent failure');
      
      expect(mockOperation).toHaveBeenCalledTimes(4); // Initial + 3 retries
      
      logger.info('Permanent failure handling test completed successfully');
    });

    test('recovery times meet SLA requirements', async () => {
      logger.info('Testing recovery time SLA compliance');
      
      // Run multiple scenarios and check recovery times
      const scenarios = ['gemini_api_timeout', 'discord_api_degradation', 'memory_pressure'];
      const results = await chaosFramework.runScenarioSequence(scenarios);
      
      expect(results).toHaveLength(3);
      
      for (const result of results) {
        expect(result.success).toBe(true);
        
        // All recovery times should meet SLA (under 60 seconds)
        if (result.recoveryTime !== undefined) {
          expect(result.recoveryTime).toBeLessThan(60000);
          logger.info(`${result.scenario} recovery time: ${result.recoveryTime}ms`);
        }
      }
      
      // Calculate average recovery time
      const recoveryTimes = results
        .map(r => r.recoveryTime)
        .filter(t => t !== undefined) as number[];
      
      if (recoveryTimes.length > 0) {
        const avgRecoveryTime = recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length;
        expect(avgRecoveryTime).toBeLessThan(30000); // Average under 30 seconds
        
        logger.info('Recovery time SLA compliance validated', {
          averageRecoveryTime: avgRecoveryTime,
          scenarios: recoveryTimes.length
        });
      }
    }, 180000); // 3 minute timeout for all scenarios
  });

  describe('System State Validation', () => {
    test('system state remains consistent during failures', async () => {
      logger.info('Testing system state consistency during failures');
      
      // Run a comprehensive scenario and track system state
      const result = await chaosFramework.runScenario('cascading_failures');
      
      expect(result.success).toBe(true);
      expect(result.systemState).toBeDefined();
      
      // Get system state history
      const stateHistory = chaosFramework.getSystemStateHistory();
      expect(stateHistory.length).toBeGreaterThan(0);
      
      // Validate state consistency
      for (const state of stateHistory) {
        expect(state.memoryUsage).toBeGreaterThan(0);
        expect(state.memoryUsage).toBeLessThan(4000); // 4GB limit
        expect(state.cpuUsage).toBeGreaterThanOrEqual(0);
      }
      
      logger.info('System state consistency validated', {
        stateSnapshots: stateHistory.length,
        finalMemoryUsage: result.systemState?.memoryUsage
      });
    }, 90000);

    test('no memory leaks during chaos testing', async () => {
      logger.info('Testing for memory leaks during chaos scenarios');
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Run multiple scenarios to check for memory leaks
      const scenarios = ['memory_pressure', 'gemini_api_timeout'];
      
      for (const scenarioName of scenarios) {
        const result = await chaosFramework.runScenario(scenarioName);
        expect(result.success).toBe(true);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      // Should not have significant memory increase (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50);
      
      logger.info('Memory leak test completed', {
        initialMemory: (initialMemory / 1024 / 1024).toFixed(2),
        finalMemory: (finalMemory / 1024 / 1024).toFixed(2),
        increase: memoryIncrease.toFixed(2)
      });
    }, 120000);
  });

  describe('Resilience Metrics', () => {
    test('collects comprehensive resilience metrics', async () => {
      logger.info('Testing resilience metrics collection');
      
      // Run several scenarios to generate metrics
      const scenarios = ['gemini_api_timeout', 'discord_api_degradation', 'memory_pressure'];
      
      for (const scenarioName of scenarios) {
        await chaosFramework.runScenario(scenarioName);
      }
      
      // Generate report and validate metrics
      const report = chaosFramework.generateReport();
      
      expect(report.totalScenarios).toBe(scenarios.length);
      expect(report.successfulScenarios).toBe(scenarios.length);
      expect(report.failedScenarios).toBe(0);
      expect(report.successRate).toBe(1.0);
      expect(report.averageExecutionTime).toBeGreaterThan(0);
      expect(report.averageRecoveryTime).toBeGreaterThan(0);
      
      // Validate scenario details
      expect(report.scenarios).toHaveLength(scenarios.length);
      for (const scenario of report.scenarios) {
        expect(scenario.success).toBe(true);
        expect(scenario.duration).toBeGreaterThan(0);
        expect(scenario.steps).toHaveLength(4); // setup, execute, verify, cleanup
      }
      
      // Should have some system state data
      expect(report.systemStates.length).toBeGreaterThan(0);
      
      logger.info('Resilience metrics collection validated', {
        totalScenarios: report.totalScenarios,
        successRate: report.successRate,
        avgExecutionTime: report.averageExecutionTime,
        avgRecoveryTime: report.averageRecoveryTime
      });
    }, 180000);

    test('generates actionable recommendations', async () => {
      logger.info('Testing resilience recommendations generation');
      
      // Run scenarios to generate data for recommendations
      await chaosFramework.runScenario('cascading_failures');
      
      const report = chaosFramework.generateReport();
      
      // Should have generated a report
      expect(report).toBeDefined();
      expect(report.recommendations).toBeDefined();
      
      // Recommendations should be strings
      for (const recommendation of report.recommendations) {
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(0);
      }
      
      logger.info('Resilience recommendations validated', {
        recommendationCount: report.recommendations.length,
        recommendations: report.recommendations
      });
    }, 90000);
  });
});