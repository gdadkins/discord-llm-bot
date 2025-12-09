import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import { IService, ServiceHealthStatus } from '../../interfaces';

/**
 * SecretManager - Advanced Secrets Management for Production
 * 
 * Provides secure secrets management with:
 * - AES-256-GCM encryption/decryption
 * - Secure storage with automatic process.env clearing
 * - Secret rotation capabilities with event emission
 * - Timing-safe comparison to prevent timing attacks
 * - External secret store integration hooks
 */
// ============================================================================

export interface SecretMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  rotatedAt?: Date;
  rotationInterval?: number; // in days
  tags?: string[];
  sensitive: boolean;
  encrypted: boolean;
}

export interface EncryptedSecret {
  id: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  algorithm: string;
  metadata: SecretMetadata;
}

export interface SecretRotationPolicy {
  rotationIntervalDays: number;
  notifyBeforeDays: number;
  autoRotate: boolean;
  rotationCallback?: (secretId: string) => Promise<string>;
}

export interface SecretStoreProvider {
  name: string;
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  listSecrets(): Promise<string[]>;
}

export interface SecretValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// ============================================================================
// SecretManager Implementation
// ============================================================================

export class SecretManager extends EventEmitter implements IService {
  private static instance: SecretManager | null = null;
  private encryptionKey: Buffer | null = null;
  private secrets: Map<string, EncryptedSecret> = new Map();
  private rotationPolicies: Map<string, SecretRotationPolicy> = new Map();
  private externalProviders: Map<string, SecretStoreProvider> = new Map();
  private rotationTimers: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized: boolean = false;
  private lastError: Error | null = null;

  // Encryption constants
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly AUTH_TAG_LENGTH = 16; // 128 bits
  private static readonly SALT_LENGTH = 32; // 256 bits
  private static readonly PBKDF2_ITERATIONS = 100000;

  // Service metadata
  private static readonly SERVICE_NAME = 'SecretManager';
  private static readonly SERVICE_VERSION = '1.0.0';

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SecretManager {
    if (!SecretManager.instance) {
      SecretManager.instance = new SecretManager();
    }
    return SecretManager.instance;
  }

  // ============================================================================
  // IService Implementation
  // ============================================================================

  public getName(): string {
    return SecretManager.SERVICE_NAME;
  }

  public getVersion(): string {
    return SecretManager.SERVICE_VERSION;
  }

  public getHealthStatus(): ServiceHealthStatus {
    return {
      healthy: this.isInitialized && !this.lastError,
      name: this.getName(),
      errors: this.lastError ? [this.lastError.message] : [],
      metrics: this.getMetrics()
    };
  }

  public getLastError(): Error | null {
    return this.lastError;
  }

  public getMetrics(): Record<string, unknown> {
    return {
      isInitialized: this.isInitialized,
      secretsCount: this.secrets.size,
      rotationPoliciesCount: this.rotationPolicies.size,
      externalProvidersCount: this.externalProviders.size,
      activeRotationTimers: this.rotationTimers.size,
      encryptionKeySet: !!this.encryptionKey
    };
  }

  // ============================================================================
  // Initialization and Lifecycle
  // ============================================================================

  /**
   * Initialize the SecretManager with master key
   */
  public async initialize(masterKey?: string): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Generate or derive encryption key
      if (masterKey) {
        this.encryptionKey = await this.deriveKeyFromMaster(masterKey);
      } else {
        // Use environment variable or generate new key
        const envKey = process.env.SECRET_MANAGER_KEY;
        if (envKey) {
          this.encryptionKey = await this.deriveKeyFromMaster(envKey);
          // Clear the key from environment for security
          delete process.env.SECRET_MANAGER_KEY;
        } else {
          // Generate new random key for this session
          this.encryptionKey = crypto.randomBytes(SecretManager.KEY_LENGTH);
          logger.warn('SecretManager: Using session-only encryption key. Secrets will not persist across restarts.');
        }
      }

      // Load any external secret providers
      await this.loadExternalProviders();

      // Start rotation timers
      this.startRotationTimers();

      this.isInitialized = true;
      this.lastError = null;

      logger.info('SecretManager initialized successfully');
      this.emit('initialized');
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to initialize SecretManager:', error);
      throw error;
    }
  }

  /**
   * Shutdown the SecretManager
   */
  public async shutdown(): Promise<void> {
    try {
      // Stop all rotation timers
      for (const timer of this.rotationTimers.values()) {
        clearInterval(timer);
      }
      this.rotationTimers.clear();

      // Clear sensitive data
      this.secrets.clear();
      this.rotationPolicies.clear();

      // Zero out encryption key
      if (this.encryptionKey) {
        this.encryptionKey.fill(0);
        this.encryptionKey = null;
      }

      this.isInitialized = false;

      logger.info('SecretManager shutdown completed');
      this.emit('shutdown');
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error('Error during SecretManager shutdown:', error);
      throw error;
    }
  }

  // ============================================================================
  // Secret Management
  // ============================================================================

  /**
   * Store a secret with encryption
   */
  public async setSecret(
    name: string,
    value: string,
    metadata?: Partial<SecretMetadata>
  ): Promise<void> {
    if (!this.isInitialized || !this.encryptionKey) {
      throw new Error('SecretManager not initialized');
    }

    try {
      // Validate secret name
      if (!this.isValidSecretName(name)) {
        throw new Error(`Invalid secret name: ${name}`);
      }

      // Create metadata
      const now = new Date();
      const secretMetadata: SecretMetadata = {
        id: crypto.randomBytes(16).toString('hex'),
        name,
        createdAt: now,
        updatedAt: now,
        sensitive: true,
        encrypted: true,
        ...metadata
      };

      // Encrypt the secret
      const encrypted = await this.encrypt(value);

      // Store encrypted secret
      this.secrets.set(name, {
        ...encrypted,
        metadata: secretMetadata
      });

      // Clear from process.env if it exists
      if (process.env[name]) {
        delete process.env[name];
      }

      logger.info(`Secret stored: ${name}`);
      this.emit('secret:stored', name, secretMetadata);
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to store secret ${name}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve and decrypt a secret
   */
  public async getSecret(name: string): Promise<string | null> {
    if (!this.isInitialized || !this.encryptionKey) {
      throw new Error('SecretManager not initialized');
    }

    try {
      // Check internal store first
      const encrypted = this.secrets.get(name);
      if (encrypted) {
        const decrypted = await this.decrypt(encrypted);
        this.emit('secret:accessed', name);
        return decrypted;
      }

      // Check external providers
      for (const [providerName, provider] of this.externalProviders) {
        try {
          const value = await provider.getSecret(name);
          if (value) {
            logger.debug(`Secret ${name} retrieved from provider: ${providerName}`);
            this.emit('secret:accessed', name, providerName);
            return value;
          }
        } catch (error) {
          logger.warn(`Failed to retrieve secret ${name} from provider ${providerName}:`, error);
        }
      }

      return null;
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to retrieve secret ${name}:`, error);
      throw error;
    }
  }

  /**
   * Delete a secret
   */
  public async deleteSecret(name: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SecretManager not initialized');
    }

    try {
      const existed = this.secrets.has(name);
      this.secrets.delete(name);

      // Remove rotation policy and timer
      this.rotationPolicies.delete(name);
      const timer = this.rotationTimers.get(name);
      if (timer) {
        clearInterval(timer);
        this.rotationTimers.delete(name);
      }

      if (existed) {
        logger.info(`Secret deleted: ${name}`);
        this.emit('secret:deleted', name);
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to delete secret ${name}:`, error);
      throw error;
    }
  }

  /**
   * List all secret names (not values)
   */
  public async listSecrets(): Promise<string[]> {
    if (!this.isInitialized) {
      throw new Error('SecretManager not initialized');
    }

    const internalSecrets = Array.from(this.secrets.keys());
    const externalSecrets: string[] = [];

    // Get secrets from external providers
    for (const [providerName, provider] of this.externalProviders) {
      try {
        const providerSecrets = await provider.listSecrets();
        externalSecrets.push(...providerSecrets);
      } catch (error) {
        logger.warn(`Failed to list secrets from provider ${providerName}:`, error);
      }
    }

    // Combine and deduplicate
    return [...new Set([...internalSecrets, ...externalSecrets])];
  }

  // ============================================================================
  // Secret Rotation
  // ============================================================================

  /**
   * Set rotation policy for a secret
   */
  public setRotationPolicy(
    secretName: string,
    policy: SecretRotationPolicy
  ): void {
    if (!this.isInitialized) {
      throw new Error('SecretManager not initialized');
    }

    this.rotationPolicies.set(secretName, policy);

    // Restart rotation timer for this secret
    this.setupRotationTimer(secretName, policy);

    logger.info(`Rotation policy set for secret: ${secretName}`);
    this.emit('rotation:policy:set', secretName, policy);
  }

  /**
   * Manually rotate a secret
   */
  public async rotateSecret(secretName: string, newValue?: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SecretManager not initialized');
    }

    try {
      const secret = this.secrets.get(secretName);
      if (!secret) {
        throw new Error(`Secret not found: ${secretName}`);
      }

      // Get new value from rotation callback or parameter
      let rotatedValue = newValue;
      const policy = this.rotationPolicies.get(secretName);

      if (!rotatedValue && policy?.rotationCallback) {
        rotatedValue = await policy.rotationCallback(secretName);
      }

      if (!rotatedValue) {
        throw new Error(`No new value provided for secret rotation: ${secretName}`);
      }

      // Store the new value
      const oldMetadata = secret.metadata;
      await this.setSecret(secretName, rotatedValue, {
        ...oldMetadata,
        rotatedAt: new Date()
      });

      logger.info(`Secret rotated: ${secretName}`);
      this.emit('secret:rotated', secretName);
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to rotate secret ${secretName}:`, error);
      throw error;
    }
  }

  /**
   * Check which secrets need rotation
   */
  public getSecretsNeedingRotation(): Array<{ name: string; daysOverdue: number }> {
    const needsRotation: Array<{ name: string; daysOverdue: number }> = [];
    const now = new Date();

    for (const [name, secret] of this.secrets) {
      const policy = this.rotationPolicies.get(name);
      if (!policy) continue;

      const lastRotated = secret.metadata.rotatedAt || secret.metadata.createdAt;
      const daysSinceRotation = Math.floor(
        (now.getTime() - lastRotated.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceRotation >= policy.rotationIntervalDays) {
        needsRotation.push({
          name,
          daysOverdue: daysSinceRotation - policy.rotationIntervalDays
        });
      }
    }

    return needsRotation;
  }

  // ============================================================================
  // External Provider Management
  // ============================================================================

  /**
   * Register an external secret store provider
   */
  public registerProvider(name: string, provider: SecretStoreProvider): void {
    this.externalProviders.set(name, provider);
    logger.info(`External secret provider registered: ${name}`);
    this.emit('provider:registered', name);
  }

  /**
   * Unregister an external provider
   */
  public unregisterProvider(name: string): void {
    this.externalProviders.delete(name);
    logger.info(`External secret provider unregistered: ${name}`);
    this.emit('provider:unregistered', name);
  }

  // ============================================================================
  // Timing-Safe Comparison
  // ============================================================================

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  public timingSafeEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);

    if (bufferA.length !== bufferB.length) {
      // Still need to be timing-safe even for different lengths
      const minLength = Math.min(bufferA.length, bufferB.length);
      const sliceA = bufferA.slice(0, minLength);
      const sliceB = bufferB.slice(0, minLength);
      crypto.timingSafeEqual(sliceA, sliceB); // Constant time operation
      return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
  }

  // ============================================================================
  // Integration Helpers
  // ============================================================================

  /**
   * Get secret for ConfigurationManager integration
   */
  public async getConfigSecret(key: string): Promise<string | undefined> {
    const value = await this.getSecret(key);
    return value || undefined;
  }

  /**
   * Validate a secret value
   */
  public validateSecret(name: string, value: string): SecretValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Length validation
    if (value.length < 8) {
      errors.push('Secret value must be at least 8 characters long');
    }

    if (value.length > 4096) {
      warnings.push('Secret value is very long (>4KB), consider using a file-based secret');
    }

    // Complexity validation for certain secret types
    if (name.toLowerCase().includes('password') || name.toLowerCase().includes('key')) {
      if (!/[A-Z]/.test(value)) {
        warnings.push('Secret should contain uppercase letters');
      }
      if (!/[a-z]/.test(value)) {
        warnings.push('Secret should contain lowercase letters');
      }
      if (!/[0-9]/.test(value)) {
        warnings.push('Secret should contain numbers');
      }
      if (!/[^A-Za-z0-9]/.test(value)) {
        warnings.push('Secret should contain special characters');
      }
    }

    // Check for common weak patterns
    const weakPatterns = ['password', '123456', 'qwerty', 'admin', 'secret'];
    for (const pattern of weakPatterns) {
      if (value.toLowerCase().includes(pattern)) {
        errors.push(`Secret contains weak pattern: ${pattern}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Derive encryption key from master key
   */
  private async deriveKeyFromMaster(masterKey: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Use a fixed salt for deterministic key derivation
      const salt = Buffer.from('SecretManager-v1-Salt-DoNotChange', 'utf-8');

      crypto.pbkdf2(
        masterKey,
        salt,
        SecretManager.PBKDF2_ITERATIONS,
        SecretManager.KEY_LENGTH,
        'sha256',
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }

  /**
   * Encrypt a value using AES-256-GCM
   */
  private async encrypt(value: string): Promise<EncryptedSecret> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not set');
    }

    const iv = crypto.randomBytes(SecretManager.IV_LENGTH);
    const cipher = crypto.createCipheriv(
      SecretManager.ALGORITHM,
      this.encryptionKey,
      iv
    ) as crypto.CipherGCM;

    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return {
      id: crypto.randomBytes(16).toString('hex'),
      encryptedValue: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      algorithm: SecretManager.ALGORITHM,
      metadata: {} as SecretMetadata // Will be set by caller
    };
  }

  /**
   * Decrypt a value using AES-256-GCM
   */
  private async decrypt(encrypted: EncryptedSecret): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not set');
    }

    const decipher = crypto.createDecipheriv(
      encrypted.algorithm,
      this.encryptionKey,
      Buffer.from(encrypted.iv, 'base64')
    ) as crypto.DecipherGCM;

    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted.encryptedValue, 'base64')),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Validate secret name
   */
  private isValidSecretName(name: string): boolean {
    // Allow alphanumeric, underscore, dash, and dot
    const pattern = /^[a-zA-Z0-9_.-]+$/;
    return pattern.test(name) && name.length > 0 && name.length <= 255;
  }

  /**
   * Load external secret providers
   */
  private async loadExternalProviders(): Promise<void> {
    // This is where you would load providers like AWS Secrets Manager,
    // HashiCorp Vault, Azure Key Vault, etc.
    // For now, we'll just log that we're ready for providers
    logger.debug('SecretManager ready for external provider registration');
  }

  /**
   * Start rotation timers for all secrets with policies
   */
  private startRotationTimers(): void {
    for (const [secretName, policy] of this.rotationPolicies) {
      this.setupRotationTimer(secretName, policy);
    }
  }

  /**
   * Setup rotation timer for a specific secret
   */
  private setupRotationTimer(secretName: string, policy: SecretRotationPolicy): void {
    // Clear existing timer
    const existingTimer = this.rotationTimers.get(secretName);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    if (!policy.autoRotate) {
      return;
    }

    // Check daily for rotation needs
    const timer = setInterval(async () => {
      try {
        const needsRotation = this.getSecretsNeedingRotation()
          .find(s => s.name === secretName);

        if (needsRotation) {
          // Emit notification event
          const daysUntilRequired = policy.rotationIntervalDays - needsRotation.daysOverdue;
          if (daysUntilRequired <= policy.notifyBeforeDays) {
            this.emit('rotation:needed', secretName, needsRotation.daysOverdue);
          }

          // Auto-rotate if overdue
          if (policy.autoRotate && needsRotation.daysOverdue > 0) {
            await this.rotateSecret(secretName);
          }
        }
      } catch (error) {
        logger.error(`Error in rotation timer for ${secretName}:`, error);
      }
    }, 24 * 60 * 60 * 1000); // Daily check

    this.rotationTimers.set(secretName, timer);
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const secretManager = SecretManager.getInstance();