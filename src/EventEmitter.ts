/**
 * @pushplatform/web-sdk
 *
 * Event Emitter for notification events
 */

import type { PushNotification } from './types';

type EventType = 'notificationReceived' | 'notificationClicked';
type EventCallback = (notification: PushNotification) => void;

/**
 * Event Emitter for SDK events
 */
export class EventEmitter {
  private listeners: Map<EventType, Set<EventCallback>> = new Map();

  /**
   * Add event listener
   */
  on(event: EventType, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Remove event listener
   */
  off(event: EventType, callback: EventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Emit event to all listeners
   */
  emit(event: EventType, notification: PushNotification): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(notification);
        } catch (error) {
          console.error(`[EventEmitter] Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: EventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
