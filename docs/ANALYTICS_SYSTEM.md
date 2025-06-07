# Analytics and Reporting System

## Overview

The Discord LLM Bot includes a comprehensive analytics and reporting system designed with privacy-first principles and full GDPR compliance. The system tracks usage patterns, performance metrics, and error trends to help improve the bot while respecting user privacy.

## Key Features

### 🔒 Privacy-First Design
- **Zero Message Content Storage**: Only metadata is stored, never actual message content
- **Anonymized User IDs**: All user identifiers are hashed using SHA-256 with salt
- **User-Controlled Data Retention**: Users can set their own data retention period (7-365 days)
- **Opt-Out Mechanism**: Users can completely opt out of data collection
- **Data Export/Deletion**: Full GDPR compliance with user data export and deletion

### 📊 Analytics Capabilities
- **Command Usage Statistics**: Track frequency, success rates, response times
- **User Engagement Metrics**: Session tracking, interaction depth, activity patterns
- **Error Pattern Analysis**: Categorized error tracking for system improvement
- **Performance Monitoring**: Response times, resource usage, trend analysis
- **Automated Reporting**: Daily, weekly, and monthly reports with insights

### 🛡️ Data Protection
- **SQLite Database**: Local storage with WAL mode for performance
- **Time-Series Data**: Efficient storage and querying of historical data
- **Automatic Cleanup**: Respects retention policies and removes old data
- **Cross-Server Analysis**: Optional, admin-controlled feature

## Configuration

### Environment Variables

Add these variables to your `.env` file to configure the analytics system:

```env
# Analytics System
ANALYTICS_ENABLED=true
ANALYTICS_RETENTION_DAYS=90
ANALYTICS_AGGREGATION_INTERVAL=60
ANALYTICS_PRIVACY_MODE=balanced
ANALYTICS_REPORTING_ENABLED=true
ANALYTICS_REPORT_SCHEDULE=weekly
ANALYTICS_ALLOW_CROSS_SERVER=false

# Security
ANALYTICS_SALT=your-unique-salt-string-here
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `ANALYTICS_ENABLED` | `false` | Enable/disable the entire analytics system |
| `ANALYTICS_RETENTION_DAYS` | `90` | Default data retention period in days |
| `ANALYTICS_AGGREGATION_INTERVAL` | `60` | Minutes between data aggregation runs |
| `ANALYTICS_PRIVACY_MODE` | `balanced` | Privacy level: `strict`, `balanced`, or `full` |
| `ANALYTICS_REPORTING_ENABLED` | `false` | Enable automated report generation |
| `ANALYTICS_REPORT_SCHEDULE` | `weekly` | Report frequency: `daily`, `weekly`, `monthly` |
| `ANALYTICS_ALLOW_CROSS_SERVER` | `false` | Allow analytics across multiple servers |
| `ANALYTICS_SALT` | Auto-generated | Salt for hashing user identifiers |

### Privacy Modes

- **Strict**: Minimal data collection, immediate deletion, no cross-server analysis
- **Balanced**: Standard data collection with user controls (recommended)
- **Full**: Extended data collection for detailed insights (admin-controlled)

## Commands

### Analytics Commands (Admin Only)

#### `/analytics stats [timeframe]`
View current analytics statistics for the specified timeframe.
- **Parameters**: `timeframe` (optional) - `24h`, `7d`, or `30d`
- **Permissions**: Administrator or Manage Server

#### `/analytics commands [period]`
View detailed command usage analytics.
- **Parameters**: `period` (optional) - `daily`, `weekly`, or `monthly`
- **Shows**: Command popularity, success rates, usage trends

#### `/analytics errors [category]`
View error pattern analysis.
- **Parameters**: `category` (optional) - `all`, `api`, `network`, `validation`, `system`
- **Shows**: Error types, frequencies, trends

#### `/analytics performance`
View performance trends and metrics.
- **Shows**: Response times, resource usage, performance trends

#### `/analytics system`
View analytics system information and configuration.
- **Shows**: Database statistics, privacy settings, system health

### Reporting Commands (Admin Only)

#### `/reports generate <period>`
Generate an analytics report for the specified period.
- **Parameters**: `period` (required) - `daily`, `weekly`, or `monthly`
- **Output**: Comprehensive report with insights and recommendations

#### `/reports schedule <enabled> [frequency]`
Configure automated report generation.
- **Parameters**: 
  - `enabled` (required) - `true` or `false`
  - `frequency` (optional) - `daily`, `weekly`, or `monthly`

### Privacy Commands (All Users)

#### `/privacy status`
View your current privacy settings and data collection status.

#### `/privacy optout <confirm>`
Opt out of analytics data collection.
- **Parameters**: `confirm` (required) - `true` to confirm
- **Effect**: Stops all data collection and deletes existing data

#### `/privacy optin`
Opt back into analytics data collection.

#### `/privacy export`
Export all your stored analytics data.
- **Output**: JSON format with all your anonymized data

#### `/privacy delete <confirm>`
Delete all your stored analytics data.
- **Parameters**: `confirm` (required) - `true` to confirm
- **Effect**: Permanently deletes all your data and opts you out

#### `/privacy retention <days>`
Set your personal data retention period.
- **Parameters**: `days` (required) - Number of days (7-365)
- **Effect**: Data older than this period will be automatically deleted

## Database Schema

The analytics system uses SQLite with the following tables:

### Command Usage
```sql
CREATE TABLE command_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  command_name TEXT NOT NULL,
  user_hash TEXT NOT NULL,      -- Anonymized user ID
  server_hash TEXT NOT NULL,    -- Anonymized server ID
  success INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_type TEXT,
  error_category TEXT
);
```

### User Engagement
```sql
CREATE TABLE user_engagement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  user_hash TEXT NOT NULL,
  server_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,     -- 'command', 'mention', 'reaction'
  session_id TEXT NOT NULL,
  interaction_depth INTEGER NOT NULL
);
```

### Error Events
```sql
CREATE TABLE error_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  error_type TEXT NOT NULL,
  error_category TEXT NOT NULL,
  command_context TEXT,
  user_hash TEXT,
  server_hash TEXT,
  error_hash TEXT NOT NULL,     -- Anonymized error fingerprint
  count INTEGER NOT NULL DEFAULT 1
);
```

### Performance Events
```sql
CREATE TABLE performance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  metric TEXT NOT NULL,         -- 'response_time', 'memory_usage', etc.
  value REAL NOT NULL,
  context TEXT
);
```

### Daily Aggregates
```sql
CREATE TABLE daily_aggregates (
  date TEXT PRIMARY KEY,
  total_commands INTEGER NOT NULL,
  unique_users INTEGER NOT NULL,
  success_rate REAL NOT NULL,
  avg_response_time REAL NOT NULL,
  top_commands TEXT NOT NULL,   -- JSON array
  error_count INTEGER NOT NULL,
  engagement_score REAL NOT NULL
);
```

### User Privacy
```sql
CREATE TABLE user_privacy (
  user_hash TEXT PRIMARY KEY,
  opted_out INTEGER NOT NULL DEFAULT 0,
  data_retention_days INTEGER NOT NULL DEFAULT 90,
  allow_insights INTEGER NOT NULL DEFAULT 1,
  last_updated INTEGER NOT NULL
);
```

## Data Flow

### Collection
1. **Command Execution**: Tracks all slash command usage
2. **User Interactions**: Monitors @mentions and reactions
3. **Error Events**: Captures and categorizes errors
4. **Performance Metrics**: Records response times and resource usage

### Processing
1. **Real-time Tracking**: Immediate data storage with anonymization
2. **Session Management**: Groups user interactions into sessions
3. **Hourly Aggregation**: Processes raw data into summary statistics
4. **Daily Cleanup**: Removes old data based on retention policies

### Reporting
1. **On-Demand Reports**: Generated via `/reports generate` command
2. **Scheduled Reports**: Automatic generation based on configuration
3. **Real-time Analytics**: Live statistics via `/analytics` commands
4. **Trend Analysis**: Historical comparison and pattern detection

## Privacy Protection Measures

### Data Anonymization
- **User IDs**: Hashed with SHA-256 and unique salt
- **Server IDs**: Hashed separately for server-specific analysis
- **Error Messages**: Only error types stored, not sensitive details
- **No Content**: Message content is never stored or logged

### User Controls
- **Opt-Out**: Complete removal from data collection
- **Retention Control**: User-defined data retention periods
- **Data Export**: Full data export in machine-readable format
- **Data Deletion**: Complete data removal on request

### Compliance Features
- **GDPR Article 17**: Right to erasure (deletion)
- **GDPR Article 20**: Right to data portability (export)
- **GDPR Article 7**: Right to withdraw consent (opt-out)
- **GDPR Article 13**: Transparent information about data processing

## Security Considerations

### Data Protection
- **Local Storage**: SQLite database stored locally, not in cloud
- **Encryption at Rest**: Database file encryption (if configured)
- **Access Controls**: Admin-only access to detailed analytics
- **Network Security**: No external data transmission

### Operational Security
- **Backup Strategy**: Regular database backups with encryption
- **Log Management**: Separate analytics logs from application logs
- **Monitoring**: System health monitoring and alerting
- **Incident Response**: Data breach notification procedures

## Monitoring and Maintenance

### Health Monitoring
The analytics system includes built-in health monitoring:
- Database connection status
- Query performance metrics
- Data retention compliance
- Privacy setting auditing

### Performance Optimization
- **Database Indexing**: Optimized indexes for fast queries
- **WAL Mode**: Write-Ahead Logging for better performance
- **Periodic Cleanup**: Automated old data removal
- **Query Optimization**: Efficient aggregation queries

### Troubleshooting

#### Common Issues

1. **Database Lock Errors**
   - Check for long-running queries
   - Verify WAL mode is enabled
   - Monitor concurrent access patterns

2. **Performance Degradation**
   - Review data retention settings
   - Check database size and indexes
   - Monitor aggregation performance

3. **Privacy Compliance**
   - Audit opted-out users
   - Verify data deletion processes
   - Check retention policy enforcement

#### Diagnostic Commands

```bash
# Check database integrity
sqlite3 ./data/analytics.db "PRAGMA integrity_check;"

# View database size
sqlite3 ./data/analytics.db ".dbinfo"

# Check table statistics
sqlite3 ./data/analytics.db "SELECT name, sql FROM sqlite_master WHERE type='table';"
```

## Integration Examples

### Custom Analytics
The system can be extended with custom analytics:

```typescript
// Track custom events
await analyticsManager.trackPerformance('custom_metric', value, context);

// Track custom errors
await analyticsManager.trackError('custom_error', message, context);
```

### Webhook Integration
Configure webhooks for automated reporting:

```typescript
// Example webhook for daily reports
const report = await analyticsManager.generateReport('daily');
await sendWebhook(process.env.ANALYTICS_WEBHOOK_URL, report);
```

## Best Practices

### Data Collection
- Only collect data necessary for improvement
- Implement data minimization principles
- Regular privacy impact assessments
- Clear user communication about data use

### System Administration
- Regular database maintenance and optimization
- Monitor system resource usage
- Implement proper backup and recovery procedures
- Keep the analytics system updated

### User Communication
- Transparent privacy policy
- Clear opt-out instructions
- Regular privacy setting reminders
- Data breach notification procedures

## Future Enhancements

### Planned Features
- **Advanced Analytics**: Machine learning insights
- **Custom Dashboards**: Web-based analytics interface
- **Real-time Alerts**: Automated issue detection
- **Integration APIs**: External system integration

### Privacy Enhancements
- **Differential Privacy**: Mathematical privacy guarantees
- **Zero-Knowledge Analytics**: Analysis without raw data access
- **Homomorphic Encryption**: Computation on encrypted data
- **Federated Learning**: Distributed analytics without data sharing

## Support and Documentation

For additional support or questions about the analytics system:
- Review the troubleshooting section above
- Check the bot's health monitoring output
- Consult the privacy documentation
- Contact system administrators for advanced configuration

The analytics system is designed to provide valuable insights while maintaining the highest standards of user privacy and data protection.