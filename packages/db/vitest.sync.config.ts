import { defineConfig } from 'vitest/config';

// End-to-end sync tests against local Supabase and PowerSync (`pnpm test:sync`).
export default defineConfig({
  test: {
    name: 'sync',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    // The tests share one set of test staff and branches.
    fileParallelism: false,
  },
});
