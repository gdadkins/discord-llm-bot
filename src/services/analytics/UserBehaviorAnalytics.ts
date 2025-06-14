/**
 * User Behavior Analytics Service
 * 
 * Handles user engagement tracking, session management, and privacy settings.
 * Part of the refactored analytics system (REF005).
 * 
 * @module UserBehaviorAnalytics
 */

import { Mutex } from 'async-mutex';
import * as crypto from 'crypto-js';
import { BaseService } from '../base/BaseService';
import { logger } from '../../utils/logger';
import type { 
  IAnalyticsPrivacyManager,
  UserPrivacySettings,
  ExportData,
  UserEngagementEvent
} from '../interfaces/AnalyticsInterfaces';
import type { ServiceHealthStatus } from '../interfaces/CoreServiceInterfaces';
import Database from 'better-sqlite3';

interface SessionTracker {
  sessionId: string;
  userHash: string;
  serverHash: string;
  startTime: number;
  lastActivity: number;
  commandCount: number;
  interactions: number;
}

interface UserPrivacyRow {
  user_hash: string;
  opted_out: number;
  data_retention_days: number;
  allow_insights: number;
  last_updated: number;
}

export interface IUserBehaviorAnalytics extends IAnalyticsPrivacyManager {
  /**
   * Track user engagement events
   */
  trackUserEngagement(
    userId: string,
    serverId: string | null,
    eventType: 'command' | 'mention' | 'reaction'
  ): Promise<void>;
  
  /**
   * Update user session information
   */
  updateUserSession(
    userHash: string,
    serverHash: string,
    eventType: string
  ): Promise<void>;
  
  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number;
  
  /**
   * Clean up inactive sessions
   */
  cleanupInactiveSessions(): void;
  
  /**
   * Hash identifier for privacy
   */
  hashIdentifier(id: string): string;
}

/**
 * User Behavior Analytics Service Implementation
 * 
 * Tracks user engagement patterns while maintaining privacy compliance.
 */
export class UserBehaviorAnalytics extends BaseService implements IUserBehaviorAnalytics {
  private database: Database.Database | null = null;
  private readonly sessionMutex = new Mutex();
  private readonly privacyMutex = new Mutex();
  
  // Session tracking
  private activeSessions = new Map<string, SessionTracker>();
  private sessionTimeoutMs = 30 * 60 * 1000; // 30 minutes
  
  // Privacy settings cache
  private privacySettings = new Map<string, UserPrivacySettings>();
  
  // Timer for session cleanup
  private sessionCleanupTimer: NodeJS.Timeout | null = null;
  
  // Configuration
  private retentionDays: number;
  private privacyMode: 'strict' | 'balanced' | 'full';

  constructor(database: Database.Database | null, config: {
    retentionDays: number;
    privacyMode: 'strict' | 'balanced' | 'full';
  }) {
    super();
    this.database = database;
    this.retentionDays = config.retentionDays;
    this.privacyMode = config.privacyMode;
  }
  
  /**
   * Get service name
   */
  protected getServiceName(): string {
    return 'UserBehaviorAnalytics';
  }

  /**
   * Perform service-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    await this.loadPrivacySettings();
    this.startSessionCleanupTimer();
    
    logger.info('UserBehaviorAnalytics initialized', {
      privacySettingsLoaded: this.privacySettings.size,
      retentionDays: this.retentionDays,
      privacyMode: this.privacyMode
    });
  }

  /**
   * Perform service-specific shutdown
   */
  protected async performShutdown(): Promise<void> {
    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
      this.sessionCleanupTimer = null;
    }
  }

  /**
   * Hash identifier for privacy compliance
   */
  hashIdentifier(id: string): string {
    const salt = process.env.ANALYTICS_SALT || 'discord-llm-bot-analytics';
    return crypto.SHA256(id + salt).toString();
  }

  /**
   * Track user engagement events
   */
  async trackUserEngagement(
    userId: string,
    serverId: string | null,
    eventType: 'command' | 'mention' | 'reaction'
  ): Promise<void> {
    if (!this.database) return;

    const userHash = this.hashIdentifier(userId);
    const serverHash = serverId ? this.hashIdentifier(serverId) : 'dm';

    // Check if user opted out
    const privacy = await this.getUserPrivacySettings(userId);
    if (privacy.optedOut) return;

    await this.updateUserSession(userHash, serverHash, eventType);
  }

  /**
   * Update user session information
   */
  async updateUserSession(
    userHash: string,
    serverHash: string,
    eventType: string
  ): Promise<void> {
    const sessionRelease = await this.sessionMutex.acquire();
    try {
      const sessionKey = `${userHash}-${serverHash}`;
      const now = Date.now();
      
      let session = this.activeSessions.get(sessionKey);
      
      if (!session || (now - session.lastActivity) > this.sessionTimeoutMs) {
        // Start new session
        const sessionId = `${now}-${Math.random().toString(36).substr(2, 9)}`;
        session = {
          sessionId,
          userHash,
          serverHash,
          startTime: now,
          lastActivity: now,
          commandCount: 0,
          interactions: 0,
        };
        this.activeSessions.set(sessionKey, session);
      }

      // Update session
      session.lastActivity = now;
      session.interactions++;
      if (eventType === 'command') {
        session.commandCount++;
      }

      // Store engagement event
      if (this.database) {
        const stmt = this.database.prepare(`
          INSERT INTO user_engagement 
          (timestamp, user_hash, server_hash, event_type, session_id, interaction_depth)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          now,
          userHash,
          serverHash,
          eventType,
          session.sessionId,
          session.interactions
        );
      }
    } finally {
      sessionRelease();
    }
  }

  /**
   * Set user privacy settings
   */
  async setUserPrivacySettings(
    userId: string,
    settings: Partial<UserPrivacySettings>
  ): Promise<void> {
    const userHash = this.hashIdentifier(userId);
    const release = await this.privacyMutex.acquire();
    
    try {
      const existing = this.privacySettings.get(userHash) || {
        userHash,
        optedOut: false,
        dataRetentionDays: this.retentionDays,
        allowInsights: true,
        lastUpdated: Date.now(),
      };

      const updated = {
        ...existing,
        ...settings,
        userHash,
        lastUpdated: Date.now(),
      };

      this.privacySettings.set(userHash, updated);
      
      // Update database
      if (this.database) {
        const stmt = this.database.prepare(`
          INSERT OR REPLACE INTO user_privacy 
          (user_hash, opted_out, data_retention_days, allow_insights, last_updated)
          VALUES (?, ?, ?, ?, ?)
        `);
        
        stmt.run(
          updated.userHash,
          updated.optedOut ? 1 : 0,
          updated.dataRetentionDays,
          updated.allowInsights ? 1 : 0,
          updated.lastUpdated
        );
      }

      // If user opted out, delete their data
      if (updated.optedOut) {
        await this.deleteUserData(userHash);
      }

      logger.info(`Updated privacy settings for user ${userHash.substring(0, 8)}...`);
    } finally {
      release();
    }
  }

  /**
   * Get user privacy settings
   */
  async getUserPrivacySettings(userId: string): Promise<UserPrivacySettings> {
    const userHash = this.hashIdentifier(userId);
    return this.privacySettings.get(userHash) || {
      userHash,
      optedOut: false,
      dataRetentionDays: this.retentionDays,
      allowInsights: true,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Delete all user data
   */
  async deleteUserData(userId: string): Promise<void> {
    if (!this.database) return;

    const userHash = this.hashIdentifier(userId);
    const release = await this.privacyMutex.acquire();
    try {
      // Delete from all tables
      this.database.prepare('DELETE FROM command_usage WHERE user_hash = ?').run(userHash);
      this.database.prepare('DELETE FROM user_engagement WHERE user_hash = ?').run(userHash);
      this.database.prepare('DELETE FROM error_events WHERE user_hash = ?').run(userHash);
      
      logger.info(`Deleted all data for user ${userHash.substring(0, 8)}...`);
    } finally {
      release();
    }
  }

  /**
   * Export user data for GDPR compliance
   */
  async exportUserData(userId: string): Promise<ExportData | null> {
    const userHash = this.hashIdentifier(userId);
    if (!this.database) return null;

    const release = await this.privacyMutex.acquire();
    try {
      const commandUsage = this.database.prepare(`
        SELECT timestamp, command_name, server_hash, success, duration_ms, error_type
        FROM command_usage WHERE user_hash = ?
      `).all(userHash);

      const engagement = this.database.prepare(`
        SELECT timestamp, server_hash, event_type, session_id, interaction_depth
        FROM user_engagement WHERE user_hash = ?
      `).all(userHash);

      const privacy = this.privacySettings.get(userHash);

      return {
        exportDate: new Date().toISOString(),
        userHash: userHash.substring(0, 8) + '...', // Partial hash for verification
        privacySettings: privacy,
        commandUsage: commandUsage as Array<Record<string, unknown>>,
        engagement: engagement as Array<Record<string, unknown>>,
        note: 'All user identifiers have been anonymized. Raw user IDs are never stored.',
      };
    } finally {
      release();
    }
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Clean up inactive sessions
   */
  cleanupInactiveSessions(): void {
    const now = Date.now();
    let cleanedSessions = 0;

    for (const [key, session] of this.activeSessions.entries()) {
      if ((now - session.lastActivity) > this.sessionTimeoutMs) {
        this.activeSessions.delete(key);
        cleanedSessions++;
      }
    }

    if (cleanedSessions > 0) {
      logger.debug(`Cleaned up ${cleanedSessions} inactive sessions`);
    }
  }

  /**
   * Load privacy settings from database
   */
  private async loadPrivacySettings(): Promise<void> {
    if (!this.database) return;

    const settings = this.database.prepare('SELECT * FROM user_privacy').all() as UserPrivacyRow[];
    for (const setting of settings) {
      this.privacySettings.set(setting.user_hash, {
        userHash: setting.user_hash,
        optedOut: setting.opted_out === 1,
        dataRetentionDays: setting.data_retention_days,
        allowInsights: setting.allow_insights === 1,
        lastUpdated: setting.last_updated,
      });
    }

    logger.info(`Loaded ${settings.length} user privacy settings`);
  }

  /**
   * Start session cleanup timer
   */
  private startSessionCleanupTimer(): void {
    // Session cleanup (every 10 minutes)
    this.sessionCleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 10 * 60 * 1000);
  }

  /**
   * Check if service is healthy
   */
  protected isHealthy(): boolean {
    return !!this.database;
  }
  
  /**
   * Get health errors
   */
  protected getHealthErrors(): string[] {
    const errors: string[] = [];
    if (!this.database) {
      errors.push('Database connection not available');
    }
    return errors;
  }
  
  /**
   * Collect service metrics
   */
  protected collectServiceMetrics(): Record<string, unknown> {
    return {
      activeSessions: this.activeSessions.size,
      privacySettingsLoaded: this.privacySettings.size,
      sessionCleanupTimerActive: !!this.sessionCleanupTimer,
      retentionDays: this.retentionDays,
      privacyMode: this.privacyMode
    };
  }
}