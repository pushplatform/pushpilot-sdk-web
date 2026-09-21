/**
 * @pushplatform/web-sdk
 *
 * Unit tests for StorageManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageManager } from '../src/StorageManager';

describe('StorageManager', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    // Clean up after each test
    localStorage.clear();
  });

  describe('getInstallationId', () => {
    it('should generate a new UUID v4 on first call', () => {
      const id = StorageManager.getInstallationId();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should return the same ID on subsequent calls', () => {
      const id1 = StorageManager.getInstallationId();
      const id2 = StorageManager.getInstallationId();
      const id3 = StorageManager.getInstallationId();

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it('should persist ID in localStorage', () => {
      const id = StorageManager.getInstallationId();
      const stored = localStorage.getItem('pushplatform_installation_id');

      expect(stored).toBe(id);
    });

    it('should retrieve existing ID from localStorage', () => {
      const testId = '12345678-1234-4234-8234-123456789012';
      localStorage.setItem('pushplatform_installation_id', testId);

      const id = StorageManager.getInstallationId();

      expect(id).toBe(testId);
    });
  });

  describe('saveInstallationId', () => {
    it('should save ID to localStorage', () => {
      const testId = '87654321-4321-4321-8321-210987654321';

      StorageManager.saveInstallationId(testId);

      const stored = localStorage.getItem('pushplatform_installation_id');
      expect(stored).toBe(testId);
    });

    it('should overwrite existing ID', () => {
      const oldId = 'old-id-12345678-1234-4234-8234-123456789012';
      const newId = 'new-id-87654321-4321-4321-8321-210987654321';

      localStorage.setItem('pushplatform_installation_id', oldId);
      StorageManager.saveInstallationId(newId);

      const stored = localStorage.getItem('pushplatform_installation_id');
      expect(stored).toBe(newId);
    });
  });

  describe('clear', () => {
    it('should remove installation ID from localStorage', () => {
      const testId = '12345678-1234-4234-8234-123456789012';
      localStorage.setItem('pushplatform_installation_id', testId);

      StorageManager.clear();

      const stored = localStorage.getItem('pushplatform_installation_id');
      expect(stored).toBeNull();
    });

    it('should not throw error if ID does not exist', () => {
      expect(() => StorageManager.clear()).not.toThrow();
    });
  });

  describe('UUID generation', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        localStorage.clear();
        const id = StorageManager.getInstallationId();
        ids.add(id);
      }

      // All IDs should be unique
      expect(ids.size).toBe(100);
    });

    it('should generate valid UUID v4 format', () => {
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      for (let i = 0; i < 10; i++) {
        localStorage.clear();
        const id = StorageManager.getInstallationId();
        expect(id).toMatch(uuidV4Regex);
      }
    });
  });

  describe('localStorage errors', () => {
    it('should throw error if localStorage is unavailable', () => {
      // Mock localStorage to throw error
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn(() => {
        throw new Error('localStorage unavailable');
      });

      expect(() => StorageManager.getInstallationId()).toThrow();

      // Restore
      Storage.prototype.getItem = originalGetItem;
    });

    it('should throw error if localStorage.setItem fails', () => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => StorageManager.saveInstallationId('test-id')).toThrow();

      // Restore
      Storage.prototype.setItem = originalSetItem;
    });
  });
});
