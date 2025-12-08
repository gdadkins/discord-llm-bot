/**
 * Command System Exports
 * 
 * This file serves as a legacy entry point for command-related types and utilities.
 * The actual command definitions and registration logic have been moved to:
 * - src/commands/definitions/ (Individual command files)
 * - src/commands/CommandRegistry.ts (Registration and handling)
 * - src/commands/interfaces/ (Type definitions)
 */

export * from './interfaces/MessageContext';
// Re-export extraction utility for backward compatibility with eventHandlers
export { extractRecentEmojis } from '../utils/messageContextUtils';
