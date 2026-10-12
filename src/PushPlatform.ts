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
import { APIClient } from './APIClient';
import { ServiceWorkerManager } from './ServiceWorkerManager';
import { SubscriptionManager } from './SubscriptionManager';
import { EventEmitter } from './EventEmitter';

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
  private static readonly subscriptionIdStorageKey = 'pushplatform_subscription_id';
  private static initialized = false;
  private static initializing = false;
  private static removeMessageListener: (() => void) | null = null;
  private static config: PushPlatformConfig | null = null;
  private static apiClient: APIClient | null = null;
  private static currentInstallationId: string | null = null;
  private static currentSubscriptionId: string | null = null;
  private static serviceWorkerManager: ServiceWorkerManager | null = null;
  private static subscriptionManager: SubscriptionManager | null = null;
  private static eventEmitter: EventEmitter = new EventEmitter();

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
    if (PushPlatform.initializing) {
      throw new SDKError(ErrorCode.ALREADY_INITIALIZED, 'PushPlatform initialization in progress');
    }
    PushPlatform.initializing = true;
    try {
      await PushPlatform.initializeInternal(config);
    } finally {
      PushPlatform.initializing = false;
    }
  }

  /** Detect support without initializing or requesting permission. */
  static isSupported(): boolean {
    return typeof window !== 'undefined' && window.isSecureContext !== false &&
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
      'PushManager' in window && 'Notification' in window;
  }

  private static async initializeInternal(config: PushPlatformConfig): Promise<void> {
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
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      throw new SDKError(
        ErrorCode.SERVICE_WORKER_NOT_SUPPORTED,
        'Service Workers are not supported in this browser'
      );
    }

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      throw new SDKError(ErrorCode.INSECURE_CONTEXT, 'Web Push requires HTTPS or localhost');
    }

    // Check Push and Notification APIs
    if (typeof window === 'undefined' || !('PushManager' in window) || !('Notification' in window)) {
      throw new SDKError(
        ErrorCode.PUSH_API_NOT_SUPPORTED,
        'Push API is not supported in this browser'
      );
    }

    // Store configuration
    PushPlatform.config = {
      ...config,
      apiBaseURL: config.apiBaseURL.replace(/\/+$/, ''),
      environment: config.environment || 'production',
      serviceWorkerPath: config.serviceWorkerPath || '/service-worker.js',
      debugMode: config.debugMode ?? false,
    };

    // Create API client
    PushPlatform.apiClient = new APIClient(PushPlatform.config);

    // Create Service Worker Manager
    PushPlatform.serviceWorkerManager = new ServiceWorkerManager();

    // Create Subscription Manager
    PushPlatform.subscriptionManager = new SubscriptionManager(
      PushPlatform.serviceWorkerManager,
      PushPlatform.config.vapidPublicKey
    );

    // Registration is required for a usable SDK. Surface failures immediately.
    await PushPlatform.serviceWorkerManager.register(
      PushPlatform.config.serviceWorkerPath || '/service-worker.js',
      PushPlatform.config.serviceWorkerScope
    );

    // Get or create installation ID
    const installationId = StorageManager.getInstallationId();
    PushPlatform.currentInstallationId = installationId;
    PushPlatform.currentSubscriptionId = localStorage.getItem(PushPlatform.subscriptionIdStorageKey);

    // Register installation with backend
    const environment = PushPlatform.config.environment || 'production';
    try {
      const registeredInstallation = await PushPlatform.apiClient.registerInstallation({
        installationId,
        platform: 'web',
        environment,
      });

      // Use the installation ID returned from backend (the actual database ID)
      PushPlatform.currentInstallationId = registeredInstallation.installationId;

      if (PushPlatform.config.debugMode) {
        console.log('[PushPlatform] Installation registered', {
          installationId: registeredInstallation.installationId
        });
      }
    } catch (error) {
      // Backend registration is critical - fail initialization if it fails
      if (PushPlatform.config.debugMode) {
        console.error('[PushPlatform] Installation registration failed', error);
      }
      throw error;
    }

    PushPlatform.removeMessageListener?.();
    PushPlatform.setupServiceWorkerListener();
    PushPlatform.initialized = true;

    if (PushPlatform.config.debugMode) {
      console.log('[PushPlatform] SDK initialized', {
        environment: PushPlatform.config.environment,
        installationId,
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
  static async login(userId: string, identityProof?: string): Promise<void> {
    PushPlatform.ensureInitialized();

    if (!userId || typeof userId !== 'string') {
      throw new SDKError(
        ErrorCode.VALIDATION_ERROR,
        'User ID must be a non-empty string'
      );
    }

    if (!PushPlatform.apiClient || !PushPlatform.currentInstallationId) {
      throw new SDKError(
        ErrorCode.NOT_INITIALIZED,
        'API client not initialized'
      );
    }

    try {
      await PushPlatform.apiClient.loginUser(
        PushPlatform.currentInstallationId,
        userId,
        identityProof
      );

      if (PushPlatform.config?.debugMode) {
        console.log('[PushPlatform] User logged in', { userId });
      }
    } catch (error) {
      if (PushPlatform.config?.debugMode) {
        console.error('[PushPlatform] Login failed', error);
      }
      throw error;
    }
  }

  /** Backend ID for requesting an installation-bound identity proof from your site server. */
  static async getBackendInstallationId(): Promise<string> {
    PushPlatform.ensureInitialized();
    if (!PushPlatform.currentInstallationId) throw new SDKError(ErrorCode.NOT_INITIALIZED, 'Installation is not registered');
    return PushPlatform.currentInstallationId;
  }

  static async renewInstallationCredential(): Promise<void> {
    PushPlatform.ensureInitialized();
    if (!PushPlatform.apiClient || !PushPlatform.currentInstallationId) {
      throw new SDKError(ErrorCode.NOT_INITIALIZED, 'API client not initialized');
    }
    await PushPlatform.apiClient.renewInstallationCredential(PushPlatform.currentInstallationId);
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

    if (!PushPlatform.apiClient || !PushPlatform.currentInstallationId) {
      throw new SDKError(
        ErrorCode.NOT_INITIALIZED,
        'API client not initialized'
      );
    }

    try {
      await PushPlatform.apiClient.logoutUser(
        PushPlatform.currentInstallationId
      );

      if (PushPlatform.config?.debugMode) {
        console.log('[PushPlatform] User logged out');
      }
    } catch (error) {
      if (PushPlatform.config?.debugMode) {
        console.error('[PushPlatform] Logout failed', error);
      }
      throw error;
    }
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

    if (!PushPlatform.subscriptionManager || !PushPlatform.apiClient || !PushPlatform.currentInstallationId) {
      throw new SDKError(
        ErrorCode.NOT_INITIALIZED,
        'Subscription manager not initialized'
      );
    }

    // Check permission
    const permission = Notification.permission;
    if (permission !== 'granted') {
      throw new SDKError(
        ErrorCode.PERMISSION_DENIED,
        'Notification permission not granted. Call requestPermission() first.'
      );
    }

    try {
      // Subscribe via browser Push API
      const pushSubscription = await PushPlatform.subscriptionManager.subscribe();

      // Register subscription with backend
      PushPlatform.currentSubscriptionId = await PushPlatform.apiClient.registerSubscription(
        PushPlatform.currentInstallationId,
        pushSubscription
      );
      localStorage.setItem(PushPlatform.subscriptionIdStorageKey, PushPlatform.currentSubscriptionId);

      // Serialize and return
      const subscription = PushPlatform.subscriptionManager.serializeSubscription(pushSubscription);

      if (PushPlatform.config?.debugMode) {
        console.log('[PushPlatform] Subscribed', { endpoint: subscription.endpoint });
      }

      return subscription;
    } catch (error) {
      if (PushPlatform.config?.debugMode) {
        console.error('[PushPlatform] Subscribe failed', error);
      }
      throw error;
    }
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

    if (!PushPlatform.subscriptionManager || !PushPlatform.apiClient || !PushPlatform.currentInstallationId) {
      throw new SDKError(
        ErrorCode.NOT_INITIALIZED,
        'Subscription manager not initialized'
      );
    }

    try {
      const browserSubscription = await PushPlatform.subscriptionManager.getSubscription();
      if (browserSubscription && !PushPlatform.currentSubscriptionId) {
        PushPlatform.currentSubscriptionId = await PushPlatform.apiClient.registerSubscription(
          PushPlatform.currentInstallationId,
          browserSubscription
        );
        localStorage.setItem(PushPlatform.subscriptionIdStorageKey, PushPlatform.currentSubscriptionId);
      }
      if (PushPlatform.currentSubscriptionId) {
        await PushPlatform.apiClient.deleteSubscription(
          PushPlatform.currentInstallationId!,
          PushPlatform.currentSubscriptionId
        );
      }
      // Keep the ID until local removal succeeds, including across reloads.
      // DELETE is idempotent; retrying it must not create a new server subscription.
      await PushPlatform.subscriptionManager.unsubscribe();
      PushPlatform.currentSubscriptionId = null;
      localStorage.removeItem(PushPlatform.subscriptionIdStorageKey);

      if (PushPlatform.config?.debugMode) {
        console.log('[PushPlatform] Unsubscribed');
      }
    } catch (error) {
      if (PushPlatform.config?.debugMode) {
        console.error('[PushPlatform] Unsubscribe failed', error);
      }
      throw error;
    }
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

    if (!PushPlatform.subscriptionManager) {
      throw new SDKError(
        ErrorCode.NOT_INITIALIZED,
        'Subscription manager not initialized'
      );
    }

    try {
      const pushSubscription = await PushPlatform.subscriptionManager.getSubscription();

      if (!pushSubscription) {
        return null;
      }

      return PushPlatform.subscriptionManager.serializeSubscription(pushSubscription);
    } catch (error) {
      if (PushPlatform.config?.debugMode) {
        console.error('[PushPlatform] Get subscription failed', error);
      }
      return null;
    }
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
    callback: (notification: PushNotification) => void
  ): UnsubscribeFn {
    PushPlatform.ensureInitialized();
    return PushPlatform.eventEmitter.on('notificationReceived', callback);
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
    callback: (notification: PushNotification) => void
  ): UnsubscribeFn {
    PushPlatform.ensureInitialized();
    return PushPlatform.eventEmitter.on('notificationClicked', callback);
  }

  // Private helpers

  /**
   * Setup service worker message listener
   */
  private static setupServiceWorkerListener(): void {
    if (!PushPlatform.serviceWorkerManager) {
      return;
    }

    PushPlatform.removeMessageListener = PushPlatform.serviceWorkerManager.onMessage((event) => {
      const { type, notification } = event.data || {};
      if (!notification || typeof notification !== 'object') return;

      if (type === 'NOTIFICATION_RECEIVED') {
        PushPlatform.eventEmitter.emit('notificationReceived', notification);
      } else if (type === 'NOTIFICATION_CLICKED') {
        PushPlatform.eventEmitter.emit('notificationClicked', notification);
      }
    });
  }

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

    if (config.browserAuth && !/^wbpub_[A-Za-z0-9_-]{6,80}$/.test(config.apiKey)) {
      throw new SDKError(ErrorCode.INVALID_CONFIG, 'browserAuth requires a public wbpub_ browser key');
    }

    // Validate URL format
    try {
      const url = new URL(config.apiBaseURL);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('Expected an HTTP(S) base URL without credentials, query or fragment');
      }
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
