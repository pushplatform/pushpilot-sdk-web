/** PushPilot notification handlers. Can be imported by an existing classic worker. */
/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("push", (event) => {
  let payload: Record<string, any> = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "" };
  }
  const data = payload.data || payload.custom_data || {};
  const notification: Record<string, any> = {
    ...payload,
    id: payload.id || data.id || crypto.randomUUID(),
    title: payload.title || "PushPilot",
    data,
  };
  const options = {
    body: notification.body || "",
    icon: notification.icon,
    badge: notification.badge,
    image: notification.image,
    tag: notification.tag,
    actions: notification.actions,
    requireInteraction: notification.requireInteraction || false,
    data: { ...data, __pushpilot: notification },
  };
  event.waitUntil(
    (async () => {
      await sw.registration.showNotification(notification.title, options);
      const clients = await sw.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      clients.forEach((client) =>
        client.postMessage({ type: "NOTIFICATION_RECEIVED", notification }),
      );
    })(),
  );
});

sw.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const notification = data.__pushpilot || {
    id: data.id || crypto.randomUUID(),
    title: event.notification.title,
    body: event.notification.body,
    data,
  };
  // Restrict navigation to the site's HTTP(S) URLs. Relative URLs resolve at the scope.
  let target = new URL(sw.registration.scope);
  try {
    const candidate = new URL(notification.data?.url || "", target);
    if (
      candidate.origin === sw.location.origin &&
      ["https:", "http:"].includes(candidate.protocol)
    ) {
      target = candidate;
    }
  } catch {
    // Invalid URLs fall back to the worker scope.
  }
  event.waitUntil(
    (async () => {
      const clients = await sw.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      clients.forEach((client) =>
        client.postMessage({ type: "NOTIFICATION_CLICKED", notification }),
      );
      const existing = clients.find((client) => client.url === target.href);
      if (existing) await existing.focus();
      else await sw.clients.openWindow(target.href);
    })(),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(sw.clients.claim());
});
