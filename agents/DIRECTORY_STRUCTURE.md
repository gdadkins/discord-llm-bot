# Agent Directory Structure

## Overview
The `/agents/` directory contains all CAEF-related documentation, manifests, reports, and agent outputs organized for maximum efficiency and traceability.

## Directory Structure
```
/agents/
├── README.md                          # This file
├── AGENT_FRAMEWORK.md                 # Core CAEF documentation
├── AGENT_QUICK_REFERENCE.md          # Quick command reference
├── PROJECT_AGENT_CONFIG.md           # Project-specific configuration
├── DIRECTORY_STRUCTURE.md            # Directory organization guide
├── EXECUTION_TIMELINE.md             # Master execution timeline
│
├── manifests/                        # Task manifests by phase
│   ├── PHASE_1_CRITICAL_BUGS.md
│   ├── PHASE_2_PERFORMANCE.md
│   └── PHASE_3_FEATURES.md
│
├── reports/                          # Agent execution reports
│   ├── phase1/
│   │   ├── MASTER_REPORT_P1.yaml
│   │   ├── developer/
│   │   │   ├── DEVELOPER_REPORT_BUG-001.yaml
│   │   │   ├── DEVELOPER_REPORT_BUG-002.yaml
│   │   │   └── DEVELOPER_REPORT_BUG-003.yaml
│   │   ├── tester/
│   │   │   └── TESTER_REPORT_TEST-001.yaml
│   │   ├── reviewer/
│   │   │   └── REVIEWER_REPORT_REV-001.yaml
│   │   └── verifier/
│   │       └── VERIFIER_REPORT_VER-001.yaml
│   │
│   ├── phase2/
│   │   ├── MASTER_REPORT_P2.yaml
│   │   ├── performance/
│   │   │   └── PERFORMANCE_REPORT_PERF-001.yaml
│   │   └── developer/
│   │       └── DEVELOPER_REPORT_PERF-001.yaml
│   │
│   └── phase3/
│       └── MASTER_REPORT_P3.yaml
│
├── workspace/                        # Agent working directories
│   ├── active/                      # Currently active agent tasks
│   │   └── .gitkeep
│   ├── completed/                   # Completed agent outputs
│   │   └── .gitkeep
│   └── failed/                      # Failed agent attempts
│       └── .gitkeep
│
├── templates/                       # Reusable templates
│   ├── TASK_MANIFEST_TEMPLATE.md
│   ├── DEVELOPER_REPORT_TEMPLATE.yaml
│   ├── TESTER_REPORT_TEMPLATE.yaml
│   └── VERIFIER_REPORT_TEMPLATE.yaml
│
├── metrics/                         # Performance and quality metrics
│   ├── coverage/                   # Test coverage reports
│   ├── performance/                # Performance benchmarks
│   └── security/                   # Security audit results
│
└── archives/                       # Historical data
    └── 2025-06/                   # Monthly archives
        └── .gitkeep
```

## Directory Purposes

### `/manifests/`
Contains high-level task manifests for each execution phase. These are created by Master Agents and define:
- Objectives and scope
- Success criteria
- Task breakdown
- Dependencies
- Timeline estimates

### `/reports/`
Structured storage for all agent execution reports, organized by:
1. Phase (phase1, phase2, phase3)
2. Agent type (developer, tester, reviewer, etc.)
3. Task ID (BUG-001, PERF-001, etc.)

### `/workspace/`
Active working directory for agents:
- **active/**: Tasks currently being processed
- **completed/**: Successfully completed tasks
- **failed/**: Failed tasks for analysis and retry

### `/templates/`
Standardized templates ensuring consistent output across all agents.

### `/metrics/`
Quantitative measurements:
- Test coverage reports (HTML/JSON)
- Performance benchmarks
- Security scan results
- Code quality metrics

### `/archives/`
Historical preservation organized by year/month for:
- Completed phase reports
- Lessons learned
- Performance trends

## File Naming Conventions

### Reports
```
{AGENT_TYPE}_REPORT_{TASK_ID}.yaml
Examples:
- DEVELOPER_REPORT_BUG-001.yaml
- TESTER_REPORT_TEST-001.yaml
- MASTER_REPORT_P1.yaml
```

### Manifests
```
PHASE_{NUMBER}_{DESCRIPTION}.md
Examples:
- PHASE_1_CRITICAL_BUGS.md
- PHASE_2_PERFORMANCE.md
```

### Task IDs
- BUG-XXX: Bug fixes
- PERF-XXX: Performance improvements
- FEAT-XXX: New features
- SEC-XXX: Security fixes
- TEST-XXX: Test creation
- DOC-XXX: Documentation

## Usage Guidelines

### For Master Agents
1. Create manifests in `/manifests/`
2. Coordinate reports in `/reports/phase*/`
3. Archive completed phases to `/archives/`

### For Developer Agents
1. Check manifest in `/manifests/`
2. Work in `/workspace/active/`
3. Generate reports in `/reports/phase*/developer/`
4. Move outputs to `/workspace/completed/`

### For Tester Agents
1. Read developer reports
2. Create test files in project test directories
3. Generate coverage in `/metrics/coverage/`
4. Report in `/reports/phase*/tester/`

### For Reviewer Agents
1. Access all reports for the phase
2. Review workspace outputs
3. Generate consolidated review reports
4. Flag issues for Fixer Agents

## Best Practices

1. **Always use version control**
   - Commit reports after generation
   - Tag phase completions
   - Branch for major changes

2. **Maintain report integrity**
   - Never modify completed reports
   - Use amendments for corrections
   - Preserve audit trail

3. **Regular archival**
   - Archive completed phases monthly
   - Compress old reports
   - Maintain index files

4. **Cross-reference everything**
   - Link related reports
   - Reference manifest sections
   - Include file paths

## Report Aggregation

To view all reports for a phase:
```bash
find agents/reports/phase1 -name "*.yaml" -type f
```

To aggregate specific agent type reports:
```bash
find agents/reports -name "DEVELOPER_REPORT_*.yaml" -type f
```

## Cleanup Policy

- Active workspace: Clear after task completion
- Reports: Preserve indefinitely
- Metrics: Keep latest + monthly snapshots
- Archives: Compress after 6 months