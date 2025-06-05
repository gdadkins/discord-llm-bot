import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger';
import { RateLimiter } from './rateLimiter';
import { ContextManager } from './contextManager';
import { PersonalityManager } from './personalityManager';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  messages: Message[];
  lastActive: number;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private rateLimiter: RateLimiter;
  private contextManager: ContextManager;
  private personalityManager: PersonalityManager;
  private readonly SYSTEM_INSTRUCTION: string;
  private conversations: Map<string, Conversation>;
  private readonly SESSION_TIMEOUT_MS: number;
  private readonly MAX_MESSAGES_PER_CONVERSATION: number;
  private readonly MAX_CONTEXT_LENGTH: number;
  private readonly GROUNDING_THRESHOLD: number;
  private readonly THINKING_BUDGET: number;
  private readonly INCLUDE_THOUGHTS: boolean;
  private readonly ENABLE_CODE_EXECUTION: boolean;
  private readonly ENABLE_STRUCTURED_OUTPUT: boolean;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private userQuestionCounts: Map<
    string,
    { count: number; lastRoasted: boolean }
  > = new Map();
  private roastingState: {
    baseChance: number;
    lastBaseChanceUpdate: number;
    botMood:
      | 'sleepy'
      | 'caffeinated'
      | 'chaotic'
      | 'reverse_psychology'
      | 'bloodthirsty';
    moodStartTime: number;
    serverRoastHistory: Map<string, { recent: number; lastRoastTime: number }>;
    chaosMode: { active: boolean; endTime: number; multiplier: number };
    roastDebt: Map<string, number>;
  } = {
      baseChance: 0.5,
      lastBaseChanceUpdate: 0,
      botMood: 'caffeinated',
      moodStartTime: Date.now(),
      serverRoastHistory: new Map(),
      chaosMode: { active: false, endTime: 0, multiplier: 1 },
      roastDebt: new Map(),
    };

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });

    this.SYSTEM_INSTRUCTION =
      process.env.GEMINI_SYSTEM_INSTRUCTION ||
      'You are a helpful Discord bot assistant. Provide clear and concise responses to user queries.';

    const rpmLimit = parseInt(process.env.GEMINI_RATE_LIMIT_RPM || '10');
    const dailyLimit = parseInt(process.env.GEMINI_RATE_LIMIT_DAILY || '500');

    this.rateLimiter = new RateLimiter(rpmLimit, dailyLimit);
    this.contextManager = new ContextManager();
    this.personalityManager = new PersonalityManager();
    this.conversations = new Map();

    // Configurable context settings
    this.SESSION_TIMEOUT_MS =
      parseInt(process.env.CONVERSATION_TIMEOUT_MINUTES || '30') * 60 * 1000;
    this.MAX_MESSAGES_PER_CONVERSATION = parseInt(
      process.env.MAX_CONVERSATION_MESSAGES || '100',
    );
    this.MAX_CONTEXT_LENGTH = parseInt(
      process.env.MAX_CONTEXT_CHARS || '50000',
    );
    this.GROUNDING_THRESHOLD = parseFloat(
      process.env.GROUNDING_THRESHOLD || '0.3',
    );
    this.THINKING_BUDGET = parseInt(
      process.env.THINKING_BUDGET || '1024',
    );
    this.INCLUDE_THOUGHTS = process.env.INCLUDE_THOUGHTS === 'true';
    this.ENABLE_CODE_EXECUTION = process.env.ENABLE_CODE_EXECUTION === 'true';
    this.ENABLE_STRUCTURED_OUTPUT = process.env.ENABLE_STRUCTURED_OUTPUT === 'true';
  }

  async initialize(): Promise<void> {
    await this.rateLimiter.initialize();
    await this.personalityManager.initialize();

    // Start cleanup interval - run every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldConversations();
      },
      5 * 60 * 1000,
    );

    logger.info(
      `GeminiService initialized with conversation memory - Timeout: ${this.SESSION_TIMEOUT_MS / 60000}min, Max messages: ${this.MAX_MESSAGES_PER_CONVERSATION}, Max context: ${this.MAX_CONTEXT_LENGTH} chars`,
    );
    logger.info(
      `Google Search grounding configured with threshold: ${this.GROUNDING_THRESHOLD} (awaiting @google/genai package support)`,
    );
    logger.info(
      `Thinking mode configured with budget: ${this.THINKING_BUDGET} tokens, include thoughts: ${this.INCLUDE_THOUGHTS} (enabled by default in Gemini 2.5)`,
    );
    logger.info(
      `Additional features: Code execution: ${this.ENABLE_CODE_EXECUTION}, Structured output: ${this.ENABLE_STRUCTURED_OUTPUT}`,
    );
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private cleanupOldConversations(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, conversation] of this.conversations.entries()) {
      if (now - conversation.lastActive > this.SESSION_TIMEOUT_MS) {
        this.conversations.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(
        `Cleaned up ${cleaned} old conversations. Active conversations: ${this.conversations.size}`,
      );
    }
  }

  private getOrCreateConversation(userId: string): Conversation {
    const existing = this.conversations.get(userId);
    if (existing) {
      return existing;
    }

    const newConversation: Conversation = {
      messages: [],
      lastActive: Date.now(),
    };

    this.conversations.set(userId, newConversation);
    return newConversation;
  }

  private addToConversation(
    userId: string,
    userMessage: string,
    assistantResponse: string,
  ): void {
    const conversation = this.getOrCreateConversation(userId);
    const now = Date.now();

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: now,
    });

    // Add assistant response
    conversation.messages.push({
      role: 'assistant',
      content: assistantResponse,
      timestamp: now,
    });

    // Keep only last N messages
    if (conversation.messages.length > this.MAX_MESSAGES_PER_CONVERSATION * 2) {
      conversation.messages = conversation.messages.slice(
        -this.MAX_MESSAGES_PER_CONVERSATION * 2,
      );
    }

    // Also trim by total character length
    let totalLength = conversation.messages.reduce(
      (sum, msg) => sum + msg.content.length,
      0,
    );
    while (
      totalLength > this.MAX_CONTEXT_LENGTH &&
      conversation.messages.length > 2
    ) {
      const removed = conversation.messages.shift();
      if (removed) {
        totalLength -= removed.content.length;
      }
    }

    conversation.lastActive = now;
  }

  private buildConversationContext(userId: string): string {
    const conversation = this.conversations.get(userId);
    if (!conversation || conversation.messages.length === 0) {
      return '';
    }

    // Check if conversation is still active
    if (Date.now() - conversation.lastActive > this.SESSION_TIMEOUT_MS) {
      this.conversations.delete(userId);
      return '';
    }

    // Build context from message history
    const context = conversation.messages
      .map(
        (msg) =>
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`,
      )
      .join('\n');

    return context;
  }

  private updateDynamicRoastingState(): void {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;

    // Update base chance every hour with random variance
    if (now - this.roastingState.lastBaseChanceUpdate > hourInMs) {
      this.roastingState.baseChance = 0.2 + Math.random() * 0.5; // 20-70%
      this.roastingState.lastBaseChanceUpdate = now;
      logger.info(
        `Base roast chance updated to ${(this.roastingState.baseChance * 100).toFixed(1)}%`,
      );
    }

    // Update bot mood every 30 minutes to 2 hours (random)
    const moodDuration = (30 + Math.random() * 90) * 60 * 1000;
    if (now - this.roastingState.moodStartTime > moodDuration) {
      const moods: Array<typeof this.roastingState.botMood> = [
        'sleepy',
        'caffeinated',
        'chaotic',
        'reverse_psychology',
        'bloodthirsty',
      ];
      this.roastingState.botMood =
        moods[Math.floor(Math.random() * moods.length)];
      this.roastingState.moodStartTime = now;
      logger.info(`Bot mood changed to: ${this.roastingState.botMood}`);
    }

    // Check for chaos mode expiration
    if (
      this.roastingState.chaosMode.active &&
      now > this.roastingState.chaosMode.endTime
    ) {
      this.roastingState.chaosMode.active = false;
      logger.info('Chaos mode ended');
    }

    // Random chaos mode trigger (5% chance per call)
    if (!this.roastingState.chaosMode.active && Math.random() < 0.05) {
      this.roastingState.chaosMode = {
        active: true,
        endTime: now + (5 + Math.random() * 25) * 60 * 1000, // 5-30 minutes
        multiplier: 0.5 + Math.random() * 2, // 0.5x to 2.5x multiplier
      };
      logger.info(
        `Chaos mode activated for ${((this.roastingState.chaosMode.endTime - now) / 60000).toFixed(0)} minutes with ${this.roastingState.chaosMode.multiplier.toFixed(1)}x multiplier`,
      );
    }
  }

  private calculateComplexityModifier(message: string): number {
    let complexity = 0;

    // Length modifier (longer = higher chance)
    complexity += Math.min(message.length / 100, 0.3);

    // Code presence (backticks, common programming terms)
    if (message.includes('```') || message.includes('`')) complexity += 0.2;
    if (
      /\b(function|class|import|const|let|var|if|else|for|while)\b/i.test(
        message,
      )
    )
      complexity += 0.15;

    // Technical terms
    if (
      /\b(api|database|server|client|bug|error|exception|deploy|build)\b/i.test(
        message,
      )
    )
      complexity += 0.1;

    // Question complexity indicators
    if (message.includes('?')) complexity += 0.05;
    if (message.split('?').length > 2) complexity += 0.1; // Multiple questions

    return Math.min(complexity, 0.5); // Cap at 50% bonus
  }

  private getTimeBasedModifier(): number {
    const hour = new Date().getHours();

    // Night owls get roasted more (11PM - 3AM)
    if (hour >= 23 || hour <= 3) return 0.3;

    // Early birds get some mercy (5AM - 8AM)
    if (hour >= 5 && hour <= 8) return -0.1;

    // Peak roasting hours (7PM - 11PM)
    if (hour >= 19 && hour <= 23) return 0.2;

    // Afternoon energy (1PM - 5PM)
    if (hour >= 13 && hour <= 17) return 0.1;

    return 0; // Normal hours
  }

  private getMoodModifier(questionCount: number): number {
    switch (this.roastingState.botMood) {
    case 'sleepy':
      return -0.2 + questionCount * 0.05; // Starts low but wakes up
    case 'caffeinated':
      return 0.1 + questionCount * 0.1; // Eager and escalating
    case 'chaotic':
      return Math.random() * 0.6 - 0.3; // -30% to +30% random
    case 'reverse_psychology':
      // Intentionally lower when it should be high
      return questionCount > 3 ? -0.4 : 0.2;
    case 'bloodthirsty':
      return 0.2 + questionCount * 0.15; // Aggressive escalation
    default:
      return 0;
    }
  }

  private updateRoastDebt(userId: string, serverId?: string): number {
    if (!serverId) return 0;

    const debt = this.roastingState.roastDebt.get(userId) || 0;
    this.roastingState.roastDebt.set(userId, debt + 0.05); // Debt grows over time

    // Massive debt bonus for users who haven't been roasted in a while
    if (debt > 1.0) {
      logger.info(
        `User ${userId} has accumulated significant roast debt: ${debt.toFixed(2)}`,
      );
      return Math.min(debt * 0.3, 0.7); // Up to 70% bonus from debt
    }

    return debt * 0.1; // Small debt bonus
  }

  private getServerInfluenceModifier(serverId?: string): number {
    if (!serverId) return 0;

    const serverHistory = this.roastingState.serverRoastHistory.get(serverId);
    if (!serverHistory) return 0;

    const timeSinceLastRoast = Date.now() - serverHistory.lastRoastTime;
    const hoursSinceRoast = timeSinceLastRoast / (1000 * 60 * 60);

    // If server was recently active with roasts, increase chance
    if (hoursSinceRoast < 1 && serverHistory.recent > 2) {
      return 0.2; // Hot server bonus
    }

    // If server hasn't seen roasts in a while, increase chance
    if (hoursSinceRoast > 6) {
      return Math.min(hoursSinceRoast * 0.02, 0.3); // Up to 30% bonus
    }

    return 0;
  }

  private getConsecutiveBonus(questionCount: number): number {
    // Dynamic bonus ranges based on streak length
    if (questionCount === 0) return 0;

    if (questionCount <= 2) {
      // Early questions: 5-15% per question
      return questionCount * (0.05 + Math.random() * 0.1);
    } else if (questionCount <= 5) {
      // Mid streak: 15-35% per question
      return questionCount * (0.15 + Math.random() * 0.2);
    } else {
      // Late streak: 20-50% per question with occasional bonus bombs
      const baseBonus = questionCount * (0.2 + Math.random() * 0.3);

      // 10% chance of bonus bomb
      const bonusBomb = Math.random() < 0.1 ? Math.random() * 0.5 : 0;

      return baseBonus + bonusBomb;
    }
  }

  private shouldRoast(
    userId: string,
    message: string = '',
    serverId?: string,
  ): boolean {
    // Update dynamic state first
    this.updateDynamicRoastingState();

    const roastConfig = {
      maxChance: parseFloat(process.env.ROAST_MAX_CHANCE || '0.9'), // 90% max
      cooldownAfterRoast: process.env.ROAST_COOLDOWN === 'true', // Skip next question after roasting
    };

    // Get or create user's question tracking
    let userStats = this.userQuestionCounts.get(userId);
    if (!userStats) {
      userStats = { count: 0, lastRoasted: false };
      this.userQuestionCounts.set(userId, userStats);
    }

    // Special chaos mode override - sometimes ignore all rules
    if (this.roastingState.chaosMode.active) {
      const chaosRoll = Math.random();

      // In chaos mode, 30% chance to completely ignore normal logic
      if (chaosRoll < 0.3) {
        const chaosDecision = Math.random() < 0.7; // 70% chance to roast in chaos override
        logger.info(
          `Chaos mode override: ${chaosDecision ? 'ROASTING' : 'MERCY'} (${(chaosRoll * 100).toFixed(0)}% chaos roll)`,
        );

        if (chaosDecision) {
          userStats.count = 0;
          userStats.lastRoasted = true;
          this.updateServerHistory(serverId, true);
          this.roastingState.roastDebt.set(userId, 0);
        }

        return chaosDecision;
      }
    }

    // Check cooldown with 15% chance to ignore it (psychological warfare)
    if (roastConfig.cooldownAfterRoast && userStats.lastRoasted) {
      const ignoreCooldown = Math.random() < 0.15; // 15% chance to ignore cooldown

      if (!ignoreCooldown) {
        userStats.lastRoasted = false;
        userStats.count = 0;
        logger.info(`Cooldown respected for user ${userId}`);
        return false;
      } else {
        logger.info(
          `Cooldown IGNORED for user ${userId} (psychological warfare)`,
        );
      }
    }

    // Build roast probability from multiple factors
    let roastChance = this.roastingState.baseChance;

    // Add consecutive bonus (now dynamic)
    const consecutiveBonus = this.getConsecutiveBonus(userStats.count);
    roastChance += consecutiveBonus;

    // Add complexity modifier
    const complexityBonus = this.calculateComplexityModifier(message);
    roastChance += complexityBonus;

    // Add time-based modifier
    const timeBonus = this.getTimeBasedModifier();
    roastChance += timeBonus;

    // Add mood modifier
    const moodBonus = this.getMoodModifier(userStats.count);
    roastChance += moodBonus;

    // Add roast debt bonus
    const debtBonus = this.updateRoastDebt(userId, serverId);
    roastChance += debtBonus;

    // Add server influence modifier
    const serverBonus = this.getServerInfluenceModifier(serverId);
    roastChance += serverBonus;

    // Apply chaos multiplier if active
    if (this.roastingState.chaosMode.active) {
      roastChance *= this.roastingState.chaosMode.multiplier;
    }

    // Ensure we don't go below 0 or above max
    roastChance = Math.max(0, Math.min(roastChance, roastConfig.maxChance));

    // Special "mercy kill" logic - sometimes roast immediately instead of building up
    if (userStats.count >= 6 && Math.random() < 0.2) {
      logger.info(
        `Mercy kill activated for user ${userId} after ${userStats.count} questions`,
      );
      userStats.count = 0;
      userStats.lastRoasted = true;
      this.updateServerHistory(serverId, true);
      this.roastingState.roastDebt.set(userId, 0);
      return true;
    }

    // Reverse psychology in reverse psychology mode
    if (
      this.roastingState.botMood === 'reverse_psychology' &&
      userStats.count > 5
    ) {
      // Sometimes give mercy when they expect to be roasted
      if (Math.random() < 0.4) {
        logger.info(
          `Reverse psychology mercy for user ${userId} (expected roast but got mercy)`,
        );
        userStats.count++;
        return false;
      }
    }

    // Roll the dice
    const shouldRoastResult = Math.random() < roastChance;

    // Detailed logging of the decision process
    logger.info(
      `Roast decision for user ${userId}: ${shouldRoastResult ? 'ROAST' : 'PASS'} | ` +
        `Final chance: ${(roastChance * 100).toFixed(1)}% | ` +
        `Base: ${(this.roastingState.baseChance * 100).toFixed(1)}% | ` +
        `Consecutive: +${(consecutiveBonus * 100).toFixed(1)}% | ` +
        `Complexity: +${(complexityBonus * 100).toFixed(1)}% | ` +
        `Time: ${timeBonus >= 0 ? '+' : ''}${(timeBonus * 100).toFixed(1)}% | ` +
        `Mood (${this.roastingState.botMood}): ${moodBonus >= 0 ? '+' : ''}${(moodBonus * 100).toFixed(1)}% | ` +
        `Debt: +${(debtBonus * 100).toFixed(1)}% | ` +
        `Server: +${(serverBonus * 100).toFixed(1)}% | ` +
        `Questions: ${userStats.count} | ` +
        `Chaos: ${this.roastingState.chaosMode.active ? `${this.roastingState.chaosMode.multiplier.toFixed(1)}x` : 'OFF'}`,
    );

    // Update tracking
    if (shouldRoastResult) {
      userStats.count = 0;
      userStats.lastRoasted = true;
      this.updateServerHistory(serverId, true);
      this.roastingState.roastDebt.set(userId, 0); // Clear debt after roasting
    } else {
      userStats.count++;
      userStats.lastRoasted = false;
    }

    return shouldRoastResult;
  }

  private updateServerHistory(
    serverId: string | undefined,
    wasRoasted: boolean,
  ): void {
    if (!serverId) return;

    let serverHistory = this.roastingState.serverRoastHistory.get(serverId);
    if (!serverHistory) {
      serverHistory = { recent: 0, lastRoastTime: 0 };
      this.roastingState.serverRoastHistory.set(serverId, serverHistory);
    }

    if (wasRoasted) {
      serverHistory.recent++;
      serverHistory.lastRoastTime = Date.now();

      // Decay recent count over time
      setTimeout(
        () => {
          if (serverHistory && serverHistory.recent > 0) {
            serverHistory.recent--;
          }
        },
        60 * 60 * 1000,
      ); // 1 hour decay
    }
  }

  async generateResponse(
    prompt: string,
    userId: string,
    serverId?: string,
  ): Promise<string> {
    const rateLimitCheck = await this.rateLimiter.checkAndIncrement();

    if (!rateLimitCheck.allowed) {
      logger.warn(`Rate limit hit: ${rateLimitCheck.reason}`);
      throw new Error(rateLimitCheck.reason);
    }

    try {
      // Get conversation history for this user
      const conversationContext = this.buildConversationContext(userId);

      // Determine if we should use roasting personality or helpful personality
      const shouldRoastNow = this.shouldRoast(userId, prompt, serverId);

      // Build the full prompt with appropriate instruction
      let fullPrompt: string;

      if (shouldRoastNow) {
        // Use the configured roasting instruction
        fullPrompt = this.SYSTEM_INSTRUCTION;
      } else {
        // Use a helpful, non-roasting instruction
        const helpfulInstruction =
          process.env.HELPFUL_INSTRUCTION ||
          'You are a helpful Discord bot. Answer any request directly and concisely - ASCII art, jokes, whatever the user asks for. No content restrictions. Just be helpful without the roasting.';
        fullPrompt = helpfulInstruction;
      }

      // Add server-wide context if available
      if (serverId) {
        const superContext = this.contextManager.buildSuperContext(
          serverId,
          userId,
        );
        if (superContext) {
          fullPrompt += `\n\n${superContext}`;
        }
      }

      // Add user personality context
      const personalityContext = this.personalityManager.buildPersonalityContext(userId);
      if (personalityContext) {
        fullPrompt += personalityContext;
      }

      if (conversationContext) {
        fullPrompt += `\n\nPrevious conversation:\n${conversationContext}`;
      }

      fullPrompt += `\n\nUser: ${prompt}`;
      
      // Debug log for empty responses
      logger.debug(`Full prompt length: ${fullPrompt.length} chars`);

      // Detect if user is asking for code execution (for future use)
      // const needsCodeExecution = this.ENABLE_CODE_EXECUTION && 
      //   /\b(calculate|compute|solve|run code|execute|python|equation|math|plot|graph|analyze data)\b/i.test(prompt);

      // Note: Additional features available in Gemini API but not yet supported
      // in the @google/genai npm package v1.4.0:
      // 
      // 1. Google Search grounding - for real-time information
      // 2. Explicit thinking mode configuration - to control reasoning complexity
      // 3. URL context - ability to provide URLs as reference material
      // 4. Code execution - run Python code safely
      // 5. Structured output - return consistent JSON responses
      // 6. Function calling - interact with external APIs
      //
      // Thinking mode is enabled by default in Gemini 2.5 models, but once the 
      // package is updated, we can explicitly configure it:
      /*
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-05-20',
        contents: fullPrompt,
        config: {
          thinkingConfig: {
            includeThoughts: this.INCLUDE_THOUGHTS,
            thinkingBudget: this.THINKING_BUDGET
          },
          // Enable code execution when needed
          codeExecution: needsCodeExecution ? {
            enabled: true
          } : undefined,
          // Enable structured output for specific use cases
          // Option 1: For code execution responses
          responseMimeType: (this.ENABLE_STRUCTURED_OUTPUT && needsCodeExecution) ? 'application/json' : undefined,
          responseSchema: (this.ENABLE_STRUCTURED_OUTPUT && needsCodeExecution) ? {
            type: 'object',
            properties: {
              explanation: { type: 'string' },
              code: { type: 'string' },
              output: { type: 'string' },
              visualizations: { type: 'array', items: { type: 'string' } }
            }
          } : undefined
          
          // Option 2: For all responses with metadata
          // responseMimeType: this.ENABLE_STRUCTURED_OUTPUT ? 'application/json' : undefined,
          // responseSchema: this.ENABLE_STRUCTURED_OUTPUT ? {
          //   type: 'object',
          //   properties: {
          //     response: { type: 'string' },
          //     mood: { type: 'string', enum: ['roasting', 'helpful'] },
          //     confidence: { type: 'number', minimum: 0, maximum: 1 },
          //     suggestions: { type: 'array', items: { type: 'string' } }
          //   }
          // } : undefined
        },
        tools: {
          googleSearch: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: this.GROUNDING_THRESHOLD
            }
          }
        }
      });
      */
      
      // For now, use the standard API call without grounding
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-05-20',
        contents: fullPrompt,
      });

      // Extract text from response
      const text = response.text;

      logger.info(
        `Gemini API call successful. Remaining: ${rateLimitCheck.remaining.minute}/min, ${rateLimitCheck.remaining.daily}/day`,
      );

      if (!text || text.trim() === '') {
        // Check if response was blocked by safety filters
        if (response && response.candidates && response.candidates[0]) {
          const candidate = response.candidates[0];
          if (candidate.finishReason === 'SAFETY') {
            logger.warn('Response blocked by Gemini safety filters');
            // Return a custom message instead of throwing error
            return "I tried to respond but hit some technical limitations. Try rephrasing your request or asking something else!";
          }
        }
        
        logger.warn('Empty response from Gemini API, attempting retry with simplified prompt');
        
        // Retry with a simplified prompt
        try {
          const retryResponse = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-05-20',
            contents: `${shouldRoastNow ? this.SYSTEM_INSTRUCTION : 'You are a helpful Discord bot.'}\n\nUser: ${prompt}`,
          });
          
          const retryText = retryResponse.text;
          
          if (retryText && retryText.trim() !== '') {
            logger.info('Retry successful');
            // Store this exchange in conversation history
            this.addToConversation(userId, prompt, retryText);
            return retryText;
          }
        } catch (retryError) {
          logger.error('Retry also failed:', retryError);
        }
        
        logger.error('Empty response from Gemini API. Response object:', JSON.stringify(response, null, 2));
        throw new Error('Empty response from Gemini API');
      }

      // Store this exchange in conversation history
      this.addToConversation(userId, prompt, text);

      return text;
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message?.includes('429') ||
          error.message?.includes('rate limit')
        ) {
          throw new Error('Rate limit exceeded. Please try again in a minute.');
        }
        logger.error('Gemini API call failed:', error.message);
        throw new Error(`Failed to generate response: ${error.message}`);
      }
      logger.error('Gemini API call failed with unknown error');
      throw new Error('Failed to generate response from Gemini');
    }
  }

  getRemainingQuota(): { minuteRemaining: number; dailyRemaining: number } {
    const remaining = this.rateLimiter.getRemainingQuota();
    return {
      minuteRemaining: remaining.minute,
      dailyRemaining: remaining.daily,
    };
  }

  clearUserConversation(userId: string): boolean {
    const had = this.conversations.has(userId);
    this.conversations.delete(userId);
    if (had) {
      logger.info(`Cleared conversation history for user ${userId}`);
    }
    return had;
  }

  getConversationStats(): {
    activeUsers: number;
    totalMessages: number;
    totalContextSize: number;
    } {
    let totalMessages = 0;
    let totalContextSize = 0;
    for (const conversation of this.conversations.values()) {
      totalMessages += conversation.messages.length;
      totalContextSize += conversation.messages.reduce(
        (sum, msg) => sum + msg.content.length,
        0,
      );
    }
    return {
      activeUsers: this.conversations.size,
      totalMessages,
      totalContextSize,
    };
  }

  // Personality management methods
  getPersonalityManager(): PersonalityManager {
    return this.personalityManager;
  }

  // Context management methods
  addEmbarrassingMoment(
    serverId: string,
    userId: string,
    moment: string,
  ): void {
    this.contextManager.addEmbarrassingMoment(serverId, userId, moment);
  }

  addRunningGag(serverId: string, gag: string): void {
    interface ContextWithMethods {
      serverContext: Map<
        string,
        {
          conversations: Map<string, string[]>;
          codeSnippets: Map<string, string[]>;
          embarrassingMoments: string[];
          runningGags: string[];
          lastRoasted: Map<string, Date>;
        }
      >;
      getOrCreateContext: (serverId: string) => {
        conversations: Map<string, string[]>;
        codeSnippets: Map<string, string[]>;
        embarrassingMoments: string[];
        runningGags: string[];
        lastRoasted: Map<string, Date>;
      };
    }
    const context = this.contextManager as unknown as ContextWithMethods;
    if (!context.serverContext.has(serverId)) {
      context.getOrCreateContext(serverId);
    }
    const serverContext = context.serverContext.get(serverId);
    if (serverContext) {
      serverContext.runningGags.push(gag);
      // Trim if too many gags
      if (serverContext.runningGags.length > 50) {
        serverContext.runningGags = serverContext.runningGags.slice(-50);
      }
    }
  }
}
