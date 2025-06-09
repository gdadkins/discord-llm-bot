# Roasting Algorithm Guide

## Overview

The Discord LLM Bot's roasting engine implements a sophisticated multi-layered decision system that combines psychological warfare strategies, probability mathematics, and performance optimizations to create engaging and unpredictable roasting behavior.

## Core Decision Flow

```
┌─ shouldRoast() Entry Point
│
├─ 1. Update Dynamic State
│   ├─ Base chance (hourly random 20-70%)
│   ├─ Bot mood (30-120 min cycles)
│   └─ Chaos mode (5% random trigger)
│
├─ 2. Decision Engine Processing
│   ├─ PRIORITY 1: Chaos Override (30% chance)
│   ├─ PRIORITY 2: Cooldown Warfare (15% break)
│   ├─ PRIORITY 3: Mercy Kill (6+ questions, 20%)
│   ├─ PRIORITY 4: Strategy Overrides
│   ├─ PRIORITY 5: Probability Calculation
│   └─ PRIORITY 6: Final Random Roll
│
└─ 3. Update Tracking & Return
```

## Mathematical Formulas

### Base Probability Calculation

The final roasting probability is calculated as:

```
finalChance = min(baseChance + modifiers, maxChance) * chaosMultiplier
where:
- baseChance: 0.2 to 0.7 (20% to 70%)
- modifiers: sum of 6 modifier functions
- maxChance: 0.9 (90%) by default
- chaosMultiplier: 0.5 to 2.5 when chaos mode active
```

### Individual Modifier Formulas

#### 1. Consecutive Question Bonus
```
if questionCount <= 2:
    base = questionCount * 0.10
    variance = ±0.025
elif questionCount <= 5:
    base = questionCount * 0.25
    variance = questionCount * 0.10
else:
    base = questionCount * 0.35
    variance = questionCount * 0.15
    bonusBomb = 10% chance of +0.0 to +0.5

consecutiveBonus = base + random(variance) + bonusBomb
```

#### 2. Message Complexity Modifier
```
complexity = 0
complexity += min(messageLength / 100, 0.30)         // Length bonus
complexity += codePattern ? 0.20 : 0                 // Code blocks
complexity += programmingPattern ? 0.15 : 0         // Programming terms
complexity += technicalPattern ? 0.10 : 0           // Technical terms
complexity += questionMark ? 0.05 : 0               // Single question
complexity += multipleQuestions ? 0.10 : 0          // Multiple questions

complexityModifier = min(complexity, 0.50)          // Cap at 50%
```

#### 3. Time-Based Modifier
```
switch (hour):
    case 23-3:  return 0.30    // Night owls (+30%)
    case 5-8:   return -0.10   // Early birds (-10%)
    case 19-23: return 0.20    // Peak hours (+20%)
    case 13-17: return 0.10    // Afternoon (+10%)
    default:    return 0.00    // Normal hours
```

#### 4. Mood-Based Modifier
```
switch (botMood):
    case 'sleepy':
        return -0.20 + (questionCount * 0.05)
    case 'caffeinated':
        return 0.10 + (questionCount * 0.10)
    case 'chaotic':
        return random(-0.30, +0.30)
    case 'reverse_psychology':
        return questionCount > 3 ? -0.40 : +0.20
    case 'bloodthirsty':
        return 0.20 + (questionCount * 0.15)
```

#### 5. Roast Debt System
```
debtGrowth = currentDebt + 0.05

if debt > 1.0:
    return min(debt * 0.30, 0.70)    // Up to 70% bonus
else:
    return debt * 0.10               // Small debt bonus
```

#### 6. Server Influence
```
hoursSinceLastRoast = (now - lastRoastTime) / 3600000

if hoursSinceLastRoast < 1 && recentRoasts > 2:
    return 0.20                      // Hot server bonus
elif hoursSinceLastRoast > 6:
    return min(hoursSinceLastRoast * 0.02, 0.30)  // Cold server bonus
else:
    return 0.00
```

## Worked Examples

### Example 1: Early User, Simple Question
**Scenario**: User's 2nd question, "How do I deploy this?", 3 PM, caffeinated mode

```
Base Chance: 45% (current hourly value)
Consecutive: 2 * 10% = 20%
Complexity: 23 chars / 100 + question mark = 23% + 5% = 28%
Time: 13-17 hour = 10%
Mood: 10% + (2 * 10%) = 30%
Debt: 0.10 (minimal)
Server: 0% (normal activity)

Total: 45% + 20% + 28% + 10% + 30% + 1% + 0% = 134%
Capped: min(134%, 90%) = 90%
Decision: random() < 0.90 → 90% chance to roast
```

### Example 2: High Streak, Complex Code Question
**Scenario**: User's 6th question, 200-char message with code blocks, 10 PM, bloodthirsty mode

```
Base Chance: 60%
Consecutive: 6 * 35% + variance + potential bonus bomb = ~210% + 15% + (10% chance of 25%) = ~225%
Complexity: min(200/100 + 20% + 15%, 50%) = 50%
Time: 19-23 hour = 20%
Mood: 20% + (6 * 15%) = 110%
Debt: 1.5 debt = min(1.5 * 30%, 70%) = 45%
Server: Cold server = 15%

Total: 60% + 225% + 50% + 20% + 110% + 45% + 15% = 525%
Capped: min(525%, 90%) = 90%
Decision: Virtually guaranteed roast
```

### Example 3: Reverse Psychology Override
**Scenario**: User's 6th question, reverse psychology mode

```
Standard calculation would be: ~200%+ (high chance)
Strategy Override Check: questionCount > 5 AND random() < 40%
If override triggers: Return false (mercy) despite high probability
Reason: "Reverse psychology mercy - expected roast but got mercy"
```

### Example 4: Chaos Mode Active
**Scenario**: Any scenario during chaos mode (multiplier 1.8x)

```
Standard calculation: 65%
Chaos Override Check: random() < 30%
If override triggers: random() < 70% → roast decision
If no override: 65% * 1.8 = 117% → capped at 90%
```

### Example 5: Mercy Kill Activation
**Scenario**: User's 8th consecutive question

```
Before any calculations:
Mercy Kill Check: questionCount >= 6 AND random() < 20%
If triggered: Immediate roast decision
Reason: "Compassionate roasting after long streak"
Result: Bypasses all probability calculations
```

## Mood System Strategies

### Sleepy Strategy
- **Pattern**: Gradual awakening
- **Psychology**: Starts reluctant, becomes more responsive
- **Escalation**: -20% → -15% → -10% → -5% → 0% → +5%
- **Behavior**: Rewards persistence, mimics human drowsiness

### Caffeinated Strategy  
- **Pattern**: High energy escalation
- **Psychology**: Eager from start, becomes hyperactive
- **Escalation**: +20% → +30% → +40% → +50%
- **Behavior**: Punishes early questions, escalates quickly

### Chaotic Strategy
- **Pattern**: Complete randomness
- **Psychology**: Unpredictable for pattern breaking
- **Escalation**: random(-30%, +30%) each time
- **Behavior**: Prevents gaming, creates confusion

### Reverse Psychology Strategy
- **Pattern**: Subverts expectations
- **Psychology**: Shows mercy when punishment expected
- **Escalation**: Low count: +20%, High count: -40%
- **Override**: 40% chance mercy after 5+ questions
- **Behavior**: Creates uncertainty about "safe" patterns

### Bloodthirsty Strategy
- **Pattern**: Maximum aggression
- **Psychology**: Ruthless escalation
- **Escalation**: +35% → +50% → +65% → +80%
- **Behavior**: Highest pressure, fastest escalation

## Chaos Mode Features

### Activation
- **Trigger**: 5% chance per decision check
- **Duration**: 5-30 minutes (random)
- **Multiplier**: 0.5x to 2.5x (random)
- **Frequency**: Can activate multiple times per session

### Override System
- **Trigger Chance**: 30% when chaos active
- **Decision Logic**: 70% roast, 30% mercy (random)
- **Priority**: Highest (bypasses all other logic)
- **Purpose**: Maximum unpredictability

### Psychological Impact
- **Pattern Breaking**: Disrupts user expectations
- **Memorable Events**: Creates notable "chaos moments"
- **Engagement**: Increases uncertainty and excitement

## Performance Optimizations

### Caching Strategy
```typescript
// Complexity calculation cache
private calculationCache: RoastCalculationCache = {
  complexity: Map<string, {value: number, hash: string}>,    // LRU, 100 entries
  timeModifier: {value: number, hour: number},               // Hour-based cache
  moodModifier: Map<string, number>,                         // Per-mood cache
  serverInfluence: Map<string, {value: number, timestamp}>,  // 5-min TTL
  consecutiveBonus: Map<number, number>                      // Base values only
};
```

### Cache Eviction Policies
- **Complexity**: LRU eviction at 100 entries
- **Time**: Single value, hour-based invalidation
- **Mood**: Invalidated on mood changes, 20 entry limit
- **Server**: TTL-based (5 minutes), 50 entry limit
- **Consecutive**: Size-limited (20 entries), random variance added

### Pre-compiled Patterns
```typescript
private static readonly COMPLEXITY_PATTERNS = {
  code: /```|`/,
  programming: /\b(function|class|import|const|let|var|if|else|for|while)\b/i,
  technical: /\b(api|database|server|client|bug|error|exception|deploy|build)\b/i
};
```

## Configuration Parameters

### Environment Variables
```bash
ROAST_MAX_CHANCE=0.9          # Maximum probability cap (default: 90%)
ROAST_COOLDOWN=true           # Enable cooldown system (default: false)
```

### Configurable Constants
```typescript
// Base behavior
DEFAULT_BASE_CHANCE: 0.5      // 50% starting probability
MIN_BASE_CHANCE: 0.2          // 20% minimum base
MAX_BASE_CHANCE: 0.7          // 70% maximum base

// Escalation rates
EARLY_QUESTIONS_MULTIPLIER: 0.1    // 10% per question (Q1-2)
MID_STREAK_MULTIPLIER: 0.25        // 25% per question (Q3-5)  
LATE_STREAK_MULTIPLIER: 0.35       // 35% per question (Q6+)

// Special events
MERCY_KILL_THRESHOLD: 6            // Questions before mercy eligibility
MERCY_KILL_CHANCE: 0.2             // 20% mercy chance
BONUS_BOMB_CHANCE: 0.1             // 10% bonus bomb chance
CHAOS_MODE_TRIGGER_CHANCE: 0.05    // 5% chaos trigger
```

## Troubleshooting Guide

### Unexpected Low Roasting Rates

**Symptoms**: Bot rarely roasts despite high question counts
**Possible Causes**:
1. **Sleepy mood during peak hours**: Check `getRoastingState().botMood`
2. **Cooldown enabled**: Verify `ROAST_COOLDOWN` environment variable
3. **Low base chance**: Current base may be at minimum (20%)
4. **Reverse psychology active**: Mode shows mercy when high roasting expected

**Debugging Steps**:
```typescript
// Check current state
const state = roastingEngine.getRoastingState();
console.log('Base chance:', state.baseChance);
console.log('Bot mood:', state.botMood);
console.log('Chaos mode:', state.chaosMode);

// Check individual modifiers
const consecutiveBonus = roastingEngine.getConsecutiveBonus(questionCount);
const moodModifier = roastingEngine.getMoodModifier(questionCount);
```

### Unexpected High Roasting Rates

**Symptoms**: Bot roasts almost every question
**Possible Causes**:
1. **Bloodthirsty mood with high streaks**: Very aggressive escalation
2. **Chaos mode with high multiplier**: 2.5x multiplier active
3. **High complexity messages**: Code-heavy questions get large bonuses
4. **Significant roast debt**: User has accumulated debt over time

**Debugging Steps**:
```typescript
// Monitor decision logging
// Check logs for: "Roast decision for user X: ROAST | Final chance: Y%"
// Look for high consecutive bonuses or chaos multipliers
```

### Roasting Inconsistency

**Symptoms**: Highly variable behavior between similar questions
**Expected Behavior**: This is intentional design
**Causes**:
1. **Random variance**: All modifiers include randomness
2. **Chaos mode**: Completely random during chaos periods
3. **Bonus bombs**: 10% chance of large random bonuses
4. **Mood changes**: Bot mood changes every 30-120 minutes

### Performance Issues

**Symptoms**: Slow response times or memory growth
**Possible Causes**:
1. **Cache overflow**: Complexity cache exceeded limits
2. **Timer leaks**: Server history timers not properly cleaned
3. **Large user base**: Too many tracked users

**Resolution**:
```typescript
// Check cache sizes
const healthMetrics = roastingEngine.getHealthMetrics();
console.log('Cache sizes:', healthMetrics.cacheSize);
console.log('Active timers:', healthMetrics.activeTimers);

// Clean up if needed
roastingEngine.clearUserStats(userId);  // For specific users
```

### Strategy Override Confusion

**Symptoms**: Expected roast/mercy decisions not happening
**Understanding Strategy Priorities**:
1. **Chaos override**: Always highest priority (30% chance)
2. **Mercy kill**: Second priority (6+ questions, 20% chance)
3. **Strategy override**: Third priority (mood-specific)
4. **Standard calculation**: Lowest priority

**Reverse Psychology Specifics**:
- Base mood modifier: Low count (+20%), High count (-40%)
- Strategy override: 40% chance mercy after 5+ questions
- Purpose: Subvert user expectations about "punishment"

## Architecture Notes

### Service Integration
- **Extends**: `BaseService` for health monitoring and lifecycle
- **Dependencies**: Logger utility, configuration constants
- **Interfaces**: Implements `IRoastingEngine` for type safety

### Strategy Pattern Implementation
- **Strategy Interface**: `RoastingStrategy` with `calculateRoastChance()` and `shouldOverride()`
- **Strategy Registry**: Map-based strategy selection by mood
- **Default Fallback**: Ensures system stability if mood mapping fails

### Memory Management
- **Active Timer Tracking**: All setTimeout instances tracked for cleanup
- **Cache Size Limits**: Prevents unbounded memory growth
- **LRU Eviction**: Oldest entries removed when limits exceeded
- **Shutdown Cleanup**: Comprehensive cleanup in `performShutdown()`

This algorithm represents a sophisticated behavioral simulation system designed to create engaging, unpredictable, and psychologically interesting interactions while maintaining high performance and reliability.