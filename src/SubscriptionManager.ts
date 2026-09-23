/**
 * @pushplatform/web-sdk
 *
 * Subscription Manager for Web Push lifecycle
 */

import type { Subscription } from './types';
import { SDKError, ErrorCode } from './types';
import type { ServiceWorkerManager } from './ServiceWorkerManager';

const SUBSCRIPTION_STORAGE_KEY = 'pushplatform_subscription';

/**
 * Subscription Manager
 */
export class SubscriptionManager {
  private serviceWorkerManager: ServiceWorkerManager;
  private currentSubscription: PushSubscription | null = null;

  private vapidPublicKey: string | undefined;

  constructor(serviceWorkerManager: ServiceWorkerManager, vapidPublicKey?: string) {
    this.serviceWorkerManager = serviceWorkerManager;
    this.vapidPublicKey = vapidPublicKey;
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(): Promise<PushSubscription> {
    // Check permission
    if (Notification.permission !== 'granted') {
      throw new SDKError(
        ErrorCode.PERMISSION_DENIED,
        'Notification permission not granted. Call requestPermission() first.'
      );
    }

    // Get service worker registration
    const registration = await this.serviceWorkerManager.getRegistration();
    if (!registration) {
      throw new SDKError(
        ErrorCode.SERVICE_WORKER_REGISTRATION_FAILED,
        'Service worker not registered'
      );
    }

    // Check for existing subscription
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      this.currentSubscription = existingSub;
      this.saveSubscription(existingSub);
      return existingSub;
    }

    if (!this.vapidPublicKey) {
      throw new SDKError(ErrorCode.SUBSCRIPTION_FAILED, 'VAPID public key is required');
    }

    try {
      const applicationServerKey = decodeVapidPublicKey(this.vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });

      this.currentSubscription = subscription;
      this.saveSubscription(subscription);
      return subscription;
    } catch (error) {
      throw new SDKError(
        ErrorCode.SUBSCRIPTION_FAILED,
        `Failed to subscribe: ${String(error)}`
      );
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<void> {
    const registration = await this.serviceWorkerManager.getRegistration();
    if (!registration) {
      return;
    }

    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        this.currentSubscription = null;
        this.clearSubscription();
      }
    } catch (error) {
      throw new SDKError(
        ErrorCode.UNSUBSCRIBE_FAILED,
        `Failed to unsubscribe: ${String(error)}`
      );
    }
  }

  /**
   * Get current subscription
   */
  async getSubscription(): Promise<PushSubscription | null> {
    if (this.currentSubscription) {
      return this.currentSubscription;
    }

    const registration = await this.serviceWorkerManager.getRegistration();
    if (!registration) {
      return null;
    }

    try {
      this.currentSubscription = await registration.pushManager.getSubscription();
      return this.currentSubscription;
    } catch {
      return null;
    }
  }

  /**
   * Serialize PushSubscription to Subscription type
   */
  serializeSubscription(subscription: PushSubscription): Subscription {
    const json = subscription.toJSON();
    const keys = json.keys as { p256dh: string; auth: string };

    return {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    };
  }

  /**
   * Save subscription to localStorage
   */
  private saveSubscription(subscription: PushSubscription): void {
    try {
      const serialized = this.serializeSubscription(subscription);
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      // Ignore storage errors
      console.warn('Failed to save subscription to storage:', error);
    }
  }

  /**
   * Clear subscription from localStorage
   */
  private clearSubscription(): void {
    try {
      localStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
}

function decodeVapidPublicKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new SDKError(ErrorCode.SUBSCRIPTION_FAILED, 'Invalid VAPID public key encoding');
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  if (binary.length !== 65 || binary.charCodeAt(0) !== 4) {
    throw new SDKError(ErrorCode.SUBSCRIPTION_FAILED, 'Invalid VAPID public key');
  }
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
