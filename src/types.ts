/**
 * @pushplatform/web-sdk
 *
 * TypeScript type definitions for Push Platform Web SDK
 */

/**
 * JSON primitive types for type-safe data payloads
 */
export type JSONPrimitive = string | number | boolean | null;

/**
 * JSON value (recursive type)
 */
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;

/**
 * JSON object type
 */
export interface JSONObject {
  [key: string]: JSONValue;
}

/**
 * JSON array type
 */
export interface JSONArray extends Array<JSONValue> {}

/**
 * Push Platform configuration
 */
export interface PushPlatformConfig {
  /**
   * API key for backend authentication
   */
  apiKey: string;

  /**
   * Backend application UUID
   */
  applicationId: string;

  /**
   * Base URL for backend API
   */
  apiBaseURL: string;

  /**
   * Environment: development or production (optional, defaults to production)
   */
  environment?: 'development' | 'production';

  /**
   * Path to service worker file (optional, defaults to '/service-worker.js')
   */
  serviceWorkerPath?: string;

  /**
   * Enable debug logging (optional, default: false)
   */
  debugMode?: boolean;
}

/**
 * Installation representation
 */
export interface Installation {
  /**
   * Unique installation ID (UUID v4)
   */
  installationId: string;

  /**
   * Associated user ID (null if not logged in)
   */
  userId?: string | null;

  /**
   * Installation creation timestamp
   */
  createdAt: Date;
}

/**
 * Web Push subscription
 */
export interface Subscription {
  /**
   * Push service endpoint URL
   */
  endpoint: string;

  /**
   * Subscription keys
   */
  keys: {
    /**
     * P-256 ECDH public key (base64url)
     */
    p256dh: string;

    /**
     * Authentication secret (base64url)
     */
    auth: string;
  };
}

/**
 * Notification permission status
 */
export type PermissionStatus = 'granted' | 'denied' | 'default';

/**
 * Notification action
 */
export interface NotificationAction {
  /**
   * Action identifier
   */
  action: string;

  /**
   * Action title
   */
  title: string;

  /**
   * Action icon URL (optional)
   */
  icon?: string;
}

/**
 * Push notification data
 */
export interface PushNotification {
  /**
   * Unique notification ID
   */
  id: string;

  /**
   * Notification title (optional)
   */
  title?: string;

  /**
   * Notification body text (optional)
   */
  body?: string;

  /**
   * Notification icon URL (optional)
   */
  icon?: string;

  /**
   * Notification badge URL (optional)
   */
  badge?: string;

  /**
   * Notification image URL (optional)
   */
  image?: string;

  /**
   * Custom data payload (type-safe JSON object)
   */
  data: JSONObject;

  /**
   * Notification tag for grouping (optional)
   */
  tag?: string;

  /**
   * Require user interaction to dismiss (optional)
   */
  requireInteraction?: boolean;

  /**
   * Notification actions (optional)
   */
  actions?: NotificationAction[];

  /**
   * Event ID for deduplication (optional)
   */
  eventId?: string;
}

/**
 * SDK Error codes
 */
export enum ErrorCode {
  // Initialization errors
  ALREADY_INITIALIZED = 'already_initialized',
  NOT_INITIALIZED = 'not_initialized',
  INVALID_CONFIG = 'invalid_config',

  // Permission errors
  PERMISSION_DENIED = 'permission_denied',
  PERMISSION_REQUEST_FAILED = 'permission_request_failed',

  // Subscription errors
  SUBSCRIPTION_FAILED = 'subscription_failed',
  UNSUBSCRIBE_FAILED = 'unsubscribe_failed',
  NO_SUBSCRIPTION = 'no_subscription',

  // Service Worker errors
  SERVICE_WORKER_NOT_SUPPORTED = 'service_worker_not_supported',
  SERVICE_WORKER_REGISTRATION_FAILED = 'service_worker_registration_failed',

  // Push API errors
  PUSH_API_NOT_SUPPORTED = 'push_api_not_supported',

  // Network errors
  NETWORK_ERROR = 'network_error',
  API_ERROR = 'api_error',

  // Validation errors
  VALIDATION_ERROR = 'validation_error',

  // Unknown errors
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * SDK Error class
 */
export class SDKError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: JSONObject;

  constructor(code: ErrorCode, message: string, context?: JSONObject) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SDKError);
    }
  }
}

/**
 * Unsubscribe function type for event listeners
 */
export type UnsubscribeFn = () => void;
