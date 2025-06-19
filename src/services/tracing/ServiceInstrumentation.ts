/**
 * ServiceInstrumentation - Service-specific instrumentation patterns
 * 
 * Provides pre-configured instrumentation for key services with:
 * - Service-specific tag extraction
 * - Performance monitoring tailored to each service type
 * - Error correlation and analysis
 * - Integration with existing service patterns
 * 
 * Agent 6: Distributed Tracing Implementation Specialist
 */

import { logger } from '../../utils/logger';
import { instrumentService, instrumentMethods, withTracing } from '../../middleware/tracingMiddleware';
import type { IService } from '../interfaces';

/**
 * Instrument a GeminiService instance with AI-specific tracing
 */
export function instrumentGeminiService<T extends IService>(service: T): T {
  return instrumentService(service, 'GeminiService', {
    extractServiceTags: (service) => ({
      serviceType: 'ai_generation',
      version: '1.0',
      capabilities: ['text_generation', 'multimodal', 'conversation']
    })
  });
}

/**
 * Instrument a ConversationManager with conversation-specific tracing
 */
export function instrumentConversationManager<T extends IService>(service: T): T {
  return instrumentService(service, 'ConversationManager', {
    skipMethods: ['cleanup', 'getStats'], // Skip utility methods
    extractServiceTags: (service) => ({
      serviceType: 'conversation_management',
      version: '1.0',
      capabilities: ['history_management', 'context_building']
    })
  });
}

/**
 * Instrument a ContextManager with context-specific tracing
 */
export function instrumentContextManager<T extends IService>(service: T): T {
  return instrumentService(service, 'ContextManager', {
    extractServiceTags: (service) => ({
      serviceType: 'context_management',
      version: '1.0',
      capabilities: ['context_assembly', 'user_tracking', 'channel_awareness']
    })
  });
}

/**
 * Instrument a HealthMonitor with monitoring-specific tracing
 */
export function instrumentHealthMonitor<T extends IService>(service: T): T {
  return instrumentService(service, 'HealthMonitor', {
    skipMethods: ['start', 'stop', 'getStatus'], // Skip control methods
    extractServiceTags: (service) => ({
      serviceType: 'health_monitoring',
      version: '1.0',
      capabilities: ['service_health', 'performance_tracking', 'alerting']
    })
  });
}

/**
 * Instrument a CacheManager with cache-specific tracing
 */
export function instrumentCacheManager<T extends IService>(service: T): T {
  return instrumentService(service, 'CacheManager', {
    extractServiceTags: (service) => ({
      serviceType: 'caching',
      version: '1.0',
      capabilities: ['memory_caching', 'ttl_management', 'cache_optimization']
    })
  });
}

/**
 * Instrument an AnalyticsManager with analytics-specific tracing
 */
export function instrumentAnalyticsManager<T extends IService>(service: T): T {
  return instrumentService(service, 'AnalyticsManager', {
    extractServiceTags: (service) => ({
      serviceType: 'analytics',
      version: '1.0',
      capabilities: ['event_tracking', 'behavior_analysis', 'reporting']
    })
  });
}

/**
 * Instrument a RateLimiter with rate limiting-specific tracing
 */
export function instrumentRateLimiter<T extends IService>(service: T): T {
  return instrumentService(service, 'RateLimiter', {
    extractServiceTags: (service) => ({
      serviceType: 'rate_limiting',
      version: '1.0',
      capabilities: ['request_throttling', 'quota_management', 'backoff_handling']
    })
  });
}

/**
 * Auto-instrument service factory to automatically trace all created services
 */
export function createInstrumentedServiceFactory<T extends Record<string, unknown>>(
  originalFactory: T
): T {
  const instrumentedFactory = { ...originalFactory };
  
  // Known service instrumentation mapping
  const serviceInstrumentors = {
    'geminiService': instrumentGeminiService,
    'conversationManager': instrumentConversationManager,
    'contextManager': instrumentContextManager,
    'healthMonitor': instrumentHealthMonitor,
    'cacheManager': instrumentCacheManager,
    'analyticsManager': instrumentAnalyticsManager,
    'rateLimiter': instrumentRateLimiter
  };
  
  // Wrap factory methods to automatically instrument services
  for (const [methodName, instrumentor] of Object.entries(serviceInstrumentors)) {
    const factoryMethod = originalFactory[methodName];
    if (typeof factoryMethod === 'function') {
      const originalMethod = factoryMethod as (...args: unknown[]) => Promise<IService>;
      
      (instrumentedFactory as Record<string, unknown>)[methodName] = withTracing(
        async (...args: unknown[]) => {
          const service = await originalMethod.apply(originalFactory, args);
          const instrumentedService = instrumentor(service);
          
          logger.debug('Service automatically instrumented', {
            serviceName: methodName,
            instrumentationType: 'factory_auto_instrumentation'
          });
          
          return instrumentedService;
        },
        `ServiceFactory.${methodName}`
      );
    }
  }
  
  return instrumentedFactory;
}

/**
 * Batch instrument multiple services at once
 */
export function batchInstrumentServices(services: Record<string, IService>): Record<string, IService> {
  const instrumentedServices: Record<string, IService> = {};
  
  for (const [name, service] of Object.entries(services)) {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('gemini')) {
      instrumentedServices[name] = instrumentGeminiService(service);
    } else if (lowerName.includes('conversation')) {
      instrumentedServices[name] = instrumentConversationManager(service);
    } else if (lowerName.includes('context')) {
      instrumentedServices[name] = instrumentContextManager(service);
    } else if (lowerName.includes('health')) {
      instrumentedServices[name] = instrumentHealthMonitor(service);
    } else if (lowerName.includes('cache')) {
      instrumentedServices[name] = instrumentCacheManager(service);
    } else if (lowerName.includes('analytics')) {
      instrumentedServices[name] = instrumentAnalyticsManager(service);
    } else if (lowerName.includes('rate')) {
      instrumentedServices[name] = instrumentRateLimiter(service);
    } else {
      // Generic instrumentation for unknown services
      instrumentedServices[name] = instrumentService(service, name, {
        extractServiceTags: () => ({
          serviceType: 'generic',
          serviceName: name
        })
      });
    }
  }
  
  logger.info('Batch instrumented services', {
    totalServices: Object.keys(services).length,
    instrumentedServices: Object.keys(instrumentedServices)
  });
  
  return instrumentedServices;
}

/**
 * Create a service proxy that automatically traces all method calls
 */
export function createTracingProxy<T extends object>(
  target: T,
  serviceName: string
): T {
  return new Proxy(target, {
    get(target, prop, receiver) {
      const originalValue = Reflect.get(target, prop, receiver);
      
      if (typeof originalValue === 'function' && typeof prop === 'string') {
        // Check if it's an async function
        const isAsync = originalValue.constructor.name === 'AsyncFunction';
        
        if (isAsync) {
          return withTracing(
            originalValue.bind(target),
            `${serviceName}.${prop}`,
            {
              extractTags: () => ({
                serviceName,
                methodName: prop,
                proxyType: 'automatic'
              })
            }
          );
        } else {
          return originalValue.bind(target);
        }
      }
      
      return originalValue;
    }
  });
}

/**
 * Service-specific method filtering for targeted instrumentation
 */
export const ServiceMethodFilters = {
  GeminiService: {
    include: ['generateResponse', 'processRequest', 'handleContext'],
    exclude: ['getStatus', 'cleanup', 'initialize']
  },
  ConversationManager: {
    include: ['getOrCreateConversation', 'addToConversation', 'buildConversationContext', 'fetchChannelHistory'],
    exclude: ['getStats', 'cleanup']
  },
  ContextManager: {
    include: ['buildSystemContext', 'getUserContext', 'getChannelContext'],
    exclude: ['validateConfig', 'getStats']
  },
  HealthMonitor: {
    include: ['checkServiceHealth', 'reportHealth', 'checkDependencies'],
    exclude: ['start', 'stop', 'getStatus']
  }
};

/**
 * Apply filtered instrumentation to a service
 */
export function instrumentServiceWithFilters<T extends IService>(
  service: T,
  serviceName: keyof typeof ServiceMethodFilters
): T {
  const filters = ServiceMethodFilters[serviceName];
  
  if (!filters) {
    logger.warn('No filters defined for service, using default instrumentation', { serviceName });
    return instrumentService(service, serviceName as string);
  }
  
  return instrumentService(service, serviceName as string, {
    onlyMethods: filters.include,
    skipMethods: filters.exclude,
    extractServiceTags: () => ({
      serviceType: serviceName.toLowerCase(),
      instrumentationType: 'filtered',
      includedMethods: filters.include.length,
      excludedMethods: filters.exclude.length
    })
  });
}