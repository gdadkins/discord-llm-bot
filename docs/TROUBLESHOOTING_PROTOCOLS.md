# Troubleshooting Protocols

## Immediate Diagnostics

When encountering service initialization or runtime issues, run these commands first:

```bash
npm run build    # Check for TypeScript/import errors
npm run lint     # Verify code quality
node -e "require('./dist/index.js')" # Test import resolution
```

## Service Isolation Testing

### Identifying Problematic Services
1. **Comment out services one by one** to identify problematic imports
2. **Add extensive debug logging** during initialization phases
3. **Test initialization timeouts** to prevent infinite hangs

### Common Issue Patterns
- **File watching hangs** - chokidar in WSL environments
- **Circular dependencies** - Complex service import chains
- **Missing environment variables** - Service initialization failures
- **Type assertion errors** - Runtime property access issues

## Recovery Strategy

### Immediate Recovery Steps
1. **Maintain TROUBLESHOOTING_LOG.md** with session-by-session fixes
2. **Keep core services minimal** - only essential functionality in main initialization
3. **Use progressive enhancement** - add enterprise features incrementally
4. **Always maintain working baseline** - never break core bot functionality

### Service Rollback Procedure
1. **Identify failing service** through isolation testing
2. **Comment out service import and initialization**
3. **Remove related command handlers and routes**
4. **Test core functionality restoration**
5. **Document the issue** in TROUBLESHOOTING_LOG.md
6. **Plan incremental re-implementation**

## Critical System Stability Patterns

### Memory Management
- **Track all setTimeout/setInterval calls** in collections (Set<NodeJS.Timeout>)
- **Implement cleanup methods** in service classes with proper timer clearance
- **Clear timers on service shutdown** to prevent memory leaks
- **Use WeakMap/WeakSet** for temporary references where appropriate

### Error Handling Requirements
- **Implement retry logic** with exponential backoff for network operations
- **Handle all API finish reasons and block reasons** (Gemini: SAFETY, MAX_TOKENS, etc.)
- **Provide user-friendly error messages** instead of technical exceptions
- **Log detailed error context** for debugging while protecting sensitive data
- **Validate input comprehensively** before processing or API calls

### Performance Monitoring
- **Add cache metrics** - Hit rate, miss rate, memory usage for monitoring
- **Thread-safe by default** - Use mutex protection for concurrent access
- **Include cleanup in shutdown** - Clear caches in service cleanup methods
- **Set reasonable TTLs** - Balance freshness vs. performance (e.g., 5 minutes)

## Emergency Procedures

### Bot Unresponsive
1. Check process status: `ps aux | grep node`
2. Kill hanging processes: `pkill -f "node dist/index.js"`
3. Check logs for last known good state
4. Restart with minimal services only

### Service Initialization Hang
1. Add debug logging to identify hang location
2. Implement initialization timeouts
3. Test services in isolation
4. Use progressive service enablement

### Memory Leak Detection
1. Monitor memory usage over time
2. Check for uncleaned timers/intervals
3. Audit event listener cleanup
4. Review closure variable capture