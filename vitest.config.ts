import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
    include: ['backend/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts', 'frontend/src/**/*.test.ts'],
  },
});
