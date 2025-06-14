import { ConfigurationManager, BotConfiguration } from './configurationManager';
import { GeminiService } from './gemini/GeminiService';
import { RateLimiter } from './rateLimiter';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface ConfigurationAdapterEvents {
  'service:reconfigured': (serviceName: string, success: boolean, error?: Error) => void;
  'config:applied': (serviceName: string, changes: string[]) => void;
  'config:validation-failed': (serviceName: string, errors: string[]) => void;
}

class ConfigurationAdapter extends EventEmitter {
  private configManager: ConfigurationManager;
  private services: Map<string, unknown> = new Map();
  private configurationAppliers: Map<string, (config: BotConfiguration) => Promise<void>> = new Map();

  constructor(configManager: ConfigurationManager) {
    super();
    this.configManager = configManager;
    this.setupConfigurationAppliers();
    this.bindConfigurationEvents();
  }

  private setupConfigurationAppliers(): void {
    // GeminiService configuration applier
    this.configurationAppliers.set('gemini', async (config: BotConfiguration) => {
      const service = this.services.get('gemini') as GeminiService;
      if (!service) return;

      const geminiConfig = config.gemini;

      // Update internal configuration
      await service.updateConfiguration({
        model: geminiConfig.model,
        temperature: geminiConfig.temperature,
        topK: geminiConfig.topK,
        topP: geminiConfig.topP,
        maxTokens: geminiConfig.maxTokens,
        safetySettings: geminiConfig.safetySettings,
        systemInstructions: geminiConfig.systemInstructions,
        grounding: geminiConfig.grounding,
        thinking: geminiConfig.thinking,
        enableCodeExecution: config.features.codeExecution,
        enableStructuredOutput: config.features.structuredOutput
      });

      logger.info('GeminiService configuration updated');
    });

    // RateLimiter configuration applier
    this.configurationAppliers.set('rateLimiter', async (config: BotConfiguration) => {
      const service = this.services.get('rateLimiter') as RateLimiter;
      if (!service) return;

      const rateLimitConfig = config.rateLimiting;

      await service.updateConfiguration({
        rpmLimit: rateLimitConfig.rpm,
        dailyLimit: rateLimitConfig.daily,
        burstSize: rateLimitConfig.burstSize,
        safetyMargin: rateLimitConfig.safetyMargin,
        retryOptions: rateLimitConfig.retryOptions
      });

      logger.info('RateLimiter configuration updated');
    });

    // TODO: Add configuration appliers for other services when they implement updateConfiguration
    // For now, only GeminiService and RateLimiter have updateConfiguration methods
  }

  private bindConfigurationEvents(): void {
    this.configManager.on('config:changed', async (_changes) => {
      logger.info(`Configuration changed, applying to ${this.services.size} services`);
      await this.applyConfigurationToAllServices();
    });

    this.configManager.on('config:reloaded', async (version) => {
      logger.info(`Configuration reloaded to version ${version}, applying to services`);
      await this.applyConfigurationToAllServices();
    });

    this.configManager.on('config:rollback', async (fromVersion, toVersion) => {
      logger.info(`Configuration rolled back from ${fromVersion} to ${toVersion}, applying to services`);
      await this.applyConfigurationToAllServices();
    });
  }

  registerService(serviceName: string, service: unknown): void {
    this.services.set(serviceName, service);
    logger.info(`Service '${serviceName}' registered with ConfigurationAdapter`);

    // Apply current configuration to newly registered service
    this.applyConfigurationToService(serviceName).catch(error => {
      logger.error(`Failed to apply configuration to newly registered service '${serviceName}':`, error);
    });
  }

  unregisterService(serviceName: string): void {
    this.services.delete(serviceName);
    logger.info(`Service '${serviceName}' unregistered from ConfigurationAdapter`);
  }

  async applyConfigurationToService(serviceName: string): Promise<void> {
    const applier = this.configurationAppliers.get(serviceName);
    if (!applier) {
      logger.warn(`No configuration applier found for service '${serviceName}'`);
      return;
    }

    const service = this.services.get(serviceName);
    if (!service) {
      logger.warn(`Service '${serviceName}' not registered`);
      return;
    }

    try {
      const config = this.configManager.getConfiguration();
      await applier(config);
      this.emit('service:reconfigured', serviceName, true);
      logger.info(`Configuration successfully applied to service '${serviceName}'`);
    } catch (error) {
      logger.error(`Failed to apply configuration to service '${serviceName}':`, error);
      this.emit('service:reconfigured', serviceName, false, error as Error);
      throw error;
    }
  }

  async applyConfigurationToAllServices(): Promise<void> {
    const results: { [serviceName: string]: { success: boolean; error?: Error } } = {};

    for (const serviceName of this.services.keys()) {
      try {
        await this.applyConfigurationToService(serviceName);
        results[serviceName] = { success: true };
      } catch (error) {
        results[serviceName] = { success: false, error: error as Error };
      }
    }

    const successCount = Object.values(results).filter(r => r.success).length;
    const totalCount = Object.keys(results).length;

    if (successCount === totalCount) {
      logger.info(`Configuration successfully applied to all ${totalCount} services`);
    } else {
      const failedServices = Object.entries(results)
        .filter(([, result]) => !result.success)
        .map(([serviceName]) => serviceName);
      
      logger.error(`Configuration application failed for services: ${failedServices.join(', ')}`);
      throw new Error(`Failed to apply configuration to ${failedServices.length} out of ${totalCount} services`);
    }
  }

  async validateServiceConfigurations(): Promise<{ [serviceName: string]: { valid: boolean; errors: string[] } }> {
    const results: { [serviceName: string]: { valid: boolean; errors: string[] } } = {};
    const config = this.configManager.getConfiguration();

    for (const [serviceName, service] of this.services) {
      try {
        // Check if service has a validateConfiguration method
        if (service && typeof (service as { validateConfiguration?: unknown }).validateConfiguration === 'function') {
          const validation = await (service as { validateConfiguration: (config: BotConfiguration) => Promise<{ valid: boolean; errors: string[] }> }).validateConfiguration(config);
          results[serviceName] = validation;
          
          if (!validation.valid) {
            this.emit('config:validation-failed', serviceName, validation.errors);
          }
        } else {
          // Assume valid if no validation method
          results[serviceName] = { valid: true, errors: [] };
        }
      } catch (error) {
        const errorMessage = `Validation error: ${error}`;
        results[serviceName] = { valid: false, errors: [errorMessage] };
        this.emit('config:validation-failed', serviceName, [errorMessage]);
      }
    }

    return results;
  }

  async reloadServiceConfiguration(serviceName: string): Promise<void> {
    if (!this.services.has(serviceName)) {
      throw new Error(`Service '${serviceName}' is not registered`);
    }

    await this.applyConfigurationToService(serviceName);
    logger.info(`Configuration reloaded for service '${serviceName}'`);
  }

  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  getServiceConfiguration(serviceName: string): unknown {
    const config = this.configManager.getConfiguration();
    
    switch (serviceName) {
    case 'gemini':
      return {
        gemini: config.gemini,
        rateLimiting: config.rateLimiting,
        roasting: config.features.roasting,
        contextMemory: config.features.contextMemory,
        caching: config.features.caching,
        codeExecution: config.features.codeExecution,
        structuredOutput: config.features.structuredOutput
      };
      
    case 'rateLimiter':
      return config.rateLimiting;
      
    case 'contextManager':
      return config.features.contextMemory;
      
    case 'personalityManager':
      return { roasting: config.features.roasting };
      
    case 'healthMonitor':
      return config.features.monitoring;
      
    case 'cacheManager':
      return config.features.caching;
      
    default:
      throw new Error(`Unknown service configuration for '${serviceName}'`);
    }
  }

  async testConfigurationApplication(): Promise<{ [serviceName: string]: boolean }> {
    const results: { [serviceName: string]: boolean } = {};

    for (const serviceName of this.services.keys()) {
      try {
        await this.applyConfigurationToService(serviceName);
        results[serviceName] = true;
      } catch (error) {
        logger.error(`Test configuration application failed for '${serviceName}':`, error);
        results[serviceName] = false;
      }
    }

    return results;
  }

  getConfigurationSummary(): {
    services: string[];
    configurationStatus: { [serviceName: string]: boolean };
    lastConfigUpdate: string;
    environmentOverrides: number;
    } {
    const config = this.configManager.getConfiguration();
    
    return {
      services: this.getRegisteredServices(),
      configurationStatus: this.getRegisteredServices().reduce((acc, service) => {
        acc[service] = this.services.has(service);
        return acc;
      }, {} as { [serviceName: string]: boolean }),
      lastConfigUpdate: config.lastModified,
      environmentOverrides: 0 // TODO: Access through public method
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down ConfigurationAdapter...');
    
    // Remove all event listeners
    this.configManager.removeAllListeners();
    this.removeAllListeners();
    
    // Clear services
    this.services.clear();
    this.configurationAppliers.clear();
    
    logger.info('ConfigurationAdapter shutdown completed');
  }
}

export { ConfigurationAdapter };