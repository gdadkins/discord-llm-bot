# Health Monitoring System

## Overview

The Discord LLM Bot includes a comprehensive health monitoring system that provides real-time insights into bot performance, resource usage, and service health. The system continuously collects metrics, detects issues, and provides automated alerts to ensure optimal operation.

## Quick Start

The health monitoring system is enabled by default and requires no additional setup. View current health status:

```
/status
```

Enable advanced monitoring features in your `.env`:
```env
HEALTH_MONITORING_ENABLED=true
HEALTH_COLLECTION_INTERVAL=30000
HEALTH_RETENTION_DAYS=7
HEALTH_ALERTS_ENABLED=true
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEALTH_MONITORING_ENABLED` | `true` | Enable/disable health monitoring |
| `HEALTH_COLLECTION_INTERVAL` | `30000` | Metrics collection interval (ms) |
| `HEALTH_RETENTION_DAYS` | `7` | Days to retain health data |
| `HEALTH_ALERTS_ENABLED` | `true` | Enable automated alerts |
| `HEALTH_MEMORY_THRESHOLD` | `512` | Memory alert threshold (MB) |
| `HEALTH_ERROR_RATE_THRESHOLD` | `5` | Error rate alert threshold (%) |
| `HEALTH_RESPONSE_TIME_THRESHOLD` | `5000` | Response time alert threshold (ms) |
| `HEALTH_DISK_SPACE_THRESHOLD` | `85` | Disk space alert threshold (%) |

### Alert Configuration

Configure alert thresholds based on your server capacity:

```env
# Memory alerts (MB)
HEALTH_MEMORY_THRESHOLD=512

# Error rate alerts (percentage)
HEALTH_ERROR_RATE_THRESHOLD=5

# Response time alerts (milliseconds)
HEALTH_RESPONSE_TIME_THRESHOLD=5000

# Disk space alerts (percentage)
HEALTH_DISK_SPACE_THRESHOLD=85
```

## Commands

### `/status` - System Health Overview

View comprehensive system health information including:
- Memory usage and trends
- Active conversation count
- Rate limiting status
- API health indicators
- Performance metrics
- Cache efficiency
- Context memory usage

**Usage**: `/status`
**Permissions**: All users

### `/health` - Detailed Health Metrics

Admin-only command for detailed health analysis:
- Historical performance data
- Alert status and history
- Service-specific health metrics
- Resource utilization trends

**Usage**: `/health [timeframe]`
**Parameters**: 
- `timeframe` (optional): `1h`, `6h`, `24h`, `7d`
**Permissions**: Administrator or Manage Server

### `/alerts` - Alert Management

Manage health monitoring alerts:

#### `/alerts status`
View current alert status and configuration.

#### `/alerts configure <type> <threshold>`
Configure alert thresholds.
- `type`: `memory`, `error_rate`, `response_time`, `disk_space`
- `threshold`: Numeric threshold value

#### `/alerts history [limit]`
View recent alert history.
- `limit` (optional): Number of alerts to show (1-50)

**Permissions**: Administrator or Manage Server

## Health Metrics

### Memory Usage Metrics
- **Heap Used**: Current heap memory usage
- **Heap Total**: Total allocated heap memory
- **RSS**: Resident Set Size (physical memory)
- **External**: External memory (buffers, etc.)
- **Array Buffers**: ArrayBuffer memory usage

### Performance Metrics
- **Response Time Percentiles**: P50, P95, P99 response times
- **Request Success Rate**: Percentage of successful requests
- **Error Rate**: Rate of errors per time period
- **Throughput**: Requests processed per minute

### API Health Indicators
- **Gemini API**: Connection status and response time
- **Discord API**: WebSocket status and heartbeat
- **Rate Limiting**: Current usage and remaining quota

### Cache Efficiency
- **Hit Rate**: Percentage of cache hits vs misses
- **Memory Usage**: Cache memory consumption
- **Size**: Number of cached items

### Context Memory Analytics
- **Total Servers**: Number of servers with context data
- **Memory Usage**: Total context memory consumption
- **Average Size**: Average context size per server
- **Item Counts**: Embarrassing moments, code snippets, running gags
- **Compression Stats**: Memory saved through compression

## Data Storage

### File Locations
- **Health Data**: `./data/health-metrics.json`
- **Alert History**: `./data/health-alerts.json`
- **Performance Buffer**: In-memory circular buffer

### Data Retention
- **Real-time Metrics**: 30-second intervals
- **Historical Data**: 7 days by default (configurable)
- **Alert History**: 30 days
- **Performance Buffer**: Last 1000 operations

### Storage Management
- Automatic cleanup of old data
- Compression for historical metrics
- Configurable retention periods
- Efficient circular buffer implementation

## Alert System

### Alert Types

#### Memory Alerts
Triggered when memory usage exceeds threshold:
- Heap memory over limit
- RSS memory growth rate
- Memory leak detection
- Garbage collection frequency

#### Performance Alerts
Triggered by performance degradation:
- Response time above threshold
- Error rate increase
- Throughput decrease
- API latency spikes

#### Resource Alerts
Triggered by resource constraints:
- Disk space low
- File system errors
- Database connection issues
- Network connectivity problems

#### Service Health Alerts
Triggered by service issues:
- Gemini API failures
- Discord API disconnections
- Rate limit violations
- Context memory bloat

### Alert Delivery

#### Console Logging
All alerts are logged to the console with severity levels:
```
[WARN] Health Alert: Memory usage (543MB) exceeds threshold (512MB)
[ERROR] Health Alert: Error rate (8.5%) above threshold (5%)
```

#### Discord Notifications
Critical alerts can be sent to designated channels:
```env
HEALTH_ALERT_CHANNEL_ID=your-channel-id
HEALTH_ALERT_WEBHOOK_URL=your-webhook-url
```

#### Alert Throttling
Prevents alert spam with intelligent throttling:
- Minimum time between identical alerts
- Escalation for persistent issues
- Auto-resolution detection

## Performance Optimization

### Efficient Data Collection
- Minimal overhead metrics collection
- Asynchronous data processing
- Circular buffer implementation
- Smart sampling strategies

### Memory Management
- Automatic cleanup of old metrics
- Compression algorithms
- Memory-efficient data structures
- Configurable retention policies

### Background Processing
- Non-blocking metrics collection
- Background aggregation tasks
- Efficient file I/O operations
- Resource-aware processing

## Troubleshooting

### Common Issues

#### High Memory Usage
**Symptoms**: Memory alerts, slow performance
**Causes**: 
- Memory leaks in services
- Large context memories
- Inefficient caching

**Solutions**:
1. Check context memory usage: `/status`
2. Clear large contexts: `/clear` for users
3. Restart bot if memory leak suspected
4. Adjust cache size limits

#### High Error Rate
**Symptoms**: Error rate alerts, failed requests
**Causes**:
- API connectivity issues
- Invalid user inputs
- Service configuration errors

**Solutions**:
1. Check API health: `/health`
2. Review error logs
3. Validate configuration
4. Check network connectivity

#### Slow Response Times
**Symptoms**: Response time alerts, user complaints
**Causes**:
- High server load
- API latency
- Large context processing
- Resource constraints

**Solutions**:
1. Monitor performance: `/health 1h`
2. Check system resources
3. Optimize context sizes
4. Review rate limiting

#### Alert Spam
**Symptoms**: Too many alerts, noise
**Causes**:
- Thresholds too low
- Transient issues
- System instability

**Solutions**:
1. Adjust alert thresholds
2. Implement alert throttling
3. Review system stability
4. Use appropriate time windows

### Diagnostic Commands

```bash
# Check health monitoring status
/health status

# View performance trends
/health 24h

# Check alert configuration
/alerts status

# View recent alerts
/alerts history 20
```

### Log Analysis

Health monitoring logs follow this format:
```
[INFO] HealthMonitor: Collected metrics - Memory: 245MB, Active: 12, ResponseTime: 1.2s
[WARN] HealthMonitor: Memory threshold exceeded - Current: 567MB, Threshold: 512MB
[ERROR] HealthMonitor: Critical alert - Error rate: 12.5%, Threshold: 5%
```

## Integration Examples

### Custom Health Checks

Add custom health checks to your services:

```typescript
import { HealthMonitor } from './services/healthMonitor';

class CustomService {
  async performHealthCheck(): Promise<boolean> {
    // Custom health check logic
    return true;
  }
}

// Register custom health check
healthMonitor.registerCustomCheck('customService', async () => {
  return await customService.performHealthCheck();
});
```

### External Monitoring Integration

Export metrics to external monitoring systems:

```typescript
// Prometheus metrics export
app.get('/metrics', async (req, res) => {
  const metrics = await healthMonitor.getCurrentMetrics();
  res.send(formatPrometheusMetrics(metrics));
});

// Webhook notifications
healthMonitor.on('alert', async (alert) => {
  await sendWebhook(process.env.MONITORING_WEBHOOK, alert);
});
```

### Automated Responses

Configure automated responses to alerts:

```typescript
healthMonitor.on('memoryAlert', async () => {
  // Trigger garbage collection
  if (global.gc) global.gc();
  
  // Clear old cache entries
  await cacheManager.cleanup();
  
  // Notify administrators
  await notifyAdmins('High memory usage detected');
});
```

## Best Practices

### Monitoring Strategy
- Set appropriate alert thresholds for your environment
- Monitor trends, not just current values
- Implement escalation procedures for critical alerts
- Regular review of health metrics and patterns

### Resource Management
- Configure retention periods based on storage capacity
- Use appropriate collection intervals for your needs
- Monitor the monitoring system's own resource usage
- Implement backup strategies for health data

### Alert Management
- Avoid alert fatigue with appropriate thresholds
- Implement escalation procedures
- Document response procedures for different alert types
- Regular testing of alert delivery mechanisms

### Performance Optimization
- Adjust collection intervals based on system load
- Use compression for long-term storage
- Implement efficient querying for historical data
- Monitor the performance impact of monitoring itself

## Advanced Features

### Predictive Analysis
The health monitoring system includes basic trend analysis:
- Memory usage growth rate prediction
- Performance degradation detection
- Seasonal pattern recognition
- Anomaly detection algorithms

### Auto-Recovery
Automated recovery attempts for common issues:
- Memory pressure relief
- Cache optimization
- Service restart coordination
- Configuration adjustment

### Health Scoring
Composite health scores based on multiple metrics:
- Overall system health (0-100)
- Service-specific health scores
- Trend-based health indicators
- Predictive health assessments

## Security Considerations

### Data Privacy
- Health metrics contain no user personal data
- Server IDs are anonymized in logs
- Configuration data is sanitized
- Access controls for sensitive metrics

### Access Control
- Admin-only access to detailed health data
- Rate limiting on health command usage
- Audit logging for health system access
- Secure storage of health data

### Network Security
- No external data transmission by default
- Optional encrypted webhook delivery
- Secure API endpoints for metric export
- Network isolation for health data

## Future Enhancements

### Planned Features
- **Machine Learning Analysis**: Predictive failure detection
- **Custom Dashboards**: Web-based health monitoring interface
- **Advanced Alerting**: Complex rule-based alerting
- **Integration APIs**: External system integration endpoints

### Monitoring Improvements
- **Real-time Streaming**: Live metric updates
- **Advanced Visualization**: Charts and graphs
- **Comparative Analysis**: Historical trend comparison
- **Capacity Planning**: Resource usage forecasting

This health monitoring system provides comprehensive visibility into your Discord LLM Bot's operation, enabling proactive management and optimal performance.