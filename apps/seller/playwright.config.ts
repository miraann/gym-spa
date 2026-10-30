import { defineConfig, devices } from '@playwright/test';

const PORT = 4176;
const isCI = Boolean(process.env.CI);

// The seller panel's end-to-end tests run against the web deployment's own output: the gym app's
// production build with the panel copied in under /seller/ (apps/app/scripts/build-web.mjs, mode
// e2e), served from one origin like on Vercel. `pnpm test:e2e` (scripts/e2e.mjs) builds it first.
export default defineConfig({
  testDir: './e2e',
  // One run at a time on the local Supabase, also when started directly (the VS Code extension).
  globalSetup: '../../packages/local-lock/src/playwright-setup.ts',
  // The tests share the local Auth's rate limits and the platform admins; one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite preview --port ${String(PORT)} --strictPort`,
    cwd: '../app',
    url: `http://localhost:${String(PORT)}/seller/`,
    reuseExistingServer: !isCI,
  },
});
