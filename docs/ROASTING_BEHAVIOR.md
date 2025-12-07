# Dynamic Roasting Behavior

The bot now has intelligent, randomized roasting behavior that keeps interactions unpredictable and fun!

## How It Works

Instead of roasting every single time (which gets old), the bot now:
1. **Randomly decides** whether to roast or be helpful
2. **Tracks questions** per user to adjust probability
3. **Increases chances** the more questions you ask without being roasted
4. **Provides cooldown** after roasting (optional)

## Configuration

Add these to your `.env` file:

```env
# Roasting Probability Settings
ROAST_BASE_CHANCE=0.5              # 50% base chance to roast on first question
ROAST_CONSECUTIVE_BONUS=0.25       # +25% per question without roasting
ROAST_MAX_CHANCE=0.9               # Caps at 90% chance
ROAST_COOLDOWN=true                # Always be helpful after roasting

# Helpful personality (when not roasting)
HELPFUL_INSTRUCTION="You are a friendly Discord bot assistant. Answer questions helpfully and concisely without any sarcasm or roasting."
```

## Probability Examples

### Default Settings (50% base, +25% per question)
- 1st question: 50% chance to roast
- 2nd question: 75% chance (if 1st wasn't roasted)
- 3rd question: 90% chance (capped)
- After roasting: Next question is always helpful (if cooldown enabled)

### Gentler Settings
```env
ROAST_BASE_CHANCE=0.2              # Only 20% chance initially
ROAST_CONSECUTIVE_BONUS=0.1        # +10% per question
ROAST_MAX_CHANCE=0.5               # Max 50% chance
```

### Aggressive Settings
```env
ROAST_BASE_CHANCE=0.7              # 70% chance from the start
ROAST_CONSECUTIVE_BONUS=0.3        # +30% per question
ROAST_MAX_CHANCE=1.0               # Always roast by 2nd question
ROAST_COOLDOWN=false               # No mercy, no breaks
```

## User Experience Examples

### With Default Settings + Cooldown

```
User: "How do I center a div?"
Bot: [50% chance - ROASTS] "Still can't center a div in 2024? Use flexbox you absolute donkey..."

User: "What about vertically?"
Bot: [Cooldown active - HELPFUL] "To center vertically with flexbox, add align-items: center to your container."

User: "And horizontally?"
Bot: [50% chance - HELPFUL] "For horizontal centering, use justify-content: center."

User: "What if I have multiple items?"
Bot: [75% chance - ROASTS] "Four questions about basic CSS? Did you try reading the documentation, or is that too advanced?"
```

### Without Cooldown

```
User: "What's 2+2?"
Bot: [50% chance - ROASTS] "It's 4, you mathematical disaster..."

User: "Multiply by 10?"
Bot: [50% chance - ROASTS AGAIN] "Now you need help with 4 × 10? It's 40, genius..."
```

## Advanced Patterns

### Question Burst Detection
The more questions asked in succession, the higher the roast probability:
- Encourages users to think before asking
- Punishes lazy rapid-fire questions
- Rewards thoughtful, complete questions

### Per-User Tracking
Each user has independent tracking:
- Bob might get roasted while Alice gets help
- Resets improve over time
- No shared state between users

### Natural Conversation Flow
With cooldown enabled:
- Roast → Help → Roast → Help
- Creates rhythm in conversation
- Prevents roast fatigue

## Best Practices

1. **Start Conservative**: Begin with lower chances and adjust based on your server's vibe
2. **Monitor Reactions**: If people stop engaging, reduce roast frequency
3. **Server-Specific**: Different servers might want different settings
4. **Time of Day**: Could potentially adjust based on time (future feature)

## Debug Information

The bot logs roasting decisions:
```
[INFO] Roasting user 123456789 (chance was 75%)
```

Use `/status` to see conversation stats and understand patterns.

## The Psychology

This approach works because:
- **Unpredictability**: Users never know if they'll get roasted
- **Anticipation**: Builds tension with each question
- **Relief**: Helpful responses provide contrast
- **Fairness**: Everyone gets both treatment types
- **Escalation**: Multiple questions increase roast probability

The result? A bot that feels more human, less mechanical, and way more fun to interact with!