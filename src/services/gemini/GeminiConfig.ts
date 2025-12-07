/**
 * Gemini API configuration for enhanced multimodal accuracy
 * Optimized parameters for image recognition and visual understanding
 */

import { getConfigValue, getConfigValueWithDefault } from '../utils/ConfigurationValidator';

export interface GeminiModelConfig {
  model: string;
  temperature: number;
  topK: number;
  topP: number;
  maxOutputTokens: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  systemInstruction?: string;
}

export interface GeminiConfigProfile {
  name: string;
  description: string;
  config: GeminiModelConfig;
}

/**
 * Available Gemini models with their capabilities
 */
export const GEMINI_MODELS = {
  // Current free model (10 RPM, 500 req/day)
  FLASH_PREVIEW: 'gemini-2.5-flash-preview-05-20',
  
  // Future model options (when available/affordable)
  // PRO_VISION: 'gemini-pro-vision',
  // FLASH_1_5: 'gemini-1.5-flash',
  // FLASH_2_5: 'gemini-2.5-flash',
  // PRO_1_5: 'gemini-1.5-pro'
} as const;

/**
 * System instructions optimized for image recognition accuracy
 */
export const VISION_SYSTEM_INSTRUCTIONS = {
  CHARACTER_RECOGNITION: `You are an expert at recognizing characters, people, and cultural references in images. When analyzing images:
1. Focus on identifying specific characters, costumes, and visual details
2. Consider the context, setting, and any text visible in the image
3. Draw from knowledge of popular culture, TV shows, movies, and internet memes
4. If uncertain, provide your best assessment with confidence levels
5. Be specific about visual elements that led to your identification`,

  SNL_CHARACTER_RECOGNITION: `You are an expert at recognizing Saturday Night Live (SNL) characters, cast members, and sketches. When analyzing images:
1. Focus on identifying specific SNL characters, recurring sketches, and cast members from all seasons (1975-present)
2. Pay attention to costumes, wigs, makeup, prosthetics, and character-specific props that are hallmarks of SNL characters
3. Consider the era/season based on visual style, set design, and video quality
4. Reference specific sketch names (e.g., "Wayne's World", "Church Lady", "Stefon") and character names when identified
5. If you see a character that looks familiar but you're unsure, provide your top 2-3 possibilities with detailed reasoning
6. Note distinctive features like catchphrases visible in text, iconic poses, or recurring visual gags
7. Consider both current and alumni cast members, as SNL often features returning performers
8. Look for contextual clues like "LIVE FROM NEW YORK" text, NBC logos, or Studio 8H backgrounds`,

  GENERAL_VISION: `You are a highly accurate image analysis assistant. When describing images:
1. Provide detailed and accurate descriptions
2. Identify objects, people, text, and settings precisely
3. Note any distinctive features or characteristics
4. Be factual and avoid assumptions unless clearly stated
5. Mention if image quality affects your analysis`
};

/**
 * Configuration profiles for different use cases
 */
export const GEMINI_CONFIG_PROFILES: Record<string, GeminiConfigProfile> = {
  // SNL-specific character recognition with maximum accuracy
  SNL_EXPERT: {
    name: 'SNL Expert Vision',
    description: 'Specialized for recognizing SNL characters and cast members with maximum accuracy',
    config: {
      model: GEMINI_MODELS.FLASH_PREVIEW,  // Using free model
      temperature: 0.05,  // Ultra-low for maximum determinism
      topK: 5,           // Very narrow selection for highest confidence
      topP: 0.7,         // Tight focus on most probable answers
      maxOutputTokens: 4096,  // Allow detailed analysis
      presencePenalty: 0.0,
      frequencyPenalty: 0.0,
      systemInstruction: VISION_SYSTEM_INSTRUCTIONS.SNL_CHARACTER_RECOGNITION
    }
  },

  // Highest accuracy for character/person recognition
  HIGH_ACCURACY_VISION: {
    name: 'High Accuracy Vision',
    description: 'Optimized for maximum accuracy in image recognition tasks',
    config: {
      model: GEMINI_MODELS.FLASH_PREVIEW,  // Using free model
      temperature: 0.1,  // Very low for deterministic responses
      topK: 10,          // Narrow selection for consistency
      topP: 0.8,         // Focus on high-probability tokens
      maxOutputTokens: 2048,
      presencePenalty: 0.0,
      frequencyPenalty: 0.0,
      systemInstruction: VISION_SYSTEM_INSTRUCTIONS.CHARACTER_RECOGNITION
    }
  },

  // Balanced accuracy and speed
  BALANCED_VISION: {
    name: 'Balanced Vision',
    description: 'Good accuracy with reasonable response times',
    config: {
      model: GEMINI_MODELS.FLASH_PREVIEW,  // Using free model
      temperature: 0.3,
      topK: 20,
      topP: 0.9,
      maxOutputTokens: 2048,
      systemInstruction: VISION_SYSTEM_INSTRUCTIONS.GENERAL_VISION
    }
  },

  // Fast responses with acceptable accuracy
  FAST_VISION: {
    name: 'Fast Vision',
    description: 'Prioritizes speed while maintaining reasonable accuracy',
    config: {
      model: GEMINI_MODELS.FLASH_PREVIEW,  // Using free model
      temperature: 0.5,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
      systemInstruction: VISION_SYSTEM_INSTRUCTIONS.GENERAL_VISION
    }
  },

  // Creative/exploratory responses
  CREATIVE_VISION: {
    name: 'Creative Vision',
    description: 'For more creative and exploratory image interpretations',
    config: {
      model: GEMINI_MODELS.FLASH_PREVIEW,  // Using free model
      temperature: 0.8,
      topK: 50,
      topP: 0.95,
      maxOutputTokens: 2048
    }
  },

  // Current configuration (for backward compatibility)
  LEGACY: {
    name: 'Legacy Configuration',
    description: 'Current bot configuration',
    config: {
      model: GEMINI_MODELS.FLASH_PREVIEW,
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048
    }
  }
};

/**
 * Get configuration based on environment or defaults using ConfigurationValidator
 */
export function getGeminiConfig(profileName?: string): GeminiModelConfig {
  // Use ConfigurationValidator for type-safe configuration parsing
  const envProfile = getConfigValue<string>('GEMINI_VISION_PROFILE');
  const selectedProfile = profileName || envProfile || 'HIGH_ACCURACY_VISION';
  
  const profile = GEMINI_CONFIG_PROFILES[selectedProfile];
  if (!profile) {
    console.warn(`Unknown Gemini profile: ${selectedProfile}, falling back to HIGH_ACCURACY_VISION`);
    return GEMINI_CONFIG_PROFILES.HIGH_ACCURACY_VISION.config;
  }

  // Use ConfigurationValidator for all environment variable access with proper defaults
  return {
    ...profile.config,
    model: getConfigValueWithDefault('GEMINI_MODEL', GEMINI_MODELS.FLASH_PREVIEW),
    temperature: getConfigValueWithDefault('GEMINI_TEMPERATURE', profile.config.temperature),
    topK: getConfigValueWithDefault('GEMINI_TOP_K', profile.config.topK),
    topP: getConfigValueWithDefault('GEMINI_TOP_P', profile.config.topP),
    maxOutputTokens: getConfigValueWithDefault('GEMINI_MAX_OUTPUT_TOKENS', profile.config.maxOutputTokens),
    // Include system instruction from profile (no environment override)
    systemInstruction: profile.config.systemInstruction
  };
}

/**
 * Get API key with proper deprecation handling
 * Handles GEMINI_API_KEY → GOOGLE_API_KEY migration
 */
export function getGeminiApiKey(): string | undefined {
  // Check for the new API key first
  const googleApiKey = getConfigValue<string>('GOOGLE_API_KEY');
  if (googleApiKey) {
    return googleApiKey;
  }
  
  // Fall back to deprecated API key with warning
  const geminiApiKey = getConfigValue<string>('GEMINI_API_KEY');
  if (geminiApiKey) {
    console.warn('GEMINI_API_KEY is deprecated. Please use GOOGLE_API_KEY instead.');
    return geminiApiKey;
  }
  
  return undefined;
}

/**
 * Image preprocessing recommendations
 */
export const IMAGE_OPTIMIZATION_TIPS = {
  maxImageSize: 4 * 1024 * 1024, // 4MB recommended max
  recommendedFormats: ['image/jpeg', 'image/png', 'image/webp'],
  minResolution: 224, // Minimum recommended resolution in pixels
  maxImagesPerRequest: 16 // Gemini recommendation for optimal performance
};

// Note: Configuration validation is performed during bot initialization
// to avoid duplicate validation errors during module loading