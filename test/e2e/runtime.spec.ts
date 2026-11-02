import { test, expect } from "@playwright/test";
import { fixtures, initialize } from "./fixtures/browser";

for (const entry of ["index.html", "npm.html"]) {
  test(`${entry}: browser credentials are exchanged and retained across reload`, async ({
    page,
  }) => {
    await fixtures(page);
    const credential = "wbinst_" + "A".repeat(43);
    const authHeaders: string[] = [];
    await page.route("**/api/v1/web/wbpub_site_fixture/**", async (route) => {
      const request = route.request();
      authHeaders.push(request.headers().authorization);
      if (request.method() === "DELETE") return route.fulfill({ status: 204 });
      if (new URL(request.url()).pathname.endsWith("/tokens")) {
        expect(request.headers().authorization).toBe(`Bearer ${credential}`);
        return route.fulfill({
          status: 201,
          json: { subscription_id: "subscription-fixture" },
        });
      }
      return route.fulfill({
        status: 201,
        json: {
          id: "installation-fixture",
          installation_credential: credential,
          credential_expires_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date().toISOString(),
        },
      });
    });
    const connect = async () => {
      await page.locator("[name=url]").fill("http://127.0.0.1:3000/api");
      await page.locator("[name=applicationId]").fill("application-fixture");
      await page.locator("[name=apiKey]").fill("wbpub_site_fixture");
      await page.locator("[name=browserAuth]").check();
      await page
        .locator("[name=vapidPublicKey]")
        .fill(Buffer.from([4, ...new Uint8Array(64)]).toString("base64url"));
      await page.locator("#btn-init").click();
      await expect(page.locator("#init-status")).toHaveText("SDK подключён");
    };
    await page.goto(`/${entry}`);
    await connect();
    expect(authHeaders[0]).toBe("Bearer wbpub_site_fixture");
    await page.locator("#btn-permission").click();
    await page.locator("#btn-subscribe").click();
    await expect(page.locator("#subscription-status")).toHaveText(
      "Подписка зарегистрирована в PushPilot",
    );
    await page.reload();
    await connect();
    await page.locator("#btn-unsubscribe").click();
    await expect(page.locator("#subscription-status")).toHaveText(
      "Подписки нет",
    );
    expect(
      authHeaders.slice(1).every((header) => header === `Bearer ${credential}`),
    ).toBe(true);
  });
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
test("packed worker import preserves host lexical bindings and installs push handlers", async ({
  page,
  context,
}) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/existing-worker.js");
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await navigator.serviceWorker.ready).active?.state,
      ),
    )
    .toBe("activated");
  const worker = context.serviceWorkers()[0];
  const result = await worker.evaluate(async () => {
    const scope = self as unknown as ServiceWorkerGlobalScope & {
      hostValues: () => { t: string; sw: string };
    };
    let shownTitle: string | undefined;
    // Only notification display is replaced; import, registration and dispatch are real.
    scope.registration.showNotification = async (title) => {
      shownTitle = title;
    };
    const waits: Promise<unknown>[] = [];
    const event = new Event("push");
    Object.defineProperties(event, {
      data: { value: { json: () => ({ title: "Imported handler" }) } },
      waitUntil: { value: (promise: Promise<unknown>) => waits.push(promise) },
    });
    scope.dispatchEvent(event);
    await Promise.all(waits);
    return { hostValues: scope.hostValues(), shownTitle };
  });
  expect(result).toEqual({
    hostValues: { t: "host-t", sw: "host-sw" },
    shownTitle: "Imported handler",
  });
});
