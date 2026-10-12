// Test-only interoperability harness. Only local httptest API is permitted.
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { PushPilot } from "../dist/index.js";

const base = new URL(process.env.PUSHPILOT_WEB_API_TEST_URL);
assert(["127.0.0.1", "localhost"].includes(base.hostname));
const origin = "https://site.example";
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.window = {
  isSecureContext: true,
  location: { href: origin + "/" },
  PushManager: function () {},
  Notification: {},
};
globalThis.Notification = { permission: "granted" };
let subscribed = true;
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const subscription = {
  endpoint: "https://push.invalid/sdk-interoperability-fixture",
  toJSON: () => ({
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: Buffer.alloc(16).toString("base64url"),
    },
  }),
  unsubscribe: async () => {
    subscribed = false;
    return true;
  },
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    userAgent: "SDK interoperability fixture",
    serviceWorker: {
      register: async () => ({
        scope: origin + "/",
        active: { state: "activated" },
        pushManager: {
          getSubscription: async () => (subscribed ? subscription : null),
        },
      }),
      addEventListener() {},
      removeEventListener() {},
    },
  },
});
const networkFetch = globalThis.fetch;
globalThis.fetch = (url, options = {}) => {
  assert.equal(
    new URL(url).origin,
    base.origin,
    "No requests outside local API",
  );
  return networkFetch(url, {
    ...options,
    headers: { ...options.headers, Origin: origin },
  });
};
await PushPilot.initialize({
  apiBaseURL: base.origin,
  applicationId: process.env.PUSHPILOT_WEB_TEST_APPLICATION_ID,
  apiKey: "wbpub_site_fixture",
  browserAuth: true,
  environment: "production",
});
await PushPilot.subscribe();
await assert.rejects(PushPilot.login("fixture-user"), /server identity proof/);
// The test site's trusted fixture issues a proof; the script never receives a project key.
const installation = await PushPilot.getBackendInstallationId();
const { identity_proof } = await (
  await fetch(base.origin + "/fixture/identity-proof", {
    method: "POST",
    body: JSON.stringify({ installation_id: installation }),
  })
).json();
await PushPilot.login("fixture-user", identity_proof);
await PushPilot.logout();
await PushPilot.renewInstallationCredential();
await PushPilot.unsubscribe();
assert.equal(await PushPilot.getSubscription(), null);
assert.equal(storage.get("pushplatform_subscription_id"), undefined);
console.log(
  "SDK real HTTP registration, token, verified login/logout, renewal and unsubscribe passed; no project secret or external push.",
);
