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
  async register(path: string, scope?: string): Promise<ServiceWorkerRegistration> {
    if (!('serviceWorker' in navigator)) {
      throw new SDKError(ErrorCode.SERVICE_WORKER_NOT_SUPPORTED, 'Service Workers are not supported');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let removeStateListener: (() => void) | undefined;
    try {
      const activation = (async () => {
        const registration = await navigator.serviceWorker.register(path, scope ? { scope } : undefined);
        if (cancelled) throw new Error('Service worker activation timed out');
        // ready can wait forever when the current page is outside the scope.
        if (!window.location.href.startsWith(registration.scope)) {
          throw new Error('The current page must be inside the service worker scope');
        }
        if (registration.active?.state !== 'activated') {
          const worker = registration.active || registration.installing || registration.waiting;
          if (!worker) throw new Error('No service worker available for activation');
          await new Promise<void>((resolve, reject) => {
            const check = () => {
              if (worker.state === 'activated') resolve();
              else if (worker.state === 'redundant') reject(new Error('Service worker installation failed'));
            };
            worker.addEventListener('statechange', check);
            removeStateListener = () => worker.removeEventListener('statechange', check);
            check();
          });
        }
        return registration;
      })();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Service worker activation timed out after 15 seconds')), 15000);
      });
      this.registration = await Promise.race([activation, timeout]);
      return this.registration;
    } catch (error) {
      throw new SDKError(ErrorCode.SERVICE_WORKER_REGISTRATION_FAILED,
        `Failed to register service worker: ${String(error)}`);
    } finally {
      cancelled = true;
      clearTimeout(timer);
      removeStateListener?.();
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

    return null;
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
