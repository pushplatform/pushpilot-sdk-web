// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function worker(options?: {
  reply?: boolean | ((message: any) => void);
  fetch?: (...args: any[]) => Promise<{ status: number }>;
}) {
  const fetch = vi.fn(options?.fetch || (async () => ({ status: 200 })));
  const handlers = new Map<string, Array<(event: any) => void>>();
  const client = {
    url: "https://site.example/shop/",
    postMessage: vi.fn((message: any) => {
      if (message?.type !== "NOTIFICATION_WILL_DISPLAY") return;
      if (options?.reply === false) return;
      const decision = {
        data: {
          type: "DISPLAY_DECISION",
          id: message.notification.id,
          prevented: false,
        },
      };
      if (typeof options?.reply === "function") options.reply(message);
      else handlers.get("message")?.forEach((handler) => handler(decision));
    }),
    focus: vi.fn().mockResolvedValue(undefined),
  };
  const self = {
    location: { origin: "https://site.example" },
    registration: {
      scope: client.url,
      showNotification: vi.fn().mockResolvedValue(undefined),
    },
    clients: {
      matchAll: vi.fn().mockResolvedValue([client]),
      openWindow: vi.fn().mockResolvedValue(undefined),
      claim: vi.fn(),
    },
    addEventListener: (type: string, handler: (event: any) => void) => {
      const current = handlers.get(type) || [];
      current.push(handler);
      handlers.set(type, current);
    },
    removeEventListener: (type: string, handler: (event: any) => void) => {
      handlers.set(type, (handlers.get(type) || []).filter((item) => item !== handler));
    },
  };
  const source = readFileSync(
    new URL("../service-worker/index.ts", import.meta.url),
    "utf8",
  );
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let timerId = 0;
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText,
    {
      self,
      URL,
      fetch,
      crypto: { randomUUID: () => "generated-id" },
      setTimeout: (fn: () => void, ms: number) => {
        const id = ++timerId;
        timers.set(id, setTimeout(fn, ms));
        return id;
      },
      clearTimeout: (id: number) => {
        const timer = timers.get(id);
        if (timer) clearTimeout(timer);
      },
    },
  );
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    for (const handler of handlers.get(type) || []) {
      handler({
        ...event,
        waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      });
    }
    await Promise.all(waits);
  };
  return { self, client, dispatch, fetch, emit: (type: string, event: any) => {
    for (const handler of handlers.get(type) || []) handler(event);
  } };
}

describe("Service worker payload and navigation", () => {
  it("keeps notification identity from receipt to click and focuses an existing relative URL", async () => {
    const { self, client, dispatch } = worker();
    await dispatch("push", {
      data: {
        json: () => ({
          id: "message-123",
          title: "Hello",
          data: { url: "./" },
        }),
      },
    });
    const [title, options] = self.registration.showNotification.mock.calls[0];
    expect(client.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTIFICATION_RECEIVED",
        notification: expect.objectContaining({ id: "message-123" }),
      }),
    );
    await dispatch("notificationclick", {
      notification: { title, ...options, close: vi.fn() },
    });
    expect(client.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "NOTIFICATION_CLICKED",
        notification: expect.objectContaining({ id: "message-123" }),
      }),
    );
    expect(client.focus).toHaveBeenCalledOnce();
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });
  it.each(["https://foreign.example/", "javascript:alert(1)", "http://["])(
    "falls back to scope for an unsafe URL: %s",
    async (url) => {
      const { self, dispatch } = worker();
      self.clients.matchAll.mockResolvedValue([]);
      await dispatch("notificationclick", {
        notification: { title: "Hello", data: { url }, close: vi.fn() },
      });
      expect(self.clients.openWindow).toHaveBeenCalledWith(
        "https://site.example/shop/",
      );
    },
  );
  it("shows a visible fallback notification for a non-JSON payload", async () => {
    const { self, dispatch } = worker();
    await dispatch("push", {
      data: {
        json: () => {
          throw new Error("Invalid JSON");
        },
        text: () => "Plain text",
      },
    });
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      "PushPilot",
      expect.objectContaining({ body: "Plain text" }),
    );
  });

  it("shows the banner immediately when no page is open", async () => {
    const { self, dispatch } = worker({ reply: false });
    self.clients.matchAll.mockResolvedValue([]);
    await dispatch("push", {
      data: { json: () => ({ id: "alone", title: "Hello" }) },
    });
    expect(self.registration.showNotification).toHaveBeenCalledOnce();
  });

  it("waits for the page decision when no fallback is configured", async () => {
    const { self, client, dispatch, emit } = worker({ reply: false });
    const pending = dispatch("push", {
      data: { json: () => ({ id: "held", title: "Hold" }) },
    });
    await vi.waitFor(() => expect(client.postMessage).toHaveBeenCalled());
    expect(self.registration.showNotification).not.toHaveBeenCalled();
    emit("message", { data: { type: "DISPLAY_DECISION", id: "held", prevented: true } });
    await pending;
    expect(self.registration.showNotification).not.toHaveBeenCalled();
  });

  it("shows the banner when the page does not answer before the fallback", async () => {
    const { self, dispatch } = worker({ reply: false });
    await dispatch("message", { data: { type: "CONFIGURE_DISPLAY", foregroundBannerFallback: 0.05 } });
    await dispatch("push", {
      data: { json: () => ({ id: "late", title: "Late" }) },
    });
    expect(self.registration.showNotification).toHaveBeenCalledOnce();
  });

  it("hides the banner when the page prevents it before the fallback", async () => {
    const { self, dispatch } = worker({
      reply: (message) => {
        dispatch("message", {
          data: { type: "DISPLAY_DECISION", id: message.notification.id, prevented: true },
        });
      },
    });
    await dispatch("message", { data: { type: "CONFIGURE_DISPLAY", foregroundBannerFallback: 1 } });
    await dispatch("push", {
      data: { json: () => ({ id: "stopped", title: "Stop" }) },
    });
    expect(self.registration.showNotification).not.toHaveBeenCalled();
  });
});

describe("Notification opens", () => {
  const configure = (subscriptionId: string | null) => ({
    data: {
      type: "CONFIGURE_OPENS",
      url: "https://api.example/",
      applicationId: "app-1",
      subscriptionId,
    },
  });

  async function pushAndClick(
    harness: ReturnType<typeof worker>,
    payload: Record<string, unknown>,
  ) {
    await harness.dispatch("push", { data: { json: () => payload } });
    const [title, options] = harness.self.registration.showNotification.mock.calls.at(-1);
    await harness.dispatch("notificationclick", {
      notification: { title, ...options, close: vi.fn() },
    });
  }

  it("exposes notificationId outside data and reports the click with PUT", async () => {
    const harness = worker();
    await harness.dispatch("message", configure("sub-1"));
    await pushAndClick(harness, {
      title: "Hello",
      notification_id: "n-1",
      data: { chat: "1" },
    });
    expect(harness.client.postMessage).toHaveBeenLastCalledWith({
      type: "NOTIFICATION_CLICKED",
      notification: expect.objectContaining({ notificationId: "n-1", data: { chat: "1" } }),
    });
    const clicked = harness.client.postMessage.mock.calls.at(-1)[0].notification;
    expect(clicked).not.toHaveProperty("notification_id");
    expect(harness.fetch).toHaveBeenCalledTimes(2);
    const bodies = harness.fetch.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies).toEqual([
      { app_id: "app-1", subscription_id: "sub-1", received: true },
      { app_id: "app-1", subscription_id: "sub-1", opened: true },
    ]);
    expect(harness.fetch.mock.calls[0][0]).toBe("https://api.example/notifications/n-1");
    expect(harness.fetch.mock.calls[0][1].method).toBe("PUT");
    expect(harness.fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });

  it("reads notification_id from background custom data", async () => {
    const harness = worker();
    await harness.dispatch("message", configure("sub-1"));
    await pushAndClick(harness, { data: { notification_id: "n-2", kind: "sync" } });
    const clicked = harness.client.postMessage.mock.calls.at(-1)[0].notification;
    expect(clicked.notificationId).toBe("n-2");
    expect(clicked.data).toEqual({ kind: "sync" });
    expect(harness.fetch.mock.calls[0][0]).toBe("https://api.example/notifications/n-2");
  });

  it("keeps a click until the page configures the worker with a subscription", async () => {
    const harness = worker();
    await pushAndClick(harness, { title: "Early", notification_id: "n-3" });
    expect(harness.fetch).not.toHaveBeenCalled();
    await harness.dispatch("message", configure(null));
    expect(harness.fetch).not.toHaveBeenCalled();
    await harness.dispatch("message", configure("sub-1"));
    expect(harness.fetch).toHaveBeenCalledOnce();
    await harness.dispatch("message", configure("sub-1"));
    expect(harness.fetch).toHaveBeenCalledOnce();
  });

  it("retries after a network failure but drops a rejected open", async () => {
    let attempt = 0;
    const harness = worker({
      fetch: async (_url: string, init: { body: string }) => {
        if (JSON.parse(init.body).received) return { status: 200 };
        attempt += 1;
        if (attempt === 1) throw new TypeError("offline");
        return { status: 404 };
      },
    });
    await harness.dispatch("message", configure("sub-1"));
    await pushAndClick(harness, { title: "Retry", notification_id: "n-4" });
    expect(harness.fetch).toHaveBeenCalledTimes(2);
    await harness.dispatch("message", configure("sub-1"));
    expect(harness.fetch).toHaveBeenCalledTimes(3);
    await harness.dispatch("message", configure("sub-1"));
    expect(harness.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not report a click without notification_id", async () => {
    const harness = worker();
    await harness.dispatch("message", configure("sub-1"));
    await pushAndClick(harness, { title: "Plain" });
    expect(harness.fetch).not.toHaveBeenCalled();
  });
});
