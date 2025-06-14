/**
 * @file CompositeContextBuilder - Orchestrates multiple context builders
 * @module services/context/builders/CompositeContextBuilder
 */

import { RichContext } from '../types';
import { ConversationMemoryService } from '../ConversationMemoryService';
import { BehaviorAnalyzer } from '../../behaviorAnalyzer';
import { SocialDynamicsService } from '../SocialDynamicsService';
import { FactsContextBuilder } from './FactsContextBuilder';
import { BehaviorContextBuilder } from './BehaviorContextBuilder';
import { EmbarrassingMomentsContextBuilder } from './EmbarrassingMomentsContextBuilder';
import { CodeSnippetsContextBuilder } from './CodeSnippetsContextBuilder';
import { RunningGagsContextBuilder } from './RunningGagsContextBuilder';
import { SocialDynamicsContextBuilder } from './SocialDynamicsContextBuilder';
import { CrossServerContextBuilder } from './CrossServerContextBuilder';

/**
 * Orchestrates multiple specialized builders to create comprehensive context.
 * Implements the Composite pattern to manage builder composition.
 */
export class CompositeContextBuilder {
  private parts: string[] = [];
  private context: RichContext;
  private userId: string;
  private serverId: string;
  private conversationMemoryService: ConversationMemoryService;
  private behaviorAnalyzer: BehaviorAnalyzer;
  private socialDynamicsService: SocialDynamicsService;
  private serverContext: Map<string, RichContext>;

  constructor(
    context: RichContext,
    userId: string,
    serverId: string,
    conversationMemoryService: ConversationMemoryService,
    behaviorAnalyzer: BehaviorAnalyzer,
    socialDynamicsService: SocialDynamicsService,
    serverContext: Map<string, RichContext>
  ) {
    this.context = context;
    this.userId = userId;
    this.serverId = serverId;
    this.conversationMemoryService = conversationMemoryService;
    this.behaviorAnalyzer = behaviorAnalyzer;
    this.socialDynamicsService = socialDynamicsService;
    this.serverContext = serverContext;
    
    // Initialize with header
    this.parts.push('DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n');
  }

  /**
   * Add facts using specialized builder
   */
  public addFacts(): this {
    const builder = new FactsContextBuilder(
      this.context,
      this.userId,
      this.serverId,
      this.conversationMemoryService
    );
    builder.addFacts();
    this.parts.push(...builder.getParts());
    return this;
  }

  /**
   * Add behavior patterns using specialized builder
   */
  public addBehavior(): this {
    const builder = new BehaviorContextBuilder(
      this.context,
      this.userId,
      this.serverId,
      this.conversationMemoryService,
      this.behaviorAnalyzer
    );
    builder.addBehavior();
    this.parts.push(...builder.getParts());
    return this;
  }

  /**
   * Add embarrassing moments using specialized builder
   */
  public addEmbarrassingMoments(): this {
    const builder = new EmbarrassingMomentsContextBuilder(
      this.context,
      this.userId,
      this.serverId,
      this.conversationMemoryService
    );
    builder.addEmbarrassingMoments();
    this.parts.push(...builder.getParts());
    return this;
  }

  /**
   * Add code snippets using specialized builder
   */
  public addCodeSnippets(): this {
    const builder = new CodeSnippetsContextBuilder(
      this.context,
      this.userId,
      this.serverId,
      this.conversationMemoryService
    );
    builder.addCodeSnippets();
    this.parts.push(...builder.getParts());
    return this;
  }

  /**
   * Add running gags using specialized builder
   */
  public addRunningGags(): this {
    const builder = new RunningGagsContextBuilder(
      this.context,
      this.userId,
      this.serverId,
      this.conversationMemoryService
    );
    builder.addRunningGags();
    this.parts.push(...builder.getParts());
    return this;
  }

  /**
   * Add social dynamics using specialized builder
   */
  public addSocialDynamics(): this {
    const builder = new SocialDynamicsContextBuilder(
      this.context,
      this.userId,
      this.serverId,
      this.conversationMemoryService,
      this.socialDynamicsService
    );
    builder.addSocialDynamics();
    this.parts.push(...builder.getParts());
    return this;
  }

  /**
   * Add cross-server context using specialized builder
   */
  public addCrossServerContext(): this {
    const builder = new CrossServerContextBuilder(
      this.context,
      this.userId,
      this.serverId,
      this.conversationMemoryService,
      this.serverContext
    );
    builder.addCrossServerContext();
    this.parts.push(...builder.getParts());
    return this;
  }

  /**
   * Build and return the complete context
   */
  public build(): string {
    return this.parts.join('');
  }
}