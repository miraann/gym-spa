import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'seller-admin',
    environment: 'node',
    // The integration tests need the local Supabase: `pnpm test:int`.
    include: ['src/**/*.test.ts'],
  },
});
