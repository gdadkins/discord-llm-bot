# Analytics

Usage analytics and reporting for the Discord LLM Bot.

## Features

- **Privacy-first**: No message content stored, anonymized IDs
- **GDPR compliant**: Data export, deletion, opt-out
- **Usage tracking**: Commands, response times, errors
- **Automated reports**: Daily/weekly/monthly insights

## Configuration

```env
ANALYTICS_ENABLED=true
ANALYTICS_RETENTION_DAYS=90
ANALYTICS_PRIVACY_MODE=balanced  # strict/balanced/full
ANALYTICS_REPORTING_ENABLED=true
ANALYTICS_REPORT_SCHEDULE=weekly
```

| Variable | Default | Description |
|----------|---------|-------------|
| `ANALYTICS_ENABLED` | `false` | Enable analytics |
| `ANALYTICS_RETENTION_DAYS` | `90` | Data retention period |
| `ANALYTICS_PRIVACY_MODE` | `balanced` | Privacy level |
| `ANALYTICS_ALLOW_CROSS_SERVER` | `false` | Cross-server analysis |

## Commands (Admin Only)

| Command | Description |
|---------|-------------|
| `/analytics stats [24h/7d/30d]` | Usage statistics |
| `/analytics commands` | Command usage |
| `/analytics errors` | Error analysis |
| `/analytics performance` | Performance metrics |
| `/reports generate <period>` | Generate report |

## User Privacy Commands

| Command | Description |
|---------|-------------|
| `/privacy view` | View your data |
| `/privacy export` | Export your data |
| `/privacy delete` | Delete your data |
| `/privacy optout` | Opt out of tracking |

## Privacy Modes

| Mode | Description |
|------|-------------|
| `strict` | Minimal collection, immediate deletion |
| `balanced` | Standard collection with user controls |
| `full` | Extended collection (admin-controlled) |

## Data Storage

- **Location**: `./data/analytics.db` (SQLite)
- **Retention**: Configurable (7-365 days)
- **Cleanup**: Automatic based on retention policy
