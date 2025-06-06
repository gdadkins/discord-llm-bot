# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Philosophy

- Always follow SLDC principles for all code/programming
- Security basics always included
- Always read and understand the codebase before implementing a new feature or bugfix
- Always adhere to efficient best practices structured, modular based component/module/code architecture and CSS for components/module/code for easier troubleshooting/implementations/updates. CSS files need to stay concise in nature even on a per individual basis.
- Never add the following to git updates or related: 🤖 Generated with [Claude Code](https://claude.ai/code) Co-Authored-By: Claude <noreply@anthropic.com>"
- Never use emojis in any code as it will cause unicode errors/problems. If you come across any emoji in existing codebase outside of .md files, remove it.
- If you create any temporary new files, scripts, or helper files for iteration, clean up these files by removing them at the end of the task unless specifically by an agent or sub-agent. Any agent* created files can be placed in /agents/ folder in an organized manner.
- When removing any code, make sure to verify if any methods/etc related to it can also be safely removed. The less tech debt, the better health our codebase will be.
- Frontend CSS/themes/etc base off of desktop or laptop utilization and not mobile
- Summarize completed work sessions and suggest improvements at the end of each task. This creates a continuous improvement loop where Claude Code helps refine the Claude.md documentation and workflow instructions based on actual usage, making subsequent iterations more effective.

## Code Refactoring Guidelines

When refactoring code, follow these principles:

- **SOLID principles**: Apply Single Responsibility Principle by breaking down large methods (>50 lines) into smaller, focused functions
- **DRY methodology**: Eliminate code duplication by creating shared utility functions
- **Extract constants**: Move magic numbers and configuration data to named constants
- **Separation of concerns**: Separate data processing from presentation logic
- **Static analysis**: Fix unused variables, type issues, and other warnings
- **Testing**: Verify functionality through comprehensive testing after each change

Goal: Improve maintainability, readability, and testability while preserving existing behavior.

## Development Commands

- `npm run dev` - Start bot in development mode with ts-node
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled bot
- `npm test` - Run Jest tests
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint -- --fix` - Auto-fix ESLint violations (quotes, formatting)
- `npm run format` - Format code with Prettier

## Bug Fix Workflow

### Parallel Agent Deployment Pattern
- Use TodoWrite to plan multi-bug fixes with clear task breakdown
- Deploy parallel agents for independent bugs to maximize efficiency
- Each agent should have clearly defined scope and non-overlapping code sections
- Always run final lint/build validation after all agents complete
- Auto-fix style violations with `npm run lint -- --fix`

### Critical Bug Priority Order
1. **Discord API Integration Issues** - Missing intents, permissions, API compatibility
2. **Type Safety Violations** - Unsafe casting, any types, interface mismatches
3. **Memory Leaks** - Untracked timers, event listeners, closure retention
4. **Error Handling Gaps** - API edge cases, network failures, user input validation

### Agent Coordination Protocol
- Mark todos as `in_progress` when starting, `completed` immediately upon finishing
- Use specific line number references for bug locations (e.g., `src/file.ts:123`)
- Final coordination agent handles integration testing and validation
- Document all changes with before/after code examples

## Performance Optimization Workflow

### Phase-Based Optimization Strategy
1. **Assessment Phase**: Identify bottlenecks through profiling and analysis
2. **Planning Phase**: Create specialized agent assignments with non-overlapping scopes
3. **Execution Phase**: Deploy parallel agents with real-time coordination
4. **Validation Phase**: Comprehensive testing and integration verification

### Performance Measurement Standards
- **Always provide quantified improvements** (e.g., "8.2x faster", "90% less I/O")
- **Benchmark before/after** with realistic workload scenarios
- **Memory impact analysis** with specific reduction percentages
- **API compatibility verification** to ensure zero breaking changes

### Critical Performance Patterns
- **Mutex Architecture**: Use separate mutexes for state vs I/O operations
- **Write-Back Caching**: Batch file operations to reduce I/O overhead
- **LRU-Based Eviction**: Implement intelligent data retention strategies
- **Resource Monitoring**: Add memory/performance tracking for long-term health

## Code Quality Standards

### TypeScript Best Practices
- **Never use `as unknown as` type casting** - Always create proper interfaces and type guards
- **No `any` types in production code** - Use proper typing with generics or union types
- **Implement cleanup methods** for services with timers/intervals/event listeners
- **Validate environment variables** with proper fallbacks and error handling
- **Use strict null checks** - Handle undefined/null cases explicitly

### Memory Management Patterns
- **Track all setTimeout/setInterval calls** in collections (Set<NodeJS.Timeout>)
- **Implement cleanup methods** in service classes with proper timer clearance
- **Clear timers on service shutdown** to prevent memory leaks
- **Use WeakMap/WeakSet** for temporary references where appropriate
- **Monitor closure retention** - avoid capturing unnecessary variables in callbacks

### Memory Management Performance Patterns

#### **Intelligent Caching Strategies**
- **LRU-Based Eviction**: Implement scoring systems considering age, frequency, and recency
- **Approximate Size Tracking**: Cache expensive calculations like `JSON.stringify()`
- **Batch Operations**: Process collections in batches to reduce iteration overhead
- **Proactive Cleanup**: Implement 75% capacity triggers for early optimization

#### **Resource Monitoring Requirements**
- **Memory Statistics APIs**: Provide visibility into resource usage
- **Automatic Maintenance**: Implement periodic cleanup with configurable intervals
- **Graceful Degradation**: Ensure continued operation when resources are constrained
- **Shutdown Procedures**: Always implement proper cleanup methods

### Error Handling Requirements
- **Implement retry logic** with exponential backoff for network operations
- **Handle all API finish reasons and block reasons** (Gemini: SAFETY, MAX_TOKENS, RECITATION, etc.)
- **Provide user-friendly error messages** instead of technical exceptions
- **Log detailed error context** for debugging while protecting sensitive data
- **Validate input comprehensively** before processing or API calls

### Service Design Patterns
- **All services must implement cleanup/shutdown methods** for graceful termination
- **Use dependency injection** for testability and modularity
- **Implement proper error boundaries** with fallback mechanisms
- **Design for graceful degradation** when external services fail
- **Mutex protection** for shared state modifications

### Code Architecture Principles
- **Single Responsibility** - Each class/function has one clear purpose
- **Interface Segregation** - Create specific interfaces rather than large generic ones
- **Dependency Inversion** - Depend on abstractions, not concretions
- **Immutability where possible** - Avoid unnecessary state mutations
- **Consistent error propagation** - Use Result types or proper exception hierarchies

### Caching Implementation Standards
When implementing caches:
- **Always use SHA-256 or similar for cache keys** - Ensures uniqueness and consistency
- **Implement LRU eviction** - Prevents unbounded memory growth
- **Add cache metrics** - Hit rate, miss rate, memory usage for monitoring
- **Provide cache bypass mechanisms** - For dynamic operations like /clear, /execute
- **Set reasonable TTLs** - Balance freshness vs. performance (e.g., 5 minutes)
- **Thread-safe by default** - Use mutex protection for concurrent access
- **Include cleanup in shutdown** - Clear caches in service cleanup methods

## Performance Optimization Discovery Patterns

### Pre-Implementation Discovery Checklist
Before implementing optimizations:
- [ ] **Audit Phase**: Search for "cache", "optimize", "performance", "memo", "LRU" in codebase
- [ ] **Baseline Establishment**: Run `npm run benchmark:baseline` before any changes
- [ ] **Bottleneck Quantification**: Measure actual impact (ms, MB, ops/sec, %)
- [ ] **Existing Solutions Check**: The codebase may already have sophisticated solutions
- [ ] **Risk-Benefit Analysis**: Document optimization complexity vs. expected gains
- [ ] **Parameter Tuning First**: Often achieves goals with minimal risk
- [ ] **Regression Prevention**: Identify tests needed to prevent performance regressions

### Discovery Process Steps
1. **Audit Existing Code** - Search for existing optimizations that may already solve the problem
2. **Measure Baseline Performance** - Use actual metrics, not assumptions
3. **Validate Optimization Necessity** - Ensure the optimization provides real value
4. **Consider Parameter Tuning First** - Often achieves goals with minimal risk

Example: PERF-004 discovered the rate limiter already had advanced I/O batching, requiring only parameter tuning rather than a full rewrite.

Example: PERF-006 discovered the response caching was already fully implemented with comprehensive monitoring.

## Development Workflow Checklists

### Pre-Implementation Checklist
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
- [ ] **Identify Non-Overlapping Scopes** for parallel agent deployment
- [ ] **Plan Resource Cleanup** for any new timers, intervals, or caches
- [ ] **Design Compatibility Preservation** strategy for existing APIs
- [ ] **Design Cache Bypass Rules** for dynamic commands
- [ ] **Plan Metrics Collection** for measuring improvement

### Post-Implementation Validation
After implementing changes:
- [ ] **Run `npm run lint -- --fix`** to auto-resolve style issues
- [ ] **Run `npm run build`** to verify TypeScript compilation success
- [ ] **Test error scenarios** and edge cases manually
- [ ] **Verify memory cleanup** in long-running scenarios and service restarts
- [ ] **Document any new environment variables** in the configuration section
- [ ] **Update command documentation** if CLI options changed
- [ ] **Test integration points** with other services and components
- [ ] **Verify graceful degradation** when external dependencies fail

After implementing optimizations:
- [ ] **Measure Performance Gains** with specific percentages/multipliers
- [ ] **Verify API Compatibility** with existing calling code
- [ ] **Test Resource Cleanup** during shutdown scenarios
- [ ] **Document Resource Usage** and monitoring capabilities

### Code Health Monitoring
Regular maintenance tasks to perform:
- [ ] **Monitor setTimeout/setInterval usage** for proper cleanup patterns
- [ ] **Review error handling coverage** in API integrations quarterly
- [ ] **Audit type assertions and any types** monthly
- [ ] **Check for memory leak patterns** in event handlers and callbacks
- [ ] **Update dependency versions** and test compatibility
- [ ] **Review log output** for recurring warnings or errors

## Automated Quality Gates

### Development Workflow Integration
Integrate these automated checks into your development process:

#### **Pre-Commit Quality Gates**
```bash
# Essential validation sequence
npm run lint -- --fix  # Auto-fix style violations
npm run build          # Verify TypeScript compilation
npm test               # Run automated test suite
```

#### **Pre-Agent Deployment Quality Gates**
```bash
# Pre-agent deployment validation
npm run lint -- --fix && npm run build && npm test

# Post-implementation verification  
npm run benchmark:baseline     # Establish performance baseline
npm run lint -- --fix         # Code style compliance
npm run build                 # TypeScript compilation
npm run test                  # Functional validation
npm run benchmark:compare     # Performance regression check
```

#### **Performance Validation Gates**
```bash
# Performance-specific validation sequence
npm run lint -- --fix     # Auto-fix style violations
npm run build             # Verify TypeScript compilation
# Add performance regression testing when available
# Add memory leak detection for long-running operations
```

#### **Performance Success Criteria**
- **Quantified Improvements**: All optimizations must show measurable gains
- **Zero Regression**: Existing functionality must remain unchanged
- **Resource Cleanup**: All new timers/intervals must have cleanup methods
- **Thread Safety**: Concurrent operations must be properly protected

#### **Continuous Integration Requirements**
For production deployments, ensure these gates pass:
- **Zero ESLint Errors** - Code style and syntax validation
- **TypeScript Compilation Success** - Type safety verification  
- **Test Suite Coverage** - Functional behavior validation
- **Memory Leak Detection** - Long-running service stability
- **Security Scan** - Dependency vulnerability assessment

#### **Code Quality Metrics**
Monitor these key indicators:
- **Type Safety Score** - Percentage of code with proper typing
- **Error Handling Coverage** - Percentage of operations with error boundaries
- **Memory Cleanup Compliance** - Timer/listener cleanup implementation rate
- **API Integration Robustness** - Edge case handling completeness

#### **Automated Enforcement Patterns**
```typescript
// Example: Enforce cleanup methods in services
interface ServiceLifecycle {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;  // Required for all services
}

// Example: Enforce error handling in API calls
interface ApiOperation<T> {
  execute(): Promise<Result<T, ApiError>>;  // No raw exceptions
}
```

### Quality Gate Escalation

#### **Severity Levels**
1. **CRITICAL** - Blocks deployment (memory leaks, security issues)
2. **HIGH** - Requires immediate attention (type safety, error handling)
3. **MEDIUM** - Should be addressed in current cycle (code style, documentation)
4. **LOW** - Technical debt for future cycles (optimization, refactoring)

#### **Automated Remediation**
- **Style Issues** - Auto-fix with `npm run lint -- --fix`
- **Import Organization** - Auto-sort and optimize imports
- **Code Formatting** - Prettier integration for consistent style
- **Documentation Generation** - Auto-update API documentation from code

## Architecture Overview

This is a Discord bot that integrates with Google's Gemini AI. The bot uses Discord.js v14 for Discord integration and @google/genai for Gemini API calls. The bot supports both slash commands and @mention functionality for natural conversation.

### Core Components

- **Main Entry Point** (`src/index.ts`): 
  - Discord client with TypeScript types and graceful shutdown
  - Handles slash commands, @mentions, and reaction tracking
  - Smart message splitting for long responses
  - Memory leak fixes in typing indicators

- **Gemini Service** (`src/services/gemini.ts`): 
  - AI integration with `gemini-2.5-flash-preview-05-20` model
  - Dynamic dual personality system (roasting vs helpful)
  - Randomized behavior with configurable probability
  - Extended conversation memory (default 100 messages, 30min timeout)
  - Per-user roast tracking and probability adjustment
  - Server-wide context integration
  - Google Search grounding for real-time information (configurable threshold)
  - Thinking mode enabled by default in Gemini 2.5 (configurable budget)

- **Rate Limiter** (`src/services/rateLimiter.ts`):
  - Thread-safe with mutex protection
  - Persistent state in `data/rate-limit.json`
  - 10% safety margin (9 RPM, 450 daily effective limits)
  - Proper time window alignment

- **Context Manager** (`src/services/contextManager.ts`):
  - Leverages Gemini's 1M token context window
  - Tracks embarrassing moments, code snippets, running gags
  - Server-wide memory for deep roasting callbacks
  - Auto-trimming to prevent memory bloat

- **Message Splitter** (`src/utils/messageSplitter.ts`):
  - Intelligent splitting at paragraph/sentence boundaries
  - Handles Discord's 2000 char limit gracefully

- **Commands** (`src/commands/index.ts`): 
  - `/chat` - Main conversation
  - `/status` - Bot stats and memory usage
  - `/clear` - Reset conversation
  - `/remember` - Track embarrassing moments
  - `/addgag` - Add server running gags
  - `/execute` - Execute Python code (when enabled)
  - Personality commands: `/setpersonality`, `/mypersonality`, `/getpersonality`, `/removepersonality`, `/clearpersonality`

### Key Systems

#### Rate Limiting
- Mutex-protected, persistent across restarts
- 10% safety margin: 9 RPM, 450 daily (configurable)
- Stored in `data/rate-limit.json`

#### Dynamic Roasting Behavior
- Dynamic base chance (20-70%, updates hourly)
- Bot moods: sleepy, caffeinated, chaotic, reverse_psychology, bloodthirsty
- Chaos consecutive bonuses with random escalation and bonus bombs
- Chaos mode events (5% trigger chance, 0.5x-2.5x multipliers)
- Psychological warfare: roast debt, mercy kills, cooldown breaking
- Contextual intelligence: message complexity, time of day, server activity
- Caps at 90%, optional cooldown with 15% override chance
- Per-user tracking with sophisticated probability calculations
- Dual personalities: roasting vs helpful

#### Extended Context Memory
- Leverages Gemini's 1M token window
- Configurable: up to 100+ messages, hours of memory
- Server-wide tracking of embarrassments and gags
- Smart trimming by size and message count

### Command Handling Patterns

#### Slash Commands
Commands are handled in the main interaction event listener with a switch statement. Each command function receives the interaction object and handles its own response logic including:
- Input validation
- Deferred replies for long operations
- Error handling with user-friendly messages
- Discord message length limits (2000 chars)

#### @Mention Handling
The bot also responds to mentions in the `MessageCreate` event:
- Extracts message content after the mention
- Shows typing indicator while processing
- Maintains typing indicator with 5-second intervals for long responses
- Properly clears typing intervals to prevent memory leaks
- Handles message length limits automatically
- Provides error messages on failure

### Environment Configuration

**Required:**
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application client ID  
- `GOOGLE_API_KEY` - Google AI API key

**Personality & Behavior:**
- `GEMINI_SYSTEM_INSTRUCTION` - Roasting personality (no content restrictions)
- `HELPFUL_INSTRUCTION` - Non-roasting personality (no content restrictions)
- `ROAST_BASE_CHANCE` - Initial roast probability (0.5)
- `ROAST_CONSECUTIVE_BONUS` - Increase per question (0.25)
- `ROAST_MAX_CHANCE` - Maximum probability (0.9)
- `ROAST_COOLDOWN` - Skip roast after roasting (true)

**Memory & Context:**
- `CONVERSATION_TIMEOUT_MINUTES` - Session timeout (30)
- `MAX_CONVERSATION_MESSAGES` - Messages per user (100)
- `MAX_CONTEXT_CHARS` - Context size limit (50000)
- `GROUNDING_THRESHOLD` - Google Search grounding threshold (0.3)
- `THINKING_BUDGET` - Thinking mode token budget (1024)
- `INCLUDE_THOUGHTS` - Include thinking process in responses (false)

**Advanced Features:**
- `ENABLE_CODE_EXECUTION` - Enable Python code execution (false)
- `ENABLE_STRUCTURED_OUTPUT` - Enable JSON structured responses (false)

### Structured Output Use Cases

When `ENABLE_STRUCTURED_OUTPUT=true`, the bot can return structured JSON responses for:

1. **Code Execution Results**:
   ```json
   {
     "explanation": "Here's how to calculate the factorial of 5",
     "code": "def factorial(n):\n    return 1 if n <= 1 else n * factorial(n-1)\n\nresult = factorial(5)",
     "output": "120",
     "visualizations": []
   }
   ```

2. **General Responses with Metadata** (alternative schema):
   ```json
   {
     "response": "The answer to your question is 42",
     "mood": "helpful",
     "confidence": 0.95,
     "suggestions": ["Try asking about the meaning of life", "Calculate 6 × 7"]
   }
   ```

The bot would parse these and display them appropriately - users wouldn't see raw JSON.

**Rate Limiting:**
- `GEMINI_RATE_LIMIT_RPM` - Per minute limit (10)
- `GEMINI_RATE_LIMIT_DAILY` - Daily limit (500)

**Other:**
- `LOG_LEVEL` - Winston log level (info)
- `NODE_ENV` - Environment mode

### Bot Management Scripts

Windows-specific scripts in `/scripts/` for production deployment:
- **start-bot.ps1/bat** - Start bot in interactive mode with visible console
- **start-bot-background.vbs** - Start bot in background (hidden)
- **restart-bot.ps1** - Stop and restart the bot in one command
- **kill-bot.ps1/bat** - Force terminate bot processes
- **create-startup-task.ps1** - Configure Windows Task Scheduler for auto-startup

## Agent Coordination Protocols

### Parallel Agent Communication
When deploying multiple agents for concurrent tasks:

#### **Agent Assignment Strategy**
- **Independent Scope Rule** - Each agent must work on non-overlapping code sections
- **File-Level Scope Assignment** - Assign specific files/line ranges per agent
  - Example: PERF-001 (contextManager.ts:89-422), PERF-003 (gemini.ts:206-289)
- **Clear Boundaries** - Define specific files, functions, or line ranges per agent
- **Dependency Awareness** - Agent order matters if fixes have dependencies
- **Resource Conflicts** - Avoid agents modifying shared utilities simultaneously

#### **Agent Handoff Protocol**
- **Status Sync** - Agents must update todos immediately upon task completion
- **Artifact Linking** - All agents should reference specific output files/reports
- **Cross-Dependencies** - Document any discovered dependencies between parallel tasks
- **Resource Conflicts** - Log any shared resource access (files, services) for coordination

#### **Optimal Agent Allocation Pattern**
- **Analysis Agents**: 1-2 for discovery and planning (performance review, code review)
- **Implementation Agents**: 2-3 for non-overlapping code changes
- **Validation Agents**: 1-2 for testing and verification (benchmarking, validation)
- **Maximum Parallel Agents**: 4 for optimal resource utilization

#### **Task Coordination Patterns**
```markdown
### Example Multi-Agent Deployment
- **Agent BUG-001**: Discord Intent Fix (src/index.ts:10-17)
- **Agent BUG-002**: Type Safety Fix (src/services/gemini.ts:854-866)  
- **Agent BUG-003**: Memory Leak Fix (src/services/gemini.ts:578-585)
- **Agent BUG-004**: Error Handling Fix (src/services/gemini.ts:726-760)
```

#### **Performance Agent Specialization Patterns**
- **Race Condition Agents**: Focus on mutex implementation, message deduplication, concurrent operation safety
- **Memory Optimization Agents**: Implement LRU caching, intelligent trimming, resource monitoring
- **I/O Efficiency Agents**: Optimize file operations, implement write-back caching, batch processing
- **Integration Validation Agents**: Comprehensive testing across all modified components

#### **Agent Success Metrics**
- **Performance Gains**: Quantify improvements (e.g., "8.2x faster", "25% memory reduction")
- **API Compatibility**: Ensure zero breaking changes to existing interfaces
- **Resource Cleanup**: Implement proper shutdown/cleanup methods for all new features
- **Validation Coverage**: Lint, build, type safety, and functional testing all must pass

#### **Communication Protocol**
- **Status Updates** - Mark todos as `in_progress` → `completed` in real-time
- **Location References** - Always include file paths with line numbers
- **Change Documentation** - Provide before/after code snippets
- **Integration Points** - Note any cross-agent dependencies or conflicts
- **Performance Metrics** - Include quantified gains in status updates
- **Resource Impact** - Report memory/CPU implications of changes
- **Compatibility Status** - Confirm API compatibility maintenance

#### **Validation Chain Requirements**
1. **Individual Agent Validation** - Syntax, lint, basic functionality
2. **Performance Benchmarking** - Measure and report quantified improvements
3. **Cross-Agent Integration** - Test interactions between modified components
4. **System-Wide Validation** - End-to-end functionality and performance testing

### Knowledge Capture Patterns

#### **Bug Fix Documentation Format**
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

#### **Common Bug Patterns Reference**
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

### Existing Optimization Inventory

Track discovered optimizations to prevent redundant implementation:

#### **High-Performance Components Already Implemented**
- **CacheManager**: LRU caching with SHA-256 keys, 5-min TTL, thread-safe
- **RateLimiter**: 10-second I/O write-back batching, mutex-protected persistence
- **ContextManager**: Intelligent LRU trimming with scoring (age, frequency, recency)
- **GeminiService**: Partial memoization, conversation cleanup, timer management

#### **Performance Patterns In Use**
- **Mutex Architecture**: Separate mutexes for state vs I/O operations
- **Write-Back Caching**: Batched file operations reduce I/O overhead  
- **LRU-Based Eviction**: Intelligent data retention with composite scoring
- **Resource Monitoring**: Memory tracking with periodic cleanup cycles

#### **Optimization Opportunities Identified**
- **Roast Calculations**: Memoization improvements needed (random variance defeats caching)
- **Context Assembly**: Parallel processing potential for independent sources
- **Message History**: Circular buffer potential for array operations
- **Cache Tuning**: Size and TTL parameter optimization opportunities

Update this inventory when implementing new optimizations or discovering existing ones.

### Key Technical Details

- **AI Model**: `gemini-2.5-flash-preview-05-20` (1M token context)
- **Core Package**: `@google/genai` v1.4.0 (uses `GoogleGenAI` class)
- **Message Handling**: Smart splitting, no truncation
- **Persistence**: Rate limits survive restarts, memory doesn't (privacy)
- **Type Safety**: Full TypeScript, no `any` types
- **Thread Safety**: `async-mutex` for race condition prevention
- **Performance**: 5-min cleanup cycles, size-based trimming
- **Discord Intents**: Guilds, GuildMessages, MessageContent, GuildMessageReactions
- **Error Handling**: Automatic retry on empty responses, safety filter detection
- **Content Policy**: No restrictions in either personality mode