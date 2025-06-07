import { ChatInputCommandInteraction, PermissionsBitField, Client } from 'discord.js';
import { AnalyticsManager } from '../services/analyticsManager';
import { logger } from '../utils/logger';

export class AnalyticsCommandHandlers {
  constructor(private analyticsManager: AnalyticsManager) {}

  async handleAnalyticsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.analyticsManager.isEnabled()) {
      await interaction.reply({
        content: 'Analytics system is not enabled on this bot.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
    case 'stats':
      await this.handleAnalyticsStats(interaction);
      break;
    case 'commands':
      await this.handleAnalyticsCommands(interaction);
      break;
    case 'errors':
      await this.handleAnalyticsErrors(interaction);
      break;
    case 'performance':
      await this.handleAnalyticsPerformance(interaction);
      break;
    case 'system':
      await this.handleAnalyticsSystem(interaction);
      break;
    case 'discord-storage':
      await this.handleDiscordStorageAnalytics(interaction);
      break;
    default:
      await interaction.reply({
        content: 'Unknown analytics subcommand.',
        ephemeral: true,
      });
    }
  }

  async handleReportsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.analyticsManager.isEnabled()) {
      await interaction.reply({
        content: 'Analytics system is not enabled on this bot.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
    case 'generate':
      await this.handleReportsGenerate(interaction);
      break;
    case 'schedule':
      await this.handleReportsSchedule(interaction);
      break;
    default:
      await interaction.reply({
        content: 'Unknown reports subcommand.',
        ephemeral: true,
      });
    }
  }

  async handlePrivacyCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
    case 'status':
      await this.handlePrivacyStatus(interaction);
      break;
    case 'optout':
      await this.handlePrivacyOptOut(interaction);
      break;
    case 'optin':
      await this.handlePrivacyOptIn(interaction);
      break;
    case 'export':
      await this.handlePrivacyExport(interaction);
      break;
    case 'delete':
      await this.handlePrivacyDelete(interaction);
      break;
    case 'retention':
      await this.handlePrivacyRetention(interaction);
      break;
    default:
      await interaction.reply({
        content: 'Unknown privacy subcommand.',
        ephemeral: true,
      });
    }
  }

  // Analytics Commands
  private async handleAnalyticsStats(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator permissions to view analytics.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const timeframe = interaction.options.getString('timeframe') || '24h';
      const hours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720; // 30 days

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (hours * 60 * 60 * 1000));

      const stats = await this.analyticsManager.getUsageStatistics(startDate, endDate, interaction.guildId || undefined);
      const systemStats = await this.analyticsManager.getSystemStats();

      if (!stats || !systemStats) {
        await interaction.editReply('No analytics data available for the specified timeframe.');
        return;
      }

      const embed = {
        title: `📊 Analytics Statistics (${timeframe})`,
        color: 0x00ff00,
        fields: [
          {
            name: '📈 Usage Summary',
            value: `**Commands:** ${stats.summary.totalCommands}\n**Unique Users:** ${stats.summary.uniqueUsers}\n**Success Rate:** ${(stats.summary.avgSuccessRate * 100).toFixed(1)}%\n**Avg Response Time:** ${Math.round(stats.summary.avgResponseTime)}ms`,
            inline: true,
          },
          {
            name: '🏆 Top Commands',
            value: (stats.commandBreakdown as Array<{ command_name: string; command_count: number }>).slice(0, 5).map((cmd, index: number) => 
              `${index + 1}. **${cmd.command_name}**: ${cmd.command_count} uses`
            ).join('\n') || 'No data',
            inline: true,
          },
          {
            name: '💾 System Info',
            value: `**Total Users:** ${systemStats.totalUsers}\n**Total Commands:** ${systemStats.totalCommands}\n**Active Sessions:** ${systemStats.activeSessions}\n**Privacy Mode:** ${systemStats.privacyMode}`,
            inline: true,
          },
        ],
        footer: {
          text: `Period: ${stats.period.start} to ${stats.period.end}`,
        },
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in analytics stats command:', error);
      await interaction.editReply('Error retrieving analytics statistics.');
    }
  }

  private async handleAnalyticsCommands(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator permissions to view analytics.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const period = interaction.options.getString('period') || 'weekly';
      const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      const stats = await this.analyticsManager.getUsageStatistics(startDate, endDate, interaction.guildId || undefined);

      if (!stats || !stats.commandBreakdown.length) {
        await interaction.editReply('No command usage data available for the specified period.');
        return;
      }

      const totalCommands = stats.summary.totalCommands;
      const commandList = (stats.commandBreakdown as Array<{ command_name: string; command_count: number; success_rate: number }>).slice(0, 10).map((cmd, index: number) => {
        const percentage = ((cmd.command_count / totalCommands) * 100).toFixed(1);
        const successRate = (cmd.success_rate * 100).toFixed(1);
        return `${index + 1}. **${cmd.command_name}** - ${cmd.command_count} uses (${percentage}%) - ${successRate}% success`;
      }).join('\n');

      const embed = {
        title: `🎯 Command Usage Analytics (${period})`,
        color: 0x0099ff,
        description: `**Total Commands:** ${totalCommands}\n**Unique Users:** ${stats.summary.uniqueUsers}\n**Average Success Rate:** ${(stats.summary.avgSuccessRate * 100).toFixed(1)}%`,
        fields: [
          {
            name: '📊 Command Breakdown',
            value: commandList,
            inline: false,
          },
        ],
        footer: {
          text: `Analysis Period: ${period} | ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
        },
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in analytics commands command:', error);
      await interaction.editReply('Error retrieving command usage analytics.');
    }
  }

  private async handleAnalyticsErrors(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator permissions to view analytics.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const category = interaction.options.getString('category') || 'all';

      // For now, provide a placeholder response since error analytics would require
      // more complex database queries
      const embed = {
        title: '🚨 Error Pattern Analysis',
        color: 0xff6b6b,
        description: `Error analysis for category: **${category}**\nAnalyzing last 7 days of data...`,
        fields: [
          {
            name: '📊 Error Summary',
            value: 'Error pattern analysis is being implemented.\nCheck back soon for detailed error insights.',
            inline: false,
          },
          {
            name: '🔧 Recommendations',
            value: '• Monitor error trends regularly\n• Implement proper error handling\n• Review API integration patterns',
            inline: false,
          },
        ],
        footer: {
          text: 'Error analytics will be fully available in the next update',
        },
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in analytics errors command:', error);
      await interaction.editReply('Error retrieving error analytics.');
    }
  }

  private async handleAnalyticsPerformance(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator permissions to view analytics.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (24 * 60 * 60 * 1000)); // Last 24 hours

      const stats = await this.analyticsManager.getUsageStatistics(startDate, endDate);

      const embed = {
        title: '⚡ Performance Analytics',
        color: 0xffd93d,
        fields: [
          {
            name: '📊 Response Times',
            value: stats ? `**Average:** ${Math.round(stats.summary.avgResponseTime)}ms\n**Success Rate:** ${(stats.summary.avgSuccessRate * 100).toFixed(1)}%` : 'No data available',
            inline: true,
          },
          {
            name: '🎯 Performance Trends',
            value: 'Trend analysis is being implemented.\nCheck back soon for detailed insights.',
            inline: true,
          },
          {
            name: '💡 Optimization Tips',
            value: '• Monitor response times regularly\n• Optimize slow commands\n• Review caching strategies',
            inline: false,
          },
        ],
        footer: {
          text: 'Performance analytics will be expanded in future updates',
        },
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in analytics performance command:', error);
      await interaction.editReply('Error retrieving performance analytics.');
    }
  }

  private async handleAnalyticsSystem(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator permissions to view analytics.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const systemStats = await this.analyticsManager.getSystemStats();
      const config = this.analyticsManager.getConfiguration();

      if (!systemStats) {
        await interaction.editReply('Analytics system information is not available.');
        return;
      }

      const embed = {
        title: '🔧 Analytics System Information',
        color: 0x6c5ce7,
        fields: [
          {
            name: '📊 Database Statistics',
            value: `**Total Commands:** ${systemStats.totalCommands.toLocaleString()}\n**Total Users:** ${systemStats.totalUsers.toLocaleString()}\n**Total Errors:** ${systemStats.totalErrors.toLocaleString()}\n**Database Size:** ${(systemStats.databaseSize / 1024 / 1024).toFixed(2)} MB`,
            inline: true,
          },
          {
            name: '🔒 Privacy & Compliance',
            value: `**Privacy Mode:** ${config.privacyMode}\n**Retention:** ${config.retentionDays} days\n**Opted Out Users:** ${systemStats.optedOutUsers}\n**Cross-Server:** ${config.allowCrossServerAnalysis ? 'Enabled' : 'Disabled'}`,
            inline: true,
          },
          {
            name: '⚙️ System Configuration',
            value: `**Analytics:** ${config.enabled ? 'Enabled' : 'Disabled'}\n**Reporting:** ${config.reportingEnabled ? 'Enabled' : 'Disabled'}\n**Report Schedule:** ${config.reportSchedule}\n**Active Sessions:** ${systemStats.activeSessions}`,
            inline: false,
          },
          {
            name: '🛡️ Data Protection',
            value: '• All user identifiers are hashed (SHA-256)\n• No message content is stored\n• GDPR-compliant data handling\n• User-controlled data retention\n• Full data export/deletion available',
            inline: false,
          },
        ],
        footer: {
          text: 'Analytics system respects user privacy and follows data protection regulations',
        },
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in analytics system command:', error);
      await interaction.editReply('Error retrieving system information.');
    }
  }

  // Reports Commands
  private async handleReportsGenerate(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator permissions to generate reports.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const period = interaction.options.getString('period', true) as 'daily' | 'weekly' | 'monthly';
      
      const report = await this.analyticsManager.generateReport(period);

      const embed = {
        title: `📋 ${period.charAt(0).toUpperCase() + period.slice(1)} Analytics Report`,
        color: 0x00ff88,
        fields: [
          {
            name: '📊 Summary',
            value: `**Commands:** ${report.summary.totalCommands}\n**Users:** ${report.summary.uniqueUsers}\n**Success Rate:** ${(report.summary.successRate * 100).toFixed(1)}%\n**Avg Response:** ${Math.round(report.summary.avgResponseTime)}ms`,
            inline: true,
          },
          {
            name: '🏆 Top Commands',
            value: report.insights.mostPopularCommands.slice(0, 5).map((cmd: { command: string; count: number }, index: number) => 
              `${index + 1}. **${cmd.command}**: ${cmd.count} uses`
            ).join('\n') || 'No data',
            inline: true,
          },
          {
            name: '📈 Trends',
            value: `**Engagement:** ${report.summary.engagementTrend}\n**Error Rate:** ${report.summary.errorRate.toFixed(2)}%`,
            inline: true,
          },
          {
            name: '💡 Recommendations',
            value: report.recommendations.slice(0, 3).map(rec => `• ${rec}`).join('\n') || 'No recommendations',
            inline: false,
          },
        ],
        footer: {
          text: `Report Period: ${new Date(report.startDate).toLocaleDateString()} - ${new Date(report.endDate).toLocaleDateString()}`,
        },
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error generating analytics report:', error);
      await interaction.editReply('Error generating analytics report.');
    }
  }

  private async handleReportsSchedule(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator permissions to configure report scheduling.',
        ephemeral: true,
      });
      return;
    }

    try {
      const enabled = interaction.options.getBoolean('enabled', true);
      const frequency = interaction.options.getString('frequency');

      const updateConfig: Record<string, unknown> = { reportingEnabled: enabled };

      if (frequency) {
        updateConfig.reportSchedule = frequency as 'daily' | 'weekly' | 'monthly';
      }

      await this.analyticsManager.updateConfiguration(updateConfig);

      const status = enabled ? 'enabled' : 'disabled';
      const scheduleText = frequency ? ` (${frequency})` : '';

      await interaction.reply({
        content: `✅ Automated report generation has been **${status}**${scheduleText}.`,
        ephemeral: true,
      });
    } catch (error) {
      logger.error('Error updating report schedule:', error);
      await interaction.reply({
        content: 'Error updating report schedule configuration.',
        ephemeral: true,
      });
    }
  }

  // Privacy Commands
  private async handlePrivacyStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const privacySettings = await this.analyticsManager.getUserPrivacySettings(interaction.user.id);

      const embed = {
        title: '🔒 Your Privacy Settings',
        color: 0x74b9ff,
        fields: [
          {
            name: '📊 Analytics Participation',
            value: privacySettings.optedOut ? '❌ Opted Out' : '✅ Opted In',
            inline: true,
          },
          {
            name: '📅 Data Retention',
            value: `${privacySettings.dataRetentionDays} days`,
            inline: true,
          },
          {
            name: '📈 Insights Contribution',
            value: privacySettings.allowInsights ? '✅ Enabled' : '❌ Disabled',
            inline: true,
          },
          {
            name: '🛡️ Data Protection',
            value: '• Your identity is anonymized (hashed)\n• No message content is stored\n• Data is automatically deleted per retention policy\n• You can export or delete your data anytime',
            inline: false,
          },
        ],
        footer: {
          text: 'Use /privacy commands to modify these settings',
        },
      };

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error('Error retrieving privacy status:', error);
      await interaction.reply({
        content: 'Error retrieving your privacy settings.',
        ephemeral: true,
      });
    }
  }

  private async handlePrivacyOptOut(interaction: ChatInputCommandInteraction): Promise<void> {
    const confirm = interaction.options.getBoolean('confirm', true);

    if (!confirm) {
      await interaction.reply({
        content: 'Opt-out cancelled. Your analytics participation remains unchanged.',
        ephemeral: true,
      });
      return;
    }

    try {
      await this.analyticsManager.setUserPrivacySettings(interaction.user.id, {
        optedOut: true,
      });

      await interaction.reply({
        content: '✅ You have successfully opted out of analytics data collection. Your existing data has been deleted.\n\n' +
                 'You can opt back in anytime using `/privacy optin`.',
        ephemeral: true,
      });
    } catch (error) {
      logger.error('Error opting user out of analytics:', error);
      await interaction.reply({
        content: 'Error processing your opt-out request. Please try again.',
        ephemeral: true,
      });
    }
  }

  private async handlePrivacyOptIn(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await this.analyticsManager.setUserPrivacySettings(interaction.user.id, {
        optedOut: false,
      });

      await interaction.reply({
        content: '✅ You have successfully opted back into analytics data collection.\n\n' +
                 'Your usage data will be collected starting now to help improve the bot.',
        ephemeral: true,
      });
    } catch (error) {
      logger.error('Error opting user into analytics:', error);
      await interaction.reply({
        content: 'Error processing your opt-in request. Please try again.',
        ephemeral: true,
      });
    }
  }

  private async handlePrivacyExport(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const exportData = await this.analyticsManager.exportUserData(interaction.user.id);

      if (!exportData) {
        await interaction.editReply('No data found for your account, or analytics is not enabled.');
        return;
      }

      const exportText = JSON.stringify(exportData, null, 2);
      
      // If data is small enough, send as code block
      if (exportText.length < 1800) {
        await interaction.editReply({
          content: '📊 Your exported data:\n```json\n' + exportText + '\n```\n\n' +
                   '**Note:** All user identifiers have been anonymized for privacy.',
        });
      } else {
        // For larger data, provide summary and offer to send as file
        await interaction.editReply({
          content: '📊 Your data export is ready!\n\n' +
                   `**Export Date:** ${exportData.exportDate}\n` +
                   `**Command Usage Records:** ${exportData.commandUsage?.length || 0}\n` +
                   `**Engagement Records:** ${exportData.engagement?.length || 0}\n\n` +
                   '**Note:** Due to size limits, detailed data export via file is not yet implemented. ' +
                   'Contact an administrator for full data export.',
        });
      }
    } catch (error) {
      logger.error('Error exporting user data:', error);
      await interaction.editReply('Error exporting your data. Please try again.');
    }
  }

  private async handlePrivacyDelete(interaction: ChatInputCommandInteraction): Promise<void> {
    const confirm = interaction.options.getBoolean('confirm', true);

    if (!confirm) {
      await interaction.reply({
        content: 'Data deletion cancelled. Your data remains unchanged.',
        ephemeral: true,
      });
      return;
    }

    try {
      await this.analyticsManager.deleteUserData(interaction.user.id);

      // Also opt them out to prevent future data collection
      await this.analyticsManager.setUserPrivacySettings(interaction.user.id, {
        optedOut: true,
      });

      await interaction.reply({
        content: '✅ All your stored data has been permanently deleted, and you have been opted out of future data collection.\n\n' +
                 'You can opt back in anytime using `/privacy optin`.',
        ephemeral: true,
      });
    } catch (error) {
      logger.error('Error deleting user data:', error);
      await interaction.reply({
        content: 'Error deleting your data. Please try again.',
        ephemeral: true,
      });
    }
  }

  private async handlePrivacyRetention(interaction: ChatInputCommandInteraction): Promise<void> {
    const days = interaction.options.getInteger('days', true);

    try {
      await this.analyticsManager.setUserPrivacySettings(interaction.user.id, {
        dataRetentionDays: days,
      });

      await interaction.reply({
        content: `✅ Your data retention period has been set to **${days} days**.\n\n` +
                 'Your data older than this period will be automatically deleted.',
        ephemeral: true,
      });
    } catch (error) {
      logger.error('Error updating data retention:', error);
      await interaction.reply({
        content: 'Error updating your data retention settings. Please try again.',
        ephemeral: true,
      });
    }
  }

  async handleDiscordStorageAnalytics(interaction: ChatInputCommandInteraction): Promise<void> {
    // Get context manager from bot client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contextManager = (interaction.client as Client & { contextManager?: any }).contextManager;
    if (!contextManager) {
      await interaction.reply({
        content: 'Context manager not available.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const storageStats = contextManager.getDiscordDataStorageStats();
      
      // Format server breakdown
      const serverEntries = Array.from(storageStats.serverBreakdown.entries()) as [string, number][];
      const serverBreakdown = serverEntries
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([serverId, size]) => {
          const server = interaction.client.guilds.cache.get(serverId);
          const serverName = server ? server.name : `Server ${serverId}`;
          const sizeMB = (size / (1024 * 1024)).toFixed(3);
          return `• ${serverName}: ${sizeMB} MB`;
        })
        .join('\n');

      const embed = {
        color: 0x00ff00,
        title: 'Discord Data Storage Analytics',
        fields: [
          {
            name: 'Overall Storage',
            value: `**Total Size:** ${storageStats.estimatedSizeMB} MB\n**Cache Entries:** ${storageStats.cacheEntries.toLocaleString()}\n**Cache Duration:** 1 year`,
            inline: false,
          },
          {
            name: 'Cache Age',
            value: `**Oldest Entry:** ${storageStats.oldestEntry ? storageStats.oldestEntry.toLocaleString() : 'N/A'}\n**Newest Entry:** ${storageStats.newestEntry ? storageStats.newestEntry.toLocaleString() : 'N/A'}`,
            inline: false,
          },
          {
            name: 'Top 10 Servers by Storage',
            value: serverBreakdown || 'No data available',
            inline: false,
          },
          {
            name: 'Storage Breakdown',
            value: `• Discord Profile Cache: ~${(storageStats.cacheEntries * 0.5 / 1024).toFixed(2)} MB (est.)\n• Social Graph Data: ~${(storageStats.estimatedSizeMB - (storageStats.cacheEntries * 0.5 / 1024)).toFixed(2)} MB`,
            inline: false,
          },
          {
            name: 'Recommendations',
            value: storageStats.cacheEntries > 5000 
              ? '⚠️ Consider running `/analytics cleanup-discord` to remove old entries' 
              : '✅ Storage usage is within healthy limits',
            inline: false,
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Discord data includes user profiles and social interaction tracking',
        },
      };

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error('Error generating Discord storage analytics:', error);
      await interaction.editReply({
        content: 'Error generating Discord storage analytics. Please try again.',
      });
    }
  }

  // Utility Methods
  private hasAdminPermissions(interaction: ChatInputCommandInteraction): boolean {
    if (!interaction.guild || !interaction.member) return false;
    
    const member = interaction.member;
    if (typeof member.permissions === 'string') return false;
    
    return member.permissions.has(PermissionsBitField.Flags.Administrator) || 
           member.permissions.has(PermissionsBitField.Flags.ManageGuild);
  }
}