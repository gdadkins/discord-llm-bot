# Service Architecture Guidelines

## Service Development Best Practices

### Incremental Service Addition
Never add multiple complex services simultaneously:
- Add one service at a time with full testing
- Validate initialization sequence before adding dependencies
- Use feature flags to enable/disable services during development

### Dependency Management
- **Audit imports before adding new services** - Use `npm run build` frequently
- **Avoid circular dependencies** - Services should have clear hierarchy
- **Implement service registry pattern** for centralized lifecycle management
- **Add initialization timeouts** (30s max) with graceful degradation

### File System Operations
- **Test file watching in isolation** before integrating (chokidar in WSL can hang)
- **Implement proper error handling** for file operations
- **Use absolute paths** and validate file existence before operations
- **Consider disabling file watching** in containerized/WSL environments

## Service Architecture Principles

### Core vs Enterprise Services
- **Core Services**: GeminiService, Discord client, basic commands (always working)
- **Enterprise Services**: Config, analytics, monitoring (can be disabled)
- **Service Independence**: Each service must be able to initialize independently
- **Graceful Degradation**: Bot must function even if enterprise services fail

### Service Lifecycle Management
All services must implement the enhanced lifecycle interface:

```typescript
interface EnterpriseService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getHealthStatus(): HealthStatus;
  updateConfiguration(config: Partial<Config>): Promise<boolean>;
  getMetrics(): ServiceMetrics;
  validateConfiguration?(config: Config): ValidationResult;
}
```

## Service Registry Pattern

### Implementation Guidelines
- **Use dependency injection** for testability and modularity
- **Implement proper error boundaries** with fallback mechanisms
- **Design for graceful degradation** when external services fail
- **Mutex protection** for shared state modifications with separate locks for state vs I/O
- **Built-in monitoring**: All services expose health and performance metrics
- **Configuration hot-reload**: Support dynamic reconfiguration without restart

## Context Services Architecture

### Enhanced Context Features
The bot implements three layers of context enhancement:

1. **Discord User Context** (contextManager.ts)
   - Captures user profiles, roles, permissions, status
   - 1-year cache retention for small user bases
   - Minimal memory footprint (~500B-2KB per user)

2. **Message & Channel Context** (index.ts → gemini.ts)
   - Channel metadata, thread awareness, pinned messages
   - Recent emoji tracking for cultural context
   - Attachment awareness for richer responses

3. **Social Dynamics Tracking** (contextManager.ts + messageCreate.ts)
   - Interaction graphs between users
   - Mention/reply/roast history tracking  
   - Relationship patterns for personalization

### Context Data Flow
```
Discord Event → Context Extraction → Context Manager → Gemini Service
     ↓                                      ↓              ↓
  Message     →  Build Context     →  Store/Cache  →  Include in Prompt
```

### Memory Management
- **In-memory storage** with configurable retention policies
- **Automatic cleanup** via LRU eviction and age-based trimming
- **Monitoring** via `/analytics discord-storage` command
- **Configuration** in `src/config/contextConfig.ts`

See [docs/MEMORY_MANAGEMENT.md](MEMORY_MANAGEMENT.md) for detailed storage strategies.

## Pre-Implementation Checklist

Before adding ANY new service:
- [ ] **Audit existing imports** - Check for potential circular dependencies
- [ ] **Test in isolation** - Initialize service standalone before integration  
- [ ] **Add initialization timeout** - Prevent infinite hangs
- [ ] **Implement graceful fallback** - Bot works without this service
- [ ] **Update TROUBLESHOOTING_LOG.md** - Document potential failure points
- [ ] **Verify file operations** - Test file watching/reading in target environment
- [ ] **Plan rollback strategy** - Know how to disable quickly if issues arise
- [ ] **Consider memory impact** - Use monitoring tools for context services