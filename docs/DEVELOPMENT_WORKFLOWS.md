# Development Workflows

## Code Quality Standards

### TypeScript Best Practices
- **Never use `as unknown as` type casting** - Always create proper interfaces and type guards
- **No `any` types in production code** - Use proper typing with generics or union types
- **Implement cleanup methods** for services with timers/intervals/event listeners
- **Validate environment variables** with proper fallbacks and error handling
- **Use strict null checks** - Handle undefined/null cases explicitly

### Code Architecture Principles
- **Single Responsibility** - Each class/function has one clear purpose
- **Interface Segregation** - Create specific interfaces rather than large generic ones
- **Dependency Inversion** - Depend on abstractions, not concretions
- **Immutability where possible** - Avoid unnecessary state mutations
- **Consistent error propagation** - Use Result types or proper exception hierarchies

## Pre-Implementation Workflow Checklists

### Pre-Implementation Checklist (General)
Before making any code changes:
- [ ] **Read existing code patterns** and understand current implementation approach
- [ ] **Audit for existing optimizations** that may already solve the problem
- [ ] **Check for similar implementations** in codebase to maintain consistency
- [ ] **Verify environment dependencies** exist and are documented
- [ ] **Plan cleanup strategy** for any resources (timers, listeners, files) created
- [ ] **Consider memory implications** of new features and long-running operations
- [ ] **Review error handling requirements** for the specific domain (API, file I/O, etc.)
- [ ] **Identify affected components** and potential side effects

### Performance Optimization Checklist
Before implementing performance fixes:
- [ ] **Audit Existing Code** for hidden optimizations before implementing
- [ ] **Quantify Current Performance** with specific measurements
- [ ] **Consider Parameter Tuning** as a first approach
- [ ] **Identify Non-Overlapping Scopes** to avoid conflicts when working on multiple files
- [ ] **Plan Resource Cleanup** for any new timers, intervals, or caches
- [ ] **Design Compatibility Preservation** strategy for existing APIs
- [ ] **Design Cache Bypass Rules** for dynamic commands
- [ ] **Plan Metrics Collection** for measuring improvement

## Post-Implementation Validation

### Standard Validation Steps
After implementing changes:
- [ ] **Run `npm run lint -- --fix`** to auto-resolve style issues
- [ ] **Run `npm run build`** to verify TypeScript compilation success
- [ ] **Test error scenarios** and edge cases manually
- [ ] **Verify memory cleanup** in long-running scenarios and service restarts
- [ ] **Check storage impact** with `/analytics discord-storage` for memory features

### Known Test Environment Issues
- Test setup files may have TypeScript target version issues
- Focus on build/lint validation when tests fail due to setup
- Production code validation takes priority over test fixes
- [ ] **Document any new environment variables** in the configuration section
- [ ] **Update command documentation** if CLI options changed
- [ ] **Test integration points** with other services and components
- [ ] **Verify graceful degradation** when external dependencies fail

### Performance Optimization Validation
After implementing optimizations:
- [ ] **Measure Performance Gains** with specific percentages/multipliers
- [ ] **Verify API Compatibility** with existing calling code
- [ ] **Test Resource Cleanup** during shutdown scenarios
- [ ] **Document Resource Usage** and monitoring capabilities

## Code Health Monitoring

### Regular Maintenance Tasks
Perform these tasks regularly:
- [ ] **Monitor setTimeout/setInterval usage** for proper cleanup patterns
- [ ] **Review error handling coverage** in API integrations quarterly
- [ ] **Audit type assertions and any types** monthly
- [ ] **Check for memory leak patterns** in event handlers and callbacks
- [ ] **Update dependency versions** and test compatibility
- [ ] **Review log output** for recurring warnings or errors

### Caching Implementation Standards
When implementing caches:
- **Always use SHA-256 or similar for cache keys** - Ensures uniqueness and consistency
- **Implement LRU eviction** - Prevents unbounded memory growth
- **Add cache metrics** - Hit rate, miss rate, memory usage for monitoring
- **Provide cache bypass mechanisms** - For dynamic operations like /clear, /execute
- **Set reasonable TTLs** - Balance freshness vs. performance (e.g., 5 minutes)
- **Thread-safe by default** - Use mutex protection for concurrent access
- **Include cleanup in shutdown** - Clear caches in service cleanup methods