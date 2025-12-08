# User Guide

User features and customization for the Discord LLM Bot.

## Getting Started

| Command | Description |
|---------|-------------|
| `/chat <message>` | Chat with the AI |
| `/clear` | Clear conversation history |
| `/status` | View system status |
| `/help` | Get help |

## Preferences

### View and Set
```
/preferences view              # See your settings
/preferences set <key> <value> # Change a setting
/preferences reset             # Reset to defaults
```

### Available Settings

| Key | Options | Description |
|-----|---------|-------------|
| `defaultPersonality` | roasting/helpful/balanced | Bot personality |
| `preferredResponseStyle` | detailed/concise/adaptive | Response length |
| `enableCodeExecution` | true/false | Allow code execution |
| `timezone` | e.g., America/New_York | Your timezone |

### Quick Profiles
```
/preferences profile developer    # Code-focused
/preferences profile casual       # General chat
/preferences profile professional # Detailed help
/preferences profile roaster      # Maximum roasting
```

## Features

### Conversation Memory
- Bot remembers recent conversation context
- Use `/clear` to start fresh

### Roasting Mode
- Bot may roast users based on probability
- Remembers embarrassing moments
- `/remember @user <moment>` - Add moment (admin)

### Code Execution
- Enable in preferences
- Bot can run Python code safely

## Tips

1. **Be specific** - Clear questions get better answers
2. **Use context** - Reference previous messages
3. **Clear when stuck** - `/clear` resets conversation
4. **Check status** - `/status` shows bot health
