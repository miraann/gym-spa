import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'local-lock',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
