import { logger } from '../../utils/logger';
import { ICacheManager, AIServiceConfig, BotConfiguration } from '../interfaces';

export class GeminiConfigurationHandler {
    constructor(private cacheManager: ICacheManager) { }

    async updateConfiguration(config: AIServiceConfig): Promise<void> {
        logger.info('Updating GeminiService configuration...');

        // Update Gemini model settings
        if (config.model !== undefined) {
            logger.info(`Model updated: ${config.model}`);
        }

        // Update generation parameters
        if (config.temperature !== undefined) {
            logger.info(`Temperature updated: ${config.temperature}`);
        }
        if (config.topK !== undefined) {
            logger.info(`TopK updated: ${config.topK}`);
        }
        if (config.topP !== undefined) {
            logger.info(`TopP updated: ${config.topP}`);
        }
        if (config.maxTokens !== undefined) {
            logger.info(`MaxTokens updated: ${config.maxTokens}`);
        }

        // Update safety settings
        if (config.safetySettings !== undefined) {
            logger.info('Safety settings updated');
        }

        // Update system instructions
        if (config.systemInstructions !== undefined) {
            logger.info('System instructions updated');
        }

        // Update grounding settings
        if (config.grounding !== undefined) {
            logger.info(`Grounding updated: threshold=${config.grounding.threshold}, enabled=${config.grounding.enabled}`);
        }

        // Update thinking settings
        if (config.thinking !== undefined) {
            logger.info(`Thinking updated: budget=${config.thinking.budget}, includeInResponse=${config.thinking.includeInResponse}`);
        }

        // Update feature flags
        if (config.enableCodeExecution !== undefined) {
            logger.info(`Code execution updated: ${config.enableCodeExecution}`);
        }
        if (config.enableStructuredOutput !== undefined) {
            logger.info(`Structured output updated: ${config.enableStructuredOutput}`);
        }

        // Clear caches to ensure new configuration takes effect
        this.cacheManager.clearCache();

        logger.info('GeminiService configuration update completed');
    }

    async validateConfiguration(config: BotConfiguration): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];

        try {
            // Validate Gemini configuration
            if (config.gemini) {
                if (config.gemini.temperature < 0 || config.gemini.temperature > 2) {
                    errors.push('Gemini temperature must be between 0 and 2');
                }
                if (config.gemini.topK < 1 || config.gemini.topK > 100) {
                    errors.push('Gemini topK must be between 1 and 100');
                }
                if (config.gemini.topP < 0 || config.gemini.topP > 1) {
                    errors.push('Gemini topP must be between 0 and 1');
                }
                if (config.gemini.maxTokens < 1 || config.gemini.maxTokens > 32768) {
                    errors.push('Gemini maxTokens must be between 1 and 32768');
                }
            }

            // Validate rate limiting configuration
            if (config.rateLimiting) {
                if (config.rateLimiting.rpm <= 0) {
                    errors.push('Rate limiting RPM must be greater than 0');
                }
                if (config.rateLimiting.daily <= 0) {
                    errors.push('Rate limiting daily limit must be greater than 0');
                }
                if (config.rateLimiting.rpm > config.rateLimiting.daily / 24) {
                    errors.push('RPM limit cannot exceed daily limit divided by 24 hours');
                }
            }

            // Validate context memory configuration
            if (config.features?.contextMemory) {
                const contextConfig = config.features.contextMemory;
                if (contextConfig.maxMessages < 10 || contextConfig.maxMessages > 1000) {
                    errors.push('Context memory maxMessages must be between 10 and 1000');
                }
                if (contextConfig.timeoutMinutes < 1 || contextConfig.timeoutMinutes > 1440) {
                    errors.push('Context memory timeout must be between 1 and 1440 minutes');
                }
                if (contextConfig.maxContextChars < 1000 || contextConfig.maxContextChars > 1000000) {
                    errors.push('Context memory maxContextChars must be between 1000 and 1000000');
                }
            }

            // Validate roasting configuration
            if (config.features?.roasting) {
                const roastConfig = config.features.roasting;
                if (roastConfig.baseChance < 0 || roastConfig.baseChance > 1) {
                    errors.push('Roasting baseChance must be between 0 and 1');
                }
                if (roastConfig.maxChance < 0 || roastConfig.maxChance > 1) {
                    errors.push('Roasting maxChance must be between 0 and 1');
                }
                if (roastConfig.baseChance > roastConfig.maxChance) {
                    errors.push('Roasting baseChance cannot be greater than maxChance');
                }
            }

        } catch (error) {
            errors.push(`Configuration validation error: ${error}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
