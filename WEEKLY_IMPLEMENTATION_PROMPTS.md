# 12-Week Implementation Prompts - Discord LLM Bot Remediation

**Document Version:** 1.0  
**Based on:** COMPREHENSIVE_TECHNICAL_ANALYSIS_REPORT.md  
**Target:** Claude Code + Agent Coordination  
**Purpose:** Systematic implementation of technical debt remediation

---

## Phase Overview Prompts

### Phase 1 Initiation Prompt (Emergency Stabilization)
```
Execute emergency stabilization phase for Discord LLM Bot codebase. Priority: CRITICAL production stability.

CONTEXT: Technical analysis identified 48 ESLint errors, 47 'any' types, 4 security vulnerabilities, and 10+ files exceeding 700 lines. Core services have 0% test coverage.

PHASE OBJECTIVES:
- Eliminate all high/critical security vulnerabilities
- Reduce ESLint errors from 48 to <20
- Achieve >60% test coverage for core services
- Decompose files >700 lines to comply with CLAUDE.md standards

RESOURCE ALLOCATION: Deploy 3-5 parallel agents for maximum efficiency
TIMELINE: 2 weeks (Weeks 1-2)
BUDGET CONSTRAINT: $20,000 equivalent effort

Execute Phase 1 coordination and deploy weekly implementation agents.
```

### Phase 2 Initiation Prompt (Architecture Refactoring)
```
Execute architecture refactoring phase for Discord LLM Bot. Priority: HIGH long-term sustainability.

CONTEXT: Phase 1 stabilization complete. Now focus on service decomposition, dependency injection, and comprehensive testing infrastructure.

PHASE OBJECTIVES:
- Implement dependency injection container
- Create service registry with health checks
- Establish event-driven communication patterns
- Achieve 80% test coverage across all services
- Centralize configuration management

RESOURCE ALLOCATION: Deploy 4-6 specialized agents (architecture, testing, configuration)
TIMELINE: 4 weeks (Weeks 3-6)
DEPENDENCIES: Phase 1 completion required

Execute Phase 2 coordination and deploy weekly implementation agents.
```

### Phase 3 Initiation Prompt (Modernization & Enhancement)
```
Execute modernization and enhancement phase for Discord LLM Bot. Priority: MEDIUM future-proofing.

CONTEXT: Architecture refactoring complete. Focus on TypeScript modernization, performance optimization, and documentation.

PHASE OBJECTIVES:
- Implement advanced TypeScript patterns
- Add ESM module support
- Achieve 25% performance improvement
- Generate comprehensive documentation
- Enhance developer experience

RESOURCE ALLOCATION: Deploy 3-4 specialized agents (modernization, performance, documentation)
TIMELINE: 6 weeks (Weeks 7-12)
DEPENDENCIES: Phase 2 completion required

Execute Phase 3 coordination and deploy weekly implementation agents.
```

---

## Weekly Implementation Prompts

### Week 1: Security & Type Safety Emergency

#### Primary Agent Prompt (Security Specialist)
```
AGENT: security-vulnerability-scanner
SCOPE: Emergency security remediation - Week 1 of Phase 1

CRITICAL TASKS:
1. Execute `npm audit fix` for all vulnerabilities
   - Target: undici (DoS vulnerability) 
   - Target: brace-expansion (ReDoS vulnerability)
   - Verify: Zero high/critical vulnerabilities remain

2. Implement type guards for external API calls
   - File: src/services/geminiService.ts
   - File: src/services/discordService.ts  
   - Pattern: Replace all 'any' types with proper interfaces

3. Add strict null checks to tsconfig.json
   - Enable: "strict": true, "strictNullChecks": true
   - Fix resulting type errors systematically

SUCCESS CRITERIA:
- npm audit shows 0 high/critical vulnerabilities
- ESLint errors reduced from 48 to <35
- All external API calls have type guards

PARALLEL COORDINATION: Coordinate with type-safety agent
REPORT FORMAT: Security remediation summary with before/after metrics
```

#### Parallel Agent Prompt (Type Safety Specialist)
```
AGENT: code-quality-reviewer
SCOPE: Type safety implementation - Week 1 of Phase 1

CRITICAL TASKS:
1. Audit and fix explicit 'any' usage (current: 47 instances)
   - Priority files:
     * src/utils/ConnectionPool.ts (8 'any' usages)
     * src/utils/ResourceManager.ts (6 'any' usages)
     * src/services/responseProcessingService.ts (7 'any' usages)

2. Create type-safe interfaces for critical data structures
   - API response interfaces with generics
   - Discord message type definitions
   - Configuration type schemas

3. Implement branded types for type safety
   - User IDs, Channel IDs, Guild IDs
   - Configuration keys and values

SUCCESS CRITERIA:
- 'any' usage reduced from 47 to <30
- Zero unsafe type casting
- All critical interfaces defined

PARALLEL COORDINATION: Coordinate with security agent
VALIDATION: Run `npm run lint` - target <35 errors
```

#### Testing Agent Prompt (Emergency Coverage)
```
AGENT: test-suite-generator
SCOPE: Emergency test coverage - Week 1 of Phase 1

CRITICAL TASKS:
1. Create emergency test coverage for core services (target: >60%)
   - ContextManager (src/services/contextManager.ts:1-1394)
   - GeminiService (src/services/geminiService.ts)
   - ConfigurationManager (src/services/configurationManager.ts)

2. Implement service integration tests
   - Discord API integration mocks
   - Gemini API integration mocks
   - Configuration loading validation

3. Add error path testing
   - Network failure scenarios
   - Invalid configuration handling
   - API rate limiting scenarios

SUCCESS CRITERIA:
- Core services test coverage >60%
- All critical error paths tested
- CI/CD pipeline includes coverage gates

DEPENDENCIES: Wait for security fixes before testing
VALIDATION: `npm test` passes with coverage report
```

### Week 2: Critical File Decomposition

#### Lead Refactoring Agent Prompt
```
AGENT: code-refactoring-specialist
SCOPE: Massive file decomposition - Week 2 of Phase 1

CRITICAL TASKS:
1. Refactor contextManager.ts (1,394 lines → ~400 lines across 3 files)
   Target structure:
   - src/services/context/ContextManager.ts (~200 lines)
   - src/services/context/ContextBuilder.ts (~180 lines)  
   - src/services/context/MemoryManager.ts (~160 lines)
   - src/services/context/interfaces/ (interface definitions)

2. Decompose BaseService.ts (1,228 lines → ~300 lines + interfaces)
   Target structure:
   - src/services/base/BaseService.ts (~300 lines)
   - src/services/base/ServiceRegistry.ts (~250 lines)
   - src/services/base/HealthMonitor.ts (~200 lines)
   - src/services/base/interfaces/ (service interfaces)

3. Split configuration files into focused modules
   - Core configuration management
   - Validation schemas  
   - Environment handling

SUCCESS CRITERIA:
- No files exceed 700 lines
- All services implement proper interfaces
- Maintain 100% functional compatibility
- Pass all existing tests

PARALLEL COORDINATION: Deploy 3 specialized agents for each major file
VALIDATION: Full test suite passes, lint errors <20
```

#### Context Manager Decomposition Agent
```
AGENT: code-modernization-expert  
SCOPE: contextManager.ts refactoring - Week 2 Phase 1

TARGET FILE: src/services/contextManager.ts (1,394 lines)
DECOMPOSITION PLAN:
- ContextManager.ts (orchestration layer, ~200 lines)
- ContextBuilder.ts (context building logic, ~180 lines)
- MemoryManager.ts (memory optimization, ~160 lines)
- SocialDynamicsService.ts (social graph, ~150 lines)
- ConversationTracker.ts (conversation state, ~140 lines)

REFACTORING APPROACH:
1. Extract interfaces first (IContextManager, IMemoryManager, ISocialDynamics)
2. Create type definitions (ContextTypes.ts, SocialTypes.ts)
3. Split classes maintaining dependency injection
4. Preserve all existing public APIs
5. Maintain backward compatibility

SUCCESS CRITERIA:
- Original file removed, functionality preserved
- All imports updated automatically  
- Zero functional regressions
- Improved testability with mocked interfaces

VALIDATION: Run full test suite, verify Context functionality
```

#### Base Service Decomposition Agent
```
AGENT: system-architecture-designer
SCOPE: BaseService.ts refactoring - Week 2 Phase 1

TARGET FILE: src/services/BaseService.ts (1,228 lines)
DECOMPOSITION PLAN:
- BaseService.ts (core service abstract class, ~300 lines)
- ServiceRegistry.ts (service discovery/registration, ~250 lines)
- HealthMonitor.ts (health checking infrastructure, ~200 lines)
- ServiceLifecycle.ts (start/stop/restart logic, ~150 lines)

ARCHITECTURE IMPROVEMENTS:
1. Implement proper dependency injection patterns
2. Create service health monitoring framework
3. Add graceful shutdown handling
4. Implement service-to-service communication patterns

SUCCESS CRITERIA:
- Services can be registered/discovered dynamically
- Health monitoring operational for all services
- Graceful startup/shutdown implemented
- Service dependencies properly managed

VALIDATION: All services start successfully, health checks pass
```

### Week 3-4: Service Layer Decomposition

#### Architecture Lead Agent Prompt
```
AGENT: system-architecture-designer
SCOPE: Service layer architecture implementation - Weeks 3-4 Phase 2

ARCHITECTURE OBJECTIVES:
1. Implement dependency injection container
   - Create IoC container with service registration
   - Add service lifetime management (singleton, transient, scoped)
   - Implement constructor injection patterns

2. Create service registry with health checks
   - Service discovery mechanism
   - Health endpoint implementation
   - Automated service monitoring

3. Establish event-driven communication patterns
   - Event bus implementation
   - Async message handling
   - Service decoupling through events

4. Design plugin architecture for extensibility
   - Plugin interface definition
   - Dynamic plugin loading
   - Plugin lifecycle management

SUCCESS CRITERIA:
- All services use dependency injection
- Service health monitoring operational
- Event bus handling service communication
- Plugin architecture supports extensibility

DELIVERABLES:
- Service architecture documentation
- Dependency injection framework
- Event bus implementation  
- Health monitoring dashboard

PARALLEL COORDINATION: Deploy 2 supporting agents for testing and configuration
```

#### Service Testing Agent
```
AGENT: test-suite-generator
SCOPE: Service layer comprehensive testing - Weeks 3-4 Phase 2

TESTING OBJECTIVES:
1. Service integration testing
   - Service-to-service communication tests
   - Dependency injection container tests
   - Event bus message flow tests

2. Health monitoring tests
   - Health check endpoint validation
   - Service failure recovery testing
   - Monitoring dashboard functionality

3. Plugin architecture tests
   - Plugin loading/unloading tests
   - Plugin isolation tests
   - Plugin API compatibility tests

SUCCESS CRITERIA:
- Service layer test coverage >85%
- Integration tests covering all service interactions
- Health monitoring tests validate failure scenarios
- Plugin architecture fully tested

VALIDATION: All tests pass, coverage reports generated
```

### Week 5-6: Configuration & Testing Infrastructure

#### Configuration Management Agent
```
AGENT: code-modernization-expert
SCOPE: Centralized configuration management - Weeks 5-6 Phase 2

CONFIGURATION OBJECTIVES:
1. Centralized configuration management
   - Single configuration entry point
   - Environment-specific configuration handling
   - Configuration validation with JSON schemas

2. Configuration hot-reloading
   - Runtime configuration updates
   - Service notification of config changes
   - Graceful configuration migration

3. Secrets management integration
   - Secure secret storage patterns
   - Environment variable management
   - Configuration encryption for sensitive data

SUCCESS CRITERIA:
- All configuration centralized and validated
- Hot-reloading operational for non-critical configs
- Secrets properly managed and encrypted
- Configuration schema validation prevents errors

DELIVERABLES:
- Configuration validation schema
- Hot-reload implementation
- Secrets management integration
```

#### CI/CD Enhancement Agent
```
AGENT: technical-documentation-writer  
SCOPE: CI/CD pipeline enhancement - Weeks 5-6 Phase 2

CI/CD OBJECTIVES:
1. Enhanced CI/CD pipeline with quality gates
   - Pre-commit hooks for code quality
   - Automated testing with coverage requirements
   - Security scanning integration

2. Performance benchmarking integration
   - Automated performance regression detection
   - Memory usage monitoring
   - Response time validation

3. Deployment automation
   - Blue-green deployment setup
   - Automated rollback procedures
   - Production monitoring integration

SUCCESS CRITERIA:
- Quality gates prevent low-quality code merges
- Performance regressions detected automatically
- Deployment process is fully automated
- Rollback procedures tested and documented

DELIVERABLES:
- Enhanced CI/CD pipeline configuration
- Performance benchmarking suite
- Deployment automation scripts
```

### Week 7-9: Modern TypeScript Features

#### TypeScript Modernization Agent
```
AGENT: code-modernization-expert
SCOPE: Advanced TypeScript patterns - Weeks 7-9 Phase 3

MODERNIZATION OBJECTIVES:
1. Implement advanced TypeScript patterns
   - Utility types (Pick, Omit, Record, etc.)
   - Mapped types for configuration objects
   - Conditional types for API responses
   - Template literal types for string validation

2. Add ESM module support
   - Convert CommonJS to ESM modules
   - Update import/export statements
   - Configure TypeScript for ESM output
   - Update build pipeline for ESM

3. Integrate modern async patterns
   - Async generators for data streaming
   - AsyncIterableIterator patterns
   - AbortController for cancellation
   - Async/await optimization

SUCCESS CRITERIA:
- TypeScript 5.8 features fully utilized
- ESM modules working across entire codebase
- Modern async patterns improve performance
- No legacy TypeScript patterns remain

DELIVERABLES:
- TypeScript 5.8 migration complete
- Modern module system implementation
- Advanced type system utilization
- Performance optimizations documentation
```

#### Performance Optimization Agent
```
AGENT: performance-optimization-expert
SCOPE: Performance optimization implementation - Weeks 7-9 Phase 3

PERFORMANCE OBJECTIVES:
1. Memory optimization
   - Identify and fix memory leaks
   - Optimize object creation patterns
   - Implement object pooling where beneficial
   - Add memory usage monitoring

2. Response time optimization  
   - Database query optimization
   - API response caching
   - Async operation batching
   - Connection pooling optimization

3. Resource utilization optimization
   - CPU usage profiling and optimization
   - I/O operation optimization
   - Network request optimization
   - Bundle size reduction

SUCCESS CRITERIA:
- 25% improvement in average response time
- Memory usage reduced by 30%
- CPU utilization optimized
- No performance regressions

DELIVERABLES:
- Performance optimization report
- Monitoring dashboard for performance metrics
- Optimized code with benchmarks
```

### Week 10-12: Performance & Documentation

#### Documentation Generation Agent
```
AGENT: technical-documentation-writer
SCOPE: Comprehensive documentation - Weeks 10-12 Phase 3

DOCUMENTATION OBJECTIVES:
1. Auto-generated API documentation
   - TypeScript interface documentation
   - Service API documentation  
   - Configuration schema documentation
   - Plugin API documentation

2. Developer onboarding guide
   - Setup and installation guide
   - Development workflow documentation
   - Debugging and troubleshooting guide
   - Contribution guidelines

3. Architecture documentation
   - System architecture diagrams
   - Service interaction documentation
   - Database schema documentation
   - Deployment architecture guide

SUCCESS CRITERIA:
- All APIs documented with examples
- Onboarding guide enables new developer productivity
- Architecture documentation supports maintenance
- Documentation stays current with automated generation

DELIVERABLES:
- Auto-generated API documentation
- Developer onboarding guide
- Architecture documentation suite
```

#### Production Monitoring Agent
```
AGENT: diagnostic-debugger
SCOPE: Production monitoring enhancement - Weeks 10-12 Phase 3

MONITORING OBJECTIVES:
1. Enhanced error tracking
   - Structured error logging
   - Error aggregation and alerting
   - Performance regression detection
   - User experience monitoring

2. Business metrics tracking
   - Usage analytics implementation
   - Performance KPI tracking
   - Service availability monitoring
   - Cost optimization tracking

3. Alerting and incident response
   - Automated alerting rules
   - Incident response procedures
   - Performance threshold monitoring
   - Capacity planning metrics

SUCCESS CRITERIA:
- Production issues detected before user impact
- Performance metrics provide actionable insights
- Incident response time reduced by 50%
- Capacity planning data supports growth

DELIVERABLES:
- Production monitoring dashboard
- Automated alerting system
- Incident response procedures
- Performance improvement documentation
```

---

## Quality Gate Validation Prompts

### Weekly Validation Prompt Template
```
Execute weekly quality gate validation for Week [X] of the 12-week remediation plan.

VALIDATION SCOPE:
- Code quality metrics verification
- Security vulnerability scanning
- Test coverage validation
- Performance benchmark verification
- Documentation completeness check

VALIDATION COMMANDS:
1. `npm run lint -- --max-warnings 0` (must pass)
2. `npm run test:coverage` (verify coverage targets)
3. `npm audit --audit-level high` (zero high/critical)
4. `npm run build` (successful compilation)
5. Performance benchmark suite execution

SUCCESS CRITERIA FOR WEEK [X]:
[Week-specific criteria from technical analysis report]

FAILURE PROTOCOL:
If any validation fails, immediately create remediation tasks and assign to appropriate specialist agents.

REPORTING:
Generate weekly progress report with metrics comparison and next week preparation.
```

### Phase Completion Validation Prompt
```
Execute comprehensive phase completion validation for Phase [X].

PHASE [X] SUCCESS CRITERIA:
[Phase-specific criteria from technical analysis report]

COMPREHENSIVE VALIDATION:
1. All weekly validations passed
2. Phase objectives achieved
3. No regressions introduced
4. Performance targets met
5. Documentation updated

SIGN-OFF REQUIREMENTS:
- Technical lead approval
- Quality assurance validation
- Performance benchmark certification
- Security review completion

NEXT PHASE PREPARATION:
Upon successful validation, prepare environment and resources for Phase [X+1] initiation.
```

---

## Agent Coordination Prompts

### Parallel Agent Deployment Prompt
```
Deploy parallel agent coordination for maximum efficiency during Week [X].

AGENT ALLOCATION:
- Primary Agent: [Specialist type] - [Primary task]
- Supporting Agent 1: [Specialist type] - [Supporting task]  
- Supporting Agent 2: [Specialist type] - [Supporting task]
- Quality Agent: [Specialist type] - [Validation task]

COORDINATION REQUIREMENTS:
1. Non-overlapping file/line scopes
2. Clear dependency ordering
3. Regular progress synchronization
4. Conflict resolution protocols

COMMUNICATION PROTOCOL:
- Mark todos in_progress before starting
- Update todos immediately upon completion
- Include file:line references in all updates
- Report blockers immediately for resolution

SUCCESS COORDINATION:
All agents must complete tasks before week validation begins.
```

### Crisis Management Prompt
```
Execute crisis management protocol for blocked or failing implementation.

CRISIS SCENARIOS:
1. Agent task failure or blocking issue
2. Merge conflicts in parallel development
3. Performance regression detection
4. Security vulnerability introduction

IMMEDIATE RESPONSE:
1. Halt all related parallel agents
2. Assess impact and root cause
3. Deploy diagnostic-debugger agent for analysis
4. Implement immediate remediation
5. Resume coordinated development

ESCALATION CRITERIA:
- Multiple agent failures
- Critical security issues
- Performance degradation >20%
- Timeline impact >2 days

RECOVERY PROTOCOL:
Document lessons learned and update coordination protocols.
```

---

## Usage Instructions

### For Claude Code Direct Execution:
```bash
# Copy and paste the appropriate weekly prompt directly into Claude Code
# Example for Week 1:
[Paste Week 1 Security & Type Safety Emergency prompt]
```

### For Agent Configuration (/agents):
```bash
# Save prompts as individual agent files
cp "Week 1 Security Agent Prompt" /agents/week1-security-agent.md
cp "Week 1 Type Safety Agent Prompt" /agents/week1-typesafety-agent.md
cp "Week 1 Testing Agent Prompt" /agents/week1-testing-agent.md

# Execute agents in parallel
/agents week1-security-agent
/agents week1-typesafety-agent  
/agents week1-testing-agent
```

### For Phase-Based Execution:
```bash
# Execute entire phase with coordination
[Paste Phase 1 Initiation Prompt] 
# Follow with weekly implementation prompts
```

---

## Measurement & Tracking

### Weekly Progress Metrics:
- ESLint errors count (target reduction)
- TypeScript 'any' usage count (target reduction)  
- Test coverage percentage (target increase)
- File size violations count (target zero)
- Security vulnerabilities count (target zero)
- Performance benchmarks (target improvement)

### Success Validation:
Each prompt includes specific success criteria that can be automatically validated through CI/CD pipeline integration.

---

**Document Prepared By:** Charles (AI Co-founder)  
**Integration With:** COMPREHENSIVE_TECHNICAL_ANALYSIS_REPORT.md  
**Usage:** Claude Code + Agent Coordination Framework  
**Maintenance:** Update weekly based on actual implementation results