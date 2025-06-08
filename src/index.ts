/**
 * Discord LLM Bot - Main Entry Point
 * Minimal bootstrap file that initializes and starts the bot
 */

import { config } from 'dotenv';
import { logger } from './utils/logger';
import { 
  createDiscordClient, 
  initializeBotServices, 
  validateEnvironment,
  shutdownServices,
  BotServices
} from './core/botInitializer';
import { setupEventHandlers } from './handlers/eventHandlers';
import { RaceConditionManager } from './utils/raceConditionManager';

// Load environment variables
config();

// Global services
let botServices: BotServices;
let raceConditionManager: RaceConditionManager;

/**
 * Main bot initialization
 */
async function main() {
  try {
    // Validate environment
    validateEnvironment();
    
    // Create Discord client
    const client = createDiscordClient();
    
    // Initialize race condition manager
    raceConditionManager = new RaceConditionManager();
    
    // Initialize bot services when client is ready
    client.once('ready', async (readyClient) => {
      try {
        const { geminiService, serviceRegistry } = await initializeBotServices(readyClient);
        
        botServices = { client, geminiService, serviceRegistry };
        
        // Setup event handlers
        setupEventHandlers(client, geminiService, raceConditionManager);
        
        logger.info('Bot initialization complete');
      } catch (error) {
        logger.error('Failed to initialize bot:', error);
        process.exit(1);
      }
    });
    
    // Login to Discord
    const token = process.env.DISCORD_TOKEN;
    await client.login(token);
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

/**
 * Error handlers
 */
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

/**
 * Graceful shutdown handlers
 */
async function handleShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  // Cleanup race condition resources
  if (raceConditionManager) {
    raceConditionManager.cleanup();
  }
  
  // Shutdown bot services
  if (botServices) {
    await shutdownServices(botServices);
  }
  
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Start the bot
main();