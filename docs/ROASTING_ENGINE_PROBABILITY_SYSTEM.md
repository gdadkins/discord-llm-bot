# RoastingEngine Probability System Documentation

## Executive Summary

The RoastingEngine implements a sophisticated multi-layered probability system that combines deterministic calculations with controlled randomness to create unpredictable yet consistent roasting behavior. This document provides comprehensive mathematical formulas, decision tree logic, and implementation details based on the actual source code implementation.

## System Architecture

The RoastingEngine uses a modular architecture with:
- **Calculator Classes**: Specialized calculators for each modifier type with caching
- **Decision Engine**: Orchestrates the decision-making process with priority overrides
- **Chaos Event Manager**: Manages random chaos events independently
- **Strategy Pattern**: Different strategies for each bot mood

## Core Mathematical Model

### Primary Probability Formula

The final roasting probability **P(roast)** is calculated as:

```
P(roast) = min(P_base + Σ(M_i), P_max) × C_multiplier

where:
- P_base ∈ [0.2, 0.7] (base probability, hourly random update)
- M_i = individual modifier functions (i = 1 to 6)
- P_max = 0.9 (configurable via ROAST_MAX_CHANCE env var)
- C_multiplier ∈ [0.5, 2.5] (chaos mode multiplier when active, else 1.0)
```

### Modifier Function Definitions

#### M₁: Consecutive Question Modifier (ConsecutiveCalculator)

```
M₁(q) = B(q) + V(q) + BB(q)

where:
B(q) = base multiplier:
  - 0.10q          if q ≤ 2    (EARLY_QUESTIONS_MULTIPLIER)
  - 0.25q          if 2 < q ≤ 5 (MID_STREAK_MULTIPLIER)
  - 0.35q          if q > 5     (LATE_STREAK_MULTIPLIER)

V(q) = variance component:
  - U(-0.025, 0.025)                    if q ≤ 2 (RANDOM_VARIANCE_RANGE = 0.05)
  - U(0, 0.10q)                         if 2 < q ≤ 5 (MID_STREAK_VARIANCE)
  - U(0, 0.15q)                         if q > 5 (LATE_STREAK_VARIANCE)

BB(q) = bonus bomb (only if q > 5):
  - U(0, 0.5)      with probability 0.1 (BONUS_BOMB_CHANCE, MAX_BONUS_BOMB)
  - 0              with probability 0.9

where U(a,b) = uniform random distribution between a and b
      q = consecutive question count

Note: Results are cached with small variance added on cache hits
```

#### M₂: Message Complexity Modifier (ComplexityCalculator)

```
M₂(msg) = min(Σ(C_i), 0.5)

where C_i components:
C₁ = min(len(msg)/100, 0.3)           // Length component (MAX_LENGTH_MODIFIER)
C₂ = 0.2 × I(hasCode)                 // Code presence indicator (CODE_PRESENCE_BONUS)
C₃ = 0.15 × I(hasProgramming)         // Programming keywords (PROGRAMMING_KEYWORD_BONUS)
C₄ = 0.1 × I(hasTechnical)            // Technical terms (TECHNICAL_KEYWORD_BONUS)
C₅ = 0.05 × I(hasQuestion)            // Question mark presence (QUESTION_MARK_BONUS)
C₆ = 0.1 × I(hasMultipleQuestions)    // Multiple questions (MULTIPLE_QUESTIONS_BONUS)

where I(condition) = 1 if condition true, 0 otherwise

Pattern matching:
- Code: /```|`/
- Programming: /\b(function|class|import|const|let|var|if|else|for|while)\b/i
- Technical: /\b(api|database|server|client|bug|error|exception|deploy|build)\b/i

Cache: LRU with max 100 entries, keyed by hash(length, hasQuestion, hasCode)
```

#### M₃: Time-Based Modifier (TimeCalculator)

```
M₃(h) = {
  0.30   if h ∈ [23,24) ∪ [0,3]    // Night owl bonus (NIGHT_OWL_BONUS)
  -0.10  if h ∈ [5,8]               // Early bird penalty (EARLY_BIRD_PENALTY)
  0.20   if h ∈ [19,23)             // Peak hours bonus (PEAK_HOURS_BONUS)
  0.10   if h ∈ [13,17]             // Afternoon bonus (AFTERNOON_BONUS)
  0.00   otherwise                   // Normal hours
}

where h = current hour (24-hour format)

Cache: Single value cache, invalidated hourly
```

#### M₄: Mood-Based Modifier (MoodCalculator)

```
M₄(mood, q) = {
  -0.20 + 0.05q                     if mood = 'sleepy'
  0.10 + 0.10q                      if mood = 'caffeinated'
  U(-0.30, 0.30)                    if mood = 'chaotic'
  0.20 × I(q ≤ 3) - 0.40 × I(q > 3) if mood = 'reverse_psychology'
  0.20 + 0.15q                      if mood = 'bloodthirsty'
}

where:
- q = consecutive question count
- Sleepy: SLEEPY_BASE_MODIFIER (-0.2) + SLEEPY_ESCALATION (0.05) × q
- Caffeinated: CAFFEINATED_BASE_MODIFIER (0.1) + CAFFEINATED_ESCALATION (0.1) × q
- Chaotic: Random in range [-0.3, 0.3] (CHAOTIC_RANDOM_RANGE = 0.6, offset 0.3)
- Reverse Psychology: Threshold at q = 3, bonus/penalty = 0.2/-0.4
- Bloodthirsty: BLOODTHIRSTY_BASE_MODIFIER (0.2) + BLOODTHIRSTY_ESCALATION (0.15) × q

Cache: Per-mood cache with max 20 entries, cleared on mood change
Note: Chaotic mood results are never cached due to randomness
```

#### M₅: Roast Debt Modifier (DebtCalculator)

```
M₅(d) = {
  min(0.3d, 0.7)    if d > 1.0    // Significant debt
  0.1d              if d ≤ 1.0    // Small debt
}

where:
- d = accumulated debt
- Debt increments by 0.05 (DEBT_GROWTH_RATE) per non-roast decision
- Significant debt threshold = 1.0 (SIGNIFICANT_DEBT_THRESHOLD)
- Max debt bonus = 0.7 (MAX_DEBT_BONUS)
- Debt bonus multiplier = 0.3 (DEBT_BONUS_MULTIPLIER)
- Small debt multiplier = 0.1 (SMALL_DEBT_MULTIPLIER)
- Debt resets to 0 on successful roast

Note: Debt is tracked per user and only applies in server contexts
```

#### M₆: Server Influence Modifier (ServerCalculator)

```
M₆(t, r) = {
  0.20              if t < 1 ∧ r > 2      // Hot server
  min(0.02t, 0.3)   if t > 6              // Cold server
  0.00              otherwise              // Normal activity
}

where:
- t = hours since last server roast
- r = recent roasts in server (decays by 1 per hour)
- Hot server: HOT_SERVER_BONUS (0.2) when t < 1 hour AND r > 2
- Cold server: COLD_SERVER_BONUS_PER_HOUR (0.02) × t, max 0.3
- Hot server threshold: 1 hour (HOT_SERVER_TIME_HOURS)
- Cold server threshold: 6 hours (COLD_SERVER_TIME_HOURS)

Cache: TTL-based with 5-minute expiration, max 50 entries
Server history tracking: Recent count decrements via timer after 1 hour
```

## Decision Tree Logic

### Primary Decision Flow

The RoastingDecisionEngine implements a priority-based decision system:

```
                        ┌─────────────────────┐
                        │  shouldRoast Entry  │
                        └──────────┬──────────┘
                                   │
                        ┌──────────▼──────────┐
                        │ Update Dynamic State│
                        │ • Base chance       │
                        │ • Bot mood          │
                        │ • Chaos mode        │
                        └──────────┬──────────┘
                                   │
                        ┌──────────▼──────────┐
                        │PRIORITY 1: Chaos    │
                        │   Override Check    │
                        │    (30% chance)     │
                        └─────┬─────────┬─────┘
                              │YES      │NO
                    ┌─────────▼───┐     │
                    │Random 70%   │     │
                    │Roast Decision│     │
                    └─────────────┘     │
                                        │
                              ┌─────────▼─────────┐
                              │PRIORITY 2:       │
                              │ Cooldown Logic   │
                              │ (if enabled)     │
                              └────┬──────────┬───┘
                                   │YES       │NO
                         ┌─────────▼───┐      │
                         │Break Cool-  │      │
                         │down? (15%)  │      │
                         └──┬───────┬──┘      │
                            │YES    │NO       │
                            │       │         │
                            │  ┌────▼────┐    │
                            │  │ Return  │    │
                            │  │  False  │    │
                            │  └─────────┘    │
                            │                 │
                  ┌─────────▼─────────────────▼─┐
                  │PRIORITY 3: Mercy Kill Check │
                  │   (q ≥ 6 AND 20% chance)   │
                  └────────┬─────────────┬──────┘
                           │YES          │NO
                     ┌─────▼─────┐       │
                     │  Return   │       │
                     │   True    │       │
                     └───────────┘       │
                                         │
                              ┌──────────▼──────────┐
                              │PRIORITY 4:         │
                              │ Strategy Override  │
                              │ (mood-specific)    │
                              └─────┬──────────┬────┘
                                    │YES       │NO
                          ┌─────────▼───┐      │
                          │   Apply     │      │
                          │  Override   │      │
                          └─────────────┘      │
                                               │
                                    ┌──────────▼──────────┐
                                    │PRIORITY 5:         │
                                    │Calculate Probability│
                                    │ P = base + Σ(M_i)  │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │Apply Chaos Multiply │
                                    │ if chaos active     │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │Clamp to [0, P_max] │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │PRIORITY 6:         │
                                    │  Final Random Roll  │
                                    │  rand() < P(roast)  │
                                    └─────┬─────────┬─────┘
                                          │YES      │NO
                                    ┌─────▼───┐ ┌───▼─────┐
                                    │ Return  │ │ Return  │
                                    │  True   │ │  False  │
                                    └─────────┘ └─────────┘
```

### Detailed Override Logic

#### Chaos Mode Override (ChaosEventManager)
```
if chaosMode.active ∧ U(0,1) < 0.3:  // CHAOS_OVERRIDE_CHANCE
    chaosDecision = U(0,1) < 0.7     // CHAOS_DECISION_ROAST_CHANCE
    return {
        shouldRoast: chaosDecision,
        reason: `${decision} (${chaosRoll * 100}% chaos roll)`
    }
```

#### Cooldown Logic (Psychological Warfare)
```
if ROAST_COOLDOWN === 'true' ∧ userStats.lastRoasted:
    if U(0,1) < 0.15:  // COOLDOWN_BREAK_CHANCE
        log("Cooldown IGNORED (psychological warfare)")
        continue with processing
    else:
        userStats.lastRoasted = false
        userStats.count = 0
        return false
```

#### Mercy Kill System
```
if questionCount ≥ 6 ∧ U(0,1) < 0.2:  // MERCY_KILL_THRESHOLD, MERCY_KILL_CHANCE
    log("Mercy kill activated after ${count} questions")
    return true
```

#### Strategy-Specific Overrides
```
// Reverse Psychology Override (ReversePhychologyStrategy)
if mood = 'reverse_psychology' ∧ q > 5 ∧ U(0,1) < 0.4:
    return {
        shouldRoast: false,
        reason: "Reverse psychology mercy (expected roast but got mercy)"
    }

// Other moods use BaseRoastingStrategy with no overrides
```

## State Management

### Dynamic State Updates

#### Base Chance Update (Hourly)
```
if (now - lastBaseChanceUpdate) > ONE_HOUR_MS:
    P_base = MIN_BASE_CHANCE + U(0, 0.5)  // Results in [0.2, 0.7]
    lastBaseChanceUpdate = now
    log("Base roast chance updated to ${P_base * 100}%")
```

#### Mood Rotation
```
moodDuration = U(MIN_MOOD_DURATION_MINUTES, MAX_MOOD_DURATION_MINUTES) × ONE_MINUTE_MS
// Duration ranges from 30-120 minutes

if (now - moodStartTime) > moodDuration:
    moods = ['sleepy', 'caffeinated', 'chaotic', 'reverse_psychology', 'bloodthirsty']
    botMood = moods[floor(U(0, moods.length))]
    moodStartTime = now
    moodCalculator.clearCache()
    log("Bot mood changed to: ${botMood}")
```

#### Chaos Mode Activation
```
// Managed by ChaosEventManager
on each updateChaosMode():
    if chaosMode.active ∧ now > chaosMode.endTime:
        chaosMode.active = false
        log("Chaos mode ended")
    
    if ¬chaosMode.active ∧ U(0,1) < CHAOS_MODE_TRIGGER_CHANCE:  // 0.05
        duration = U(MIN_CHAOS_DURATION_MINUTES, MAX_CHAOS_DURATION_MINUTES)  // 5-30 min
        chaosMode = {
            active: true,
            endTime: now + duration × ONE_MINUTE_MS,
            multiplier: U(MIN_CHAOS_MULTIPLIER, MAX_CHAOS_MULTIPLIER)  // 0.5-2.5
        }
        log("Chaos mode activated for ${duration}min with ${multiplier}x")
```

### Memory and Cache Management

#### Complexity Cache (LRU)
```
cache_key = hash(msgLength, hasQuestion, hasCode)
if cache_hit:
    return cached_value + ε  // Small variance
else:
    calculate and cache (max 100 entries)
```

#### Time Cache
```
if current_hour = cached_hour:
    return cached_modifier
else:
    calculate and update cache
```

#### Mood Cache
```
cache_key = (mood, questionCount)
if cache_hit:
    return cached_value
else:
    calculate and cache (max 20 entries per mood)
```

## Probability Distribution Analysis

### Expected Value Calculations

#### Base Scenario (No Modifiers)
```
E[P_base] = (0.2 + 0.7) / 2 = 0.45
Var[P_base] = (0.7 - 0.2)² / 12 ≈ 0.021
σ[P_base] ≈ 0.144
```

#### Typical User Interaction (q=3, standard message)
```
Assumptions:
- P_base = 0.45 (average)
- q = 3 (mid-conversation)
- Message length = 150 chars with question
- Mood = caffeinated
- Time = 3 PM (normal hours)
- Debt = 0.15 (3 non-roasts)
- Server = normal activity

Calculations:
M₁(3) = 0.25 × 3 + U(0, 0.3) ≈ 0.75 + 0.15 = 0.90
M₂(msg) = 150/100 + 0.05 = 0.15 (capped at 0.3) + 0.05 = 0.20
M₃(15) = 0.00 (normal hours)
M₄(caffeinated, 3) = 0.10 + 0.10 × 3 = 0.40
M₅(0.15) = 0.1 × 0.15 = 0.015
M₆(normal) = 0.00

P(roast) = min(0.45 + 0.90 + 0.20 + 0.00 + 0.40 + 0.015 + 0.00, 0.9)
         = min(1.965, 0.9) = 0.9 (90% chance)
```

### Scenario Examples

#### 1. Night Owl Programmer
```
Context:
- Time: 1 AM (night owl hours)
- Message: 500 chars with code blocks
- q = 5 (persistent user)
- Mood: chaotic
- Debt: 0.25

Calculations:
P_base = 0.45
M₁(5) = 0.25 × 5 + U(0, 0.5) ≈ 1.25 + 0.25 = 1.50
M₂(code) = 0.3 + 0.2 + 0.15 + 0.1 + 0.05 = 0.5 (max)
M₃(1AM) = 0.30 (night owl bonus)
M₄(chaotic) = U(-0.3, 0.3) ≈ 0.0 (average)
M₅(0.25) = 0.1 × 0.25 = 0.025
M₆ = 0.00

P(roast) = min(0.45 + 1.50 + 0.5 + 0.30 + 0.0 + 0.025, 0.9)
         = min(2.775, 0.9) = 0.9

With chaos mode (1.5x): P(roast) = 0.9 × 1.5 = 1.35 → 0.9 (still capped)
```

#### 2. Early Morning First Question
```
Context:
- Time: 6 AM (early bird penalty)
- Message: "How do I install npm?"
- q = 0 (first question)
- Mood: sleepy
- Debt: 0

Calculations:
P_base = 0.3 (lower morning base)
M₁(0) = 0
M₂(simple) = 0.20 + 0.05 = 0.25
M₃(6AM) = -0.10 (early bird penalty)
M₄(sleepy, 0) = -0.20
M₅(0) = 0
M₆ = 0

P(roast) = 0.3 + 0 + 0.25 - 0.10 - 0.20 + 0 + 0
         = 0.25 (25% chance)
```

#### 3. Mercy Kill Scenario
```
Context:
- q = 6 (mercy kill threshold)
- Standard conditions otherwise

Decision flow:
1. Check mercy kill: q ≥ 6 AND U(0,1) < 0.2
2. If triggered: return true (100% roast)
3. Otherwise: continue normal calculation

P(mercy_kill) = 0.2
P(normal_roast | no_mercy) ≈ 0.9 (high due to streak)
P(total_roast) = 0.2 + 0.8 × 0.9 = 0.92 (92% chance)
```

#### 4. Reverse Psychology Edge Case
```
Context:
- Mood: reverse_psychology
- q = 7 (high count)
- Override check: q > 5 AND U(0,1) < 0.4

Decision:
1. Strategy override triggers with 40% chance
2. If triggered: return false (mercy despite high probability)
3. Otherwise: M₄ = -0.40 (penalty for high count)

P(override_mercy) = 0.4
P(roast | no_override) ≈ 0.5 (reduced by -0.40 mood penalty)
P(total_roast) = 0.6 × 0.5 = 0.3 (30% chance)
```

## Performance Optimizations

### Computational Complexity

```
Time Complexity: O(1) for all calculations
Space Complexity: O(n) where n = number of unique users

Cache Performance:
- Complexity: O(1) lookup, O(1) insert with LRU eviction
- Time: O(1) single value cache
- Mood: O(1) lookup, O(1) insert
- Server: O(1) with TTL-based eviction
```

### Cache Hit Ratios

```
Expected hit ratios:
- Complexity cache: ~70% (message patterns repeat)
- Time cache: ~95% (changes hourly)
- Mood cache: ~80% (limited question count range)
- Server cache: ~60% (5-minute TTL)
```

## Implementation Verification

### Unit Test Coverage

Key test scenarios:
1. Probability bounds: P(roast) ∈ [0, P_max]
2. Modifier calculations match formulas
3. Cache behavior and eviction
4. State transitions and timers
5. Override priority order

### Statistical Validation

```python
# Pseudo-code for validation
samples = 10000
results = []
for i in range(samples):
    p = calculate_roast_probability(test_context)
    results.append(p)

assert 0 <= min(results) <= max(results) <= 0.9
assert abs(mean(results) - expected_mean) < 0.05
```

## Configuration Parameters

### Environment Variables
```bash
ROAST_MAX_CHANCE=0.9    # Maximum probability cap
ROAST_COOLDOWN=true     # Enable cooldown system
```

### Tunable Constants
```typescript
// Probability ranges
DEFAULT_BASE_CHANCE: 0.5
MIN_BASE_CHANCE: 0.2
MAX_BASE_CHANCE: 0.7

// Modifier multipliers
EARLY_QUESTIONS_MULTIPLIER: 0.1
MID_STREAK_MULTIPLIER: 0.25
LATE_STREAK_MULTIPLIER: 0.35

// Special events
MERCY_KILL_THRESHOLD: 6
MERCY_KILL_CHANCE: 0.2
CHAOS_MODE_TRIGGER_CHANCE: 0.05
COOLDOWN_BREAK_CHANCE: 0.15
```

## Troubleshooting Guide

### Common Issues

1. **Consistently Low Roasting**
   - Check current mood: `getRoastingState().botMood`
   - Verify base chance: may be at minimum (20%)
   - Confirm cooldown setting: `ROAST_COOLDOWN`

2. **Excessive Roasting**
   - Check for chaos mode: multiplier up to 2.5x
   - Review user debt accumulation
   - Verify mood (bloodthirsty = aggressive)

3. **Unpredictable Behavior**
   - Expected due to randomness in design
   - Chaos mode adds intentional unpredictability
   - Bonus bombs create surprise spikes

### Debug Output Interpretation

The RoastingDecisionEngine logs comprehensive decision analysis:

```
Roast decision for user123: ROAST | Final chance: 78.5% |
Base: 45.0% | Consecutive: +52.5% | Complexity: +15.0% |
Time: +10.0% | Mood (caffeinated): +40.0% | Debt: +5.0% |
Server: +0.0% | Questions: 4 | Chaos: 1.2x
```

#### Log Component Breakdown:
- **Decision**: `ROAST` or `PASS` - final outcome
- **Final chance**: Post-chaos multiplier probability (capped at P_max)
- **Base**: Current base chance (20-70%)
- **Consecutive**: M₁ contribution based on question streak
- **Complexity**: M₂ contribution from message analysis
- **Time**: M₃ time-of-day modifier (can be negative)
- **Mood**: M₄ mood modifier with current mood in parentheses
- **Debt**: M₅ accumulated debt bonus
- **Server**: M₆ server activity influence
- **Questions**: Current consecutive question count
- **Chaos**: Multiplier if active, "OFF" otherwise

#### Example Analysis:
```
// Low probability scenario
Roast decision for user456: PASS | Final chance: 12.5% |
Base: 25.0% | Consecutive: +0.0% | Complexity: +7.5% |
Time: -10.0% | Mood (sleepy): -20.0% | Debt: +0.0% |
Server: +10.0% | Questions: 0 | Chaos: OFF

Interpretation:
- First question (q=0): no consecutive bonus
- Early morning: -10% penalty
- Sleepy mood: significant -20% penalty
- Low base chance: 25%
- Result: Only 12.5% chance, likely to pass
```

## Implementation Architecture

### Class Structure
```
RoastingEngine
├── Calculator Classes (Singleton Pattern)
│   ├── ComplexityCalculator (LRU Cache)
│   ├── TimeCalculator (Single Value Cache)
│   ├── ConsecutiveCalculator (Limited Cache)
│   ├── MoodCalculator (Per-Mood Cache)
│   ├── DebtCalculator (No Cache)
│   └── ServerCalculator (TTL Cache)
├── ChaosEventManager
│   └── Manages chaos state independently
├── RoastingDecisionEngine
│   ├── Strategy Map
│   └── Priority-based decision flow
└── Strategy Implementations
    ├── BaseRoastingStrategy
    ├── ReversePhychologyStrategy (with override)
    └── Other mood strategies (inherit base)
```

### Timer Management
```typescript
// Proper cleanup on shutdown
protected async performShutdown(): Promise<void> {
    for (const timer of this.activeTimers) {
        clearTimeout(timer);
    }
    this.activeTimers.clear();
}
```

## Conclusion

The RoastingEngine probability system represents a sophisticated blend of deterministic calculations and controlled randomness. Key design principles include:

1. **Multi-layered Decision Making**: Six priority levels ensure consistent behavior while allowing for surprises
2. **Mathematical Rigor**: All calculations use well-defined formulas with clear bounds
3. **Performance Optimization**: Strategic caching reduces computational overhead
4. **Psychological Elements**: Cooldown breaking, mercy kills, and reverse psychology add depth
5. **Chaos Integration**: Random events prevent predictability while maintaining control
6. **Comprehensive Logging**: Detailed decision tracking aids debugging and tuning

The system achieves its goal of creating engaging, unpredictable interactions while maintaining performance efficiency and code maintainability through modular architecture and clear separation of concerns.