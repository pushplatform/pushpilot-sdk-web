/**
 * @pushplatform/web-sdk
 *
 * Service Worker Manager for registration and lifecycle
 */

import { SDKError, ErrorCode } from './types';

/**
 * Service Worker Manager
 */
export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;

  /**
   * Register service worker
   */
  async register(path: string): Promise<ServiceWorkerRegistration> {
    if (!('serviceWorker' in navigator)) {
      throw new SDKError(
        ErrorCode.SERVICE_WORKER_NOT_SUPPORTED,
        'Service Workers are not supported in this browser'
      );
    }

    try {
      this.registration = await navigator.serviceWorker.register(path);

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;

      return this.registration;
    } catch (error) {
      throw new SDKError(
        ErrorCode.SERVICE_WORKER_REGISTRATION_FAILED,
        `Failed to register service worker: ${String(error)}`
      );
    }
  }

  /**
   * Unregister service worker
   */
  async unregister(): Promise<void> {
    if (!this.registration) {
      return;
    }

    try {
      await this.registration.unregister();
      this.registration = null;
    } catch (error) {
      throw new SDKError(
        ErrorCode.UNKNOWN_ERROR,
        `Failed to unregister service worker: ${String(error)}`
      );
    }
  }

  /**
   * Get current registration
   */
  async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (this.registration) {
      return this.registration;
    }

    if (!('serviceWorker' in navigator)) {
      return null;
    }

    try {
      this.registration = await navigator.serviceWorker.ready;
      return this.registration;
    } catch {
      return null;
    }
  }

  /**
   * Post message to service worker
   */
  postMessage(message: any): void {
    if (!this.registration?.active) {
      throw new SDKError(
        ErrorCode.UNKNOWN_ERROR,
        'Service worker not active'
      );
    }

    this.registration.active.postMessage(message);
  }

  /**
   * Listen for messages from service worker
   */
  onMessage(callback: (event: MessageEvent) => void): () => void {
    if (!('serviceWorker' in navigator)) {
      throw new SDKError(
        ErrorCode.SERVICE_WORKER_NOT_SUPPORTED,
        'Service Workers are not supported'
      );
    }

    navigator.serviceWorker.addEventListener('message', callback);

    // Return unsubscribe function
    return () => {
      navigator.serviceWorker.removeEventListener('message', callback);
    };
  }
}
