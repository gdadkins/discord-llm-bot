/**
 * Chaos Engineering Test Suite Index
 * 
 * Main entry point for running comprehensive chaos engineering tests.
 * Coordinates all test scenarios and generates comprehensive reports.
 * 
 * @module ChaosTestSuite
 */

import { logger } from '../../src/utils/logger';
import { ChaosTestFramework, type ChaosTestReport } from './ChaosTestFramework';
import { serviceFailureScenarios } from './scenarios/ServiceFailures';
import { runLoadTestWithErrors, loadTestScenarios, type LoadTestResults } from '../load/LoadTestWithErrors';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ChaosTestSuiteConfig {
  runServiceFailures: boolean;
  runLoadTests: boolean;
  runValidationTests: boolean;
  generateReports: boolean;
  outputDirectory: string;
  maxConcurrentTests: number;
  testTimeout: number;
}

export interface ChaosTestSuiteResults {
  serviceFailureResults: ChaosTestReport | null;
  loadTestResults: LoadTestResults[] | null;
  validationResults: ChaosTestReport | null;
  overallScore: number;
  recommendations: string[];
  timestamp: string;
  duration: number;
}

export class ChaosTestSuite {
  private config: ChaosTestSuiteConfig;
  private framework: ChaosTestFramework;

  constructor(config: Partial<ChaosTestSuiteConfig> = {}) {
    this.config = {
      runServiceFailures: true,
      runLoadTests: true,
      runValidationTests: true,
      generateReports: true,
      outputDirectory: './test-results/chaos',
      maxConcurrentTests: 2,
      testTimeout: 300000, // 5 minutes
      ...config
    };

    this.framework = new ChaosTestFramework({
      maxConcurrentScenarios: this.config.maxConcurrentTests,
      failureThreshold: 0.1,
      recoveryTimeoutMs: 60000,
      systemStatePollingInterval: 2000,
      enableMetricsCollection: true,
      enableSystemStateTracking: true
    });

    // Load all scenarios
    serviceFailureScenarios.forEach(scenario => {
      this.framework.addScenario(scenario);
    });
  }

  async runFullSuite(): Promise<ChaosTestSuiteResults> {
    const startTime = Date.now();
    logger.info('Starting comprehensive chaos engineering test suite', {
      config: this.config
    });

    const results: ChaosTestSuiteResults = {
      serviceFailureResults: null,
      loadTestResults: null,
      validationResults: null,
      overallScore: 0,
      recommendations: [],
      timestamp: new Date().toISOString(),
      duration: 0
    };

    try {
      // Phase 1: Service Failure Tests
      if (this.config.runServiceFailures) {
        logger.info('Phase 1: Running service failure chaos scenarios');
        results.serviceFailureResults = await this.runServiceFailureTests();
      }

      // Phase 2: Load Tests with Error Injection
      if (this.config.runLoadTests) {
        logger.info('Phase 2: Running load tests with error injection');
        results.loadTestResults = await this.runLoadTests();
      }

      // Phase 3: Validation Tests
      if (this.config.runValidationTests) {
        logger.info('Phase 3: Running validation tests');
        results.validationResults = await this.runValidationTests();
      }

      // Calculate overall score and generate recommendations
      results.overallScore = this.calculateOverallScore(results);
      results.recommendations = this.generateRecommendations(results);

    } catch (error) {
      logger.error('Chaos test suite failed', { error });
      throw error;
    } finally {
      results.duration = Date.now() - startTime;
      
      // Generate reports
      if (this.config.generateReports) {
        await this.generateReports(results);
      }
    }

    logger.info('Chaos engineering test suite completed', {
      duration: results.duration,
      overallScore: results.overallScore,
      recommendations: results.recommendations.length
    });

    return results;
  }

  async runServiceFailureTests(): Promise<ChaosTestReport> {
    logger.info('Executing service failure chaos scenarios');

    // Run all service failure scenarios
    const scenarioNames = serviceFailureScenarios.map(s => s.name);
    const testResults = await this.framework.runScenarioSequence(scenarioNames);

    // Generate report
    const report = this.framework.generateReport();
    
    logger.info('Service failure tests completed', {
      totalScenarios: report.totalScenarios,
      successRate: (report.successRate * 100).toFixed(1) + '%',
      averageRecoveryTime: report.averageRecoveryTime.toFixed(0) + 'ms'
    });

    return report;
  }

  async runLoadTests(): Promise<LoadTestResults[]> {
    logger.info('Executing load tests with error injection');

    const loadTestResults: LoadTestResults[] = [];

    // Run different load test scenarios
    const scenarios = [
      { name: 'light', config: loadTestScenarios.light },
      { name: 'moderate', config: loadTestScenarios.moderate }
    ];

    for (const scenario of scenarios) {
      logger.info(`Running ${scenario.name} load test scenario`);
      
      try {
        const result = await runLoadTestWithErrors(scenario.config);
        loadTestResults.push(result);
        
        logger.info(`${scenario.name} load test completed`, {
          totalRequests: result.totalRequests,
          successRate: result.totalRequests > 0 
            ? (result.successfulRequests / result.totalRequests * 100).toFixed(1) + '%'
            : '0%',
          resilienceScore: result.resilienceScore.toFixed(1)
        });
        
      } catch (error) {
        logger.error(`${scenario.name} load test failed`, { error });
        // Continue with other scenarios
      }
    }

    return loadTestResults;
  }

  async runValidationTests(): Promise<ChaosTestReport> {
    logger.info('Executing validation tests');

    // Create a new framework instance for validation
    const validationFramework = new ChaosTestFramework({
      maxConcurrentScenarios: 1,
      failureThreshold: 0.05,
      recoveryTimeoutMs: 45000,
      systemStatePollingInterval: 1000,
      enableMetricsCollection: true,
      enableSystemStateTracking: true
    });

    // Add validation scenarios (subset of service failure scenarios)
    const validationScenarios = serviceFailureScenarios.filter(s => 
      ['gemini_api_timeout', 'cascading_failures', 'memory_pressure'].includes(s.name)
    );

    validationScenarios.forEach(scenario => {
      validationFramework.addScenario(scenario);
    });

    // Run validation scenarios
    await validationFramework.runAllScenarios();
    
    const report = validationFramework.generateReport();
    
    logger.info('Validation tests completed', {
      validationScenarios: report.totalScenarios,
      successRate: (report.successRate * 100).toFixed(1) + '%'
    });

    return report;
  }

  private calculateOverallScore(results: ChaosTestSuiteResults): number {
    let totalScore = 0;
    let scoreComponents = 0;

    // Service failure score (40% weight)
    if (results.serviceFailureResults) {
      const serviceScore = results.serviceFailureResults.successRate * 100;
      totalScore += serviceScore * 0.4;
      scoreComponents++;
    }

    // Load test score (35% weight)
    if (results.loadTestResults && results.loadTestResults.length > 0) {
      const avgResilienceScore = results.loadTestResults.reduce(
        (sum, result) => sum + result.resilienceScore, 0
      ) / results.loadTestResults.length;
      totalScore += avgResilienceScore * 0.35;
      scoreComponents++;
    }

    // Validation score (25% weight)
    if (results.validationResults) {
      const validationScore = results.validationResults.successRate * 100;
      totalScore += validationScore * 0.25;
      scoreComponents++;
    }

    return scoreComponents > 0 ? totalScore / (scoreComponents * 0.4 + scoreComponents * 0.35 + scoreComponents * 0.25) * (scoreComponents / 3) : 0;
  }

  private generateRecommendations(results: ChaosTestSuiteResults): string[] {
    const recommendations: string[] = [];

    // Analyze service failure results
    if (results.serviceFailureResults) {
      if (results.serviceFailureResults.successRate < 0.9) {
        recommendations.push('Service failure resilience below 90% - review circuit breaker configuration');
      }
      
      if (results.serviceFailureResults.averageRecoveryTime > 30000) {
        recommendations.push('Average recovery time exceeds 30 seconds - optimize recovery procedures');
      }

      recommendations.push(...results.serviceFailureResults.recommendations);
    }

    // Analyze load test results
    if (results.loadTestResults) {
      const lowPerformanceTests = results.loadTestResults.filter(r => r.resilienceScore < 70);
      if (lowPerformanceTests.length > 0) {
        recommendations.push(`${lowPerformanceTests.length} load test scenarios show low resilience - review system capacity`);
      }

      results.loadTestResults.forEach(result => {
        if (result.analysis.bottlenecks.length > 0) {
          recommendations.push(`Load test bottlenecks: ${result.analysis.bottlenecks.join(', ')}`);
        }
      });
    }

    // Analyze validation results
    if (results.validationResults) {
      if (results.validationResults.failedScenarios > 0) {
        recommendations.push(`${results.validationResults.failedScenarios} validation scenarios failed - review implementation quality`);
      }
    }

    // Overall recommendations
    if (results.overallScore < 80) {
      recommendations.push('Overall system resilience below 80% - comprehensive review required');
    }

    // Remove duplicates
    return [...new Set(recommendations)];
  }

  private async generateReports(results: ChaosTestSuiteResults): Promise<void> {
    logger.info('Generating chaos test reports');

    try {
      // Ensure output directory exists
      await fs.mkdir(this.config.outputDirectory, { recursive: true });

      // Generate main report
      const mainReportPath = path.join(this.config.outputDirectory, 'chaos-test-report.json');
      await fs.writeFile(mainReportPath, JSON.stringify(results, null, 2));

      // Generate human-readable summary
      const summaryPath = path.join(this.config.outputDirectory, 'chaos-test-summary.md');
      const summary = this.generateMarkdownSummary(results);
      await fs.writeFile(summaryPath, summary);

      // Generate individual reports
      if (results.serviceFailureResults) {
        const serviceReportPath = path.join(this.config.outputDirectory, 'service-failure-report.json');
        await fs.writeFile(serviceReportPath, JSON.stringify(results.serviceFailureResults, null, 2));
      }

      if (results.loadTestResults) {
        const loadTestReportPath = path.join(this.config.outputDirectory, 'load-test-results.json');
        await fs.writeFile(loadTestReportPath, JSON.stringify(results.loadTestResults, null, 2));
      }

      if (results.validationResults) {
        const validationReportPath = path.join(this.config.outputDirectory, 'validation-results.json');
        await fs.writeFile(validationReportPath, JSON.stringify(results.validationResults, null, 2));
      }

      logger.info('Chaos test reports generated', {
        outputDirectory: this.config.outputDirectory,
        reportCount: 4
      });

    } catch (error) {
      logger.error('Failed to generate reports', { error });
    }
  }

  private generateMarkdownSummary(results: ChaosTestSuiteResults): string {
    const timestamp = new Date().toISOString();
    const durationMinutes = (results.duration / 60000).toFixed(1);

    let summary = `# Chaos Engineering Test Report\n\n`;
    summary += `**Generated:** ${timestamp}\n`;
    summary += `**Duration:** ${durationMinutes} minutes\n`;
    summary += `**Overall Score:** ${results.overallScore.toFixed(1)}/100\n\n`;

    // Executive Summary
    summary += `## Executive Summary\n\n`;
    const grade = results.overallScore >= 90 ? 'A' : 
                  results.overallScore >= 80 ? 'B' : 
                  results.overallScore >= 70 ? 'C' : 
                  results.overallScore >= 60 ? 'D' : 'F';
    summary += `**Overall Grade:** ${grade}\n`;
    summary += `**System Resilience:** ${results.overallScore >= 80 ? 'Excellent' : results.overallScore >= 60 ? 'Good' : 'Needs Improvement'}\n\n`;

    // Service Failure Tests
    if (results.serviceFailureResults) {
      summary += `## Service Failure Tests\n\n`;
      summary += `- **Total Scenarios:** ${results.serviceFailureResults.totalScenarios}\n`;
      summary += `- **Success Rate:** ${(results.serviceFailureResults.successRate * 100).toFixed(1)}%\n`;
      summary += `- **Average Recovery Time:** ${results.serviceFailureResults.averageRecoveryTime.toFixed(0)}ms\n`;
      summary += `- **Failed Scenarios:** ${results.serviceFailureResults.failedScenarios}\n\n`;

      if (results.serviceFailureResults.scenarios.length > 0) {
        summary += `### Scenario Results\n\n`;
        results.serviceFailureResults.scenarios.forEach(scenario => {
          const status = scenario.success ? '✅' : '❌';
          summary += `- ${status} **${scenario.name}** (${scenario.duration}ms)\n`;
        });
        summary += `\n`;
      }
    }

    // Load Test Results
    if (results.loadTestResults && results.loadTestResults.length > 0) {
      summary += `## Load Test Results\n\n`;
      results.loadTestResults.forEach((result, index) => {
        const scenarioName = index === 0 ? 'Light Load' : 'Moderate Load';
        summary += `### ${scenarioName}\n\n`;
        summary += `- **Total Requests:** ${result.totalRequests}\n`;
        summary += `- **Success Rate:** ${result.totalRequests > 0 ? (result.successfulRequests / result.totalRequests * 100).toFixed(1) + '%' : '0%'}\n`;
        summary += `- **Throughput:** ${result.throughput.toFixed(1)} req/s\n`;
        summary += `- **P99 Response Time:** ${result.p99ResponseTime.toFixed(1)}ms\n`;
        summary += `- **Resilience Score:** ${result.resilienceScore.toFixed(1)}/100\n`;
        summary += `- **Performance Grade:** ${result.analysis.performanceGrade}\n\n`;
      });
    }

    // Validation Results
    if (results.validationResults) {
      summary += `## Validation Tests\n\n`;
      summary += `- **Validation Scenarios:** ${results.validationResults.totalScenarios}\n`;
      summary += `- **Success Rate:** ${(results.validationResults.successRate * 100).toFixed(1)}%\n`;
      summary += `- **Failed Validations:** ${results.validationResults.failedScenarios}\n\n`;
    }

    // Recommendations
    if (results.recommendations.length > 0) {
      summary += `## Recommendations\n\n`;
      results.recommendations.forEach(rec => {
        summary += `- ${rec}\n`;
      });
      summary += `\n`;
    }

    // Footer
    summary += `---\n`;
    summary += `*Report generated by Chaos Engineering Test Suite*\n`;

    return summary;
  }
}

// Export convenience functions
export async function runBasicChaosTests(): Promise<ChaosTestSuiteResults> {
  const suite = new ChaosTestSuite({
    runServiceFailures: true,
    runLoadTests: false,
    runValidationTests: true,
    maxConcurrentTests: 1
  });

  return await suite.runFullSuite();
}

export async function runComprehensiveChaosTests(): Promise<ChaosTestSuiteResults> {
  const suite = new ChaosTestSuite({
    runServiceFailures: true,
    runLoadTests: true,
    runValidationTests: true,
    maxConcurrentTests: 2
  });

  return await suite.runFullSuite();
}

export async function runQuickValidation(): Promise<ChaosTestReport> {
  const framework = new ChaosTestFramework({
    maxConcurrentScenarios: 1,
    recoveryTimeoutMs: 30000
  });

  // Add just the most critical scenarios
  const criticalScenarios = serviceFailureScenarios.filter(s => 
    ['gemini_api_timeout', 'cascading_failures'].includes(s.name)
  );

  criticalScenarios.forEach(scenario => {
    framework.addScenario(scenario);
  });

  await framework.runAllScenarios();
  return framework.generateReport();
}

// Export all components
export { ChaosTestFramework, serviceFailureScenarios, runLoadTestWithErrors, loadTestScenarios };