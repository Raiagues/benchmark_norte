import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  use: {
    baseURL: process.env.NORTE_TEST_URL || "http://127.0.0.1:8000",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  workers: 1,
  reporter: "list",
});
