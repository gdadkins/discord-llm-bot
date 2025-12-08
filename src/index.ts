/**
 * Discord LLM Bot - Main Entry Point
 * Minimal bootstrap file that initializes and starts the bot
 */

import { TYPES } from './di/tokens';
import { IHealthMonitor } from './services/interfaces/HealthMonitoringInterfaces';

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
    const readyHandlerId = Math.random().toString(36).substring(7);
    logger.info(`[READY - ${readyHandlerId}] Registering ready event handler...`);

    client.once('ready', async (readyClient) => {
      logger.info(`[READY - ${readyHandlerId}] Ready event fired!`);
      try {
        const { geminiService, userAnalysisService, serviceRegistry, tracingIntegration, commandRegistry, container } = await initializeBotServices(readyClient);

        botServices = { client, geminiService, userAnalysisService, serviceRegistry, tracingIntegration, commandRegistry, container };

        // Register commands with Discord using the registry
        await commandRegistry.registerCommandsWithDiscord(client);

        // Setup event handlers with tracing integration
        logger.info(`[READY - ${readyHandlerId}] Calling setupEventHandlers with tracing...`);
        setupEventHandlers(client, geminiService, raceConditionManager, userAnalysisService, tracingIntegration, commandRegistry, container);

        logger.info('Bot initialization complete with distributed tracing enabled');

        // Allow health monitor to track Discord status
        try {
          const healthMonitor = container.resolve<IHealthMonitor>(TYPES.HealthMonitor);
          healthMonitor.setDiscordConnected(true);
        } catch (error) {
          logger.error('Failed to set Discord connected status on HealthMonitor', error);
        }

        // Log initial tracing statistics
        const tracingStats = tracingIntegration.getTracingStats();
        logger.info('Tracing system operational', tracingStats);

      } catch (error) {
        logger.error('Failed to initialize bot:', error);
        process.exit(1);
      }
    });

    // Login to Discord - token validation is already done in validateEnvironment()
    const token = process.env.DISCORD_TOKEN!; // Safe to use ! since we validated
    await client.login(token);
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Register global cleanup handlers
import { globalResourceManager } from './utils/ResourceManager';

process.on('exit', () => {
  logger.info('Process exiting, performing synchronous cleanup');
});

/**
 * Error handlers
 */
process.on('unhandledRejection', async (error) => {
  logger.error('Unhandled promise rejection:', error);
  try {
    await globalResourceManager.emergencyCleanup();
  } catch (cleanupError) {
    logger.error('Emergency cleanup failed during unhandled rejection', cleanupError);
  }
});

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception:', error);
  try {
    await globalResourceManager.emergencyCleanup();
  } catch (cleanupError) {
    logger.error('Emergency cleanup failed during uncaught exception', cleanupError);
  }
  process.exit(1);
});

/**
 * Graceful shutdown handlers
 */
async function handleShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Export final tracing data before shutdown
  if (botServices?.tracingIntegration) {
    try {
      const tracingData = botServices.tracingIntegration.exportTracingData();
      logger.info('Final tracing report', tracingData);
    } catch (error) {
      logger.error('Failed to export tracing data during shutdown', error);
    }
  }

  // Cleanup race condition resources
  if (raceConditionManager) {
    raceConditionManager.cleanup();
  }

  // Shutdown bot services
  if (botServices) {
    await shutdownServices(botServices);
  } else {
    // If services aren't initialized, still try to cleanup resources
    try {
      await globalResourceManager.emergencyCleanup();
    } catch (error) {
      logger.error('Failed to cleanup resources during early shutdown', error);
    }
  }

  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Start the bot
main();