/**
 * Performance Integration Example
 * Shows how to integrate performance monitoring into the Discord bot
 */

import { performanceDashboard } from './performanceDashboard';
import { CacheManager } from '../services/cacheManager';
import { Message, CommandInteraction } from 'discord.js';

/**
 * Example integration with CacheManager
 */
export class PerformanceCacheManager extends CacheManager {
  async get(prompt: string, userId: string, serverId?: string): Promise<string | null> {
    const result = await super.get(prompt, userId, serverId);
    
    // Generate key for performance tracking (similar to CacheManager's internal key generation)
    const key = `${prompt}_${userId}_${serverId || 'no-server'}`;
    
    if (result) {
      performanceDashboard.recordCacheHit(key);
    } else {
      performanceDashboard.recordCacheMiss(key);
    }
    
    return result;
  }
}

/**
 * Example wrapper for message processing
 */
export async function processMessageWithMonitoring(
  message: Message,
  handler: (message: Message) => Promise<void>
): Promise<void> {
  return performanceDashboard.measure(`process_message_${message.guild?.id}`, async () => {
    try {
      await handler(message);
    } catch (error) {
      performanceDashboard.recordError(error as Error, {
        messageId: message.id,
        guildId: message.guild?.id,
        userId: message.author.id
      });
      throw error;
    }
  });
}

/**
 * Example middleware for command execution
 */
export function withPerformanceMonitoring<TArgs extends unknown[], TReturn>(
  commandName: string,
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => {
    return performanceDashboard.measure(`command_${commandName}`, async () => {
      return fn(...args);
    });
  };
}

/**
 * Initialize performance monitoring for the bot
 */
export function initializePerformanceMonitoring(): void {
  // Start the dashboard
  performanceDashboard.start();

  // Listen for alerts
  performanceDashboard.on('alert', (alert) => {
    console.error('Performance Alert:', alert);
    // Could send to Discord admin channel, external monitoring, etc.
  });

  // Listen for reports
  performanceDashboard.on('report', (report) => {
    if (report.health.status === 'critical') {
      console.error('Critical performance issues detected:', report.health.issues);
      // Could trigger automated recovery actions
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    performanceDashboard.stop();
  });

  process.on('SIGTERM', () => {
    performanceDashboard.stop();
  });
}

/**
 * Example usage in bot initialization
 */
export function setupPerformanceMonitoring() {
  // Initialize monitoring
  initializePerformanceMonitoring();

  // Get current stats endpoint (could expose via API or command)
  const getPerformanceStats = () => {
    return performanceDashboard.getStats();
  };

  // Example Discord command integration
  const performanceCommand = {
    name: 'performance',
    description: 'Show bot performance statistics',
    execute: async (interaction: CommandInteraction) => {
      const stats = getPerformanceStats();
      
      const embed = {
        title: 'Bot Performance Statistics',
        fields: [
          {
            name: 'Response Times',
            value: `Average: ${stats.responseTimes.average.toFixed(2)}ms\nP95: ${stats.responseTimes.p95.toFixed(2)}ms\nP99: ${stats.responseTimes.p99.toFixed(2)}ms`,
            inline: true
          },
          {
            name: 'Cache Performance',
            value: `Hit Rate: ${stats.cache.hitRate.toFixed(2)}%\nHits: ${stats.cache.hits}\nMisses: ${stats.cache.misses}`,
            inline: true
          },
          {
            name: 'System Health',
            value: `Memory: ${stats.memory.current.toFixed(2)}MB\nErrors: ${stats.errors.count} (${stats.errors.rate.toFixed(2)}%)\nUptime: ${(stats.uptime / 60).toFixed(2)} minutes`,
            inline: true
          }
        ],
        color: stats.errors.rate > 5 ? 0xff0000 : stats.errors.rate > 2 ? 0xffff00 : 0x00ff00,
        timestamp: new Date().toISOString()
      };
      
      await interaction.reply({ embeds: [embed] });
    }
  };

  return { performanceCommand, getPerformanceStats };
}