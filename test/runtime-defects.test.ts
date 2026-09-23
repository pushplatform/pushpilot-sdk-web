/**
 * Runtime defect tests
 *
 * Tests for issues discovered during manual runtime testing:
 * 1. CORS configuration
 * 2. Promise handling in getInstallationId()
 * 3. Backend registration failure handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PushPlatform } from '../src/PushPlatform';
import { StorageManager } from '../src/StorageManager';

describe('Runtime Defects', () => {
  beforeEach(() => {
    // Reset SDK state
    (PushPlatform as any).initialized = false;
    (PushPlatform as any).config = null;
    (PushPlatform as any).apiClient = null;
    (PushPlatform as any).currentInstallationId = null;

    // Clear storage
    localStorage.clear();

    // Mock Notification API
    global.Notification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    } as any;

    // Mock Service Worker and Push API
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue({
          active: { state: 'activated' },
          addEventListener: vi.fn(),
        }),
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'PushManager', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('getInstallationId() returns Promise', () => {
    it('should return a Promise that resolves to string', async () => {
      // Mock successful initialization
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ installationId: 'test-id' }),
      });
      global.fetch = mockFetch;

      await PushPlatform.initialize({
        apiKey: 'test-key',
        applicationId: 'test-app-id',
        apiBaseURL: 'http://localhost:8085',
        environment: 'development',
      });

      // Call getInstallationId()
      const result = PushPlatform.getInstallationId();

      // Should be a Promise
      expect(result).toBeInstanceOf(Promise);

      // Should resolve to a string
      const installationId = await result;
      expect(typeof installationId).toBe('string');
      expect(installationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should return consistent value across multiple calls', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ installationId: 'test-id' }),
      });
      global.fetch = mockFetch;

      await PushPlatform.initialize({
        apiKey: 'test-key',
        applicationId: 'test-app-id',
        apiBaseURL: 'http://localhost:8085',
        environment: 'development',
      });

      const id1 = await PushPlatform.getInstallationId();
      const id2 = await PushPlatform.getInstallationId();

      expect(id1).toBe(id2);
    });
  });

  describe('initialize() backend registration failure', () => {
    it('should throw error when backend registration fails', async () => {
      // Mock failed backend registration
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' }),
      });
      global.fetch = mockFetch;

      // Should throw during initialization
      await expect(
        PushPlatform.initialize({
          apiKey: 'invalid-key',
          applicationId: 'test-app-id',
          apiBaseURL: 'http://localhost:8085',
          environment: 'development',
        })
      ).rejects.toThrow();

      // SDK should NOT be initialized
      expect((PushPlatform as any).initialized).toBe(false);
    });

    it('should not set initialized=true when backend registration fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Database connection failed' }),
      });
      global.fetch = mockFetch;

      try {
        await PushPlatform.initialize({
          apiKey: 'test-key',
          applicationId: 'test-app-id',
          apiBaseURL: 'http://localhost:8085',
          environment: 'development',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        // Verify SDK is NOT initialized
        expect((PushPlatform as any).initialized).toBe(false);

        // Subsequent calls should fail with NOT_INITIALIZED
        await expect(
          PushPlatform.getInstallationId()
        ).rejects.toThrow('not initialized');
      }
    });

    it('should throw network error with descriptive message', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network request failed'));
      global.fetch = mockFetch;

      await expect(
        PushPlatform.initialize({
          apiKey: 'test-key',
          applicationId: 'test-app-id',
          apiBaseURL: 'http://localhost:8085',
          environment: 'development',
        })
      ).rejects.toThrow(/failed to register installation/i);
    });

    it('should succeed when backend registration succeeds', async () => {
      const mockInstallationId = StorageManager.getInstallationId();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          installationId: mockInstallationId,
          platform: 'web',
          environment: 'development',
        }),
      });
      global.fetch = mockFetch;

      await PushPlatform.initialize({
        apiKey: 'valid-key',
        applicationId: 'test-app-id',
        apiBaseURL: 'http://localhost:8085',
        environment: 'development',
      });

      // Should be initialized
      expect((PushPlatform as any).initialized).toBe(true);

      // Should be able to get installation ID
      const id = await PushPlatform.getInstallationId();
      expect(id).toBe(mockInstallationId);
    });
  });
});
