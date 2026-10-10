import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8000",
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "python3 -m http.server 8000 --bind 127.0.0.1",
    port: 8000,
    reuseExistingServer: true,
    timeout: 15000,
  },
});
