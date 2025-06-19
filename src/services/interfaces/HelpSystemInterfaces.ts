/**
 * Help System Service Interface Definitions
 * 
 * Interfaces for help generation and tutorial systems.
 */

import type { IService } from './CoreServiceInterfaces';
import type { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { HelpTopic, CommandHelp, HelpSearchResult } from '../../types';

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

// ============================================================================
// Help System Component Interfaces
// ============================================================================

export interface IHelpContentManager {
  getHelpTopic(topicId: string): HelpTopic | null;
  getCommandHelp(commandName: string): CommandInfo | null;
  getAllTopics(): string[];
  getAllCommands(): string[];
  searchHelp(query: string): HelpSearchResult[];
}

export interface IHelpCommandBuilder {
  createTopicEmbed(topic: HelpTopic): EmbedBuilder;
  createCommandEmbed(command: CommandHelp): EmbedBuilder;
  createGeneralHelpEmbed(): EmbedBuilder;
  createNavigationButtons(currentContext: 'general' | 'topic' | 'command', identifier?: string): ActionRowBuilder<ButtonBuilder>[];
  generateTextHelp(commandName?: string, userRole?: 'user' | 'moderator' | 'admin'): string;
}