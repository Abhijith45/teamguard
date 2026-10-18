import { defineConfig, devices } from "@playwright/test";

/**
 * TeamGuard Playwright Release Verification Configuration (TASK-603)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_WEBSERVER ? undefined : [
    {
      command: "npm run dev",
      cwd: "../backend",
      port: 5000,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "npm run dev",
      cwd: ".",
      port: 5173,
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});
