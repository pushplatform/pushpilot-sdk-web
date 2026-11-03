/** PushPilot notification handlers. Can be imported by an existing classic worker. */
/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;
let foregroundBannerFallback = 0;

type OpenConfig = { url: string; applicationId: string; subscriptionId: string | null };
const maxPendingOpens = 50;
let openConfig: OpenConfig | null = null;
let pendingOpens: string[] = [];
let openState: Promise<void> | null = null;

function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open("pushpilot", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readState<T>(key: string): Promise<T | undefined> {
  const db = await database();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = db.transaction("state").objectStore("state").get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function writeState(key: string, value: unknown): Promise<void> {
  const db = await database();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction("state", "readwrite");
      transaction.objectStore("state").put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// A restarted worker loses memory; the page may not be open to configure it again.
function loadOpenState(): Promise<void> {
  openState ??= (async () => {
    const [config, pending] = await Promise.all([
      readState<OpenConfig>("openConfig"),
      readState<string[]>("pendingOpens"),
    ]);
    openConfig ??= config || null;
    pendingOpens = [...new Set([...(pending || []), ...pendingOpens])].slice(-maxPendingOpens);
  })();
  return openState;
}

function queueOpen(id: string): Promise<void> {
  pendingOpens = [...new Set([...pendingOpens, id])].slice(-maxPendingOpens);
  return writeState("pendingOpens", pendingOpens);
}

/** Returns false when the open should be retried later. */
async function sendOpen(config: OpenConfig, id: string): Promise<boolean> {
  try {
    const response = await fetch(`${config.url}/notifications/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: config.applicationId,
        subscription_id: config.subscriptionId,
        opened: true,
      }),
    });
    return response.status < 500 && response.status !== 429;
  } catch {
    return false;
  }
}

async function flushOpens(): Promise<void> {
  await loadOpenState();
  const config = openConfig;
  if (!config?.subscriptionId || pendingOpens.length === 0) return;
  const ids = pendingOpens;
  pendingOpens = [];
  const failed: string[] = [];
  for (const id of ids) {
    if (!(await sendOpen(config, id))) failed.push(id);
  }
  pendingOpens = [...new Set([...failed, ...pendingOpens])].slice(-maxPendingOpens);
  await writeState("pendingOpens", pendingOpens);
}

async function reportOpen(id: string): Promise<void> {
  await loadOpenState();
  await queueOpen(id);
  await flushOpens();
}

async function reportReceived(id: string): Promise<void> {
  await loadOpenState();
  const config = openConfig;
  if (!config?.subscriptionId) return;
  try {
    await fetch(`${config.url}/notifications/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: config.applicationId,
        subscription_id: config.subscriptionId,
        received: true,
      }),
    });
  } catch {
    // The banner is already shown. A missed receipt stays null until another push.
  }
}

function openConfigFrom(message: Record<string, unknown>): OpenConfig | null {
  const { url, applicationId, subscriptionId } = message;
  if (typeof url !== "string" || typeof applicationId !== "string") return null;
  return {
    url: url.replace(/\/+$/, ""),
    applicationId,
    subscriptionId: typeof subscriptionId === "string" && subscriptionId ? subscriptionId : null,
  };
}

sw.addEventListener("message", (event) => {
  if (event.data?.type === "CONFIGURE_OPENS") {
    const config = openConfigFrom(event.data);
    if (!config) return;
    openConfig = config;
    event.waitUntil?.(writeState("openConfig", config).then(flushOpens));
    return;
  }
  if (event.data?.type !== "CONFIGURE_DISPLAY") return;
  const seconds = Number(event.data.foregroundBannerFallback);
  foregroundBannerFallback = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
});

function notificationIdFrom(...sources: Array<Record<string, any> | undefined>): string | undefined {
  for (const source of sources) {
    const value = source?.notification_id;
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function withoutNotificationId(data: Record<string, any>): Record<string, any> {
  const { notification_id: _notificationId, ...rest } = data;
  return rest;
}

sw.addEventListener("push", (event) => {
  let payload: Record<string, any> = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "" };
  }
  const rawData = payload.data || payload.custom_data || {};
  const notificationId = notificationIdFrom(payload, rawData);
  const data = withoutNotificationId(rawData);
  const notification: Record<string, any> = {
    ...withoutNotificationId(payload),
    id: payload.id || data.id || crypto.randomUUID(),
    title: payload.title || "PushPilot",
    data,
  };
  if (notificationId) notification.notificationId = notificationId;
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
      const clients = await sw.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      let prevented = false;
      if (clients.length > 0) {
        prevented = await new Promise<boolean>((resolve) => {
          let settled = false;
          const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            sw.removeEventListener("message", onMessage);
            resolve(value);
          };
          const onMessage = (message: ExtendableMessageEvent) => {
            const data = message.data;
            if (data?.type !== "DISPLAY_DECISION" || data.id !== notification.id) return;
            finish(data.prevented === true);
          };
          sw.addEventListener("message", onMessage);
          if (foregroundBannerFallback > 0) {
            setTimeout(() => finish(false), foregroundBannerFallback * 1000);
          }
          clients.forEach((client) =>
            client.postMessage({ type: "NOTIFICATION_WILL_DISPLAY", notification }),
          );
        });
      }
      if (!prevented) await sw.registration.showNotification(notification.title, options);
      if (notificationId) await reportReceived(notificationId);
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
  const notificationId =
    typeof notification.notificationId === "string" ? notification.notificationId : undefined;
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
    Promise.all([
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
      notificationId ? reportOpen(notificationId) : undefined,
    ]),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(sw.clients.claim());
});
