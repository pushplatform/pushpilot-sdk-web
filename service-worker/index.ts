/**
 * @pushplatform/web-sdk
 *
 * Service Worker for Push Notifications
 */

/// <reference lib="webworker" />

// Cast self to ServiceWorkerGlobalScope
const sw = self as unknown as ServiceWorkerGlobalScope;

/**
 * Push event handler
 */
sw.addEventListener('push', (event) => {
  const pushEvent = event as PushEvent;
  console.log('[Service Worker] Push event received', pushEvent);

  if (!pushEvent.data) {
    console.warn('[Service Worker] Push event has no data');
    return;
  }

  try {
    const data = pushEvent.data.json();

    const notificationOptions: any = {
      body: data.body || '',
      icon: data.icon || '/icon.png',
      badge: data.badge || '/badge.png',
      data: data.data || {},
      tag: data.tag,
      requireInteraction: data.requireInteraction || false,
    };

    if (data.image) {
      notificationOptions.image = data.image;
    }

    if (data.actions) {
      notificationOptions.actions = data.actions;
    }

    const title = data.title || 'Notification';

    pushEvent.waitUntil(
      sw.registration.showNotification(title, notificationOptions)
    );
  } catch (error) {
    console.error('[Service Worker] Failed to show notification', error);
  }
});

/**
 * Notification click handler
 */
sw.addEventListener('notificationclick', (event) => {
  const notificationEvent = event as NotificationEvent;
  console.log('[Service Worker] Notification clicked', notificationEvent);

  notificationEvent.notification.close();

  const notificationData = notificationEvent.notification.data || {};
  const urlToOpen = notificationData.url || '/';

  const notification = {
    id: notificationData.id || crypto.randomUUID(),
    title: notificationEvent.notification.title,
    body: notificationEvent.notification.body,
    icon: notificationEvent.notification.icon,
    badge: notificationEvent.notification.badge,
    data: notificationData,
    tag: notificationEvent.notification.tag,
  };

  notificationEvent.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Notify all clients about notification click
      clientList.forEach((client) => {
        client.postMessage({
          type: 'NOTIFICATION_CLICKED',
          notification,
        });
      });

      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }

      // Open a new window
      if (sw.clients.openWindow) {
        return sw.clients.openWindow(urlToOpen);
      }
      return undefined;
    })
  );
});

/**
 * Service Worker activation
 */
sw.addEventListener('activate', (event) => {
  const activateEvent = event as ExtendableEvent;
  console.log('[Service Worker] Activated');
  activateEvent.waitUntil(sw.clients.claim());
});

console.log('[Service Worker] Loaded');
