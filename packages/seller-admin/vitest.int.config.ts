import { defineConfig } from 'vitest/config';

// Integration tests against the local Supabase (`pnpm db:start`): real Auth (with the access token
// hook and TOTP), real database.
export default defineConfig({
  test: {
    name: 'seller-admin-int',
    environment: 'node',
    include: ['test/**/*.int.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
