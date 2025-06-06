# PROJECT_AGENT_CONFIG.md - Discord LLM Bot

## Project Context for All Agents

### Project Overview
- **Name**: Discord LLM Bot
- **Type**: TypeScript Discord Bot with Gemini AI Integration
- **Version**: 1.0.0
- **Node Version**: >=18.0.0
- **Primary Language**: TypeScript
- **Key Technologies**: Discord.js v14, Google Gemini AI, async-mutex, winston

### Architecture Summary
```
discord-llm-bot/
├── src/
│   ├── index.ts           # Main entry point
│   ├── commands/          # Discord slash commands
│   ├── services/          # Core services (Gemini, RateLimiter, etc.)
│   ├── utils/             # Utility functions
│   └── events/            # Event handlers (currently empty)
├── data/                  # Persistent data storage
├── logs/                  # Application logs
└── agents/                # Agent framework and reports
```

### Critical Project Rules (from CLAUDE.md)
1. **NO EMOJIS** in code (causes unicode errors)
2. **NEVER** add git commit signatures
3. Follow SLDC principles
4. Security basics always included
5. Clean up temporary files unless agent-created
6. Frontend targets desktop/laptop only

### Code Patterns and Standards

#### TypeScript Standards
```typescript
// ALWAYS use proper types - NO 'any'
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Use async/await pattern
async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await interaction.deferReply();
    // Implementation
  } catch (error) {
    logger.error('Error:', error);
    // Error handling
  }
}

// Proper error handling with user feedback
if (interaction.replied || interaction.deferred) {
  await interaction.followUp({ content: errorMessage, ephemeral: true });
} else {
  await interaction.reply({ content: errorMessage, ephemeral: true });
}
```

#### Service Pattern
```typescript
export class ServiceName {
  private readonly CONFIG_VALUE: number;
  
  constructor(config: Config) {
    this.CONFIG_VALUE = config.value;
  }
  
  async initialize(): Promise<void> {
    // Initialization logic
  }
  
  shutdown(): void {
    // Cleanup logic
  }
}
```

#### Rate Limiting Pattern
```typescript
const release = await this.mutex.acquire();
try {
  // Protected code
} finally {
  release();
}
```

### Specialized Agent Configurations

#### Developer Agent Config
```yaml
language: typescript
compiler: tsc
linter: eslint
formatter: prettier
build_command: npm run build
test_command: npm test
constraints:
  - No emojis in code
  - Maintain existing patterns
  - Add error handling
  - Use proper TypeScript types
```

#### Tester Agent Config
```yaml
test_framework: jest
coverage_tool: jest --coverage
minimum_coverage: 80
test_patterns:
  - Unit tests: *.test.ts
  - Integration tests: *.integration.test.ts
focus_areas:
  - Discord event handlers
  - Gemini API interactions
  - Rate limiting logic
  - Memory management
```

#### Security Agent Config
```yaml
vulnerability_scanner: npm audit
dependency_check: npm outdated
security_focus:
  - API key management
  - User input validation
  - Rate limiting enforcement
  - Permission checks
forbidden_patterns:
  - Hardcoded secrets
  - console.log of sensitive data
  - Direct env var access (use config)
```

#### Performance Agent Config
```yaml
profiling_tools:
  - Node.js built-in profiler
  - Memory usage tracking
performance_targets:
  - Response time: <100ms
  - Memory usage: <512MB
  - CPU usage: <50%
optimization_areas:
  - Context building
  - Message splitting
  - JSON operations
  - Array manipulations
```

### Environment Variables
```env
# Required
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
GOOGLE_API_KEY=

# Personality & Behavior
GEMINI_SYSTEM_INSTRUCTION=
HELPFUL_INSTRUCTION=
ROAST_BASE_CHANCE=0.5
ROAST_CONSECUTIVE_BONUS=0.25
ROAST_MAX_CHANCE=0.9
ROAST_COOLDOWN=true

# Memory & Context
CONVERSATION_TIMEOUT_MINUTES=30
MAX_CONVERSATION_MESSAGES=100
MAX_CONTEXT_CHARS=50000
GROUNDING_THRESHOLD=0.3
THINKING_BUDGET=1024
INCLUDE_THOUGHTS=false

# Features
ENABLE_CODE_EXECUTION=false
ENABLE_STRUCTURED_OUTPUT=false

# Rate Limiting
GEMINI_RATE_LIMIT_RPM=10
GEMINI_RATE_LIMIT_DAILY=500

# Other
LOG_LEVEL=info
NODE_ENV=development
```

### Known Issues and Constraints
1. **Missing Discord Intent**: GuildMessageReactions not included
2. **Type Safety Issues**: Unsafe assertions in addRunningGag
3. **Memory Leaks**: setTimeout callbacks in server history
4. **Performance**: JSON.stringify in context trimming
5. **API Limitations**: @google/genai v1.4.0 doesn't support all Gemini features

### Success Metrics

| Metric | Current | Target | Priority |
|--------|---------|--------|----------|
| Type Safety | 95% | 100% | HIGH |
| Test Coverage | 0% | 80% | HIGH |
| Response Time | Unknown | <100ms | MEDIUM |
| Memory Usage | Unknown | <512MB | MEDIUM |
| Error Rate | Unknown | <0.1% | HIGH |
| Uptime | Unknown | 99.9% | LOW |

### Agent Communication Protocol

#### File References
Always use absolute paths from project root:
- ✅ `src/services/gemini.ts:854`
- ❌ `./gemini.ts`

#### Report References
```yaml
previous_report: DEVELOPER_REPORT_BUG-001.yaml
dependent_on: [TESTER_REPORT_TEST-001.yaml]
```

#### Context Passing
```yaml
context:
  - Fixed issue in src/index.ts:15
  - Related to Discord intent configuration
  - Affects reaction tracking feature
```

### Build and Deployment

#### Development Workflow
```bash
npm run dev      # Development mode with ts-node
npm run build    # Compile TypeScript
npm start        # Run compiled bot
npm test         # Run tests
npm run lint     # Check code style
npm run format   # Format code
```

#### Deployment Checklist
- [ ] All TypeScript errors resolved
- [ ] Tests passing with >80% coverage
- [ ] No security vulnerabilities (npm audit)
- [ ] Environment variables configured
- [ ] Rate limits tested
- [ ] Memory usage profiled
- [ ] Error handling verified

### Special Considerations

#### Discord API
- Respect rate limits (50 requests per second)
- Handle gateway disconnections
- Implement proper intent configuration
- Use ephemeral messages for sensitive commands

#### Gemini API
- 10 RPM rate limit (9 effective with safety margin)
- 500 daily limit (450 effective)
- Handle empty responses gracefully
- Implement retry logic

#### Memory Management
- Clear old conversations after timeout
- Trim context to prevent bloat
- Monitor heap usage
- Implement cleanup intervals

### Agent-Specific Instructions

#### For Bug Fix Agents
1. Read existing code thoroughly
2. Maintain current patterns
3. Add comprehensive error handling
4. Update related documentation
5. Consider edge cases

#### For Feature Agents
1. Check CLAUDE.md for restrictions
2. Follow existing architecture
3. Add configuration options
4. Implement graceful degradation
5. Include monitoring hooks

#### For Optimization Agents
1. Profile before optimizing
2. Maintain functionality
3. Document performance gains
4. Consider memory tradeoffs
5. Add benchmarks

### Forbidden Actions
- ❌ Adding emojis to code
- ❌ Using 'any' type
- ❌ Hardcoding secrets
- ❌ Removing error handling
- ❌ Breaking existing APIs
- ❌ Ignoring TypeScript errors
- ❌ Creating files without cleanup