import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'db',
    environment: 'node',
    // The sync tests need local Supabase and PowerSync: `pnpm test:sync`.
    exclude: ['test/**', 'node_modules/**'],
  },
});
