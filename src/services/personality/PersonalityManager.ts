import { logger } from '../../utils/logger';
import { DataStore, DataValidator } from '../../utils/DataStore';
import { dataStoreFactory } from '../../utils/DataStoreFactory';
import { BaseService } from '../base/BaseService';
import { IPersonalityManager, UserPersonality } from '../interfaces/PersonalityManagementInterfaces';
import { PersonalityValidators } from '../../utils/validation';
import { MutexManager, createMutexManager } from '../../utils/MutexManager';
import { handleDataStoreOperation, handleFireAndForget } from '../../utils/ErrorHandlingUtils';

interface PersonalityData {
  descriptions: string[];
  lastUpdated: string;
  updatedBy: string;
  createdAt: string;
  changeHistory: {
    timestamp: string;
    updatedBy: string;
    action: 'added' | 'removed' | 'cleared';
    description?: string;
  }[];
}

interface PersonalityStorage {
  [userId: string]: PersonalityData;
}

export class PersonalityManager extends BaseService implements IPersonalityManager {
  private mutexManager: MutexManager;
  private personalities: PersonalityStorage = {};
  private readonly dataStore: DataStore<PersonalityStorage>;
  private readonly MAX_DESCRIPTIONS_PER_USER = 20;
  private readonly MAX_DESCRIPTION_LENGTH = 200;

  constructor(storageFile = './data/user-personalities.json') {
    super();
    
    // Initialize mutex manager with monitoring
    this.mutexManager = createMutexManager('PersonalityManager', {
      enableDeadlockDetection: true,
      enableStatistics: true
    });
    
    // Create validator for personality storage
    const personalityValidator: DataValidator<PersonalityStorage> = (data: unknown): data is PersonalityStorage => {
      if (typeof data !== 'object' || !data) return false;
      
      const storage = data as PersonalityStorage;
      return Object.values(storage).every(personalityData => 
        Array.isArray(personalityData.descriptions) &&
        typeof personalityData.lastUpdated === 'string' &&
        typeof personalityData.updatedBy === 'string' &&
        typeof personalityData.createdAt === 'string' &&
        Array.isArray(personalityData.changeHistory)
      );
    };
    
    // Use factory to create state store optimized for personality data
    this.dataStore = dataStoreFactory.createStateStore<PersonalityStorage>(
      storageFile,
      personalityValidator
    );
  }

  protected getServiceName(): string {
    return 'PersonalityManager';
  }

  protected async performInitialization(): Promise<void> {
    const result = await handleDataStoreOperation(
      () => this.dataStore.load(),
      // Fallback to empty state if data loading fails
      () => Promise.resolve({}),
      { service: 'PersonalityManager', operation: 'initialization' }
    );

    if (result.success) {
      this.personalities = result.data || {};
      if (result.fallbackUsed) {
        logger.info('PersonalityManager initialized with fallback (empty state)');
      } else {
        logger.info('PersonalityManager initialized with existing personality data');
      }
    } else {
      logger.error('Failed to initialize PersonalityManager', { error: result.error });
      this.personalities = {};
    }
  }

  async addPersonalityDescription(
    targetUserId: string,
    description: string,
    updatedBy: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.mutexManager.withMutex(async () => {
      const validation = this.validateDescription(description);
      if (!validation.valid) {
        return { success: false, message: validation.message };
      }

      const existingData = this.personalities[targetUserId];
      const now = new Date().toISOString();

      if (!existingData) {
        this.personalities[targetUserId] = {
          descriptions: [description],
          lastUpdated: now,
          updatedBy,
          createdAt: now,
          changeHistory: [
            {
              timestamp: now,
              updatedBy,
              action: 'added',
              description,
            },
          ],
        };
      } else {
        // Check if description already exists
        if (existingData.descriptions.includes(description)) {
          return {
            success: false,
            message:
              'This personality description already exists for this user',
          };
        }

        // Add new description
        existingData.descriptions.push(description);

        // Trim if too many descriptions
        if (existingData.descriptions.length > this.MAX_DESCRIPTIONS_PER_USER) {
          const removed = existingData.descriptions.shift();
          logger.info(
            `Auto-trimmed oldest personality description for ${targetUserId}: "${removed}"`, 
          );
        }

        existingData.lastUpdated = now;
        existingData.updatedBy = updatedBy;

        existingData.changeHistory.push({
          timestamp: now,
          updatedBy,
          action: 'added',
          description,
        });

        if (existingData.changeHistory.length > 50) {
          existingData.changeHistory = existingData.changeHistory.slice(-50);
        }
      }

      const saveResult = await handleDataStoreOperation(
        () => this.dataStore.save(this.personalities),
        undefined,
        {
          service: 'PersonalityManager', 
          operation: 'save_after_add',
          targetUserId,
          description: description.substring(0, 50) + '...'
        }
      );

      if (saveResult.success) {
        logger.info(
          `Personality description added for ${targetUserId}: "${description}" (by ${updatedBy})`,
        );
        return {
          success: true,
          message: `Added personality description: "${description}"`, 
        };
      } else {
        logger.error('Failed to save personality after adding description', { 
          error: saveResult.error,
          targetUserId 
        });
        return {
          success: false,
          message: 'Failed to save personality data. Changes may not persist.',
        };
      }
    }, { operationName: 'addPersonalityDescription', timeout: 15000 });
  }

  async removePersonalityDescription(
    targetUserId: string,
    description: string,
    updatedBy: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.mutexManager.withMutex(async () => {
      const existingData = this.personalities[targetUserId];
      if (!existingData || !existingData.descriptions.includes(description)) {
        return {
          success: false,
          message: 'User does not have this personality description',
        };
      }

      existingData.descriptions = existingData.descriptions.filter(
        (d) => d !== description,
      );
      existingData.lastUpdated = new Date().toISOString();
      existingData.updatedBy = updatedBy;

      existingData.changeHistory.push({
        timestamp: new Date().toISOString(),
        updatedBy,
        action: 'removed',
        description,
      });

      const saveResult = await handleDataStoreOperation(
        () => this.dataStore.save(this.personalities),
        undefined,
        {
          service: 'PersonalityManager', 
          operation: 'save_after_remove',
          targetUserId,
          description: description.substring(0, 50) + '...'
        }
      );

      if (saveResult.success) {
        logger.info(
          `Personality description removed for ${targetUserId}: "${description}" (by ${updatedBy})`,
        );
        return {
          success: true,
          message: `Removed personality description: "${description}"`, 
        };
      } else {
        logger.error('Failed to save personality after removing description', { 
          error: saveResult.error,
          targetUserId 
        });
        return {
          success: false,
          message: 'Failed to save personality data. Changes may not persist.',
        };
      }
    }, { operationName: 'removePersonalityDescription', timeout: 15000 });
  }

  clearPersonality(
    targetUserId: string,
    updatedBy: string,
  ): { success: boolean; message: string } {
    if (!this.personalities[targetUserId]) {
      return {
        success: false,
        message: 'User has no personality data to clear',
      };
    }

    delete this.personalities[targetUserId];
    
    // Save asynchronously without blocking using standardized error handling
    handleFireAndForget(
      () => this.dataStore.save(this.personalities),
      {
        service: 'PersonalityManager', 
        operation: 'save_after_clear',
        targetUserId,
        updatedBy 
      }
    );
    
    logger.info(
      `Personality cleared for user ${targetUserId} (by ${updatedBy})`,
    );

    return {
      success: true,
      message: 'Cleared all personality data for user',
    };
  }

  getPersonality(userId: string): UserPersonality | undefined {
    const personalityData = this.personalities[userId];
    if (!personalityData) {
      return undefined;
    }
    
    // Convert PersonalityData to UserPersonality interface format
    const traits = new Map<string, string>();
    
    // Parse descriptions to extract traits (format: "trait: value")
    personalityData.descriptions.forEach(description => {
      const colonIndex = description.indexOf(':');
      if (colonIndex > 0) {
        const trait = description.substring(0, colonIndex).trim();
        const value = description.substring(colonIndex + 1).trim();
        traits.set(trait, value);
      }
    });
    
    return {
      userId,
      traits,
      descriptions: [...personalityData.descriptions],
      lastUpdated: new Date(personalityData.lastUpdated).getTime()
    };
  }

  buildPersonalityContext(userId: string): string {
    const personality = this.personalities[userId];
    if (!personality || personality.descriptions.length === 0) {
      return '';
    }

    let context = '\n\nUSER PERSONALITY PROFILE:\n';

    personality.descriptions.forEach((description) => {
      context += `- ${description}\n`;
    });

    context +=
      '\nAdapt your response style to match this user\'s personality and preferences.\n';

    return context;
  }

  getAllPersonalities(): PersonalityStorage {
    return { ...this.personalities };
  }

  getPersonalityStats(): {
    totalUsers: number;
    totalDescriptions: number;
    averageDescriptionsPerUser: number;
    } {
    const totalUsers = Object.keys(this.personalities).length;
    let totalDescriptions = 0;

    Object.values(this.personalities).forEach((personality) => {
      totalDescriptions += personality.descriptions.length;
    });

    return {
      totalUsers,
      totalDescriptions,
      averageDescriptionsPerUser:
        totalUsers > 0 ? totalDescriptions / totalUsers : 0,
    };
  }

  private validateDescription(description: string): {
    valid: boolean;
    message: string;
  } {
    const result = PersonalityValidators.description(description, this.MAX_DESCRIPTION_LENGTH);
    return {
      valid: result.valid,
      message: result.errors.join(', ')
    };
  }


  protected async performShutdown(): Promise<void> {
    // Save current state through DataStore before shutdown using standardized error handling
    const saveResult = await handleDataStoreOperation(
      () => this.dataStore.save(this.personalities),
      undefined,
      { service: 'PersonalityManager', operation: 'shutdown_save' }
    );

    if (!saveResult.success) {
      logger.error('Failed to save personality data during shutdown', { error: saveResult.error });
    }

    this.personalities = {};
  }

  // Interface Compliance Methods
  setPersonality(userId: string, trait: string, value: string): void {
    // Create or update user personality with trait-value mapping
    const existing = this.personalities[userId];
    const now = new Date().toISOString();
    
    if (!existing) {
      this.personalities[userId] = {
        descriptions: [`${trait}: ${value}`],
        lastUpdated: now,
        updatedBy: 'system',
        createdAt: now,
        changeHistory: [{
          timestamp: now,
          updatedBy: 'system',
          action: 'added',
          description: `${trait}: ${value}`
        }]
      };
    } else {
      // Remove existing trait if present and add new one
      existing.descriptions = existing.descriptions.filter(d => !d.startsWith(`${trait}:`));
      existing.descriptions.push(`${trait}: ${value}`);
      existing.lastUpdated = now;
      existing.updatedBy = 'system';
      existing.changeHistory.push({
        timestamp: now,
        updatedBy: 'system',
        action: 'added',
        description: `${trait}: ${value}`
      });
    }
    
    // Save asynchronously without blocking using standardized error handling
    handleFireAndForget(
      () => this.dataStore.save(this.personalities),
      {
        service: 'PersonalityManager', 
        operation: 'save_after_set_personality',
        userId,
        trait 
      }
    );
  }

  removePersonality(userId: string, trait: string): boolean {
    const existing = this.personalities[userId];
    if (!existing) {
      return false;
    }
    
    const initialLength = existing.descriptions.length;
    existing.descriptions = existing.descriptions.filter(d => !d.startsWith(`${trait}:`));
    
    if (existing.descriptions.length < initialLength) {
      const now = new Date().toISOString();
      existing.lastUpdated = now;
      existing.updatedBy = 'system';
      existing.changeHistory.push({
        timestamp: now,
        updatedBy: 'system',
        action: 'removed',
        description: `${trait} trait`
      });
      
      // Save asynchronously without blocking using standardized error handling
      handleFireAndForget(
        () => this.dataStore.save(this.personalities),
        {
          service: 'PersonalityManager', 
          operation: 'save_after_remove_personality',
          userId,
          trait 
        }
      );
      
      return true;
    }
    
    return false;
  }

  getFormattedTraits(userId: string): string[] {
    const personality = this.personalities[userId];
    if (!personality || personality.descriptions.length === 0) {
      return [];
    }
    
    return personality.descriptions.map(description => {
      // Format each description for display
      return `• ${description}`;
    });
  }

  protected collectServiceMetrics(): Record<string, unknown> | undefined {
    const stats = this.getPersonalityStats();
    return {
      personality: {
        ...stats,
        dataStoreInitialized: this.dataStore !== undefined
      }
    };
  }
}
