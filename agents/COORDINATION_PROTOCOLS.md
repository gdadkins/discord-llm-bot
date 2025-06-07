# Agent Coordination Protocols

## Parallel Agent Communication
When deploying multiple agents for concurrent tasks:

### Agent Assignment Strategy
- **Independent Scope Rule** - Each agent must work on non-overlapping code sections
- **File-Level Scope Assignment** - Assign specific files/line ranges per agent
  - Example: PERF-001 (contextManager.ts:89-422), PERF-003 (gemini.ts:206-289)
- **Clear Boundaries** - Define specific files, functions, or line ranges per agent
- **Dependency Awareness** - Agent order matters if fixes have dependencies
- **Resource Conflicts** - Avoid agents modifying shared utilities simultaneously

### Agent Handoff Protocol
- **Status Sync** - Agents must update todos immediately upon task completion
- **Artifact Linking** - All agents should reference specific output files/reports
- **Cross-Dependencies** - Document any discovered dependencies between parallel tasks
- **Resource Conflicts** - Log any shared resource access (files, services) for coordination

### Optimal Agent Allocation Pattern (Phase 3 Validated)
- **Foundation Agents**: 1-2 for core services and monitoring infrastructure
- **Feature Agents**: 4-6 for parallel implementation with non-overlapping scopes
- **Quality Agents**: 3 for testing, documentation, and architecture review
- **Validation Agents**: 1 for final verification and production certification
- **Maximum Parallel Agents**: 10 for complex feature development (Phase 3 proven effective)
- **Coordination Pattern**: Sequential foundation → parallel features → parallel quality → final validation

### Task Coordination Patterns
```markdown
### Example Multi-Agent Deployment
- **Agent BUG-001**: Discord Intent Fix (src/index.ts:10-17)
- **Agent BUG-002**: Type Safety Fix (src/services/gemini.ts:854-866)  
- **Agent BUG-003**: Memory Leak Fix (src/services/gemini.ts:578-585)
- **Agent BUG-004**: Error Handling Fix (src/services/gemini.ts:726-760)
```

### Performance Agent Specialization Patterns
- **Race Condition Agents**: Focus on mutex implementation, message deduplication, concurrent operation safety
- **Memory Optimization Agents**: Implement LRU caching, intelligent trimming, resource monitoring
- **I/O Efficiency Agents**: Optimize file operations, implement write-back caching, batch processing
- **Integration Validation Agents**: Comprehensive testing across all modified components

### Agent Success Metrics (Phase 3 Standard)
- **Performance Gains**: Quantify improvements with confidence intervals (e.g., "8.2x faster", "40% memory reduction", "99.9% uptime")
- **API Compatibility**: Ensure zero breaking changes to existing interfaces
- **Resource Cleanup**: Implement proper shutdown/cleanup methods for all new features
- **Validation Coverage**: Lint, build, type safety, and functional testing all must pass
- **Architecture Quality**: Maintain 90%+ quality score through reviews
- **Documentation Completeness**: User, admin, and developer guides for all features
- **Production Readiness**: Full monitoring, alerting, and graceful degradation

### Communication Protocol (Enhanced)
- **Status Updates** - Mark todos as `in_progress` → `completed` within 2 hours of completion
- **Location References** - Always include file paths with line numbers (e.g., `src/file.ts:123-456`)
- **Change Documentation** - Provide before/after code snippets with performance impact
- **Integration Points** - Note any cross-agent dependencies or conflicts with mitigation strategies
- **Performance Metrics** - Include quantified gains with confidence intervals in status updates
- **Resource Impact** - Report memory/CPU implications with scalability projections
- **Compatibility Status** - Confirm API compatibility maintenance with test evidence
- **Cross-Dependencies** - Document integration points with file:line references
- **Resource Coordination** - Log shared resource access for coordination

### Validation Chain Requirements
1. **Individual Agent Validation** - Syntax, lint, basic functionality
2. **Performance Benchmarking** - Measure and report quantified improvements
3. **Cross-Agent Integration** - Test interactions between modified components
4. **System-Wide Validation** - End-to-end functionality and performance testing

## Knowledge Capture Patterns

### Bug Fix Documentation Format
```markdown
## BUG-XXX Fix Report: [Title]

### Current Issue Analysis
- **Location**: file.ts:line-range
- **Root Cause**: Detailed explanation
- **Impact**: Effects on system behavior

### Solution Implemented  
- **Approach**: Strategy used to fix
- **Changes Made**: Exact code modifications
- **Files Modified**: List with line numbers

### Verification Results
- **Lint Status**: Pass/Fail with details
- **Build Status**: Pass/Fail with details  
- **Testing**: Manual verification performed
```

### Common Bug Patterns Reference
Based on completed fixes, watch for these recurring patterns:

1. **Discord.js Integration Issues**
   - Missing intents for new features
   - Improper event handler cleanup
   - Rate limiting not implemented

2. **Gemini API Edge Cases**
   - Incomplete error handling for all finish reasons
   - Missing retry logic for network failures
   - Unsafe response parsing

3. **Memory Management Problems**  
   - Untracked setTimeout/setInterval usage
   - Event listener accumulation
   - Closure variable retention

4. **TypeScript Safety Violations**
   - Unsafe type assertions (as unknown as)
   - Missing null/undefined checks
   - Inadequate interface definitions

## Existing Optimization Inventory

Track discovered optimizations to prevent redundant implementation:

### High-Performance Components Already Implemented
- **CacheManager**: LRU caching with SHA-256 keys, 5-min TTL, thread-safe
- **RateLimiter**: 10-second I/O write-back batching, mutex-protected persistence
- **ContextManager**: Intelligent LRU trimming with scoring (age, frequency, recency)
- **GeminiService**: Partial memoization, conversation cleanup, timer management

### Performance Patterns In Use
- **Mutex Architecture**: Separate mutexes for state vs I/O operations
- **Write-Back Caching**: Batched file operations reduce I/O overhead  
- **LRU-Based Eviction**: Intelligent data retention with composite scoring
- **Resource Monitoring**: Memory tracking with periodic cleanup cycles

### Optimization Opportunities Identified
- **Roast Calculations**: Memoization improvements needed (random variance defeats caching)
- **Context Assembly**: Parallel processing potential for independent sources
- **Message History**: Circular buffer potential for array operations
- **Cache Tuning**: Size and TTL parameter optimization opportunities

Update this inventory when implementing new optimizations or discovering existing ones.