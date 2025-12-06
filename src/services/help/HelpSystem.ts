/**
 * Help System Service - Legacy Compatibility Layer
 * 
 * This file provides backward compatibility for existing imports
 * while delegating to the new modular help system structure.
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import type { IHelpSystemService, CommandInfo, TutorialSession, TutorialProgress } from '../interfaces/HelpSystemInterfaces';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import { HelpSystem as ModularHelpSystem } from '../help/HelpSystem';

// Re-export types for backward compatibility
export type {
  HelpTopic,
  HelpSection,
  CommandHelp,
  ParameterHelp,
  SearchResult
} from '../help/HelpContentManager';

export class HelpSystem implements IHelpSystemService {
  private modularHelpSystem: ModularHelpSystem;

  constructor() {
    this.modularHelpSystem = new ModularHelpSystem();
  }

  // ============================================================================
  // IHelpSystemService Interface Implementation (Delegation)
  // ============================================================================

  getHelpTopic(topicId: string) {
    return this.modularHelpSystem.getHelpTopic(topicId);
  }

  getCommandHelp(commandName: string): CommandInfo | null {
    return this.modularHelpSystem.getCommandHelp(commandName);
  }

  getAllTopics(): string[] {
    return this.modularHelpSystem.getAllTopics();
  }

  getAllCommands(): string[] {
    return this.modularHelpSystem.getAllCommands();
  }

  generateHelp(commandName?: string, userRole: 'user' | 'moderator' | 'admin' = 'user'): string {
    return this.modularHelpSystem.generateHelp(commandName, userRole);
  }

  getCommandList(userRole: 'user' | 'moderator' | 'admin' = 'user'): CommandInfo[] {
    return this.modularHelpSystem.getCommandList(userRole);
  }

  async startTutorial(userId: string): Promise<TutorialSession> {
    return this.modularHelpSystem.startTutorial(userId);
  }

  async progressTutorial(userId: string, step: number): Promise<boolean> {
    return this.modularHelpSystem.progressTutorial(userId, step);
  }

  getTutorialStatus(userId: string): TutorialProgress | null {
    return this.modularHelpSystem.getTutorialStatus(userId);
  }

  getHealthStatus(): ServiceHealthStatus {
    return this.modularHelpSystem.getHealthStatus();
  }

  async initialize(): Promise<void> {
    return this.modularHelpSystem.initialize();
  }

  async shutdown(): Promise<void> {
    return this.modularHelpSystem.shutdown();
  }

  // ============================================================================
  // Legacy API Methods (For Backward Compatibility)
  // ============================================================================

  createTopicEmbed(topicId: string): EmbedBuilder | null {
    return this.modularHelpSystem.createTopicEmbed(topicId);
  }

  createCommandEmbed(commandName: string): EmbedBuilder | null {
    return this.modularHelpSystem.createCommandEmbed(commandName);
  }

  createGeneralHelpEmbed(): EmbedBuilder {
    return this.modularHelpSystem.createGeneralHelpEmbed();
  }

  createNavigationButtons(currentContext: 'general' | 'topic' | 'command', identifier?: string): ActionRowBuilder<ButtonBuilder>[] {
    return this.modularHelpSystem.createNavigationButtons(currentContext, identifier);
  }

  searchHelp(query: string) {
    return this.modularHelpSystem.searchHelp(query);
  }

  createSearchResultsEmbed(query: string): EmbedBuilder {
    return this.modularHelpSystem.createSearchResultsEmbed(query);
  }

  processHelpCommand(commandName?: string, topic?: string) {
    return this.modularHelpSystem.processHelpCommand(commandName, topic);
  }

  processButtonInteraction(customId: string) {
    return this.modularHelpSystem.processButtonInteraction(customId);
  }
}