import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests for the pure logic in src/lib (scoring, alerts, billing status, badges, feed parsers).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { 'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)) },
  },
});
