import { defineConfig } from 'vitest/config';

// Integration tests against the local Supabase (`pnpm db:start`): real Auth, real database.
export default defineConfig({
  test: {
    name: 'staff-admin-int',
    environment: 'node',
    include: ['test/**/*.int.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One gym per file, made in beforeAll; the files share nothing, but Auth's rate limits do.
    fileParallelism: false,
  },
});
