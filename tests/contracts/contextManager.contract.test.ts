/**
 * @file ContextManager Contract Tests
 * @description Contract tests to prevent regressions during ContextManager refactoring
 * @module tests/contracts/contextManager
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { ContextManager } from '../../src/services/contextManager';
import { IContextManager } from '../../src/services/interfaces/ContextManagementInterfaces';
import { createTestEnvironment } from '../test-utils';
import { BaseService, ServiceState } from '../../src/services/base/BaseService';
import { Guild } from 'discord.js';

describe('ContextManager API Contract Tests', () => {
  let contextManager: ContextManager;
  let testEnv: ReturnType<typeof createTestEnvironment>;

  beforeAll(async () => {
    testEnv = createTestEnvironment();
  });

  afterAll(() => {
    testEnv?.cleanup();
  });

  beforeEach(async () => {
    contextManager = new ContextManager();
    await contextManager.initialize();
  });

  afterEach(async () => {
    if (contextManager) {
      await contextManager.shutdown();
    }
  });

  describe('IService Interface Contract', () => {
    it('should implement all required IService methods', () => {
      expect(contextManager).toBeInstanceOf(BaseService);
      const iService: IService = contextManager;
      expect(typeof iService.initialize).toBe('function');
      expect(typeof iService.shutdown).toBe('function');
      expect(typeof iService.getHealthStatus).toBe('function');
    });
  });

  describe('Service Lifecycle Contract', () => {
    it('should maintain proper state transitions during initialization', async () => {
        const newContextManager = new ContextManager();
        expect(newContextManager.getServiceState()).toBe(ServiceState.CREATED);
        const initPromise = newContextManager.initialize();
        expect(newContextManager.getServiceState()).toBe(ServiceState.INITIALIZING);
        await initPromise;
        expect(newContextManager.getServiceState()).toBe(ServiceState.READY);
        await newContextManager.shutdown();
      });
  });

  describe('Content Addition Methods Contract', () => {
    it('should maintain addEmbarrassingMoment method contract', () => {
      const mockServerId = 'test-server-789';
      const mockUserId = 'test-user-123';
      const mockMoment = 'Test embarrassing moment';
      expect(() => contextManager.addEmbarrassingMoment(mockServerId, mockUserId, mockMoment)).not.toThrow();
    });

    it('should maintain addCodeSnippet method contract', () => {
      const mockServerId = 'test-server-789';
      const mockUserId = 'test-user-123';
      const mockUserMessage = 'Check out this code';
      const mockCode = 'console.log("test");';
      expect(() => contextManager.addCodeSnippet(mockServerId, mockUserId, mockUserMessage, mockCode)).not.toThrow();
    });

    it('should maintain addRunningGag method contract', () => {
      const mockServerId = 'test-server-789';
      const mockGag = 'Test running gag';
      expect(() => contextManager.addRunningGag(mockServerId, mockGag)).not.toThrow();
    });
  });

  describe('Context Building Contract', () => {
    it('should maintain buildSuperContext method signature contract', () => {
        const mockUserId = 'test-user-123';
        const mockServerId = 'test-server-456';
  
        const result = contextManager.buildSuperContext(mockServerId, mockUserId);
        
        expect(typeof result).toBe('string');
      });

    it('should maintain buildServerCultureContext method contract', () => {
        const mockGuild = { id: 'test-server-456' } as Guild;
        const result = contextManager.buildServerCultureContext(mockGuild);
        expect(typeof result).toBe('string');
      });
  });
});