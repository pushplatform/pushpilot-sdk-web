import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIClient } from "../src/APIClient";

const config = {
  apiBaseURL: "https://api.example",
  apiKey: "wbpub_site_fixture",
  applicationId: "app-fixture",
  environment: "production" as const,
  browserAuth: true,
};
const credential = "wbinst_" + "A".repeat(43);
const replacement = "wbinst_" + "B".repeat(43);
const params = {
  installationId: "device-fixture",
  platform: "web",
  environment: "production",
};
const registration = (token = credential) => ({
  id: "installation-fixture",
  installation_credential: token,
  credential_expires_at: new Date(Date.now() + 86400000).toISOString(),
  created_at: new Date().toISOString(),
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe("Browser installation authentication", () => {
  it("exchanges the public key and persists only a scoped installation credential for reload", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify(registration())),
      );
    const client = new APIClient(config);
    await client.registerInstallation(params);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://api.example/v1/web/wbpub_site_fixture/installations",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer wbpub_site_fixture",
        }),
      }),
    );
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem(localStorage.key(0)!)).toBe(credential);
    await new APIClient(config).registerInstallation(params);
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${credential}`,
        }),
      }),
    );
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await client.deleteSubscription(
      "installation-fixture",
      "subscription-fixture",
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "https://api.example/v1/web/wbpub_site_fixture/installations/installation-fixture/subscriptions/subscription-fixture",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${credential}`,
        }),
      }),
    );
  });
  it.each([
    { applicationId: "other-app" },
    { environment: "development" as const },
    { apiBaseURL: "https://other-api.example" },
    { apiKey: "wbpub_other_fixture" },
  ])(
    "does not share installation credentials across scope %j",
    async (scope) => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(
          async () => new Response(JSON.stringify(registration())),
        );
      await new APIClient(config).registerInstallation(params);
      await new APIClient({ ...config, ...scope }).registerInstallation(params);
      expect(fetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${scope.apiKey || config.apiKey}`,
          }),
        }),
      );
    },
  );
  it("requires a server login proof and rejects the legacy PATCH path", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(registration())));
    const client = new APIClient(config);
    await client.registerInstallation(params);
    fetch.mockClear();
    await expect(
      client.loginUser("installation-fixture", "user"),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      client.updateInstallation("installation-fixture", { userId: "user" }),
    ).rejects.toMatchObject({ code: "invalid_config" });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await client.loginUser(
      "installation-fixture",
      "user",
      "server-proof-fixture",
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example/v1/web/wbpub_site_fixture/installations/installation-fixture/login",
      expect.objectContaining({
        body: JSON.stringify({
          external_user_id: "user",
          identity_proof: "server-proof-fixture",
        }),
        headers: expect.objectContaining({
          Authorization: `Bearer ${credential}`,
        }),
      }),
    );
  });
  it("renews the credential without modifying subscription IDs or local device identity", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(registration())));
    const client = new APIClient(config);
    await client.registerInstallation(params);
    localStorage.setItem(
      "pushplatform_subscription_id",
      "subscription-fixture",
    );
    localStorage.setItem("pushplatform_installation_id", "device-fixture");
    fetch.mockResolvedValue(
      new Response(JSON.stringify(registration(replacement))),
    );
    await client.renewInstallationCredential("installation-fixture");
    expect(localStorage.getItem("pushplatform_subscription_id")).toBe(
      "subscription-fixture",
    );
    expect(localStorage.getItem("pushplatform_installation_id")).toBe(
      "device-fixture",
    );
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await new APIClient(config).logoutUser("installation-fixture");
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${replacement}`,
        }),
      }),
    );
  });
  it("never falls back to the public key after an expired or revoked credential is rejected", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(registration())));
    await new APIClient(config).registerInstallation(params);
    fetch.mockClear().mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(
      new APIClient(config).registerInstallation(params),
    ).rejects.toMatchObject({ code: "api_error", context: { status: 401 } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${credential}`,
        }),
      }),
    );
    expect(localStorage.getItem(localStorage.key(0)!)).toBe(credential);
  });
  it("keeps the previous credential after a renewal failure and reports a network error", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(registration())));
    const client = new APIClient(config);
    await client.registerInstallation(params);
    fetch.mockRejectedValue(new Error("network failure"));
    await expect(
      client.renewInstallationCredential("installation-fixture"),
    ).rejects.toMatchObject({ code: "network_error" });
    expect(localStorage.getItem(localStorage.key(0)!)).toBe(credential);
  });
  it("accepts a recovered installation credential only as a candidate verified by the API", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify(registration())),
      );
    await new APIClient(config).registerInstallation(params);
    fetch.mockResolvedValue(
      new Response(JSON.stringify(registration(replacement))),
    );
    await new APIClient({
      ...config,
      installationCredential: replacement,
    }).registerInstallation(params);
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${replacement}`,
        }),
      }),
    );
    expect(localStorage.getItem(localStorage.key(0)!)).toBe(replacement);
    expect(
      () =>
        new APIClient({ ...config, installationCredential: "project-secret" }),
    ).toThrow();
  });
  it.each([
    {},
    { installation_credential: "project-secret" },
    { ...registration(), credential_expires_at: "invalid" },
    { ...registration(), credential_expires_at: new Date(0).toISOString() },
  ])("rejects malformed credential responses: %j", async (response) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "installation-fixture", ...response })),
    );
    await expect(
      new APIClient(config).registerInstallation(params),
    ).rejects.toMatchObject({ code: "api_error" });
    expect(localStorage.length).toBe(0);
  });
});
