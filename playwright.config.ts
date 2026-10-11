import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: {
    command: "node scripts/serve-test-site.mjs",
    url: "http://127.0.0.1:3000/index.html",
    reuseExistingServer: false,
    timeout: 15000,
  },
});
