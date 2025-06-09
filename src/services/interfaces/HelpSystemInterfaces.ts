/**
 * Help System Service Interface Definitions
 * 
 * Interfaces for help generation and tutorial systems.
 */

import type { IService } from './CoreServiceInterfaces';

// ============================================================================
// Help System Service Interfaces
// ============================================================================

export interface IHelpSystemService extends IService {
  /**
   * Help generation
   */
  generateHelp(commandName?: string, userRole?: 'user' | 'moderator' | 'admin'): string;
  getCommandList(userRole?: 'user' | 'moderator' | 'admin'): CommandInfo[];
  getCommandHelp(commandName: string): CommandInfo | null;
  
  /**
   * Tutorial system
   */
  startTutorial(userId: string): Promise<TutorialSession>;
  progressTutorial(userId: string, step: number): Promise<boolean>;
  getTutorialStatus(userId: string): TutorialProgress | null;
}

export interface CommandInfo {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  permissions: 'all' | 'moderator' | 'admin';
  cooldown?: number;
  aliases?: string[];
}

export interface TutorialSession {
  userId: string;
  currentStep: number;
  totalSteps: number;
  startedAt: number;
  completedSteps: number[];
}

export interface TutorialProgress {
  completed: boolean;
  currentStep: number;
  completedSteps: number[];
  lastAccessed: number;
}