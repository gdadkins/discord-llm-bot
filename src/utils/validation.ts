/**
 * Validation Utility Library
 * 
 * Provides chainable validation utilities with fluent API to eliminate
 * validation code duplication across services.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  value?: unknown;
}

export interface ValidationRule<T> {
  test: (value: T) => boolean;
  message: string;
}

/**
 * Chainable validation builder with fluent API
 */
export class ValidationBuilder<T = unknown> {
  private rules: ValidationRule<T>[] = [];
  private currentValue: T;
  private fieldName: string;

  constructor(value: T, fieldName: string = 'value') {
    this.currentValue = value;
    this.fieldName = fieldName;
  }

  /**
   * Validates that value is required (not null, undefined, or empty string)
   */
  required(message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string' && value.trim().length === 0) return false;
        return true;
      },
      message: message || `Please provide a value for ${this.fieldName}`
    });
    return this;
  }

  /**
   * Validates that value is a string
   */
  isString(message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => typeof value === 'string',
      message: message || `${this.fieldName} must be text, not ${typeof this.currentValue}`
    });
    return this;
  }

  /**
   * Validates that value is a number
   */
  isNumber(message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => typeof value === 'number' && !isNaN(value as number),
      message: message || `${this.fieldName} must be a valid number, not '${this.currentValue}'`
    });
    return this;
  }

  /**
   * Validates that value is a boolean
   */
  isBoolean(message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => typeof value === 'boolean',
      message: message || `${this.fieldName} must be a boolean`
    });
    return this;
  }

  /**
   * Validates string length constraints
   */
  stringLength(min?: number, max?: number, message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (typeof value !== 'string') return false;
        const length = value.length;
        if (min !== undefined && length < min) return false;
        if (max !== undefined && length > max) return false;
        return true;
      },
      message: message || this.buildLengthMessage(min, max)
    });
    return this;
  }

  /**
   * Validates numeric range constraints
   */
  numberRange(min?: number, max?: number, message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (typeof value !== 'number') return false;
        if (min !== undefined && value < min) return false;
        if (max !== undefined && value > max) return false;
        return true;
      },
      message: message || this.buildRangeMessage(min, max)
    });
    return this;
  }

  /**
   * Validates that value matches a regular expression
   */
  matches(pattern: RegExp, message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (typeof value !== 'string') return false;
        return pattern.test(value);
      },
      message: message || `${this.fieldName} format is invalid. Please check the expected format and try again.`
    });
    return this;
  }

  /**
   * Validates that value is one of allowed values
   */
  oneOf(allowedValues: T[], message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => allowedValues.includes(value),
      message: message || `${this.fieldName} must be one of these options: ${allowedValues.join(', ')}`
    });
    return this;
  }

  /**
   * Validates array constraints
   */
  isArray(minLength?: number, maxLength?: number, message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (!Array.isArray(value)) return false;
        if (minLength !== undefined && value.length < minLength) return false;
        if (maxLength !== undefined && value.length > maxLength) return false;
        return true;
      },
      message: message || this.buildArrayMessage(minLength, maxLength)
    });
    return this;
  }

  /**
   * Validates using a custom function
   */
  custom(testFn: (value: T) => boolean, message: string): ValidationBuilder<T> {
    this.rules.push({
      test: testFn,
      message
    });
    return this;
  }

  /**
   * Validates that string is not empty after trimming
   */
  notEmpty(message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (typeof value !== 'string') return false;
        return value.trim().length > 0;
      },
      message: message || `${this.fieldName} cannot be empty. Please provide some content.`
    });
    return this;
  }

  /**
   * Validates environment variable format
   */
  isEnvironmentVar(message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (typeof value !== 'string') return false;
        return /^[A-Z][A-Z0-9_]*$/.test(value);
      },
      message: message || `${this.fieldName} must be a valid environment variable name (use UPPERCASE letters, numbers, and underscores only)`
    });
    return this;
  }

  /**
   * Validates URL format
   */
  isUrl(message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (typeof value !== 'string') return false;
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      message: message || `${this.fieldName} must be a valid URL (starting with http:// or https://)`
    });
    return this;
  }

  /**
   * Validates Discord snowflake ID format (17-19 digits)
   */
  isDiscordId(message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (typeof value !== 'string') return false;
        return /^\d{17,19}$/.test(value);
      },
      message: message || `${this.fieldName} must be a valid Discord ID (17-19 digits)`
    });
    return this;
  }

  /**
   * Validates image file size (for multimodal processing)
   */
  isValidImageSize(maxSizeMB: number = 20, message?: string): ValidationBuilder<T> {
    this.rules.push({
      test: (value: T) => {
        if (typeof value !== 'number') return false;
        return value <= maxSizeMB * 1024 * 1024;
      },
      message: message || `Image file size must be under ${maxSizeMB}MB. Please use a smaller image.`
    });
    return this;
  }

  /**
   * Validates supported image MIME types
   */
  isSupportedImageType(message?: string): ValidationBuilder<T> {
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    this.rules.push({
      test: (value: T) => {
        if (typeof value !== 'string') return false;
        return supportedTypes.includes(value.toLowerCase());
      },
      message: message || 'Image format must be JPEG, PNG, or WebP. GIF files are not supported.'
    });
    return this;
  }

  /**
   * Executes all validation rules and returns result
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    for (const rule of this.rules) {
      if (!rule.test(this.currentValue)) {
        errors.push(rule.message);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      value: this.currentValue
    };
  }

  private buildLengthMessage(min?: number, max?: number): string {
    if (min !== undefined && max !== undefined) {
      return `${this.fieldName} must be between ${min} and ${max} characters`;
    } else if (min !== undefined) {
      return `${this.fieldName} must be at least ${min} characters`;
    } else if (max !== undefined) {
      return `${this.fieldName} must be at most ${max} characters`;
    }
    return `${this.fieldName} length is invalid`;
  }

  private buildRangeMessage(min?: number, max?: number): string {
    if (min !== undefined && max !== undefined) {
      return `${this.fieldName} must be between ${min} and ${max}`;
    } else if (min !== undefined) {
      return `${this.fieldName} must be at least ${min}`;
    } else if (max !== undefined) {
      return `${this.fieldName} must be at most ${max}`;
    }
    return `${this.fieldName} is out of range`;
  }

  private buildArrayMessage(min?: number, max?: number): string {
    if (min !== undefined && max !== undefined) {
      return `${this.fieldName} must contain between ${min} and ${max} items`;
    } else if (min !== undefined) {
      return `${this.fieldName} must contain at least ${min} items`;
    } else if (max !== undefined) {
      return `${this.fieldName} must contain at most ${max} items`;
    }
    return `${this.fieldName} must be an array`;
  }
}

/**
 * Creates a new validation builder for a value
 */
export function validate<T>(value: T, fieldName?: string): ValidationBuilder<T> {
  return new ValidationBuilder(value, fieldName);
}

/**
 * Configuration-specific validators
 */
export class ConfigValidators {
  /**
   * Validates Discord intent strings
   */
  static discordIntent(value: string): ValidationResult {
    const validIntents = [
      'Guilds', 'GuildMembers', 'GuildBans', 'GuildEmojisAndStickers',
      'GuildIntegrations', 'GuildWebhooks', 'GuildInvites', 'GuildVoiceStates',
      'GuildPresences', 'GuildMessages', 'GuildMessageReactions', 'GuildMessageTyping',
      'DirectMessages', 'DirectMessageReactions', 'DirectMessageTyping',
      'MessageContent', 'GuildScheduledEvents', 'AutoModerationConfiguration',
      'AutoModerationExecution'
    ];

    return validate(value, 'Discord intent')
      .isString()
      .oneOf(validIntents)
      .validate();
  }

  /**
   * Validates Gemini model names
   */
  static geminiModel(value: string): ValidationResult {
    const validModels = [
      'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro',
      'gemini-1.5-pro-002', 'gemini-1.5-flash-002'
    ];

    return validate(value, 'Gemini model')
      .isString()
      .oneOf(validModels)
      .validate();
  }

  /**
   * Validates safety setting levels
   */
  static safetyLevel(value: string): ValidationResult {
    const validLevels = [
      'block_none', 'block_low_and_above', 
      'block_medium_and_above', 'block_high'
    ];

    return validate(value, 'Safety level')
      .isString()
      .oneOf(validLevels)
      .validate();
  }

  /**
   * Validates temperature values
   */
  static temperature(value: number): ValidationResult {
    return validate(value, 'Temperature')
      .isNumber()
      .numberRange(0, 2)
      .validate();
  }

  /**
   * Validates topK values
   */
  static topK(value: number): ValidationResult {
    return validate(value, 'TopK')
      .isNumber()
      .numberRange(1, 40)
      .validate();
  }

  /**
   * Validates topP values
   */
  static topP(value: number): ValidationResult {
    return validate(value, 'TopP')
      .isNumber()
      .numberRange(0, 1)
      .validate();
  }
}

/**
 * Personality-specific validators
 */
export class PersonalityValidators {
  /**
   * Validates personality description
   */
  static description(value: string, maxLength: number = 500): ValidationResult {
    return validate(value, 'Description')
      .isString()
      .notEmpty()
      .stringLength(1, maxLength)
      .validate();
  }

  /**
   * Validates personality trait name
   */
  static traitName(value: string): ValidationResult {
    return validate(value, 'Trait name')
      .isString()
      .notEmpty()
      .stringLength(1, 50)
      .matches(/^[a-zA-Z0-9_\-\s]+$/, 'Trait name can only contain letters, numbers, spaces, hyphens, and underscores')
      .validate();
  }

  /**
   * Validates personality trait value
   */
  static traitValue(value: string): ValidationResult {
    return validate(value, 'Trait value')
      .isString()
      .notEmpty()
      .stringLength(1, 200)
      .validate();
  }
}

/**
 * Batch validation for multiple fields
 */
export class BatchValidator {
  private validations: Array<{ name: string; result: ValidationResult }> = [];

  /**
   * Add a validation to the batch
   */
  add(name: string, result: ValidationResult): BatchValidator {
    this.validations.push({ name, result });
    return this;
  }

  /**
   * Validate multiple fields and return combined result
   */
  validateAll(): ValidationResult {
    const errors: string[] = [];
    let allValid = true;

    for (const validation of this.validations) {
      if (!validation.result.valid) {
        allValid = false;
        errors.push(...validation.result.errors.map(error => `${validation.name}: ${error}`));
      }
    }

    return {
      valid: allValid,
      errors
    };
  }
}

/**
 * Creates a new batch validator
 */
export function batchValidate(): BatchValidator {
  return new BatchValidator();
}

/**
 * Discord mention parsing utilities
 */
export class DiscordMentionParser {
  /**
   * Regular expression pattern for Discord user mentions
   * Matches <@12345678901234567> or <@!12345678901234567>
   */
  static readonly USER_MENTION_PATTERN = /<@!?(\d{17,19})>/g;

  /**
   * Regular expression pattern for Discord role mentions
   * Matches <@&12345678901234567>
   */
  static readonly ROLE_MENTION_PATTERN = /<@&(\d{17,19})>/g;

  /**
   * Regular expression pattern for Discord channel mentions
   * Matches <#12345678901234567>
   */
  static readonly CHANNEL_MENTION_PATTERN = /<#(\d{17,19})>/g;

  /**
   * Extract user IDs from mentions in a message
   * @param message The message content to parse
   * @returns Array of user IDs found in the message
   */
  static extractUserIds(message: string): string[] {
    const userIds: string[] = [];
    const matches = message.matchAll(this.USER_MENTION_PATTERN);
    
    for (const match of matches) {
      if (match[1]) {
        userIds.push(match[1]);
      }
    }
    
    return [...new Set(userIds)]; // Remove duplicates
  }

  /**
   * Extract the first user ID from mentions in a message
   * @param message The message content to parse
   * @returns The first user ID found, or null if none
   */
  static extractFirstUserId(message: string): string | null {
    const match = this.USER_MENTION_PATTERN.exec(message);
    this.USER_MENTION_PATTERN.lastIndex = 0; // Reset regex state
    return match?.[1] || null;
  }

  /**
   * Check if a message contains a specific user mention
   * @param message The message content to check
   * @param userId The user ID to look for
   * @returns True if the user is mentioned
   */
  static containsUserMention(message: string, userId: string): boolean {
    const userIds = this.extractUserIds(message);
    return userIds.includes(userId);
  }

  /**
   * Remove all user mentions from a message
   * @param message The message content to clean
   * @returns Message with user mentions removed
   */
  static removeUserMentions(message: string): string {
    return message.replace(this.USER_MENTION_PATTERN, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Replace user mentions with usernames
   * @param message The message content
   * @param userMap Map of user IDs to usernames
   * @returns Message with mentions replaced by usernames
   */
  static replaceUserMentions(message: string, userMap: Map<string, string>): string {
    return message.replace(this.USER_MENTION_PATTERN, (match, userId) => {
      const username = userMap.get(userId);
      return username ? `@${username}` : match;
    });
  }

  /**
   * Parse a message for all types of mentions
   * @param message The message content to parse
   * @returns Object containing arrays of user, role, and channel IDs
   */
  static parseAllMentions(message: string): {
    users: string[];
    roles: string[];
    channels: string[];
  } {
    const users = this.extractUserIds(message);
    
    const roles: string[] = [];
    const roleMatches = message.matchAll(this.ROLE_MENTION_PATTERN);
    for (const match of roleMatches) {
      if (match[1]) roles.push(match[1]);
    }
    
    const channels: string[] = [];
    const channelMatches = message.matchAll(this.CHANNEL_MENTION_PATTERN);
    for (const match of channelMatches) {
      if (match[1]) channels.push(match[1]);
    }
    
    return {
      users: [...new Set(users)],
      roles: [...new Set(roles)],
      channels: [...new Set(channels)]
    };
  }
}