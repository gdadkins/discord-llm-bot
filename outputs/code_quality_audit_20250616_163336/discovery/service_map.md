# Service Architecture Map

## Overview
- **Total Services**: 130
- **Total Interfaces**: 25
- **Base Services**: 1
- **Managers**: 15
- **Builders**: 11
- **Handlers**: 6
- **Engines**: 3

## Core Architecture

### Base Service Framework

**BaseService** (`src/services/base/BaseService.ts`)
- Timer management
- Resource tracking
- Lifecycle management (6 states: created, initializing, ready, shutting_down, shutdown, failed)
- Health monitoring
- Error handling

**ServiceInitializer** (`src/core/ServiceInitializer.ts`)
- Dependency resolution with topological sorting
- Timeout protection
- Automatic rollback on failure
- Resource cleanup
- Graceful shutdown procedures

## Service Domains

### 1. Analytics Domain (15 services)

**Key Services:**
| Service | Location | Dependencies | Purpose |
|---------|----------|--------------|---------|
| analyticsManager | `src/services/analyticsManager.ts` | EventTrackingService, MetricsCollectionService | Central analytics coordination |
| EventTrackingService | `src/services/analytics/EventTrackingService.ts` | better-sqlite3, uuid | Event persistence |
| EventBatchingService | `src/services/analytics/EventBatchingService.ts` | - | Performance optimization |
| UserBehaviorAnalytics | `src/services/analytics/UserBehaviorAnalytics.ts` | crypto-js | User pattern analysis |

### 2. Configuration Domain (11 services)

**Key Services:**
| Service | Location | Dependencies | Issue |
|---------|----------|--------------|-------|
| ConfigurationManager | `src/services/config/ConfigurationManager.ts` | chokidar, ajv | ⚠️ Duplicate file exists |
| ConfigurationValidator | `src/services/config/ConfigurationValidator.ts` | ajv | - |
| ConfigurationMonitor | `src/config/monitoring/ConfigurationMonitor.ts` | - | - |

### 3. Context Domain (18 services, 9 builders)

**Key Services:**
- **contextManager**: Central context orchestration
- **ContextCacheManager**: Context caching layer
- **ConversationMemoryService**: Conversation state management

**Context Builders:**
- BehaviorContextBuilder
- CodeSnippetsContextBuilder
- CompositeContextBuilder
- CrossServerContextBuilder
- EmbarrassingMomentsContextBuilder
- FactsContextBuilder
- RunningGagsContextBuilder
- SocialDynamicsContextBuilder
- UserContextBuilder

### 4. Gemini AI Domain (4 services)

**Key Services:**
| Service | Location | Critical | Purpose |
|---------|----------|----------|---------|
| GeminiService | `src/services/gemini/GeminiService.ts` | ✅ Yes | Main AI integration |
| GeminiAPIClient | `src/services/gemini/GeminiAPIClient.ts` | - | API communication |
| GeminiContextProcessor | `src/services/gemini/GeminiContextProcessor.ts` | - | Context preparation |

### 5. Health Monitoring Domain (5 services)

**Key Services:**
- **HealthMonitor** (Critical): Main health monitoring service
- **HealthMetricsCollector**: Metrics aggregation
- **HealthReportGenerator**: Report generation
- **HealthStatusEvaluator**: Status evaluation

### 6. Resilience Domain (7 services)

**Key Services:**
- **CircuitBreaker**: Fault tolerance
- **GracefulDegradation**: Degraded operation support
- **FallbackManager**: Fallback strategy management
- **DiscordCircuitBreaker**: Discord-specific circuit breaking

## Service Dependency Graph

### Critical Path
1. ConfigurationManager
2. HealthMonitor
3. GeminiService
4. contextManager
5. conversationManager

### Orphaned Services
- `src/services/OptimizedServiceExample.ts`
- `src/examples/ServiceInitializerExample.ts`

## Interface Structure

**Location**: `src/services/interfaces/`
**Count**: 25 interfaces

**Key Interfaces:**
- IService (base service interface)
- ServiceHealthStatus
- IAnalyticsService
- ICacheService
- IConfigurationService
- IGeminiService

## Issues Identified

### 1. Duplicate Services

| Service | File 1 | File 2 | Size Difference |
|---------|--------|--------|-----------------|
| ConfigurationManager | `src/services/config/ConfigurationManager.ts` | `src/services/configurationManager.ts` | 14,415 vs 1,010 bytes |
| MultimodalContentHandler | `src/services/multimodal/MultimodalContentHandler.ts` | `src/services/multimodalContentHandler.ts` | - |
| RoastingEngine | `src/services/roasting/RoastingEngine.ts` | `src/services/roastingEngine.ts` | - |

### 2. Naming Inconsistencies
- Mixed casing: `analyticsManager.ts` vs `ConfigurationManager.ts`
- Recommendation: Standardize to PascalCase

### 3. Organizational Issues
- Services spread across multiple directory levels
- 130 services is a large number to manage
- Some services in subdirectories, others at root

## Recommendations

### High Priority
1. **Remove Duplicate Services**
   - Delete smaller duplicate files
   - Update all imports to use canonical version
   - Impact: Eliminates confusion and potential bugs

2. **Standardize Service Naming**
   - Use PascalCase for all service files
   - Update imports accordingly
   - Impact: Improves consistency and discoverability

### Medium Priority
1. **Reorganize Service Structure**
   - Group all services by domain in subdirectories
   - Move root-level services to appropriate domains
   - Impact: Better organization and maintainability

2. **Consolidate Related Services**
   - Merge multiple context builders using composite pattern
   - Combine similar analytics services
   - Impact: Reduces complexity and file count

### Low Priority
1. **Document Service Dependencies**
   - Create dependency graph visualization
   - Document service initialization order
   - Impact: Easier onboarding and debugging

2. **Implement Service Registry**
   - Central service discovery mechanism
   - Runtime service inspection
   - Impact: Better debugging and monitoring