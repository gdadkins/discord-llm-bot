# CAEF Quick Reference - Discord LLM Bot

## 🚀 Quick Agent Commands

### Master Agent Commands
```bash
# Create task manifest for bug fixes
Task: "Master Agent: Create manifest for Phase 1 critical bug fixes"

# Orchestrate parallel fixes
Task: "Master Agent: Deploy parallel agents for Discord intent, type safety, and memory leak fixes"

# Aggregate reports
Task: "Master Agent: Aggregate all agent reports for Phase 1 and generate summary"
```

### Developer Agent Commands
```bash
# Fix Discord intent issue
Task: "Developer Agent: Add missing GuildMessageReactions intent to src/index.ts:15"

# Fix type safety issues
Task: "Developer Agent: Refactor addRunningGag method in src/services/gemini.ts:854 to use proper interfaces"

# Fix memory leaks
Task: "Developer Agent: Implement cleanup mechanism for setTimeout callbacks in src/services/gemini.ts:578-585"

# Optimize context manager
Task: "Developer Agent: Replace JSON.stringify with character-based tracking in src/services/contextManager.ts:89"
```

### Tester Agent Commands
```bash
# Create unit tests
Task: "Tester Agent: Write unit tests for GeminiService with 80% coverage"

# Test rate limiter
Task: "Tester Agent: Create integration tests for RateLimiter thread safety"

# Test Discord handlers
Task: "Tester Agent: Write tests for all Discord event handlers and commands"
```

### Reviewer Agent Commands
```bash
# Code review
Task: "Reviewer Agent: Review all Phase 1 bug fixes for code quality and standards"

# Security review
Task: "Security Agent: Audit dependencies and check for vulnerabilities in package.json"

# Performance review
Task: "Performance Agent: Profile message splitting algorithm and suggest optimizations"
```

### Verifier Agent Commands
```bash
# Verify fixes
Task: "Verifier Agent: Confirm all Phase 1 bug fixes meet success criteria"

# Final validation
Task: "Verifier Agent: Run full test suite and confirm deployment readiness"
```

## 📋 Copy-Paste Templates

### Bug Fix Template
```
Task: "Developer Agent: Fix [BUG_DESCRIPTION] in [FILE_PATH]:[LINE_NUMBER]. 
Current issue: [CURRENT_BEHAVIOR]. 
Expected: [EXPECTED_BEHAVIOR]. 
Ensure TypeScript compliance and add appropriate error handling."
```

### Test Creation Template
```
Task: "Tester Agent: Create comprehensive tests for [COMPONENT_NAME]. 
Include unit tests for all public methods, edge cases for [SPECIFIC_SCENARIOS], 
and integration tests with [DEPENDENCIES]. Target 80% coverage minimum."
```

### Performance Optimization Template
```
Task: "Performance Agent: Optimize [FEATURE/FUNCTION] in [FILE_PATH]. 
Current performance: [CURRENT_METRICS]. 
Target: [TARGET_METRICS]. 
Consider [SPECIFIC_TECHNIQUES] for optimization."
```

### Review Template
```
Task: "Reviewer Agent: Review [COMPONENT/FEATURE] implementation. 
Check for: code quality, TypeScript best practices, error handling, 
performance implications, and adherence to project patterns. 
Reference: CLAUDE.md for project standards."
```

## 🔗 Chained Command Patterns

### Full Bug Fix Chain
```
1. Task: "Master Agent: Create TASK_MANIFEST.md for fixing Discord intent issue"
2. Task: "Developer Agent: Implement fix for missing GuildMessageReactions intent"
3. Task: "Tester Agent: Write tests for reaction tracking functionality"
4. Task: "Reviewer Agent: Review Discord intent fix and test coverage"
5. Task: "Verifier Agent: Confirm reaction tracking now works correctly"
```

### Parallel Execution Pattern
```
Task: "Master Agent: Deploy parallel agents:
- Developer Agent 1: Fix Discord intent issue (src/index.ts:15)
- Developer Agent 2: Fix type safety in addRunningGag (src/services/gemini.ts:854)
- Developer Agent 3: Fix memory leak in setTimeout (src/services/gemini.ts:578)
Aggregate results when all complete."
```

### Performance Optimization Chain
```
1. Task: "Performance Agent: Profile ContextManager.trimContext() performance"
2. Task: "Developer Agent: Implement optimized context trimming algorithm"
3. Task: "Tester Agent: Create performance benchmarks for context operations"
4. Task: "Verifier Agent: Confirm 20%+ performance improvement achieved"
```

## 🎯 Project-Specific Shortcuts

### Discord Bot Specifics
```bash
# Fix all HIGH priority bugs
Task: "Master Agent: Execute Phase 1 - Fix all HIGH priority bugs identified in CODEBASE_ANALYSIS.md"

# Optimize Gemini integration
Task: "Performance Agent: Optimize all Gemini API calls for rate limiting and response time"

# Enhance roasting behavior
Task: "Developer Agent: Implement advanced roasting probability calculations with new mood system"

# Add health monitoring
Task: "Developer Agent: Implement health monitoring system as specified in enhancement recommendations"
```

### Quick Validations
```bash
# Validate TypeScript
Task: "Run TypeScript compiler and fix any errors: npm run build"

# Check rate limits
Task: "Verifier Agent: Confirm rate limiting works correctly with 10% safety margin"

# Test Discord intents
Task: "Tester Agent: Verify all Discord intents are properly configured and functional"
```

## 📊 Report Aggregation

### Generate Phase Report
```
Task: "Master Agent: Generate comprehensive report for Phase [NUMBER] including:
- All agent reports (DEVELOPER_REPORT.yaml, TESTER_REPORT.yaml, etc.)
- Success metrics achievement
- Remaining issues
- Next phase recommendations"
```

### Status Check
```
Task: "Master Agent: Current status check - aggregate all in-progress agent activities and report completion percentage"
```

## 🔄 Fix Patterns

### When Tests Fail
```
Task: "Fixer Agent: Tests failing for [COMPONENT]. Error: [ERROR_MESSAGE]. 
Review test output, fix implementation, and re-run tests until passing."
```

### When Build Fails
```
Task: "Fixer Agent: Build failing with TypeScript errors in [FILE]. 
Fix all type errors while maintaining functionality. Reference: existing patterns in codebase."
```

## 💡 Tips

1. Always include file paths and line numbers for precision
2. Reference previous reports for context
3. Set measurable success criteria
4. Use parallel execution for independent tasks
5. Chain dependent tasks in sequence

## 🏷️ Task ID Convention

- BUG-XXX: Bug fixes
- PERF-XXX: Performance improvements
- FEAT-XXX: New features
- SEC-XXX: Security fixes
- TEST-XXX: Test creation
- DOC-XXX: Documentation