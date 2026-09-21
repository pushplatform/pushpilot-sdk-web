const sw = self;
sw.addEventListener("push", (event) => {
  const pushEvent = event;
  console.log("[Service Worker] Push event received", pushEvent);
  if (!pushEvent.data) {
    console.warn("[Service Worker] Push event has no data");
    return;
  }
  try {
    const data = pushEvent.data.json();
    const notificationOptions = {
      body: data.body || "",
      icon: data.icon || "/icon.png",
      badge: data.badge || "/badge.png",
      data: data.data || {},
      tag: data.tag,
      requireInteraction: data.requireInteraction || false
    };
    if (data.image) {
      notificationOptions.image = data.image;
    }
    if (data.actions) {
      notificationOptions.actions = data.actions;
    }
    const title = data.title || "Notification";
    pushEvent.waitUntil(
      sw.registration.showNotification(title, notificationOptions)
    );
  } catch (error) {
    console.error("[Service Worker] Failed to show notification", error);
  }
});
sw.addEventListener("notificationclick", (event) => {
  const notificationEvent = event;
  console.log("[Service Worker] Notification clicked", notificationEvent);
  notificationEvent.notification.close();
  const notificationData = notificationEvent.notification.data || {};
  const urlToOpen = notificationData.url || "/";
  const notification = {
    id: notificationData.id || crypto.randomUUID(),
    title: notificationEvent.notification.title,
    body: notificationEvent.notification.body,
    icon: notificationEvent.notification.icon,
    badge: notificationEvent.notification.badge,
    data: notificationData,
    tag: notificationEvent.notification.tag
  };
  notificationEvent.waitUntil(
    sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      clientList.forEach((client) => {
        client.postMessage({
          type: "NOTIFICATION_CLICKED",
          notification
        });
      });
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      if (sw.clients.openWindow) {
        return sw.clients.openWindow(urlToOpen);
      }
      return void 0;
    })
  );
});
sw.addEventListener("activate", (event) => {
  const activateEvent = event;
  console.log("[Service Worker] Activated");
  activateEvent.waitUntil(sw.clients.claim());
});
console.log("[Service Worker] Loaded");
//# sourceMappingURL=service-worker.js.map
