/**
 * Help System Service
 * Main help system orchestrator managing content, commands, and tutorials
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { logger } from '../../utils/logger';
import type { 
  IHelpSystemService, 
  CommandInfo, 
  TutorialSession, 
  TutorialProgress 
} from '../interfaces/HelpSystemInterfaces';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import { HelpContentManager } from './HelpContentManager';
import { HelpCommandBuilder } from './HelpCommandBuilder';

export class HelpSystem implements IHelpSystemService {
  private contentManager: HelpContentManager;
  private commandBuilder: HelpCommandBuilder;
  private tutorialSessions: Map<string, TutorialSession> = new Map();

  constructor() {
    this.contentManager = new HelpContentManager();
    this.commandBuilder = new HelpCommandBuilder(this.contentManager);
  }

  // ============================================================================
  // Public API Methods (IHelpSystemService interface)
  // ============================================================================

  getHelpTopic(topicId: string) {
    return this.contentManager.getHelpTopic(topicId);
  }

  getCommandHelp(commandName: string): CommandInfo | null {
    return this.contentManager.getCommandHelp(commandName);
  }

  getAllTopics(): string[] {
    return this.contentManager.getAllTopics();
  }

  getAllCommands(): string[] {
    return this.contentManager.getAllCommands();
  }

  searchHelp(query: string) {
    return this.contentManager.searchHelp(query);
  }

  /**
   * Generate help content for a command or general help
   */
  generateHelp(commandName?: string, userRole: 'user' | 'moderator' | 'admin' = 'user'): string {
    return this.commandBuilder.generateTextHelp(commandName, userRole);
  }

  /**
   * Get list of commands available to user role
   */
  getCommandList(userRole: 'user' | 'moderator' | 'admin' = 'user'): CommandInfo[] {
    const commands: CommandInfo[] = [];
    const allCommands = this.contentManager.getAllCommands();
    
    allCommands.forEach(commandName => {
      const commandInfo = this.contentManager.getCommandHelp(commandName);
      if (!commandInfo) return;
      
      // Filter by permissions
      if (commandInfo.permissions === 'all' || 
          commandInfo.permissions === userRole || 
          userRole === 'admin') {
        commands.push(commandInfo);
      }
    });
    
    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ============================================================================
  // Embed Creation Methods
  // ============================================================================

  createTopicEmbed(topicId: string): EmbedBuilder | null {
    const topic = this.contentManager.getHelpTopic(topicId);
    if (!topic) return null;
    
    return this.commandBuilder.createTopicEmbed(topic);
  }

  createCommandEmbed(commandName: string): EmbedBuilder | null {
    const command = this.contentManager.getCommandHelpRaw(commandName);
    if (!command) return null;
    
    return this.commandBuilder.createCommandEmbed(command);
  }

  createGeneralHelpEmbed(): EmbedBuilder {
    return this.commandBuilder.createGeneralHelpEmbed();
  }

  createNavigationButtons(currentContext: 'general' | 'topic' | 'command', identifier?: string): ActionRowBuilder<ButtonBuilder>[] {
    return this.commandBuilder.createNavigationButtons(currentContext, identifier);
  }

  createSearchResultsEmbed(query: string): EmbedBuilder {
    const results = this.contentManager.searchHelp(query);
    return this.commandBuilder.createSearchResultsEmbed(query, results);
  }

  // ============================================================================
  // Tutorial System Methods
  // ============================================================================

  /**
   * Start a tutorial session for a user
   */
  async startTutorial(userId: string): Promise<TutorialSession> {
    const session: TutorialSession = {
      userId,
      currentStep: 0,
      totalSteps: 5, // Basic tutorial with 5 steps
      startedAt: Date.now(),
      completedSteps: []
    };
    
    this.tutorialSessions.set(userId, session);
    logger.info(`Started tutorial session for user ${userId}`);
    
    return { ...session };
  }

  /**
   * Progress a tutorial session to the next step
   */
  async progressTutorial(userId: string, step: number): Promise<boolean> {
    const session = this.tutorialSessions.get(userId);
    
    if (!session) {
      logger.warn(`No tutorial session found for user ${userId}`);
      return false;
    }
    
    if (step < 0 || step >= session.totalSteps) {
      logger.warn(`Invalid tutorial step ${step} for user ${userId}`);
      return false;
    }
    
    // Mark step as completed
    if (!session.completedSteps.includes(step)) {
      session.completedSteps.push(step);
    }
    
    // Move to next step
    session.currentStep = Math.min(step + 1, session.totalSteps - 1);
    
    this.tutorialSessions.set(userId, session);
    logger.debug(`Tutorial progress for user ${userId}: step ${step} completed, now at step ${session.currentStep}`);
    
    return true;
  }

  /**
   * Get tutorial progress for a user
   */
  getTutorialStatus(userId: string): TutorialProgress | null {
    const session = this.tutorialSessions.get(userId);
    
    if (!session) {
      return null;
    }
    
    return {
      completed: session.completedSteps.length === session.totalSteps,
      currentStep: session.currentStep,
      completedSteps: [...session.completedSteps],
      lastAccessed: Date.now()
    };
  }

  // ============================================================================
  // Service Lifecycle Methods
  // ============================================================================

  /**
   * Get health status of the service
   */
  getHealthStatus(): ServiceHealthStatus {
    const errors: string[] = [];
    
    // Check if help topics are loaded
    if (this.contentManager.getAllTopics().length === 0) {
      errors.push('No help topics loaded');
    }
    
    // Check if command help is loaded
    if (this.contentManager.getAllCommands().length === 0) {
      errors.push('No command help loaded');
    }
    
    return {
      healthy: errors.length === 0,
      name: 'HelpSystem',
      errors,
      metrics: {
        topicsCount: this.contentManager.getAllTopics().length,
        commandsCount: this.contentManager.getAllCommands().length,
        activeTutorialSessions: this.tutorialSessions.size
      }
    };
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    logger.info('HelpSystem initialized successfully');
  }

  /**
   * Shutdown the service and clean up resources
   */
  async shutdown(): Promise<void> {
    this.tutorialSessions.clear();
    logger.info('HelpSystem shutdown completed');
  }

  // ============================================================================
  // Help Command Processing Methods
  // ============================================================================

  /**
   * Process help command with topic or command parameters
   */
  processHelpCommand(commandName?: string, topic?: string): {
    embed: EmbedBuilder;
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    let embed: EmbedBuilder;
    let components: ActionRowBuilder<ButtonBuilder>[];

    if (topic) {
      // Topic help requested
      const topicEmbed = this.createTopicEmbed(topic);
      if (!topicEmbed) {
        embed = new EmbedBuilder()
          .setTitle('❌ Topic Not Found')
          .setDescription(`Help topic "${topic}" not found. Use \`/help\` to see available topics.`)
          .setColor(0xFF0000);
        components = this.createNavigationButtons('general');
      } else {
        embed = topicEmbed;
        components = this.createNavigationButtons('topic', topic);
      }
    } else if (commandName) {
      // Command help requested
      const commandEmbed = this.createCommandEmbed(commandName);
      if (!commandEmbed) {
        embed = new EmbedBuilder()
          .setTitle('❌ Command Not Found')
          .setDescription(`Command "${commandName}" not found. Use \`/help\` to see available commands.`)
          .setColor(0xFF0000);
        components = this.createNavigationButtons('general');
      } else {
        embed = commandEmbed;
        components = this.createNavigationButtons('command', commandName);
      }
    } else {
      // General help
      embed = this.createGeneralHelpEmbed();
      components = this.createNavigationButtons('general');
    }

    return { embed, components };
  }

  /**
   * Process button interactions for help navigation
   */
  processButtonInteraction(customId: string): {
    embed: EmbedBuilder;
    components: ActionRowBuilder<ButtonBuilder>[];
  } | null {
    if (customId === 'help-back') {
      // Back to general help
      return {
        embed: this.createGeneralHelpEmbed(),
        components: this.createNavigationButtons('general')
      };
    }

    if (customId.startsWith('help-topic-')) {
      // Topic button pressed
      const topicId = customId.replace('help-topic-', '');
      const topicEmbed = this.createTopicEmbed(topicId);
      
      if (!topicEmbed) return null;
      
      return {
        embed: topicEmbed,
        components: this.createNavigationButtons('topic', topicId)
      };
    }

    return null;
  }
}