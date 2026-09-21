/**
 * @pushplatform/web-sdk
 *
 * Main PushPlatform SDK class
 */

import type {
  PushPlatformConfig,
  PermissionStatus,
  Subscription,
  UnsubscribeFn,
  PushNotification,
} from './types';
import { SDKError, ErrorCode } from './types';
import { StorageManager } from './StorageManager';

/**
 * Push Platform SDK
 *
 * Main entry point for Web SDK.
 * Provides Web Push integration with PushPlatform backend.
 *
 * **Requirements:**
 * - Modern browser with Service Worker support
 * - HTTPS (or localhost for development)
 * - Web Push API support
 */
export class PushPlatform {
  private static initialized = false;
  private static config: PushPlatformConfig | null = null;

  /**
   * Initialize the SDK
   *
   * Must be called once before using any other SDK methods.
   *
   * @param config - SDK configuration
   * @throws {SDKError} If configuration is invalid or initialization fails
   *
   * @example
   * ```typescript
   * await PushPlatform.initialize({
   *   apiKey: 'your-api-key',
   *   applicationId: 'app-uuid',
   *   apiBaseURL: 'https://api.pushplatform.com',
   *   environment: 'production',
   *   debugMode: false,
   * });
   * ```
   */
  static async initialize(config: PushPlatformConfig): Promise<void> {
    // Check if already initialized
    if (PushPlatform.initialized) {
      throw new SDKError(
        ErrorCode.ALREADY_INITIALIZED,
        'PushPlatform already initialized'
      );
    }

    // Validate configuration
    PushPlatform.validateConfig(config);

    // Check Service Worker support
    if (!('serviceWorker' in navigator)) {
      throw new SDKError(
        ErrorCode.SERVICE_WORKER_NOT_SUPPORTED,
        'Service Workers are not supported in this browser'
      );
    }

    // Check Push API support
    if (!('PushManager' in window)) {
      throw new SDKError(
        ErrorCode.PUSH_API_NOT_SUPPORTED,
        'Push API is not supported in this browser'
      );
    }

    // Store configuration
    PushPlatform.config = {
      ...config,
      environment: config.environment || 'production',
      serviceWorkerPath: config.serviceWorkerPath || '/service-worker.js',
      debugMode: config.debugMode ?? false,
    };

    PushPlatform.initialized = true;

    if (PushPlatform.config.debugMode) {
      console.log('[PushPlatform] SDK initialized', {
        environment: PushPlatform.config.environment,
      });
    }
  }

  /**
   * Get installation ID
   *
   * Returns the unique installation ID (UUID v4).
   * Installation ID is stable across sessions and survives page reloads.
   *
   * @returns Installation ID
   * @throws {SDKError} If SDK not initialized
   *
   * @example
   * ```typescript
   * const installationId = await PushPlatform.getInstallationId();
   * console.log('Installation ID:', installationId);
   * ```
   */
  static async getInstallationId(): Promise<string> {
    PushPlatform.ensureInitialized();

    try {
      const installationId = StorageManager.getInstallationId();
      if (PushPlatform.config?.debugMode) {
        console.log('[PushPlatform] Installation ID retrieved', { installationId });
      }
      return installationId;
    } catch (error) {
      throw new SDKError(
        ErrorCode.UNKNOWN_ERROR,
        `Failed to get installation ID: ${String(error)}`
      );
    }
  }

  /**
   * Login user
   *
   * Associates this installation with a user ID.
   * Enables user-targeted push notifications.
   *
   * @param userId - External user ID
   * @throws {SDKError} If SDK not initialized or login fails
   *
   * @example
   * ```typescript
   * await PushPlatform.login('user-123');
   * ```
   */
  static async login(userId: string): Promise<void> {
    PushPlatform.ensureInitialized();

    if (!userId || typeof userId !== 'string') {
      throw new SDKError(
        ErrorCode.VALIDATION_ERROR,
        'User ID must be a non-empty string'
      );
    }

    // TODO: Implement backend API call
    throw new SDKError(
      ErrorCode.UNKNOWN_ERROR,
      'Not implemented yet'
    );
  }

  /**
   * Logout user
   *
   * Disassociates this installation from the current user.
   *
   * @throws {SDKError} If SDK not initialized or logout fails
   *
   * @example
   * ```typescript
   * await PushPlatform.logout();
   * ```
   */
  static async logout(): Promise<void> {
    PushPlatform.ensureInitialized();

    // TODO: Implement backend API call
    throw new SDKError(
      ErrorCode.UNKNOWN_ERROR,
      'Not implemented yet'
    );
  }

  /**
   * Request notification permission
   *
   * Requests notification permission from the user.
   * Must be called in response to a user gesture (e.g., button click).
   *
   * @returns Permission status
   * @throws {SDKError} If SDK not initialized or permission request fails
   *
   * @example
   * ```typescript
   * const status = await PushPlatform.requestPermission();
   * if (status === 'granted') {
   *   await PushPlatform.subscribe();
   * }
   * ```
   */
  static async requestPermission(): Promise<PermissionStatus> {
    PushPlatform.ensureInitialized();

    try {
      const result = await Notification.requestPermission();
      if (PushPlatform.config?.debugMode) {
        console.log('[PushPlatform] Permission status:', result);
      }
      return result as PermissionStatus;
    } catch (error) {
      throw new SDKError(
        ErrorCode.PERMISSION_REQUEST_FAILED,
        `Failed to request permission: ${String(error)}`
      );
    }
  }

  /**
   * Get current notification permission status
   *
   * @returns Permission status
   * @throws {SDKError} If SDK not initialized
   *
   * @example
   * ```typescript
   * const status = await PushPlatform.getPermissionStatus();
   * console.log('Permission:', status);
   * ```
   */
  static async getPermissionStatus(): Promise<PermissionStatus> {
    PushPlatform.ensureInitialized();
    return Notification.permission as PermissionStatus;
  }

  /**
   * Subscribe to push notifications
   *
   * Creates a push subscription and registers it with the backend.
   * Permission must be granted before calling this method.
   *
   * @returns Subscription object
   * @throws {SDKError} If SDK not initialized, permission denied, or subscription fails
   *
   * @example
   * ```typescript
   * const subscription = await PushPlatform.subscribe();
   * console.log('Subscribed:', subscription.endpoint);
   * ```
   */
  static async subscribe(): Promise<Subscription> {
    PushPlatform.ensureInitialized();

    // TODO: Implement subscription
    throw new SDKError(
      ErrorCode.UNKNOWN_ERROR,
      'Not implemented yet'
    );
  }

  /**
   * Unsubscribe from push notifications
   *
   * Removes the push subscription locally and on the backend.
   *
   * @throws {SDKError} If SDK not initialized or unsubscribe fails
   *
   * @example
   * ```typescript
   * await PushPlatform.unsubscribe();
   * ```
   */
  static async unsubscribe(): Promise<void> {
    PushPlatform.ensureInitialized();

    // TODO: Implement unsubscribe
    throw new SDKError(
      ErrorCode.UNKNOWN_ERROR,
      'Not implemented yet'
    );
  }

  /**
   * Get current push subscription
   *
   * @returns Current subscription or null if not subscribed
   * @throws {SDKError} If SDK not initialized
   *
   * @example
   * ```typescript
   * const subscription = await PushPlatform.getSubscription();
   * if (subscription) {
   *   console.log('Already subscribed');
   * }
   * ```
   */
  static async getSubscription(): Promise<Subscription | null> {
    PushPlatform.ensureInitialized();

    // TODO: Implement get subscription
    throw new SDKError(
      ErrorCode.UNKNOWN_ERROR,
      'Not implemented yet'
    );
  }

  /**
   * Register callback for notification received events
   *
   * @param callback - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = PushPlatform.onNotificationReceived((notification) => {
   *   console.log('Received:', notification);
   * });
   * ```
   */
  static onNotificationReceived(
    _callback: (notification: PushNotification) => void
  ): UnsubscribeFn {
    PushPlatform.ensureInitialized();

    // TODO: Implement event listener
    return () => {
      // Unsubscribe logic
    };
  }

  /**
   * Register callback for notification clicked events
   *
   * @param callback - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = PushPlatform.onNotificationClicked((notification) => {
   *   console.log('Clicked:', notification);
   * });
   * ```
   */
  static onNotificationClicked(
    _callback: (notification: PushNotification) => void
  ): UnsubscribeFn {
    PushPlatform.ensureInitialized();

    // TODO: Implement event listener
    return () => {
      // Unsubscribe logic
    };
  }

  // Private helpers

  private static ensureInitialized(): void {
    if (!PushPlatform.initialized) {
      throw new SDKError(
        ErrorCode.NOT_INITIALIZED,
        'PushPlatform not initialized. Call PushPlatform.initialize() first.'
      );
    }
  }

  private static validateConfig(config: PushPlatformConfig): void {
    if (!config) {
      throw new SDKError(ErrorCode.INVALID_CONFIG, 'Configuration is required');
    }

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new SDKError(ErrorCode.INVALID_CONFIG, 'API key is required');
    }

    if (!config.applicationId || typeof config.applicationId !== 'string') {
      throw new SDKError(ErrorCode.INVALID_CONFIG, 'Application ID is required');
    }

    if (!config.apiBaseURL || typeof config.apiBaseURL !== 'string') {
      throw new SDKError(ErrorCode.INVALID_CONFIG, 'API base URL is required');
    }

    // Validate URL format
    try {
      new URL(config.apiBaseURL);
    } catch {
      throw new SDKError(ErrorCode.INVALID_CONFIG, 'API base URL is not a valid URL');
    }

    if (config.environment && !['development', 'production'].includes(config.environment)) {
      throw new SDKError(
        ErrorCode.INVALID_CONFIG,
        'Environment must be "development" or "production"'
      );
    }
  }
}
