import { defineProject } from 'vitest/config';

// The release scripts' own tests (scripts/*.test.ts); the database has its pgTAP tests (tests/).
export default defineProject({
  test: {
    name: 'supabase',
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
  },
});
