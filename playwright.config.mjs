// Browser tests for the portal, run in the installed Microsoft Edge against the local server.
// Tests share one server, so they run one at a time and reset the database before each test.
import { defineConfig } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.mjs',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,                       // a flaky test is a failing test
  reporter: [['list']],
  outputDir: 'test-results/e2e',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'msedge',
    headless: true,
    viewport: { width: 1366, height: 860 },
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node server/dev-server.mjs --port ${PORT} --test-api`,
    url: `http://127.0.0.1:${PORT}/portal/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
  },
});
