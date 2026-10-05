import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);

// Launches the real Electron shell with the production web build (`pnpm test:e2e` from the repo
// root builds it first).
export default defineConfig({
  testDir: './e2e',
  // Each test starts its own Electron app; one at a time keeps them from competing for focus.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
});
