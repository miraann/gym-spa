import { defineConfig } from 'vitest/config';

// Integration tests on a real offline server made for the test (`pnpm server:tools` first): the
// license flow end to end. Run by `pnpm test:offline` and `pnpm --filter @gym/server test:int`.
export default defineConfig({
  test: {
    name: 'server-int',
    environment: 'node',
    include: ['test-int/**/*.int.test.ts'],
    testTimeout: 60_000,
    // Making a server (initdb and every migration) takes a minute or two.
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
