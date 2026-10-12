// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function worker() {
  const handlers = new Map<string, (event: any) => void>();
  const client = {
    url: "https://site.example/shop/",
    postMessage: vi.fn(),
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
    addEventListener: (type: string, handler: (event: any) => void) =>
      handlers.set(type, handler),
  };
  const source = readFileSync(
    new URL("../service-worker/index.ts", import.meta.url),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText,
    {
      self,
      URL,
      crypto: { randomUUID: () => "generated-id" },
    },
  );
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    handlers.get(type)!({
      ...event,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    });
    await Promise.all(waits);
  };
  return { self, client, dispatch };
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
});
