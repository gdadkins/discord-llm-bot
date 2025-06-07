# Administrative Guide

## Overview

This comprehensive administrative guide covers all aspects of managing, monitoring, and maintaining the Discord LLM Bot. It includes setup procedures, operational workflows, troubleshooting guides, security considerations, and maintenance schedules for optimal bot performance.

## Quick Start for Administrators

### Initial Setup Checklist

1. **Environment Configuration**
   ```bash
   # Copy and configure environment file
   cp .env.example .env
   # Edit with your specific configuration
   ```

2. **Directory Structure Setup**
   ```bash
   # Create required directories
   mkdir -p data logs benchmark-reports
   chmod 755 data logs benchmark-reports
   ```

3. **First Run**
   ```bash
   # Install dependencies and build
   npm install
   npm run build
   
   # Start in development mode for testing
   npm run dev
   ```

4. **Verify System Health**
   ```
   /status full          # Check all system components
   /health detailed      # Verify health monitoring
   /config validate      # Validate configuration
   ```

## Administrative Commands

### System Management

#### `/admin` - Core Administration
Central command for all administrative functions.

##### `/admin status [detailed]`
Comprehensive system status overview:
- **Basic**: Core system health and resource usage
- **Detailed**: Full diagnostic information including internal metrics

##### `/admin restart [service]`
Restart system components:
```
/admin restart all      # Full system restart
/admin restart gemini   # Restart Gemini service only
/admin restart discord  # Restart Discord connection
/admin restart analytics # Restart analytics system
```

##### `/admin maintenance <mode>`
Control maintenance mode:
```
/admin maintenance on "Performing system updates"    # Enable maintenance
/admin maintenance off                               # Disable maintenance
/admin maintenance status                           # Check maintenance status
```

#### `/config` - Configuration Management
Comprehensive configuration control (see [Configuration Management Guide](CONFIGURATION_MANAGEMENT.md)):

```
/config view [section]          # View configuration
/config reload [reason]         # Reload from file
/config validate [service]      # Validate configuration
/config rollback <version>      # Rollback to previous version
/config export [format]         # Export configuration
/config audit [limit]           # View change history
```

#### `/health` - Health Monitoring
Advanced health monitoring and diagnostics (see [Health Monitoring Guide](HEALTH_MONITORING.md)):

```
/health overview               # System health summary
/health metrics [timeframe]    # Detailed metrics
/health alerts                 # Current alerts and warnings
/health history [period]       # Historical health data
```

### User Management

#### `/users` - User Administration

##### `/users list [active] [limit]`
List bot users with activity information:
- **active**: Show only recently active users
- **limit**: Maximum number of users to display (1-100)

##### `/users info <user>`
Detailed user information:
- Conversation history statistics
- Preference settings
- Command usage patterns
- Last activity and engagement metrics

##### `/users preferences <user> [action]`
Manage user preferences:
```
/users preferences @user view          # View user's preferences
/users preferences @user reset         # Reset to defaults
/users preferences @user export        # Export preferences
```

##### `/users context <user> [action]`
Manage user context data:
```
/users context @user view             # View context size and content
/users context @user clear            # Clear user's context
/users context @user export           # Export context data
```

##### `/users ban <user> [reason]`
Temporarily restrict user access:
```
/users ban @user "Spam behavior"      # Ban user with reason
/users unban @user                    # Remove ban
/users banned                         # List banned users
```

### Server Management

#### `/server` - Server Administration

##### `/server info`
Comprehensive server information:
- Bot permissions and roles
- Channel access status
- Feature availability
- Integration status

##### `/server features [action]`
Manage server-specific features:
```
/server features list                 # List available features
/server features enable <feature>     # Enable specific feature
/server features disable <feature>    # Disable specific feature
/server features reset                # Reset to default features
```

##### `/server context [action]`
Server context management:
```
/server context stats                 # Context usage statistics
/server context clear [confirm]       # Clear all server context
/server context export               # Export server context
/server context optimize             # Force context optimization
```

##### `/server analytics [period]`
Server-specific analytics:
```
/server analytics daily              # Daily usage statistics
/server analytics weekly             # Weekly trends
/server analytics monthly            # Monthly overview
/server analytics export [period]    # Export analytics data
```

### Data Management

#### `/data` - Data Administration

##### `/data backup [type]`
Create system backups:
```
/data backup full                    # Complete system backup
/data backup config                  # Configuration only
/data backup context                 # Context data only
/data backup analytics               # Analytics data only
```

##### `/data restore <backup_id>`
Restore from backup:
```
/data restore backup-2024-01-15     # Restore specific backup
/data restore latest                # Restore latest backup
```

##### `/data cleanup [type]`
Clean up system data:
```
/data cleanup old                   # Remove old data based on retention
/data cleanup temp                  # Remove temporary files
/data cleanup logs                  # Archive old log files
/data cleanup all                   # Comprehensive cleanup
```

##### `/data export <type> [format]`
Export system data:
```
/data export analytics json         # Export analytics as JSON
/data export config yaml            # Export configuration as YAML
/data export context csv            # Export context data as CSV
/data export logs text              # Export log files
```

### Performance Management

#### `/performance` - Performance Administration

##### `/performance monitor [duration]`
Real-time performance monitoring:
```
/performance monitor 5m             # Monitor for 5 minutes
/performance monitor 1h             # Monitor for 1 hour
/performance monitor continuous     # Continuous monitoring
```

##### `/performance optimize [target]`
System optimization:
```
/performance optimize memory        # Memory optimization
/performance optimize cache         # Cache optimization
/performance optimize context       # Context optimization
/performance optimize all           # Comprehensive optimization
```

##### `/performance benchmark [type]`
Performance benchmarking:
```
/performance benchmark quick        # Quick benchmark test
/performance benchmark full         # Comprehensive benchmark
/performance benchmark compare      # Compare with baseline
```

##### `/performance alerts [action]`
Performance alert management:
```
/performance alerts status          # Current alert status
/performance alerts configure       # Configure alert thresholds
/performance alerts history         # Alert history
/performance alerts test            # Test alert system
```

## Security Administration

### Access Control

#### Permission Levels
The bot implements a hierarchical permission system:

1. **System Administrator**: Full access to all commands and data
2. **Server Administrator**: Server-specific administration rights
3. **Moderator**: Limited administrative functions
4. **User**: Standard user commands only

#### Role Configuration
```env
# Admin role configuration
ADMIN_ROLE_ID=your-admin-role-id
MODERATOR_ROLE_ID=your-moderator-role-id
ADMIN_USER_IDS=user1,user2,user3

# Permission inheritance
ADMIN_INHERIT_PERMISSIONS=true
MODERATOR_CAN_VIEW_ANALYTICS=true
MODERATOR_CAN_MANAGE_USERS=false
```

### Security Monitoring

#### `/security` - Security Administration

##### `/security status`
Security system overview:
- Access control status
- Failed authentication attempts
- Suspicious activity detection
- Security alert summary

##### `/security audit [period]`
Security audit log:
```
/security audit 24h                 # Last 24 hours
/security audit weekly              # Weekly audit
/security audit user @user          # User-specific audit
```

##### `/security permissions <user>`
User permission analysis:
- Current permission level
- Command access rights
- Recent permission changes
- Security recommendations

### Data Protection

#### Privacy Controls
```
/privacy server settings            # Server privacy configuration
/privacy user @user settings        # User privacy settings
/privacy compliance check           # GDPR compliance status
/privacy data audit                 # Data usage audit
```

#### Encryption Management
```env
# Data encryption settings
DATA_ENCRYPTION_ENABLED=true
ENCRYPTION_KEY_ROTATION_DAYS=90
BACKUP_ENCRYPTION_ENABLED=true
```

## Monitoring and Alerting

### Health Monitoring Setup

#### Alert Configuration
```env
# Health monitoring alerts
HEALTH_ALERTS_ENABLED=true
HEALTH_ALERT_CHANNEL_ID=your-channel-id
HEALTH_ALERT_WEBHOOK_URL=your-webhook-url

# Alert thresholds
HEALTH_MEMORY_THRESHOLD=512          # MB
HEALTH_ERROR_RATE_THRESHOLD=5        # Percentage
HEALTH_RESPONSE_TIME_THRESHOLD=5000  # Milliseconds
HEALTH_DISK_SPACE_THRESHOLD=85       # Percentage
```

#### Notification Channels
Configure multiple notification channels for different alert types:
- **Critical Alerts**: Immediate notification via webhook and Discord
- **Warning Alerts**: Discord channel notifications
- **Info Alerts**: Log file entries only

### Performance Monitoring

#### Metrics Collection
The system automatically collects:
- **Response Times**: P50, P95, P99 percentiles
- **Memory Usage**: Heap, RSS, external memory
- **API Health**: Gemini and Discord API status
- **Cache Performance**: Hit rates and memory usage
- **Context Metrics**: Memory optimization statistics

#### Dashboard Access
```
/dashboard performance              # Performance metrics dashboard
/dashboard health                   # Health monitoring dashboard
/dashboard analytics                # Analytics dashboard
/dashboard security                 # Security monitoring dashboard
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Daily Tasks (Automated)
- Health metrics collection and analysis
- Log rotation and archival
- Cache optimization and cleanup
- Context memory optimization
- Security audit log review

#### Weekly Tasks
1. **System Health Review**
   ```bash
   /health history 7d               # Review weekly health trends
   /performance benchmark quick     # Performance validation
   /security audit weekly           # Security review
   ```

2. **Data Maintenance**
   ```bash
   /data cleanup old               # Clean up old data
   /data backup full               # Create weekly backup
   /analytics generate weekly      # Generate weekly report
   ```

3. **Configuration Review**
   ```bash
   /config audit 50                # Review configuration changes
   /config validate all            # Validate current configuration
   ```

#### Monthly Tasks
1. **Comprehensive System Review**
   - Performance trend analysis
   - Capacity planning assessment
   - Security audit and updates
   - Feature usage analysis

2. **Data Archival**
   ```bash
   /data export analytics json     # Archive analytics data
   /data export logs text          # Archive log files
   /data cleanup all               # Comprehensive cleanup
   ```

3. **System Optimization**
   ```bash
   /performance optimize all       # Full system optimization
   /performance benchmark full     # Comprehensive benchmark
   ```

### Backup and Recovery

#### Backup Strategy
```bash
# Automated backup configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"         # Daily at 2 AM
BACKUP_RETENTION_DAYS=30
BACKUP_COMPRESSION_ENABLED=true
BACKUP_ENCRYPTION_ENABLED=true
```

#### Recovery Procedures
1. **Configuration Recovery**
   ```bash
   /config rollback <version>      # Rollback configuration
   /config validate all            # Validate after rollback
   ```

2. **Data Recovery**
   ```bash
   /data restore <backup_id>       # Restore from backup
   /admin restart all              # Restart after recovery
   ```

3. **Service Recovery**
   ```bash
   /recover all                    # Attempt automatic recovery
   /admin restart <service>        # Manual service restart
   ```

## Troubleshooting

### Common Administrative Issues

#### High Memory Usage
**Symptoms**: Memory alerts, slow performance
**Investigation**:
```bash
/health metrics memory             # Memory usage details
/performance monitor 10m           # Real-time monitoring
/data cleanup temp                 # Clean temporary data
```

**Resolution**:
1. Force garbage collection: `/performance optimize memory`
2. Clear old context data: `/server context optimize`
3. Restart services if necessary: `/admin restart all`

#### Performance Degradation
**Symptoms**: Slow response times, user complaints
**Investigation**:
```bash
/performance benchmark quick       # Performance validation
/health alerts                     # Check for alerts
/analytics performance             # Usage pattern analysis
```

**Resolution**:
1. Optimize system: `/performance optimize all`
2. Review configuration: `/config validate all`
3. Check external dependencies: `/health apis`

#### Configuration Issues
**Symptoms**: Features not working, validation errors
**Investigation**:
```bash
/config validate all               # Configuration validation
/config audit 20                   # Recent changes
/admin status detailed             # System status
```

**Resolution**:
1. Rollback configuration: `/config rollback <version>`
2. Reload from file: `/config reload`
3. Reset to defaults if necessary

#### User Issues
**Symptoms**: User reports, authentication failures
**Investigation**:
```bash
/users info @user                  # User status
/security audit user @user         # Security audit
/users context @user view          # Context status
```

**Resolution**:
1. Reset user preferences: `/users preferences @user reset`
2. Clear user context: `/users context @user clear`
3. Check permissions: `/security permissions @user`

### Emergency Procedures

#### Service Outage
1. **Immediate Response**
   ```bash
   /admin maintenance on "Emergency maintenance"
   /health alerts                   # Check alert status
   /admin restart all               # Attempt restart
   ```

2. **Investigation**
   - Review system logs
   - Check external service status
   - Analyze performance metrics
   - Identify root cause

3. **Recovery**
   - Implement fix or workaround
   - Test system functionality
   - Disable maintenance mode
   - Monitor for stability

#### Data Corruption
1. **Immediate Response**
   ```bash
   /admin maintenance on "Data recovery in progress"
   /data backup emergency           # Emergency backup
   ```

2. **Assessment**
   - Identify affected data
   - Determine corruption extent
   - Check backup availability
   - Plan recovery strategy

3. **Recovery**
   - Restore from latest good backup
   - Validate data integrity
   - Test system functionality
   - Resume normal operations

#### Security Incident
1. **Immediate Response**
   - Identify security threat
   - Isolate affected systems
   - Implement emergency restrictions

2. **Investigation**
   ```bash
   /security audit detailed         # Security audit
   /users banned                    # Check banned users
   /security permissions review     # Permission review
   ```

3. **Resolution**
   - Address security vulnerability
   - Update security configuration
   - Monitor for further incidents
   - Document lessons learned

## Best Practices

### Administrative Guidelines
- Regular monitoring of system health and performance
- Proactive maintenance scheduling
- Comprehensive backup and recovery procedures
- Security-first approach to configuration changes
- Documentation of all administrative actions

### Performance Optimization
- Monitor and optimize resource usage regularly
- Implement capacity planning based on growth trends
- Use performance benchmarks to validate optimizations
- Balance feature richness with system performance

### Security Management
- Regular security audits and reviews
- Principle of least privilege for user permissions
- Encryption for sensitive data
- Incident response planning and testing

### Data Management
- Regular backup and recovery testing
- Data retention policy enforcement
- Privacy compliance monitoring
- Data quality and integrity validation

## Advanced Administration

### Scaling Considerations
- Monitor resource usage trends
- Plan capacity expansion based on growth
- Implement load balancing for high traffic
- Consider distributed deployment options

### Integration Management
- Monitor external API dependencies
- Implement fallback strategies for service outages
- Regular testing of integration points
- Version compatibility management

### Automation Opportunities
- Automated health monitoring and alerting
- Scheduled maintenance task execution
- Automated backup and recovery procedures
- Performance optimization automation

This administrative guide provides comprehensive coverage of all aspects of Discord LLM Bot administration, ensuring optimal performance, security, and user experience.