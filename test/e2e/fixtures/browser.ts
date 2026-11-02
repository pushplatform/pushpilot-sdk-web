import { expect, type Page } from "@playwright/test";

// All network requests stay on localhost. Browser subscription and API are fixtures;
// the service worker, packed SDK, site, DOM and notification display are real Chromium.
export async function fixtures(
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
export async function initialize(page: Page) {
  await page.locator("[name=url]").fill("http://127.0.0.1:3000/api");
  await page.locator("[name=applicationId]").fill("application-fixture");
  await page.locator("[name=apiKey]").fill("local-fixture-key");
  const key = Buffer.from([4, ...new Uint8Array(64)]).toString("base64url");
  await page.locator("[name=vapidPublicKey]").fill(key);
  await page.locator("#btn-init").click();
}
