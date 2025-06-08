# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Structure

### Core Documentation
- **CLAUDE.md** - Core development principles and workflows (this file)
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Complete system architecture and components
- **[docs/SERVICE_ARCHITECTURE.md](docs/SERVICE_ARCHITECTURE.md)** - Service development guidelines and patterns

### Development Guides
- **[docs/DEVELOPMENT_WORKFLOWS.md](docs/DEVELOPMENT_WORKFLOWS.md)** - Code quality standards and implementation checklists
- **[docs/QUALITY_GATES.md](docs/QUALITY_GATES.md)** - Automated quality gates and CI/CD processes
- **[docs/CONTINUOUS_IMPROVEMENT.md](docs/CONTINUOUS_IMPROVEMENT.md)** - Process improvement and evolution patterns
- **[agents/COORDINATION_PROTOCOLS.md](agents/COORDINATION_PROTOCOLS.md)** - Multi-agent deployment and coordination

### Feature Documentation
- **[docs/MEMORY_MANAGEMENT.md](docs/MEMORY_MANAGEMENT.md)** - Context storage, retention policies, and monitoring
- **[docs/ENHANCED_CONTEXT_IMPLEMENTATION.md](docs/ENHANCED_CONTEXT_IMPLEMENTATION.md)** - Enhanced context features guide
- **[src/config/contextConfig.ts](src/config/contextConfig.ts)** - Runtime configuration for memory and context

### Troubleshooting & Operations
- **[TROUBLESHOOTING_LOG.md](TROUBLESHOOTING_LOG.md)** - Session-by-session troubleshooting history
- **[docs/TROUBLESHOOTING_PROTOCOLS.md](docs/TROUBLESHOOTING_PROTOCOLS.md)** - Diagnostic procedures and recovery
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues and solutions

### Reference
- **[docs/API_REFERENCE.md](docs/API_REFERENCE.md)** - Service APIs and interfaces
- **[docs/STRUCTURED_OUTPUT_EXAMPLES.md](docs/STRUCTURED_OUTPUT_EXAMPLES.md)** - JSON response format examples

## Core Philosophy

- Always follow SLDC principles for all code/programming
- Security basics always included
- Code base must stay well organized. Any code file should not exceed 500-700 lines total before refactoring prioritzing on predictable patterns that minimizes lines of code and implements proper modularity.
- Code files must include headers in a format that works best for claude code to navigate. 
- Always read and understand the codebase before implementing a new feature or bugfix
- Always adhere to efficient best practices structured, modular based component/module/code architecture and CSS for components/module/code for easier troubleshooting/implementations/updates. CSS files need to stay concise in nature even on a per individual basis.
- Never add the following to git updates or related: 🤖 Generated with [Claude Code](https://claude.ai/code) Co-Authored-By: Claude <noreply@anthropic.com>"
- Never use emojis in any code as it will cause unicode errors/problems. If you come across any emoji in existing codebase outside of .md files, remove it.
- If you create any temporary new files, scripts, or helper files for iteration, clean up these files by removing them at the end of the task unless specifically by an agent or sub-agent. Any agent* created files can be placed in /agents/ folder in an organized manner.
- When removing any code, make sure to verify if any methods/etc related to it can also be safely removed. The less tech debt, the better health our codebase will be.
- Documentation must adhere to the requirement "concise but precise"

## Code Refactoring Guidelines

When refactoring code, follow these principles:

- **SOLID principles**: Apply Single Responsibility Principle by breaking down large methods (>50 lines) into smaller, focused functions
- **DRY methodology**: Eliminate code duplication by creating shared utility functions
- **Extract constants**: Move magic numbers and configuration data to named constants
- **Separation of concerns**: Separate data processing from presentation logic
- **Static analysis**: Fix unused variables, type issues, and other warnings
- **Testing**: Verify functionality through comprehensive testing after each change

Goal: Improve maintainability, readability, and testability while preserving existing behavior.

For detailed development workflows and quality standards, see **[docs/DEVELOPMENT_WORKFLOWS.md](docs/DEVELOPMENT_WORKFLOWS.md)**.

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

For detailed troubleshooting procedures, see **[docs/TROUBLESHOOTING_PROTOCOLS.md](docs/TROUBLESHOOTING_PROTOCOLS.md)**.

## Enterprise Feature Development Workflow (Phase 3 Proven)

### Phase-Based Development Strategy
1. **Foundation Phase**: Core services and monitoring infrastructure (1-2 agents)
2. **Feature Phase**: Independent implementations with parallel deployment (4-6 agents)
3. **Integration Phase**: Service coordination and comprehensive testing (3 agents)
4. **Validation Phase**: Architecture review, documentation, and production certification (3 agents)

### Success Criteria per Phase
- **Foundation**: Health monitoring operational, core patterns established, zero regressions
- **Feature**: All requirements implemented with quantified performance targets met
- **Integration**: Comprehensive test coverage (85%+), documentation complete
- **Validation**: Production-ready certification with 90%+ architecture quality score

For detailed service architecture guidelines and development patterns, see **[docs/SERVICE_ARCHITECTURE.md](docs/SERVICE_ARCHITECTURE.md)**.

## Quality Gates

For detailed quality gate procedures and automation, see [docs/QUALITY_GATES.md](docs/QUALITY_GATES.md).

### Essential Quality Gates
```bash
npm run lint -- --fix  # Auto-fix style violations
npm run build          # Verify TypeScript compilation
npm test               # Run automated test suite
```

## Architecture

For complete architecture documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Agent Coordination

For complete agent coordination protocols, see [agents/COORDINATION_PROTOCOLS.md](agents/COORDINATION_PROTOCOLS.md).

### Quick Reference
- Use TodoWrite to plan multi-agent deployments
- Assign non-overlapping file/line scopes per agent
- Mark todos as `in_progress` → `completed` immediately
- Include file:line references in all communications
- Maximum 10 parallel agents for complex features

## Continuous Improvement

For detailed improvement processes, see [docs/CONTINUOUS_IMPROVEMENT.md](docs/CONTINUOUS_IMPROVEMENT.md).

### Quick Reference
- Measure performance with confidence intervals
- Document agent effectiveness patterns
- Track architecture quality trends

## Critical System Stability Guidelines

**For comprehensive service architecture guidelines, see [docs/SERVICE_ARCHITECTURE.md](docs/SERVICE_ARCHITECTURE.md)**
**For detailed troubleshooting procedures, see [docs/TROUBLESHOOTING_PROTOCOLS.md](docs/TROUBLESHOOTING_PROTOCOLS.md)**

### Quick Reference - System Stability
- **Never add multiple complex services simultaneously** - Use incremental approach
- **Always test services in isolation** before integration
- **Implement initialization timeouts** (30s max) with graceful degradation
- **Maintain TROUBLESHOOTING_LOG.md** for session-by-session tracking
- **Keep core services minimal** - GeminiService + Discord client must always work

 ### Claude Orchestrator v2.0
 This project includes the Claude Orchestrator for automated workflows.

## Core Workflows
- `Execute comprehensive analysis workflow` - Complete codebase discovery and analysis
- `Execute code quality audit workflow` - AI-powered code quality assessment with refactoring tasks
- `Execute security audit workflow` - Security assessment with OWASP compliance and remediation
- `Execute performance profiling workflow` - Performance bottleneck analysis with optimization
- `Execute dependency hygiene workflow` - Dependency security and compliance management
- `Execute cicd pipeline workflow` - CI/CD pipeline optimization with automation
- `Execute microservices audit workflow` - architecture audit generating executable modernization tasks

## Gallery Workflows (Domain-Organized)
**Backend:**
- `Execute database performance audit workflow` - Database optimization with query and schema analysis
- `Execute api lifecycle management workflow` - Complete API lifecycle automation

**Frontend:**
- `Execute frontend performance optimization workflow` - Core Web Vitals and bundle optimization
- `Execute accessibility compliance workflow` - WCAG 2.1/3.0 compliance
- `Execute internationalization workflow` - Multi-language support

**Infrastructure:**
- `Execute legacy modernization workflow` - Legacy system transformation planning
- `Execute infrastructure as code workflow` - Terraform/CloudFormation security
- `Execute incident response automation workflow` - Automated runbook generation

**Data & Analytics:**
- `Execute mlops readiness workflow` - ML operational maturity assessment
- `Execute data pipeline audit workflow` - ETL/ELT optimization

**Educational:**
- `Execute test driven development workflow` - TDD automation with test generation

## Advanced Enterprise Features

### Understanding Outputs
All workflows generate:
- **JSON files** - Machine-readable task definitions following schema
- **Markdown files** - Human-readable reports with visualizations
- **ORCHESTRATION_MANIFEST.yaml** - Task execution manifest
- **Section summaries** - DISCOVERY_SUMMARY.md, ANALYSIS_SUMMARY.md, etc.

### Format Reference
- **Workflows**: XML embedded in .workflow.md files
- **Tasks**: JSON with strict schema validation (templates/task-schema.json)
- **Config**: YAML for settings (config/defaults.yaml)
- **Metadata**: Standardized XML structure (templates/workflow-metadata-standard.xml)

Locations: 
- `/claude-orchestrator/workflows/` - Core workflows
- `/claude-orchestrator/workflows/gallery/` - Domain-specialized workflows
- `/claude-orchestrator/core/` - Advanced framework components and systems
- `/claude-orchestrator/docs/` - Comprehensive documentation and user guides
- `/claude-orchestrator/templates/` - Workflow template library

## Workflow Execution Examples

**Core Workflows:**
"Execute comprehensive analysis workflow"
"Execute code quality audit workflow with complexity_threshold=8"
"Execute security audit workflow on src/api/"
"Execute performance profiling workflow with focus_area=database"

**Gallery Workflows:**
"Execute database performance audit workflow with database_type=postgresql"
"Execute frontend performance optimization workflow with framework=react"
"Execute legacy modernization workflow with modernization_approach=strangler_fig"
"Execute accessibility compliance workflow targeting WCAG 2.1 AA"

## Project-Specific Workflows

Custom workflows for this project:
- `Execute api-validation workflow` - Validates all API endpoints
- `Execute database-migration workflow` - Safe schema updates