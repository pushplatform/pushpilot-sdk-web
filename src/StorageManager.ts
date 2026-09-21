/**
 * @pushplatform/web-sdk
 *
 * Storage Manager - handles Installation ID persistence
 */

const STORAGE_PREFIX = 'pushplatform_';
const INSTALLATION_ID_KEY = `${STORAGE_PREFIX}installation_id`;

/**
 * Storage Manager for Installation ID and configuration
 */
export class StorageManager {
  /**
   * Get or generate Installation ID
   *
   * Returns existing Installation ID from localStorage or generates a new UUID v4.
   *
   * @returns Installation ID (UUID v4)
   */
  static getInstallationId(): string {
    try {
      const existing = localStorage.getItem(INSTALLATION_ID_KEY);
      if (existing) {
        return existing;
      }

      const newId = StorageManager.generateUUID();
      StorageManager.saveInstallationId(newId);
      return newId;
    } catch (error) {
      // localStorage may be blocked or unavailable
      throw new Error(`Failed to get installation ID: ${String(error)}`);
    }
  }

  /**
   * Save Installation ID to localStorage
   *
   * @param id - Installation ID to save
   */
  static saveInstallationId(id: string): void {
    try {
      localStorage.setItem(INSTALLATION_ID_KEY, id);
    } catch (error) {
      throw new Error(`Failed to save installation ID: ${String(error)}`);
    }
  }

  /**
   * Clear all stored data
   */
  static clear(): void {
    try {
      localStorage.removeItem(INSTALLATION_ID_KEY);
    } catch (error) {
      // Ignore errors on clear
    }
  }

  /**
   * Generate UUID v4
   *
   * Uses crypto.randomUUID() if available, otherwise fallback implementation.
   *
   * @returns UUID v4 string
   */
  private static generateUUID(): string {
    // Modern browsers support crypto.randomUUID()
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    // Fallback UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
