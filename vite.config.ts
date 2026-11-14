import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Dev server on the sandbox-exposed port so the platform preview can reach it.
  server: { host: true, port: 3000, strictPort: true },
  preview: { host: true, port: 4173 },
  test: {
    environment: 'node', // game model + level tests are pure TypeScript, no DOM
    include: ['src/**/*.test.ts'],
  },
});
