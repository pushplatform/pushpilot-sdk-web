// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function worker(options?: { reply?: boolean | ((message: any) => void) }) {
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
  return { self, client, dispatch, emit: (type: string, event: any) => {
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
