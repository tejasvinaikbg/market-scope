/**
 * End-to-end tests over the real screens: the API and the web app are started for the run against the fixture
 * providers and a database of the tests' own (the route tests' Postgres container, database "<test name>_e2e", prepared
 * by e2e/prepare-db.mts as the API starts), on ports beside the development ones. `npm run test:e2e` from the root.
 */
import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const testUrl = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://user:password@localhost:5433/db_name_test');
const e2eDb = new URL(testUrl.href);
e2eDb.pathname = `${testUrl.pathname}_e2e`;
export const E2E_DATABASE_URL = e2eDb.href;
const API_PORT = 4210;
const WEB_PORT = 3210;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ }, // Chromium's phone emulation: one browser to install
  ],
  webServer: [
    {
      // The database is prepared in the same command: Playwright starts servers before any global setup could run.
      command: 'node e2e/prepare-db.mts && node apps/api/src/server.ts',
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        PORT: String(API_PORT),
        JOBS: 'on',
        GEOCODER: 'fixture',
        PLACES: 'fixture',
        LOG_LEVEL: 'warn',
        TILE_CACHE_HOURS: '0',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      cwd: 'apps/web',
      url: `http://localhost:${WEB_PORT}/`,
      env: { API_URL: `http://localhost:${API_PORT}`, NEXT_DIST_DIR: '.next-e2e', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: '' }, // the OpenStreetMap ground: the run never calls Google
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
