import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { PushPlatform, ErrorCode } from "../src";
import { APIClient } from "../src/APIClient";
import { ServiceWorkerManager } from "../src/ServiceWorkerManager";
import { SubscriptionManager } from "../src/SubscriptionManager";
const config = {
  apiKey: "demo",
  applicationId: "app",
  apiBaseURL: "https://api.example",
};
let registration: any;
beforeEach(() => {
  localStorage.clear();
  (PushPlatform as any).initialized = false;
  (PushPlatform as any).initializing = false;
  registration = {
    active: { state: "activated" },
    scope: window.location.origin + "/",
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  vi.stubGlobal("Notification", {
    permission: "granted",
    requestPermission: vi.fn().mockResolvedValue("denied"),
  });
  vi.stubGlobal("PushManager", function () {});
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "backend-id" }))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Release error handling", () => {
  it("fails before API registration when the worker cannot register", async () => {
    vi.mocked(navigator.serviceWorker.register).mockRejectedValue(
      new Error("404 worker"),
    );
    await expect(PushPlatform.initialize(config)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_WORKER_REGISTRATION_FAILED,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves API errors and permits a successful initialization retry", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );
    await expect(PushPlatform.initialize(config)).rejects.toMatchObject({
      code: ErrorCode.API_ERROR,
      context: { status: 401 },
    });
    await expect(PushPlatform.initialize(config)).resolves.toBeUndefined();
    expect(navigator.serviceWorker.addEventListener).toHaveBeenCalledOnce();
  });
  it("checks Notification API support without starting initialization", async () => {
    vi.stubGlobal("Notification", undefined);
    // Presence-based feature detection requires removal, not an undefined placeholder.
    Reflect.deleteProperty(window, "Notification");
    expect(PushPlatform.isSupported()).toBe(false);
    await expect(PushPlatform.initialize(config)).rejects.toMatchObject({
      code: ErrorCode.PUSH_API_NOT_SUPPORTED,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves denied permission and never subscribes implicitly", async () => {
    await PushPlatform.initialize(config);
    expect(await PushPlatform.requestPermission()).toBe("denied");
    Notification.permission = "denied";
    await expect(PushPlatform.subscribe()).rejects.toMatchObject({
      code: ErrorCode.PERMISSION_DENIED,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("rejects a page outside the worker scope without waiting for ready", async () => {
    registration.scope = window.location.origin + "/elsewhere/";
    await expect(
      new ServiceWorkerManager().register("/elsewhere/sw.js"),
    ).rejects.toMatchObject({
      code: ErrorCode.SERVICE_WORKER_REGISTRATION_FAILED,
    });
  });
  it("times out a worker that never activates", async () => {
    vi.useFakeTimers();
    registration.active = null;
    registration.installing = {
      state: "installing",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const result = expect(
      new ServiceWorkerManager().register("/sw.js"),
    ).rejects.toMatchObject({
      code: ErrorCode.SERVICE_WORKER_REGISTRATION_FAILED,
    });
    await vi.advanceTimersByTimeAsync(15001);
    await result;
    expect(registration.installing.removeEventListener).toHaveBeenCalledOnce();
  });
  it("does not accept malformed successful token responses", async () => {
    await expect(
      new APIClient(config).registerSubscription("id", {
        endpoint: "https://push.example",
        toJSON: () => ({}),
      } as any),
    ).rejects.toMatchObject({ code: ErrorCode.API_ERROR });
  });
  it("surfaces a browser refusal to remove the subscription", async () => {
    const subscription = { unsubscribe: vi.fn().mockResolvedValue(false) };
    const manager = new SubscriptionManager({
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => subscription },
      }),
    } as any);
    await expect(manager.unsubscribe()).rejects.toMatchObject({
      code: ErrorCode.UNSUBSCRIBE_FAILED,
    });
  });
});
