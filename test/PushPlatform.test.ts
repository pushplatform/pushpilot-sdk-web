/**
 * @pushplatform/web-sdk
 *
 * Unit tests for PushPlatform SDK
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PushPlatform, SDKError, ErrorCode } from '../src';

// Mock Service Worker and Push API
Object.defineProperty(global.navigator, 'serviceWorker', {
  value: {},
  writable: true,
  configurable: true,
});

Object.defineProperty(global, 'PushManager', {
  value: function PushManager() {},
  writable: true,
  configurable: true,
});

describe('PushPlatform', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Reset SDK state by accessing private static property via reflection
    (PushPlatform as any).initialized = false;
    (PushPlatform as any).config = null;

    // Mock Notification API
    global.Notification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    } as any;

    // Mock fetch for backend API calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        installation_id: '12345678-1234-4234-8234-123456789012',
        device_id: '12345678-1234-4234-8234-123456789012',
        platform: 'web',
        environment: 'production',
      }),
    } as Response);
  });

  afterEach(() => {
    localStorage.clear();
    (PushPlatform as any).initialized = false;
    (PushPlatform as any).config = null;
    vi.restoreAllMocks();
  });

  const validConfig = {
    apiKey: 'test-api-key',
    applicationId: '12345678-1234-4234-8234-123456789012',
    apiBaseURL: 'https://api.test.com',
    environment: 'production' as const,
    debugMode: false,
  };

  describe('initialize', () => {
    it('should initialize SDK with valid config', async () => {
      await expect(PushPlatform.initialize(validConfig)).resolves.toBeUndefined();
    });

    it('should throw error if already initialized', async () => {
      await PushPlatform.initialize(validConfig);

      await expect(PushPlatform.initialize(validConfig)).rejects.toThrow(SDKError);
      await expect(PushPlatform.initialize(validConfig)).rejects.toMatchObject({
        code: ErrorCode.ALREADY_INITIALIZED,
      });
    });

    it('should throw error if config is missing', async () => {
      await expect(PushPlatform.initialize(null as any)).rejects.toThrow(SDKError);
      await expect(PushPlatform.initialize(null as any)).rejects.toMatchObject({
        code: ErrorCode.INVALID_CONFIG,
      });
    });

    it('should throw error if apiKey is missing', async () => {
      const invalidConfig = { ...validConfig, apiKey: '' };

      await expect(PushPlatform.initialize(invalidConfig)).rejects.toThrow(SDKError);
      await expect(PushPlatform.initialize(invalidConfig)).rejects.toMatchObject({
        code: ErrorCode.INVALID_CONFIG,
        message: expect.stringContaining('API key'),
      });
    });

    it('should throw error if applicationId is missing', async () => {
      const invalidConfig = { ...validConfig, applicationId: '' };

      await expect(PushPlatform.initialize(invalidConfig)).rejects.toThrow(SDKError);
      await expect(PushPlatform.initialize(invalidConfig)).rejects.toMatchObject({
        code: ErrorCode.INVALID_CONFIG,
        message: expect.stringContaining('Application ID'),
      });
    });

    it('should throw error if apiBaseURL is missing', async () => {
      const invalidConfig = { ...validConfig, apiBaseURL: '' };

      await expect(PushPlatform.initialize(invalidConfig)).rejects.toThrow(SDKError);
      await expect(PushPlatform.initialize(invalidConfig)).rejects.toMatchObject({
        code: ErrorCode.INVALID_CONFIG,
        message: expect.stringContaining('API base URL'),
      });
    });

    it('should throw error if apiBaseURL is invalid', async () => {
      const invalidConfig = { ...validConfig, apiBaseURL: 'not-a-url' };

      await expect(PushPlatform.initialize(invalidConfig)).rejects.toThrow(SDKError);
      await expect(PushPlatform.initialize(invalidConfig)).rejects.toMatchObject({
        code: ErrorCode.INVALID_CONFIG,
        message: expect.stringContaining('valid URL'),
      });
    });

    it('should throw error if environment is invalid', async () => {
      const invalidConfig = { ...validConfig, environment: 'staging' as any };

      await expect(PushPlatform.initialize(invalidConfig)).rejects.toThrow(SDKError);
      await expect(PushPlatform.initialize(invalidConfig)).rejects.toMatchObject({
        code: ErrorCode.INVALID_CONFIG,
        message: expect.stringContaining('Environment'),
      });
    });

    it('should default environment to production', async () => {
      const configWithoutEnv = {
        apiKey: validConfig.apiKey,
        applicationId: validConfig.applicationId,
        apiBaseURL: validConfig.apiBaseURL,
      };

      await PushPlatform.initialize(configWithoutEnv);

      const config = (PushPlatform as any).config;
      expect(config.environment).toBe('production');
    });

    it('should default serviceWorkerPath to /service-worker.js', async () => {
      await PushPlatform.initialize(validConfig);

      const config = (PushPlatform as any).config;
      expect(config.serviceWorkerPath).toBe('/service-worker.js');
    });

    it('should default debugMode to false', async () => {
      await PushPlatform.initialize(validConfig);

      const config = (PushPlatform as any).config;
      expect(config.debugMode).toBe(false);
    });
  });

  describe('getInstallationId', () => {
    it('should throw error if SDK not initialized', async () => {
      await expect(PushPlatform.getInstallationId()).rejects.toThrow(SDKError);
      await expect(PushPlatform.getInstallationId()).rejects.toMatchObject({
        code: ErrorCode.NOT_INITIALIZED,
      });
    });

    it('should return installation ID after initialization', async () => {
      await PushPlatform.initialize(validConfig);

      const id = await PushPlatform.getInstallationId();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should return same ID on multiple calls', async () => {
      await PushPlatform.initialize(validConfig);

      const id1 = await PushPlatform.getInstallationId();
      const id2 = await PushPlatform.getInstallationId();

      expect(id1).toBe(id2);
    });
  });

  describe('requestPermission', () => {
    it('should throw error if SDK not initialized', async () => {
      await expect(PushPlatform.requestPermission()).rejects.toThrow(SDKError);
      await expect(PushPlatform.requestPermission()).rejects.toMatchObject({
        code: ErrorCode.NOT_INITIALIZED,
      });
    });

    it('should request notification permission', async () => {
      await PushPlatform.initialize(validConfig);

      const status = await PushPlatform.requestPermission();

      expect(global.Notification.requestPermission).toHaveBeenCalled();
      expect(status).toBe('granted');
    });
  });

  describe('getPermissionStatus', () => {
    it('should throw error if SDK not initialized', async () => {
      await expect(PushPlatform.getPermissionStatus()).rejects.toThrow(SDKError);
      await expect(PushPlatform.getPermissionStatus()).rejects.toMatchObject({
        code: ErrorCode.NOT_INITIALIZED,
      });
    });

    it('should return current permission status', async () => {
      await PushPlatform.initialize(validConfig);

      global.Notification.permission = 'denied';

      const status = await PushPlatform.getPermissionStatus();

      expect(status).toBe('denied');
    });
  });

  describe('login', () => {
    it('should throw error if SDK not initialized', async () => {
      await expect(PushPlatform.login('user-123')).rejects.toThrow(SDKError);
      await expect(PushPlatform.login('user-123')).rejects.toMatchObject({
        code: ErrorCode.NOT_INITIALIZED,
      });
    });

    it('should throw error if userId is empty', async () => {
      await PushPlatform.initialize(validConfig);

      await expect(PushPlatform.login('')).rejects.toThrow(SDKError);
      await expect(PushPlatform.login('')).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('should throw error if userId is not a string', async () => {
      await PushPlatform.initialize(validConfig);

      await expect(PushPlatform.login(null as any)).rejects.toThrow(SDKError);
      await expect(PushPlatform.login(123 as any)).rejects.toThrow(SDKError);
    });
  });

  describe('event listeners', () => {
    it('should throw error if SDK not initialized for onNotificationReceived', () => {
      const callback = vi.fn();

      expect(() => PushPlatform.onNotificationReceived(callback)).toThrow(SDKError);
      expect(() => PushPlatform.onNotificationReceived(callback)).toThrow(
        expect.objectContaining({ code: ErrorCode.NOT_INITIALIZED })
      );
    });

    it('should throw error if SDK not initialized for onNotificationClicked', () => {
      const callback = vi.fn();

      expect(() => PushPlatform.onNotificationClicked(callback)).toThrow(SDKError);
      expect(() => PushPlatform.onNotificationClicked(callback)).toThrow(
        expect.objectContaining({ code: ErrorCode.NOT_INITIALIZED })
      );
    });

    it('should return unsubscribe function for onNotificationReceived', async () => {
      await PushPlatform.initialize(validConfig);
      const callback = vi.fn();

      const unsubscribe = PushPlatform.onNotificationReceived(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function for onNotificationClicked', async () => {
      await PushPlatform.initialize(validConfig);
      const callback = vi.fn();

      const unsubscribe = PushPlatform.onNotificationClicked(callback);

      expect(typeof unsubscribe).toBe('function');
    });
  });
});
