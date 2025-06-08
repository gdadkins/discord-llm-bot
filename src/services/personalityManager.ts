import { Mutex } from 'async-mutex';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { BaseService } from './base/BaseService';
import type { IService } from './interfaces';

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

export class PersonalityManager extends BaseService implements IService {
  private mutex = new Mutex();
  private personalities: PersonalityStorage = {};
  private readonly storageFile: string;
  private readonly MAX_DESCRIPTIONS_PER_USER = 20;
  private readonly MAX_DESCRIPTION_LENGTH = 200;

  constructor(storageFile = './data/user-personalities.json') {
    super();
    this.storageFile = storageFile;
  }

  protected getServiceName(): string {
    return 'PersonalityManager';
  }

  protected async performInitialization(): Promise<void> {
    try {
      await this.loadPersonalities();
      logger.info('Initialized with existing personality data');
    } catch (error) {
      logger.info('No existing personality data found, starting fresh');
      await this.ensureDataDirectory();
    }
  }

  async addPersonalityDescription(
    targetUserId: string,
    description: string,
    updatedBy: string,
  ): Promise<{ success: boolean; message: string }> {
    const release = await this.mutex.acquire();
    try {
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

      await this.savePersonalities();
      logger.info(
        `Personality description added for ${targetUserId}: "${description}" (by ${updatedBy})`,
      );

      return {
        success: true,
        message: `Added personality description: "${description}"`,
      };
    } finally {
      release();
    }
  }

  async removePersonalityDescription(
    targetUserId: string,
    description: string,
    updatedBy: string,
  ): Promise<{ success: boolean; message: string }> {
    const release = await this.mutex.acquire();
    try {
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

      await this.savePersonalities();
      logger.info(
        `Personality description removed for ${targetUserId}: "${description}" (by ${updatedBy})`,
      );

      return {
        success: true,
        message: `Removed personality description: "${description}"`,
      };
    } finally {
      release();
    }
  }

  async clearPersonality(
    targetUserId: string,
    updatedBy: string,
  ): Promise<{ success: boolean; message: string }> {
    const release = await this.mutex.acquire();
    try {
      if (!this.personalities[targetUserId]) {
        return {
          success: false,
          message: 'User has no personality data to clear',
        };
      }

      delete this.personalities[targetUserId];
      await this.savePersonalities();
      logger.info(
        `Personality cleared for user ${targetUserId} (by ${updatedBy})`,
      );

      return {
        success: true,
        message: 'Cleared all personality data for user',
      };
    } finally {
      release();
    }
  }

  getPersonality(userId: string): PersonalityData | null {
    return this.personalities[userId] || null;
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
    if (typeof description !== 'string') {
      return { valid: false, message: 'Description must be a string' };
    }

    if (description.trim().length === 0) {
      return { valid: false, message: 'Description cannot be empty' };
    }

    if (description.length > this.MAX_DESCRIPTION_LENGTH) {
      return {
        valid: false,
        message: `Description too long (max ${this.MAX_DESCRIPTION_LENGTH} characters)`,
      };
    }

    return { valid: true, message: '' };
  }

  private async ensureDataDirectory(): Promise<void> {
    const dir = path.dirname(this.storageFile);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create personality data directory:', error);
    }
  }

  private async savePersonalities(): Promise<void> {
    try {
      await fs.writeFile(
        this.storageFile,
        JSON.stringify(this.personalities, null, 2),
      );
    } catch (error) {
      logger.error('Failed to save personality data:', error);
    }
  }

  private async loadPersonalities(): Promise<void> {
    try {
      const data = await fs.readFile(this.storageFile, 'utf8');
      const loadedData = JSON.parse(data) as PersonalityStorage;

      if (typeof loadedData === 'object' && loadedData !== null) {
        this.personalities = loadedData;
      }
    } catch (error) {
      throw new Error(`Failed to load personality data: ${error}`);
    }
  }

  protected async performShutdown(): Promise<void> {
    await this.savePersonalities();
    this.personalities = {};
  }

  protected getHealthMetrics(): Record<string, unknown> {
    const stats = this.getPersonalityStats();
    return {
      ...stats,
      storageFile: this.storageFile
    };
  }
}
