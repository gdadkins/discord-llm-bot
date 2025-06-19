# Error Response Standardization - Implementation Guide

## Overview

This document describes the standardized error handling system implemented across all services in the Discord LLM Bot application. The system provides consistent error classification, user-friendly messages, and comprehensive error aggregation for monitoring and debugging.

## Architecture Components

### 1. ServiceResponses.ts - Core Interfaces
- **ServiceErrorCode**: Standardized error codes for consistent classification
- **ServiceError**: Comprehensive error information structure
- **ServiceResult<T>**: Unified response wrapper for all service operations
- **ServiceResponse**: Utility class for creating standardized responses
- **Error Aggregation Types**: Interfaces for error collection and reporting

### 2. ServiceMethodWrapper.ts - Method Wrapping
- **standardizedServiceMethod()**: Universal method wrapper for consistent error handling
- **ServiceMethodOptions**: Configuration for timeout, fallback, and error mapping
- **Request ID Generation**: Automatic request tracing for debugging
- **Performance Tracking**: Duration and retry count monitoring

### 3. ErrorAggregator.ts - Error Collection
- **ErrorAggregator Service**: Centralized error collection and reporting
- **Time-windowed Aggregation**: Automatic cleanup of old error data
- **User Impact Tracking**: Affected user count and error rate calculation
- **Monitoring Reports**: Dashboard-ready error statistics

### 4. ErrorHandlingUtils.ts - Backward Compatibility
- **Enhanced Error Categories**: Extended error classification system
- **Compatibility Functions**: Bridge between old and new error formats
- **User-Friendly Messages**: Context-aware error messages for end users

## Implementation Examples

### Basic Service Method Wrapping

```typescript
import { standardizedServiceMethod, ServiceResult } from '../utils/ServiceMethodWrapper';
import { ServiceErrorCode } from '../services/interfaces/ServiceResponses';

class UserService extends BaseService {
  // Wrap an existing method
  getUserData = standardizedServiceMethod(
    this._getUserDataInternal.bind(this),
    'UserService',
    'getUserData',
    {
      timeout: 5000,
      fallback: this.getDefaultUserData.bind(this),
      errorMapping: (error) => {
        if (error.message.includes('not found')) {
          return ServiceErrorCode.NOT_FOUND;
        }
        return ServiceErrorCode.INTERNAL_ERROR;
      }
    }
  );

  // Original internal method (unchanged)
  private async _getUserDataInternal(userId: string): Promise<UserData> {
    return this.database.query('SELECT * FROM users WHERE id = ?', [userId]);
  }
  
  // Fallback method
  private async getDefaultUserData(userId: string): Promise<UserData> {
    return { id: userId, name: 'Unknown User', preferences: {} };
  }
}
```

### Using Service Results

```typescript
// Service usage with proper error handling
async function handleUserRequest(userId: string): Promise<void> {
  const result = await userService.getUserData(userId);
  
  if (result.success) {
    // Success case
    console.log('User data:', result.data);
    console.log('Operation took:', result.metadata?.duration, 'ms');
    
    if (result.metadata?.fallbackUsed) {
      console.warn('Fallback was used for this request');
    }
  } else {
    // Error case
    console.error('User-friendly error:', result.error.userMessage);
    console.error('Technical error:', result.error.message);
    
    // Record error for monitoring
    errorAggregator.recordError(result.error);
    
    // Check if retryable
    if (result.error.retryable && result.error.retryAfter) {
      console.log(`Retry recommended after ${result.error.retryAfter}ms`);
    }
  }
}
```

### Error Aggregation and Monitoring

```typescript
import { errorAggregator, formatErrorSummary } from '../services/ErrorAggregator';

// Get error report for monitoring dashboard
async function generateErrorReport(): Promise<void> {
  const report = errorAggregator.getReport();
  
  console.log('Error Summary:', formatErrorSummary(report));
  console.log('Total errors:', report.summary.total);
  
  // Check for high-frequency errors
  for (const error of report.summary.topErrors) {
    if (error.errorRate > 1) { // More than 1 error per second
      console.warn('High error rate detected:', error.key, error.errorRate);
      // Trigger alert
    }
  }
  
  // Service-specific error analysis
  const geminiErrors = errorAggregator.getErrorsForService('GeminiService');
  if (geminiErrors.length > 0) {
    console.log('Gemini service errors:', geminiErrors.length);
  }
}

// Health check integration
async function checkSystemHealth(): Promise<boolean> {
  const health = errorAggregator.getHealthStatus();
  
  if (!health.healthy) {
    console.error('Error aggregator unhealthy:', health.errors);
    return false;
  }
  
  return true;
}
```

### Decorator Pattern Usage

```typescript
import { standardizedMethod } from '../utils/ServiceMethodWrapper';

class ConfigurationService extends BaseService {
  // Method decorator approach
  @standardizedMethod('ConfigurationService', 'updateConfig', { 
    timeout: 3000,
    enableRetry: true 
  })
  async updateConfiguration(config: BotConfiguration): Promise<ServiceResult<void>> {
    // Implementation returns raw data, wrapper handles ServiceResult
    await this.validateConfiguration(config);
    await this.saveConfiguration(config);
    this.notifyConfigurationChange(config);
  }
  
  // Multiple methods wrapped at once
  private _rawMethods = {
    loadConfig: this._loadConfigInternal.bind(this),
    saveConfig: this._saveConfigInternal.bind(this),
    validateConfig: this._validateConfigInternal.bind(this)
  };
  
  // Batch wrapping
  public methods = wrapServiceMethods(this._rawMethods, 'ConfigurationService', {
    timeout: 5000,
    enableRetry: true
  });
}
```

## Error Code Classification

### Client Errors (4xx equivalent)
- **INVALID_INPUT**: Malformed or missing required parameters
- **UNAUTHORIZED**: Authentication required or invalid credentials
- **FORBIDDEN**: Valid credentials but insufficient permissions
- **NOT_FOUND**: Requested resource does not exist
- **RATE_LIMITED**: Request rate exceeds allowed limits

### Server Errors (5xx equivalent)
- **INTERNAL_ERROR**: Unexpected internal system error
- **SERVICE_UNAVAILABLE**: Service temporarily unavailable
- **TIMEOUT**: Operation exceeded time limit
- **DEPENDENCY_ERROR**: External dependency failure

### Business Logic Errors
- **VALIDATION_FAILED**: Business rule validation failure
- **PRECONDITION_FAILED**: Required preconditions not met
- **CONFLICT**: Resource state conflict
- **QUOTA_EXCEEDED**: Resource quota or limit exceeded

## Migration Guide

### From Legacy ErrorResult to ServiceResult

```typescript
// OLD: Legacy error handling
import { handleAsyncOperation, ErrorResult } from '../utils/ErrorHandlingUtils';

async function oldMethod(): Promise<ErrorResult<UserData>> {
  return handleAsyncOperation(
    () => this.database.getUser(userId),
    { maxRetries: 3, timeout: 5000 },
    this.getDefaultUser.bind(this)
  );
}

// NEW: Standardized approach
import { standardizedServiceMethod, ServiceResult } from '../utils/ServiceMethodWrapper';

const newMethod = standardizedServiceMethod(
  this.database.getUser.bind(this.database),
  'UserService',
  'getUser',
  {
    timeout: 5000,
    fallback: this.getDefaultUser.bind(this)
  }
);

// COMPATIBILITY: Convert between formats
import { convertToServiceResult } from '../utils/ErrorHandlingUtils';

async function compatibilityBridge(userId: string): Promise<ServiceResult<UserData>> {
  const legacyResult = await oldMethod();
  return convertToServiceResult(legacyResult, 'UserService', 'getUser');
}
```

### Integrating with Existing Services

```typescript
// Gradual migration approach
class HybridService extends BaseService {
  // New methods use standardized approach
  getNewData = standardizedServiceMethod(
    this._getDataInternal.bind(this),
    'HybridService',
    'getNewData'
  );
  
  // Legacy methods remain unchanged
  async getLegacyData(): Promise<ErrorResult<Data>> {
    return handleAsyncOperation(() => this._getLegacyDataInternal());
  }
  
  // Wrapper method for consistency
  async getLegacyDataStandardized(): Promise<ServiceResult<Data>> {
    const result = await this.getLegacyData();
    return convertToServiceResult(result, 'HybridService', 'getLegacyData');
  }
}
```

## Best Practices

### 1. Error Message Design
- **Technical messages**: Detailed for logs and debugging
- **User messages**: Clear, actionable guidance for end users
- **Context preservation**: Include relevant operation details

### 2. Error Classification
- Use specific error codes over generic ones
- Map external API errors to appropriate service codes
- Consider retryability when classifying errors

### 3. Fallback Strategies
- Provide meaningful fallbacks for critical operations
- Ensure fallbacks don't mask important errors
- Document fallback behavior clearly

### 4. Monitoring Integration
- Record all service errors for aggregation
- Set up alerts for high error rates
- Use error patterns for system health assessment

### 5. Performance Considerations
- Implement appropriate timeouts for all operations
- Track operation duration for performance monitoring
- Use circuit breakers for external dependencies

## Configuration Examples

### Service-Specific Error Mapping

```typescript
// Custom error mapping for external APIs
const geminiErrorMapping = (error: Error): ServiceErrorCode => {
  const message = error.message.toLowerCase();
  
  if (message.includes('quota')) return ServiceErrorCode.QUOTA_EXCEEDED;
  if (message.includes('rate limit')) return ServiceErrorCode.RATE_LIMITED;
  if (message.includes('invalid request')) return ServiceErrorCode.INVALID_INPUT;
  if (message.includes('unauthorized')) return ServiceErrorCode.UNAUTHORIZED;
  
  return ServiceErrorCode.DEPENDENCY_ERROR;
};

// Apply to Gemini service methods
const processWithGemini = standardizedServiceMethod(
  geminiClient.generateContent.bind(geminiClient),
  'GeminiService',
  'generateContent',
  {
    timeout: 30000,
    errorMapping: geminiErrorMapping,
    fallback: async () => ({ text: 'Service temporarily unavailable' })
  }
);
```

### Environment-Specific Configuration

```typescript
// Development vs Production error handling
const errorConfig = {
  development: {
    suppressLogging: false,
    timeout: 10000,
    enableRetry: true
  },
  production: {
    suppressLogging: true,
    timeout: 5000,
    enableRetry: true
  }
};

const config = errorConfig[process.env.NODE_ENV] || errorConfig.development;

const wrappedMethod = standardizedServiceMethod(
  originalMethod,
  'MyService',
  'myOperation',
  config
);
```

## Troubleshooting

### Common Issues

1. **Circular Dependencies**: Avoid importing ErrorAggregator in utility modules
2. **Memory Leaks**: ErrorAggregator automatically cleans up old data
3. **Performance Impact**: Method wrapping adds minimal overhead (~1-2ms)
4. **Type Safety**: Ensure proper generic types for ServiceResult<T>

### Debugging Tips

1. **Request Tracing**: Use request IDs to track operations across services
2. **Error Sampling**: Review error samples in aggregation reports
3. **Fallback Detection**: Monitor fallback usage rates for service health
4. **Duration Tracking**: Use operation duration for performance analysis

### Health Monitoring

```typescript
// System health check including error rates
async function performHealthCheck(): Promise<{
  healthy: boolean;
  details: Record<string, any>;
}> {
  const errorHealth = errorAggregator.getHealthStatus();
  const report = errorAggregator.getReport();
  
  const highErrorServices = Object.entries(report.summary.byService)
    .filter(([service, count]) => count > 50) // More than 50 errors
    .map(([service]) => service);
  
  return {
    healthy: errorHealth.healthy && highErrorServices.length === 0,
    details: {
      errorAggregatorHealth: errorHealth,
      totalErrors: report.summary.total,
      highErrorServices,
      topErrors: report.summary.topErrors.slice(0, 5)
    }
  };
}
```

## Future Enhancements

### Planned Features
1. **Metrics Integration**: Prometheus/Grafana dashboards
2. **Alert Policies**: Configurable error rate thresholds
3. **Error Patterns**: ML-based error pattern detection
4. **Circuit Breaker Integration**: Automatic circuit breaker management
5. **Distributed Tracing**: OpenTelemetry integration

### Extension Points
1. **Custom Error Codes**: Service-specific error code extensions
2. **Error Handlers**: Pluggable error processing pipelines
3. **Reporting Formats**: Additional output formats for monitoring systems
4. **Cleanup Policies**: Configurable error data retention strategies

---

For more information, see:
- [API Reference](./API_REFERENCE.md)
- [Service Architecture](./SERVICE_ARCHITECTURE.md)
- [Error Handling Guide](./ERROR_HANDLING_GUIDE.md)