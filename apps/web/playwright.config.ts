import { defineConfig } from '@playwright/test';

/**
 * Browser E2E against an already-running stack (web on E2E_BASE_URL, API from scripts/safe-local.env).
 * Uses the installed Chrome (channel), so no browser download is needed. Read-only: no test creates data.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', channel: 'chrome', headless: true },
});
