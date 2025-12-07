/**
 * Type definitions for the help system
 */

export interface HelpSection {
  title: string;
  content: string;
  code?: string;
}

export interface HelpTopic {
  id?: string;
  title: string;
  description: string;
  category?: string;
  content?: string;
  relatedTopics?: string[];
  examples?: string[];
  sections: HelpSection[];
}

export interface CommandHelp {
  name: string;
  description: string;
  usage: string;
  options?: CommandOption[];
  examples: string[];
  category?: string;
  permissions?: string;
  aliases?: string[];
  relatedCommands?: string[];
  parameters?: ParameterHelp[];
}

export interface ParameterHelp {
  name: string;
  description: string;
  type: string;
  required: boolean;
  choices?: string[];
  example?: string;
}

export interface CommandOption {
  name: string;
  description: string;
  type: string;
  required: boolean;
  choices?: Array<{ name: string; value: string }>;
}

export interface HelpSearchResult {
  type: 'topic' | 'command';
  name: string;
  relevance: number;
  item?: HelpTopic | CommandHelp;
  matchedFields?: string[];
}