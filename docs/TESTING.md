# Testing

Testing strategy, patterns, and guidelines for the Discord LLM Bot.

## Commands

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
npm run test:ci    # CI mode with coverage
```

## Test Structure

```
tests/
  unit/           # Service-level tests
  integration/    # Multi-service tests
  mocks/          # Shared mock implementations
```

## Coverage Requirements

| Metric | Target |
|--------|--------|
| Line coverage | 85% |
| Branch coverage | 85% |
| Function coverage | 90% |
| Critical paths | 95% |

## Testing Patterns

### Service Testing
```typescript
describe('ServiceName', () => {
  let service: ServiceType;

  beforeEach(() => {
    service = new ServiceType(mockConfig);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  it('should initialize successfully', async () => {
    await service.initialize();
    expect(service.getHealthStatus().healthy).toBe(true);
  });
});
```

### Mock Strategies
- External APIs: Use Jest mocks
- File system: Use in-memory implementations
- Discord.js: Use partial mock objects

### Async Testing
- Use `await expect(...).resolves/rejects`
- Set appropriate timeouts
- Clean up async operations in `afterEach`

## Best Practices

1. **Isolation**: Each test runs independently
2. **No shared state**: Reset between tests
3. **Fast**: Keep unit tests <100ms
4. **Descriptive names**: Describe expected behavior
5. **AAA pattern**: Arrange, Act, Assert

## Key Test Areas

| Area | Focus |
|------|-------|
| GeminiService | API calls, error handling, rate limits |
| ContextManager | Memory limits, cleanup, compression |
| RateLimiter | Throughput, limits, reset behavior |
| CircuitBreaker | State transitions, recovery |
| Cache | Hit/miss, eviction, TTL |
