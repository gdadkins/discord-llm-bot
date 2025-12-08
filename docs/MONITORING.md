# Monitoring

Health monitoring, metrics, and performance tracking for the Discord LLM Bot.

## Quick Start

View system health: `/status`

Enable monitoring in `.env`:
```env
HEALTH_MONITORING_ENABLED=true
HEALTH_COLLECTION_INTERVAL=30000
HEALTH_ALERTS_ENABLED=true
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HEALTH_COLLECTION_INTERVAL` | `30000` | Collection interval (ms) |
| `HEALTH_RETENTION_DAYS` | `7` | Data retention period |
| `HEALTH_MEMORY_THRESHOLD` | `512` | Memory alert (MB) |
| `HEALTH_ERROR_RATE_THRESHOLD` | `5` | Error rate alert (%) |
| `HEALTH_RESPONSE_TIME_THRESHOLD` | `5000` | Response time alert (ms) |

## Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/status` | System health overview | All users |
| `/health [timeframe]` | Detailed metrics (1h/6h/24h/7d) | Admin |
| `/alerts status` | Alert configuration | Admin |
| `/alerts history` | Recent alerts | Admin |

## Health Metrics

### Memory
- Heap used/total
- RSS (physical memory)
- Thresholds: Warning 300MB, Critical 400MB

### Performance
- Response time percentiles (P50, P95, P99)
- Error rate
- Throughput (requests/minute)

### API Health
- Gemini API status
- Discord WebSocket status
- Rate limit remaining

### Cache
- Hit rate (target: >80%)
- Memory usage
- Entry count

## Performance Targets

| Metric | Target |
|--------|--------|
| Response time (P95) | <2 seconds |
| Memory usage | <500MB |
| Throughput | 100+ req/min |
| Error rate | <1% |
| Cache hit rate | >80% |

## Alert Types

| Alert | Trigger | Action |
|-------|---------|--------|
| Memory | >512MB | Trigger GC, clear cache |
| Error Rate | >5% | Enable fallbacks |
| Response Time | >5s | Queue messages |
| Disk Space | >85% | Cleanup old data |

## Data Storage

| File | Purpose |
|------|---------|
| `./data/health-metrics.json` | Health history |
| `./data/health-alerts.json` | Alert history |

- Real-time: 30-second intervals
- Historical: 7 days retention
- Auto-cleanup of expired data

## Troubleshooting

### High Memory
1. Check context memory: `/status`
2. Clear contexts: `/clear`
3. Restart if leak suspected

### High Error Rate
1. Check API health: `/health`
2. Review logs
3. Check network connectivity

### Slow Responses
1. Monitor: `/health 1h`
2. Check system resources
3. Optimize context sizes
