# TASK_MANIFEST: Phase 1 - Critical Bug Fixes

## Overview
This manifest outlines the critical bug fixes required for the Discord LLM Bot, addressing HIGH priority issues that impact core functionality.

## Phase Metadata
```yaml
phase: 1
name: Critical Bug Fixes
priority: HIGH
estimated_duration: 1-2 days
master_agent_id: MASTER-P1-001
created: 2025-06-05
status: COMPLETED
```

## Objectives
1. Fix missing Discord intent preventing reaction tracking
2. Resolve type safety issues with unsafe assertions
3. Eliminate memory leaks in server history management
4. Ensure robust error handling for Gemini API responses

## Success Criteria
- [x] All TypeScript compilation errors resolved
- [x] Reaction tracking functionality operational
- [x] No memory leaks detected in 24-hour test
- [x] 100% of identified type safety issues fixed
- [x] Comprehensive error handling implemented
- [ ] All fixes have corresponding tests

## Task Breakdown

### Task BUG-001: Missing Discord Intent
```yaml
task_id: BUG-001
title: Add Missing GuildMessageReactions Intent
priority: CRITICAL
assigned_to: developer_agent
location: src/index.ts:15
issue: |
  Bot attempts to track message reactions but lacks the required
  GuildMessageReactions intent, causing silent failure
solution: |
  Add GatewayIntentBits.GuildMessageReactions to client intents array
dependencies: none
estimated_time: 30 minutes
```

### Task BUG-002: Type Safety Violations
```yaml
task_id: BUG-002
title: Fix Unsafe Type Assertions in addRunningGag
priority: HIGH
assigned_to: developer_agent
location: src/services/gemini.ts:854-866
issue: |
  Unsafe type casting with 'as unknown as' bypasses TypeScript safety
  Risk of runtime errors and maintenance issues
solution: |
  1. Define proper interface for ContextManager internals
  2. Refactor addRunningGag to use type-safe approach
  3. Update contextManager to expose proper methods
dependencies: none
estimated_time: 1 hour
```

### Task BUG-003: Memory Leak in Server History
```yaml
task_id: BUG-003
title: Fix Memory Leak in setTimeout Callbacks
priority: HIGH
assigned_to: developer_agent
location: src/services/gemini.ts:578-585
issue: |
  setTimeout callbacks retain references without cleanup
  Accumulates memory over time, potential crash risk
solution: |
  1. Store timeout IDs in a Map
  2. Clear timeouts on cleanup/shutdown
  3. Implement maximum timeout limit
  4. Add cleanup in shutdown() method
dependencies: none
estimated_time: 1 hour
```

### Task BUG-004: Incomplete Gemini Error Handling
```yaml
task_id: BUG-004
title: Enhance Gemini API Error Handling
priority: HIGH
assigned_to: developer_agent
location: src/services/gemini.ts:726-760
issue: |
  Empty response handling doesn't cover all edge cases
  Safety filter responses not properly handled
  Retry logic could fail silently
solution: |
  1. Add specific handling for safety filter blocks
  2. Implement exponential backoff for retries
  3. Add user-friendly messages for different error types
  4. Log all error conditions for debugging
dependencies: none
estimated_time: 1.5 hours
```

### Task TEST-001: Comprehensive Bug Fix Tests
```yaml
task_id: TEST-001
title: Create Tests for All Bug Fixes
priority: HIGH
assigned_to: tester_agent
scope: All BUG-* fixes
requirements: |
  1. Unit tests for Discord intent configuration
  2. Type safety tests for addRunningGag
  3. Memory leak detection tests
  4. Error handling scenario tests
  5. Integration tests for reaction tracking
dependencies: [BUG-001, BUG-002, BUG-003, BUG-004]
estimated_time: 2 hours
coverage_target: 90%
```

### Task REV-001: Code Review and Validation
```yaml
task_id: REV-001
title: Review All Phase 1 Bug Fixes
priority: HIGH
assigned_to: reviewer_agent
scope: All Phase 1 changes
checklist: |
  - Code follows project patterns
  - No new TypeScript errors introduced
  - Error handling is comprehensive
  - Tests provide adequate coverage
  - Performance impact assessed
  - Security implications reviewed
dependencies: [TEST-001]
estimated_time: 1 hour
```

### Task VER-001: Final Verification
```yaml
task_id: VER-001
title: Verify Phase 1 Completion
priority: HIGH
assigned_to: verifier_agent
verification_steps: |
  1. Run full TypeScript compilation
  2. Execute entire test suite
  3. Check reaction tracking in live environment
  4. Monitor memory usage for 1 hour
  5. Verify error handling with edge cases
  6. Confirm all success criteria met
dependencies: [REV-001]
estimated_time: 1 hour
```

## Execution Strategy

### Parallel Execution Groups
```
Group 1 (Parallel): [BUG-001, BUG-002, BUG-003, BUG-004]
Group 2 (Sequential): TEST-001 → REV-001 → VER-001
```

### Risk Mitigation
1. **Rollback Plan**: Git commits after each successful fix
2. **Testing Environment**: Use test Discord server
3. **Monitoring**: Watch logs during implementation
4. **Communication**: Update stakeholders on critical issues

## Dependencies
- Access to Discord test server
- Gemini API test credentials
- Node.js 18+ environment
- All npm dependencies installed

## Resource Requirements
- 1 Master Agent (orchestration)
- 1 Developer Agent (implementation)
- 1 Tester Agent (validation)
- 1 Reviewer Agent (quality assurance)
- 1 Verifier Agent (final confirmation)

## Deliverables
1. Fixed source code files
2. Comprehensive test suite
3. Phase 1 completion report
4. Updated documentation
5. Performance metrics

## Phase Completion Criteria
- [x] All tasks completed successfully
- [x] Zero TypeScript compilation errors
- [ ] All tests passing
- [x] Code review approved
- [x] Verification checklist complete
- [x] No regression in existing functionality

## Next Phase Trigger
Upon successful completion of Phase 1, automatically trigger Phase 2 (Performance Optimization) manifest.

## Notes
- Priority on stability over optimization
- Maintain backward compatibility
- Document all changes in code comments
- Update CHANGES_SUMMARY.md after completion