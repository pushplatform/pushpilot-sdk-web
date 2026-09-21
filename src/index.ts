/**
 * @pushplatform/web-sdk
 *
 * Main entry point for Push Platform Web SDK
 */

// Export types
export type {
  JSONPrimitive,
  JSONValue,
  JSONObject,
  JSONArray,
  PushPlatformConfig,
  Installation,
  Subscription,
  PermissionStatus,
  PushNotification,
  NotificationAction,
  UnsubscribeFn,
} from './types';

export { SDKError, ErrorCode } from './types';

// Export main SDK class
export { PushPlatform } from './PushPlatform';

// Re-export as default for convenience
export { PushPlatform as default } from './PushPlatform';
