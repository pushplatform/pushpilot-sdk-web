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

  constructor(serviceWorkerManager: ServiceWorkerManager) {
    this.serviceWorkerManager = serviceWorkerManager;
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

    // Create new subscription
    // Note: VAPID public key should come from backend, but we don't have that endpoint yet
    // For now, we'll try to subscribe without applicationServerKey (will fail in production)
    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // applicationServerKey: vapidPublicKey, // TODO: Get from backend
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
