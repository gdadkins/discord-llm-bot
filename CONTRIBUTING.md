# Contributing to Discord LLM Bot

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/discord-llm-bot.git
   cd discord-llm-bot
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Add your development credentials to `.env`

3. Start in development mode:
   ```bash
   npm run dev
   ```

## Code Standards

### Quality Gates

All contributions must pass these checks:

```bash
npm run lint -- --fix  # Fix style issues
npm run build          # Verify TypeScript compiles
npm test               # Run test suite
```

### Code Style

- **TypeScript**: All code must be properly typed
- **ESLint**: Follow the project's ESLint configuration
- **Prettier**: Code is auto-formatted on commit
- **File Size**: Keep files under 500-700 lines; refactor if larger

### Commit Messages

Use clear, descriptive commit messages:

```
type: short description

Longer description if needed.
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat: add support for image attachments`
- `fix: resolve rate limiting edge case`
- `docs: update configuration reference`

## Pull Request Process

1. **Update documentation** if you change functionality
2. **Add tests** for new features
3. **Ensure all checks pass** (`npm run lint && npm run build && npm test`)
4. **Write a clear PR description** explaining:
   - What changes were made
   - Why they were made
   - How to test them

## Architecture Guidelines

### Service Layer

- Services extend `BaseService` for consistent lifecycle
- Use dependency injection for testability
- Implement graceful degradation for non-critical services

### Adding New Features

1. Check if it fits an existing service
2. If new service needed, follow the patterns in `src/services/`
3. Add appropriate tests in `tests/`
4. Update documentation in `docs/`

## Testing

### Running Tests

```bash
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:coverage      # With coverage report
```

### Writing Tests

- Place tests in `tests/` mirroring the `src/` structure
- Use descriptive test names
- Mock external dependencies (Discord API, Gemini API)

## Documentation

- Update relevant docs when changing functionality
- Keep documentation concise but precise
- Use code examples where helpful

## Getting Help

- Check existing issues before creating new ones
- Provide detailed reproduction steps for bugs
- Include relevant logs and error messages

## Code of Conduct

- Be respectful and constructive
- Focus on the code, not the person
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
