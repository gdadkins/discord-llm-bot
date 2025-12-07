/**
 * Help System Service
 *
 * Provides comprehensive help functionality combining content management
 * and embed building components for Discord bot help system.
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { IHelpSystemService, CommandInfo, TutorialSession, TutorialProgress } from '../interfaces/HelpSystemInterfaces';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import { HelpContentManager, HelpTopic, SearchResult, CommandHelp } from './HelpContentManager';
import { HelpCommandBuilder } from './HelpCommandBuilder';

// Re-export types for backward compatibility
export type {
  HelpTopic,
  HelpSection,
  CommandHelp,
  ParameterHelp,
  SearchResult
} from './HelpContentManager';

interface HelpResponse {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
}

export class HelpSystem implements IHelpSystemService {
  private contentManager: HelpContentManager;
  private commandBuilder: HelpCommandBuilder;
  private tutorialSessions: Map<string, TutorialSession> = new Map();
  private tutorialProgress: Map<string, TutorialProgress> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.contentManager = new HelpContentManager();
    this.commandBuilder = new HelpCommandBuilder(this.contentManager);
  }

  // ============================================================================
  // IHelpSystemService Interface Implementation
  // ============================================================================

  getHelpTopic(topicId: string): HelpTopic | null {
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

  generateHelp(commandName?: string, userRole: 'user' | 'moderator' | 'admin' = 'user'): string {
    return this.commandBuilder.generateTextHelp(commandName, userRole);
  }

  getCommandList(userRole: 'user' | 'moderator' | 'admin' = 'user'): CommandInfo[] {
    const allCommands = this.contentManager.getAllCommands();
    const commands: CommandInfo[] = [];

    for (const cmdName of allCommands) {
      const cmd = this.contentManager.getCommandHelp(cmdName);
      if (cmd) {
        // Filter by role permission
        if (userRole === 'admin' ||
            (userRole === 'moderator' && cmd.permissions !== 'admin') ||
            (userRole === 'user' && cmd.permissions === 'all')) {
          commands.push(cmd);
        }
      }
    }

    return commands;
  }

  async startTutorial(userId: string): Promise<TutorialSession> {
    const session: TutorialSession = {
      userId,
      currentStep: 0,
      totalSteps: 5,
      startedAt: Date.now(),
      completedSteps: []
    };
    this.tutorialSessions.set(userId, session);
    return session;
  }

  async progressTutorial(userId: string, step: number): Promise<boolean> {
    const session = this.tutorialSessions.get(userId);
    if (!session) return false;

    if (!session.completedSteps.includes(step)) {
      session.completedSteps.push(step);
    }
    session.currentStep = step + 1;

    // Update progress
    this.tutorialProgress.set(userId, {
      completed: session.currentStep >= session.totalSteps,
      currentStep: session.currentStep,
      completedSteps: session.completedSteps,
      lastAccessed: Date.now()
    });

    return true;
  }

  getTutorialStatus(userId: string): TutorialProgress | null {
    return this.tutorialProgress.get(userId) || null;
  }

  getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.initialized,
      name: 'HelpSystem',
      errors: this.initialized ? [] : ['Service not initialized'],
      metrics: {
        topicsLoaded: this.contentManager.getAllTopics().length,
        commandsLoaded: this.contentManager.getAllCommands().length,
        activeTutorials: this.tutorialSessions.size
      }
    };
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.tutorialSessions.clear();
    this.tutorialProgress.clear();
    this.initialized = false;
  }

  // ============================================================================
  // Embed Building Methods
  // ============================================================================

  createTopicEmbed(topicId: string): EmbedBuilder | null {
    const topic = this.contentManager.getHelpTopic(topicId);
    if (!topic) return null;
    return this.commandBuilder.createTopicEmbed(topic);
  }

  createCommandEmbed(commandName: string): EmbedBuilder | null {
    const rawCommand = this.contentManager.getCommandHelpRaw(commandName);
    if (!rawCommand) return null;
    return this.commandBuilder.createCommandEmbed(rawCommand);
  }

  createGeneralHelpEmbed(): EmbedBuilder {
    return this.commandBuilder.createGeneralHelpEmbed();
  }

  createNavigationButtons(currentContext: 'general' | 'topic' | 'command', identifier?: string): ActionRowBuilder<ButtonBuilder>[] {
    return this.commandBuilder.createNavigationButtons(currentContext, identifier);
  }

  searchHelp(query: string): SearchResult[] {
    return this.contentManager.searchHelp(query);
  }

  createSearchResultsEmbed(query: string): EmbedBuilder {
    const results = this.contentManager.searchHelp(query);
    const embed = new EmbedBuilder()
      .setTitle(`Search Results for "${query}"`)
      .setColor(0x00AE86)
      .setTimestamp();

    if (results.length === 0) {
      embed.setDescription('No results found. Try different search terms.');
    } else {
      const resultText = results.map((r, i) => {
        const prefix = r.type === 'topic' ? '[Topic]' : '[Command]';
        return `${i + 1}. ${prefix} **${r.name}** (relevance: ${r.relevance})`;
      }).join('\n');
      embed.setDescription(resultText);
    }

    return embed;
  }

  processHelpCommand(commandName?: string, topic?: string): HelpResponse {
    let embed: EmbedBuilder;
    let context: 'general' | 'topic' | 'command' = 'general';
    let identifier: string | undefined;

    if (commandName) {
      const cmdEmbed = this.createCommandEmbed(commandName);
      if (cmdEmbed) {
        embed = cmdEmbed;
        context = 'command';
        identifier = commandName;
      } else {
        embed = this.createGeneralHelpEmbed();
        embed.addFields({
          name: 'Not Found',
          value: `Command "${commandName}" not found. Showing general help instead.`,
          inline: false
        });
      }
    } else if (topic) {
      const topicEmbed = this.createTopicEmbed(topic);
      if (topicEmbed) {
        embed = topicEmbed;
        context = 'topic';
        identifier = topic;
      } else {
        embed = this.createGeneralHelpEmbed();
        embed.addFields({
          name: 'Not Found',
          value: `Topic "${topic}" not found. Showing general help instead.`,
          inline: false
        });
      }
    } else {
      embed = this.createGeneralHelpEmbed();
    }

    return {
      embed,
      components: this.createNavigationButtons(context, identifier)
    };
  }

  processButtonInteraction(customId: string): HelpResponse | null {
    const parts = customId.split(':');
    if (parts.length < 2) return null;

    const [prefix, action, ...rest] = parts;
    if (prefix !== 'help') return null;

    switch (action) {
      case 'general':
        return this.processHelpCommand();
      case 'topic':
        return rest[0] ? this.processHelpCommand(undefined, rest[0]) : null;
      case 'command':
        return rest[0] ? this.processHelpCommand(rest[0]) : null;
      default:
        return null;
    }
  }
}
