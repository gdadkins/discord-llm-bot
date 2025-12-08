# Admin Guide

Administrative commands and procedures for the Discord LLM Bot.

## Initial Setup

```bash
cp .env.example .env   # Configure environment
mkdir -p data logs     # Create directories
npm install && npm run build
npm run dev            # Test in development
```

Verify system: `/status full`

## Administrative Commands

### System Management

| Command | Description |
|---------|-------------|
| `/admin status` | System health overview |
| `/admin restart [service]` | Restart services (all/gemini/discord) |
| `/admin maintenance on/off` | Enable/disable maintenance mode |

### Configuration

| Command | Description |
|---------|-------------|
| `/config view [section]` | View configuration |
| `/config reload` | Reload from file |
| `/config validate` | Validate settings |
| `/config rollback <version>` | Restore previous version |
| `/config audit` | View change history |

### Health Monitoring

| Command | Description |
|---------|-------------|
| `/health overview` | Health summary |
| `/health metrics [timeframe]` | Detailed metrics |
| `/health alerts` | Current alerts |

### User Management

| Command | Description |
|---------|-------------|
| `/users list [active]` | List bot users |
| `/users info @user` | User details |
| `/users context @user clear` | Clear user context |
| `/users ban @user [reason]` | Restrict user access |

### Server Settings

| Command | Description |
|---------|-------------|
| `/server info` | Server bot info |
| `/server features list/enable/disable` | Manage features |
| `/server channels configure` | Channel settings |

### Analytics

| Command | Description |
|---------|-------------|
| `/analytics summary` | Usage summary |
| `/analytics users` | User statistics |
| `/analytics commands` | Command usage |
| `/analytics export` | Export data |

## Maintenance Tasks

### Daily
- Check `/health overview` for issues
- Review `/analytics summary`

### Weekly
- Review error logs
- Check storage usage
- Update configuration if needed

### Monthly
- Rotate API keys
- Review user bans
- Cleanup old data

## Permissions

Admin commands require **Administrator** or **Manage Server** permission.

## Troubleshooting

| Issue | Command |
|-------|---------|
| High memory | `/admin restart gemini` |
| Slow responses | `/health metrics 1h` |
| Config issues | `/config validate` |
| User problems | `/users context @user clear` |
