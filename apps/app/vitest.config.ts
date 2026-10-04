import { fileURLToPath, URL } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'app',
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
  },
});
