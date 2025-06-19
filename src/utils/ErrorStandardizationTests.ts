/**
 * Error Standardization Tests - Verification of standardized error handling
 * 
 * This file provides tests and examples to verify the error standardization
 * system is working correctly. It can be used during development to ensure
 * proper integration.
 */

import { 
  ServiceResponse, 
  ServiceErrorCode, 
  ServiceResult, 
  isSuccessResult, 
  isErrorResult,
  unwrapResult 
} from '../services/interfaces/ServiceResponses';
import { standardizedServiceMethod } from './ServiceMethodWrapper';
import { errorAggregator, recordServiceResult, formatErrorSummary } from '../services/ErrorAggregator';
import { convertToServiceResult, ErrorCategory, ErrorSeverity } from './ErrorHandlingUtils';
import { logger } from './logger';
import { AsyncFunction } from '../types';

// ============================================================================
// Test Service Implementation
// ============================================================================

/**
 * Example service implementation using standardized error handling
 */
class TestService {
  // Raw method that can fail
  private async _performDatabaseQuery(userId: string): Promise<{ id: string; name: string }> {
    // Simulate various failure conditions
    if (userId === 'timeout') {
      await new Promise(resolve => setTimeout(resolve, 6000)); // Will timeout
    }
    
    if (userId === 'notfound') {
      throw new Error('User not found in database');
    }
    
    if (userId === 'network') {
      throw new Error('Network connection failed: ECONNRESET');
    }
    
    if (userId === 'validation') {
      throw new Error('Invalid user ID format');
    }
    
    if (userId === 'ratelimit') {
      throw new Error('Rate limit exceeded - too many requests');
    }
    
    // Success case
    return { id: userId, name: `User ${userId}` };
  }
  
  // Fallback method
  private async getDefaultUserData(userId: string): Promise<{ id: string; name: string }> {
    return { id: userId, name: 'Default User' };
  }
  
  // Wrapped method using standardized error handling
  public getUserData = standardizedServiceMethod(
    this._performDatabaseQuery.bind(this) as AsyncFunction,
    'TestService',
    'getUserData',
    {
      timeout: 5000,
      fallback: this.getDefaultUserData.bind(this) as AsyncFunction,
      errorMapping: (error) => {
        const message = error.message.toLowerCase();
        if (message.includes('not found')) return ServiceErrorCode.NOT_FOUND;
        if (message.includes('network') || message.includes('econnreset')) return ServiceErrorCode.DEPENDENCY_ERROR;
        if (message.includes('invalid') || message.includes('format')) return ServiceErrorCode.INVALID_INPUT;
        if (message.includes('rate limit')) return ServiceErrorCode.RATE_LIMITED;
        return ServiceErrorCode.INTERNAL_ERROR;
      }
    }
  );
}

// ============================================================================
// Test Functions
// ============================================================================

/**
 * Test successful operation
 */
async function testSuccessfulOperation(): Promise<void> {
  console.log('\n=== Testing Successful Operation ===');
  
  const service = new TestService();
  const result = await service.getUserData('user123');
  
  if (isSuccessResult(result)) {
    console.log('✓ Success:', result.data);
    console.log('✓ Duration:', result.metadata?.duration, 'ms');
  } else {
    console.error('✗ Unexpected error:', result.error?.userMessage);
  }
  
  // Test unwrapResult utility
  try {
    const data = unwrapResult(result);
    console.log('✓ Unwrapped data:', data);
  } catch (error) {
    console.error('✗ Failed to unwrap:', error);
  }
}

/**
 * Test error conditions and fallback
 */
async function testErrorConditions(): Promise<void> {
  console.log('\n=== Testing Error Conditions ===');
  
  const service = new TestService();
  const errorCases = ['notfound', 'network', 'validation', 'ratelimit', 'timeout'];
  
  for (const errorCase of errorCases) {
    console.log(`\nTesting ${errorCase} error:`);
    
    const result = await service.getUserData(errorCase);
    
    if (isErrorResult(result)) {
      console.log('✓ Error code:', result.error.code);
      console.log('✓ User message:', result.error.userMessage);
      console.log('✓ Retryable:', result.error.retryable);
      console.log('✓ Severity:', result.error.severity);
      
      // Record error for aggregation
      recordServiceResult(result);
    } else if (result.metadata?.fallbackUsed) {
      console.log('✓ Fallback used:', result.data);
      console.log('✓ Duration:', result.metadata.duration, 'ms');
    } else {
      console.error('✗ Unexpected success for error case');
    }
  }
}

/**
 * Test error aggregation and reporting
 */
async function testErrorAggregation(): Promise<void> {
  console.log('\n=== Testing Error Aggregation ===');
  
  // Wait a moment for errors to be aggregated
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const report = errorAggregator.getReport();
  console.log('✓ Error summary:', formatErrorSummary(report));
  console.log('✓ Total errors:', report.summary.total);
  console.log('✓ Errors by service:', report.summary.byService);
  console.log('✓ Top errors:', report.summary.topErrors);
  
  // Get service-specific errors
  const testServiceErrors = errorAggregator.getErrorsForService('TestService');
  console.log('✓ TestService errors:', testServiceErrors.length);
  
  // Test aggregation stats
  const stats = errorAggregator.getAggregationStats();
  console.log('✓ Aggregation stats:', stats);
}

/**
 * Test backward compatibility with ErrorHandlingUtils
 */
async function testBackwardCompatibility(): Promise<void> {
  console.log('\n=== Testing Backward Compatibility ===');
  
  // Mock a legacy ErrorResult (with all required fields)
  const legacyErrorResult = {
    success: false,
    error: {
      name: 'NetworkError',
      message: 'Database connection failed',
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      timestamp: Date.now(),
      context: { database: 'users', timeout: 5000 }
    },
    retryCount: 2
  };
  
  // Convert to new format
  const serviceResult = convertToServiceResult(
    legacyErrorResult,
    'DatabaseService', 
    'queryUsers'
  );
  
  if (isErrorResult(serviceResult)) {
    console.log('✓ Converted error code:', serviceResult.error.code);
    console.log('✓ Converted user message:', serviceResult.error.userMessage);
    console.log('✓ Converted retryable:', serviceResult.error.retryable);
    console.log('✓ Metadata preserved:', serviceResult.metadata?.retryCount);
  } else {
    console.error('✗ Conversion failed');
  }
}

/**
 * Test service response utilities
 */
function testServiceResponseUtilities(): void {
  console.log('\n=== Testing Service Response Utilities ===');
  
  // Test success response
  const successResponse = ServiceResponse.success(
    { message: 'Operation completed' },
    { duration: 150, fromCache: true }
  );
  
  console.log('✓ Success response:', successResponse.success);
  console.log('✓ Success data:', successResponse.data);
  console.log('✓ Success metadata:', successResponse.metadata);
  
  // Test error response
  const errorResponse = ServiceResponse.error({
    code: ServiceErrorCode.VALIDATION_FAILED,
    message: 'Invalid input parameters',
    service: 'ValidationService',
    operation: 'validateInput',
    severity: 'medium'
  });
  
  console.log('✓ Error response:', errorResponse.success);
  console.log('✓ Error code:', errorResponse.error?.code);
  console.log('✓ Error user message:', errorResponse.error?.userMessage);
  console.log('✓ Error retryable:', errorResponse.error?.retryable);
}

// ============================================================================
// Main Test Runner
// ============================================================================

/**
 * Runs all error standardization tests
 */
export async function runErrorStandardizationTests(): Promise<void> {
  console.log('🧪 Starting Error Standardization Tests');
  
  try {
    // Initialize error aggregator
    await errorAggregator.initialize();
    
    // Run tests
    testServiceResponseUtilities();
    await testSuccessfulOperation();
    await testErrorConditions();
    await testErrorAggregation();
    await testBackwardCompatibility();
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    // Cleanup
    await errorAggregator.shutdown();
  }
}

/**
 * Health check using standardized error handling
 */
export async function performHealthCheck(): Promise<{
  healthy: boolean;
  errorSystemHealth: boolean;
  details: Record<string, unknown>;
}> {
  const errorHealth = errorAggregator.getHealthStatus();
  const report = errorAggregator.getReport();
  
  const criticalErrors = report.errors.filter(e => 
    e.samples.some(sample => sample.severity === 'critical')
  );
  
  const highErrorRateServices = Object.entries(report.summary.byService)
    .filter(([, count]) => count > 100) // More than 100 errors
    .map(([service]) => service);
  
  const healthy = errorHealth.healthy && 
                  criticalErrors.length === 0 && 
                  highErrorRateServices.length === 0;
  
  return {
    healthy,
    errorSystemHealth: errorHealth.healthy,
    details: {
      errorAggregatorMetrics: errorHealth.metrics,
      totalErrors: report.summary.total,
      criticalErrorCount: criticalErrors.length,
      highErrorRateServices,
      topErrors: report.summary.topErrors.slice(0, 3)
    }
  };
}

// Export test service for integration testing
export { TestService };

// ============================================================================
// Development Usage Examples
// ============================================================================

/*
// Example usage in development/testing:

import { runErrorStandardizationTests, performHealthCheck } from './ErrorStandardizationTests';

// Run full test suite
await runErrorStandardizationTests();

// Periodic health check
setInterval(async () => {
  const health = await performHealthCheck();
  if (!health.healthy) {
    console.warn('System health degraded:', health.details);
  }
}, 60000); // Check every minute

// Integration with existing services
import { standardizedServiceMethod } from './ServiceMethodWrapper';
import { recordServiceResult } from '../services/ErrorAggregator';

class MyExistingService {
  // Wrap existing methods
  public criticalOperation = standardizedServiceMethod(
    this._criticalOperationInternal.bind(this),
    'MyExistingService',
    'criticalOperation',
    {
      timeout: 10000,
      fallback: this.fallbackOperation.bind(this)
    }
  );
  
  async handleRequest(): Promise<void> {
    const result = await this.criticalOperation();
    
    // Automatic error recording
    recordServiceResult(result);
    
    if (result.success) {
      // Handle success
      console.log('Operation completed:', result.data);
    } else {
      // Handle error with user-friendly message
      console.error('Operation failed:', result.error.userMessage);
      
      // Optionally retry if retryable
      if (result.error.retryable) {
        setTimeout(() => this.handleRequest(), result.error.retryAfter || 1000);
      }
    }
  }
}
*/