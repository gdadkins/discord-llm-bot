/**
 * Chaos Test Framework
 * 
 * Core framework for executing chaos engineering tests to validate system resilience.
 * Provides scenario management, execution control, and comprehensive result tracking.
 * 
 * @module ChaosTestFramework
 */

import { logger } from '../../src/utils/logger';

export interface ChaosScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  execute: () => Promise<void>;
  verify: () => Promise<void>;
  cleanup: () => Promise<void>;
  timeout?: number;
  dependencies?: string[];
}

export interface StepResult {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: Error;
  metadata?: Record<string, unknown>;
}

export interface TestResult {
  scenario: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: Error;
  steps: StepResult[];
  systemState?: SystemState;
  recoveryTime?: number;
}

export interface SystemState {
  memoryUsage: number;
  cpuUsage: number;
  diskUsage: number;
  networkConnections: number;
  openFileDescriptors: number;
  errorRate: number;
  responseTime: number;
  queueSizes: Record<string, number>;
  circuitBreakerStates: Record<string, string>;
  healthStatus: string;
}

export interface ChaosTestConfig {
  maxConcurrentScenarios: number;
  failureThreshold: number;
  recoveryTimeoutMs: number;
  systemStatePollingInterval: number;
  enableMetricsCollection: boolean;
  enableSystemStateTracking: boolean;
}

export class ChaosTestFramework {
  private scenarios: Map<string, ChaosScenario> = new Map();
  private results: Map<string, TestResult> = new Map();
  private config: ChaosTestConfig;
  private systemStateHistory: SystemState[] = [];
  private statePollingInterval?: NodeJS.Timeout;
  private activeScenarios: Set<string> = new Set();

  constructor(config: Partial<ChaosTestConfig> = {}) {
    this.config = {
      maxConcurrentScenarios: 3,
      failureThreshold: 0.2, // 20% failure rate threshold
      recoveryTimeoutMs: 30000, // 30 seconds
      systemStatePollingInterval: 1000, // 1 second
      enableMetricsCollection: true,
      enableSystemStateTracking: true,
      ...config
    };
  }

  addScenario(scenario: ChaosScenario): void {
    if (this.scenarios.has(scenario.name)) {
      throw new Error(`Scenario ${scenario.name} already exists`);
    }
    
    this.scenarios.set(scenario.name, scenario);
    logger.info(`Added chaos scenario: ${scenario.name}`, {
      description: scenario.description,
      timeout: scenario.timeout,
      dependencies: scenario.dependencies
    });
  }

  async runScenario(name: string): Promise<TestResult> {
    const scenario = this.scenarios.get(name);
    if (!scenario) {
      throw new Error(`Scenario ${name} not found`);
    }

    if (this.activeScenarios.has(name)) {
      throw new Error(`Scenario ${name} is already running`);
    }

    if (this.activeScenarios.size >= this.config.maxConcurrentScenarios) {
      throw new Error(`Maximum concurrent scenarios (${this.config.maxConcurrentScenarios}) reached`);
    }

    this.activeScenarios.add(name);
    logger.info(`Starting chaos scenario: ${name}`);

    const result: TestResult = {
      scenario: name,
      startTime: Date.now(),
      steps: [],
      success: false
    };

    try {
      // Check dependencies
      if (scenario.dependencies) {
        await this.checkDependencies(scenario.dependencies);
      }

      // Start system state monitoring
      if (this.config.enableSystemStateTracking) {
        this.startSystemStateMonitoring();
      }

      // Capture initial system state
      const initialState = await this.captureSystemState();
      result.systemState = initialState;

      // Execute scenario steps
      await this.runStep(scenario.setup, 'setup', result, scenario.timeout);
      
      await this.runStep(scenario.execute, 'execute', result, scenario.timeout);
      
      // Wait for system to process the chaos
      await this.waitForSystemStabilization(5000);
      
      await this.runStep(scenario.verify, 'verify', result, scenario.timeout);

      // Measure recovery time
      const recoveryStart = Date.now();
      const finalState = await this.captureSystemState();
      result.recoveryTime = Date.now() - recoveryStart;

      // Verify system recovered
      await this.verifySystemRecovery(initialState, finalState);

      result.success = true;
      logger.info(`Chaos scenario ${name} completed successfully`);

    } catch (error) {
      result.success = false;
      result.error = error as Error;
      logger.error(`Chaos scenario ${name} failed`, { error });
    } finally {
      // Always cleanup
      await this.runStep(scenario.cleanup, 'cleanup', result);
      
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      
      this.results.set(name, result);
      this.activeScenarios.delete(name);
      
      // Stop system state monitoring if no other scenarios are running
      if (this.activeScenarios.size === 0 && this.statePollingInterval) {
        clearInterval(this.statePollingInterval);
        this.statePollingInterval = undefined;
      }
    }

    return result;
  }

  async runAllScenarios(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const scenarios = Array.from(this.scenarios.keys());

    logger.info(`Running ${scenarios.length} chaos scenarios`);

    for (const scenarioName of scenarios) {
      try {
        const result = await this.runScenario(scenarioName);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to run scenario ${scenarioName}`, { error });
        results.push({
          scenario: scenarioName,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
          success: false,
          error: error as Error,
          steps: []
        });
      }
    }

    return results;
  }

  async runScenarioSequence(names: string[]): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    for (const name of names) {
      try {
        const result = await this.runScenario(name);
        results.push(result);
        
        // Stop if a critical scenario fails
        if (!result.success && this.isCriticalScenario(name)) {
          logger.error(`Critical scenario ${name} failed, stopping sequence`);
          break;
        }
      } catch (error) {
        logger.error(`Scenario ${name} failed in sequence`, { error });
        results.push({
          scenario: name,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
          success: false,
          error: error as Error,
          steps: []
        });
        break;
      }
    }

    return results;
  }

  getScenarioResult(name: string): TestResult | undefined {
    return this.results.get(name);
  }

  getAllResults(): TestResult[] {
    return Array.from(this.results.values());
  }

  getSystemStateHistory(): SystemState[] {
    return [...this.systemStateHistory];
  }

  generateReport(): ChaosTestReport {
    const results = this.getAllResults();
    const totalScenarios = results.length;
    const successfulScenarios = results.filter(r => r.success).length;
    const failedScenarios = results.filter(r => !r.success).length;
    const successRate = totalScenarios > 0 ? successfulScenarios / totalScenarios : 0;

    const averageExecutionTime = results.length > 0 
      ? results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length 
      : 0;

    const averageRecoveryTime = results
      .filter(r => r.recoveryTime !== undefined)
      .reduce((sum, r) => sum + (r.recoveryTime || 0), 0) / results.length || 0;

    return {
      timestamp: new Date().toISOString(),
      totalScenarios,
      successfulScenarios,
      failedScenarios,
      successRate,
      averageExecutionTime,
      averageRecoveryTime,
      scenarios: results.map(r => ({
        name: r.scenario,
        success: r.success,
        duration: r.duration || 0,
        recoveryTime: r.recoveryTime || 0,
        errors: r.error ? [r.error.message] : [],
        steps: r.steps.map(s => ({
          name: s.name,
          success: s.success,
          duration: s.duration || 0,
          error: s.error?.message
        }))
      })),
      systemStates: this.systemStateHistory,
      recommendations: this.generateRecommendations(results)
    };
  }

  private async runStep(
    step: () => Promise<void>,
    name: string,
    result: TestResult,
    timeout?: number
  ): Promise<void> {
    const stepResult: StepResult = {
      name,
      startTime: Date.now(),
      success: false
    };

    try {
      if (timeout) {
        await Promise.race([
          step(),
          new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error(`Step ${name} timed out after ${timeout}ms`)), timeout)
          )
        ]);
      } else {
        await step();
      }
      
      stepResult.success = true;
      logger.debug(`Chaos step ${name} completed successfully`);
    } catch (error) {
      stepResult.error = error as Error;
      logger.error(`Chaos step ${name} failed`, { error });
      throw error;
    } finally {
      stepResult.endTime = Date.now();
      stepResult.duration = stepResult.endTime - stepResult.startTime;
      result.steps.push(stepResult);
    }
  }

  private async checkDependencies(dependencies: string[]): Promise<void> {
    for (const dep of dependencies) {
      const result = this.results.get(dep);
      if (!result || !result.success) {
        throw new Error(`Dependency ${dep} not satisfied`);
      }
    }
  }

  private startSystemStateMonitoring(): void {
    if (this.statePollingInterval) {
      return; // Already monitoring
    }

    this.statePollingInterval = setInterval(async () => {
      try {
        const state = await this.captureSystemState();
        this.systemStateHistory.push(state);
        
        // Keep only last 1000 states to prevent memory issues
        if (this.systemStateHistory.length > 1000) {
          this.systemStateHistory.shift();
        }
      } catch (error) {
        logger.error('Failed to capture system state', { error });
      }
    }, this.config.systemStatePollingInterval);
  }

  private async captureSystemState(): Promise<SystemState> {
    const memoryUsage = process.memoryUsage();
    
    return {
      memoryUsage: memoryUsage.heapUsed / 1024 / 1024, // MB
      cpuUsage: process.cpuUsage().system / 1000000, // Convert to seconds
      diskUsage: 0, // Would need to implement disk usage check
      networkConnections: 0, // Would need to implement network connection check
      openFileDescriptors: 0, // Would need to implement file descriptor check
      errorRate: 0, // Would need to get from metrics
      responseTime: 0, // Would need to get from metrics
      queueSizes: {}, // Would need to get from queue managers
      circuitBreakerStates: {}, // Would need to get from circuit breakers
      healthStatus: 'unknown' // Would need to get from health monitor
    };
  }

  private async waitForSystemStabilization(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async verifySystemRecovery(initial: SystemState, final: SystemState): Promise<void> {
    // Check if system recovered to acceptable state
    const memoryIncrease = final.memoryUsage - initial.memoryUsage;
    if (memoryIncrease > 100) { // 100MB increase threshold
      throw new Error(`System did not recover: Memory usage increased by ${memoryIncrease}MB`);
    }

    // Add more recovery checks as needed
    logger.info('System recovery verified', {
      initialMemory: initial.memoryUsage,
      finalMemory: final.memoryUsage,
      memoryDelta: memoryIncrease
    });
  }

  private isCriticalScenario(name: string): boolean {
    // Define critical scenarios that should stop execution if they fail
    const criticalScenarios = ['gemini_api_timeout', 'discord_api_degradation', 'cascading_failures'];
    return criticalScenarios.includes(name);
  }

  private generateRecommendations(results: TestResult[]): string[] {
    const recommendations: string[] = [];
    
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      recommendations.push(`${failedResults.length} scenarios failed. Review error handling for these services.`);
    }

    const longRecoveryResults = results.filter(r => (r.recoveryTime || 0) > 10000);
    if (longRecoveryResults.length > 0) {
      recommendations.push(`${longRecoveryResults.length} scenarios had slow recovery times. Consider optimizing recovery procedures.`);
    }

    const highMemoryResults = results.filter(r => 
      r.systemState && r.systemState.memoryUsage > 500
    );
    if (highMemoryResults.length > 0) {
      recommendations.push('High memory usage detected during chaos tests. Review memory management.');
    }

    return recommendations;
  }
}

export interface ChaosTestReport {
  timestamp: string;
  totalScenarios: number;
  successfulScenarios: number;
  failedScenarios: number;
  successRate: number;
  averageExecutionTime: number;
  averageRecoveryTime: number;
  scenarios: Array<{
    name: string;
    success: boolean;
    duration: number;
    recoveryTime: number;
    errors: string[];
    steps: Array<{
      name: string;
      success: boolean;
      duration: number;
      error?: string;
    }>;
  }>;
  systemStates: SystemState[];
  recommendations: string[];
}