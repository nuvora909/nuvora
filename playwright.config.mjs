// Browser tests for the portal, run in the installed Microsoft Edge against the local server.
// Tests share one server, so they run one at a time and reset the database before each test.
import { defineConfig } from '@playwright/test';

// Set NUVORA_E2E_PORT to run a second copy of the browser tests next to another one (default 5199).
const PORT = Number(process.env.NUVORA_E2E_PORT || 5199);
// tests/sabotage.mjs sets NUVORA_PORTAL_DIR to serve a deliberately broken copy of portal/ (never the checkout).
const PORTAL_DIR = process.env.NUVORA_PORTAL_DIR ? ` --portal-dir "${process.env.NUVORA_PORTAL_DIR}"` : '';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.mjs',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,                       // a flaky test is a failing test
  reporter: [['list']],
  outputDir: `test-results/e2e-${PORT}`,     // per port: two runs side by side never delete each other's traces
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'msedge',
    headless: true,
    viewport: { width: 1366, height: 860 },
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    // The website's scroll-linked motion moves an element in the frame after Playwright scrolls it into view, so a
    // click could press on the control and release on its container. Behaviour tests therefore run with reduced
    // motion; site-cinema.spec.mjs switches motion back on and tests it on its own.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // --no-clock: the school clock never changes data while a test runs (tests set the moment they need).
    command: `node server/dev-server.mjs --port ${PORT} --test-api --no-clock${PORTAL_DIR}`,
    url: `http://127.0.0.1:${PORT}/portal/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
  },
});
