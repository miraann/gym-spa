import { defineProject } from 'vitest/config';

// gym-server's own logic (keys, the gateway's routing, the migration order). Running the real
// server parts against the whole test suite is `pnpm test:offline`.
export default defineProject({
  test: {
    name: 'server',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
