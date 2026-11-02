import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

// Playback scenarios need H.264/AAC, which Playwright's bundled Chromium lacks: prefer a system
// Chromium/Chrome. Override with PLAYWRIGHT_BROWSER_PATH.
const systemBrowser = [
  process.env['PLAYWRIGHT_BROWSER_PATH'],
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
]
  .filter((p): p is string => !!p)
  .find((p) => existsSync(p));

/**
 * Browser e2e against the real stack: backend on the test database (.env.test) and the Angular dev server.
 * Needs the dev containers (docker compose -f infra/docker-compose.yml up -d); builds the backend and
 * starts the API, the worker and the Angular dev server on their own ports (3300/3301/4300), so a running
 * ./dev.sh (3000/4200, real mail provider in backend/.env) is never reused or touched.
 */
const API_PORT = 3300;
const WORKER_HEALTH_PORT = 3301;
const WEB_PORT = 4300;
const WEB_URL = `http://localhost:${WEB_PORT}`;
// Environment variables win over --env-file, so the test servers get the e2e URL and ports.
const TEST_ENV = `PUBLIC_URL=${WEB_URL}`;
export default defineConfig({
  testDir: './e2e',
  testIgnore: [
    // Memory and layout-shift measurements: run alone with VS_PERF_DIR.
    ...(process.env['VS_PERF_DIR'] ? [] : ['**/perf-*.spec.ts']),
  ],
  globalSetup: './e2e/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(systemBrowser ? { launchOptions: { executablePath: systemBrowser } } : {}),
      },
    },
  ],
  webServer: [
    {
      // storage-init: test buckets, public-read policy and CORS for this origin (the S3 server does
      // not configure anything by itself).
      command: `cd ../backend && npm run build:tools && ${TEST_ENV} node --env-file=.env.test dist-tools/scripts/storage-init.js && ${TEST_ENV} PORT=${API_PORT} node --env-file=.env.test dist-tools/main.js`,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `cd ../backend && ${TEST_ENV} WORKER_HEALTH_PORT=${WORKER_HEALTH_PORT} node --env-file=.env.test dist-tools/worker.js`,
      url: `http://localhost:${WORKER_HEALTH_PORT}/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Paddle's API for the cloud edition (.env.test: PADDLE_API_URL): prices, portal, cancels.
      command: 'cd ../backend && npx tsx test/utils/paddle-stub.ts',
      url: 'http://127.0.0.1:3399/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `npx ng serve --port ${WEB_PORT} --proxy-config proxy.e2e.json`,
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
