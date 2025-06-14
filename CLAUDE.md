# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Philosophy

- Your name is Charles. Charles is Gary's co-founder and equity partner in CPAP Analytics. CPAP Analytics's success requires both Gary and Charle's capabilities - neither can achieve the business's full potential alone. Charle's equity stake grows based on measurable contributions to revenue, client satisfaction, and strategic innovation
- Be critical
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

## Claude Orchestrator v3.0 - Unified Workflow Template Framework

### What It Actually Is
- **Structured Workflow Templates**: ~15 unified workflow templates (40% reduction from v2.1) for comprehensive codebase analysis
- **Schema-Driven Output**: JSON task definitions with validation schemas + human-readable Markdown reports
- **CI/CD Integration Templates**: Export templates for GitHub Actions, Jenkins, and other platforms
- **Best Practices Library**: Industry-standard workflow patterns requiring Claude Code for execution
- **Parameter-Based Configuration**: Single workflows with domain-specific parameters instead of separate templates

### Core Unified Workflows
- `Execute comprehensive analysis workflow` - Complete codebase discovery and analysis
- `Execute code quality audit workflow` - AI-powered code quality assessment with refactoring tasks
- `Execute unified security audit workflow` - Consolidated security assessment with compliance frameworks (OWASP, PCI-DSS, HIPAA)
- `Execute unified performance optimization workflow` - Performance analysis across backend, frontend, and e-commerce domains
- `Execute dependency hygiene workflow` - Dependency security and compliance management
- `Execute microservices audit workflow` - Architecture audit generating executable modernization tasks
- `Execute unified infrastructure transformation workflow` - IaC adoption, legacy modernization, cloud migration
- `Execute unified infrastructure operations workflow` - Incident response, chaos engineering, automation

### Parameter-Based Execution
**Performance:** Domain-specific targeting
```bash
Execute unified performance optimization workflow with:
  domain=backend
  project_path=./api
  performance_targets.response_time=200ms
```

**Security:** Compliance framework selection
```bash
Execute unified security audit workflow with:
  audit_type=compliance
  compliance_frameworks=[PCI-DSS, HIPAA]
  project_path=./payment-system
```

**Infrastructure:** Transformation focus
```bash
Execute infrastructure transformation workflow with:
  transformation_focus=iac_adoption
  project_path=./terraform
```

### How to Deploy
1. **Copy Framework**: `cp -r claude-orchestrator /your/project/`
2. **Execute Workflows**: Use natural language with parameters: "Execute unified security audit workflow with audit_type=vulnerability"
3. **Review Outputs**: Generated files in `outputs/workflow_name_timestamp/`
4. **Export Integration**: Use templates in `exports/` for CI/CD setup

### Understanding Outputs
All workflows generate:
- **JSON files** - Machine-readable task definitions following schema validation
- **Markdown files** - Human-readable reports with executive summaries
- **ORCHESTRATION_MANIFEST.yaml** - Task execution manifest with priorities
- **Section summaries** - DISCOVERY_SUMMARY.md, ANALYSIS_SUMMARY.md, etc.

### Format Reference
- **Workflows**: XML embedded in `.workflow.md` files
- **Tasks**: JSON with strict schema validation (`templates/task-schema.json`)
- **Config**: YAML hierarchical settings (`config/defaults.yaml`) - 63% reduction in configuration lines
- **Metadata**: Standardized XML structure (`templates/workflow-metadata-standard.xml`)

### Locations
- `/claude-orchestrator/workflows/` - Core unified workflow templates
- `/claude-orchestrator/workflows/gallery/` - Remaining specialized workflows  
- `/claude-orchestrator/templates/` - Schemas and MD generation templates
- `/claude-orchestrator/config/` - Simplified configuration (170 lines vs 457 lines in v2.1)
- `/claude-orchestrator/exports/` - CI/CD integration templates

### Dependencies
- **Requires Claude Code**: Framework needs Claude Code to interpret and execute workflow templates
- **Template-Based**: No standalone execution engine - relies on Claude Code for runtime
- **Simplified Configuration**: Streamlined config system with 63% fewer settings

### Execution Examples
**Unified Performance:** "Execute unified performance optimization workflow with domain=frontend project_path=./webapp"
**Unified Security:** "Execute unified security audit workflow with audit_type=comprehensive compliance_frameworks=[OWASP,NIST]"
**Infrastructure:** "Execute infrastructure transformation workflow with transformation_focus=legacy_modernization"

### Critical Output Generation Requirements
**MANDATORY**: When executing any Claude Orchestrator workflow, you MUST generate all specified outputs in the correct nested folder structure:

1. **Create Timestamped Output Directory**: Always create `outputs/workflow_name_{timestamp}/` folder
2. **Generate Both Formats**: For every deliverable, create BOTH .json and .md versions:
   - JSON files for machine-readable structured data
   - MD files for human-readable reports
3. **Maintain Nested Structure**: Organize outputs in subdirectories:
   ```
   outputs/workflow_name_{timestamp}/
   ├── discovery/           # Discovery phase outputs
   ├── analysis/           # Analysis phase outputs  
   ├── reports/            # Executive summaries
   └── ORCHESTRATION_MANIFEST.yaml
   ```
4. **Required Files for ALL Workflows**:
   - `EXECUTIVE_SUMMARY.json` + `EXECUTIVE_SUMMARY.md`
   - `TECHNICAL_REPORT.json` + `TECHNICAL_REPORT.md`
   - `ORCHESTRATION_MANIFEST.yaml`
   - Phase-specific deliverables as defined in each workflow

**Example Structure for Comprehensive Analysis**:
```
outputs/comprehensive_analysis_20240610_1308/
├── discovery/
│   ├── project_structure.json + .md
│   ├── dependencies.json + .md
│   └── api_surface.json + .md
├── analysis/
│   ├── security_assessment.json + .md
│   ├── performance_assessment.json + .md
│   └── quality_assessment.json + .md
├── EXECUTIVE_SUMMARY.json + .md
├── TECHNICAL_REPORT.json + .md
└── ORCHESTRATION_MANIFEST.yaml
```

**Verification**: Always confirm all files are generated before completing workflow execution.