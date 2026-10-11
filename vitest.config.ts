import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/app', 'apps/seller', 'apps/desktop', 'tools/*'],
  },
});
