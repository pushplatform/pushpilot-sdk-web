import { test, expect, type Page } from "@playwright/test";

// All network requests stay on localhost. Browser subscription and API are fixtures;
// the service worker, packed SDK, site, DOM and notification display are real Chromium.
async function fixtures(
  page: Page,
  permission: "granted" | "denied" | "default" = "granted",
  mockPermission = true,
) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3000") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const request = route.request();
    if (request.method() === "DELETE") return route.fulfill({ status: 204 });
    const body = request.postDataJSON();
    if (url.pathname.endsWith("/tokens")) {
      expect(body).toMatchObject({
        provider: "web_push",
        keys: { p256dh: "public-fixture", auth: "auth-fixture" },
      });
      return route.fulfill({
        status: 201,
        json: { subscription_id: "subscription-fixture" },
      });
    }
    expect(body).toMatchObject({
      application_id: "application-fixture",
      platform: "web",
      environment: "development",
    });
    return route.fulfill({
      status: 201,
      json: { id: "installation-fixture", created_at: "2026-10-11T00:00:00Z" },
    });
  });
  await page.addInitScript(
    ({ nextPermission, mockPermission }) => {
      if (mockPermission) {
        let permission = "default";
        Object.defineProperty(Notification, "permission", {
          configurable: true,
          get: () => permission,
        });
        Object.defineProperty(Notification, "requestPermission", {
          configurable: true,
          value: async () => {
            (window as any).__permissionGesture =
              navigator.userActivation.isActive;
            (window as any).__permissionCalls =
              ((window as any).__permissionCalls || 0) + 1;
            permission = nextPermission;
            return permission;
          },
        });
      }
      const makeSubscription = () => ({
        endpoint: "https://push.invalid/local-fixture-only",
        toJSON: () => ({
          endpoint: "https://push.invalid/local-fixture-only",
          keys: { p256dh: "public-fixture", auth: "auth-fixture" },
        }),
        unsubscribe: async () => {
          sessionStorage.removeItem("browser-subscription-fixture");
          return true;
        },
      });
      PushManager.prototype.getSubscription = async () =>
        sessionStorage.getItem("browser-subscription-fixture")
          ? (makeSubscription() as any)
          : null;
      PushManager.prototype.subscribe = async (options) => {
        if (!options?.applicationServerKey)
          throw new Error("Missing VAPID key");
        sessionStorage.setItem("browser-subscription-fixture", "yes");
        return makeSubscription() as any;
      };
    },
    { nextPermission: permission, mockPermission },
  );
}
async function initialize(page: Page) {
  await page.locator("[name=apiBaseURL]").fill("http://127.0.0.1:3000/api");
  await page.locator("[name=applicationId]").fill("application-fixture");
  await page.locator("[name=apiKey]").fill("local-fixture-key");
  const key = Buffer.from([4, ...new Uint8Array(64)]).toString("base64url");
  await page.locator("[name=vapidPublicKey]").fill(key);
  await page.locator("#btn-init").click();
}
for (const entry of ["index.html", "npm.html"]) {
  test(`${entry}: click permission → subscribe → reload → unsubscribe`, async ({
    page,
  }) => {
    await fixtures(page);
    await page.goto(`/${entry}`);
    await expect(page.locator("#btn-permission")).toBeDisabled();
    await initialize(page);
    await expect(page.locator("#init-status")).toHaveText("SDK подключён");
    expect(
      await page.evaluate(() => (window as any).__permissionCalls || 0),
    ).toBe(0);
    await expect(page.locator("#btn-subscribe")).toBeDisabled();
    await page.locator("#btn-permission").click();
    await expect(page.locator("#permission-status")).toHaveText(
      "Разрешение получено",
    );
    expect(await page.evaluate(() => (window as any).__permissionGesture)).toBe(
      true,
    );
    await page.locator("#btn-subscribe").click();
    await expect(page.locator("#subscription-status")).toHaveText(
      "Подписка зарегистрирована в PushPilot",
    );
    await page.reload();
    await initialize(page);
    await expect(page.locator("#subscription-status")).toContainText(
      "Подписка браузера есть",
    );
    await page.locator("#btn-unsubscribe").click();
    await expect(page.locator("#subscription-status")).toHaveText(
      "Подписки нет",
    );
    await expect(page.locator("#error")).toBeEmpty();
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("browser-subscription-fixture"),
      ),
    ).toBeNull();
  });
}
test("permission denial and dismissal disable subscription", async ({
  page,
}) => {
  await fixtures(page, "denied");
  await page.goto("/index.html");
  await initialize(page);
  await expect(page.locator("#init-status")).toHaveText("SDK подключён");
  await page.locator("#btn-permission").click();
  await expect(page.locator("#permission-status")).toContainText(
    "Уведомления запрещены",
  );
  await expect(page.locator("#btn-permission")).toBeDisabled();
  await expect(page.locator("#btn-subscribe")).toBeDisabled();
});
test("dismissed permission can be requested again", async ({ page }) => {
  await fixtures(page, "default");
  await page.goto("/index.html");
  await initialize(page);
  await expect(page.locator("#init-status")).toHaveText("SDK подключён");
  await page.locator("#btn-permission").click();
  await expect(page.locator("#btn-permission")).toBeEnabled();
  await expect(page.locator("#btn-subscribe")).toBeDisabled();
});
test("unsupported browser shows explanation without API requests", async ({
  page,
}) => {
  await fixtures(page);
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "PushManager");
  });
  await page.goto("/index.html");
  await expect(page.locator("#init-status")).toContainText(
    "Браузер не поддерживает",
  );
  await expect(page.locator("#btn-init")).toBeDisabled();
});
test("API initialization failure is visible and retry works", async ({
  page,
}) => {
  await fixtures(page);
  await page.route("**/api/v1/installations", (route) =>
    route.fulfill({ status: 401, body: "Unauthorized" }),
  );
  await page.goto("/index.html");
  await initialize(page);
  await expect(page.locator("#error")).toContainText("api_error (HTTP 401)");
  await expect(page.locator("#btn-permission")).toBeDisabled();
  await page.unroute("**/api/v1/installations");
  await page.locator("#btn-init").click();
  await expect(page.locator("#init-status")).toHaveText("SDK подключён");
});
test("worker 404 surfaces a registration error", async ({ page }) => {
  await fixtures(page);
  await page.addInitScript(() => {
    const register = navigator.serviceWorker.register.bind(
      navigator.serviceWorker,
    );
    navigator.serviceWorker.register = (_, options) =>
      register("/missing-worker.js", options);
  });
  await page.goto("/index.html");
  await initialize(page);
  await expect(page.locator("#error")).toContainText(
    "service_worker_registration_failed",
  );
  await expect(page.locator("#btn-init")).toBeEnabled();
});
test("API subscribe and unsubscribe failures retain a retry path", async ({
  page,
}) => {
  await fixtures(page);
  await page.route("**/tokens", (route) =>
    route.fulfill({ status: 503, json: { error: { message: "offline" } } }),
  );
  await page.goto("/index.html");
  await initialize(page);
  await expect(page.locator("#init-status")).toHaveText("SDK подключён");
  await page.locator("#btn-permission").click();
  await page.locator("#btn-subscribe").click();
  await expect(page.locator("#error")).toContainText("HTTP 503");
  await expect(page.locator("#subscription-status")).toContainText(
    "регистрация в API не завершена",
  );
  await expect(page.locator("#btn-subscribe")).toBeEnabled();
  await page.unroute("**/tokens");
  await page.locator("#btn-subscribe").click();
  await expect(page.locator("#subscription-status")).toHaveText(
    "Подписка зарегистрирована в PushPilot",
  );
  await page.route("**/subscriptions/*", (route) =>
    route.fulfill({ status: 500 }),
  );
  await page.locator("#btn-unsubscribe").click();
  await expect(page.locator("#error")).toContainText("HTTP 500");
  await expect(page.locator("#subscription-status")).toHaveText(
    "Подписка зарегистрирована в PushPilot",
  );
  await page.unroute("**/subscriptions/*");
  await page.locator("#btn-unsubscribe").click();
  await expect(page.locator("#subscription-status")).toHaveText("Подписки нет");
});
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
