// import { logger } from '../utils/logger';

interface RichContext {
  conversations: Map<string, string[]>;
  codeSnippets: Map<string, string[]>;
  embarrassingMoments: string[];
  runningGags: string[];
  lastRoasted: Map<string, Date>;
}

export class ContextManager {
  private serverContext: Map<string, RichContext> = new Map();
  private readonly MAX_CONTEXT_SIZE = 500000; // characters, not tokens

  addEmbarrassingMoment(
    serverId: string,
    userId: string,
    moment: string,
  ): void {
    const context = this.getOrCreateContext(serverId);
    context.embarrassingMoments.push(`${userId}: ${moment}`);
    this.trimContext(context);
  }

  addCodeSnippet(
    serverId: string,
    userId: string,
    code: string,
    description: string,
  ): void {
    const context = this.getOrCreateContext(serverId);
    if (!context.codeSnippets.has(userId)) {
      context.codeSnippets.set(userId, []);
    }
    context.codeSnippets.get(userId)!.push(`${description}:\n${code}`);
    this.trimContext(context);
  }

  buildSuperContext(serverId: string, userId: string): string {
    const context = this.serverContext.get(serverId);
    if (!context) return '';

    let superContext = 'DEEP CONTEXT FOR MAXIMUM ROASTING:\n\n';

    // Add embarrassing moments
    if (context.embarrassingMoments.length > 0) {
      superContext += 'HALL OF SHAME:\n';
      context.embarrassingMoments.forEach((moment) => {
        superContext += `- ${moment}\n`;
      });
      superContext += '\n';
    }

    // Add their bad code
    const userCode = context.codeSnippets.get(userId);
    if (userCode && userCode.length > 0) {
      superContext += `${userId}'S TERRIBLE CODE HISTORY:\n`;
      userCode.forEach((snippet) => {
        superContext += `${snippet}\n---\n`;
      });
    }

    // Add running gags
    if (context.runningGags.length > 0) {
      superContext += 'RUNNING GAGS TO REFERENCE:\n';
      context.runningGags.forEach((gag) => {
        superContext += `- ${gag}\n`;
      });
    }

    return superContext;
  }

  private getOrCreateContext(serverId: string): RichContext {
    if (!this.serverContext.has(serverId)) {
      this.serverContext.set(serverId, {
        conversations: new Map(),
        codeSnippets: new Map(),
        embarrassingMoments: [],
        runningGags: [],
        lastRoasted: new Map(),
      });
    }
    return this.serverContext.get(serverId)!;
  }

  private trimContext(context: RichContext): void {
    // Keep context under size limit by removing oldest items
    let totalSize = JSON.stringify(context).length;

    while (totalSize > this.MAX_CONTEXT_SIZE) {
      // Remove oldest embarrassing moment
      if (context.embarrassingMoments.length > 100) {
        context.embarrassingMoments.shift();
      }

      // Trim code snippets
      for (const snippets of context.codeSnippets.values()) {
        if (snippets.length > 20) {
          snippets.shift();
        }
      }

      totalSize = JSON.stringify(context).length;
    }
  }
}
