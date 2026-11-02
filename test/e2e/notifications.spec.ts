import { test, expect } from "@playwright/test";
import { fixtures, initialize } from "./fixtures/browser";

// macOS headless Chromium resolves showNotification without retaining an OS
// notification. Use a real window for this OS-dependent assertion, keeping all
// notification visibility and click assertions unchanged.
test.use({ headless: process.platform !== "darwin" });
test("real worker displays a local notification and handles synthetic push/click events", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"], {
    origin: "http://127.0.0.1:3000",
  });
  await fixtures(page, "granted", false);
  await page.goto("/index.html");
  await initialize(page);
  await expect(page.locator("#init-status")).toHaveText("SDK подключён");
  await page.locator("#btn-preview").click();
  await expect(page.locator("#error")).toBeEmpty();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (await navigator.serviceWorker.ready).getNotifications())
            .length,
      ),
    )
    .toBe(1);
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    const waits: Promise<unknown>[] = [];
    const event = new Event("push");
    Object.defineProperties(event, {
      data: {
        value: {
          json: () => ({
            title: "Локальный push",
            body: "Без внешней доставки",
            custom_data: { url: "/index.html", id: "fixture-notification" },
          }),
        },
      },
      waitUntil: { value: (promise: Promise<unknown>) => waits.push(promise) },
    });
    self.dispatchEvent(event);
    await Promise.all(waits);
  });
  await expect(page.locator("#events")).toContainText("Получено");
  await worker.evaluate(async () => {
    const scope = self as unknown as ServiceWorkerGlobalScope;
    const [notification] = (await scope.registration.getNotifications()).filter(
      (n) => n.title === "Локальный push",
    );
    // Native OS interaction is not automated. Stub only focus, which requires a native user gesture.
    const matchAll = scope.clients.matchAll.bind(scope.clients);
    scope.clients.matchAll = async (options) => {
      const clients = await matchAll(options);
      clients.forEach((client) => {
        if ("focus" in client)
          (client as WindowClient).focus = async () => client as WindowClient;
      });
      return clients;
    };
    const waits: Promise<unknown>[] = [];
    const event = new Event("notificationclick");
    Object.defineProperties(event, {
      notification: { value: notification },
      waitUntil: { value: (p: Promise<unknown>) => waits.push(p) },
    });
    scope.dispatchEvent(event);
    await Promise.all(waits);
  });
  await expect(page.locator("#events")).toContainText("Нажатие");
  await expect(page.locator("#events")).toContainText("fixture-notification");
});

test("worker keeps open configuration and queued clicks in IndexedDB", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"], {
    origin: "http://127.0.0.1:3000",
  });
  await fixtures(page, "granted", false);
  await page.goto("/index.html");
  await initialize(page);
  await expect(page.locator("#init-status")).toHaveText("SDK подключён");
  const worker = context.serviceWorkers()[0];
  const read = (key: string) =>
    worker.evaluate(
      (key) =>
        new Promise((resolve) => {
          const request = indexedDB.open("pushpilot", 1);
          request.onsuccess = () => {
            const get = request.result.transaction("state").objectStore("state").get(key);
            get.onsuccess = () => resolve(get.result ?? null);
          };
        }),
      key,
    );
  await expect
    .poll(() => read("openConfig"))
    .toMatchObject({ applicationId: "application-fixture", subscriptionId: null });

  const sent = await worker.evaluate(async () => {
    const scope = self as unknown as ServiceWorkerGlobalScope & { __opens: string[] };
    scope.__opens = [];
    scope.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      scope.__opens.push(`${init?.method} ${String(input)} ${init?.body}`);
      return new Response("{}", { status: 200 });
    };
    scope.clients.openWindow = async () => null;
    const dispatch = async (type: string, props: Record<string, unknown>) => {
      const waits: Promise<unknown>[] = [];
      const event = new Event(type);
      Object.defineProperties(event, {
        ...Object.fromEntries(Object.entries(props).map(([k, value]) => [k, { value }])),
        waitUntil: { value: (p: Promise<unknown>) => waits.push(p) },
      });
      scope.dispatchEvent(event);
      await Promise.all(waits);
    };
    await dispatch("notificationclick", {
      notification: {
        title: "Открытие",
        close: () => undefined,
        data: { __pushpilot: { id: "local", notificationId: "open-fixture", data: {} } },
      },
    });
    const queued = scope.__opens.length;
    await dispatch("message", {
      data: {
        type: "CONFIGURE_OPENS",
        url: "http://127.0.0.1:3000/api",
        applicationId: "application-fixture",
        subscriptionId: "subscription-fixture",
      },
    });
    return { queued, opens: scope.__opens };
  });
  expect(sent.queued).toBe(0);
  expect(sent.opens).toEqual([
    'PUT http://127.0.0.1:3000/api/notifications/open-fixture {"app_id":"application-fixture","subscription_id":"subscription-fixture","opened":true}',
  ]);
  await expect.poll(() => read("pendingOpens")).toEqual([]);
});
