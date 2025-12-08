/**
 * Jest Configuration for Chaos Engineering Tests
 * 
 * Specialized Jest configuration for running chaos engineering and resilience tests.
 * Includes extended timeouts, proper setup, and comprehensive reporting.
 */

const baseConfig = require('../../jest.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'Chaos Engineering Tests',
  testMatch: [
    '<rootDir>/tests/chaos/**/*.test.ts',
    '<rootDir>/tests/resilience/**/*.test.ts',
    '<rootDir>/tests/load/**/*.test.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  // Extended timeouts for chaos tests
  testTimeout: 300000, // 5 minutes
  // Enable verbose output for detailed test reporting
  verbose: true,
  // Collect coverage from chaos test files
  collectCoverageFrom: [
    'tests/chaos/**/*.ts',
    'tests/resilience/**/*.ts',
    'tests/load/**/*.ts',
    '!tests/**/*.d.ts',
    '!tests/**/*.test.ts'
  ],
  // Setup files for chaos tests
  setupFilesAfterEnv: [
    '<rootDir>/tests/chaos/setup.ts'
  ],
  // Custom test environment for chaos tests
  testEnvironment: 'node',
  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  // Transform configuration
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  // Global configuration
  globals: {
    'ts-jest': {
      tsconfig: {
        target: 'ES2020',
        module: 'CommonJS',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true
      }
    }
  },
  // Test result processor for detailed reporting
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './test-results/chaos/html-report',
      filename: 'chaos-test-report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'Chaos Engineering Test Report'
    }],
    ['jest-junit', {
      outputDirectory: './test-results/chaos',
      outputName: 'junit.xml',
      classNameTemplate: 'Chaos.{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › '
    }]
  ],
  // Coverage configuration
  coverageDirectory: './test-results/chaos/coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  // Performance settings
  maxWorkers: 2, // Limit workers for chaos tests
  // Memory settings
  logHeapUsage: true,
  // Error handling
  bail: false, // Continue running tests even if some fail
  errorOnDeprecated: false,
  // File watching (disabled for chaos tests)
  watchman: false,
  // Cache settings
  cache: false, // Disable cache for chaos tests to ensure fresh runs
};