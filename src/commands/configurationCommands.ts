import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { ConfigurationManager } from '../services/config/ConfigurationManager';
import { ConfigurationAdapter } from '../services/adapters/ConfigurationAdapter';
import { logger } from '../utils/logger';

class ConfigurationCommandHandlers {
  constructor(
    private configManager: ConfigurationManager,
    private configAdapter: ConfigurationAdapter
  ) {}

  private hasAdminPermissions(interaction: ChatInputCommandInteraction): boolean {
    if (!interaction.guild || !interaction.member) return false;
    
    const member = interaction.member;
    if (typeof member.permissions === 'string') return false;
    
    return member.permissions.has('Administrator') || member.permissions.has('ManageGuild');
  }

  async handleConfigCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator or Manage Server permissions to use this command!',
        ephemeral: true
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
      case 'view':
        await this.handleConfigView(interaction);
        break;
      case 'versions':
        await this.handleConfigVersions(interaction);
        break;
      case 'rollback':
        await this.handleConfigRollback(interaction);
        break;
      case 'export':
        await this.handleConfigExport(interaction);
        break;
      case 'audit':
        await this.handleConfigAudit(interaction);
        break;
      default:
        await interaction.reply({
          content: 'Unknown configuration subcommand!',
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error('Error handling config command:', error);
      const errorMessage = 'An error occurred while processing the configuration command.';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  private async handleConfigView(interaction: ChatInputCommandInteraction): Promise<void> {
    const section = interaction.options.getString('section') || 'all';
    const config = this.configManager.getConfiguration();

    let configToShow: unknown;
    let title: string;

    switch (section) {
    case 'discord':
      configToShow = config.discord;
      title = 'Discord Configuration';
      break;
    case 'gemini':
      configToShow = config.gemini;
      title = 'Gemini Configuration';
      break;
    case 'rateLimiting':
      configToShow = config.rateLimiting;
      title = 'Rate Limiting Configuration';
      break;
    case 'features':
      configToShow = config.features;
      title = 'Features Configuration';
      break;
    case 'all':
    default:
      configToShow = config;
      title = 'Complete Bot Configuration';
      break;
    }

    const configJson = JSON.stringify(configToShow, null, 2);
    const summary = this.configAdapter.getConfigurationSummary();

    const embed = new EmbedBuilder()
      .setTitle(`📋 ${title}`)
      .setColor(0x00ff00)
      .addFields(
        {
          name: '📊 Summary',
          value: `**Version:** ${config.version}\n**Last Modified:** ${new Date(config.lastModified).toLocaleString()}\n**Modified By:** ${config.modifiedBy}\n**Registered Services:** ${summary.services.length}\n**Environment Overrides:** ${summary.environmentOverrides}`,
          inline: false
        }
      )
      .setTimestamp()
      .setFooter({ text: 'Configuration Management System' });

    // If the JSON is too long for Discord, send as attachment
    if (configJson.length > 1024) {
      const attachment = Buffer.from(configJson, 'utf-8');
      await interaction.reply({
        embeds: [embed],
        files: [{
          attachment,
          name: `${section}-config.json`
        }],
        ephemeral: true
      });
    } else {
      embed.addFields({
        name: '⚙️ Configuration',
        value: `\`\`\`json\n${configJson}\`\`\``,
        inline: false
      });

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
  }

  private async handleConfigVersions(interaction: ChatInputCommandInteraction): Promise<void> {
    const limit = interaction.options.getInteger('limit') || 10;
    const versions = await this.configManager.getVersionHistory();

    if (versions.length === 0) {
      await interaction.reply({
        content: 'No configuration version history found.',
        ephemeral: true
      });
      return;
    }

    const limitedVersions = versions.slice(0, limit);
    
    const embed = new EmbedBuilder()
      .setTitle('📋 Configuration Version History')
      .setColor(0x0099ff)
      .setTimestamp()
      .setFooter({ text: `Showing ${limitedVersions.length} of ${versions.length} versions` });

    const versionList = limitedVersions.map((version, index) => {
      const date = new Date(version.timestamp).toLocaleString();
      const current = index === 0 ? '**[CURRENT]** ' : '';
      return `${current}**${version.version}**\n${date}\nHash: \`${version.hash.substring(0, 8)}\``;
    }).join('\n\n');

    if (versionList.length > 4096) {
      // If too long, send as file
      const versionData = limitedVersions.map(v => ({
        version: v.version,
        timestamp: v.timestamp,
        hash: v.hash
      }));
      
      const attachment = Buffer.from(JSON.stringify(versionData, null, 2), 'utf-8');
      await interaction.reply({
        embeds: [embed],
        files: [{
          attachment,
          name: 'version-history.json'
        }],
        ephemeral: true
      });
    } else {
      embed.setDescription(versionList);
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
  }

  private async handleConfigRollback(interaction: ChatInputCommandInteraction): Promise<void> {
    const version = interaction.options.getString('version', true);
    const reason = interaction.options.getString('reason') || 'Manual rollback via Discord command';

    await interaction.deferReply({ ephemeral: true });

    try {
      const currentVersion = this.configManager.getConfiguration().version;
      
      await this.configManager.rollbackToVersion(version, interaction.user.id, reason);
      
      // Apply configuration to all services
      await this.configAdapter.applyConfigurationToAllServices();

      const embed = new EmbedBuilder()
        .setTitle('✅ Configuration Rollback Successful')
        .setColor(0x00ff00)
        .addFields(
          { name: 'From Version', value: currentVersion, inline: true },
          { name: 'To Version', value: version, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `Rolled back by ${interaction.user.tag}` });

      await interaction.editReply({
        embeds: [embed]
      });

      logger.info(`Configuration rolled back from ${currentVersion} to ${version} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error('Configuration rollback failed:', error);
      
      const embed = new EmbedBuilder()
        .setTitle('❌ Configuration Rollback Failed')
        .setColor(0xff0000)
        .setDescription(`Failed to rollback to version ${version}: ${error}`)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });
    }
  }

  private async handleConfigExport(interaction: ChatInputCommandInteraction): Promise<void> {
    const format = interaction.options.getString('format') || 'json';

    try {
      const configData = await this.configManager.exportConfiguration(format as 'json');
      const config = this.configManager.getConfiguration();

      const filename = `bot-config-${config.version}.${format}`;
      const attachment = Buffer.from(configData, 'utf-8');

      const embed = new EmbedBuilder()
        .setTitle('📤 Configuration Export')
        .setColor(0x00ff00)
        .addFields(
          { name: 'Version', value: config.version, inline: true },
          { name: 'Format', value: format.toUpperCase(), inline: true },
          { name: 'Size', value: `${Math.round(attachment.length / 1024)} KB`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Exported by ${interaction.user.tag}` });

      await interaction.reply({
        embeds: [embed],
        files: [{
          attachment,
          name: filename
        }],
        ephemeral: true
      });

      logger.info(`Configuration exported by ${interaction.user.tag} in ${format} format`);
    } catch (error) {
      logger.error('Configuration export failed:', error);
      await interaction.reply({
        content: `Failed to export configuration: ${error}`,
        ephemeral: true
      });
    }
  }

  private async handleConfigAudit(interaction: ChatInputCommandInteraction): Promise<void> {
    const limit = interaction.options.getInteger('limit') || 20;

    try {
      const auditLog = await this.configManager.getAuditLog(limit);

      if (auditLog.length === 0) {
        await interaction.reply({
          content: 'No configuration audit log entries found.',
          ephemeral: true
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Configuration Audit Log')
        .setColor(0x0099ff)
        .setTimestamp()
        .setFooter({ text: `Showing last ${auditLog.length} entries` });

      const auditEntries = auditLog.slice(0, 10).map(entry => {
        const date = new Date(entry.timestamp).toLocaleString();
        const pathStr = entry.path.length > 0 ? entry.path.join('.') : 'root';
        return `**${entry.changeType.toUpperCase()}** by ${entry.modifiedBy}\n${date}\nPath: \`${pathStr}\`\nSource: ${entry.source}${entry.reason ? `\nReason: ${entry.reason}` : ''}`;
      }).join('\n\n');

      if (auditEntries.length > 4096) {
        // Send as file if too long
        const auditData = auditLog.map(entry => ({
          timestamp: entry.timestamp,
          version: entry.version,
          modifiedBy: entry.modifiedBy,
          changeType: entry.changeType,
          path: entry.path.join('.') || 'root',
          source: entry.source,
          reason: entry.reason
        }));

        const attachment = Buffer.from(JSON.stringify(auditData, null, 2), 'utf-8');
        await interaction.reply({
          embeds: [embed],
          files: [{
            attachment,
            name: 'audit-log.json'
          }],
          ephemeral: true
        });
      } else {
        embed.setDescription(auditEntries);
        await interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error('Failed to retrieve audit log:', error);
      await interaction.reply({
        content: `Failed to retrieve audit log: ${error}`,
        ephemeral: true
      });
    }
  }

  async handleReloadCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator or Manage Server permissions to use this command!',
        ephemeral: true
      });
      return;
    }

    const reason = interaction.options.getString('reason') || 'Manual reload via Discord command';

    await interaction.deferReply({ ephemeral: true });

    try {
      const oldVersion = this.configManager.getConfiguration().version;
      
      await this.configManager.reloadConfiguration('command', reason);
      
      const newVersion = this.configManager.getConfiguration().version;
      const configChanged = oldVersion !== newVersion;

      if (configChanged) {
        // Apply configuration to all services
        await this.configAdapter.applyConfigurationToAllServices();
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Configuration Reload Successful')
        .setColor(0x00ff00)
        .addFields(
          { name: 'Previous Version', value: oldVersion, inline: true },
          { name: 'Current Version', value: newVersion, inline: true },
          { name: 'Changed', value: configChanged ? 'Yes' : 'No', inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `Reloaded by ${interaction.user.tag}` });

      if (configChanged) {
        embed.addFields({
          name: '🔄 Services Updated',
          value: `Configuration applied to ${this.configAdapter.getRegisteredServices().length} services`,
          inline: false
        });
      }

      await interaction.editReply({
        embeds: [embed]
      });

      logger.info(`Configuration reloaded by ${interaction.user.tag}, changed: ${configChanged}`);
    } catch (error) {
      logger.error('Configuration reload failed:', error);
      
      const embed = new EmbedBuilder()
        .setTitle('❌ Configuration Reload Failed')
        .setColor(0xff0000)
        .setDescription(`Failed to reload configuration: ${error}`)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });
    }
  }

  async handleValidateCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.hasAdminPermissions(interaction)) {
      await interaction.reply({
        content: 'You need Administrator or Manage Server permissions to use this command!',
        ephemeral: true
      });
      return;
    }

    const service = interaction.options.getString('service') || 'all';

    await interaction.deferReply({ ephemeral: true });

    try {
      let validationResults: { [serviceName: string]: { valid: boolean; errors: string[] } } = {};

      if (service === 'configManager') {
        const configHealth = this.configManager.getHealthStatus();
        validationResults['configManager'] = {
          valid: configHealth.healthy,
          errors: configHealth.errors
        };
      } else if (service === 'all') {
        // Validate configuration manager
        const configHealth = this.configManager.getHealthStatus();
        validationResults['configManager'] = {
          valid: configHealth.healthy,
          errors: configHealth.errors
        };

        // Validate all services
        const serviceValidations = await this.configAdapter.validateServiceConfigurations();
        validationResults = { ...validationResults, ...serviceValidations };
      } else {
        // Validate specific service
        const serviceValidations = await this.configAdapter.validateServiceConfigurations();
        if (serviceValidations[service]) {
          validationResults[service] = serviceValidations[service];
        } else {
          validationResults[service] = {
            valid: false,
            errors: ['Service not found or not registered']
          };
        }
      }

      const allValid = Object.values(validationResults).every(result => result.valid);
      const totalServices = Object.keys(validationResults).length;
      const validServices = Object.values(validationResults).filter(result => result.valid).length;

      const embed = new EmbedBuilder()
        .setTitle('🔍 Configuration Validation Results')
        .setColor(allValid ? 0x00ff00 : 0xff0000)
        .addFields(
          { name: 'Overall Status', value: allValid ? '✅ All Valid' : '❌ Issues Found', inline: true },
          { name: 'Services Checked', value: `${validServices}/${totalServices}`, inline: true },
          { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Validated by ${interaction.user.tag}` });

      // Add results for each service
      for (const [serviceName, result] of Object.entries(validationResults)) {
        const status = result.valid ? '✅' : '❌';
        const errorSummary = result.errors.length > 0 ? `\nErrors: ${result.errors.slice(0, 2).join(', ')}${result.errors.length > 2 ? '...' : ''}` : '';
        
        embed.addFields({
          name: `${status} ${serviceName}`,
          value: result.valid ? 'Valid' : `Invalid${errorSummary}`,
          inline: true
        });
      }

      await interaction.editReply({
        embeds: [embed]
      });

      logger.info(`Configuration validation performed by ${interaction.user.tag}, ${validServices}/${totalServices} services valid`);
    } catch (error) {
      logger.error('Configuration validation failed:', error);
      
      const embed = new EmbedBuilder()
        .setTitle('❌ Configuration Validation Failed')
        .setColor(0xff0000)
        .setDescription(`Failed to validate configuration: ${error}`)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });
    }
  }
}

export { ConfigurationCommandHandlers };